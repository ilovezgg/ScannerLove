import { NextRequest, NextResponse } from 'next/server'
import { kvSet, kvSadd, kvSrem, kvSmembers } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

// POST { optIn } — call this once when the mini app boots, and again
// whenever the user flips the notification-bell toggle.
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const userId = user.id

    const { optIn = true } = await req.json()

    await kvSet(`user:${userId}:seen`, Date.now())
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
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const subs = await kvSmembers("push:subscribers")
  return NextResponse.json({ optIn: subs.includes(String(user.id)) })
}