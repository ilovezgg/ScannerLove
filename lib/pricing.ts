// ПОЛОЖИТЬ СЮДА: lib/pricing.ts
//
// ЕДИНСТВЕННЫЙ источник правды по ценам. Раньше цифры жили в двух местах —
// в PRICES в page.tsx и в CANONICAL_PRICES в stars/create — и расходились при
// первой же правке: пользователь видел одну цену на кнопке, а в счёте другую.
// Теперь и клиент, и сервер импортируют отсюда.

export type Feature =
  | "deep" | "hidden" | "future" | "custom"
  | "bundle" | "conversation" | "sub" | "seasonal"

// `was` — это цена, по которой товар реально продавался. Раньше тут стояли вечные «зачёркнутые»
// цифры (27 вместо 42 и т.д.), по которым никто никогда не покупал. В ЕС (директива Omnibus
// 2019/2161) скидка считается от самой низкой цены за предыдущие 30 дней, а постоянная
// фейковая «было» считается вводящей в заблуждение практикой; в РФ это тоже повод для ФАС.
// Единственная честная экономия у нас — пакет против трёх писем по отдельности: ниже он и считается.
const SINGLES = { deep: 27, hidden: 20, future: 40 }

export const PRICES: Record<Exclude<Feature, "seasonal">, { now: number; was: number }> = {
  deep:         { now: SINGLES.deep,   was: SINGLES.deep },
  hidden:       { now: SINGLES.hidden, was: SINGLES.hidden },
  future:       { now: SINGLES.future, was: SINGLES.future },
  custom:       { now: 35,  was: 35 },
  bundle:       { now: 49,  was: SINGLES.deep + SINGLES.hidden + SINGLES.future },   // 87 за три по отдельности
  conversation: { now: 99,  was: 99 },
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

// Сколько приглашённых даёт рефереру одну бесплатную разблокировку письма.
// Приглашённый получает одну сразу, при первом скане.
export const INVITES_PER_REWARD = 2

// Сколько бесплатных сканов в сутки на человека. Каждый скан стоит нам вызова vision-модели,
// поэтому без лимита любой скрипт сливает бюджет. Подписка «Архив» лимит снимает.
export const FREE_SCANS_PER_DAY = 12

// Сколько фото принимаем в обычном скане: два портрета + опционально совместное.
export const MAX_SCAN_PHOTOS = 3

export const off = (p: { now: number; was: number }) =>
  p.was > p.now ? Math.round(100 - (p.now / p.was) * 100) : 0
