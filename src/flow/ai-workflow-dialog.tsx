"use client"

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FilePenLine,
  FilePlus2,
  FileText,
  KeyRound,
  Loader2,
  Maximize2,
  MessagesSquare,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import {
  COUNT_LIMITS,
  DEFAULT_EFFORT,
  EFFORTS,
  LIMITS,
  MAX_ROUNDS,
  SIZE_RANGES,
  type Effort,
  type GenerateFailure,
  type GenerateRequest,
  type GenerationChanges,
  type GenerationIssue,
  type GenerationMode,
  type GenerationProgress,
  type GenerationSize,
  type GenerationStage,
  type GenerationUsage,
  type IssueScope,
  type ModelInfo,
  type ModelsRequest,
  type RequestField,
} from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, defaultEffort, effortsFor, type ProviderId, type ProviderInfo } from "@/lib/atendimento/ai/providers"
import type { InterviewInput } from "@/lib/atendimento/ai/interview"
import { START_TYPE, getCategory, getComponentColor, getComponentLabel } from "@/lib/atendimento/catalog"
import { downloadJson, downloadText } from "@/lib/atendimento/download"
import { exportFileName, exportFlow, importFlow, isObject, stampExport, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode, FlowIssue } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { InterviewPanel, useInterview, type BuildAction, type InterviewHandle, type InterviewRunSummary, type InterviewTurnResult } from "./ai-interview"
import { FlowSelect, type FlowSelectOption } from "./flow-select"
import { categoryTint, componentIcon, nodeSummary } from "./nodes/atendimento-node"
import { ui } from "./ui"

type Field = "provider" | "apiKey" | "model" | "effort" | "mode" | "description" | "image" | "size" | "count" | "name" | "fill"
type FieldErrors = Partial<Record<Field, string>>
type View = "form" | "result"
type Tone = "success" | "warning" | "danger"
type LiveCounts = { nodes: number; edges: number }
type PreviewKind = "create" | "edit"
type Mode = GenerationMode | "chat"
type ChangeMark = "added" | "changed"

interface ReferenceImage {
  name: string
  bytes: number
  width: number
  height: number
  dataUrl: string
}

interface Failure {
  title: string
  details?: string
  items: string[]
}

interface Rejection {
  code: string
  failure: Failure
  field?: Field
}

interface Received {
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

interface FlowDiff {
  added: string[]
  changed: string[]
  removed: string[]
}

type Outcome = { ok: true; received: Received } | { ok: false; rejection: Rejection }

type JobOutcome = { ok: true; received: Received; diff?: FlowDiff } | { ok: false; rejection: Rejection }

type Listed = { ok: true; models: ModelInfo[] } | { ok: false; error: string; details?: string }

interface Listing {
  provider: ProviderId
  state: "loading" | "done" | "error"
  count?: number
  error?: string
  details?: string
}

interface Generated extends Received {
  provider: ProviderId
  modelName: string
  prompt: string
  image: { name: string; bytes: number } | null
  size: string
  name: string
  effort: Effort
  fill: boolean
  base: AtendimentoFlow | null
  diff?: FlowDiff
  generatedAt: string
}

interface TypeUsage {
  type: string
  label: string
  color: string
  count: number
}

interface IssueGroup {
  scope: IssueScope
  title: string
  hint: string
  items: GenerationIssue[]
}

interface Summary {
  components: number
  blocking: number
  tone: Tone
  issues: GenerationIssue[]
  groups: IssueGroup[]
  nodes: AtendimentoNode[]
  byId: ReadonlyMap<string, AtendimentoNode>
  byNode: ReadonlyMap<string, GenerationIssue[]>
  types: TypeUsage[]
  editing: boolean
  changes: GenerationChanges
  marks: ReadonlyMap<string, ChangeMark>
  removed: AtendimentoNode[]
}

interface AIWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkflowGenerated: (workflow: AtendimentoFlow) => boolean
  onLivePreview?: (flow: AtendimentoFlow | null, done?: boolean, kind?: PreviewKind) => void
  getCurrentFlow?: () => AtendimentoFlow | null
  onWorkflowEdited?: (workflow: AtendimentoFlow) => boolean
}

type RunnerModule = typeof import("@/lib/atendimento/ai/runner")
type PreviewModule = typeof import("@/lib/atendimento/ai/preview")
type EditModule = typeof import("@/lib/atendimento/ai/edit")

interface Engine {
  runGeneration: RunnerModule["runGeneration"]
  previewFlow: PreviewModule["previewFlow"]
  previewEdit: PreviewModule["previewEdit"]
  diffFlows: EditModule["diffFlows"]
}

type InterviewModule = Pick<typeof import("@/lib/atendimento/ai/interview"), "interviewTurn">

interface PreviewFeed {
  push: (ri: unknown) => void
  stop: () => void
}

const GENERATE_URL = "/api/generate-workflow"
const MODELS_URL = "/api/ai-models"
const FIELD_ORDER: readonly Field[] = ["provider", "apiKey", "model", "effort", "mode", "description", "image", "size", "count", "name", "fill"]
const REQUEST_FIELDS: Readonly<Record<RequestField, Field>> = {
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
const STAGES: readonly GenerationStage[] = ["preparando", "gerando", "montando", "validando", "corrigindo"]
const SCOPES: readonly IssueScope[] = ["ia", "plataforma", "ajuste"]
const KEY_CHARACTERS = /^[\x21-\x7E]+$/
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MIN_KEY_LENGTH = 8
const UNSAFE_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g
const safeFileName = (fileName: string) => fileName.replace(UNSAFE_FILE_CHARACTERS, "-")
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]
const IMAGE_NAME = /\.(png|jpe?g|webp)$/i
const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_SIDE = 2048
const MAX_SENT_BYTES = Math.min(LIMITS.imageBytes, 3 * 1024 * 1024)
const JPEG_QUALITIES = [0.9, 0.8, 0.7]
const PREVIEW_INTERVAL_MS = 250

const EFFORT_OPTIONS: Readonly<Record<Effort, { label: string; hint: string }>> = {
  low: { label: "Rápido", hint: "Responde mais rápido e gasta menos tokens. Bom para fluxos simples." },
  medium: { label: "Equilibrado", hint: "Equilíbrio entre velocidade e qualidade. Atende bem a maioria dos fluxos." },
  high: { label: "Alto", hint: "O modelo raciocina mais antes de responder. Fluxos grandes saem mais completos, mas a geração demora mais." },
  max: { label: "Máximo", hint: "Todo o raciocínio que o modelo oferece. É o mais lento e o que mais gasta tokens." },
}

const sizeRange = (size: keyof typeof SIZE_RANGES) => `${SIZE_RANGES[size][0]} a ${SIZE_RANGES[size][1]} componentes`

const SIZE_OPTIONS: ReadonlyArray<{ value: GenerationSize; label: string; hint: string }> = [
  { value: "auto", label: "Automático (recomendado)", hint: "A IA usa a quantidade de componentes que a descrição exigir." },
  { value: "small", label: `Pequeno (${sizeRange("small")})`, hint: "Para fluxos simples e diretos." },
  { value: "medium", label: `Médio (${sizeRange("medium")})`, hint: "Equilibrado para a maioria dos atendimentos." },
  { value: "large", label: `Grande (${sizeRange("large")})`, hint: "Para atendimentos com várias etapas e ramificações." },
  { value: "custom", label: "Personalizado", hint: "A IA gera a quantidade de componentes informada." },
]

const MODE_OPTIONS: ReadonlyArray<{ value: Mode; label: string; hint: string; Icon: LucideIcon }> = [
  { value: "create", label: "Criar fluxo novo", hint: "A IA monta um fluxo do zero a partir do pedido.", Icon: FilePlus2 },
  { value: "edit", label: "Editar o fluxo aberto", hint: "A IA muda só o que o pedido citar e mantém o resto como está.", Icon: FilePenLine },
  { value: "chat", label: "Conversar com a IA", hint: "A IA pergunta o que faltar, monta o fluxo no editor e segue com os ajustes que você pedir.", Icon: MessagesSquare },
]
const EDIT_BLOCKED = "Disponível quando o fluxo aberto tem componentes além do Início."
const CHAT_FIELDS: readonly Field[] = ["provider", "apiKey", "model", "effort", "fill"]
const CHAT_STARTERS_EDIT = [
  "Acrescente uma pesquisa de satisfação no fim.",
  "Quero mudar a mensagem de boas-vindas.",
  "Adicione um horário de atendimento.",
]
const CHAT_INTRO_EDIT =
  "Conte o que você quer mudar no fluxo aberto. A IA pergunta o que faltar e aplica as mudanças no canvas. Desfazer (Ctrl+Z) volta ao fluxo anterior."
const CHAT_INTRO_CREATE =
  "Conte o que o seu atendimento precisa fazer. A IA pergunta o que faltar, como as opções do menu e as mensagens, e monta o fluxo no editor quando tudo estiver decidido."
const TURN_UNAVAILABLE: GenerateFailure = {
  success: false,
  code: "unknown",
  error: "Não foi possível carregar a conversa com a IA.",
  details: "Recarregue a página e tente de novo.",
}

const FILL_HINTS = {
  on: "Nomes, IDs e URLs saem sempre preenchidos. Os valores provisórios aparecem em Dados da plataforma para você conferir.",
  off: "Dados cadastrados na plataforma, como nomes, IDs e URLs, ficam em branco para você completar no editor.",
} as const

const PLATFORM_HINTS = {
  on: "Valores provisórios de nomes, IDs e URLs. Troque cada um pelo valor cadastrado na plataforma.",
  off: "Dados cadastrados na plataforma, como IDs, nomes e URLs, que o pedido não informou. Complete no editor.",
} as const

const ISSUE_GROUPS: ReadonlyArray<Omit<IssueGroup, "items">> = [
  { scope: "ia", title: "Revise", hint: "Pontos que a IA não resolveu nas rodadas de correção." },
  { scope: "plataforma", title: "Dados da plataforma", hint: PLATFORM_HINTS.off },
  { scope: "ajuste", title: "Ajustes automáticos", hint: "Mudanças feitas na montagem para manter o fluxo válido. Confira cada uma." },
]

const MARKS: Record<ChangeMark, { label: string; className: string }> = {
  added: { label: "Novo", className: "bg-flow-success/15 text-flow-success" },
  changed: { label: "Alterado", className: "bg-flow-accent/15 text-flow-accent" },
}

const TONES: Record<Tone, { box: string; badge: string; Icon: LucideIcon }> = {
  success: { box: "border-flow-success/40 bg-flow-success/10", badge: "bg-flow-success/15 text-flow-success", Icon: CheckCircle2 },
  warning: { box: "border-flow-warning/40 bg-flow-warning/10", badge: "bg-flow-warning/15 text-flow-warning", Icon: AlertTriangle },
  danger: { box: "border-flow-danger/40 bg-flow-danger/10", badge: "bg-flow-danger/15 text-flow-danger", Icon: XCircle },
}

