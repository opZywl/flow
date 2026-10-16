import type { AtendimentoFlow } from "@/lib/atendimento/types"

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface View {
  x: number
  y: number
  zoom: number
}

export interface Corner {
  x: number
  y: number
}

export interface ZoomLimits {
  minZoom: number
  maxZoom: number
  padding: number
}

export interface Frame {
  view: View
  bounds: Box
  count: number
}

type Graph = Pick<AtendimentoFlow, "nodes" | "edges">

export const PICK_MIN_WIDTH = 360
export const PICK_MIN_HEIGHT = 300

const SEPARATOR = "\u0000"

const centerOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

const sorted = (value: unknown): unknown =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0)))
    : value

const signature = (node: Graph["nodes"][number]) =>
  JSON.stringify([node.type, node.position?.x, node.position?.y, node.data?.type, node.data?.data], (_, item: unknown) => sorted(item))

const edgeKey = (edge: Graph["edges"][number]) => [edge.source, edge.sourceHandle ?? "", edge.target].join(SEPARATOR)

export const roomForPick = (width: number, height: number) => width >= PICK_MIN_WIDTH && height >= PICK_MIN_HEIGHT

export const zoomScale = (zoom: number) => (zoom > 0 && zoom < 1 ? 1 / zoom : 1)

export function unite(first: Box, second: Box): Box {
  const x = Math.min(first.x, second.x)
  const y = Math.min(first.y, second.y)
  return { x, y, width: Math.max(first.x + first.width, second.x + second.width) - x, height: Math.max(first.y + first.height, second.y + second.height) - y }
}

export function fitBox(bounds: Box, area: Box, limits: ZoomLimits): View {
  const width = Math.max(1, area.width)
  const height = Math.max(1, area.height)
  const spread = 1 + limits.padding
  const wanted = Math.min(width / (Math.max(1, bounds.width) * spread), height / (Math.max(1, bounds.height) * spread))
  return centerView(bounds, { ...area, width, height }, Math.min(limits.maxZoom, Math.max(limits.minZoom, wanted)))
}

export function centerView(box: Box, area: Box, zoom: number): View {
  const center = centerOf(box)
  return { x: area.x + area.width / 2 - center.x * zoom, y: area.y + area.height / 2 - center.y * zoom, zoom }
}

export function frameAround(anchor: Box, others: readonly Box[], area: Box, limits: ZoomLimits, floor: number): Frame {
  const origin = centerOf(anchor)
  const distance = (box: Box) => {
    const center = centerOf(box)
    return Math.hypot(center.x - origin.x, center.y - origin.y)
  }
  let bounds = anchor
  let count = 1
  for (const box of [...others].sort((first, second) => distance(first) - distance(second))) {
    const grown = unite(bounds, box)
    if (fitBox(grown, area, limits).zoom < floor) continue
    bounds = grown
    count += 1
  }
  const fitted = fitBox(bounds, area, limits)
  if (count > others.length || fitted.zoom <= floor) return { view: fitted, bounds, count }
  return { view: centerView(bounds, area, Math.min(limits.maxZoom, Math.max(limits.minZoom, floor))), bounds, count }
}

export function betterFrame(first: Frame, second: Frame): Frame {
  if (first.count !== second.count) return first.count > second.count ? first : second
  return first.view.zoom >= second.view.zoom ? first : second
}

export function screenBox(box: Box, view: View): Box {
  return { x: box.x * view.zoom + view.x, y: box.y * view.zoom + view.y, width: box.width * view.zoom, height: box.height * view.zoom }
}

export function overlapsCorner(box: Box, view: View, corner: Corner | null): boolean {
  if (!corner) return false
  const shown = screenBox(box, view)
  return shown.x + shown.width > corner.x && shown.y + shown.height > corner.y
}

export function shownIn(box: Box, view: View, area: Box, margin: number, corner: Corner | null = null): boolean {
  if (overlapsCorner(box, view, corner)) return false
  const shown = screenBox(box, view)
  return shown.x >= area.x + margin && shown.y >= area.y && shown.x + shown.width <= area.x + area.width - margin && shown.y + shown.height <= area.y + area.height - margin
}

export function previewFocusOf(focus: string | null | undefined, kept: string | null, nodes: Graph["nodes"]): string | null {
  const wanted = focus === undefined ? kept : focus
  return typeof wanted === "string" && nodes.some((node) => node.id === wanted) ? wanted : null
}

export function stepCandidate(order: readonly string[], shown: ReadonlySet<string>, current: string | null, step: number): string | null {
  const visible = order.filter((id) => shown.has(id))
  if (!visible.length) return null
  const index = current === null ? -1 : visible.indexOf(current)
  if (index < 0) return step < 0 ? visible[visible.length - 1] : visible[0]
  return visible[(((index + step) % visible.length) + visible.length) % visible.length]
}

export function editedIds(before: Graph, after: Graph): Set<string> {
  const previous = new Map(before.nodes.map((node) => [node.id, node]))
  const present = new Set(after.nodes.map((node) => node.id))
  const edited = new Set<string>()
  for (const node of after.nodes) {
    const old = previous.get(node.id)
    if (old !== node && (!old || signature(old) !== signature(node))) edited.add(node.id)
  }
  const oldEdges = new Set(before.edges.map(edgeKey))
  const newEdges = new Set(after.edges.map(edgeKey))
  const touch = (edge: Graph["edges"][number]) => {
    for (const id of [edge.source, edge.target]) if (present.has(id)) edited.add(id)
  }
  for (const edge of after.edges) if (!oldEdges.has(edgeKey(edge))) touch(edge)
  for (const edge of before.edges) if (!newEdges.has(edgeKey(edge))) touch(edge)
  return edited
}
