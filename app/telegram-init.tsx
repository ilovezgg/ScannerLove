"use client"
// ПОЛОЖИТЬ СЮДА: app/telegram-init.tsx
//
// Разворачивает мини-апп на весь экран и красит системные полосы под фон
// приложения. Без expand() Telegram открывает окно примерно на половину
// высоты, и пользователю приходится тянуть его вверх руками.
//
// Ничего не рисует — только настраивает окружение.

import { useEffect } from "react"

export default function TelegramInit(){
  useEffect(()=>{
    const tg = (window as any)?.Telegram?.WebApp
    if(!tg) return
    try{
      tg.ready()
      tg.expand?.()

      // Отключает закрытие приложения свайпом вниз. Без этого пользователь,
      // прокручивая длинный разбор, случайно сворачивает мини-апп.
      // Метод появился в Bot API 7.7, на старых клиентах его просто нет.
      tg.disableVerticalSwipes?.()

      tg.setHeaderColor?.("#0A0908")
      tg.setBackgroundColor?.("#0A0908")
    }catch{}
  },[])

  return null
}