"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cpu,
  Eye,
  EyeOff,
  Info,
  Loader2,
  MousePointerClick,
  PenLine,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  SlidersHorizontal,
  Square,
  Trash2,
  WandSparkles,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { EFFORTS, LIMITS, type GenerationIssue } from "@/lib/atendimento/ai/contracts"
import type { InterviewInput } from "@/lib/atendimento/ai/interview"
import { PROVIDERS, type ProviderId } from "@/lib/atendimento/ai/providers"
import { START_TYPE, getComponentLabel } from "@/lib/atendimento/catalog"
import type { AtendimentoFlow, AtendimentoNode } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import {
  EFFORT_OPTIONS,
  FILL_HINTS,
  apiKeyError,
  changeLabels,
  clock,
  effortChoices,
  formatNumber,
  generateFlow,
  issueSubject,
  keyWarning,
  loadEngine,
  modelChoices,
  modelName,
  pickEffort,
  plural,
  requestModels,
  requestTurn,
  stageText,
  type Field,
  type Listing,
} from "./ai/generation-client"
import {
  EMPTIED_NOTICE,
  FOCUS_MISSED,
  STATUS_LABELS,
  createCopilot,
  linkPick,
  pickKey,
  proposalApplicable,
  proposalGroups,
  proposalTitle,
  proposalTone,
  type CopilotAttention,
  type CopilotEntry,
  type CopilotOptions,
  type CopilotPick,
  type CopilotProposal,
  type CopilotTone,
  type CopilotTurnInput,
  type ProposalStatus,
} from "./ai/copilot-store"
import { useAiSetting } from "./ai/settings-store"
import { FlowSelect } from "./flow-select"
import type { CanvasPick } from "./pick"
import { ui } from "./ui"

type PreviewKind = "create" | "edit"

export interface AICopilotProps {
  id: string
  open: boolean
  onClose: () => void
  getCurrentFlow: () => AtendimentoFlow | null
  onLivePreview: (flow: AtendimentoFlow | null, done?: boolean, kind?: PreviewKind, fresh?: boolean, focus?: string | null) => void
  onWorkflowEdited: (workflow: AtendimentoFlow) => boolean
  dialogBusy?: boolean
  onAttentionChange?: (attention: CopilotAttention | null) => void
  pick?: CanvasPick
}

export const COPILOT_EXAMPLES = [
  "Peça o CPF do cliente antes do menu principal",
  "Troque a mensagem de boas-vindas por uma mais curta",
  "Fora do horário de atendimento, transfira para o departamento Suporte",
  "Acrescente uma pesquisa de satisfação no fim do atendimento",
] as const

export const COPILOT_INTRO =
  "O copiloto edita o fluxo aberto a partir do seu pedido. Quando faltar alguma informação, como o texto de uma opção ou o destino de uma transferência, ele pergunta antes de mudar. As mudanças aparecem no canvas para você conferir e só valem quando você aplicar. Desfazer (Ctrl+Z) volta ao fluxo anterior."

export const THINKING_TEXT = "Pensando no pedido."

export const ATTENTION_TOASTS: Readonly<Record<CopilotAttention, Parameters<typeof toast>[0]>> = {
  ready: { title: "Edição do Copiloto pronta", description: "Abra o Copiloto para revisar e aplicar." },
  failed: { title: "O Copiloto não conseguiu editar o fluxo", description: "Abra o Copiloto para ver o motivo.", variant: "destructive" },
  question: { title: "O Copiloto tem uma pergunta", description: "Abra o Copiloto para responder." },
}

const PROVIDER_OPTIONS = PROVIDERS.map((entry) => ({ value: entry.id, label: entry.name }))
const PLACEHOLDER = "O que você quer mudar no fluxo?"
const REFINE_PLACEHOLDER = "Peça um ajuste nesta proposta"
const REFINE_HINT = "O próximo pedido ajusta a proposta mostrada no canvas."
const BUSY_NOTICE = "Aguarde a geração do Gerar com IA terminar."
const EDIT_NOW_LABEL = "Editar agora com o que já foi decidido"
const FOLLOW_GAP = 160

export const PICK_REGION = "Seleção do componente"
export const PICK_OTHER = "Outro"
export const PICK_OTHER_LABEL = "Escreva outra resposta"
export const PICK_OTHER_PLACEHOLDER = "Explique melhor ou peça outra coisa, como: crie as duas opções no menu principal."
export const PICK_OTHER_SEND = "Enviar resposta"
export const pickOtherWith = (subject: string) => `A seleção vai junto: ${subject}.`
export const ANY_PICK_NOTE = `Você pode escolher qualquer componente com saída, inclusive o ${getComponentLabel(START_TYPE)}.`

const iconButton =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-strong hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
const iconButtonActive = "bg-flow-accent/15 text-flow-accent hover:bg-flow-accent/20 hover:text-flow-accent"
const fieldBase = "block disabled:cursor-not-allowed disabled:opacity-60"
const invalidField =
  "border-flow-danger hover:border-flow-danger focus-visible:border-flow-danger focus-visible:ring-flow-danger/25"
