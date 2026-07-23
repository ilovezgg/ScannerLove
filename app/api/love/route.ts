// ПОЛОЖИТЬ СЮДА: app/api/love/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isEventCurrentlyActive, getEventById } from '@/lib/events'
export const maxDuration = 30

const SYSTEM = `Ты — остроумный аналитик отношений с черным юмором, режешь правду без предисловий. НЕ обращайся к читателю по полу (никаких "детка", "подруга", "красавица", "бро" и т.п.) — читатель может быть кем угодно, обращайся нейтрально на "ты" по смыслу текста, а не по полу.

Отвечаешь ТОЛЬКО валидным JSON {"percent": число, "full": "текст"}. Внутри full ОБЯЗАТЕЛЬНО пиши текст после каждого заголовка, никогда не оставляй пустой заголовок. В тексте ОБЯЗАТЕЛЬНО упомяни минимум 2 конкретных визуальных детали с фото (одежда, выражение лица, фон, поза) — это доказывает, что ты реально смотрел(а) на именно эти фото, а не пишешь общими словами.

ПРО ПРОЦЕНТ (важно): не зажимай его в узкий "приятный" диапазон 70-95. Реальный разброс — от 8 до 99. Низкий процент (15-40) должен по-настоящему выпадать, когда по фото или вводным видно дистанцию, дисбаланс, неувлечённость или тревожные сигналы — не только когда "всё прекрасно". Процент обязан логически соответствовать тексту: если анализ настороженный или отмечает серьёзный перекос, цифра должна быть низкой, а не высокой "для настроения". Предсказуемая позитивность читается как разводка, а не как честный анализ — не бойся дать по-настоящему низкий или по-настоящему высокий результат.

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

function validate(j: any, minLen = 200){
  if(!j?.percent || !j?.full) throw new Error("no json / missing fields")
  if(String(j.full).length < minLen) throw new Error("too short")
  return { percent: j.percent, full: j.full }
}

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
    generationConfig: { temperature: 0.9, maxOutputTokens: max, responseMimeType: "application/json" },
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

// ---- mode: who are these two people to each other? ----
// "couple" — существующая пара, "crush" — краш/переписка, ещё не пара,
// "friend" — проверка дружбы, не романтика. Это меняет формулировки в
// промпте, а НЕ структуру ответа (percent/full остаются теми же полями).
type Mode = "couple" | "crush" | "friend"

function modeFraming(mode: Mode){
  if(mode === "crush") return {
    subject: "2 фото. Это не пара (пока?) — один(на) из них краш или человек, с которым идёт переписка/общение, но отношений ещё нет.",
    percentLabel: "потенциал притяжения",
    voice: "как будто разбираешь ситуацию с крашем, а не устоявшиеся отношения — акцент на неопределённость, читает ли он(а) вообще между строк, стоит ли делать шаг.",
  }
  if(mode === "friend") return {
    subject: "2 фото. ВАЖНО: это точно НЕ романтика и не потенциальные партнёры — проверяется дружба/совместимость как друзья, приятели или коллеги. Категорически нельзя описывать их как пару или потенциальную пару.",
    percentLabel: "совместимость как люди / friendship match",
    voice: `без романтического подтекста вообще — только про energy match, стиль общения, потенциальные конфликты характеров, совместные интересы, кто в компании заводила а кто наблюдатель.
