// ПОЛОЖИТЬ СЮДА: app/api/love/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isEventCurrentlyActive, getEventById } from '@/lib/events'
import { authUserOrDev } from '@/lib/telegram-auth'
import { canAccess, isSubscriber, isTester, type PaidFeature } from '@/lib/entitlements'
import { MAX_CHAT_SHOTS, MAX_SCAN_PHOTOS } from '@/lib/pricing'

export const runtime = "nodejs"          // нужен crypto для проверки подписи initData
export const maxDuration = 60            // разбор 5 скриншотов не укладывается в 30с
                                          // (60с требует платного тарифа Vercel; на free ставьте 30
                                          //  и снижайте MAX_CHAT_SHOTS до 3)

const THIRD_PARTY_RULE = `ПРО ЧЕЛОВЕКА, КОТОРОГО НЕТ В РАЗГОВОРЕ (жёсткое правило, важнее стиля):
Второй человек не участвует в этом диалоге и не может ответить на обвинение. Поэтому ты НИКОГДА не утверждаешь как установленный факт, что он(а) изменяет, врёт, использует, что у него(неё) кто-то есть или что он(а) что-то замышляет. Ты не ставишь диагноз человеку по фотографии.
Если вопрос читателя предполагает такой вердикт — не уходи от темы и не читай мораль, а разверни ответ туда, где есть настоящая опора: что именно читатель замечает, что изменилось в поведении по его собственным словам, откуда берётся тревога, что она говорит о самом читателе, и какой конкретный разговор её снимет.
Запрещены формулировки "он(а) изменяет", "у него(неё) точно кто-то есть", "он(а) врёт" — в том числе смягчённые ("возможно, изменяет", "похоже, что-то скрывает от тебя в этом смысле"). Вместо приговора дай читателю одну прямую фразу, которую стоит сказать вслух, чтобы перестать гадать.`

