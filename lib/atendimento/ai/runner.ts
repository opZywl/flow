import { APICallError, NoObjectGeneratedError, RetryError, streamObject } from "ai"
import type { LanguageModel, LanguageModelUsage, ModelMessage, SystemModelMessage } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"
import { NOTE_TYPE, START_ID, START_TYPE } from "../catalog"
import { importFlow, stampExport } from "../format"
import type { AtendimentoFlow } from "../types"
import { COUNT_LIMITS, DEFAULT_EFFORT, DEFAULT_FILL, DEFAULT_MODE, GENERATION_SIZES, LIMITS, MAX_ROUNDS } from "./contracts"
import type {
  Effort,
  FailureCode,
  GenerateFailure,
  GenerateResponse,
  GenerateSuccess,
  GenerationIssue,
  GenerationMode,
  GenerationProgress,
  GenerationSize,
  GenerationUsage,
  RequestField,
} from "./contracts"
import { applyEdit, concludeEdit, deltaBetween, editCorrectionPrompt, editRequestPrompt, editResumePrompt, editSnapshot, editSystemPrompt, needsEditCorrection, pickEdit, reviewEdit } from "./edit"
import type { EditResult, EditReview } from "./edit"
import { correctionPrompt, formatFailurePrompt, requestPrompt, systemPrompt } from "./prompt"
import { findPreset, getProvider, isEffort, isProviderId, providerEffort, rateLimitDetails, rateLimitWait } from "./providers"
import type { ProviderEffort, ProviderId } from "./providers"
import { concludeGeneration, evaluateRi, needsCorrection, pickBetter } from "./review"
import type { RoundEvaluation } from "./review"
import { RI_EDIT_SCHEMA_DESCRIPTION, RI_EDIT_SCHEMA_NAME, RI_PROVIDER_OPTIONS, RI_SCHEMA_DESCRIPTION, RI_SCHEMA_NAME, canonicalType, coerceDelta, coerceRi, countRi, repairDeltaText, repairRiText, riEditSchema, riSchema } from "./ri"
import type { RiDelta, RiEdge, RiFlow } from "./ri"

globalThis.AI_SDK_LOG_WARNINGS = false

export type Transport = "browser" | "server"

export type ImageType = "image/png" | "image/jpeg"

export interface GenerationImage {
  mediaType: ImageType
  data: Uint8Array
  bytes: number
}

export interface GenerationInput {
  provider: ProviderId
  model: string
  apiKey: string
  prompt: string
  image?: GenerationImage | string | null
  size: GenerationSize
  count?: number
  name?: string
  effort: Effort
  mode?: GenerationMode
  base?: unknown
  fill?: boolean
}

export interface RunHooks {
  transport: Transport
  signal: AbortSignal
  deadlineMs?: number
  fetch?: typeof fetch
  onProgress?: (progress: GenerationProgress) => void
  onPartial?: (ri: RiFlow) => void
}

export interface ParsedRequest {
  input: GenerationInput & { image: GenerationImage | null; mode: GenerationMode; base?: AtendimentoFlow; fill: boolean }
  stream: boolean
}

export type RequestCheck = { ok: true; request: ParsedRequest } | { ok: false; failure: GenerateFailure }

type ResolvedInput = ParsedRequest["input"]
type ProviderOptions = NonNullable<SystemModelMessage["providerOptions"]>

export interface StreamWatch {
  events: boolean
  refusal: boolean
  failed: boolean
}

export interface ModelSetup {
  model: LanguageModel
  providerOptions: ProviderOptions
  systemOptions?: ProviderOptions
  watch: StreamWatch
  maxOutputTokens?: number
  effortKey?: string
}

export interface Abort {
  client: AbortSignal
  deadline?: AbortSignal
}

interface EditRound extends EditReview {
  delta: RiDelta
  result: EditResult
}

interface Attempt {
  ri?: RiFlow
  error?: unknown
  partial: unknown
  usage?: LanguageModelUsage
}

interface RiFormat {
  schema: typeof riSchema | typeof riEditSchema
  name: string
  description: string
  repair: (text: string) => string | null
}

const CREATE_FORMAT: RiFormat = { schema: riSchema, name: RI_SCHEMA_NAME, description: RI_SCHEMA_DESCRIPTION, repair: repairRiText }
const EDIT_FORMAT: RiFormat = { schema: riEditSchema, name: RI_EDIT_SCHEMA_NAME, description: RI_EDIT_SCHEMA_DESCRIPTION, repair: repairDeltaText }

export const INTERRUPTED_NOTICE = "A geração foi interrompida antes do fim e o fluxo pode estar incompleto."

