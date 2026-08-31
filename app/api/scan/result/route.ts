// ПОЛОЖИТЬ СЮДА: app/api/scan/result/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import type { ScanRecord } from '../route'

export const runtime = "nodejs"

// POST { scanId, feature, text } — вызывается сразу после того как /api/love
// вернул текст для платной категории. Без этого шага "перечитать в истории"
// не сработало бы — фото не хранятся, без сохранённого текста реген невозможен.
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { scanId, feature, text } = await req.json()
    if(!scanId || !feature || typeof text !== "string") return NextResponse.json({ error: "missing fields" }, { status: 400 })

    const record = await kvGet<ScanRecord>(`scan:${scanId}`)
    if(!record) return NextResponse.json({ error: "scan not found" }, { status: 404 })
    if(String(record.userId) !== String(user.id)){
      return NextResponse.json({ error: "scan not found" }, { status: 404 })  // намеренно 404, а не 403, как в scan/route.ts GET
    }

    record.results[feature as keyof ScanRecord["results"]] = text
    await kvSet(`scan:${scanId}`, record)

    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}