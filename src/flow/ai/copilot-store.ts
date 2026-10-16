import {
  LIMITS,
  type Effort,
  type GenerateFailure,
  type GenerateRequest,
  type GenerationChanges,
  type GenerationIssue,
  type GenerationProgress,
  type GenerationUsage,
} from "@/lib/atendimento/ai/contracts"
import type { InterviewMessage, InterviewTurn } from "@/lib/atendimento/ai/interview"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"
import { clip, shorten } from "@/lib/atendimento/ai/text"
import { NOTE_TYPE, START_TYPE } from "@/lib/atendimento/catalog"
import { behaviorSignature, importFlow, isObject, outputHandles, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, FlowIssue } from "@/lib/atendimento/types"
import type { InterviewTurnResult } from "../ai-interview"
import type { CanvasPick } from "../pick"
import {
  ISSUE_GROUPS,
  PLATFORM_HINTS,
  PREVIEW_INTERVAL_MS,
  apiKeyError,
  changeLabels,
  documentKey,
  failureField,
  isModelId,
  mergeIssues,
  messageLines,
  nodeSubject,
  plural,
  previewFeed,
  requestField,
  type Engine,
  type Failure,
  type Field,
  type FieldErrors,
  type FlowDiff,
  type IssueGroup,
  type Outcome,
  type PreviewFeed,
  type Received,
  type Rejection,
} from "./generation-client"

export interface CopilotSettings {
  provider: ProviderId
  model: string
  apiKey: string
  effort: Effort
  fill: boolean
}

export type CopilotGenerate = (
  request: GenerateRequest,
  signal: AbortSignal,
  onProgress: (progress: GenerationProgress) => void,
  onPartial?: (ri: unknown) => void,
  engine?: Engine | null,
) => Promise<Outcome>

export interface CopilotTurnInput {
  history: InterviewMessage[]
  flow: AtendimentoFlow
  proposal: boolean
  settings: CopilotSettings
}

export type CopilotPartial = (turn: Partial<InterviewTurn>) => void

export type CopilotTurn = (input: CopilotTurnInput, signal: AbortSignal, onPartial?: CopilotPartial) => Promise<InterviewTurnResult>

export type CopilotAttention = "ready" | "failed" | "question"

export interface CopilotOptions {
  settings: CopilotSettings
  getFlow: () => AtendimentoFlow | null | undefined
  preview: (flow: AtendimentoFlow | null, done: boolean, fresh?: boolean, focus?: string | null) => void
  applyEdit: (flow: AtendimentoFlow) => boolean
  generate: CopilotGenerate
  turn: CopilotTurn
  engine?: () => Promise<Engine | null>
  notify?: (attention: CopilotAttention) => void
  interval?: number
  now?: () => number
}

export type ProposalStatus = "pending" | "applied" | "discarded" | "refined"

export type CopilotTone = "success" | "warning" | "danger" | "muted"

export interface CopilotProposal {
  flow: AtendimentoFlow
  original: AtendimentoFlow
  base: AtendimentoFlow
  prompt: string
  issues: GenerationIssue[]
  blocking: number
  broken: GenerationIssue[]
  unmet: GenerationIssue[]
  emptied?: boolean
  changes: GenerationChanges | null
  diff: FlowDiff | null
  removed: AtendimentoNode[]
  partial: boolean
  rounds: number
  usage?: GenerationUsage
  provider: ProviderId
  model: string
  effort: Effort
  fill: boolean
  focus: string | null
  missed: boolean
}

export type CopilotEntry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "proposal"; proposal: CopilotProposal; status: ProposalStatus }
  | { id: string; kind: "note"; text: string; tone: CopilotTone }
  | { id: string; kind: "error"; failure: Failure; prompt?: string; turn?: boolean }

export interface CopilotFocus {
  field: Field
  seq: number
}

export interface CopilotPickCandidate {
  id: string
  text: string
}

export interface CopilotPick {
  label: string
  candidates: CopilotPickCandidate[]
  selected: string | null
  ready: boolean
  any: boolean
}

export interface CopilotState {
  entries: CopilotEntry[]
  thinking: boolean
  incoming: string
  running: boolean
  refining: boolean
  progress: GenerationProgress | null
  startedAt: number | null
  pending: string | null
  retry: string | null
  suggestions: string[]
  plan: string
  pick: CopilotPick | null
  visible: boolean
  blocked: boolean
  attention: CopilotAttention | null
  fieldErrors: FieldErrors
  focus: CopilotFocus | null
}

export interface CopilotStore {
  getState: () => CopilotState
  subscribe: (listener: () => void) => () => void
  send: (text: string, withSelection?: boolean) => boolean
  editNow: () => boolean
  selectPick: (id: string | null) => boolean
  confirmPick: () => boolean
  cancelPick: () => boolean
  cancel: () => void
  apply: () => boolean
  discard: () => boolean
  retry: () => boolean
  setVisible: (visible: boolean) => void
  setBlocked: (blocked: boolean) => void
  markField: (field: Field, message: string) => void
  clearFieldError: (...fields: Field[]) => void
  dispose: () => void
}

export interface PickLinkHooks {
  confirm?: (id: string) => void
  cancel?: () => void
  listOnly?: (key: string) => void
}

interface Target {
  base: AtendimentoFlow
  original: AtendimentoFlow
  refines: string | null
}

