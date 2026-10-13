"use client"
// ПОЛОЖИТЬ СЮДА: app/page.tsx
import { useState, useEffect, useRef } from "react"
import { InviteBanner, InvitePartnerButton, InviteFriendsButton, ComparisonScreen } from "./components/InviteFlow"
import { getActiveEvent, eventText } from "@/lib/events"
import { clientLang, tr, type Lang } from "@/lib/i18n"
import { PRICES, off, MAX_CHAT_SHOTS } from "@/lib/pricing"
import { appLink, shareLink } from "@/lib/links"

/* ────────────────────────────────────────────────────────────
   ДИЗАЙН-ТОКЕНЫ
   ──────────────────────────────────────────────────────────── */
const C = {
  bg:"#0A0908", bgRaised:"#100D0C",
  ink:"#F4EFE7", ink70:"rgba(244,239,231,0.70)", ink50:"rgba(244,239,231,0.50)",
  // ink55 — контраст 5.61:1 на bg (AA-порог 4.5:1) для текста, который нужно
  // читать; ink35 — только для декора/disabled/плейсхолдеров, не для контента.
  ink55:"rgba(244,239,231,0.55)", ink35:"rgba(244,239,231,0.35)",
  line:"rgba(255,255,255,0.09)", lineSoft:"rgba(255,255,255,0.055)",
  red:"#C1272D", redSoft:"#E14750", redDeep:"#7A1015",
  gold:"#E9C77B", goldSoft:"#F3D998", goldInk:"#221703",
}
const R = { sm:12, md:18, lg:24, pill:999 }
// micro и display раньше были голыми числами (9.5, 40) в разных местах —
// формализовал их в шкале вместо округления, чтобы не менять фактический размер.
const F = { micro:9.5, xs:11, sm:12.5, md:14, lg:16, xl:21, xxl:27, display:40, hero:42 }
const PAD = 20

/* ────────────────────────────────────────────────────────────
   API
   Каждый запрос уходит с подписью Telegram. Без неё сервер
   теперь отвечает 401 на всё платное — userId в теле он больше
   не читает, потому что подставить туда можно было что угодно.
   ──────────────────────────────────────────────────────────── */
const tgApp = () => (typeof window !== "undefined" ? (window as any)?.Telegram?.WebApp : null)
const initData = () => tgApp()?.initData || ""

// Обёртка над Telegram.WebApp.showAlert — он асинхронный (колбэк вызывается
// после того, как пользователь закроет алерт), поэтому код, который должен
// выполниться именно после закрытия, передаём как cb, а не пишем следом.
// Фолбэк на обычный alert() — для локальной разработки вне Telegram, где
// SDK либо не подгружен, либо showAlert недоступен.
function notify(text: string, cb?: () => void){
  const tg = tgApp()
  // showAlert есть в SDK всегда, но на клиентах старше 6.2 (и вне Telegram) бросает
  // WebAppMethodUnsupported — без catch ошибка просто не показывалась
  try{
    if(tg?.showAlert){ tg.showAlert(text, () => cb?.()); return }
  }catch{}
  alert(text)
  cb?.()
}

async function api(path: string, opts: RequestInit = {}){
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": initData(),
      "x-lang": clientLang(),
      ...(opts.headers || {}),
    },
  })
}
const apiJson = async (path: string, opts: RequestInit = {}) => {
  const r = await api(path, opts)
  return { status: r.status, data: await r.json().catch(()=>({})) as any }
}
const post = (path: string, body: unknown) =>
  apiJson(path, { method:"POST", body: JSON.stringify(body) })

const sleep = (ms:number) => new Promise(r=>setTimeout(r,ms))

/* ── сжатие ──
   Портреты и скриншоты требуют разного обращения: портрет можно
   ужать до 1000px без потерь для анализа, а скриншот переписки при
   такой ширине превращается в кашу, и модель начинает угадывать
   текст вместо того, чтобы его читать. */
async function compressPhoto(f: File){
  const b = await createImageBitmap(f)
  let w=b.width, h=b.height
  const M=1000
  if(w>M||h>M){ if(w>h){ h=Math.round(h*M/w); w=M } else { w=Math.round(w*M/h); h=M } }
  const c=document.createElement("canvas"); c.width=w; c.height=h
  const ctx=c.getContext("2d")!
  ctx.imageSmoothingQuality="high"
  ctx.drawImage(b,0,0,w,h)
  return c.toDataURL("image/jpeg",0.78)
}

async function compressShot(f: File){
  const b = await createImageBitmap(f)
  const MAXW=1080, MAXH=2400
  const scale = Math.min(1, MAXW/b.width, MAXH/b.height)
  const w=Math.round(b.width*scale), h=Math.round(b.height*scale)
  const c=document.createElement("canvas"); c.width=w; c.height=h
  const ctx=c.getContext("2d")!
  ctx.imageSmoothingQuality="high"
  ctx.drawImage(b,0,0,w,h)
  return c.toDataURL("image/jpeg",0.85)   // выше качество: текст должен читаться
}

function SmartImg({src,pos:posDefault="50% 35%"}:{src:string,pos?:string}){
  const [pos,setPos]=useState(posDefault)
  const [ready,setReady]=useState(false)
  useEffect(()=>{
    // @ts-ignore
    if(!window.FaceDetector || !src) return
    const img=new Image(); img.src=src
    img.onload=async()=>{
      try{
        // @ts-ignore
        const detector=new window.FaceDetector({fastMode:true})
        const faces=await detector.detect(img)
        if(faces[0]){
          const y=(faces[0].boundingBox.y/img.height*100)
          setPos(`50% ${Math.max(10,Math.min(60,y))}%`)
        }
      }catch{}
    }
  },[src])
  return <img src={src} onLoad={()=>setReady(true)} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:pos,opacity:ready?1:0,transform:ready?"scale(1)":"scale(1.04)",transition:"opacity .5s ease, transform .7s cubic-bezier(.16,1,.3,1)"}}/>
}

/* ── иконки ── */
type IcoName = "crown"|"trophy"|"wheel"|"archive"|"bell"|"bellOff"|"sound"|"mute"|"lock"|"share"|"spark"|"layers"|"mask"|"moon"|"letter"|"close"|"refresh"|"eye"|"chat"|"plus"|"users"|"check"
function Ico({n,s=16}:{n:IcoName,s?:number}){
  const p:Record<IcoName,React.ReactNode> = {
    crown:  <path d="M3 18h18M4 18l-1-9 5.5 4L12 5l3.5 8L21 9l-1 9"/>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5A3.5 3.5 0 0 1 15.5 11"/><path d="M12 13v4M9 20h6"/></>,
    wheel:  <><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"/></>,
    archive:<><path d="M3.5 6.5h17v3.5h-17z"/><path d="M5.5 10v9h13v-9M10 14h4"/></>,
    bell:   <><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 7.5-2.5 7.5h17S18 15 18 8.5Z"/><path d="M10.3 19.5a2 2 0 0 0 3.4 0"/></>,
    bellOff:<><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 7.5-2.5 7.5h17S18 15 18 8.5Z"/><path d="M4 4l16 16"/></>,
    sound:  <><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M14.5 9.5a3.5 3.5 0 0 1 0 5"/></>,
    mute:   <><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M16 10l4 4M20 10l-4 4"/></>,
    lock:   <><path d="M5.5 11h13v9.5h-13z"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></>,
    share:  <><path d="M12 3.5v12M8 7l4-3.5L16 7"/><path d="M4.5 14.5v4A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-4"/></>,
    spark:  <path d="M12 2.5l1.9 6.6 6.6 1.9-6.6 1.9L12 19.5l-1.9-6.6L3.5 11l6.6-1.9z"/>,
    layers: <><path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/></>,
    mask:   <><path d="M3.5 8c0-2.2 2.5-3.5 8.5-3.5S20.5 5.8 20.5 8c0 6.5-4 11.5-8.5 11.5S3.5 14.5 3.5 8Z"/><path d="M8 10h1.5M14.5 10H16"/></>,
    moon:   <path d="M20 14.5A8.5 8.5 0 1 1 10.5 4a6.8 6.8 0 0 0 9.5 10.5Z"/>,
    letter: <><path d="M3.5 6h17v12h-17z"/><path d="m3.5 7 8.5 6 8.5-6"/></>,
    close:  <path d="M6 6l12 12M18 6L6 18"/>,
    refresh:<><path d="M20 12a8 8 0 1 1-2.7-6"/><path d="M20 4v4.5h-4.5"/></>,
    eye:    <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></>,
    chat:   <><path d="M20.5 12c0 4.1-3.8 7.5-8.5 7.5-1 0-2-.15-2.9-.42L3.5 20.5l1.5-4.2A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.5 12 4.5s8.5 3.4 8.5 7.5Z"/><path d="M8.5 10.5h7M8.5 14h4"/></>,
    plus:   <path d="M12 5.5v13M5.5 12h13"/>,
    users:  <><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.8c2 .6 3.2 2.4 3.2 4.7"/></>,
    check:  <path d="M4.5 12.5 9.5 17.5 19.5 7"/>,
  }
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[n]}</svg>
}

function CountUp({value}:{value:number}){
  const [n,setN]=useState(0)
  useEffect(()=>{
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){ setN(value); return }
    let raf=0; const t0=performance.now(); const dur=1000
    const step=(t:number)=>{
      const p=Math.min(1,(t-t0)/dur)
      setN(Math.round(value*(1-Math.pow(1-p,3))))
      if(p<1) raf=requestAnimationFrame(step)
    }
    raf=requestAnimationFrame(step)
    return ()=>cancelAnimationFrame(raf)
  },[value])
  return <>{n}</>
}

const LETTERS: Record<Lang, { name:string, title:string, text:string }[]> = {
  ru: [
    { name:"Влюбленные", title:"Выбор сердца", text:"Сегодня вас тянет друг к другу. Он думает о тебе, когда не пишет." },
    { name:"Солнце", title:"Тепло вдвоем", text:"Вы как power couple. Вас видят вместе даже когда вы порознь." },
    { name:"Звезда", title:"Надежда", text:"Кто-то из вас влюбился сильнее и боится спугнуть." },
  ],
  en: [
    { name:"The Lovers", title:"Heart's choice", text:"You're pulled toward each other today. They think about you even when they don't text." },
    { name:"The Sun", title:"Warm together", text:"Total power couple energy. People see you as a pair even when you're apart." },
    { name:"The Star", title:"Hope", text:"One of you fell harder and is afraid of scaring the other off." },
  ],
}

type Mode = "couple" | "crush" | "friend"
type InputKind = "two" | "joint" | "both"
type Feature = "deep"|"hidden"|"future"|"custom"

const MODES: Record<Lang, { id: Mode, label: string, sub: string }[]> = {
  ru: [
    { id:"couple", label:"Пара",  sub:"уже вместе" },
    { id:"crush",  label:"Краш",  sub:"ещё не пара" },
    { id:"friend", label:"Друг",  sub:"без романтики" },
  ],
  en: [
    { id:"couple", label:"Couple", sub:"already together" },
    { id:"crush",  label:"Crush",  sub:"not yet a couple" },
    { id:"friend", label:"Friend", sub:"no romance" },
  ],
}

/* Формулировка про измены заменена намеренно. Прежний вариант просил у
   модели вердикт о человеке, которого нет в разговоре: такой ответ нельзя
   ни подтвердить, ни отозвать, и именно после него приходили возвраты.
   Тревога осталась той же, но теперь вопрос про наблюдаемое поведение. */
const SUGGESTED_QUESTIONS_EN: Record<Mode, string[]> = {
  couple: [
    "What do they really feel about me?",
    "Should we get married?",
    "Why has it felt cold between us lately?",
    "What are they thinking but not saying?",
    "Why are they pulling away lately?",
    "How do I keep this relationship going?",
  ],
  crush: [
    "Do they even notice me?",
    "Should I make the first move?",
    "What do they think of me?",
    "Do I have a chance?",
    "Why don't they reply right away?",
    "Are they into me or just being polite?",
  ],
  friend: [
    "Can I trust this person?",
    "Do they see me as a close friend?",
    "Should we start a project together?",
    "What do they really think of me?",
    "Why do we talk less lately?",
    "Should I bring them into big plans?",
  ],
}

// Подсказки к полю деталей платного письма: тап дописывает фразу, писать сочинение не обязательно
const LETTER_HINTS: Record<Lang, Record<Mode, string[]>> = {
  ru: {
    couple: ["встречаемся недавно","вместе давно","стало прохладнее","часто ссоримся","недавно поссорились","живём вместе","на расстоянии","думаю о будущем"],
    crush: ["нравится, но молчу","переписываемся","виделись пару раз","не понимаю, взаимно ли","он(а) то пишет, то пропадает","боюсь сделать первый шаг","есть кто-то третий"],
    friend: ["дружим давно","недавно познакомились","стали реже общаться","была ссора","вместе работаем","одна компания"],
  },
  en: {
    couple: ["dating recently","together for years","things cooled down","we argue a lot","just had a fight","living together","long distance","thinking about the future"],
    crush: ["I like them but stay quiet","we text","met a couple of times","not sure it's mutual","they text then vanish","scared to make the first move","there's someone else"],
    friend: ["friends for years","just met","we talk less now","we had a fight","we work together","same friend group"],
  },
}

