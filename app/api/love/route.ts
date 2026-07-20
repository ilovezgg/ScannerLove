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

async function callOR(model: string, prompt: string, p1: string, p2: string, max = 1800){
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if(!p1 ||!p2) throw new Error("empty photo")
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization": `Bearer ${key}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content:"Ты дерзкая подруга 22 года, психолог с черным юмором. Отвечаешь ТОЛЬКО валидным JSON {\"percent\": число, \"full\": \"текст\"}. Внутри full ОБЯЗАТЕЛЬНО пиши текст после каждого заголовка, никогда не оставляй пустой заголовок."},
        {role:"user", content:[
          {type:"text", text: prompt},
          {type:"image_url", image_url:{url:p1}},
          {type:"image_url", image_url:{url:p2}},
        ]}
      ],
      max_tokens: max,
      temperature: 0.9,
    })
  })
  const raw = await res.text()
  if(!res.ok) throw new Error(raw.slice(0,800))
  const data = JSON.parse(raw)
  const content = data?.choices?.[0]?.message?.content || ""
  const j = extractJson(content)
  if(!j?.percent ||!j?.full) throw new Error("no json "+content.slice(0,500))
  if(j.full.length < 200) throw new Error("too short "+content.slice(0,500))
  return j
}

export async function POST(req: NextRequest){
  try{
    const { photo1, photo2, type="short", extra="", salt="" } = await req.json()
    if(!photo1 ||!photo2) return NextResponse.json({percent:84, full:"Добавь обе фотки заново"}, {status:400})
    const safeExtra = (extra||"").slice(0,700)

    let prompt = ""
    if(type==="short"){
      prompt = `2 фото пары. СИД ${salt||Date.now()}. Твоя задача: мини-разбор но МЯСНОЙ.
Верни JSON {"percent": 71-94 рандом, "full": "1 абзац 650-800 символов. Дерзко, как подруга в личке, с черным юмором. Оцени химию по фото, кто кого хочет сильнее, кто ревнует, есть ли будущее. Без заголовков, просто поток. Используй сленг, но умно."}`
    } else if(type==="deep"){
      prompt = `Доп инфа от юзера: ${safeExtra}
2 фото пары. СИД ${salt||Date.now()}.

Верни JSON {"percent": 70-93, "full": "текст по шаблону НИЖЕ, ОБЯЗАТЕЛЬНО заполни каждый пункт 3-4 предложениями, минимум 1300 символов всего:"}

Шаблон для поля full:
🧠 ПСИХОПОРТРЕТЫ:
[Про нее: характер по лицу, ее триггеры, как любит. Про него: его травмы, как показывает любовь, его тип привязанности. 4-5 предложений]

💔 ДИНАМИКА:
[Кто тащит общение, кто тащит встречи, баланс власти, почему у них недоотношения, что держит]

🚩 РЕД ФЛАГИ:
[2-3 конкретных ред флага у него и у нее по фото и по инфе]

🔮 ЧТО У НЕГО В ГОЛОВЕ:
[Честно, как будто ты читаешь его мысли - любит ли, боится ли, френдзонит ли]

📈 ПРОГНОЗ НА МЕСЯЦ:
[Что будет если ничего не менять и если сделать шаг]

✅ ЧТО ДЕЛАТЬ:
[2-3 конкретных дерзких совета что написать/сделать, без воды]

Пиши живо, без морализаторства.`
    } else if(type==="sex"){
      prompt = `2 фото пары. СИД ${salt||Date.now()}.
Верни JSON {"percent": 78-96, "full": "текст по шаблону, КАЖДЫЙ пункт 3 предложения минимум, всего 800-1000 символов, грязно но умно:"}

Шаблон для full:
🔥 ХИМИЯ:
[Насколько их тянет физически по фото, искра есть или нет, кто кого сожрет взглядом]

🛏 В ПОСТЕЛИ:
[Кто доминант, какая поза их, что любят, темп, нежности или жестко]

❤ КТО ВЛЮБЛЕН СИЛЬНЕЕ:
[Кто больше втрескался по глазам и языку тела]

🎯 СОВЕТ:
[2 конкретных совета что попробовать чтобы снесло крышу]

Без цензуры, но без порнухи. 18+`
    } else if(type==="kids"){
      prompt = `2 фото пары. СИД ${salt||Date.now()}.
Верни JSON {"percent": 80-95, "full": "шаблон про детей, каждый пункт 2-3 предложения, 700+ символов:"}

Шаблон для full:
👶 КАКИЕ БУДУТ ДЕТИ:
[На кого похожи, характер, сколько детей по энергии пары]

👨‍👩‍👧 БУДЕТЕ ЛИ ХОРОШИМИ РОДИТЕЛЯМИ:
[Кто какой родитель по фото]

🧬 ОТ КОГО ЧТО ВОЗЬМУТ:
[Глаза, характер, харизма от кого]

🔮 КОГДА:
[Когда по их динамике лучше заводить]`
    }

    const models = [
      "qwen/qwen-2.5-vl-72b-instruct",
      "google/gemini-flash-1.5",
      "qwen/qwen-2-vl-72b-instruct"
    ]

    const maxTokens = type==="deep"? 2200 : 1500
    for(const m of models){
      try{
        console.log(`TRY ${m} type=${type}`)
        const r = await callOR(m, prompt, photo1, photo2, maxTokens)
        if(r.percent) return NextResponse.json(r)
      }catch(e){ console.error(`FAIL ${m}`, e); continue }
    }
    throw new Error("all dead")
  }catch(e){
    console.error("ALL FAILED", e)
    return NextResponse.json({percent:84, full:"Вы смотритесь как пара с корпоратива которая спалилась. Он серьезный, ты его сдаешь взглядом. Химия есть, но ты накручиваешь, а он морозится. Поговорите нормально."})
  }
}