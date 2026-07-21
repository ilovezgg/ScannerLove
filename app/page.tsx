"use client"
import { useState, useEffect } from "react"
import { InviteBanner, InvitePartnerButton, InviteFriendsButton, ComparisonScreen } from "./components/InviteFlow"

async function compress(f: File){
  const b=await createImageBitmap(f);let w=b.width,h=b.height,M=1000
  if(w>M||h>M){if(w>h){h=Math.round(h*M/w);w=M}else{w=Math.round(w*M/h);h=M}}
  const c=document.createElement("canvas");c.width=w;c.height=h
  c.getContext("2d")!.drawImage(b,0,0,w,h)
  return c.toDataURL("image/jpeg",0.78)
}

function SmartImg({src}:{src:string}){
  const [pos,setPos]=useState("50% 35%")
  useEffect(()=>{
    // @ts-ignore
    if(!window.FaceDetector ||!src) return
    const img=new Image(); img.src=src
    img.onload=async()=>{
      try{
        // @ts-ignore
        const detector=new window.FaceDetector({fastMode:true})
        const faces=await detector.detect(img)
        if(faces[0]){
          const y = (faces[0].boundingBox.y / img.height * 100)
          setPos(`50% ${Math.max(10,Math.min(60,y))}%`)
        }
      }catch{}
    }
  },[src])
  return <img src={src} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:pos}} />
}

const LETTERS = [
  { name:"Влюбленные", title:"Выбор сердца", text:"Сегодня вас тянет друг к другу. Он думает о тебе, когда не пишет." },
  { name:"Солнце", title:"Тепло вдвоем", text:"Вы как power couple. Вас видят вместе даже когда вы порознь." },
  { name:"Звезда", title:"Надежда", text:"Кто-то из вас влюбился сильнее и боится спугнуть." },
]

type Mode = "couple" | "crush" | "friend"
const MODES: { id: Mode, label: string, sub: string }[] = [
  { id:"couple", label:"Пара",  sub:"уже вместе" },
  { id:"crush",  label:"Краш",  sub:"ещё не пара" },
  { id:"friend", label:"Друг",  sub:"без романтики" },
]

const PRICES = {
  deep:   { now: 27, was: 42 },
  hidden: { now: 20, was: 32 },
  future: { now: 40, was: 65 },
  bundle: { now: 49, was: 42+32+65 },
}

// DECOY teasers — fixed, fake filler paragraphs, NOT derived from the real
// report. Only job: suggest "more juicy content behind the blur" without ever
// putting real spoiler content in the page's HTML.
const DECOY_TEASERS = {
  deep: "...по позе видно то, что обычно не признают вслух, а ещё есть момент с выражением лица, который меняет всю трактовку — и то, что происходит между строк, объясняет гораздо больше, чем кажется на первый взгляд, если приглядеться к деталям на заднем плане и к тому, как расположены...",
  hidden: "...то, как расположены руки и куда направлен взгляд на втором фото, обычно выдаёт больше, чем хотелось бы — там есть деталь, которая полностью меняет расклад, и это ровно то, что не видно с первого взгляда, пока не разложить по полочкам, что на самом деле...",
  future: "...если смотреть на это трезво, а не сквозь розовые очки, то ключевой момент прячется совсем не там, где его обычно ищут — и один нюанс на фото говорит о том, что решится всё гораздо раньше, чем...",
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number){
  const words = text.split(" ")
  let line = ""
  let cy = y
  for(const w of words){
    const test = line + w + " "
    if(ctx.measureText(test).width > maxWidth && line !== ""){
      ctx.fillText(line, x, cy)
      line = w + " "
      cy += lineHeight
    } else line = test
  }
  ctx.fillText(line, x, cy)
  return cy
}

