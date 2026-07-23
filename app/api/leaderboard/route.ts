import { NextRequest, NextResponse } from 'next/server'
import { kvSet, kvSadd, kvSrem, kvSmembers } from '@/lib/kv'

// POST { userId, optIn, name } — call this once when the mini app boots (we already
// read tg.initDataUnsafe.user.id on mount, just also send it here), and again
// whenever the user flips the notification-bell toggle. "name" comes from
// tg.initDataUnsafe.user.first_name — used only for the referral leaderboard display.
export async function POST(req: NextRequest){
  try{
    const { userId, optIn = true, name } = await req.json()
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

    await kvSet(`user:${userId}:seen`, Date.now())
    if(name) await kvSet(`user:${userId}:name`, String(name).slice(0, 40))
    if(optIn){
      await kvSadd("push:subscribers", String(userId))
    } else {
      await kvSrem("push:subscribers", String(userId))
    }
    return NextResponse.json({ ok: true, optIn })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const subs = await kvSmembers("push:subscribers")
  return NextResponse.json({ optIn: subs.includes(String(userId)) })
}