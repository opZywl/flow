import { getProvider, isProviderId, rateLimitDetails, rateLimitWait } from "@/lib/atendimento/ai/providers"
import type { ProviderId } from "@/lib/atendimento/ai/providers"
import { LIMITS } from "@/lib/atendimento/ai/contracts"
import type { FailureCode, ModelInfo, ModelsFailure, ModelsResponse } from "@/lib/atendimento/ai/contracts"

export const runtime = "nodejs"
export const maxDuration = 30

type Item = Record<string, unknown>

interface Listed extends ModelInfo {
  created?: number
}

interface Page {
  models: Listed[]
  next?: string
}

interface Source {
  url: (cursor?: string) => string
  headers: (apiKey: string) => Record<string, string>
  read: (body: Item) => Page
}

class ProviderStatus extends Error {
  constructor(readonly status: number, readonly body: string, readonly retryAfter: string | null = null) {
    super(`HTTP ${status}`)
  }
}

class InvalidList extends Error {}

const LIST_TIMEOUT_MS = 15_000
const MAX_PAGES = 5
const MAX_MODELS = 200
const RESPONSE_LIMIT = 5 * 1024 * 1024
const REQUEST_LIMIT = 16 * 1024
const KEY_MIN = 8
const DETAIL_LIMIT = 300
const READ_ERROR = "Não foi possível ler a solicitação."
const KEY_CHARS = /^[\x21-\x7E]+$/
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const DATED = /-\d{4}-?\d{2}-?\d{2}$/
const OPENAI_MODELS = /^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-([5-9]|\d{2,})|o[1-9])/
const OPENAI_SKIP = /(audio|realtime|tts|transcribe|whisper|embedding|image|dall-e|moderation|search|instruct|computer-use|codex|live|translate|cyber|deep-research|^o1-mini|^o1-preview)/
const OPENAI_VISION = /^(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-([5-9]|\d{2,})|o[1-9])/
const OPENAI_TEXT_ONLY = /^(o1-mini|o3-mini)/
const GOOGLE_SKIP = /(embedding|aqa|imagen|tts|image|live|transcribe|translate|native-audio|computer-use|robotics|nano-banana|deep-research|antigravity|omni|veo|lyria)/
const KEY_MESSAGE = /api[ _-]?key|x-api-key|unauthori[sz]ed|authenticat|API_KEY_INVALID|invalid[ _-]?key|incorrect[ _-]?key/i
const BILLING_MESSAGE = /insufficient_quota|credit balance|spending limit|out of credits|have any credits|payment required/i
const NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_CLOSED"])
const MASK = "[chave oculta]"
const SECRET_PATTERNS = [/sk-ant-[\w-]+/g, /sk-[\w-]{6,}/g, /AIza[\w-]{20,}/g, /xai-[\w-]{10,}/g]
const byNewest = new Intl.Collator("en", { numeric: true })

const STATUS: Record<FailureCode, number> = {
  invalid_request: 400,
  unsupported_media: 415,
  payload_too_large: 413,
  invalid_key: 502,
  forbidden: 502,
  billing: 502,
  model_not_found: 502,
  rate_limit: 502,
  provider_error: 502,
  provider_unavailable: 502,
  network: 502,
  timeout: 504,
  invalid_output: 502,
  output_too_long: 502,
  content_filter: 502,
  aborted: 499,
  unknown: 500,
}

const isRecord = (value: unknown): value is Item => value !== null && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown): string => typeof value === "string" ? value.trim() : ""
const items = (body: Item, key: string): Item[] => Array.isArray(body[key]) ? (body[key] as unknown[]).filter(isRecord) : []
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
const seconds = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value * 1000 : undefined
const date = (value: unknown): number | undefined => {
  const time = typeof value === "string" ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : undefined
}

