import { NOTE_TYPE, START_ID } from "../catalog"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode } from "../types"
import { RI_LIMITS } from "./contracts"
import { LAYOUT, layoutBox, notePosition } from "./layout"

export interface LayoutCell {
  id: string
  col: number
  row: number
}

export const ARRANGE_LIMIT = RI_LIMITS.nodes

interface Cell {
  col: number
  row: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const OUTPUT_HANDLE = /^output-(\d+)$/

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const isNote = (node: AtendimentoNode) => node.data.type === NOTE_TYPE
const handleIndex = (edge: AtendimentoEdge) => Number(OUTPUT_HANDLE.exec(edge.sourceHandle)?.[1] ?? Number.MAX_SAFE_INTEGER)
const byHandle = (a: AtendimentoEdge, b: AtendimentoEdge) => handleIndex(a) - handleIndex(b)
const numeric = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value)
const clampCell = (value: number) => Math.min(ARRANGE_LIMIT, Math.max(0, Math.round(value)))
const cellKey = (col: number, row: number) => `${col}:${row}`
const round = (value: number) => Math.round(value * 100) / 100
const rectOf = (node: AtendimentoNode): Rect => ({ ...node.position, ...layoutBox(node) })
const span = (start: number, size: number, other: number, otherSize: number) => Math.max(0, Math.min(start + size, other + otherSize) - Math.max(start, other))
const shared = (a: Rect, b: Rect) => span(a.x, a.width, b.x, b.width) * span(a.y, a.height, b.y, b.height)

function pathOrder(flow: AtendimentoFlow): string[] {
  const components = new Set(flow.nodes.filter((node) => !isNote(node)).map((node) => node.id))
  const outgoing = new Map<string, AtendimentoEdge[]>()
  for (const edge of flow.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  const order = new Set<string>(components.has(START_ID) ? [START_ID] : [])
  for (const id of order) for (const edge of [...(outgoing.get(id) ?? [])].sort(byHandle)) if (components.has(edge.target)) order.add(edge.target)
  for (const id of components) order.add(id)
  return [...order]
}

function listedCells(nodes: ReadonlyMap<string, AtendimentoNode>, cells: readonly LayoutCell[]): Map<string, Cell> {
  const listed = new Map<string, Cell>()
  for (const cell of Array.isArray(cells) ? cells : []) {
    if (!cell || typeof cell !== "object" || typeof cell.id !== "string" || !nodes.has(cell.id) || listed.has(cell.id)) continue
    if (!numeric(cell.col) || !numeric(cell.row)) continue
    listed.set(cell.id, { col: clampCell(cell.col), row: clampCell(cell.row) })
  }
  return listed
}

function placeCells(listed: ReadonlyMap<string, Cell>, order: readonly string[]): Map<string, Cell> {
  const placed = new Map<string, Cell>()
  const taken = new Set<string>()
  const crowded: Array<[string, Cell]> = []
  for (const [id, cell] of listed) {
    const key = cellKey(cell.col, cell.row)
    if (taken.has(key)) {
      crowded.push([id, cell])
      continue
    }
    taken.add(key)
    placed.set(id, cell)
  }
  for (const [id, cell] of crowded) {
    let col = cell.col + 1
    while (taken.has(cellKey(col, cell.row))) col++
    taken.add(cellKey(col, cell.row))
    placed.set(id, { col, row: cell.row })
  }
  const used = [...placed.values()]
  const lastRow = Math.max(...used.map((cell) => cell.row))
  const width = Math.max(...used.map((cell) => cell.col)) + 1
  let next = 0
  for (const id of order) {
    if (placed.has(id)) continue
    placed.set(id, { col: next % width, row: lastRow + 1 + Math.floor(next / width) })
    next++
  }
  return placed
}

function corner(nodes: readonly AtendimentoNode[]): { x: number; y: number } {
  const x = Math.min(...nodes.map((node) => node.position.x))
  const y = Math.min(...nodes.map((node) => node.position.y))
  return { x: Number.isFinite(x) ? x : LAYOUT.origin, y: Number.isFinite(y) ? y : LAYOUT.origin }
}

function clearNotes(nodes: readonly AtendimentoNode[], placed: ReadonlyMap<string, Cell>): string[] {
  const grid = nodes.filter((node) => placed.has(node.id)).map((node) => ({ node, box: rectOf(node) }))
  const covered = new Map<AtendimentoNode, AtendimentoNode>()
  for (const note of nodes) {
    if (!isNote(note) || placed.has(note.id)) continue
    const box = rectOf(note)
    let most = 0
    for (const entry of grid) {
      const area = shared(box, entry.box)
      if (area <= most) continue
      most = area
      covered.set(note, entry.node)
    }
  }
  const kept = nodes.filter((node) => !covered.has(node))
  for (const [note, anchor] of covered) {
    note.position = { ...note.position, ...notePosition(note, anchor, kept) }
    kept.push(note)
  }
  return [...covered.keys()].map((note) => note.id)
}

export function arrangeFlow(flow: AtendimentoFlow, cells: readonly LayoutCell[]): { flow: AtendimentoFlow; moved: string[] } {
  const result = copy(flow)
  const nodes = new Map(result.nodes.map((node) => [node.id, node]))
  const listed = listedCells(nodes, cells)
  if (!listed.size) return { flow: result, moved: [] }
  const placed = placeCells(listed, pathOrder(result))
  const grid = [...placed.keys()].flatMap((id) => {
    const node = nodes.get(id)
    return node ? [node] : []
  })
  const components = result.nodes.filter((node) => !isNote(node))
  const origin = corner(components.length ? components : grid)
  const boxes = grid.map(layoutBox)
  const column = Math.max(...boxes.map((box) => box.width)) + LAYOUT.columnGap
  const line = Math.max(...boxes.map((box) => box.height)) + LAYOUT.rowGap
  const moved: string[] = []
  for (const node of result.nodes) {
    const cell = placed.get(node.id)
    if (!cell) continue
    const x = origin.x + round(cell.col * column)
    const y = origin.y + round(cell.row * line)
    if (node.position.x === x && node.position.y === y) continue
    node.position = { ...node.position, x, y }
    moved.push(node.id)
  }
  return { flow: result, moved: [...moved, ...clearNotes(result.nodes, placed)] }
}