ЗАПРЕЩЕНО использовать слова и конструкции: "пара", "партнёр", "коннект" (в романтическом смысле), "притяжение", "влюблён", "избранник", "вторая половина", "искра между ними", любые намёки на свидание/отношения/поцелуй/чувства друг к другу. Если тянет написать "их потенциал" — пиши "их дружба" или "их совместимость как приятелей".
ОБЯЗАТЕЛЬНО привяжи текст к конкретно ДРУЖЕСКИМ сценариям, а не абстрактной "энергетике" — выбери 1-2 из этого списка (или похожее): кто в компании травит шутки и держит настроение, а кто тихо наблюдает; кто организует тусовки/поездки, а кто вечно "давай в другой раз"; кто первый напишет после ссоры; кто одолжит денег без вопросов, а кто будет напоминать; кто станет разруливать конфликт в компании, а кто просто свалит от драмы. Текст должен читаться однозначно как "это про дружбу", а не как нейтральный разбор, который можно было бы применить и к паре.`,
  }
  return {
    subject: "2 фото пары.",
    percentLabel: "совместимость",
    voice: "как в устоявшихся или развивающихся отношениях.",
  }
}

function buildPrompt(type: string, safeExtra: string, salt: string, mode: Mode, eventId?: string, mood?: string | null){
  const f = modeFraming(mode)

  const MOOD_LABELS: Record<string,string> = {
    up: "на подъёме, в хорошем настроении",
    calm: "спокоен(на), уравновешен(на)",
    tired: "устал(а)",
    anxious: "тревожится",
    sad: "немного грустит",
  }
  const moodContext = (mood && MOOD_LABELS[mood])
    ? `\n\nКОНТЕКСТ (не упоминай напрямую, что тебе это известно, просто можешь чуть мягче/жёстче подстроить тон): читатель сегодня ${MOOD_LABELS[mood]}.`
    : ""

  if(type==="seasonal"){
    const event = eventId ? getEventById(eventId) : null
    // Шаблон под конкретный ивент. Добавляя новый ивент в lib/events.ts,
    // добавьте сюда соответствующую ветку по event.id — иначе будет generic-фоллбек.
    if(event?.id === "valentine2027"){
      return `${f.subject} СИД ${salt||Date.now()}. Это ЛИМИТИРОВАННЫЙ разбор ко Дню святого Валентина — "${event.title}".
Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "текст по шаблону, каждый пункт 3-4 предложения, минимум 1100 символов, тепло но без слащавости, БЕЗ обращения по полу к читателю:"}

Пиши ${f.voice}

Шаблон для full:
КАК НАЧНЁТСЯ ГОД:
[Первые месяцы — с чего начнётся динамика между ними]

ГЛАВНОЕ ИСПЫТАНИЕ ГОДА:
[Момент/период, который станет проверкой для них двоих]

ПИК ГОДА:
[Когда будет лучший момент между ними за весь год]

ЧЕМ ЗАКОНЧИТСЯ ГОД:
[Честный прогноз к декабрю]

ГЛАВНЫЙ СОВЕТ НА ГОД:
[Одна конкретная рекомендация, без воды]`
    }
    // generic fallback для любого другого сезонного ивента без явного шаблона
    return `${f.subject} СИД ${salt||Date.now()}. Это ЛИМИТИРОВАННЫЙ сезонный разбор${event ? ` — "${event.title}"` : ""}.
Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "текст 1000+ символов, тепло, конкретно, БЕЗ обращения по полу к читателю, пиши ${f.voice}"}`
  }

  if(type==="short"){
    return `${f.subject} СИД ${salt||Date.now()}.

Это БЕСПЛАТНЫЙ мини-тизер, а не полный разбор. Твоя задача — зацепить, а не рассказать всё. Пиши ${f.voice}

Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "РОВНО 5 предложений, не больше, не меньше. Дерзко, остроумно, БЕЗ обращения по полу к читателю."}

Структура этих 5 предложений (строго по смыслу, но не копируй фразы дословно, каждый раз формулируй иначе):
1) Общий вайб одной фразой + 1 конкретная визуальная деталь с фото (одежда/поза/фон).
2) Ещё 1 визуальная деталь + что она говорит о связи между ними.
3) Один провокационный намёк на дисбаланс — кто вкладывается больше ИЛИ кто сдерживается — без объяснения почему.
4) Короткая интрига: намекни, что по фото видно что-то важное — но НЕ раскрывай что именно.
5) Явный крючок на продолжение — намекни, что есть более глубокий разбор, но сформулируй по-своему.
${moodContext}

ЗАПРЕЩЕНО в этом тексте: конкретные советы что делать, разбор психологии по пунктам, прогнозы — всё это платное. Не строй все 5 предложений одинаковой длины.`
  }

  if(type==="deep"){
    return `Доп инфа от читателя: ${safeExtra}
${f.subject} СИД ${salt||Date.now()}.

Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "текст по шаблону НИЖЕ, ОБЯЗАТЕЛЬНО заполни каждый пункт 3-4 предложениями, минимум 1300 символов всего:"}

Пиши ${f.voice}

Шаблон для поля full (используй эти же названия блоков, но пиши живо, не как отчёт):
ПСИХОПОРТРЕТЫ:
[Про каждого отдельно: характер по лицу и позе, триггеры, как каждый показывает вовлечённость. 4-5 предложений]

ДИНАМИКА МЕЖДУ НИМИ:
[Кто вкладывается больше, баланс сил, что держит вместе или что мешает сблизиться]

КРАСНЫЕ ФЛАГИ:
[2-3 конкретных повода насторожиться — по фото и по вводным]

ЧТО НА САМОМ ДЕЛЕ ДУМАЕТ ВТОРАЯ СТОРОНА:
[Честно, как будто читаешь мысли того, о ком спрашивают меньше]