const warningText = "mt-1 text-[11px] leading-4 text-flow-warning"
const summaryClass =
  "flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md py-0.5 text-xs font-semibold text-flow-muted-strong transition hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 [&::-webkit-details-marker]:hidden"
const chevron = "h-3.5 w-3.5 shrink-0 text-flow-muted transition-transform group-open:rotate-90"
const candidateButton =
  "flex w-full items-start gap-2 rounded-lg border border-flow-border bg-flow-surface px-2.5 py-1.5 text-left text-xs leading-5 text-flow-muted-strong transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"
const candidateActive = "border-flow-accent bg-flow-accent/10 text-flow-fg hover:border-flow-accent"
const chipButton =
  "max-w-full whitespace-normal break-words rounded-2xl border border-flow-accent/40 bg-flow-accent/10 px-2.5 py-1 text-left text-xs font-medium text-flow-accent transition hover:bg-flow-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30 disabled:pointer-events-none disabled:opacity-40"

const CHANGE_DOTS = ["bg-flow-success", "bg-flow-accent", "bg-flow-danger"] as const

const TONES: Record<"success" | "warning" | "danger", { box: string; badge: string; Icon: LucideIcon }> = {
  success: { box: "border-flow-success/40 bg-flow-success/10", badge: "bg-flow-success/15 text-flow-success", Icon: CheckCircle2 },
  warning: { box: "border-flow-warning/40 bg-flow-warning/10", badge: "bg-flow-warning/15 text-flow-warning", Icon: AlertTriangle },
  danger: { box: "border-flow-danger/40 bg-flow-danger/10", badge: "bg-flow-danger/15 text-flow-danger", Icon: XCircle },
}

const NOTE_TONES: Record<CopilotTone, string> = {
  success: "border-flow-success/40 bg-flow-success/10 text-flow-success",
  warning: "border-flow-warning/40 bg-flow-warning/10 text-flow-warning",
  danger: "border-flow-danger/40 bg-flow-danger/10 text-flow-danger",
  muted: "border-flow-border bg-flow-soft text-flow-muted",
}

const STATUS_TONES: Record<Exclude<ProposalStatus, "pending">, string> = {
  applied: "text-flow-success",
  discarded: "text-flow-muted",
  refined: "text-flow-muted",
}

function providerInfo(id: ProviderId) {
  return PROVIDERS.find((entry) => entry.id === id) ?? PROVIDERS[0]
}

function safeFlow(read: () => AtendimentoFlow | null): AtendimentoFlow | null {
  try {
    return read() ?? null
  } catch {
    return null
  }
}

function focusLost(): boolean {
  const active = document.activeElement
  return !active || active === document.body
}

export function copilotTurnInput({ history, flow, proposal, settings }: CopilotTurnInput): InterviewInput {
  return {
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey.trim(),
    effort: settings.effort,
    fill: settings.fill,
    history,
    flow,
    scope: "copilot",
    proposal,
  }
}

export function pickHint(label: string, onCanvas: boolean, blocked = false, any = false): string {
  if (blocked) return `Aguarde a geração do Gerar com IA terminar para selecionar ${label}.`
  const hint = onCanvas ? `Selecione ${label} no canvas ou na lista e confirme.` : `Selecione ${label} na lista e confirme.`
  return any ? `${hint} ${ANY_PICK_NOTE}` : hint
}

export function brokenText(count: number): string {
  return `${plural(count, "pendência criada nesta edição quebra", "pendências criadas nesta edição quebram")} o formato do JSON. Peça um ajuste para corrigir ou descarte a proposta.`
}

export function unmetText(count: number): string {
  return `A edição ficou diferente do pedido em ${plural(count, "ponto", "pontos")}. Confira antes de aplicar ou peça um ajuste.`
}

export function canReply({ busy, dialogBusy }: { busy: boolean; dialogBusy: boolean }): boolean {
  return !busy && !dialogBusy
}

export function landing(entries: readonly CopilotEntry[], pending: string | null): "apply" | "prompt" {
  const last = entries[entries.length - 1]
  if (pending === null || last?.id !== pending) return "prompt"
  return last.kind !== "proposal" || proposalApplicable(last.proposal) ? "apply" : "prompt"
}

interface RepliesProps {
  suggestions: readonly string[]
  editNow: boolean
  disabled: boolean
  onAnswer: (text: string) => void
  onEditNow: () => void
}

