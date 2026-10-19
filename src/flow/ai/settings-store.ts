import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"
import { DEFAULT_FILL, LIMITS, type Effort, type ModelInfo } from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, isEffort, isProviderId, type ProviderId, type ProviderInfo } from "@/lib/atendimento/ai/providers"

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

export type AiSettingsField = "provider" | "apiKey" | "model" | "effort"

export type AiSettingsErrors = Partial<Record<AiSettingsField, string>>

export interface AiSettingsDialogState {
  open: boolean
  focus: AiSettingsField | null
  errors: AiSettingsErrors
  seq: number
}

export const AI_SETTINGS_STORAGE = "flow.ia"
export const ALL_PROVIDERS_PARAM = "ia"
export const ALL_PROVIDERS_VALUE = "todos"

const SHOWN: readonly ProviderId[] = ["openai"]

const INITIAL: AiSettings = {
  provider: PROVIDERS[0].id,
  keys: {},
  models: {},
  fetched: {},
  effortChoice: null,
  fill: DEFAULT_FILL,
}

const CLOSED: AiSettingsDialogState = { open: false, focus: null, errors: {}, seq: 0 }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

function browser(): boolean {
  return typeof window !== "undefined"
}

export function visibleProviders(): readonly ProviderInfo[] {
  let all = false
  if (browser()) {
    try {
      all = new URLSearchParams(window.location.search).get(ALL_PROVIDERS_PARAM) === ALL_PROVIDERS_VALUE
    } catch {
      all = false
    }
  }
  return all ? PROVIDERS : PROVIDERS.filter((entry) => SHOWN.includes(entry.id))
}

function shownProvider(id: ProviderId): ProviderId {
  const visible = visibleProviders()
  return visible.some((entry) => entry.id === id) ? id : visible[0].id
}

function texts(value: unknown, limit: number): Partial<Record<ProviderId, string>> {
  if (!isRecord(value)) return {}
  const result: Partial<Record<ProviderId, string>> = {}
  for (const [key, entry] of Object.entries(value)) if (isProviderId(key) && typeof entry === "string" && entry.length <= limit) result[key] = entry
  return result
}

function load(): AiSettings {
  if (!browser()) return INITIAL
  try {
    const raw = window.sessionStorage.getItem(AI_SETTINGS_STORAGE)
    if (!raw) return { ...INITIAL, provider: shownProvider(INITIAL.provider) }
    const saved: unknown = JSON.parse(raw)
    if (!isRecord(saved)) return { ...INITIAL, provider: shownProvider(INITIAL.provider) }
    return {
      provider: shownProvider(isProviderId(saved.provider) ? saved.provider : INITIAL.provider),
      keys: texts(saved.keys, LIMITS.apiKey),
      models: texts(saved.models, LIMITS.model),
      fetched: {},
      effortChoice: isEffort(saved.effortChoice) ? saved.effortChoice : null,
      fill: typeof saved.fill === "boolean" ? saved.fill : DEFAULT_FILL,
    }
  } catch {
    return { ...INITIAL, provider: shownProvider(INITIAL.provider) }
  }
}

function save(settings: AiSettings): void {
  if (!browser()) return
  try {
    const { provider, keys, models, effortChoice, fill } = settings
    window.sessionStorage.setItem(AI_SETTINGS_STORAGE, JSON.stringify({ provider, keys, models, effortChoice, fill }))
  } catch {
    return
  }
}

let state: AiSettings = load()
let dialog: AiSettingsDialogState = CLOSED
const listeners = new Set<() => void>()
const dialogListeners = new Set<() => void>()

export function readAiSettings(): AiSettings {
  return state
}

export function updateAiSettings(patch: Partial<AiSettings> | ((current: AiSettings) => Partial<AiSettings>)): void {
  const next = typeof patch === "function" ? patch(state) : patch
  if (Object.entries(next).every(([key, value]) => state[key as keyof AiSettings] === value)) return
  state = { ...state, ...next, ...(next.provider ? { provider: shownProvider(next.provider) } : {}) }
  save(state)
  for (const listener of listeners) listener()
}

export function resetAiSettings(): void {
  state = INITIAL
  dialog = CLOSED
  if (browser()) {
    try {
      window.sessionStorage.removeItem(AI_SETTINGS_STORAGE)
    } catch {
      state = INITIAL
    }
  }
  for (const listener of listeners) listener()
  for (const listener of dialogListeners) listener()
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

function announce(next: AiSettingsDialogState): void {
  dialog = next
  for (const listener of dialogListeners) listener()
}

export function openAiSettings(request: { focus?: AiSettingsField | null; errors?: AiSettingsErrors } = {}): void {
  const errors = Object.fromEntries(Object.entries(request.errors ?? {}).filter(([, message]) => typeof message === "string" && message.trim())) as AiSettingsErrors
  announce({ open: true, focus: request.focus ?? null, errors, seq: dialog.seq + 1 })
}

export function closeAiSettings(): void {
  if (!dialog.open && !Object.keys(dialog.errors).length) return
  announce({ open: false, focus: null, errors: {}, seq: dialog.seq })
}

export function clearAiSettingsErrors(...fields: AiSettingsField[]): void {
  if (!fields.some((field) => dialog.errors[field])) return
  const errors = { ...dialog.errors }
  for (const field of fields) delete errors[field]
  announce({ ...dialog, errors })
}

export function readAiSettingsDialog(): AiSettingsDialogState {
  return dialog
}

export function subscribeAiSettingsDialog(listener: () => void): () => void {
  dialogListeners.add(listener)
  return () => {
    dialogListeners.delete(listener)
  }
}

export function useAiSettingsDialog(): AiSettingsDialogState {
  return useSyncExternalStore(subscribeAiSettingsDialog, () => dialog, () => CLOSED)
}
