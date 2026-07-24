// ПОЛОЖИТЬ СЮДА: app/api/scan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvListPush } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { isSubscriber } from '@/lib/entitlements'

export const runtime = "nodejs"

export type ScanFeature = "deep" | "hidden" | "future" | "custom" | "conversation"

export type ScanRecord = {
  scanId: string
  userId: string
  mode: string
  input: "two" | "joint" | "both" | "chat"   // НОВОЕ: как именно сканировали
  percent: number
  full: string
  teasers?: Partial<Record<ScanFeature, string>>  // НОВОЕ: настоящие превью платных разборов
  ts: number
  unlocked: Partial<Record<ScanFeature, boolean>>
  results: Partial<Record<ScanFeature, string>>
}

const HISTORY_CAP = 30

export async function POST(req: NextRequest){
  try{
    // userId берём из подписанного initData, а не из тела: иначе можно было
    // создать скан от чужого имени и подмешать его в чужую историю.
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { scanId, mode, input, percent, full, teasers } = await req.json()
    if(!scanId) return NextResponse.json({ error: "missing scanId" }, { status: 400 })

    // Не даём переписать уже существующий скан — иначе можно было бы
    // подставить свой scanId поверх чужого и унаследовать его разблокировки.
    const existing = await kvGet<ScanRecord>(`scan:${scanId}`)
    if(existing) return NextResponse.json({ error: "scan exists" }, { status: 409 })

    const record: ScanRecord = {
      scanId,
      userId: String(user.id),
      mode: mode || "couple",
      input: ["two","joint","both","chat"].includes(input) ? input : "two",
      percent,
      full,
      teasers: teasers && typeof teasers === "object" ? teasers : undefined,
      ts: Date.now(),
      unlocked: {},
      results: {},
    }
    await kvSet(`scan:${scanId}`, record)
    await kvListPush(`history:${user.id}`, scanId, HISTORY_CAP)

    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const scanId = req.nextUrl.searchParams.get("scanId")
  if(!scanId) return NextResponse.json({ error: "no scanId" }, { status: 400 })

  const record = await kvGet<ScanRecord>(`scan:${scanId}`)
  if(!record) return NextResponse.json({ error: "not found" }, { status: 404 })
  if(String(record.userId) !== String(user.id)){
    return NextResponse.json({ error: "not found" }, { status: 404 })  // намеренно 404, а не 403
  }

  // Подписчику всё открыто — отдаём это клиенту, чтобы он не рисовал замочки.
  const sub = await isSubscriber(user.id)
  const unlocked = sub
    ? { deep:true, hidden:true, future:true, custom:true, conversation:true }
    : record.unlocked

  return NextResponse.json({ scan: { ...record, unlocked }, subscriber: sub })
}