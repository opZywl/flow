"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { AlertTriangle, CheckCircle2, ListChecks, Loader2, MessageSquareText, RotateCcw, SendHorizontal, Square, Wand2, XCircle } from "lucide-react"
import type { GenerateFailure } from "@/lib/atendimento/ai/contracts"
import type { InterviewAction, InterviewMessage, InterviewTurn } from "@/lib/atendimento/ai/interview"
import { NOTE_TYPE, START_TYPE } from "@/lib/atendimento/catalog"
import type { AtendimentoFlow } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { ui } from "./ui"

export type InterviewStatus = "idle" | "thinking" | "building" | "error" | "finished"

export type BuildAction = Extract<InterviewAction, "generate" | "edit">

export type InterviewEntryRole = "assistant" | "user" | "system"

export interface InterviewEntry {
  id: string
  role: InterviewEntryRole
  text: string
  tone?: "success" | "danger" | "muted"
}

export interface InterviewChanges {
  added: number
  changed: number
  removed: number
}

export interface InterviewRunSummary {
  ok: boolean
  components?: number
  changes?: InterviewChanges
  error?: string
  details?: string
}

export interface InterviewFailure {
  title: string
  details?: string
}

export type InterviewTurnResult = { ok: true; turn: InterviewTurn } | { ok: false; failure: GenerateFailure }

export interface InterviewOptions {
  turn: (history: InterviewMessage[], flow: AtendimentoFlow | null, signal: AbortSignal) => Promise<InterviewTurnResult>
  run: (action: BuildAction, plan: string, signal: AbortSignal) => Promise<InterviewRunSummary>
  getFlow?: () => AtendimentoFlow | null | undefined
}

type Pending = { kind: "turn"; force: boolean } | { kind: "run"; action: BuildAction; plan: string }

export interface InterviewState {
  entries: InterviewEntry[]
  suggestions: string[]
  plan: string
  status: InterviewStatus
  building: BuildAction | null
  failure: InterviewFailure | null
  retryable: boolean
  built: boolean
}

export interface InterviewControls {
  send: (text: string) => boolean
  buildNow: () => boolean
  retry: () => boolean
  cancel: () => void
  finish: () => void
  reset: () => void
}

export interface InterviewStore extends InterviewControls {
  getState: () => InterviewState
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

export type InterviewHandle = InterviewState & InterviewControls & { busy: boolean; canBuild: boolean; hasFlow: boolean }

export const BUILD_NOW_TEXT = "Pode montar o fluxo agora com o que já foi decidido."

const INITIAL_STATE: InterviewState = {
  entries: [],
  suggestions: [],
  plan: "",
  status: "idle",
  building: null,
  failure: null,
  retryable: false,
  built: false,
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function hasNodes(flow: AtendimentoFlow | null | undefined): flow is AtendimentoFlow {
  return Boolean(flow && Array.isArray(flow.nodes) && flow.nodes.some((node) => node?.data?.type !== START_TYPE && node?.data?.type !== NOTE_TYPE))
}

export function resultNote(action: BuildAction, summary: InterviewRunSummary): string {
  if (action === "generate") {
    const count = summary.components ?? 0
    return count > 0 ? `O fluxo foi montado com ${plural(count, "componente", "componentes")}.` : "O fluxo foi montado no canvas."
  }
  const changes = summary.changes
  if (!changes) return "As alterações foram aplicadas no fluxo."
  const parts = [
    changes.added > 0 ? plural(changes.added, "novo", "novos") : "",
    changes.changed > 0 ? plural(changes.changed, "alterado", "alterados") : "",
    changes.removed > 0 ? plural(changes.removed, "removido", "removidos") : "",
  ].filter(Boolean)
  return parts.length ? `Alterações aplicadas: ${parts.join(", ")}.` : "Nenhuma alteração foi necessária no fluxo."
}

export function waitingText(status: InterviewStatus, building: BuildAction | null): string {
  if (status === "thinking") return "Pensando na próxima pergunta."
  if (status === "building") return building === "edit" ? "Aplicando as alterações no canvas." : "Montando o fluxo no canvas."
  return ""
}

export function toHistory(entries: readonly InterviewEntry[]): InterviewMessage[] {
  const history: InterviewMessage[] = []
  for (const entry of entries) {
    const text = entry.text.trim()
    if (!text) continue
    const role: InterviewMessage["role"] = entry.role === "user" ? "user" : "assistant"
    const last = history[history.length - 1]
    if (last && last.role === role) last.text = `${last.text}\n\n${text}`
    else history.push({ role, text })
  }
  return history
}

function cleanSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const text = item.trim()
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    list.push(text)
    if (list.length === 6) break
  }
  return list
}