const ROUND_RESERVE_MS = 75_000
const PARTIAL_INTERVAL_MS = 250
const REPLY_LIMIT = 20_000
const DETAIL_LIMIT = 300
const RELAX_LIMIT = 2
const KEY_MIN = 8
const READ_ERROR = "Não foi possível ler a solicitação."
const IMAGE_ERROR = "Imagem inválida. Envie PNG ou JPG de até 5 MB."
const EMPTY_FLOW = "O modelo não gerou nenhum componente para esta descrição."
const EMPTY_EDIT = "O modelo não fez nenhuma mudança no fluxo para este pedido."
const BASE_MISSING = "Abra um fluxo para editar."
const BASE_INVALID = "Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo."
const FILL_INVALID = "Escolha se a IA preenche os nomes, IDs e URLs que o pedido não traz."
const BROWSER_HEADER = "anthropic-dangerous-direct-browser-access"
const SIZES: readonly string[] = GENERATION_SIZES
const KEY_CHARS = /^[\x21-\x7E]+$/
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/
const SIGNATURES: Record<ImageType, number[]> = { "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/jpeg": [0xff, 0xd8, 0xff] }
const TEXT_ONLY: Partial<Record<ProviderId, RegExp>> = { openai: /^(o1-mini|o1-preview|o3-mini|gpt-3\.5|gpt-4(-0314|-0613)?$)/ }
const REFUSAL_EVENT = /"type"\s*:\s*"(?:response\.refusal\.|refusal")/
const FAILED_EVENT = /"type"\s*:\s*"response\.failed"/
const WATCH_TAIL = 48
const NO_CREDITS = /insufficient_quota/i
const PERMISSION_MESSAGE = /permission_error|does not have permission/i
const KEY_MESSAGE = /api[ _-]?key|x-api-key|unauthori[sz]ed|authenticat|API_KEY_INVALID|invalid[ _-]?key|incorrect[ _-]?key/i
const BILLING_MESSAGE = /insufficient_quota|credit balance|spending limit|out of credits|have any credits|payment required/i
const MODEL_MESSAGE = /model_not_found|not_found_error|\bmodel\b[^.\n]{0,80}\b(not found|does not exist|not exist)/i
const RATE_MESSAGE = /rate[ _-]?limit|too many requests|resource_exhausted|exceeded your current quota/i
const BUSY_MESSAGE = /overloaded|server_error|api_error|internal|unavailable/i
const TOKENS_MESSAGE = /max[ _-]?(?:output[ _-]?)?tokens|maxOutputTokens|max_completion_tokens|output token/i
const EFFORT_MESSAGE = /reasoning|effort|thinking/i
const NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_CLOSED"])
const TIMEOUT_CODES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])
const MASK = "[chave oculta]"
const SECRET_PATTERNS = [/sk-ant-[\w-]+/g, /sk-[\w-]{6,}/g, /AIza[\w-]{20,}/g, /xai-[\w-]{10,}/g]

const BASE_URLS: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
}

const MAX_OUTPUT: Readonly<Record<ProviderId, number>> = { openai: 128_000, anthropic: 128_000, google: 65_536, xai: 128_000 }

class EmptyFlowError extends Error {
  constructor() {
    super(EMPTY_FLOW)
    this.name = "EmptyFlowError"
  }
}

class EmptyEditError extends Error {
  constructor() {
    super(EMPTY_EDIT)
    this.name = "EmptyEditError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function reject(error: string, field?: RequestField): { ok: false; failure: GenerateFailure } {
  return { ok: false, failure: { success: false, code: "invalid_request", error, ...(field ? { field } : {}) } }
}

function base64Bytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function signed(mediaType: ImageType, data: Uint8Array): boolean {
  const signature = SIGNATURES[mediaType]
  return data.byteLength > signature.length && data.byteLength <= LIMITS.imageBytes && signature.every((byte, index) => data[index] === byte)
}

export function decodeImage(value: unknown): GenerationImage | null {
  if (isRecord(value) && value.data instanceof Uint8Array && (value.mediaType === "image/png" || value.mediaType === "image/jpeg")) {
    return signed(value.mediaType, value.data) ? { mediaType: value.mediaType, data: value.data, bytes: value.data.byteLength } : null
  }
  if (typeof value !== "string") return null
  const match = IMAGE_DATA_URL.exec(value)
  if (!match || match[2].length % 4 !== 0) return null
  const mediaType = match[1] as ImageType
  const encoded = match[2]
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0
  if ((encoded.length / 4) * 3 - padding > LIMITS.imageBytes) return null
  let data: Uint8Array
  try {
    data = base64Bytes(encoded)
  } catch {
    return null
  }
  return signed(mediaType, data) ? { mediaType, data, bytes: data.byteLength } : null
}

function acceptsImages(provider: ProviderId, model: string): boolean {
  const preset = findPreset(provider, model)
  if (preset) return preset.vision
  return !TEXT_ONLY[provider]?.test(model)
}

function readCount(value: unknown): number | null {
  const count = typeof value === "string" && /^\d{1,3}$/.test(value.trim()) ? Number(value) : value
  return typeof count === "number" && Number.isInteger(count) && count >= COUNT_LIMITS.min && count <= COUNT_LIMITS.max ? count : null
}

export function parseGenerationRequest(body: unknown): RequestCheck {
  if (!isRecord(body)) return reject(READ_ERROR)
  const { provider } = body
  if (!isProviderId(provider)) return reject("Escolha um provedor de IA suportado.", "provider")
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  if (apiKey.length < KEY_MIN) return reject("Informe a chave da API.", "apiKey")
  if (apiKey.length > LIMITS.apiKey) return reject("A chave da API é longa demais.", "apiKey")
  if (!KEY_CHARS.test(apiKey)) return reject("A chave da API tem caracteres inválidos.", "apiKey")
  const model = typeof body.model === "string" ? body.model.trim() : ""
  if (model.length > LIMITS.model || !MODEL_ID.test(model) || model.includes("..")) return reject("Escolha um modelo válido.", "model")

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (prompt.length > LIMITS.prompt) return reject(`A descrição pode ter até ${LIMITS.prompt.toLocaleString("pt-BR")} caracteres.`, "prompt")
  const hasImage = body.image !== undefined && body.image !== null && body.image !== ""
  const image = hasImage ? decodeImage(body.image) : null
  if (hasImage && !image) return reject(IMAGE_ERROR, "image")
  if (!prompt && !image) return reject("Descreva o atendimento ou envie uma imagem de referência.", "prompt")
  if (image && !acceptsImages(provider, model)) return reject(`O modelo ${findPreset(provider, model)?.name ?? model} não analisa imagens. Escolha outro modelo ou remova a imagem.`, "model")

  const size = body.size === undefined ? "auto" : body.size
  if (typeof size !== "string" || !SIZES.includes(size)) return reject("Tamanho do fluxo inválido.", "size")
  let count: number | undefined
  if (size === "custom") {
    const value = readCount(body.count)
    if (value === null) return reject(`Informe de ${COUNT_LIMITS.min} a ${COUNT_LIMITS.max} componentes.`, "count")
    count = value
  }
  if (body.name !== undefined && body.name !== null && typeof body.name !== "string") return reject(`O nome do fluxo pode ter até ${LIMITS.name} caracteres.`, "name")
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (name.length > LIMITS.name) return reject(`O nome do fluxo pode ter até ${LIMITS.name} caracteres.`, "name")
  const effort = body.effort === undefined || body.effort === null || body.effort === "" ? DEFAULT_EFFORT : body.effort
  if (!isEffort(effort)) return reject("Escolha um nível de esforço válido.", "effort")
  const fill = body.fill === undefined || body.fill === null ? DEFAULT_FILL : body.fill
  if (typeof fill !== "boolean") return reject(FILL_INVALID, "fill")
  const mode = body.mode === undefined || body.mode === null || body.mode === "" ? DEFAULT_MODE : body.mode
  if (mode !== "create" && mode !== "edit") return reject("Escolha criar um fluxo novo ou editar o fluxo aberto.", "mode")
  let base: AtendimentoFlow | undefined
  if (mode === "edit") {
    if (body.base === undefined || body.base === null || body.base === "") return reject(BASE_MISSING, "base")
    try {
      base = importFlow(body.base)
    } catch {
      return reject(BASE_INVALID, "base")
    }
    const starts = base.nodes.filter((node) => node.data.type === START_TYPE)
    if (starts.length !== 1 || starts[0].id !== START_ID) return reject(BASE_INVALID, "base")
  }

  return {
    ok: true,
    request: {
      input: { provider, model, apiKey, prompt, image, size: size as GenerationSize, count, name: name || undefined, effort, mode, ...(base ? { base } : {}), fill },
      stream: body.stream === true,
    },
  }
}

function versionOf(pattern: RegExp, model: string): { major: number; minor: number; variant: string } | undefined {
  const match = pattern.exec(model)
  if (!match) return undefined
  return { major: Number(match[1]), minor: match[2] ? Number(match[2]) : 0, variant: match[3] ?? "" }
}

const GPT_VERSION = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/
const O_SERIES = /^o(\d+)(?:-|$)/
const CLAUDE_VERSION = /^claude-(?:opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2})(?!\d))?/
const CLAUDE_LEGACY = /^claude-(?:instant|\d)/
const GEMINI_VERSION = /^gemini-(\d+)(?:\.(\d+))?/
const GROK_VERSION = /^grok-(\d+)(?:[.-](\d{1,2})(?!\d))?/

