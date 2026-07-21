import { NextRequest } from 'next/server'
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sessionId, userId, result } = body

  if (!sessionId || !userId) {
    return Response.json({ error: "sessionId and userId required" }, { status: 400 })
  }

  const raw = await redis.get<string | object>(`invite:${sessionId}`)
  if (!raw) {
    return Response.json({ error: "session not found or expired" }, { status: 404 })
  }

  const session = typeof raw === "string" ? JSON.parse(raw) : raw

  // Партнёр не может присоединиться к своей же ссылке
  if (String(session.inviterId) === String(userId)) {
    return Response.json({ error: "cannot join own invite" }, { status: 400 })
  }

  session.partnerId = userId
  session.partnerResult = result ?? null
  session.status = session.inviterResult && session.partnerResult ? "completed" : "joined"

  // сохраняем с тем же TTL, просто продлеваем ещё на 7 дней
  await redis.set(`invite:${sessionId}`, JSON.stringify(session), {
    ex: 60 * 60 * 24 * 7,
  })

  return Response.json({ session })
}