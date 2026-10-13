import {
  LIMITS,
  type Effort,
  type GenerateRequest,
  type GenerationChanges,
  type GenerationIssue,
  type GenerationProgress,
  type GenerationUsage,
} from "@/lib/atendimento/ai/contracts"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"
import { importFlow, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoFlow, AtendimentoNode } from "@/lib/atendimento/types"
import {
  ISSUE_GROUPS,
  PLATFORM_HINTS,
  PREVIEW_INTERVAL_MS,
  apiKeyError,
  documentKey,
  failureField,
  hasComponents,
  isModelId,
  mergeIssues,
  messageLines,
  plural,
  previewFeed,
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

export type CopilotAttention = "ready" | "failed"

export interface CopilotOptions {
  settings: CopilotSettings
  getFlow: () => AtendimentoFlow | null | undefined
  preview: (flow: AtendimentoFlow | null, done: boolean, fresh?: boolean) => void
  applyEdit: (flow: AtendimentoFlow) => boolean
  generate: CopilotGenerate
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
  | { id: string; kind: "proposal"; proposal: CopilotProposal; status: ProposalStatus }
  | { id: string; kind: "note"; text: string; tone: CopilotTone }
  | { id: string; kind: "error"; failure: Failure; prompt?: string }

export interface CopilotFocus {
  field: Field
  seq: number
}

export interface CopilotState {
  entries: CopilotEntry[]
  running: boolean
  refining: boolean
  progress: GenerationProgress | null
  startedAt: number | null
  pending: string | null
  retry: string | null
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

interface Job {
  prompt: string
  base: AtendimentoFlow
  original: AtendimentoFlow
  refines: string | null
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
  running: false,
  refining: false,
  progress: null,
  startedAt: null,
  pending: null,
  retry: null,
  visible: false,
  blocked: false,
  attention: null,
  fieldErrors: {},
  focus: null,
}

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

function countOf(diff: FlowDiff): GenerationChanges {
  return { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length }
}

export function createCopilot(read: () => CopilotOptions): CopilotStore {
  let state = INITIAL_STATE
  let run: Run | null = null
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

  const active = () => state.visible && !state.blocked

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
    set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.stale, "warning")], pending: null })
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

  const prepare = (prompt: string): Job | null => {
    const settings = read().settings
    const errors = credentialErrors(settings)
    const invalid = SETTINGS_FIELDS.find((field) => errors[field])
    if (invalid) {
      focusSequence += 1
      set({ fieldErrors: { ...state.fieldErrors, ...errors }, focus: { field: invalid, seq: focusSequence } })
      return null
    }
    const proposal = pendingProposal()
    if (proposal) {
      if (stale(proposal)) {
        dropStale()
        return null
      }
      return { prompt, base: proposal.flow, original: proposal.original, refines: state.pending, settings: { ...settings } }
    }
    const opened = currentFlow()
    if (!hasComponents(opened)) return null
    return { prompt, base: opened, original: opened, refines: null, settings: { ...settings } }
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
    const field = failureField(rejection.code, rejection.field)
    const id = nextId()
    const unseen = !state.visible
    const patch: Partial<CopilotState> = {
      entries: [...state.entries, { id, kind: "error", failure: rejection.failure, prompt: current.job.prompt }],
      retry: id,
      running: false,
      refining: false,
      progress: null,
      startedAt: null,
      ...(unseen ? { attention: "failed" as const } : {}),
    }
    if (field && SETTINGS_FIELDS.includes(field)) {
      focusSequence += 1
      patch.fieldErrors = { ...state.fieldErrors, [field]: [rejection.failure.title, rejection.failure.details].filter(Boolean).join(" ") }
      patch.focus = { field, seq: focusSequence }
    }
    set(patch)
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

  const start = (job: Job) => {
    const current: Run = { job, controller: new AbortController(), feed: null, live: null }
    run = current
    set({ running: true, refining: job.refines !== null, progress: null, startedAt: now(), retry: null })
    if (active()) show(job.base, false)
    void execute(current)
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
      if (!prompt || prompt.length > LIMITS.prompt || run || state.blocked) return false
      const job = prepare(prompt)
      if (!job) return false
      set({ entries: [...state.entries, { id: nextId(), kind: "user", text: prompt }] })
      start(job)
      return true
    },
    cancel() {
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
      if (run || state.blocked) return false
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
      set({ entries: [...mark(id, "applied"), note(COPILOT_TEXT.applied, "success")], pending: null })
      return true
    },
    discard() {
      if (run) return false
      const id = state.pending
      if (!id || !pendingProposal()) return false
      hide()
      set({ entries: [...mark(id, "discarded"), note(COPILOT_TEXT.discarded, "muted")], pending: null })
      return true
    },
    retry() {
      if (run || state.blocked || !state.retry) return false
      const entry = state.entries.find((item) => item.id === state.retry)
      if (!entry || entry.kind !== "error" || !entry.prompt) return false
      const job = prepare(entry.prompt)
      if (!job) return false
      set({ entries: state.entries.filter((item) => item.id !== entry.id) })
      start(job)
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
      const current = run
      run = null
      if (current) {
        current.controller.abort()
        current.feed?.stop()
        set({ running: false, refining: false, progress: null, startedAt: null })
      }
      hide()
    },
  }
  return store
}
