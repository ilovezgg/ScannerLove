// ПОЛОЖИТЬ СЮДА: lib/telegram-auth.ts
//
// Проверка подлинности Telegram initData.
//
// ЗАЧЕМ. До этого userId приходил на сервер обычным полем в JSON — то есть
// любой мог подставить чужой id или свой собственный и получить чужие покупки.
// Telegram подписывает initData ключом бота: сверив подпись, сервер узнаёт
// настоящего пользователя, и подделать его нельзя, не зная BOT_TOKEN.
//
// Алгоритм описан в https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// ВАЖНО: требует Node-рантайма (модуль crypto). Во всех роутах, которые это
// используют, должен стоять `export const runtime = "nodejs"` — на edge упадёт.

import crypto from "crypto"

export type TgUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

// Сколько живёт подпись. Telegram не протухает initData сам, поэтому
// ограничиваем вручную: украденная строка не должна работать вечно.
const MAX_AGE_SEC = 24 * 60 * 60

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
  params.delete("hash")
  params.delete("signature") // поле для third-party валидации, в data_check_string не входит

  // data_check_string: пары key=value, отсортированные по ключу, через \n
  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n")

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest()
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")

  // Сравнение за постоянное время: обычное === утекает информацию по таймингу.
  const a = Buffer.from(computed, "utf8")
  const b = Buffer.from(hash, "utf8")
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null

  const authDate = Number(params.get("auth_date") || 0)
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null

  try {
    const user = JSON.parse(params.get("user") || "null")
    return user?.id ? (user as TgUser) : null
  } catch {
    return null
  }
}

// Достаёт initData из запроса. Кладём его в заголовок, а не в тело —
// так один и тот же способ работает и для GET, и для POST.
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