function failureOf(failure: GenerateFailure | null | undefined): InterviewFailure {
  return {
    title: failure?.error?.trim() || "A IA não respondeu desta vez.",
    details: failure?.details?.trim() || undefined,
  }
}

export function createInterview(read: () => InterviewOptions): InterviewStore {
  let state = INITIAL_STATE
  let controller: AbortController | null = null
  let pending: Pending | null = null
  let sequence = 0
  const listeners = new Set<() => void>()

  const set = (patch: Partial<InterviewState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  const append = (role: InterviewEntryRole, text: string, tone?: InterviewEntry["tone"]): InterviewEntry[] => {
    sequence += 1
    return [...state.entries, { id: `m${sequence}`, role, text, ...(tone ? { tone } : {}) }]
  }

  const currentFlow = (): AtendimentoFlow | null => {
    try {
      return read().getFlow?.() ?? null
    } catch {
      return null
    }
  }

  const begin = (): AbortController => {
    controller?.abort()
    const next = new AbortController()
    controller = next
    return next
  }

  const live = (owner: AbortController) => controller === owner && !owner.signal.aborted

  const settle = (owner: AbortController) => {
    if (controller === owner) controller = null
  }

  const busy = () => state.status === "thinking" || state.status === "building"

  async function build(action: BuildAction, plan: string): Promise<void> {
    const owner = begin()
    pending = { kind: "run", action, plan }
    set({ status: "building", building: action, failure: null, retryable: false, suggestions: [] })
    let summary: InterviewRunSummary
    try {
      summary = await read().run(action, plan, owner.signal)
    } catch (error) {
      if (!live(owner)) return
      summary = { ok: false, details: error instanceof Error && error.message ? error.message : undefined }
    }
    if (!live(owner)) return
    settle(owner)
    if (!summary || !summary.ok) {
      const title = summary?.error?.trim() || (action === "edit" ? "Não foi possível aplicar as alterações." : "Não foi possível montar o fluxo.")
      set({ status: "error", building: null, failure: { title, details: summary?.details?.trim() || undefined }, retryable: true })
      return
    }
    pending = null
    set({ entries: append("system", resultNote(action, summary), "success"), building: null, built: true })
    await advance(false)
  }

  async function advance(force: boolean): Promise<void> {
    const owner = begin()
    pending = { kind: "turn", force }
    set({ status: "thinking", building: null, failure: null, retryable: false, suggestions: [] })
    const flow = currentFlow()
    let result: InterviewTurnResult
    try {
      result = await read().turn(toHistory(state.entries), flow, owner.signal)
    } catch (error) {
      if (!live(owner)) return
      settle(owner)
      set({ status: "error", failure: { title: "Não foi possível falar com a IA.", details: error instanceof Error && error.message ? error.message : undefined }, retryable: true })
      return
    }
    if (!live(owner)) return
    settle(owner)
    if (!result || !result.ok) {
      set({ status: "error", failure: failureOf(result?.failure), retryable: true })
      return
    }
    pending = null
    const turn = result.turn
    const message = typeof turn.message === "string" ? turn.message.trim() : ""
    const plan = typeof turn.plan === "string" && turn.plan.trim() ? turn.plan.trim() : state.plan
    const withFlow = hasNodes(currentFlow())
    let action: InterviewAction = turn.action === "arrange" ? "ask" : turn.action
    if (action === "edit" && !withFlow) action = "generate"
    if (force && action === "ask" && plan) action = withFlow ? "edit" : "generate"
    if ((action === "generate" || action === "edit") && !plan) action = "ask"

    if (action === "finish") {
      set({ entries: message ? append("assistant", message) : state.entries, plan, suggestions: [], status: "finished" })
      return
    }
    if (action === "ask") {
      set({
        entries: message ? append("assistant", message) : state.entries,
        plan,
        suggestions: cleanSuggestions(turn.suggestions),
        status: "idle",
      })
      return
    }
    const entries = message && !(force && turn.action === "ask") ? append("assistant", message) : state.entries
    set({ entries, plan })
    await build(action, plan)
  }

  const store: InterviewStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send(text) {
      const value = text.trim()
      if (!value || busy()) return false
      set({ entries: append("user", value), status: state.status === "finished" ? "idle" : state.status })
      void advance(false)
      return true
    },
    buildNow() {
      if (busy() || !state.plan) return false
      set({ entries: append("user", BUILD_NOW_TEXT) })
      void advance(true)
      return true
    },
    retry() {
      if (state.status !== "error" || !pending) return false
      const next = pending
      if (next.kind === "run") void build(next.action, next.plan)
      else void advance(next.force)
      return true
    },
    cancel() {
      if (!busy()) return
      const wasBuilding = state.status === "building"
      controller?.abort()
      controller = null
      pending = null
      set({
        status: "idle",
        building: null,
        failure: null,
        retryable: false,
        entries: append("system", wasBuilding ? "A montagem foi cancelada." : "Pedido cancelado. Você pode escrever de novo quando quiser.", "muted"),
      })
    },
    finish() {
      controller?.abort()
      controller = null
      pending = null
      if (state.status === "finished") return
      set({
        status: "finished",
        building: null,
        failure: null,
        retryable: false,
        suggestions: [],
        entries: append("system", "Conversa encerrada.", "muted"),
      })
    },
    reset() {
      controller?.abort()
      controller = null
      pending = null
      set({ ...INITIAL_STATE })
    },
    dispose() {
      controller?.abort()
      controller = null
    },
  }
  return store
}

