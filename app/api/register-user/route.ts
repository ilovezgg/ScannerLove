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

    const { optIn } = await req.json()

    await kvSet(`user:${userId}:seen`, Date.now())
    // Список рассылки трогаем только при явном optIn. Раньше без поля подразумевалось true, и
    // клиент на каждом запуске снова подписывал человека, который выключил колокольчик.
    if(optIn === true){
      await kvSadd("push:subscribers", String(userId))
    } else if(optIn === false){
      await kvSrem("push:subscribers", String(userId))
    }
    return NextResponse.json({ ok: true, optIn: optIn ?? null })
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