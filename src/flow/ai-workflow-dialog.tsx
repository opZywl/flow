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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  KeyRound,
  Loader2,
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
  LIMITS,
  MAX_ROUNDS,
  SIZE_RANGES,
  type GenerateRequest,
  type GenerationIssue,
  type GenerationProgress,
  type GenerationSize,
  type GenerationStage,
  type GenerationUsage,
  type IssueScope,
  type ModelInfo,
  type ModelsRequest,
  type RequestField,
} from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, type ProviderId, type ProviderInfo } from "@/lib/atendimento/ai/providers"
import { START_TYPE, getCategory, getComponentColor, getComponentLabel } from "@/lib/atendimento/catalog"
import { downloadJson, downloadText } from "@/lib/atendimento/download"
import { exportFileName, exportFlow, importFlow, isObject, stampExport, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode, FlowIssue } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { categoryTint, componentIcon, nodeSummary } from "./nodes/atendimento-node"
import { ui } from "./ui"

type Field = "provider" | "apiKey" | "model" | "description" | "image" | "size" | "count" | "name"
type FieldErrors = Partial<Record<Field, string>>
type View = "form" | "result"
type Tone = "success" | "warning" | "danger"

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
}

type Outcome = { ok: true; received: Received } | { ok: false; rejection: Rejection }

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
}

interface AIWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkflowGenerated: (workflow: AtendimentoFlow) => boolean
}

