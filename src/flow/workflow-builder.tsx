"use client"

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ChangeEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react"
import ReactFlow, { Background, BackgroundVariant, MiniMap, ReactFlowProvider, getNodesBounds, useReactFlow, useStoreApi, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type Viewport, type XYPosition } from "reactflow"
import "reactflow/dist/style.css"
import { Check, ChevronLeft, ChevronRight, Download, Eraser, FilePlus2, Info, Loader2, MapIcon, Maximize, MousePointerClick, PanelLeftClose, PanelLeftOpen, Play, Redo2, Save, Settings2, TriangleAlert, Undo2, Upload, X, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { NOTE_TYPE, START_TYPE, getComponentColor, getComponentLabel } from "@/lib/atendimento/catalog"
import { downloadJson } from "@/lib/atendimento/download"
import { behaviorSignature, createEdge, duplicateNode, exportFileName, exportFlow, importFlow, insertOutput, maxNumericId, newFlow, newNode, outputHandles, outputLabel, removeMenuOption, removeOutput, stampExport, validateFlow } from "@/lib/atendimento/format"
import type { AtendimentoData, AtendimentoFlow, AtendimentoNode, FlowIssue, JsonObject } from "@/lib/atendimento/types"
import { LIBRARY_KEY, clearedFlow, findSameSaved, isBlankFlow, newSavedId, readCurrentId, readLibrary, removeSaved, upsertSaved, writeCurrentId, writeLibrary, type SavedFlow } from "@/lib/atendimento/library"
import NodeLibrary from "./node-library"
import NodeConfigPanel from "./node-config-panel"
import SavedFlows from "./saved-flows"
import CustomEdge, { EdgeActionsContext } from "./custom-edge"
import { AtendimentoEdgesContext, AtendimentoNode as AtendimentoNodeView, InvalidNodesContext, NodeActionsContext, NodeFocusContext, NodePickContext, nodeSummary, noteColor, pickSubject, type NodePick } from "./nodes/atendimento-node"
import { betterFrame, centerView, editedIds, fitBox, frameAround, overlapsCorner, previewFocusOf, roomForPick, shownIn, stepCandidate, unite, zoomScale, type Box, type ZoomLimits } from "./canvas-frame"
import type { PickHandlers, PickRequest } from "./pick"
import { ui } from "./ui"

export interface WorkflowActions {
  zoomIn: () => void
  zoomOut: () => void
  fitView: () => void
  save: () => boolean
  load: () => void
  loadWorkflow: (input: unknown) => boolean
  execute: () => boolean
  search: (query: string) => boolean
  removeNode: (id: string) => void
  reset: () => void
  download: () => boolean
  previewWorkflow: (flow: AtendimentoFlow | null, done?: boolean, kind?: PreviewKind, fresh?: boolean, focus?: string | null) => void
  captureImage: () => Promise<Blob | null>
  getFlow: () => AtendimentoFlow
  applyWorkflowEdit: (flow: AtendimentoFlow) => boolean
  startPick: (request: PickRequest) => string[]
  selectPick: (id: string | null) => void
  confirmPick: () => void
  endPick: () => void
}

export type PreviewKind = "create" | "edit"

interface WorkflowBuilderProps {
  onActionsReady: (actions: WorkflowActions) => void
  onOpenBot?: () => void
}

interface PickSession extends PickHandlers {
  key: number
  label: string
  order: string[]
  candidates: ReadonlySet<string>
  selected: string | null
  any: boolean
}

type Handlers = WorkflowActions & { undo: () => void; redo: () => void }
type Size = { width: number; height: number }
type ToolButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> & { label: string; icon: LucideIcon; pressed?: boolean }

const ConfigPanel = memo(NodeConfigPanel)
const nodeTypes = { custom: AtendimentoNodeView }
const edgeTypes = { deletable: CustomEdge }
const STORAGE_KEY = "workflow"
const EXECUTED_KEY = "executedFlow"
const BACKUP_KEY = "workflow-backup"
const HISTORY_LIMIT = 50
const IMAGE_PADDING = 48
const IMAGE_MAX_SIDE = 8000
const TRANSPARENT = new Set(["", "transparent", "rgba(0, 0, 0, 0)"])

function backgroundOf(element: HTMLElement | null): string {
  for (let current = element; current; current = current.parentElement) {
    const color = getComputedStyle(current).backgroundColor
    if (!TRANSPARENT.has(color)) return color
  }
  return "#ffffff"
}
const DELETE_KEYS = ["Backspace", "Delete"]
const MULTI_SELECTION_KEYS = ["Shift", "Control", "Meta"]
const PRO_OPTIONS = { hideAttribution: true }
const CONNECTION_LINE_STYLE = { stroke: "rgb(var(--flow-accent))", strokeWidth: 2 }
const CANVAS_CLASS = String.raw`[&_.react-flow\_\_nodesselection-rect]:border-flow-accent/70 [&_.react-flow\_\_nodesselection-rect]:bg-flow-accent/10 [&_.react-flow\_\_selection]:border-flow-accent/70 [&_.react-flow\_\_selection]:bg-flow-accent/10`
const MINIMAP_CLASS = "!m-3 overflow-hidden rounded-xl border border-flow-border !bg-flow-surface shadow-sm [&_path]:fill-flow-bg/70"
const DEFAULT_NODE_SIZE: Size = { width: 280, height: 160 }
const REVEAL_WINDOW = 2000
const PAN_DURATION = 300
const ZOOM_DURATION = 200
const COLUMN_STEP = 360
const ROW_STEP = 180
const NODE_GAP = 40
const VIEW_MARGIN = 24
const PANEL_WIDTH = 320
const SEARCH_COLUMNS = 12
const SEARCH_ROWS = 24
const OVERLAY_SELECTOR = ".react-flow__minimap, [data-canvas-overlay]"
const NO_INVALID_NODES: ReadonlySet<string> = new Set()
const NO_EDGE_ACTIONS = {}
const MIN_ZOOM = 0.05
const MAX_ZOOM = 2
const PICK_MIN_ZOOM = 0.4
const PICK_STEP_ZOOM = 0.75
const FOCUS_MIN_ZOOM = 0.5
const FIT_INTERVAL = 1000
const FIT_DURATION = 450
const FIT_PADDING = 0.15
const FIT_MAX_ZOOM = 1
const FIT_MARGIN = 16
const FIT_TOP_MARGIN = 64
const PREVIEW_COOLDOWN = 1000
const FIT_LIMITS: ZoomLimits = { minZoom: MIN_ZOOM, maxZoom: FIT_MAX_ZOOM, padding: FIT_PADDING }
const REVEAL_LIMITS: ZoomLimits = { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, padding: FIT_PADDING }
const ID_SEPARATOR = "\u0000"
const LOCKED_NODE = { selected: false, draggable: false, selectable: false, connectable: false, deletable: false, focusable: false }
const PICK_CANDIDATE_NODE = { ...LOCKED_NODE, className: "nopan", zIndex: 1 }
const PICK_DIMMED_NODE = { ...LOCKED_NODE, style: { pointerEvents: "none" } as CSSProperties }
const LOCKED_EDGE = { selectable: false, deletable: false, focusable: false, updatable: false }
const PICK_EDGE = { ...LOCKED_EDGE, className: "opacity-30 transition-opacity" }
const PICK_FALLBACK_LABEL = "o componente"
const PICK_HINT = "Enter ou Espaço seleciona o componente. Enter no selecionado ou duplo clique confirma."
const PICK_STATUS = { listed: "Clique em um dos componentes destacados.", any: "Clique em qualquer componente do fluxo." } as const
const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]'
const CANVAS_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['[id^="react-flow__node-desc-"]', "Pressione Enter ou Espaço para selecionar o componente. Depois, use as setas para movê-lo, Delete para removê-lo e Esc para cancelar."],
  ['[id^="react-flow__edge-desc-"]', "Pressione Enter ou Espaço para selecionar a conexão. Depois, use Delete para removê-la ou Esc para cancelar."],
]
const MOVE_DIRECTIONS: Record<string, string> = { up: "para cima", down: "para baixo", left: "para a esquerda", right: "para a direita" }
const MOVE_MESSAGE = /^Moved selected node (\w+)\. New position, x: (-?\d+), y: (-?\d+)$/

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const formatPoint = (point?: XYPosition | null) => (point ? `(${Math.round(point.x)}, ${Math.round(point.y)})` : "(--, --)")
const isTextField = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
const isTypingTarget = (target: EventTarget | null) => isTextField(target) || (target instanceof HTMLElement && (target.getAttribute("role") === "combobox" || Boolean(target.closest('[role="listbox"]'))))
const minimapColor = (node: Node<AtendimentoData>) => (node.data.type === NOTE_TYPE ? noteColor(node.data.data.color) : getComponentColor(node.data.type))
const minimapClass = (node: Node<AtendimentoData>) => (node.data.type === START_TYPE ? "fill-flow-success" : "")
const overlaps = (first: Box, second: Box, gap: number) =>
  first.x < second.x + second.width + gap && second.x < first.x + first.width + gap && first.y < second.y + second.height + gap && second.y < first.y + first.height + gap
const sameJson = (first: unknown, second: unknown) => first === second || JSON.stringify(first) === JSON.stringify(second)
const isPreviewFlow = (value: AtendimentoFlow | null): value is AtendimentoFlow => Boolean(value && Array.isArray(value.nodes) && Array.isArray(value.edges) && value.nodes.length)
const pickLabel = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().replace(/[\s.,;:!?]+$/, "") : "") || PICK_FALLBACK_LABEL
const pickMinimapClass = (candidates: ReadonlySet<string>) => (node: Node<AtendimentoData>) => (candidates.has(node.id) ? "fill-flow-accent" : "fill-flow-muted/30")
const boxOf = (node: Node): Box => {
  const point = node.positionAbsolute ?? node.position
  return { x: point.x, y: point.y, width: node.width || DEFAULT_NODE_SIZE.width, height: node.height || DEFAULT_NODE_SIZE.height }
}

export function edgeLock(picking: boolean, any: boolean, locked: boolean) {
  if (picking) return any ? LOCKED_EDGE : PICK_EDGE
  return locked ? LOCKED_EDGE : null
}

function safely(run: () => void) {
  try {
    run()
  } catch {
    return
  }
}

function stabilizePreview(next: AtendimentoFlow, previous: AtendimentoFlow | null): AtendimentoFlow {
  if (!previous) return next
  const oldNodes = new Map(previous.nodes.map((node) => [node.id, node]))
  const oldEdges = new Map(previous.edges.map((edge) => [edge.id, edge]))
  let changed = next.nodes.length !== previous.nodes.length || next.edges.length !== previous.edges.length
  const nodes = next.nodes.map((node, index) => {
    const old = oldNodes.get(node.id)
    const kept = old && sameJson(old, node) ? old : node
    if (kept !== previous.nodes[index]) changed = true
    return kept
  })
  const edges = next.edges.map((edge, index) => {
    const old = oldEdges.get(edge.id)
    const kept = old && sameJson(old, edge) ? old : edge
    if (kept !== previous.edges[index]) changed = true
    return kept
  })
  return changed ? { ...next, nodes, edges } : previous
}

function translateCanvasAnnouncements(root: HTMLElement) {
  for (const [selector, text] of CANVAS_HINTS) {
    const texts = Array.from(root.querySelector(selector)?.childNodes ?? []).filter((child) => child.nodeType === child.TEXT_NODE)
    texts.forEach((child, index) => {
      child.nodeValue = index === 0 ? text : ""
    })
  }
  const live = root.querySelector('[id^="react-flow__aria-live-"]')
  if (!live) return () => {}
  const observer = new MutationObserver(() => {
    const match = MOVE_MESSAGE.exec(live.textContent ?? "")
    if (match) live.textContent = `Componente movido ${MOVE_DIRECTIONS[match[1]] ?? ""}. Nova posição: x ${match[2]}, y ${match[3]}.`
  })
  observer.observe(live, { childList: true, characterData: true, subtree: true })
  return () => observer.disconnect()
}

