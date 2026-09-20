// ПОЛОЖИТЬ СЮДА: туда же, где лежал ваш обработчик вебхука
// (например app/api/telegram/webhook/route.ts)
//
// ЧТО ИЗМЕНИЛОСЬ ПО СРАВНЕНИЮ СО СТАРОЙ ВЕРСИЕЙ:
//
// 1. Убран прямой @upstash/redis. Старый вебхук писал в Redis через
//    Redis.fromEnv() (переменные UPSTASH_*), а всё остальное приложение
//    читает через lib/kv.ts (переменные KV_REST_API_*). Если это разные
//    базы — оплата уходит в одну, а проверка идёт в другую, и покупка
//    просто не появляется. Теперь всё через lib/kv.
//
// 2. Вебхук стал источником истины по оплатам. Раньше он писал ключи
//    paid:*, которые приложение больше не читало, а доступ выдавал клиент
//    сам себе. Теперь именно здесь открываются категории скана.
//
// 3. Добавлены подписки: первое списание, автопродления, отмена, возврат.
//    Для рекуррентных платежей клиента в этот момент не существует —
//    без обработки здесь подписка молча умрёт через 30 дней.
//
// 4. Добавлена проверка секретного токена вебхука. Без неё кто угодно
//    может отправить на этот URL поддельный successful_payment.
//    Задайте его при установке вебхука:
//    setWebhook?url=...&secret_token=<WEBHOOK_SECRET>

import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr, kvDecr, kvSadd } from '@/lib/kv'
import { grantSubscription, markSubscriptionCancelled, revokeSubscription, type PaidFeature } from '@/lib/entitlements'
import { appLink } from '@/lib/links'

export const runtime = "nodejs"

const BOT_TOKEN = process.env.BOT_TOKEN!
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

type ScanRecord = {
  scanId: string
  userId: string
  unlocked: Partial<Record<PaidFeature, boolean>>
  [k: string]: unknown
}