const SOURCES: Record<ProviderId, Source> = {
  openai: {
    url: () => "https://api.openai.com/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    read: (body) => ({
      models: items(body, "data").flatMap((item) => {
        const id = text(item.id)
        const shutdown = date(item.shutdown_date) ?? seconds(item.shutdown_date)
        if (!OPENAI_MODELS.test(id) || OPENAI_SKIP.test(id) || DATED.test(id) || (shutdown !== undefined && shutdown <= Date.now())) return []
        const vision = OPENAI_TEXT_ONLY.test(id) ? false : OPENAI_VISION.test(id) ? true : undefined
        return [{ id, name: id, ...(vision === undefined ? {} : { vision }), created: seconds(item.created) }]
      }),
    }),
  },
  anthropic: {
    url: (cursor) => `https://api.anthropic.com/v1/models?limit=1000${cursor ? `&after_id=${encodeURIComponent(cursor)}` : ""}`,
    headers: (apiKey) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01" }),
    read: (body) => ({
      models: items(body, "data").flatMap((item) => {
        const id = text(item.id)
        const capabilities = isRecord(item.capabilities) ? item.capabilities : null
        const supports = (key: string) => capabilities && isRecord(capabilities[key]) && typeof capabilities[key].supported === "boolean" ? capabilities[key].supported as boolean : undefined
        if (!id.startsWith("claude-") || (item.lifecycle !== undefined && item.lifecycle !== null && item.lifecycle !== "active") || supports("structured_outputs") === false) return []
        return [{ id, name: text(item.display_name) || id, vision: supports("image_input") ?? true, created: date(item.created_at) }]
      }),
      next: body.has_more === true ? text(body.last_id) || undefined : undefined,
    }),
  },
  google: {
    url: (cursor) => `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ""}`,
    headers: (apiKey) => ({ "x-goog-api-key": apiKey }),
    read: (body) => ({
      models: items(body, "models").flatMap((item) => {
        const name = text(item.name)
        if (!name.startsWith("models/gemini") || GOOGLE_SKIP.test(name) || !strings(item.supportedGenerationMethods).includes("generateContent")) return []
        const id = name.slice("models/".length)
        return [{ id, name: text(item.displayName) || id, vision: true }]
      }),
      next: text(body.nextPageToken) || undefined,
    }),
  },
  xai: {
    url: () => "https://api.x.ai/v1/language-models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    read: (body) => ({
      models: items(body, "models").flatMap((item) => {
        const id = text(item.id)
        const output = strings(item.output_modalities)
        const input = strings(item.input_modalities)
        if (!id || (output.length > 0 && !output.includes("text"))) return []
        return [{ id, name: id, ...(input.length ? { vision: input.includes("image") } : {}), created: seconds(item.created) }]
      }),
    }),
  },
}

function json(body: ModelsResponse, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } })
}

