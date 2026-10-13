import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSmembers, kvSrem, kvIncrTtl } from '@/lib/kv'
import { isLang, type Lang } from '@/lib/i18n'
import { appLink } from '@/lib/links'
export const maxDuration = 60

// Пул писем дня. Раньше было три текста, и к четвёртому дню подписчик видел повтор и отключал бота.
// Письмо выбирается по номеру дня, а не случайно: два дня подряд одно и то же не придёт.
const LETTERS = [
  { title: "Выбор сердца", text: "Сегодня вас тянет друг к другу сильнее, чем кажется." },
  { title: "Тепло вдвоём", text: "Есть пары, которых видно издалека. Кажется, сегодня про вас." },
  { title: "Надежда", text: "Кто-то сегодня влюблён сильнее и боится это показать." },
  { title: "Недосказанное", text: "Есть одна фраза, которую вы оба ждёте. Кто скажет первым?" },
  { title: "Тихий вечер", text: "Сегодня лучше не выяснять отношения, а просто побыть рядом." },
  { title: "Взгляд", text: "Посмотри сегодня на человека рядом чуть дольше обычного. Ответ будет там." },
  { title: "Старая искра", text: "Что-то из вашего начала сегодня вернётся. Не пропусти." },
  { title: "Лёгкая ревность", text: "Она (он) сегодня заметит больше, чем показывает. Не играй в равнодушие." },
  { title: "Смелость", text: "День, когда честное «я скучаю» сработает лучше любого подарка." },
  { title: "Общая тайна", text: "У вас есть то, что понимаете только вы двое. Сегодня оно почувствуется сильнее." },
]

// Те же десять писем по-английски, в том же порядке: номер дня выбирает пару ru/en.
const LETTERS_EN = [
  { title: "Heart's choice", text: "You're pulled toward each other today more than it seems." },
  { title: "Warm together", text: "Some couples you can spot from across the room. Today feels like you two." },
  { title: "Hope", text: "One of you is falling harder today and is scared to show it." },
  { title: "Unsaid", text: "There's one sentence you're both waiting for. Who says it first?" },
  { title: "Quiet evening", text: "Not a day for big talks. Just be next to each other." },
  { title: "The look", text: "Look at the person next to you a little longer than usual today. The answer is there." },
  { title: "Old spark", text: "Something from your very beginning comes back today. Don't miss it." },
  { title: "A little jealousy", text: "They'll notice more today than they let on. Don't play it cool." },
  { title: "Courage", text: "A day when an honest \"I miss you\" beats any gift." },
  { title: "Shared secret", text: "There's something only the two of you get. Today it'll feel stronger." },
]

const DAY_MS = 86_400_000
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// GET /api/cron/daily-push
// Авторизация: заголовок Authorization: Bearer <CRON_SECRET> (так ходит Vercel Cron)
// или ?secret=<CRON_SECRET> для ручного вызова / cron-job.org.
export async function GET(req: NextRequest){
  const expected = process.env.CRON_SECRET
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("secret")
  if(!expected || got !== expected){
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const botToken = process.env.BOT_TOKEN?.trim()
  if(!botToken) return NextResponse.json({ error: "no BOT_TOKEN" }, { status: 500 })

  const dayNum = Math.floor(Date.now() / DAY_MS)
  // Повторный вызов cron (Vercel это допускает) не должен слать письмо дважды.
  if(await kvIncrTtl(`cron:push:${dayNum}`, 90_000) > 1){
    return NextResponse.json({ skipped: "already ran today" })
  }

  const letter = LETTERS[dayNum % LETTERS.length]
  // Стартовая точка сдвигается каждый день, иначе при обрыве по времени хвост списка не получал бы письма никогда.
  const all = (await kvSmembers("push:subscribers")).sort()
  const shift = all.length ? (dayNum * 500) % all.length : 0
  const subscribers = [...all.slice(shift), ...all.slice(0, shift)]
  const letterEn = LETTERS_EN[dayNum % LETTERS_EN.length]
  const bodies: Record<Lang, object> = {
    ru: {
      text: `🕯 Письмо дня\n\n«${letter.title}»\n${letter.text}\n\nОткрой печать, чтобы узнать, что сегодня между вами.`,
      reply_markup: { inline_keyboard: [[{ text: "Открыть письмо ↗", url: appLink() }]] },
    },
    en: {
      text: `🕯 Letter of the day\n\n"${letterEn.title}"\n${letterEn.text}\n\nBreak the seal to see what's between you today.`,
      reply_markup: { inline_keyboard: [[{ text: "Open the letter ↗", url: appLink() }]] },
    },
  }

  // Лимит Telegram на рассылку — около 30 сообщений в секунду. Идём пачками по 20 с паузой в секунду,
  // и заодно укладываемся в maxDuration: последовательный цикл на тысячу человек упирался в таймаут.
  let sent = 0, failed = 0, removed = 0
  const started = Date.now()
  const BATCH = 20
  for(let i = 0; i < subscribers.length; i += BATCH){
    if(Date.now() - started > 45_000) break   // остаток уйдёт завтра, а не оборвётся на середине
    const batch = subscribers.slice(i, i + BATCH)
    await Promise.all(batch.map(async userId => {
      try{
        // Язык не сохранён только у старых подписчиков, а до EN-версии бот был только русским.
        const saved = await kvGet(`user:${userId}:lang`).catch(() => null)
        const body = bodies[isLang(saved) ? saved : "ru"]
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: userId, ...body }),
          signal: AbortSignal.timeout(8000),
        })
        if(res.ok){ sent++; return }
        failed++
        // Заблокировал бота (403 «blocked») или аккаунт удалён (400 «chat not found»): больше не пишем.
        // 403 «can't initiate conversation» не трогаем: человек просто ещё не нажимал Start.
        const err = await res.json().catch(() => null) as { description?: string } | null
        const d = err?.description || ""
        if((res.status === 403 && /blocked|deactivated/i.test(d)) || (res.status === 400 && /chat not found/i.test(d))){
          removed++
          await kvSrem("push:subscribers", userId).catch(()=>{})
        }
      }catch{ failed++ }
    }))
    if(i + BATCH < subscribers.length) await sleep(1000)
  }

  return NextResponse.json({ sent, failed, removed, total: subscribers.length })
}