export function modelEffort(provider: ProviderId, model: string, effort: Effort): ProviderEffort | undefined {
  const value = providerEffort(provider, effort)
  if (provider === "openai") {
    const gpt = versionOf(GPT_VERSION, model)
    if (gpt && gpt.major >= 6) return value
    if ((gpt && gpt.major === 5 && !gpt.variant.startsWith("chat")) || O_SERIES.test(model)) return value === "max" ? "high" : value
    return undefined
  }
  if (provider === "anthropic") {
    if (CLAUDE_LEGACY.test(model)) return undefined
    const claude = versionOf(CLAUDE_VERSION, model)
    if (!claude) return value
    const version = claude.major + claude.minor / 10
    if (version >= 5) return value
    const opus = model.startsWith("claude-opus-")
    if (version < 4.5 || (version < 4.6 && !opus)) return undefined
    return value === "max" && version < 4.6 ? "high" : value
  }
  if (provider === "google") {
    const gemini = versionOf(GEMINI_VERSION, model)
    return gemini && gemini.major >= 3 ? value : undefined
  }
  const grok = versionOf(GROK_VERSION, model)
  return grok && (grok.major > 4 || (grok.major === 4 && grok.minor >= 3)) ? value : undefined
}

export function maxOutputFor(provider: ProviderId, model: string): number | undefined {
  if (provider === "openai") {
    const gpt = versionOf(GPT_VERSION, model)
    if (gpt && gpt.major >= 5 && !gpt.variant.startsWith("chat")) return MAX_OUTPUT.openai
    return O_SERIES.test(model) ? 100_000 : undefined
  }
  if (provider === "anthropic") return CLAUDE_LEGACY.test(model) ? undefined : MAX_OUTPUT.anthropic
  if (provider === "google") {
    const gemini = versionOf(GEMINI_VERSION, model)
    return gemini && (gemini.major >= 3 || (gemini.major === 2 && gemini.minor >= 5)) ? MAX_OUTPUT.google : undefined
  }
  const grok = versionOf(GROK_VERSION, model)
  return grok && grok.major >= 4 ? MAX_OUTPUT.xai : undefined
}

function baseFetch(custom: typeof fetch | undefined): typeof fetch {
  if (custom) return (input, init) => custom.call(globalThis, input, init)
  return (input, init) => globalThis.fetch(input, init)
}

function browserInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init?.headers) return init
  const headers = new Headers(init.headers)
  headers.delete("user-agent")
  return { ...init, headers }
}

async function withoutQuotaRetry(response: Response): Promise<Response> {
  const text = await response.text()
  const status = NO_CREDITS.test(text) ? 402 : response.status
  return new Response(text, { status, statusText: response.statusText, headers: response.headers })
}

function observe(watch: StreamWatch, base: typeof fetch, browser: boolean): typeof fetch {
  return async (input, init) => {
    const response = await base(input, browser ? browserInit(init) : init)
    if (response.status === 429) return withoutQuotaRetry(response)
    if (!watch.events || !response.ok || !response.body) return response
    const decoder = new TextDecoder()
    let tail = ""
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = tail + decoder.decode(chunk, { stream: true })
        if (REFUSAL_EVENT.test(text)) watch.refusal = true
        if (FAILED_EVENT.test(text)) watch.failed = true
        tail = text.slice(-WATCH_TAIL)
        controller.enqueue(chunk)
      },
    }))
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}