interface Job extends Target {
  prompt: string
  settings: CopilotSettings
  focus: string | null
}

interface Choice extends CopilotPickCandidate {
  rivals: string[]
}

interface Run {
  job: Job
  controller: AbortController
  feed: PreviewFeed | null
  live: AtendimentoFlow | null
}

export const COPILOT_TEXT = {
  cancelled: "Pedido cancelado. O fluxo aberto não mudou.",
  discarded: "Proposta descartada. O fluxo aberto não mudou.",
  applied: "Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.",
  rejected: "O editor não aceitou a edição. Confira o aviso exibido no editor.",
  stale: "O fluxo aberto mudou depois desta proposta. Peça de novo para editar a versão atual.",
  outdated: "O fluxo aberto mudou depois deste pedido. Peça de novo para editar a versão atual.",
  paused: "A edição ficou em espera porque o Gerar com IA estava em uso. Clique em Editar agora para continuar.",
} as const

export const EDIT_NOW_TEXT = "Pode editar agora com o que já foi decidido."
export const FOLLOW_UP_TEXT = "Precisa mudar mais alguma coisa no fluxo?"
export const SILENT_TURN = "A IA não respondeu desta vez."
export const PICK_PREFIX = "Selecionei no canvas:"
export const PICK_CANCELLED = "Seleção cancelada. Você pode responder por texto."
export const PICK_LABEL = "o componente"
export const FOCUS_MISSED = "A edição não mudou o componente que você selecionou. Confira se a mudança ficou no lugar certo antes de aplicar."
export const BLOCKED_TITLE = "Edição com pendências que impedem aplicar"
export const EMPTIED_NOTICE = "O fluxo ficou só com o Início e as notas. Para exportar o JSON, ligue um componente à saída do Início."
export const FAULTS_HEAD = "Pendências para corrigir:"

export const STATUS_LABELS: Readonly<Record<Exclude<ProposalStatus, "pending">, string>> = {
  applied: "Aplicada",
  discarded: "Descartada",
  refined: "Ajustada no pedido seguinte",
}

export const CONNECTION_FAILURE: Failure = {
  title: "Não foi possível contatar o servidor.",
  details: "Verifique a conexão e tente novamente.",
  items: [],
}

export const SETTINGS_FIELDS: readonly Field[] = ["provider", "apiKey", "model", "effort"]

const INITIAL_STATE: CopilotState = {
  entries: [],
  thinking: false,
  incoming: "",
  running: false,
  refining: false,
  progress: null,
  startedAt: null,
  pending: null,
  retry: null,
  suggestions: [],
  plan: "",
  pick: null,
  visible: false,
  blocked: false,
  attention: null,
  fieldErrors: {},
  focus: null,
}

const SUGGESTION_LIMIT = 6
const PICK_LABEL_LIMIT = 60
const FAULT_LIMIT = 5
const ARTICLES = new Set(["o", "a", "os", "as", "um", "uma"])
const OUTPUT_HANDLE = /^output-(\d+)$/

export function credentialErrors(settings: CopilotSettings): FieldErrors {
  const info = PROVIDERS.find((entry) => entry.id === settings.provider) ?? PROVIDERS[0]
  const errors: FieldErrors = {}
  const key = apiKeyError(info, settings.apiKey.trim())
  if (key) errors.apiKey = key
  if (!isModelId(settings.model)) errors.model = "Escolha um modelo válido."
  return errors
}

export function proposalApplicable(proposal: CopilotProposal): boolean {
  return proposal.broken.length === 0
}

export function proposalTitle(proposal: CopilotProposal): string {
  if (proposal.partial) return "Edição feita em parte"
  if (!proposalApplicable(proposal)) return BLOCKED_TITLE
  return proposal.issues.length ? `Edição pronta com ${plural(proposal.issues.length, "pendência", "pendências")}` : "Edição pronta"
}

export function proposalTone(proposal: CopilotProposal): "success" | "warning" | "danger" {
  if ((proposal.blocking && !proposal.emptied) || proposal.broken.length || proposal.unmet.length) return "danger"
  return proposal.issues.length || proposal.partial || proposal.emptied ? "warning" : "success"
}

const isComponent = (node: AtendimentoNode) => node.data.type !== START_TYPE && node.data.type !== NOTE_TYPE

export function branching(flow: AtendimentoFlow, id: string): boolean {
  const node = flow.nodes.find((entry) => entry.id === id)
  return node ? outputHandles(node).length > 1 : false
}

export function emptiedFlow(before: AtendimentoFlow, after: AtendimentoFlow): boolean {
  return before.nodes.some(isComponent) && !after.nodes.some(isComponent)
}

export function proposalGroups(proposal: CopilotProposal): IssueGroup[] {
  return ISSUE_GROUPS.map((group) => ({
    ...group,
    hint: group.scope === "plataforma" ? PLATFORM_HINTS[proposal.fill ? "on" : "off"] : group.hint,
    items: proposal.issues.filter((issue) => issue.scope === group.scope),
  })).filter((group) => group.items.length > 0)
}

function faultLine(issue: GenerationIssue): string {
  const message = issue.message.trim()
  const line = /[.?…]$/.test(message) ? message : `${message}.`
  return issue.nodeId ? `ID ${issue.nodeId}: ${line}` : line
}

