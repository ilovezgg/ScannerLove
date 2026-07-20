import { NextRequest } from 'next/server'
import { Redis } from "@upstash/redis"
const redis = Redis.fromEnv()
const BOT_TOKEN = process.env.BOT_TOKEN!

export async function POST(req: NextRequest){
  const update = await req.json()

  if(update.pre_checkout_query){
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true })
    })
    return new Response("ok")
  }

  if(update.message?.successful_payment){
    const payment = update.message.successful_payment
    const raw = payment.invoice_payload
    const telegramId = update.message.from.id
    let type = "deep"
    let userId = telegramId
    try{
      const parsed = JSON.parse(raw)
      type = parsed.type || type
      userId = parsed.userId || telegramId
    }catch{
      if(raw.includes("sex")) type = "sex"
      else if(raw.includes("kids")) type = "kids"
      const parts = raw.split("_")
      const maybeId = parts[parts.length-1]
      if(!isNaN(Number(maybeId))) userId = Number(maybeId)
    }
    console.log(`SAVE paid:${userId}:${type}`)
    await redis.set(`paid:${userId}:${type}`, 1)
    await redis.set(`paid:${telegramId}:${type}`, 1)
    return new Response("ok")
  }
  return new Response("ok")
}