export function createSetup(input: ResolvedInput, hooks: RunHooks): ModelSetup {
  const { provider, model, apiKey } = input
  const browser = hooks.transport === "browser"
  const watch: StreamWatch = { events: provider === "openai" || provider === "xai", refusal: false, failed: false }
  const fetch = observe(watch, baseFetch(hooks.fetch), browser)
  const effort = modelEffort(provider, model, input.effort)
  const maxOutputTokens = maxOutputFor(provider, model)
  if (provider === "openai") {
    return {
      model: createOpenAI({ apiKey, baseURL: BASE_URLS.openai, fetch }).responses(model),
      providerOptions: { openai: { ...RI_PROVIDER_OPTIONS.openai.openai, ...(effort ? { reasoningEffort: effort } : {}) } },
      watch,
      maxOutputTokens,
      effortKey: effort ? "reasoningEffort" : undefined,
    }
  }
  if (provider === "anthropic") {
    return {
      model: createAnthropic({ apiKey, baseURL: BASE_URLS.anthropic, fetch, ...(browser ? { headers: { [BROWSER_HEADER]: "true" } } : {}) })(model),
      providerOptions: { anthropic: { ...RI_PROVIDER_OPTIONS.anthropic.anthropic, ...(effort ? { effort } : {}) } },
      systemOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      watch,
      maxOutputTokens,
      effortKey: effort ? "effort" : undefined,
    }
  }
  if (provider === "google") {
    return {
      model: createGoogleGenerativeAI({ apiKey, baseURL: BASE_URLS.google, fetch })(model),
      providerOptions: { google: { ...RI_PROVIDER_OPTIONS.google.google, ...(effort ? { thinkingConfig: { thinkingLevel: effort } } : {}) } },
      watch,
      maxOutputTokens,
      effortKey: effort ? "thinkingConfig" : undefined,
    }
  }
  return {
    model: createXai({ apiKey, baseURL: BASE_URLS.xai, fetch }).responses(model),
    providerOptions: { xai: { ...RI_PROVIDER_OPTIONS.xai.xai, ...(effort ? { reasoningEffort: effort } : {}) } },
    watch,
    maxOutputTokens,
    effortKey: effort ? "reasoningEffort" : undefined,
  }
}

function redact(text: string, apiKey: string): string {
  let clean = text.replace(/Bearer\s+\S+/gi, MASK)
  if (apiKey) clean = clean.split(apiKey).join(MASK)
  for (const pattern of SECRET_PATTERNS) clean = clean.replace(pattern, MASK)
  clean = clean.replace(/\s+/g, " ").trim()
  return clean.length > DETAIL_LIMIT ? `${clean.slice(0, DETAIL_LIMIT - 3).trimEnd()}...` : clean
}

function errorCode(value: unknown): string | undefined {
  const code = isRecord(value) ? value.code : undefined
  return typeof code === "string" ? code : undefined
}

function unwrap(error: unknown): unknown {
  let current = error
  for (let depth = 0; depth < 4 && RetryError.isInstance(current) && current.lastError; depth++) current = current.lastError
  return current
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = errorCode(error) ?? errorCode(error.cause)
  return error.name === "TimeoutError" || (code !== undefined && TIMEOUT_CODES.has(code))
}

function isNetwork(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = errorCode(error) ?? errorCode(error.cause)
  if (code && NETWORK_CODES.has(code)) return true
  return error instanceof TypeError && /fetch failed|failed to fetch|network|load failed|terminated/i.test(error.message)
}

function classify(status: number | undefined, text: string): FailureCode {
  if (status === undefined) return "network"
  if (status === 429 && !/insufficient_quota/i.test(text)) return "rate_limit"
  if (status >= 400 && status < 500 && (status === 402 || BILLING_MESSAGE.test(text))) return "billing"
  if (status === 401) return "invalid_key"
  if (status === 403 && PERMISSION_MESSAGE.test(text)) return "forbidden"
  if ((status === 400 || status === 403) && KEY_MESSAGE.test(text)) return "invalid_key"
  if (status === 403) return "forbidden"
  if (status === 404 || (status === 400 && MODEL_MESSAGE.test(text))) return "model_not_found"
  if (status === 408 || status === 504) return "timeout"
  if (status >= 500) return "provider_unavailable"
  return "provider_error"
}

function streamFailure(value: Record<string, unknown>): { code: FailureCode; text: string } {
  const text = JSON.stringify(value).slice(0, 2000)
  const message = [value.message, isRecord(value.error) ? value.error.message : value.error].find((entry): entry is string => typeof entry === "string") ?? text
  if (BILLING_MESSAGE.test(text)) return { code: "billing", text: message }
  if (RATE_MESSAGE.test(text)) return { code: "rate_limit", text: message }
  if (BUSY_MESSAGE.test(text)) return { code: "provider_unavailable", text: message }
  if (KEY_MESSAGE.test(text)) return { code: "invalid_key", text: message }
  return { code: "provider_error", text: message }
}

function failure(code: FailureCode, provider: ProviderId, detail?: string, wait?: number): GenerateFailure {
  const of = getProvider(provider).of
  const messages: Record<FailureCode, [string, string?]> = {
    invalid_request: [READ_ERROR],
    unsupported_media: ["Envie a solicitação em JSON."],
    payload_too_large: ["A solicitação é grande demais."],
    invalid_key: ["A chave da API foi recusada.", `Confira a chave ${of} e tente novamente.`],
    forbidden: ["A chave não tem acesso a este modelo ou recurso.", `Verifique as permissões da conta ${of}.`],
    billing: ["Saldo insuficiente na conta do provedor.", `Adicione créditos na conta ${of} e tente novamente.`],
    model_not_found: ["O modelo escolhido não está disponível para esta chave.", "Escolha outro modelo ou use Buscar modelos da API."],
    rate_limit: ["Limite de uso atingido no provedor.", rateLimitDetails(of, wait)],
    provider_error: ["O provedor recusou a solicitação.", detail ? `Detalhe do provedor: ${detail}` : "Tente novamente em alguns instantes."],
    provider_unavailable: ["O provedor está indisponível no momento.", "Tente novamente em alguns instantes."],
    network: ["Não foi possível conectar ao provedor.", "Verifique a conexão com a internet e tente novamente."],
    timeout: ["O provedor demorou demais para responder.", "Tente um modelo mais rápido ou um fluxo menor."],
    invalid_output: ["A resposta do modelo não seguiu o formato esperado.", "Gere novamente ou escolha outro modelo."],
    output_too_long: ["A resposta do modelo foi interrompida por excesso de tamanho.", "Reduza o tamanho do fluxo ou escolha um modelo com mais capacidade."],
    content_filter: ["O provedor bloqueou a resposta.", "Revise a descrição e tente novamente."],
    aborted: ["A geração foi cancelada."],
    unknown: ["Não foi possível gerar o fluxo.", "Tente novamente."],
  }
  const [error, details] = messages[code]
  return { success: false, code, error, ...(details ? { details } : {}) }
}

