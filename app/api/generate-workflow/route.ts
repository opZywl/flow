import { APICallError, NoObjectGeneratedError, RetryError, streamObject } from "ai"
import type { LanguageModel, LanguageModelUsage, ModelMessage, SystemModelMessage } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"
import { stampExport } from "@/lib/atendimento/format"
import { assembleFlow } from "@/lib/atendimento/ai/assemble"
import { COUNT_LIMITS, GENERATION_SIZES, LIMITS, MAX_ROUNDS } from "@/lib/atendimento/ai/contracts"
import type { FailureCode, GenerateEvent, GenerateFailure, GenerateResponse, GenerateSuccess, GenerationProgress, GenerationSize, GenerationUsage, RequestField } from "@/lib/atendimento/ai/contracts"
import { correctionPrompt, formatFailurePrompt, requestPrompt, systemPrompt } from "@/lib/atendimento/ai/prompt"
import { findPreset, getProvider, isProviderId, rateLimitDetails, rateLimitWait } from "@/lib/atendimento/ai/providers"
import type { ProviderId } from "@/lib/atendimento/ai/providers"
import { concludeGeneration, correctionItems, needsCorrection, pickBetter, reviewFlow, scoreOf } from "@/lib/atendimento/ai/review"
import type { RoundEvaluation } from "@/lib/atendimento/ai/review"
import { RI_PROVIDER_OPTIONS, RI_SCHEMA_DESCRIPTION, RI_SCHEMA_NAME, countRi, repairRiText, riSchema } from "@/lib/atendimento/ai/ri"
import type { RiFlow } from "@/lib/atendimento/ai/ri"

globalThis.AI_SDK_LOG_WARNINGS = false

export const runtime = "nodejs"
export const maxDuration = 300

type ImageType = "image/png" | "image/jpeg"
type ProviderOptions = NonNullable<SystemModelMessage["providerOptions"]>

interface ImageInput {
  mediaType: ImageType
  data: Uint8Array
  bytes: number
}

interface GenerationInput {
  provider: ProviderId
  model: string
  apiKey: string
  prompt: string
  image: ImageInput | null
  size: GenerationSize
  count?: number
  name?: string
  stream: boolean
}

interface Rejection {
  status: number
  failure: GenerateFailure
}

interface ModelSetup {
  model: LanguageModel
  providerOptions: ProviderOptions
  systemOptions?: ProviderOptions
}

interface Counts {
  nodes: number
  edges: number
}

interface Abort {
  client: AbortSignal
  deadline: AbortSignal
}

type Progress = (progress: GenerationProgress) => void

const DEADLINE_MS = 270_000
const ROUND_RESERVE_MS = 75_000
const HEARTBEAT_MS = 10_000
const PARTIAL_INTERVAL_MS = 250
const REPLY_LIMIT = 20_000
const DETAIL_LIMIT = 300
const KEY_MIN = 8
const READ_ERROR = "Não foi possível ler a solicitação."
const IMAGE_ERROR = "Imagem inválida. Envie PNG ou JPG de até 5 MB."
const SIZES: readonly string[] = GENERATION_SIZES
const KEY_CHARS = /^[\x21-\x7E]+$/
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/
const SIGNATURES: Record<ImageType, number[]> = { "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/jpeg": [0xff, 0xd8, 0xff] }
const TEXT_ONLY: Partial<Record<ProviderId, RegExp>> = { openai: /^(o1-mini|o1-preview|o3-mini|gpt-3\.5|gpt-4(-0314|-0613)?$)/ }
const KEY_MESSAGE = /api[ _-]?key|x-api-key|unauthori[sz]ed|authenticat|API_KEY_INVALID|invalid[ _-]?key|incorrect[ _-]?key/i
const BILLING_MESSAGE = /insufficient_quota|credit balance|spending limit|out of credits|payment required/i
const MODEL_MESSAGE = /model_not_found|not_found_error|\bmodel\b[^.\n]{0,80}\b(not found|does not exist|not exist)/i
const RATE_MESSAGE = /rate[ _-]?limit|too many requests|resource_exhausted|exceeded your current quota/i
const BUSY_MESSAGE = /overloaded|server_error|api_error|internal|unavailable/i
const NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_CLOSED"])
const TIMEOUT_CODES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])
const MASK = "[chave oculta]"
const SECRET_PATTERNS = [/sk-ant-[\w-]+/g, /sk-[\w-]{6,}/g, /AIza[\w-]{20,}/g, /xai-[\w-]{10,}/g]

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
  invalid_output: 422,
  output_too_long: 422,
  content_filter: 422,
  aborted: 499,
  unknown: 500,
}

