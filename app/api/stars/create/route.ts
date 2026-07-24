// ПОЛОЖИТЬ СЮДА: app/api/stars/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getEventById, isEventCurrentlyActive } from '@/lib/events'
import { authUserOrDev } from '@/lib/telegram-auth'
import { isSubscriber, getSubscription } from '@/lib/entitlements'
import { PRICES, CATALOG, SUB_PERIOD_SEC, type Feature } from '@/lib/pricing'

export const runtime = "nodejs"

const BOT_TOKEN = process.env.BOT_TOKEN!

export async function POST(req: NextRequest){
  try{
    // userId больше НЕ берём из тела запроса. Раньше его можно было
    // подставить любой и оформить покупку на чужой аккаунт.
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "Открой приложение через бота" }, { status: 401 })
    const userId = user.id

    const { feature, eventId, scanId } = await req.json() as {
      feature: Feature
      eventId?: string
      scanId?: string
    }

    let title: string, desc: string, finalPrice: number
    let subscriptionPeriod: number | undefined

    if(feature === "seasonal"){
      if(!eventId || !isEventCurrentlyActive(eventId)){
        return NextResponse.json({ error: "Этот разбор сейчас недоступен" }, { status: 403 })
      }
      const event = getEventById(eventId)!
      title = event.title
      desc = event.bannerText
      finalPrice = event.price

    } else if(feature === "sub"){
      // Повторная подписка при активной — деньги на ветер, лучше сразу сказать.
      if(await isSubscriber(userId)){
        const sub = await getSubscription(userId)
        return NextResponse.json({
          error: "Подписка уже активна",
          until: sub?.until,
        }, { status: 409 })
      }
      title = CATALOG.sub.title
      desc = CATALOG.sub.desc
      finalPrice = PRICES.sub.now
      subscriptionPeriod = SUB_PERIOD_SEC

    } else {
      const entry = CATALOG[feature as keyof typeof CATALOG]
      const price = PRICES[feature as keyof typeof PRICES]
      if(!entry || !price) return NextResponse.json({ error: "unknown feature" }, { status: 400 })
      // Разовые покупки привязаны к конкретному скану — без него вебхук
      // не поймёт, что именно открывать.
      if(feature !== "conversation" && !scanId){
        return NextResponse.json({ error: "no scanId" }, { status: 400 })
      }
      title = entry.title
      desc = entry.desc
      finalPrice = price.now
    }

    // payload ≤ 128 байт по требованию Telegram — держим его коротким.
    const payload = JSON.stringify({
      t: feature,
      u: userId,
      s: scanId || undefined,
      e: eventId || undefined,
    })
    if(Buffer.byteLength(payload, "utf8") > 128){
      return NextResponse.json({ error: "payload too long" }, { status: 400 })
    }

    const invoiceBody: Record<string, unknown> = {
      title,
      description: desc,
      payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: title, amount: finalPrice }],
    }
    // Подписка отличается от разовой покупки ровно одним полем.
    // Telegram принимает только 2592000; другое значение вернёт ошибку.
    if(subscriptionPeriod) invoiceBody.subscription_period = subscriptionPeriod

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(invoiceBody),
    })
    const data = await tgRes.json()
    if(!data.ok) return NextResponse.json({ error: data.description }, { status: 500 })
    return NextResponse.json({ invoiceLink: data.result })

  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}