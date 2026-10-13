import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"
import { DEFAULT_FILL, type Effort, type ModelInfo } from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"

export interface FetchedModels {
  key: string
  models: ModelInfo[]
}

export interface AiSettings {
  provider: ProviderId
  keys: Partial<Record<ProviderId, string>>
  models: Partial<Record<ProviderId, string>>
  fetched: Partial<Record<ProviderId, FetchedModels>>
  effortChoice: Effort | null
  fill: boolean
}

const INITIAL: AiSettings = {
  provider: PROVIDERS[0].id,
  keys: {},
  models: {},
  fetched: {},
  effortChoice: null,
  fill: DEFAULT_FILL,
}

let state: AiSettings = INITIAL
const listeners = new Set<() => void>()

export function readAiSettings(): AiSettings {
  return state
}

export function updateAiSettings(patch: Partial<AiSettings> | ((current: AiSettings) => Partial<AiSettings>)): void {
  const next = typeof patch === "function" ? patch(state) : patch
  if (Object.entries(next).every(([key, value]) => state[key as keyof AiSettings] === value)) return
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function resetAiSettings(): void {
  state = INITIAL
  for (const listener of listeners) listener()
}

export function subscribeAiSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAiSetting<K extends keyof AiSettings>(key: K): [AiSettings[K], Dispatch<SetStateAction<AiSettings[K]>>] {
  const value = useSyncExternalStore(
    subscribeAiSettings,
    () => state[key],
    () => INITIAL[key],
  )
  const set = useCallback<Dispatch<SetStateAction<AiSettings[K]>>>(
    (action) =>
      updateAiSettings((current) => {
        const next = typeof action === "function" ? (action as (previous: AiSettings[K]) => AiSettings[K])(current[key]) : action
        return { [key]: next } as Partial<AiSettings>
      }),
    [key],
  )
  return [value, set]
}
