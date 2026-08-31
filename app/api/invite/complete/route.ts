import { NextRequest, NextResponse } from 'next/server'
import { kvGet, kvSet, kvIncr, kvSadd } from '@/lib/kv'
import { authUserOrDev } from '@/lib/telegram-auth'

export const runtime = "nodejs"

const INVITES_PER_REWARD = 3

// POST { referrerId } — call this once, right after the INVITED
// user's first successful check() (not on app open!), so a referral only
// counts once someone actually engaged, not just tapped a link.
// newUserId приходит НЕ из тела, а из подписанного initData — иначе можно
// было накрутить себе рефералов бесконечными фейковыми newUserId.
export async function POST(req: NextRequest){
  try{
    const user = authUserOrDev(req)
    if(!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const newUserId = user.id

    const { referrerId } = await req.json()
    if(!referrerId) return NextResponse.json({ error: "missing ids" }, { status: 400 })
    if(String(referrerId) === String(newUserId)) return NextResponse.json({ error: "self-referral" }, { status: 400 })

    const creditedKey = `ref:credited:${newUserId}`
    const already = await kvGet<boolean>(creditedKey)
    if(already) return NextResponse.json({ ok: true, alreadyCredited: true })

    await kvSet(creditedKey, true)
    const count = await kvIncr(`ref:count:${referrerId}`)
    await kvSadd("ref:referrers", String(referrerId)) // для лидерборда — множество всех, у кого есть хоть 1 реферал

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