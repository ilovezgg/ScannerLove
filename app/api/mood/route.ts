// ПОЛОЖИТЬ СЮДА: app/api/mood/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'

function todayKey(){
  return new Date().toISOString().slice(0,10) // YYYY-MM-DD, UTC — достаточно для "1 раз в день"
}

// POST { userId, mood } — сохраняет ответ на сегодня
export async function POST(req: NextRequest){
  try{
    const { userId, mood } = await req.json()
    if(!userId || !mood) return NextResponse.json({ error: "missing fields" }, { status: 400 })
    await kvSet(`mood:${userId}:${todayKey()}`, mood)
    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET ?userId= — есть ли уже ответ за сегодня (чтобы карточка не показывалась повторно)
export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const mood = await kvGet<string>(`mood:${userId}:${todayKey()}`)
  return NextResponse.json({ mood: mood || null })
}