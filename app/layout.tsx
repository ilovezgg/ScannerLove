// ПОЛОЖИТЬ СЮДА: app/layout.tsx
import type { Metadata, Viewport } from "next"
import Script from "next/script"
import TelegramInit from "./telegram-init"
import "./globals.css"

export const metadata: Metadata = {
  title: "Love Scanner",
  description: "Читаем по фото и переписке",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,      // без этого двойной тап зумит интерфейс внутри Telegram
  userScalable: false,
  viewportFit: "cover", // включает env(safe-area-inset-*), которые использует page.tsx
  themeColor: "#0A0908",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        {/* Шрифты. Раньше они грузились через @import внутри <style> в
            page.tsx — так браузер узнаёт о них слишком поздно, и первый
            кадр рисуется системным шрифтом. Здесь они запрашиваются сразу.
            После деплоя строку с @import в page.tsx можно удалить. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&family=Newsreader:ital,opsz,wght@1,6..72,300;1,6..72,400&display=swap"
        />
      </head>
      <body>
        {/* ВОТ ЧЕГО НЕ ХВАТАЛО.
            Без этого скрипта window.Telegram не существует: нет initData,
            нет подписи, сервер отвечает 401 — то самое «Открой приложение
            через бота».
            strategy="beforeInteractive" обязателен: скрипт должен успеть
            выполниться до кода приложения, иначе на первом рендере
            Telegram.WebApp ещё не готов. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TelegramInit />
        {children}
      </body>
    </html>
  )
}