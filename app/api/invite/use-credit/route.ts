import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'

export async function POST(req: NextRequest){
  try{
    const { userId } = await req.json()
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

    const key = `ref:credits:${userId}`
    const credits = (await kvGet<number>(key)) || 0
    if(credits <= 0) return NextResponse.json({ ok: false, error: "no credits" }, { status: 400 })

    await kvSet(key, credits - 1)
    return NextResponse.json({ ok: true, remaining: credits - 1 })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}