import { Redis } from "@upstash/redis"
import { NextRequest } from "next/server"
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return Response.json({paid:false},{status:401})
  const feature = req.nextUrl.searchParams.get("feature")
  if(!feature) return Response.json({paid:false})
  const paid = await redis.get(`paid:${user.id}:${feature}`)
  return Response.json({ paid: !!paid })
}