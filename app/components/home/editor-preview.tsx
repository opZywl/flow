import type { CSSProperties } from "react"
import { Inter } from "next/font/google"
import { BotMessageSquare, Check, Clock, Download, ListOrdered, Play, Users, type LucideIcon } from "lucide-react"
import { START_TYPE, getCategory, getComponentColor, getComponentLabel, getIconName, outputTone } from "@/lib/atendimento/catalog"
import type { OutputTone } from "@/lib/atendimento/types"
import { cn } from "@/lib/utils"
import { ui } from "@/src/flow/ui"
import styles from "./home.module.css"

const inter = Inter({ subsets: ["latin"] })

interface Chip {
  text: string
  label?: string
  multiline?: boolean
}

interface SceneNode {
  id: string
  type: string
  x: number
  y: number
  titleLines?: number
  chips?: Chip[]
  outputs?: string[]
}

interface SceneEdge {
  from: string
  output: number
  to: string | [number, number]
}

interface Scene {
  width: number
  height: number
  nodes: SceneNode[]
  edges: SceneEdge[]
}

const CARD_WIDTH = 280
const ROW_HEIGHT = 29
const CHIP_HEIGHT = 24
const CHIP_GAP = 4
const CHIPS_OFFSET = 10
const TITLE_LINE = 17.5
const TEXT_BLOCK = 17.75
const ICON_BOX = 36
const BLOCK_PADDING = 24

const ICONS: Record<string, LucideIcon> = { BotMessageSquare, Clock, ListOrdered, Play, Users }
const TONES: Record<OutputTone, string> = { success: "bg-flow-success", danger: "bg-flow-danger", accent: "bg-flow-accent" }
const HANDLE = "absolute h-3 w-3 rounded-full border-2 border-flow-surface"
const SUCCESS_COLOR = "rgb(var(--flow-success))"
const EDGE_BASE: CSSProperties = { stroke: "rgb(var(--flow-accent) / 0.55)", strokeWidth: 2.25 }
const EDGE_DASH: CSSProperties = { stroke: "rgb(var(--flow-accent))", strokeWidth: 2, strokeLinecap: "round", opacity: 0.75 }
const STATUS_CHIP = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold"

const START: SceneNode = { id: "inicio", type: START_TYPE, x: 24, y: 58, outputs: ["Próximo"] }
const MENU: SceneNode = {
  id: "2",
  type: "envio_mensagem",
  x: 376,
  y: 68,
  chips: [{ text: "Olá. Como podemos ajudar?", multiline: true }],
  outputs: ["Suporte", "Financeiro", "Falar com atendente"],
}

const FULL_SCENE: Scene = {
  width: 1048,
  height: 524,
  nodes: [
    START,
    MENU,
    {
      id: "3",
      type: "aiAgentBlock",
      x: 728,
      y: 10,
      chips: [{ label: "Nome do agente", text: "Suporte" }],
      outputs: ["Resolvido", "Sem conclusão"],
    },
    {
      id: "4",
      type: "departamentos",
      x: 728,
      y: 176,
      titleLines: 2,
      chips: [
        { label: "Nome do departamento", text: "Financeiro" },
        { label: "ID do departamento", text: "dep-financeiro" },
      ],
    },
    {
      id: "5",
      type: "timeConditions",
      x: 728,
      y: 358,
      chips: [{ text: "Seg a Sex · 08:00 às 17:59" }],
      outputs: ["Fora do horário", "Dentro do horário"],
    },
  ],
  edges: [
    { from: "inicio", output: 0, to: "2" },
    { from: "2", output: 0, to: "3" },
    { from: "2", output: 1, to: "4" },
    { from: "2", output: 2, to: "5" },
    { from: "3", output: 0, to: [1112, 106] },
    { from: "3", output: 1, to: [1112, 166] },
    { from: "5", output: 0, to: [1112, 456] },
    { from: "5", output: 1, to: [1112, 510] },
  ],
}

const COMPACT_START: SceneNode = { ...START, x: 12, y: 16 }
const COMPACT_MENU: SceneNode = { ...MENU, x: 12, y: 148 }

const COMPACT_SCENE: Scene = {
  width: 310,
  height: 347,
  nodes: [COMPACT_START, COMPACT_MENU],
  edges: [],
}

const blockHeight = (node: SceneNode) => {
  const header = BLOCK_PADDING + Math.max(ICON_BOX, TEXT_BLOCK + TITLE_LINE * (node.titleLines ?? 1))
  const chips = node.chips ?? []
  return chips.length ? header + CHIPS_OFFSET + chips.length * CHIP_HEIGHT + (chips.length - 1) * CHIP_GAP : header
}

const sourcePoint = (node: SceneNode, output: number): [number, number] => [node.x + CARD_WIDTH + 5, node.y + 1 + blockHeight(node) + ROW_HEIGHT * output + 15]

const targetPoint = (node: SceneNode): [number, number] => [node.x - 4, node.y + 31]

const controlOffset = (distance: number) => (distance >= 0 ? 0.5 * distance : 6.25 * Math.sqrt(-distance))

function bezierPath([sx, sy]: [number, number], [tx, ty]: [number, number]) {
  const offset = controlOffset(tx - sx)
  return `M${sx},${sy} C${sx + offset},${sy} ${tx - offset},${ty} ${tx},${ty}`
}

