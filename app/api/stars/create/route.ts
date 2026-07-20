import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30

function extractJson(text: string){
  if(!text) return null
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi,"").trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if(m) t = m[1]
  const s = t.indexOf("{")
  if(s===-1) return null
  let d=0
  for(let i=s;i<t.length;i++){
    if(t[i]==="{") d++
    if(t[i]==="}") d--
    if(d===0){ try{ return JSON.parse(t.slice(s,i+1)) }catch{ continue } }
  }
  return null
}

async function callOpenRouter(model: string, prompt: string, p1: string, p2: string){
  console.log(`TRY OR: ${model}`)
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type":"application/json",
      "HTTP-Referer":"https://love-scanner.app",
      "X-Title":"Love Scanner"
    },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content:"Ты - Love Scanner, 22 года, 2M в тиктоке. Дерзкая подруга, пишешь по-русски, сленг зумеров. Никогда не пишешь общие фразы."},
        {role:"user", content:[
          {type:"text", text: prompt},
          {type:"image_url", image_url:{url:p1}},
          {type:"image_url", image_url:{url:p2}},
        ]}
      ],
      max_tokens: 1500,
      temperature: 1.28,
      top_p: 0.98
    })
  })
  const raw = await res.text()
  console.log(`${model} RAW:`, raw.slice(0,1200))
  const data = JSON.parse(raw)
  const content = data?.choices?.[0]?.message?.content || ""
  console.log(`${model} TEXT:`, content.slice(0,1000))
  const j = extractJson(content)
  if(!j) throw new Error(`no json ${content.slice(0,400)}`)
  return j
}

export async function POST(req: NextRequest){
  try{
    const { photo1, photo2, type="short", extra="", salt="" } = await req.json()
    let prompt=""

    if(type==="short"){
      const ANGLES = [
        "Опиши через рост/возраст/кто выше/кто доминирует на фото",
        "Опиши как будто они коллеги которые спалились",
        "Опиши как будто они познакомились 5 минут назад на этой фотке",
        "Разъеби с юмором, найди 1 мелкий косяк на фото и пошути",
        "Опиши только язык тела: руки, дистанция, взгляды",
        "Опиши как кадр из фильма - что за фильм и кто они там",
        "Опиши как бывшие которые встретились случайно",
        "Опиши как будто ты их мама - что скажешь"
      ]
      const angle = ANGLES[Math.floor(Math.random()*ANGLES.length)]
      const nonce = salt || Math.random().toString(36).slice(2,7)

      prompt = `2 фото пары. СИД: ${nonce}
УГОЛ СЕГОДНЯ: ${angle}

Задача: 1 абзац 500-650 символов как подруга в тг. Живо, без воды.

ЗАПРЕЩЕНО: Old Money, олд мани, люкс, дорого, статусно, Forbes, бизнес-ланч, закрытый клуб, сделка, Pinterest, эстетика, вайб дорогого, сошел с обложки, боссы, править миром, покорить мир, энергетика, потенциал.

ПРАВИЛО: Не пиши каждый раз про одежду. Смотри на позы, руки, кто к кому ближе, кто смотрит куда.

Верни JSON {"percent": 78-94, "full": "твой текст одним абзацем"}`
    } else if(type==="deep"){
      prompt = `Ты психолог с черным юмором. Доп инфа: ${extra}. 2 фото.
JSON {"percent": число, "full": "🧠 ПСИХОПОРТРЕТЫ:\\n💔 ДИНАМИКА:\\n🚩 РЕД ФЛАГИ:\\n🔮 ЧТО У НЕГО В ГОЛОВЕ:\\n📈 ПРОГНОЗ:\\n✅ ЧТО ДЕЛАТЬ"} 1300+ символов, дерзко, конкретно по фото.`
    } else {
      prompt = `Ты сексолог 18+ с юмором. Доп: ${extra}. 2 фото.
JSON {"percent": число, "full": "🔥 ХИМИЯ:\\n🛏 В ПОСТЕЛИ:\\n❤ КТО ВЛЮБЛЕН СИЛЬНЕЕ:\\n🎯 СОВЕТ:"} 800+ символов, горячо, конкретно по фото.`
    }

    const models = [
      "z-ai/glm-4.6v",
      "z-ai/glm-4.5v",
      "qwen/qwen2.5-vl-72b-instruct",
    ]

    for(const m of models){
      try{
        const r = await callOpenRouter(m, prompt, photo1, photo2)
        if(r?.percent) return NextResponse.json(r)
      }catch(e){ console.error(`FAIL ${m}`, e); continue }
    }
    throw new Error("all dead")
  }catch(e){
    console.error("ALL FAILED", e)
    return NextResponse.json({percent:84, full:"Вы смотритесь как пара с корпоратива которая спалилась что встречается. Он делает вид что серьезный, ты его сдаешь взглядом."})
  }
}