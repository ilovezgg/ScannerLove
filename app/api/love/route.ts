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

async function callOR(model: string, prompt: string, p1: string, p2: string){
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if(!p1 ||!p2) throw new Error("empty photo")
  console.log(`TRY ${model} photos: ${p1.length} / ${p2.length}`)
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization": `Bearer ${key}`,
      "Content-Type":"application/json",
    },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content:"Отвечай ТОЛЬКО валидным JSON: {\"percent\": 85, \"full\": \"текст\"}. Никакого текста вне JSON."},
        {role:"user", content:[
          {type:"text", text: prompt},
          {type:"image_url", image_url:{url:p1}},
          {type:"image_url", image_url:{url:p2}},
        ]}
      ],
      max_tokens: 1500,
      temperature: 0.8,
    })
  })
  const raw = await res.text()
  console.log(`${model} ${res.status} ${raw.slice(0,1200)}`)
  if(!res.ok) throw new Error(raw.slice(0,500))
  const data = JSON.parse(raw)
  const content = data?.choices?.[0]?.message?.content || ""
  const j = extractJson(content)
  if(!j) throw new Error("no json "+content.slice(0,300))
  return j
}

export async function POST(req: NextRequest){
  try{
    const { photo1, photo2, type="short", extra="", salt="" } = await req.json()
    if(!photo1 ||!photo2) return NextResponse.json({percent:84, full:"Добавь обе фотки заново"}, {status:400})

    const safeExtra = (extra||"").slice(0,600) // режешь простыню про Матвея

    let prompt=""
    if(type==="short"){
      prompt = `2 фото пары. СИД ${salt||Date.now()}. 1 абзац 500 символов дерзко как подруга. Верни JSON {"percent": 85, "full": "твой текст"}`
    } else if(type==="deep"){
      prompt = `Доп инфа: ${safeExtra}. 2 фото пары. Верни JSON {"percent": 82, "full": "🧠 ПСИХОПОРТРЕТЫ:\\n💔 ДИНАМИКА:\\n🚩 РЕД ФЛАГИ:\\n🔮 ЧТО У НЕГО:\\n📈 ПРОГНОЗ:\\n✅ ЧТО ДЕЛАТЬ"} 1100+ символов`
    } else {
      prompt = `2 фото. JSON {"percent": 88, "full": "🔥 ХИМИЯ:\\n🛏 В ПОСТЕЛИ:\\n❤ КТО ВЛЮБЛЕН:\\n🎯 СОВЕТ:"}`
    }

    // только рабочие вижн модели
    const models = [
      "qwen/qwen-2.5-vl-72b-instruct",
      "google/gemini-flash-1.5",
      "z-ai/glm-4.6v"
    ]

    for(const m of models){
      try{ const r = await callOR(m, prompt, photo1, photo2); if(r?.percent) return NextResponse.json(r) }catch(e){ console.error(`FAIL ${m}`, e); continue }
    }
    throw new Error("all dead")
  }catch(e){
    console.error("ALL FAILED", e)
    return NextResponse.json({percent:84, full:"Вы смотритесь как пара с корпоратива которая спалилась. Он серьезный, ты его сдаешь взглядом."})
  }
}