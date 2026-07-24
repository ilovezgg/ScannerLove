// ПОЛОЖИТЬ СЮДА: app/api/subscription/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authUserOrDev } from '@/lib/telegram-auth'
import { getSubscription } from '@/lib/entitlements'
import { kvGet } from '@/lib/kv'

export const runtime = "nodejs"

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ active: false })

  const sub = await getSubscription(user.id)
  const active = !!sub && sub.until > Date.now()
  const convCredits = (await kvGet<number>(`conv_credit:${user.id}`)) || 0

  return NextResponse.json({
    active,
    until: sub?.until ?? null,
    cancelled: !!sub?.cancelled,
    renewals: sub?.renewals ?? 0,
    conversationCredits: convCredits,
  })
}