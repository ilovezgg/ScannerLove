// ПОЛОЖИТЬ СЮДА: lib/pricing.ts
//
// ЕДИНСТВЕННЫЙ источник правды по ценам. Раньше цифры жили в двух местах —
// в PRICES в page.tsx и в CANONICAL_PRICES в stars/create — и расходились при
// первой же правке: пользователь видел одну цену на кнопке, а в счёте другую.
// Теперь и клиент, и сервер импортируют отсюда.

export type Feature =
  | "deep" | "hidden" | "future" | "custom"
  | "bundle" | "conversation" | "sub" | "seasonal"

export const PRICES: Record<Exclude<Feature, "seasonal">, { now: number; was: number }> = {
  deep:         { now: 27,  was: 42 },
  hidden:       { now: 20,  was: 32 },
  future:       { now: 40,  was: 65 },
  custom:       { now: 35,  was: 55 },
  bundle:       { now: 49,  was: 139 },
  conversation: { now: 99,  was: 149 },
  sub:          { now: 299, was: 299 },
}

export const CATALOG: Record<Exclude<Feature, "seasonal">, { title: string; desc: string }> = {
  deep:         { title: "Глубокий разбор",   desc: "Мысли, ред флаги, что делать" },
  hidden:       { title: "Что он(а) скрывает", desc: "Скрытые эмоции по языку тела" },
  future:       { title: "Будущее",            desc: "Останетесь вместе или нет" },
  custom:       { title: "Свой вопрос",        desc: "Личный вопрос про этих двоих" },
  bundle:       { title: "Все три письма",     desc: "Разбор, скрытое и будущее сразу" },
  conversation: { title: "Разбор переписки",   desc: "До 5 скриншотов: кто вкладывается, что между строк" },
  sub:          { title: "Архив",              desc: "Безлимит сканов и все разборы, 30 дней" },
}

// Telegram допускает только этот период для подписок в Stars.
export const SUB_PERIOD_SEC = 2_592_000 // 30 дней

// Сколько скриншотов переписки принимаем за раз.
// Пять — компромисс: этого хватает на 100-150 сообщений, а payload остаётся
// в пределах лимита запроса (5 картинок в base64 ≈ 1.8 МБ при лимите 4.5 МБ).
export const MAX_CHAT_SHOTS = 5

// Сколько фото принимаем в обычном скане: два портрета + опционально совместное.
export const MAX_SCAN_PHOTOS = 3

export const off = (p: { now: number; was: number }) =>
  p.was > p.now ? Math.round(100 - (p.now / p.was) * 100) : 0
