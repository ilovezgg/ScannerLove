import { Redis } from "@upstash/redis"
import { NextRequest } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  const feature = req.nextUrl.searchParams.get("feature")
  if(!userId || !feature) return Response.json({paid:false})
  const paid = await redis.get(`paid:${userId}:${feature}`)
  return Response.json({ paid: !!paid })
}