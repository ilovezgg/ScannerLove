// ПОЛОЖИТЬ СЮДА: app/privacy/page.tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Love Scanner",
  description: "Какие данные собирает lovescanner, зачем и как их удалить",
}

const C = {
  bg: "#0A0908",
  ink: "#F4EFE7",
  ink70: "rgba(244,239,231,0.70)",
  ink55: "rgba(244,239,231,0.55)",
  ink35: "rgba(244,239,231,0.35)",
  line: "rgba(255,255,255,0.09)",
  gold: "#E9C77B",
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: "0.04em",
          color: C.gold,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {n} · {title}
      </h2>
      <div
        style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 16,
          lineHeight: 1.65,
          color: C.ink70,
        }}
      >
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: C.bg,
        color: C.ink,
        padding: "48px 20px 80px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.08em",
            color: C.ink35,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          lovescanner
        </div>
        <h1
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: "italic",
            fontSize: 34,
            fontWeight: 400,
            margin: 0,
            color: C.ink,
          }}
        >
          Политика конфиденциальности
        </h1>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: C.ink35,
            marginTop: 10,
          }}
        >
          Последнее обновление: 31 августа 2026
        </p>

        <p
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 16,
            lineHeight: 1.65,
            color: C.ink70,
            marginTop: 24,
          }}
        >
          Love Scanner (далее — «сервис», «мы») — Telegram Mini App, разработанный
          и предоставляемый компанией <strong style={{ color: C.ink }}>lovescanner</strong>.
          Сервис анализирует загруженные фотографии и переписку, чтобы сгенерировать
          персональный разбор совместимости и связанные развлекательные материалы.
          Этот документ объясняет, какие данные мы собираем, зачем, как долго храним
          и как их можно удалить.
        </p>

        <Section n="01" title="Какие данные мы собираем">
          <ul style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>
              <strong style={{ color: C.ink }}>Telegram ID</strong> и связанные
              с ним публичные данные профиля (имя, которое ты указал в Telegram) —
              для идентификации внутри сервиса и привязки истории сканов.
            </li>
            <li>
              <strong style={{ color: C.ink }}>Загружаемые изображения</strong> —
              фотографии и скриншоты переписки, которые ты сам добавляешь для анализа.
            </li>
            <li>
              <strong style={{ color: C.ink }}>Результаты анализа</strong> —
              тексты и проценты совместимости, сгенерированные для тебя, а также
              заданные тобой вопросы.
            </li>
            <li>
              <strong style={{ color: C.ink }}>Технические данные оплаты</strong> —
              факт и статус платежа через Telegram Stars (мы не видим и не храним
              платёжные реквизиты — их обрабатывает сам Telegram).
            </li>
          </ul>
        </Section>

        <Section n="02" title="Зачем мы это собираем">
          <ul style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>Чтобы сгенерировать сам разбор — без фото или переписки анализ невозможен.</li>
            <li>Чтобы сохранить историю твоих сканов и дать тебе к ней вернуться.</li>
            <li>Чтобы обработать платежи за платные разделы через Telegram Stars.</li>
            <li>Чтобы реферальная и бонусная механика (приглашения, ежедневное колесо) работала корректно.</li>
          </ul>
        </Section>

        <Section n="03" title="Сколько хранятся данные и как их удалить">
          <p style={{ margin: 0 }}>
            Данные хранятся, пока у тебя есть активная история сканов в сервисе,
            либо до момента, когда ты попросишь их удалить. Чтобы удалить свои
            данные — включая загруженные фото, историю сканов и результаты анализа —
            напиши нам на контакт ниже с указанием своего Telegram ID. Мы удалим
            данные в разумный срок и подтвердим удаление.
          </p>
        </Section>

        <Section n="04" title="Передача третьим лицам">
          <p style={{ margin: 0 }}>
            Для обработки изображений и генерации текстового разбора мы передаём
            загруженные фото и переписку сторонним провайдерам искусственного
            интеллекта — исключительно в объёме, необходимом для выполнения
            запроса, и без передачи третьим лицам в иных целях. Оплата обрабатывается
            через встроенный платёжный механизм Telegram (Telegram Stars) —
            мы не передаём твои платёжные данные никому, кроме самого Telegram.
            Мы не продаём и не передаём твои данные рекламным сетям.
          </p>
        </Section>

        <Section n="05" title="Контакт для вопросов">
          <p style={{ margin: 0 }}>
            По любым вопросам об обработке данных, а также с запросом на удаление
            своих данных пиши в поддержку через бота Love Scanner в Telegram или на
            почту, указанную в описании бота. Мы отвечаем от имени компании{" "}
            <strong style={{ color: C.ink }}>lovescanner</strong>.
          </p>
        </Section>

        <div
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: `1px solid ${C.line}`,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: C.ink35,
          }}
        >
          © {new Date().getFullYear()} lovescanner
        </div>
      </div>
    </main>
  )
}
