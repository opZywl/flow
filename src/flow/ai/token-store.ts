import { useSyncExternalStore } from "react"
import type { GenerationUsage } from "@/lib/atendimento/ai/contracts"

export const TOKENS_STORAGE = "flow.ia.tokens"
export const TOKENS_DATABASE = "flow.ia"

const STORE = "tokens"
const RECORD = "total"
const EMPTY: GenerationUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const count = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0)
const same = (a: GenerationUsage, b: GenerationUsage) => a.inputTokens === b.inputTokens && a.outputTokens === b.outputTokens && a.totalTokens === b.totalTokens
const plus = (a: GenerationUsage, b: GenerationUsage): GenerationUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
})
const minus = (a: GenerationUsage, b: GenerationUsage): GenerationUsage => ({
  inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
  outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
  totalTokens: Math.max(0, a.totalTokens - b.totalTokens),
})

function browser(): boolean {
  return typeof window !== "undefined"
}

function indexed(): boolean {
  return browser() && typeof window.indexedDB?.open === "function"
}

function read(value: unknown): GenerationUsage {
  if (!isRecord(value)) return EMPTY
  const inputTokens = count(value.inputTokens)
  const outputTokens = count(value.outputTokens)
  return { inputTokens, outputTokens, totalTokens: Math.max(count(value.totalTokens), inputTokens + outputTokens) }
}

function mirror(fallback: GenerationUsage): GenerationUsage | null {
  if (!browser()) return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(TOKENS_STORAGE)
  } catch {
    return null
  }
  if (!raw) return EMPTY
  try {
    return read(JSON.parse(raw))
  } catch {
    return fallback
  }
}

function keep(totals: GenerationUsage): boolean {
  if (!browser()) return false
  try {
    window.localStorage.setItem(TOKENS_STORAGE, JSON.stringify(totals))
    return true
  } catch {
    return false
  }
}

let committed: GenerationUsage = mirror(EMPTY) ?? EMPTY
let pending: GenerationUsage = EMPTY
let state: GenerationUsage = committed
let flushing = false
let opening: Promise<IDBDatabase | null> | null = null
const listeners = new Set<() => void>()

function publish(): void {
  const next = plus(committed, pending)
  if (same(next, state)) return
  state = next
  for (const listener of listeners) listener()
}

function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(TOKENS_DATABASE, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE)
        const seed = mirror(EMPTY)
        if (seed && seed.totalTokens > 0) store.put(seed, RECORD)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

function readDatabase(db: IDBDatabase): Promise<GenerationUsage | null> {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD)
      request.onsuccess = () => resolve(read(request.result))
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function commitDatabase(db: IDBDatabase, batch: GenerationUsage): Promise<GenerationUsage | null> {
  return new Promise((resolve) => {
    try {
      let next: GenerationUsage | null = null
      const transaction = db.transaction(STORE, "readwrite")
      const store = transaction.objectStore(STORE)
      const request = store.get(RECORD)
      request.onsuccess = () => {
        next = plus(read(request.result), batch)
        store.put(next, RECORD)
      }
      transaction.oncomplete = () => resolve(next)
      transaction.onerror = () => resolve(null)
      transaction.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function settle(batch: GenerationUsage, next: GenerationUsage | null): boolean {
  if (!next) return false
  pending = minus(pending, batch)
  committed = next
  return true
}

function saveStorage(): void {
  if (pending.totalTokens <= 0) return
  const batch = pending
  const base = mirror(committed)
  if (!base) return
  const next = plus(base, batch)
  if (keep(next)) settle(batch, next)
}

async function flush(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    while (pending.totalTokens > 0) {
      const batch = pending
      const db = await database()
      if (!db) {
        saveStorage()
        break
      }
      if (!settle(batch, await commitDatabase(db, batch))) break
      keep(committed)
      publish()
    }
  } finally {
    flushing = false
    publish()
  }
}

function refresh(): void {
  if (!indexed()) {
    const total = mirror(committed)
    if (!total) return
    committed = total
    publish()
    return
  }
  void database()
    .then((db) => (db ? readDatabase(db) : mirror(committed)))
    .then((total) => {
      if (!total) return
      committed = total
      publish()
    })
}

export function readTokens(): GenerationUsage {
  return state
}

export function addTokens(usage: GenerationUsage | undefined): void {
  const spent = read(usage)
  if (spent.totalTokens <= 0) return
  pending = plus(pending, spent)
  if (indexed()) void flush()
  else saveStorage()
  publish()
}

export function subscribeTokens(listener: () => void): () => void {
  if (!listeners.size && browser()) window.addEventListener("storage", refresh)
  refresh()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && browser()) window.removeEventListener("storage", refresh)
  }
}

export function useTokens(): GenerationUsage {
  return useSyncExternalStore(subscribeTokens, readTokens, () => EMPTY)
}
