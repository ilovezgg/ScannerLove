 // ПОЛОЖИТЬ СЮДА: lib/telegram-auth.ts
//
// Проверка подлинности Telegram initData.
//
// ЗАЧЕМ. Без неё userId приходил на сервер обычным полем в JSON — то есть
// любой мог подставить чужой id и получить чужие покупки. Telegram
// подписывает initData ключом бота: сверив подпись, сервер узнаёт настоящего
// пользователя, и подделать его нельзя, не зная BOT_TOKEN.
//
// ВАЖНО ПРО ПОЛЕ signature. Из строки проверки исключается ТОЛЬКО hash.
// Поле signature остаётся. Правило «исключить hash и signature» относится
// к другому механизму — сторонней проверке по Ed25519, когда данные отдают
// партнёру без доступа к токену бота. Для проверки по токену signature
// участвует в хешировании, и если его убрать, подпись не сойдётся никогда.
//
// Требует Node-рантайма (модуль crypto): во всех роутах, которые это
// используют, должен стоять export const runtime = "nodejs".

import crypto from "crypto"

export type TgUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

// Сколько живёт подпись. Telegram сам её не протухает, ограничиваем вручную:
// украденная строка не должна работать вечно.
const MAX_AGE_SEC = 24 * 60 * 60

// Ручной разбор query-строки. Отличается от URLSearchParams тем, что не
// превращает "+" в пробел: Telegram кодирует пробел как %20, поэтому голый
// плюс в значении должен остаться плюсом.
function manualParse(qs: string): [string, string][] {
  return qs.split("&").filter(Boolean).map(pair => {
    const i = pair.indexOf("=")
    if (i === -1) return [safeDecode(pair), ""] as [string, string]
    return [safeDecode(pair.slice(0, i)), safeDecode(pair.slice(i + 1))] as [string, string]
  })
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

function buildCheckString(entries: [string, string][]): string {
  return entries
    .filter(([k]) => k !== "hash")     // исключаем ТОЛЬКО hash
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n")
}

export function verifyInitData(initData: string | null | undefined): TgUser | null {
  const token = process.env.BOT_TOKEN?.trim()
  if (!token || !initData) return null

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return null
  }

  const hash = params.get("hash")
  if (!hash) return null

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest()
  const hmac = (s: string) => crypto.createHmac("sha256", secret).update(s).digest("hex")

  // Считаем двумя способами разбора и принимаем, если сошёлся любой.
  // Они дают разный результат только когда в значениях есть "+", а какой
  // из вариантов верен, зависит от клиента Telegram. Подделать любой из них
  // без токена всё равно невозможно, так что на безопасность это не влияет.
  const candidates = [
    buildCheckString(manualParse(initData)),
    buildCheckString(Array.from(params.entries())),
  ]

  const matched = candidates.some(str => {
    const computed = hmac(str)
    const a = Buffer.from(computed, "utf8")
    const b = Buffer.from(hash, "utf8")
    // Сравнение за постоянное время: обычное === утекает информацию по таймингу.
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
  if (!matched) return null

  const authDate = Number(params.get("auth_date") || 0)
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null

  try {
    const user = JSON.parse(params.get("user") || "null")
    return user?.id ? (user as TgUser) : null
  } catch {
    return null
  }
}

// Достаём initData из заголовка, а не из тела — так один способ работает
// и для GET, и для POST.
export function initDataFromRequest(req: Request): string | null {
  return req.headers.get("x-telegram-init-data")
}

export function authUser(req: Request): TgUser | null {
  return verifyInitData(initDataFromRequest(req))
}

// Аварийный обход для локальной разработки вне Telegram.
// Работает ТОЛЬКО когда NODE_ENV !== production и задан DEV_FAKE_USER_ID.
 export function authUserOrDev(req: Request): TgUser | null {
  const real = authUser(req)
  if (real) return real
  if (process.env.NODE_ENV !== "production" && process.env.DEV_FAKE_USER_ID) {
    return { id: Number(process.env.DEV_FAKE_USER_ID), first_name: "dev" }
  }
  return null
}