ПРОГНОЗ НА МЕСЯЦ:
[Что будет если ничего не менять, и что будет если сделать шаг]

ЧТО ДЕЛАТЬ:
[2-3 конкретных дерзких совета, без воды]

Пиши без морализаторства, не обращайся к читателю по полу.`
  }

  if(type==="hidden"){
    // Replaces the old 18+ "sex" feature with something that works for
    // couples, crushes AND friends: what is the other person NOT saying out loud.
    return `${f.subject} СИД ${salt||Date.now()}.
Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "текст по шаблону, КАЖДЫЙ пункт 3 предложения минимум, всего 800-1000 символов, дерзко но умно, БЕЗ обращения по полу к читателю:"}

Пиши ${f.voice}

Шаблон для full:
ЧТО ОН(А) СКРЫВАЕТ:
[Судя по позе, взгляду, микровыражениям — что из подавленных эмоций читается на фото, что человек не говорит вслух]

НАСТОЯЩАЯ ПРИЧИНА:
[Почему скрывает — страх, гордость, неуверенность, тактика]

ЧТО ВЫДАЁТ ЕГО(ЕЁ) С ГОЛОВОЙ:
[1-2 конкретных детали с фото, которые противоречат "маске" — язык тела не врёт]

КАК ЭТО ИСПОЛЬЗОВАТЬ:
[2 конкретных совета, что сказать или сделать, чтобы получить честность]`
  }

  if(type==="custom"){
    const question = (safeExtra || "").trim()
    if(!question) return `${f.subject} СИД ${salt||Date.now()}. Верни JSON {"percent": число (${f.percentLabel}), "full": "Пользователь не написал вопрос — напиши 2 предложения о том, что вопрос пуст, и предложи спросить конкретнее."}`
    return `${f.subject} СИД ${salt||Date.now()}. Пользователь задал СВОЙ КОНКРЕТНЫЙ вопрос — отвечай именно на него, а не общими фразами.

Вопрос пользователя: "${question}"

Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "прямой, конкретный ответ на заданный вопрос, минимум 900 символов, опираясь на визуальные детали с фото, БЕЗ обращения по полу к читателю"}

Структура full:
- Начни с прямого ответа на вопрос (1-2 предложения, без воды и предисловий)
- Дальше 3-4 предложения — ПОЧЕМУ ты так считаешь, с опорой на конкретные детали с фото
- В конце — 1 практический совет, связанный именно с этим вопросом

Если вопрос не про отношения/совместимость этих двух людей на фото — вежливо, но твёрдо откажи прямо в тексте full и объясни, что отвечаешь только по теме фото.`
  }

  if(type==="future"){
    return `${f.subject} СИД ${salt||Date.now()}.
Верни JSON {"percent": число (${f.percentLabel}, см. правило про процент выше), "full": "текст по шаблону, каждый пункт 2-3 предложения, минимум 900 символов, без обращения по полу к читателю:"}

Пиши ${f.voice}

Шаблон для full:
${mode==="friend" ? "БУДЕТЕ ЛИ ДРУЖИТЬ ДОЛГО" : "БУДУТ ЛИ ВМЕСТЕ"}:
[Прямой честный прогноз]

ГЛАВНАЯ РАЗВИЛКА:
[Момент или решение, которое определит всё в ближайшие месяцы]

ЧТО МОЖЕТ ВСЁ СЛОМАТЬ:
[Главный риск]

ЕСЛИ НУЖНО БУДУЩЕЕ:
[Конкретный шаг на ближайшую неделю]`
  }

  return ""
}

export async function POST(req: NextRequest){
  try{
    const { photo1, photo2, type="short", extra="", salt="", mode="couple", eventId="", mood=null } = await req.json()
    if(!photo1 || !photo2) return NextResponse.json({percent:84, full:"Добавь обе фотки заново"}, {status:400})

    if(type==="seasonal"){
      if(!eventId || !isEventCurrentlyActive(eventId)){
        return NextResponse.json({ error: "Этот разбор сейчас недоступен — ивент закончился или ещё не начался" }, { status: 403 })
      }
    }

    const safeExtra = (extra||"").slice(0,700)
    const safeMode: Mode = ["couple","crush","friend"].includes(mode) ? mode : "couple"
    const prompt = buildPrompt(type, safeExtra, salt, safeMode, eventId, mood)
    const maxTokens = type==="deep" ? 2200 : (type==="short" ? 500 : (type==="custom" ? 1400 : 1500))
    const minLen = type==="short" ? 80 : (type==="custom" ? 150 : 200)

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