export function Replies({ suggestions, editNow, disabled, onAnswer, onEditNow }: RepliesProps) {
  if (suggestions.length === 0 && !editNow) return null
  return (
    <div className="flex shrink-0 items-start gap-2 border-t border-flow-border px-3 py-2">
      {suggestions.length > 0 ? (
        <div role="group" aria-label="Sugestões de resposta" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {suggestions.map((chip) => (
            <button key={chip} type="button" title={chip} disabled={disabled} onClick={() => onAnswer(chip)} className={chipButton}>
              {chip}
            </button>
          ))}
        </div>
      ) : null}
      {editNow ? (
        <button
          type="button"
          onClick={onEditNow}
          disabled={disabled}
          aria-label={EDIT_NOW_LABEL}
          title={EDIT_NOW_LABEL}
          className={cn(ui.accentButton, "ml-auto h-7 px-2.5")}
        >
          <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Editar agora
        </button>
      ) : null}
    </div>
  )
}

function CandidateText({ text }: { text: string }) {
  const cut = text.lastIndexOf(" · ID ")
  if (cut < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, cut)} <span className="whitespace-nowrap">{text.slice(cut + 1)}</span>
    </>
  )
}

interface PickBoxProps {
  id: string
  pick: CopilotPick
  onCanvas: boolean
  disabled: boolean
  blocked?: boolean
  onSelect: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
  onAnswer?: (text: string) => boolean
}

