// lib/events.ts
//
// Конфиг сезонных ивентов. Добавлять новый ивент — просто новый объект в массиве.
// startDate/endDate — ISO-строки, сравниваются с текущей датой И на клиенте (чтобы
// показать баннер), И на сервере (чтобы route.ts знал, какой промпт использовать
// и чтобы нельзя было купить ивент вне окна вручную дёрнув API — см. validateEventWindow).

export type SeasonalEvent = {
  id: string
  title: string
  emoji: string
  startDate: string // ISO, включительно
  endDate: string   // ISO, включительно
  price: number      // в Stars
  buttonLabel: string
  bannerText: string
}

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: "valentine2027",
    title: "Совместимость на весь год",
    emoji: "💘",
    startDate: "2027-02-07T00:00:00Z",
    endDate: "2027-02-15T23:59:59Z",
    price: 59,
    buttonLabel: "Открыть ко Дню всех влюблённых · 59 ✦",
    bannerText: "Ограниченный разбор ко Дню святого Валентина — доступен только до 15 февраля",
  },
  // Пример на будущее — просто раскомментируйте и поправьте даты/текст:
  // {
  //   id: "newyear2027",
  //   title: "Прогноз на весь следующий год",
  //   emoji: "🎄",
  //   startDate: "2026-12-25T00:00:00Z",
  //   endDate: "2027-01-08T23:59:59Z",
  //   price: 55,
  //   buttonLabel: "Открыть новогодний разбор · 55 ✦",
  //   bannerText: "Новогодний лимитированный разбор — доступен только до 8 января",
  // },
]

export function getActiveEvent(now: Date = new Date()): SeasonalEvent | null {
  const t = now.getTime()
  return SEASONAL_EVENTS.find(e => t >= new Date(e.startDate).getTime() && t <= new Date(e.endDate).getTime()) || null
}

export function getEventById(id: string): SeasonalEvent | null {
  return SEASONAL_EVENTS.find(e => e.id === id) || null
}

// Серверная проверка: нельзя сгенерировать/оплатить ивент-контент вне его окна,
// даже если кто-то напрямую дёрнет API с правильным eventId руками.
export function isEventCurrentlyActive(id: string): boolean {
  const e = getEventById(id)
  if (!e) return false
  const now = Date.now()
  return now >= new Date(e.startDate).getTime() && now <= new Date(e.endDate).getTime()
}