import { NextRequest, NextResponse } from 'next/server'
import { kvListPush, kvListAll } from '@/lib/kv'

// POST { userId, percent, full, mode } — call right after check() succeeds.
// We deliberately do NOT store the photos themselves (privacy + KV size),
// only the text result — that's enough for "look back at past scans".
export async function POST(req: NextRequest){
  try{
    const { userId, percent, full, mode="couple" } = await req.json()
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
    const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, percent, full, mode, ts: Date.now() }
    await kvListPush(`history:${userId}`, entry, 30)
    return NextResponse.json({ ok: true, entry })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const items = await kvListAll(`history:${userId}`)
  return NextResponse.json({ items })
}