function edgePaths(scene: Scene) {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]))
  return scene.edges.flatMap((edge) => {
    const source = byId.get(edge.from)
    const target = typeof edge.to === "string" ? byId.get(edge.to) : undefined
    if (!source) return []
    const end = Array.isArray(edge.to) ? edge.to : target ? targetPoint(target) : undefined
    return end ? [{ key: `${edge.from}-${edge.output}`, d: bezierPath(sourcePoint(source, edge.output), end) }] : []
  })
}

const COMPACT_LINK = (() => {
  const [sx, sy] = sourcePoint(COMPACT_START, 0)
  const [tx, ty] = targetPoint(COMPACT_MENU)
  const lane = COMPACT_MENU.y - 21
  return `M${sx},${sy} C${sx + 16},${sy} ${sx + 16},${lane} ${sx},${lane} L${tx + 16},${lane} C${tx - 14},${lane} ${tx - 14},${ty} ${tx},${ty}`
})()

function NodeCard({ node }: { node: SceneNode }) {
  const start = node.type === START_TYPE
  const color = start ? SUCCESS_COLOR : getComponentColor(node.type)
  const Icon = ICONS[getIconName(node.type) ?? ""] ?? Play
  const outputs = node.outputs ?? []

  return (
    <div className="absolute w-[280px] rounded-2xl border border-l-4 border-flow-border bg-flow-surface shadow-sm" style={{ left: node.x, top: node.y, borderLeftColor: color }}>
      {!start && <span className={cn(HANDLE, "-left-2 top-[30px] -translate-y-1/2 bg-flow-muted-strong")} />}
      <div className="py-3 pl-4 pr-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", start ? "bg-flow-success text-white" : "bg-flow-soft")}
            style={start ? undefined : { color: `color-mix(in srgb, ${color} 75%, rgb(var(--flow-fg)))` }}
          >
            <Icon className={cn("h-[18px] w-[18px]", start && "fill-current")} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="line-clamp-2 break-words text-sm font-semibold leading-tight text-flow-fg">{getComponentLabel(node.type)}</p>
            <p className={cn("mt-0.5 truncate text-[11px] leading-tight", start ? "text-flow-success" : "text-flow-muted")}>
              {start ? "Início do atendimento" : getCategory(node.type)?.label}
            </p>
          </div>
        </div>
        {node.chips?.length ? (
          <div className="mt-2.5 space-y-1">
            {node.chips.map((chip) => (
              <p key={chip.text} className={cn(ui.chip, chip.multiline ? "line-clamp-3 whitespace-pre-line break-words leading-4" : "truncate leading-4")}>
                {chip.label && <span className="text-flow-muted">{chip.label}: </span>}
                {chip.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      {outputs.map((label, index) => (
        <div key={label} className="relative border-t border-flow-border px-3 py-1.5 text-right text-xs text-flow-muted-strong">
          <span className="block truncate">{label}</span>
          <span className={cn(HANDLE, "-right-1.5 top-1/2 -translate-y-1/2", TONES[outputTone(node.type, index)])} />
        </div>
      ))}
      {!outputs.length && !start && <div className="border-t border-flow-border px-3 py-1.5 text-[11px] text-flow-muted">Fim deste caminho</div>}
    </div>
  )
}

function Edges({ scene, extra }: { scene: Scene; extra?: string }) {
  const paths = edgePaths(scene)
  const all = extra ? [...paths, { key: "compact", d: extra }] : paths

  return (
    <svg className="absolute inset-0 overflow-visible" width={scene.width} height={scene.height} fill="none">
      {all.map((path) => (
        <g key={path.key}>
          <path d={path.d} style={EDGE_BASE} />
          <path d={path.d} className="flow-edge-dash" style={EDGE_DASH} />
        </g>
      ))}
    </svg>
  )
}

function SceneView({ scene, extra, className }: { scene: Scene; extra?: string; className?: string }) {
  return (
    <div className={cn("relative", className)} style={{ width: scene.width, height: scene.height }}>
      <Edges scene={scene} extra={extra} />
      {scene.nodes.map((node) => (
        <NodeCard key={node.id} node={node} />
      ))}
    </div>
  )
}

const CANVAS = "relative overflow-hidden rounded-xl bg-[radial-gradient(rgb(var(--flow-border))_1px,transparent_1px)] bg-[length:18px_18px]"

export function EditorPreview() {
  return (
    <figure>
      <figcaption className="sr-only">
        Prévia do editor: o Iniciar Fluxo leva a um Menu de Opções com as saídas Suporte, Financeiro e Falar com atendente, ligadas a um Agente de IA com saídas, a Transferir para
        Departamento e a Condições de Tempo.
      </figcaption>
      <div aria-hidden className={cn(inter.className, "select-none")}>
        <div className={cn(CANVAS, styles.canvas, "max-sm:hidden")}>
          <div className={styles.viewport}>
            <SceneView scene={FULL_SCENE} className={styles.scene} />
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-flow-fg/15 bg-flow-bg/85 p-1 shadow-sm backdrop-blur-2xl backdrop-saturate-200">
            <span className={cn(STATUS_CHIP, "border-flow-success/40 bg-flow-success/10 text-flow-success")}>
              <Check className="h-3.5 w-3.5" />
              Fluxo validado
            </span>
            <span className={cn(STATUS_CHIP, "border-flow-border bg-flow-surface text-flow-muted-strong")}>
              <Download className="h-3.5 w-3.5" />
              Exportar JSON
            </span>
          </div>
        </div>
        <div className={cn(CANVAS, "py-1 sm:hidden")}>
          <SceneView scene={COMPACT_SCENE} extra={COMPACT_LINK} className="mx-auto" />
        </div>
      </div>
    </figure>
  )
}
