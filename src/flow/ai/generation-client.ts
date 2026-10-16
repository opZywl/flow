import {
  DEFAULT_EFFORT,
  EFFORTS,
  LIMITS,
  MAX_ROUNDS,
  type Effort,
  type GenerateFailure,
  type GenerateRequest,
  type GenerationChanges,
  type GenerationIssue,
  type GenerationMode,
  type GenerationProgress,
  type GenerationStage,
  type GenerationUsage,
  type IssueScope,
  type ModelInfo,
  type ModelsRequest,
  type RequestField,
} from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, defaultEffort, effortsFor, type ProviderId, type ProviderInfo } from "@/lib/atendimento/ai/providers"
import type { InterviewInput, InterviewTurn } from "@/lib/atendimento/ai/interview"
import { START_TYPE, getComponentLabel, getDefinition } from "@/lib/atendimento/catalog"
import { importFlow, isObject } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode, FlowIssue } from "@/lib/atendimento/types"
import type { FlowSelectOption } from "../flow-select"
import type { InterviewTurnResult } from "../ai-interview"

export type Field = "provider" | "apiKey" | "model" | "effort" | "mode" | "description" | "image" | "size" | "count" | "name" | "fill"
export type FieldErrors = Partial<Record<Field, string>>

export type LiveCounts = { nodes: number; edges: number }

export interface Failure {
  title: string
  details?: string
  items: string[]
}

export interface Rejection {
  code: string
  failure: Failure
  field?: Field
}

export interface Received {
  flow: AtendimentoFlow
  issues: GenerationIssue[]
  rounds: number
  usage?: GenerationUsage
  transcript: string
  model: string
  partial: boolean
  mode: GenerationMode
  changes?: GenerationChanges
}

export interface FlowDiff {
  added: string[]
  changed: string[]
  removed: string[]
}

export type Outcome = { ok: true; received: Received } | { ok: false; rejection: Rejection }

export type JobOutcome = { ok: true; received: Received; diff?: FlowDiff } | { ok: false; rejection: Rejection }

export type Listed = { ok: true; models: ModelInfo[] } | { ok: false; error: string; details?: string }

export interface Listing {
  provider: ProviderId
  state: "loading" | "done" | "error"
  count?: number
  error?: string
  details?: string
}

export interface IssueGroup {
  scope: IssueScope
  title: string
  hint: string
  items: GenerationIssue[]
}

export type RunnerModule = typeof import("@/lib/atendimento/ai/runner")
export type PreviewModule = typeof import("@/lib/atendimento/ai/preview")
export type EditModule = typeof import("@/lib/atendimento/ai/edit")

export interface Engine {
  runGeneration: RunnerModule["runGeneration"]
  previewFlow: PreviewModule["previewFlow"]
  previewEdit: PreviewModule["previewEdit"]
  diffFlows: EditModule["diffFlows"]
}

export type InterviewModule = Pick<typeof import("@/lib/atendimento/ai/interview"), "interviewTurn">

export interface PreviewFeed {
  push: (ri: unknown) => void
  stop: () => void
}

export const GENERATE_URL = "/api/generate-workflow"
export const MODELS_URL = "/api/ai-models"

export const REQUEST_FIELDS: Readonly<Record<RequestField, Field>> = {
  provider: "provider",
  apiKey: "apiKey",
  model: "model",
  effort: "effort",
  prompt: "description",
  image: "image",
  size: "size",
  count: "count",
  name: "name",
  mode: "mode",
  base: "mode",
  fill: "fill",
}
export const STAGES: readonly GenerationStage[] = ["preparando", "gerando", "montando", "validando", "corrigindo"]
export const SCOPES: readonly IssueScope[] = ["ia", "plataforma", "ajuste"]
export const KEY_CHARACTERS = /^[\x21-\x7E]+$/
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
export const MIN_KEY_LENGTH = 8

export const PREVIEW_INTERVAL_MS = 250

export const NODE_TEXT_LIMIT = 48