export default function Page(){
  const [p1,setP1]=useState("");const [p2,setP2]=useState("")
  const [mode,setMode]=useState<Mode>("couple")
  const [load,setLoad]=useState(false)
  const [res,setRes]=useState<{percent:number, full:string}|null>(null)
  const [sealBroken,setSealBroken]=useState(false)
  const [daily,setDaily]=useState(LETTERS[0])
  const [sharing,setSharing]=useState(false)

  const [myUserId,setMyUserId]=useState<string|null>(null)
  const [notifyOn,setNotifyOn]=useState(true)
  const [inviteSessionId,setInviteSessionId]=useState<string|null>(null)
  const [referrerId,setReferrerId]=useState<string|null>(null) // from ?startapp=ref_<id>
  const [refCredited,setRefCredited]=useState(false) // guards against double /invite/complete calls

  const [refCount,setRefCount]=useState(0)
  const [refCredits,setRefCredits]=useState(0)
  const [refToNext,setRefToNext]=useState(3)

  const [historyOpen,setHistoryOpen]=useState(false)
  const [historyItems,setHistoryItems]=useState<any[]>([])
  const [historyLoading,setHistoryLoading]=useState(false)

  const [deepUnlocked,setDeepUnlocked]=useState(false)
  const [deepLoad,setDeepLoad]=useState(false)
  const [deepRes,setDeepRes]=useState("")
  const [deepExtra,setDeepExtra]=useState("")
  const [deepOpened,setDeepOpened]=useState(false)

  const [hiddenUnlocked,setHiddenUnlocked]=useState(false)
  const [hiddenLoad,setHiddenLoad]=useState(false)
  const [hiddenRes,setHiddenRes]=useState("")
  const [hiddenOpened,setHiddenOpened]=useState(false)

  const [futureUnlocked,setFutureUnlocked]=useState(false)
  const [futureLoad,setFutureLoad]=useState(false)
  const [futureRes,setFutureRes]=useState("")
  const [futureOpened,setFutureOpened]=useState(false)

  useEffect(()=>{
    setDaily(LETTERS[Math.floor(Math.random()*LETTERS.length)])
    const tg = (window as any)?.Telegram?.WebApp
    const userId = tg?.initDataUnsafe?.user?.id
    if(!userId) return
    setMyUserId(String(userId))

    fetch("/api/register-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,optIn:true})}).catch(()=>{})
    fetch(`/api/invite/status?userId=${userId}`).then(r=>r.json()).then(j=>{
      if(typeof j.count==="number") setRefCount(j.count)
      if(typeof j.credits==="number") setRefCredits(j.credits)
      if(typeof j.toNextReward==="number") setRefToNext(j.toNextReward)
    }).catch(()=>{})

    const startParam: string | undefined = tg?.initDataUnsafe?.start_param
    if(startParam?.startsWith("ref_")){
      setReferrerId(startParam.slice(4))
    }

    ;["deep","hidden","future"].forEach(async (f)=>{
      try{
        const r = await fetch(`/api/check-paid?userId=${userId}&feature=${f}`)
        const j = await r.json() as {paid:boolean}
        if(j.paid){
          if(f==="deep") setDeepUnlocked(true)
          if(f==="hidden") setHiddenUnlocked(true)
          if(f==="future") setFutureUnlocked(true)
        }
      }catch{}
    })
  },[])

  const toggleNotify = async () => {
    const next = !notifyOn
    setNotifyOn(next)
    if(myUserId){
      try{ await fetch("/api/register-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:myUserId,optIn:next})}) }catch{}
    }
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    if(!myUserId) return
    setHistoryLoading(true)
    try{
      const r = await fetch(`/api/history?userId=${myUserId}`)
      const j = await r.json()
      setHistoryItems(j.items || [])
    }catch{}
    setHistoryLoading(false)
  }

  const checkDeep = async () => {
    setDeepLoad(true)
    try{
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"deep", extra: deepExtra, mode})})
      const d=await r.json() as {full:string}
      setDeepRes(d.full || "")
    }catch{ setDeepRes("Ошибка") }
    setDeepLoad(false)
  }
  const checkHidden = async () => {
    setHiddenLoad(true)
    try{
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"hidden", mode})})
      const d=await r.json() as {full:string}
      setHiddenRes(d.full || "")
    }catch{ setHiddenRes("Ошибка") }
    setHiddenLoad(false)
  }
  const checkFuture = async () => {
    setFutureLoad(true)
    try{
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"future", mode})})
      const d=await r.json() as {full:string}
      setFutureRes(d.full || "")
    }catch{ setFutureRes("Ошибка") }
    setFutureLoad(false)
  }

  const buy = async (stars: number, feature: "deep"|"hidden"|"future"|"bundle") => {
    const tg = (window as any)?.Telegram?.WebApp
    if(!tg){ alert("Открой через бота: Menu"); return }
    tg.ready()
    const userId = tg?.initDataUnsafe?.user?.id
    if(!userId) return
    try{
      const r = await fetch("/api/stars/create",{method:"POST",headers:{"Content-Type":"application/json"},body: JSON.stringify({stars, feature, userId})})
      const j = await r.json()
      if(!j.invoiceLink){ alert("Ошибка оплаты: "+(j.error||"no link")); return }
      tg.openInvoice(j.invoiceLink, (s: string)=>{
        if(s==="paid"){
          if(feature==="deep"||feature==="bundle"){ setDeepUnlocked(true); checkDeep() }
          if(feature==="hidden"||feature==="bundle"){ setHiddenUnlocked(true); checkHidden() }
          if(feature==="future"||feature==="bundle"){ setFutureUnlocked(true); checkFuture() }
        }
      })
    }catch(e:any){ alert(e.message) }
  }

  const useReferralCredit = async (feature: "deep"|"hidden"|"future" = "deep") => {
    if(!myUserId || refCredits <= 0) return
    try{
      const r = await fetch("/api/invite/use-credit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:myUserId})})
      const j = await r.json()
      if(j.ok){
        setRefCredits(j.remaining)
        if(feature==="deep"){ setDeepUnlocked(true); checkDeep() }
        if(feature==="hidden"){ setHiddenUnlocked(true); checkHidden() }
        if(feature==="future"){ setFutureUnlocked(true); checkFuture() }
      }
    }catch{}
  }

  const check = async () => {
    if(!p1||!p2) return alert("Добавь 2 фото")
    setLoad(true)
    try{
      const salt = Date.now() + "_" + Math.random().toString(36).slice(2)
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"short", salt, mode})})
      const d=await r.json()
      if(r.status===429) return alert(d.error)
      setRes(d as any)

      if(myUserId){
        fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:myUserId, percent:d.percent, full:d.full, mode})}).catch(()=>{})

        if(referrerId && !refCredited){
          setRefCredited(true)
          fetch("/api/invite/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({referrerId, newUserId: myUserId})}).catch(()=>{})
        }
      }
    }catch{
      setRes({percent:84, full:"Выглядит как дорогая пара..."})
    }
    setLoad(false)
  }

  const shareResult = async () => {
    if(!res) return
    setSharing(true)
    try{
      const canvas = document.createElement("canvas")
      canvas.width = 1080; canvas.height = 1350
      const ctx = canvas.getContext("2d")!
      const bg = ctx.createLinearGradient(0,0,0,1350)
      bg.addColorStop(0,"#0B0908"); bg.addColorStop(1,"#1c0f0f")
      ctx.fillStyle = bg; ctx.fillRect(0,0,1080,1350)

      const glow = ctx.createRadialGradient(860,140,10,860,140,420)
      glow.addColorStop(0,"rgba(233,199,123,0.35)"); glow.addColorStop(1,"rgba(233,199,123,0)")
      ctx.fillStyle = glow; ctx.fillRect(0,0,1080,1350)
      const glow2 = ctx.createRadialGradient(160,1200,10,160,1200,420)
      glow2.addColorStop(0,"rgba(193,39,45,0.35)"); glow2.addColorStop(1,"rgba(193,39,45,0)")
      ctx.fillStyle = glow2; ctx.fillRect(0,0,1080,1350)

      ctx.textAlign = "center"
      ctx.fillStyle = "rgba(255,255,255,0.55)"
      ctx.font = "500 30px 'JetBrains Mono', monospace"
      ctx.fillText("LOVE SCANNER · ARCHIVE №17", 540, 140)

      ctx.fillStyle = "#C1272D"
      ctx.font = "italic 260px Georgia, serif"
      ctx.fillText(`${res.percent}%`, 540, 520)

      ctx.fillStyle = "rgba(255,255,255,0.5)"
      ctx.font = "500 28px 'JetBrains Mono', monospace"
      ctx.fillText("СОВМЕСТИМОСТЬ", 540, 590)

      ctx.fillStyle = "#F3EDE3"
      ctx.font = "italic 300 40px Georgia, serif"
      ctx.textAlign = "center"
      const teaserForShare = (res.full || "").slice(0, 120).trim() + "…"
      wrapCanvasText(ctx, `"${teaserForShare}"`, 540, 760, 820, 54)

      ctx.fillStyle = "rgba(255,255,255,0.35)"
      ctx.font = "26px 'JetBrains Mono', monospace"
      ctx.fillText("узнай свою совместимость → @lovescan_ai_bot", 540, 1260)

      canvas.toBlob(async (blob)=>{
        if(!blob){ setSharing(false); return }
        const file = new File([blob], "love-scanner.png", { type: "image/png" })
        const nav = navigator as any
        try{
          if(nav.canShare && nav.canShare({files:[file]})){
            await nav.share({ files:[file], title:"Love Scanner", text:`Совместимость ${res.percent}% 💘` })
            setSharing(false); return
          }
        }catch{ }
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url; a.download = "love-scanner.png"; a.click()
        URL.revokeObjectURL(url)
        setSharing(false)
      }, "image/png")
    }catch{ setSharing(false) }
  }

  const red = "#C1272D"
  const redDeep = "#7A1015"
  const gold = "#E9C77B"

  const glass:React.CSSProperties = {
    background:"linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
    backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
    border:"1px solid rgba(255,255,255,0.08)",
  }
  const Dots = () => <span className="loader-dots"><span>·</span><span>·</span><span>·</span></span>

  const ringPct = res?.percent ?? 0
  const ringLen = 2*Math.PI*54
  const ringOffset = ringLen - (ringPct/100)*ringLen*0.75
  const highChance = res ? res.percent >= 75 : false

  function EnvelopeReveal({onOpen}:{onOpen:()=>void}){
    const [flipping,setFlipping]=useState(false)
    return (
      <div
        className="seal-card"
        style={{position:"relative",width:"100%",height:120,cursor:"pointer",perspective:"1200px",marginTop:12}}
        onClick={()=>{
          if(flipping) return
          setFlipping(true)
          setTimeout(onOpen, 650)
        }}
      >
        <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .65s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:flipping?"rotateY(180deg)":"rotateY(0deg)"}}>
          <div style={{position:"absolute",inset:0,borderRadius:18,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,overflow:"hidden",backfaceVisibility:"hidden",background:`linear-gradient(135deg, ${gold}22, rgba(255,255,255,0.03))`,border:`1px solid ${gold}55`}}>
            <div className="seal-idle" style={{width:40,height:40,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, #F3D998, ${gold} 55%, #a3822f)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#221703",fontSize:16}}>✦</div>
            <p className="mono" style={{fontSize:11,opacity:0.6,letterSpacing:"0.08em"}}>Оплачено · нажми, чтобы вскрыть</p>
          </div>
          <div style={{position:"absolute",inset:0,borderRadius:18,backfaceVisibility:"hidden",transform:"rotateY(180deg)",background:"rgba(255,255,255,0.03)"}}/>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:"100vh",width:"100%",display:"flex",justifyContent:"center",background:"#0B0908",color:"#F3EDE3",position:"relative",overflow:"hidden",fontFamily:"'JetBrains Mono', monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@1,6..72,300;1,6..72,400&display=swap');
        *{ box-sizing:border-box }
        ::-webkit-scrollbar{ display:none }
        .serif{ font-family:'Instrument Serif',serif }
        .mono{ font-family:'JetBrains Mono',monospace }
        .ai-font{ font-family:'Newsreader',serif; font-style:italic; font-weight:300; line-height:1.75 }

        @keyframes fadeUp{ from{opacity:0; transform:translateY(16px)} to{opacity:1; transform:translateY(0)} }
        @keyframes drift{ 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(22px,-16px) scale(1.07)} 66%{transform:translate(-16px,10px) scale(.95)} }
        @keyframes twinkle{ 0%,100%{opacity:.12} 50%{opacity:.55} }
        @keyframes sealGlow{ 0%,100%{box-shadow:0 0 0 0 rgba(193,39,45,.45), 0 10px 30px rgba(193,39,45,.35)} 50%{box-shadow:0 0 0 10px rgba(193,39,45,0), 0 16px 40px rgba(193,39,45,.55)} }
        @keyframes goldGlow{ 0%,100%{box-shadow:0 10px 26px rgba(233,199,123,.25)} 50%{box-shadow:0 16px 38px rgba(233,199,123,.5)} }
        @keyframes gradientShift{ 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes blink{ 0%,80%,100%{opacity:.15} 40%{opacity:1} }
        @keyframes shimmerText{ to{background-position:-200% 0} }
        @keyframes ringDraw{ from{stroke-dashoffset:${ringLen}} }
        @keyframes pulseSoft{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }

        .reveal{ opacity:0; animation:fadeUp .7s cubic-bezier(.16,1,.3,1) forwards }
        .blob{ animation:drift 17s ease-in-out infinite }
        .twinkle{ animation:twinkle 3.2s ease-in-out infinite }
        .seal-idle{ animation:sealGlow 3s ease-in-out infinite }
        .seal-card{ transition:transform .2s }
        .seal-card:hover{ transform:scale(1.01) }
        .photo-card{ transition:transform .35s cubic-bezier(.16,1,.3,1), box-shadow .35s }
        .photo-card:hover{ transform:translateY(-4px) scale(1.015) }
        .cta{ background-size:220% 220%; animation:gradientShift 7s ease infinite; transition:transform .2s }
        .cta:hover{ transform:translateY(-2px) }
        .cta:active{ transform:scale(.97) }
        .unlock-btn{ transition:transform .18s }
        .unlock-btn:hover{ transform:translateY(-1px) scale(1.03) }
        .unlock-btn:active{ transform:scale(.94) }
        .gold-card{ animation:goldGlow 3s ease-in-out infinite }
        .shimmer-price{ background:linear-gradient(90deg, ${gold}, #fff3d0, ${gold}); background-size:220% auto; -webkit-background-clip:text; background-clip:text; color:transparent; animation:shimmerText 3.2s linear infinite }
        .loader-dots span{ display:inline-block; animation:blink 1.3s infinite }
        .loader-dots span:nth-child(2){ animation-delay:.2s }
        .loader-dots span:nth-child(3){ animation-delay:.4s }
        .ring-anim{ animation:ringDraw 1.1s cubic-bezier(.16,1,.3,1) forwards }
        .letter-area{ transition:border-color .2s, background .2s }
        .letter-area:focus{ outline:none; border-color:rgba(233,199,123,.5); background:rgba(255,255,255,0.06) }
        .teaser-blur{ filter:blur(6px); user-select:none; pointer-events:none }
        .bundle-pulse{ animation:pulseSoft 2.4s ease-in-out infinite }
        .strike{ text-decoration:line-through; opacity:.45 }
        .share-btn{ transition:transform .18s }
        .share-btn:hover{ transform:translateY(-1px) }
        .share-btn:active{ transform:scale(.95) }
        .mode-pill{ transition:transform .15s, background .2s, border-color .2s }
        .mode-pill:active{ transform:scale(.95) }
        .icon-btn{ transition:transform .15s, opacity .2s }
        .icon-btn:active{ transform:scale(.9) }
        .drawer-backdrop{ animation:fadeUp .3s ease forwards }
      `}</style>

      <div className="blob" style={{position:"absolute",top:-130,left:-90,width:340,height:340,borderRadius:"50%",background:`radial-gradient(circle, ${red}44, transparent 70%)`,filter:"blur(60px)",pointerEvents:"none"}}/>
      <div className="blob" style={{position:"absolute",bottom:-150,right:-110,width:380,height:380,borderRadius:"50%",background:`radial-gradient(circle, ${gold}33, transparent 70%)`,filter:"blur(70px)",pointerEvents:"none",animationDelay:"3s"}}/>
      {[...Array(10)].map((_,i)=>(
        <div key={i} className="twinkle" style={{position:"absolute",width:2.5,height:2.5,borderRadius:"50%",background:gold,top:`${(i*37)%100}%`,left:`${(i*53)%100}%`,animationDelay:`${i*0.32}s`,pointerEvents:"none"}}/>
      ))}

      <div style={{width:400,maxWidth:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",position:"relative",zIndex:1,padding:"0 0 28px"}}>

        <div style={{padding:"22px 22px 0"}}>
          <InviteBanner onJoin={setInviteSessionId} />
        </div>

        {/* header */}
        <div className="reveal" style={{padding:"28px 22px 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p className="mono" style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",opacity:0.4}}>Archive №17</p>
            <h1 className="serif" style={{fontSize:44,lineHeight:0.92,marginTop:6}}>Love<br/>Scanner</h1>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={openHistory} className="icon-btn" style={{width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",cursor:"pointer",color:"white",fontSize:14}}>📜</button>
            <button onClick={toggleNotify} className="icon-btn" style={{width:34,height:34,borderRadius:"50%",background:notifyOn?`${gold}22`:"rgba(255,255,255,0.06)",border:`1px solid ${notifyOn?gold+"55":"rgba(255,255,255,0.1)"}`,cursor:"pointer",fontSize:14,opacity:notifyOn?1:0.5}}>🔔</button>
            <div className="seal-idle" style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(150deg, ${red}, ${redDeep})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✦</div>
          </div>
        </div>

        <div className="reveal" style={{padding:"0 22px",marginTop:12}}>
          <div style={{...glass,borderRadius:16,padding:14}}>
            {refCredits>0 ? (
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p className="mono" style={{fontSize:10.5,opacity:0.6}}>Приглашено: <b style={{color:gold}}>{refCount}</b></p>
                <button onClick={()=>useReferralCredit("deep")} className="unlock-btn mono" style={{height:28,padding:"0 12px",borderRadius:14,border:"none",cursor:"pointer",background:gold,color:"#221703",fontSize:10.5,fontWeight:700}}>
                  Забрать бесплатный ({refCredits})
                </button>
              </div>
            ) : (
              <InviteFriendsButton count={refCount} toNextReward={refToNext} />
            )}
          </div>
        </div>

        {/* mode selector — this is what opens the product beyond couples */}
        <div className="reveal" style={{padding:"0 22px",marginTop:18,animationDelay:".04s"}}>
          <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",opacity:0.32,letterSpacing:"0.1em"}}>Кто на фото</p>
          <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {MODES.map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)} className="mode-pill" style={{
                borderRadius:14,padding:"10px 6px",cursor:"pointer",textAlign:"center",
                background: mode===m.id ? `linear-gradient(135deg, ${red}, ${redDeep})` : "rgba(255,255,255,0.04)",
                border: mode===m.id ? `1px solid ${red}` : "1px solid rgba(255,255,255,0.08)",
                color:"white",
              }}>
                <div className="serif" style={{fontSize:15}}>{m.label}</div>
                <div className="mono" style={{fontSize:9,opacity:0.55,marginTop:2}}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* daily letter seal */}
        <div className="reveal" style={{padding:"0 22px",marginTop:22,animationDelay:".08s"}}>
          <div className="seal-card" style={{position:"relative",width:"100%",height:150,cursor:"pointer",perspective:"1200px"}} onClick={()=>setSealBroken(!sealBroken)}>
            <div style={{position:"relative",width:"100%",height:"100%",transition:"transform .7s cubic-bezier(.4,.2,.2,1)",transformStyle:"preserve-3d",transform:sealBroken?"rotateY(180deg)":"rotateY(0deg)"}}>
              <div style={{position:"absolute",inset:0,borderRadius:22,padding:20,display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden",backfaceVisibility:"hidden",...glass,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",opacity:0.35,letterSpacing:"0.1em"}}>Письмо дня · сегодня</p>
                  <p className="mono" style={{fontSize:10.5,opacity:0.35}}>↗ открыть</p>
                </div>
                <div style={{paddingRight:56}}>
                  <h2 className="serif" style={{fontSize:22,lineHeight:1}}>Что между<br/><i>вами на самом деле?</i></h2>
                  <p className="mono" style={{fontSize:10.5,marginTop:8,opacity:0.35}}>Нажми на печать</p>
                </div>
                <div className="seal-idle" style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",width:52,height:52,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, #E14750, ${red} 55%, ${redDeep})`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:20}}>✦</div>
              </div>
              <div style={{position:"absolute",inset:0,borderRadius:22,padding:20,display:"flex",flexDirection:"column",backfaceVisibility:"hidden",transform:"rotateY(180deg)",...glass,border:`1px solid ${red}44`,boxShadow:"0 14px 40px rgba(0,0,0,0.45)"}}>
                <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",color:red,letterSpacing:"0.08em"}}>Вскрыто · {daily.name}</p>
                <h3 className="serif" style={{fontSize:22,marginTop:8}}>{daily.title}</h3>
                <p className="ai-font" style={{fontSize:14.5,marginTop:8}}>{daily.text}</p>
              </div>
            </div>
          </div>
        </div>

        {/* photos */}
        <div className="reveal" style={{padding:"0 22px",marginTop:26,animationDelay:".14s"}}>
          <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",opacity:0.32,letterSpacing:"0.1em"}}>Доказательства · 2 фото</p>
          <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[{img:p1,set:setP1,l:"Первое"},{img:p2,set:setP2,l:"Второе"}].map((b,i)=>(
              <label key={i} className="photo-card" style={{cursor:"pointer"}}>
                <div style={{...glass,borderRadius:20,padding:8,boxShadow: b.img ? "0 12px 30px rgba(0,0,0,0.4)" : "none"}}>
                  <div style={{width:"100%",aspectRatio:"4/5",borderRadius:14,overflow:"hidden",position:"relative",background:"rgba(255,255,255,0.03)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {b.img? <SmartImg src={b.img}/> : <span className="mono" style={{fontSize:10.5,opacity:0.3,letterSpacing:"0.05em"}}>+ ДОБАВИТЬ</span>}
                  </div>
                  <p className="mono" style={{fontSize:10.5,textAlign:"center",marginTop:9,opacity:0.4}}>{b.l}</p>
                </div>
                <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compress(f).then(b.set)}}/>
              </label>
            ))}
          </div>
        </div>

        {/* cta */}
        <div className="reveal" style={{padding:"0 22px",marginTop:22,animationDelay:".2s"}}>
          <button onClick={check} disabled={load} className="cta" style={{
            width:"100%",height:54,borderRadius:999,border:"none",cursor:"pointer",
            background:`linear-gradient(120deg, ${red}, ${redDeep}, ${red})`,
            color:"white",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow:`0 12px 32px ${red}40`,
          }}>
            <span className="mono" style={{fontSize:12,letterSpacing:"0.12em",textTransform:"uppercase"}}>{load? <>Вскрываю письма<Dots/></> : "Проверить совместимость"}</span>
            <span style={{width:26,height:26,borderRadius:"50%",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>↗</span>
          </button>
        </div>

        {/* report */}
        {res && inviteSessionId ? (
          <div className="reveal" style={{padding:"0 22px",marginTop:18}}>
            <div style={{...glass,borderRadius:22,padding:20,boxShadow:"0 14px 40px rgba(0,0,0,0.4)"}}>
              <ComparisonScreen sessionId={inviteSessionId} myResult={res} />
            </div>
          </div>
        ) : res && (
          <div className="reveal" style={{padding:"0 22px",marginTop:18}}>
            <div style={{...glass,borderRadius:22,padding:20,boxShadow:"0 14px 40px rgba(0,0,0,0.4)"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                <div style={{position:"relative",width:76,height:76,flexShrink:0}}>
                  <svg width="76" height="76" style={{transform:"rotate(-135deg)"}}>
                    <defs>
                      <linearGradient id="reportRing" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={red}/>
                        <stop offset="100%" stopColor={gold}/>
                      </linearGradient>
                    </defs>
                    <circle cx="38" cy="38" r="30" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none"/>
                    <circle className="ring-anim" cx="38" cy="38" r="30" stroke="url(#reportRing)" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={ringLen} strokeDashoffset={ringOffset}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span className="serif" style={{fontSize:18}}>{res.percent}%</span>
                  </div>
                </div>
                <div style={{width:"100%",textAlign:"center"}}>
                  <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",color:red,letterSpacing:"0.08em"}}>Отчёт · match</p>
                </div>
                <div className="ai-font" style={{fontSize:14,width:"100%",textAlign:"left",whiteSpace:"pre-wrap"}}>{res.full}</div>
              </div>

              <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
                <p className="ai-font" style={{fontSize:13.5,opacity:0.85}}>
                  {highChance
                    ? "Процент реально высокий — можно узнать, что там думают на самом деле и как не спугнуть 👀"
                    : "Есть, что подтянуть — можно узнать точный план действий, а не гадать на кофейной гуще."}
                </p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                  <button onClick={shareResult} disabled={sharing} className="share-btn mono" style={{
                    height:36,padding:"0 16px",borderRadius:18,border:"1px solid rgba(255,255,255,0.14)",
                    background:"rgba(255,255,255,0.06)",color:"white",fontSize:11.5,cursor:"pointer",
                    display:"inline-flex",alignItems:"center",gap:6,
                  }}>{sharing? <>Готовлю картинку<Dots/></> : <>↗ Поделиться результатом</>}</button>
                  <InvitePartnerButton result={res} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* sealed letters */}
        <div className="reveal" style={{padding:"0 22px",marginTop:26,animationDelay:".1s"}}>
          <p className="mono" style={{fontSize:10.5,textTransform:"uppercase",opacity:0.32,letterSpacing:"0.1em"}}>Запечатанные письма</p>

          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:12}}>

            {/* deep */}
            <div className={deepUnlocked?"gold-card":""} style={{...glass,borderRadius:18,padding:16,border:deepUnlocked?`1px solid ${gold}55`:glass.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p className="serif" style={{fontSize:17}}>Глубокий разбор</p>
                  <p className="mono" style={{fontSize:10.5,opacity:0.45,marginTop:2}}>Мысли, ред флаги, что делать</p>
                </div>
                {!deepUnlocked?
                  <button onClick={()=>buy(PRICES.deep.now,"deep")} className="unlock-btn" style={{height:36,padding:"0 14px",borderRadius:16,border:"none",cursor:"pointer",background:`linear-gradient(135deg, ${red}, ${redDeep})`,color:"white",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
                    <span className="mono strike" style={{fontSize:9.5}}>{PRICES.deep.was} ✦</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700}}>{PRICES.deep.now} ✦</span>
                  </button>
                  : <span className="mono shimmer-price" style={{fontSize:11,fontWeight:600}}>Открыто</span>}
              </div>
              {!deepUnlocked && <p className="ai-font teaser-blur" style={{marginTop:10,fontSize:13.5}}>{DECOY_TEASERS.deep}</p>}

              {deepUnlocked && !deepOpened && (
                <EnvelopeReveal onOpen={()=>{ setDeepOpened(true); checkDeep() }} />
              )}

              {deepUnlocked && deepOpened && (
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:9}}>
                  <textarea value={deepExtra} onChange={e=>setDeepExtra(e.target.value)} placeholder="Расскажи что между вами..." className="mono letter-area" style={{width:"100%",minHeight:70,borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",padding:11,fontSize:12.5,color:"#F3EDE3",resize:"vertical"}}/>
                  <button onClick={checkDeep} className="unlock-btn" style={{width:"100%",height:40,borderRadius:20,border:"none",cursor:"pointer",background:gold,color:"#221703",fontWeight:700}}><span className="mono" style={{fontSize:12}}>{deepLoad? <>Вскрываю<Dots/></> : (deepRes ? "Пересобрать с деталями" : "Вскрыть письмо")}</span></button>
                  {deepLoad && !deepRes && <div style={{borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:13,height:70}}/>}
                  {deepRes && <div className="ai-font" style={{borderRadius:14,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",padding:13,fontSize:14,whiteSpace:"pre-wrap"}}>{deepRes}</div>}
                </div>
              )}
            </div>

            {/* hidden — replaces the old 18+ feature; works for couple/crush/friend alike */}
            <div className={hiddenUnlocked?"gold-card":""} style={{...glass,borderRadius:18,padding:16,border:hiddenUnlocked?`1px solid ${gold}55`:glass.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p className="serif" style={{fontSize:17}}>Что он(а) скрывает</p>
                  <p className="mono" style={{fontSize:10.5,opacity:0.45,marginTop:2}}>Скрытые эмоции по языку тела</p>
                </div>
                {!hiddenUnlocked?
                  <button onClick={()=>buy(PRICES.hidden.now,"hidden")} className="unlock-btn" style={{height:36,padding:"0 14px",borderRadius:16,border:"none",cursor:"pointer",background:"rgba(255,255,255,0.08)",color:"white",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
                    <span className="mono strike" style={{fontSize:9.5}}>{PRICES.hidden.was} ✦</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700}}>{PRICES.hidden.now} ✦</span>
                  </button>
                  : (hiddenLoad ? <span className="mono" style={{fontSize:11}}><Dots/></span> : <span className="mono shimmer-price" style={{fontSize:11,fontWeight:600}}>Открыто</span>)}
              </div>
              {!hiddenUnlocked && <p className="ai-font teaser-blur" style={{marginTop:10,fontSize:13.5}}>{DECOY_TEASERS.hidden}</p>}

              {hiddenUnlocked && !hiddenOpened && (
                <EnvelopeReveal onOpen={()=>{ setHiddenOpened(true); checkHidden() }} />
              )}

              {hiddenUnlocked && hiddenOpened && hiddenLoad && !hiddenRes && <div style={{marginTop:12,borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:13,height:60}}/>}
              {hiddenUnlocked && hiddenOpened && hiddenRes && <div className="ai-font" style={{marginTop:12,borderRadius:14,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",padding:13,fontSize:14,whiteSpace:"pre-wrap"}}>{hiddenRes}</div>}
            </div>

            {/* future */}
            <div className={futureUnlocked?"gold-card":""} style={{...glass,borderRadius:18,padding:16,border:futureUnlocked?`1px solid ${gold}55`:glass.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p className="serif" style={{fontSize:17}}>{mode==="friend" ? "Будущее · дружба" : "Будущее · Свадьба?"}</p>
                  <p className="mono" style={{fontSize:10.5,opacity:0.45,marginTop:2}}>{mode==="friend" ? "Останетесь ли близки" : "Расстанетесь или вместе"}</p>
                </div>
                {!futureUnlocked?
                  <button onClick={()=>buy(PRICES.future.now,"future")} className="unlock-btn" style={{height:36,padding:"0 14px",borderRadius:16,border:"none",cursor:"pointer",background:"rgba(255,255,255,0.08)",color:"white",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
                    <span className="mono strike" style={{fontSize:9.5}}>{PRICES.future.was} ✦</span>
                    <span className="mono" style={{fontSize:12,fontWeight:700}}>{PRICES.future.now} ✦</span>
                  </button>
                  : (futureLoad ? <span className="mono" style={{fontSize:11}}><Dots/></span> : <span className="mono shimmer-price" style={{fontSize:11,fontWeight:600}}>Открыто</span>)}
              </div>
              {!futureUnlocked && <p className="ai-font teaser-blur" style={{marginTop:10,fontSize:13.5}}>{DECOY_TEASERS.future}</p>}

              {futureUnlocked && !futureOpened && (
                <EnvelopeReveal onOpen={()=>{ setFutureOpened(true); checkFuture() }} />
              )}

              {futureUnlocked && futureOpened && futureLoad && !futureRes && <div style={{marginTop:12,borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:13,height:60}}/>}
              {futureUnlocked && futureOpened && futureRes && <div className="ai-font" style={{marginTop:12,borderRadius:14,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",padding:13,fontSize:14,whiteSpace:"pre-wrap"}}>{futureRes}</div>}
            </div>

            {!(deepUnlocked && hiddenUnlocked && futureUnlocked) && (
              <button onClick={()=>buy(PRICES.bundle.now,"bundle")} className="bundle-pulse unlock-btn" style={{
                marginTop:4,width:"100%",height:58,borderRadius:18,border:`1px solid ${gold}55`,cursor:"pointer",
                background:`linear-gradient(135deg, ${gold}, #F3D998)`,color:"#221703",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
              }}>
                <span className="mono" style={{fontSize:13,fontWeight:700}}>Открыть всё за {PRICES.bundle.now} ✦</span>
                <span className="mono" style={{fontSize:10,opacity:0.7}}><span className="strike">{PRICES.bundle.was} ✦</span> · экономия {Math.round(100-(PRICES.bundle.now/PRICES.bundle.was)*100)}%</span>
              </button>
            )}
          </div>
        </div>

        <div className="reveal" style={{marginTop:"auto",paddingTop:40,textAlign:"center",animationDelay:".3s"}}>
          <p className="mono" style={{fontSize:10,textTransform:"uppercase",opacity:0.2,letterSpacing:"0.15em"}}>Love Scanner · Est 2026</p>
        </div>
      </div>

      {/* history drawer */}
      {historyOpen && (
        <div className="drawer-backdrop" onClick={()=>setHistoryOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:20,display:"flex",justifyContent:"center",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:400,maxWidth:"100%",maxHeight:"75vh",overflowY:"auto",...glass,background:"#0F0D0C",borderRadius:"24px 24px 0 0",padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <p className="serif" style={{fontSize:20}}>История сканов</p>
              <button onClick={()=>setHistoryOpen(false)} className="icon-btn" style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,0.08)",border:"none",color:"white",cursor:"pointer"}}>✕</button>
            </div>
            {historyLoading && <p className="mono" style={{fontSize:12,opacity:0.5}}>Загружаю<Dots/></p>}
            {!historyLoading && historyItems.length===0 && <p className="mono" style={{fontSize:12,opacity:0.4}}>Пока пусто — сделай первый скан</p>}
            {!historyLoading && historyItems.map(item=>(
              <div key={item.id} style={{borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"12px 0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span className="serif" style={{fontSize:16,color:gold}}>{item.percent}%</span>
                  <span className="mono" style={{fontSize:9.5,opacity:0.4}}>{new Date(item.ts).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <p className="ai-font" style={{fontSize:12.5,marginTop:4,opacity:0.75}}>{(item.full||"").slice(0,140)}…</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}