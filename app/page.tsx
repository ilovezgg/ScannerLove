"use client"
import { useState, useEffect } from "react"

async function compress(f: File){
  const b=await createImageBitmap(f);let w=b.width,h=b.height,M=800
  if(w>M||h>M){if(w>h){h=Math.round(h*M/w);w=M}else{w=Math.round(w*M/h);h=M}}
  const c=document.createElement("canvas");c.width=w;c.height=h
  c.getContext("2d")!.drawImage(b,0,0,w,h)
  return c.toDataURL("image/jpeg",0.75)
}

const LETTERS = [
  { name:"Влюбленные", title:"Выбор сердца", text:"Сегодня вас тянет друг к другу. Он думает о тебе, когда не пишет." },
  { name:"Солнце", title:"Тепло вдвоем", text:"Вы как power couple. Вас видят вместе даже когда вы порознь." },
  { name:"Звезда", title:"Надежда", text:"Кто-то из вас влюбился сильнее и боится спугнуть." },
]

export default function Page(){
  const [p1,setP1]=useState("");const [p2,setP2]=useState("")
  const [load,setLoad]=useState(false)
  const [res,setRes]=useState<{percent:number, full:string}|null>(null)
  const [sealBroken,setSealBroken]=useState(false)
  const [daily,setDaily]=useState(LETTERS[0])

  const [deepUnlocked,setDeepUnlocked]=useState(false)
  const [deepLoad,setDeepLoad]=useState(false)
  const [deepRes,setDeepRes]=useState("")
  const [deepExtra,setDeepExtra]=useState("")
  const [sexUnlocked,setSexUnlocked]=useState(false)
  const [sexLoad,setSexLoad]=useState(false)
  const [sexRes,setSexRes]=useState("")
  const [kidsUnlocked,setKidsUnlocked]=useState(false)
  const [kidsLoad,setKidsLoad]=useState(false)
  const [kidsImgs,setKidsImgs]=useState<string[]>([])

  useEffect(()=>{
    setDaily(LETTERS[Math.floor(Math.random()*LETTERS.length)])
    const tg = (window as any)?.Telegram?.WebApp
    const userId = tg?.initDataUnsafe?.user?.id
    if(!userId) return
    ;["deep","sex","kids"].forEach(async (f)=>{
      try{
        const r = await fetch(`/api/check-paid?userId=${userId}&feature=${f}`)
        const j = await r.json() as {paid:boolean}
        if(j.paid){
          if(f==="deep") setDeepUnlocked(true)
          if(f==="sex") setSexUnlocked(true)
          if(f==="kids") setKidsUnlocked(true)
        }
      }catch{}
    })
  },[])

  const buy = async (stars: number, feature: "deep"|"sex"|"kids") => {
    const tg = (window as any).Telegram?.WebApp
    const userId = tg?.initDataUnsafe?.user?.id
    if(!tg){ alert("Открой через бота - Menu"); return }
    tg.ready()
    const r = await fetch("/api/stars/create",{method:"POST",headers:{"Content-Type":"application/json"},body: JSON.stringify({stars, feature, userId})})
    const { invoiceLink } = await r.json() as {invoiceLink:string}
    if(!invoiceLink) return
    const onPaid = () => {
      if(feature==="deep") setDeepUnlocked(true)
      if(feature==="sex") setSexUnlocked(true)
      if(feature==="kids"){ setKidsUnlocked(true); genKids() }
    }
    if(tg.isVersionAtLeast?.("6.1") && tg.openInvoice){
      tg.openInvoice(invoiceLink, (s: string)=>{ if(s==="paid") onPaid() })
    } else {
      window.open(invoiceLink, "_blank")
      let tries=0
      const timer=setInterval(async()=>{
        tries++
        const check=await fetch(`/api/check-paid?userId=${userId}&feature=${feature}`)
        const j=await check.json() as {paid:boolean}
        if(j.paid){ clearInterval(timer); onPaid() }
        if(tries>20) clearInterval(timer)
      },2000)
    }
  }

  const check = async () => {
  if(!p1||!p2) return alert("Добавь 2 фото")
  setLoad(true)
  try{
    const salt = Date.now() + "_" + Math.random().toString(36).slice(2)
    const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"short", salt})})
    const d=await r.json() as {percent:number, full:string}
    setRes(d)
  }catch{
    setRes({percent:84, full:"Вы смотритесь как дорогая пара..."})
  }
  setLoad(false)
}

  const checkDeep = async () => {
    setDeepLoad(true)
    try{
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"deep", extra: deepExtra})})
      const d=await r.json() as {full:string}
      setDeepRes(d.full || "")
    }catch{ setDeepRes("Ошибка") }
    setDeepLoad(false)
  }
  const checkSex = async () => {
    setSexLoad(true)
    try{
      const r=await fetch("/api/love",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo1:p1,photo2:p2, type:"sex"})})
      const d=await r.json() as {full:string}
      setSexRes(d.full || "")
    }catch{ setSexRes("Ошибка") }
    setSexLoad(false)
  }
  const genKids = async () => {
    setKidsLoad(true)
    setTimeout(()=>{ setKidsImgs(["https://i.imgur.com/8Km9tLL.jpg"]); setKidsLoad(false)},1200)
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FFFBF0] text-[#1A1A1A]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@1,6..72,300&display=swap');
       .serif{font-family:'Instrument Serif',serif}
       .mono{font-family:'JetBrains Mono',monospace}
       .ai-font{font-family:'Newsreader',serif; font-style:italic; font-weight:300; line-height:1.7}
      `}</style>

      <div className="w-full md:w-1/2 lg:w-[48%] max-w- min-h-screen bg-[#FFFBF0] flex flex-col border-x border-black/[0.06]">

        <div className="px-6 pt-7 flex justify-between">
          <div>
            <p className="mono text- tracking-[0.2em] uppercase opacity-40">ARCHIVE №17</p>
            <h1 className="serif text- leading-[0.9] mt-1">Love<br/>Scanner</h1>
          </div>
          <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-">✦</div>
        </div>

        {/* ПИСЬМО ДНЯ - ФЛИП ПОЧИНЕН */}
        <div className="px-6 mt-6">
  <div className="relative w-full h-[164px] cursor-pointer" style={{perspective:'1200px'}} onClick={()=>setSealBroken(!sealBroken)}>
    <div className="relative w-full h-full transition-transform duration-700 will-change-transform" style={{transformStyle:'preserve-3d', transform: sealBroken? 'rotateY(180deg)' : 'rotateY(0deg)'}}>
      {/* FRONT */}
      <div className="absolute inset-0 rounded-[14px] bg-white border border-black/10 p-5 flex flex-col justify-between overflow-hidden" style={{backfaceVisibility:'hidden'}}>
        <div className="flex justify-between"><p className="mono text-[10px] uppercase opacity-30">Письмо дня • сегодня</p><p className="mono text-[10px] opacity-30">↗ открыть</p></div>
        <div className="pr-14"><h2 className="serif text-[26px] leading-[0.9]">Что между<br/><i>вами на самом деле?</i></h2><p className="mono text-[11px] mt-2 opacity-40">Нажми на печать</p></div>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[#C1272D] flex items-center justify-center text-white">✦</div>
      </div>
      {/* BACK */}
      <div className="absolute inset-0 rounded-[14px] bg-white border border-[#C1272D]/20 p-5 flex flex-col" style={{backfaceVisibility:'hidden', transform:'rotateY(180deg)'}}>
        <p className="mono text-[10px] uppercase text-[#C1272D]">ВСКРЫТО • {daily.name}</p>
        <h3 className="serif text-[22px] mt-2">{daily.title}</h3>
        <p className="ai-font text-[15px] mt-2 leading-[1.4]">{daily.text}</p>
      </div>
    </div>
  </div>
</div>

        <div className="px-6 mt-7">
          <p className="mono text- uppercase opacity-30">Доказательства • 2 фото</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[{img:p1,set:setP1,l:"Ты"},{img:p2,set:setP2,l:"Он"}].map((b,i)=>(
              <label key={i} className="cursor-pointer">
                <div className="bg-white rounded- border border-black/10 p-2">
                  <div className="w-full aspect-[4/4.6] bg-[#F5EFE0] rounded- overflow-hidden relative flex items-center justify-center">
                    {b.img? <img src={b.img} className="absolute inset-0 w-full h-full object-cover"/> : <span className="mono text- opacity-30">+ ДОБАВИТЬ</span>}
                  </div>
                  <p className="mono text- text-center mt-2 opacity-40">{b.l}</p>
                </div>
                <input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) compress(f).then(b.set)}}/>
              </label>
            ))}
          </div>
        </div>

        {/* КНОПКА ВЫШЕ И С ДРУГИМ ШРИФТОМ */}
        <div className="px-6 mt-6">
          <button onClick={check} className="w-full h- rounded-full bg-[#1A1A1A] text-white mono text- tracking-[0.14em] uppercase flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <span>{load?"Вскрываю письма...":"Проверить совместимость"}</span><span className="w-7 h-7 rounded-full bg-[#C1272D] flex items-center justify-center">↗</span>
          </button>
        </div>

        {res && (
          <div className="px-6 mt-5">
            <div className="rounded- bg-white border border-black/10 p-5">
              <p className="mono text- uppercase text-[#C1272D]">ОТЧЕТ • {res.percent}% MATCH</p>
              <div className="mt-4 ai-font text- whitespace-pre-wrap">{res.full}</div>
            </div>
          </div>
        )}

        {/* 3 ОПЦИИ ПО 10/15/20 - ПОКАЗЫВАЮТСЯ ТОЛЬКО ПОСЛЕ ПОКУПКИ */}
        <div className="px-6 mt-8">
          <p className="mono text- uppercase opacity-30">Запечатанные письма</p>
          <div className="mt-3 flex flex-col gap-3">
            {/* DEEP 10 */}
            <div className={`rounded- border p-3.5 ${deepUnlocked?'bg-black text-white':'bg-white'}`}>
              <div className="flex justify-between items-center">
                <div><p className="serif text-">Глубокий разбор</p><p className="mono text- opacity-50">Мысли, ред флаги, что делать</p></div>
                {!deepUnlocked? <button onClick={()=>buy(10,"deep")} className="h-8 px-4 rounded-full bg-[#C1272D] text-white mono text-">10 ✦</button> : <span className="mono text- opacity-50">ОТКРЫТО</span>}
              </div>
              {deepUnlocked && (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea value={deepExtra} onChange={e=>setDeepExtra(e.target.value)} placeholder="Расскажи что между вами..." className="w-full min-h- rounded- bg-white/10 border border-white/10 p-3 text- placeholder:text-white/30"/>
                  <button onClick={checkDeep} className="w-full h-10 rounded-full bg-white text-black mono text-">{deepLoad?"Вскрываю...":"Вскрыть письмо"}</button>
                  {deepRes && <div className="rounded- bg-white text-black p-3 ai-font text- whitespace-pre-wrap">{deepRes}</div>}
                </div>
              )}
            </div>

            {/* SEX 15 */}
            <div className={`rounded- border p-3.5 ${sexUnlocked?'bg-black text-white':'bg-white'}`}>
              <div className="flex justify-between items-center">
                <div><p className="serif text-">Совместимость 18+</p><p className="mono text- opacity-50">Постель и чувства</p></div>
                {!sexUnlocked? <button onClick={()=>buy(15,"sex")} className="h-8 px-4 rounded-full bg-black text-white mono text-">15 ✦</button> : <button onClick={checkSex} className="h-8 px-4 rounded-full bg-white text-black mono text-">{sexLoad?"...":"открыть"}</button>}
              </div>
              {sexUnlocked && sexRes && <div className="mt-3 rounded- bg-white text-black p-3 ai-font text- whitespace-pre-wrap">{sexRes}</div>}
            </div>

            {/* KIDS 20 */}
            <div className={`rounded- border p-3.5 ${kidsUnlocked?'bg-black text-white':'bg-white'}`}>
              <div className="flex justify-between items-center">
                <div><p className="serif text-">Дети + свадьба</p><p className="mono text- opacity-50">AI фото</p></div>
                {!kidsUnlocked? <button onClick={()=>buy(20,"kids")} className="h-8 px-4 rounded-full bg-black text-white mono text-">20 ✦</button> : <button onClick={genKids} className="h-8 px-4 rounded-full bg-white text-black mono text-">{kidsLoad?"...":"сгенерить"}</button>}
              </div>
              {kidsUnlocked && kidsImgs.length>0 && <div className="mt-3 grid grid-cols-2 gap-2">{kidsImgs.map((s,i)=><img key={i} src={s} className="rounded- aspect-square object-cover"/>)}</div>}
            </div>

          </div>
        </div>

        <div className="mt-auto pt-12 pb-7 text-center"><p className="mono text- uppercase opacity-20">LOVE SCANNER • EST 2026</p></div>
      </div>
    </div>
  )
}