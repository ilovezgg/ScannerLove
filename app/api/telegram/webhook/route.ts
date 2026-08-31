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
import { kvGet, kvSet } from '@/lib/kv'
import { grantSubscription, markSubscriptionCancelled, revokeSubscription, type PaidFeature } from '@/lib/entitlements'

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
    console.error("webhook: scan not found", scanId)
    return
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

    // Идемпотентность: Telegram может повторить доставку апдейта.
    const chargeId = payment.telegram_payment_charge_id
    if(chargeId){
      const seen = await kvGet<number>(`charge:${chargeId}`)
      if(seen) return new Response("ok")
      await kvSet(`charge:${chargeId}`, Date.now())
    }

    if(feature === "sub"){
      const sub = await grantSubscription(userId, {
        expiresAtSec: payment.subscription_expiration_date,
        chargeId,
        isRenewal: !!payment.is_recurring && !payment.is_first_recurring,
      })
      // Сообщение шлём только при первой оплате — уведомлять о каждом
      // автосписании раздражает и повышает отписки.
      if(!payment.is_recurring || payment.is_first_recurring){
        await tg("sendMessage", {
          chat_id: telegramId,
          text: "Архив открыт. Безлимитные сканы и все разборы — 30 дней, дальше продлится само. Отменить можно в любой момент в настройках Telegram.",
        })
      }
      console.log("SUB granted", userId, new Date(sub.until).toISOString())
      return new Response("ok")
    }

    if(feature === "conversation"){
      // Разбор переписки не привязан к скану — открываем как отдельную покупку.
      await kvSet(`conv:${userId}:${chargeId || Date.now()}`, { ts: Date.now(), used: false })
      await kvSet(`conv_credit:${userId}`, ((await kvGet<number>(`conv_credit:${userId}`)) || 0) + 1)
      return new Response("ok")
    }

    if(scanId){
      await unlockScanFeature(scanId, userId, feature as PaidFeature | "bundle")
    } else {
      console.error("webhook: paid one-off without scanId", feature, userId)
    }

    return new Response("ok")
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

  /* ── пользователь отключил автопродление ── */
  // Telegram присылает это как обычную оплату с is_recurring=false в некоторых
  // клиентах, но надёжнее ориентироваться на отдельный апдейт, если он есть.
  if(update.message?.text === "/unsubscribe"){
    await markSubscriptionCancelled(update.message.from.id)
    return new Response("ok")
  }

  return new Response("ok")
}