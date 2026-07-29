"use client"
// ПОЛОЖИТЬ СЮДА: app/telegram-init.tsx
//
// Разворачивает мини-апп на весь экран и красит системные полосы под фон
// приложения. Без expand() Telegram открывает окно примерно на половину
// высоты, и пользователю приходится тянуть его вверх руками.

import { useEffect } from "react"

export default function TelegramInit(){
  useEffect(()=>{
    const tg = (window as any)?.Telegram?.WebApp
    if(!tg) return
    try{
      tg.ready()
      tg.expand?.()

      // disableVerticalSwipes() отключён намеренно.
      //
      // Метод должен запрещать закрытие приложения свайпом вниз, но на
      // части версий iOS Telegram перехватывает вертикальный жест целиком —
      // вместе со свайпом умирает и обычная прокрутка. Прокрутка длинного
      // разбора важнее защиты от случайного закрытия, поэтому выключено.
      //
      // Если однажды понадобится включить — делай это только для не-iOS:
      //   if(tg.platform !== "ios") tg.disableVerticalSwipes?.()

      tg.setHeaderColor?.("#0A0908")
      tg.setBackgroundColor?.("#0A0908")
    }catch{}
  },[])

  return null
}