export function useInterview(options: InterviewOptions): InterviewHandle {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const [store] = useState(() => createInterview(() => latest.current))
  useEffect(() => () => store.dispose(), [store])
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const busy = state.status === "thinking" || state.status === "building"
  return {
    ...state,
    busy,
    canBuild: !busy && state.status !== "finished" && Boolean(state.plan),
    hasFlow: hasNodes(options.getFlow?.()),
    send: store.send,
    buildNow: store.buildNow,
    retry: store.retry,
    cancel: store.cancel,
    finish: store.finish,
    reset: store.reset,
  }
}

export const INTERVIEW_STARTERS = [
  "Crie um fluxo de envio de boleto.",
  "Quero um menu com suporte, financeiro e vendas.",
  "Preciso de uma pesquisa de satisfação no fim do atendimento.",
]

export interface InterviewPanelProps {
  interview: InterviewHandle
  starters?: readonly string[]
  intro?: string
  className?: string
}

export function InterviewPanel({ interview, starters = INTERVIEW_STARTERS, intro, className }: InterviewPanelProps) {
  const { entries, suggestions, plan, status, building, failure, retryable, busy, canBuild } = interview
  const [draft, setDraft] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const previous = useRef<InterviewStatus>(status)
  const inputId = useId()
  const hintId = useId()
  const finished = status === "finished"
  const empty = entries.length === 0
  const chips = empty && !busy ? starters : suggestions
  const waiting = waitingText(status, building)

  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    log.scrollTo({ top: log.scrollHeight, behavior: reduced ? "auto" : "smooth" })
  }, [entries.length, status, failure])

  useEffect(() => {
    const was = previous.current
    previous.current = status
    if ((was === "thinking" || was === "building") && (status === "idle" || status === "error" || status === "finished")) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [status])

  const submit = (text: string) => {
    if (interview.send(text)) setDraft("")
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit(draft)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit(draft)
  }

  return (
    <section aria-label="Conversa com a IA" className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-flow-border bg-flow-surface", className)}>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversa com a IA"
        className="flex min-h-[12rem] flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 sm:px-4"
      >
        {empty ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-2 px-2 py-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent" aria-hidden="true">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-flow-fg">Monte o fluxo conversando</p>
            <p className="text-xs leading-5 text-flow-muted">
              {intro ??
                "Conte o que o seu atendimento precisa fazer. A IA pergunta o que faltar, como as opções do menu e as mensagens, e monta o fluxo quando tudo estiver decidido."}
            </p>
          </div>
        ) : null}

        {entries.map((entry) =>
          entry.role === "system" ? (
            <p
              key={entry.id}
              className={cn(
                "mx-auto flex max-w-[90%] items-center gap-1.5 rounded-full border px-3 py-1 text-center text-[11px] font-medium leading-4",
                entry.tone === "success"
                  ? "border-flow-success/40 bg-flow-success/10 text-flow-success"
                  : entry.tone === "danger"
                    ? "border-flow-danger/40 bg-flow-danger/10 text-flow-danger"
                    : "border-flow-border bg-flow-soft text-flow-muted",
              )}
            >
              {entry.tone === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
              <span className="min-w-0 break-words">{entry.text}</span>
            </p>
          ) : (
            <div key={entry.id} className={cn("flex", entry.role === "user" ? "justify-end" : "justify-start")}>
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  entry.role === "user"
                    ? "rounded-br-md bg-flow-accent-strong text-white"
                    : "rounded-bl-md border border-flow-border bg-flow-soft text-flow-fg",
                )}
              >
                <span className="sr-only">{entry.role === "user" ? "Você: " : "IA: "}</span>
                {entry.text}
              </p>
            </div>
          ),
        )}

        {busy ? (
          <div className="flex justify-start">
            <p role="status" className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-flow-border bg-flow-soft px-3 py-2 text-xs text-flow-muted">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-flow-accent motion-reduce:animate-none" aria-hidden="true" />
              {waiting}
            </p>
          </div>
        ) : null}

        {failure ? (
          <div role="alert" className="rounded-xl border border-flow-danger/40 bg-flow-danger/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flow-danger" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold text-flow-danger">{failure.title}</p>
                {failure.details ? <p className="break-words text-xs text-flow-muted-strong">{failure.details}</p> : null}
              </div>
              {retryable ? (
                <button type="button" onClick={() => interview.retry()} className={cn(ui.button, "h-7")}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Tentar de novo
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {plan ? (
        <details className="group border-t border-flow-border bg-flow-soft px-3 py-2 sm:px-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-flow-muted-strong outline-none transition hover:text-flow-fg focus-visible:ring-2 focus-visible:ring-flow-accent/30 [&::-webkit-details-marker]:hidden">
            <ListChecks className="h-3.5 w-3.5 shrink-0 text-flow-accent" aria-hidden="true" />
            <span className="group-open:hidden">Ver o plano</span>
            <span className="hidden group-open:inline">Esconder o plano</span>
          </summary>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-flow-border bg-flow-surface px-2.5 py-2 text-xs leading-5 text-flow-fg">
            {plan}
          </p>
        </details>
      ) : null}

      {chips.length > 0 && !finished ? (
        <div role="group" aria-label="Sugestões de resposta" className="flex flex-wrap gap-1.5 border-t border-flow-border px-3 py-2 sm:px-4">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={busy}
              onClick={() => submit(chip)}
              className="max-w-full truncate rounded-full border border-flow-accent/40 bg-flow-accent/10 px-2.5 py-1 text-xs font-medium text-flow-accent transition hover:bg-flow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-flow-border px-3 py-3 sm:px-4">
        <label htmlFor={inputId} className="sr-only">
          Sua resposta para a IA
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={hintId}
          placeholder={finished ? "Escreva para retomar a conversa" : empty ? "Descreva o atendimento que você quer montar" : "Escreva a sua resposta"}
          className={cn(ui.textarea, "max-h-40 min-h-[2.75rem] flex-1 resize-none py-2 leading-5")}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Enviar resposta"
          title="Enviar resposta"
          className={cn(ui.primaryButton, "h-9 w-9 justify-center px-0")}
        >
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <p id={hintId} className="sr-only">
        Enter envia e Shift mais Enter quebra a linha.
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-flow-border bg-flow-soft px-3 py-2.5 sm:px-4">
        <p className="hidden min-w-0 flex-1 text-[11px] leading-4 text-flow-muted sm:block">Enter envia e Shift mais Enter quebra a linha.</p>
        {busy ? (
          <button type="button" onClick={interview.cancel} className={ui.dangerButton}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            Cancelar
          </button>
        ) : null}
        {finished ? (
          <button type="button" onClick={interview.reset} className={ui.button}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Nova conversa
          </button>
        ) : (
          <button type="button" onClick={interview.finish} disabled={empty} className={ui.button}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Encerrar conversa
          </button>
        )}
        <button type="button" onClick={() => interview.buildNow()} disabled={!canBuild} className={ui.primaryButton}>
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          Montar o fluxo agora
        </button>
      </div>
    </section>
  )
}
