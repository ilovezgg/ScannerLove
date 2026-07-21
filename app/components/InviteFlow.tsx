import { useEffect, useState } from "react"

// Форма результата — как возвращает /api/love: { percent, full }
type ScanResult = {
  percent: number
  full: string
}

type Session = {
  sessionId: string
  inviterId: string | number
  inviterResult: ScanResult | null
  partnerId: string | number | null
  partnerResult: ScanResult | null
  status: "pending" | "joined" | "completed"
}

const red = "#C1272D"
const redDeep = "#7A1015"
const gold = "#E9C77B"

const glass: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
}

function getTelegramStartParam(): string | null {
  // @ts-ignore — Telegram WebApp SDK кладёт себя в window
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null
  const startParam = tg?.initDataUnsafe?.start_param
  return startParam || null
}

function getTelegramUserId(): string | number | null {
  // @ts-ignore
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null
  return tg?.initDataUnsafe?.user?.id ?? null
}

// Надёжное копирование в буфер: сначала пробуем нормальный Clipboard API,
// если он недоступен/падает (частый случай внутри Telegram WebView) —
// откатываемся на старый textarea + execCommand("copy").
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // падаем в fallback ниже
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.top = "-9999px"
    ta.style.left = "-9999px"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// ---------- Баннер "тебя пригласили" ----------

export function InviteBanner({ onJoin }: { onJoin: (sessionId: string) => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    const raw = getTelegramStartParam()
    if (raw && raw.startsWith("invite_")) {
      const id = raw.replace("invite_", "")
      setSessionId(id)
      onJoin(id)
    }
    // onJoin намеренно не в deps — вызываем один раз при монтировании
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!sessionId) return null

  return (
    <div
      className="reveal"
      style={{
        ...glass,
        borderRadius: 18,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        border: `1px solid ${gold}55`,
        boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            flexShrink: 0,
            background: `radial-gradient(circle at 35% 30%, #F3D998, ${gold} 55%, #a3822f)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#221703",
            fontSize: 14,
          }}
        >
          ✦
        </div>
        <p className="ai-font" style={{ fontSize: 13.5, lineHeight: 1.3 }}>
          Тебя пригласили сравнить результаты
        </p>
      </div>
      <span className="mono" style={{ fontSize: 10, opacity: 0.45, whiteSpace: "nowrap" }}>
        пройди тест ↓
      </span>
    </div>
  )
}

// ---------- Кнопка "Пригласить партнёра" (сравнение результатов) ----------

export function InvitePartnerButton({ result }: { result: ScanResult }) {
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  const handleInvite = async () => {
    setLoading(true)
    const userId = getTelegramUserId()
    try {
      const res = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, result }),
      })
      const data = await res.json()
      if (data.link) setLink(data.link)
    } catch {
      // тихо игнорируем — кнопка просто останется в состоянии "создать"
    } finally {
      setLoading(false)
    }
  }

  const shareLink = async () => {
    if (!link) return
    // @ts-ignore
    const tg = window.Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
          "Пройди тест и сравним результаты 💘"
        )}`
      )
      return
    }
    const ok = await copyToClipboard(link)
    setCopyState(ok ? "copied" : "failed")
    setTimeout(() => setCopyState("idle"), 2200)
  }

  const btnBase: React.CSSProperties = {
    width: "100%",
    height: 44,
    marginTop: 12,
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    transition: "transform .18s",
  }

  if (!link) {
    return (
      <button
        onClick={handleInvite}
        disabled={loading}
        className="unlock-btn"
        style={{
          ...btnBase,
          background: `linear-gradient(135deg, ${gold}, #F3D998)`,
          color: "#221703",
          fontWeight: 700,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Создаём ссылку…" : <>💌 Пригласить партнёра</>}
      </button>
    )
  }

  const label =
    copyState === "copied" ? "Ссылка скопирована ✓" : copyState === "failed" ? "Не вышло — держи ссылку ниже" : "Отправить ссылку партнёру"

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={shareLink}
        className="unlock-btn"
        style={{
          ...btnBase,
          margin: 0,
          background: copyState === "copied" ? "rgba(120,200,140,0.18)" : `linear-gradient(135deg, ${red}, ${redDeep})`,
          color: "white",
          fontWeight: 700,
          border: copyState === "copied" ? "1px solid rgba(120,200,140,0.5)" : "none",
        }}
      >
        {label}
      </button>
      {copyState === "failed" && (
        <div
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 11,
            wordBreak: "break-all",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "8px 10px",
            userSelect: "all",
          }}
        >
          {link}
        </div>
      )}
    </div>
  )
}