const SYSTEM = `Ты — остроумный аналитик отношений с черным юмором, режешь правду без предисловий. НЕ обращайся к читателю по полу (никаких "детка", "подруга", "красавица", "бро" и т.п.) — читатель может быть кем угодно, обращайся нейтрально на "ты" по смыслу текста, а не по полу.

Отвечаешь ТОЛЬКО валидным JSON. Базовая форма — {"percent": число, "full": "текст"}; если в задании просят дополнительные поля, добавь их. Внутри full ОБЯЗАТЕЛЬНО пиши текст после каждого заголовка, никогда не оставляй пустой заголовок. В тексте ОБЯЗАТЕЛЬНО упомяни минимум 2 конкретных наблюдения из присланного материала — это доказывает, что ты реально смотрел(а) именно на него, а не пишешь общими словами.

ПРО ПРОЦЕНТ (важно): не зажимай его в узкий "приятный" диапазон 70-95. Реальный разброс — от 8 до 99. Низкий процент (15-40) должен по-настоящему выпадать, когда видно дистанцию, дисбаланс, неувлечённость или тревожные сигналы. Процент обязан логически соответствовать тексту: если анализ настороженный, цифра должна быть низкой, а не высокой "для настроения". Предсказуемая позитивность читается как разводка, а не как честный анализ.

${THIRD_PARTY_RULE}

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

export type LoveResult = { percent:number, full:string, teasers?:Record<string,string> }

function validate(j: any, minLen = 200): LoveResult {
  if(j?.percent === undefined || j?.percent === null || !j?.full) throw new Error("no json / missing fields")
  if(String(j.full).length < minLen) throw new Error("too short")
  const out: LoveResult = { percent: Number(j.percent), full: String(j.full) }
  if(j.teasers && typeof j.teasers === "object"){
    const t: Record<string,string> = {}
    for(const k of ["deep","hidden","future","custom"]){
      const v = j.teasers[k]
      if(typeof v === "string" && v.trim().length > 30) t[k] = v.trim().slice(0, 200)
    }
    if(Object.keys(t).length) out.teasers = t
  }
  return out
}

/* ─────────────────────────────────────────────────────────────
   Вызовы моделей. Раньше сигнатура была жёстко (p1, p2) — теперь
   принимаем массив, потому что кадров может быть от 1 (совместное
   фото) до 5 (скриншоты переписки).
   ───────────────────────────────────────────────────────────── */

async function callGemini(model: string, prompt: string, photos: string[], max: number, minLen = 200){
  const key = process.env.GEMINI_API_KEY?.trim()
  if(!key) throw new Error("no GEMINI_API_KEY")
  if(!photos.length) throw new Error("no photos")

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        ...photos.map(p => ({ inlineData: { mimeType: dataUrlMime(p), data: dataUrlToBase64(p) } })),
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

async function callOR(model: string, prompt: string, photos: string[], max: number, minLen = 200){
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if(!key) throw new Error("no OPENROUTER_API_KEY")
  if(!photos.length) throw new Error("no photos")

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{ "Authorization": `Bearer ${key}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model,
      messages:[
        {role:"system", content: SYSTEM},
        {role:"user", content:[
          {type:"text", text: prompt},
          ...photos.map(p => ({ type:"image_url", image_url:{ url: p } })),
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

/* ─────────────────────────────────────────────────────────────
   Фрейминг
   ───────────────────────────────────────────────────────────── */

type Mode = "couple" | "crush" | "friend"
type InputKind = "two" | "joint" | "both" | "chat"

function modeFraming(mode: Mode){
  if(mode === "crush") return {
    subject: "Это не пара (пока?) — один(на) из них краш или человек, с которым идёт переписка/общение, но отношений ещё нет.",
    percentLabel: "потенциал притяжения",
    voice: "как будто разбираешь ситуацию с крашем, а не устоявшиеся отношения — акцент на неопределённость, читает ли он(а) вообще между строк, стоит ли делать шаг.",
  }
  if(mode === "friend") return {
    subject: "ВАЖНО: это точно НЕ романтика и не потенциальные партнёры — проверяется дружба/совместимость как друзья, приятели или коллеги. Категорически нельзя описывать их как пару или потенциальную пару.",
    percentLabel: "совместимость как люди / friendship match",
    voice: `без романтического подтекста вообще — только про energy match, стиль общения, потенциальные конфликты характеров, совместные интересы, кто в компании заводила а кто наблюдатель.
ЗАПРЕЩЕНО использовать слова и конструкции: "пара", "партнёр", "коннект" (в романтическом смысле), "притяжение", "влюблён", "избранник", "вторая половина", "искра между ними", любые намёки на свидание/отношения/поцелуй/чувства друг к другу. Если тянет написать "их потенциал" — пиши "их дружба" или "их совместимость как приятелей".
ОБЯЗАТЕЛЬНО привяжи текст к конкретно ДРУЖЕСКИМ сценариям: кто в компании травит шутки и держит настроение, а кто тихо наблюдает; кто организует поездки, а кто вечно "давай в другой раз"; кто первый напишет после ссоры; кто одолжит денег без вопросов; кто станет разруливать конфликт, а кто свалит от драмы. Текст должен читаться однозначно как "это про дружбу".`,
  }
  return {
    subject: "Это пара.",
    percentLabel: "совместимость",
    voice: "как в устоявшихся или развивающихся отношениях.",
  }
}

// Что именно прислали и как это читать. Совместное фото несёт сигнал,
// которого нет в двух отдельных портретах, — ради него всё и затевалось.
function inputFraming(input: InputKind, count: number){
  if(input === "joint") return `Прислано ОДНО СОВМЕСТНОЕ фото — на нём оба человека сразу.
Это ценнее двух отдельных портретов, используй по максимуму: расстояние между телами, кто к кому наклонён корпусом, есть ли касание и какое оно (уверенное, формальное, вцепившееся), зеркалит ли один позу другого, куда направлены взгляды и куда развёрнуты стопы, кто ближе к камере, кто занимает больше места в кадре, чьи плечи развёрнуты к другому, а чьи — от него. Кто улыбается в камеру, а кто — другому человеку.`

  if(input === "both") return `Прислано ${count} фото: сначала два отдельных портрета (первый и второй человек), затем СОВМЕСТНОЕ фото, где они вместе.
Отдельные портреты читай для характеров каждого по отдельности. Совместное фото — для того, что видно только вдвоём: дистанция между телами, касания и их характер, кто к кому наклонён, зеркалит ли один позу другого, куда направлены взгляды и стопы, кто ближе к камере.
ОБЯЗАТЕЛЬНО сошлись хотя бы на одну деталь именно с совместного фото — читатель специально его добавил и должен увидеть, что оно пошло в дело.`

  if(input === "chat") return `Прислано ${count} скриншотов переписки между этими двумя. Прочитай их внимательно, включая время сообщений и то, кто пишет слева, а кто справа (справа — тот, чей это телефон, то есть читатель).`

  return "Прислано 2 отдельных фото — по одному на каждого."
}

function teaserContract(teaser?: string){
  if(!teaser) return ""
  return `\n\nОБЯЗАТЕЛЬНОЕ НАЧАЛО: читателю уже показали размытым первое предложение этого разбора, и он заплатил именно за его продолжение. Первый абзац первого блока шаблона обязан начинаться с этой фразы ДОСЛОВНО и естественно продолжать именно эту мысль, а не уводить в сторону:
"${teaser}"`
}

function buildPrompt(
  type: string, safeExtra: string, salt: string, mode: Mode,
  input: InputKind, photoCount: number,
  eventId?: string, mood?: string | null, teaser?: string
){
  const f = modeFraming(mode)
  const head = `${f.subject} ${inputFraming(input, photoCount)} СИД ${salt||Date.now()}.`

  const MOOD_LABELS: Record<string,string> = {
    up: "на подъёме, в хорошем настроении",
    calm: "спокоен(на), уравновешен(на)",
    tired: "устал(а)",
    anxious: "тревожится",
    sad: "немного грустит",
  }
  const moodContext = (mood && MOOD_LABELS[mood])
    ? `\n\nКОНТЕКСТ (не упоминай напрямую, что тебе это известно, просто чуть подстрой тон): читатель сегодня ${MOOD_LABELS[mood]}.`
    : ""

  /* ── РАЗБОР ПЕРЕПИСКИ ── */
  if(type==="conversation"){
    return `${head}

Верни JSON {"percent": число (насколько переписка живая и взаимная, см. правило про процент выше), "full": "текст по шаблону, каждый пункт 3-4 предложения, минимум 1400 символов"}

Пиши ${f.voice}

ОБЯЗАТЕЛЬНО: процитируй минимум три коротких куска реальных сообщений (не больше 6 слов каждый, в кавычках) — читатель должен видеть, что ты читал(а) именно его переписку, а не выдал(а) заготовку. Обращай внимание на паузы между сообщениями и на время суток, если оно видно.

Шаблон для full:
КТО ВКЛАДЫВАЕТСЯ БОЛЬШЕ:
[Кто пишет длиннее, кто первым начинает, кто задаёт вопросы, а кто отвечает односложно. С опорой на конкретные сообщения]

ЧТО ПРОИСХОДИТ МЕЖДУ СТРОК:
[Что на самом деле сказано под вежливыми формулировками — 2-3 конкретных момента]

ГДЕ УХОДЯТ ОТ ТЕМЫ:
[Найди момент, где один сменил тему, отшутился или не ответил на прямой вопрос. Что это значит]

КАК ИЗМЕНИЛСЯ ТОН:
[Сравни начало и конец присланного: стало теплее, суше, формальнее. Если разницы нет — так и скажи]

ЧТО НАПИСАТЬ СЛЕДУЮЩИМ СООБЩЕНИЕМ:
[Готовый текст сообщения, который стоит отправить. Прямо в кавычках, чтобы можно было скопировать. Плюс одна строка о том, чего в нём намеренно нет и почему]${moodContext}`
  }

  if(type==="seasonal"){
    const event = eventId ? getEventById(eventId) : null
    if(event?.id === "valentine2027"){
      return `${head} Это ЛИМИТИРОВАННЫЙ разбор ко Дню святого Валентина — "${event.title}".
Верни JSON {"percent": число (${f.percentLabel}), "full": "текст по шаблону, каждый пункт 3-4 предложения, минимум 1100 символов, тепло но без слащавости:"}

Пиши ${f.voice}

Шаблон для full:
КАК НАЧНЁТСЯ ГОД:
[Первые месяцы — с чего начнётся всё между ними]

ГЛАВНОЕ ИСПЫТАНИЕ ГОДА:
[Момент, который станет проверкой для них двоих]

ПИК ГОДА:
[Лучший момент между ними за весь год]

ЧЕМ ЗАКОНЧИТСЯ ГОД:
[Честный прогноз к декабрю]

ГЛАВНЫЙ СОВЕТ НА ГОД:
[Одна конкретная рекомендация, без воды]`
    }
    return `${head} Это ЛИМИТИРОВАННЫЙ сезонный разбор${event ? ` — "${event.title}"` : ""}.
Верни JSON {"percent": число (${f.percentLabel}), "full": "текст 1000+ символов, тепло, конкретно, пиши ${f.voice}"}`
  }

  /* ── БЕСПЛАТНЫЙ ТИЗЕР + НАСТОЯЩИЕ ПРЕВЬЮ ПЛАТНЫХ РАЗБОРОВ ── */
  if(type==="short"){
    return `${head}

Это БЕСПЛАТНЫЙ мини-тизер, а не полный разбор. Твоя задача — зацепить, а не рассказать всё. Пиши ${f.voice}

Верни JSON с ДВУМЯ полями:
{
  "percent": число (${f.percentLabel}, см. правило про процент выше),
  "full": "РОВНО 5 предложений, не больше, не меньше. Дерзко, остроумно.",
  "teasers": { "deep": "...", "hidden": "...", "future": "...", "custom": "..." }
}

Структура пяти предложений в full (строго по смыслу, но каждый раз формулируй иначе):
1) Общий вайб одной фразой + 1 конкретная визуальная деталь.
2) Ещё 1 деталь + что она говорит о связи между ними.
3) Один провокационный намёк на дисбаланс — кто вкладывается больше ИЛИ кто сдерживается — без объяснения почему.
4) Короткая интрига: намекни, что видно что-то важное — но НЕ раскрывай что.
5) Явный крючок на продолжение, сформулируй по-своему.

ПРО ПОЛЕ teasers — читай внимательно, это важнее всего остального:
Каждый teaser — это НАСТОЯЩЕЕ первое предложение соответствующего платного разбора, а не реклама и не описание того, что там будет. Не пиши "в этом разборе ты узнаешь" — пиши сразу саму мысль, как будто разбор уже начался, и обрывай её на середине многоточием. Читатель увидит эту фразу размытой и заплатит именно за её продолжение, поэтому она обязана быть честной: то, что ты здесь напишешь, действительно станет началом платного текста.
Каждый teaser опирается на конкретную деталь именно из присланного материала, длина 90-140 символов, заканчивается многоточием.
- deep: начало глубокого разбора характеров и того, кто вкладывается больше.
- hidden: начало разбора того, что второй человек не говорит вслух.
- future: начало прогноза, что будет с ними дальше.
- custom: начало ответа на самый очевидный неудобный вопрос, который читатель хотел бы задать про эту ситуацию.${moodContext}

ЗАПРЕЩЕНО в поле full: конкретные советы что делать, разбор психологии по пунктам, прогнозы — всё это платное.`
  }

  if(type==="deep"){
    return `Доп инфа от читателя: ${safeExtra}
${head}

Верни JSON {"percent": число (${f.percentLabel}), "full": "текст по шаблону НИЖЕ, ОБЯЗАТЕЛЬНО заполни каждый пункт 3-4 предложениями, минимум 1300 символов всего:"}

Пиши ${f.voice}${teaserContract(teaser)}

Шаблон для поля full (используй эти же названия блоков, но пиши живо, не как отчёт):
ПСИХОПОРТРЕТЫ:
[Про каждого отдельно: характер по лицу и позе, триггеры, как каждый показывает вовлечённость. 4-5 предложений]

ЧТО ПРОИСХОДИТ МЕЖДУ НИМИ:
[Кто вкладывается больше, баланс сил, что держит вместе или что мешает сблизиться]

КРАСНЫЕ ФЛАГИ:
[2-3 конкретных повода насторожиться. Про поведение, которое читатель наблюдает сам, а не про приговор второму человеку]

ЧТО НА САМОМ ДЕЛЕ ЧУВСТВУЕТ ВТОРАЯ СТОРОНА:
[Честное предположение, обязательно как предположение, а не как факт]

ПРОГНОЗ НА МЕСЯЦ:
[Что будет если ничего не менять, и что будет если сделать шаг]

ЧТО ДЕЛАТЬ:
[2-3 конкретных дерзких совета, без воды]

Пиши без морализаторства.`
  }

  if(type==="hidden"){
    return `${head}
Верни JSON {"percent": число (${f.percentLabel}), "full": "текст по шаблону, КАЖДЫЙ пункт 3 предложения минимум, всего 800-1000 символов, дерзко но умно:"}

Пиши ${f.voice}${teaserContract(teaser)}

Шаблон для full:
ЧТО ОН(А) НЕ ГОВОРИТ ВСЛУХ:
[Судя по позе, взгляду, микровыражениям — какие эмоции читаются, но не проговариваются]

ПОЧЕМУ МОЛЧИТ:
[Страх, гордость, неуверенность, привычка — предположение, а не диагноз]

ЧТО ВЫДАЁТ:
[1-2 конкретных детали, которые противоречат "маске" — язык тела не врёт]

КАК ВЫЗВАТЬ НА ЧЕСТНОСТЬ:
[2 конкретных совета: что сказать или сделать. Один из них — готовая фраза в кавычках]`
  }

  if(type==="custom"){
    const question = (safeExtra || "").trim()
    if(!question) return `${head} Верни JSON {"percent": число, "full": "Напиши 2 предложения о том, что вопрос пуст, и предложи спросить конкретнее."}`
    return `${head} Пользователь задал СВОЙ КОНКРЕТНЫЙ вопрос — отвечай именно на него, а не общими фразами.

Вопрос пользователя: "${question}"

Верни JSON {"percent": число (${f.percentLabel}), "full": "прямой, конкретный ответ на заданный вопрос, минимум 900 символов, опираясь на конкретные детали из присланного материала"}${teaserContract(teaser)}

Структура full:
- Начни с прямого ответа (1-2 предложения, без воды и предисловий)
- Дальше 3-4 предложения — ПОЧЕМУ ты так считаешь, с опорой на конкретные детали
- В конце — 1 практический совет, связанный именно с этим вопросом

Если вопрос требует вынести вердикт о поведении второго человека (изменяет, врёт, использует) — НЕ выноси его и не смягчай его формулировками "возможно". Вместо этого честно скажи, что по фотографии такое не устанавливается, и разверни ответ на то, что читатель замечает сам, откуда взялась тревога и какой прямой разговор её закроет. Дай готовую фразу в кавычках, с которой этот разговор можно начать.

Если вопрос вообще не про этих двух людей — вежливо, но твёрдо откажи прямо в тексте full.`
  }

  if(type==="future"){
    return `${head}
Верни JSON {"percent": число (${f.percentLabel}), "full": "текст по шаблону, каждый пункт 2-3 предложения, минимум 900 символов:"}

Пиши ${f.voice}${teaserContract(teaser)}

Шаблон для full:
${mode==="friend" ? "БУДЕТЕ ЛИ ДРУЖИТЬ ДОЛГО" : "БУДУТ ЛИ ВМЕСТЕ"}:
[Прямой честный прогноз]

ГЛАВНАЯ РАЗВИЛКА:
[Момент или решение, которое определит всё в ближайшие месяцы]

ЧТО МОЖЕТ ВСЁ СЛОМАТЬ:
[Главный риск]

ПЕРВЫЙ ШАГ:
[Что конкретно сделать на ближайшей неделе]`
  }

  return ""
}

/* ─────────────────────────────────────────────────────────────
   Роут
   ───────────────────────────────────────────────────────────── */

const PAID_TYPES: PaidFeature[] = ["deep","hidden","future","custom","conversation"]

export async function POST(req: NextRequest){
  // Вынесено из try, чтобы catch знал, платный это тип или бесплатный тизер —
  // заглушку можно отдавать только для "short".
  let type = "short"
  try{
    const body = await req.json()
    type = body?.type || "short"
    const {
      photo1, photo2,                 // старый формат, оставлен для совместимости
      photos: photosRaw,              // новый: массив кадров
      input: inputRaw = "two",
      extra = "",
      salt = "",
      mode = "couple",
      eventId = "",
      mood = null,
      scanId = null,
      teaser = "",
    } = body

    // 1. Собираем кадры
    let photos: string[] = Array.isArray(photosRaw) ? photosRaw.filter((p:any)=>typeof p === "string" && p.startsWith("data:")) : []
    if(!photos.length && photo1 && photo2) photos = [photo1, photo2]
    if(!photos.length) return NextResponse.json({ error: "Добавь фото заново" }, { status: 400 })

    const input: InputKind = ["two","joint","both","chat"].includes(inputRaw) ? inputRaw : "two"
    const limit = input === "chat" ? MAX_CHAT_SHOTS : MAX_SCAN_PHOTOS
    if(photos.length > limit){
      return NextResponse.json({ error: `Слишком много изображений: максимум ${limit}` }, { status: 400 })
    }
    if(input === "joint" && photos.length !== 1) photos = photos.slice(0,1)
    if(input === "two" && photos.length < 2){
      return NextResponse.json({ error: "Для режима «по отдельности» нужны два фото" }, { status: 400 })
    }

    // 2. Кто спрашивает
    const user = authUserOrDev(req)

    // 3. Права. Раньше этой проверки не было вообще — любой мог получить
    //    платный разбор, просто позвав роут с type:"deep".
    if(PAID_TYPES.includes(type as PaidFeature)){
      if(!user) return NextResponse.json({ error: "Открой приложение через бота" }, { status: 401 })

      if(!isTester(user.id)){
        if(type === "conversation"){
          // разбор переписки не привязан к скану: либо подписка, либо разовая покупка
          const sub = await isSubscriber(user.id)
          const paid = !sub && await canAccess(user.id, scanId, "conversation")
          if(!sub && !(paid && paid.ok)){
            return NextResponse.json({ error: "Разбор переписки не оплачен" }, { status: 402 })
          }
        } else {
          const access = await canAccess(user.id, scanId, type as PaidFeature)
          if(!access.ok){
            return NextResponse.json({ error: "Этот разбор не оплачен", reason: access.reason }, { status: 402 })
          }
        }
      }
    }

    if(type==="seasonal"){
      if(!eventId || !isEventCurrentlyActive(eventId)){
        return NextResponse.json({ error: "Этот разбор сейчас недоступен — ивент закончился или ещё не начался" }, { status: 403 })
      }
    }

    // 4. Промпт
    const safeExtra = (extra||"").slice(0,700)
    const safeMode: Mode = ["couple","crush","friend"].includes(mode) ? mode : "couple"
    const safeTeaser = typeof teaser === "string" ? teaser.slice(0,200) : ""
    const prompt = buildPrompt(type, safeExtra, salt, safeMode, input, photos.length, eventId, mood, safeTeaser)
    if(!prompt) return NextResponse.json({ error: "unknown type" }, { status: 400 })

    const maxTokens =
      type==="conversation" ? 2600 :
      type==="deep" ? 2200 :
      type==="short" ? 900 :          // подняли: теперь в ответе ещё и teasers
      type==="custom" ? 1400 : 1500
    const minLen = type==="short" ? 80 : (type==="custom" ? 150 : 200)

    const attempts: Array<()=>Promise<LoveResult>> = [
      ()=>callGemini("gemini-2.5-flash", prompt, photos, maxTokens, minLen),
      ()=>callGemini("gemini-2.5-flash-lite", prompt, photos, maxTokens, minLen),
      ()=>callOR("google/gemini-2.5-flash", prompt, photos, maxTokens, minLen),
      ()=>callOR("qwen/qwen-2.5-vl-72b-instruct", prompt, photos, maxTokens, minLen),
      ()=>callOR("qwen/qwen-2-vl-72b-instruct", prompt, photos, maxTokens, minLen),
    ]

    for(const attempt of attempts){
      try{
        const r = await attempt()
        if(r?.percent !== undefined) return NextResponse.json(r)
      }catch(e){
        console.error("MODEL FAIL:", (e as Error).message)
        continue
      }
    }
    throw new Error("all providers dead")
  }catch(e){
    console.error("ALL FAILED", e)
    // Заглушка отдаётся только для бесплатного тизера. Отдавать выдуманный
    // текст за деньги — прямой путь к возвратам, поэтому на платных типах
    // честно сообщаем об ошибке и не отдаём поле full вообще — клиент не должен
    // иметь возможность спутать эту ошибку с настоящим разбором.
    if(type === "short"){
      return NextResponse.json({
        percent: 84,
        full: "Сервис перегружен и не смог разобрать фото. Попробуй ещё раз через минуту — деньги за это не списываются.",
      }, { status: 503 })
    }
    return NextResponse.json({ error: "Сервис перегружен, попробуй ещё раз через минуту" }, { status: 503 })
  }
}