// ПОЛОЖИТЬ СЮДА: app/api/debug/auth/route.ts
//
// ВРЕМЕННЫЙ РОУТ ДЛЯ ДИАГНОСТИКИ. Удалить после того, как оплата заработает.
// Секретов не раскрывает: токен показывает только длиной и последними
// четырьмя символами, вычисленный хеш — обрезанным.
//
// Как пользоваться: открыть мини-апп, в консоли выполнить
//   fetch("/api/debug/auth",{headers:{"x-telegram-init-data":Telegram.WebApp.initData}}).then(r=>r.json()).then(console.log)

import { NextRequest, NextResponse } from 'next/server'
import crypto from "crypto"

export const runtime = "nodejs"

export async function GET(req: NextRequest){
  const token = process.env.BOT_TOKEN?.trim()
  const initData = req.headers.get("x-telegram-init-data") || ""

  const out: Record<string, unknown> = {
    токен_задан: !!token,
    длина_токена: token?.length ?? 0,
    хвост_токена: token ? "..." + token.slice(-4) : null,
    id_бота_из_токена: token ? token.split(":")[0] : null,
    заголовок_пришёл: !!req.headers.get("x-telegram-init-data"),
    длина_initData: initData.length,
  }

  if(!token){
    out.вывод = "BOT_TOKEN не задан в переменных окружения Vercel. Добавить и передеплоить."
    return NextResponse.json(out)
  }
  if(!initData){
    out.вывод = "Заголовок x-telegram-init-data пустой. Клиент не отправляет подпись — либо приложение открыто не как Mini App, либо не обновился фронт."
    return NextResponse.json(out)
  }

  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  out.ключи = Array.from(params.keys()).sort()
  out.hash_присутствует = !!hash

  if(!hash){
    out.вывод = "В initData нет поля hash. Строка повреждена или это не initData."
    return NextResponse.json(out)
  }

  params.delete("hash")
  params.delete("signature")

  const dataCheckString = Array.from(params.entries())
    .map(([k,v]) => `${k}=${v}`)
    .sort()
    .join("\n")

  const secret = crypto.createHmac("sha256","WebAppData").update(token).digest()
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")

  const совпал = computed === hash
  out.подпись_совпала = совпал
  out.ожидалось_начало = hash.slice(0,12)
  out.получилось_начало = computed.slice(0,12)

  const authDate = Number(params.get("auth_date") || 0)
  const возрастСек = authDate ? Math.round(Date.now()/1000 - authDate) : null
  out.возраст_подписи_часов = возрастСек !== null ? +(возрастСек/3600).toFixed(1) : null

  if(!совпал){
    out.вывод = "Подпись не сошлась. Почти всегда это значит, что BOT_TOKEN на Vercel принадлежит ДРУГОМУ боту — не тому, через которого открыто приложение. Сверьте id_бота_из_токена с id вашего бота."
  } else if(возрастСек !== null && возрастСек > 86400){
    out.вывод = "Подпись верна, но старше суток — приложение висело открытым. Закройте и откройте мини-апп заново."
  } else {
    out.вывод = "Всё в порядке. Проверка проходит, причина 401 в чём-то другом — покажите ответ /api/stars/create."
  }

  return NextResponse.json(out)
}