export function proposalSummary(proposal: CopilotProposal): string {
  let head = "Proposta pronta no canvas."
  if (proposal.changes) {
    const [added, changed, removed] = changeLabels(proposal.changes)
    head = `Proposta pronta no canvas: ${added}, ${changed} e ${removed}.`
  }
  const faults = [...proposal.broken, ...proposal.unmet].filter((issue) => issue.message.trim()).slice(0, FAULT_LIMIT)
  return faults.length ? `${head} ${FAULTS_HEAD} ${faults.map(faultLine).join(" ")}` : head
}

export function copilotHistory(entries: readonly CopilotEntry[]): InterviewMessage[] {
  const history: InterviewMessage[] = []
  for (const entry of entries) {
    if (entry.kind === "error") continue
    const text = (entry.kind === "proposal" ? proposalSummary(entry.proposal) : entry.text).trim()
    if (!text) continue
    const role: InterviewMessage["role"] = entry.kind === "user" ? "user" : "assistant"
    const last = history[history.length - 1]
    if (last && last.role === role) last.text = `${last.text}\n\n${text}`
    else history.push({ role, text })
  }
  return history
}

export function pickLabel(value: unknown): string {
  const text = shorten(typeof value === "string" ? value : "", PICK_LABEL_LIMIT).replace(/[\s.,;:!?]+$/, "")
  if (!text) return PICK_LABEL
  const first = text.split(" ")[0]
  return ARTICLES.has(first.toLowerCase()) ? `${first.toLowerCase()}${text.slice(first.length)}` : text
}

function handleIndex(handle: string): number {
  const match = OUTPUT_HANDLE.exec(handle)
  return match ? Number(match[1]) : -1
}

export function flowOrder(flow: AtendimentoFlow): AtendimentoNode[] {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, AtendimentoEdge[]>()
  for (const edge of flow.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  const order = new Set(flow.nodes.flatMap((node) => (node.data.type === START_TYPE ? [node.id] : [])))
  for (const id of order) {
    const edges = [...(outgoing.get(id) ?? [])].sort((first, second) => handleIndex(first.sourceHandle) - handleIndex(second.sourceHandle))
    for (const edge of edges) if (nodes.has(edge.target)) order.add(edge.target)
  }
  for (const node of flow.nodes) order.add(node.id)
  return [...order].flatMap((id) => {
    const node = nodes.get(id)
    return node && node.data.type !== NOTE_TYPE ? [node] : []
  })
}

export function anchors(flow: AtendimentoFlow): AtendimentoNode[] {
  return flowOrder(flow).filter((node) => outputHandles(node).length > 0)
}

function listedCandidates(items: readonly unknown[], flow: AtendimentoFlow): CopilotPickCandidate[] {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const candidates: CopilotPickCandidate[] = []
  for (const item of items) {
    const id = typeof item === "string" ? item.trim() : typeof item === "number" && Number.isFinite(item) ? String(item) : ""
    const node = nodes.get(id)
    if (!node || node.data.type === NOTE_TYPE || candidates.some((candidate) => candidate.id === id)) continue
    candidates.push({ id, text: nodeSubject(node) })
  }
  return candidates
}

export function readPick(value: unknown, flow: AtendimentoFlow): CopilotPick | null {
  if (!isObject(value)) return null
  const any = value.any === true
  const listed = Array.isArray(value.candidates) ? value.candidates : null
  if (!any && !listed) return null
  const candidates = any ? anchors(flow).map((node) => ({ id: node.id, text: nodeSubject(node) })) : listedCandidates(listed ?? [], flow)
  return candidates.length < 2 ? null : { label: pickLabel(value.label), candidates, selected: null, ready: value.ready === true, any }
}

export function pickKey(pick: CopilotPick | null | undefined): string {
  return pick ? JSON.stringify([pick.label, pick.candidates.map((candidate) => candidate.id), pick.any === true]) : ""
}

function chipsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const chips: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const text = item.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    chips.push(text)
    if (chips.length === SUGGESTION_LIMIT) break
  }
  return chips
}

function turnRejection(failure: GenerateFailure | null | undefined): Rejection {
  const details = failure?.details?.trim()
  return {
    code: failure?.code ?? "unknown",
    field: requestField(failure?.field),
    failure: { title: failure?.error?.trim() || SILENT_TURN, ...(details ? { details } : {}), items: [] },
  }
}

function countOf(diff: FlowDiff): GenerationChanges {
  return { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length }
}

