import { START_ID, START_TYPE } from "./catalog"
import { newNode } from "./format"
import type { AtendimentoFlow } from "./types"

export interface SavedFlow {
  id: string
  savedAt: string
  flow: AtendimentoFlow
}

type Reader = Pick<Storage, "getItem">
type Writer = Pick<Storage, "setItem" | "removeItem">

export const LIBRARY_KEY = "workflow-library"
export const CURRENT_KEY = "workflow-library-current"

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const isSavedFlow = (value: unknown): value is SavedFlow =>
  isObject(value) && typeof value.id === "string" && Boolean(value.id) && typeof value.savedAt === "string" && isObject(value.flow) && Array.isArray(value.flow.nodes) && Array.isArray(value.flow.edges)

export function readLibrary(storage: Reader): SavedFlow[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(LIBRARY_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.filter(isSavedFlow) : []
  } catch {
    return []
  }
}

export function writeLibrary(storage: Writer, entries: SavedFlow[]) {
  if (entries.length) storage.setItem(LIBRARY_KEY, JSON.stringify(entries))
  else storage.removeItem(LIBRARY_KEY)
}

export function readCurrentId(storage: Reader): string | null {
  try {
    return storage.getItem(CURRENT_KEY) || null
  } catch {
    return null
  }
}

export function writeCurrentId(storage: Writer, id: string | null) {
  if (id) storage.setItem(CURRENT_KEY, id)
  else storage.removeItem(CURRENT_KEY)
}

export function isBlankFlow(flow: AtendimentoFlow) {
  return flow.edges.length === 0 && flow.nodes.every((node) => node.data.type === START_TYPE)
}

export function newSavedId(now = Date.now()) {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function upsertSaved(entries: SavedFlow[], entry: SavedFlow): SavedFlow[] {
  return [entry, ...entries.filter((item) => item.id !== entry.id)]
}

export function removeSaved(entries: SavedFlow[], id: string): SavedFlow[] {
  return entries.filter((item) => item.id !== id)
}

export function clearedFlow(flow: AtendimentoFlow): AtendimentoFlow {
  const starts = flow.nodes.filter((node) => node.data.type === START_TYPE)
  return { ...flow, nodes: starts.length ? starts : [newNode(START_TYPE, { x: 120, y: 120 }, START_ID)], edges: [] }
}

const contentKey = (flow: AtendimentoFlow) => JSON.stringify({ ...flow, viewport: null, created_at: null })

export function findSameSaved(entries: SavedFlow[], flow: AtendimentoFlow): SavedFlow | undefined {
  const key = contentKey(flow)
  return entries.find((entry) => contentKey(entry.flow) === key)
}