export function PickBox({ id, pick, onCanvas, disabled, blocked = false, onSelect, onCancel, onConfirm, onAnswer }: PickBoxProps) {
  const hintId = `${id}-hint`
  const otherId = `${id}-other`
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState("")
  const selected = pick.candidates.find((candidate) => candidate.id === pick.selected)
  const send = () => {
    const value = text.trim()
    if (!value || disabled || !onAnswer) return
    if (!onAnswer(value)) return
    setText("")
    setWriting(false)
  }
  const onOtherKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      setWriting(false)
      return
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }
  return (
    <div role="region" aria-label={PICK_REGION} className="rounded-xl border border-flow-accent/40 bg-flow-accent/10 px-3 py-2.5">
      <p id={hintId} className="flex items-start gap-2 text-xs font-medium leading-5 text-flow-fg">
        <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-accent" aria-hidden="true" />
        <span className="min-w-0">{pickHint(pick.label, onCanvas, blocked, pick.any === true)}</span>
      </p>
      <ul aria-labelledby={hintId} className="mt-2 max-h-56 space-y-1.5 overflow-y-auto overscroll-contain">
        {pick.candidates.map((candidate) => {
          const chosen = candidate.id === pick.selected
          return (
            <li key={candidate.id}>
              <button
                type="button"
                aria-pressed={chosen}
                disabled={disabled}
                onClick={() => onSelect(candidate.id)}
                className={cn(candidateButton, chosen && candidateActive)}
              >
                {chosen ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-accent" aria-hidden="true" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-muted" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">
                  <CandidateText text={candidate.text} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {onAnswer && writing ? (
        <div className="mt-2.5 space-y-1.5">
          <label htmlFor={otherId} className="block text-[11px] font-semibold leading-4 text-flow-fg">
            {PICK_OTHER_LABEL}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={otherId}
              autoFocus
              rows={2}
              value={text}
              maxLength={LIMITS.prompt}
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onOtherKeyDown}
              placeholder={PICK_OTHER_PLACEHOLDER}
              aria-describedby={selected ? `${otherId}-with` : undefined}
              className={cn(ui.textarea, "max-h-32 min-h-[2.5rem] flex-1 resize-none py-1.5 text-xs leading-5")}
            />
            <button
              type="button"
              onClick={send}
              disabled={disabled || !text.trim()}
              aria-label={PICK_OTHER_SEND}
              title={PICK_OTHER_SEND}
              className={cn(ui.primaryButton, "h-8 w-8 justify-center px-0")}
            >
              <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {selected ? (
            <p id={`${otherId}-with`} className="text-[11px] leading-4 text-flow-muted">
              {pickOtherWith(selected.text)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={cn(ui.button, "h-7")}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelar seleção
        </button>
        {onAnswer && !writing ? (
          <button type="button" onClick={() => setWriting(true)} disabled={disabled} className={cn(ui.button, "h-7")}>
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            {PICK_OTHER}
          </button>
        ) : null}
        <button type="button" onClick={onConfirm} disabled={disabled || !pick.selected} className={cn(ui.primaryButton, "h-7")}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Confirmar seleção
        </button>
      </div>
    </div>
  )
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

export function IncomingReply({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="flex justify-start" aria-hidden="true">
      <div className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-bl-md border border-flow-border bg-flow-soft px-3 py-2 text-sm leading-relaxed text-flow-fg">
        {text}
      </div>
    </div>
  )
}

function Waiting({ text, time, onStop }: { text: string; time?: string; onStop: () => void }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-flow-border bg-flow-soft px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-flow-muted">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-flow-accent motion-reduce:animate-none" aria-hidden="true" />
          <p role="status" className="min-w-0 flex-1 leading-4">
            {text}
          </p>
          {time ? (
            <span aria-hidden="true" className="shrink-0 tabular-nums">
              {time}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onStop} className={cn(ui.dangerButton, "h-7")}>
            <Square className="h-3 w-3" aria-hidden="true" />
            Parar
          </button>
        </div>
      </div>
    </div>
  )
}

interface ProposalCardProps {
  entryId: string
  proposal: CopilotProposal
  status: ProposalStatus
  meta: string
  applyId: string
  canApply: boolean
  canDiscard: boolean
  onApply: () => void
  onDiscard: () => void
}

export function ProposalCard({ entryId, proposal, status, meta, applyId, canApply, canDiscard, onApply, onDiscard }: ProposalCardProps) {
  const titleId = `${entryId}-title`
  const tone = TONES[proposalTone(proposal)]
  const ToneIcon = tone.Icon
  const groups = proposalGroups(proposal)
  const byId = new Map(proposal.flow.nodes.map((node) => [node.id, node] as const))
  const pending = status === "pending"
  return (
    <div className={cn("rounded-xl border p-3", tone.box, !pending && "opacity-80")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tone.badge)} aria-hidden="true">
          <ToneIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold leading-5 text-flow-fg">
            {proposalTitle(proposal)}
          </h3>
          {proposal.partial ? (
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-flow-warning">
              A edição foi interrompida antes do fim. Confira as mudanças no canvas antes de aplicar.
            </p>
          ) : null}
          {proposal.broken.length ? (
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-flow-danger">{brokenText(proposal.broken.length)}</p>
          ) : proposal.emptied ? (
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-flow-warning">{EMPTIED_NOTICE}</p>
          ) : proposal.blocking ? (
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-flow-danger">
              {plural(proposal.blocking, "pendência impede", "pendências impedem")} a exportação do JSON. Corrija no editor depois de aplicar.
            </p>
          ) : null}
          {proposal.unmet.length ? (
            <div className="mt-0.5 text-[11px] font-medium leading-4 text-flow-danger">
              <p>{unmetText(proposal.unmet.length)}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {proposal.unmet.map((issue, index) => {
                  const subject = issueSubject(issue, byId)
                  return (
                    <li key={`${issue.nodeId ?? "fluxo"}-${index}`} className="break-words">
                      {subject ? `${subject}: ` : ""}
                      {issue.message}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
          {proposal.missed ? <p className="mt-0.5 text-[11px] font-medium leading-4 text-flow-warning">{FOCUS_MISSED}</p> : null}
        </div>
      </div>

      {proposal.changes ? (
        <ul aria-label="Mudanças no fluxo aberto" className="mt-2.5 flex flex-wrap gap-1.5">
          {changeLabels(proposal.changes).map((label, index) => (
            <li key={label} className={cn(ui.chip, "inline-flex items-center gap-1.5 bg-flow-surface")}>
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", CHANGE_DOTS[index])} />
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      {proposal.removed.length > 0 ? (
        <p className={ui.hint}>
          Componentes removidos:{" "}
          {proposal.removed.map((node: AtendimentoNode) => `${getComponentLabel(node.data.type)} · ID ${node.id}`).join(", ")}.
        </p>
      ) : null}

      {groups.length > 0 ? (
        <details className="group mt-2.5">
          <summary className={summaryClass}>
            <ChevronRight className={chevron} aria-hidden="true" />
            Ver pendências ({formatNumber(proposal.issues.length)})
          </summary>
          <div className="mt-2 space-y-2">
            {groups.map((group) => (
              <div key={group.scope} className="overflow-hidden rounded-lg border border-flow-border bg-flow-surface">
                <div className="border-b border-flow-border bg-flow-soft px-2.5 py-1.5">
                  <h4 id={`${entryId}-${group.scope}`} className="text-[11px] font-semibold text-flow-fg">
                    {group.title} <span className="font-normal text-flow-muted">({group.items.length})</span>
                  </h4>
                  <p className="text-[11px] leading-4 text-flow-muted">{group.hint}</p>
                </div>
                <ul aria-labelledby={`${entryId}-${group.scope}`} className="divide-y divide-flow-border">
                  {group.items.map((issue, index) => {
                    const subject = issueSubject(issue, byId)
                    return (
                      <li key={`${issue.nodeId ?? "fluxo"}-${index}`} className="flex items-start gap-2 px-2.5 py-1.5">
                        <SeverityIcon severity={issue.severity} />
                        <p className="min-w-0 break-words text-[11px] leading-4 text-flow-muted-strong">
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
          </div>
        </details>
      ) : null}

      {proposal.prompt ? (
        <details className="group mt-2.5">
          <summary className={summaryClass}>
            <ChevronRight className={chevron} aria-hidden="true" />
            Ver o pedido completo
          </summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line break-words rounded-lg border border-flow-border bg-flow-surface px-2.5 py-2 text-[11px] leading-4 text-flow-fg">
            {proposal.prompt}
          </p>
        </details>
      ) : null}

      <p className="mt-2.5 break-words text-[11px] leading-4 text-flow-muted">{meta}</p>

      {pending ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onDiscard} disabled={!canDiscard} className={ui.dangerButton}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Descartar
          </button>
          <button id={applyId} type="button" onClick={onApply} disabled={!canApply} className={ui.primaryButton}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Aplicar
          </button>
        </div>
      ) : (
        <p className={cn("mt-2 flex items-center gap-1.5 text-[11px] font-semibold", STATUS_TONES[status])}>
          {status === "applied" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          {STATUS_LABELS[status]}
        </p>
      )}
    </div>
  )
}

export default function AICopilot({
  id,
  open,
  onClose,
  getCurrentFlow,
  onLivePreview,
  onWorkflowEdited,
  dialogBusy = false,
  onAttentionChange,
  pick,
}: AICopilotProps) {
  const baseId = useId()
  const idFor = (key: string) => `${baseId}-${key}`
  const describedBy = (...ids: Array<string | false | null | undefined>) => ids.filter(Boolean).join(" ") || undefined
  const [provider, setProvider] = useAiSetting("provider")
  const [keys, setKeys] = useAiSetting("keys")
  const [models, setModels] = useAiSetting("models")
  const [fetched, setFetched] = useAiSetting("fetched")
  const [effortChoice, setEffortChoice] = useAiSetting("effortChoice")
  const [fill, setFill] = useAiSetting("fill")
  const [listing, setListing] = useState<Listing | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const [listKey, setListKey] = useState("")
  const pickActions = useRef<{ confirm: () => void; cancel: () => void }>({ confirm: () => undefined, cancel: () => undefined })
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listAbortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const focusSeqRef = useRef(0)
  const openRef = useRef(false)
  const keyRef = useRef("")
  const propsRef = useRef({ getCurrentFlow, onLivePreview, onWorkflowEdited, onAttentionChange })

  const info = providerInfo(provider)
  const apiKey = keys[provider] ?? ""
  const listed = fetched[provider]?.models
  const model = models[provider] || info.presets[0].id
  const currentModelName = modelName(info, model, listed)
  const effort = pickEffort(effortChoice, provider, model)
  const effortOptions = effortChoices(provider, model)
  const modelOptions = modelChoices(info, model, listed)
  const warning = keyWarning(info, apiKey)
  const providerListing = listing?.provider === provider ? listing : null

  const options: CopilotOptions = {
    settings: { provider, model, apiKey, effort, fill },
    getFlow: () => safeFlow(propsRef.current.getCurrentFlow),
    preview: (flow, done, fresh, focus) => propsRef.current.onLivePreview(flow, done, "edit", fresh, focus),
    applyEdit: (flow) => propsRef.current.onWorkflowEdited(flow),
    generate: generateFlow,
    turn: (input, signal, onPartial) => requestTurn(copilotTurnInput(input), signal, undefined, onPartial),
    engine: loadEngine,
    notify: (attention) => toast(ATTENTION_TOASTS[attention]),
  }
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
    propsRef.current = { getCurrentFlow, onLivePreview, onWorkflowEdited, onAttentionChange }
    keyRef.current = apiKey
    pickActions.current = { confirm: confirmSelection, cancel: () => setFocusTarget(idFor("prompt")) }
  })

  const [store] = useState(() => createCopilot(() => latest.current))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const { entries, thinking, incoming, running, pending, suggestions, plan, fieldErrors, focus } = state
  const asked = state.pick
  const busy = thinking || running
  const arrival = landing(entries, pending)

  useEffect(() => () => store.dispose(), [store])

  useEffect(() => {
    store.setVisible(open)
  }, [open, store])

  useEffect(() => {
    store.setBlocked(dialogBusy)
  }, [dialogBusy, store])

  useEffect(() => {
    if (!pick) return
    return linkPick(store, pick, {
      confirm: () => pickActions.current.confirm(),
      cancel: () => pickActions.current.cancel(),
      listOnly: setListKey,
    })
  }, [store, pick])

  useEffect(() => {
    propsRef.current.onAttentionChange?.(state.attention)
  }, [state.attention])

  useEffect(
    () => () => {
      listAbortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (open && !apiKey.trim()) setSettingsOpen(true)
  }, [open, provider, apiKey])

  useEffect(() => {
    store.clearFieldError("provider", "apiKey", "model", "effort")
  }, [store, provider])

  useEffect(() => {
    store.clearFieldError("apiKey")
  }, [store, apiKey])

  useEffect(() => {
    store.clearFieldError("model")
  }, [store, model])

  useEffect(() => {
    store.clearFieldError("effort")
  }, [store, effort])

  useEffect(() => {
    if (!running) return
    setClockNow(Date.now())
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !open || (!entries.length && !busy)) return
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    body.scrollTo({ top: body.scrollHeight, behavior: reduced ? "auto" : "smooth" })
  }, [entries.length, busy, open])

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !open || !incoming) return
    if (body.scrollHeight - body.scrollTop - body.clientHeight > FOLLOW_GAP) return
    body.scrollTo({ top: body.scrollHeight })
  }, [incoming, open])

  useEffect(() => {
    const opened = open && !openRef.current
    openRef.current = open
    if (opened) setFocusTarget(`${baseId}-${keyRef.current.trim() ? "prompt" : "apiKey"}`)
  }, [open, baseId])

  useEffect(() => {
    const ended = busyRef.current && !busy
    busyRef.current = busy
    if (focus && focus.seq !== focusSeqRef.current) {
      focusSeqRef.current = focus.seq
      setSettingsOpen(true)
      if (open && focusLost()) setFocusTarget(`${baseId}-${focus.field}`)
      return
    }
    if (ended && open && focusLost()) setFocusTarget(`${baseId}-${arrival}`)
  }, [busy, focus, arrival, open, baseId])

  useEffect(() => {
    if (!focusTarget) return
    document.getElementById(focusTarget)?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const handleFocusRequest = (before: number | undefined) => {
    const after = store.getState().focus
    if (!after || after.seq === before) return
    focusSeqRef.current = after.seq
    setSettingsOpen(true)
    setFocusTarget(idFor(after.field))
  }

  const proposalMeta = (proposal: CopilotProposal) => {
    const owner = providerInfo(proposal.provider)
    return [
      modelName(owner, proposal.model, fetched[proposal.provider]?.models),
      `Esforço ${EFFORT_OPTIONS[proposal.effort].label.toLowerCase()}`,
      proposal.usage ? plural(proposal.usage.totalTokens, "token", "tokens") : "",
    ]
      .filter(Boolean)
      .join(" · ")
  }

  const changeProvider = (value: string) => {
    const next = PROVIDERS.find((entry) => entry.id === value)
    if (!next) return
    setProvider(next.id)
    setShowKey(false)
    store.clearFieldError("provider", "apiKey", "model")
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
    store.clearFieldError("apiKey")
  }

  const changeModel = (value: string) => {
    setModels((current) => ({ ...current, [provider]: value }))
    store.clearFieldError("model")
  }

  const changeEffort = (value: string) => {
    const next = EFFORTS.find((entry) => entry === value)
    if (!next) return
    setEffortChoice(next)
    store.clearFieldError("effort")
  }

  const clearLoading = (target: ProviderId) =>
    setListing((current) => (current?.provider === target && current.state === "loading" ? null : current))

  const fetchModels = async () => {
    const key = apiKey.trim()
    const invalidKey = apiKeyError(info, key)
    if (invalidKey) {
      const before = store.getState().focus?.seq
      store.markField("apiKey", invalidKey)
      handleFocusRequest(before)
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

  const follow = (started: boolean, before: number | undefined) => {
    if (started) setSettingsOpen(false)
    else handleFocusRequest(before)
    if (store.getState().focus?.seq === before) setFocusTarget(idFor("prompt"))
    return started
  }

  const request = (text: string): boolean => {
    const before = store.getState().focus?.seq
    return follow(store.send(text), before)
  }

  const answer = (chip: string) => {
    const before = store.getState().focus?.seq
    follow(store.send(chip, false), before)
  }

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (request(draft)) setDraft("")
  }

  const retry = () => {
    const before = store.getState().focus?.seq
    follow(store.retry(), before)
  }

  const editNow = () => {
    const before = store.getState().focus?.seq
    follow(store.editNow(), before)
  }

  const confirmSelection = () => {
    const before = store.getState().focus?.seq
    follow(store.confirmPick(), before)
  }

  const cancelSelection = () => {
    store.cancelPick()
    setFocusTarget(idFor("prompt"))
  }

  const leaveCard = () => {
    if (!store.getState().pending) setFocusTarget(idFor("prompt"))
  }

  const onPromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  const pickExample = (text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }

  const close = () => {
    onClose()
    document.querySelector<HTMLElement>("[data-copilot-trigger]")?.focus()
  }

  const stopHistoryKeys = (event: ReactKeyboardEvent<HTMLElement>) => {
    if ((event.ctrlKey || event.metaKey) && /^[yz]$/i.test(event.key)) event.stopPropagation()
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
  const hasPending = Boolean(pending)
  const notice = dialogBusy ? BUSY_NOTICE : ""
  const canAnswer = canReply({ busy, dialogBusy })
  const canSend = canAnswer && draft.trim().length > 0
  const canEditNow = !busy && !asked && Boolean(plan)
  const onCanvas = Boolean(pick) && !dialogBusy && listKey !== pickKey(asked)
  const summary = `${info.vendor} · ${currentModelName} · Esforço ${EFFORT_OPTIONS[effort].label.toLowerCase()}`
  const elapsed = state.startedAt ? Math.max(0, Math.floor((clockNow - state.startedAt) / 1000)) : 0
  const empty = entries.length === 0 && !busy

  const renderEntry = (entry: CopilotEntry) => {
    if (entry.kind === "user") {
      return (
        <div key={entry.id} className="flex justify-end">
          <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-flow-accent-strong px-3 py-2 text-sm leading-relaxed text-white">
            <span className="sr-only">Você: </span>
            {entry.text}
          </p>
        </div>
      )
    }
    if (entry.kind === "assistant") {
      return (
        <div key={entry.id} className="flex justify-start">
          <p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-bl-md border border-flow-border bg-flow-soft px-3 py-2 text-sm leading-relaxed text-flow-fg">
            <span className="sr-only">Copiloto: </span>
            {entry.text}
          </p>
        </div>
      )
    }
    if (entry.kind === "note") {
      return (
        <p
          key={entry.id}
          className={cn(
            "mx-auto flex max-w-[92%] items-center gap-1.5 rounded-full border px-3 py-1 text-center text-[11px] font-medium leading-4",
            NOTE_TONES[entry.tone],
          )}
        >
          {entry.tone === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="min-w-0 break-words">{entry.text}</span>
        </p>
      )
    }
    if (entry.kind === "error") {
      const retryable = state.retry === entry.id && !busy
      return (
        <div key={entry.id} role="alert" className="rounded-xl border border-flow-danger/40 bg-flow-danger/10 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flow-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold text-flow-danger">{entry.failure.title}</p>
              {entry.failure.details ? <p className="break-words text-xs text-flow-muted-strong">{entry.failure.details}</p> : null}
              {entry.failure.items.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-flow-muted-strong">
                  {entry.failure.items.map((item, index) => (
                    <li key={`${index}-${item}`} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          {retryable ? (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={retry} disabled={!canAnswer} className={cn(ui.button, "h-7")}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          ) : null}
        </div>
      )
    }
    const isPending = entry.status === "pending" && entry.id === pending
    return (
      <ProposalCard
        key={entry.id}
        entryId={idFor(entry.id)}
        proposal={entry.proposal}
        status={entry.status}
        meta={proposalMeta(entry.proposal)}
        applyId={idFor("apply")}
        canApply={isPending && !busy && !dialogBusy && !asked && proposalApplicable(entry.proposal)}
        canDiscard={isPending && !busy}
        onApply={() => {
          store.apply()
          leaveCard()
        }}
        onDiscard={() => {
          store.discard()
          leaveCard()
        }}
      />
    )
  }

  return (
    <section
      id={id}
      aria-label="Copiloto"
      onKeyDown={stopHistoryKeys}
      className={cn(
        ui.panel,
        "nokey absolute inset-0 z-30 min-h-0 flex-col overflow-hidden dark:[color-scheme:dark] sm:static sm:z-auto sm:w-96 sm:shrink-0 sm:border-l",
        open ? "flex" : "hidden",
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-flow-border px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flow-accent/15 text-flow-accent" aria-hidden="true">
          <WandSparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-5 text-flow-fg">Copiloto</h2>
          <p className="text-[11px] leading-4 text-flow-muted">Edita o fluxo aberto</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
            aria-expanded={settingsOpen}
            aria-controls={idFor("settings")}
            aria-label="Configurar IA"
            title="Configurar IA"
            className={cn(iconButton, settingsOpen && iconButtonActive)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={close} aria-label="Fechar Copiloto" title="Fechar Copiloto" className={iconButton}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div
          id={idFor("settings")}
          hidden={!settingsOpen}
          className="shrink-0 space-y-3 border-b border-flow-border bg-flow-soft px-4 py-3"
        >
          <div>
            <label htmlFor={idFor("provider")} className={ui.label}>
              Provedor de IA
            </label>
            <FlowSelect
              id={idFor("provider")}
              value={provider}
              onValueChange={changeProvider}
              options={PROVIDER_OPTIONS}
              aria-invalid={fieldErrors.provider ? true : undefined}
              aria-describedby={fieldErrors.provider ? idFor("provider-error") : undefined}
              className={fieldErrors.provider ? invalidField : undefined}
            />
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
                aria-describedby={describedBy(idFor("apiKey-hint"), warning && idFor("apiKey-warning"), fieldErrors.apiKey && idFor("apiKey-error"))}
                className={cn(ui.input, "pr-10 font-mono", fieldBase, fieldErrors.apiKey && invalidField)}
              />
              <button
                type="button"
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
                aria-controls={idFor("apiKey")}
                title={showKey ? "Ocultar chave" : "Mostrar chave"}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
              >
                {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <p id={idFor("apiKey-hint")} className={ui.hint}>
              A chave fica só nesta página, não é salva e serve apenas para chamar a API {info.of}. É a mesma usada no Gerar com IA.
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
            <div className="flex items-center gap-2">
              <FlowSelect
                key={provider}
                id={idFor("model")}
                value={model}
                onValueChange={changeModel}
                placeholder="Selecione um modelo"
                options={modelOptions}
                aria-invalid={fieldErrors.model ? true : undefined}
                aria-describedby={describedBy(idFor("model-hint"), listingStatus && idFor("models-status"), fieldErrors.model && idFor("model-error"))}
                className={cn("min-w-0 flex-1", fieldErrors.model && invalidField)}
              />
              <button
                type="button"
                onClick={() => void fetchModels()}
                disabled={!apiKey.trim() || listingBusy}
                aria-label="Buscar modelos da API"
                title="Buscar modelos da API"
                aria-describedby={idFor("models-status")}
                className={cn(ui.button, "h-9 w-9 justify-center px-0")}
              >
                {listingBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p id={idFor("model-hint")} className={ui.hint}>
              ID {model}.{apiKey.trim() ? "" : " Informe a chave para buscar os modelos liberados na sua conta."}
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

          <div>
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
              {EFFORT_OPTIONS[effort].hint}
            </p>
            {fieldErrors.effort ? (
              <p id={idFor("effort-error")} className={ui.error}>
                {fieldErrors.effort}
              </p>
            ) : null}
          </div>
        </div>

        {settingsOpen ? null : (
          <p className="flex shrink-0 items-center gap-2 border-b border-flow-border bg-flow-soft px-4 py-2 text-[11px] leading-4 text-flow-muted">
            <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{summary}</span>
            {apiKey.trim() ? null : <span className="shrink-0 font-semibold text-flow-warning">Chave não informada</span>}
          </p>
        )}

        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversa com o Copiloto"
          className="flex flex-1 flex-col gap-2.5 px-3 py-3"
        >
          {empty ? (
            <div className="space-y-3">
              <p className="flex gap-2 rounded-lg border border-flow-accent/30 bg-flow-accent/10 px-3 py-2.5 text-xs leading-5 text-flow-fg">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flow-accent" aria-hidden="true" />
                <span>{COPILOT_INTRO}</span>
              </p>
              <div>
                <p id={idFor("examples")} className="text-xs font-semibold text-flow-muted-strong">
                  Exemplos:
                </p>
                <ul aria-labelledby={idFor("examples")} className="mt-2 space-y-1.5">
                  {COPILOT_EXAMPLES.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => pickExample(example)}
                        className="w-full rounded-lg border border-flow-border bg-flow-surface px-3 py-2 text-left text-xs leading-5 text-flow-muted-strong transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {entries.map(renderEntry)}

          {asked ? (
            <PickBox
              key={pickKey(asked)}
              id={idFor("pick")}
              pick={asked}
              onCanvas={onCanvas}
              disabled={!canAnswer}
              blocked={dialogBusy}
              onSelect={(candidate) => store.selectPick(candidate)}
              onCancel={cancelSelection}
              onConfirm={confirmSelection}
              onAnswer={request}
            />
          ) : null}

          {thinking ? <IncomingReply text={incoming} /> : null}

          {busy ? (
            <Waiting text={running ? stageText(state.progress, true) : THINKING_TEXT} time={running ? clock(elapsed) : undefined} onStop={store.cancel} />
          ) : null}
        </div>
      </div>

      <Replies suggestions={suggestions} editNow={canEditNow} disabled={!canAnswer} onAnswer={answer} onEditNow={editNow} />

      <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-flow-border px-3 py-3">
        <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-accent/30">
          <input
            id={idFor("fill")}
            type="checkbox"
            checked={fill}
            onChange={(event) => setFill(event.target.checked)}
            aria-describedby={idFor("fill-hint")}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-flow-accent"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-flow-fg">Preencher todos os campos</span>
            <span id={idFor("fill-hint")} className="block text-[11px] leading-4 text-flow-muted">
              {fill ? FILL_HINTS.on : FILL_HINTS.off}
            </span>
          </span>
        </label>

        {notice ? (
          <p
            id={idFor("notice")}
            role="status"
            className="rounded-lg border border-flow-warning/40 bg-flow-warning/10 px-2.5 py-2 text-[11px] font-medium leading-4 text-flow-fg"
          >
            {notice}
          </p>
        ) : hasPending ? (
          <p id={idFor("prompt-hint")} className={cn(ui.hint, "mt-0")}>
            {REFINE_HINT}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <label htmlFor={idFor("prompt")} className="sr-only">
            O que você quer mudar no fluxo
          </label>
          <textarea
            ref={inputRef}
            id={idFor("prompt")}
            rows={2}
            value={draft}
            maxLength={LIMITS.prompt}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onPromptKeyDown}
            placeholder={hasPending ? REFINE_PLACEHOLDER : PLACEHOLDER}
            aria-describedby={describedBy(idFor("keys"), notice ? idFor("notice") : hasPending && idFor("prompt-hint"))}
            className={cn(ui.textarea, "max-h-40 min-h-[2.75rem] flex-1 resize-none py-2 leading-5")}
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Enviar pedido"
            title="Enviar pedido"
            className={cn(ui.primaryButton, "h-9 w-9 justify-center px-0")}
          >
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p id={idFor("keys")} className="sr-only">
          Enter envia e Shift mais Enter quebra a linha.
        </p>
      </form>
    </section>
  )
}