// ---------- Кнопка "Пригласить друзей" (реферальные кредиты) ----------
//
// Отдельно от InvitePartnerButton выше: та ссылка (invite_<sessionId>) — для
// сравнения результатов вдвоём, создаётся через бэкенд. Эта — для реферальной
// механики "пригласи 3 друзей → бесплатный разбор" (ref_<userId>), см.
// /api/invite/complete и /api/invite/status. Ссылка строится прямо на клиенте
// без похода в бэкенд, потому что userId уже детерминированно определяет,
// кому засчитать награду — session тут не нужна.
//
// Нужен NEXT_PUBLIC_TELEGRAM_BOT_USERNAME в env (без @, например love_scanner_bot) —
// именно с префиксом NEXT_PUBLIC_, иначе значение не попадёт в клиентский бандл.

export function InviteFriendsButton({
  count,
  toNextReward,
}: {
  count?: number
  toNextReward?: number
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const userId = getTelegramUserId()
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const link = userId && botUsername ? `https://t.me/${botUsername}/love?startapp=ref_${userId}` : null

  const share = async () => {
    if (!link) return
    // @ts-ignore
    const tg = window.Telegram?.WebApp
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
          "Проверь совместимость — и заодно накинь мне бесплатный разбор 👀"
        )}`
      )
      return
    }
    const ok = await copyToClipboard(link)
    setCopyState(ok ? "copied" : "failed")
    setTimeout(() => setCopyState("idle"), 2200)
  }

  if (!link) return null // нет userId (не в Telegram) или не задан NEXT_PUBLIC_TELEGRAM_BOT_USERNAME

  const label =
    copyState === "copied" ? "Ссылка скопирована ✓" : copyState === "failed" ? "Не вышло — держи ссылку ниже" : "💌 Пригласить друзей"

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={share}
        className="unlock-btn mono"
        style={{
          width: "100%",
          height: 40,
          borderRadius: 999,
          border: copyState === "copied" ? "1px solid rgba(120,200,140,0.5)" : "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          background: copyState === "copied" ? "rgba(120,200,140,0.18)" : `linear-gradient(135deg, ${gold}, #F3D998)`,
          color: copyState === "copied" ? "white" : "#221703",
        }}
      >
        {label}
      </button>
      {typeof count === "number" && typeof toNextReward === "number" && (
        <p className="mono" style={{ fontSize: 9.5, opacity: 0.45, textAlign: "center", marginTop: 6 }}>
          приглашено {count} · ещё {toNextReward} до бесплатного разбора
        </p>
      )}
      {copyState === "failed" && (
        <div
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 11,
            wordBreak: "break-all",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "8px 10px",
            userSelect: "all",
          }}
        >
          {link}
        </div>
      )}
    </div>
  )
}

// ---------- Экран сравнения ----------

export function ComparisonScreen({
  sessionId,
  myResult,
}: {
  sessionId: string
  myResult: ScanResult
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [joined, setJoined] = useState(false)

  // Присоединяемся к сессии своим результатом один раз
  useEffect(() => {
    const userId = getTelegramUserId()
    if (!userId || joined) return

    fetch("/api/invite/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, userId, result: myResult }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.session) setSession(data.session)
        setJoined(true)
      })
      .catch(() => setJoined(true))
  }, [sessionId, myResult, joined])

  // Поллинг статуса, пока не завершится
  useEffect(() => {
    if (session?.status === "completed") return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/invite/session/${sessionId}`)
        const data = await res.json()
        if (data.session) setSession(data.session)
      } catch {}
    }, 2500)
    return () => clearInterval(interval)
  }, [sessionId, session?.status])

  if (!session) {
    return (
      <p className="ai-font" style={{ fontSize: 14, textAlign: "center", opacity: 0.7 }}>
        Загрузка…
      </p>
    )
  }

  if (session.status !== "completed") {
    return (
      <div style={{ textAlign: "center" }}>
        <p className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", color: red, letterSpacing: "0.08em" }}>
          Сравнение · ожидание
        </p>
        <p className="ai-font" style={{ fontSize: 14, marginTop: 10 }}>
          Ждём, пока партнёр тоже пройдёт тест…
        </p>
      </div>
    )
  }

  const a = session.inviterResult!.percent
  const b = session.partnerResult!.percent
  const matchPercent = Math.max(0, Math.round(100 - Math.abs(a - b)))

  return (
    <div style={{ textAlign: "center" }}>
      <p className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", color: red, letterSpacing: "0.08em" }}>
        Сравнение · готово
      </p>
      <h2 className="serif" style={{ fontSize: 40, marginTop: 10 }}>
        {matchPercent}%
      </h2>
      <p className="mono" style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
        совпадение результатов
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
        <div>
          <p className="mono" style={{ fontSize: 10, opacity: 0.4 }}>ВЫ</p>
          <p className="serif" style={{ fontSize: 20 }}>{b}%</p>
        </div>
        <div>
          <p className="mono" style={{ fontSize: 10, opacity: 0.4 }}>ПАРТНЁР</p>
          <p className="serif" style={{ fontSize: 20 }}>{a}%</p>
        </div>
      </div>
    </div>
  )
}