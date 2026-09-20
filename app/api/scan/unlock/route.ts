// ПОЛОЖИТЬ СЮДА: app/api/scan/unlock/route.ts
//
// Этот роут НЕ выдаёт права за деньги. Платные разблокировки делает только
// вебхук после подтверждённой Telegram оплаты. Здесь — бесплатные способы
// открыть разбор: реферальный кредит и приз с колеса.
//
// ВАЖНОЕ ИЗМЕНЕНИЕ. Списание кредита и разблокировка теперь происходят
// здесь целиком, одним запросом. Раньше клиент сначала звал
// /api/invite/use-credit (тот уменьшал счётчик), а потом этот роут — который
// уменьшал его повторно. За один разбор списывалось два кредита.
//
// Поэтому POST-обработчики в /api/invite/use-credit и /api/custom-credit/use
// больше не нужны и их стоит удалить: они принимают userId из тела без
// проверки подписи, то есть позволяют сжечь чужие кредиты чужим запросом.
// GET в /api/custom-credit/use остаётся — он только читает.

import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvSpendOne, kvIncr } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { isSubscriber, isTester } from '@/lib/entitlements'
import type { ScanRecord, ScanFeature } from '../route'

export const runtime = "nodejs"

const FEATURES: ScanFeature[] = ["deep","hidden","future","custom","conversation"]

// Ключи должны совпадать с теми, что пишут остальные роуты.
const refCreditsKey = (userId: string|number) => `ref:credits:${userId}`
const freeCustomKey = (userId: string|number) => `custom:free_credit:${userId}`

export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ ok:false, error: "unauthorized" }, { status: 401 })

    const { scanId, feature, source } = await req.json() as {
      scanId: string
      feature: ScanFeature | "bundle"
      source?: "credit" | "referral"
    }
    if(!scanId || !feature) return NextResponse.json({ ok:false, error: "missing fields" }, { status: 400 })

    const scan = await kvGet<ScanRecord>(`scan:${scanId}`)
    if(!scan) return NextResponse.json({ ok:false, error: "scan not found" }, { status: 404 })
    if(String(scan.userId) !== String(user.id)){
      return NextResponse.json({ ok:false, error: "not found" }, { status: 404 })
    }

    let allowed = false
    let remaining: number | undefined
    let spentKey: string | null = null   // что вернуть, если разблокировка не удалась

    if(isTester(user.id) || await isSubscriber(user.id)){
      allowed = true

    } else if(source === "referral"){
      // Один кредит = одно письмо. Пакет из трёх писем за кредит выходил дешевле любой покупки.
      if(feature === "bundle") return NextResponse.json({ ok:false, error: "bundle is not available for credits" }, { status: 400 })
      const left = await kvSpendOne(refCreditsKey(user.id))
      if(left === null){
        return NextResponse.json({ ok:false, error: "no credits" }, { status: 400 })
      }
      allowed = true
      remaining = left
      spentKey = refCreditsKey(user.id)

    } else if(source === "credit"){
      // Приз с колеса даёт бесплатный «свой вопрос» и больше ничего. Раньше feature брался из тела,
      // и этим призом открывался bundle за 49 звёзд. Расход атомарный (счётчик), а не get+set.
      if(feature !== "custom") return NextResponse.json({ ok:false, error: "credit works only for custom" }, { status: 400 })
      const left = await kvSpendOne(freeCustomKey(user.id))
      if(left === null) return NextResponse.json({ ok:false, error: "no credit" }, { status: 400 })
      allowed = true
      spentKey = freeCustomKey(user.id)
    }

    if(!allowed){
      // Ни кредита, ни подписки. Оплата придёт своим путём, через вебхук —
      // отвечаем текущим состоянием, чтобы клиент перерисовался корректно.
      return NextResponse.json({ ok:false, unlocked: scan.unlocked })
    }

    try{
      scan.unlocked = scan.unlocked || {}
      if(feature === "bundle"){
        scan.unlocked.deep = true
        scan.unlocked.hidden = true
        scan.unlocked.future = true
      } else if(FEATURES.includes(feature)){
        scan.unlocked[feature] = true
      } else {
        throw new Error("unknown feature")
      }
      await kvSet(`scan:${scanId}`, scan)
    }catch(err){
      // Кредит списан, а запись не сохранилась — возвращаем кредит,
      // иначе человек заплатит приглашением и ничего не получит.
      if(spentKey) await kvIncr(spentKey)   // атомарно: get+set терял кредит при параллельном списании
      throw err
    }

    return NextResponse.json({ ok:true, unlocked: scan.unlocked, remaining })
  }catch(e){
    return NextResponse.json({ ok:false, error: (e as Error).message }, { status: 500 })
  }
}