// ПОЛОЖИТЬ СЮДА: app/api/scan/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvListAll } from '@/lib/kv'
import type { ScanRecord } from '../route'

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

  const scanIds = await kvListAll<string>(`history:${userId}`)
  const records = await Promise.all(scanIds.map(id => kvGet<ScanRecord>(`scan:${id}`)))
  const items = records
    .filter((r): r is ScanRecord => !!r)
    .map(r => ({ scanId: r.scanId, percent: r.percent, mode: r.mode, ts: r.ts, unlocked: r.unlocked, snippet: r.full.slice(0,140) }))

  return NextResponse.json({ items })
}