export const EFFORT_OPTIONS: Readonly<Record<Effort, { label: string; hint: string }>> = {
  low: { label: "Rápido", hint: "Responde mais rápido e gasta menos tokens. Bom para fluxos simples." },
  medium: { label: "Equilibrado", hint: "Equilíbrio entre velocidade e qualidade. Atende bem a maioria dos fluxos." },
  high: { label: "Alto", hint: "O modelo raciocina mais antes de responder. Fluxos grandes saem mais completos, mas a geração demora mais." },
  max: { label: "Máximo", hint: "Todo o raciocínio que o modelo oferece. É o mais lento e o que mais gasta tokens." },
}

export const TURN_UNAVAILABLE: GenerateFailure = {
  success: false,
  code: "unknown",
  error: "Não foi possível carregar a conversa com a IA.",
  details: "Recarregue a página e tente de novo.",
}

export const FILL_HINTS = {
  on: "Nomes, IDs e URLs saem sempre preenchidos. Os valores provisórios aparecem em Dados da plataforma para você conferir.",
  off: "Dados cadastrados na plataforma, como nomes, IDs e URLs, ficam em branco para você completar no editor.",
} as const

export const PLATFORM_HINTS = {
  on: "Valores provisórios de nomes, IDs e URLs. Troque cada um pelo valor cadastrado na plataforma.",
  off: "Dados cadastrados na plataforma, como IDs, nomes e URLs, que o pedido não informou. Complete no editor.",
} as const

export const ISSUE_GROUPS: ReadonlyArray<Omit<IssueGroup, "items">> = [
  { scope: "ia", title: "Revise", hint: "Pontos que a IA não resolveu nas rodadas de correção." },
  { scope: "plataforma", title: "Dados da plataforma", hint: PLATFORM_HINTS.off },
  { scope: "ajuste", title: "Ajustes automáticos", hint: "Mudanças feitas na montagem para manter o fluxo válido. Confira cada uma." },
]

export const STATUS_FAILURES: Readonly<Partial<Record<number, Failure>>> = {
  413: { title: "A solicitação é grande demais.", details: "Use uma imagem menor ou reduza a descrição.", items: [] },
  504: {
    title: "O servidor demorou demais para responder.",
    details: "Tente um modelo mais rápido ou um fluxo menor.",
    items: [],
  },
}

export const INTERRUPTED: Outcome = {
  ok: false,
  rejection: {
    code: "network",
    failure: { title: "A conexão foi interrompida antes do fim da geração.", details: "Tente gerar o fluxo novamente.", items: [] },
  },
}

