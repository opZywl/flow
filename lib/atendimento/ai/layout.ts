import { NOTE_TYPE, START_ID, defaultMeasured } from "../catalog"
import { outputHandles } from "../format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, Measured } from "../types"

export const LAYOUT = {
  origin: 120,
  columnGap: 140,
  rowGap: 80,
  cardWidth: 280,
  noteWidth: 240,
  cardBase: 166,
  outputRow: 29,
  noteHeight: 150,
  margin: 60,
  viewWidth: 1200,
  viewHeight: 680,
  minZoom: 0.3,
  maxZoom: 1,
} as const

const OUTPUT_HANDLE = /^output-(\d+)$/

const handleIndex = (edge: AtendimentoEdge) => Number(OUTPUT_HANDLE.exec(edge.sourceHandle)?.[1] ?? Number.MAX_SAFE_INTEGER)
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

export function layoutBox(node: AtendimentoNode): Measured {
  const measured = node.measured ?? defaultMeasured(node.data.type)
  if (node.data.type === NOTE_TYPE) return { width: Math.max(measured.width, LAYOUT.noteWidth), height: Math.max(measured.height, LAYOUT.noteHeight) }
  const rows = Math.max(1, outputHandles(node).length)
  return { width: Math.max(measured.width, LAYOUT.cardWidth), height: Math.max(measured.height, LAYOUT.cardBase + rows * LAYOUT.outputRow) }
}

export function layoutFlow(flow: AtendimentoFlow): void {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const boxes = new Map(flow.nodes.map((node) => [node.id, layoutBox(node)]))
  const outgoing = new Map<string, AtendimentoEdge[]>()
  for (const edge of flow.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  for (const edges of outgoing.values()) edges.sort((a, b) => handleIndex(a) - handleIndex(b))

  const depth = new Map<string, number>()
  const parent = new Map<string, string>()
  const order: string[] = []
  if (nodes.has(START_ID)) {
    depth.set(START_ID, 0)
    order.push(START_ID)
  }
  for (let index = 0; index < order.length; index++) {
    const id = order[index]
    for (const edge of outgoing.get(id) ?? []) {
      const target = nodes.get(edge.target)
      if (!target || target.data.type === NOTE_TYPE || depth.has(target.id)) continue
      depth.set(target.id, (depth.get(id) ?? 0) + 1)
      parent.set(target.id, id)
      order.push(target.id)
    }
  }
  const deepest = order.reduce((max, id) => Math.max(max, depth.get(id) ?? 0), -1)
  for (const node of flow.nodes) {
    if (depth.has(node.id) || node.data.type === NOTE_TYPE) continue
    depth.set(node.id, deepest + 1)
    order.push(node.id)
  }

  const widths: number[] = []
  for (const id of order) {
    const column = depth.get(id) ?? 0
    widths[column] = Math.max(widths[column] ?? 0, boxes.get(id)?.width ?? LAYOUT.cardWidth)
  }
  const columnX: number[] = []
  let x: number = LAYOUT.origin
  for (let column = 0; column < widths.length; column++) {
    columnX[column] = x
    x += (widths[column] ?? 0) + LAYOUT.columnGap
  }

  const nextY = new Map<number, number>()
  let bottom: number = LAYOUT.origin
  for (const id of order) {
    const node = nodes.get(id)
    const box = boxes.get(id)
    if (!node || !box) continue
    const column = depth.get(id) ?? 0
    const above = parent.get(id)
    const parentY = above ? nodes.get(above)?.position.y ?? LAYOUT.origin : LAYOUT.origin
    const y = Math.max(nextY.get(column) ?? LAYOUT.origin, parentY)
    node.position = { x: columnX[column] ?? LAYOUT.origin, y }
    nextY.set(column, y + box.height + LAYOUT.rowGap)
    bottom = Math.max(bottom, y + box.height)
  }

  let noteY: number = order.length ? bottom + LAYOUT.rowGap : LAYOUT.origin
  for (const node of flow.nodes) {
    if (node.data.type !== NOTE_TYPE) continue
    node.position = { x: LAYOUT.origin, y: noteY }
    noteY += (boxes.get(node.id)?.height ?? LAYOUT.noteHeight) + LAYOUT.rowGap
  }
  flow.viewport = viewportFor(flow)
}

export function viewportFor(flow: AtendimentoFlow): AtendimentoFlow["viewport"] {
  if (!flow.nodes.length) return { x: 0, y: 0, zoom: 1 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const node of flow.nodes) {
    const box = layoutBox(node)
    left = Math.min(left, node.position.x)
    top = Math.min(top, node.position.y)
    right = Math.max(right, node.position.x + box.width)
    bottom = Math.max(bottom, node.position.y + box.height)
  }
  const fit = Math.min(LAYOUT.viewWidth / (right - left + 240), LAYOUT.viewHeight / (bottom - top + 240))
  const zoom = round(Math.min(LAYOUT.maxZoom, Math.max(LAYOUT.minZoom, fit)), 3)
  return { x: round(LAYOUT.margin - left * zoom), y: round(LAYOUT.margin - top * zoom), zoom }
}