const SUGGESTED_QUESTIONS: Record<Mode, string[]> = {
  couple: [
    "Что он(а) на самом деле ко мне чувствует?",
    "Стоит ли нам пожениться?",
    "Почему в последнее время холодно между нами?",
    "О чём он(а) думает, но не говорит?",
    "Почему он(а) отдаляется в последнее время?",
    "Как удержать эти отношения?",
  ],
  crush: [
    "Замечает ли он(а) меня вообще?",
    "Стоит ли сделать первый шаг?",
    "Что он(а) думает обо мне?",
    "Есть ли у меня шанс?",
    "Почему он(а) не отвечает сразу?",
    "Я ему(ей) интересен(на) или это вежливость?",
  ],
  friend: [
    "Можно ли доверять этому человеку?",
    "Считает ли он(а) меня близким другом?",
    "Стоит ли начинать совместный проект?",
    "Что он(а) думает обо мне на самом деле?",
    "Почему в последнее время реже общаемся?",
    "Стоит ли звать его(её) в важные планы?",
  ],
}

function pickQuestions(mode: Mode, seed: number, lang: Lang){
  const pool = (lang==="en" ? SUGGESTED_QUESTIONS_EN : SUGGESTED_QUESTIONS)[mode]
  const start = seed % pool.length
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, 4)
}

const MOOD_OPTIONS: Record<Lang, { id:string, label:string }[]> = {
  ru: [
    { id:"up", label:"На подъёме" }, { id:"calm", label:"Спокойно" },
    { id:"tired", label:"Устал(а)" }, { id:"anxious", label:"Тревожно" },
    { id:"sad", label:"Грустновато" },
  ],
  en: [
    { id:"up", label:"Feeling great" }, { id:"calm", label:"Calm" },
    { id:"tired", label:"Tired" }, { id:"anxious", label:"Anxious" },
    { id:"sad", label:"A bit down" },
  ],
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number){
  const words = text.split(" ")
  let line = "", cy = y
  for(const w of words){
    const test = line + w + " "
    if(ctx.measureText(test).width > maxWidth && line !== ""){ ctx.fillText(line, x, cy); line = w + " "; cy += lineHeight }
    else line = test
  }
  ctx.fillText(line, x, cy)
  return cy
}

// Запасные тизеры. Используются ТОЛЬКО если модель почему-то не вернула
// настоящие — тогда лучше показать нейтральную заглушку, чем пустоту.
const FALLBACK_TEASER: Record<Lang, Record<Feature,string>> = {
  ru: {
    deep:   "Разбор начинается с того, что видно на фото раньше всего…",
    hidden: "Первое, что выдаёт настроение — это даже не лицо…",
    future: "Если смотреть трезво, ключевой момент прячется не там…",
    custom: "Ответ начинается с самого неудобного…",
  },
  en: {
    deep:   "The reading starts with what jumps out of the photo first…",
    hidden: "The first thing that gives the mood away isn't even the face…",
    future: "Looking at it honestly, the key moment isn't where you'd expect…",
    custom: "The answer starts with the most awkward part…",
  },
}