export function citesId(text: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\bID\\s*[:#]?\\s*${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(text)
}

function inbound(flow: AtendimentoFlow, id: string): string {
  return flow.edges
    .filter((edge) => edge.target === id)
    .map((edge) => `${edge.source}>${edge.sourceHandle}`)
    .sort()
    .join("|")
}

function outbound(flow: AtendimentoFlow, id: string): string {
  return flow.edges
    .filter((edge) => edge.source === id)
    .map((edge) => `${edge.sourceHandle}>${edge.target}`)
    .sort()
    .join("|")
}

export function touches(diff: FlowDiff, before: AtendimentoFlow, after: AtendimentoFlow, id: string): boolean {
  return diff.changed.includes(id) || diff.removed.includes(id) || inbound(before, id) !== inbound(after, id) || outbound(before, id) !== outbound(after, id)
}

function flowErrors(flow: AtendimentoFlow): FlowIssue[] {
  try {
    return validateFlow(flow).filter((issue) => issue.severity === "error")
  } catch {
    return []
  }
}

const errorPlace = (issue: { nodeId?: string; message: string }) => JSON.stringify(issue.nodeId ? ["node", issue.nodeId] : ["flow", issue.message])

const errorKey = (issue: { nodeId?: string; message: string }) => JSON.stringify([issue.nodeId ?? "", issue.message])

export function introducedErrors(before: readonly FlowIssue[], after: readonly FlowIssue[]): FlowIssue[] {
  const left = new Map<string, number>()
  for (const issue of before) left.set(errorPlace(issue), (left.get(errorPlace(issue)) ?? 0) + 1)
  return after.filter((issue) => {
    const place = errorPlace(issue)
    const count = left.get(place) ?? 0
    if (count > 0) left.set(place, count - 1)
    return count === 0
  })
}

export function createCopilot(read: () => CopilotOptions): CopilotStore {
  let state = INITIAL_STATE
  let run: Run | null = null
  let asking: AbortController | null = null
  let planned: Target | null = null
  let chosen: Choice | null = null
  let parked = ""
  let shown = false
  let sequence = 0
  let focusSequence = 0
  const listeners = new Set<() => void>()

  const set = (patch: Partial<CopilotState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  const nextId = () => {
    sequence += 1
    return `c${sequence}`
  }

  const now = () => {
    try {
      return read().now?.() ?? Date.now()
    } catch {
      return Date.now()
    }
  }

  const note = (text: string, tone: CopilotTone): CopilotEntry => ({ id: nextId(), kind: "note", text, tone })

  const said = (text: string): CopilotEntry => ({ id: nextId(), kind: "assistant", text })

  const active = () => state.visible && !state.blocked

  const busy = () => run !== null || asking !== null

  const currentFlow = (): AtendimentoFlow | null => {
    try {
      return read().getFlow() ?? null
    } catch {
      return null
    }
  }

  const show = (flow: AtendimentoFlow, done: boolean, fresh = true, focus: string | null = null) => {
    try {
      read().preview(flow, done, fresh, focus)
      shown = true
    } catch {
      return
    }
  }

  const hide = () => {
    if (!shown) return
    shown = false
    try {
      read().preview(null, false)
    } catch {
      return
    }
  }

  const pendingProposal = (): CopilotProposal | null => {
    if (!state.pending) return null
    const entry = state.entries.find((item) => item.id === state.pending)
    return entry?.kind === "proposal" && entry.status === "pending" ? entry.proposal : null
  }

  const opens = (flow: AtendimentoFlow) => {
    const opened = currentFlow()
    return opened !== null && documentKey(opened) === documentKey(flow)
  }

  const stale = (proposal: CopilotProposal) => !opens(proposal.original)

  const current = (found: Target): Target | null => {
    if (state.pending !== found.refines) return null
    const opened = currentFlow()
    if (!opened) return null
    if (documentKey(opened) === documentKey(found.original)) return found
    if (found.refines !== null) return null
    return behaviorSignature(opened) === behaviorSignature(found.original) ? { base: opened, original: opened, refines: null } : null
  }

  const mark = (id: string, status: ProposalStatus): CopilotEntry[] =>
    state.entries.map((entry) => (entry.kind === "proposal" && entry.id === id && entry.status === "pending" ? { ...entry, status } : entry))

  const forget = (): Partial<CopilotState> => {
    planned = null
    chosen = null
    parked = ""
    const failed = state.retry ? state.entries.find((entry) => entry.id === state.retry) : undefined
    const edit = failed?.kind === "error" && !failed.turn && Boolean(failed.prompt)
    return { plan: "", suggestions: [], pick: null, ...(edit ? { retry: null } : {}) }
  }

  const dropStale = () => {
    const id = state.pending
    if (!id) return
    hide()
    set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.stale, "warning")], pending: null, ...forget() })
  }

  const notify = (attention: CopilotAttention) => {
    try {
      read().notify?.(attention)
    } catch {
      return
    }
  }

  const restore = () => {
    if (!active()) {
      hide()
      return
    }
    const proposal = pendingProposal()
    if (proposal) show(proposal.flow, true, true, proposal.focus)
    else hide()
  }

  const sync = () => {
    if (!active()) return
    if (state.pick && planned && !current(planned)) {
      expire(planned)
      return
    }
    if (run) {
      show(run.live ?? run.job.base, false, true, run.job.focus)
      return
    }
    const proposal = pendingProposal()
    if (!proposal) return
    if (stale(proposal)) {
      dropStale()
      return
    }
    show(proposal.flow, true, true, proposal.focus)
  }

  const requestOf = (job: Job): GenerateRequest => {
    const present = new Set(job.base.nodes.map((node) => node.id))
    const reserved = job.original.nodes.flatMap((node) => (present.has(node.id) ? [] : [node.id]))
    return {
      provider: job.settings.provider,
      model: job.settings.model,
      apiKey: job.settings.apiKey.trim(),
      prompt: job.prompt,
      image: null,
      size: "auto",
      effort: job.settings.effort,
      fill: job.settings.fill,
      mode: "edit",
      base: job.base,
      ...(reserved.length ? { reserved } : {}),
    }
  }

  const checkSettings = (): CopilotSettings | null => {
    const settings = read().settings
    const errors = credentialErrors(settings)
    const invalid = SETTINGS_FIELDS.find((field) => errors[field])
    if (!invalid) return { ...settings }
    focusSequence += 1
    set({ fieldErrors: { ...state.fieldErrors, ...errors }, focus: { field: invalid, seq: focusSequence } })
    return null
  }

  const target = (): Target | null => {
    const proposal = pendingProposal()
    if (proposal) {
      if (stale(proposal)) {
        dropStale()
        return null
      }
      return { base: proposal.flow, original: proposal.original, refines: state.pending }
    }
    const opened = currentFlow()
    if (!opened) return null
    return { base: opened, original: opened, refines: null }
  }

  const lastRequest = (): string => {
    const history = copilotHistory(state.entries)
    for (let index = history.length - 1; index >= 0; index--) if (history[index].role === "user") return history[index].text
    return ""
  }

  const join = (head: string, tail: string): string => {
    const plan = head.trim()
    const reply = tail.trim()
    if (!plan) return clip(reply, LIMITS.prompt)
    if (!reply || plan.includes(reply)) return clip(plan, LIMITS.prompt)
    const room = LIMITS.prompt - reply.length - 2
    return room > 0 ? `${clip(plan, room).trimEnd()}\n\n${reply}` : clip(reply, LIMITS.prompt)
  }

  const fallbackPrompt = (): string => join(state.plan || parked, lastRequest())

  const unanswered = (): string => {
    for (let index = state.entries.length - 1; index >= 0; index--) {
      const entry = state.entries[index]
      if (entry.kind === "assistant" || entry.kind === "proposal") return ""
      if (entry.kind === "user" && entry.text.startsWith(PICK_PREFIX)) return entry.text
    }
    return ""
  }

  const choiceText = (candidate: CopilotPickCandidate) => `${PICK_PREFIX} ${candidate.text}`

  const choiceEntry = (candidate: CopilotPickCandidate): CopilotEntry => ({ id: nextId(), kind: "user", text: choiceText(candidate) })

  const choiceOf = (pick: CopilotPick): Choice | null => {
    const candidate = pick.candidates.find((item) => item.id === pick.selected)
    return candidate ? { ...candidate, rivals: pick.candidates.filter((item) => item !== candidate).map((item) => item.id) } : null
  }

  const focusFor = (prompt: string, flow: AtendimentoFlow): string | null => {
    const choice = chosen
    if (!choice || !flow.nodes.some((node) => node.id === choice.id)) return null
    if (!citesId(prompt, choice.id) && choice.rivals.some((id) => citesId(prompt, id))) return null
    return choice.id
  }

  const jobFor = (found: Target, prompt: string, settings: CopilotSettings): Job => ({ ...found, prompt, settings, focus: focusFor(prompt, found.base) })

  const expire = (found: Target, patch: Partial<CopilotState> = {}) => {
    const unseen = !state.visible
    const proposed = found.refines !== null
    const live = proposed && state.pending === found.refines
    if (live) dropStale()
    const noted = live || !proposed
    set({
      ...patch,
      ...(proposed ? {} : { entries: [...state.entries, note(COPILOT_TEXT.outdated, "warning")] }),
      ...forget(),
      ...(noted && unseen ? { attention: "failed" as const } : {}),
    })
    if (noted && unseen) notify("failed")
  }

  const report = (rejection: Rejection, retry: { prompt: string } | { turn: true }, patch: Partial<CopilotState>): boolean => {
    const field = failureField(rejection.code, rejection.field)
    const id = nextId()
    const unseen = !state.visible
    const next: Partial<CopilotState> = {
      ...patch,
      entries: [...state.entries, { id, kind: "error", failure: rejection.failure, ...retry }],
      retry: id,
      ...(unseen ? { attention: "failed" as const } : {}),
    }
    if (field && SETTINGS_FIELDS.includes(field)) {
      focusSequence += 1
      next.fieldErrors = { ...state.fieldErrors, [field]: [rejection.failure.title, rejection.failure.details].filter(Boolean).join(" ") }
      next.focus = { field, seq: focusSequence }
    }
    set(next)
    return unseen
  }

  const finishRun = (current: Run) => {
    if (run === current) run = null
    current.feed?.stop()
  }

  const missedFocus = (engine: Engine | null | undefined, job: Job, flow: AtendimentoFlow, diff: FlowDiff | null): boolean => {
    if (!engine || !job.focus) return false
    try {
      const own = diff && job.base === job.original ? diff : engine.diffFlows(job.base, flow)
      return !touches(own, job.base, flow, job.focus)
    } catch {
      return false
    }
  }

  const succeed = (current: Run, received: Received, engine: Engine | null | undefined) => {
    finishRun(current)
    const { job } = current
    let diff: FlowDiff | null = null
    if (engine) {
      try {
        diff = engine.diffFlows(job.original, received.flow)
      } catch {
        diff = null
      }
    }
    const missed = missedFocus(engine, job, received.flow, diff)
    const warned: GenerationIssue[] = missed && job.focus ? [{ severity: "warning", scope: "ia", message: FOCUS_MISSED, nodeId: job.focus }] : []
    const changes = diff ? countOf(diff) : job.refines ? null : received.changes ?? null
    const before = new Map(job.original.nodes.map((node) => [node.id, node]))
    const removed = (diff?.removed ?? []).flatMap((id) => {
      const node = before.get(id)
      return node ? [node] : []
    })
    const blocking = flowErrors(received.flow)
    const known = new Set(blocking.map(errorKey))
    const emptied = emptiedFlow(job.original, received.flow)
    const starts = new Set(received.flow.nodes.flatMap((node) => (node.data.type === START_TYPE ? [node.id] : [])))
    const expected = (issue: { nodeId?: string }) => emptied && issue.nodeId !== undefined && starts.has(issue.nodeId)
    const broken = introducedErrors(flowErrors(job.original), blocking)
      .filter((issue) => !expected(issue))
      .map((issue): GenerationIssue => ({ severity: "error", scope: "ia", message: issue.message, ...(issue.nodeId ? { nodeId: issue.nodeId } : {}) }))
    const unmet = received.issues.filter((issue) => issue.severity === "error" && !known.has(errorKey(issue)))
    const proposal: CopilotProposal = {
      flow: received.flow,
      original: job.original,
      base: job.base,
      prompt: job.prompt,
      issues: mergeIssues([...warned, ...received.issues], blocking).filter((issue) => !expected(issue)),
      blocking: blocking.length,
      broken,
      unmet,
      emptied,
      changes,
      diff,
      removed,
      partial: received.partial,
      rounds: received.rounds,
      ...(received.usage ? { usage: received.usage } : {}),
      provider: job.settings.provider,
      model: received.model || job.settings.model,
      effort: job.settings.effort,
      fill: job.settings.fill,
      focus: job.focus,
      missed,
    }
    const id = nextId()
    const entries = job.refines ? mark(job.refines, "refined") : state.entries
    const unseen = !state.visible
    const attention: CopilotAttention = proposalApplicable(proposal) ? "ready" : "failed"
    set({
      entries: [...entries, { id, kind: "proposal", proposal, status: "pending" }],
      pending: id,
      ...forget(),
      running: false,
      refining: false,
      progress: null,
      startedAt: null,
      ...(unseen ? { attention } : {}),
    })
    if (active()) show(received.flow, true, true, job.focus)
    else hide()
    if (unseen) notify(attention)
  }

  const fail = (current: Run, rejection: Rejection) => {
    finishRun(current)
    const unseen = report(rejection, { prompt: current.job.prompt }, { running: false, refining: false, progress: null, startedAt: null })
    restore()
    if (unseen) notify("failed")
  }

  const alive = (current: Run) => run === current && !current.controller.signal.aborted

  async function execute(current: Run): Promise<void> {
    let engine: Engine | null | undefined
    try {
      const load = read().engine
      engine = load ? await load() : undefined
    } catch {
      engine = null
    }
    if (!alive(current)) return
    const loaded = engine
    const { base } = current.job
    const feed = loaded
      ? previewFeed(
          (ri) => loaded.previewEdit(base, ri),
          (flow) => {
            if (!alive(current)) return
            current.live = flow
            if (active()) show(flow, false, false, current.job.focus)
          },
          read().interval ?? PREVIEW_INTERVAL_MS,
        )
      : null
    current.feed = feed
    let outcome: Outcome
    try {
      outcome = await read().generate(
        requestOf(current.job),
        current.controller.signal,
        (progress) => {
          if (alive(current)) set({ progress })
        },
        feed
          ? (ri) => {
              if (alive(current)) feed.push(ri)
            }
          : undefined,
        loaded,
      )
    } catch {
      if (!alive(current)) return
      fail(current, { code: "network", failure: CONNECTION_FAILURE })
      return
    }
    if (!alive(current)) return
    if (outcome.ok) succeed(current, outcome.received, loaded)
    else fail(current, outcome.rejection)
  }

  const start = (job: Job, entries: CopilotEntry[] = state.entries, patch: Partial<CopilotState> = {}) => {
    const current: Run = { job, controller: new AbortController(), feed: null, live: null }
    run = current
    set({ entries, thinking: false, incoming: "", running: true, refining: job.refines !== null, progress: null, startedAt: now(), retry: null, suggestions: [], pick: null, ...patch })
    if (active()) show(job.base, false, true, job.focus)
    void execute(current)
  }

  const heard = (controller: AbortController) => asking === controller && !controller.signal.aborted

  const misheard = (controller: AbortController, rejection: Rejection) => {
    if (asking === controller) asking = null
    const unseen = report(rejection, { turn: true }, { thinking: false, incoming: "" })
    if (unseen) notify("failed")
  }

  const answered = (controller: AbortController, turn: InterviewTurn, found: Target) => {
    if (asking === controller) asking = null
    const message = typeof turn.message === "string" ? turn.message.trim() : ""
    const entries = message ? [...state.entries, said(message)] : state.entries
    if (turn.action === "finish") {
      set({ entries, thinking: false, incoming: "", ...forget() })
      return
    }
    const base = current(found)
    if (!base) {
      expire(found, { thinking: false, incoming: "" })
      return
    }
    planned = base
    const given = typeof turn.plan === "string" ? turn.plan.trim() : ""
    if (given) parked = ""
    if (turn.action === "edit" || turn.action === "generate") {
      const prompt = given || fallbackPrompt()
      if (prompt && state.blocked) {
        set({ entries: [...entries, note(COPILOT_TEXT.paused, "muted")], thinking: false, incoming: "", suggestions: [], pick: null, plan: prompt })
        return
      }
      const settings = prompt ? checkSettings() : null
      if (settings) start(jobFor(base, prompt, settings), entries, { plan: prompt })
      else set({ entries, thinking: false, incoming: "", suggestions: [], pick: null, plan: prompt || state.plan })
      return
    }
    const unseen = !state.visible
    set({
      entries,
      thinking: false,
      incoming: "",
      suggestions: chipsOf(turn.suggestions),
      plan: given || state.plan,
      pick: readPick(turn.pick, base.base),
      ...(unseen ? { attention: "question" as const } : {}),
    })
    if (unseen) notify("question")
  }

  const overheard = (controller: AbortController): CopilotPartial => (partial) => {
    if (!heard(controller) || typeof partial.message !== "string") return
    const text = partial.message.trim()
    if (text !== state.incoming) set({ incoming: text })
  }

  async function converse(controller: AbortController, input: CopilotTurnInput, found: Target): Promise<void> {
    let result: InterviewTurnResult | null | undefined
    try {
      result = await read().turn(input, controller.signal, overheard(controller))
    } catch {
      if (heard(controller)) misheard(controller, { code: "network", failure: CONNECTION_FAILURE })
      return
    }
    if (!heard(controller)) return
    if (result?.ok) answered(controller, result.turn, found)
    else misheard(controller, turnRejection(result?.failure))
  }

  const think = (settings: CopilotSettings, found: Target, entries: CopilotEntry[]) => {
    const controller = new AbortController()
    asking = controller
    const kept = planned ? current(planned) : null
    planned = kept
    if (!kept) {
      chosen = null
      parked = ""
    }
    set({ entries, thinking: true, incoming: "", suggestions: [], retry: null, pick: null, ...(kept ? {} : { plan: "" }) })
    void converse(controller, { history: copilotHistory(entries), flow: found.base, proposal: found.refines !== null, settings }, found)
  }

  const listen = (entries: () => CopilotEntry[]): boolean => {
    const settings = checkSettings()
    if (!settings) return false
    const found = target()
    if (!found) return false
    think(settings, found, entries())
    return true
  }

  const store: CopilotStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send(text, withSelection = true) {
      const prompt = text.trim()
      if (!prompt || prompt.length > LIMITS.prompt || busy() || state.blocked) return false
      const pick = state.pick
      const choice = pick && (withSelection || pick.any) && planned && current(planned) ? choiceOf(pick) : null
      return listen(() => {
        if (choice) chosen = choice
        return [...state.entries, ...(choice ? [choiceEntry(choice)] : []), { id: nextId(), kind: "user", text: prompt }]
      })
    },
    editNow() {
      const found = planned
      if (busy() || state.blocked || state.pick || !state.plan || !found) return false
      const settings = checkSettings()
      if (!settings) return false
      const base = current(found)
      if (!base) {
        expire(found)
        return false
      }
      planned = base
      start(jobFor(base, join(state.plan, unanswered()), settings), [...state.entries, { id: nextId(), kind: "user", text: EDIT_NOW_TEXT }])
      return true
    },
    selectPick(id) {
      const pick = state.pick
      if (!pick || (id !== null && !pick.candidates.some((candidate) => candidate.id === id))) return false
      if (pick.selected !== id) set({ pick: { ...pick, selected: id } })
      return true
    },
    confirmPick() {
      const pick = state.pick
      if (!pick || busy() || state.blocked) return false
      const choice = choiceOf(pick)
      if (!choice) return false
      const found = planned
      if (!found) {
        set({ pick: null })
        return false
      }
      const settings = checkSettings()
      if (!settings) return false
      const base = current(found)
      if (!base) {
        expire(found)
        return false
      }
      chosen = choice
      const entries = [...state.entries, choiceEntry(choice)]
      if (pick.ready && state.plan && !(pick.any && branching(base.base, choice.id))) {
        planned = base
        const prompt = join(state.plan, choiceText(choice))
        start(jobFor(base, prompt, settings), entries, { plan: prompt })
        return true
      }
      think(settings, base, entries)
      return true
    },
    cancelPick() {
      if (!state.pick) return false
      parked = state.plan || parked
      set({ pick: null, plan: "", entries: [...state.entries, note(PICK_CANCELLED, "muted")] })
      return true
    },
    cancel() {
      const controller = asking
      if (controller) {
        asking = null
        controller.abort()
        set({ thinking: false, incoming: "", pick: null, entries: [...state.entries, note(COPILOT_TEXT.cancelled, "muted")] })
        return
      }
      const current = run
      if (!current) return
      run = null
      current.controller.abort()
      current.feed?.stop()
      set({
        running: false,
        refining: false,
        progress: null,
        startedAt: null,
        pick: null,
        entries: [...state.entries, note(COPILOT_TEXT.cancelled, "muted")],
      })
      restore()
    },
    apply() {
      if (busy() || state.blocked || state.pick) return false
      const id = state.pending
      const proposal = pendingProposal()
      if (!id || !proposal) return false
      if (stale(proposal)) {
        dropStale()
        return false
      }
      if (!proposalApplicable(proposal)) return false
      let flow: AtendimentoFlow
      try {
        flow = importFlow(proposal.flow)
      } catch (error) {
        set({ entries: [...state.entries, { id: nextId(), kind: "error", failure: { title: "Não foi possível aplicar a edição.", items: messageLines(error) } }] })
        return false
      }
      shown = false
      let accepted = false
      try {
        accepted = read().applyEdit(flow)
      } catch {
        accepted = false
      }
      if (!accepted) {
        set({ entries: [...state.entries, note(COPILOT_TEXT.rejected, "danger")] })
        return false
      }
      set({
        entries: [...mark(id, "applied"), note(COPILOT_TEXT.applied, "success"), said(FOLLOW_UP_TEXT)],
        pending: null,
        ...forget(),
      })
      return true
    },
    discard() {
      if (busy()) return false
      const id = state.pending
      if (!id || !pendingProposal()) return false
      hide()
      set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.discarded, "muted")], pending: null, ...forget() })
      return true
    },
    retry() {
      if (busy() || state.blocked || !state.retry) return false
      const entry = state.entries.find((item) => item.id === state.retry)
      if (!entry || entry.kind !== "error") return false
      const without = () => state.entries.filter((item) => item.id !== entry.id)
      if (entry.turn) return listen(without)
      const found = planned
      if (!entry.prompt || !found) return false
      const settings = checkSettings()
      if (!settings) return false
      const base = current(found)
      if (!base) {
        expire(found)
        return false
      }
      planned = base
      start(jobFor(base, entry.prompt, settings), without())
      return true
    },
    setVisible(visible) {
      if (visible === state.visible) return
      if (!visible) {
        set({ visible: false, ...(state.pick ? { attention: "question" as const } : {}) })
        hide()
        return
      }
      set({ visible: true, attention: null })
      sync()
    },
    setBlocked(blocked) {
      if (blocked === state.blocked) return
      set({ blocked })
      if (blocked) {
        shown = false
        return
      }
      sync()
    },
    markField(field, message) {
      focusSequence += 1
      set({ fieldErrors: { ...state.fieldErrors, [field]: message }, focus: { field, seq: focusSequence } })
    },
    clearFieldError(...fields) {
      if (!fields.some((field) => state.fieldErrors[field])) return
      const next = { ...state.fieldErrors }
      for (const field of fields) delete next[field]
      set({ fieldErrors: next })
    },
    dispose() {
      const controller = asking
      const current = run
      asking = null
      run = null
      chosen = null
      parked = ""
      controller?.abort()
      if (current) {
        current.controller.abort()
        current.feed?.stop()
      }
      if (controller || current || state.pick) set({ thinking: false, incoming: "", running: false, refining: false, progress: null, startedAt: null, pick: null })
      hide()
    },
  }
  return store
}

