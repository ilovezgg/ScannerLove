import { NextRequest } from 'next/server'
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const raw = await redis.get<string | object>(`invite:${sessionId}`)
  if (!raw) {
    return Response.json({ error: "session not found or expired" }, { status: 404 })
  }

  const session = typeof raw === "string" ? JSON.parse(raw) : raw
  return Response.json({ session })
}