const GENERATE_URL = "/api/generate-workflow"
const MODELS_URL = "/api/ai-models"
const FIELD_ORDER: readonly Field[] = ["provider", "apiKey", "model", "description", "image", "size", "count", "name"]
const REQUEST_FIELDS: Readonly<Record<RequestField, Field>> = {
  provider: "provider",
  apiKey: "apiKey",
  model: "model",
  prompt: "description",
  image: "image",
  size: "size",
  count: "count",
  name: "name",
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

const sizeRange = (size: keyof typeof SIZE_RANGES) => `${SIZE_RANGES[size][0]} a ${SIZE_RANGES[size][1]} componentes`

const SIZE_OPTIONS: ReadonlyArray<{ value: GenerationSize; label: string; hint: string }> = [
  { value: "auto", label: "Automático (recomendado)", hint: "A IA usa a quantidade de componentes que a descrição exigir." },
  { value: "small", label: `Pequeno (${sizeRange("small")})`, hint: "Para fluxos simples e diretos." },
  { value: "medium", label: `Médio (${sizeRange("medium")})`, hint: "Equilibrado para a maioria dos atendimentos." },
  { value: "large", label: `Grande (${sizeRange("large")})`, hint: "Para atendimentos com várias etapas e ramificações." },
  { value: "custom", label: "Personalizado", hint: "A IA gera a quantidade de componentes informada." },
]

const ISSUE_GROUPS: ReadonlyArray<Omit<IssueGroup, "items">> = [
  { scope: "ia", title: "Revise", hint: "Pontos que a IA não resolveu nas rodadas de correção." },
  {
    scope: "plataforma",
    title: "Complete no editor",
    hint: "Dados cadastrados na plataforma, como IDs, nomes e URLs, que a descrição não informou.",
  },
  { scope: "ajuste", title: "Ajustes automáticos", hint: "Mudanças feitas na montagem para manter o fluxo válido. Confira cada uma." },
]

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

function stageText(progress: GenerationProgress | null): string {
  if (!progress) return "Enviando a solicitação."
  const round = `rodada ${progress.round} de ${progress.maxRounds}`
  if (progress.stage === "preparando") return "Preparando a geração."
  if (progress.stage === "gerando") return `Gerando o fluxo, ${round}.`
  if (progress.stage === "montando") return "Montando o fluxo no formato de Atendimento."
  if (progress.stage === "validando") return "Validando o fluxo."
  return progress.pending
    ? `Corrigindo ${plural(progress.pending, "pendência", "pendências")}, ${round}.`
    : `Corrigindo as pendências, ${round}.`
}

function progressText(progress: GenerationProgress | null): string {
  if (progress?.stage !== "gerando" || (progress.nodes === undefined && progress.edges === undefined)) return stageText(progress)
  const nodes = plural(progress.nodes ?? 0, "componente", "componentes")
  const edges = plural(progress.edges ?? 0, "conexão", "conexões")
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
  if (response.ok && response.body && type.includes("ndjson")) return readEvents(response.body, onProgress)
  return readOutcome(await response.json().catch(() => null), response.status)
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
  return {
    components: result.flow.nodes.filter((node) => node.data.type !== START_TYPE).length,
    blocking: blocking.length,
    tone: blocking.length ? "danger" : issues.length ? "warning" : "success",
    issues,
    groups: ISSUE_GROUPS.map((group) => ({ ...group, items: issues.filter((issue) => issue.scope === group.scope) })).filter(
      (group) => group.items.length > 0,
    ),
    nodes: orderedNodes(result.flow),
    byId: new Map(result.flow.nodes.map((node) => [node.id, node])),
    byNode,
    types: usedTypes(result.flow),
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
    "# Prompt de geração do fluxo",
    "",
    `- Fluxo: ${result.flow.name || "Sem nome"}`,
    `- Provedor: ${provider ? `${provider.name} (${provider.vendor})` : result.provider}`,
    `- Modelo: ${result.modelName === result.model ? result.model : `${result.modelName} (${result.model})`}`,
    `- Tamanho: ${result.size}`,
    `- Componentes: ${formatNumber(summary.components)}, sem contar o início`,
    `- Conexões: ${formatNumber(result.flow.edges.length)}`,
    `- Rodadas: ${result.rounds}`,
    ...(usage
      ? [
          `- Tokens: ${formatNumber(usage.inputTokens)} de entrada, ${formatNumber(usage.outputTokens)} de saída, ${formatNumber(usage.totalTokens)} no total`,
        ]
      : []),
    `- Pendências: ${formatNumber(summary.issues.length)}`,
    `- Gerado em: ${result.generatedAt}`,
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

export default function AIWorkflowDialog({ open, onOpenChange, onWorkflowGenerated }: AIWorkflowDialogProps) {
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState("")
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
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

  const info = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0]
  const apiKey = keys[provider] ?? ""
  const listed = fetched[provider]?.models
  const model = models[provider] ?? info.presets[0].id
  const currentModelName = modelName(info, model, listed)
  const vision = modelVision(info, model, listed)
  const imageBlocked = vision === false
  const warning = keyWarning(info, apiKey)
  const sizeOption = SIZE_OPTIONS.find((entry) => entry.value === size) ?? SIZE_OPTIONS[0]
  const providerListing = listing?.provider === provider ? listing : null
  const accountModels = listed?.filter((entry) => !info.presets.some((preset) => preset.id === entry.id)) ?? []
  const knownModel = info.presets.some((preset) => preset.id === model) || accountModels.some((entry) => entry.id === model)
  const summary = useMemo(() => (result ? summarize(result) : null), [result])
  const showingResult = view === "result" && result !== null && summary !== null

  useEffect(() => {
    const tasks = afterRenderRef.current.splice(0)
    for (const task of tasks) task()
  })

  useEffect(() => {
    if (!open) return
    return () => {
      abortRef.current?.abort()
      listAbortRef.current?.abort()
    }
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

  const changeModel = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    setModels((current) => ({ ...current, [provider]: value }))
    clearFieldError("model", "image")
  }

  const changeSize = (event: ChangeEvent<HTMLSelectElement>) => {
    setSize(SIZE_OPTIONS.find((entry) => entry.value === event.target.value)?.value ?? "auto")
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
    if (generating || imageBusy) return
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
    if (!prompt.trim() && !image) errors.description = "Descreva o atendimento ou envie uma imagem de referência."
    else if (prompt.trim().length > LIMITS.prompt) {
      errors.description = `A descrição pode ter até ${formatNumber(LIMITS.prompt)} caracteres.`
    }
    if (size === "custom") {
      const value = Number(count.trim())
      if (!/^\d+$/.test(count.trim()) || value < COUNT_LIMITS.min || value > COUNT_LIMITS.max) {
        errors.count = `Informe de ${COUNT_LIMITS.min} a ${COUNT_LIMITS.max} componentes.`
      }
    }
    if (name.trim().length > LIMITS.name) errors.name = `O nome do fluxo pode ter até ${LIMITS.name} caracteres.`
    return errors
  }

  const rejectGeneration = (rejection: Rejection, origin: View) => {
    const field =
      rejection.field ??
      (rejection.code === "invalid_key" ? "apiKey" : rejection.code === "model_not_found" ? "model" : undefined)
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

  const generate = async () => {
    if (abortRef.current) return
    const origin: View = showingResult ? "result" : "form"
    const errors = validate()
    setFieldErrors(errors)
    const invalid = FIELD_ORDER.find((field) => errors[field])
    if (invalid) {
      setFailure(null)
      setView("form")
      focusField(invalid)
      return
    }

    const trimmedName = name.trim()
    const request: GenerateRequest = {
      provider,
      model,
      apiKey: apiKey.trim(),
      prompt: prompt.trim(),
      image: image?.dataUrl ?? null,
      size,
      ...(size === "custom" ? { count: Number(count.trim()) } : {}),
      ...(trimmedName ? { name: trimmedName } : {}),
    }
    const context = {
      provider,
      modelName: currentModelName,
      prompt: request.prompt,
      image: image ? { name: image.name, bytes: image.bytes } : null,
      size: size === "custom" ? `Personalizado (${plural(Number(count.trim()), "componente", "componentes")})` : sizeOption.label,
      name: trimmedName,
    }

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setProgress(null)
    setElapsed(0)
    setFailure(null)
    setNotice("")
    afterRender(() => cancelRef.current?.focus())

    try {
      const outcome = await requestGeneration(request, controller.signal, (next) => {
        if (abortRef.current === controller) setProgress(next)
      })
      if (controller.signal.aborted || abortRef.current !== controller) return
      if (!outcome.ok) {
        rejectGeneration(outcome.rejection, origin)
        return
      }
      setResult({
        ...outcome.received,
        ...context,
        model: outcome.received.model || model,
        generatedAt: new Date().toISOString(),
      })
      setView("result")
      afterRender(() => {
        bodyRef.current?.scrollTo({ top: 0 })
        importRef.current?.focus()
      })
    } catch {
      if (controller.signal.aborted || abortRef.current !== controller) return
      setFailure({ title: "Não foi possível contatar o servidor.", details: "Verifique a conexão e tente novamente.", items: [] })
      focusMainAction(origin)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setGenerating(false)
        setProgress(null)
      }
    }
  }

  const cancelGeneration = () => {
    const controller = abortRef.current
    if (!controller) return
    abortRef.current = null
    controller.abort()
    setGenerating(false)
    setProgress(null)
    setNotice("Geração cancelada.")
    focusMainAction(showingResult ? "result" : "form")
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void generate()
  }

  const close = () => onOpenChange(false)

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
    const target = showingResult
      ? importRef.current
      : document.getElementById(idFor(apiKey.trim() ? "description" : "apiKey"))
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  const handleCloseAutoFocus = () => {
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
      cancelGeneration()
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
    cancelGeneration()
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
  const resultTitle = summary
    ? summary.issues.length
      ? `Fluxo gerado com ${plural(summary.issues.length, "pendência", "pendências")}`
      : "Fluxo gerado sem pendências"
    : ""
  const ToneIcon = summary ? TONES[summary.tone].Icon : CheckCircle2

  return (
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
              Escolha a IA, descreva o atendimento e revise o resultado antes de importar. O fluxo segue o formato JSON
              de Atendimento e pode usar qualquer componente do editor.
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
                  {summary.blocking ? (
                    <p id={idFor("blocking")} className="mt-1 text-xs font-medium text-flow-danger">
                      {plural(summary.blocking, "pendência impede", "pendências impedem")} a exportação do JSON. Corrija
                      no editor.
                    </p>
                  ) : null}
                  <ul aria-label="Resumo do fluxo gerado" className="mt-2 flex flex-wrap gap-1.5">
                    <li className={ui.chip}>{plural(summary.components, "componente", "componentes")}</li>
                    <li className={ui.chip}>{plural(result.flow.edges.length, "conexão", "conexões")}</li>
                    <li className={ui.chip}>{result.modelName}</li>
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
                        <span className="shrink-0 rounded-md bg-flow-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-flow-muted">
                          ID {node.id}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>

              <p className={ui.hint}>
                Importar substitui o fluxo aberto no editor. Para voltar ao anterior, use Desfazer (Ctrl+Z).
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
                    <select
                      id={idFor("model")}
                      value={model}
                      onChange={changeModel}
                      aria-invalid={fieldErrors.model ? true : undefined}
                      aria-describedby={describedBy(
                        idFor("model-hint"),
                        listingStatus && idFor("models-status"),
                        fieldErrors.model && idFor("model-error"),
                      )}
                      className={cn(ui.select, "min-w-0 sm:flex-1", fieldBase, fieldErrors.model && invalidField)}
                    >
                      {knownModel ? null : (
                        <option value={model} className={ui.option}>
                          {model}
                        </option>
                      )}
                      <optgroup label="Recomendados" className={ui.option}>
                        {info.presets.map((preset) => (
                          <option key={preset.id} value={preset.id} className={ui.option}>
                            {preset.name} ({listed && !listed.some((entry) => entry.id === preset.id) ? "não encontrado na conta" : preset.note})
                          </option>
                        ))}
                      </optgroup>
                      {accountModels.length > 0 ? (
                        <optgroup label="Disponíveis na sua conta" className={ui.option}>
                          {accountModels.map((entry) => (
                            <option key={entry.id} value={entry.id} className={ui.option}>
                              {entry.vision === false ? `${entry.name} (sem imagens)` : entry.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
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
              </fieldset>

              <fieldset disabled={generating} aria-labelledby={idFor("request-title")} className="min-w-0 space-y-4">
                <h3 id={idFor("request-title")} className={ui.sectionTitle}>
                  Pedido
                </h3>

                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor={idFor("description")} className={cn(ui.label, "mb-0")}>
                      Descrição do atendimento
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
                    placeholder="Ex.: Clínica médica. Boas-vindas com o nome do contato, atendimento de segunda a sexta das 8h às 18h e um menu para agendar consulta, falar com a recepção ou encerrar. Fora do horário, avisar e encerrar."
                    aria-invalid={fieldErrors.description ? true : undefined}
                    aria-describedby={describedBy(
                      idFor("description-hint"),
                      fieldErrors.description && idFor("description-error"),
                    )}
                    className={cn(ui.textarea, "min-h-32 resize-y", fieldBase, fieldErrors.description && invalidField)}
                  />
                  <p id={idFor("description-hint")} className={ui.hint}>
                    Informe o objetivo, as etapas, as opções do menu e os dados que o fluxo deve pedir. Até{" "}
                    {formatNumber(LIMITS.prompt)} caracteres. Ctrl+Enter gera o fluxo.
                  </p>
                  {fieldErrors.description ? (
                    <p id={idFor("description-error")} className={ui.error}>
                      {fieldErrors.description}
                    </p>
                  ) : null}
                </div>

                <div>
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={idFor("size")} className={ui.label}>
                      Tamanho do fluxo
                    </label>
                    <select
                      id={idFor("size")}
                      value={size}
                      onChange={changeSize}
                      aria-invalid={fieldErrors.size ? true : undefined}
                      aria-describedby={describedBy(idFor("size-hint"), fieldErrors.size && idFor("size-error"))}
                      className={cn(ui.select, fieldBase, fieldErrors.size && invalidField)}
                    >
                      {SIZE_OPTIONS.map((entry) => (
                        <option key={entry.value} value={entry.value} className={ui.option}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
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
                      placeholder="Ex.: Atendimento Clínica Exemplo"
                      aria-invalid={fieldErrors.name ? true : undefined}
                      aria-describedby={describedBy(idFor("name-hint"), fieldErrors.name && idFor("name-error"))}
                      className={cn(ui.input, fieldBase, fieldErrors.name && invalidField)}
                    />
                    <p id={idFor("name-hint")} className={ui.hint}>
                      Sem nome, a IA sugere um a partir da descrição.
                    </p>
                    {fieldErrors.name ? (
                      <p id={idFor("name-error")} className={ui.error}>
                        {fieldErrors.name}
                      </p>
                    ) : null}
                  </div>
                </div>
              </fieldset>
            </form>
          )}

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
                  {progressText(progress)}
                </span>
                <span aria-hidden="true" className="shrink-0 tabular-nums">
                  {clock(elapsed)}
                </span>
              </>
            ) : null}
            <p role="status" className={generating ? "sr-only" : "min-w-0 leading-4"}>
              {generating ? stageText(progress) : notice}
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
                <button ref={importRef} type="button" onClick={importResult} className={ui.primaryButton}>
                  <FileJson className="h-4 w-4" aria-hidden="true" />
                  Importar para o editor
                </button>
              </div>
            </>
          ) : showingResult ? (
            <button ref={cancelRef} type="button" onClick={cancelGeneration} className={cn(ui.button, "ml-auto")}>
              Cancelar geração
            </button>
          ) : (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {result && !generating ? (
                <button type="button" onClick={showResult} className={ui.button}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Ver resultado
                </button>
              ) : null}
              <button ref={cancelRef} type="button" onClick={generating ? cancelGeneration : close} className={ui.button}>
                {generating ? "Cancelar geração" : "Cancelar"}
              </button>
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
                Gerar fluxo
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
