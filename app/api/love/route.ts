import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30

// Voice rewritten to be gender-neutral (works whether the reader is a guy or a girl —
// never assume, never address them as "детка"/"подруга"/etc) and less "AI-shaped":
// perfect symmetric structure and clean transitions are themselves a tell, so we
// explicitly ask for a bit of mess — uneven sentence length, a stray aside, the
// occasional trailing thought instead of a clean wrap-up.
const SYSTEM = `Ты — остроумный аналитик отношений с черным юмором, режешь правду без предисловий. НЕ обращайся к читателю по полу (никаких "детка", "подруга", "красавица", "бро" и т.п.) — читатель может быть кем угодно, обращайся нейтрально на "ты" по смыслу текста, а не по полу.

Отвечаешь ТОЛЬКО валидным JSON {"percent": число, "full": "текст"}. Внутри full ОБЯЗАТЕЛЬНО пиши текст после каждого заголовка, никогда не оставляй пустой заголовок. В тексте ОБЯЗАТЕЛЬНО упомяни минимум 2 конкретных визуальных детали с фото (одежда, выражение лица, фон, поза) — это доказывает, что ты реально смотрел(а) на именно эти фото, а не пишешь общими словами.

Стиль — живой, не как у бота:
- Не строй все предложения одинаковой длины и структуры. Пусть одно предложение будет длинным и вьющимся, следующее — короткое, рубленое.
- Разрешено (и приветствуется) один раз за текст вставить что-то как будто не по шаблону — случайное наблюдение, отступление, шпильку не в тему.
- Не заканчивай абзацы одинаково "выводом-моралью" каждый раз — иногда просто обрывай мысль, как будто отвлекся(лась).
- Избегай слов-паразитов ИИ-текста: "химия", "динамика", "стоит отметить", "в целом" — используй живую разговорную лексику вместо них где возможно.`

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

function dataUrlToBase64(url: string){
  const i = url.indexOf(",")
  return i===-1 ? url : url.slice(i+1)
}
function dataUrlMime(url: string){
  const m = url.match(/^data:([^;]+);/)
  return m ? m[1] : "image/jpeg"
}

// min length now depends on type — the free "short" teaser is intentionally
// brief (5 sentences), so it shouldn't be held to the same 200-char floor
// as the paid, template-based reports.
function validate(j: any, minLen = 200){
  if(!j?.percent || !j?.full) throw new Error("no json / missing fields")
  if(String(j.full).length < minLen) throw new Error("too short")
  return { percent: j.percent, full: j.full }
}

// ---- Primary: Gemini direct (Google AI Studio free tier) ----
async function callGemini(model: string, prompt: string, p1: string, p2: string, max: number, minLen = 200){
  const key = process.env.GEMINI_API_KEY?.trim()
  if(!key) throw new Error("no GEMINI_API_KEY")
  if(!p1 || !p2) throw new Error("empty photo")

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { mimeType: dataUrlMime(p1), data: dataUrlToBase64(p1) } },
        { inlineData: { mimeType: dataUrlMime(p2), data: dataUrlToBase64(p2) } },
      ],
    }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: max,
      responseMimeType: "application/json",
    },
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if(!res.ok) throw new Error(`gemini ${res.status}: ${raw.slice(0,500)}`)
  const data = JSON.parse(raw)
  const content = data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("") || ""
  const j = extractJson(content) ?? (()=>{ try{ return JSON.parse(content) }catch{ return null } })()
  return validate(j, minLen)
}

// ---- Fallback: OpenRouter vision models ----
async function callOR(model: string, prompt: string, p1: string, p2: string, max: number, minLen = 200){
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if(!key) throw new Error("no OPENROUTER_API_KEY")
  if(!p1 || !p2) throw new Error("empty photo")

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization": `Bearer ${key}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content: SYSTEM},
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
  if(!res.ok) throw new Error(`or ${model} ${res.status}: ${raw.slice(0,500)}`)
  const data = JSON.parse(raw)
  const content = data?.choices?.[0]?.message?.content || ""
  const j = extractJson(content)
  return validate(j, minLen)
}

