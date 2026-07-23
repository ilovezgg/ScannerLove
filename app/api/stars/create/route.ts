// ПОЛОЖИТЬ СЮДА: app/api/stars/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getEventById, isEventCurrentlyActive } from '@/lib/events'
const BOT_TOKEN = process.env.BOT_TOKEN!

const MAP = {
  deep:    { title: "Глубокий разбор",      desc: "Мысли, ред флаги, что делать" },
  hidden:  { title: "Что он(а) скрывает",   desc: "Скрытые эмоции по языку тела" },
  future:  { title: "Будущее",              desc: "Свадьба или расставание" },
  bundle:  { title: "Полный доступ",        desc: "Все разборы сразу" },
  custom:  { title: "Спроси что угодно",    desc: "Личный вопрос про эту пару" },
} as const

// Канонические цены — ЕДИНСТВЕННЫЙ источник правды. Если меняете цену в
// page.tsx (PRICES), меняйте и здесь — они должны совпадать, иначе одна из
// сторон покажет неправильную цифру пользователю до оплаты.
const CANONICAL_PRICES: Record<string, number> = {
  deep: 27,
  hidden: 20,
  future: 40,
  bundle: 49,
  custom: 35,
}

export async function POST(req: NextRequest){
  try{
    const { feature, userId, eventId } = await req.json() as {
      stars?: number // намеренно игнорируется — см. комментарий ниже
      feature: string
      userId: number
      eventId?: string
    }
    if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

    let title: string, desc: string, finalPrice: number

    if(feature === "seasonal"){
      if(!eventId || !isEventCurrentlyActive(eventId)){
        return NextResponse.json({ error: "Этот разбор сейчас недоступен" }, { status: 403 })
      }
      const event = getEventById(eventId)!
      title = event.title
      desc = event.bannerText
      finalPrice = event.price
    } else {
      const entry = MAP[feature as keyof typeof MAP]
      if(!entry || !(feature in CANONICAL_PRICES)){
        return NextResponse.json({ error: "unknown feature" }, { status: 400 })
      }
      title = entry.title
      desc = entry.desc
      finalPrice = CANONICAL_PRICES[feature]
    }

    const payload = JSON.stringify({ type: feature, userId, eventId: eventId || undefined })

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,{
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ title, description: desc, payload, provider_token:"", currency:"XTR", prices:[{label:title, amount:finalPrice}] })
    })
    const data = await tgRes.json()
    if(!data.ok) return NextResponse.json({error: data.description}, {status:500})
    return NextResponse.json({invoiceLink: data.result})
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}