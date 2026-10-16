"use client"

import { createContext, memo, useContext, useEffect, useMemo, useState, type CSSProperties, type HTMLAttributes } from "react"
import { Handle, NodeToolbar, Position, useUpdateNodeInternals, type NodeProps } from "reactflow"
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Barcode,
  BookUser,
  BotMessageSquare,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardPen,
  Clock,
  Code2,
  ConciergeBell,
  Contact,
  Database,
  FileQuestion,
  FileSearch,
  FileSpreadsheet,
  FormInput,
  GitBranch,
  Goal,
  HardDriveUpload,
  Hash,
  Headset,
  Hourglass,
  IdCard,
  ImageIcon,
  Languages,
  LayoutList,
  LayoutTemplate,
  ListChecks,
  ListMinus,
  ListOrdered,
  ListPlus,
  ListRestart,
  Magnet,
  MapPin,
  Megaphone,
  MessageSquare,
  MessageSquareCode,
  MessagesSquare,
  MousePointerClick,
  Network,
  Paperclip,
  PhoneCall,
  Play,
  Power,
  QrCode,
  ShieldCheck,
  Shuffle,
  StickyNote,
  Tag,
  Target,
  TextCursorInput,
  Ticket,
  TicketPlus,
  Timer,
  Undo2,
  UserPlus,
  UserSearch,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NOTE_TYPE, START_ID, START_TYPE, TIME_TYPE, getCategory, getComponentColor, getComponentLabel, getDefinition, getIconName, getNodeType, outputTone, weekDayOptions } from "@/lib/atendimento/catalog"
import { isObject, newFlow, newNode, outputHandles, outputLabel, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoData, AtendimentoEdge, AtendimentoFlow, AtendimentoNode as FlowNode, ComponentDefinition, FieldKind, JsonObject, OutputTone } from "@/lib/atendimento/types"
import { ui } from "../ui"

export type PickMark = "candidate" | "selected" | "dimmed"

export interface NodePick {
  candidates: ReadonlySet<string>
  selected: string | null
  select: (id: string) => void
}

export const AtendimentoEdgesContext = createContext<AtendimentoEdge[]>([])
export const InvalidNodesContext = createContext<ReadonlySet<string>>(new Set<string>())
export const NodeActionsContext = createContext<{ remove: (id: string) => void } | null>(null)
export const NodePickContext = createContext<NodePick | null>(null)

const icons = new Map<string, LucideIcon>(Object.entries({
  Activity,
  BadgeCheck,
  Barcode,
  BookUser,
  BotMessageSquare,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ClipboardPen,
  Clock,
  Code2,
  ConciergeBell,
  Contact,
  Database,
  FileSearch,
  FileSpreadsheet,
  FormInput,
  GitBranch,
  Goal,
  HardDriveUpload,
  Hash,
  Headset,
  Hourglass,
  IdCard,
  ImageIcon,
  Languages,
  LayoutList,
  LayoutTemplate,
  ListChecks,
  ListMinus,
  ListOrdered,
  ListPlus,
  ListRestart,
  Magnet,
  MapPin,
  Megaphone,
  MessageSquare,
  MessageSquareCode,
  MessagesSquare,
  MousePointerClick,
  Network,
  Paperclip,
  PhoneCall,
  Play,
  Power,
  QrCode,
  ShieldCheck,
  Shuffle,
  StickyNote,
  Tag,
  Target,
  TextCursorInput,
  Ticket,
  TicketPlus,
  Timer,
  Undo2,
  UserPlus,
  UserSearch,
  Users,
  Workflow,
}))

export const componentIcon = (type: string): LucideIcon => icons.get(getIconName(type) ?? "") ?? FileQuestion

export const categoryTint = (color: string) => `color-mix(in srgb, ${color} 75%, rgb(var(--flow-fg)))`

interface SummaryChip {
  key: string
  text: string
  label?: string
  multiline?: boolean
}

interface Summary {
  chips: SummaryChip[]
  more: string
}

interface OutputRow {
  handle: string
  label: string
  title: string
  className: string
  missing: boolean
}

