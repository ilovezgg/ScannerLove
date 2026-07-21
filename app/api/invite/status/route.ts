import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/kv'

const INVITES_PER_REWARD = 3

export async function GET(req: NextRequest){
  const userId = req.nextUrl.searchParams.get("userId")
  if(!userId) return NextResponse.json({ error: "no userId" }, { status: 400 })

  const count = (await kvGet<number>(`ref:count:${userId}`)) || 0
  const credits = (await kvGet<number>(`ref:credits:${userId}`)) || 0
  const toNextReward = INVITES_PER_REWARD - (count % INVITES_PER_REWARD)

  return NextResponse.json({ count, credits, invitesPerReward: INVITES_PER_REWARD, toNextReward })
}