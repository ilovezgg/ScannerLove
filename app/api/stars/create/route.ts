import { NextRequest, NextResponse } from 'next/server'
const BOT_TOKEN = process.env.BOT_TOKEN!

export async function POST(req: NextRequest){
  const { stars, feature, userId } = await req.json()
  const payload = JSON.stringify({type: feature, userId})
  const map: any = { deep: ["Глубокий разбор","Мысли и ред флаги"], sex: ["18+","Постель"], kids: ["Дети","AI фото"] }
  const [title, desc] = map[feature] || map.deep
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ title, description: desc, payload, provider_token:"", currency:"XTR", prices:[{label:title, amount:Number(stars)}] })
  })
  const data = await tgRes.json()
  if(!data.ok) return NextResponse.json({error: data.description}, {status:500})
  return NextResponse.json({invoiceLink: data.result})
}