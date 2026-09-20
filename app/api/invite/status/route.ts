import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'
import { INVITES_PER_REWARD } from '@/lib/pricing'

export const runtime = "nodejs"

export async function GET(req: NextRequest){
  const user = authUserOrDev(req)
  if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userId = user.id

  const count = (await kvGet<number>(`ref:count:${userId}`)) || 0
  const credits = (await kvGet<number>(`ref:credits:${userId}`)) || 0
  const toNextReward = INVITES_PER_REWARD - (count % INVITES_PER_REWARD)

  return NextResponse.json({ count, credits, invitesPerReward: INVITES_PER_REWARD, toNextReward })
}