const BASE_URLS: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
}

const FACTORIES: Record<ProviderId, (model: string, apiKey: string) => ModelSetup> = {
  openai: (model, apiKey) => ({
    model: createOpenAI({ apiKey, baseURL: BASE_URLS.openai }).responses(model),
    providerOptions: { ...RI_PROVIDER_OPTIONS.openai },
  }),
  anthropic: (model, apiKey) => ({
    model: createAnthropic({ apiKey, baseURL: BASE_URLS.anthropic })(model),
    providerOptions: { ...RI_PROVIDER_OPTIONS.anthropic },
    systemOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  }),
  google: (model, apiKey) => ({
    model: createGoogleGenerativeAI({ apiKey, baseURL: BASE_URLS.google })(model),
    providerOptions: { ...RI_PROVIDER_OPTIONS.google },
  }),
  xai: (model, apiKey) => ({
    model: createXai({ apiKey, baseURL: BASE_URLS.xai }).responses(model),
    providerOptions: { ...RI_PROVIDER_OPTIONS.xai },
  }),
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function headers(type: string): Record<string, string> {
  return { "Content-Type": type, "Cache-Control": "no-store" }
}

function json(body: GenerateResponse, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: headers("application/json; charset=utf-8") })
}

function reject(code: FailureCode, error: string, field?: RequestField): Rejection {
  return { status: STATUS[code], failure: { success: false, code, error, ...(field ? { field } : {}) } }
}

async function readBody(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!req.body) return ""
  const reader = req.body.getReader()
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

function decodeImage(value: unknown): ImageInput | null {
  if (typeof value !== "string") return null
  const match = IMAGE_DATA_URL.exec(value)
  if (!match || match[2].length % 4 !== 0) return null
  const mediaType = match[1] as ImageType
  const encoded = match[2]
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0
  if ((encoded.length / 4) * 3 - padding > LIMITS.imageBytes) return null
  const data = new Uint8Array(Buffer.from(encoded, "base64"))
  const signature = SIGNATURES[mediaType]
  if (data.byteLength <= signature.length || !signature.every((byte, index) => data[index] === byte)) return null
  return { mediaType, data, bytes: data.byteLength }
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

async function parseRequest(req: Request): Promise<GenerationInput | Rejection> {
  if (!/^application\/json(\s*;|\s*$)/i.test((req.headers.get("content-type") ?? "").trim())) return reject("unsupported_media", "Envie a solicitação em JSON.")
  let text: string | null
  try {
    text = await readBody(req, LIMITS.bodyBytes)
  } catch {
    return reject("invalid_request", READ_ERROR)
  }
  if (text === null) return reject("payload_too_large", "A solicitação é grande demais.")
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return reject("invalid_request", READ_ERROR)
  }
  if (!isRecord(body)) return reject("invalid_request", READ_ERROR)

  const { provider } = body
  if (!isProviderId(provider)) return reject("invalid_request", "Escolha um provedor de IA suportado.", "provider")
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  if (apiKey.length < KEY_MIN) return reject("invalid_request", "Informe a chave da API.", "apiKey")
  if (apiKey.length > LIMITS.apiKey) return reject("invalid_request", "A chave da API é longa demais.", "apiKey")
  if (!KEY_CHARS.test(apiKey)) return reject("invalid_request", "A chave da API tem caracteres inválidos.", "apiKey")
  const model = typeof body.model === "string" ? body.model.trim() : ""
  if (model.length > LIMITS.model || !MODEL_ID.test(model) || model.includes("..")) return reject("invalid_request", "Escolha um modelo válido.", "model")

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (prompt.length > LIMITS.prompt) return reject("invalid_request", `A descrição pode ter até ${LIMITS.prompt.toLocaleString("pt-BR")} caracteres.`, "prompt")
  const hasImage = body.image !== undefined && body.image !== null && body.image !== ""
  const image = hasImage ? decodeImage(body.image) : null
  if (hasImage && !image) return reject("invalid_request", IMAGE_ERROR, "image")
  if (!prompt && !image) return reject("invalid_request", "Descreva o atendimento ou envie uma imagem de referência.", "prompt")
  if (image && !acceptsImages(provider, model)) return reject("invalid_request", `O modelo ${findPreset(provider, model)?.name ?? model} não analisa imagens. Escolha outro modelo ou remova a imagem.`, "model")

  const size = body.size === undefined ? "auto" : body.size
  if (typeof size !== "string" || !SIZES.includes(size)) return reject("invalid_request", "Tamanho do fluxo inválido.", "size")
  let count: number | undefined
  if (size === "custom") {
    const value = readCount(body.count)
    if (value === null) return reject("invalid_request", `Informe de ${COUNT_LIMITS.min} a ${COUNT_LIMITS.max} componentes.`, "count")
    count = value
  }
  if (body.name !== undefined && body.name !== null && typeof body.name !== "string") return reject("invalid_request", `O nome do fluxo pode ter até ${LIMITS.name} caracteres.`, "name")
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (name.length > LIMITS.name) return reject("invalid_request", `O nome do fluxo pode ter até ${LIMITS.name} caracteres.`, "name")

  return { provider, model, apiKey, prompt, image, size: size as GenerationSize, count, name: name || undefined, stream: body.stream === true }
}