function ToolButton({ label, icon: Icon, pressed, title, className, ...props }: ToolButtonProps) {
  return (
    <button {...props} type="button" aria-label={label} aria-pressed={pressed} title={title ?? label} className={cn(ui.toolButton, pressed && ui.toolButtonActive, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

const CanvasStatus = memo(function CanvasStatus({ container, count, start }: { container: RefObject<HTMLDivElement | null>; count: number; start?: XYPosition }) {
  const { screenToFlowPosition } = useReactFlow()
  const [mouse, setMouse] = useState<XYPosition | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    let frame = 0
    let pointer: XYPosition = { x: 0, y: 0 }
    const update = () => {
      frame = 0
      const point = screenToFlowPosition(pointer)
      const next = { x: Math.round(point.x), y: Math.round(point.y) }
      setMouse((current) => (current && current.x === next.x && current.y === next.y ? current : next))
    }
    const move = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(update)
    }
    element.addEventListener("mousemove", move)
    return () => {
      element.removeEventListener("mousemove", move)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [container, screenToFlowPosition])

  return (
    <div data-canvas-overlay="" className={cn(ui.overlay, "pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%_-_1.5rem)] items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-medium text-flow-muted shadow-sm")}>
      <span>Componentes: <span className="text-flow-muted-strong">{count}</span></span>
      <span className="h-3 w-px shrink-0 bg-flow-border" aria-hidden />
      <span>Início <span className="text-flow-muted-strong">{formatPoint(start)}</span></span>
      <span className="h-3 w-px shrink-0 bg-flow-border" aria-hidden />
      <span>Mouse <span className="text-flow-muted-strong">{formatPoint(mouse)}</span></span>
    </div>
  )
})

const PREVIEW_TEXT: Record<PreviewKind, { live: string; done: string }> = {
  create: { live: "Gerando com IA. O fluxo aparece aqui conforme é criado.", done: "Fluxo gerado. Importe ou descarte na janela da IA." },
  edit: { live: "Editando com IA. As mudanças aparecem aqui conforme chegam.", done: "Edição pronta. Aplique ou descarte no Copiloto." },
}

function PreviewBanner({ bannerRef, nodes, edges, done, kind }: { bannerRef?: (element: HTMLElement | null) => void; nodes: number; edges: number; done: boolean; kind: PreviewKind }) {
  return (
    <div ref={bannerRef} data-canvas-overlay="" className={cn(ui.overlay, "pointer-events-none absolute left-1/2 top-3 z-20 flex w-max max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 items-center gap-2.5 border-flow-accent/40 px-3 py-2")}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-flow-accent/15 text-flow-accent">
        {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />}
      </span>
      <p role="status" className="min-w-0 text-xs font-semibold leading-5 text-flow-fg">{done ? PREVIEW_TEXT[kind].done : PREVIEW_TEXT[kind].live}</p>
      <span className="h-4 w-px shrink-0 bg-flow-border" aria-hidden />
      <span className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[11px] font-medium text-flow-muted">
        <span><span className="text-flow-muted-strong">{nodes}</span> {nodes === 1 ? "componente" : "componentes"}</span>
        <span><span className="text-flow-muted-strong">{edges}</span> {edges === 1 ? "conexão" : "conexões"}</span>
      </span>
    </div>
  )
}

export function PickBanner({ bannerRef, hintId, label, selection, steps, any = false, onStep, onCancel, onConfirm }: {
  bannerRef?: (element: HTMLElement | null) => void
  hintId?: string
  label: string
  selection: string
  steps: number
  any?: boolean
  onStep: (step: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <section ref={bannerRef} aria-label="Seleção no canvas" data-canvas-overlay="" className={cn(ui.overlay, "nokey absolute left-1/2 top-3 z-20 flex w-max max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 flex-wrap items-center gap-x-2.5 gap-y-2 border-flow-accent/40 px-3 py-2")}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-flow-accent/15 text-flow-accent">
        <MousePointerClick className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[26rem] flex-1">
        <p className="break-words text-xs font-semibold leading-5 text-flow-fg">Selecione {label} no canvas.</p>
        <p role="status" title={selection || undefined} className="truncate text-[11px] leading-4 text-flow-muted">
          {selection ? <>Selecionado: <span className="font-semibold text-flow-muted-strong">{selection}</span></> : any ? PICK_STATUS.any : PICK_STATUS.listed}
        </p>
        {hintId ? <p id={hintId} className="sr-only">{PICK_HINT}</p> : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => onStep(-1)} disabled={steps < 2} aria-label="Anterior" title="Componente anterior" className={cn(ui.toolButton, "h-7 w-7")}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => onStep(1)} disabled={steps < 2} aria-label="Próximo" title="Próximo componente" className={cn(ui.toolButton, "h-7 w-7")}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </span>
        <button type="button" onClick={onCancel} className={cn(ui.button, "h-7")}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} disabled={!selection} title="Confirmar (Enter ou duplo clique no componente)" className={cn(ui.primaryButton, "h-7")}>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Confirmar
        </button>
      </div>
    </section>
  )
}

function IssuesPanel({ id, issues, nodes, onClose, onSelect }: {
  id: string
  issues: FlowIssue[]
  nodes: ReadonlyMap<string, AtendimentoNode>
  onClose: () => void
  onSelect: (node: AtendimentoNode) => void
}) {
  const errors = issues.filter((issue) => issue.severity === "error").length
  const warnings = issues.length - errors
  const ordered = [...issues].sort((a, b) => Number(a.severity !== "error") - Number(b.severity !== "error"))
  const tone = errors
    ? { frame: "border-flow-danger/40", header: "border-flow-danger/30 bg-flow-danger/10 text-flow-danger", icon: TriangleAlert, title: `${plural(errors, "pendência impede", "pendências impedem")} a exportação` }
    : warnings
      ? { frame: "border-flow-warning/40", header: "border-flow-warning/30 bg-flow-warning/10 text-flow-warning", icon: TriangleAlert, title: `Fluxo validado com ${plural(warnings, "aviso", "avisos")}` }
      : { frame: "border-flow-success/40", header: "border-flow-success/30 bg-flow-success/10 text-flow-success", icon: Check, title: "Fluxo validado" }
  const Icon = tone.icon

  return (
    <section id={id} aria-label="Validação do fluxo" data-canvas-overlay="" className={cn(ui.overlay, "absolute left-1/2 top-3 z-20 flex max-h-[min(24rem,calc(100%_-_1.5rem))] w-[min(92%,30rem)] -translate-x-1/2 flex-col overflow-hidden", tone.frame)}>
      <div className={cn("flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2", tone.header)}>
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{tone.title}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Fechar validação" title="Fechar validação" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-flow-muted transition hover:bg-flow-soft hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {ordered.length ? (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {ordered.map((issue, index) => {
            const node = issue.nodeId ? nodes.get(issue.nodeId) : undefined
            const content = (
              <>
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", issue.severity === "error" ? "bg-flow-danger" : "bg-flow-warning")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{issue.severity === "error" ? "Pendência: " : "Aviso: "}</span>
                  {node && <span className="block truncate font-semibold text-flow-fg">{getComponentLabel(node.data.type)} · ID {node.id}</span>}
                  <span className="block break-words">{issue.message}</span>
                </span>
              </>
            )
            return (
              <li key={`${issue.nodeId ?? "fluxo"}-${index}`}>
                {node ? (
                  <button type="button" onClick={() => onSelect(node)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs leading-5 text-flow-muted-strong transition hover:bg-flow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30">
                    {content}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-2.5 py-1.5 text-xs leading-5 text-flow-muted-strong">{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-3 py-2.5 text-xs text-flow-muted-strong">Estrutura, campos e conexões prontos para exportar no formato de Atendimento.</p>
      )}
    </section>
  )
}

function FlowSettings({ open, disabled, onOpenChange, triggerRef, description, serviceType, onDescriptionChange, onServiceTypeChange, onCreateNew }: {
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
  description: string
  serviceType: string
  onDescriptionChange: (value: string) => void
  onServiceTypeChange: (value: string) => void
  onCreateNew: () => void
}) {
  const id = useId()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button ref={triggerRef} type="button" disabled={disabled} aria-label="Configurações do fluxo" title="Configurações do fluxo" className={cn(ui.toolButton, open && ui.toolButtonActive)}>
          <Settings2 className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12} className={cn(ui.dialog, "w-80 space-y-4 rounded-xl p-4 shadow-xl")}>
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-flow-fg">Configurações do fluxo</h2>
          <p className="text-xs text-flow-muted">Dados gravados no JSON de Atendimento.</p>
        </div>
        <div>
          <label htmlFor={`${id}-description`} className={ui.label}>Descrição</label>
          <textarea id={`${id}-description`} className={cn(ui.textarea, "min-h-20 resize-y")} placeholder="Objetivo deste atendimento" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-service`} className={ui.label}>Tipo de serviço</label>
          <input id={`${id}-service`} aria-describedby={`${id}-service-hint`} className={ui.input} value={serviceType} onChange={(event) => onServiceTypeChange(event.target.value)} />
          <p id={`${id}-service-hint`} className={ui.hint}>No JSON de referência o valor é chat.</p>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-flow-soft px-3 py-2 text-[11px] leading-4 text-flow-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          A data de criação (created_at) é gravada no momento da exportação.
        </p>
        <div className="border-t border-flow-border pt-3">
          <button type="button" onClick={onCreateNew} className={cn(ui.dangerButton, "w-full justify-center")}>
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
            Criar novo fluxo
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function WorkflowBuilderInner({ onActionsReady, onOpenBot }: WorkflowBuilderProps) {
  const [flow, setFlowState] = useState<AtendimentoFlow>(() => newFlow())
  const [ready, setReady] = useState(false)
  const [recovery, setRecovery] = useState("")
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])
  const [panelId, setPanelId] = useState<string | null>(null)
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const [drafts, setDrafts] = useState<Record<string, boolean>>({})
  const [showIssues, setShowIssues] = useState(false)
  const [showLibrary, setShowLibrary] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [library, setLibrary] = useState<SavedFlow[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)
  const [importError, setImportError] = useState("")
  const [preview, setPreview] = useState<AtendimentoFlow | null>(null)
  const [previewDone, setPreviewDone] = useState(false)
  const [previewKind, setPreviewKind] = useState<PreviewKind>("create")
  const [previewSizes, setPreviewSizes] = useState<Record<string, Size>>({})
  const [pick, setPick] = useState<PickSession | null>(null)
  const [focusMark, setFocusMark] = useState<string | null>(null)
  const [, setHistoryVersion] = useState(0)
  const flowRef = useRef(flow)
  const past = useRef<AtendimentoFlow[]>([])
  const future = useRef<AtendimentoFlow[]>([])
  const lastCommit = useRef<{ key: string; at: number } | null>(null)
  const idFloor = useRef(1)
  const executed = useRef<string | null>(null)
  const savedId = useRef<string | null>(null)
  const dragOrigin = useRef<AtendimentoFlow | null>(null)
  const removalBatch = useRef(false)
  const pendingReveal = useRef<{ id: string; until: number } | null>(null)
  const viewTarget = useRef<{ viewport: Viewport | null; until: number }>({ viewport: null, until: 0 })
  const revealTimer = useRef<number | undefined>(undefined)
  const lookup = useRef<{ nodes: AtendimentoNode[]; byId: Map<string, AtendimentoNode> } | null>(null)
  const handlers = useRef<Handlers | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const clearTrigger = useRef<HTMLButtonElement>(null)
  const previewRef = useRef<AtendimentoFlow | null>(null)
  const previewView = useRef<Viewport | null>(null)
  const previewFollow = useRef(true)
  const previewFitted = useRef(false)
  const previewCooldown = useRef(0)
  const lastFit = useRef(0)
  const fitTimer = useRef<number | undefined>(undefined)
  const fitFrame = useRef(0)
  const fitPending = useRef(false)
  const moveOrigin = useRef<Viewport | null>(null)
  const pickRef = useRef<PickSession | null>(null)
  const pickSequence = useRef(0)
  const previewFocus = useRef<{ id: string | null; overview: boolean }>({ id: null, overview: false })
  const bannerRef = useRef<HTMLElement | null>(null)
  const libraryByPick = useRef(false)
  const libraryShown = useRef(true)
  const recenter = useRef<{ width: number; view: Viewport; keep?: string } | null>(null)
  const issuesId = useId()
  const pickHintId = useId()
  const { setViewport, getViewport, getNode, getNodes, screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow()
  const store = useStoreApi()
  const dirty = Object.values(drafts).some(Boolean)
  const previewing = preview !== null
  const picking = pick !== null
  const marking = picking || focusMark !== null
  const locked = previewing || picking
  const display = preview ?? flow
  const issues = useMemo(() => validateFlow(flow), [flow])
  const errorCount = useMemo(() => issues.filter((issue) => issue.severity === "error").length, [issues])
  const nodesById = useMemo(() => new Map(flow.nodes.map((node) => [node.id, node])), [flow.nodes])
  const displayById = useMemo(() => (preview ? new Map(preview.nodes.map((node) => [node.id, node])) : nodesById), [nodesById, preview])
  const startNode = useMemo(() => display.nodes.find((node) => node.data.type === START_TYPE), [display.nodes])
  const panelNode = panelId ? nodesById.get(panelId) : undefined
  const panelIssuesKey = useMemo(() => (panelId ? JSON.stringify(issues.filter((issue) => issue.nodeId === panelId)) : "[]"), [issues, panelId])
  const panelIssues = useMemo<FlowIssue[]>(() => JSON.parse(panelIssuesKey), [panelIssuesKey])
  const invalidKey = useMemo(() => {
    if (!showIssues) return ""
    const ids = new Set<string>()
    for (const issue of issues) if (issue.severity === "error" && issue.nodeId) ids.add(issue.nodeId)
    return [...ids].sort().join(ID_SEPARATOR)
  }, [issues, showIssues])
  const invalidNodes = useMemo<ReadonlySet<string>>(() => (invalidKey ? new Set(invalidKey.split(ID_SEPARATOR)) : NO_INVALID_NODES), [invalidKey])

  const findNode = useCallback((id: string | null | undefined) => {
    if (!id) return undefined
    const nodes = flowRef.current.nodes
    if (lookup.current?.nodes !== nodes) lookup.current = { nodes, byId: new Map(nodes.map((node) => [node.id, node])) }
    return lookup.current.byId.get(id)
  }, [])

  const pushHistory = useCallback((snapshot: AtendimentoFlow) => {
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), snapshot]
    future.current = []
    setHistoryVersion((version) => version + 1)
  }, [])

  const resetHistory = useCallback(() => {
    past.current = []
    future.current = []
    lastCommit.current = null
    setHistoryVersion((version) => version + 1)
  }, [])

  const setDocument = useCallback((next: AtendimentoFlow, mode: "history" | "silent", options: { resetIds?: boolean; coalesce?: string } = {}) => {
    const current = flowRef.current
    if (next === current) return
    if (mode === "history") {
      const now = Date.now()
      const previous = lastCommit.current
      const repeated = Boolean(options.coalesce) && previous !== null && previous.key === options.coalesce && now - previous.at < 1500
      if (repeated) future.current = []
      else pushHistory(current)
      lastCommit.current = options.coalesce ? { key: options.coalesce, at: now } : null
    }
    flowRef.current = next
    const highest = maxNumericId(next.nodes.map((node) => node.id))
    idFloor.current = options.resetIds ? highest : Math.max(idFloor.current, highest)
    setFlowState(next)
  }, [pushHistory])

  const commit = useCallback((change: (current: AtendimentoFlow) => AtendimentoFlow, coalesce?: string) => {
    if (previewRef.current || pickRef.current) return
    setDocument(change(flowRef.current), "history", { coalesce })
  }, [setDocument])

  const canvasBusy = useCallback(() => {
    if (pickRef.current) {
      toast({ title: "Seleção no canvas em andamento", description: "Confirme ou cancele a seleção para editar, salvar ou exportar." })
      return true
    }
    if (!previewRef.current) return false
    toast({ title: "Geração com IA em andamento", description: "Aguarde o fluxo ficar pronto para editar, salvar ou exportar." })
    return true
  }, [])

  const writePick = useCallback((next: PickSession | null) => {
    pickRef.current = next
    setPick(next)
  }, [])

  const showComponents = useCallback((visible: boolean) => {
    recenter.current = null
    libraryShown.current = visible
    setShowLibrary(visible)
  }, [])

  const toggleLibrary = useCallback((visible: boolean) => {
    const surface = canvas.current
    const pending = surface ? { width: surface.clientWidth, view: getViewport() } : null
    showComponents(visible)
    recenter.current = pending
  }, [getViewport, showComponents])

  const leavePick = useCallback(() => {
    const session = pickRef.current
    if (!session) return null
    writePick(null)
    setFocusMark(previewRef.current ? previewFocus.current.id : null)
    if (libraryByPick.current) {
      libraryByPick.current = false
      toggleLibrary(true)
    }
    return session
  }, [toggleLibrary, writePick])

  const setBanner = useCallback((element: HTMLElement | null) => {
    bannerRef.current = element
  }, [])

  const cancelPick = useCallback(() => {
    const session = leavePick()
    if (session) safely(() => session.onCancel())
  }, [leavePick])

  const removal = useCallback(() => {
    const mode = removalBatch.current ? "silent" as const : "history" as const
    if (!removalBatch.current) {
      removalBatch.current = true
      queueMicrotask(() => { removalBatch.current = false })
    }
    return mode
  }, [])

  const syncViewport = useCallback((delay = 0) => {
    setTimeout(() => {
      if (previewRef.current) return
      const viewport = getViewport()
      const current = flowRef.current
      if (current.viewport.x !== viewport.x || current.viewport.y !== viewport.y || current.viewport.zoom !== viewport.zoom) setDocument({ ...current, viewport }, "silent")
    }, delay)
  }, [getViewport, setDocument])

  const holdView = useCallback((duration: number, viewport: Viewport | null = null) => {
    viewTarget.current = { viewport, until: performance.now() + duration }
  }, [])

  const releaseView = useCallback(() => {
    viewTarget.current = { viewport: null, until: 0 }
  }, [])

  const settledView = useCallback((): Viewport => {
    const { viewport, until } = viewTarget.current
    return viewport && performance.now() < until ? viewport : getViewport()
  }, [getViewport])

  const toFlow = useCallback((point: XYPosition): XYPosition => {
    const origin = store.getState().domNode?.getBoundingClientRect()
    const { x, y, zoom } = settledView()
    return { x: (point.x - (origin?.left ?? 0) - x) / zoom, y: (point.y - (origin?.top ?? 0) - y) / zoom }
  }, [settledView, store])

  const centerOn = useCallback((x: number, y: number, zoom: number) => {
    const { width, height } = store.getState()
    const viewport = { x: width / 2 - x * zoom, y: height / 2 - y * zoom, zoom }
    holdView(PAN_DURATION, viewport)
    void setViewport(viewport, { duration: PAN_DURATION })
    syncViewport(PAN_DURATION + 50)
  }, [holdView, setViewport, store, syncViewport])

  useEffect(() => () => {
    window.clearTimeout(revealTimer.current)
    window.clearTimeout(fitTimer.current)
    cancelAnimationFrame(fitFrame.current)
  }, [])

  const cancelFit = useCallback(() => {
    window.clearTimeout(fitTimer.current)
    cancelAnimationFrame(fitFrame.current)
    fitTimer.current = undefined
    fitFrame.current = 0
    fitPending.current = false
  }, [])

  const endPreview = useCallback((): Viewport | null => {
    if (!previewRef.current) return null
    previewRef.current = null
    previewFocus.current = { id: null, overview: false }
    cancelFit()
    const view = previewView.current
    previewView.current = null
    setPreview(null)
    setPreviewDone(false)
    setPreviewSizes({})
    setFocusMark(null)
    releaseView()
    if (view) void setViewport(view)
    return view
  }, [cancelFit, releaseView, setViewport])

  const freeArea = useCallback((): Box | null => {
    const { domNode, width: storedWidth, height: storedHeight } = store.getState()
    const width = domNode?.clientWidth || storedWidth
    const height = domNode?.clientHeight || storedHeight
    if (!width || !height) return null
    const banner = bannerRef.current
    const top = banner?.offsetHeight ? Math.min(height - 1, banner.offsetTop + banner.offsetHeight + FIT_MARGIN) : FIT_TOP_MARGIN
    return { x: 0, y: top, width, height: Math.max(1, height - top) }
  }, [store])

  const moveCamera = useCallback((viewport: Viewport, duration: number) => {
    holdView(duration, viewport)
    void setViewport(viewport, { duration })
    syncViewport(duration + 50)
  }, [holdView, setViewport, syncViewport])

  const fitPreview = useCallback((force: boolean) => {
    const shown = previewRef.current
    const area = freeArea()
    const nodes = getNodes()
    if (!shown || !area || !nodes.length) return
    const boxes = new Map(nodes.map((node) => [node.id, boxOf(node)]))
    const { id, overview } = previewFocus.current
    const anchor = id && !overview ? boxes.get(id) : undefined
    let bounds: Box
    let target: Viewport
    if (anchor) {
      const near = [...editedIds(flowRef.current, shown)].flatMap((edited) => (edited === id ? [] : boxes.get(edited) ?? []))
      const frame = frameAround(anchor, near, area, FIT_LIMITS, FOCUS_MIN_ZOOM)
      bounds = frame.bounds
      target = frame.view
    } else {
      bounds = [...boxes.values()].reduce(unite)
      target = fitBox(bounds, area, FIT_LIMITS)
    }
    const current = settledView()
    if (!force && previewFitted.current && shownIn(bounds, current, area, FIT_MARGIN)) return
    previewFitted.current = true
    lastFit.current = performance.now()
    if (Math.abs(target.zoom - current.zoom) < 0.005 && Math.abs(target.x - current.x) < 2 && Math.abs(target.y - current.y) < 2) return
    holdView(FIT_DURATION, target)
    void setViewport(target, { duration: FIT_DURATION })
  }, [freeArea, getNodes, holdView, setViewport, settledView])

  const scheduleFit = useCallback(function schedule() {
    if (!previewRef.current || !previewFollow.current || pickRef.current) return
    if (fitFrame.current) {
      fitPending.current = true
      return
    }
    if (fitTimer.current !== undefined) return
    fitPending.current = false
    const wait = previewFitted.current ? Math.max(0, lastFit.current + FIT_INTERVAL - performance.now()) : 0
    fitTimer.current = window.setTimeout(() => {
      fitTimer.current = undefined
      fitFrame.current = requestAnimationFrame(() => {
        fitFrame.current = requestAnimationFrame(() => {
          fitFrame.current = 0
          if (previewFollow.current && !pickRef.current) fitPreview(false)
          if (fitPending.current) schedule()
        })
      })
    }, wait)
  }, [fitPreview])

  useEffect(() => {
    if (preview) scheduleFit()
  }, [preview, scheduleFit])

  const previewWorkflow = useCallback((next: AtendimentoFlow | null, done = false, kind: PreviewKind = "create", fresh = false, focus?: string | null) => {
    if (!isPreviewFlow(next)) {
      endPreview()
      return
    }
    setPreviewDone(done)
    setPreviewKind(kind)
    const current = previewRef.current
    const target = previewFocusOf(focus, current ? previewFocus.current.id : null, next.nodes)
    let refocused = false
    if (!current) {
      if (!fresh && performance.now() < previewCooldown.current) return
      if (kind === "create") cancelPick()
      previewView.current = settledView()
      previewFollow.current = true
      previewFitted.current = false
      lastFit.current = 0
      previewFocus.current = { id: target, overview: false }
      setSettingsOpen(false)
      setLibraryOpen(false)
      setConfirmClear(false)
    } else if (target !== previewFocus.current.id) {
      refocused = target !== null
      previewFocus.current = { id: target, overview: false }
      if (refocused) {
        previewFollow.current = true
        previewFitted.current = false
        lastFit.current = 0
      }
    }
    if (!pickRef.current) setFocusMark(target)
    const stable = stabilizePreview(next, current)
    if (stable === current) {
      if (refocused) scheduleFit()
      return
    }
    previewRef.current = stable
    setPreview(stable)
  }, [cancelPick, endPreview, scheduleFit, settledView])

  const allocateId = useCallback(() => {
    idFloor.current = Math.max(idFloor.current, maxNumericId(flowRef.current.nodes.map((node) => node.id))) + 1
    return String(idFloor.current)
  }, [])

  const ensureApplied = useCallback(() => {
    if (!dirty) return true
    toast({ title: "Edição de JSON pendente", description: "Aplique ou descarte as edições de JSON no painel antes de continuar.", variant: "destructive" })
    return false
  }, [dirty])

  const persist = useCallback((document: AtendimentoFlow, markExecuted = false) => {
    try {
      const serialized = JSON.stringify(document)
      const before = [localStorage.getItem(STORAGE_KEY), localStorage.getItem(EXECUTED_KEY)]
      localStorage.setItem(STORAGE_KEY, serialized)
      if (markExecuted) {
        executed.current = behaviorSignature(document)
        localStorage.setItem(EXECUTED_KEY, "true")
      } else if (executed.current !== null && executed.current !== behaviorSignature(document)) {
        executed.current = null
        localStorage.removeItem(EXECUTED_KEY)
      }
      if (before[0] !== serialized || before[1] !== localStorage.getItem(EXECUTED_KEY)) window.dispatchEvent(new Event("storage"))
      return true
    } catch {
      toast({ title: "Não foi possível salvar no navegador", description: "Exporte o JSON para guardar suas alterações.", variant: "destructive" })
      return false
    }
  }, [])

  const backupStored = useCallback(() => {
    try {
      const previous = localStorage.getItem(STORAGE_KEY)
      if (previous) localStorage.setItem(BACKUP_KEY, previous)
    } catch {
      toast({ title: "Backup local indisponível", description: "O navegador bloqueou o armazenamento local.", variant: "destructive" })
    }
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const restored = importFlow(stored)
        setDocument(restored, "silent", { resetIds: true })
        if (localStorage.getItem(EXECUTED_KEY) === "true") executed.current = behaviorSignature(restored)
        void setViewport(restored.viewport)
      }
    } catch (cause) {
      setRecovery(`O fluxo salvo neste navegador não pôde ser aberto: ${(cause as Error).message} Ele continua guardado até você importar outro fluxo ou criar um novo.`)
    }
    setReady(true)
  }, [setDocument, setViewport])

  const selectSaved = useCallback((id: string | null) => {
    savedId.current = id
    setCurrentSavedId(id)
    try {
      writeCurrentId(localStorage, id)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const entries = readLibrary(localStorage)
      const id = readCurrentId(localStorage)
      setLibrary(entries)
      selectSaved(id && entries.some((entry) => entry.id === id) ? id : null)
    } catch {}
    const sync = (event: StorageEvent) => {
      if (event.key !== LIBRARY_KEY) return
      try {
        setLibrary(readLibrary(localStorage))
      } catch {}
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [selectSaved])

  const storeCurrent = useCallback((document: AtendimentoFlow): SavedFlow | null | false => {
    if (isBlankFlow(document)) return null
    try {
      const entries = readLibrary(localStorage)
      const entry: SavedFlow = { id: savedId.current ?? findSameSaved(entries, document)?.id ?? newSavedId(), savedAt: new Date().toISOString(), flow: document }
      const next = upsertSaved(entries, entry)
      writeLibrary(localStorage, next)
      setLibrary(next)
      selectSaved(entry.id)
      return entry
    } catch {
      toast({ title: "Não foi possível guardar o fluxo atual", description: "O armazenamento do navegador está cheio ou bloqueado. Exporte o JSON antes de continuar.", variant: "destructive" })
      return false
    }
  }, [selectSaved])

  useEffect(() => {
    if (!ready || recovery) return
    const timer = setTimeout(() => persist(flow), 500)
    return () => clearTimeout(timer)
  }, [flow, ready, recovery, persist])

  const clearSelection = useCallback(() => {
    setPanelId(null)
    setSelectedNodes([])
    setSelectedEdges([])
    setDrafts({})
  }, [])

  const loadWorkflow = useCallback((input: unknown) => {
    const view = endPreview()
    previewCooldown.current = performance.now() + PREVIEW_COOLDOWN
    if (!ensureApplied()) return false
    try {
      const imported = importFlow(input)
      if (!recovery && storeCurrent({ ...flowRef.current, viewport: view ?? getViewport() }) === false) return false
      backupStored()
      selectSaved(null)
      setDocument(imported, "silent", { resetIds: true })
      cancelPick()
      resetHistory()
      setRecovery("")
      setSizes({})
      clearSelection()
      void setViewport(imported.viewport)
      persist(imported)
      toast({ title: "Fluxo importado", description: `${plural(imported.nodes.length, "componente", "componentes")} e ${plural(imported.edges.length, "conexão", "conexões")} carregados.` })
      return true
    } catch (cause) {
      setImportError(cause instanceof SyntaxError ? "O arquivo não é um JSON válido." : (cause as Error).message)
      return false
    }
  }, [backupStored, cancelPick, clearSelection, endPreview, ensureApplied, getViewport, persist, recovery, resetHistory, selectSaved, setDocument, setViewport, storeCurrent])

  const getFlow = useCallback((): AtendimentoFlow => ({ ...flowRef.current, viewport: previewView.current ?? settledView() }), [settledView])

  const applyWorkflowEdit = useCallback((input: AtendimentoFlow) => {
    const view = endPreview()
    previewCooldown.current = performance.now() + PREVIEW_COOLDOWN
    if (recovery) {
      toast({ title: "Edição pausada", description: "Importe um fluxo válido ou crie um novo fluxo para continuar.", variant: "destructive" })
      return false
    }
    if (!ensureApplied()) return false
    let edited: AtendimentoFlow
    try {
      edited = importFlow(input)
    } catch (cause) {
      toast({ title: "Não foi possível aplicar a edição", description: (cause as Error).message, variant: "destructive" })
      return false
    }
    const viewport = view ?? settledView()
    setDocument({ ...edited, viewport }, "history")
    clearSelection()
    void setViewport(viewport)
    toast({ title: "Alterações aplicadas", description: "O fluxo aberto foi atualizado. Use Desfazer (Ctrl+Z) para voltar ao anterior." })
    return true
  }, [clearSelection, endPreview, ensureApplied, recovery, setDocument, setViewport, settledView])

  const reportIssues = useCallback((title: string) => {
    setShowIssues(true)
    toast({ title, description: `${plural(errorCount, "pendência", "pendências")} no painel de validação.`, variant: "destructive" })
  }, [errorCount])

  const save = useCallback(() => {
    if (canvasBusy()) return false
    if (recovery) {
      toast({ title: "Salvamento pausado", description: "Importe um fluxo válido ou crie um novo fluxo para continuar.", variant: "destructive" })
      return false
    }
    if (!ensureApplied()) return false
    const document = { ...flowRef.current, viewport: getViewport() }
    setDocument(document, "silent")
    const saved = persist(document)
    if (saved && savedId.current && !isBlankFlow(document)) storeCurrent(document)
    if (saved) {
      const pending = errorCount ? ` ${plural(errorCount, "pendência impede", "pendências impedem")} a exportação.` : ""
      toast({ title: "Fluxo salvo", description: `${plural(document.nodes.length, "componente", "componentes")} e ${plural(document.edges.length, "conexão", "conexões")} guardados neste navegador.${pending}` })
    }
    return saved
  }, [ensureApplied, errorCount, getViewport, persist, canvasBusy, recovery, setDocument, storeCurrent])

  const download = useCallback(() => {
    if (canvasBusy() || !ensureApplied()) return false
    if (errorCount) {
      reportIssues("Corrija as pendências antes de exportar")
      return false
    }
    try {
      const document = stampExport({ ...flowRef.current, viewport: getViewport() })
      downloadJson(exportFlow(document), exportFileName(document))
      toast({ title: "JSON de Atendimento exportado", description: `${plural(document.nodes.length, "componente", "componentes")} e ${plural(document.edges.length, "conexão", "conexões")}.` })
      return true
    } catch (cause) {
      setShowIssues(true)
      toast({ title: "Exportação bloqueada", description: (cause as Error).message, variant: "destructive" })
      return false
    }
  }, [ensureApplied, errorCount, getViewport, canvasBusy, reportIssues])

  const execute = useCallback(() => {
    if (canvasBusy() || recovery || !ensureApplied()) return false
    if (errorCount) {
      reportIssues("Corrija as pendências antes de abrir a prévia")
      return false
    }
    const document = flowRef.current
    if (!persist(document, true)) return false
    window.dispatchEvent(new CustomEvent("workflow:executed", { detail: document }))
    onOpenBot?.()
    return true
  }, [ensureApplied, errorCount, onOpenBot, persist, canvasBusy, recovery, reportIssues])

  const removeNodes = useCallback((ids: string[]) => {
    const current = flowRef.current
    const removable = new Set(ids.filter((id) => {
      const node = findNode(id)
      return Boolean(node && node.data.type !== START_TYPE)
    }))
    if (!removable.size) return
    setDocument({
      ...current,
      nodes: current.nodes.filter((node) => !removable.has(node.id)),
      edges: current.edges.filter((edge) => !removable.has(edge.source) && !removable.has(edge.target)),
    }, removal())
    setSelectedNodes((selected) => selected.filter((id) => !removable.has(id)))
    setPanelId((open) => (open && removable.has(open) ? null : open))
    setDrafts({})
  }, [findNode, removal, setDocument])

  const removeNode = useCallback((id: string) => {
    if (!canvasBusy() && ensureApplied()) removeNodes([id])
  }, [ensureApplied, canvasBusy, removeNodes])

  const removeEdges = useCallback((ids: string[]) => {
    if (previewRef.current || pickRef.current) return
    const remove = new Set(ids)
    const current = flowRef.current
    if (!current.edges.some((edge) => remove.has(edge.id))) return
    setDocument({ ...current, edges: current.edges.filter((edge) => !remove.has(edge.id)) }, removal())
    setSelectedEdges((selected) => selected.filter((id) => !remove.has(id)))
  }, [removal, setDocument])

  const reset = useCallback(() => {
    if (canvasBusy() || !ensureApplied()) return
    backupStored()
    selectSaved(null)
    const empty = newFlow()
    setDocument(empty, "silent", { resetIds: true })
    resetHistory()
    setRecovery("")
    setSizes({})
    clearSelection()
    void setViewport(empty.viewport)
    persist(empty)
  }, [backupStored, clearSelection, ensureApplied, persist, canvasBusy, resetHistory, selectSaved, setDocument, setViewport])

  const focusNode = useCallback((node: AtendimentoNode) => {
    setPanelId(node.id)
    setSelectedNodes([node.id])
    setSelectedEdges([])
    const size = sizes[node.id] || DEFAULT_NODE_SIZE
    const zoom = Math.max(settledView().zoom, 0.9)
    requestAnimationFrame(() => requestAnimationFrame(() => centerOn(node.position.x + size.width / 2, node.position.y + size.height / 2, zoom)))
  }, [centerOn, settledView, sizes])

  const selectIssue = useCallback((node: AtendimentoNode) => {
    if (ensureApplied()) focusNode(node)
  }, [ensureApplied, focusNode])

  const search = useCallback((query: string) => {
    if (canvasBusy() || !ensureApplied()) return false
    const text = query.trim()
    const term = normalize(text)
    if (!term) return false
    const nodes = flowRef.current.nodes
    const node = nodes.find((entry) => normalize(entry.id) === term)
      || nodes.find((entry) => normalize(`${getComponentLabel(entry.data.type)} ${nodeSummary(entry.data)}`).includes(term))
    if (!node) {
      toast({ title: "Componente não encontrado", description: `Nenhum componente com ID ou texto “${text}”.` })
      return false
    }
    focusNode(node)
    return true
  }, [ensureApplied, focusNode, canvasBusy])

  const undo = useCallback(() => {
    if (canvasBusy() || !ensureApplied()) return
    const previous = past.current.pop()
    if (!previous) return
    future.current = [flowRef.current, ...future.current].slice(0, HISTORY_LIMIT)
    lastCommit.current = null
    setDocument(previous, "silent")
    setHistoryVersion((version) => version + 1)
    clearSelection()
  }, [clearSelection, ensureApplied, canvasBusy, setDocument])

  const redo = useCallback(() => {
    if (canvasBusy() || !ensureApplied()) return
    const [next, ...rest] = future.current
    if (!next) return
    past.current = [...past.current, flowRef.current].slice(-HISTORY_LIMIT)
    future.current = rest
    lastCommit.current = null
    setDocument(next, "silent")
    setHistoryVersion((version) => version + 1)
    clearSelection()
  }, [clearSelection, ensureApplied, canvasBusy, setDocument])

  const zoomInView = useCallback(() => {
    previewFollow.current = false
    holdView(ZOOM_DURATION)
    void zoomIn({ duration: ZOOM_DURATION })
    syncViewport(ZOOM_DURATION + 50)
  }, [holdView, syncViewport, zoomIn])

  const zoomOutView = useCallback(() => {
    previewFollow.current = false
    holdView(ZOOM_DURATION)
    void zoomOut({ duration: ZOOM_DURATION })
    syncViewport(ZOOM_DURATION + 50)
  }, [holdView, syncViewport, zoomOut])

  const fitCanvas = useCallback(() => {
    if (previewRef.current) {
      previewFollow.current = true
      previewFocus.current = { ...previewFocus.current, overview: true }
      cancelFit()
      fitPreview(true)
      return
    }
    holdView(PAN_DURATION)
    void fitView({ padding: 0.2, duration: PAN_DURATION })
    syncViewport(PAN_DURATION + 50)
  }, [cancelFit, fitPreview, fitView, holdView, syncViewport])

  const openFile = useCallback(() => {
    if (!canvasBusy()) fileInput.current?.click()
  }, [canvasBusy])

  const captureImage = useCallback(async (): Promise<Blob | null> => {
    const surface = canvas.current
    const viewport = surface?.querySelector<HTMLElement>(".react-flow__viewport")
    const nodes = getNodes()
    if (!surface || !viewport || !nodes.length) return null
    const bounds = getNodesBounds(nodes)
    const fullWidth = bounds.width + IMAGE_PADDING * 2
    const fullHeight = bounds.height + IMAGE_PADDING * 2
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(fullWidth, fullHeight))
    const width = Math.ceil(fullWidth * scale)
    const height = Math.ceil(fullHeight * scale)
    const { toBlob } = await import("html-to-image")
    return toBlob(viewport, {
      backgroundColor: backgroundOf(surface),
      width,
      height,
      pixelRatio: Math.min(2, IMAGE_MAX_SIDE / Math.max(width, height)),
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${(IMAGE_PADDING - bounds.x) * scale}px, ${(IMAGE_PADDING - bounds.y) * scale}px) scale(${scale})`,
      },
    })
  }, [getNodes])

  const minimapCorner = useCallback((): XYPosition | null => {
    const root = store.getState().domNode
    const map = root?.querySelector(".react-flow__minimap")
    if (!root || !map) return null
    const area = root.getBoundingClientRect()
    const box = map.getBoundingClientRect()
    return box.width && box.height ? { x: box.left - area.left, y: box.top - area.top } : null
  }, [store])

  const fitPick = useCallback((ids: readonly string[], anchorId: string | null) => {
    const area = freeArea()
    if (!area) return
    const wanted = new Set(ids)
    const boxes = new Map(getNodes().flatMap((node) => (wanted.has(node.id) ? [[node.id, boxOf(node)] as const] : [])))
    const anchor = (anchorId ? boxes.get(anchorId) : undefined) ?? ids.map((id) => boxes.get(id)).find((box) => box !== undefined)
    if (!anchor) return
    const others = [...boxes.values()].filter((box) => box !== anchor)
    const frame = (space: Box) => frameAround(anchor, others, space, FIT_LIMITS, PICK_MIN_ZOOM)
    let chosen = frame(area)
    const map = minimapCorner()
    if (map && overlapsCorner(chosen.bounds, chosen.view, map)) chosen = betterFrame(frame({ ...area, width: map.x }), frame({ ...area, height: map.y - area.y }))
    moveCamera(chosen.view, FIT_DURATION)
  }, [freeArea, getNodes, minimapCorner, moveCamera])

  const revealPick = useCallback((id: string, floor = PICK_MIN_ZOOM) => {
    const node = getNode(id)
    const area = freeArea()
    if (!node || !area) return
    const box = boxOf(node)
    const view = settledView()
    const zoom = Math.min(Math.max(view.zoom, floor), fitBox(box, area, REVEAL_LIMITS).zoom)
    if (Math.abs(zoom - view.zoom) < 0.005 && shownIn(box, view, area, FIT_MARGIN, minimapCorner())) return
    moveCamera(centerView(box, area, zoom), PAN_DURATION)
  }, [freeArea, getNode, minimapCorner, moveCamera, settledView])

  const startPick = useCallback((request: PickRequest): string[] => {
    const shown = new Set((previewRef.current ?? flowRef.current).nodes.map((node) => node.id))
    const listed: unknown[] = Array.isArray(request.candidates) ? request.candidates : []
    const order = [...new Set(listed)].filter((id): id is string => typeof id === "string" && shown.has(id))
    if (!order.length) return []
    const surface = canvas.current
    const { width, height } = store.getState()
    if (!roomForPick(surface?.parentElement?.clientWidth ?? width, surface?.clientHeight ?? height)) return []
    const candidates: ReadonlySet<string> = new Set(order)
    pickSequence.current += 1
    const key = pickSequence.current
    writePick({
      key,
      label: pickLabel(request.label),
      order,
      candidates,
      selected: typeof request.selected === "string" && candidates.has(request.selected) ? request.selected : null,
      any: request.any === true,
      onSelect: request.onSelect,
      onConfirm: request.onConfirm,
      onCancel: request.onCancel,
    })
    if (libraryShown.current) {
      libraryByPick.current = true
      toggleLibrary(false)
    }
    const keep = !dirty
    requestAnimationFrame(() => {
      if (pickRef.current?.key !== key) return
      if (keep) clearSelection()
      setSettingsOpen(false)
      setLibraryOpen(false)
      setConfirmClear(false)
      requestAnimationFrame(() => {
        const session = pickRef.current
        if (session?.key === key) fitPick(order, session.selected)
      })
    })
    return [...order]
  }, [clearSelection, dirty, fitPick, store, toggleLibrary, writePick])

  const selectPick = useCallback((id: string | null) => {
    const session = pickRef.current
    if (!session || session.selected === id) return
    if (id !== null && (!session.candidates.has(id) || !(previewRef.current ?? flowRef.current).nodes.some((node) => node.id === id))) return
    writePick({ ...session, selected: id })
    if (id !== null) revealPick(id)
  }, [revealPick, writePick])

  const chooseCandidate = useCallback((id: string) => {
    const session = pickRef.current
    if (!session || !session.candidates.has(id) || session.selected === id) return
    writePick({ ...session, selected: id })
    safely(() => session.onSelect(id))
  }, [writePick])

  const confirmPick = useCallback(() => {
    const session = pickRef.current
    const id = session?.selected
    if (!session || !id) return
    leavePick()
    if (recenter.current) recenter.current = { ...recenter.current, keep: id }
    setFocusMark(id)
    safely(() => session.onConfirm(id))
  }, [leavePick])

  const confirmCandidate = useCallback((id: string) => {
    const session = pickRef.current
    if (!session || !session.candidates.has(id)) return
    chooseCandidate(id)
    confirmPick()
  }, [chooseCandidate, confirmPick])

  const stepPick = useCallback((step: number) => {
    const session = pickRef.current
    if (!session) return
    const shown = new Set((previewRef.current ?? flowRef.current).nodes.map((node) => node.id))
    const id = stepCandidate(session.order, shown, session.selected, step)
    if (!id) return
    chooseCandidate(id)
    revealPick(id, PICK_STEP_ZOOM)
  }, [chooseCandidate, revealPick])

  const endPick = useCallback(() => {
    leavePick()
  }, [leavePick])

  useLayoutEffect(() => {
    const pending = recenter.current
    recenter.current = null
    const width = canvas.current?.clientWidth
    if (!pending || !width || width === pending.width) return
    const view = getViewport()
    if (view.x !== pending.view.x || view.y !== pending.view.y || view.zoom !== pending.view.zoom) return
    let next = { ...view, x: view.x + (width - pending.width) / 2 }
    const kept = pending.keep ? getNode(pending.keep) : undefined
    const area = kept ? freeArea() : null
    if (kept && area && !shownIn(boxOf(kept), next, area, FIT_MARGIN, minimapCorner())) next = centerView(boxOf(kept), area, next.zoom)
    releaseView()
    void setViewport(next)
    syncViewport()
  }, [freeArea, getNode, getViewport, minimapCorner, releaseView, setViewport, showLibrary, syncViewport])

  useLayoutEffect(() => {
    const root = canvas.current
    if (!root || !marking) return
    let last = ""
    const update = () => {
      const value = zoomScale(store.getState().transform[2]).toFixed(3)
      if (value === last) return
      last = value
      root.style.setProperty("--pick-scale", value)
    }
    update()
    const stop = store.subscribe(update)
    return () => {
      stop()
      root.style.removeProperty("--pick-scale")
    }
  }, [marking, store])

  useEffect(() => {
    if (!previewRef.current && !pickRef.current) setFocusMark(null)
  }, [flow.nodes])

  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return
      if (event.target instanceof Element && event.target.closest(LAYER_SELECTOR)) return
      cancelPick()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cancelPick, picking])

  useEffect(() => {
    const session = pickRef.current
    if (!session) return
    const shown = new Set(display.nodes.map((node) => node.id))
    if (!session.order.some((id) => shown.has(id))) {
      cancelPick()
      return
    }
    if (session.selected === null || shown.has(session.selected)) return
    writePick({ ...session, selected: null })
    safely(() => session.onSelect(null))
  }, [cancelPick, display.nodes, writePick])

  useLayoutEffect(() => {
    handlers.current = { zoomIn: zoomInView, zoomOut: zoomOutView, fitView: fitCanvas, save, load: openFile, loadWorkflow, execute, search, removeNode, reset, download, previewWorkflow, captureImage, getFlow, applyWorkflowEdit, startPick, selectPick, confirmPick, endPick, undo, redo }
  })

  const actions = useMemo<WorkflowActions>(() => ({
    zoomIn: () => handlers.current?.zoomIn(),
    zoomOut: () => handlers.current?.zoomOut(),
    fitView: () => handlers.current?.fitView(),
    save: () => handlers.current?.save() ?? false,
    load: () => handlers.current?.load(),
    loadWorkflow: (input) => handlers.current?.loadWorkflow(input) ?? false,
    execute: () => handlers.current?.execute() ?? false,
    search: (query) => handlers.current?.search(query) ?? false,
    removeNode: (id) => handlers.current?.removeNode(id),
    reset: () => handlers.current?.reset(),
    download: () => handlers.current?.download() ?? false,
    previewWorkflow: (flow, done, kind, fresh, focus) => handlers.current?.previewWorkflow(flow, done, kind, fresh, focus),
    captureImage: () => handlers.current?.captureImage() ?? Promise.resolve(null),
    getFlow: () => handlers.current?.getFlow() ?? newFlow(),
    applyWorkflowEdit: (flow) => handlers.current?.applyWorkflowEdit(flow) ?? false,
    startPick: (request) => handlers.current?.startPick(request) ?? [],
    selectPick: (id) => handlers.current?.selectPick(id),
    confirmPick: () => handlers.current?.confirmPick(),
    endPick: () => handlers.current?.endPick(),
  }), [])

  useEffect(() => {
    onActionsReady(actions)
  }, [actions, onActionsReady])

  useEffect(() => {
    const receive = (event: Event) => {
      const load = handlers.current?.loadWorkflow
      if (!load) return
      const detail = (event as CustomEvent).detail
      if (detail && typeof detail === "object" && "input" in detail) detail.accepted = load(detail.input)
      else load(detail)
    }
    window.addEventListener("workflow:import", receive)
    return () => window.removeEventListener("workflow:import", receive)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const current = handlers.current
      if (!current) return
      const key = event.key.toLowerCase()
      if (key === "s") {
        event.preventDefault()
        current.save()
        return
      }
      if (isTypingTarget(event.target)) return
      if (key === "z" && !event.shiftKey) {
        event.preventDefault()
        current.undo()
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault()
        current.redo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const releaseCanvasKeys = (event: FocusEvent) => {
      if (!isTextField(event.target)) return
      window.dispatchEvent(new Event("blur"))
      window.dispatchEvent(new Event("focus"))
    }
    document.addEventListener("focusin", releaseCanvasKeys)
    return () => document.removeEventListener("focusin", releaseCanvasKeys)
  }, [])

  useEffect(() => {
    const root = canvas.current
    return root ? translateCanvasAnnouncements(root) : undefined
  }, [])

  const placeComponent = useCallback((): XYPosition => {
    const anchor = findNode(panelId)
    const element = canvas.current
    const bounds = element?.getBoundingClientRect()
    const reserved = panelId ? 0 : Math.min(PANEL_WIDTH, window.innerWidth * 0.9)
    const right = (bounds ? bounds.right : 600) - reserved
    const center = toFlow({ x: ((bounds?.left ?? 0) + right) / 2, y: ((bounds?.top ?? 0) + (bounds?.bottom ?? 500)) / 2 })
    const preferred = anchor
      ? { x: anchor.position.x + COLUMN_STEP, y: anchor.position.y }
      : { x: center.x - DEFAULT_NODE_SIZE.width / 2, y: center.y - DEFAULT_NODE_SIZE.height / 2 }
    const overlays = Array.from(element?.querySelectorAll(OVERLAY_SELECTOR) ?? [], (overlay) => {
      const rect = overlay.getBoundingClientRect()
      const start = toFlow({ x: rect.left, y: rect.top })
      const end = toFlow({ x: rect.right, y: rect.bottom })
      return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
    })
    const obstacles = [...flowRef.current.nodes.map((node) => ({ ...node.position, ...(sizes[node.id] ?? DEFAULT_NODE_SIZE) })), ...overlays]
    const free = (point: XYPosition) => !obstacles.some((box) => overlaps({ ...point, ...DEFAULT_NODE_SIZE }, box, NODE_GAP))
    if (bounds) {
      const start = toFlow({ x: bounds.left + VIEW_MARGIN, y: bounds.top + VIEW_MARGIN })
      const end = toFlow({ x: right - VIEW_MARGIN, y: bounds.bottom - VIEW_MARGIN })
      const inside = (point: XYPosition) => point.x >= start.x && point.y >= start.y && point.x + DEFAULT_NODE_SIZE.width <= end.x && point.y + DEFAULT_NODE_SIZE.height <= end.y
      let best: { point: XYPosition; cost: number } | undefined
      for (let column = -SEARCH_COLUMNS; column <= SEARCH_COLUMNS; column++) {
        for (let row = -SEARCH_ROWS; row <= SEARCH_ROWS; row++) {
          const point = { x: preferred.x + column * COLUMN_STEP, y: preferred.y + row * ROW_STEP }
          if (!inside(point) || !free(point)) continue
          const cost = Math.abs(column) * COLUMN_STEP * (column < 0 ? 1.5 : 1) + Math.abs(row) * ROW_STEP * (row < 0 ? 1.5 : 1)
          if (!best || cost < best.cost) best = { point, cost }
        }
      }
      if (best) return best.point
    }
    let point = preferred
    for (let attempt = 0; attempt < 20 && !free(point); attempt++) point = { x: point.x, y: point.y + ROW_STEP }
    return point
  }, [findNode, panelId, sizes, toFlow])

  const revealNode = useCallback(function reveal(id: string) {
    const pending = pendingReveal.current
    if (!pending || pending.id !== id || Date.now() > pending.until) return
    const moving = viewTarget.current.until - performance.now()
    if (moving > 0 && !viewTarget.current.viewport) {
      window.clearTimeout(revealTimer.current)
      revealTimer.current = window.setTimeout(() => reveal(id), moving + 20)
      return
    }
    const element = canvas.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
    const area = store.getState().domNode?.getBoundingClientRect() ?? canvas.current?.getBoundingClientRect()
    const node = findNode(id)
    if (!area || !element || !node) return
    const { x, y, zoom } = settledView()
    const left = area.left + x + node.position.x * zoom
    const top = area.top + y + node.position.y * zoom
    const width = element.offsetWidth
    const height = element.offsetHeight
    if (left >= area.left && top >= area.top && left + width * zoom <= area.right && top + height * zoom <= area.bottom) return
    centerOn(node.position.x + width / 2, node.position.y + height / 2, zoom)
  }, [centerOn, findNode, settledView, store])

  const addComponent = useCallback((type: string, position?: XYPosition) => {
    if (canvasBusy()) return
    if (recovery) {
      toast({ title: "Edição pausada", description: "Importe um fluxo válido ou crie um novo fluxo para continuar.", variant: "destructive" })
      return
    }
    if (!ensureApplied()) return
    try {
      const node = newNode(type, position ?? placeComponent(), allocateId())
      commit((current) => ({ ...current, nodes: [...current.nodes, node] }))
      setPanelId(node.id)
      setSelectedNodes([node.id])
      setSelectedEdges([])
      setDrafts({})
      if (!position) {
        pendingReveal.current = { id: node.id, until: Date.now() + REVEAL_WINDOW }
        requestAnimationFrame(() => requestAnimationFrame(() => revealNode(node.id)))
      }
    } catch (cause) {
      toast({ title: "Componente indisponível", description: (cause as Error).message, variant: "destructive" })
    }
  }, [allocateId, commit, ensureApplied, placeComponent, canvasBusy, recovery, revealNode])

  const isValidConnection = useCallback((connection: Connection) => {
    const source = findNode(connection.source)
    const target = findNode(connection.target)
    return Boolean(source && target && source.id !== target.id && target.data.type !== START_TYPE && target.data.type !== NOTE_TYPE && source.data.type !== NOTE_TYPE && outputHandles(source, flowRef.current.edges).includes(connection.sourceHandle || ""))
  }, [findNode])

  const connect = useCallback((connection: Connection) => {
    const { source: sourceId, sourceHandle, target } = connection
    if (previewRef.current || pickRef.current || !sourceId || !target || !sourceHandle || !isValidConnection(connection)) return
    const source = findNode(sourceId)
    if (!source) return
    const current = flowRef.current
    const incoming = current.edges.find((edge) => edge.target === target && !(edge.source === sourceId && edge.sourceHandle === sourceHandle))
    if (incoming) {
      toast({ title: "Entrada já ocupada", description: "No formato de Atendimento cada componente recebe uma única conexão. Remova a conexão existente primeiro.", variant: "destructive" })
      return
    }
    const replaced = new Set(current.edges.filter((edge) => edge.source === sourceId && edge.sourceHandle === sourceHandle))
    if (replaced.size === 1 && [...replaced][0].target === target) return
    const edge = createEdge(current.edges.filter((entry) => !replaced.has(entry)), sourceId, sourceHandle, target)
    commit((document) => ({ ...document, edges: [...document.edges.filter((entry) => !replaced.has(entry)), edge] }))
    if (replaced.size) toast({ title: "Conexão substituída", description: `A saída “${outputLabel(source, sourceHandle)}” agora leva ao componente ${target}.` })
  }, [commit, findNode, isValidConnection])

  const handleNodeChanges = useCallback((changes: NodeChange[]) => {
    if (previewRef.current) {
      const measured = changes.flatMap((change) => (change.type === "dimensions" && change.dimensions ? [{ id: change.id, width: change.dimensions.width, height: change.dimensions.height }] : []))
      if (measured.length) setPreviewSizes((current) => {
        let next = current
        for (const { id, width, height } of measured) {
          if (current[id]?.width === width && current[id]?.height === height) continue
          if (next === current) next = { ...current }
          next[id] = { width, height }
        }
        return next
      })
      return
    }
    const removals: string[] = []
    const dimensions: Array<{ id: string } & Size> = []
    const selections = new Map<string, boolean>()
    const positions = new Map<string, XYPosition>()
    const editable = !pickRef.current
    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) dimensions.push({ id: change.id, width: change.dimensions.width, height: change.dimensions.height })
      else if (!editable) continue
      else if (change.type === "remove") removals.push(change.id)
      else if (change.type === "select") selections.set(change.id, change.selected)
      else if (change.type === "position" && change.position) positions.set(change.id, change.position)
    }
    if (removals.length) {
      if (ensureApplied()) removeNodes(removals)
      return
    }
    if (dimensions.length) setSizes((current) => {
      let next = current
      for (const { id, width, height } of dimensions) {
        if (current[id]?.width === width && current[id]?.height === height) continue
        if (next === current) next = { ...current }
        next[id] = { width, height }
      }
      return next
    })
    const pending = pendingReveal.current
    if (pending && dimensions.some((entry) => entry.id === pending.id)) {
      if (Date.now() > pending.until) pendingReveal.current = null
      else requestAnimationFrame(() => revealNode(pending.id))
    }
    if (selections.size) setSelectedNodes((current) => {
      const next = new Set(current)
      for (const [id, selected] of selections) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next.size === current.length && current.every((id) => next.has(id)) ? current : [...next]
    })
    if (positions.size) {
      const current = flowRef.current
      setDocument({ ...current, nodes: current.nodes.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, position: { x: position.x, y: position.y } } : node
      }) }, "silent")
    }
  }, [ensureApplied, removeNodes, revealNode, setDocument])

  const handleEdgeChanges = useCallback((changes: EdgeChange[]) => {
    if (previewRef.current || pickRef.current) return
    const selections = new Map<string, boolean>()
    const removals: string[] = []
    for (const change of changes) {
      if (change.type === "select") selections.set(change.id, change.selected)
      else if (change.type === "remove") removals.push(change.id)
    }
    if (selections.size) setSelectedEdges((current) => {
      const next = new Set(current)
      for (const [id, selected] of selections) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next.size === current.length && current.every((id) => next.has(id)) ? current : [...next]
    })
    if (removals.length) removeEdges(removals)
  }, [removeEdges])

  const startDrag = useCallback(() => {
    dragOrigin.current = flowRef.current
  }, [])

  const finishDrag = useCallback(() => {
    const origin = dragOrigin.current
    dragOrigin.current = null
    const current = flowRef.current
    if (!origin || origin === current) return
    const positions = new Map(current.nodes.map((node) => [node.id, node.position]))
    if (origin.nodes.some((node) => node.position !== positions.get(node.id))) {
      pushHistory(origin)
      lastCommit.current = null
    }
  }, [pushHistory])

  const openNode = useCallback((_: ReactMouseEvent, node: Node) => {
    if (previewRef.current || pickRef.current) return
    setFocusMark(null)
    if (node.id === panelId || !ensureApplied()) return
    setPanelId(node.id)
    setDrafts({})
  }, [ensureApplied, panelId])

  const closeOnPane = useCallback(() => {
    if (previewRef.current || pickRef.current) return
    setFocusMark(null)
    if (!ensureApplied()) return
    setPanelId(null)
    setDrafts({})
  }, [ensureApplied])

  const moveStart = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    releaseView()
    moveOrigin.current = viewport
  }, [releaseView])

  const moveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    const origin = moveOrigin.current
    moveOrigin.current = null
    if (previewRef.current) {
      if (origin && (origin.x !== viewport.x || origin.y !== viewport.y || origin.zoom !== viewport.zoom)) {
        previewFollow.current = false
        cancelFit()
      }
      return
    }
    if (ready) syncViewport()
  }, [cancelFit, ready, syncViewport])

  const dragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types)
    if (!types.includes("application/reactflow") && !types.includes("Files")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = types.includes("Files") ? "copy" : "move"
  }, [])

  const readFile = useCallback(async (file: File) => {
    try {
      loadWorkflow(await file.text())
    } catch (cause) {
      setImportError(`Não foi possível ler o arquivo: ${(cause as Error).message}`)
    }
  }, [loadWorkflow])

  const drop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (canvasBusy()) return
    const type = event.dataTransfer.getData("application/reactflow")
    if (type) {
      addComponent(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
      return
    }
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
      setImportError("Solte um arquivo .json no formato de Atendimento.")
      return
    }
    void readFile(file)
  }, [addComponent, canvasBusy, readFile, screenToFlowPosition])

  const importFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void readFile(file)
  }, [readFile])

  const updateData = useCallback((data: JsonObject) => {
    if (!panelId) return
    const before = findNode(panelId)?.data.data || {}
    const changed = [...new Set([...Object.keys(before), ...Object.keys(data)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(data[key])).sort().join(",")
    commit((current) => ({ ...current, nodes: current.nodes.map((node) => (node.id === panelId ? { ...node, data: { ...node.data, data } } : node)) }), `data:${panelId}:${changed}`)
  }, [commit, findNode, panelId])

  const trackDraft = useCallback((field: string, pending: boolean) => {
    setDrafts((current) => (current[field] === pending ? current : { ...current, [field]: pending }))
  }, [])

  const removeOption = useCallback((option: number) => {
    if (!panelId || !ensureApplied()) return
    commit((current) => removeMenuOption(current, panelId, option))
  }, [commit, ensureApplied, panelId])

  const removePanelOutput = useCallback((index: number, data: JsonObject) => {
    if (!panelId || !ensureApplied()) return
    commit((current) => removeOutput(current, panelId, index, data))
  }, [commit, ensureApplied, panelId])

  const insertPanelOutput = useCallback((index: number, data: JsonObject) => {
    if (!panelId) return
    commit((current) => insertOutput(current, panelId, index, data))
  }, [commit, panelId])

  const closePanel = useCallback(() => {
    if (!ensureApplied()) return
    setPanelId(null)
    setDrafts({})
  }, [ensureApplied])

  const removePanelNode = useCallback(() => {
    if (panelId) removeNode(panelId)
  }, [panelId, removeNode])

  const duplicate = useCallback(() => {
    const node = findNode(panelId)
    if (!node || !ensureApplied()) return
    const clone = duplicateNode(node, allocateId())
    commit((current) => ({ ...current, nodes: [...current.nodes, clone] }))
    setPanelId(clone.id)
    setSelectedNodes([clone.id])
    setSelectedEdges([])
  }, [allocateId, commit, ensureApplied, findNode, panelId])

  const renameFlow = useCallback((name: string) => commit((current) => ({ ...current, name }), "name"), [commit])
  const describeFlow = useCallback((description: string) => commit((current) => ({ ...current, description }), "description"), [commit])
  const setServiceType = useCallback((serviceType: string) => commit((current) => ({ ...current, service_type: serviceType }), "service_type"), [commit])

  const startNewFlow = useCallback(() => {
    if (canvasBusy() || !ensureApplied()) return
    setSettingsOpen(false)
    if (recovery) {
      reset()
      return
    }
    const stored = storeCurrent({ ...flowRef.current, viewport: getViewport() })
    if (stored === false) return
    reset()
    toast(stored
      ? { title: "Novo fluxo criado", description: `“${stored.flow.name.trim() || "Sem nome"}” ficou guardado em Meus fluxos.` }
      : { title: "Novo fluxo criado", description: "O fluxo anterior estava vazio e não foi guardado." })
  }, [ensureApplied, getViewport, canvasBusy, recovery, reset, storeCurrent])

  const requestClear = useCallback(() => {
    if (canvasBusy()) return
    if (recovery) {
      toast({ title: "Edição pausada", description: "Importe um fluxo válido ou crie um novo fluxo para continuar.", variant: "destructive" })
      return
    }
    if (!ensureApplied()) return
    if (isBlankFlow(flowRef.current)) {
      toast({ title: "O fluxo já está vazio", description: "Só o componente de início está no canvas." })
      return
    }
    setConfirmClear(true)
  }, [ensureApplied, canvasBusy, recovery])

  const confirmClearFlow = useCallback(() => {
    setConfirmClear(false)
    if (previewRef.current || pickRef.current || !ensureApplied()) return
    setDocument(clearedFlow(flowRef.current), "history")
    clearSelection()
    toast({ title: "Fluxo limpo", description: "Componentes e conexões removidos. Use Desfazer (Ctrl+Z) para recuperar." })
  }, [clearSelection, ensureApplied, setDocument])

  const openSaved = useCallback((id: string) => {
    if (canvasBusy() || !ensureApplied()) return
    let entries: SavedFlow[] = []
    try {
      entries = readLibrary(localStorage)
    } catch {}
    const entry = entries.find((item) => item.id === id)
    if (!entry) {
      setLibrary(entries)
      toast({ title: "Fluxo salvo não encontrado", description: "Ele pode ter sido excluído em outra aba.", variant: "destructive" })
      return
    }
    let restored: AtendimentoFlow
    try {
      restored = importFlow(entry.flow)
    } catch (cause) {
      toast({ title: "Não foi possível abrir o fluxo salvo", description: (cause as Error).message, variant: "destructive" })
      return
    }
    if (!recovery && storeCurrent({ ...flowRef.current, viewport: getViewport() }) === false) return
    backupStored()
    selectSaved(entry.id)
    setDocument(restored, "silent", { resetIds: true })
    resetHistory()
    setRecovery("")
    setSizes({})
    clearSelection()
    setLibraryOpen(false)
    void setViewport(restored.viewport)
    persist(restored)
    toast({ title: "Fluxo aberto", description: `“${restored.name.trim() || "Sem nome"}” com ${plural(restored.nodes.length, "componente", "componentes")}. O anterior ficou em Meus fluxos.` })
  }, [backupStored, clearSelection, ensureApplied, getViewport, persist, canvasBusy, recovery, resetHistory, selectSaved, setDocument, setViewport, storeCurrent])

  const duplicateSaved = useCallback((id: string) => {
    if (canvasBusy()) return
    try {
      const entries = readLibrary(localStorage)
      const entry = entries.find((item) => item.id === id)
      if (!entry) return
      const source = id === savedId.current ? { ...flowRef.current, viewport: getViewport() } : entry.flow
      const name = `Cópia de ${source.name.trim() || "Sem nome"}`
      const next = upsertSaved(entries, { id: newSavedId(), savedAt: new Date().toISOString(), flow: { ...source, name } })
      writeLibrary(localStorage, next)
      setLibrary(next)
      toast({ title: "Fluxo duplicado", description: `“${name}” está em Meus fluxos.` })
    } catch {
      toast({ title: "Não foi possível duplicar", description: "O armazenamento do navegador está cheio ou bloqueado. Exporte o JSON antes de continuar.", variant: "destructive" })
    }
  }, [getViewport, canvasBusy])

  const deleteSaved = useCallback((id: string) => {
    if (canvasBusy()) return
    try {
      const next = removeSaved(readLibrary(localStorage), id)
      writeLibrary(localStorage, next)
      setLibrary(next)
      if (savedId.current === id) selectSaved(null)
      toast({ title: "Fluxo salvo excluído" })
    } catch {
      toast({ title: "Não foi possível excluir", description: "O navegador bloqueou o armazenamento local.", variant: "destructive" })
    }
  }, [canvasBusy, selectSaved])

  const pickCandidates = pick?.candidates ?? null
  const pickAny = pick?.any === true

  const canvasNodes = useMemo<Node<AtendimentoData>[]>(() => {
    const lock = (id: string) => (pickCandidates ? (pickCandidates.has(id) ? PICK_CANDIDATE_NODE : PICK_DIMMED_NODE) : LOCKED_NODE)
    const label = (node: AtendimentoNode) => (pickCandidates?.has(node.id) ? undefined : `${getComponentLabel(node.data.type)}, ID ${node.id}`)
    if (preview) return preview.nodes.map((node) => ({
      id: node.id,
      type: "custom",
      position: node.position,
      data: node.data,
      ...previewSizes[node.id],
      ...lock(node.id),
      ariaLabel: label(node),
    }))
    const selected = new Set(selectedNodes)
    return flow.nodes.map((node) => ({
      id: node.id,
      type: "custom",
      position: node.position,
      data: node.data,
      ...sizes[node.id],
      ...(pickCandidates ? lock(node.id) : { selected: selected.has(node.id), deletable: node.data.type !== START_TYPE && node.deletable !== false }),
      ariaLabel: label(node),
    }))
  }, [flow.nodes, pickCandidates, preview, previewSizes, selectedNodes, sizes])

  const canvasEdges = useMemo<Edge[]>(() => {
    const selected = new Set(locked ? [] : selectedEdges)
    const lock = edgeLock(picking, pickAny, locked)
    return display.edges.map((edge) => {
      const source = displayById.get(edge.source)
      return {
        id: edge.id,
        type: "deletable",
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle ?? undefined,
        selected: selected.has(edge.id),
        ...lock,
        ariaLabel: `Conexão de ${source ? `${getComponentLabel(source.data.type)} ${source.id} (${outputLabel(source, edge.sourceHandle)})` : edge.source} para ${edge.target}`,
      }
    })
  }, [display.edges, displayById, locked, pickAny, picking, selectedEdges])

  const nodePick = useMemo<NodePick | null>(() => (pick ? { candidates: pick.candidates, selected: pick.selected, select: chooseCandidate, confirm: confirmCandidate, hint: pickHintId } : null), [chooseCandidate, confirmCandidate, pick, pickHintId])
  const minimapNodeClass = useMemo(() => (pickCandidates ? pickMinimapClass(pickCandidates) : minimapClass), [pickCandidates])
  const pickedNode = pick?.selected ? displayById.get(pick.selected) : undefined
  const pickedText = pickedNode ? pickSubject(pickedNode.id, pickedNode.data) : ""
  const pickSteps = pick ? pick.order.filter((id) => displayById.has(id)).length : 0

  const edgeActions = useMemo(() => ({ remove: (id: string) => removeEdges([id]) }), [removeEdges])
  const nodeActions = useMemo(() => ({
    remove: (id: string) => {
      const active = document.activeElement
      const owner = active instanceof HTMLElement ? active.closest(".react-flow__node")?.getAttribute("data-id") ?? active.closest("[data-node-toolbar]")?.getAttribute("data-node-toolbar") : undefined
      const fromNode = owner === id
      removeNode(id)
      if (fromNode) requestAnimationFrame(() => canvas.current?.focus({ preventScroll: true }))
    },
  }), [removeNode])
  const canUndo = past.current.length > 0
  const canRedo = future.current.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-flow-bg text-flow-fg">
      <input aria-label="Importar arquivo JSON" ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={importFile} />
      <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2", ui.panel)}>
        <ToolButton label="Componentes" title={showLibrary ? "Ocultar componentes" : "Mostrar componentes"} icon={showLibrary ? PanelLeftClose : PanelLeftOpen} pressed={showLibrary} disabled={picking} onClick={() => showComponents(!libraryShown.current)} />
        <span className={ui.divider} aria-hidden />
        <ToolButton label="Diminuir zoom" icon={ZoomOut} onClick={zoomOutView} />
        <ToolButton label="Aumentar zoom" icon={ZoomIn} onClick={zoomInView} />
        <ToolButton label="Ajustar à tela" icon={Maximize} onClick={fitCanvas} />
        <ToolButton label="Minimapa" title={showMinimap ? "Ocultar minimapa" : "Mostrar minimapa"} icon={MapIcon} pressed={showMinimap} onClick={() => setShowMinimap((visible) => !visible)} />
        <span className={ui.divider} aria-hidden />
        <ToolButton label="Desfazer" title="Desfazer (Ctrl+Z)" icon={Undo2} onClick={undo} disabled={!canUndo || locked} />
        <ToolButton label="Refazer" title="Refazer (Ctrl+Y)" icon={Redo2} onClick={redo} disabled={!canRedo || locked} />
        <span className={ui.divider} aria-hidden />
        <ToolButton label="Novo fluxo" title="Novo fluxo: guarda o atual em Meus fluxos e começa um em branco" icon={FilePlus2} onClick={startNewFlow} disabled={locked} />
        <span inert={locked} className={cn("inline-flex shrink-0", locked && "opacity-40")}>
          <SavedFlows open={libraryOpen && !locked} onOpenChange={(open) => setLibraryOpen(open && !previewRef.current && !pickRef.current)} entries={library} currentId={currentSavedId} onOpen={openSaved} onDuplicate={duplicateSaved} onDelete={deleteSaved} />
        </span>
        <button ref={clearTrigger} type="button" aria-label="Limpar fluxo" title="Limpar fluxo: remove todos os componentes e conexões" className={cn(ui.toolButton, "hover:border-flow-danger hover:text-flow-danger")} onClick={requestClear} disabled={Boolean(recovery) || locked}>
          <Eraser className="h-4 w-4" aria-hidden />
        </button>
        <span className={ui.divider} aria-hidden />
        <input
          aria-label="Nome do fluxo"
          value={flow.name}
          placeholder="Nome do fluxo"
          spellCheck={false}
          disabled={locked}
          className="h-8 min-w-[10rem] max-w-md flex-1 truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-flow-fg transition placeholder:text-flow-muted hover:border-flow-border focus-visible:border-flow-accent focus-visible:bg-flow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/25 disabled:pointer-events-none disabled:opacity-60"
          onChange={(event) => renameFlow(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIssues((open) => !open)}
            disabled={locked}
            aria-expanded={showIssues && !locked}
            aria-controls={showIssues && !locked ? issuesId : undefined}
            title={showIssues ? "Ocultar validação do fluxo" : errorCount ? "Ver pendências do fluxo" : "Ver validação do fluxo"}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40",
              errorCount
                ? "border-flow-warning/40 bg-flow-warning/10 text-flow-warning hover:bg-flow-warning/15 focus-visible:ring-flow-warning/30"
                : "border-flow-success/40 bg-flow-success/10 text-flow-success hover:bg-flow-success/15 focus-visible:ring-flow-success/30",
            )}
          >
            {errorCount ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            {errorCount ? plural(errorCount, "pendência", "pendências") : "Fluxo validado"}
          </button>
          <button type="button" className={ui.button} onClick={openFile} disabled={locked} title="Abrir um arquivo JSON de Atendimento">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Importar JSON
          </button>
          <button type="button" className={ui.button} onClick={download} disabled={locked} title="Baixar o fluxo no formato JSON de Atendimento">
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportar JSON
          </button>
          <button type="button" className={ui.button} onClick={save} disabled={locked} title="Salvar neste navegador (Ctrl+S)">
            <Save className="h-3.5 w-3.5" aria-hidden />
            Salvar
          </button>
          <button type="button" className={ui.primaryButton} onClick={execute} disabled={locked} title="Validar o fluxo e abrir a prévia do atendimento">
            <Play className="h-3.5 w-3.5" aria-hidden />
            Prévia
          </button>
          <FlowSettings
            open={settingsOpen && !locked}
            disabled={locked}
            onOpenChange={(open) => setSettingsOpen(open && !previewRef.current && !pickRef.current)}
            triggerRef={settingsTrigger}
            description={flow.description}
            serviceType={flow.service_type}
            onDescriptionChange={describeFlow}
            onServiceTypeChange={setServiceType}
            onCreateNew={startNewFlow}
          />
        </div>
      </div>
      {recovery && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-flow-warning/40 bg-flow-warning/10 px-4 py-2 text-xs text-flow-fg">
          <TriangleAlert className="h-4 w-4 shrink-0 text-flow-warning" aria-hidden />
          <p className="min-w-0 flex-1 leading-5">{recovery}</p>
          <button type="button" className={ui.button} onClick={openFile}>Importar JSON</button>
          <button type="button" className={ui.button} onClick={reset}>Criar novo fluxo</button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {showLibrary && <NodeLibrary onAdd={addComponent} />}
        <div ref={canvas} tabIndex={-1} className="flow-background relative min-w-0 flex-1 bg-flow-bg focus:outline-none">
          <InvalidNodesContext.Provider value={locked ? NO_INVALID_NODES : invalidNodes}>
            <AtendimentoEdgesContext.Provider value={display.edges}>
              <EdgeActionsContext.Provider value={locked ? NO_EDGE_ACTIONS : edgeActions}>
                <NodeActionsContext.Provider value={locked ? null : nodeActions}>
                  <NodePickContext.Provider value={nodePick}>
                    <NodeFocusContext.Provider value={focusMark}>
                      <ReactFlow
                        nodes={canvasNodes}
                        edges={canvasEdges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={handleNodeChanges}
                        onEdgesChange={handleEdgeChanges}
                        onNodeDragStart={startDrag}
                        onNodeDragStop={finishDrag}
                        onSelectionDragStart={startDrag}
                        onSelectionDragStop={finishDrag}
                        onNodeClick={openNode}
                        onPaneClick={closeOnPane}
                        isValidConnection={isValidConnection}
                        onConnect={connect}
                        onDragOver={dragOver}
                        onDrop={drop}
                        onMoveStart={moveStart}
                        onMoveEnd={moveEnd}
                        defaultViewport={flow.viewport}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        nodesDraggable={!locked}
                        nodesConnectable={!locked}
                        nodesFocusable={!locked}
                        edgesFocusable={!locked}
                        edgesUpdatable={!locked}
                        elementsSelectable={!locked}
                        deleteKeyCode={dirty || locked ? null : DELETE_KEYS}
                        multiSelectionKeyCode={MULTI_SELECTION_KEYS}
                        selectNodesOnDrag={false}
                        connectionLineStyle={CONNECTION_LINE_STYLE}
                        proOptions={PRO_OPTIONS}
                        className={CANVAS_CLASS}
                      >
                        <Background variant={BackgroundVariant.Dots} gap={18} size={1.6} color="rgb(var(--flow-border))" className="[&_circle]:fill-flow-border" />
                        {showMinimap && (
                          <MiniMap
                            pannable
                            zoomable
                            ariaLabel="Minimapa"
                            nodeColor={minimapColor}
                            nodeClassName={minimapNodeClass}
                            nodeBorderRadius={16}
                            className={MINIMAP_CLASS}
                          />
                        )}
                      </ReactFlow>
                    </NodeFocusContext.Provider>
                  </NodePickContext.Provider>
                </NodeActionsContext.Provider>
              </EdgeActionsContext.Provider>
            </AtendimentoEdgesContext.Provider>
          </InvalidNodesContext.Provider>
          {!showLibrary && !picking && (
            <button
              type="button"
              aria-label="Mostrar componentes"
              data-canvas-overlay=""
              onClick={() => showComponents(true)}
              className="absolute left-3 top-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-xl border border-flow-border bg-flow-surface px-3 text-xs font-semibold text-flow-muted-strong shadow-sm transition hover:border-flow-accent/60 hover:text-flow-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent/30"
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
              Componentes
            </button>
          )}
          {showIssues && !locked && <IssuesPanel id={issuesId} issues={issues} nodes={nodesById} onClose={() => setShowIssues(false)} onSelect={selectIssue} />}
          {preview && !pick && <PreviewBanner bannerRef={setBanner} nodes={preview.nodes.filter((node) => node.data.type !== START_TYPE).length} edges={preview.edges.length} done={previewDone} kind={previewKind} />}
          {pick && <PickBanner bannerRef={setBanner} hintId={pickHintId} label={pick.label} selection={pickedText} steps={pickSteps} any={pick.any} onStep={stepPick} onCancel={cancelPick} onConfirm={confirmPick} />}
          <CanvasStatus container={canvas} count={display.nodes.length} start={startNode?.position} />
        </div>
        {panelNode && (
          <div className={locked ? "hidden" : "contents"}>
            <ConfigPanel
              key={panelNode.id}
              node={panelNode}
              issues={panelIssues}
              updateData={updateData}
              onDraft={trackDraft}
              removeOption={removeOption}
              removeOutput={removePanelOutput}
              insertOutput={insertPanelOutput}
              onClose={closePanel}
              onRemove={removePanelNode}
              onDuplicate={duplicate}
            />
          </div>
        )}
      </div>
      <Dialog open={Boolean(importError)} onOpenChange={(open) => { if (!open) setImportError("") }}>
        <DialogContent className={cn(ui.dialog, "max-w-lg rounded-xl sm:rounded-xl")}>
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center justify-center gap-2.5 text-base font-semibold text-flow-fg sm:justify-start">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-danger/15 text-flow-danger">
                <TriangleAlert className="h-4 w-4" aria-hidden />
              </span>
              Não foi possível importar
            </DialogTitle>
            <DialogDescription className="text-sm text-flow-muted">O fluxo atual foi mantido. Importe um JSON no formato de Atendimento.</DialogDescription>
          </DialogHeader>
          <p role="alert" className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-flow-danger/40 bg-flow-danger/10 p-3 text-sm text-flow-danger">{importError}</p>
          <DialogFooter>
            <button type="button" className={ui.primaryButton} onClick={() => setImportError("")}>Entendi</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent
          className={cn(ui.dialog, "max-w-md rounded-xl sm:rounded-xl")}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            clearTrigger.current?.focus()
          }}
        >
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-base font-semibold text-flow-fg">Limpar fluxo</DialogTitle>
            <DialogDescription className="text-sm text-flow-muted">Todos os componentes e conexões serão removidos. O nome, a descrição e o início ficam. Para recuperar, use Desfazer.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" className={ui.button} onClick={() => setConfirmClear(false)}>Cancelar</button>
            <button type="button" className={cn(ui.primaryButton, "bg-flow-danger text-flow-surface focus-visible:ring-flow-danger/40")} onClick={confirmClearFlow}>Limpar fluxo</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  )
}
