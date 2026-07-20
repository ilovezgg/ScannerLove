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
        {role:"system", content:"Ты - Love Scanner, 22 года, 2M в тиктоке про отношения. Дерзкая подруга, пишешь по-русски сленгом зумеров. Видишь людей насквозь. Никогда не пишешь общие фразы."},
        {role:"user", content:[
          {type:"text", text: prompt},
          {type:"image_url", image_url:{url:p1}},
          {type:"image_url", image_url:{url:p2}},
        ]}
      ],
      max_tokens: 1500,
      temperature: 1.15,
      top_p: 0.95
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
    const { photo1, photo2, type="short", extra="" } = await req.json()
    let prompt=""

        if(type==="short"){
      prompt = `Тебе скинули 2 фото парня и девушки. Напиши 1 абзацем как они смотрятся вместе со стороны, общий вайб пары.

НЕ ПИШИ структуру Вайб/Химия/Статус/Совет. НЕ ПИШИ проценты влюбленности.
Пиши просто живой текст 500-700 символов, как подруга в тг: как смотритесь, подходите ли, что за пара, рофл.

ЗАПРЕЩЕНО: энергетика, потенциал, покорить мир, дополняют друг друга, боссы, править миром, сошел с обложки.

ПРИМЕР СТИЛЯ:
"Вы смотритесь как будто он тебя украл из модельного агентства. Он весь на пафосе в черном, ты вся такая правильная в белом, вместе - дорого. Сразу видно кто тут главный, но он тебя явно боится. Пара на миллион, люди оборачиваются."

Теперь так же про ЭТИ 2 фото. Верни JSON {"percent": 78-94, "full": "твой текст одним абзацем"}` 
    } else if(type==="deep"){
      prompt = `Ты психолог с черным юмором. Доп инфа: ${extra}. 2 фото.
JSON {"percent": число, "full": "🧠 ПСИХОПОРТРЕТЫ: он/ты по фото\\n\\n💔 ДИНАМИКА\\n\\n🚩 РЕД ФЛАГИ\\n\\n🔮 ЧТО У НЕГО В ГОЛОВЕ\\n\\n📈 ПРОГНОЗ\\n\\n✅ ЧТО ДЕЛАТЬ"} 1300+ символов, дерзко, конкретно по фото, без запрещенок выше.`
    } else {
      prompt = `Ты сексолог 18+ с юмором. Доп: ${extra}. 2 фото.
JSON {"percent": число, "full": "🔥 ХИМИЯ:\\n🛏️ В ПОСТЕЛИ:\\n❤️ КТО ВЛЮБЛЕН СИЛЬНЕЕ:\\n🎯 СОВЕТ:"} 800+ символов, горячо, конкретно по фото.`
    }

    const models = [
      "z-ai/glm-4.6v",
      "z-ai/glm-4.5v",
      "minimax/minimax-m2.1",
      "qwen/qwen3-vl-35b-a3b-instruct",
      "moonshotai/kimi-k2-0905",
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
    return NextResponse.json({percent:84, full:"Вайб: Смотритесь как пара из тиктока - разные но вместе\\n\\nХимия: Он залип, ты морозишь\\n\\nСтатус: Он на 83%, ты на 51%\\n\\nСовет: Кинь ему в 22:13 'забери меня'"})
  }
}