export function linkPick(store: CopilotStore, canvas: CanvasPick, hooks: PickLinkHooks = {}): () => void {
  let shown = ""
  let refused = ""
  let selected: string | null = null
  let reachable: ReadonlySet<string> = new Set()
  let session = 0
  let queued = false
  let closed = false

  const attempt = (action: () => void) => {
    try {
      action()
    } catch {
      return
    }
  }

  const wanted = (): CopilotPick | null => {
    const state = store.getState()
    return state.pick && state.visible && !state.blocked ? state.pick : null
  }

  const leave = () => {
    if (!shown) return
    shown = ""
    session += 1
    attempt(() => canvas.end())
  }

  const schedule = () => {
    if (queued || closed) return
    queued = true
    queueMicrotask(refresh)
  }

  function refresh() {
    queued = false
    if (closed) return
    const pick = wanted()
    const key = pickKey(pick)
    if (shown && shown !== key) leave()
    if (!pick) {
      refused = ""
      return
    }
    if (shown) {
      if (pick.selected !== selected) {
        selected = pick.selected
        const target = selected !== null && reachable.has(selected) ? selected : null
        attempt(() => canvas.select(target))
      }
      return
    }
    if (refused === key) return
    session += 1
    const mine = session
    const live = () => !closed && session === mine
    const known = pick.candidates.map((candidate) => candidate.id)
    let found: unknown = []
    try {
      found = canvas.start({
        label: pick.label,
        candidates: known,
        selected: pick.selected,
        any: pick.any === true,
        onSelect: (id) => {
          if (!live()) return
          selected = id
          if (!store.selectPick(id)) schedule()
        },
        onConfirm: (id) => {
          if (!live()) return
          shown = ""
          session += 1
          selected = id
          store.selectPick(id)
          if (hooks.confirm) hooks.confirm(id)
          else store.confirmPick()
          schedule()
        },
        onCancel: () => {
          if (!live()) return
          shown = ""
          session += 1
          store.cancelPick()
          hooks.cancel?.()
        },
      })
    } catch {
      found = []
    }
    const reached = new Set<string>(Array.isArray(found) ? found.filter((id): id is string => typeof id === "string" && known.includes(id)) : [])
    if (reached.size < 2) {
      session += 1
      attempt(() => canvas.end())
      refused = key
      hooks.listOnly?.(key)
      return
    }
    shown = key
    reachable = reached
    selected = pick.selected
    hooks.listOnly?.("")
  }

  const changed = () => {
    if (closed) return
    if (shown && shown !== pickKey(wanted())) leave()
    schedule()
  }

  const stop = store.subscribe(changed)
  schedule()
  return () => {
    if (closed) return
    closed = true
    stop()
    leave()
  }
}