function redact(text: string, apiKey: string): string {
  let clean = text.replace(/Bearer\s+\S+/gi, MASK).split(apiKey).join(MASK)
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
  return error instanceof TypeError && /fetch failed|failed to fetch|network/i.test(error.message)
}

function classify(status: number | undefined, text: string): FailureCode {
  if (status === undefined) return "network"
  if (status === 429 && !/insufficient_quota/i.test(text)) return "rate_limit"
  if (status >= 400 && status < 500 && (status === 402 || BILLING_MESSAGE.test(text))) return "billing"
  if (status === 401) return "invalid_key"
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

function describeFailure(error: unknown, input: GenerationInput, abort: Abort): GenerateFailure {
  if (abort.client.aborted) return failure("aborted", input.provider)
  if (abort.deadline.aborted) return failure("timeout", input.provider)
  const cause = unwrap(error)
  if (NoObjectGeneratedError.isInstance(cause)) {
    if (cause.finishReason === "length") return failure("output_too_long", input.provider)
    if (cause.finishReason === "content-filter") return failure("content_filter", input.provider)
    return failure("invalid_output", input.provider)
  }
  if (APICallError.isInstance(cause)) {
    const text = `${cause.message} ${(cause.responseBody ?? "").slice(0, 2000)}`
    const code = cause.statusCode === undefined && isTimeout(cause.cause) ? "timeout" : classify(cause.statusCode, text)
    const wait = code === "rate_limit" ? rateLimitWait(text, cause.responseHeaders?.["retry-after"]) : undefined
    return failure(code, input.provider, redact(cause.message, input.apiKey), wait)
  }
  if (isTimeout(cause)) return failure("timeout", input.provider)
  if (isNetwork(cause)) return failure("network", input.provider)
  if (isRecord(cause) && !(cause instanceof Error)) {
    const { code, text } = streamFailure(cause)
    return failure(code, input.provider, redact(text, input.apiKey), code === "rate_limit" ? rateLimitWait(JSON.stringify(cause)) : undefined)
  }
  return failure("unknown", input.provider)
}

function isFormatFailure(error: unknown): error is NoObjectGeneratedError {
  return NoObjectGeneratedError.isInstance(error) && error.finishReason !== "length" && error.finishReason !== "content-filter"
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

async function callModel(setup: ModelSetup, messages: ModelMessage[], signal: AbortSignal, onPartial: (counts: Counts) => void): Promise<{ ri: RiFlow; usage: LanguageModelUsage }> {
  const result = streamObject({
    model: setup.model,
    schema: riSchema,
    schemaName: RI_SCHEMA_NAME,
    schemaDescription: RI_SCHEMA_DESCRIPTION,
    messages,
    allowSystemInMessages: true,
    providerOptions: setup.providerOptions,
    abortSignal: signal,
    experimental_repairText: async ({ text }) => repairRiText(text),
    onError: () => undefined,
  })
  let shown = ""
  let last = 0
  const follow = async () => {
    for await (const partial of result.partialObjectStream) {
      const counts = countRi(partial)
      const key = `${counts.nodes}:${counts.edges}`
      if (key !== shown && Date.now() - last >= PARTIAL_INTERVAL_MS) {
        shown = key
        last = Date.now()
        onPartial(counts)
      }
    }
  }
  await follow().catch(() => undefined)
  const ri = await result.object
  onPartial({ nodes: ri.nodes.length, edges: ri.edges.length })
  return { ri, usage: await result.usage }
}

async function runGeneration(input: GenerationInput, abort: Abort, progress: Progress): Promise<GenerateSuccess> {
  const setup = FACTORIES[input.provider](input.model, input.apiKey)
  const signal = AbortSignal.any([abort.client, abort.deadline])
  const deadline = Date.now() + DEADLINE_MS
  const system = systemPrompt()
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
  let best: RoundEvaluation | null = null
  let rounds = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round
    progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, nodes: 0, edges: 0 })
    let ri: RiFlow
    try {
      const outcome = await callModel(setup, messages, signal, (counts) => progress({ stage: "gerando", round, maxRounds: MAX_ROUNDS, ...counts }))
      addUsage(usage, outcome.usage)
      ri = outcome.ri
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) addUsage(usage, error.usage)
      if (abort.client.aborted) throw error
      const retry = isFormatFailure(error) && round < MAX_ROUNDS && !abort.deadline.aborted && deadline - Date.now() >= ROUND_RESERVE_MS
      if (!retry) {
        if (best) break
        throw error
      }
      const correction = formatFailurePrompt(error)
      messages.push({ role: "assistant", content: (error.text ?? "").slice(0, REPLY_LIMIT) || "{}" }, { role: "user", content: correction })
      transcript.push(section(`Correção ${round}`, correction))
      progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: 1 })
      continue
    }
    progress({ stage: "montando", round, maxRounds: MAX_ROUNDS })
    const assembled = assembleFlow(ri, { name: input.name, prompt: input.prompt })
    progress({ stage: "validando", round, maxRounds: MAX_ROUNDS })
    const issues = reviewFlow(assembled)
    const evaluation: RoundEvaluation = { ri, assembled, issues, pending: correctionItems(assembled, issues), score: scoreOf(issues) }
    best = pickBetter(best, evaluation)
    if (!needsCorrection(evaluation) || round === MAX_ROUNDS || deadline - Date.now() < ROUND_RESERVE_MS) break
    const correction = correctionPrompt(evaluation.pending)
    messages.push({ role: "assistant", content: JSON.stringify(ri) }, { role: "user", content: correction })
    transcript.push(section(`Correção ${round}`, correction))
    progress({ stage: "corrigindo", round: round + 1, maxRounds: MAX_ROUNDS, pending: issues.filter((issue) => issue.scope === "ia").length })
  }
  if (!best) throw new Error("Nenhuma rodada produziu um fluxo.")
  const { workflow, issues } = concludeGeneration(best)
  return {
    success: true,
    workflow: stampExport(workflow),
    issues,
    rounds,
    ...(usage.totalTokens > 0 || usage.inputTokens > 0 || usage.outputTokens > 0 ? { usage } : {}),
    transcript: transcript.join("\n\n").split(input.apiKey).join(MASK),
    model: { provider: input.provider, id: input.model },
  }
}

