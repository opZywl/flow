import { NOTE_TYPE, START_TYPE } from "../catalog"
import type { AtendimentoFlow } from "../types"
import { assembleFlow } from "./assemble"
import { applyEdit } from "./edit"
import { canonicalType, coerceRi } from "./ri"
import type { RiNode } from "./ri"

const PREVIEW_DATE = new Date()

function usable(node: RiNode): boolean {
  return node.id.trim() !== "" && canonicalType(node.type) !== undefined
}

export function previewFlow(ri: unknown): AtendimentoFlow | null {
  const flow = coerceRi(ri)
  if (!flow) return null
  const nodes = flow.nodes.filter(usable)
  if (!nodes.some((node) => {
    const type = canonicalType(node.type)
    return type !== START_TYPE && type !== NOTE_TYPE
  })) return null
  const ids = new Set(nodes.map((node) => node.id.trim()))
  const edges = flow.edges.filter((edge) => edge.from.trim() !== "" && ids.has(edge.to.trim()))
  try {
    return assembleFlow({ ...flow, nodes, edges }, { now: PREVIEW_DATE }).flow
  } catch {
    return null
  }
}

export function previewEdit(base: AtendimentoFlow, partialDelta: unknown): AtendimentoFlow | null {
  const delta = coerceRi(partialDelta)
  if (!delta) return null
  const nodes = delta.nodes.filter(usable)
  const edges = delta.edges.filter((edge) => edge.from.trim() !== "" && edge.to.trim() !== "")
  if (!nodes.length && !edges.length && !delta.name.trim() && !delta.description.trim()) return null
  try {
    return applyEdit(base, { ...delta, nodes, edges }, { now: PREVIEW_DATE, prune: false }).flow
  } catch {
    return null
  }
}
