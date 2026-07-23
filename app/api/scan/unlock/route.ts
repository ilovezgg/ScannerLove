// ПОЛОЖИТЬ СЮДА: app/api/scan/unlock/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import type { ScanRecord } from '../route'

// POST { scanId, feature } — feature: "deep" | "hidden" | "future" | "custom" | "bundle"
// "bundle" отмечает разом deep+hidden+future (custom бандлом не покрывается —
// это отдельная платная категория, как и в текущем прайсе).
export async function POST(req: NextRequest){
  try{
    const { scanId, feature } = await req.json()
    if(!scanId || !feature) return NextResponse.json({ error: "missing fields" }, { status: 400 })

    const record = await kvGet<ScanRecord>(`scan:${scanId}`)
    if(!record) return NextResponse.json({ error: "scan not found" }, { status: 404 })

    if(feature === "bundle"){
      record.unlocked.deep = true
      record.unlocked.hidden = true
      record.unlocked.future = true
    } else {
      record.unlocked[feature as keyof ScanRecord["unlocked"]] = true
    }

    await kvSet(`scan:${scanId}`, record)
    return NextResponse.json({ ok: true, unlocked: record.unlocked })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}