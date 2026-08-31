// ПОЛОЖИТЬ СЮДА: app/api/scan/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvListAll } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import type { ScanRecord } from '../route'

export const runtime = "nodejs"

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userId = user.id

  const scanIds = await kvListAll<string>(`history:${userId}`)
  const records = await Promise.all(scanIds.map(id => kvGet<ScanRecord>(`scan:${id}`)))
  const items = records
    .filter((r): r is ScanRecord => !!r)
    .map(r => ({ scanId: r.scanId, percent: r.percent, mode: r.mode, ts: r.ts, unlocked: r.unlocked, snippet: r.full.slice(0,140) }))

  return NextResponse.json({ items })
}