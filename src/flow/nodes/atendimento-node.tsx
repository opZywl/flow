"use client"

import { createContext, memo, useContext, useEffect, useMemo, type CSSProperties } from "react"
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "reactflow"
import { AlertTriangle, Clock, Code2, FileQuestion, Hash, Hourglass, IdCard, ListOrdered, MessageSquare, Play, Power, Tag, Users, Workflow, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { START_TYPE, getCategory, getComponentColor, getComponentLabel, getDefinition, weekDayOptions } from "@/lib/atendimento/catalog"
import { isObject, outputHandles, outputLabel } from "@/lib/atendimento/format"
import type { AtendimentoData, AtendimentoEdge } from "@/lib/atendimento/types"
import { ui } from "../ui"

export const AtendimentoEdgesContext = createContext<AtendimentoEdge[]>([])
export const InvalidNodesContext = createContext<ReadonlySet<string>>(new Set<string>())

const icons: Record<string, LucideIcon> = {
  trigger_message: Play,
  envio_mensagem: ListOrdered,
  envio_pergunta: MessageSquare,
  departamentos: Users,
  tags: Tag,
  flow: Workflow,
  finalizar: Power,
  timeConditions: Clock,
  solicitar_dados: IdCard,
  protocolo: Hash,
  consulta_api: Code2,
  waitForAnswer: Hourglass,
}

export const componentIcon = (type: string): LucideIcon => icons[type] || FileQuestion

export const categoryTint = (color: string) => `color-mix(in srgb, ${color} 75%, rgb(var(--flow-fg)))`

function timeRuleLines(rules: unknown): string[] {
  if (!Array.isArray(rules)) return []
  return rules.filter(isObject).map((rule) => {
    const days = Array.isArray(rule.weekDays) ? weekDayOptions.filter((day) => (rule.weekDays as unknown[]).includes(day.value)).map((day) => day.label).join(", ") : ""
    return `${days || "Sem dias"} · ${String(rule.startTime || "--:--")}–${String(rule.endTime || "--:--")}`
  })
}

export function describeTimeRules(rules: unknown): string {
  return timeRuleLines(rules).join("\n")
}

export function nodeSummary(data: AtendimentoData): string {
  if (data.type === "timeConditions") return describeTimeRules(data.data.timeRules)
  for (const key of getDefinition(data.type)?.summary || []) {
    const value = data.data[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return ""
}

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

const MAX_CHIPS = 2
const SUCCESS_COLOR = "rgb(var(--flow-success))"
const HANDLE = "!h-3 !w-3 !border-2 !border-flow-surface"
const TARGET_HANDLE = `${HANDLE} !-left-2 !top-[30px] !bg-flow-muted-strong`
const SOURCE_HANDLE = `${HANDLE} !-right-1.5`

function summarize(data: AtendimentoData): Summary {
  if (data.type === "timeConditions") {
    const rules = timeRuleLines(data.data.timeRules)
    const hidden = rules.length - MAX_CHIPS
    return {
      chips: rules.slice(0, MAX_CHIPS).map((text, index) => ({ key: `rule-${index}`, text })),
      more: hidden > 0 ? `+${hidden} ${hidden === 1 ? "regra" : "regras"}` : "",
    }
  }
  const definition = getDefinition(data.type)
  const chips: SummaryChip[] = []
  for (const key of definition?.summary || []) {
    const value = data.data[key]
    if (typeof value !== "string" || !value.trim()) continue
    const field = definition?.fields?.find((entry) => entry.key === key)
    chips.push(field?.kind === "textarea"
      ? { key, text: value.replace(/\r\n?/g, "\n").replace(/\n\s*\n/g, "\n").trim(), multiline: true }
      : { key, text: value.replace(/\s+/g, " ").trim(), label: field?.kind === "text" ? field.label : undefined })
  }
  return { chips: chips.slice(0, MAX_CHIPS), more: "" }
}

function handleTone(start: boolean, twoWay: boolean, handle: string): string {
  if (start) return "!bg-flow-success"
  if (twoWay && handle === "output-1") return "!bg-flow-success"
  if (twoWay && handle === "output-0") return "!bg-flow-danger"
  return "!bg-flow-accent"
}

export const AtendimentoNode = memo(function AtendimentoNode({ id, data, selected, isConnectable }: NodeProps<AtendimentoData>) {
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
      twoWay: definition?.outputLabels?.length === 2,
      title: getComponentLabel(type),
      subtitle: start ? "Início do atendimento" : definition ? getCategory(type)?.label || "" : "Tipo preservado do arquivo",
      hint: start ? "" : type === "finalizar" ? "Encerra a conversa" : "Clique para configurar",
      Icon: componentIcon(type),
      cardStyle,
      iconStyle,
    }
  }, [type])
  const { start, known, twoWay, title, subtitle, hint, Icon, cardStyle, iconStyle } = meta

  const outputs = useMemo(() => {
    const node = { id, data }
    return outputHandles(node, edges).map((handle) => ({
      handle,
      label: outputLabel(node, handle),
      className: cn(SOURCE_HANDLE, handleTone(start, twoWay, handle)),
    }))
  }, [data, edges, id, start, twoWay])
  const targets = useMemo(
    () => [...new Set(edges.flatMap((edge) => (edge.target === id && edge.targetHandle ? [edge.targetHandle] : [])))],
    [edges, id],
  )
  const signature = useMemo(() => JSON.stringify([outputs.map((output) => [output.handle, output.label]), targets]), [outputs, targets])
  const summary = useMemo(() => summarize(data), [data])
  const invalid = invalidNodes.has(id)

  useEffect(() => {
    updateInternals(id)
  }, [id, signature, updateInternals])

  return (
    <div
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
      )}
      style={cardStyle}
    >
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
              <span className="mt-px max-w-[6rem] shrink-0 truncate rounded-md bg-flow-soft px-1.5 py-0.5 font-mono text-[10px] leading-none text-flow-muted" title={`ID ${id}`}>
                ID {id}
              </span>
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
        {invalid && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-flow-danger/10 px-2 py-1 text-[10px] font-semibold text-flow-danger" title="Veja os detalhes no painel de pendências">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Pendente
          </p>
        )}
      </div>
      {outputs.map((output) => (
        <div key={output.handle} className="relative border-t border-flow-border px-3 py-1.5 text-right text-xs text-flow-muted-strong">
          <span className="block truncate" title={output.label}>
            {output.label}
          </span>
          <Handle type="source" position={Position.Right} id={output.handle} isConnectable={isConnectable} className={output.className} />
        </div>
      ))}
      {!outputs.length && !start && <div className="border-t border-flow-border px-3 py-1.5 text-[11px] text-flow-muted">Fim deste caminho</div>}
    </div>
  )
})
