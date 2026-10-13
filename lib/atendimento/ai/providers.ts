import { DEFAULT_EFFORT, EFFORTS, type Effort } from "./contracts"

export const PROVIDER_IDS = ["openai", "anthropic", "google", "xai"] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export interface ModelPreset {
  id: string
  name: string
  note: string
  vision: boolean
  efforts?: readonly Effort[]
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  vendor: string
  of: string
  keyPlaceholder: string
  keyPrefix?: string
  presets: readonly [ModelPreset, ModelPreset, ...ModelPreset[]]
}

const GOOGLE_EFFORTS: readonly Effort[] = ["low", "medium", "high"]

export type ProviderEffort = "low" | "medium" | "high" | "xhigh" | "max"

const MAX_EFFORT: Readonly<Record<ProviderId, ProviderEffort>> = { openai: "max", anthropic: "max", google: "high", xai: "xhigh" }

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "ChatGPT",
    vendor: "OpenAI",
    of: "da OpenAI",
    keyPlaceholder: "sk-...",
    keyPrefix: "sk-",
    presets: [
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", note: "recomendado", vision: true },
      { id: "gpt-6-astra", name: "GPT-6 Astra", note: "o mais capaz", vision: true },
      { id: "gpt-6-luna", name: "GPT-6 Luna", note: "o mais rápido", vision: true },
    ],
  },
  {
    id: "anthropic",
    name: "Claude",
    vendor: "Anthropic",
    of: "da Anthropic",
    keyPlaceholder: "sk-ant-...",
    keyPrefix: "sk-ant-",
    presets: [
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "recomendado", vision: true },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "mais rápido", vision: true },
    ],
  },
  {
    id: "google",
    name: "Gemini",
    vendor: "Google",
    of: "do Google",
    keyPlaceholder: "AIza...",
    keyPrefix: "AIza",
    presets: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", note: "recomendado", vision: true, efforts: GOOGLE_EFFORTS },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (prévia)", note: "mais raciocínio", vision: true, efforts: GOOGLE_EFFORTS },
    ],
  },
  {
    id: "xai",
    name: "Grok",
    vendor: "xAI",
    of: "da xAI",
    keyPlaceholder: "xai-...",
    keyPrefix: "xai-",
    presets: [
      { id: "grok-4.7", name: "Grok 4.7", note: "recomendado", vision: true },
      { id: "grok-4.3", name: "Grok 4.3", note: "mais econômico", vision: true },
    ],
  },
]

const byId = new Map<string, ProviderInfo>(PROVIDERS.map((provider) => [provider.id, provider]))

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && byId.has(value)
}

export function getProvider(id: ProviderId): ProviderInfo {
  const provider = byId.get(id)
  if (!provider) throw new Error(`Provedor de IA desconhecido: ${id}.`)
  return provider
}

export function defaultModel(id: ProviderId): ModelPreset {
  return getProvider(id).presets[0]
}

export function findPreset(id: ProviderId, model: string): ModelPreset | undefined {
  return getProvider(id).presets.find((preset) => preset.id === model)
}

export function effortsFor(provider: ProviderId, model: string): readonly Effort[] {
  return findPreset(provider, model)?.efforts ?? EFFORTS
}

export function defaultEffort(provider: ProviderId, model: string): Effort {
  const efforts = effortsFor(provider, model)
  return efforts.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : efforts[0] ?? DEFAULT_EFFORT
}

export function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value)
}

export function providerEffort(provider: ProviderId, effort: Effort): ProviderEffort {
  return effort === "max" ? MAX_EFFORT[provider] : effort
}

const WAIT_LIMIT_SECONDS = 3600

export function rateLimitWait(text: string, retryAfter?: string | null): number | undefined {
  const fromHeader = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : undefined
  const inline = /retry in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(text)
  const delay = /retryDelay\\?"\s*:\s*\\?"(\d+(?:\.\d+)?)s/i.exec(text)
  const seconds = fromHeader ?? (inline ? Number(inline[1]) / (inline[2].toLowerCase() === "ms" ? 1000 : 1) : delay ? Number(delay[1]) : undefined)
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined
  return Math.min(WAIT_LIMIT_SECONDS, Math.max(1, Math.ceil(seconds)))
}

export function rateLimitDetails(of: string, wait?: number): string {
  if (wait === undefined) return `Aguarde alguns instantes ou verifique os créditos da conta ${of}.`
  return `Aguarde cerca de ${wait} ${wait === 1 ? "segundo" : "segundos"} e tente novamente. Se o limite continuar, verifique o plano da conta ${of}.`
}
