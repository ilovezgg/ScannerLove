// ПОЛОЖИТЬ СЮДА: app/api/custom-credit/use/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/kv'

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const has = await kvGet<boolean>(`custom:free_credit:${userId}`)
  return NextResponse.json({ hasCredit: !!has })
}