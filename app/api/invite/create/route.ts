import { NextRequest } from 'next/server'
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

// TODO: замените на реальный APP_SHORT_NAME из BotFather (/myapps)
const APP_SHORT_NAME = "app"
const BOT_USERNAME = "lovescan_ai_bot"

// Сколько живёт приглашение (7 дней)
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function generateSessionId() {
  // короткий случайный id, чтобы ссылка не была длинной
  return Math.random().toString(36).slice(2, 10)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, result } = body

  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 })
  }

  const sessionId = generateSessionId()

  const session = {
    sessionId,
    inviterId: userId,
    inviterResult: result ?? null, // результат скана того, кто приглашает
    partnerId: null,
    partnerResult: null,
    status: "pending", // pending -> joined -> completed
    createdAt: Date.now(),
  }

  await redis.set(`invite:${sessionId}`, JSON.stringify(session), {
    ex: SESSION_TTL_SECONDS,
  })

  const link = `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}?startapp=invite_${sessionId}`

  return Response.json({ sessionId, link })
}