"use client"
// ПОЛОЖИТЬ СЮДА: app/page.tsx
import { useState, useEffect, useRef } from "react"
import { InviteBanner, InvitePartnerButton, InviteFriendsButton, ComparisonScreen } from "./components/InviteFlow"
import { getActiveEvent } from "@/lib/events"
import { PRICES, off, MAX_CHAT_SHOTS } from "@/lib/pricing"
// ВРЕМЕННО: панель диагностики. Удалить эту строку и <DebugPanel/> ниже,
// когда оплата заработает.


/* ────────────────────────────────────────────────────────────
   ДИЗАЙН-ТОКЕНЫ
   ──────────────────────────────────────────────────────────── */
const C = {
  bg:"#0A0908", bgRaised:"#100D0C",
  ink:"#F4EFE7", ink70:"rgba(244,239,231,0.70)", ink50:"rgba(244,239,231,0.50)", ink35:"rgba(244,239,231,0.35)",
  line:"rgba(255,255,255,0.09)", lineSoft:"rgba(255,255,255,0.055)",
  red:"#C1272D", redSoft:"#E14750", redDeep:"#7A1015",
  gold:"#E9C77B", goldSoft:"#F3D998", goldInk:"#221703",
}
const R = { sm:12, md:18, lg:24, pill:999 }
const F = { xs:11, sm:12.5, md:14, lg:16, xl:21, xxl:27, hero:42 }
const PAD = 20

/* ────────────────────────────────────────────────────────────
   API
   Каждый запрос уходит с подписью Telegram. Без неё сервер
   теперь отвечает 401 на всё платное — userId в теле он больше
   не читает, потому что подставить туда можно было что угодно.
   ──────────────────────────────────────────────────────────── */
const tgApp = () => (typeof window !== "undefined" ? (window as any)?.Telegram?.WebApp : null)
const initData = () => tgApp()?.initData || ""

