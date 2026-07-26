// ПОЛОЖИТЬ СЮДА: lib/kv.ts
//
// Единая точка доступа к хранилищу. Пытается использовать @vercel/kv, если он
// настроен (KV_REST_API_URL/KV_REST_API_TOKEN), иначе падает в in-memory Map
// для локальной разработки. In-memory вариант НЕ переживёт рестарт
// serverless-функции — в проде обязателен настоящий KV.

type Json = any

let memStore = new Map<string, Json>()
let memSets = new Map<string, Set<string>>()

const hasVercelKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

async function vercelKv(){
  const { kv } = await import("@vercel/kv")
  return kv
}

export async function kvGet<T = Json>(key: string): Promise<T | null>{
  if(hasVercelKV){
    const kv = await vercelKv()
    return (await kv.get(key)) as T | null
  }
  return (memStore.has(key) ? memStore.get(key) : null) as T | null
}

export async function kvSet(key: string, value: Json){
  if(hasVercelKV){
    const kv = await vercelKv()
    await kv.set(key, value)
    return
  }
  memStore.set(key, value)
}

export async function kvIncr(key: string): Promise<number>{
  if(hasVercelKV){
    const kv = await vercelKv()
    return await kv.incr(key)
  }
  const cur = (memStore.get(key) as number) || 0
  const next = cur + 1
  memStore.set(key, next)
  return next
}

// НОВОЕ. Атомарный декремент — нужен для списания кредитов.
//
// Раньше кредиты списывались связкой kvGet → проверка → kvSet. Между чтением
// и записью успевает вклиниться второй запрос: два быстрых тапа по кнопке при
// одном кредите на счету открывали два разбора. incr/decr на стороне Redis
// выполняются целиком, поэтому гонки нет.
export async function kvDecr(key: string): Promise<number>{
  if(hasVercelKV){
    const kv = await vercelKv()
    return await kv.decr(key)
  }
  const cur = (memStore.get(key) as number) || 0
  const next = cur - 1
  memStore.set(key, next)
  return next
}

// Списать один кредит. Возвращает остаток, либо null, если списывать нечего.
// Уходит в минус только внутри себя: если счётчик был пуст, значение сразу
// возвращается обратно.
export async function kvSpendOne(key: string): Promise<number | null>{
  const left = await kvDecr(key)
  if(left < 0){
    await kvIncr(key)
    return null
  }
  return left
}

export async function kvSadd(key: string, member: string){
  if(hasVercelKV){
    const kv = await vercelKv()
    await kv.sadd(key, member)
    return
  }
  if(!memSets.has(key)) memSets.set(key, new Set())
  memSets.get(key)!.add(member)
}

export async function kvSrem(key: string, member: string){
  if(hasVercelKV){
    const kv = await vercelKv()
    await kv.srem(key, member)
    return
  }
  memSets.get(key)?.delete(member)
}

export async function kvSmembers(key: string): Promise<string[]>{
  if(hasVercelKV){
    const kv = await vercelKv()
    return (await kv.smembers(key)) as string[]
  }
  return Array.from(memSets.get(key) || [])
}

// lists — история сканов, свежие сверху, с ограничением по длине.
// ВАЖНО: @vercel/kv сам сериализует значения в JSON. Ручной
// JSON.stringify/parse поверх этого давал двойную упаковку, из-за которой
// чтение падало и список тихо возвращался пустым. Сериализацию не трогаем.
export async function kvListPush(key: string, value: Json, cap = 50){
  if(hasVercelKV){
    const kv = await vercelKv()
    await kv.lpush(key, value)
    await kv.ltrim(key, 0, cap - 1)
    return
  }
  const arr = (memStore.get(key) as Json[]) || []
  arr.unshift(value)
  memStore.set(key, arr.slice(0, cap))
}

export async function kvListAll<T = Json>(key: string): Promise<T[]>{
  if(hasVercelKV){
    const kv = await vercelKv()
    const raw = await kv.lrange(key, 0, -1)
    return raw as T[]
  }
  return ((memStore.get(key) as T[]) || [])
}