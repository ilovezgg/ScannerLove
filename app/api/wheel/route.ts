// ПОЛОЖИТЬ СЮДА: app/api/wheel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr, kvLock, kvDel } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { reqLang, type Lang } from '@/lib/i18n'

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

// Подпись приза отдаём на языке того, кто смотрит, по prizeId: в KV лежит русская (старые записи).
const LABELS_EN: Record<string, string> = {
  flavor1: "The stars are on your side today ✨",
  flavor2: "Something important will happen before sunset 🌙",
  ref_credit: "+1 free unlock (same as for invites) 🎁",
  free_custom: "Free \"Ask anything\" question on your next scan 💌",
  flavor3: "A good day to text first 📩",
}
function localize(prize: { prizeId: string, label: string } | null, lang: Lang){
  if(!prize || lang !== "en") return prize
  return { ...prize, label: LABELS_EN[prize.prizeId] ?? prize.label }
}

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
  return NextResponse.json({ spunToday: !!spun, prize: localize(spun, reqLang(req, user)) })
}

// POST — крутит колесо один раз в сутки, применяет эффект приза
export async function POST(req: NextRequest){
  let lockKey: string | null = null
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const userId = user.id
    const lang = reqLang(req, user)

    const key = `wheel:${userId}:${todayKey()}`
    const already = await kvGet<{ prizeId: string, label: string }>(key)
    if(already) return NextResponse.json({ ok: true, alreadySpun: true, prize: localize(already, lang) })

    // Слот занимаем атомарно ДО выдачи приза. Раньше get, затем выдача, затем set: двадцать
    // параллельных запросов проходили проверку и каждый начислял кредит.
    const lk = `wheel:lock:${userId}:${todayKey()}`
    if(!await kvLock(lk, 90_000)){
      const prize = await kvGet<{ prizeId: string, label: string }>(key)
      // Лок занят, а приза нет: параллельный запрос ещё крутит. Не врём «уже крутил» с пустым призом.
      if(!prize) return NextResponse.json({ error: "in progress" }, { status: 409 })
      return NextResponse.json({ ok: true, alreadySpun: true, prize: localize(prize, lang) })
    }

    lockKey = lk

    // Сначала сохраняем приз, потом начисляем. Раньше было наоборот: сбой KV между шагами оставлял
    // лок занятым без записанного приза, и человек сутки видел колесо, которое ничего не делает.
    const prize = pickPrize()
    const result = { prizeId: prize.id, label: prize.label }
    await kvSet(key, result)
    lockKey = null   // приз записан: дальше лок не отпускаем, иначе можно крутить повторно

    // Приз уже записан, повторно крутить нельзя. Если начисление упало — один ретрай и громкий лог,
    // иначе награда теряется молча.
    const creditKey = prize.type === "ref_credit" ? `ref:credits:${userId}`
                    : prize.type === "free_custom" ? `custom:free_credit:${userId}` : null
    if(creditKey){
      try{ await kvIncr(creditKey) }
      catch{
        await kvIncr(creditKey).catch(err => console.error("WHEEL PRIZE LOST: credit not granted, add manually", creditKey, err))
      }
    }

    return NextResponse.json({ ok: true, alreadySpun: false, prize: localize(result, lang) })
  }catch(e){
    if(lockKey) await kvDel(lockKey).catch(()=>{})   // приз не записан: даём крутить ещё раз
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}