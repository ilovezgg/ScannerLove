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
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY?.trim()}`,
      "Content-Type":"application/json",
    },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content:"Ты - Love Scanner, 22 года, 2M в тиктоке про отношения. Дерзкая подруга, пишешь по-русски сленгом зумеров. Видишь людей насквозь. Никогда не пишешь общие фразы. Отвечай ТОЛЬКО валидным JSON."},
        {role:"user", content:[
          {type:"text", text: prompt},
          {type:"image_url", image_url:{url:p1}},
          {type:"image_url", image_url:{url:p2}},
        ]}
      ],
      max_tokens: 1500,
      temperature: 0.8,
      top_p: 0.9
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
      prompt = `Тебе скинули 2 фото парня и девушки. Напиши 1 абзацем как они смотрятся вместе со стороны, общий вайб пары. НЕ ПИШИ структуру Вайб/Химия/Статус/Совет. НЕ ПИШИ проценты влюбленности. Пиши просто живой текст 500-700 символов, как подруга в тг. Верни JSON {"percent": 78-94, "full": "твой текст одним абзацем"}`
    } else if(type==="deep"){
      prompt = `Ты психолог с черным юмором. Доп инфа: ${extra}. 2 фото. JSON {"percent": число, "full": "🧠 ПСИХОПОРТРЕТЫ:\\n\\n💔 ДИНАМИКА\\n\\n🚩 РЕД ФЛАГИ\\n\\n🔮 ЧТО У НЕГО В ГОЛОВЕ\\n\\n📈 ПРОГНОЗ\\n\\n✅ ЧТО ДЕЛАТЬ"} 1300+ символов, дерзко, конкретно по фото.`
    } else {
      prompt = `Ты сексолог 18+ с юмором. Доп: ${extra}. 2 фото. JSON {"percent": число, "full": "🔥 ХИМИЯ:\\n🛏 В ПОСТЕЛИ:\\n❤ КТО ВЛЮБЛЕН СИЛЬНЕЕ:\\n🎯 СОВЕТ:"} 800+ символов, горячо, конкретно по фото.`
    }

    const models = [
      "qwen/qwen2.5-vl-72b-instruct",
      "qwen/qwen3-vl-35b-a3b-instruct",
      "z-ai/glm-4.6v",
      "minimax/minimax-m2.1",
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
    return NextResponse.json({percent:84, full:"Смотритесь как пара из тиктока - разные но вместе.\n\nОн залип, ты морозишь.\n\nОн на 83%, ты на 51%.\n\nКинь ему в 22:13 'забери меня'"})
  }
}