const FINISH_TYPE = "finalizar"
const PROBE_ID = "componente"
const PROBE_END = "fim"
const MAX_CHIPS = 2
const SUCCESS_COLOR = "rgb(var(--flow-success))"
const DEFAULT_NOTE_COLOR = "#eab308"
const NOTE_COLORS = new Map([["yellow", DEFAULT_NOTE_COLOR]])
const LABELED_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(["text", "number", "numberText", "select", "menuNode"])
const INTAKE_ITEMS = [["askName", "nome"], ["askEmail", "e-mail"], ["askNotes", "observações"]] as const
const TICKET_ACTIONS = [["enableComment", "comentar"], ["enableReopen", "reabrir"], ["enableClose", "encerrar"], ["enableCsat", "avaliar"]] as const
const TONE_CLASS: Record<OutputTone, string> = { success: "!bg-flow-success", danger: "!bg-flow-danger", accent: "!bg-flow-accent" }
const HANDLE = "!h-3 !w-3 !border-2 !border-flow-surface"
const TARGET_HANDLE = `${HANDLE} !-left-2 !top-[30px] !bg-flow-muted-strong`
const SOURCE_HANDLE = `${HANDLE} !-right-1.5`
const NOTE_TARGET_HANDLE = `${HANDLE} !-left-2 !bg-flow-danger`
const NOTE_SOURCE_HANDLE = `${HANDLE} !-right-1.5 !bg-flow-danger`
const REVEAL = "group-hover:opacity-100 group-focus-within:opacity-100 [.react-flow__node:focus-visible_&]:opacity-100"
const REMOVE_BUTTON = "nodrag nopan relative left-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,rgb(var(--flow-danger))_85%,black)] text-white shadow-md ring-2 ring-flow-bg transition duration-150 ease-out animate-in fade-in-0 zoom-in-90 hover:brightness-110 focus-visible:outline-none focus-visible:ring-flow-accent motion-reduce:animate-none motion-reduce:transition-none"
const REMOVE_OFFSET = -14
const ID_CHIP = `mr-1 mt-0.5 max-w-[6rem] shrink-0 translate-y-0.5 truncate rounded-md bg-flow-soft px-1.5 py-0.5 font-mono text-[10px] leading-none text-flow-muted opacity-0 transition duration-200 ease-out group-hover:translate-y-0 group-focus-within:translate-y-0 [.react-flow__node:focus-visible_&]:translate-y-0 motion-reduce:transition-none ${REVEAL}`
const PICK_FOCUS = "focus-visible:outline-flow-accent focus-visible:ring-4 focus-visible:ring-flow-accent/40"
const PICK_CLASS: Record<PickMark, string> = {
  candidate: `cursor-pointer outline-dashed outline-2 outline-offset-4 outline-flow-accent/70 hover:outline-flow-accent ${PICK_FOCUS}`,
  selected: `cursor-pointer outline outline-[3px] outline-offset-4 outline-flow-accent ${PICK_FOCUS}`,
  dimmed: "opacity-40",
}
const PICK_BADGE = "pointer-events-none absolute -right-3 -top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-flow-accent-strong text-white shadow-md ring-2 ring-flow-bg"
const PICK_TEXT_LIMIT = 80
const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

