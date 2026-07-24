// ПОЛОЖИТЬ СЮДА: lib/entitlements.ts
//
// Кто на что имеет право. Единственное место, где принимается решение
// «показывать платный контент или нет». Все роуты спрашивают только отсюда.
//
// Правило: клиент НИКОГДА не является источником истины о покупке.
// Клиент может нарисовать замочек открытым для мгновенной реакции интерфейса,
// но текст ему выдаст только сервер и только после проверки здесь.

import { kvGet, kvSet } from "./kv"
import { SUB_PERIOD_SEC } from "./pricing"

export type PaidFeature = "deep" | "hidden" | "future" | "custom" | "conversation"

export type Subscription = {
  userId: string
  until: number            // unix ms, когда доступ кончается
  startedAt: number
  renewals: number
  cancelled?: boolean      // отменена, но доступ ещё действует до until
  lastChargeId?: string    // telegram_payment_charge_id последнего списания
}

const subKey = (userId: string | number) => `sub:${userId}`

export async function getSubscription(userId: string | number): Promise<Subscription | null> {
  return await kvGet<Subscription>(subKey(userId))
}

export async function isSubscriber(userId: string | number | null | undefined): Promise<boolean> {
  if (!userId) return false
  const sub = await getSubscription(userId)
  return !!sub && sub.until > Date.now()
}

// Вызывается ТОЛЬКО из вебхука после successful_payment.
// expiresAtSec — subscription_expiration_date из Telegram (unix seconds).
// Если Telegram его не прислал, считаем 30 дней от текущего момента.
export async function grantSubscription(
  userId: string | number,
  opts: { expiresAtSec?: number; chargeId?: string; isRenewal?: boolean }
): Promise<Subscription> {
  const prev = await getSubscription(userId)
  const until = opts.expiresAtSec
    ? opts.expiresAtSec * 1000
    : Date.now() + SUB_PERIOD_SEC * 1000

  const sub: Subscription = {
    userId: String(userId),
    until,
    startedAt: prev?.startedAt ?? Date.now(),
    renewals: (prev?.renewals ?? 0) + (opts.isRenewal ? 1 : 0),
    cancelled: false,
    lastChargeId: opts.chargeId ?? prev?.lastChargeId,
  }
  await kvSet(subKey(userId), sub)
  return sub
}

// Телеграм присылает это, когда пользователь отменил автопродление.
// Доступ при этом НЕ отбираем — он честно оплачен до конца периода.
export async function markSubscriptionCancelled(userId: string | number) {
  const sub = await getSubscription(userId)
  if (!sub) return
  await kvSet(subKey(userId), { ...sub, cancelled: true })
}

// Возврат средств — доступ забираем сразу.
export async function revokeSubscription(userId: string | number) {
  const sub = await getSubscription(userId)
  if (!sub) return
  await kvSet(subKey(userId), { ...sub, until: 0, cancelled: true })
}

/* ─────────────────────────────────────────────────────────────
   Права на конкретный скан
   ───────────────────────────────────────────────────────────── */

type ScanLike = {
  userId: string
  unlocked?: Partial<Record<PaidFeature, boolean>>
}

// Главная функция. Отвечает на вопрос: можно ли этому пользователю
// получить текст категории feature по скану scanId.
export async function canAccess(
  userId: string | number,
  scanId: string | null | undefined,
  feature: PaidFeature
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Подписка перекрывает всё, кроме чужих сканов.
  const subscriber = await isSubscriber(userId)

  if (!scanId) return { ok: false, reason: "no scanId" }

  const scan = await kvGet<ScanLike>(`scan:${scanId}`)
  if (!scan) return { ok: false, reason: "scan not found" }

  // Чужой скан нельзя открыть даже по подписке.
  if (String(scan.userId) !== String(userId)) {
    return { ok: false, reason: "not your scan" }
  }

  if (subscriber) return { ok: true }
  if (scan.unlocked?.[feature]) return { ok: true }

  return { ok: false, reason: "not purchased" }
}

// Тестеры. Раньше список жил в NEXT_PUBLIC_TESTER_IDS — то есть в бандле,
// видимый любому, кто откроет исходники страницы: достаточно было подставить
// себе чужой id. Теперь переменная серверная, без NEXT_PUBLIC_.
export function isTester(userId: string | number): boolean {
  const ids = (process.env.TESTER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.includes(String(userId))
}
