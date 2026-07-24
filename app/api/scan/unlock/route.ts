// ПОЛОЖИТЬ СЮДА: app/api/scan/unlock/route.ts
//
// ВАЖНО, ПРОЧТИТЕ. Раньше этот роут принимал { scanId, feature } от кого
// угодно и открывал доступ. То есть весь пейвол снимался одним запросом из
// консоли браузера. Теперь роут НЕ выдаёт права.
//
// Права выдаёт только вебхук после подтверждённой Telegram оплаты
// (см. app/api/telegram/webhook). Этот роут остался для двух вещей:
//   - списать бесплатный кредит (колесо удачи, реферальная награда);
//   - вернуть клиенту актуальное состояние скана, чтобы интерфейс
//     перерисовался сразу после оплаты, не дожидаясь перезагрузки.

import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { isSubscriber, isTester } from '@/lib/entitlements'
import type { ScanRecord, ScanFeature } from '../route'

export const runtime = "nodejs"

const FEATURES: ScanFeature[] = ["deep","hidden","future","custom","conversation"]

export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { scanId, feature, source } = await req.json() as {
      scanId: string
      feature: ScanFeature | "bundle"
      source?: "credit" | "referral"   // бесплатные способы открыть
    }
    if(!scanId || !feature) return NextResponse.json({ error: "missing fields" }, { status: 400 })

    const scan = await kvGet<ScanRecord>(`scan:${scanId}`)
    if(!scan) return NextResponse.json({ error: "scan not found" }, { status: 404 })
    if(String(scan.userId) !== String(user.id)) return NextResponse.json({ error: "not found" }, { status: 404 })

    // Тестеры открывают что угодно. Список теперь в серверной переменной
    // TESTER_IDS — раньше он лежал в NEXT_PUBLIC_TESTER_IDS, то есть
    // прямо в бандле: любой мог прочитать его и подставить себе чужой id.
    const tester = isTester(user.id)

    let allowed = tester

    if(!allowed && source === "credit"){
      const credits = (await kvGet<number>(`credit:${user.id}`)) || 0
      if(credits > 0){
        await kvSet(`credit:${user.id}`, credits - 1)
        allowed = true
      }
    }

    if(!allowed && source === "referral"){
      const credits = (await kvGet<number>(`ref_credits:${user.id}`)) || 0
      if(credits > 0){
        await kvSet(`ref_credits:${user.id}`, credits - 1)
        allowed = true
      }
    }

    if(!allowed){
      // Ни кредита, ни тестерского статуса — значит открывать нечего.
      // Оплата придёт своим путём, через вебхук.
      const sub = await isSubscriber(user.id)
      return NextResponse.json({
        ok: false,
        subscriber: sub,
        unlocked: sub ? Object.fromEntries(FEATURES.map(f=>[f,true])) : scan.unlocked,
      })
    }

    scan.unlocked = scan.unlocked || {}
    if(feature === "bundle"){
      scan.unlocked.deep = true
      scan.unlocked.hidden = true
      scan.unlocked.future = true
    } else if(FEATURES.includes(feature)){
      scan.unlocked[feature] = true
    }
    await kvSet(`scan:${scanId}`, scan)

    return NextResponse.json({ ok: true, unlocked: scan.unlocked })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}