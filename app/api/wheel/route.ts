// ПОЛОЖИТЬ СЮДА: app/api/wheel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr } from '@/lib/kv'

function todayKey(){
  return new Date().toISOString().slice(0,10)
}

// Взвешенные призы. ВАЖНО: намеренно НЕ даём денежные скидки на покупки —
// эту систему мы недавно убрали целиком, колесо её не восстанавливает.
// Вместо этого — то, что либо ничего не стоит (флэйвор-текст), либо уже
// существующая дешёвая валюта (реферальный кредит), либо разовый бесплатный
// доступ к одной конкретной фиче.
const PRIZES = [
  { id: "flavor1", weight: 25, label: "Сегодня звёзды на твоей стороне ✨", type: "flavor" },
  { id: "flavor2", weight: 25, label: "Что-то важное произойдёт до заката 🌙", type: "flavor" },
  { id: "ref_credit", weight: 25, label: "+1 бесплатная разблокировка (как за 3 приглашения) 🎁", type: "ref_credit" },
  { id: "free_custom", weight: 15, label: "Бесплатный вопрос \"Спроси что угодно\" на следующий скан 💌", type: "free_custom" },
  { id: "flavor3", weight: 10, label: "Сегодня хороший день, чтобы написать первым(ой) 📩", type: "flavor" },
] as const

function pickPrize(){
  const total = PRIZES.reduce((s,p)=>s+p.weight, 0)
  let r = Math.random() * total
  for(const p of PRIZES){
    if(r < p.weight) return p
    r -= p.weight
  }
  return PRIZES[0]
}

// GET ?userId= — уже крутил(а) сегодня? Отдаёт прошлый приз, если да.
export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })
  const spun = await kvGet<{ prizeId: string, label: string }>(`wheel:${userId}:${todayKey()}`)
  return NextResponse.json({ spunToday: !!spun, prize: spun || null })
}

// POST { userId } — крутит колесо один раз в сутки, применяет эффект приза
export async function POST(req: NextRequest){
  try{
    const { userId } = await req.json()
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

    const key = `wheel:${userId}:${todayKey()}`
    const already = await kvGet<{ prizeId: string, label: string }>(key)
    if(already) return NextResponse.json({ ok: true, alreadySpun: true, prize: already })

    const prize = pickPrize()

    if(prize.type === "ref_credit") await kvIncr(`ref:credits:${userId}`)
    if(prize.type === "free_custom") await kvSet(`custom:free_credit:${userId}`, true)

    const result = { prizeId: prize.id, label: prize.label }
    await kvSet(key, result)

    return NextResponse.json({ ok: true, alreadySpun: false, prize: result })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}