const STATUS_FAILURES: Readonly<Partial<Record<number, Failure>>> = {
  413: { title: "A solicitação é grande demais.", details: "Use uma imagem menor ou reduza a descrição.", items: [] },
  504: {
    title: "O servidor demorou demais para responder.",
    details: "Tente um modelo mais rápido ou um fluxo menor.",
    items: [],
  },
}

const INTERRUPTED: Outcome = {
  ok: false,
  rejection: {
    code: "network",
    failure: { title: "A conexão foi interrompida antes do fim da geração.", details: "Tente gerar o fluxo novamente.", items: [] },
  },
}

const fieldBase = "block disabled:cursor-not-allowed disabled:opacity-60"
const invalidField =
  "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"
const warningText = "mt-1 text-[11px] leading-4 text-flow-warning"

const text = (value: unknown): string => (typeof value === "string" ? value : "")
const formatNumber = (value: number) => value.toLocaleString("pt-BR")
const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`
const isModelId = (value: string) => MODEL_ID.test(value) && !value.includes("..")
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
const NO_CHANGES: GenerationChanges = { added: 0, changed: 0, removed: 0 }

function hasComponents(flow: AtendimentoFlow | null | undefined): flow is AtendimentoFlow {
  return Boolean(flow && Array.isArray(flow.nodes) && flow.nodes.some((node) => node.data.type !== START_TYPE))
}

function documentKey(flow: AtendimentoFlow): string {
  return JSON.stringify({ ...flow, viewport: null })
}

function changeLabels(changes: GenerationChanges): [string, string, string] {
  return [
    plural(changes.added, "componente novo", "componentes novos"),
    plural(changes.changed, "alterado", "alterados"),
    plural(changes.removed, "removido", "removidos"),
  ]
}

function readCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

function messageLines(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function codeFence(content: string): string {
  const longest = Math.max(0, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(Math.max(3, longest + 1))
}

function modelName(info: ProviderInfo, id: string, listed?: readonly ModelInfo[]): string {
  return info.presets.find((preset) => preset.id === id)?.name ?? listed?.find((entry) => entry.id === id)?.name ?? id
}

function modelVision(info: ProviderInfo, id: string, listed?: readonly ModelInfo[]): boolean | undefined {
  const preset = info.presets.find((entry) => entry.id === id)
  return preset ? preset.vision : listed?.find((entry) => entry.id === id)?.vision
}

function modelChoices(info: ProviderInfo, model: string, listed?: readonly ModelInfo[]): FlowSelectOption[] {
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

function pickEffort(choice: Effort | null, provider: ProviderId, model: string): Effort {
  const allowed = effortsFor(provider, model)
  if (choice && allowed.includes(choice)) return choice
  if (choice) {
    const lower = EFFORTS.slice(0, EFFORTS.indexOf(choice)).reverse().find((entry) => allowed.includes(entry))
    if (lower) return lower
  }
  const fallback = defaultEffort(provider, model)
  return allowed.includes(fallback) ? fallback : allowed[0] ?? DEFAULT_EFFORT
}

function effortChoices(provider: ProviderId, model: string): FlowSelectOption[] {
  const allowed = effortsFor(provider, model)
  return (allowed.length ? allowed : [DEFAULT_EFFORT]).map((value) => ({ value, label: EFFORT_OPTIONS[value].label }))
}

function prefixLength(info: ProviderInfo, key: string): number {
  return info.keyPrefix && key.startsWith(info.keyPrefix) ? info.keyPrefix.length : 0
}

function keyWarning(info: ProviderInfo, value: string): string {
  const key = value.trim()
  if (!key) return ""
  const best = Math.max(...PROVIDERS.map((entry) => prefixLength(entry, key)))
  const owners = best > 0 ? PROVIDERS.filter((entry) => prefixLength(entry, key) === best) : []
  if (owners.length === 1 && owners[0].id !== info.id) return `Esta chave parece ser ${owners[0].of}. Confira o provedor escolhido.`
  if (info.keyPrefix && !key.startsWith(info.keyPrefix)) return `Chaves ${info.of} costumam começar com ${info.keyPrefix}.`
  return ""
}

function stageText(progress: GenerationProgress | null, editing = false): string {
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

function progressText(progress: GenerationProgress | null, live?: LiveCounts | null, editing = false): string {
  if (editing) return stageText(progress, true)
  if (progress?.stage !== "gerando" || (!live && progress.nodes === undefined && progress.edges === undefined)) return stageText(progress)
  const nodes = plural(live?.nodes ?? progress.nodes ?? 0, "componente", "componentes")
  const edges = plural(live?.edges ?? progress.edges ?? 0, "conexão", "conexões")
  return `Gerando o fluxo, rodada ${progress.round} de ${progress.maxRounds}: ${nodes} e ${edges}.`
}

function readProgress(value: unknown): GenerationProgress | null {
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

function readIssues(value: unknown): GenerationIssue[] {
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

function readChanges(value: unknown): GenerationChanges | undefined {
  if (!isObject(value)) return undefined
  const added = readCount(value.added)
  const changed = readCount(value.changed)
  const removed = readCount(value.removed)
  if (added === undefined && changed === undefined && removed === undefined) return undefined
  return { added: added ?? 0, changed: changed ?? 0, removed: removed ?? 0 }
}

function readUsage(value: unknown): GenerationUsage | undefined {
  if (!isObject(value)) return undefined
  const inputTokens = readCount(value.inputTokens) ?? 0
  const outputTokens = readCount(value.outputTokens) ?? 0
  const totalTokens = readCount(value.totalTokens) || inputTokens + outputTokens
  return totalTokens > 0 ? { inputTokens, outputTokens, totalTokens } : undefined
}

function requestField(value: unknown): Field | undefined {
  return Object.entries(REQUEST_FIELDS).find(([key]) => key === value)?.[1]
}

function readOutcome(value: unknown, status: number): Outcome {
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

function readEvent(line: string, onProgress: (progress: GenerationProgress) => void): Outcome | null {
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

async function readEvents(
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

async function requestGeneration(
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

async function loadEngine(): Promise<Engine | null> {
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

async function generateFlow(
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

async function loadInterview(): Promise<InterviewModule | null> {
  try {
    const loaded = await import("@/lib/atendimento/ai/interview")
    return { interviewTurn: loaded.interviewTurn }
  } catch {
    return null
  }
}

async function requestTurn(input: InterviewInput, signal: AbortSignal, engine?: InterviewModule | null): Promise<InterviewTurnResult> {
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
    },
    { transport: "browser", signal },
  )
}

function failureField(code: string, field?: Field): Field | undefined {
  return field ?? (code === "invalid_key" ? "apiKey" : code === "model_not_found" ? "model" : undefined)
}

function previewFeed(
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

function readModels(list: unknown[]): ModelInfo[] {
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

async function requestModels(provider: ProviderId, apiKey: string, signal: AbortSignal): Promise<Listed> {
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

function acceptsImage(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || (!file.type && IMAGE_NAME.test(file.name))
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))), type, quality)
  })
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Leitura vazia.")))
    reader.onerror = () => reject(reader.error ?? new Error("Falha na leitura."))
    reader.readAsDataURL(blob)
  })
}

async function prepareImage(file: File): Promise<ReferenceImage | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height, 1))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas indisponível.")
    context.drawImage(bitmap, 0, 0, width, height)
    let blob = await canvasBlob(canvas, "image/png")
    if (blob.size > MAX_SENT_BYTES) {
      context.globalCompositeOperation = "destination-over"
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, width, height)
      for (const quality of JPEG_QUALITIES) {
        blob = await canvasBlob(canvas, "image/jpeg", quality)
        if (blob.size <= MAX_SENT_BYTES) break
      }
    }
    if (blob.size > MAX_SENT_BYTES) return null
    return { name: file.name, bytes: blob.size, width, height, dataUrl: await blobDataUrl(blob) }
  } finally {
    bitmap.close()
  }
}

function orderedNodes(flow: AtendimentoFlow): AtendimentoNode[] {
  return [...flow.nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
}

function nodeColor(type: string): string {
  return type === START_TYPE ? "rgb(var(--flow-success))" : getComponentColor(type)
}

function usedTypes(flow: AtendimentoFlow): TypeUsage[] {
  const counts = new Map<string, number>()
  for (const node of flow.nodes) {
    if (node.data.type !== START_TYPE) counts.set(node.data.type, (counts.get(node.data.type) ?? 0) + 1)
  }
  const entries = Array.from(counts, ([type, count]) => ({ type, count, label: getComponentLabel(type), color: getComponentColor(type) }))
  const repeated = new Set(entries.filter((entry, index) => entries.findIndex((other) => other.label === entry.label) !== index).map((entry) => entry.label))
  return entries
    .map((entry) => (repeated.has(entry.label) ? { ...entry, label: `${entry.label} (${getCategory(entry.type)?.label ?? entry.type})` } : entry))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
}

function mergeIssues(received: GenerationIssue[], blocking: FlowIssue[]): GenerationIssue[] {
  const signature = (issue: { severity: string; nodeId?: string; message: string }) =>
    JSON.stringify([issue.severity, issue.nodeId ?? "", issue.message])
  const known = new Set(received.map(signature))
  const missing = blocking
    .filter((issue) => !known.has(signature(issue)))
    .map((issue): GenerationIssue => ({ severity: "error", scope: "ia", message: issue.message, nodeId: issue.nodeId }))
  return [...missing, ...received].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error"))
}

function summarize(result: Generated): Summary {
  const blocking = validateFlow(result.flow).filter((issue) => issue.severity === "error")
  const issues = mergeIssues(result.issues, blocking)
  const byNode = new Map<string, GenerationIssue[]>()
  for (const issue of issues) {
    if (issue.nodeId) byNode.set(issue.nodeId, [...(byNode.get(issue.nodeId) ?? []), issue])
  }
  const editing = result.mode === "edit"
  const diff = editing ? result.diff : undefined
  const marks = new Map<string, ChangeMark>()
  for (const id of diff?.added ?? []) marks.set(id, "added")
  for (const id of diff?.changed ?? []) marks.set(id, "changed")
  const before = new Map((result.base?.nodes ?? []).map((node) => [node.id, node]))
  const removed = (diff?.removed ?? []).flatMap((id) => {
    const node = before.get(id)
    return node ? [node] : []
  })
  const changes = result.changes ?? (diff ? { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length } : NO_CHANGES)
  return {
    components: result.flow.nodes.filter((node) => node.data.type !== START_TYPE).length,
    blocking: blocking.length,
    tone: blocking.length ? "danger" : issues.length || result.partial ? "warning" : "success",
    issues,
    groups: ISSUE_GROUPS.map((group) => ({
      ...group,
      hint: group.scope === "plataforma" ? PLATFORM_HINTS[result.fill ? "on" : "off"] : group.hint,
      items: issues.filter((issue) => issue.scope === group.scope),
    })).filter((group) => group.items.length > 0),
    nodes: orderedNodes(result.flow),
    byId: new Map(result.flow.nodes.map((node) => [node.id, node])),
    byNode,
    types: usedTypes(result.flow),
    editing,
    changes: editing ? changes : NO_CHANGES,
    marks,
    removed,
  }
}

function issueSubject(issue: GenerationIssue, nodes: ReadonlyMap<string, AtendimentoNode>): string {
  if (!issue.nodeId) return ""
  const type = nodes.get(issue.nodeId)?.data.type ?? issue.type
  return `${type ? getComponentLabel(type) : "Componente"} · ID ${issue.nodeId}`
}

function issueLine(issue: GenerationIssue, nodes: ReadonlyMap<string, AtendimentoNode>): string {
  const subject = issueSubject(issue, nodes)
  return `${issue.severity === "error" ? "Erro" : "Aviso"}: ${subject ? `${subject}: ` : ""}${issue.message}`
}

function promptDocument(result: Generated, summary: Summary): string {
  const provider = PROVIDERS.find((entry) => entry.id === result.provider)
  const fence = codeFence(result.transcript)
  const usage = result.usage
  return [
    summary.editing ? "# Prompt de edição do fluxo" : "# Prompt de geração do fluxo",
    "",
    `- Fluxo: ${result.flow.name || "Sem nome"}`,
    `- Modo: ${summary.editing ? "Edição do fluxo aberto" : "Fluxo novo"}`,
    `- Provedor: ${provider ? `${provider.name} (${provider.vendor})` : result.provider}`,
    `- Modelo: ${result.modelName === result.model ? result.model : `${result.modelName} (${result.model})`}`,
    ...(summary.editing ? [`- Mudanças: ${changeLabels(summary.changes).join(", ")}`] : [`- Tamanho: ${result.size}`]),
    `- Esforço: ${EFFORT_OPTIONS[result.effort].label}`,
    `- Preencher todos os campos: ${result.fill ? "sim" : "não"}`,
    `- Componentes: ${formatNumber(summary.components)}, sem contar o início`,
    `- Conexões: ${formatNumber(result.flow.edges.length)}`,
    `- Rodadas: ${result.rounds}`,
    ...(result.partial ? ["- Geração interrompida: o fluxo pode estar incompleto"] : []),
    ...(usage
      ? [
          `- Tokens: ${formatNumber(usage.inputTokens)} de entrada, ${formatNumber(usage.outputTokens)} de saída, ${formatNumber(usage.totalTokens)} no total`,
        ]
      : []),
    `- Pendências: ${formatNumber(summary.issues.length)}`,
    `- ${summary.editing ? "Editado" : "Gerado"} em: ${result.generatedAt}`,
    "",
    "## Solicitação",
    "",
    result.prompt || "Sem descrição em texto.",
    ...(result.image ? ["", `Imagem de referência: ${result.image.name} (${formatBytes(result.image.bytes)}).`] : []),
    ...(result.name ? ["", `Nome pedido: ${result.name}`] : []),
    ...(summary.issues.length
      ? ["", "## Pendências", "", ...summary.issues.map((issue) => `- ${issueLine(issue, summary.byId)}`)]
      : []),
    "",
    "## Conversa com o modelo",
    "",
    ...(result.transcript ? [fence, result.transcript, fence] : ["O servidor não enviou a transcrição desta geração."]),
    "",
  ].join("\n")
}

function SeverityIcon({ severity }: { severity: GenerationIssue["severity"] }) {
  const Icon = severity === "error" ? XCircle : AlertTriangle
  return (
    <Icon
      aria-hidden="true"
      className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", severity === "error" ? "text-flow-danger" : "text-flow-warning")}
    />
  )
}

export default function AIWorkflowDialog({
  open,
  onOpenChange,
  onWorkflowGenerated,
  onLivePreview,
  getCurrentFlow,
  onWorkflowEdited,
}: AIWorkflowDialogProps) {
  const baseId = useId()
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({})
  const [models, setModels] = useState<Partial<Record<ProviderId, string>>>({})
  const [fetched, setFetched] = useState<Partial<Record<ProviderId, { key: string; models: ModelInfo[] }>>>({})
  const [listing, setListing] = useState<Listing | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [image, setImage] = useState<ReferenceImage | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [size, setSize] = useState<GenerationSize>("auto")
  const [count, setCount] = useState("10")
  const [name, setName] = useState("")
  const [effortChoice, setEffortChoice] = useState<Effort | null>(null)
  const [mode, setMode] = useState<Mode>("create")
  const [fill, setFill] = useState(true)
  const [canEdit, setCanEdit] = useState(() => {
    try {
      return hasComponents(getCurrentFlow?.() ?? null)
    } catch {
      return false
    }
  })
  const [runningKind, setRunningKind] = useState<PreviewKind>("create")
  const [watch, setWatch] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState("")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [liveCounts, setLiveCounts] = useState<LiveCounts | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<Generated | null>(null)
  const [view, setView] = useState<View>("form")
  const [, setRenderRequest] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const listAbortRef = useRef<AbortController | null>(null)
  const imageTokenRef = useRef(0)
  const afterRenderRef = useRef<Array<() => void>>([])
  const resetOnCloseRef = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const regenerateRef = useRef<HTMLButtonElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const detailsRef = useRef<HTMLButtonElement>(null)
  const collapsedRef = useRef(false)
  const liveRef = useRef(false)
  const chatJobRef = useRef(false)
  const cancelChatRef = useRef<() => void>(() => undefined)
  const feedRef = useRef<PreviewFeed | null>(null)
  const previewShownRef = useRef(false)
  const livePreviewRef = useRef(onLivePreview)
  livePreviewRef.current = onLivePreview
  const currentFlowRef = useRef(getCurrentFlow)
  currentFlowRef.current = getCurrentFlow
  const openRef = useRef(open)
  openRef.current = open

  const info = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0]
  const apiKey = keys[provider] ?? ""
  const listed = fetched[provider]?.models
  const model = models[provider] || info.presets[0].id
  const currentModelName = modelName(info, model, listed)
  const vision = modelVision(info, model, listed)
  const imageBlocked = vision === false
  const warning = keyWarning(info, apiKey)
  const sizeOption = SIZE_OPTIONS.find((entry) => entry.value === size) ?? SIZE_OPTIONS[0]
  const providerListing = listing?.provider === provider ? listing : null
  const modelOptions = modelChoices(info, model, listed)
  const effort = pickEffort(effortChoice, provider, model)
  const effortOptions = effortChoices(provider, model)
  const canWatch = typeof onLivePreview === "function"
  const editAvailable = typeof getCurrentFlow === "function" && typeof onWorkflowEdited === "function"
  const activeMode: Mode = mode === "edit" && !(editAvailable && canEdit) ? "create" : mode
  const editing = activeMode === "edit"
  const chatting = activeMode === "chat"
  const modeOptions = MODE_OPTIONS.filter((entry) => entry.value !== "edit" || editAvailable)
  const summary = useMemo(() => (result ? summarize(result) : null), [result])
  const showingResult = view === "result" && result !== null && summary !== null

  useEffect(() => {
    const tasks = afterRenderRef.current.splice(0)
    for (const task of tasks) task()
  })

  const stopPreview = () => {
    feedRef.current?.stop()
    feedRef.current = null
    setLiveCounts(null)
    if (!previewShownRef.current) return
    previewShownRef.current = false
    try {
      livePreviewRef.current?.(null)
    } catch {
      return
    }
  }

  const readCurrentFlow = (): AtendimentoFlow | null => {
    try {
      return currentFlowRef.current?.() ?? null
    } catch {
      return null
    }
  }

  const showPreview = (flow: AtendimentoFlow, done = false, kind: PreviewKind = "create") => {
    const send = livePreviewRef.current
    if (!send) return
    try {
      send(flow, done, kind)
      previewShownRef.current = true
      setLiveCounts({ nodes: flow.nodes.filter((node) => node.data.type !== START_TYPE).length, edges: flow.edges.length })
    } catch {
      return
    }
  }

  const stopPreviewRef = useRef(stopPreview)
  stopPreviewRef.current = stopPreview

  useEffect(
    () => () => {
      abortRef.current?.abort()
      listAbortRef.current?.abort()
      stopPreviewRef.current()
    },
    [],
  )

  useEffect(() => {
    if (open) {
      try {
        setCanEdit(hasComponents(currentFlowRef.current?.() ?? null))
      } catch {
        setCanEdit(false)
      }
      if (collapsedRef.current) {
        collapsedRef.current = false
        setCollapsed(false)
      }
      return
    }
    if (collapsedRef.current) return
    if (chatJobRef.current) cancelChatRef.current()
    abortRef.current?.abort()
    listAbortRef.current?.abort()
    stopPreviewRef.current()
  }, [open])

  useEffect(() => {
    if (!generating) return
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [generating])

  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView({ block: "nearest" })
  }, [failure])

  const idFor = (key: string) => `${baseId}-${key}`
  const describedBy = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(" ") || undefined

  const afterRender = (task: () => void) => {
    afterRenderRef.current.push(task)
    setRenderRequest((value) => value + 1)
  }

  const focusField = (field: Field) => afterRender(() => document.getElementById(idFor(field))?.focus())

  const focusMainAction = (target: View) =>
    afterRender(() => (target === "result" ? regenerateRef.current : submitRef.current)?.focus())

  const clearFieldError = (...fields: Field[]) =>
    setFieldErrors((current) => {
      if (!fields.some((field) => current[field])) return current
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })

  const changeProvider = (id: ProviderId) => {
    setProvider(id)
    setShowKey(false)
    clearFieldError("provider", "apiKey", "model")
  }

  const changeKey = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    const changed = value.trim() !== apiKey.trim()
    setKeys((current) => ({ ...current, [provider]: value }))
    if (changed) {
      setFetched((current) => (current[provider] ? { ...current, [provider]: undefined } : current))
      if (listing?.provider === provider) {
        listAbortRef.current?.abort()
        listAbortRef.current = null
        setListing(null)
      }
    }
    clearFieldError("apiKey")
  }

  const changeModel = (value: string) => {
    setModels((current) => ({ ...current, [provider]: value }))
    clearFieldError("model", "image")
  }

  const changeEffort = (value: string) => {
    const next = EFFORTS.find((entry) => entry === value)
    if (!next) return
    setEffortChoice(next)
    clearFieldError("effort")
  }

  const changeMode = (value: Mode) => {
    setMode(value)
    setFailure(null)
    clearFieldError("mode", "size", "count", "name")
  }

  const changeSize = (value: string) => {
    setSize(SIZE_OPTIONS.find((entry) => entry.value === value)?.value ?? "auto")
    clearFieldError("size", "count")
  }

  const keyError = (key: string) =>
    !key
      ? `Informe a chave da API ${info.of}.`
      : !KEY_CHARACTERS.test(key)
        ? "A chave da API tem caracteres inválidos."
        : key.length < MIN_KEY_LENGTH
          ? "A chave da API parece incompleta. Confira o valor copiado."
          : key.length > LIMITS.apiKey
            ? "A chave da API é longa demais."
            : ""

  const clearLoading = (target: Listing["provider"]) =>
    setListing((current) => (current?.provider === target && current.state === "loading" ? null : current))

  const fetchModels = async () => {
    const key = apiKey.trim()
    const invalidKey = keyError(key)
    if (invalidKey) {
      setFieldErrors((current) => ({ ...current, apiKey: invalidKey }))
      focusField("apiKey")
      return
    }
    listAbortRef.current?.abort()
    const controller = new AbortController()
    listAbortRef.current = controller
    const target = provider
    setListing({ provider: target, state: "loading" })
    try {
      const listedModels = await requestModels(target, key, controller.signal)
      if (controller.signal.aborted) {
        clearLoading(target)
        return
      }
      if (listedModels.ok) {
        setFetched((current) => ({ ...current, [target]: { key, models: listedModels.models } }))
        setListing({ provider: target, state: "done", count: listedModels.models.length })
      } else {
        setListing({ provider: target, state: "error", error: listedModels.error, details: listedModels.details })
      }
    } catch {
      if (controller.signal.aborted) {
        clearLoading(target)
        return
      }
      setListing({
        provider: target,
        state: "error",
        error: "Não foi possível buscar os modelos.",
        details: "Verifique a conexão e tente novamente.",
      })
    } finally {
      if (listAbortRef.current === controller) listAbortRef.current = null
    }
  }

  const blockedImageMessage = (attached: boolean) =>
    `O modelo ${currentModelName} não analisa imagens. ${attached ? "Escolha outro modelo ou remova a imagem." : "Escolha outro modelo para enviar uma imagem."}`

  const acceptImage = async (file: File | undefined) => {
    if (!file) return
    if (imageBlocked) {
      setFieldErrors((current) => ({ ...current, image: blockedImageMessage(false) }))
      return
    }
    if (!acceptsImage(file) || file.size > MAX_SOURCE_BYTES) {
      setFieldErrors((current) => ({ ...current, image: "Use uma imagem PNG, JPG ou WEBP de até 10 MB." }))
      return
    }
    const token = ++imageTokenRef.current
    setImageBusy(true)
    clearFieldError("image")
    try {
      const prepared = await prepareImage(file)
      if (token !== imageTokenRef.current) return
      if (!prepared) {
        setFieldErrors((current) => ({
          ...current,
          image: "A imagem continua grande demais depois da compressão. Use uma imagem menor.",
        }))
        return
      }
      setImage(prepared)
      clearFieldError("image", "description")
    } catch {
      if (token !== imageTokenRef.current) return
      setFieldErrors((current) => ({ ...current, image: "Não foi possível ler a imagem. Tente outro arquivo." }))
    } finally {
      if (token === imageTokenRef.current) setImageBusy(false)
    }
  }

  const openPicker = () => fileRef.current?.click()

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    void acceptImage(file)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (generating || imageBusy) {
      event.dataTransfer.dropEffect = "none"
      return
    }
    event.dataTransfer.dropEffect = "copy"
    setDragActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (!generating && !imageBusy) void acceptImage(event.dataTransfer.files?.[0])
  }

  const onPaste = (event: ClipboardEvent<HTMLFormElement>) => {
    if (generating || imageBusy || chatting) return
    const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith("image/"))
    if (!file || event.clipboardData.getData("text/plain")) return
    event.preventDefault()
    void acceptImage(file)
  }

  const removeImage = () => {
    imageTokenRef.current += 1
    setImage(null)
    setImageBusy(false)
    clearFieldError("image")
    focusField(imageBlocked ? "model" : "image")
  }

  const onPromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    const invalidKey = keyError(apiKey.trim())
    if (invalidKey) errors.apiKey = invalidKey
    if (!isModelId(model)) errors.model = "Escolha um modelo válido."
    else if (image && imageBlocked) errors.model = blockedImageMessage(true)
    if (imageBusy) errors.image = "Aguarde o preparo da imagem."
    if (!prompt.trim() && !image) {
      errors.description = editing
        ? "Descreva o que mudar no fluxo aberto ou envie uma imagem de referência."
        : "Descreva o atendimento ou envie uma imagem de referência."
    }
    else if (prompt.trim().length > LIMITS.prompt) {
      errors.description = `A descrição pode ter até ${formatNumber(LIMITS.prompt)} caracteres.`
    }
    if (!editing && size === "custom") {
      const value = Number(count.trim())
      if (!/^\d+$/.test(count.trim()) || value < COUNT_LIMITS.min || value > COUNT_LIMITS.max) {
        errors.count = `Informe de ${COUNT_LIMITS.min} a ${COUNT_LIMITS.max} componentes.`
      }
    }
    if (name.trim().length > LIMITS.name) errors.name = `O nome do fluxo pode ter até ${LIMITS.name} caracteres.`
    return errors
  }

  const rejectGeneration = (rejection: Rejection, origin: View) => {
    const field = failureField(rejection.code, rejection.field)
    if (field) {
      const message = [rejection.failure.title, rejection.failure.details].filter(Boolean).join(" ")
      setFieldErrors((current) => ({ ...current, [field]: message }))
      setView("form")
      focusField(field)
      return
    }
    setFailure(rejection.failure)
    focusMainAction(origin)
  }

  const collapse = () => {
    if (!abortRef.current || !liveRef.current) return
    collapsedRef.current = true
    setCollapsed(true)
    onOpenChange(false)
    afterRender(() => detailsRef.current?.focus())
  }

  const expand = () => {
    if (!collapsedRef.current) return
    collapsedRef.current = false
    setCollapsed(false)
    onOpenChange(true)
  }

  const beginJob = (kind: PreviewKind, live: boolean, chat: boolean): AbortController => {
    const controller = new AbortController()
    abortRef.current = controller
    liveRef.current = live
    chatJobRef.current = chat
    stopPreview()
    setRunningKind(kind)
    setGenerating(true)
    setProgress(null)
    setElapsed(0)
    setFailure(null)
    setNotice("")
    if (live) collapse()
    return controller
  }

  const endJob = (controller: AbortController) => {
    if (abortRef.current !== controller) return
    abortRef.current = null
    liveRef.current = false
    chatJobRef.current = false
    setGenerating(false)
    setProgress(null)
    if (collapsedRef.current) {
      collapsedRef.current = false
      setCollapsed(false)
    }
  }

  const runJob = async (
    controller: AbortController,
    request: GenerateRequest,
    editBase: AtendimentoFlow | null,
    live: boolean,
  ): Promise<JobOutcome | null> => {
    const kind: PreviewKind = editBase ? "edit" : "create"
    const current = () => abortRef.current === controller && !controller.signal.aborted
    if (live && editBase) showPreview(editBase, false, kind)
    const engine = await loadEngine()
    if (!current()) return null
    const build = editBase && engine ? (ri: unknown) => engine.previewEdit(editBase, ri) : engine?.previewFlow
    const feed = live && build ? previewFeed(build, (flow) => current() && showPreview(flow, false, kind)) : null
    feedRef.current = feed
    const outcome = await generateFlow(
      request,
      controller.signal,
      (next) => {
        if (abortRef.current === controller) setProgress(next)
      },
      feed ? (ri) => current() && feed.push(ri) : undefined,
      engine,
    )
    feed?.stop()
    if (!current()) return null
    if (!outcome.ok) return outcome
    let diff: FlowDiff | undefined
    if (editBase && engine) {
      try {
        diff = engine.diffFlows(editBase, outcome.received.flow)
      } catch {
        diff = undefined
      }
    }
    return { ok: true, received: outcome.received, diff }
  }

  const generate = async () => {
    if (abortRef.current) return
    const origin: View = showingResult ? "result" : "form"
    const errors = validate()
    const base = editing ? readCurrentFlow() : null
    if (editing && !hasComponents(base)) {
      errors.mode = "O fluxo aberto não tem componentes para editar. Escolha Criar fluxo novo."
      setCanEdit(false)
    }
    setFieldErrors(errors)
    const invalid = FIELD_ORDER.find((field) => errors[field])
    if (invalid) {
      setFailure(null)
      setView("form")
      focusField(invalid)
      return
    }

    const trimmedName = name.trim()
    const editBase = editing && hasComponents(base) ? base : null
    const kind: PreviewKind = editBase ? "edit" : "create"
    const request: GenerateRequest = {
      provider,
      model,
      apiKey: apiKey.trim(),
      prompt: prompt.trim(),
      image: image?.dataUrl ?? null,
      size: editBase ? "auto" : size,
      ...(!editBase && size === "custom" ? { count: Number(count.trim()) } : {}),
      ...(trimmedName ? { name: trimmedName } : {}),
      effort,
      fill,
      ...(editBase ? { mode: "edit" as const, base: editBase } : {}),
    }
    const context = {
      provider,
      modelName: currentModelName,
      prompt: request.prompt,
      image: image ? { name: image.name, bytes: image.bytes } : null,
      size: size === "custom" ? `Personalizado (${plural(Number(count.trim()), "componente", "componentes")})` : sizeOption.label,
      name: trimmedName,
      effort,
      fill,
      base: editBase,
    }

    const live = watch && canWatch
    const controller = beginJob(kind, live, false)
    if (!live) afterRender(() => cancelRef.current?.focus())

    const current = () => abortRef.current === controller && !controller.signal.aborted
    const reopen = () => {
      if (collapsedRef.current) expand()
    }

    try {
      const outcome = await runJob(controller, request, editBase, live)
      if (!outcome || !current()) return
      if (!outcome.ok) {
        stopPreview()
        reopen()
        rejectGeneration(outcome.rejection, origin)
        return
      }
      if (live) showPreview(outcome.received.flow, true, kind)
      reopen()
      setResult({
        ...outcome.received,
        ...context,
        mode: kind,
        diff: outcome.diff,
        model: outcome.received.model || model,
        generatedAt: new Date().toISOString(),
      })
      setView("result")
      afterRender(() => {
        bodyRef.current?.scrollTo({ top: 0 })
        importRef.current?.focus()
      })
    } catch {
      if (!current()) return
      stopPreview()
      reopen()
      setFailure({ title: "Não foi possível contatar o servidor.", details: "Verifique a conexão e tente novamente.", items: [] })
      focusMainAction(origin)
    } finally {
      endJob(controller)
    }
  }

  const chatInput = () => document.getElementById(idFor("chat"))?.querySelector<HTMLTextAreaElement>("textarea") ?? null

  const credentialErrors = (): FieldErrors => {
    const errors: FieldErrors = {}
    const invalidKey = keyError(apiKey.trim())
    if (invalidKey) errors.apiKey = invalidKey
    if (!isModelId(model)) errors.model = "Escolha um modelo válido."
    return errors
  }

  const checkCredentials = (): boolean => {
    const errors = credentialErrors()
    const invalid = FIELD_ORDER.find((field) => errors[field])
    if (!invalid) return true
    setFieldErrors((current) => ({ ...current, ...errors }))
    focusField(invalid)
    return false
  }

  const markChatField = (field: Field | undefined, message: string) => {
    if (!field || !CHAT_FIELDS.includes(field)) return
    setFieldErrors((current) => ({ ...current, [field]: message }))
  }

  const chatTurn = async (
    history: InterviewInput["history"],
    flow: AtendimentoFlow | null,
    signal: AbortSignal,
  ): Promise<InterviewTurnResult> => {
    const errors = credentialErrors()
    if (errors.apiKey || errors.model) {
      checkCredentials()
      return {
        ok: false,
        failure: {
          success: false,
          code: "invalid_request",
          error: errors.apiKey || errors.model || "Confira a chave da API e o modelo.",
          field: errors.apiKey ? "apiKey" : "model",
        },
      }
    }
    const result = await requestTurn({ provider, model, apiKey: apiKey.trim(), effort, fill, history, flow }, signal)
    if (!result.ok && !signal.aborted) {
      const field = failureField(result.failure.code, requestField(result.failure.field))
      markChatField(field, [result.failure.error, result.failure.details].filter(Boolean).join(" "))
    }
    return result
  }

  const finishChatJob = (controller: AbortController) => {
    if (abortRef.current !== controller) return
    controller.abort()
    stopPreview()
    const reopen = collapsedRef.current
    endJob(controller)
    if (reopen) onOpenChange(true)
  }

  const applyChat = (outcome: Extract<JobOutcome, { ok: true }>, editBase: AtendimentoFlow | null): InterviewRunSummary => {
    let flow: AtendimentoFlow
    try {
      flow = importFlow(outcome.received.flow)
    } catch (error) {
      stopPreview()
      return { ok: false, error: "O fluxo recebido não está no formato de Atendimento.", details: messageLines(error).join(" ") || undefined }
    }
    if (editBase) {
      const opened = readCurrentFlow()
      if (!opened || documentKey(opened) !== documentKey(editBase)) {
        stopPreview()
        return { ok: false, error: "O fluxo aberto mudou durante a edição.", details: "Tente de novo para editar a versão atual do fluxo." }
      }
      if (!onWorkflowEdited?.(flow)) {
        stopPreview()
        return { ok: false, error: "O editor não aceitou a edição.", details: "Confira o aviso exibido no editor e tente novamente." }
      }
      stopPreview()
      const diff = outcome.diff
      const changes = outcome.received.changes ?? (diff ? { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length } : undefined)
      return changes ? { ok: true, changes } : { ok: true }
    }
    if (!onWorkflowGenerated(flow)) {
      stopPreview()
      return { ok: false, error: "O editor não aceitou o fluxo.", details: "Confira o aviso exibido no editor e tente novamente." }
    }
    stopPreview()
    return { ok: true, components: flow.nodes.filter((node) => node.data.type !== START_TYPE).length }
  }

  const chatRun = async (action: BuildAction, plan: string, signal: AbortSignal): Promise<InterviewRunSummary> => {
    if (signal.aborted) return { ok: false }
    if (abortRef.current) return { ok: false, error: "Aguarde a geração em andamento terminar." }
    if (!checkCredentials()) return { ok: false, error: "Confira a chave da API e o modelo antes de montar o fluxo." }
    const opened = action === "edit" && editAvailable ? readCurrentFlow() : null
    const editBase = hasComponents(opened) ? opened : null
    const request: GenerateRequest = {
      provider,
      model,
      apiKey: apiKey.trim(),
      prompt: plan.trim(),
      image: null,
      size: "auto",
      effort,
      fill,
      ...(editBase ? { mode: "edit" as const, base: editBase } : {}),
    }
    const live = watch && canWatch
    const controller = beginJob(editBase ? "edit" : "create", live, true)
    const stop = () => finishChatJob(controller)
    signal.addEventListener("abort", stop, { once: true })
    const current = () => abortRef.current === controller && !controller.signal.aborted
    try {
      const outcome = await runJob(controller, request, editBase, live)
      if (!outcome || !current()) return { ok: false }
      if (!outcome.ok) {
        stopPreview()
        const shown = outcome.rejection.failure
        markChatField(failureField(outcome.rejection.code, outcome.rejection.field), [shown.title, shown.details].filter(Boolean).join(" "))
        return { ok: false, error: shown.title, details: [shown.details, ...shown.items].filter(Boolean).join(" ") || undefined }
      }
      return applyChat(outcome, editBase)
    } catch {
      if (!current()) return { ok: false }
      stopPreview()
      return { ok: false, error: "Não foi possível contatar o servidor.", details: "Verifique a conexão e tente novamente." }
    } finally {
      signal.removeEventListener("abort", stop)
      if (editAvailable) setCanEdit(hasComponents(readCurrentFlow()))
      if (abortRef.current === controller) {
        const reopen = collapsedRef.current
        endJob(controller)
        if (reopen) onOpenChange(true)
      }
    }
  }

  const openedFlow = (): AtendimentoFlow | null => {
    const flow = readCurrentFlow()
    return hasComponents(flow) ? flow : null
  }

  const interview = useInterview({ turn: chatTurn, run: chatRun, getFlow: openedFlow })
  cancelChatRef.current = interview.cancel

  const chat: InterviewHandle = {
    ...interview,
    send: (value) => (!value.trim() || interview.busy || checkCredentials() ? interview.send(value) : false),
    buildNow: () => (!interview.canBuild || checkCredentials() ? interview.buildNow() : false),
    retry: () => (interview.status !== "error" || checkCredentials() ? interview.retry() : false),
  }

  const cancelGeneration = () => {
    const controller = abortRef.current
    if (!controller) return
    if (chatJobRef.current) {
      interview.cancel()
      finishChatJob(controller)
      return
    }
    abortRef.current = null
    liveRef.current = false
    controller.abort()
    stopPreview()
    setGenerating(false)
    setProgress(null)
    if (collapsedRef.current) {
      collapsedRef.current = false
      setCollapsed(false)
      toast({ title: "Geração cancelada", description: "O fluxo aberto no editor não foi alterado." })
      afterRender(() => document.querySelector<HTMLElement>("[data-ai-trigger]")?.focus())
      return
    }
    setNotice("Geração cancelada.")
    focusMainAction(showingResult ? "result" : "form")
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (chatting) {
      chatInput()?.focus()
      return
    }
    void generate()
  }

  const close = () => onOpenChange(false)

  const discardResult = () => {
    stopPreview()
    setResult(null)
    setView("form")
    setFailure(null)
    setNotice(result?.mode === "edit" ? "Edição descartada. O fluxo aberto não mudou." : "Fluxo descartado.")
    focusField("description")
  }

  const editRequest = () => {
    setView("form")
    setFailure(null)
    setNotice("")
    focusField("description")
  }

  const showResult = () => {
    setView("result")
    setFailure(null)
    setNotice("")
    afterRender(() => {
      bodyRef.current?.scrollTo({ top: 0 })
      importRef.current?.focus()
    })
  }

  const importResult = () => {
    if (!result) return
    let flow: AtendimentoFlow
    try {
      flow = importFlow(result.flow)
    } catch (error) {
      setFailure({ title: "Não foi possível importar o fluxo.", items: messageLines(error) })
      return
    }
    if (!onWorkflowGenerated(flow)) {
      setFailure({
        title: "O editor não aceitou o fluxo.",
        details: "Confira o aviso exibido no editor e tente novamente.",
        items: [],
      })
      return
    }
    stopPreview()
    resetOnCloseRef.current = true
    onOpenChange(false)
  }

  const applyResult = () => {
    if (!result || result.mode !== "edit") return
    let flow: AtendimentoFlow
    try {
      flow = importFlow(result.flow)
    } catch (error) {
      setFailure({ title: "Não foi possível aplicar a edição.", items: messageLines(error) })
      return
    }
    const current = readCurrentFlow()
    if (!current || !result.base || documentKey(current) !== documentKey(result.base)) {
      setFailure({
        title: "O fluxo aberto mudou depois desta edição.",
        details: "Use Gerar novamente para editar a versão atual do fluxo.",
        items: [],
      })
      return
    }
    if (!onWorkflowEdited?.(flow)) {
      setFailure({
        title: "O editor não aceitou a edição.",
        details: "Confira o aviso exibido no editor e tente novamente.",
        items: [],
      })
      return
    }
    stopPreview()
    resetOnCloseRef.current = true
    onOpenChange(false)
  }

  const downloadResult = () => {
    if (!result) return
    try {
      const flow = stampExport(importFlow(result.flow))
      const fileName = safeFileName(exportFileName(flow))
      downloadJson(exportFlow(flow), fileName)
      toast({ title: "Arquivo baixado", description: fileName })
    } catch (error) {
      setFailure({ title: "Não foi possível exportar o JSON.", items: messageLines(error) })
    }
  }

  const downloadPrompt = () => {
    if (!result || !summary) return
    const fileName = safeFileName(`${result.flow.name.trim() || "Atendimento"}-prompt-${result.generatedAt.slice(0, 10)}.md`)
    downloadText(promptDocument(result, summary), fileName, "text/markdown;charset=utf-8")
    toast({ title: "Arquivo baixado", description: fileName })
  }

  const handleOpenAutoFocus = (event: Event) => {
    const invalid = FIELD_ORDER.find((field) => fieldErrors[field])
    const target = generating
      ? cancelRef.current
      : invalid
        ? document.getElementById(idFor(invalid))
        : failure
          ? (showingResult ? regenerateRef : submitRef).current
          : showingResult
            ? importRef.current
            : chatting && apiKey.trim()
              ? chatInput()
              : document.getElementById(idFor(apiKey.trim() ? "description" : "apiKey"))
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  const handleCloseAutoFocus = (event: Event) => {
    if (collapsedRef.current || openRef.current) {
      event.preventDefault()
      if (collapsedRef.current) detailsRef.current?.focus()
      return
    }
    setFailure(null)
    setFieldErrors({})
    setShowKey(false)
    setDragActive(false)
    setNotice("")
    if (!resetOnCloseRef.current) return
    resetOnCloseRef.current = false
    imageTokenRef.current += 1
    setPrompt("")
    setImage(null)
    setImageBusy(false)
    setName("")
    setResult(null)
    setView("form")
  }

  const handleInteractOutside = (event: Event) => {
    if (generating) event.preventDefault()
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && abortRef.current) {
      if (liveRef.current) collapse()
      else cancelGeneration()
      return
    }
    onOpenChange(next)
  }

  const handleContentKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && /^[yz]$/i.test(event.key)) event.stopPropagation()
  }

  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    if (!abortRef.current) return
    event.preventDefault()
    if (liveRef.current) collapse()
    else cancelGeneration()
  }

  const listingStatus = !providerListing
    ? ""
    : providerListing.state === "loading"
      ? "Buscando modelos."
      : providerListing.state === "done"
        ? providerListing.count
          ? `${plural(providerListing.count, "modelo disponível", "modelos disponíveis")} na sua conta.`
          : "Nenhum modelo compatível encontrado nesta conta."
        : ""
  const listingBusy = providerListing?.state === "loading"
  const modelHint = `ID ${model}.${vision === true ? " Analisa imagens." : vision === false ? " Não analisa imagens." : ""}`
  const effortHint = EFFORT_OPTIONS[effort].hint
  const liveGenerating = generating && liveRef.current
  const runningEdit = runningKind === "edit"
  const resultTitle = !summary
    ? ""
    : summary.editing
      ? result?.partial
        ? "Edição feita em parte"
        : summary.issues.length
          ? `Edição pronta com ${plural(summary.issues.length, "pendência", "pendências")}`
          : "Edição pronta sem pendências"
      : result?.partial
        ? "Fluxo gerado em parte"
        : summary.issues.length
          ? `Fluxo gerado com ${plural(summary.issues.length, "pendência", "pendências")}`
          : "Fluxo gerado sem pendências"
  const ToneIcon = summary ? TONES[summary.tone].Icon : CheckCircle2

  const requestOptions = (
    <>
      {canWatch ? (
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-accent/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
            watch ? "border-flow-accent/50 bg-flow-accent/10" : "border-flow-border bg-flow-soft hover:border-flow-accent/60",
          )}
        >
          <input
            id={idFor("watch")}
            type="checkbox"
            checked={watch}
            onChange={(event) => setWatch(event.target.checked)}
            aria-describedby={idFor("watch-hint")}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-flow-accent disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-flow-fg">Acompanhar no canvas</span>
            <span id={idFor("watch-hint")} className="block text-[11px] leading-4 text-flow-muted">
              {chatting
                ? "Durante a montagem, esta janela vira um painel pequeno e o fluxo aparece no editor conforme é criado. Ao terminar, o fluxo fica no editor e a conversa continua aqui."
                : editing
                  ? "Durante a edição, esta janela vira um painel pequeno e as mudanças aparecem no fluxo aberto conforme chegam. Ao terminar, o resultado abre aqui para você revisar e aplicar."
                  : "Durante a geração, esta janela vira um painel pequeno e o fluxo aparece no editor conforme é criado. Ao terminar, o resultado abre aqui para você revisar e importar."}
            </span>
          </span>
        </label>
      ) : null}

      <div>
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-accent/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
            fill ? "border-flow-accent/50 bg-flow-accent/10" : "border-flow-border bg-flow-soft hover:border-flow-accent/60",
          )}
        >
          <input
            id={idFor("fill")}
            type="checkbox"
            checked={fill}
            onChange={(event) => {
              setFill(event.target.checked)
              clearFieldError("fill")
            }}
            aria-describedby={describedBy(idFor("fill-hint"), fieldErrors.fill && idFor("fill-error"))}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-flow-accent disabled:cursor-not-allowed"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-flow-fg">Preencher todos os campos</span>
            <span id={idFor("fill-hint")} className="block text-[11px] leading-4 text-flow-muted">
              {fill ? FILL_HINTS.on : FILL_HINTS.off}
            </span>
          </span>
        </label>
        {fieldErrors.fill ? (
          <p id={idFor("fill-error")} className={ui.error}>
            {fieldErrors.fill}
          </p>
        ) : null}
      </div>
    </>
  )

  const panel =
    collapsed && generating && typeof document !== "undefined"
      ? createPortal(
          <section
            aria-label="Geração com IA"
            onKeyDown={handleContentKeyDown}
            className={cn(
              ui.overlay,
              "nokey fixed inset-x-4 bottom-4 z-50 border-flow-accent/40 p-3 sm:inset-x-auto sm:bottom-14 sm:left-4 sm:w-[17.5rem]",
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-accent/15 text-flow-accent"
                aria-hidden="true"
              >
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="truncate text-xs font-semibold text-flow-fg">
                    {runningEdit ? "Editando fluxo com IA" : "Gerando fluxo com IA"}
                  </h2>
                  <span aria-hidden="true" className="shrink-0 text-[11px] tabular-nums text-flow-muted">
                    {clock(elapsed)}
                  </span>
                </div>
                <p aria-hidden="true" className="mt-0.5 text-[11px] leading-4 text-flow-muted">
                  {progressText(progress, liveCounts, runningEdit)}
                </p>
                <p role="status" className="sr-only">
                  {stageText(progress, runningEdit)}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={cancelGeneration} className={ui.button}>
                Cancelar
              </button>
              <button ref={detailsRef} type="button" onClick={expand} className={ui.accentButton}>
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                Ver detalhes
              </button>
            </div>
          </section>,
          document.body,
        )
      : null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          onKeyDown={handleContentKeyDown}
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          onInteractOutside={handleInteractOutside}
          onEscapeKeyDown={handleEscapeKeyDown}
          className={cn(
            ui.dialog,
            "nokey flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl",
          )}
        >
          <DialogHeader className="flex-row items-start gap-3 space-y-0 border-b border-flow-border px-5 py-4 pr-12 text-left">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent"
              aria-hidden="true"
            >
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold leading-6 tracking-normal text-flow-fg">
                Gerar fluxo com IA
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs leading-5 text-flow-muted">
                {chatting
                  ? "Escolha a IA e converse com ela. A IA pergunta o que faltar e monta o fluxo no editor com as suas respostas, no formato JSON de Atendimento."
                  : "Escolha a IA, descreva o atendimento e revise o resultado antes de importar. O fluxo segue o formato JSON de Atendimento e pode usar qualquer componente do editor."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div ref={bodyRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {showingResult ? (
              <section
                aria-labelledby={idFor("result-title")}
                aria-busy={generating || undefined}
                className={cn("space-y-5 transition-opacity", generating && "pointer-events-none opacity-60")}
              >
                <div className={cn("flex items-start gap-3 rounded-xl border p-3", TONES[summary.tone].box)}>
                  <span
                    className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONES[summary.tone].badge)}
                    aria-hidden="true"
                  >
                    <ToneIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 id={idFor("result-title")} className="text-sm font-semibold text-flow-fg">
                      {resultTitle}
                    </h3>
                    <p className="mt-0.5 break-words text-xs font-medium text-flow-muted-strong">
                      {result.flow.name || "Fluxo sem nome"}
                    </p>
                    {result.flow.description ? (
                      <p className="mt-0.5 break-words text-xs leading-5 text-flow-muted">{result.flow.description}</p>
                    ) : null}
                    {result.partial ? (
                      <p className="mt-1 text-xs font-medium text-flow-warning">
                        A geração foi interrompida antes do fim. Os componentes que chegaram completos foram mantidos.
                        Revise o fluxo e complete o que faltar no editor ou gere novamente.
                      </p>
                    ) : null}
                    {summary.blocking ? (
                      <p id={idFor("blocking")} className="mt-1 text-xs font-medium text-flow-danger">
                        {plural(summary.blocking, "pendência impede", "pendências impedem")} a exportação do JSON. Corrija
                        no editor.
                      </p>
                    ) : null}
                    <ul
                      aria-label={summary.editing ? "Resumo do fluxo editado" : "Resumo do fluxo gerado"}
                      className="mt-2 flex flex-wrap gap-1.5"
                    >
                      <li className={ui.chip}>{plural(summary.components, "componente", "componentes")}</li>
                      <li className={ui.chip}>{plural(result.flow.edges.length, "conexão", "conexões")}</li>
                      <li className={ui.chip}>{result.modelName}</li>
                      <li className={ui.chip}>Esforço {EFFORT_OPTIONS[result.effort].label.toLowerCase()}</li>
                      <li className={ui.chip}>{plural(result.rounds, "rodada", "rodadas")}</li>
                      {result.usage ? (
                        <li
                          className={ui.chip}
                          title={`Entrada: ${formatNumber(result.usage.inputTokens)}. Saída: ${formatNumber(result.usage.outputTokens)}.`}
                        >
                          {plural(result.usage.totalTokens, "token", "tokens")}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </div>

                {summary.editing ? (
                  <div>
                    <h3 id={idFor("changes-title")} className={ui.sectionTitle}>
                      Mudanças no fluxo aberto
                    </h3>
                    <ul aria-labelledby={idFor("changes-title")} className="mt-2 flex flex-wrap gap-1.5">
                      {changeLabels(summary.changes).map((label, index) => (
                        <li key={label} className={cn(ui.chip, "inline-flex items-center gap-1.5")}>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              index === 0 ? "bg-flow-success" : index === 1 ? "bg-flow-accent" : "bg-flow-danger",
                            )}
                          />
                          {label}
                        </li>
                      ))}
                    </ul>
                    {summary.removed.length > 0 ? (
                      <p className={ui.hint}>
                        Removidos por deixarem de ser alcançados a partir do início:{" "}
                        {summary.removed.map((node) => `${getComponentLabel(node.data.type)} · ID ${node.id}`).join(", ")}.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {summary.types.length > 0 ? (
                  <div>
                    <h3 id={idFor("types-title")} className={ui.sectionTitle}>
                      Tipos usados
                    </h3>
                    <ul aria-labelledby={idFor("types-title")} className="mt-2 flex flex-wrap gap-1.5">
                      {summary.types.map((entry) => (
                        <li key={entry.type} className={cn(ui.chip, "inline-flex items-center gap-1.5")}>
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          {entry.label}
                          <span className="sr-only">: </span>
                          <span className="font-semibold text-flow-fg">{entry.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {summary.groups.length > 0 ? (
                  <section aria-labelledby={idFor("issues-title")} className="space-y-2">
                    <h3 id={idFor("issues-title")} className={ui.sectionTitle}>
                      Pendências
                    </h3>
                    {summary.groups.map((group) => (
                      <div key={group.scope} className="overflow-hidden rounded-xl border border-flow-border bg-flow-surface">
                        <div className="border-b border-flow-border bg-flow-soft px-3 py-2">
                          <h4 id={idFor(`group-${group.scope}`)} className="text-xs font-semibold text-flow-fg">
                            {group.title} <span className="font-normal text-flow-muted">({group.items.length})</span>
                          </h4>
                          <p className="text-[11px] leading-4 text-flow-muted">{group.hint}</p>
                        </div>
                        <ul aria-labelledby={idFor(`group-${group.scope}`)} className="divide-y divide-flow-border">
                          {group.items.map((issue, index) => {
                            const subject = issueSubject(issue, summary.byId)
                            return (
                              <li key={`${issue.nodeId ?? "fluxo"}-${index}`} className="flex items-start gap-2 px-3 py-2">
                                <SeverityIcon severity={issue.severity} />
                                <p className="min-w-0 break-words text-xs leading-5 text-flow-muted-strong">
                                  <span className="sr-only">{issue.severity === "error" ? "Erro: " : "Aviso: "}</span>
                                  {subject ? <span className="font-semibold text-flow-fg">{subject}: </span> : null}
                                  {issue.message}
                                </p>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </section>
                ) : null}

                <div>
                  <h3 id={idFor("preview-title")} className={ui.sectionTitle}>
                    Prévia dos componentes
                  </h3>
                  <ol
                    aria-labelledby={idFor("preview-title")}
                    className="mt-2 overflow-hidden rounded-xl border border-flow-border bg-flow-surface"
                  >
                    {summary.nodes.map((node) => {
                      const type = node.data.type
                      const start = type === START_TYPE
                      const color = nodeColor(type)
                      const Icon = componentIcon(type)
                      const detail = start ? "Início do atendimento" : nodeSummary(node.data)
                      const nodeIssues = summary.byNode.get(node.id) ?? []
                      const mark = summary.marks.get(node.id)
                      return (
                        <li key={node.id} className="flex items-start gap-3 border-t border-flow-border px-3 py-2 first:border-t-0">
                          <span aria-hidden="true" className="mt-0.5 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          <Icon
                            aria-hidden="true"
                            className="mt-1 h-4 w-4 shrink-0"
                            style={{ color: start ? color : categoryTint(color) }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-flow-fg">{getComponentLabel(type)}</p>
                            {detail ? (
                              <p className="line-clamp-2 break-words text-[11px] leading-4 text-flow-muted">{detail}</p>
                            ) : null}
                            {nodeIssues.length > 0 ? (
                              <ul aria-label={`Pendências do componente ${node.id}`} className="mt-1 space-y-0.5">
                                {nodeIssues.map((issue, index) => (
                                  <li key={`${node.id}-${index}`} className="flex items-start gap-1.5 text-[11px] leading-4">
                                    <SeverityIcon severity={issue.severity} />
                                    <span className={issue.severity === "error" ? "text-flow-danger" : "text-flow-muted-strong"}>
                                      <span className="sr-only">{issue.severity === "error" ? "Erro: " : "Aviso: "}</span>
                                      {issue.message}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          {mark ? (
                            <span
                              className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold", MARKS[mark].className)}
                            >
                              {MARKS[mark].label}
                            </span>
                          ) : null}
                          <span className="shrink-0 rounded-md bg-flow-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-flow-muted">
                            ID {node.id}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>

                <p className={ui.hint}>
                  {summary.editing
                    ? "Aplicar alterações atualiza o fluxo aberto no editor. Para voltar ao fluxo anterior, use Desfazer (Ctrl+Z)."
                    : "Importar abre este fluxo no editor e guarda o fluxo que estava aberto em Meus fluxos."}
                </p>
              </section>
            ) : (
              <form id={idFor("form")} noValidate onSubmit={submit} onPaste={onPaste} className="space-y-6">
                <fieldset disabled={generating} aria-labelledby={idFor("ai-title")} className="min-w-0 space-y-4">
                  <h3 id={idFor("ai-title")} className={ui.sectionTitle}>
                    Modelo de IA
                  </h3>

                  <div>
                    <p id={idFor("provider-label")} className={ui.label}>
                      Provedor de IA
                    </p>
                    <div
                      role="radiogroup"
                      aria-labelledby={idFor("provider-label")}
                      aria-describedby={fieldErrors.provider ? idFor("provider-error") : undefined}
                      className={cn("grid grid-cols-2 gap-2", PROVIDERS.length > 4 ? "sm:grid-cols-3" : "sm:grid-cols-4")}
                    >
                      {PROVIDERS.map((entry) => {
                        const checked = entry.id === provider
                        const hasKey = Boolean(keys[entry.id]?.trim())
                        return (
                          <label
                            key={entry.id}
                            className={cn(
                              "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-accent/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                              checked
                                ? "border-flow-accent bg-flow-accent/10"
                                : "border-flow-border bg-flow-surface hover:border-flow-accent/60",
                            )}
                          >
                            <input
                              id={checked ? idFor("provider") : undefined}
                              type="radio"
                              name={idFor("provider-choice")}
                              value={entry.id}
                              checked={checked}
                              onChange={() => changeProvider(entry.id)}
                              aria-label={entry.name}
                              aria-describedby={describedBy(idFor(`vendor-${entry.id}`), hasKey && idFor(`key-${entry.id}`))}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition",
                                checked ? "bg-flow-accent text-white" : "bg-flow-soft text-flow-muted-strong",
                              )}
                            >
                              <Cpu className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-flow-fg">{entry.name}</span>
                              <span id={idFor(`vendor-${entry.id}`)} className="block truncate text-[11px] leading-4 text-flow-muted">
                                {entry.vendor}
                              </span>
                            </span>
                            {hasKey ? (
                              <>
                                <KeyRound className="h-3.5 w-3.5 shrink-0 text-flow-success" aria-hidden="true" />
                                <span id={idFor(`key-${entry.id}`)} className="sr-only">
                                  Chave informada
                                </span>
                              </>
                            ) : null}
                          </label>
                        )
                      })}
                    </div>
                    {fieldErrors.provider ? (
                      <p id={idFor("provider-error")} className={ui.error}>
                        {fieldErrors.provider}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor={idFor("apiKey")} className={ui.label}>
                      Chave da API {info.of}
                    </label>
                    <div className="relative">
                      <input
                        id={idFor("apiKey")}
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={changeKey}
                        placeholder={info.keyPlaceholder}
                        maxLength={LIMITS.apiKey}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        aria-invalid={fieldErrors.apiKey ? true : undefined}
                        aria-describedby={describedBy(
                          idFor("apiKey-hint"),
                          warning && idFor("apiKey-warning"),
                          fieldErrors.apiKey && idFor("apiKey-error"),
                        )}
                        className={cn(ui.input, "pr-10 font-mono", fieldBase, fieldErrors.apiKey && invalidField)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((current) => !current)}
                        aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                        aria-controls={idFor("apiKey")}
                        title={showKey ? "Ocultar chave" : "Mostrar chave"}
                        className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                    <p id={idFor("apiKey-hint")} className={ui.hint}>
                      A chave fica só nesta página, não é salva e serve apenas para chamar a API {info.of}.
                    </p>
                    {warning ? (
                      <p id={idFor("apiKey-warning")} className={warningText}>
                        {warning}
                      </p>
                    ) : null}
                    {fieldErrors.apiKey ? (
                      <p id={idFor("apiKey-error")} className={ui.error}>
                        {fieldErrors.apiKey}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor={idFor("model")} className={ui.label}>
                      Modelo
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <FlowSelect
                        key={provider}
                        id={idFor("model")}
                        value={model}
                        onValueChange={changeModel}
                        placeholder="Selecione um modelo"
                        options={modelOptions}
                        aria-invalid={fieldErrors.model ? true : undefined}
                        aria-describedby={describedBy(
                          idFor("model-hint"),
                          listingStatus && idFor("models-status"),
                          fieldErrors.model && idFor("model-error"),
                        )}
                        className={cn("min-w-0 sm:flex-1", fieldErrors.model && invalidField)}
                      />
                      <button
                        type="button"
                        onClick={() => void fetchModels()}
                        disabled={!apiKey.trim() || listingBusy}
                        aria-describedby={idFor("models-status")}
                        className={cn(ui.button, "h-9 justify-center")}
                      >
                        {listingBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        )}
                        Buscar modelos da API
                      </button>
                    </div>
                    <p id={idFor("model-hint")} className={ui.hint}>
                      {modelHint}
                      {apiKey.trim() ? "" : " Informe a chave para buscar os modelos liberados na sua conta."}
                    </p>
                    <p id={idFor("models-status")} role="status" className={cn(ui.hint, !listingStatus && "sr-only")}>
                      {listingStatus}
                    </p>
                    {providerListing?.state === "error" ? (
                      <p role="alert" className={ui.error}>
                        {[providerListing.error, providerListing.details].filter(Boolean).join(" ")}
                      </p>
                    ) : null}
                    {fieldErrors.model ? (
                      <p id={idFor("model-error")} className={ui.error}>
                        {fieldErrors.model}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:w-1/2 sm:pr-2">
                    <label htmlFor={idFor("effort")} className={ui.label}>
                      Esforço
                    </label>
                    <FlowSelect
                      id={idFor("effort")}
                      value={effort}
                      onValueChange={changeEffort}
                      options={effortOptions}
                      aria-invalid={fieldErrors.effort ? true : undefined}
                      aria-describedby={describedBy(idFor("effort-hint"), fieldErrors.effort && idFor("effort-error"))}
                      className={fieldErrors.effort ? invalidField : undefined}
                    />
                    <p id={idFor("effort-hint")} className={ui.hint}>
                      {effortHint}
                    </p>
                    {fieldErrors.effort ? (
                      <p id={idFor("effort-error")} className={ui.error}>
                        {fieldErrors.effort}
                      </p>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset disabled={generating} aria-labelledby={idFor("request-title")} className="min-w-0 space-y-4">
                  <h3 id={idFor("request-title")} className={ui.sectionTitle}>
                    Pedido
                  </h3>

                  <div>
                    <p id={idFor("mode-label")} className={ui.label}>
                      O que fazer
                    </p>
                    <div
                      role="radiogroup"
                      aria-labelledby={idFor("mode-label")}
                      aria-describedby={fieldErrors.mode ? idFor("mode-error") : undefined}
                      className={cn("grid gap-2", modeOptions.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
                    >
                      {modeOptions.map((entry) => {
                        const checked = entry.value === activeMode
                        const blocked = entry.value === "edit" && !canEdit
                        const Icon = entry.Icon
                        return (
                          <label
                            key={entry.value}
                            title={blocked ? EDIT_BLOCKED : undefined}
                            className={cn(
                              "flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-accent/30 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                              checked
                                ? "border-flow-accent bg-flow-accent/10"
                                : "border-flow-border bg-flow-surface hover:border-flow-accent/60",
                            )}
                          >
                            <input
                              id={checked ? idFor("mode") : undefined}
                              type="radio"
                              name={idFor("mode-choice")}
                              value={entry.value}
                              checked={checked}
                              disabled={blocked}
                              onChange={() => changeMode(entry.value)}
                              aria-label={entry.label}
                              aria-describedby={idFor(`mode-${entry.value}-hint`)}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition",
                                checked ? "bg-flow-accent text-white" : "bg-flow-soft text-flow-muted-strong",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold text-flow-fg">{entry.label}</span>
                              <span id={idFor(`mode-${entry.value}-hint`)} className="block text-[11px] leading-4 text-flow-muted">
                                {blocked ? EDIT_BLOCKED : entry.hint}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {fieldErrors.mode ? (
                      <p id={idFor("mode-error")} className={ui.error}>
                        {fieldErrors.mode}
                      </p>
                    ) : null}
                  </div>

                  <div hidden={chatting}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <label htmlFor={idFor("description")} className={cn(ui.label, "mb-0")}>
                        {editing ? "O que mudar no fluxo aberto" : "Descrição do atendimento"}
                      </label>
                      <span aria-hidden="true" className="text-[11px] tabular-nums text-flow-muted">
                        {formatNumber(prompt.length)}/{formatNumber(LIMITS.prompt)}
                      </span>
                    </div>
                    <textarea
                      id={idFor("description")}
                      value={prompt}
                      onChange={(event) => {
                        setPrompt(event.target.value)
                        clearFieldError("description")
                      }}
                      onKeyDown={onPromptKeyDown}
                      rows={6}
                      maxLength={LIMITS.prompt}
                      placeholder={
                        editing
                          ? "Ex.: No menu principal, acrescente a opção Segunda via de boleto, que envia o link do boleto e volta ao menu. Troque a mensagem de boas-vindas para citar o horário das 8h às 18h."
                          : "Ex.: Clínica médica. Boas-vindas com o nome do contato, atendimento de segunda a sexta das 8h às 18h e um menu para agendar consulta, falar com a recepção ou encerrar. Fora do horário, avisar e encerrar."
                      }
                      aria-invalid={fieldErrors.description ? true : undefined}
                      aria-describedby={describedBy(
                        idFor("description-hint"),
                        fieldErrors.description && idFor("description-error"),
                      )}
                      className={cn(ui.textarea, "min-h-32 resize-y", fieldBase, fieldErrors.description && invalidField)}
                    />
                    <p id={idFor("description-hint")} className={ui.hint}>
                      {editing
                        ? "Diga o que acrescentar, trocar ou remover. O que o pedido não citar fica como está, com as mesmas posições e conexões."
                        : "Informe o objetivo, as etapas, as opções do menu e os dados que o fluxo deve pedir."}{" "}
                      Até {formatNumber(LIMITS.prompt)} caracteres. Ctrl+Enter {editing ? "edita o fluxo" : "gera o fluxo"}.
                    </p>
                    {fieldErrors.description ? (
                      <p id={idFor("description-error")} className={ui.error}>
                        {fieldErrors.description}
                      </p>
                    ) : null}
                  </div>

                  <div hidden={chatting}>
                    <p className={ui.label}>
                      Imagem de referência <span className="font-normal text-flow-muted">(opcional)</span>
                    </p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      onChange={onFileChange}
                      className="hidden"
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
                      {image ? (
                        <div
                          className={cn(
                            "space-y-3 rounded-xl border border-flow-border bg-flow-soft p-3 transition",
                            dragActive && "border-flow-accent bg-flow-accent/10",
                          )}
                        >
                          <img
                            src={image.dataUrl}
                            alt="Prévia da imagem de referência"
                            className="mx-auto block max-h-48 w-auto rounded-lg border border-flow-border bg-flow-surface object-contain"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-flow-fg">{image.name}</p>
                              <p className="text-[11px] text-flow-muted">
                                {formatBytes(image.bytes)} · {image.width} × {image.height} px
                              </p>
                            </div>
                            <button
                              id={idFor("image")}
                              type="button"
                              onClick={openPicker}
                              disabled={imageBusy || imageBlocked}
                              aria-describedby={describedBy(
                                idFor("image-hint"),
                                fieldErrors.image && idFor("image-error"),
                              )}
                              className={ui.button}
                            >
                              {imageBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                              ) : (
                                <Upload className="h-4 w-4" aria-hidden="true" />
                              )}
                              Trocar imagem
                            </button>
                            <button type="button" onClick={removeImage} className={ui.dangerButton}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Remover
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          id={idFor("image")}
                          type="button"
                          onClick={openPicker}
                          disabled={imageBusy || imageBlocked}
                          aria-label="Selecionar imagem"
                          aria-describedby={describedBy(
                            idFor("image-hint"),
                            imageBlocked && idFor("image-blocked"),
                            fieldErrors.image && idFor("image-error"),
                          )}
                          className={cn(
                            "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-flow-border bg-flow-soft px-4 py-7 text-center transition hover:border-flow-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-flow-border",
                            dragActive && "border-flow-accent bg-flow-accent/10",
                            fieldErrors.image && "border-flow-danger",
                          )}
                        >
                          <span
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-flow-surface text-flow-muted-strong"
                            aria-hidden="true"
                          >
                            {imageBusy ? (
                              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Upload className="h-5 w-5" />
                            )}
                          </span>
                          <span className="text-sm font-semibold text-flow-fg">
                            {imageBusy ? "Preparando a imagem" : "Selecionar imagem"}
                          </span>
                          <span className="text-xs text-flow-muted">ou arraste e solte o arquivo aqui</span>
                        </button>
                      )}
                    </div>
                    <p id={idFor("image-hint")} className={ui.hint}>
                      PNG, JPG ou WEBP de até 10 MB. Você também pode colar a imagem. A IA reproduz as etapas, mensagens,
                      opções e conexões mostradas.
                    </p>
                    {imageBlocked ? (
                      <p id={idFor("image-blocked")} className={warningText}>
                        {blockedImageMessage(Boolean(image))}
                      </p>
                    ) : null}
                    {fieldErrors.image ? (
                      <p id={idFor("image-error")} role="alert" className={ui.error}>
                        {fieldErrors.image}
                      </p>
                    ) : null}
                  </div>

                  <div hidden={chatting} className={cn("gap-4 sm:grid-cols-2", chatting ? "hidden" : "grid")}>
                    <div hidden={editing}>
                      <label htmlFor={idFor("size")} className={ui.label}>
                        Tamanho do fluxo
                      </label>
                      <FlowSelect
                        id={idFor("size")}
                        value={size}
                        onValueChange={changeSize}
                        options={SIZE_OPTIONS}
                        aria-invalid={fieldErrors.size ? true : undefined}
                        aria-describedby={describedBy(idFor("size-hint"), fieldErrors.size && idFor("size-error"))}
                        className={fieldErrors.size ? invalidField : undefined}
                      />
                      <p id={idFor("size-hint")} className={ui.hint}>
                        {sizeOption.hint}
                      </p>
                      {fieldErrors.size ? (
                        <p id={idFor("size-error")} className={ui.error}>
                          {fieldErrors.size}
                        </p>
                      ) : null}
                      {size === "custom" ? (
                        <div className="mt-3">
                          <label htmlFor={idFor("count")} className={ui.label}>
                            Quantidade de componentes
                          </label>
                          <input
                            id={idFor("count")}
                            type="number"
                            inputMode="numeric"
                            min={COUNT_LIMITS.min}
                            max={COUNT_LIMITS.max}
                            step={1}
                            value={count}
                            onChange={(event) => {
                              setCount(event.target.value)
                              clearFieldError("count")
                            }}
                            aria-invalid={fieldErrors.count ? true : undefined}
                            aria-describedby={describedBy(idFor("count-hint"), fieldErrors.count && idFor("count-error"))}
                            className={cn(ui.input, "w-28", fieldBase, fieldErrors.count && invalidField)}
                          />
                          <p id={idFor("count-hint")} className={ui.hint}>
                            De {COUNT_LIMITS.min} a {COUNT_LIMITS.max}, sem contar o início.
                          </p>
                          {fieldErrors.count ? (
                            <p id={idFor("count-error")} className={ui.error}>
                              {fieldErrors.count}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label htmlFor={idFor("name")} className={ui.label}>
                        Nome do fluxo <span className="font-normal text-flow-muted">(opcional)</span>
                      </label>
                      <input
                        id={idFor("name")}
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value)
                          clearFieldError("name")
                        }}
                        maxLength={LIMITS.name}
                        autoComplete="off"
                        placeholder={editing ? "Mantém o nome atual" : "Ex.: Atendimento Clínica Exemplo"}
                        aria-invalid={fieldErrors.name ? true : undefined}
                        aria-describedby={describedBy(idFor("name-hint"), fieldErrors.name && idFor("name-error"))}
                        className={cn(ui.input, fieldBase, fieldErrors.name && invalidField)}
                      />
                      <p id={idFor("name-hint")} className={ui.hint}>
                        {editing ? "Vazio mantém o nome atual do fluxo." : "Sem nome, a IA sugere um a partir da descrição."}
                      </p>
                      {fieldErrors.name ? (
                        <p id={idFor("name-error")} className={ui.error}>
                          {fieldErrors.name}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {chatting ? null : requestOptions}
                </fieldset>
              </form>
            )}

            {chatting && !showingResult ? (
              <>
                <div id={idFor("chat")}>
                  <InterviewPanel
                    interview={chat}
                    starters={canEdit && editAvailable ? CHAT_STARTERS_EDIT : undefined}
                    intro={canEdit && editAvailable ? CHAT_INTRO_EDIT : CHAT_INTRO_CREATE}
                    className="h-[30rem] max-h-[70dvh]"
                  />
                </div>
                <fieldset disabled={generating} aria-label="Opções da conversa" className="min-w-0 space-y-4">
                  {requestOptions}
                </fieldset>
              </>
            ) : null}

            {failure ? (
              <div
                ref={failureRef}
                role="alert"
                className="rounded-xl border border-flow-danger/40 bg-flow-danger/10 px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flow-danger" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold text-flow-danger">{failure.title}</p>
                    {failure.details ? <p className="text-xs text-flow-muted-strong">{failure.details}</p> : null}
                    {failure.items.length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-flow-muted-strong">
                        {failure.items.map((item, index) => (
                          <li key={`${index}-${item}`} className="break-words">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-flow-border bg-flow-soft px-5 py-3">
            <div
              className={cn(
                "flex min-h-8 min-w-0 items-center gap-2 text-xs text-flow-muted",
                generating || notice ? "basis-full sm:flex-1 sm:basis-0" : "sr-only",
              )}
            >
              {generating ? (
                <>
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-flow-accent motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <span aria-hidden="true" className="min-w-0 flex-1 leading-4">
                    {progressText(progress, liveCounts, runningEdit)}
                  </span>
                  <span aria-hidden="true" className="shrink-0 tabular-nums">
                    {clock(elapsed)}
                  </span>
                </>
              ) : null}
              <p role="status" className={generating ? "sr-only" : "min-w-0 leading-4"}>
                {generating ? stageText(progress, runningEdit) : notice}
              </p>
            </div>

            {showingResult && !generating ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={editRequest} className={ui.button}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Editar solicitação
                  </button>
                  <button ref={regenerateRef} type="button" onClick={() => void generate()} className={ui.button}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Gerar novamente
                  </button>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={discardResult} className={ui.dangerButton}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Descartar
                  </button>
                  <button type="button" onClick={downloadPrompt} className={ui.button}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Baixar prompt
                  </button>
                  <button
                    type="button"
                    onClick={downloadResult}
                    disabled={summary.blocking > 0}
                    aria-describedby={summary.blocking > 0 ? idFor("blocking") : undefined}
                    title={summary.blocking > 0 ? "Corrija as pendências no editor para exportar." : undefined}
                    className={ui.button}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Baixar JSON
                  </button>
                  {summary.editing ? (
                    <button ref={importRef} type="button" onClick={applyResult} className={ui.primaryButton}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Aplicar alterações
                    </button>
                  ) : (
                    <button ref={importRef} type="button" onClick={importResult} className={ui.primaryButton}>
                      <FileJson className="h-4 w-4" aria-hidden="true" />
                      Importar para o editor
                    </button>
                  )}
                </div>
              </>
            ) : showingResult ? (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {liveGenerating ? (
                  <button type="button" onClick={collapse} className={ui.button}>
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                    Acompanhar no canvas
                  </button>
                ) : null}
                <button ref={cancelRef} type="button" onClick={cancelGeneration} className={ui.button}>
                  Cancelar geração
                </button>
              </div>
            ) : (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {liveGenerating ? (
                  <button type="button" onClick={collapse} className={ui.button}>
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                    Acompanhar no canvas
                  </button>
                ) : null}
                {result && !generating && !chatting ? (
                  <button type="button" onClick={showResult} className={ui.button}>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Ver resultado
                  </button>
                ) : null}
                <button ref={cancelRef} type="button" onClick={generating ? cancelGeneration : close} className={ui.button}>
                  {generating ? "Cancelar geração" : chatting ? "Voltar ao editor" : "Cancelar"}
                </button>
                {chatting ? null : (
                  <button
                    ref={submitRef}
                    type="submit"
                    form={idFor("form")}
                    disabled={generating}
                    className={ui.primaryButton}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    {editing ? "Editar fluxo" : "Gerar fluxo"}
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {panel}
    </>
  )
}
