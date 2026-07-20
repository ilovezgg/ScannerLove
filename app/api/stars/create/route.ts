import { NextRequest, NextResponse } from 'next/server'
const BOT_TOKEN = process.env.BOT_TOKEN!

const MAP = {
  deep: { title: "Глубокий разбор", desc: "Мысли и ред флаги" },
  sex: { title: "18+", desc: "Постель" },
  kids: { title: "Дети", desc: "AI фото" },
} as const

export async function POST(req: NextRequest){
  const { stars, feature, userId } = await req.json() as { stars:number, feature: keyof typeof MAP, userId: number }
  const payload = JSON.stringify({type: feature, userId})
  const { title, desc } = MAP[feature]?? MAP.deep

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ title, description: desc, payload, provider_token:"", currency:"XTR", prices:[{label:title, amount:Number(stars)}] })
  })
  const data = await tgRes.json()
  if(!data.ok) return NextResponse.json({error: data.description}, {status:500})
  return NextResponse.json({invoiceLink: data.result})
}