async function api(path: string, opts: RequestInit = {}){
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": initData(),
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

const LETTERS = [
  { name:"Влюбленные", title:"Выбор сердца", text:"Сегодня вас тянет друг к другу. Он думает о тебе, когда не пишет." },
  { name:"Солнце", title:"Тепло вдвоем", text:"Вы как power couple. Вас видят вместе даже когда вы порознь." },
  { name:"Звезда", title:"Надежда", text:"Кто-то из вас влюбился сильнее и боится спугнуть." },
]

type Mode = "couple" | "crush" | "friend"
type InputKind = "two" | "joint" | "both"
type Feature = "deep"|"hidden"|"future"|"custom"

const MODES: { id: Mode, label: string, sub: string }[] = [
  { id:"couple", label:"Пара",  sub:"уже вместе" },
  { id:"crush",  label:"Краш",  sub:"ещё не пара" },
  { id:"friend", label:"Друг",  sub:"без романтики" },
]

/* Формулировка про измены заменена намеренно. Прежний вариант просил у
   модели вердикт о человеке, которого нет в разговоре: такой ответ нельзя
   ни подтвердить, ни отозвать, и именно после него приходили возвраты.
   Тревога осталась той же, но теперь вопрос про наблюдаемое поведение. */
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

function pickQuestions(mode: Mode, seed: number){
  const pool = SUGGESTED_QUESTIONS[mode]
  const start = seed % pool.length
  return [...pool.slice(start), ...pool.slice(0, start)].slice(0, 4)
}

const MOOD_OPTIONS = [
  { id:"up", label:"На подъёме" }, { id:"calm", label:"Спокойно" },
  { id:"tired", label:"Устал(а)" }, { id:"anxious", label:"Тревожно" },
  { id:"sad", label:"Грустновато" },
]

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
const FALLBACK_TEASER: Record<Feature,string> = {
  deep:   "Разбор начинается с того, что видно на фото раньше всего…",
  hidden: "Первое, что выдаёт настроение — это даже не лицо…",
  future: "Если смотреть трезво, ключевой момент прячется не там…",
  custom: "Ответ начинается с самого неудобного…",
}

export default function Page(){
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
  const [daily,setDaily]=useState(LETTERS[0])
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
  const [deepExtra,setDeepExtra]=useState("")
  const [customQuestion,setCustomQuestion]=useState("")
  const [chipSeed,setChipSeed]=useState(0)
  const [selectedCard,setSelectedCard]=useState<Feature>("deep")
  const [waiting,setWaiting]=useState<string|null>(null)   // ждём подтверждения оплаты

  /* ── подписка ── */
  const [subActive,setSubActive]=useState(false)
  const [subUntil,setSubUntil]=useState<number|null>(null)
  const [subCancelled,setSubCancelled]=useState(false)
  const [subOpen,setSubOpen]=useState(false)

  /* ── переписка ── */
  const [chatShots,setChatShots]=useState<string[]>([])
  const [convCredits,setConvCredits]=useState(0)
  const [convLoad,setConvLoad]=useState(false)
  const [convRes,setConvRes]=useState("")
  const [convOpen,setConvOpen]=useState(false)

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

  useEffect(()=>{
    try{ const s=localStorage.getItem("love_scanner_sound"); if(s!==null) setSoundOn(s==="1") }catch{}
  },[])

  useEffect(()=>{
    setDaily(LETTERS[Math.floor(Math.random()*LETTERS.length)])
    const tg = tgApp()
    const userId = tg?.initDataUnsafe?.user?.id
    if(!userId) return
    setMyUserId(String(userId))
    tg?.ready?.()

    post("/api/register-user",{userId,optIn:true,name:tg?.initDataUnsafe?.user?.first_name}).catch(()=>{})

    apiJson(`/api/invite/status?userId=${userId}`).then(({data:j})=>{
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

    apiJson(`/api/custom-credit/use?userId=${userId}`).then(({data:j})=>setHasFreeCustomCredit(!!j.hasCredit)).catch(()=>{})
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
  const generate = async (feature: Feature, extraOverride?: string) => {
    if(viewingHistoryScan) return
    setBusy(b=>({...b,[feature]:true}))
    try{
      const { status, data } = await post("/api/love",{
        photos: photosForScan(),
        input: effectiveInput(),
        type: feature,
        extra: feature==="deep" ? deepExtra : (feature==="custom" ? (extraOverride ?? customQuestion) : ""),
        mode,
        scanId,
        teaser: teasers[feature] || "",
      })
      if(status===402){
        setResults(r=>({...r,[feature]:"Оплата ещё не подтвердилась. Подожди пару секунд и нажми ещё раз."}))
      } else if(!data.full){
        setResults(r=>({...r,[feature]:"Не получилось собрать разбор. Попробуй ещё раз — повторно платить не нужно."}))
      } else {
        setResults(r=>({...r,[feature]:data.full}))
        if(scanId) post("/api/scan/result",{scanId, feature, text:data.full}).catch(()=>{})
      }
    }catch{
      setResults(r=>({...r,[feature]:"Сеть подвела. Попробуй ещё раз."}))
    }
    setBusy(b=>({...b,[feature]:false}))
  }

  const checkSeasonal = async () => {
    if(!activeEvent || viewingHistoryScan) return
    setSeasonalLoad(true)
    try{
      const { data } = await post("/api/love",{ photos:photosForScan(), input:effectiveInput(), type:"seasonal", mode, eventId:activeEvent.id, scanId })
      setSeasonalRes(data.full || "Не получилось. Попробуй ещё раз.")
    }catch{ setSeasonalRes("Не получилось. Попробуй ещё раз.") }
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
    if(feature==="bundle"){
      setUnlocked(u=>({...u,deep:true,hidden:true,future:true}))
    } else {
      setUnlocked(u=>({...u,[feature]:true}))
    }
  }

  /* ── покупка ── */
  const buy = async (feature: Feature|"bundle"|"seasonal"|"conversation"|"sub") => {
    const tg = tgApp()
    if(!tg){ alert("Открой приложение через бота"); return }
    tg.ready()

    // Бесплатный кредит с колеса — оплату минуем целиком.
    // Списание и разблокировка происходят одним запросом на сервере:
    // раньше клиент звал сначала /api/custom-credit/use, потом unlock,
    // и кредит уходил дважды.
    if(feature==="custom" && hasFreeCustomCredit && scanId){
      const { data } = await post("/api/scan/unlock",{ scanId, feature:"custom", source:"credit" })
      if(data?.ok){ setHasFreeCustomCredit(false); applyUnlock("custom"); return }
      alert("Бесплатный разбор уже использован")
      setHasFreeCustomCredit(false)
      return
    }

    const needsScan = feature!=="sub" && feature!=="conversation" && feature!=="seasonal"
    if(needsScan && !scanId){ alert("Сначала сделай скан"); return }

    setWaiting(feature)
    try{
      const { status, data } = await post("/api/stars/create",{
        feature,
        scanId: needsScan ? scanId : undefined,
        eventId: feature==="seasonal" ? activeEvent?.id : undefined,
      })
      if(status===409){ await refreshSubscription(); setWaiting(null); alert("Подписка уже активна"); return }
      if(!data.invoiceLink){ setWaiting(null); alert("Оплата не открылась: "+(data.error||"нет ссылки")); return }

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
        if(ok) applyUnlock(feature)
        else alert("Оплата прошла, но подтверждение задерживается. Открой историю сканов через минуту — разбор будет там.")
        setWaiting(null)
      })
    }catch(e:any){ setWaiting(null); alert(e.message) }
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
      alert("Бесплатных разборов не осталось")
      setRefCredits(0)
    }
  }

  /* ── скан ── */
  const check = async () => {
    if(!photosReady) return alert(inputKind==="joint" ? "Добавь совместное фото" : "Нужны оба фото")
    setLoad(true)
    try{
      const salt = Date.now()+"_"+Math.random().toString(36).slice(2)
      const newScanId = (crypto as any)?.randomUUID ? crypto.randomUUID() : salt
      const { status, data } = await post("/api/love",{
        photos: photosForScan(), input: effectiveInput(),
        type:"short", salt, mode, mood: todayMood,
      })
      if(status===429){ setLoad(false); return alert(data.error) }

      setRes({ percent:data.percent, full:data.full })
      setTeasers(data.teasers || {})
      setScanId(newScanId)
      setSimilarItems(null)
      setViewingHistoryScan(false)
      setTimeout(()=>resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),120)

      // Новая пара фото — новый скан. Всё платное снова закрыто, кроме
      // подписки: подписчику блокировать нечего.
      const fresh = subActive || isFounder
      setUnlocked({deep:fresh,hidden:fresh,future:fresh,custom:fresh})
      setOpened({deep:false,hidden:false,future:false,custom:false})
      setResults({deep:"",hidden:"",future:"",custom:""})
      setDeepExtra(""); setCustomQuestion("")

      if(typeof data.percent==="number" && data.full){
        post("/api/similar",{percent:data.percent, snippet:String(data.full).slice(0,120), mode}).catch(()=>{})
      }

      if(myUserId){
        await post("/api/scan",{
          scanId:newScanId, mode, input:effectiveInput(),
          percent:data.percent, full:data.full, teasers:data.teasers||undefined,
        })
        if(referrerId && !refCredited){
          setRefCredited(true)
          post("/api/invite/complete",{referrerId, newUserId:myUserId}).catch(()=>{})
        }
      }
    }catch{
      alert("Скан не удался. Проверь связь и попробуй ещё раз.")
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
      if(status===402){ setConvRes("Оплата ещё не подтвердилась, подожди пару секунд.") }
      else setConvRes(data.full || "Не получилось разобрать переписку. Попробуй ещё раз.")
      refreshSubscription()
    }catch{ setConvRes("Сеть подвела. Попробуй ещё раз.") }
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
      }
    }catch{}
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
      ctx.fillText("L O V E   S C A N N E R   ·   А Р Х И В   № 1 7", 540, 160)
      ctx.fillStyle="#C1272D"; ctx.font="italic 300px Georgia, serif"
      ctx.fillText(`${res.percent}%`, 540, 560)
      ctx.fillStyle="rgba(244,239,231,0.5)"; ctx.font="500 26px 'JetBrains Mono', monospace"
      ctx.fillText("С О В М Е С Т И М О С Т Ь", 540, 626)
      ctx.fillStyle="#F4EFE7"; ctx.font="italic 300 42px Georgia, serif"
      wrapCanvasText(ctx, `«${(res.full||"").slice(0,120).trim()}…»`, 540, 790, 800, 58)
      ctx.fillStyle="rgba(244,239,231,0.35)"; ctx.font="24px 'JetBrains Mono', monospace"
      ctx.fillText("проверь свою → @lovescan_ai_bot", 540, 1240)

      canvas.toBlob(async (blob)=>{
        if(!blob){ setSharing(false); return }
        const file=new File([blob],"love-scanner.png",{type:"image/png"})
        const nav=navigator as any
        try{
          if(nav.canShare && nav.canShare({files:[file]})){
            await nav.share({files:[file],title:"Love Scanner",text:`Совместимость ${res.percent}%`})
            setSharing(false); return
          }
        }catch{}
        const url=URL.createObjectURL(blob)
        const a=document.createElement("a"); a.href=url; a.download="love-scanner.png"; a.click()
        URL.revokeObjectURL(url); setSharing(false)
      },"image/png")
    }catch{ setSharing(false) }
  }

  /* ── стили ── */
  const glass:React.CSSProperties = {
    background:"linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.018))",
    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
    border:`1px solid ${C.line}`,
  }
  const label:React.CSSProperties = { fontSize:F.xs, letterSpacing:"0.14em", textTransform:"uppercase", color:C.ink35 }
  const Dots = () => <span className="loader-dots"><span>·</span><span>·</span><span>·</span></span>
  const Rule = ({children,right}:{children:React.ReactNode,right?:React.ReactNode}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
      <p className="mono" style={label}>{children}</p>
      <div style={{flex:1,height:1,background:C.lineSoft}}/>
      {right}
    </div>
  )
  const AnswerBox = ({text}:{text:string}) => (
    <div className="ai-font" style={{marginTop:12,borderRadius:R.sm,background:"rgba(255,255,255,0.045)",border:`1px solid ${C.line}`,borderLeft:`2px solid ${C.gold}66`,padding:14,fontSize:F.md,whiteSpace:"pre-wrap",color:C.ink}}>{text}</div>
  )
  const Skeleton = ({h=64}:{h?:number}) => <div className="skeleton" style={{marginTop:12,borderRadius:R.sm,height:h,border:`1px solid ${C.line}`}}/>

  const ringLen = 2*Math.PI*52
  const ringOffset = ringLen - ((res?.percent ?? 0)/100)*ringLen*0.75
  const highChance = res ? res.percent>=75 : false

  function IconBtn({on=false,onClick,title,children}:{on?:boolean,onClick:()=>void,title:string,children:React.ReactNode}){
    return <button onClick={()=>{tapFx();onClick()}} title={title} aria-label={title} className="icon-btn" style={{width:32,height:32,borderRadius:R.pill,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:on?`${C.gold}1f`:"transparent",color:on?C.gold:C.ink50}}>{children}</button>
  }

  function EnvelopeReveal({onOpen}:{onOpen:()=>void}){
    const [flipping,setFlipping]=useState(false)
    return (
      <div className="seal-card" style={{position:"relative",width:"100%",height:104,cursor:"pointer",perspective:"1200px",marginTop:12}}
        onClick={()=>{ if(flipping) return; setFlipping(true); playSound("unlock"); haptic("medium"); setTimeout(onOpen,650) }}>
        <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .65s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:flipping?"rotateY(180deg)":"rotateY(0deg)"}}>
          <div style={{position:"absolute",inset:0,borderRadius:R.md,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,backfaceVisibility:"hidden",background:`linear-gradient(135deg, ${C.gold}1c, rgba(255,255,255,0.02))`,border:`1px solid ${C.gold}44`}}>
            <div className="seal" style={{width:38,height:38,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, ${C.goldSoft}, ${C.gold} 55%, #a3822f)`,display:"flex",alignItems:"center",justifyContent:"center",color:C.goldInk}}><Ico n="spark" s={16}/></div>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,letterSpacing:"0.06em"}}>Оплачено — нажми, чтобы вскрыть</p>
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
    const text = teasers[feature] || FALLBACK_TEASER[feature]
    return (
      <div style={{position:"relative",marginTop:12,height:72,overflow:"hidden"}}>
        <p className="ai-font teaser-veil" style={{fontSize:F.md}}>{text}</p>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:22}}>
          <span className="mono" style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 12px",borderRadius:R.pill,background:"rgba(10,9,8,0.6)",border:`1px solid ${C.line}`,color:C.ink50,fontSize:F.xs,letterSpacing:"0.06em"}}>
            <Ico n="lock" s={12}/> продолжение запечатано
          </span>
        </div>
      </div>
    )
  }

  const CARDS: {id:Feature, ico:IcoName, title:string, sub:string}[] = [
    { id:"deep",   ico:"layers", title:"Глубокий разбор", sub:"Характеры, ред флаги, что делать" },
    { id:"hidden", ico:"mask",   title:"Что не говорит",  sub:"Скрытые эмоции по языку тела" },
    { id:"future", ico:"moon",   title:mode==="friend"?"Будущее дружбы":"Будущее пары", sub:mode==="friend"?"Останетесь ли близки":"Расстанетесь или вместе" },
    { id:"custom", ico:"letter", title:"Свой вопрос",     sub:"Спроси что угодно про этих двоих" },
  ]
  const current = CARDS.find(c=>c.id===selectedCard)!
  const allThree = unlocked.deep && unlocked.hidden && unlocked.future

  const PhotoSlot = ({img,onPick,label:lab,ratio="4/5"}:{img:string,onPick:(s:string)=>void,label:string,ratio?:string}) => (
    <label className="photo-card" style={{cursor:"pointer",display:"block"}}>
      <div style={{...glass,borderRadius:R.md,padding:7,border:img?`1px solid ${C.line}`:"1px dashed rgba(255,255,255,0.16)",boxShadow:img?"0 12px 30px rgba(0,0,0,0.4)":"none"}}>
        <div style={{width:"100%",aspectRatio:ratio,borderRadius:R.sm,overflow:"hidden",position:"relative",background:"rgba(255,255,255,0.025)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
          {img ? <SmartImg src={img}/> : <>
            <span style={{width:30,height:30,borderRadius:"50%",border:`1px solid ${C.line}`,display:"flex",alignItems:"center",justifyContent:"center",color:C.ink35}}><Ico n="plus" s={14}/></span>
            <span className="mono" style={{fontSize:F.xs,color:C.ink35}}>добавить</span>
          </>}
          {load && img && <div className="scan-sweep"/>}
        </div>
        <p className="mono" style={{fontSize:F.xs,textAlign:"center",marginTop:8,color:img?C.ink50:C.ink35}}>{lab}</p>
      </div>
      <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compressPhoto(f).then(onPick)}}/>
    </label>
  )

  return (
    <div style={{minHeight:"100dvh",width:"100%",display:"flex",justifyContent:"center",background:C.bg,color:C.ink,position:"relative",fontFamily:"'JetBrains Mono', monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&family=Newsreader:ital,opsz,wght@1,6..72,300;1,6..72,400&display=swap');
        *{ box-sizing:border-box }
        ::-webkit-scrollbar{ display:none }
        button:focus-visible, textarea:focus-visible, label:focus-visible{ outline:2px solid ${C.gold}; outline-offset:2px }
        .serif{ font-family:'Instrument Serif',serif; font-weight:400 }
        .mono{ font-family:'JetBrains Mono',monospace }
        .ai-font{ font-family:'Newsreader',serif; font-style:italic; font-weight:300; line-height:1.72 }
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

      <div className="blob" style={{position:"absolute",top:-140,left:-100,width:340,height:340,borderRadius:"50%",background:`radial-gradient(circle, ${C.red}3d, transparent 70%)`,filter:"blur(64px)",pointerEvents:"none"}}/>
      <div className="blob" style={{position:"absolute",bottom:-160,right:-120,width:380,height:380,borderRadius:"50%",background:`radial-gradient(circle, ${C.gold}2b, transparent 70%)`,filter:"blur(72px)",pointerEvents:"none",animationDelay:"5s"}}/>

      <div style={{width:420,maxWidth:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1,padding:`0 0 calc(32px + env(safe-area-inset-bottom))`}}>

        {/* ВРЕМЕННО: диагностика. Удалить вместе с импортом выше. */}
        

        <div style={{padding:`${PAD}px ${PAD}px 0`}}><InviteBanner onJoin={setInviteSessionId} /></div>

        {/* шапка */}
        <div className="reveal" style={{padding:`22px ${PAD}px 0`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <p className="mono" style={label}>Архив №17</p>
            <div style={{display:"flex",alignItems:"center",gap:2,padding:3,borderRadius:R.pill,...glass}}>
              {(isFounder || subActive) && (
                <div title={subActive?"Подписка активна":"Founder"} style={{width:32,height:32,borderRadius:R.pill,display:"flex",alignItems:"center",justifyContent:"center",color:C.gold,background:`${C.gold}1f`}}><Ico n="crown" s={15}/></div>
              )}
              <IconBtn onClick={openLeaderboard} title="Лидерборд"><Ico n="trophy"/></IconBtn>
              <div style={{position:"relative"}}>
                <IconBtn on={!wheelSpunToday} onClick={()=>setWheelOpen(true)} title="Колесо дня"><Ico n="wheel"/></IconBtn>
                {!wheelSpunToday && <span style={{position:"absolute",top:2,right:2,width:7,height:7,borderRadius:"50%",background:C.red,border:`1.5px solid ${C.bg}`}}/>}
              </div>
              <IconBtn onClick={openHistory} title="История сканов"><Ico n="archive"/></IconBtn>
              <IconBtn on={notifyOn} onClick={toggleNotify} title="Уведомления"><Ico n={notifyOn?"bell":"bellOff"}/></IconBtn>
              <IconBtn on={soundOn} onClick={toggleSound} title="Звук"><Ico n={soundOn?"sound":"mute"}/></IconBtn>
            </div>
          </div>
          <h1 className="serif" style={{fontSize:F.hero,lineHeight:0.94,marginTop:14,letterSpacing:"-0.01em"}}>Love<br/><i>Scanner</i></h1>
          <p className="ai-font" style={{fontSize:F.lg,color:C.ink50,marginTop:8}}>Читаем по фото и переписке</p>
        </div>

        {/* режим */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:26,animationDelay:".05s"}}>
          <Rule>Кто на фото</Rule>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:4,borderRadius:R.sm,...glass}}>
            {MODES.map(m=>(
              <button key={m.id} onClick={()=>{tapFx();setMode(m.id)}} className="unlock-btn" style={{borderRadius:R.sm-4,padding:"9px 4px",cursor:"pointer",textAlign:"center",border:"none",background:mode===m.id?`linear-gradient(135deg, ${C.red}, ${C.redDeep})`:"transparent",color:mode===m.id?"#fff":C.ink50}}>
                <div className="serif" style={{fontSize:F.lg}}>{m.label}</div>
                <div className="mono" style={{fontSize:9.5,opacity:mode===m.id?.75:.6,marginTop:2}}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ФОТО — теперь два способа. Совместное фото несёт то, чего нет
            в отдельных портретах: дистанцию, касания, зеркаление поз. */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:24,animationDelay:".1s"}}>
          <Rule>Фото</Rule>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:4,borderRadius:R.sm,...glass,marginBottom:12}}>
            {([["two","По отдельности"],["joint","Вместе"]] as const).map(([k,lab])=>(
              <button key={k} onClick={()=>{tapFx();setInputKind(k)}} className="unlock-btn mono" style={{borderRadius:R.sm-4,padding:"9px 4px",cursor:"pointer",border:"none",fontSize:F.sm,background:inputKind===k?"rgba(255,255,255,0.09)":"transparent",color:inputKind===k?C.ink:C.ink50}}>{lab}</button>
            ))}
          </div>

          {inputKind==="two" ? (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <PhotoSlot img={p1} onPick={setP1} label="Первый человек"/>
                <PhotoSlot img={p2} onPick={setP2} label="Второй человек"/>
              </div>
              {p1 && p2 && (
                <div style={{marginTop:12}}>
                  {pJoint ? (
                    <PhotoSlot img={pJoint} onPick={setPJoint} label="Совместное фото" ratio="16/10"/>
                  ) : (
                    <label className="unlock-btn" style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderRadius:R.md,border:`1px dashed ${C.gold}55`,background:`${C.gold}0d`,cursor:"pointer",color:C.gold}}>
                      <Ico n="users" s={17}/>
                      <span style={{minWidth:0}}>
                        <span className="mono" style={{fontSize:F.sm,display:"block"}}>Добавить совместное фото</span>
                        <span className="mono" style={{fontSize:F.xs,color:C.ink50,display:"block",marginTop:3}}>Разбор станет заметно точнее</span>
                      </span>
                      <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compressPhoto(f).then(setPJoint)}}/>
                    </label>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <PhotoSlot img={pJoint} onPick={setPJoint} label="Оба человека в кадре" ratio="16/10"/>
              <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:8,lineHeight:1.5}}>Одно фото, где вы вдвоём. По нему видно дистанцию, касания и то, кто к кому наклонён — этого не видно на отдельных портретах.</p>
            </>
          )}
        </div>

        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:16,animationDelay:".14s"}}>
          <button onClick={()=>{tapFx();check()}} disabled={load||!photosReady} className="cta" style={{width:"100%",height:56,borderRadius:R.pill,border:"none",cursor:photosReady?"pointer":"not-allowed",background:photosReady?`linear-gradient(120deg, ${C.red}, ${C.redDeep})`:"rgba(255,255,255,0.06)",color:photosReady?"#fff":C.ink35,display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:photosReady?`0 12px 34px ${C.red}3d`:"none",opacity:load?.8:1}}>
            <span className="mono" style={{fontSize:F.sm,letterSpacing:"0.14em",textTransform:"uppercase",fontWeight:500}}>
              {load ? <>Считываю кадры<Dots/></> : photosReady ? "Проверить совместимость" : (inputKind==="joint"?"Добавь совместное фото":"Добавь оба фото")}
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
                    <span className="serif" style={{fontSize:40,lineHeight:1}}><CountUp key={res.percent} value={res.percent}/>%</span>
                    <span className="mono" style={{fontSize:9.5,letterSpacing:"0.16em",color:C.ink35,marginTop:2}}>МЭТЧ</span>
                  </div>
                </div>
              </div>

              <div className="ai-font" style={{fontSize:F.lg,marginTop:18,whiteSpace:"pre-wrap"}}>{res.full}</div>

              <div style={{marginTop:18,paddingTop:16,borderTop:`1px solid ${C.lineSoft}`}}>
                <p className="ai-font" style={{fontSize:F.md,color:C.ink70}}>
                  {highChance ? "Процент высокий. В запечатанных письмах — что там думают на самом деле и как не спугнуть."
                              : "Есть что подтянуть. В запечатанных письмах — конкретный план, а не догадки."}
                </p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
                  <button onClick={()=>{tapFx();shareResult()}} disabled={sharing} className="unlock-btn mono" style={{height:38,padding:"0 15px",borderRadius:R.pill,border:`1px solid ${C.line}`,background:"rgba(255,255,255,0.06)",color:C.ink,fontSize:F.sm,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}>
                    {sharing ? <>Собираю картинку<Dots/></> : <><Ico n="share" s={14}/> Поделиться</>}
                  </button>
                  <InvitePartnerButton result={res} />
                </div>

                {similarItems===null ? (
                  <button onClick={()=>{tapFx();loadSimilar()}} disabled={similarLoading} className="unlock-btn mono" style={{marginTop:10,height:34,padding:"0 14px",borderRadius:R.pill,border:`1px solid ${C.lineSoft}`,background:"transparent",color:C.ink50,fontSize:F.xs,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7}}>
                    {similarLoading ? <>Ищу похожие<Dots/></> : <><Ico n="eye" s={13}/> Что было у других с похожим %</>}
                  </button>
                ) : similarItems.length>0 ? (
                  <div style={{marginTop:14}}>
                    <p className="mono" style={{...label,marginBottom:8}}>Похожий процент у других</p>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {similarItems.map((s,i)=><div key={i} className="ai-font" style={{fontSize:F.sm,color:C.ink70,borderLeft:`2px solid ${C.gold}55`,paddingLeft:12}}>{s}…</div>)}
                    </div>
                  </div>
                ) : <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:10}}>Пока мало данных с похожим % — загляни позже</p>}
              </div>
            </div>
          </div>
        )}

        {/* запечатанные письма */}
        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:30,animationDelay:".18s"}}>
          <Rule>Запечатанные письма</Rule>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {CARDS.map(c=>{
              const active=selectedCard===c.id, open=unlocked[c.id]
              return (
                <button key={c.id} onClick={()=>{tapFx();setSelectedCard(c.id)}} className="unlock-btn" style={{padding:"13px 12px",borderRadius:R.sm,cursor:"pointer",textAlign:"left",background:active?`linear-gradient(180deg, ${C.gold}14, rgba(255,255,255,0.02))`:"rgba(255,255,255,0.035)",border:active?`1px solid ${C.gold}88`:`1px solid ${C.lineSoft}`,color:C.ink}}>
                  <span style={{display:"flex",alignItems:"center",justifyContent:"space-between",color:open?C.gold:(active?C.gold:C.ink50)}}>
                    <Ico n={c.ico} s={18}/>{open && <Ico n="check" s={12}/>}
                  </span>
                  <div className="serif" style={{fontSize:F.lg,marginTop:9,lineHeight:1.1}}>{c.title}</div>
                  <div className="mono" style={{fontSize:F.xs,marginTop:6,color:open?C.gold:C.ink35}}>{open?"открыто":`${PRICES[c.id].now} ✦`}</div>
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
                  {!unlocked[selectedCard] && !(selectedCard==="custom" && hasFreeCustomCredit) && (
                    <p className="mono" style={{fontSize:F.xs,marginTop:6,color:C.ink35}}>
                      <span className="strike">{PRICES[selectedCard].was} ✦</span> · −{off(PRICES[selectedCard])}%
                    </p>
                  )}
                  {selectedCard==="custom" && hasFreeCustomCredit && !unlocked.custom && (
                    <p className="mono" style={{fontSize:F.xs,marginTop:6,color:C.gold}}>Приз с колеса — бесплатно</p>
                  )}
                </div>
                {!unlocked[selectedCard] ? (
                  <button onClick={()=>{tapFx();buy(selectedCard)}} disabled={waiting===selectedCard || !scanId} className="unlock-btn mono" style={{height:38,padding:"0 16px",borderRadius:R.pill,border:"none",cursor:scanId?"pointer":"not-allowed",background:`linear-gradient(135deg, ${C.red}, ${C.redDeep})`,color:"#fff",fontSize:F.sm,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,opacity:scanId?1:0.45}}>
                    {waiting===selectedCard ? <>Жду<Dots/></> : (selectedCard==="custom" && hasFreeCustomCredit ? "Открыть" : `${PRICES[selectedCard].now} ✦`)}
                  </button>
                ) : <span className="mono shimmer-price" style={{fontSize:F.sm,fontWeight:700,paddingTop:6}}>Открыто</span>}
              </div>

              {!scanId && !unlocked[selectedCard] && (
                <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:10}}>Сначала сделай скан — письма пишутся под конкретные фото</p>
              )}

              {!unlocked[selectedCard] && scanId && <Teaser feature={selectedCard}/>}

              {unlocked[selectedCard] && !opened[selectedCard] && selectedCard!=="custom" && (
                <EnvelopeReveal onOpen={()=>{ setOpened(o=>({...o,[selectedCard]:true})); generate(selectedCard) }}/>
              )}

              {/* deep */}
              {selectedCard==="deep" && unlocked.deep && opened.deep && (
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
                  {!viewingHistoryScan && <textarea value={deepExtra} onChange={e=>setDeepExtra(e.target.value)} placeholder="Что между вами происходит? Пара фраз сделает разбор точнее." className="mono letter-area" style={{width:"100%",minHeight:72,borderRadius:R.sm,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.line}`,padding:12,fontSize:F.sm,color:C.ink,resize:"vertical",lineHeight:1.5}}/>}
                  {!viewingHistoryScan && <button onClick={()=>{tapFx();generate("deep")}} className="unlock-btn" style={{width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontWeight:700}}><span className="mono" style={{fontSize:F.sm}}>{busy.deep ? <>Вскрываю<Dots/></> : (results.deep ? "Пересобрать с деталями" : "Вскрыть письмо")}</span></button>}
                  {busy.deep && !results.deep && <Skeleton h={78}/>}
                  {results.deep && <AnswerBox text={results.deep}/>}
                </div>
              )}

              {/* hidden / future */}
              {(selectedCard==="hidden"||selectedCard==="future") && unlocked[selectedCard] && opened[selectedCard] && (<>
                {busy[selectedCard] && !results[selectedCard] && <Skeleton/>}
                {results[selectedCard] && <AnswerBox text={results[selectedCard]}/>}
              </>)}

              {/* custom */}
              {selectedCard==="custom" && unlocked.custom && !opened.custom && (
                <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <p className="mono" style={label}>Можно спросить так</p>
                    <button onClick={()=>{tapFx();setChipSeed(s=>s+1)}} className="mono unlock-btn" style={{fontSize:F.xs,background:"none",border:"none",cursor:"pointer",color:C.gold,display:"inline-flex",alignItems:"center",gap:5}}><Ico n="refresh" s={12}/> другие</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {pickQuestions(mode,chipSeed).map((q,i)=>(
                      <button key={i} onClick={()=>{tapFx();setCustomQuestion(q)}} className="unlock-btn ai-font" style={{textAlign:"left",padding:"10px 13px",borderRadius:R.sm,cursor:"pointer",fontSize:F.md,lineHeight:1.4,background:customQuestion===q?`${C.gold}1c`:"rgba(255,255,255,0.035)",border:customQuestion===q?`1px solid ${C.gold}77`:`1px solid ${C.lineSoft}`,color:customQuestion===q?C.ink:C.ink70}}>{q}</button>
                    ))}
                  </div>
                  <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} placeholder="Или напиши свой вопрос" className="mono letter-area" style={{width:"100%",minHeight:70,borderRadius:R.sm,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.line}`,padding:12,fontSize:F.sm,color:C.ink,resize:"vertical",lineHeight:1.5}}/>
                  <button onClick={()=>{tapFx();setOpened(o=>({...o,custom:true}));generate("custom")}} disabled={!customQuestion.trim()} className="unlock-btn" style={{width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontWeight:700,opacity:customQuestion.trim()?1:0.45}}><span className="mono" style={{fontSize:F.sm}}>Задать вопрос</span></button>
                </div>
              )}
              {selectedCard==="custom" && unlocked.custom && opened.custom && (
                <div style={{marginTop:2,display:"flex",flexDirection:"column",gap:10}}>
                  {busy.custom && !results.custom && <Skeleton h={78}/>}
                  {results.custom && <AnswerBox text={results.custom}/>}
                  {results.custom && !viewingHistoryScan && (<>
                    <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} placeholder="Ещё вопрос" className="mono letter-area" style={{width:"100%",minHeight:52,borderRadius:R.sm,background:"rgba(255,255,255,0.04)",border:`1px solid ${C.line}`,padding:12,fontSize:F.sm,color:C.ink,resize:"vertical",lineHeight:1.5}}/>
                    <button onClick={()=>{tapFx();generate("custom")}} disabled={!customQuestion.trim()||busy.custom} className="unlock-btn" style={{width:"100%",height:38,borderRadius:R.pill,border:`1px solid ${C.line}`,cursor:"pointer",background:"rgba(255,255,255,0.07)",color:C.ink,opacity:customQuestion.trim()?1:0.45}}><span className="mono" style={{fontSize:F.sm}}>{busy.custom ? <>Спрашиваю<Dots/></> : "Спросить ещё"}</span></button>
                  </>)}
                </div>
              )}
            </div>

            {!allThree && scanId && (
              <button onClick={()=>{tapFx();buy("bundle")}} disabled={waiting==="bundle"} className="unlock-btn" style={{marginTop:10,width:"100%",padding:"14px 18px",borderRadius:R.md,border:`1px solid ${C.gold}55`,cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}18, rgba(255,255,255,0.02))`,color:C.ink,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,textAlign:"left"}}>
                <span>
                  <span className="serif" style={{fontSize:F.xl,display:"block",lineHeight:1.1}}>Все три письма</span>
                  <span className="mono" style={{fontSize:F.xs,color:C.ink50,display:"block",marginTop:4}}><span className="strike">{PRICES.bundle.was} ✦</span> · экономия {off(PRICES.bundle)}%</span>
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
                <p className="serif" style={{fontSize:F.xl}}>Архив открыт</p>
              </div>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6,lineHeight:1.5}}>
                Безлимитные сканы и все разборы{subUntil ? ` до ${new Date(subUntil).toLocaleDateString("ru-RU",{day:"2-digit",month:"long"})}` : ""}.
                {subCancelled ? " Автопродление отключено." : " Продлится автоматически."}
              </p>
            </div>
          ) : (
            <div style={{...glass,borderRadius:R.md,padding:16,border:`1px solid ${C.gold}44`,background:`linear-gradient(135deg, ${C.gold}10, rgba(255,255,255,0.02))`}}>
              <p className="mono" style={{...label,color:C.gold}}>Подписка</p>
              <p className="serif" style={{fontSize:F.xxl,marginTop:7,lineHeight:1.05}}>Архив</p>
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                {["Сканы без ограничений","Все письма открыты сразу","Разбор переписки включён","Новые фото не сбрасывают доступ"].map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{color:C.gold,display:"flex",flexShrink:0}}><Ico n="check" s={13}/></span>
                    <span className="mono" style={{fontSize:F.sm,color:C.ink70}}>{t}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>{tapFx();buy("sub")}} disabled={waiting==="sub"} className="unlock-btn mono" style={{marginTop:14,width:"100%",height:46,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm}}>
                {waiting==="sub" ? <>Оформляю<Dots/></> : `${PRICES.sub.now} ✦ в месяц`}
              </button>
              <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:8,textAlign:"center"}}>Отменить можно в любой момент в Telegram</p>
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
                  <p className="serif" style={{fontSize:F.xl}}>Разбор переписки</p>
                </div>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5,lineHeight:1.5}}>
                  До {MAX_CHAT_SHOTS} скриншотов. Кто вкладывается больше, где уходят от темы и что написать следующим сообщением.
                </p>
              </div>
              {!(subActive || convCredits>0) && (
                <button onClick={()=>{tapFx();buy("conversation")}} disabled={waiting==="conversation"} className="unlock-btn mono" style={{height:38,padding:"0 16px",borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.red}, ${C.redDeep})`,color:"#fff",fontSize:F.sm,fontWeight:700,flexShrink:0}}>
                  {waiting==="conversation" ? <>Жду<Dots/></> : `${PRICES.conversation.now} ✦`}
                </button>
              )}
            </div>

            {(subActive || convCredits>0) ? (
              <div style={{marginTop:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {chatShots.map((s,i)=>(
                    <div key={i} style={{position:"relative",aspectRatio:"3/5",borderRadius:R.sm,overflow:"hidden",border:`1px solid ${C.line}`}}>
                      <img src={s} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top"}}/>
                      <button onClick={()=>{tapFx();setChatShots(a=>a.filter((_,j)=>j!==i))}} className="icon-btn" style={{position:"absolute",top:5,right:5,width:22,height:22,borderRadius:R.pill,border:"none",background:"rgba(10,9,8,0.75)",color:C.ink,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={11}/></button>
                    </div>
                  ))}
                  {chatShots.length<MAX_CHAT_SHOTS && (
                    <label className="photo-card" style={{cursor:"pointer",aspectRatio:"3/5",borderRadius:R.sm,border:"1px dashed rgba(255,255,255,0.16)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:C.ink35}}>
                      <Ico n="plus" s={16}/>
                      <span className="mono" style={{fontSize:9.5}}>{chatShots.length}/{MAX_CHAT_SHOTS}</span>
                      <input type="file" hidden accept="image/*" multiple onChange={e=>{ if(e.target.files) addShots(e.target.files) }}/>
                    </label>
                  )}
                </div>
                <button onClick={()=>{tapFx();runConversation()}} disabled={!chatShots.length||convLoad} className="unlock-btn" style={{marginTop:12,width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontWeight:700,opacity:chatShots.length?1:0.45}}>
                  <span className="mono" style={{fontSize:F.sm}}>{convLoad ? <>Читаю переписку<Dots/></> : "Разобрать"}</span>
                </button>
                {convLoad && !convRes && <Skeleton h={90}/>}
                {convRes && <AnswerBox text={convRes}/>}
              </div>
            ) : (
              <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:12,lineHeight:1.5}}>
                Скриншоты нужны только для разбора — они не сохраняются.
              </p>
            )}
          </div>
        </div>

        {/* второстепенное */}
        {moodLoaded && !todayMood && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
            <div style={{...glass,borderRadius:R.md,padding:16}}>
              <p className="serif" style={{fontSize:F.xl}}>Как ты сегодня?</p>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:4}}>Учтём в разборе</p>
              <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:7}}>
                {MOOD_OPTIONS.map(m=>(
                  <button key={m.id} onClick={()=>{tapFx();saveMood(m.id)}} disabled={moodSaving} className="unlock-btn mono" style={{padding:"8px 13px",borderRadius:R.pill,border:`1px solid ${C.lineSoft}`,background:"rgba(255,255,255,0.04)",color:C.ink70,fontSize:F.xs,cursor:"pointer"}}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeEvent && (
          <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
            <div style={{...glass,borderRadius:R.md,padding:16,border:`1px solid ${C.gold}44`,background:`linear-gradient(135deg, ${C.gold}12, rgba(255,255,255,0.02))`}}>
              <p className="mono" style={{...label,color:C.gold}}>Лимитированный ивент</p>
              <p className="serif" style={{fontSize:F.xl,marginTop:7}}>{activeEvent.title}</p>
              <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5,lineHeight:1.5}}>{activeEvent.bannerText}</p>
              {!seasonalUnlocked ? (
                <button onClick={()=>{tapFx();buy("seasonal")}} disabled={!scanId} className="unlock-btn mono" style={{marginTop:14,width:"100%",height:42,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm,opacity:scanId?1:0.45}}>{activeEvent.buttonLabel}</button>
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
                  <p className="serif" style={{fontSize:F.lg}}>Приглашено: {refCount}</p>
                  <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:3}}>Есть бесплатные разборы</p>
                </div>
                <button onClick={()=>{tapFx();useReferralCredit("deep")}} disabled={!scanId} className="unlock-btn mono" style={{height:36,padding:"0 14px",borderRadius:R.pill,border:"none",cursor:"pointer",background:C.gold,color:C.goldInk,fontSize:F.xs,fontWeight:700,flexShrink:0,opacity:scanId?1:0.45}}>Забрать ({refCredits})</button>
              </div>
            ) : <InviteFriendsButton count={refCount} toNextReward={refToNext} />}
          </div>
        </div>

        <div className="reveal" style={{padding:`0 ${PAD}px`,marginTop:14}}>
          <div className="seal-card" style={{position:"relative",width:"100%",height:148,cursor:"pointer",perspective:"1200px"}} onClick={()=>{tapFx();setSealBroken(!sealBroken)}}>
            <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .7s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:sealBroken?"rotateY(180deg)":"rotateY(0deg)"}}>
              <div style={{position:"absolute",inset:0,borderRadius:R.lg,padding:20,display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden",backfaceVisibility:"hidden",...glass,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <p className="mono" style={label}>Письмо дня</p>
                <div style={{paddingRight:64}}>
                  <h2 className="serif" style={{fontSize:F.xxl,lineHeight:1.05}}>Что между<br/><i>вами на самом деле?</i></h2>
                  <p className="mono" style={{fontSize:F.xs,marginTop:8,color:C.ink35}}>Нажми на печать</p>
                </div>
                <div className="seal" style={{position:"absolute",right:18,top:"50%",transform:"translateY(-50%)",width:50,height:50,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, ${C.redSoft}, ${C.red} 55%, ${C.redDeep})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}><Ico n="spark" s={20}/></div>
              </div>
              <div style={{position:"absolute",inset:0,borderRadius:R.lg,padding:20,display:"flex",flexDirection:"column",backfaceVisibility:"hidden",transform:"rotateY(180deg)",...glass,border:`1px solid ${C.red}44`,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <p className="mono" style={{...label,color:C.red}}>Вскрыто · {daily.name}</p>
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

      {/* колесо */}
      {wheelOpen && (
        <div onClick={()=>setWheelOpen(false)} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.72)",backdropFilter:"blur(6px)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"center",padding:PAD}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:340,maxWidth:"100%",...glass,background:C.bgRaised,borderRadius:R.lg,padding:26,textAlign:"center"}}>
            <p className="serif" style={{fontSize:F.xxl}}>Колесо дня</p>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:5}}>Один раз в сутки, бесплатно</p>
            <div style={{margin:"26px auto",width:124,height:124}}>
              <div style={{width:124,height:124,borderRadius:"50%",background:`conic-gradient(${C.red}, ${C.gold}, ${C.redDeep}, ${C.gold}, ${C.red})`,animation:wheelSpinning?"spin 1.4s cubic-bezier(.2,.8,.3,1)":"none",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 12px 34px rgba(0,0,0,0.5)"}}>
                <div style={{width:72,height:72,borderRadius:"50%",background:C.bgRaised,display:"flex",alignItems:"center",justifyContent:"center",color:C.gold}}><Ico n="wheel" s={26}/></div>
              </div>
            </div>
            {wheelPrize ? (
              <div className="reveal">
                <p className="ai-font" style={{fontSize:F.lg,padding:"0 6px"}}>{wheelPrize.label}</p>
                {wheelPrize.prizeId==="free_custom" && hasFreeCustomCredit ? (
                  <button onClick={()=>{tapFx();setSelectedCard("custom");setWheelOpen(false)}} className="unlock-btn mono" style={{marginTop:16,width:"100%",height:44,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm}}>Забрать приз</button>
                ) : <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:12}}>Возвращайся завтра за новым призом</p>}
              </div>
            ) : (
              <button onClick={spinWheel} disabled={wheelSpinning} className="unlock-btn mono" style={{width:"100%",height:46,borderRadius:R.pill,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`,color:C.goldInk,fontWeight:700,fontSize:F.sm,opacity:wheelSpinning?0.7:1}}>{wheelSpinning ? <>Крутим<Dots/></> : "Крутить колесо"}</button>
            )}
            <button onClick={()=>setWheelOpen(false)} className="mono unlock-btn" style={{marginTop:16,background:"none",border:"none",color:C.ink35,fontSize:F.xs,cursor:"pointer"}}>Закрыть</button>
          </div>
        </div>
      )}

      {/* история */}
      {historyOpen && (
        <div onClick={()=>setHistoryOpen(false)} style={{position:"fixed",inset:0,background:"rgba(6,5,5,0.7)",backdropFilter:"blur(6px)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"flex-end"}}>
          <div className="reveal" onClick={e=>e.stopPropagation()} style={{width:420,maxWidth:"100%",maxHeight:"78vh",overflowY:"auto",...glass,background:C.bgRaised,borderRadius:`${R.lg}px ${R.lg}px 0 0`,padding:`10px ${PAD}px calc(${PAD}px + env(safe-area-inset-bottom))`}}>
            <div style={{width:36,height:4,borderRadius:R.pill,background:"rgba(255,255,255,0.16)",margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <p className="serif" style={{fontSize:F.xxl}}>История сканов</p>
              <button onClick={()=>setHistoryOpen(false)} className="icon-btn" style={{width:30,height:30,borderRadius:R.pill,background:"rgba(255,255,255,0.07)",border:"none",color:C.ink50,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={14}/></button>
            </div>
            {historyLoading && <p className="mono" style={{fontSize:F.sm,color:C.ink50}}>Загружаю<Dots/></p>}
            {!historyLoading && historyItems.length===0 && (
              <div style={{padding:"28px 0",textAlign:"center"}}>
                <p className="serif" style={{fontSize:F.xl}}>Здесь пока пусто</p>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6}}>Сделай первый скан — он сохранится сюда</p>
              </div>
            )}
            {!historyLoading && historyItems.map(item=>{
              const n = Object.values(item.unlocked||{}).filter(Boolean).length
              return (
                <div key={item.scanId} onClick={()=>{tapFx();openHistoryScan(item.scanId)}} className="unlock-btn" style={{borderBottom:`1px solid ${C.lineSoft}`,padding:"14px 0",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span className="serif" style={{fontSize:F.xl,color:C.gold}}>{item.percent}%</span>
                    <span className="mono" style={{fontSize:F.xs,color:C.ink35}}>{new Date(item.ts).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <p className="ai-font" style={{fontSize:F.sm,marginTop:5,color:C.ink70}}>{item.snippet}…</p>
                  {n>0 && <p className="mono" style={{fontSize:F.xs,color:C.ink35,marginTop:6}}>Открыто разделов: {n}</p>}
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
              <p className="serif" style={{fontSize:F.xxl}}>Кто больше пригласил</p>
              <button onClick={()=>setLeaderboardOpen(false)} className="icon-btn" style={{width:30,height:30,borderRadius:R.pill,background:"rgba(255,255,255,0.07)",border:"none",color:C.ink50,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ico n="close" s={14}/></button>
            </div>
            <p className="mono" style={{fontSize:F.xs,color:C.ink50,margin:"8px 0 16px",lineHeight:1.5}}>Топ-3 навсегда получают статус Founder — бесплатный доступ ко всем разборам.</p>
            {leaderboardLoading && <p className="mono" style={{fontSize:F.sm,color:C.ink50}}>Загружаю<Dots/></p>}
            {!leaderboardLoading && leaderboardItems.length===0 && (
              <div style={{padding:"24px 0",textAlign:"center"}}>
                <p className="serif" style={{fontSize:F.xl}}>Список пуст</p>
                <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:6}}>Пригласи первого друга и займи первое место</p>
              </div>
            )}
            {!leaderboardLoading && leaderboardItems.map((item,i)=>{
              const me = item.id===myUserId
              return (
                <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.lineSoft}`,padding:"12px 10px",margin:"0 -10px",borderRadius:R.sm,background:me?`${C.gold}0f`:"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                    <span className="mono" style={{fontSize:F.sm,width:24,color:i<3?C.gold:C.ink35,fontWeight:i<3?700:400}}>{i+1}</span>
                    <span className="serif" style={{fontSize:F.lg,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}{me?" · ты":""}</span>
                    {i<3 && <span style={{color:C.gold,display:"flex"}}><Ico n="crown" s={13}/></span>}
                  </div>
                  <span className="mono" style={{fontSize:F.sm,color:C.gold,fontWeight:700}}>{item.count}</span>
                </div>
              )
            })}
            {myRank && myRank>10 && <p className="mono" style={{fontSize:F.xs,color:C.ink50,marginTop:14,textAlign:"center"}}>Твоё место: {myRank}</p>}
          </div>
        </div>
      )}
    </div>
  )
}