const singleLine = (text: string) => text.replace(/\s+/g, " ").trim()
const paragraphs = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\n\s*\n/g, "\n").trim()
const sameText = (first: string, second: string) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }) === 0
const listText = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}` : items.join(""))
const checkedItems = (data: JsonObject, items: ReadonlyArray<readonly [string, string]>) => items.flatMap(([key, text]) => (data[key] === true ? [text] : []))

function describeDays(days: unknown): string {
  const selected = Array.isArray(days) ? weekDayOptions.flatMap((day, index) => (days.includes(day.value) ? [index] : [])) : []
  if (selected.length === weekDayOptions.length) return "Todos os dias"
  const consecutive = selected.length > 2 && selected.every((day, position) => position === 0 || day === selected[position - 1] + 1)
  if (consecutive) return `${weekDayOptions[selected[0]].label} a ${weekDayOptions[selected[selected.length - 1]].label}`
  return selected.map((index) => weekDayOptions[index].label).join(", ") || "Sem dias"
}

function timeRuleLines(rules: unknown): string[] {
  if (!Array.isArray(rules)) return []
  return rules.filter(isObject).map((rule) => `${describeDays(rule.weekDays)} · ${String(rule.startTime || "--:--")} às ${String(rule.endTime || "--:--")}`)
}

export function describeTimeRules(rules: unknown): string {
  return timeRuleLines(rules).join("\n")
}

const computedChips = new Map<string, (data: JsonObject) => SummaryChip[]>([
  [
    "randomizer",
    (data) => {
      const paths = Array.isArray(data.paths) ? data.paths : []
      const weights = paths.map((path) => (isObject(path) && typeof path.weight === "number" && Number.isFinite(path.weight) ? numberFormat.format(path.weight) : ""))
      return weights.length && weights.every(Boolean) ? [{ key: "paths", label: "Pesos", text: weights.join(" / ") }] : []
    },
  ],
  [
    "apptCustomerIntake",
    (data) => {
      const items = checkedItems(data, INTAKE_ITEMS)
      return items.length ? [{ key: "asked", text: `Pede ${listText(items)}`, multiline: true }] : []
    },
  ],
  [
    "ticketDetail",
    (data) => {
      const items = checkedItems(data, TICKET_ACTIONS)
      return items.length ? [{ key: "actions", text: `Permite ${listText(items)}`, multiline: true }] : []
    },
  ],
])

function fieldChips(definition: ComponentDefinition, data: JsonObject, key: string): SummaryChip[] {
  const value = data[key]
  const raw = typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : typeof value === "string" ? value.trim() : ""
  if (!raw) return []
  const field = definition.fields?.find((entry) => entry.key === key)
  if (field?.kind === "textarea") return [{ key, text: paragraphs(raw), multiline: true }]
  const option = field?.kind === "select" ? field.options?.find((entry) => entry.value === value) : undefined
  const label = field && LABELED_KINDS.has(field.kind) && !sameText(field.label, definition.label) ? field.label : undefined
  return [{ key, text: singleLine(option?.label || raw), label }]
}

function summaryChips(data: AtendimentoData): SummaryChip[] {
  const definition = getDefinition(data.type)
  if (!definition) return []
  const computed = computedChips.get(data.type)?.(data.data) ?? []
  return [...computed, ...(definition.summary ?? []).flatMap((key) => fieldChips(definition, data.data, key))]
}

export function nodeSummary(data: AtendimentoData): string {
  if (data.type === TIME_TYPE) return describeTimeRules(data.data.timeRules)
  return summaryChips(data)
    .map((chip) => singleLine(chip.text))
    .join(" · ")
}

function summarize(data: AtendimentoData): Summary {
  if (data.type === TIME_TYPE) {
    const rules = timeRuleLines(data.data.timeRules)
    const hidden = rules.length - MAX_CHIPS
    return {
      chips: rules.slice(0, MAX_CHIPS).map((text, index) => ({ key: `rule-${index}`, text })),
      more: hidden > 0 ? `+${hidden} ${hidden === 1 ? "regra" : "regras"}` : "",
    }
  }
  return { chips: summaryChips(data).slice(0, MAX_CHIPS), more: "" }
}

function probeEdge(source: string, sourceHandle: string, target: string): AtendimentoEdge {
  return { type: "deletable", source, sourceHandle, target, id: `${source}-${sourceHandle}` }
}

function needsSetup(data: AtendimentoData): boolean {
  const base = newFlow(new Date(0))
  const node: FlowNode = { id: PROBE_ID, type: getNodeType(data.type), position: { x: 0, y: 0 }, data }
  const flow: AtendimentoFlow = {
    ...base,
    nodes: [...base.nodes, node, newNode(FINISH_TYPE, { x: 0, y: 0 }, PROBE_END)],
    edges: [probeEdge(START_ID, "output-0", PROBE_ID), ...outputHandles(node).map((handle) => probeEdge(PROBE_ID, handle, PROBE_END))],
  }
  return validateFlow(flow).some((issue) => issue.nodeId === PROBE_ID)
}

function outputRows(id: string, data: AtendimentoData, edges: AtendimentoEdge[], known: boolean): OutputRow[] {
  const node = { id, data }
  const handles = outputHandles(node, edges)
  const rows = handles.map((handle, index) => {
    const label = outputLabel(node, handle)
    return { handle, label, title: label, className: cn(SOURCE_HANDLE, TONE_CLASS[outputTone(data.type, index)]), missing: false }
  })
  if (!known) return rows
  const present = new Set(handles)
  const missing = [...new Set(edges.flatMap((edge) => (edge.source === id && !present.has(edge.sourceHandle) ? [edge.sourceHandle] : [])))]
  return [
    ...rows,
    ...missing.map((handle) => ({
      handle,
      label: "Saída inexistente",
      title: `A saída ${handle} não existe neste componente.`,
      className: cn(SOURCE_HANDLE, TONE_CLASS.danger),
      missing: true,
    })),
  ]
}

export function noteColor(value: unknown): string {
  const color = typeof value === "string" ? value.trim().toLowerCase() : ""
  const known = NOTE_COLORS.get(color)
  if (known) return known
  return color && typeof CSS !== "undefined" && CSS.supports("color", color) ? color : DEFAULT_NOTE_COLOR
}

function RemoveButton({ id, label, visible }: { id: string; label: string; visible: boolean }) {
  const actions = useContext(NodeActionsContext)
  const [focused, setFocused] = useState(false)
  if (!actions || !(visible || focused)) return null
  return (
    <NodeToolbar nodeId={id} isVisible position={Position.Top} align="end" offset={REMOVE_OFFSET} className="nodrag nopan" data-node-toolbar={id}>
      <button
        type="button"
        aria-label={`Remover ${label}, ID ${id}`}
        title="Remover componente"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(event) => {
          event.stopPropagation()
          actions.remove(id)
        }}
        className={REMOVE_BUTTON}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
      </button>
    </NodeToolbar>
  )
}

function IdChip({ id, shown }: { id: string; shown?: boolean }) {
  return (
    <span className={cn(ID_CHIP, shown && "translate-y-0 opacity-100")} title={`ID ${id}`}>
      ID {id}
    </span>
  )
}

interface PickTarget {
  mark: PickMark
  className: string
  props: HTMLAttributes<HTMLDivElement> & { "data-pick": PickMark }
}

function pickName(label: string, text: string, id: string): string {
  const short = singleLine(text)
  const clipped = short.length > PICK_TEXT_LIMIT ? `${short.slice(0, PICK_TEXT_LIMIT - 1).trimEnd()}…` : short
  return [label, clipped, `ID ${id}`].filter(Boolean).join(", ")
}

function usePickTarget(id: string, label: string, text: string): PickTarget | null {
  const pick = useContext(NodePickContext)
  if (!pick) return null
  const mark: PickMark = pick.selected === id ? "selected" : pick.candidates.has(id) ? "candidate" : "dimmed"
  if (mark === "dimmed") return { mark, className: PICK_CLASS.dimmed, props: { "data-pick": mark } }
  const choose = () => pick.select(id)
  return {
    mark,
    className: PICK_CLASS[mark],
    props: {
      "data-pick": mark,
      role: "button",
      tabIndex: 0,
      "aria-pressed": mark === "selected",
      "aria-label": pickName(label, text, id),
      onClick: choose,
      onKeyDown: (event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        choose()
      },
    },
  }
}

function PickBadge() {
  return (
    <span className={PICK_BADGE} aria-hidden>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  )
}

function PendingChip() {
  return (
    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-flow-danger/10 px-2 py-1 text-[10px] font-semibold text-flow-danger" title="Veja os detalhes no painel de pendências">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Pendente
    </p>
  )
}

function NoteCard({ id, data, selected }: NodeProps<AtendimentoData>) {
  const edges = useContext(AtendimentoEdgesContext)
  const invalidNodes = useContext(InvalidNodesContext)
  const updateInternals = useUpdateNodeInternals()
  const color = useMemo(() => noteColor(data.data.color), [data.data.color])
  const text = typeof data.data.text === "string" ? paragraphs(data.data.text) : ""
  const links = useMemo(
    () => ({
      targets: [...new Set(edges.flatMap((edge) => (edge.target === id ? [edge.targetHandle || ""] : [])))],
      sources: [...new Set(edges.flatMap((edge) => (edge.source === id ? [edge.sourceHandle] : [])))],
    }),
    [edges, id],
  )
  const signature = useMemo(() => JSON.stringify([links.targets, links.sources]), [links])
  const invalid = invalidNodes.has(id)
  const [hovered, setHovered] = useState(false)
  const Icon = componentIcon(NOTE_TYPE)
  const label = getComponentLabel(NOTE_TYPE)
  const pick = usePickTarget(id, label, text)
  const style = useMemo(
    () => ({ backgroundColor: `color-mix(in srgb, ${color} 16%, rgb(var(--flow-surface)))`, "--note-border": `color-mix(in srgb, ${color} 50%, rgb(var(--flow-border)))` }) as CSSProperties,
    [color],
  )

  useEffect(() => {
    updateInternals(id)
  }, [id, signature, updateInternals])

  return (
    <div
      {...pick?.props}
      className={cn(
        "group relative w-[240px] rounded-xl border shadow-sm transition",
        selected
          ? "border-flow-accent ring-2 ring-flow-accent/30"
          : invalid
            ? "border-flow-danger ring-2 ring-flow-danger/30"
            : "border-[color:var(--note-border)] hover:border-flow-accent/50",
        pick?.className,
      )}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {pick?.mark === "selected" && <PickBadge />}
      <RemoveButton id={id} label={label} visible={selected || hovered} />
      {links.targets.map((target) => (
        <Handle key={`in-${target}`} id={target || undefined} type="target" position={Position.Left} isConnectable={false} className={NOTE_TARGET_HANDLE} />
      ))}
      {links.sources.map((source) => (
        <Handle key={`out-${source}`} id={source} type="source" position={Position.Right} isConnectable={false} className={NOTE_SOURCE_HANDLE} />
      ))}
      <div className="px-3 pb-3 pt-2.5">
        <div className="flex items-start gap-1.5">
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: categoryTint(color) }} aria-hidden />
          <p className="min-w-0 flex-1 truncate pt-px text-[11px] font-semibold leading-4 text-flow-muted-strong">{label}</p>
          <IdChip id={id} shown={Boolean(pick && pick.mark !== "dimmed")} />
        </div>
        <p className={cn("mt-1.5 line-clamp-6 whitespace-pre-line break-words text-xs leading-5", text ? "text-flow-fg" : "text-flow-muted")}>
          {text || "Clique para escrever"}
        </p>
        {invalid && <PendingChip />}
      </div>
    </div>
  )
}

function ComponentCard({ id, data, selected, isConnectable }: NodeProps<AtendimentoData>) {
  const edges = useContext(AtendimentoEdgesContext)
  const invalidNodes = useContext(InvalidNodesContext)
  const updateInternals = useUpdateNodeInternals()
  const { type } = data

  const meta = useMemo(() => {
    const definition = getDefinition(type)
    const start = type === START_TYPE
    const color = start ? SUCCESS_COLOR : getComponentColor(type)
    const cardStyle: CSSProperties = { borderLeftColor: color }
    const iconStyle: CSSProperties | undefined = start ? undefined : { color: categoryTint(color) }
    return {
      start,
      known: Boolean(definition),
      title: getComponentLabel(type),
      subtitle: start ? "Início do atendimento" : definition ? getCategory(type)?.label || "" : "Tipo preservado do arquivo",
      Icon: componentIcon(type),
      cardStyle,
      iconStyle,
    }
  }, [type])
  const { start, known, title, subtitle, Icon, cardStyle, iconStyle } = meta

  const outputs = useMemo(() => outputRows(id, data, edges, known), [data, edges, id, known])
  const targets = useMemo(
    () => [...new Set(edges.flatMap((edge) => (edge.target === id && edge.targetHandle ? [edge.targetHandle] : [])))],
    [edges, id],
  )
  const signature = useMemo(() => JSON.stringify([outputs.map((output) => [output.handle, output.label]), targets]), [outputs, targets])
  const summary = useMemo(() => summarize(data), [data])
  const hint = useMemo(() => {
    if (start || summary.chips.length) return ""
    if (type === FINISH_TYPE) return "Encerra a conversa"
    return needsSetup(data) ? "Clique para configurar" : ""
  }, [data, start, summary.chips.length, type])
  const invalid = invalidNodes.has(id)
  const [hovered, setHovered] = useState(false)
  const pick = usePickTarget(id, title, summary.chips[0]?.text ?? "")

  useEffect(() => {
    updateInternals(id)
  }, [id, signature, updateInternals])

  return (
    <div
      {...pick?.props}
      className={cn(
        "group relative w-[280px] rounded-2xl border border-l-4 bg-flow-surface shadow-sm transition",
        selected
          ? start
            ? "border-flow-success ring-2 ring-flow-success/30"
            : "border-flow-accent ring-2 ring-flow-accent/30"
          : invalid
            ? "border-flow-danger ring-2 ring-flow-danger/30"
            : start
              ? "border-flow-border hover:border-flow-success/50"
              : "border-flow-border hover:border-flow-accent/50",
        pick?.className,
      )}
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {pick?.mark === "selected" && <PickBadge />}
      {!start && <RemoveButton id={id} label={title} visible={selected || hovered} />}
      {!start && (
        <>
          <Handle type="target" position={Position.Left} isConnectable={isConnectable} className={TARGET_HANDLE} />
          {targets.map((target) => (
            <Handle key={target} id={target} type="target" position={Position.Left} isConnectable={isConnectable} className={TARGET_HANDLE} />
          ))}
        </>
      )}
      <div className="py-3 pl-4 pr-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", start ? "bg-flow-success text-white" : "bg-flow-soft")}
            style={iconStyle}
          >
            <Icon className={cn("h-[18px] w-[18px]", start && "fill-current")} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start gap-2">
              <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-tight text-flow-fg">{title}</p>
              <IdChip id={id} shown={Boolean(pick && pick.mark !== "dimmed")} />
            </div>
            <p className={cn("mt-0.5 truncate text-[11px] leading-tight", start ? "text-flow-success" : known ? "text-flow-muted" : "text-flow-warning")}>{subtitle}</p>
          </div>
        </div>
        {summary.chips.length > 0 ? (
          <div className="mt-2.5 space-y-1">
            {summary.chips.map((chip) =>
              chip.multiline ? (
                <p key={chip.key} className={cn(ui.chip, "line-clamp-3 whitespace-pre-line break-words leading-4")}>
                  {chip.text}
                </p>
              ) : (
                <p key={chip.key} className={cn(ui.chip, "truncate leading-4")} title={chip.label ? `${chip.label}: ${chip.text}` : chip.text}>
                  {chip.label && <span className="text-flow-muted">{chip.label}: </span>}
                  {chip.text}
                </p>
              ),
            )}
            {summary.more && <p className="px-2 text-[11px] leading-4 text-flow-muted">{summary.more}</p>}
          </div>
        ) : hint ? (
          <p className="mt-2.5 text-[11px] leading-snug text-flow-muted">{hint}</p>
        ) : null}
        {invalid && <PendingChip />}
      </div>
      {outputs.map((output) => (
        <div key={output.handle} className="relative border-t border-flow-border px-3 py-1.5 text-right text-xs text-flow-muted-strong">
          <span className={cn("block truncate", output.missing && "text-flow-danger")} title={output.title}>
            {output.label}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={output.handle}
            isConnectable={isConnectable && !output.missing}
            className={output.className}
          />
        </div>
      ))}
      {!outputs.length && !start && <div className="border-t border-flow-border px-3 py-1.5 text-[11px] text-flow-muted">Fim deste caminho</div>}
    </div>
  )
}

export const AtendimentoNode = memo(function AtendimentoNode(props: NodeProps<AtendimentoData>) {
  return props.data.type === NOTE_TYPE ? <NoteCard {...props} /> : <ComponentCard {...props} />
})
