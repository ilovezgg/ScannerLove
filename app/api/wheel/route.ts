// ПОЛОЖИТЬ СЮДА: app/api/wheel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr, kvIncrTtl } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

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
  { id: "ref_credit", weight: 25, label: "+1 бесплатная разблокировка (как за приглашения) 🎁", type: "ref_credit" },
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
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const spun = await kvGet<{ prizeId: string, label: string }>(`wheel:${user.id}:${todayKey()}`)
  return NextResponse.json({ spunToday: !!spun, prize: spun || null })
}

// POST — крутит колесо один раз в сутки, применяет эффект приза
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const userId = user.id

    const key = `wheel:${userId}:${todayKey()}`
    const already = await kvGet<{ prizeId: string, label: string }>(key)
    if(already) return NextResponse.json({ ok: true, alreadySpun: true, prize: already })

    // Слот занимаем атомарно ДО выдачи приза. Раньше get, затем выдача, затем set: двадцать
    // параллельных запросов проходили проверку и каждый начислял кредит.
    if(await kvIncrTtl(`wheel:lock:${userId}:${todayKey()}`, 90_000) > 1){
      return NextResponse.json({ ok: true, alreadySpun: true, prize: (await kvGet(key)) || null })
    }

    const prize = pickPrize()

    if(prize.type === "ref_credit") await kvIncr(`ref:credits:${userId}`)
    if(prize.type === "free_custom") await kvIncr(`custom:free_credit:${userId}`)

    const result = { prizeId: prize.id, label: prize.label }
    await kvSet(key, result)

    return NextResponse.json({ ok: true, alreadySpun: false, prize: result })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}