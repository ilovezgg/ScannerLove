// ПОЛОЖИТЬ СЮДА: app/api/similar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { kvListPush, kvListAll } from '@/lib/kv'

const CAP_PER_BUCKET = 40 // сколько последних отрывков храним на дециль — держит выборку свежей и быстрой

function bucketOf(percent: number){
  return Math.max(0, Math.min(90, Math.floor(percent / 10) * 10))
}

// POST { percent, snippet, mode } — вызывается после каждого бесплатного
// скана. snippet — короткий обрывок уже показанного пользователю текста
// (не больше ~100 символов), никаких userId/фото/личных вопросов сюда не попадает.
export async function POST(req: NextRequest){
  try{
    const { percent, snippet, mode="couple" } = await req.json()
    if(typeof percent !== "number" || !snippet) return NextResponse.json({ error: "bad input" }, { status: 400 })
    const safeSnippet = String(snippet).slice(0, 120)
    const bucket = bucketOf(percent)
    await kvListPush(`similar:${bucket}`, { snippet: safeSnippet, mode, ts: Date.now() }, CAP_PER_BUCKET)
    return NextResponse.json({ ok: true })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// GET ?percent=X&mode=Y — отдаёт 3 случайных анонимных отрывка из того же
// дециля (например 70-79%). Если в своём дециле мало данных — берёт соседний.
export async function GET(req: NextRequest){
  try{
    const percent = Number(req.nextUrl.searchParams.get("percent"))
    const mode = req.nextUrl.searchParams.get("mode") || "couple"
    if(Number.isNaN(percent)) return NextResponse.json({ error: "bad percent" }, { status: 400 })

    const bucket = bucketOf(percent)
    let items = await kvListAll<{snippet:string, mode:string, ts:number}>(`similar:${bucket}`)

    // мало данных в своём дециле — подмешиваем соседние, чтобы не показывать пустоту
    if(items.length < 3){
      const neighborUp = await kvListAll<{snippet:string, mode:string, ts:number}>(`similar:${Math.min(90, bucket+10)}`)
      const neighborDown = await kvListAll<{snippet:string, mode:string, ts:number}>(`similar:${Math.max(0, bucket-10)}`)
      items = [...items, ...neighborUp, ...neighborDown]
    }

    // предпочитаем тот же режим (пара/краш/друг), но не жёстко — если не хватает, берём любые
    const sameMode = items.filter(i => i.mode === mode)
    const pool = sameMode.length >= 3 ? sameMode : items

    const shuffled = pool.sort(() => Math.random() - 0.5)
    const picked = shuffled.slice(0, 3).map(i => i.snippet)

    return NextResponse.json({ items: picked, bucket })
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}