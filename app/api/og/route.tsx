import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { BOT_USERNAME } from '@/lib/links'

export const runtime = "nodejs"

// GET /api/og?p=87&m=couple&l=ru&f=story
// Публичная карточка результата: только процент, режим и язык. Никаких данных пользователя в URL нет,
// поэтому её можно спокойно постить в Pinterest, сторис и чаты. Раньше карточка рисовалась на клиентском
// canvas, и в Telegram Desktop уходила скачанным png, а публичного адреса у неё не было вообще.
//
// f=story даёт 1080x1920 (сторис, вертикальный пин), по умолчанию 1080x1350 (лента, пин 4:5).

const COPY = {
  ru: { compat: "СОВМЕСТИМОСТЬ", cta: "Проверь свою", modes: { couple: "Пара", crush: "Симпатия", friend: "Друзья" } },
  en: { compat: "COMPATIBILITY", cta: "Check yours", modes: { couple: "Couple", crush: "Crush", friend: "Friends" } },
  es: { compat: "COMPATIBILIDAD", cta: "Comprueba la tuya", modes: { couple: "Pareja", crush: "Crush", friend: "Amigos" } },
} as const
type Lang = keyof typeof COPY
type Mode = keyof typeof COPY["ru"]["modes"]

// Шрифт с кириллицей нужен только для ru: дефолтный шрифт ImageResponse её не рисует.
// Берём два woff (Satori не читает woff2): латиница для цифр и кириллица, Satori сам делает fallback по глифам.
const FONT_BASE = "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest"
let fontCache: Promise<{ name: string, data: ArrayBuffer, weight: 700, style: "normal" }[]> | null = null

function loadFonts(){
  if(!fontCache){
    fontCache = Promise.all(["latin", "cyrillic"].map(async subset => {
      const res = await fetch(`${FONT_BASE}/${subset}-700-normal.woff`)
      if(!res.ok) throw new Error(`font ${subset}: ${res.status}`)
      return { name: "Playfair", data: await res.arrayBuffer(), weight: 700 as const, style: "normal" as const }
    })).catch(err => { fontCache = null; throw err })   // не кэшируем провал: следующий запрос попробует снова
  }
  return fontCache
}

export async function GET(req: NextRequest){
  const q = req.nextUrl.searchParams
  const pRaw = parseInt(q.get("p") || "", 10)
  const percent = Number.isFinite(pRaw) ? Math.min(100, Math.max(0, pRaw)) : 0
  const l = q.get("l") as Lang
  const lang: Lang = l in COPY ? l : "en"
  const m = q.get("m") as Mode
  const mode: Mode = m in COPY[lang].modes ? m : "couple"
  const story = q.get("f") === "story"
  const w = 1080, h = story ? 1920 : 1350
  const t = COPY[lang]

  let fonts: Awaited<ReturnType<typeof loadFonts>> | undefined
  try{ fonts = await loadFonts() }catch(e){
    // Без шрифта кириллица превратится в «квадраты»: для ru честно отдаём 503, для en/es
    // хватает встроенного шрифта.
    console.error("og: font load failed", (e as Error).message)
    if(lang === "ru") return new Response("font unavailable", { status: 503 })
  }

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, #0A0908, #1c0f0f)", color: "#F4EFE7", fontFamily: fonts ? "Playfair" : "serif",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 760, height: 760, borderRadius: 380, background: "radial-gradient(circle closest-side, rgba(233,199,123,0.32), rgba(233,199,123,0))", display: "flex" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 760, height: 760, borderRadius: 380, background: "radial-gradient(circle closest-side, rgba(193,39,45,0.34), rgba(193,39,45,0))", display: "flex" }} />
        <div style={{ position: "absolute", top: 56, left: 56, right: 56, bottom: 56, border: "2px solid rgba(233,199,123,0.22)", display: "flex" }} />

        <div style={{ fontSize: 30, letterSpacing: 8, color: "rgba(244,239,231,0.55)", display: "flex" }}>LOVE SCANNER</div>
        <div style={{ fontSize: 340, color: "#C1272D", lineHeight: 1, marginTop: 40, marginBottom: 56, display: "flex" }}>{percent}%</div>
        <div style={{ fontSize: 34, letterSpacing: 6, color: "rgba(244,239,231,0.6)", marginTop: 8, display: "flex" }}>{t.compat}</div>
        <div style={{ fontSize: 44, color: "#E9C77B", marginTop: 44, display: "flex" }}>{t.modes[mode]}</div>

        <div style={{ position: "absolute", bottom: 130, fontSize: 32, color: "rgba(244,239,231,0.6)", display: "flex" }}>
          {`${t.cta} → @${BOT_USERNAME}`}
        </div>
      </div>
    ),
    {
      width: w, height: h,
      fonts,
      // Карточка зависит только от параметров URL: можно кэшировать на CDN и в браузере.
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    },
  )
}
