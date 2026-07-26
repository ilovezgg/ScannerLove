// ПОЛОЖИТЬ СЮДА: app/api/debug/auth/route.ts
//
// ВРЕМЕННЫЙ РОУТ. Удалить, когда оплата заработает.
//
// Строку для проверки подписи можно собрать несколькими способами, и
// разные клиенты Telegram ведут себя по-разному. Вместо того чтобы гадать,
// перебираем все правдоподобные варианты и смотрим, какой даёт нужный хеш.

import { NextRequest, NextResponse } from 'next/server'
import crypto from "crypto"

export const runtime = "nodejs"

// Ручной разбор query-строки. Отличается от URLSearchParams одним:
// не превращает "+" в пробел. Это классический источник расхождений.
function manualParse(qs: string): [string,string][] {
  return qs.split("&").filter(Boolean).map(pair => {
    const i = pair.indexOf("=")
    if(i === -1) return [decodeURIComponent(pair), ""] as [string,string]
    return [
      decodeURIComponent(pair.slice(0, i)),
      decodeURIComponent(pair.slice(i + 1)),
    ] as [string,string]
  })
}

function buildString(entries: [string,string][], skip: string[]): string {
  return entries
    .filter(([k]) => !skip.includes(k))
    .map(([k,v]) => `${k}=${v}`)
    .sort()
    .join("\n")
}

export async function GET(req: NextRequest){
  const token = process.env.BOT_TOKEN?.trim()
  const initData = req.headers.get("x-telegram-init-data") || ""

  const out: Record<string, unknown> = {
    токен_задан: !!token,
    длина_токена: token?.length ?? 0,
    id_бота_из_токена: token ? token.split(":")[0] : null,
    длина_initData: initData.length,
  }

  if(!token){
    out.вывод = "BOT_TOKEN не задан. Добавить в переменные Vercel и передеплоить."
    return NextResponse.json(out)
  }
  if(!initData){
    out.вывод = "Подпись не пришла. Приложение открыто не как Mini App — запускай кнопкой меню бота."
    return NextResponse.json(out)
  }

  const sp = new URLSearchParams(initData)
  const spEntries = Array.from(sp.entries())
  const manEntries = manualParse(initData)

  const hash = sp.get("hash") || ""
  out.ключи = spEntries.map(([k]) => k).sort()
  out.содержит_signature = spEntries.some(([k]) => k === "signature")
  out.содержит_плюс = initData.includes("+")

  if(!hash){
    out.вывод = "В initData нет поля hash. Строка повреждена."
    return NextResponse.json(out)
  }

  const secret = crypto.createHmac("sha256","WebAppData").update(token).digest()
  const hmac = (s: string) => crypto.createHmac("sha256", secret).update(s).digest("hex")

  const variants: { имя: string, строка: string }[] = [
    { имя: "A: без hash, URLSearchParams",            строка: buildString(spEntries,  ["hash"]) },
    { имя: "B: без hash и signature, URLSearchParams", строка: buildString(spEntries,  ["hash","signature"]) },
    { имя: "C: без hash, ручной разбор",               строка: buildString(manEntries, ["hash"]) },
    { имя: "D: без hash и signature, ручной разбор",   строка: buildString(manEntries, ["hash","signature"]) },
  ]

  let победитель: string | null = null
  out.варианты = variants.map(v => {
    const got = hmac(v.строка)
    const ok = got === hash
    if(ok && !победитель) победитель = v.имя
    return { вариант: v.имя, совпал: ok, получилось: got.slice(0,10) }
  })
  out.ожидался_хеш = hash.slice(0,10)

  const authDate = Number(sp.get("auth_date") || 0)
  out.возраст_подписи_часов = authDate ? +((Date.now()/1000 - authDate)/3600).toFixed(1) : null

  if(победитель){
    out.вывод = `Сошёлся вариант "${победитель}". Скажи мне какой — поправлю lib/telegram-auth.ts под него.`
  } else {
    out.вывод = "Не сошёлся ни один вариант. Значит токен от другого бота, чем тот, через которого открыто приложение. Проверь: возможно, Menu Button настроен у одного бота, а BOT_TOKEN на Vercel от другого. У тебя в токене id 8822105824 (lovescan_ai_bot) — приложение должно открываться именно им."
  }

  return NextResponse.json(out)
}