export function describeFailure(error: unknown, provider: ProviderId, apiKey: string, abort: Abort): GenerateFailure {
  if (abort.client.aborted) return failure("aborted", provider)
  if (abort.deadline?.aborted) return failure("timeout", provider)
  const cause = unwrap(error)
  if (cause instanceof EmptyFlowError) return { success: false, code: "invalid_output", error: EMPTY_FLOW, details: "Descreva as etapas do atendimento e gere novamente.", field: "prompt" }
  if (cause instanceof EmptyEditError) return { success: false, code: "invalid_output", error: EMPTY_EDIT, details: "Descreva o que mudar no fluxo e gere novamente.", field: "prompt" }
  if (NoObjectGeneratedError.isInstance(cause)) {
    if (cause.finishReason === "length") return failure("output_too_long", provider)
    if (cause.finishReason === "content-filter") return failure("content_filter", provider)
    if (cause.finishReason === "error") return failure("provider_unavailable", provider)
    return failure("invalid_output", provider)
  }
  if (APICallError.isInstance(cause)) {
    const text = `${cause.message} ${(cause.responseBody ?? "").slice(0, 2000)}`
    const status = cause.statusCode !== undefined && cause.statusCode >= 400 ? cause.statusCode : undefined
    const code = status === undefined && isTimeout(cause.cause) ? "timeout" : classify(status, text)
    const wait = code === "rate_limit" ? rateLimitWait(text, cause.responseHeaders?.["retry-after"]) : undefined
    return failure(code, provider, redact(cause.message, apiKey), wait)
  }
  if (isTimeout(cause)) return failure("timeout", provider)
  if (isNetwork(cause)) return failure("network", provider)
  if (isRecord(cause) && !(cause instanceof Error)) {
    const { code, text } = streamFailure(cause)
    return failure(code, provider, redact(text, apiKey), code === "rate_limit" ? rateLimitWait(JSON.stringify(cause)) : undefined)
  }
  return failure("unknown", provider)
}

export function isFormatFailure(error: unknown): error is NoObjectGeneratedError {
  return NoObjectGeneratedError.isInstance(error) && error.finishReason !== "length" && error.finishReason !== "content-filter" && error.finishReason !== "error"
}

function isRefusal(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter"
}

function isLength(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) && error.finishReason === "length"
}

function isInterruption(error: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(error)) return error.finishReason === "length" || error.finishReason === "error" || error.finishReason === "unknown"
  return true
}

export function stopped(finishReason: "content-filter" | "error" | "unknown", source?: unknown): NoObjectGeneratedError {
  const known = NoObjectGeneratedError.isInstance(source) ? source : undefined
  return new NoObjectGeneratedError({
    cause: source instanceof Error ? source : undefined,
    text: known?.text ?? "",
    response: known?.response ?? { id: "", timestamp: new Date(), modelId: "" },
    usage: known?.usage ?? { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
    finishReason,
  })
}

export function unfinished(): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(stopped("unknown")), 0))
}

async function settle(object: PromiseLike<RiFlow>, watch: StreamWatch, signal: AbortSignal): Promise<RiFlow> {
  let ri: RiFlow
  try {
    ri = await Promise.race([object, unfinished()])
  } catch (error) {
    if (signal.aborted) throw error
    if (watch.refusal) throw stopped("content-filter", error)
    if (watch.failed) throw stopped("error", error)
    throw error
  }
  if (watch.refusal) throw stopped("content-filter")
  if (watch.failed) throw stopped("error")
  return ri
}

export function relax(setup: ModelSetup, error: unknown): boolean {
  const cause = unwrap(error)
  if (!APICallError.isInstance(cause) || cause.statusCode !== 400) return false
  const text = `${cause.message} ${(cause.responseBody ?? "").slice(0, 2000)}`
  if (setup.maxOutputTokens !== undefined && TOKENS_MESSAGE.test(text)) {
    setup.maxOutputTokens = undefined
    return true
  }
  if (setup.effortKey && EFFORT_MESSAGE.test(text)) {
    for (const options of Object.values(setup.providerOptions)) if (isRecord(options)) delete options[setup.effortKey]
    setup.effortKey = undefined
    return true
  }
  return false
}

