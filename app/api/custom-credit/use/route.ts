// ПОЛОЖИТЬ СЮДА: app/api/custom-credit/use/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const has = await kvGet<boolean>(`custom:free_credit:${user.id}`)
  return NextResponse.json({ hasCredit: !!has })
}