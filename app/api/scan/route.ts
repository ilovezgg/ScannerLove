// ПОЛОЖИТЬ СЮДА: app/api/scan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvListPush } from '@/lib/kv'

export type ScanRecord = {
  scanId: string
  userId: string
  mode: string
  percent: number
  full: string
  ts: number
  unlocked: { deep?: boolean, hidden?: boolean, future?: boolean, custom?: boolean }
  results: { deep?: string, hidden?: string, future?: string, custom?: string }
}

const HISTORY_CAP = 30

// POST { scanId, userId, mode, percent, full } — вызывается сразу после
// успешного бесплатного скана. Один scanId = одна оплата платной категории =
// доступ навсегда именно к ЭТОМУ скану (не ко всем скана юзера разом).
export async function POST(req: NextRequest){
  try{
    const { scanId, userId, mode, percent, full } = await req.json()
    if(!scanId || !userId) return NextResponse.json({ error: "missing fields" }, { status: 400 })

    const record: ScanRecord = {
      scanId, userId: String(userId), mode: mode || "couple",
      percent, full, ts: Date.now(),
      unlocked: {}, results: {},
    }
    await kvSet(`scan:${scanId}`, record)
    await kvListPush(`history:${userId}`, scanId, HISTORY_CAP)

    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET ?scanId=X — полная карточка скана (для повторного открытия из истории
// или для проверки состояния текущего скана)
export async function GET(req: NextRequest){
  const scanId = req.nextUrl.searchParams.get("scanId")
  if(!scanId) return NextResponse.json({ error: "no scanId" }, { status: 400 })
  const record = await kvGet<ScanRecord>(`scan:${scanId}`)
  if(!record) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ scan: record })
}