function addUsage(total: GenerationUsage, usage: LanguageModelUsage | undefined) {
  if (!usage) return
  total.inputTokens += usage.inputTokens ?? 0
  total.outputTokens += usage.outputTokens ?? 0
  total.totalTokens += usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

function section(title: string, body: string, note?: string): string {
  return [`## ${title}`, "", "````text", body, "````", ...(note ? ["", note] : [])].join("\n")
}

function isComponent(type: string | undefined): boolean {
  return type !== undefined && type !== START_TYPE && type !== NOTE_TYPE
}

export function completePart(partial: unknown): RiFlow | null {
  if (!isRecord(partial)) return null
  const ri = coerceRi(partial)
  if (!ri) return null
  const keys = Object.keys(partial)
  const open = keys[keys.length - 1]
  const nodes = (open === "nodes" ? ri.nodes.slice(0, -1) : ri.nodes).filter((node) => node.id.trim() !== "" && canonicalType(node.type) !== undefined)
  const ids = new Set(nodes.map((node) => node.id.trim()))
  const edges = (open === "edges" ? ri.edges.slice(0, -1) : ri.edges).filter((edge) => edge.from.trim() !== "" && ids.has(edge.to.trim()))
  return { name: ri.name, description: ri.description, nodes, edges }
}

export function salvageRi(partial: unknown): RiFlow | null {
  const ri = completePart(partial)
  return ri && ri.nodes.some((node) => isComponent(canonicalType(node.type))) ? ri : null
}

export function completeDelta(partial: unknown): RiDelta | null {
  if (!isRecord(partial)) return null
  const open = Object.keys(partial).at(-1)
  const list = open === undefined ? undefined : partial[open]
  const delta = coerceDelta(open !== undefined && Array.isArray(list) ? { ...partial, [open]: list.slice(0, -1) } : partial)
  if (!delta) return null
  return {
    ...delta,
    nodes: delta.nodes.filter((node) => node.id.trim() !== "" && canonicalType(node.type) !== undefined),
    edges: delta.edges.filter((edge) => edge.from.trim() !== "" && edge.to.trim() !== ""),
  }
}

const edgeKey = (edge: RiEdge) => `${edge.from.trim()}\u0000${edge.output.trim()}`

export function overlayRi(base: RiFlow | null, ri: RiFlow): RiFlow {
  if (!base) return ri
  const fresh = new Map(ri.nodes.map((node) => [node.id, node]))
  const known = new Set(base.nodes.map((node) => node.id))
  const taken = new Set(ri.edges.map(edgeKey))
  return {
    name: ri.name || base.name,
    description: ri.description || base.description,
    nodes: [...base.nodes.map((node) => fresh.get(node.id) ?? node), ...ri.nodes.filter((node) => !known.has(node.id))],
    edges: [...ri.edges, ...base.edges.filter((edge) => !taken.has(edgeKey(edge)))],
  }
}

function resumePrompt(length: boolean): string {
  return [
    "# Resposta interrompida",
    "A resposta anterior foi interrompida antes do fim. A RI acima traz só os componentes e as conexões que chegaram completos.",
    "Devolva a RI completa do fluxo pedido, com todos os componentes e todas as conexões. Mantenha os ids e o conteúdo do que já estava pronto e complete o que faltou.",
    ...(length ? ["A resposta passou do limite de tamanho de saída. Use textos objetivos e não repita chaves de config com o valor padrão."] : []),
  ].join("\n")
}

function withNotice(issues: GenerationIssue[]): GenerationIssue[] {
  const notice: GenerationIssue = { severity: "warning", scope: "ia", message: INTERRUPTED_NOTICE }
  const index = issues.findIndex((issue) => issue.severity !== "error")
  return index < 0 ? [...issues, notice] : [...issues.slice(0, index), notice, ...issues.slice(index)]
}

async function callModel(setup: ModelSetup, messages: ModelMessage[], signal: AbortSignal, onUpdate: (partial: unknown) => void, format: RiFormat): Promise<Attempt> {
  setup.watch.refusal = false
  setup.watch.failed = false
  let partial: unknown
  try {
    const result = streamObject({
      model: setup.model,
      schema: format.schema,
      schemaName: format.name,
      schemaDescription: format.description,
      messages,
      allowSystemInMessages: true,
      providerOptions: setup.providerOptions,
      ...(setup.maxOutputTokens !== undefined ? { maxOutputTokens: setup.maxOutputTokens } : {}),
      abortSignal: signal,
      experimental_repairText: async ({ text }) => format.repair(text),
      onError: () => undefined,
    })
    const follow = async () => {
      for await (const value of result.partialObjectStream) {
        partial = value
        onUpdate(value)
      }
    }
    await follow().catch(() => undefined)
    try {
      const ri = await settle(result.object, setup.watch, signal)
      const usage = await Promise.resolve(result.usage).catch(() => undefined)
      return { ri, partial, usage }
    } catch (error) {
      return { error, partial, usage: NoObjectGeneratedError.isInstance(error) ? error.usage : undefined }
    }
  } catch (error) {
    return { error, partial }
  }
}

export function notify<T>(listener: ((value: T) => void) | undefined, value: T): void {
  if (!listener) return
  try {
    listener(value)
  } catch {
    return
  }
}

function salvageDelta(partial: unknown): RiDelta | null {
  const delta = completeDelta(partial)
  return delta && (delta.nodes.length > 0 || delta.edges.length > 0 || delta.remove.length > 0) ? delta : null
}

async function generateEdit(input: ResolvedInput, original: AtendimentoFlow, hooks: RunHooks, abort: Abort): Promise<GenerateSuccess> {
  const setup = createSetup(input, hooks)
  const signal = abort.deadline ? AbortSignal.any([abort.client, abort.deadline]) : abort.client
  const deadline = hooks.deadlineMs !== undefined ? Date.now() + hooks.deadlineMs : Number.POSITIVE_INFINITY
  const progress = (value: GenerationProgress) => notify(hooks.onProgress, value)
  const show = (ri: RiFlow) => notify(hooks.onPartial, ri)
  const now = new Date()
  const fill = { fill: input.fill }
  const system = editSystemPrompt(fill)
  const request = editRequestPrompt(original, input.prompt, input.image !== null)
  const messages: ModelMessage[] = [
    { role: "system", content: system, ...(setup.systemOptions ? { providerOptions: setup.systemOptions } : {}) },
    { role: "user", content: input.image ? [{ type: "text", text: request }, { type: "image", image: input.image.data, mediaType: input.image.mediaType }] : request },
  ]
  const transcript = [
    section("Sistema", system),
    section("Pedido", request, input.image ? `[Imagem anexada: ${input.image.mediaType}, ${formatBytes(input.image.bytes)}]` : undefined),
  ]
  const usage: GenerationUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const salvaged = new WeakSet<EditRound>()
  const initial: EditResult = { flow: original, notes: [], changes: { added: 0, changed: 0, removed: 0 }, ids: new Map(), detached: { nodes: [], edges: [] } }
  let state = initial
  const apply = (delta: RiDelta, prune = true) => applyEdit(state.flow, delta, { now, ids: state.ids, detached: state.detached, prune })
  const evaluate = (delta: RiDelta, round: number): EditRound => {
    progress({ stage: "montando", round, maxRounds: MAX_ROUNDS })
    const applied = apply(delta)
    const present = new Set(applied.flow.nodes.map((node) => node.id))
    const carried = state.notes.filter((note) => note.scope === "ajuste" && (!note.nodeId || present.has(note.nodeId)))
    const result: EditResult = { ...applied, notes: [...carried, ...applied.notes] }
    const review = reviewEdit(original, result, { ...fill, prompt: input.prompt })
    progress({ stage: "validando", round, maxRounds: MAX_ROUNDS })
    return { ...review, delta, result }
  }
  const relay = (piece: RiDelta) => {
    if (state === initial) {
      show(piece)
      return
    }
    try {
      const applied = apply(piece, false)
      show(deltaBetween(original, applied.flow, applied.ids))
    } catch {
      return
    }
  }
  const timeLeft = () => !abort.deadline?.aborted && deadline - Date.now() >= ROUND_RESERVE_MS
  let best: EditRound | null = null
  let rounds = 0
  let relaxed = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round
    progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, nodes: 0, edges: 0 })
    let shown = ""
    let last = 0
    let relayed = ""
    const attempt = await callModel(setup, messages, signal, (partial) => {
      const counts = countRi(partial)
      const key = `${counts.nodes}:${counts.edges}`
      if (key !== shown && Date.now() - last >= PARTIAL_INTERVAL_MS) {
        shown = key
        last = Date.now()
        progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, ...counts })
      }
      if (!hooks.onPartial) return
      const piece = completeDelta(partial)
      if (!piece) return
      const signature = `${piece.nodes.length}:${piece.edges.length}:${piece.remove.length}:${piece.name}:${piece.description}`
      if (signature === relayed) return
      relayed = signature
      relay(piece)
    }, EDIT_FORMAT)
    addUsage(usage, attempt.usage)
    if (attempt.ri) {
      const delta = coerceDelta(attempt.ri) ?? { ...attempt.ri, remove: [] }
      progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, nodes: delta.nodes.length, edges: delta.edges.length })
      const evaluation = evaluate(delta, round)
      state = evaluation.result
      if (hooks.onPartial) show(deltaBetween(original, state.flow, state.ids))
      best = pickEdit(best, evaluation)
      if (!needsEditCorrection(evaluation) || round === MAX_ROUNDS || !timeLeft()) break
      const correction = editCorrectionPrompt(evaluation.pending, editSnapshot(original, state), fill)
      messages.push({ role: "assistant", content: JSON.stringify(delta) }, { role: "user", content: correction })
      transcript.push(section(`Correção ${round}`, correction))
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: evaluation.issues.filter((issue) => issue.scope === "ia").length + (evaluation.unchanged ? 1 : 0) })
      continue
    }
    const { error } = attempt
    if (abort.client.aborted) throw error
    if (relaxed < RELAX_LIMIT && !abort.deadline?.aborted && relax(setup, error)) {
      relaxed++
      round--
      continue
    }
    if (isRefusal(error)) {
      if (best) break
      throw error
    }
    const piece = isInterruption(error) ? salvageDelta(attempt.partial) : null
    if (piece) {
      const evaluation = evaluate(piece, round)
      state = evaluation.result
      salvaged.add(evaluation)
      best = pickEdit(best, evaluation)
      if (round === MAX_ROUNDS || !timeLeft()) break
      const resume = editResumePrompt(isLength(error), editSnapshot(original, state))
      messages.push({ role: "assistant", content: JSON.stringify(piece) }, { role: "user", content: resume })
      transcript.push(section(`Retomada ${round}`, resume))
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, resumed: true })
      continue
    }
    if (isFormatFailure(error) && round < MAX_ROUNDS && timeLeft()) {
      const correction = formatFailurePrompt(error)
      messages.push({ role: "assistant", content: (error.text ?? "").slice(0, REPLY_LIMIT) || "{}" }, { role: "user", content: correction })
      transcript.push(section(`Correção ${round}`, correction))
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: 1 })
      continue
    }
    if (best) break
    throw error
  }
  if (!best) throw new Error("Nenhuma rodada produziu uma edição.")
  if (best.unchanged) throw new EmptyEditError()
  const chosen = input.name && input.name !== best.result.flow.name ? { ...best.result, flow: { ...best.result.flow, name: input.name } } : best.result
  const finished = concludeEdit(original, chosen, fill)
  const review = reviewEdit(original, finished, { ...fill, prompt: input.prompt })
  const partial = salvaged.has(best)
  return {
    success: true,
    workflow: finished.flow,
    issues: partial ? withNotice(review.issues) : review.issues,
    rounds,
    ...(usage.totalTokens > 0 || usage.inputTokens > 0 || usage.outputTokens > 0 ? { usage } : {}),
    transcript: transcript.join("\n\n").split(input.apiKey).join(MASK),
    model: { provider: input.provider, id: input.model },
    ...(partial ? { partial: true } : {}),
    mode: "edit",
    changes: review.changes,
  }
}

