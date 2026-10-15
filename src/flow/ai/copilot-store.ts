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
import { importFlow, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode } from "@/lib/atendimento/types"
import type { InterviewTurnResult } from "../ai-interview"
import {
  ISSUE_GROUPS,
  PLATFORM_HINTS,
  PREVIEW_INTERVAL_MS,
  apiKeyError,
  changeLabels,
  documentKey,
  failureField,
  hasComponents,
  isModelId,
  mergeIssues,
  messageLines,
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

export type CopilotTurn = (input: CopilotTurnInput, signal: AbortSignal) => Promise<InterviewTurnResult>

export type CopilotAttention = "ready" | "failed" | "question"

export interface CopilotOptions {
  settings: CopilotSettings
  getFlow: () => AtendimentoFlow | null | undefined
  preview: (flow: AtendimentoFlow | null, done: boolean, fresh?: boolean) => void
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

export interface CopilotState {
  entries: CopilotEntry[]
  thinking: boolean
  running: boolean
  refining: boolean
  progress: GenerationProgress | null
  startedAt: number | null
  pending: string | null
  retry: string | null
  suggestions: string[]
  plan: string
  visible: boolean
  blocked: boolean
  attention: CopilotAttention | null
  fieldErrors: FieldErrors
  focus: CopilotFocus | null
}

export interface CopilotStore {
  getState: () => CopilotState
  subscribe: (listener: () => void) => () => void
  send: (text: string) => boolean
  editNow: () => boolean
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

interface Target {
  base: AtendimentoFlow
  original: AtendimentoFlow
  refines: string | null
}

interface Job extends Target {
  prompt: string
  settings: CopilotSettings
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
} as const

export const EDIT_NOW_TEXT = "Pode editar agora com o que já foi decidido."
export const FOLLOW_UP_TEXT = "Precisa mudar mais alguma coisa no fluxo?"
export const SILENT_TURN = "A IA não respondeu desta vez."

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
  running: false,
  refining: false,
  progress: null,
  startedAt: null,
  pending: null,
  retry: null,
  suggestions: [],
  plan: "",
  visible: false,
  blocked: false,
  attention: null,
  fieldErrors: {},
  focus: null,
}

const SUGGESTION_LIMIT = 6

export function credentialErrors(settings: CopilotSettings): FieldErrors {
  const info = PROVIDERS.find((entry) => entry.id === settings.provider) ?? PROVIDERS[0]
  const errors: FieldErrors = {}
  const key = apiKeyError(info, settings.apiKey.trim())
  if (key) errors.apiKey = key
  if (!isModelId(settings.model)) errors.model = "Escolha um modelo válido."
  return errors
}

export function proposalTitle(proposal: CopilotProposal): string {
  if (proposal.partial) return "Edição feita em parte"
  return proposal.issues.length ? `Edição pronta com ${plural(proposal.issues.length, "pendência", "pendências")}` : "Edição pronta"
}

export function proposalTone(proposal: CopilotProposal): "success" | "warning" | "danger" {
  if (proposal.blocking) return "danger"
  return proposal.issues.length || proposal.partial ? "warning" : "success"
}

export function proposalGroups(proposal: CopilotProposal): IssueGroup[] {
  return ISSUE_GROUPS.map((group) => ({
    ...group,
    hint: group.scope === "plataforma" ? PLATFORM_HINTS[proposal.fill ? "on" : "off"] : group.hint,
    items: proposal.issues.filter((issue) => issue.scope === group.scope),
  })).filter((group) => group.items.length > 0)
}

export function proposalSummary(proposal: CopilotProposal): string {
  if (!proposal.changes) return "Proposta pronta no canvas."
  const [added, changed, removed] = changeLabels(proposal.changes)
  return `Proposta pronta no canvas: ${added}, ${changed} e ${removed}.`
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

export function createCopilot(read: () => CopilotOptions): CopilotStore {
  let state = INITIAL_STATE
  let run: Run | null = null
  let asking: AbortController | null = null
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

  const show = (flow: AtendimentoFlow, done: boolean, fresh = true) => {
    try {
      read().preview(flow, done, fresh)
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

  const stale = (proposal: CopilotProposal) => {
    const opened = currentFlow()
    return !opened || documentKey(opened) !== documentKey(proposal.original)
  }

  const mark = (id: string, status: ProposalStatus): CopilotEntry[] =>
    state.entries.map((entry) => (entry.kind === "proposal" && entry.id === id && entry.status === "pending" ? { ...entry, status } : entry))

  const dropStale = () => {
    const id = state.pending
    if (!id) return
    hide()
    set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.stale, "warning")], pending: null, plan: "", suggestions: [] })
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
    if (proposal) show(proposal.flow, true)
    else hide()
  }

  const sync = () => {
    if (!active()) return
    if (run) {
      show(run.live ?? run.job.base, false)
      return
    }
    const proposal = pendingProposal()
    if (!proposal) return
    if (stale(proposal)) {
      dropStale()
      return
    }
    show(proposal.flow, true)
  }

  const requestOf = (job: Job): GenerateRequest => ({
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
  })

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
    if (!hasComponents(opened)) return null
    return { base: opened, original: opened, refines: null }
  }

  const prepare = (prompt: string): Job | null => {
    const settings = checkSettings()
    if (!settings) return null
    const found = target()
    return found ? { ...found, prompt, settings } : null
  }

  const lastRequest = (): string => {
    for (let index = state.entries.length - 1; index >= 0; index--) {
      const entry = state.entries[index]
      if (entry.kind === "user") return entry.text
    }
    return ""
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
    const changes = diff ? countOf(diff) : job.refines ? null : received.changes ?? null
    const before = new Map(job.original.nodes.map((node) => [node.id, node]))
    const removed = (diff?.removed ?? []).flatMap((id) => {
      const node = before.get(id)
      return node ? [node] : []
    })
    let blocking: ReturnType<typeof validateFlow> = []
    try {
      blocking = validateFlow(received.flow).filter((issue) => issue.severity === "error")
    } catch {
      blocking = []
    }
    const proposal: CopilotProposal = {
      flow: received.flow,
      original: job.original,
      base: job.base,
      prompt: job.prompt,
      issues: mergeIssues(received.issues, blocking),
      blocking: blocking.length,
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
    }
    const id = nextId()
    const entries = job.refines ? mark(job.refines, "refined") : state.entries
    const unseen = !state.visible
    set({
      entries: [...entries, { id, kind: "proposal", proposal, status: "pending" }],
      pending: id,
      plan: "",
      running: false,
      refining: false,
      progress: null,
      startedAt: null,
      ...(unseen ? { attention: "ready" as const } : {}),
    })
    if (active()) show(received.flow, true)
    else hide()
    if (unseen) notify("ready")
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
            if (active()) show(flow, false, false)
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

  const start = (job: Job, entries: CopilotEntry[] = state.entries) => {
    const current: Run = { job, controller: new AbortController(), feed: null, live: null }
    run = current
    set({ entries, thinking: false, running: true, refining: job.refines !== null, progress: null, startedAt: now(), retry: null, suggestions: [] })
    if (active()) show(job.base, false)
    void execute(current)
  }

  const heard = (controller: AbortController) => asking === controller && !controller.signal.aborted

  const misheard = (controller: AbortController, rejection: Rejection) => {
    if (asking === controller) asking = null
    const unseen = report(rejection, { turn: true }, { thinking: false })
    if (unseen) notify("failed")
  }

  const answered = (controller: AbortController, turn: InterviewTurn) => {
    if (asking === controller) asking = null
    const message = typeof turn.message === "string" ? turn.message.trim() : ""
    const plan = (typeof turn.plan === "string" ? turn.plan.trim() : "") || state.plan
    const entries = message ? [...state.entries, said(message)] : state.entries
    if (turn.action === "finish") {
      set({ entries, thinking: false, suggestions: [], plan: "" })
      return
    }
    if (turn.action === "edit" || turn.action === "generate") {
      set({ entries, suggestions: [], plan })
      const prompt = plan || lastRequest()
      const job = prompt ? prepare(prompt) : null
      if (job) start(job)
      else set({ thinking: false })
      return
    }
    const unseen = !state.visible
    set({ entries, thinking: false, suggestions: chipsOf(turn.suggestions), plan, ...(unseen ? { attention: "question" as const } : {}) })
    if (unseen) notify("question")
  }

  async function converse(controller: AbortController, input: CopilotTurnInput): Promise<void> {
    let result: InterviewTurnResult | null | undefined
    try {
      result = await read().turn(input, controller.signal)
    } catch {
      if (heard(controller)) misheard(controller, { code: "network", failure: CONNECTION_FAILURE })
      return
    }
    if (!heard(controller)) return
    if (result?.ok) answered(controller, result.turn)
    else misheard(controller, turnRejection(result?.failure))
  }

  const think = (settings: CopilotSettings, found: Target, entries: CopilotEntry[]) => {
    const controller = new AbortController()
    asking = controller
    set({ entries, thinking: true, suggestions: [], retry: null })
    void converse(controller, { history: copilotHistory(entries), flow: found.base, proposal: found.refines !== null, settings })
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
    send(text) {
      const prompt = text.trim()
      if (!prompt || prompt.length > LIMITS.prompt || busy() || state.blocked) return false
      return listen(() => [...state.entries, { id: nextId(), kind: "user", text: prompt }])
    },
    editNow() {
      if (busy() || state.blocked || !state.plan) return false
      const job = prepare(state.plan)
      if (!job) return false
      start(job, [...state.entries, { id: nextId(), kind: "user", text: EDIT_NOW_TEXT }])
      return true
    },
    cancel() {
      const controller = asking
      if (controller) {
        asking = null
        controller.abort()
        set({ thinking: false, entries: [...state.entries, note(COPILOT_TEXT.cancelled, "muted")] })
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
        entries: [...state.entries, note(COPILOT_TEXT.cancelled, "muted")],
      })
      restore()
    },
    apply() {
      if (busy() || state.blocked) return false
      const id = state.pending
      const proposal = pendingProposal()
      if (!id || !proposal) return false
      if (stale(proposal)) {
        dropStale()
        return false
      }
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
        plan: "",
        suggestions: [],
      })
      return true
    },
    discard() {
      if (busy()) return false
      const id = state.pending
      if (!id || !pendingProposal()) return false
      hide()
      set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.discarded, "muted")], pending: null, plan: "", suggestions: [] })
      return true
    },
    retry() {
      if (busy() || state.blocked || !state.retry) return false
      const entry = state.entries.find((item) => item.id === state.retry)
      if (!entry || entry.kind !== "error") return false
      const without = () => state.entries.filter((item) => item.id !== entry.id)
      if (entry.turn) return listen(without)
      if (!entry.prompt) return false
      const job = prepare(entry.prompt)
      if (!job) return false
      start(job, without())
      return true
    },
    setVisible(visible) {
      if (visible === state.visible) return
      if (!visible) {
        set({ visible: false })
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
      controller?.abort()
      if (current) {
        current.controller.abort()
        current.feed?.stop()
      }
      if (controller || current) set({ thinking: false, running: false, refining: false, progress: null, startedAt: null })
      hide()
    },
  }
  return store
}