export const text = (value: unknown): string => (typeof value === "string" ? value : "")
export const formatNumber = (value: number) => value.toLocaleString("pt-BR")
export const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`
export const isModelId = (value: string) => MODEL_ID.test(value) && !value.includes("..")
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
export const NO_CHANGES: GenerationChanges = { added: 0, changed: 0, removed: 0 }

export function hasComponents(flow: AtendimentoFlow | null | undefined): flow is AtendimentoFlow {
  return Boolean(flow && Array.isArray(flow.nodes) && flow.nodes.some((node) => node.data.type !== START_TYPE))
}

export function documentKey(flow: AtendimentoFlow): string {
  return JSON.stringify({ ...flow, viewport: null })
}

export function changeLabels(changes: GenerationChanges): [string, string, string] {
  return [
    plural(changes.added, "componente novo", "componentes novos"),
    plural(changes.changed, "alterado", "alterados"),
    plural(changes.removed, "removido", "removidos"),
  ]
}

export function readCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

export function messageLines(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function modelName(info: ProviderInfo, id: string, listed?: readonly ModelInfo[]): string {
  return info.presets.find((preset) => preset.id === id)?.name ?? listed?.find((entry) => entry.id === id)?.name ?? id
}

export function modelVision(info: ProviderInfo, id: string, listed?: readonly ModelInfo[]): boolean | undefined {
  const preset = info.presets.find((entry) => entry.id === id)
  return preset ? preset.vision : listed?.find((entry) => entry.id === id)?.vision
}

export function modelChoices(info: ProviderInfo, model: string, listed?: readonly ModelInfo[]): FlowSelectOption[] {
  const accountModels = listed?.filter((entry) => !info.presets.some((preset) => preset.id === entry.id)) ?? []
  const known = info.presets.some((preset) => preset.id === model) || accountModels.some((entry) => entry.id === model)
  return [
    ...(known || !model ? [] : [{ value: model, label: model }]),
    ...info.presets.map((preset) => ({
      value: preset.id,
      label: `${preset.name} (${listed && !listed.some((entry) => entry.id === preset.id) ? "não encontrado na conta" : preset.note})`,
      group: "Recomendados",
    })),
    ...accountModels.map((entry) => ({
      value: entry.id,
      label: entry.vision === false ? `${entry.name} (sem imagens)` : entry.name,
      group: "Disponíveis na sua conta",
    })),
  ]
}

export function pickEffort(choice: Effort | null, provider: ProviderId, model: string): Effort {
  const allowed = effortsFor(provider, model)
  if (choice && allowed.includes(choice)) return choice
  if (choice) {
    const lower = EFFORTS.slice(0, EFFORTS.indexOf(choice)).reverse().find((entry) => allowed.includes(entry))
    if (lower) return lower
  }
  const fallback = defaultEffort(provider, model)
  return allowed.includes(fallback) ? fallback : allowed[0] ?? DEFAULT_EFFORT
}

export function effortChoices(provider: ProviderId, model: string): FlowSelectOption[] {
  const allowed = effortsFor(provider, model)
  return (allowed.length ? allowed : [DEFAULT_EFFORT]).map((value) => ({ value, label: EFFORT_OPTIONS[value].label }))
}

export function prefixLength(info: ProviderInfo, key: string): number {
  return info.keyPrefix && key.startsWith(info.keyPrefix) ? info.keyPrefix.length : 0
}

export function keyWarning(info: ProviderInfo, value: string): string {
  const key = value.trim()
  if (!key) return ""
  const best = Math.max(...PROVIDERS.map((entry) => prefixLength(entry, key)))
  const owners = best > 0 ? PROVIDERS.filter((entry) => prefixLength(entry, key) === best) : []
  if (owners.length === 1 && owners[0].id !== info.id) return `Esta chave parece ser ${owners[0].of}. Confira o provedor escolhido.`
  if (info.keyPrefix && !key.startsWith(info.keyPrefix)) return `Chaves ${info.of} costumam começar com ${info.keyPrefix}.`
  return ""
}

export function stageText(progress: GenerationProgress | null, editing = false): string {
  if (!progress) return "Enviando a solicitação."
  const round = `rodada ${progress.round} de ${progress.maxRounds}`
  if (progress.stage === "preparando") return editing ? "Preparando a edição." : "Preparando a geração."
  if (progress.stage === "gerando") return editing ? `Editando o fluxo, ${round}.` : `Gerando o fluxo, ${round}.`
  if (progress.stage === "montando") return editing ? "Aplicando as mudanças no fluxo aberto." : "Montando o fluxo no formato de Atendimento."
  if (progress.stage === "validando") return editing ? "Validando os locais e as conexões." : "Validando o fluxo."
  if (progress.resumed) return `Retomando a geração interrompida, ${round}.`
  return progress.pending
    ? `Corrigindo ${plural(progress.pending, "pendência", "pendências")}, ${round}.`
    : `Corrigindo as pendências, ${round}.`
}

export function progressText(progress: GenerationProgress | null, live?: LiveCounts | null, editing = false): string {
  if (editing) return stageText(progress, true)
  if (progress?.stage !== "gerando" || (!live && progress.nodes === undefined && progress.edges === undefined)) return stageText(progress)
  const nodes = plural(live?.nodes ?? progress.nodes ?? 0, "componente", "componentes")
  const edges = plural(live?.edges ?? progress.edges ?? 0, "conexão", "conexões")
  return `Gerando o fluxo, rodada ${progress.round} de ${progress.maxRounds}: ${nodes} e ${edges}.`
}

export function readProgress(value: unknown): GenerationProgress | null {
  if (!isObject(value)) return null
  const stage = STAGES.find((entry) => entry === value.stage)
  if (!stage) return null
  return {
    stage,
    round: readCount(value.round) || 1,
    maxRounds: readCount(value.maxRounds) || MAX_ROUNDS,
    nodes: readCount(value.nodes),
    edges: readCount(value.edges),
    pending: readCount(value.pending),
    ...(value.resumed === true ? { resumed: true } : {}),
  }
}

export function readIssues(value: unknown): GenerationIssue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): GenerationIssue[] => {
    if (!isObject(entry)) return []
    const message = text(entry.message).trim()
    if (!message) return []
    return [
      {
        severity: entry.severity === "error" ? "error" : "warning",
        scope: SCOPES.find((scope) => scope === entry.scope) ?? "ia",
        message,
        nodeId: text(entry.nodeId) || undefined,
        riId: text(entry.riId) || undefined,
        type: text(entry.type) || undefined,
      },
    ]
  })
}

export function readChanges(value: unknown): GenerationChanges | undefined {
  if (!isObject(value)) return undefined
  const added = readCount(value.added)
  const changed = readCount(value.changed)
  const removed = readCount(value.removed)
  if (added === undefined && changed === undefined && removed === undefined) return undefined
  return { added: added ?? 0, changed: changed ?? 0, removed: removed ?? 0 }
}

export function readUsage(value: unknown): GenerationUsage | undefined {
  if (!isObject(value)) return undefined
  const inputTokens = readCount(value.inputTokens) ?? 0
  const outputTokens = readCount(value.outputTokens) ?? 0
  const totalTokens = readCount(value.totalTokens) || inputTokens + outputTokens
  return totalTokens > 0 ? { inputTokens, outputTokens, totalTokens } : undefined
}

export function requestField(value: unknown): Field | undefined {
  return Object.entries(REQUEST_FIELDS).find(([key]) => key === value)?.[1]
}

export function readOutcome(value: unknown, status: number): Outcome {
  if (isObject(value) && value.success === true) {
    try {
      return {
        ok: true,
        received: {
          flow: importFlow(value.workflow),
          issues: readIssues(value.issues),
          rounds: readCount(value.rounds) || 1,
          usage: readUsage(value.usage),
          transcript: text(value.transcript),
          model: isObject(value.model) ? text(value.model.id) : "",
          partial: value.partial === true,
          mode: value.mode === "edit" ? "edit" : "create",
          changes: readChanges(value.changes),
        },
      }
    } catch (error) {
      return {
        ok: false,
        rejection: {
          code: "invalid_output",
          failure: { title: "O fluxo recebido não está no formato de Atendimento.", items: messageLines(error) },
        },
      }
    }
  }
  if (isObject(value) && text(value.error).trim()) {
    return {
      ok: false,
      rejection: {
        code: text(value.code) || "unknown",
        field: requestField(value.field),
        failure: { title: text(value.error).trim(), details: text(value.details).trim() || undefined, items: [] },
      },
    }
  }
  return {
    ok: false,
    rejection: {
      code: "unknown",
      failure: STATUS_FAILURES[status] ?? {
        title: "Resposta inesperada do servidor.",
        details: `Código HTTP ${status}. Tente novamente.`,
        items: [],
      },
    },
  }
}

export function readEvent(line: string, onProgress: (progress: GenerationProgress) => void): Outcome | null {
  if (!line.trim()) return null
  let event: unknown
  try {
    event = JSON.parse(line)
  } catch {
    return null
  }
  if (!isObject(event)) return null
  if (event.type === "result") return readOutcome(event.result, 200)
  if (event.type === "progress") {
    const progress = readProgress(event.progress)
    if (progress) onProgress(progress)
  }
  return null
}

export async function readEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onProgress: (progress: GenerationProgress) => void,
): Promise<Outcome> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let outcome: Outcome | null = null
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) outcome = readEvent(line, onProgress) ?? outcome
    }
    outcome = readEvent(buffer + decoder.decode(), onProgress) ?? outcome
  } catch (error) {
    if (signal.aborted) throw error
  } finally {
    reader.releaseLock()
  }
  return outcome ?? INTERRUPTED
}

export async function requestGeneration(
  request: GenerateRequest,
  signal: AbortSignal,
  onProgress: (progress: GenerationProgress) => void,
): Promise<Outcome> {
  const response = await fetch(GENERATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
    body: JSON.stringify({ ...request, stream: true } satisfies GenerateRequest),
    cache: "no-store",
    signal,
  })
  const type = response.headers.get("content-type") ?? ""
  if (response.ok && response.body && type.includes("ndjson")) return readEvents(response.body, signal, onProgress)
  return readOutcome(await response.json().catch(() => null), response.status)
}

export async function loadEngine(): Promise<Engine | null> {
  try {
    const [runner, preview, edit] = await Promise.all([
      import("@/lib/atendimento/ai/runner"),
      import("@/lib/atendimento/ai/preview"),
      import("@/lib/atendimento/ai/edit"),
    ])
    return { runGeneration: runner.runGeneration, previewFlow: preview.previewFlow, previewEdit: preview.previewEdit, diffFlows: edit.diffFlows }
  } catch {
    return null
  }
}

export async function generateFlow(
  request: GenerateRequest,
  signal: AbortSignal,
  onProgress: (progress: GenerationProgress) => void,
  onPartial?: (ri: unknown) => void,
  engine?: Engine | null,
): Promise<Outcome> {
  const loaded = engine === undefined ? await loadEngine() : engine
  if (!loaded) return requestGeneration(request, signal, onProgress)
  let reached = false
  const direct: typeof fetch = async (input, init) => {
    const response = await fetch(input, init)
    reached = true
    return response
  }
  const response = await loaded.runGeneration(
    {
      provider: request.provider,
      model: request.model,
      apiKey: request.apiKey,
      prompt: request.prompt,
      image: request.image ?? null,
      size: request.size,
      count: request.count,
      name: request.name,
      effort: request.effort ?? DEFAULT_EFFORT,
      ...(request.fill !== undefined ? { fill: request.fill } : {}),
      ...(request.mode ? { mode: request.mode } : {}),
      ...(request.base !== undefined ? { base: request.base } : {}),
      ...(request.reserved?.length ? { reserved: request.reserved } : {}),
    },
    { transport: "browser", signal, fetch: direct, onProgress, onPartial },
  )
  if (!response.success && response.code === "network" && !reached && !signal.aborted) {
    try {
      return await requestGeneration(request, signal, onProgress)
    } catch (error) {
      if (signal.aborted) throw error
    }
  }
  return readOutcome(response, 200)
}

export async function loadInterview(): Promise<InterviewModule | null> {
  try {
    const loaded = await import("@/lib/atendimento/ai/interview")
    return { interviewTurn: loaded.interviewTurn }
  } catch {
    return null
  }
}

export async function requestTurn(
  input: InterviewInput,
  signal: AbortSignal,
  engine?: InterviewModule | null,
  onPartial?: (turn: Partial<InterviewTurn>) => void,
): Promise<InterviewTurnResult> {
  const loaded = engine === undefined ? await loadInterview() : engine
  if (!loaded) return { ok: false, failure: TURN_UNAVAILABLE }
  return loaded.interviewTurn(
    {
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      effort: input.effort,
      fill: input.fill,
      history: input.history,
      flow: input.flow ?? null,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.proposal ? { proposal: true } : {}),
    },
    { transport: "browser", signal, ...(onPartial ? { onPartial } : {}) },
  )
}

export function failureField(code: string, field?: Field): Field | undefined {
  return field ?? (code === "invalid_key" ? "apiKey" : code === "model_not_found" ? "model" : undefined)
}

export function previewFeed(
  build: (ri: unknown) => AtendimentoFlow | null,
  send: (flow: AtendimentoFlow) => void,
  interval = PREVIEW_INTERVAL_MS,
): PreviewFeed {
  let pending: unknown = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = Number.NEGATIVE_INFINITY
  let stopped = false
  const flush = () => {
    timer = undefined
    if (stopped || pending === null) return
    const ri = pending
    pending = null
    last = Date.now()
    let flow: AtendimentoFlow | null = null
    try {
      flow = build(ri)
    } catch {
      flow = null
    }
    if (flow) send(flow)
  }
  return {
    push(ri) {
      if (stopped || ri === null || ri === undefined) return
      pending = ri
      if (timer !== undefined) return
      timer = setTimeout(flush, Math.max(0, last + interval - Date.now()))
    },
    stop() {
      stopped = true
      pending = null
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
  }
}

export function readModels(list: unknown[]): ModelInfo[] {
  const seen = new Set<string>()
  return list.flatMap((entry): ModelInfo[] => {
    if (!isObject(entry)) return []
    const id = text(entry.id).trim()
    if (!isModelId(id) || seen.has(id)) return []
    seen.add(id)
    const name = text(entry.name).trim() || id
    return [typeof entry.vision === "boolean" ? { id, name, vision: entry.vision } : { id, name }]
  })
}

export async function requestModels(provider: ProviderId, apiKey: string, signal: AbortSignal): Promise<Listed> {
  const request: ModelsRequest = { provider, apiKey }
  const response = await fetch(MODELS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
    signal,
  })
  const data: unknown = await response.json().catch(() => null)
  if (response.ok && isObject(data) && Array.isArray(data.models)) return { ok: true, models: readModels(data.models) }
  if (isObject(data) && text(data.error).trim()) {
    return { ok: false, error: text(data.error).trim(), details: text(data.details).trim() || undefined }
  }
  return { ok: false, error: "Não foi possível buscar os modelos.", details: `Código HTTP ${response.status}. Tente novamente.` }
}

export function mergeIssues(received: GenerationIssue[], blocking: FlowIssue[]): GenerationIssue[] {
  const signature = (issue: { severity: string; nodeId?: string; message: string }) =>
    JSON.stringify([issue.severity, issue.nodeId ?? "", issue.message])
  const known = new Set(received.map(signature))
  const missing = blocking
    .filter((issue) => !known.has(signature(issue)))
    .map((issue): GenerationIssue => ({ severity: "error", scope: "ia", message: issue.message, nodeId: issue.nodeId }))
  return [...missing, ...received].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error"))
}

export function issueSubject(issue: GenerationIssue, nodes: ReadonlyMap<string, AtendimentoNode>): string {
  if (!issue.nodeId) return ""
  const type = nodes.get(issue.nodeId)?.data.type ?? issue.type
  return `${type ? getComponentLabel(type) : "Componente"} · ID ${issue.nodeId}`
}

export function nodeText(node: AtendimentoNode, limit = NODE_TEXT_LIMIT): string {
  const data = isObject(node.data?.data) ? node.data.data : {}
  for (const key of getDefinition(text(node.data?.type))?.summary ?? []) {
    const value = data[key]
    const line = (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "").replace(/\s+/g, " ").trim()
    if (!line) continue
    if (line.length <= limit) return line
    const cut = line.slice(0, Math.max(1, limit - 1))
    const space = cut.lastIndexOf(" ")
    return `${(space >= limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
  }
  return ""
}

export function nodeSubject(node: AtendimentoNode): string {
  const main = nodeText(node)
  return `${getComponentLabel(text(node.data?.type))}${main ? ` “${main}”` : ""} · ID ${node.id}`
}

export function issueLine(issue: GenerationIssue, nodes: ReadonlyMap<string, AtendimentoNode>): string {
  const subject = issueSubject(issue, nodes)
  return `${issue.severity === "error" ? "Erro" : "Aviso"}: ${subject ? `${subject}: ` : ""}${issue.message}`
}

export function apiKeyError(info: ProviderInfo, key: string): string {
  return !key
    ? `Informe a chave da API ${info.of}.`
    : !KEY_CHARACTERS.test(key)
      ? "A chave da API tem caracteres inválidos."
      : key.length < MIN_KEY_LENGTH
        ? "A chave da API parece incompleta. Confira o valor copiado."
        : key.length > LIMITS.apiKey
          ? "A chave da API é longa demais."
          : ""
}