async function generate(input: ResolvedInput, hooks: RunHooks, abort: Abort): Promise<GenerateSuccess> {
  if (input.mode === "edit" && input.base) return generateEdit(input, input.base, hooks, abort)
  const setup = createSetup(input, hooks)
  const signal = abort.deadline ? AbortSignal.any([abort.client, abort.deadline]) : abort.client
  const deadline = hooks.deadlineMs !== undefined ? Date.now() + hooks.deadlineMs : Number.POSITIVE_INFINITY
  const progress = (value: GenerationProgress) => notify(hooks.onProgress, value)
  const show = (ri: RiFlow) => notify(hooks.onPartial, ri)
  const fill = { fill: input.fill }
  const system = systemPrompt(fill)
  const request = requestPrompt({ prompt: input.prompt, size: input.size, count: input.count, name: input.name, hasImage: input.image !== null })
  const messages: ModelMessage[] = [
    { role: "system", content: system, ...(setup.systemOptions ? { providerOptions: setup.systemOptions } : {}) },
    { role: "user", content: input.image ? [{ type: "text", text: request }, { type: "image", image: input.image.data, mediaType: input.image.mediaType }] : request },
  ]
  const transcript = [
    section("Sistema", system),
    section("Pedido", request, input.image ? `[Imagem anexada: ${input.image.mediaType}, ${formatBytes(input.image.bytes)}]` : undefined),
  ]
  const usage: GenerationUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const salvaged = new WeakSet<RoundEvaluation>()
  const evaluate = (ri: RiFlow, round: number) => {
    progress({ stage: "montando", round, maxRounds: MAX_ROUNDS })
    const evaluation = evaluateRi(ri, { name: input.name, prompt: input.prompt, ...fill })
    progress({ stage: "validando", round, maxRounds: MAX_ROUNDS })
    return evaluation
  }
  const timeLeft = () => !abort.deadline?.aborted && deadline - Date.now() >= ROUND_RESERVE_MS
  let best: RoundEvaluation | null = null
  let base: RiFlow | null = null
  let rounds = 0
  let relaxed = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round
    progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, nodes: 0, edges: 0 })
    let shown = ""
    let last = 0
    const layer = base
    const attempt = await callModel(setup, messages, signal, (partial) => {
      const counts = countRi(partial)
      const key = `${counts.nodes}:${counts.edges}`
      if (key !== shown && Date.now() - last >= PARTIAL_INTERVAL_MS) {
        shown = key
        last = Date.now()
        progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, ...counts })
      }
      if (!hooks.onPartial) return
      const ri = layer ? completePart(partial) : coerceRi(partial)
      if (ri) show(overlayRi(layer, ri))
    }, CREATE_FORMAT)
    addUsage(usage, attempt.usage)
    if (attempt.ri) {
      const ri = attempt.ri
      progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, nodes: ri.nodes.length, edges: ri.edges.length })
      show(ri)
      const evaluation = evaluate(ri, round)
      best = pickBetter(best, evaluation)
      if (!needsCorrection(evaluation) || round === MAX_ROUNDS || !timeLeft()) break
      const correction = correctionPrompt(evaluation.pending, fill)
      messages.push({ role: "assistant", content: JSON.stringify(ri) }, { role: "user", content: correction })
      transcript.push(section(`Correção ${round}`, correction))
      base = ri
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: evaluation.issues.filter((issue) => issue.scope === "ia").length })
      continue
    }
    const { error } = attempt
    if (abort.client.aborted) throw error
    if (relaxed < RELAX_LIMIT && !abort.deadline?.aborted && relax(setup, error)) {
      relaxed++
      round--
      continue
    }
    if (isRefusal(error)) {
      if (best) break
      throw error
    }
    const piece = isInterruption(error) ? salvageRi(attempt.partial) : null
    if (piece) {
      const evaluation = evaluate(piece, round)
      salvaged.add(evaluation)
      best = pickBetter(best, evaluation)
      if (round === MAX_ROUNDS || !timeLeft()) break
      const resume = resumePrompt(isLength(error))
      messages.push({ role: "assistant", content: JSON.stringify(piece) }, { role: "user", content: resume })
      transcript.push(section(`Retomada ${round}`, resume))
      base = piece
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, resumed: true })
      continue
    }
    if (isFormatFailure(error) && round < MAX_ROUNDS && timeLeft()) {
      const correction = formatFailurePrompt(error)
      messages.push({ role: "assistant", content: (error.text ?? "").slice(0, REPLY_LIMIT) || "{}" }, { role: "user", content: correction })
      transcript.push(section(`Correção ${round}`, correction))
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: 1 })
      continue
    }
    if (best) break
    throw error
  }
  if (!best) throw new Error("Nenhuma rodada produziu um fluxo.")
  if (!best.assembled.flow.nodes.some((node) => node.id !== START_ID && node.data.type !== NOTE_TYPE)) throw new EmptyFlowError()
  const partial = salvaged.has(best)
  const { workflow, issues } = concludeGeneration(best)
  return {
    success: true,
    workflow: stampExport(workflow),
    issues: partial ? withNotice(issues) : issues,
    rounds,
    ...(usage.totalTokens > 0 || usage.inputTokens > 0 || usage.outputTokens > 0 ? { usage } : {}),
    transcript: transcript.join("\n\n").split(input.apiKey).join(MASK),
    model: { provider: input.provider, id: input.model },
    ...(partial ? { partial: true } : {}),
  }
}