export default function Page(){
  /* ── язык ──
     null до монтирования: на сервере Telegram не виден, и без этого англоязычный
     видел бы кадр на русском. Рендер ждёт определения языка (см. конец компонента). */
  const [lang,setLang]=useState<Lang|null>(null)
  const lg: Lang = lang ?? "ru"
  const L = (ru: string, en: string) => tr(lg, ru, en)

  /* ── ввод ── */
  const [inputKind,setInputKind]=useState<InputKind>("two")
  const [p1,setP1]=useState(""); const [p2,setP2]=useState(""); const [pJoint,setPJoint]=useState("")
  const [mode,setMode]=useState<Mode>("couple")
  const [load,setLoad]=useState(false)

  /* ── результат ── */
  const [res,setRes]=useState<{percent:number, full:string}|null>(null)
  const [teasers,setTeasers]=useState<Partial<Record<Feature,string>>>({})
  const [scanId,setScanId]=useState<string|null>(null)
  const [viewingHistoryScan,setViewingHistoryScan]=useState(false)

  const [sealBroken,setSealBroken]=useState(false)
  const [dailyIdx,setDailyIdx]=useState(0)
  const daily = LETTERS[lg][dailyIdx]
  const [sharing,setSharing]=useState(false)

  const [myUserId,setMyUserId]=useState<string|null>(null)
  const [notifyOn,setNotifyOn]=useState(true)
  const [soundOn,setSoundOn]=useState(true)
  const [inviteSessionId,setInviteSessionId]=useState<string|null>(null)
  const [referrerId,setReferrerId]=useState<string|null>(null)
  const [refCredited,setRefCredited]=useState(false)

  const [refCount,setRefCount]=useState(0)
  const [refCredits,setRefCredits]=useState(0)
  const [refToNext,setRefToNext]=useState(3)

  const [historyOpen,setHistoryOpen]=useState(false)
  const [historyItems,setHistoryItems]=useState<any[]>([])
  const [historyLoading,setHistoryLoading]=useState(false)

  /* ── платные разделы ── */
  const [unlocked,setUnlocked]=useState<Record<Feature,boolean>>({deep:false,hidden:false,future:false,custom:false})
  const [opened,setOpened]=useState<Record<Feature,boolean>>({deep:false,hidden:false,future:false,custom:false})
  const [results,setResults]=useState<Record<Feature,string>>({deep:"",hidden:"",future:"",custom:""})
  const [busy,setBusy]=useState<Record<Feature,boolean>>({deep:false,hidden:false,future:false,custom:false})
  const [letterExtra,setLetterExtra]=useState<Record<Feature,string>>({deep:"",hidden:"",future:"",custom:""})   // детали к deep/hidden/future
  const [customQuestion,setCustomQuestion]=useState("")
  const [chipSeed,setChipSeed]=useState(0)
  const [selectedCard,setSelectedCard]=useState<Feature>("deep")
  const [waiting,setWaiting]=useState<string|null>(null)   // ждём подтверждения оплаты

  /* ── подписка ── */
  const [subActive,setSubActive]=useState(false)
  const [subUntil,setSubUntil]=useState<number|null>(null)
  const [subCancelled,setSubCancelled]=useState(false)

  /* ── переписка ── */
  const [chatShots,setChatShots]=useState<string[]>([])
  const [convCredits,setConvCredits]=useState(0)
  const [convLoad,setConvLoad]=useState(false)
  const [convRes,setConvRes]=useState("")

  const [isFounder,setIsFounder]=useState(false)
  const [leaderboardOpen,setLeaderboardOpen]=useState(false)
  const [leaderboardItems,setLeaderboardItems]=useState<any[]>([])
  const [leaderboardLoading,setLeaderboardLoading]=useState(false)
  const [myRank,setMyRank]=useState<number|null>(null)

  const [seasonalUnlocked,setSeasonalUnlocked]=useState(false)
  const [seasonalLoad,setSeasonalLoad]=useState(false)
  const [seasonalRes,setSeasonalRes]=useState("")
  const [seasonalOpened,setSeasonalOpened]=useState(false)
  const activeEvent = getActiveEvent()

  const [todayMood,setTodayMood]=useState<string|null>(null)
  const [moodLoaded,setMoodLoaded]=useState(false)
  const [moodSaving,setMoodSaving]=useState(false)

  const [hasFreeCustomCredit,setHasFreeCustomCredit]=useState(false)
  const [wheelOpen,setWheelOpen]=useState(false)
  const [wheelSpinning,setWheelSpinning]=useState(false)
  const [wheelSpunToday,setWheelSpunToday]=useState(false)
  const [wheelPrize,setWheelPrize]=useState<{prizeId:string,label:string}|null>(null)

  const [similarItems,setSimilarItems]=useState<string[]|null>(null)
  const [similarLoading,setSimilarLoading]=useState(false)

  const resultRef = useRef<HTMLDivElement|null>(null)
  const scanIdRef = useRef<string|null>(null)
  scanIdRef.current = scanId
  const [ageOk,setAgeOk]=useState<boolean|null>(null)   // null — ещё не прочитали
  const [ageGateOpen,setAgeGateOpen]=useState(false)
  const ageNextRef = useRef<(()=>void)|null>(null)
  // 18+ спрашиваем не на входе, а на первом скане: к этому моменту человек уже хочет результат
  const withAge = (fn: ()=>void) => {
    if(ageOk===true){ fn(); return }
    ageNextRef.current = fn
    setAgeGateOpen(true)
  }
  const [ageTick,setAgeTick]=useState(false)

  useEffect(()=>{
    try{ const s=localStorage.getItem("love_scanner_sound"); if(s!==null) setSoundOn(s==="1") }catch{}
    // Возраст спрашиваем один раз. localStorage в WebView Telegram иногда чистится,
    // поэтому дублируем в CloudStorage бота — он живёт на аккаунте, а не на устройстве.
    let local = false
    try{ local = localStorage.getItem("love_scanner_18")==="1" }catch{}
    if(local){ setAgeOk(true); return }
    const cs = tgApp()?.CloudStorage
    if(!cs?.getItem){ setAgeOk(false); return }
    try{
      cs.getItem("age18", (err: unknown, v?: string)=>{
        const ok = !err && v==="1"
        if(ok){ try{ localStorage.setItem("love_scanner_18","1") }catch{} }
        setAgeOk(prev => prev===true ? true : ok)   // поздний ответ не отменяет уже данное подтверждение
      })
    }catch{ setAgeOk(false) }
  },[])

  const confirmAge = () => {
    tapFx()
    setAgeOk(true)
    setAgeGateOpen(false)
    try{ localStorage.setItem("love_scanner_18","1") }catch{}
    try{ tgApp()?.CloudStorage?.setItem?.("age18","1",()=>{}) }catch{}
    const next = ageNextRef.current; ageNextRef.current = null
    next?.()
  }

  useEffect(()=>{
    const l = clientLang()
    setLang(l)
    document.documentElement.lang = l
    setDailyIdx(Math.floor(Math.random()*LETTERS.ru.length))
    const tg = tgApp()
    const userId = tg?.initDataUnsafe?.user?.id
    if(!userId) return
    setMyUserId(String(userId))
    tg?.ready?.()

    // optIn не шлём: подписка на письмо дня оформляется через /start бота или колокольчик,
    // а не молча при каждом запуске.
    post("/api/register-user",{userId,name:tg?.initDataUnsafe?.user?.first_name}).catch(()=>{})

    apiJson(`/api/invite/status`).then(({data:j})=>{
      if(typeof j.count==="number") setRefCount(j.count)
      if(typeof j.credits==="number") setRefCredits(j.credits)
      if(typeof j.toNextReward==="number") setRefToNext(j.toNextReward)
    }).catch(()=>{})

    apiJson(`/api/leaderboard?userId=${userId}`).then(({data:j})=>{
      if(j?.me?.isFounder){ setIsFounder(true); setUnlocked({deep:true,hidden:true,future:true,custom:true}) }
    }).catch(()=>{})

    apiJson(`/api/mood?userId=${userId}`).then(({data:j})=>{ setTodayMood(j.mood||null); setMoodLoaded(true) }).catch(()=>setMoodLoaded(true))

    refreshSubscription()

    const startParam: string|undefined = tg?.initDataUnsafe?.start_param
    if(startParam?.startsWith("ref_")) setReferrerId(startParam.slice(4))

    apiJson(`/api/wheel?userId=${userId}`).then(({data:j})=>{
      setWheelSpunToday(!!j.spunToday); if(j.prize) setWheelPrize(j.prize)
    }).catch(()=>{})

    apiJson(`/api/custom-credit/use`).then(({data:j})=>setHasFreeCustomCredit(!!j.hasCredit)).catch(()=>{})
  },[])

  const refreshSubscription = async () => {
    try{
      const { data } = await apiJson("/api/subscription/status")
      setSubActive(!!data.active)
      setSubUntil(data.until ?? null)
      setSubCancelled(!!data.cancelled)
      setConvCredits(data.conversationCredits ?? 0)
      return !!data.active
    }catch{ return false }
  }

  /* ── звук / хаптика ── */
  const audioCtxRef = useRef<AudioContext|null>(null)
  const getAudioCtx = () => {
    if(!audioCtxRef.current){
      try{ audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)() }catch{ return null }
    }
    return audioCtxRef.current
  }
  const playSoundRaw = (kind:"tap"|"unlock"|"coin"|"spin") => {
    const ctx=getAudioCtx(); if(!ctx) return
    const now=ctx.currentTime
    const tone=(f:number,s:number,d:number,t:OscillatorType="sine",v=0.08)=>{
      const o=ctx.createOscillator(), g=ctx.createGain()
      o.type=t; o.frequency.setValueAtTime(f,now+s)
      g.gain.setValueAtTime(0,now+s); g.gain.linearRampToValueAtTime(v,now+s+0.01)
      g.gain.exponentialRampToValueAtTime(0.0001,now+s+d)
      o.connect(g); g.connect(ctx.destination); o.start(now+s); o.stop(now+s+d+0.02)
    }
    if(kind==="tap") tone(700,0,0.06,"sine",0.05)
    if(kind==="unlock"){ tone(520,0,0.12,"sine",0.07); tone(780,0.08,0.18,"sine",0.08) }
    if(kind==="coin"){ tone(660,0,0.08,"triangle",0.08); tone(880,0.07,0.1,"triangle",0.08); tone(1100,0.14,0.16,"triangle",0.09) }
    if(kind==="spin") tone(300,0,0.4,"sawtooth",0.03)
  }
  const playSound = (k:"tap"|"unlock"|"coin"|"spin") => { if(soundOn) playSoundRaw(k) }
  const haptic = (style:"light"|"medium"|"success"|"error"="light") => {
    const h = tgApp()?.HapticFeedback
    if(!h) return
    if(style==="success") h.notificationOccurred?.("success")
    else if(style==="error") h.notificationOccurred?.("error")
    else h.impactOccurred?.(style==="medium"?"medium":"light")
  }
  const tapFx = () => { playSound("tap"); haptic("light") }

  const toggleSound = () => setSoundOn(prev=>{
    const next=!prev
    try{ localStorage.setItem("love_scanner_sound", next?"1":"0") }catch{}
    if(next) setTimeout(()=>playSoundRaw("tap"),50)
    return next
  })

  const toggleNotify = async () => {
    const next=!notifyOn
    setNotifyOn(next)
    if(myUserId) post("/api/register-user",{userId:myUserId,optIn:next}).catch(()=>{})
  }

  /* ── фото ── */
  const photosForScan = (): string[] => {
    if(inputKind==="joint") return pJoint ? [pJoint] : []
    if(inputKind==="both")  return [p1,p2,pJoint].filter(Boolean)
    return [p1,p2].filter(Boolean)
  }
  const effectiveInput = (): InputKind => {
    if(inputKind==="joint") return "joint"
    return pJoint ? "both" : "two"
  }
  const photosReady = inputKind==="joint" ? !!pJoint : !!(p1 && p2)

  /* ── генерация платных разделов ── */
  // Сервер мог списать покупку и сохранить текст, а ответ до нас не дошёл (свернули TG, моргнула сеть).
  // Тогда повторный тап даёт 402 — забираем готовый текст из скана, а не пишем «оплата не подтвердилась».
  const syncFeature = async (feature: Feature, sid: string) => {
    try{
      const { data } = await apiJson(`/api/scan?scanId=${sid}`)
      const sc = data?.scan
      if(!sc || scanIdRef.current!==sid) return false
      const text = sc.results?.[feature]
      if(!sc.unlocked?.[feature] && text){
        setResults(r=>({...r,[feature]:text}))
        setUnlocked(u=>({...u,[feature]:false}))
        setOpened(o=>({...o,[feature]:false}))
        return true
      }
    }catch{}
    return false
  }

  const generate = async (feature: Feature, extraOverride?: string) => {
    if(viewingHistoryScan || !scanId) return
    const sid = scanId
    setBusy(b=>({...b,[feature]:true}))
    try{
      const { status, data } = await post("/api/love",{
        photos: photosForScan(),
        input: effectiveInput(),
        type: feature,
        extra: feature==="custom" ? (extraOverride ?? customQuestion) : letterExtra[feature],
        mode,
        scanId: sid,
        teaser: teasers[feature] || "",
      })
      // Пока ждали, сделали новый скан — ответ старого в новый не пишем
      if(scanIdRef.current!==sid){ setBusy(b=>({...b,[feature]:false})); return }
      if(status===402){
        if(!(await syncFeature(feature, sid)))
          setResults(r=>({...r,[feature]:L("Оплата ещё не подтвердилась. Подожди пару секунд и нажми ещё раз.","Payment isn't confirmed yet. Wait a couple of seconds and tap again.")}))
      } else if((status===422 || status===409 || status===400) && data?.error){
        // Отказ по входу или разбор уже пишется: повтор сразу даст то же самое, поэтому говорим причину
        setResults(r=>({...r,[feature]:data.error}))
      } else if(status!==200 || !data.full){
        // Не сохраняем заглушку как платный разбор. Повторный тап бесплатен: при сбое сервер вернул покупку.
        setResults(r=>({...r,[feature]:L("Не получилось собрать разбор. Попробуй ещё раз — повторно платить не нужно.","Couldn't put the reading together. Try again, you won't be charged twice.")}))
      } else {
        setResults(r=>({...r,[feature]:data.full}))
        // Текст сервер сохранил в скан сам. Разовая покупка потрачена — плашка снова в виде покупки,
        // иначе поле для текста висит открытым, а новый разбор уже не пройдёт.
        if(data.consumed){
          setUnlocked(u=>({...u,[feature]:false}))
          setOpened(o=>({...o,[feature]:false}))
          if(feature==="custom") setCustomQuestion("")
          else setLetterExtra(x=>({...x,[feature]:""}))
        }
      }
    }catch{
      if(!(await syncFeature(feature, sid)))
        setResults(r=>({...r,[feature]:L("Сеть подвела. Попробуй ещё раз.","Network hiccup. Try again.")}))
    }
    setBusy(b=>({...b,[feature]:false}))
  }

  const checkSeasonal = async () => {
    if(!activeEvent || viewingHistoryScan) return
    setSeasonalLoad(true)
    try{
      const { data } = await post("/api/love",{ photos:photosForScan(), input:effectiveInput(), type:"seasonal", mode, eventId:activeEvent.id, scanId })
      setSeasonalRes(data.full || data.error || L("Не получилось. Попробуй ещё раз.","Didn't work. Try again."))
    }catch{ setSeasonalRes(L("Не получилось. Попробуй ещё раз.","Didn't work. Try again.")) }
    setSeasonalLoad(false)
  }

  /* ── ожидание подтверждения оплаты ──
     Раньше доступ выдавал сам клиент сразу после openInvoice. Теперь права
     появляются на сервере, когда до него доедет вебхук Telegram — обычно за
     доли секунды, но иногда чуть дольше. Поэтому опрашиваем. */
  const waitForUnlock = async (feature: Feature|"bundle") => {
    for(let i=0;i<12;i++){
      await sleep(i===0 ? 400 : 900)
      try{
        const { data } = await apiJson(`/api/scan?scanId=${scanId}`)
        const u = data?.scan?.unlocked || {}
        if(data?.subscriber) return true
        if(feature==="bundle" ? (u.deep && u.hidden && u.future) : u[feature]) return true
      }catch{}
    }
    return false
  }

  const waitForSubscription = async () => {
    for(let i=0;i<12;i++){
      await sleep(i===0 ? 400 : 900)
      if(await refreshSubscription()) return true
    }
    return false
  }

  const waitForConvCredit = async () => {
    for(let i=0;i<12;i++){
      await sleep(i===0 ? 400 : 900)
      try{
        const { data } = await apiJson("/api/subscription/status")
        if(data.active || (data.conversationCredits ?? 0) > 0){
          setConvCredits(data.conversationCredits ?? 0)
          setSubActive(!!data.active)
          return true
        }
      }catch{}
    }
    return false
  }

  const applyUnlock = (feature: Feature|"bundle") => {
    playSound("coin"); haptic("success")
    // Повторная покупка: старый ответ убираем, чтобы он не висел под новой формой
    const fs: Feature[] = feature==="bundle" ? ["deep","hidden","future"] : [feature]
    setUnlocked(u=>{ const n={...u}; fs.forEach(f=>{ n[f]=true }); return n })
    setResults(r=>{ const n={...r}; fs.forEach(f=>{ n[f]="" }); return n })
  }

  /* ── покупка ── */
  const buy = async (feature: Feature|"bundle"|"seasonal"|"conversation"|"sub") => {
    const tg = tgApp()
    if(!tg){ notify(L("Открой приложение через бота","Open the app through the bot")); return }
    tg.ready()

    // Бесплатный кредит с колеса — оплату минуем целиком.
    // Списание и разблокировка происходят одним запросом на сервере:
    // раньше клиент звал сначала /api/custom-credit/use, потом unlock,
    // и кредит уходил дважды.
    if(feature==="custom" && hasFreeCustomCredit && scanId){
      const { data } = await post("/api/scan/unlock",{ scanId, feature:"custom", source:"credit" })
      if(data?.ok){ setHasFreeCustomCredit(false); applyUnlock("custom"); return }
      notify(L("Бесплатный разбор уже использован","The free reading is already used"), ()=>setHasFreeCustomCredit(false))
      return
    }

    const needsScan = feature!=="sub" && feature!=="conversation" && feature!=="seasonal"
    if(needsScan && !scanId){ notify(L("Сначала сделай скан","Do a scan first")); return }

    setWaiting(feature)
    try{
      const { status, data } = await post("/api/stars/create",{
        feature,
        scanId: needsScan ? scanId : undefined,
        eventId: feature==="seasonal" ? activeEvent?.id : undefined,
      })
      if(status===409){ await refreshSubscription(); setWaiting(null); notify(L("Подписка уже активна","Your subscription is already active")); return }
      if(!data.invoiceLink){ setWaiting(null); notify(L("Оплата не открылась: ","Payment didn't open: ")+(data.error||L("нет ссылки","no link"))); return }

      tg.openInvoice(data.invoiceLink, async (s: string)=>{
        if(s!=="paid"){ setWaiting(null); return }

        if(feature==="sub"){
          const ok = await waitForSubscription()
          if(ok){ playSound("coin"); haptic("success"); setUnlocked({deep:true,hidden:true,future:true,custom:true}) }
          setWaiting(null); return
        }
        if(feature==="conversation"){
          await waitForConvCredit()
          playSound("coin"); haptic("success")
          setWaiting(null); return
        }
        if(feature==="seasonal"){
          setSeasonalUnlocked(true); playSound("coin"); haptic("success")
          setWaiting(null); return
        }

        const ok = await waitForUnlock(feature)
        if(ok){ applyUnlock(feature); setWaiting(null); return }
        // Из истории письмо не дописать (фото там не хранятся), поэтому держим человека здесь
        // и ждём подтверждение дольше, а не отправляем в историю.
        notify(L("Оплата прошла, подтверждение задерживается. Не закрывай приложение — письмо откроется само.","Payment went through, confirmation is slow. Keep the app open, the letter will unlock by itself."))
        if(await waitForUnlock(feature) || await waitForUnlock(feature)) applyUnlock(feature)
        else notify(L("Подтверждение так и не пришло. Повторно не плати: Telegram иногда доставляет его с задержкой.","Confirmation never arrived. Don't pay again: Telegram sometimes delivers it late."))
        setWaiting(null)
      })
    }catch(e:any){ setWaiting(null); notify(e.message) }
  }

  // Один запрос: сервер сам списывает кредит и открывает разбор. Если
  // запись не сохранится, кредит вернётся на место — на клиенте об этом
  // думать не нужно.
  const useReferralCredit = async (feature: Feature = "deep") => {
    if(!myUserId || refCredits<=0 || !scanId) return
    const { data } = await post("/api/scan/unlock",{ scanId, feature, source:"referral" })
    if(data?.ok){
      setRefCredits(data.remaining ?? refCredits-1)
      applyUnlock(feature)
    } else {
      notify(L("Бесплатных разборов не осталось","No free readings left"), ()=>setRefCredits(0))
    }
  }

  /* ── скан ── */
  const check = async () => {
    if(!photosReady) return notify(inputKind==="joint" ? L("Добавь совместное фото","Add a photo of you together") : L("Нужны оба фото","Both photos are needed"))
    setLoad(true)
    try{
      const salt = Date.now()+"_"+Math.random().toString(36).slice(2)
      const newScanId = (crypto as any)?.randomUUID ? crypto.randomUUID() : salt
      const { status, data } = await post("/api/love",{
        photos: photosForScan(), input: effectiveInput(),
        type:"short", salt, mode, mood: todayMood,
      })
      // Любой не-200 (лимит, перегрузка, обрыв) — это ошибка, а не результат.
      // Раньше рисовалось то, что вернул сервер, включая выдуманный процент.
      if(status!==200 || typeof data?.percent!=="number"){
        setLoad(false)
        return notify(data?.error || L("Скан не удался. Попробуй ещё раз.","Scan failed. Try again."))
      }

      setRes({ percent:data.percent, full:data.full })
      setTeasers(data.teasers || {})
      setScanId(newScanId)
      setSimilarItems(null)
      setViewingHistoryScan(false)
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:"auto",block:"start"}),120)

      // Новая пара фото — новый скан. Всё платное снова закрыто, кроме
      // подписки: подписчику блокировать нечего.
      const fresh = subActive || isFounder
      setUnlocked({deep:fresh,hidden:fresh,future:fresh,custom:fresh})
      setOpened({deep:false,hidden:false,future:false,custom:false})
      setResults({deep:"",hidden:"",future:"",custom:""})
      setLetterExtra({deep:"",hidden:"",future:"",custom:""}); setCustomQuestion("")

      if(typeof data.percent==="number" && data.full){
        post("/api/similar",{percent:data.percent, snippet:String(data.full).slice(0,120), mode}).catch(()=>{})
      }

      if(myUserId){
        const saved = await post("/api/scan",{
          scanId:newScanId, mode, input:effectiveInput(),
          percent:data.percent, full:data.full, teasers:data.teasers||undefined,
        })
        // Не сохранился скан — оплата письма потом не найдёт его (webhook кидает «scan not found»).
        // Лучше сказать сразу, чем брать деньги за то, что не откроется.
        if(saved.status!==200) notify(L("Скан не сохранился, покупки для него пока недоступны. Попробуй просканировать ещё раз.","The scan wasn't saved, so purchases for it aren't available. Try scanning again."))
        if(referrerId && !refCredited){
          post("/api/invite/complete",{referrerId})
            .then(r=>{ if(r.status===200) setRefCredited(true) })   // при сбое повторим на следующем скане
            .catch(()=>{})
        }
      }
    }catch{
      notify(L("Скан не удался. Проверь связь и попробуй ещё раз.","Scan failed. Check your connection and try again."))
    }
    setLoad(false)
  }

  /* ── разбор переписки ── */
  const runConversation = async () => {
    if(chatShots.length===0) return
    setConvLoad(true)
    try{
      const { status, data } = await post("/api/love",{
        photos: chatShots, input:"chat", type:"conversation", mode,
      })
      if(status===402){ setConvRes(L("Оплата ещё не подтвердилась, подожди пару секунд.","Payment isn't confirmed yet, wait a couple of seconds.")) }
      else setConvRes(data.full || (status===422 ? data.error : "") || L("Не получилось разобрать переписку. Попробуй ещё раз.","Couldn't read the chat. Try again."))
      refreshSubscription()
    }catch{ setConvRes(L("Сеть подвела. Попробуй ещё раз.","Network hiccup. Try again.")) }
    setConvLoad(false)
  }

  const addShots = async (files: FileList) => {
    const room = MAX_CHAT_SHOTS - chatShots.length
    if(room<=0) return
    const picked = Array.from(files).slice(0,room)
    const out: string[] = []
    for(const f of picked){ try{ out.push(await compressShot(f)) }catch{} }
    setChatShots(s=>[...s,...out])
  }

  /* ── история ── */
  const openHistory = async () => {
    setHistoryOpen(true)
    if(!myUserId) return
    setHistoryLoading(true)
    try{
      const { data } = await apiJson(`/api/scan/list?userId=${myUserId}`)
      setHistoryItems(data.items || [])
    }catch{}
    setHistoryLoading(false)
  }

  const openHistoryScan = async (id: string) => {
    try{
      const { data } = await apiJson(`/api/scan?scanId=${id}`)
      const s = data.scan
      if(!s) return
      setRes({ percent:s.percent, full:s.full })
      setTeasers(s.teasers || {})
      setScanId(s.scanId)
      setMode(s.mode)
      setViewingHistoryScan(true)
      setHistoryOpen(false)
      setUnlocked({deep:!!s.unlocked.deep,hidden:!!s.unlocked.hidden,future:!!s.unlocked.future,custom:!!s.unlocked.custom})
      setOpened({deep:!!s.unlocked.deep,hidden:!!s.unlocked.hidden,future:!!s.unlocked.future,custom:!!s.unlocked.custom})
      setResults({deep:s.results.deep||"",hidden:s.results.hidden||"",future:s.results.future||"",custom:s.results.custom||""})
      setSimilarItems(null)
    }catch{}
  }

  const openLeaderboard = async () => {
    setLeaderboardOpen(true); setLeaderboardLoading(true)
    try{
      const { data } = await apiJson(`/api/leaderboard${myUserId?`?userId=${myUserId}`:""}`)
      setLeaderboardItems(data.top || [])
      setMyRank(data?.me?.rank ?? null)
      if(data?.me?.isFounder){ setIsFounder(true); setUnlocked({deep:true,hidden:true,future:true,custom:true}) }
    }catch{}
    setLeaderboardLoading(false)
  }

  const spinWheel = async () => {
    if(!myUserId || wheelSpinning || wheelSpunToday) return
    setWheelSpinning(true); playSound("spin"); haptic("medium")
    try{
      const { data } = await post("/api/wheel",{userId:myUserId})
      await sleep(1400)
      if(data.prize){
        setWheelPrize(data.prize); setWheelSpunToday(true)
        playSound("coin"); haptic("success")
        if(data.prize.prizeId==="free_custom") setHasFreeCustomCredit(true)
        // Кредит сервер уже начислил, но без этого кнопка «Забрать» появлялась только после перезапуска.
        if(data.prize.prizeId==="ref_credit" && !data.alreadySpun) setRefCredits(c=>c+1)
      } else notify(L("Колесо не докрутилось. Попробуй ещё раз чуть позже.","The wheel got stuck. Try again a bit later."))
    }catch{ notify(L("Сеть подвела. Попробуй ещё раз.","Network hiccup. Try again.")) }
    setWheelSpinning(false)
  }

  const saveMood = async (moodId: string) => {
    if(!myUserId) return
    setMoodSaving(true)
    try{ await post("/api/mood",{userId:myUserId, mood:moodId}); setTodayMood(moodId) }catch{}
    setMoodSaving(false)
  }

  const loadSimilar = async () => {
    if(!res) return
    setSimilarLoading(true)
    try{
      const { data } = await apiJson(`/api/similar?percent=${res.percent}&mode=${mode}`)
      setSimilarItems(data.items || [])
    }catch{ setSimilarItems([]) }
    setSimilarLoading(false)
  }

  const shareResult = async () => {
    if(!res) return
    setSharing(true)
    try{
      const canvas=document.createElement("canvas"); canvas.width=1080; canvas.height=1350
      const ctx=canvas.getContext("2d")!
      const bg=ctx.createLinearGradient(0,0,0,1350); bg.addColorStop(0,"#0A0908"); bg.addColorStop(1,"#1c0f0f")
      ctx.fillStyle=bg; ctx.fillRect(0,0,1080,1350)
      const g1=ctx.createRadialGradient(860,140,10,860,140,420)
      g1.addColorStop(0,"rgba(233,199,123,0.32)"); g1.addColorStop(1,"rgba(233,199,123,0)")
      ctx.fillStyle=g1; ctx.fillRect(0,0,1080,1350)
      const g2=ctx.createRadialGradient(160,1200,10,160,1200,420)
      g2.addColorStop(0,"rgba(193,39,45,0.32)"); g2.addColorStop(1,"rgba(193,39,45,0)")
      ctx.fillStyle=g2; ctx.fillRect(0,0,1080,1350)
      ctx.strokeStyle="rgba(233,199,123,0.22)"; ctx.lineWidth=2; ctx.strokeRect(56,56,968,1238)
      ctx.textAlign="center"
      ctx.fillStyle="rgba(244,239,231,0.55)"; ctx.font="500 28px 'JetBrains Mono', monospace"
      ctx.fillText(L("L O V E   S C A N N E R   ·   А Р Х И В   № 1 7","L O V E   S C A N N E R   ·   A R C H I V E   № 1 7"), 540, 160)
      ctx.fillStyle="#C1272D"; ctx.font="italic 300px Georgia, serif"
      ctx.fillText(`${res.percent}%`, 540, 560)
      ctx.fillStyle="rgba(244,239,231,0.5)"; ctx.font="500 26px 'JetBrains Mono', monospace"
      ctx.fillText(L("С О В М Е С Т И М О С Т Ь","C O M P A T I B I L I T Y"), 540, 626)
      ctx.fillStyle="#F4EFE7"; ctx.font="italic 300 42px Georgia, serif"
      wrapCanvasText(ctx, L("«","“")+(res.full||"").slice(0,120).trim()+L("…»","…”"), 540, 790, 800, 58)
      ctx.fillStyle="rgba(244,239,231,0.35)"; ctx.font="24px 'JetBrains Mono', monospace"
      ctx.fillText(L("проверь свою → @lovescan_ai_bot","check yours → @lovescan_ai_bot"), 540, 1240)

      // Ссылка ведёт в приложение и несёт ref_<мой id>: человек, пришедший по ней, засчитается мне.
      // Раньше делились одной картинкой без ссылки, и вирусность была нулевой.
      const link = myUserId ? appLink(`ref_${myUserId}`) : appLink()
      const shareText = L(`Наша совместимость ${res.percent}% 💘 Проверь свою: ${link}`, `We're a ${res.percent}% match 💘 Check yours: ${link}`)

      canvas.toBlob(async (blob)=>{
        if(!blob){ setSharing(false); return }
        const file=new File([blob],"love-scanner.png",{type:"image/png"})
        const nav=navigator as any
        try{
          if(nav.canShare && nav.canShare({files:[file]})){
            await nav.share({files:[file],title:"Love Scanner",text:shareText})
            setSharing(false); return
          }
        }catch{}
        // В Telegram Desktop и части вебвью файлы через Web Share не уходят. Скачанный png
        // там никому не нужен, поэтому шлём в чат текст со ссылкой.
        const tg = tgApp()
        if(tg?.openTelegramLink){
          tg.openTelegramLink(shareLink(link, L(`Наша совместимость ${res.percent}% 💘 Проверь свою`, `We're a ${res.percent}% match 💘 Check yours`)))
          setSharing(false); return
        }
        const url=URL.createObjectURL(blob)
        const a=document.createElement("a"); a.href=url; a.download="love-scanner.png"; a.click()
        URL.revokeObjectURL(url); setSharing(false)
      },"image/png")
    }catch{ setSharing(false) }
  }

  // Сторис: Telegram принимает публичный URL картинки и ссылку-виджет. Метод есть с Bot API 7.8,
  // поэтому кнопка показывается только там, где он реально доступен.
  const canShareStory = () => {
    const tg = tgApp()
    return !!(tg?.shareToStory && tg?.isVersionAtLeast?.("7.8"))
  }
  const shareStory = () => {
    if(!res) return
    const tg = tgApp()
    if(!canShareStory()) return
    const link = myUserId ? appLink(`ref_${myUserId}`) : appLink()
    const media = `${window.location.origin}/api/og?p=${res.percent}&m=${mode}&l=${lg}&f=story`
    try{
      tg.shareToStory(media, { text: L(`Наша совместимость ${res.percent}% 💘`, `We're a ${res.percent}% match 💘`), widget_link: { url: link, name: L("Проверить свою","Check yours") } })
    }catch{ notify(L("Не получилось открыть сторис. Попробуй обычное «Поделиться».","Couldn't open stories. Try the regular Share.")) }
  }

  /* ── стили ── */
  const glass:React.CSSProperties = {
    background:"linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.018))",
    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
    border:`1px solid ${C.line}`,
  }
  const label:React.CSSProperties = { fontSize:F.xs, letterSpacing:"0.14em", textTransform:"uppercase", color:C.ink55 }
  const Dots = () => <span className="loader-dots"><span>·</span><span>·</span><span>·</span></span>
  const Rule = ({children,right}:{children:React.ReactNode,right?:React.ReactNode}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
      <p className="mono" style={label}>{children}</p>
      <div style={{flex:1,height:1,background:C.lineSoft}}/>
      {right}
    </div>
  )
  const AnswerBox = ({text}:{text:string}) => (
    <div className="ai-font" style={{marginTop:12,borderRadius:R.sm,background:"rgba(255,255,255,0.045)",border:`1px solid ${C.line}`,borderLeft:`2px solid ${C.gold}66`,padding:14,fontSize:F.md,whiteSpace:"pre-wrap",overflowWrap:"anywhere",color:C.ink}}>{text}</div>
  )
  const Skeleton = ({h=64}:{h?:number}) => <div className="skeleton" style={{marginTop:12,borderRadius:R.sm,height:h,border:`1px solid ${C.line}`}}/>

  const ringLen = 2*Math.PI*52
  const ringOffset = ringLen - ((res?.percent ?? 0)/100)*ringLen*0.75
  const highChance = res ? res.percent>=75 : false

  function IconBtn({on=false,onClick,title,children}:{on?:boolean,onClick:()=>void,title:string,children:React.ReactNode}){
    // Хит-зона 44x44 через padding+отрицательный margin — сама иконка и
    // видимый фон-кружок остаются 32x32, соседние кнопки в шапке не раздвигаются.
    return (
      <button onClick={()=>{tapFx();onClick()}} title={title} aria-label={title} className="icon-btn" style={{width:32,height:32,padding:6,margin:-6,boxSizing:"content-box",borderRadius:R.pill,border:"none",cursor:"pointer",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{width:32,height:32,borderRadius:R.pill,display:"flex",alignItems:"center",justifyContent:"center",background:on?`${C.gold}1f`:"transparent",color:on?C.gold:C.ink50}}>{children}</span>
      </button>
    )
  }

  function EnvelopeReveal({onOpen}:{onOpen:()=>void}){
    const [flipping,setFlipping]=useState(false)
    return (
      <div className="seal-card" style={{position:"relative",width:"100%",height:104,cursor:"pointer",perspective:"1200px",marginTop:12}}
        onClick={()=>{ if(flipping) return; setFlipping(true); playSound("unlock"); haptic("medium"); setTimeout(onOpen,650) }}>
        <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .65s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:flipping?"rotateY(180deg)":"rotateY(0deg)"}}>
          <div style={{position:"absolute",inset:0,borderRadius:R.md,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,overflow:"hidden",backfaceVisibility:"hidden",background:`linear-gradient(135deg, ${C.gold}1c, rgba(255,255,255,0.02))`,border:`1px solid ${C.gold}44`}}>
            <div className="seal" style={{width:38,height:38,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, ${C.goldSoft}, ${C.gold} 55%, #a3822f)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.goldInk}}><Ico n="spark" s={16}/></div>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,letterSpacing:"0.06em"}}>{L("Оплачено — нажми, чтобы вскрыть","Paid · tap to break the seal")}</p>
          </div>
          <div style={{position:"absolute",inset:0,borderRadius:R.md,backfaceVisibility:"hidden",transform:"rotateY(180deg)",background:"rgba(255,255,255,0.03)"}}/>
        </div>
      </div>
    )
  }

  /* Тизер теперь настоящий: это буквально первое предложение платного
     разбора, и при покупке оно уходит обратно в промпт как обязательное
     начало текста. Человек получает продолжение того, что видел. */
  function Teaser({feature}:{feature:Feature}){
    const text = teasers[feature] || FALLBACK_TEASER[lg][feature]
    return (
      <div style={{position:"relative",marginTop:12,height:72,overflow:"hidden"}}>
        <p className="ai-font teaser-veil" style={{fontSize:F.md}}>{text}</p>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:22}}>
          <span className="mono" style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 12px",borderRadius:R.pill,background:"rgba(10,9,8,0.6)",border:`1px solid ${C.line}`,color:C.ink50,fontSize:F.xs,letterSpacing:"0.06em"}}>
            <Ico n="lock" s={12}/> {L("продолжение запечатано","the rest is sealed")}
          </span>
        </div>
      </div>
    )
  }

  const CARDS: {id:Feature, ico:IcoName, title:string, sub:string}[] = [
    { id:"deep",   ico:"layers", title:L("Глубокий разбор","Deep reading"), sub:L("Характеры, ред флаги, что делать","Personalities, red flags, what to do") },
    { id:"hidden", ico:"mask",   title:L("Что не говорит","What's unsaid"),  sub:L("Скрытые эмоции по языку тела","Hidden emotions in body language") },
    { id:"future", ico:"moon",   title:mode==="friend"?L("Будущее дружбы","Future of your friendship"):mode==="crush"?L("Что будет дальше","What happens next"):L("Будущее пары","Your future together"), sub:mode==="friend"?L("Останетесь ли близки","Will you stay close"):mode==="crush"?L("Есть ли шанс","Is there a chance"):L("Расстанетесь или вместе","Split up or stay together") },
    { id:"custom", ico:"letter", title:L("Свой вопрос","Your question"),     sub:L("Спроси что угодно про этих двоих","Ask anything about these two") },
  ]
  const current = CARDS.find(c=>c.id===selectedCard)!
  const allThree = unlocked.deep && unlocked.hidden && unlocked.future
  // Бандл — только когда ни одно из трёх не куплено: иначе платят за уже оплаченное
  const anyOfThree = unlocked.deep || unlocked.hidden || unlocked.future

  // вызывается как функция, а не <PhotoSlot/>: компонент, объявленный в рендере, перемонтируется
  // на каждый setState, и SmartImg заново гасит/проявляет фото
  const PhotoSlot = ({img,onPick,label:lab,ratio="4/5"}:{img:string,onPick:(s:string)=>void,label:string,ratio?:string}) => (
    <label className="photo-card" style={{cursor:"pointer",display:"block"}}>
      <div style={{...glass,borderRadius:R.md,padding:7,border:img?`1px solid ${C.line}`:"1px dashed rgba(255,255,255,0.16)",boxShadow:img?"0 12px 30px rgba(0,0,0,0.4)":"none"}}>
        <div style={{width:"100%",aspectRatio:ratio,borderRadius:R.sm,overflow:"hidden",position:"relative",background:"rgba(255,255,255,0.025)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
          {img ? <SmartImg src={img}/> : <>
            <span style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${C.line}`,display:"flex",alignItems:"center",justifyContent:"center",color:C.ink55}}><Ico n="plus" s={14}/></span>
            <span className="mono" style={{fontSize:F.xs,color:C.ink55}}>{L("добавить","add")}</span>
          </>}
          {load && img && <div className="scan-sweep"/>}
        </div>
        <p className="mono" style={{fontSize:F.xs,textAlign:"center",marginTop:8,color:img?C.ink50:C.ink55}}>{lab}</p>
      </div>
      <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compressPhoto(f).then(onPick)}}/>
    </label>
  )

  if(!lang) return null

  return (
    <>
      <style>{`
        *{ box-sizing:border-box }
        ::-webkit-scrollbar{ display:none }
        button:focus-visible, textarea:focus-visible, label:focus-visible{ outline:2px solid ${C.gold}; outline-offset:2px }
        .serif{ font-family:'Instrument Serif',serif; font-weight:400 }
        .mono{ font-family:'JetBrains Mono',monospace }
        .ai-font{ font-family:'Newsreader',serif; font-style:italic; font-weight:300; line-height:1.72; overflow-wrap:anywhere }
        @keyframes fadeUp{ from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:translateY(0)} }
        @keyframes drift{ 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,-14px) scale(1.06)} }
        @keyframes sealPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(193,39,45,.4)} 50%{box-shadow:0 0 0 9px rgba(193,39,45,0)} }
        @keyframes blink{ 0%,80%,100%{opacity:.15} 40%{opacity:1} }
        @keyframes shimmerText{ to{background-position:-200% 0} }
        @keyframes ringDraw{ from{stroke-dashoffset:${ringLen}} }
        @keyframes scanSweep{ 0%{transform:translateY(-120%)} 100%{transform:translateY(320%)} }
        @keyframes skeletonWave{ to{background-position:-200% 0} }
        @keyframes spin{ from{transform:rotate(0deg)} to{transform:rotate(1080deg)} }
        .reveal{ opacity:0; animation:fadeUp .6s cubic-bezier(.16,1,.3,1) forwards }
        .blob{ animation:drift 22s ease-in-out infinite }
        .seal{ animation:sealPulse 3.4s ease-in-out infinite }
        .seal-card{ transition:transform .2s } .seal-card:active{ transform:scale(.99) }
        .photo-card{ transition:transform .3s cubic-bezier(.16,1,.3,1) } .photo-card:active{ transform:scale(.985) }
        .cta{ transition:transform .18s, box-shadow .25s, opacity .2s } .cta:active{ transform:scale(.985) }
        .unlock-btn{ transition:transform .16s, background .2s, border-color .2s } .unlock-btn:active{ transform:scale(.96) }
        .icon-btn{ transition:transform .16s, background .2s, color .2s } .icon-btn:active{ transform:scale(.9) }
        .shimmer-price{ background:linear-gradient(90deg, ${C.gold}, #fff3d0, ${C.gold}); background-size:220% auto; -webkit-background-clip:text; background-clip:text; color:transparent; animation:shimmerText 4s linear infinite }
        .loader-dots span{ display:inline-block; animation:blink 1.3s infinite }
        .loader-dots span:nth-child(2){ animation-delay:.2s } .loader-dots span:nth-child(3){ animation-delay:.4s }
        .ring-anim{ animation:ringDraw 1.1s cubic-bezier(.16,1,.3,1) forwards }
        .letter-area{ transition:border-color .2s, background .2s }
        .letter-area:focus{ outline:none; border-color:${C.gold}66; background:rgba(255,255,255,0.06) }
        .letter-area::placeholder{ color:${C.ink35} }
        .teaser-veil{ filter:blur(4.5px); opacity:.55; user-select:none; pointer-events:none; margin:0;
          -webkit-mask-image:linear-gradient(180deg,#000 0%,#000 30%,transparent 100%);
          mask-image:linear-gradient(180deg,#000 0%,#000 30%,transparent 100%) }
        .scan-sweep{ position:absolute; left:0; right:0; height:32%; background:linear-gradient(180deg, transparent, ${C.gold}55, transparent); animation:scanSweep 1.6s ease-in-out infinite; pointer-events:none }
        .skeleton{ background:linear-gradient(90deg, rgba(255,255,255,.03) 25%, rgba(255,255,255,.075) 37%, rgba(255,255,255,.03) 63%); background-size:400% 100%; animation:skeletonWave 1.4s linear infinite }
        .strike{ text-decoration:line-through; opacity:.45 }
        @media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important } }
      `}</style>

      {/* ФОНОВЫЙ СЛОЙ.
          Декоративные пятна живут в отдельном фиксированном слое со своей
          обрезкой. Раньше overflow:hidden стоял на корневом контейнере и
          отрезал всё, что не влезло в первый экран — из-за этого страница
          не прокручивалась после появления разбора. */}
      <div style={{position:"fixed",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0,background:C.bg}}>
        <div className="blob" style={{position:"absolute",top:-140,left:-100,width:340,height:340,borderRadius:"50%",background:`radial-gradient(circle, ${C.red}3d, transparent 70%)`,filter:"blur(64px)"}}/>
        <div className="blob" style={{position:"absolute",bottom:-160,right:-120,width:380,height:380,borderRadius:"50%",background:`radial-gradient(circle, ${C.gold}2b, transparent 70%)`,filter:"blur(72px)",animationDelay:"5s"}}/>
      </div>

      {/* КОНТЕНТ. Ни ограничений по высоте, ни overflow — прокручивается
          обычным документом. 100dvh вместо 100vh: на iOS второй не учитывает
          системные панели, и низ страницы уезжает под них. */}
      <div style={{position:"relative",zIndex:1,minHeight:"100dvh",width:"100%",display:"flex",justifyContent:"center",color:C.ink,fontFamily:"'JetBrains Mono', monospace"}}>
        <div style={{width:420,maxWidth:"100%",display:"flex",flexDirection:"column",flex:1,padding:`0 0 calc(32px + env(safe-area-inset-bottom))`}}>

        <div style={{padding:`${PAD}px ${PAD}px 0`}}><InviteBanner onJoin={setInviteSessionId} /></div>

        {/* шапка */}
        <div className="reveal" style={{padding:`22px ${PAD}px 0`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <p className="mono" style={label}>{L("Совместимость по фото","Compatibility from photos")}</p>
            <div style={{display:"flex",alignItems:"center",gap:2,padding:3,borderRadius:R.pill,...glass}}>
              {(isFounder || subActive) && (
                <div title={subActive?L("Подписка активна","Subscription active"):"Founder"} style={{width:32,height:32,borderRadius:R.pill,display:"flex",alignItems:"center",justifyContent:"center",color:C.gold,background:`${C.gold}1f`}}><Ico n="crown" s={15}/></div>
              )}
              <IconBtn onClick={openLeaderboard} title={L("Лидерборд","Leaderboard")}><Ico n="trophy"/></IconBtn>
              <div style={{position:"relative"}}>
                <IconBtn on={!wheelSpunToday} onClick={()=>setWheelOpen(true)} title={L("Колесо дня","Wheel of the day")}><Ico n="wheel"/></IconBtn>
                {!wheelSpunToday && <span style={{position:"absolute",top:2,right:2,width:7,height:7,borderRadius:"50%",background:C.red,border:`1.5px solid ${C.bg}`}}/>}
              </div>
              <IconBtn onClick={openHistory} title={L("История сканов","Scan history")}><Ico n="archive"/></IconBtn>
              <IconBtn on={notifyOn} onClick={toggleNotify} title={L("Уведомления","Notifications")}><Ico n={notifyOn?"bell":"bellOff"}/></IconBtn>
              <IconBtn on={soundOn} onClick={toggleSound} title={L("Звук","Sound")}><Ico n={soundOn?"sound":"mute"}/></IconBtn>
            </div>
          </div>
          <h1 className="serif" style={{fontSize:F.hero,lineHeight:0.94,marginTop:14,letterSpacing:"-0.01em"}}>Love<br/><i>Scanner</i></h1>
          <p className="ai-font" style={{fontSize:F.lg,color:C.ink70,marginTop:8}}>{L("Загрузи два фото, и за 10 секунд узнаешь процент совместимости и что между вами.","Upload two photos and in 10 seconds see your compatibility score and what's really between you.")}</p>
          {!res && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:16}}>
                {[["1",L("Выбери, кто на фото","Pick who's in the photo")],["2",L("Добавь фото","Add photos")],["3",L("Получи процент и разбор","Get your score and reading")]].map(([n,t])=>(
                  <div key={n} style={{padding:"10px 8px",borderRadius:R.sm,...glass,textAlign:"center"}}>
                    <div className="serif" style={{fontSize:F.xl,color:C.gold,lineHeight:1}}>{n}</div>
                    <div className="mono" style={{fontSize:F.micro,color:C.ink55,marginTop:6,lineHeight:1.35}}>{t}</div>
                  </div>
                ))}
              </div>
              <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:12,lineHeight:1.5}}>
                {L("18+. Это развлечение, а не диагноз. Фото уходят на разбор нейросети, подробности в ","18+. Just for fun, not a diagnosis. Photos are sent to an AI for analysis, details in the ")}<a href="/privacy" style={{color:C.ink70,textDecoration:"underline"}}>{L("политике конфиденциальности","privacy policy")}</a>.
              </p>
            </>
          )}
        </div>

        {/* Пример результата: человек видит, что получит, ДО того как грузить два своих фото.
            Помечен как пример, чтобы не выдавать за настоящий скан. */}
        {!res && !p1 && !p2 && !pJoint && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:22,animationDelay:".03s"}}>
            <Rule>{L("Пример разбора","Sample reading")}</Rule>
            <div style={{...glass,borderRadius:R.md,padding:16,display:"flex",gap:14,alignItems:"center"}}>
              <div style={{flexShrink:0,textAlign:"center"}}>
                <span className="serif" style={{fontSize:F.display,lineHeight:1,color:C.red}}>87%</span>
                <div className="mono" style={{fontSize:F.micro,letterSpacing:"0.16em",color:C.ink55,marginTop:2}}>{L("МЭТЧ","MATCH")}</div>
              </div>
              <p className="ai-font" style={{fontSize:F.md,color:C.ink70,lineHeight:1.45}}>
                {L("«Вы оба слегка наклонены друг к другу, а на совместном кадре плечи почти касаются. Это редкий признак, что рядом с человеком спокойно…»",
                   "“You both lean slightly toward each other, and in the joint shot your shoulders almost touch. That's a rare sign of feeling at ease with someone…”")}
                <span className="mono" style={{display:"block",fontSize:F.micro,color:C.ink35,marginTop:6}}>{L("Пример, не настоящий скан","Sample, not a real scan")}</span>
              </p>
            </div>
          </div>
        )}

        {/* режим */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:26,animationDelay:".05s"}}>
          <Rule>{L("Кто на фото","Who's in the photo")}</Rule>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:4,borderRadius:R.sm,...glass}}>
            {MODES[lg].map(m=>(
              <button key={m.id} onClick={()=>{tapFx();setMode(m.id)}} className="unlock-btn" style={{borderRadius:R.sm-4,padding:"9px 4px",cursor:"pointer",textAlign:"center",border:"none",background:mode===m.id?`linear-gradient(135deg, ${C.red}, ${C.redDeep})`:"transparent",color:mode===m.id?"#fff":C.ink50}}>
                <div className="serif" style={{fontSize:F.lg}}>{m.label}</div>
                <div className="mono" style={{fontSize:F.micro,opacity:mode===m.id?.75:.6,marginTop:2}}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ФОТО — теперь два способа. Совместное фото несёт то, чего нет
            в отдельных портретах: дистанцию, касания, зеркаление поз. */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:24,animationDelay:".1s"}}>
          <Rule>{L("Фото","Photos")}</Rule>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:4,borderRadius:R.sm,...glass,marginBottom:12}}>
            {([["two",L("По отдельности","Separately")],["joint",L("Вместе","Together")]] as const).map(([k,lab])=>(
              <button key={k} onClick={()=>{tapFx();setInputKind(k)}} className="unlock-btn mono" style={{borderRadius:R.sm-4,padding:"13px 4px",cursor:"pointer",border:"none",fontSize:F.sm,background:inputKind===k?"rgba(255,255,255,0.09)":"transparent",color:inputKind===k?C.ink:C.ink50}}>{lab}</button>
            ))}
          </div>

          {inputKind==="two" ? (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {PhotoSlot({img:p1,onPick:setP1,label:L("Первый человек","First person")})}
                {PhotoSlot({img:p2,onPick:setP2,label:L("Второй человек","Second person")})}
              </div>
              {p1 && p2 && (
                <div style={{marginTop:12}}>
                  {pJoint ? (
                    PhotoSlot({img:pJoint,onPick:setPJoint,label:L("Совместное фото","Photo of you both"),ratio:"16/10"})
                  ) : (
                    <label className="unlock-btn" style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderRadius:R.md,border:`1px dashed ${C.gold}55`,background:`${C.gold}0d`,cursor:"pointer",color:C.gold}}>
                      <Ico n="users" s={17}/>
                      <span style={{minWidth:0}}>
                        <span className="mono" style={{fontSize:F.sm,display:"block"}}>{L("Добавить совместное фото","Add a photo of you two")}</span>
                        <span className="mono" style={{fontSize:F.xs,color:C.ink50,display:"block",marginTop:3}}>{L("Разбор станет заметно точнее","Makes the reading noticeably sharper")}</span>
                      </span>
                      <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compressPhoto(f).then(setPJoint)}}/>
                    </label>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {PhotoSlot({img:pJoint,onPick:setPJoint,label:L("Оба человека в кадре","Both people in one shot"),ratio:"16/10"})}
              <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:8,lineHeight:1.5}}>{L("Одно фото, где вы вдвоём. По нему видно дистанцию, касания и то, кто к кому наклонён — этого не видно на отдельных портретах.","One photo of you two. It shows distance, touch and who leans toward whom, which separate portraits can't.")}</p>
            </>
          )}
        </div>

        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:16,animationDelay:".14s"}}>
          <button onClick={()=>{tapFx();withAge(check)}} disabled={load||!photosReady} className="cta" style={{width:"100%",height:56,borderRadius:R.pill,border:"none",cursor:photosReady?"pointer":"not-allowed",background:photosReady?`linear-gradient(120deg, ${C.red}, ${C.redDeep})`:"rgba(255,255,255,0.06)",color:photosReady?"#fff":C.ink35,display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:photosReady?`0 12px 34px ${C.red}3d`:"none",opacity:load?.8:1}}>
            <span className="mono" style={{fontSize:F.sm,letterSpacing:"0.14em",textTransform:"uppercase",fontWeight:500}}>
              {load ? <>{L("Считываю кадры","Reading the photos")}<Dots/></> : photosReady ? L("Проверить совместимость","Check compatibility") : (inputKind==="joint"?L("Добавь совместное фото","Add a photo of you two"):L("Добавь оба фото","Add both photos"))}
            </span>
            {!load && photosReady && <Ico n="spark" s={15}/>}
          </button>
        </div>

        {/* результат */}
        <div ref={resultRef} style={{scrollMarginTop:16}}/>
        {res && inviteSessionId ? (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:18}}>
            <div style={{...glass,borderRadius:R.lg,padding:20,boxShadow:"0 16px 44px rgba(0,0,0,0.45)"}}>
              <ComparisonScreen sessionId={inviteSessionId} myResult={res} />
            </div>
          </div>
        ) : res && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:18}}>
            <div style={{...glass,borderRadius:R.lg,padding:22,boxShadow:"0 16px 44px rgba(0,0,0,0.45)"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{position:"relative",width:128,height:128}}>
                  <svg width="128" height="128" style={{transform:"rotate(-135deg)"}}>
                    <defs><linearGradient id="reportRing" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={C.red}/><stop offset="100%" stopColor={C.gold}/></linearGradient></defs>
                    <circle cx="64" cy="64" r="52" stroke="rgba(255,255,255,0.07)" strokeWidth="7" fill="none" strokeDasharray={ringLen} strokeDashoffset={ringLen*0.25} strokeLinecap="round"/>
                    <circle key={res.percent} className="ring-anim" cx="64" cy="64" r="52" stroke="url(#reportRing)" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringOffset}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    <span className="serif" style={{fontSize:F.display,lineHeight:1}}><CountUp key={res.percent} value={res.percent}/>%</span>
                    <span className="mono" style={{fontSize:F.micro,letterSpacing:"0.16em",color:C.ink55,marginTop:2}}>{L("МЭТЧ","MATCH")}</span>
                  </div>
                </div>
              </div>

              <div className="ai-font" style={{fontSize:F.lg,marginTop:18,whiteSpace:"pre-wrap"}}>{res.full}</div>

              <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${C.lineSoft}`}}>
                <p className="ai-font" style={{fontSize:F.md,color:C.ink70}}>
                  {highChance ? L("Процент высокий. В запечатанных письмах — что там думают на самом деле и как не спугнуть.","High score. The sealed letters say what they really think and how not to scare it off.")
                              : L("Есть что подтянуть. В запечатанных письмах — конкретный план, а не догадки.","Room to grow. The sealed letters have a concrete plan, not guesses.")}
                </p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
                  <button onClick={()=>{tapFx();shareResult()}} disabled={sharing} className="unlock-btn mono" style={{height:38,padding:"0 15px",borderRadius:R.pill,border:`1px solid ${C.line}`,background:"rgba(255,255,255,0.06)",color:C.ink,fontSize:F.sm,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}>
                    {sharing ? <>{L("Собираю картинку","Making the image")}<Dots/></> : <><Ico n="share" s={14}/> {L("Поделиться","Share")}</>}
                  </button>
                  {canShareStory() && (
                    <button onClick={()=>{tapFx();shareStory()}} className="unlock-btn mono" style={{height:38,padding:"0 15px",borderRadius:R.pill,border:`1px solid ${C.line}`,background:"rgba(255,255,255,0.06)",color:C.ink,fontSize:F.sm,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}>
                      <Ico n="spark" s={14}/> {L("В сторис","To story")}
                    </button>
                  )}
                  <InvitePartnerButton result={res} />
                </div>

                {similarItems===null ? (
                  <button onClick={()=>{tapFx();loadSimilar()}} disabled={similarLoading} className="unlock-btn mono" style={{marginTop:10,height:34,padding:"0 14px",borderRadius:R.pill,border:`1px solid ${C.lineSoft}`,background:"transparent",color:C.ink50,fontSize:F.xs,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}>
                    {similarLoading ? <>{L("Ищу похожие","Looking for similar")}<Dots/></> : <><Ico n="eye" s={13}/> {L("Что было у других с похожим %","What others with a similar % got")}</>}
                  </button>
                ) : similarItems.length>0 ? (
                  <div style={{marginTop:14}}>
                    <p className="mono" style={{...label,marginBottom:8}}>{L("Похожий процент у других","Others with a similar score")}</p>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {similarItems.map((s,i)=><div key={i} className="ai-font" style={{fontSize:F.sm,color:C.ink70,borderLeft:`2px solid ${C.gold}55`,paddingLeft:12}}>{s}…</div>)}
                    </div>
                  </div>
                ) : <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:10}}>{L("Пока мало данных с похожим % — загляни позже","Not enough data for this % yet, check back later")}</p>}
              </div>
            </div>
          </div>
        )}

        {/* запечатанные письма */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:30,animationDelay:".18s"}}>
          <Rule>{L("Запечатанные письма","Sealed letters")}</Rule>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {CARDS.map(c=>{
              const active=selectedCard===c.id, open=unlocked[c.id]
              return (
                <button key={c.id} onClick={()=>{tapFx();setSelectedCard(c.id)}} className="unlock-btn" style={{padding:"13px 12px",borderRadius:R.sm,cursor:"pointer",textAlign:"left",background:active?`linear-gradient(180deg, ${C.gold}14, rgba(255,255,255,0.02))`:"rgba(255,255,255,0.035)",border:active?`1px solid ${C.gold}88`:`1px solid ${C.lineSoft}`,color:C.ink}}>
                  <span style={{display:"flex",alignItems:"center",justifyContent:"space-between",color:open?C.gold:(active?C.gold:C.ink50)}}>
                    <Ico n={c.ico} s={18}/>{open && <Ico n="check" s={12}/>}
                  </span>
                  <div className="serif" style={{fontSize:F.lg,marginTop:9,lineHeight:1.1}}>{c.title}</div>
                  <div className="mono" style={{fontSize:F.xs,marginTop:6,color:open?C.gold:C.ink55}}>{open?L("открыто","open"):`${PRICES[c.id].now} ✦`}</div>
                </button>
              )
            })}
          </div>

          <div style={{marginTop:12}}>
            <div style={{...glass,borderRadius:R.md,padding:16,border:unlocked[selectedCard]?`1px solid ${C.gold}55`:glass.border,boxShadow:unlocked[selectedCard]?`0 0 0 1px ${C.gold}14, 0 14px 34px rgba(0,0,0,0.4)`:"0 10px 28px rgba(0,0,0,0.3)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{minWidth:0}}>
                  <p className="serif" style={{fontSize:F.xl,lineHeight:1.15}}>{current.title}</p>
                  <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:4}}>{current.sub}</p>
                  {/* Зачёркнутая цена только там, где скидка настоящая (сейчас таких одиночных писем нет) */}
                  {!unlocked[selectedCard] && !(selectedCard==="custom" && hasFreeCustomCredit) && off(PRICES[selectedCard])>0 && (
                    <p className="mono" style={{fontSize:F.xs,marginTop:6,color:C.ink55}}>
                      <span className="strike">{PRICES[selectedCard].was} ✦</span> · −{off(PRICES[selectedCard])}%
                    </p>
                  )}
                  {selectedCard==="custom" && hasFreeCustomCredit && !unlocked.custom && (
                    <p className="mono" style={{fontSize:F.xs,marginTop:6,color:C.gold}}>{L("Приз с колеса — бесплатно","Wheel prize · free")}</p>
                  )}
                </div>
                {viewingHistoryScan && !unlocked[selectedCard] ? (
                  results[selectedCard] ? <span className="mono" style={{fontSize:F.sm,color:C.gold,paddingTop:6}}>{L("Прочитано","Read")}</span> : null
                ) : !unlocked[selectedCard] ? (
                  <button onClick={()=>{tapFx();buy(selectedCard)}} disabled={waiting===selectedCard || !scanId} className="unlock-btn mono" style={{height:44,padding:"0 16px",borderRadius:R.pill,border:"none",cursor:scanId?"pointer":"not-allowed",background:`linear-gradient(135deg, ${C.red}, ${C.redDeep})`,color:"#fff",fontSize:F.sm,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,opacity:scanId?1:0.45}}>
                    {waiting===selectedCard ? <>{L("Жду","Waiting")}<Dots/></> : (selectedCard==="custom" && hasFreeCustomCredit ? L("Открыть","Open") : `${PRICES[selectedCard].now} ✦`)}
                  </button>
                ) : <span className="mono shimmer-price" style={{fontSize:F.sm,fontWeight:700,paddingTop:6}}>{L("Открыто","Unlocked")}</span>}
              </div>

              {!scanId && !unlocked[selectedCard] && (
                <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:10}}>{L("Сначала сделай скан — письма пишутся под конкретные фото","Do a scan first: letters are written for specific photos")}</p>
              )}

              {!unlocked[selectedCard] && scanId && !results[selectedCard] && !viewingHistoryScan && <Teaser feature={selectedCard}/>}
              {viewingHistoryScan && !results[selectedCard] && (
                <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:10,lineHeight:1.5}}>{unlocked[selectedCard]
                  ? L("Письмо оплачено, но не написано, а фото в истории не хранятся, поэтому дописать его отсюда нельзя.","This letter is paid but not written, and photos aren't kept in history, so it can't be written from here.")
                  : L("Письма покупаются к свежему скану — сделай новый с этими фото.","Letters are bought for a fresh scan. Run a new one with these photos.")}</p>
              )}

              {unlocked[selectedCard] && !opened[selectedCard] && selectedCard!=="custom" && !viewingHistoryScan && (
                <EnvelopeReveal onOpen={()=>setOpened(o=>({...o,[selectedCard]:true}))}/>
              )}

              {/* deep / hidden / future: сначала детали от человека, потом разбор */}
              {selectedCard!=="custom" && unlocked[selectedCard] && opened[selectedCard] && !viewingHistoryScan && (
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
                  <p className="mono" style={{fontSize:F.xs,color:C.ink70,lineHeight:1.5}}>{L("Сначала расскажи, что между вами: тапни подсказки или напиши своими словами. Письмо напишется под это.","First tell me what's going on between you: tap the hints or write it in your own words. The letter is written around it.")}</p>
                  <textarea value={letterExtra[selectedCard]} onChange={e=>{const v=e.target.value; setLetterExtra(x=>({...x,[selectedCard]:v}))}} placeholder={L("Например: встречаемся полгода, последнюю неделю отвечает односложно…","For example: dating for six months, this week the replies are one word…")} className="mono letter-area" style={{width:"100%",minHeight:72,borderRadius:R.sm,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.line}`,padding:12,fontSize:F.sm,color:C.ink,resize:"vertical",lineHeight:1.5}}/>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {LETTER_HINTS[lg][mode].map(h=>{
                      const on = letterExtra[selectedCard].includes(h)
                      return <button key={h} onClick={()=>{tapFx(); setLetterExtra(x=>{
                        const cur = x[selectedCard].trim()
                        if(cur.includes(h)) return x
                        return {...x,[selectedCard]: cur ? `${cur.replace(/[.,;]+$/,"")}, ${h}` : h}
                      })}} className="unlock-btn mono" style={{padding:"7px 11px",borderRadius:R.pill,cursor:"pointer",fontSize:F.xs,lineHeight:1.2,background:on?`${C.gold}1c`:"rgba(255,255,255,0.035)",border:on?`1px solid ${C.gold}77`:`1px solid ${C.lineSoft}`,color:on?C.ink:C.ink70}}>{h}</button>
                    })}
                  </div>
                  <button onClick={()=>{tapFx();generate(selectedCard)}} disabled={busy[selectedCard]||!letterExtra[selectedCard].trim()} className="unlock-btn" style={{width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:letterExtra[selectedCard].trim()?"pointer":"not-allowed",background:C.gold,color:C.goldInk,fontWeight:700,opacity:letterExtra[selectedCard].trim()?1:0.45}}><span className="mono" style={{fontSize:F.sm}}>{busy[selectedCard] ? <>{L("Вскрываю","Opening")}<Dots/></> : (results[selectedCard] ? L("Пересобрать с деталями","Redo with details") : L("Вскрыть письмо","Open the letter"))}</span></button>
                  {!subActive && !isFounder && <p className="mono" style={{fontSize:F.xs,color:C.ink55}}>{L("Одна покупка — один разбор, так что пиши подробнее.","One purchase, one reading, so give some detail.")}</p>}
                </div>
              )}

              {/* custom: вопрос */}
              {selectedCard==="custom" && unlocked.custom && !viewingHistoryScan && (
                <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
                  {!results.custom && (<>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <p className="mono" style={label}>{L("Можно спросить так","You could ask")}</p>
                      <button onClick={()=>{tapFx();setChipSeed(s=>s+1)}} className="mono unlock-btn" style={{fontSize:F.xs,background:"none",border:"none",cursor:"pointer",color:C.gold,display:"inline-flex",alignItems:"center",gap:5}}><Ico n="refresh" s={12}/> {L("другие","more")}</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:7}}>
                      {pickQuestions(mode,chipSeed,lg).map((q,i)=>(
                        <button key={i} onClick={()=>{tapFx();setCustomQuestion(q)}} className="unlock-btn ai-font" style={{textAlign:"left",padding:"10px 13px",borderRadius:R.sm,cursor:"pointer",fontSize:F.md,lineHeight:1.4,background:customQuestion===q?`${C.gold}1c`:"rgba(255,255,255,0.035)",border:customQuestion===q?`1px solid ${C.gold}77`:`1px solid ${C.lineSoft}`,color:customQuestion===q?C.ink:C.ink70}}>{q}</button>
                      ))}
                    </div>
                  </>)}
                  <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} placeholder={results.custom ? L("Ещё вопрос","Another question") : L("Или напиши свой вопрос","Or write your own question")} className="mono letter-area" style={{width:"100%",minHeight:72,borderRadius:R.sm,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.line}`,padding:12,fontSize:F.sm,color:C.ink,resize:"vertical",lineHeight:1.5}}/>
                  <button onClick={()=>{tapFx();generate("custom")}} disabled={!customQuestion.trim()||busy.custom} className="unlock-btn" style={{width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:customQuestion.trim()?"pointer":"not-allowed",background:C.gold,color:C.goldInk,fontWeight:700,opacity:customQuestion.trim()?1:0.45}}><span className="mono" style={{fontSize:F.sm}}>{busy.custom ? <>{L("Спрашиваю","Asking")}<Dots/></> : (results.custom ? L("Спросить ещё","Ask again") : L("Задать вопрос","Ask"))}</span></button>
                  {!subActive && !isFounder && <p className="mono" style={{fontSize:F.xs,color:C.ink55}}>{L("Одна покупка — один ответ.","One purchase, one answer.")}</p>}
                </div>
              )}

              {/* ответ: остаётся на виду и после того, как плашка вернулась к покупке */}
              {(busy[selectedCard] || results[selectedCard]) && (
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
                  {busy[selectedCard] && !results[selectedCard] && <Skeleton h={78}/>}
                  {results[selectedCard] && <AnswerBox text={results[selectedCard]}/>}
                </div>
              )}
            </div>

            {!anyOfThree && scanId && !viewingHistoryScan && (
              <button onClick={()=>{tapFx();buy("bundle")}} disabled={waiting==="bundle"} className="unlock-btn" style={{marginTop:10,width:"100%",padding:"14px 18px",borderRadius:R.md,border:`1px solid ${C.gold}55`,cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}18, rgba(255,255,255,0.02))`,color:C.ink,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,textAlign:"left"}}>
                <span>
                  <span className="serif" style={{fontSize:F.xl,display:"block",lineHeight:1.1}}>{L("Все три письма","All three letters")}</span>
                  <span className="mono" style={{fontSize:F.xs,color:C.ink50,display:"block",marginTop:4}}><span className="strike">{PRICES.bundle.was} ✦</span> · {L("экономия","save")} {off(PRICES.bundle)}% {L("против трёх по отдельности","vs. buying three separately")}</span>
                </span>
                <span className="mono" style={{flexShrink:0,padding:"11px 18px",borderRadius:R.pill,background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm}}>{waiting==="bundle"?"…":`${PRICES.bundle.now} ✦`}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── ПОДПИСКА ── */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
          {subActive ? (
            <div style={{...glass,borderRadius:R.md,padding:16,border:`1px solid ${C.gold}55`,background:`linear-gradient(135deg, ${C.gold}12, rgba(255,255,255,0.02))`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:C.gold,display:"flex"}}><Ico n="crown" s={18}/></span>
                <p className="serif" style={{fontSize:F.xl}}>{L("Архив открыт","Archive is open")}</p>
              </div>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6,lineHeight:1.5}}>
                {L("Безлимитные сканы и все разборы","Unlimited scans and all readings")}{subUntil ? ` ${L("до","until")} ${new Date(subUntil).toLocaleDateString(lg==="en"?"en-US":"ru-RU",{day:"2-digit",month:"long"})}` : ""}.
                {subCancelled ? L(" Автопродление отключено."," Auto-renew is off.") : L(" Продлится автоматически."," Renews automatically.")}
              </p>
            </div>
          ) : (
            <div style={{...glass,borderRadius:R.md,padding:16,border:`1px solid ${C.gold}44`,background:`linear-gradient(135deg, ${C.gold}10, rgba(255,255,255,0.02))`}}>
              <p className="mono" style={{...label,color:C.gold}}>{L("Подписка","Subscription")}</p>
              <p className="serif" style={{fontSize:F.xxl,marginTop:7,lineHeight:1.05}}>{L("Архив","Archive")}</p>
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                {(lg==="en" ? ["Unlimited scans","All letters unlocked at once","Chat analysis included","New photos don't reset access"]
                            : ["Сканы без ограничений","Все письма открыты сразу","Разбор переписки включён","Новые фото не сбрасывают доступ"]).map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{color:C.gold,display:"flex",flexShrink:0}}><Ico n="check" s={13}/></span>
                    <span className="mono" style={{fontSize:F.sm,color:C.ink70}}>{t}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>{tapFx();buy("sub")}} disabled={waiting==="sub"} className="unlock-btn mono" style={{marginTop:14,width:"100%",height:46,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm}}>
                {waiting==="sub" ? <>{L("Оформляю","Setting up")}<Dots/></> : `${PRICES.sub.now} ✦ ${L("в месяц","per month")}`}
              </button>
              <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:8,textAlign:"center"}}>{L("Отменить можно в любой момент в Telegram","Cancel anytime in Telegram")}</p>
            </div>
          )}
        </div>

        {/* ── РАЗБОР ПЕРЕПИСКИ ── */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
          <div style={{...glass,borderRadius:R.md,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <span style={{color:C.ink50,display:"flex"}}><Ico n="chat" s={18}/></span>
                  <p className="serif" style={{fontSize:F.xl}}>{L("Разбор переписки","Chat analysis")}</p>
                </div>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5,lineHeight:1.5}}>
                  {L(`До ${MAX_CHAT_SHOTS} скриншотов. Кто вкладывается больше, где уходят от темы и что написать следующим сообщением.`,
                     `Up to ${MAX_CHAT_SHOTS} screenshots. Who invests more, where they dodge, and what to text next.`)}
                </p>
              </div>
              {!(subActive || convCredits>0) && (
                <button onClick={()=>{tapFx();buy("conversation")}} disabled={waiting==="conversation"} className="unlock-btn mono" style={{height:38,padding:"0 16px",borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.red}, ${C.redDeep})`,color:"#fff",fontSize:F.sm,fontWeight:700,flexShrink:0}}>
                  {waiting==="conversation" ? <>{L("Жду","Waiting")}<Dots/></> : `${PRICES.conversation.now} ✦`}
                </button>
              )}
            </div>

            {(subActive || convCredits>0) ? (
              <div style={{marginTop:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {chatShots.map((s,i)=>(
                    <div key={i} style={{position:"relative",aspectRatio:"3/5",borderRadius:R.sm,overflow:"hidden",border:`1px solid ${C.line}`}}>
                      <img src={s} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
                      <button onClick={()=>{tapFx();setChatShots(a=>a.filter((_,j)=>j!==i))}} className="icon-btn" style={{position:"absolute",top:2,right:2,width:44,height:44,borderRadius:R.pill,border:"none",background:"rgba(10,9,8,0.75)",color:C.ink,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={13}/></button>
                    </div>
                  ))}
                  {chatShots.length<MAX_CHAT_SHOTS && (
                    <label className="photo-card" style={{cursor:"pointer",aspectRatio:"3/5",borderRadius:R.sm,border:"1px dashed rgba(255,255,255,0.16)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:C.ink55}}>
                      <Ico n="plus" s={16}/>
                      <span className="mono" style={{fontSize:F.micro}}>{chatShots.length}/{MAX_CHAT_SHOTS}</span>
                      <input type="file" hidden accept="image/*" multiple onChange={e=>{ if(e.target.files) addShots(e.target.files) }}/>
                    </label>
                  )}
                </div>
                <button onClick={()=>{tapFx();withAge(runConversation)}} disabled={!chatShots.length||convLoad} className="unlock-btn" style={{marginTop:12,width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontWeight:700,opacity:chatShots.length?1:0.45}}>
                  <span className="mono" style={{fontSize:F.sm}}>{convLoad ? <>{L("Читаю переписку","Reading the chat")}<Dots/></> : L("Разобрать","Analyze")}</span>
                </button>
                {convLoad && !convRes && <Skeleton h={90}/>}
                {convRes && <AnswerBox text={convRes}/>}
              </div>
            ) : (
              <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:12,lineHeight:1.5}}>
                {L("Скриншоты нужны только для разбора — они не сохраняются.","Screenshots are used only for the analysis and aren't stored.")}
              </p>
            )}
          </div>
        </div>

        {/* второстепенное */}
        {moodLoaded && !todayMood && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
            <div style={{...glass,borderRadius:R.md,padding:16}}>
              <p className="serif" style={{fontSize:F.xl}}>{L("Как ты сегодня?","How are you today?")}</p>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:4}}>{L("Учтём в разборе","We'll factor it into the reading")}</p>
              <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:7}}>
                {MOOD_OPTIONS[lg].map(m=>(
                  <button key={m.id} onClick={()=>{tapFx();saveMood(m.id)}} disabled={moodSaving} className="unlock-btn mono" style={{padding:"8px 13px",borderRadius:R.pill,border:`1px solid ${C.lineSoft}`,background:"rgba(255,255,255,0.04)",color:C.ink70,fontSize:F.xs,cursor:"pointer"}}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeEvent && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
            <div style={{...glass,borderRadius:R.md,padding:16,border:`1px solid ${C.gold}44`,background:`linear-gradient(135deg, ${C.gold}12, rgba(255,255,255,0.02))`}}>
              <p className="mono" style={{...label,color:C.gold}}>{L("Лимитированный ивент","Limited event")}</p>
              <p className="serif" style={{fontSize:F.xl,marginTop:7}}>{eventText(activeEvent,lg).title}</p>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5,lineHeight:1.5}}>{eventText(activeEvent,lg).bannerText}</p>
              {!seasonalUnlocked ? (
                <button onClick={()=>{tapFx();buy("seasonal")}} disabled={!scanId} className="unlock-btn mono" style={{marginTop:14,width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm,opacity:scanId?1:0.45}}>{eventText(activeEvent,lg).buttonLabel}</button>
              ) : !seasonalOpened ? (
                <EnvelopeReveal onOpen={()=>{ setSeasonalOpened(true); checkSeasonal() }}/>
              ) : (<>
                {seasonalLoad && !seasonalRes && <Skeleton/>}
                {seasonalRes && <AnswerBox text={seasonalRes}/>}
              </>)}
            </div>
          </div>
        )}

        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
          <div style={{...glass,borderRadius:R.md,padding:16}}>
            {refCredits>0 ? (
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                <div>
                  <p className="serif" style={{fontSize:F.lg}}>{L("Приглашено","Invited")}: {refCount}</p>
                  <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:3}}>{L("Есть бесплатные разборы","You have free readings")}</p>
                </div>
                <button onClick={()=>{tapFx();useReferralCredit("deep")}} disabled={!scanId} className="unlock-btn mono" style={{height:36,padding:"0 14px",borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontSize:F.xs,fontWeight:700,flexShrink:0,opacity:scanId?1:0.45}}>{L("Забрать","Claim")} ({refCredits})</button>
              </div>
            ) : <InviteFriendsButton count={refCount} toNextReward={refToNext} />}
          </div>
        </div>

        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
          <div className="seal-card" style={{position:"relative",width:"100%",height:148,cursor:"pointer",perspective:"1200px"}} onClick={()=>{tapFx();setSealBroken(!sealBroken)}}>
            <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .7s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:sealBroken?"rotateY(180deg)":"rotateY(0deg)"}}>
              <div style={{position:"absolute",inset:0,borderRadius:R.lg,padding:20,display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden",backfaceVisibility:"hidden",...glass,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <p className="mono" style={label}>{L("Письмо дня","Letter of the day")}</p>
                <div style={{paddingRight:64}}>
                  <h2 className="serif" style={{fontSize:F.xxl,lineHeight:1.05}}>{L("Что между","What's really")}<br/><i>{L("вами на самом деле?","between you?")}</i></h2>
                  <p className="mono" style={{fontSize:F.xs,marginTop:8,color:C.ink55}}>{L("Нажми на печать","Tap the seal")}</p>
                </div>
                <div className="seal" style={{position:"absolute",right:18,top:"50%",transform:"translateY(-50%)",width:50,height:50,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, ${C.redSoft}, ${C.red} 55%, ${C.redDeep})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><Ico n="spark" s={20}/></div>
              </div>
              <div style={{position:"absolute",inset:0,borderRadius:R.lg,padding:20,display:"flex",flexDirection:"column",backfaceVisibility:"hidden",transform:"rotateY(180deg)",...glass,border:`1px solid ${C.red}44`,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <p className="mono" style={{...label,color:C.red}}>{L("Вскрыто","Opened")} · {daily.name}</p>
                <h3 className="serif" style={{fontSize:F.xxl,marginTop:8,lineHeight:1.1}}>{daily.title}</h3>
                <p className="ai-font" style={{fontSize:F.lg,marginTop:8,color:C.ink70}}>{daily.text}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="reveal" style={{marginTop:"auto",paddingTop:44,textAlign:"center"}}>
          <p className="mono" style={{...label,color:"rgba(244,239,231,0.18)"}}>Love Scanner · Est 2026</p>
        </div>
        </div>
      </div>

      {/* колесо */}
      {ageGateOpen && (
        <div onClick={()=>{ setAgeGateOpen(false); setAgeTick(false); ageNextRef.current=null }} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.86)",backdropFilter:"blur(8px)",zIndex:40,display:"flex",justifyContent:"center",alignItems:"center",padding:PAD}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:340,maxWidth:"100%",...glass,background:C.bgRaised,borderRadius:R.lg,padding:26,textAlign:"center"}}>
            <p className="serif" style={{fontSize:F.xxl}}>18+</p>
            <p className="mono" style={{fontSize:F.sm,color:C.ink70,marginTop:10,lineHeight:1.5}}>{L("Love Scanner — для взрослых. Разборы про отношения, флирт и чувства.","Love Scanner is for adults. Readings about relationships, flirting and feelings.")}</p>
            <label style={{display:"flex",alignItems:"center",gap:10,marginTop:20,cursor:"pointer",textAlign:"left"}}>
              <input type="checkbox" checked={ageTick} onChange={e=>setAgeTick(e.target.checked)} style={{width:20,height:20,accentColor:C.gold,flexShrink:0}}/>
              <span className="mono" style={{fontSize:F.sm,color:C.ink}}>{L("Мне есть 18 лет","I'm 18 or older")}</span>
            </label>
            <button onClick={confirmAge} disabled={!ageTick} className="unlock-btn" style={{marginTop:18,width:"100%",height:44,borderRadius:R.pill,border:"none",cursor:ageTick?"pointer":"not-allowed",background:C.gold,color:C.goldInk,fontWeight:700,opacity:ageTick?1:0.45}}><span className="mono" style={{fontSize:F.sm}}>{L("Продолжить","Continue")}</span></button>
          </div>
        </div>
      )}

      {wheelOpen && (
        <div onClick={()=>setWheelOpen(false)} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.72)",backdropFilter:"blur(6px)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"center",padding:PAD}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:340,maxWidth:"100%",...glass,background:C.bgRaised,borderRadius:R.lg,padding:26,textAlign:"center"}}>
            <p className="serif" style={{fontSize:F.xxl}}>{L("Колесо дня","Wheel of the day")}</p>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5}}>{L("Один раз в сутки, бесплатно","Once a day, free")}</p>
            <div style={{margin:"26px auto",width:124,height:124}}>
              <div style={{width:124,height:124,borderRadius:"50%",background:`conic-gradient(${C.red}, ${C.gold}, ${C.redDeep}, ${C.gold}, ${C.red})`,animation:wheelSpinning?"spin 1.4s cubic-bezier(.2,.8,.3,1)":"none",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 12px 34px rgba(0,0,0,0.5)"}}>
                <div style={{width:72,height:72,borderRadius:"50%",background:C.bgRaised,display:"flex",alignItems:"center",justifyContent:"center",color:C.gold}}><Ico n="wheel" s={26}/></div>
              </div>
            </div>
            {wheelPrize ? (
              <div className="reveal">
                <p className="ai-font" style={{fontSize:F.lg,padding:"0 6px"}}>{wheelPrize.label}</p>
                {wheelPrize.prizeId==="free_custom" && hasFreeCustomCredit ? (
                  <button onClick={()=>{tapFx();setSelectedCard("custom");setWheelOpen(false)}} className="unlock-btn mono" style={{marginTop:16,width:"100%",height:44,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm}}>{L("Забрать приз","Claim prize")}</button>
                ) : <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:12}}>{L("Возвращайся завтра за новым призом","Come back tomorrow for a new prize")}</p>}
              </div>
            ) : (
              <button onClick={spinWheel} disabled={wheelSpinning} className="unlock-btn mono" style={{width:"100%",height:46,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm,opacity:wheelSpinning?0.7:1}}>{wheelSpinning ? <>{L("Крутим","Spinning")}<Dots/></> : L("Крутить колесо","Spin the wheel")}</button>
            )}
            <button onClick={()=>setWheelOpen(false)} className="mono unlock-btn" style={{marginTop:16,background:"none",border:"none",color:C.ink55,fontSize:F.xs,cursor:"pointer"}}>{L("Закрыть","Close")}</button>
          </div>
        </div>
      )}

      {/* история */}
      {historyOpen && (
        <div onClick={()=>setHistoryOpen(false)} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.7)",backdropFilter:"blur(6px)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"flex-end"}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:420,maxWidth:"100%",maxHeight:"78vh",overflowY:"auto",...glass,background:C.bgRaised,borderRadius:`${R.lg}px ${R.lg}px 0 0`,padding:`10px ${PAD}px calc(${PAD}px + env(safe-area-inset-bottom))`}}>
            <div style={{width:36,height:4,borderRadius:R.pill,background:"rgba(255,255,255,0.16)",margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <p className="serif" style={{fontSize:F.xxl}}>{L("История сканов","Scan history")}</p>
              <button onClick={()=>setHistoryOpen(false)} className="icon-btn" style={{width:30,height:30,borderRadius:R.pill,background:"rgba(255,255,255,0.07)",border:"none",color:C.ink50,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={14}/></button>
            </div>
            {historyLoading && <p className="mono" style={{fontSize:F.sm,color:C.ink50}}>{L("Загружаю","Loading")}<Dots/></p>}
            {!historyLoading && historyItems.length===0 && (
              <div style={{padding:"28px 0",textAlign:"center"}}>
                <p className="serif" style={{fontSize:F.xl}}>{L("Здесь пока пусто","Nothing here yet")}</p>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6}}>{L("Сделай первый скан — он сохранится сюда","Do your first scan and it'll be saved here")}</p>
              </div>
            )}
            {!historyLoading && historyItems.map(item=>{
              const n = Object.values(item.unlocked||{}).filter(Boolean).length
              return (
                <div key={item.scanId} onClick={()=>{tapFx();openHistoryScan(item.scanId)}} className="unlock-btn" style={{borderBottom:`1px solid ${C.lineSoft}`,padding:"14px 0",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span className="serif" style={{fontSize:F.xl,color:C.gold}}>{item.percent}%</span>
                    <span className="mono" style={{fontSize:F.xs,color:C.ink55}}>{new Date(item.ts).toLocaleDateString(lg==="en"?"en-US":"ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <p className="ai-font" style={{fontSize:F.sm,marginTop:5,color:C.ink70}}>{item.snippet}…</p>
                  {n>0 && <p className="mono" style={{fontSize:F.xs,color:C.ink55,marginTop:6}}>{L("Открыто разделов","Sections unlocked")}: {n}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* лидерборд */}
      {leaderboardOpen && (
        <div onClick={()=>setLeaderboardOpen(false)} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.7)",backdropFilter:"blur(6px)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"flex-end"}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:420,maxWidth:"100%",maxHeight:"78vh",overflowY:"auto",...glass,background:C.bgRaised,borderRadius:`${R.lg}px ${R.lg}px 0 0`,padding:`10px ${PAD}px calc(${PAD}px + env(safe-area-inset-bottom))`}}>
            <div style={{width:36,height:4,borderRadius:R.pill,background:"rgba(255,255,255,0.16)",margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p className="serif" style={{fontSize:F.xxl}}>{L("Кто больше пригласил","Top inviters")}</p>
              <button onClick={()=>setLeaderboardOpen(false)} className="icon-btn" style={{width:30,height:30,borderRadius:R.pill,background:"rgba(255,255,255,0.07)",border:"none",color:C.ink50,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={14}/></button>
            </div>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,margin:"8px 0 16px",lineHeight:1.5}}>{L("Топ-3 навсегда получают статус Founder — бесплатный доступ ко всем разборам.","Top 3 get Founder status forever: free access to all readings.")}</p>
            {leaderboardLoading && <p className="mono" style={{fontSize:F.sm,color:C.ink50}}>{L("Загружаю","Loading")}<Dots/></p>}
            {!leaderboardLoading && leaderboardItems.length===0 && (
              <div style={{padding:"24px 0",textAlign:"center"}}>
                <p className="serif" style={{fontSize:F.xl}}>{L("Список пуст","The list is empty")}</p>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6}}>{L("Пригласи первого друга и займи первое место","Invite your first friend and take first place")}</p>
              </div>
            )}
            {!leaderboardLoading && leaderboardItems.map((item,i)=>{
              const me = item.id===myUserId
              return (
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.lineSoft}`,padding:"12px 10px",margin:"0 -10px",borderRadius:R.sm,background:me?`${C.gold}0f`:"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                    <span className="mono" style={{fontSize:F.sm,width:24,color:i<3?C.gold:C.ink55,fontWeight:i<3?700:400}}>{i+1}</span>
                    <span className="serif" style={{fontSize:F.lg,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}{me?L(" · ты"," · you"):""}</span>
                    {i<3 && <span style={{color:C.gold,display:"flex"}}><Ico n="crown" s={13}/></span>}
                  </div>
                  <span className="mono" style={{fontSize:F.sm,color:C.gold,fontWeight:700}}>{item.count}</span>
                </div>
              )
            })}
            {myRank && myRank>10 && <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:14,textAlign:"center"}}>{L("Твоё место","Your rank")}: {myRank}</p>}
          </div>
        </div>
      )}
    </>
  )
}