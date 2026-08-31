// ПОЛОЖИТЬ СЮДА: app/api/mood/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

function todayKey(){
  return new Date().toISOString().slice(0,10) // YYYY-MM-DD, UTC — достаточно для "1 раз в день"
}

// POST { mood } — сохраняет ответ на сегодня
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { mood } = await req.json()
    if(!mood) return NextResponse.json({ error: "missing fields" }, { status: 400 })
    await kvSet(`mood:${user.id}:${todayKey()}`, mood)
    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET — есть ли уже ответ за сегодня (чтобы карточка не показывалась повторно)
export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const mood = await kvGet<string>(`mood:${user.id}:${todayKey()}`)
  return NextResponse.json({ mood: mood || null })
}