import { NextRequest } from 'next/server'
import { Redis } from "@upstash/redis"
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

const redis = Redis.fromEnv()

// Короткое имя мини-аппа из BotFather (/myapps). Дефолт "app" — как было
// захардкожено раньше; переопределяется через env, если в BotFather другое имя.
const APP_SHORT_NAME = process.env.APP_SHORT_NAME?.trim() || "app"
const BOT_USERNAME = "lovescan_ai_bot"

// Сколько живёт приглашение (7 дней)
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function generateSessionId() {
  // короткий случайный id, чтобы ссылка не была длинной
  return Math.random().toString(36).slice(2, 10)
}

export async function POST(req: NextRequest) {
  // userId берём из подписанного initData, а не из тела — иначе можно
  // было создать invite-сессию от чужого имени.
  const user = authUserOrDev(req)
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json()
  const { result } = body

  const sessionId = generateSessionId()

  const session = {
    sessionId,
    inviterId: user.id,
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