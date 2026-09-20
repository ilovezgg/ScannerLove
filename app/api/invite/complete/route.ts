import { NextRequest, NextResponse, after } from 'next/server'
import { kvGet, kvIncr, kvDecr, kvSadd } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { INVITES_PER_REWARD } from '@/lib/pricing'
import { appLink } from '@/lib/links'

export const runtime = "nodejs"

// POST { referrerId } — вызывается один раз, сразу после ПЕРВОГО успешного скана приглашённого
// (не при открытии приложения), чтобы реферал засчитывался только тому, кто реально попробовал.
// newUserId приходит НЕ из тела, а из подписанного initData: иначе можно было накрутить себе
// рефералов бесконечными фейковыми newUserId.
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const newUserId = user.id

    const { referrerId: rawRef } = await req.json()
    const referrerId = String(rawRef ?? "")
    if(!/^\d{1,15}$/.test(referrerId)) return NextResponse.json({ error: "missing ids" }, { status: 400 })
    if(referrerId === String(newUserId)) return NextResponse.json({ error: "self-referral" }, { status: 400 })

    // Реферал засчитывается только тому, кто реально прогнал скан через /api/love: сервер ставит
    // scanned:<id> после успешного разбора. Раньше проверялась история, а её можно было забить
    // фейковым POST /api/scan, так что алт-аккаунты фармили кредиты.
    const scanned = await kvGet(`scanned:${newUserId}`)
    if(!scanned) return NextResponse.json({ ok: false, error: "no real scan yet" }, { status: 409 })

    // Реферер должен существовать (хоть раз открывал апп), иначе счётчики и уведомления
    // можно было накручивать на любые чужие ID.
    const refSeen = await kvGet(`user:${referrerId}:seen`)
    if(!refSeen) return NextResponse.json({ ok: false, error: "unknown referrer" }, { status: 404 })

    // INCR атомарен: при двух параллельных вызовах засчитается только первый.
    // Раньше это был get, затем set, и гонка давала двойной зачёт.
    const creditedKey = `ref:credited:${newUserId}`
    if(await kvIncr(creditedKey) > 1) return NextResponse.json({ ok: true, alreadyCredited: true })

    let count = 0, newReward = false
    try{
      // Приглашённому тоже кое-что достаётся сразу: одна бесплатная разблокировка письма.
      // Иначе ссылке нечем цеплять, кроме просьбы «сделай мне приятно».
      await kvIncr(`ref:credits:${newUserId}`)

      count = await kvIncr(`ref:count:${referrerId}`)
      await kvSadd("ref:referrers", referrerId) // для лидерборда: все, у кого есть хоть 1 реферал

      if(count % INVITES_PER_REWARD === 0){
        await kvIncr(`ref:credits:${referrerId}`)
        newReward = true
      }
    }catch(e){
      // Сбой посреди начисления: снимаем метку, чтобы повтор клиента мог довести зачёт до конца,
      // а не получил alreadyCredited и потерял награду навсегда.
      await kvDecr(creditedKey).catch(()=>{})
      throw e
    }

    // after() доводит уведомление до конца уже после ответа: голый fire-and-forget на serverless
    // замораживается вместе с функцией.
    after(() => notifyReferrer(referrerId, count, newReward))

    return NextResponse.json({ ok: true, count, newReward, bonusCredit: 1 })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Уведомление рефереру: «по твоей ссылке зашли». Лучший ретеншен-триггер из возможных:
// человек возвращается в приложение сам, без рассылки. Если он не нажимал Start, Telegram
// вернёт 403, это нормально.
async function notifyReferrer(referrerId: string, count: number, newReward: boolean){
  const token = process.env.BOT_TOKEN?.trim()
  if(!token) return
  const text = newReward
    ? `🎁 По твоей ссылке уже ${count} человек(а). Тебе начислена бесплатная разблокировка письма, забирай в приложении.`
    : `👀 Кто-то проверил совместимость по твоей ссылке (всего ${count}). До следующей награды: ${INVITES_PER_REWARD - (count % INVITES_PER_REWARD)}.`
  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: referrerId,
        text,
        reply_markup: { inline_keyboard: [[{ text: "Открыть ↗", url: appLink() }]] },
      }),
    })
  }catch{}
}
