import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr } from '@/lib/kv'

const INVITES_PER_REWARD = 3

// POST { referrerId, newUserId } — call this once, right after the INVITED
// user's first successful check() (not on app open!), so a referral only
// counts once someone actually engaged, not just tapped a link.
export async function POST(req: NextRequest){
  try{
    const { referrerId, newUserId } = await req.json()
    if(!referrerId || !newUserId) return NextResponse.json({ error: "missing ids" }, { status: 400 })
    if(String(referrerId) === String(newUserId)) return NextResponse.json({ error: "self-referral" }, { status: 400 })

    const creditedKey = `ref:credited:${newUserId}`
    const already = await kvGet<boolean>(creditedKey)
    if(already) return NextResponse.json({ ok: true, alreadyCredited: true })

    await kvSet(creditedKey, true)
    const count = await kvIncr(`ref:count:${referrerId}`)

    let newReward = false
    if(count % INVITES_PER_REWARD === 0){
      await kvIncr(`ref:credits:${referrerId}`)
      newReward = true
    }

    return NextResponse.json({ ok: true, count, newReward })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}