function fail(code: FailureCode, error: string, details?: string, field?: ModelsFailure["field"]): Response {
  const body: ModelsFailure = { code, error, ...(details ? { details } : {}), ...(field ? { field } : {}) }
  return json(body, STATUS[code])
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  if (!stream) return ""
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function redact(value: string, apiKey: string): string {
  let clean = value.replace(/Bearer\s+\S+/gi, MASK).split(apiKey).join(MASK)
  for (const pattern of SECRET_PATTERNS) clean = clean.replace(pattern, MASK)
  clean = clean.replace(/\s+/g, " ").trim()
  return clean.length > DETAIL_LIMIT ? `${clean.slice(0, DETAIL_LIMIT - 3).trimEnd()}...` : clean
}

function providerMessage(body: string): string {
  try {
    const data: unknown = JSON.parse(body)
    if (isRecord(data)) {
      const nested = isRecord(data.error) ? data.error.message : data.error
      const message = [nested, data.message].find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      if (message) return message
    }
  } catch {
    return body
  }
  return body
}

function classify(status: number, message: string): FailureCode {
  if (status === 429 && !/insufficient_quota/i.test(message)) return "rate_limit"
  if (status >= 400 && status < 500 && (status === 402 || BILLING_MESSAGE.test(message))) return "billing"
  if (status === 401) return "invalid_key"
  if (status === 403 && /permission_error|does not have permission/i.test(message)) return "forbidden"
  if ((status === 400 || status === 403) && KEY_MESSAGE.test(message)) return "invalid_key"
  if (status === 403) return "forbidden"
  if (status === 408 || status === 504) return "timeout"
  if (status >= 500) return "provider_unavailable"
  return "provider_error"
}

function errorCode(value: unknown): string | undefined {
  const code = isRecord(value) ? value.code : undefined
  return typeof code === "string" ? code : undefined
}

function describe(error: unknown, provider: ProviderId, apiKey: string, client: AbortSignal, deadline: AbortSignal): Response {
  const of = getProvider(provider).of
  if (client.aborted) return fail("aborted", "A busca de modelos foi cancelada.")
  if (deadline.aborted || (error instanceof Error && error.name === "TimeoutError")) return fail("timeout", "O provedor demorou demais para responder.", "Tente novamente em alguns instantes.")
  if (error instanceof ProviderStatus) {
    const message = providerMessage(error.body)
    const code = classify(error.status, `${message} ${error.body.slice(0, 2000)}`)
    if (code === "invalid_key") return fail(code, "A chave da API foi recusada.", `Confira a chave ${of} e tente novamente.`)
    if (code === "forbidden") return fail(code, "A chave não tem acesso à lista de modelos.", `Verifique as permissões da conta ${of}.`)
    if (code === "billing") return fail(code, "Saldo insuficiente na conta do provedor.", `Adicione créditos na conta ${of} e tente novamente.`)
    if (code === "rate_limit") return fail(code, "Limite de uso atingido no provedor.", rateLimitDetails(of, rateLimitWait(error.body.slice(0, 4000), error.retryAfter)))
    if (code === "timeout") return fail(code, "O provedor demorou demais para responder.", "Tente novamente em alguns instantes.")
    if (code === "provider_unavailable") return fail(code, "O provedor está indisponível no momento.", "Tente novamente em alguns instantes.")
    const detail = redact(message, apiKey)
    return fail("provider_error", "O provedor recusou a solicitação.", detail ? `Detalhe do provedor: ${detail}` : undefined)
  }
  if (error instanceof InvalidList) return fail("provider_error", "O provedor devolveu a lista de modelos em um formato inesperado.", "Tente novamente em alguns instantes.")
  const code = error instanceof Error ? errorCode(error) ?? errorCode(error.cause) : undefined
  if ((error instanceof TypeError && /fetch failed|failed to fetch|network/i.test(error.message)) || (code !== undefined && NETWORK_CODES.has(code))) {
    return fail("network", "Não foi possível conectar ao provedor.", "Verifique a conexão com a internet e tente novamente.")
  }
  return fail("unknown", "Não foi possível buscar os modelos.", "Tente novamente.")
}

async function listModels(provider: ProviderId, apiKey: string, signal: AbortSignal): Promise<ModelInfo[]> {
  const source = SOURCES[provider]
  const found = new Map<string, Listed>()
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(source.url(cursor), { method: "GET", headers: { Accept: "application/json", ...source.headers(apiKey) }, redirect: "error", signal, cache: "no-store" })
    const body = await readCapped(response.body, RESPONSE_LIMIT)
    if (!response.ok) throw new ProviderStatus(response.status, body ?? "", response.headers.get("retry-after"))
    if (body === null) throw new InvalidList()
    let data: unknown
    try {
      data = JSON.parse(body)
    } catch {
      throw new InvalidList()
    }
    if (!isRecord(data)) throw new InvalidList()
    const { models, next } = source.read(data)
    for (const model of models) if (MODEL_ID.test(model.id) && !model.id.includes("..") && !found.has(model.id)) found.set(model.id, model)
    if (!next || next === cursor) break
    cursor = next
  }
  return [...found.values()]
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || byNewest.compare(b.id, a.id))
    .slice(0, MAX_MODELS)
    .map(({ id, name, vision }) => ({ id, name, ...(vision === undefined ? {} : { vision }) }))
}

export async function POST(req: Request): Promise<Response> {
  if (!/^application\/json(\s*;|\s*$)/i.test((req.headers.get("content-type") ?? "").trim())) return fail("unsupported_media", "Envie a solicitação em JSON.")
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > REQUEST_LIMIT) return fail("payload_too_large", "A solicitação é grande demais.")
  let body: unknown
  try {
    const raw = await readCapped(req.body, REQUEST_LIMIT)
    if (raw === null) return fail("payload_too_large", "A solicitação é grande demais.")
    body = JSON.parse(raw)
  } catch {
    return fail("invalid_request", READ_ERROR)
  }
  if (!isRecord(body)) return fail("invalid_request", READ_ERROR)
  const { provider } = body
  if (!isProviderId(provider)) return fail("invalid_request", "Escolha um provedor de IA suportado.", undefined, "provider")
  const apiKey = text(body.apiKey)
  if (apiKey.length < KEY_MIN) return fail("invalid_request", "Informe a chave da API.", undefined, "apiKey")
  if (apiKey.length > LIMITS.apiKey) return fail("invalid_request", "A chave da API é longa demais.", undefined, "apiKey")
  if (!KEY_CHARS.test(apiKey)) return fail("invalid_request", "A chave da API tem caracteres inválidos.", undefined, "apiKey")
  const deadline = AbortSignal.timeout(LIST_TIMEOUT_MS)
  try {
    const models = await listModels(provider, apiKey, AbortSignal.any([req.signal, deadline]))
    return json({ models }, 200)
  } catch (error) {
    return describe(error, provider, apiKey, req.signal, deadline)
  }
}
