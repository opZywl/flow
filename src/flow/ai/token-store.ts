import { useSyncExternalStore } from "react"
import type { GenerationUsage } from "@/lib/atendimento/ai/contracts"

export const TOKENS_STORAGE = "flow.ia.tokens"

const EMPTY: GenerationUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const count = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0)

function browser(): boolean {
  return typeof window !== "undefined"
}

function read(value: unknown): GenerationUsage {
  if (!isRecord(value)) return EMPTY
  const inputTokens = count(value.inputTokens)
  const outputTokens = count(value.outputTokens)
  return { inputTokens, outputTokens, totalTokens: Math.max(count(value.totalTokens), inputTokens + outputTokens) }
}

function stored(): GenerationUsage | null {
  if (!browser()) return null
  try {
    const raw = window.localStorage.getItem(TOKENS_STORAGE)
    return raw ? read(JSON.parse(raw)) : EMPTY
  } catch {
    return null
  }
}

function save(totals: GenerationUsage): void {
  if (!browser()) return
  try {
    window.localStorage.setItem(TOKENS_STORAGE, JSON.stringify(totals))
  } catch {
    return
  }
}

const same = (a: GenerationUsage, b: GenerationUsage) => a.inputTokens === b.inputTokens && a.outputTokens === b.outputTokens && a.totalTokens === b.totalTokens

let state: GenerationUsage = stored() ?? EMPTY
const listeners = new Set<() => void>()

function announce(next: GenerationUsage): void {
  if (same(next, state)) return
  state = next
  for (const listener of listeners) listener()
}

function sync(): void {
  const next = stored()
  if (next) announce(next)
}

export function readTokens(): GenerationUsage {
  return state
}

export function addTokens(usage: GenerationUsage | undefined): void {
  const spent = read(usage)
  if (spent.totalTokens <= 0) return
  const base = stored() ?? state
  const next = {
    inputTokens: base.inputTokens + spent.inputTokens,
    outputTokens: base.outputTokens + spent.outputTokens,
    totalTokens: base.totalTokens + spent.totalTokens,
  }
  save(next)
  announce(next)
}

export function subscribeTokens(listener: () => void): () => void {
  if (!listeners.size && browser()) {
    window.addEventListener("storage", sync)
    sync()
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && browser()) window.removeEventListener("storage", sync)
  }
}

export function useTokens(): GenerationUsage {
  return useSyncExternalStore(subscribeTokens, readTokens, () => EMPTY)
}
