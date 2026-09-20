// Единственное место, где собираются ссылки на бота и на Mini App.
// Раньше короткое имя аппа было зашито в двух местах по-разному ("love" и "app"),
// и одна из двух ссылок гарантированно вела в никуда.
//
// Env: NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (без @), NEXT_PUBLIC_APP_SHORT_NAME —
// то самое short name из BotFather → Mini App → Direct Link.

export const BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "lovescan_ai_bot").replace(/^@/, "")
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME || process.env.APP_SHORT_NAME || "love"

// Ссылка на Mini App; param уходит в start_param приложения.
export function appLink(param?: string): string {
  const base = `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}`
  return param ? `${base}?startapp=${encodeURIComponent(param)}` : base
}

// Ссылка «отправить в чат»: открывает системный выбор получателя в Telegram.
export function shareLink(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}
