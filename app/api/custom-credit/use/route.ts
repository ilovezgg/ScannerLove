// ПОЛОЖИТЬ СЮДА: app/api/custom-credit/use/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const has = await kvGet<boolean>(`custom:free_credit:${userId}`)
  return NextResponse.json({ hasCredit: !!has })
}

export async function POST(req: NextRequest){
  try{
    const { userId } = await req.json()
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

    const key = `custom:free_credit:${userId}`
    const has = await kvGet<boolean>(key)
    if(!has) return NextResponse.json({ ok: false, error: "no credit" }, { status: 400 })

    await kvSet(key, false)
    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}