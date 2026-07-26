"use client"
// ПОЛОЖИТЬ СЮДА: app/debug-panel.tsx
//
// ВРЕМЕННАЯ ПАНЕЛЬ. Удалить вместе с app/api/debug/auth, когда оплата
// заработает.
//
// Как включить: в app/page.tsx добавить импорт
//   import DebugPanel from "./debug-panel"
// и вставить <DebugPanel/> первой строкой внутри самого верхнего <div>.
//
// Показывает на экране всё, что нужно для диагностики — консоль не нужна.

import { useEffect, useState } from "react"

export default function DebugPanel(){
  const [open,setOpen]=useState(false)
  const [local,setLocal]=useState<any>(null)
  const [server,setServer]=useState<any>(null)
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    const tg = (window as any)?.Telegram?.WebApp
    setLocal({
      "скрипт Telegram загружен": !!(window as any)?.Telegram,
      "WebApp доступен": !!tg,
      "длина initData": tg?.initData?.length ?? 0,
      "initData начало": (tg?.initData || "").slice(0,50) || "(пусто)",
      "id пользователя": tg?.initDataUnsafe?.user?.id ?? "(нет)",
      "платформа": tg?.platform ?? "(нет)",
      "версия Bot API": tg?.version ?? "(нет)",
    })
  },[])

  const checkServer = async () => {
    setLoading(true)
    try{
      const tg = (window as any)?.Telegram?.WebApp
      const r = await fetch("/api/debug/auth",{
        headers:{ "x-telegram-init-data": tg?.initData || "" }
      })
      setServer(await r.json())
    }catch(e){
      setServer({ ошибка: String(e) })
    }
    setLoading(false)
  }

  const box: React.CSSProperties = {
    fontFamily:"monospace", fontSize:11, lineHeight:1.6,
    background:"#141110", border:"1px solid #C1272D", borderRadius:10,
    padding:12, margin:"12px 20px 0", color:"#F4EFE7",
    wordBreak:"break-all", whiteSpace:"pre-wrap",
  }

  if(!open){
    return (
      <button onClick={()=>setOpen(true)} style={{...box, width:"calc(100% - 40px)", cursor:"pointer", textAlign:"left"}}>
        ⚙ диагностика — нажми
      </button>
    )
  }

  return (
    <div style={box}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <b>ДИАГНОСТИКА</b>
        <span onClick={()=>setOpen(false)} style={{cursor:"pointer",opacity:.6}}>закрыть ✕</span>
      </div>

      <b>Клиент:</b>
      {local && Object.entries(local).map(([k,v])=>(
        <div key={k}>{k}: <span style={{color:"#E9C77B"}}>{String(v)}</span></div>
      ))}

      <button onClick={checkServer} disabled={loading} style={{
        marginTop:10, width:"100%", padding:"8px", borderRadius:8,
        border:"1px solid #E9C77B", background:"transparent", color:"#E9C77B",
        fontFamily:"monospace", fontSize:11, cursor:"pointer",
      }}>{loading ? "проверяю..." : "проверить сервер"}</button>

      {server && (
        <div style={{marginTop:10}}>
          <b>Сервер:</b>
          {Object.entries(server).map(([k,v])=>(
            <div key={k} style={{marginTop: k==="вывод" ? 8 : 0}}>
              {k}: <span style={{color: k==="вывод" ? "#E14750" : "#E9C77B"}}>{
                typeof v === "object" ? JSON.stringify(v) : String(v)
              }</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}