async function tg(method: string, body: unknown){
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function parsePayload(raw: string){
  try{
    const p = JSON.parse(raw)
    // новый короткий формат
    if(p.t) return { feature: String(p.t), userId: p.u, scanId: p.s, eventId: p.e }
    // старый формат — оставлен, чтобы счета, выставленные до деплоя, не сломались
    if(p.type) return { feature: String(p.type), userId: p.userId, scanId: undefined, eventId: p.eventId }
  }catch{}
  return { feature: "deep", userId: undefined, scanId: undefined, eventId: undefined }
}

async function unlockScanFeature(scanId: string, userId: string | number, feature: PaidFeature | "bundle"){
  const scan = await kvGet<ScanRecord>(`scan:${scanId}`)
  if(!scan){
    // Бросаем, а не молчим: скан мог ещё не успеть записаться, и повторная доставка это исправит.
    throw new Error(`scan not found: ${scanId}`)
  }
  // Оплатить чужой скан невозможно — проверяем владельца.
  if(String(scan.userId) !== String(userId)){
    console.error("webhook: scan owner mismatch", scanId, userId)
    return
  }
  scan.unlocked = scan.unlocked || {}
  if(feature === "bundle"){
    scan.unlocked.deep = true
    scan.unlocked.hidden = true
    scan.unlocked.future = true
  } else {
    scan.unlocked[feature] = true
  }
  await kvSet(`scan:${scanId}`, scan)
}

export async function POST(req: NextRequest){
  // Проверка, что запрос действительно от Telegram. Раньше при отсутствии
  // WEBHOOK_SECRET проверка молча отключалась — теперь без секрета вебхук
  // не работает вообще, а не открыт всем.
  if(WEBHOOK_SECRET){
    const got = req.headers.get("x-telegram-bot-api-secret-token")
    if(got !== WEBHOOK_SECRET) return new Response("forbidden", { status: 403 })
  } else {
    console.error("webhook: WEBHOOK_SECRET is not set, rejecting request")
    return new Response("unauthorized", { status: 401 })
  }

  let update: any
  try{ update = await req.json() }catch{ return new Response("ok") }

  /* ── подтверждение перед списанием ── */
  if(update.pre_checkout_query){
    await tg("answerPreCheckoutQuery", {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    })
    return new Response("ok")
  }

  /* ── успешная оплата ── */
  const payment = update.message?.successful_payment
  if(payment){
    const telegramId = update.message.from.id
    const { feature, userId: payloadUser, scanId } = parsePayload(payment.invoice_payload || "")
    // Доверяем ТОЛЬКО from.id: payload приходит от нас же, но подменить счёт
    // можно, а отправителя платежа — нет.
    const userId = telegramId

    if(payloadUser && String(payloadUser) !== String(telegramId)){
      console.warn("webhook: payload user != payer", payloadUser, telegramId)
    }

    // Идемпотентность: Telegram может повторить доставку апдейта. Раньше это был get, затем set:
    // два параллельных ретрая оба проходили проверку и начисляли покупку дважды. INCR атомарен,
    // обрабатывает платёж только тот, кто получил 1.
    const chargeId = payment.telegram_payment_charge_id
    const chargeKey = chargeId ? `charge:${chargeId}` : null
    if(chargeKey && await kvIncr(chargeKey) > 1) return new Response("ok")

    try{
      return await handlePayment(payment, telegramId, userId, feature, scanId, chargeId)
    }catch(e){
      // Не смогли выдать покупку: снимаем метку и отвечаем 500, Telegram повторит доставку.
      // Раньше метка ставилась до обработки, и после сбоя ретрай молча игнорировался: человек платил и ничего не получал.
      console.error("webhook: payment handling failed", chargeId, e)
      // Если откат метки сам упал, ретрай Telegram получит ok и покупка потеряется молча.
      // Такое должно быть громко видно в логах: разбирать руками и делать refundStarPayment.
      if(chargeKey) await kvDecr(chargeKey).catch(err => console.error("PAYMENT LOST: rollback failed, refund manually", chargeId, userId, feature, err))
      return new Response("retry", { status: 500 })
    }
  }

  /* ── возврат средств ── */
  const refund = update.message?.refunded_payment
  if(refund){
    const telegramId = update.message.from.id
    const { feature } = parsePayload(refund.invoice_payload || "")
    if(feature === "sub") await revokeSubscription(telegramId)
    console.log("REFUND", telegramId, feature)
    return new Response("ok")
  }

  /* ── /start: приветствие и кнопка в приложение ──
     Раньше бот молчал на любое сообщение, кроме платежей: человек приходил по ссылке,
     жал Start и получал пустоту. */
  const text: string | undefined = update.message?.text
  if(text && /^\/start(\s|$)/.test(text)){
    try{
      await handleStart(update.message.chat.id, update.message.from.id, text.split(/\s+/)[1], update.message.from.language_code)
    }catch(e){ console.error("webhook: /start failed", e) }
    return new Response("ok")
  }

  /* ── пользователь отключил автопродление ── */
  if(text === "/unsubscribe"){
    await markSubscriptionCancelled(update.message.from.id)
    return new Response("ok")
  }

  return new Response("ok")
}

// Приветствие по языку Telegram-клиента. Английский по умолчанию: каталог Apps Center проверяет,
// что бот отвечает на /start по-английски (по описаниям тех, кто проходил модерацию, проверить у Telegram).
const START_COPY = {
  ru: { text: "💘 Love Scanner\n\nЗагрузи два фото (или одно совместное), и за 10 секунд получишь процент совместимости и разбор: что видно по позам, взглядам и дистанции.\n\nЭто развлечение, а не диагноз. Фото уходят только на разбор нейросети.", btn: "Проверить совместимость ✦" },
  es: { text: "💘 Love Scanner\n\nSube dos fotos (o una juntos) y en 10 segundos verás el porcentaje de compatibilidad y qué dicen las poses, las miradas y la distancia.\n\nEs solo entretenimiento, no un diagnóstico. Las fotos se envían solo para el análisis con IA.", btn: "Comprobar compatibilidad ✦" },
  en: { text: "💘 Love Scanner\n\nUpload two photos (or one together) and in 10 seconds get a compatibility score and a reading: what poses, glances and distance say.\n\nJust for fun, not a diagnosis. Photos are sent only for AI analysis.", btn: "Check compatibility ✦" },
} as const

async function handleStart(chatId: number, fromId: number, param?: string, langCode?: string){
  // Человек сам нажал Start: теперь боту можно писать ему первым (ежедневное письмо).
  await kvSadd("push:subscribers", String(fromId)).catch(()=>{})
  // ref_/invite_ из ссылки ?start= переносим в startapp, чтобы приглашение не терялось.
  const startapp = param && /^(ref|invite)_[A-Za-z0-9_-]{1,64}$/.test(param) ? param : undefined
  const c = START_COPY[(["ru", "uk", "be", "kk"].includes(langCode || "") ? "ru" : (langCode || "").startsWith("es") ? "es" : "en")]
  await tg("sendMessage", {
    chat_id: chatId,
    text: c.text,
    reply_markup: { inline_keyboard: [[{ text: c.btn, url: appLink(startapp) }]] },
  })
}

async function handlePayment(payment: any, telegramId: number, userId: number, feature: string, scanId: string | undefined, chargeId: string | undefined){
  {
    if(feature === "sub"){
      const sub = await grantSubscription(userId, {
        expiresAtSec: payment.subscription_expiration_date,
        chargeId,
        isRenewal: !!payment.is_recurring && !payment.is_first_recurring,
      })
      // Сообщение шлём только при первой оплате — уведомлять о каждом
      // автосписании раздражает и повышает отписки.
      if(!payment.is_recurring || payment.is_first_recurring){
        // Сбой уведомления не должен откатывать уже выданную подписку и запускать повторную выдачу.
        await tg("sendMessage", {
          chat_id: telegramId,
          text: "Архив открыт. Безлимитные сканы и все разборы — 30 дней, дальше продлится само. Отменить можно в любой момент в настройках Telegram.",
        }).catch(err => console.error("webhook: sub welcome failed", err))
      }
      console.log("SUB granted", userId, new Date(sub.until).toISOString())
      return new Response("ok")
    }

    if(feature === "conversation"){
      // Разбор переписки не привязан к скану — открываем как отдельную покупку.
      await kvSet(`conv:${userId}:${chargeId || Date.now()}`, { ts: Date.now(), used: false })
      await kvIncr(`conv_credit:${userId}`)   // атомарно: get+set терял кредит при двух платежах подряд
      return new Response("ok")
    }

    if(scanId){
      await unlockScanFeature(scanId, userId, feature as PaidFeature | "bundle")
    } else {
      console.error("webhook: paid one-off without scanId", feature, userId)
    }

    return new Response("ok")
  }
}