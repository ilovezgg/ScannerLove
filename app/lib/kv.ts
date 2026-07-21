// lib/kv.ts
//
// Единая точка доступа к хранилищу для всех новых фич (пуши, рефералка, история).
// Пытается использовать @vercel/kv, если он настроен (KV_REST_API_URL/KV_REST_API_TOKEN
// в env — это Upstash Redis под капотом, подключается через Vercel Storage за 2 клика).
// Если не настроен — падает в in-memory Map, чтобы локально можно было тестировать
// без БД. In-memory вариант НЕ переживёт рестарт serverless-функции в проде — это
// только для локальной разработки, для прода обязательно подключите настоящий KV.
//
// Если у вас уже есть своя БД (Postgres/Supabase/Mongo) для check-paid/stars —
// просто перепишите функции ниже под неё, сигнатуры (get/set/incr/sadd/smembers)
// должны остаться теми же, чтобы остальной код не трогать.

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

// sets — used for "list of all subscribed userIds" etc.
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

// lists — used for scan history (most recent first, capped)
export async function kvListPush(key: string, value: Json, cap = 50){
  if(hasVercelKV){
    const kv = await vercelKv()
    await kv.lpush(key, JSON.stringify(value))
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
    return raw.map((r: string)=> typeof r === "string" ? JSON.parse(r) : r)
  }
  return ((memStore.get(key) as T[]) || [])
}