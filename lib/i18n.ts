// Язык интерфейса и ответов модели. Два языка: ru для русскоязычного СНГ, en для всех остальных.
// Определяется по language_code из Telegram — тем же правилом, что и приветствие в webhook.
// Тексты пишутся парами на месте использования (tr(lang, ru, en)), а не словарём по ключам:
// при двух языках так проще править и нельзя забыть перевод — второй аргумент обязателен.

export type Lang = "ru" | "en"

const RU_CODES = ["ru", "uk", "be", "kk"]

export function detectLang(code?: string | null): Lang {
  return RU_CODES.includes((code || "").toLowerCase().slice(0, 2)) ? "ru" : "en"
}

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "en"

export const tr = (lang: Lang, ru: string, en: string) => (lang === "en" ? en : ru)

// Сервер: клиент шлёт свой язык в x-lang (на случай ручного ?lang= в dev), иначе берём language_code
// из подписанного initData.
export function reqLang(req: { headers: { get(name: string): string | null } }, user?: { language_code?: string } | null): Lang {
  const h = req.headers.get("x-lang")
  if (isLang(h)) return h
  // Ни заголовка, ни языка: это закешированный клиент до EN-версии, а он был только русским.
  return user?.language_code ? detectLang(user.language_code) : "ru"
}

// Клиент: ?lang=ru|en в адресе перекрывает Telegram — удобно проверять английскую версию из браузера.
export function clientLang(): Lang {
  if (typeof window === "undefined") return "ru"
  const q = new URLSearchParams(window.location.search).get("lang")
  if (isLang(q)) return q
  // @ts-expect-error — Telegram WebApp SDK кладёт себя в window
  const code: string | undefined = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
  // language_code в Telegram необязателен; без него смотрим на язык системы, а не валим всех в английский.
  return detectLang(code || navigator.language)
}