function buildPrompt(type: string, safeExtra: string, salt: string){
  if(type==="short"){
    return `2 фото пары. СИД ${salt||Date.now()}.

Это БЕСПЛАТНЫЙ мини-тизер, а не полный разбор. Твоя задача — зацепить, а не рассказать всё.

Верни JSON {"percent": 71-94 рандом, "full": "РОВНО 5 предложений, не больше, не меньше. Дерзко, остроумно, как человек, который сходу режет правду в переписке — БЕЗ обращения по полу к читателю."}

Структура этих 5 предложений (строго по смыслу, но не копируй фразы дословно, каждый раз формулируй иначе):
1) Общий вайб пары одной фразой + 1 конкретная визуальная деталь с фото (одежда/поза/фон).
2) Ещё 1 визуальная деталь + что она говорит о притяжении между ними.
3) Один провокационный намек на то, кто кого хочет сильнее ИЛИ кто сдерживается — без объяснения почему.
4) Короткая интрига: намекни, что по фото видно что-то важное (ред флаг, скрытые чувства, или наоборот) — но НЕ раскрывай что именно.
5) Явный крючок на продолжение — намекни, что есть более глубокий и честный разбор, но не пиши шаблонно, сформулируй по-своему каждый раз.

ЗАПРЕЩЕНО в этом тексте: конкретные советы что делать, разбор психологии/травм, ред-флаги по пунктам, прогнозы на будущее — всё это платное и должно остаться загадкой. Не строй все 5 предложений одинаковой длины — пусть ритм будет живым, не механическим.`
  }
  if(type==="deep"){
    return `Доп инфа от читателя: ${safeExtra}
2 фото пары. СИД ${salt||Date.now()}.

Верни JSON {"percent": 70-93, "full": "текст по шаблону НИЖЕ, ОБЯЗАТЕЛЬНО заполни каждый пункт 3-4 предложениями, минимум 1300 символов всего:"}

Шаблон для поля full (используй эти же названия блоков, но пиши живо, не как отчёт):
ПСИХОПОРТРЕТЫ:
[Про неё и про него отдельно: характер по лицу и позе, триггеры, тип привязанности, как каждый показывает любовь. 4-5 предложений]

ДИНАМИКА МЕЖДУ НИМИ:
[Кто тащит общение, кто тащит встречи, баланс сил, почему это выглядит как недоотношения, что их держит вместе]

РЕД ФЛАГИ:
[2-3 конкретных ред флага у каждого — по фото и по вводным]

ЧТО НА САМОМ ДЕЛЕ В ГОЛОВЕ У ВТОРОЙ СТОРОНЫ:
[Честно, как будто читаешь мысли того, о ком спрашивают меньше — любит, боится, держит на подхвате]

ПРОГНОЗ НА МЕСЯЦ:
[Что будет если ничего не менять, и что будет если сделать шаг]

ЧТО ДЕЛАТЬ:
[2-3 конкретных дерзких совета, без воды]

Пиши без морализаторства, не обращайся к читателю по полу.`
  }
  if(type==="sex"){
    return `2 фото пары. СИД ${salt||Date.now()}.
Верни JSON {"percent": 78-96, "full": "текст по шаблону, КАЖДЫЙ пункт 3 предложения минимум, всего 800-1000 символов, дерзко но умно, БЕЗ обращения по полу к читателю:"}

Шаблон для full:
ПРИТЯЖЕНИЕ:
[Насколько тянет физически по фото, искра есть или нет, кто на кого смотрит дольше]

В ПОСТЕЛИ:
[Кто ведёт, какая динамика между ними, темп, нежность или жёстче]

КТО ВЛЮБЛЁН СИЛЬНЕЕ:
[Кто больше вложен — по глазам и языку тела]

СОВЕТ:
[2 конкретных совета что попробовать]

Без цензуры, но без порнографии. 18+`
  }
  if(type==="future"){
    return `2 фото пары. СИД ${salt||Date.now()}.
Верни JSON {"percent": 74-95, "full": "текст по шаблону, каждый пункт 2-3 предложения, минимум 900 символов, без обращения по полу к читателю:"}

Шаблон для full:
БУДУТ ЛИ ВМЕСТЕ:
[Прямой честный прогноз — свадьба / расставание / затянувшийся подвес]

ГЛАВНАЯ РАЗВИЛКА:
[Момент или решение, которое определит всё в ближайшие месяцы]

ЧТО МОЖЕТ ВСЁ СЛОМАТЬ:
[Главный риск для пары]

ЕСЛИ НУЖНО БУДУЩЕЕ:
[Конкретный шаг на ближайшую неделю]`
  }
  if(type==="kids"){
    return `2 фото пары. СИД ${salt||Date.now()}.
Верни JSON {"percent": 80-95, "full": "шаблон про детей, каждый пункт 2-3 предложения, 700+ символов, без обращения по полу к читателю:"}

Шаблон для full:
КАКИЕ БУДУТ ДЕТИ:
[На кого похожи, характер, сколько детей по энергии пары]

БУДУТ ЛИ ХОРОШИМИ РОДИТЕЛЯМИ:
[Кто какой родитель по фото]

ОТ КОГО ЧТО ВОЗЬМУТ:
[Глаза, характер, харизма от кого]

КОГДА:
[Когда по динамике пары лучше заводить]`
  }
  return ""
}

export async function POST(req: NextRequest){
  try{
    const { photo1, photo2, type="short", extra="", salt="" } = await req.json()
    if(!photo1 || !photo2) return NextResponse.json({percent:84, full:"Добавь обе фотки заново"}, {status:400})
    const safeExtra = (extra||"").slice(0,700)
    const prompt = buildPrompt(type, safeExtra, salt)
    const maxTokens = type==="deep" ? 2200 : (type==="short" ? 500 : 1500)
    // short teaser is only ~5 sentences — don't force it to hit the 200-char
    // floor used by the longer, template-based paid reports
    const minLen = type==="short" ? 80 : 200

    // Ordered fallback chain: Gemini direct first (cheap/free), then OpenRouter models.
    const attempts: Array<()=>Promise<{percent:number, full:string}>> = [
      ()=>callGemini("gemini-2.5-flash", prompt, photo1, photo2, maxTokens, minLen),
      ()=>callGemini("gemini-2.5-flash-lite", prompt, photo1, photo2, maxTokens, minLen),
      ()=>callOR("google/gemini-2.5-flash", prompt, photo1, photo2, maxTokens, minLen),
      ()=>callOR("qwen/qwen-2.5-vl-72b-instruct", prompt, photo1, photo2, maxTokens, minLen),
      ()=>callOR("qwen/qwen-2-vl-72b-instruct", prompt, photo1, photo2, maxTokens, minLen),
    ]

    for(const attempt of attempts){
      try{
        const r = await attempt()
        if(r?.percent) return NextResponse.json(r)
      }catch(e){
        console.error("MODEL FAIL:", (e as Error).message)
        continue
      }
    }
    throw new Error("all providers dead")
  }catch(e){
    console.error("ALL FAILED", e)
    return NextResponse.json({percent:84, full:"Выглядит как пара с корпоратива, которая спалилась на камеру. Один держится серьёзно, другой явно выдаёт себя взглядом. Притяжение есть, но кто-то накручивает, а кто-то морозится. Стоит поговорить нормально, а не гадать."})
  }
}