async function execute(input: GenerationInput, client: AbortSignal, progress: Progress): Promise<{ body: GenerateResponse; status: number }> {
  const abort: Abort = { client, deadline: AbortSignal.timeout(DEADLINE_MS) }
  try {
    progress({ stage: "preparando", round: 1, maxRounds: MAX_ROUNDS })
    const body = await runGeneration(input, abort, progress)
    return { body, status: 200 }
  } catch (error) {
    const body = describeFailure(error, input, abort)
    return { body, status: STATUS[body.code] }
  }
}

function stream(input: GenerationInput, req: Request): Response {
  const encoder = new TextEncoder()
  const cancel = new AbortController()
  const client = AbortSignal.any([req.signal, cancel.signal])
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      let last: GenerationProgress | null = null
      const write = (event: GenerateEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      heartbeat = setInterval(() => {
        if (last) write({ type: "progress", progress: last })
      }, HEARTBEAT_MS)
      void execute(input, client, (progress) => {
        last = progress
        write({ type: "progress", progress })
      }).then(({ body: result }) => {
        write({ type: "result", result })
      }).finally(() => {
        clearInterval(heartbeat)
        open = false
        try {
          controller.close()
        } catch {
          return
        }
      })
    },
    cancel() {
      clearInterval(heartbeat)
      cancel.abort()
    },
  })
  return new Response(body, { status: 200, headers: { ...headers("application/x-ndjson; charset=utf-8"), "X-Accel-Buffering": "no" } })
}

export async function POST(req: Request): Promise<Response> {
  const parsed = await parseRequest(req)
  if ("failure" in parsed) return json(parsed.failure, parsed.status)
  if (parsed.stream) return stream(parsed, req)
  const { body, status } = await execute(parsed, req.signal, () => undefined)
  return json(body, status)
}
