import { NextRequest, NextResponse } from 'next/server'
import { kvSmembers } from '@/lib/kv'
export const maxDuration = 60

// Тот же пул писем, что и в UI daily-seal — держите тексты синхронизированными
// вручную (или вынесите в общий json/lib, если разрастётся).
const LETTERS = [
  { title: "Выбор сердца", text: "Сегодня вас тянет друг к другу сильнее, чем кажется." },
  { title: "Тепло вдвоем", text: "Есть пары, которых видно издалека. Кажется, сегодня про вас." },
  { title: "Надежда", text: "Кто-то сегодня влюблён сильнее и боится это показать." },
]

// GET /api/cron/daily-push?secret=XXX
// Секрет — чтобы рассылку нельзя было дёрнуть кем попало из браузера.
// Задайте CRON_SECRET в env и настройте cron (Vercel Cron / cron-job.org)
// на ежедневный GET-запрос с этим же secret в query.
export async function GET(req: NextRequest){
  const secret = req.nextUrl.searchParams.get("secret")
  if(!secret || secret !== process.env.CRON_SECRET){
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() // без @, например love_scanner_bot
  if(!botToken) return NextResponse.json({ error: "no TELEGRAM_BOT_TOKEN" }, { status: 500 })

  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]
  const subscribers = await kvSmembers("push:subscribers")

  let sent = 0, failed = 0
  for(const userId of subscribers){
    try{
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userId,
          text: `🕯 Письмо дня\n\n«${letter.title}»\n${letter.text}\n\nОткрой печать, чтобы узнать, что сегодня между вами.`,
          reply_markup: {
            inline_keyboard: [[
              { text: "Открыть письмо ↗", url: botUsername ? `https://t.me/${botUsername}/love` : undefined },
            ]],
          },
        }),
      })
      if(res.ok) sent++; else failed++
    }catch{ failed++ }
  }

  return NextResponse.json({ sent, failed, total: subscribers.length })
}