const UNKNOWN_FAILURE: GenerateFailure = { success: false, code: "unknown", error: "Não foi possível gerar o fluxo.", details: "Tente novamente." }

export async function runGeneration(input: GenerationInput, hooks: RunHooks): Promise<GenerateResponse> {
  let checked: RequestCheck
  try {
    checked = parseGenerationRequest(input)
  } catch {
    return { success: false, code: "invalid_request", error: READ_ERROR }
  }
  if (!checked.ok) return checked.failure
  const resolved = checked.request.input
  const limit = hooks.deadlineMs !== undefined ? new AbortController() : undefined
  const timer = limit ? setTimeout(() => limit.abort(new DOMException("Prazo esgotado.", "TimeoutError")), Math.max(0, hooks.deadlineMs ?? 0)) : undefined
  const abort: Abort = { client: hooks.signal, deadline: limit?.signal }
  try {
    if (abort.client.aborted) return failure("aborted", resolved.provider)
    notify(hooks.onProgress, { stage: "preparando", round: 1, maxRounds: MAX_ROUNDS })
    return await generate(resolved, hooks, abort)
  } catch (error) {
    try {
      return describeFailure(error, resolved.provider, resolved.apiKey, abort)
    } catch {
      return { ...UNKNOWN_FAILURE }
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
