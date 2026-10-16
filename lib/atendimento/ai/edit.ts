import { MENU_TYPE, NOTE_TYPE, START_ID, START_TYPE, defaultMeasured, getDefinition, getNodeType, getTemplate, mirrorKeys } from "../catalog"
import { conditionIndices, createEdge, isObject, maxNumericId, newNode, optionIndices, outputHandles, outputLabel, validateFlow } from "../format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, FieldSpec, JsonObject, JsonValue } from "../types"
import { askBeforeWaits, provisionalLabels, provisionalMessage, provisionalReferences, requestText, unaskedWaits } from "./assemble"
import type { AssemblyNote } from "./assemble"
import { LIMITS, RI_LIMITS } from "./contracts"
import type { GenerationIssue } from "./contracts"
import { guideOf } from "./guide"
import { LAYOUT, layoutBox, notePosition } from "./layout"
import { FILL_CORRECTION, systemPrompt } from "./prompt"
import type { PromptOptions } from "./prompt"
import { capLists, compareScores, correctionItems, planNotes, reviewFlow, scoreOf } from "./review"
import type { Score } from "./review"
import { canonicalType, coerceDelta } from "./ri"
import type { RiConfigEntry, RiDelta, RiEdge, RiFlow, RiNode } from "./ri"
import { compactKey, foldText, listQuoted, quote, shorten } from "./text"
import { acceptedKeys, configureNode as configureValues, fixedKeys, settleData } from "./values"
import type { ConfigContext, ValueNote } from "./values"

export interface EditChanges {
  added: number
  changed: number
  removed: number
}

export interface EditDetached {
  nodes: Array<{ index: number; node: AtendimentoNode }>
  edges: AtendimentoEdge[]
  removed?: string[]
}

export interface EditOptions {
  now?: Date
  ids?: ReadonlyMap<string, string>
  detached?: EditDetached
  prune?: boolean
}

export interface EditResult {
  flow: AtendimentoFlow
  notes: AssemblyNote[]
  changes: EditChanges
  ids: Map<string, string>
  detached: EditDetached
}

export interface EditDiff {
  added: string[]
  changed: string[]
  removed: string[]
}

export interface EditReview {
  issues: GenerationIssue[]
  pending: string[]
  score: Score
  changes: EditChanges
  unchanged: boolean
}

export interface EditSnapshot {
  changes: RiFlow
  removed: string[]
  unreached?: string[]
}

export interface EditFillOptions {
  fill?: boolean
  prompt?: string
}

const RETURN_TYPE = "voltar"
const FINISH_TYPE = "finalizar"
const MESSAGE_TYPE = "envio_pergunta"
const PROTOCOL_TYPE = "protocolo"
const MENU_PLACEHOLDER = "Escolha uma opção."
const MESSAGE_PLACEHOLDER = "Mensagem a definir."
const START_ALIASES = new Set(["inicio", "start", "iniciarfluxo", "triggermessage", "trigger"])
const NAMED_OUTPUT = /^(?:opcao|opção|saida|saída|caminho|condicao|condição|opt|output|option|path|exit)[\s_-]*(\d+)$/
const DIRECT_OUTPUT = /^output-(\d+)$/i
const OUTPUT_HANDLE = /^output-(\d+)$/
const INDEXED: Partial<Record<FieldSpec["kind"], RegExp>> = {
  menuOptions: /^(opt|text|description)-(\d+)$/i,
  conditionPairs: /^(var|value)-(\d+)$/i,
}
const UNCHECKED_KINDS = new Set<FieldSpec["kind"]>(["menuOptions", "conditionPairs", "menuNode"])
const GAP = 24
const NO_CHANGE = "[fluxo] A resposta não trouxe nenhuma mudança. Aplique o pedido ao fluxo atual: componentes novos ou alterados em nodes, as saídas que mudam em edges e os ids dos componentes que saem do fluxo em remove."
const CONNECT_OUTPUT = "Conecte a saída "
const EMPTY_DETACHED: EditDetached = { nodes: [], edges: [] }

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const labelKey = (value: string) => foldText(value).replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "").trim()
const handleIndex = (handle: string) => Number(OUTPUT_HANDLE.exec(handle)?.[1] ?? Number.MAX_SAFE_INTEGER)
const byHandle = (a: { sourceHandle: string }, b: { sourceHandle: string }) => handleIndex(a.sourceHandle) - handleIndex(b.sourceHandle)
const edgeKey = (source: string, handle: string, target: string) => `${source}\u0000${handle}\u0000${target}`
const isStart = (node: AtendimentoNode) => node.id === START_ID || node.data.type === START_TYPE
const configureNode = (type: string, config: readonly RiConfigEntry[], context: ConfigContext) => configureValues(type, config, { ...context, edit: true })

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (isObject(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}

const same = (first: unknown, second: unknown) => canonical(first) === canonical(second)

function reachFrom(edges: readonly AtendimentoEdge[], roots: Iterable<string>, skip?: string): Set<string> {
  const outgoing = new Map<string, AtendimentoEdge[]>()
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  const seen = new Set<string>(roots)
  for (const id of seen) {
    if (id === skip) continue
    for (const edge of outgoing.get(id) ?? []) if (edge.target !== skip) seen.add(edge.target)
  }
  return seen
}

function walkOrder(flow: AtendimentoFlow): string[] {
  const outgoing = new Map<string, AtendimentoEdge[]>()
  for (const edge of flow.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  const ids = new Set(flow.nodes.map((node) => node.id))
  const order = new Set<string>(ids.has(START_ID) ? [START_ID] : [])
  for (const id of order) for (const edge of [...(outgoing.get(id) ?? [])].sort(byHandle)) if (ids.has(edge.target)) order.add(edge.target)
  for (const node of flow.nodes) order.add(node.id)
  return [...order]
}

function namer(ids?: ReadonlyMap<string, string>): (id: string) => string {
  const names = new Map<string, string>()
  for (const [name, id] of ids ?? []) if (!names.has(id)) names.set(id, name)
  return (id) => (id === START_ID ? START_ID : names.get(id) ?? id)
}

function plain(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return value.trim() ? value : undefined
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : undefined
  return Object.keys(value).length ? JSON.stringify(value) : undefined
}

const text = (value: JsonValue | undefined) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value))

function fieldText(field: FieldSpec, data: JsonObject, name: (id: string) => string): string | undefined {
  if (field.kind === "menuOptions") {
    const items = optionIndices(data).map((index) => {
      const description = text(data[`description-${index}`]).trim()
      return description ? { text: text(data[`text-${index}`]), description } : { text: text(data[`text-${index}`]) }
    })
    return items.length ? JSON.stringify(items) : undefined
  }
  if (field.kind === "conditionPairs") {
    const items = conditionIndices(data).map((index) => ({ var: text(data[`var-${index}`]), value: text(data[`value-${index}`]) }))
    return items.length ? JSON.stringify(items) : undefined
  }
  if (field.kind === "menuNode") {
    const target = data[field.key]
    return typeof target === "string" && target.trim() ? name(target.trim()) : undefined
  }
  if (field.kind === "timeRules") {
    const list = data[field.key]
    const rules = Array.isArray(list) ? list.filter((rule): rule is JsonObject => isObject(rule)).map((rule) => ({ weekDays: rule.weekDays, startTime: rule.startTime, endTime: rule.endTime })) : []
    return rules.length ? JSON.stringify(rules) : undefined
  }
  return plain(data[field.key])
}

function isDefault(type: string, key: string, value: JsonValue | undefined): boolean {
  const definition = getDefinition(type)
  if (!definition?.defaults) return false
  const defaults = definition.defaults()
  const configured = definition.configured?.()
  return (has(defaults, key) && same(defaults[key], value)) || (configured !== undefined && has(configured, key) && same(configured[key], value))
}

function nodeToRi(node: AtendimentoNode, name: (id: string) => string): RiNode {
  const type = node.data.type
  const definition = getDefinition(type)
  const data = isObject(node.data.data) ? node.data.data : {}
  const fixed = new Set(fixedKeys(type))
  const config: RiConfigEntry[] = []
  for (const field of definition?.fields ?? []) {
    if (fixed.has(field.key)) continue
    const value = fieldText(field, data, name)
    if (value === undefined) continue
    if (!INDEXED[field.kind] && field.kind !== "menuNode" && field.kind !== "timeRules" && isDefault(type, field.key, data[field.key])) continue
    config.push({ key: field.key, value })
  }
  return { id: name(node.id), type, config }
}

function outputName(node: AtendimentoNode, handle: string, handles: readonly string[]): string {
  if (isStart(node) || handles.length <= 1) return ""
  const index = handles.indexOf(handle)
  if (index < 0) return handle
  const label = outputLabel(node, handle)
  const key = labelKey(label)
  const repeated = handles.filter((entry) => labelKey(outputLabel(node, entry)) === key).length > 1
  return repeated || !key ? String(index + 1) : label
}

function edgesToRi(flow: AtendimentoFlow, sources: Iterable<string>, name: (id: string) => string): RiEdge[] {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const edges: RiEdge[] = []
  for (const source of sources) {
    const node = nodes.get(source)
    if (!node || node.data.type === NOTE_TYPE) continue
    const handles = outputHandles(node, flow.edges)
    for (const edge of flow.edges.filter((entry) => entry.source === source).sort(byHandle)) {
      const target = nodes.get(edge.target)
      if (!target || target.data.type === NOTE_TYPE) continue
      edges.push({ from: name(source), output: outputName(node, edge.sourceHandle, handles), to: name(edge.target) })
    }
  }
  return edges
}

export function flowToRi(flow: AtendimentoFlow, ids?: ReadonlyMap<string, string>): RiFlow {
  const name = namer(ids)
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const order = walkOrder(flow)
  return {
    name: flow.name,
    description: flow.description,
    nodes: order.flatMap((id) => {
      const node = nodes.get(id)
      return node && !isStart(node) ? [nodeToRi(node, name)] : []
    }),
    edges: edgesToRi(flow, order, name),
  }
}

export function diffFlows(before: AtendimentoFlow, after: AtendimentoFlow): EditDiff {
  const previous = new Map(before.nodes.map((node) => [node.id, node]))
  const current = new Set(after.nodes.map((node) => node.id))
  const outputs = (flow: AtendimentoFlow, id: string) => flow.edges.filter((edge) => edge.source === id).map((edge) => `${edge.sourceHandle}>${edge.target}`).sort().join("|")
  const added: string[] = []
  const changed: string[] = []
  for (const node of after.nodes) {
    if (isStart(node)) continue
    const old = previous.get(node.id)
    if (!old) added.push(node.id)
    else if (!same(old, node) || outputs(before, node.id) !== outputs(after, node.id)) changed.push(node.id)
  }
  const removed = before.nodes.filter((node) => !isStart(node) && !current.has(node.id)).map((node) => node.id)
  return { added, changed, removed }
}

function countOf(diff: EditDiff): EditChanges {
  return { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length }
}

export function countChanges(before: AtendimentoFlow, after: AtendimentoFlow): EditChanges {
  return countOf(diffFlows(before, after))
}

function startChanged(before: AtendimentoFlow, after: AtendimentoFlow): boolean {
  const outputs = (flow: AtendimentoFlow) => flow.edges.filter((edge) => edge.source === START_ID).map((edge) => `${edge.sourceHandle}>${edge.target}`).sort().join("|")
  return outputs(before) !== outputs(after)
}

export function deltaBetween(before: AtendimentoFlow, after: AtendimentoFlow, ids?: ReadonlyMap<string, string>): RiDelta {
  const name = namer(ids)
  const diff = diffFlows(before, after)
  const touched = new Set([...diff.added, ...diff.changed])
  const nodes = new Map(after.nodes.map((node) => [node.id, node]))
  const order = walkOrder(after).filter((id) => touched.has(id))
  const sources = [...(startChanged(before, after) ? [START_ID] : []), ...order]
  return {
    name: after.name !== before.name ? after.name : "",
    description: after.description !== before.description ? after.description : "",
    nodes: order.flatMap((id) => {
      const node = nodes.get(id)
      return node ? [nodeToRi(node, name)] : []
    }),
    edges: edgesToRi(after, sources, name),
    remove: diff.removed.map(name),
  }
}

export function editSnapshot(original: AtendimentoFlow, result: Pick<EditResult, "flow" | "ids"> & Partial<Pick<EditResult, "detached">>): EditSnapshot {
  const { remove, ...changes } = deltaBetween(original, result.flow, result.ids)
  const name = namer(result.ids)
  const unreached = new Set((result.detached?.nodes ?? []).map((entry) => name(entry.node.id)))
  return { changes, removed: remove.filter((id) => !unreached.has(id)), unreached: remove.filter((id) => unreached.has(id)) }
}

function resolveOutput(node: AtendimentoNode, handles: readonly string[], output: string, busy: ReadonlySet<string>): string | undefined {
  const value = output.trim()
  if (!value) return handles.length === 1 ? handles[0] : undefined
  const direct = DIRECT_OUTPUT.exec(value)
  if (direct && handles.includes(`output-${Number(direct[1])}`)) return `output-${Number(direct[1])}`
  const key = labelKey(value)
  const matches = handles.filter((handle) => labelKey(outputLabel(node, handle)) === key)
  if (matches.length) return matches.find((handle) => !busy.has(handle)) ?? matches[0]
  const position = /^\d+$/.test(value) ? Number(value) : Number(NAMED_OUTPUT.exec(key)?.[1] ?? Number.NaN)
  if (Number.isInteger(position) && position >= 1 && position <= handles.length) return handles[position - 1]
  return undefined
}

function loose(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim()
  if (Array.isArray(value)) return value.map(loose)
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, loose(entry)]))
  return value
}

function fieldView(field: FieldSpec, data: JsonObject): unknown {
  if (field.kind === "menuOptions") return optionIndices(data).map((index) => ({ text: text(data[`text-${index}`]), description: text(data[`description-${index}`]) }))
  if (field.kind === "conditionPairs") return conditionIndices(data).map((index) => ({ var: text(data[`var-${index}`]), value: text(data[`value-${index}`]) }))
  const value = data[field.key]
  if (field.kind === "timeRules" && Array.isArray(value)) return value.map((rule) => (isObject(rule) ? { weekDays: rule.weekDays, startTime: rule.startTime, endTime: rule.endTime } : rule))
  return value
}

function fieldSnapshot(field: FieldSpec, data: JsonObject): string {
  const pattern = INDEXED[field.kind]
  if (!pattern) return canonical([data[field.key]])
  return canonical(Object.keys(data).filter((key) => pattern.test(key)).sort().map((key) => [key, data[key]]))
}

function mentions(type: string, config: readonly RiConfigEntry[]): Map<string, RiConfigEntry[]> {
  const fields = getDefinition(type)?.fields ?? []
  const fixed = new Set(fixedKeys(type))
  const found = new Map<string, RiConfigEntry[]>()
  for (const entry of config) {
    const key = String(entry.key ?? "").trim()
    if (!key || String(entry.value ?? "").trim() === "") continue
    const field = fields.find((item) => item.key === key) ?? fields.find((item) => item.key.toLowerCase() === key.toLowerCase()) ?? fields.find((item) => INDEXED[item.kind]?.test(key))
    if (!field || fixed.has(field.key)) continue
    found.set(field.key, [...(found.get(field.key) ?? []), entry])
  }
  return found
}

function rejectedField(type: string, field: FieldSpec, entries: RiConfigEntry[], context: ConfigContext): boolean {
  if (field.kind === "menuNode") return false
  const definition = getDefinition(type)
  if (!definition?.defaults) return false
  const single = configureNode(type, entries, context)
  if (!single.notes.some((note) => note.level === "warning")) return false
  const baseline = definition.configured ? definition.configured() : definition.defaults()
  return fieldSnapshot(field, single.data) === fieldSnapshot(field, baseline)
}

function sequentialDigits(data: JsonObject): boolean {
  return optionIndices(data).every((index, position) => text(data[`opt-${index}`]).trim() === String(position + 1))
}

function keepDigits(old: JsonObject, data: JsonObject): void {
  const indices = optionIndices(data)
  if (sequentialDigits(old)) {
    indices.forEach((index, position) => {
      data[`opt-${index}`] = String(position + 1)
    })
    return
  }
  const previous = new Map(optionIndices(old).map((index) => [labelKey(text(old[`text-${index}`])), text(old[`opt-${index}`]).trim()]))
  const digits = indices.map((index) => previous.get(labelKey(text(data[`text-${index}`]))) || text(data[`opt-${index}`]).trim())
  if (digits.some((digit) => !digit) || new Set(digits).size !== digits.length) return
  indices.forEach((index, position) => {
    data[`opt-${index}`] = digits[position]
  })
}

function mergeData(type: string, old: JsonObject, fresh: JsonObject, config: readonly RiConfigEntry[], context: ConfigContext): JsonObject {
  const fields = getDefinition(type)?.fields ?? []
  const mentioned = mentions(type, config)
  const data: JsonObject = { ...fresh }
  const replaced: RegExp[] = []
  const fieldKeys = new Set<string>()
  for (const field of fields) {
    fieldKeys.add(field.key)
    for (const mirror of mirrorKeys(field)) fieldKeys.add(mirror)
    const entries = mentioned.get(field.key)
    const pattern = INDEXED[field.kind]
    const keep = !entries || field.kind === "menuNode" || same(loose(fieldView(field, old)), loose(fieldView(field, data))) || rejectedField(type, field, entries, context)
    if (!keep) {
      if (pattern) replaced.push(pattern)
      if (field.kind === "menuOptions") keepDigits(old, data)
      continue
    }
    if (pattern) {
      for (const key of Object.keys(data)) if (pattern.test(key)) delete data[key]
      for (const [key, value] of Object.entries(old)) if (pattern.test(key)) data[key] = copy(value)
      continue
    }
    for (const key of [field.key, ...mirrorKeys(field)]) if (has(old, key)) data[key] = copy(old[key])
  }
  for (const [key, value] of Object.entries(old)) {
    if (fieldKeys.has(key) || replaced.some((pattern) => pattern.test(key))) continue
    if (fields.some((field) => INDEXED[field.kind]?.test(key))) continue
    data[key] = copy(value)
  }
  return data
}

function equivalent(type: string, old: JsonObject, data: JsonObject): boolean {
  for (const key of Object.keys(old)) if (!same(old[key], data[key])) return false
  for (const key of Object.keys(data)) if (!has(old, key) && !isDefault(type, key, data[key])) return false
  return true
}

function orderLike(old: JsonObject, data: JsonObject): JsonObject {
  const ordered: JsonObject = {}
  for (const key of Object.keys(old)) if (has(data, key)) ordered[key] = data[key]
  for (const key of Object.keys(data)) if (!has(ordered, key)) ordered[key] = data[key]
  return ordered
}

function returnData(menuId: string): JsonObject {
  const definition = getDefinition(RETURN_TYPE)
  const data = definition?.configured ? definition.configured() : { id: "" }
  data.id = menuId
  data.targetNodeId = menuId
  return data
}

function settleReturn(node: AtendimentoNode, flow: AtendimentoFlow): void {
  const menus = flow.nodes.filter((entry) => entry.data.type === MENU_TYPE).map((menu) => ({ id: menu.id, value: menu.id, name: text(menu.data.data.title) }))
  const data = node.data.data
  data.availableNodes = menus.map((menu) => ({ ...menu }))
  data.targetNodeName = menus.find((menu) => menu.id === data.targetNodeId)?.name ?? ""
}

function overlaps(node: AtendimentoNode, x: number, y: number, other: AtendimentoNode): boolean {
  const box = layoutBox(node)
  const near = layoutBox(other)
  return x < other.position.x + near.width + GAP && other.position.x < x + box.width + GAP && y < other.position.y + near.height + GAP && other.position.y < y + box.height + GAP
}

function freeY(node: AtendimentoNode, x: number, y: number, placed: readonly AtendimentoNode[]): number {
  let top = y
  for (let guard = 0; guard <= placed.length; guard++) {
    const hit = placed.find((other) => overlaps(node, x, top, other))
    if (!hit) return top
    top = hit.position.y + layoutBox(hit).height + LAYOUT.rowGap
  }
  return top
}

function place(flow: AtendimentoFlow, pending: readonly string[], anchors: ReadonlyMap<string, string> = new Map()): void {
  if (!pending.length) return
  const wanted = new Set(pending)
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const placed = flow.nodes.filter((node) => !wanted.has(node.id))
  const done = new Set(placed.map((node) => node.id))
  const order = walkOrder(flow).filter((id) => wanted.has(id))
  for (const id of order) {
    const node = nodes.get(id)
    if (!node || node.data.type === NOTE_TYPE) continue
    const parent = flow.edges.filter((edge) => edge.target === id).map((edge) => nodes.get(edge.source)).find((entry): entry is AtendimentoNode => entry !== undefined && done.has(entry.id))
    let x: number
    let y: number
    if (parent) {
      x = parent.position.x + layoutBox(parent).width + LAYOUT.columnGap
      y = parent.position.y
    } else if (placed.length) {
      x = Math.max(...placed.map((entry) => entry.position.x + layoutBox(entry).width)) + LAYOUT.columnGap
      y = Math.min(...placed.map((entry) => entry.position.y))
    } else {
      x = LAYOUT.origin
      y = LAYOUT.origin
    }
    x = Math.round(x)
    y = Math.round(freeY(node, x, Math.round(y), placed))
    node.position = { x, y }
    placed.push(node)
    done.add(id)
  }
  for (const id of pending) {
    const node = nodes.get(id)
    if (!node || node.data.type !== NOTE_TYPE) continue
    node.position = notePosition(node, nodes.get(anchors.get(id) ?? START_ID), placed)
    placed.push(node)
  }
}

function noteAnchors(flow: AtendimentoFlow, mentioned: readonly string[], added: readonly string[], touched: ReadonlySet<string>): Map<string, string> {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const component = (id: string) => {
    const node = nodes.get(id)
    return node !== undefined && node.data.type !== NOTE_TYPE
  }
  const fresh = new Set(added)
  const nearest = [...touched].reverse().find(component)
  const anchors = new Map<string, string>()
  mentioned.forEach((id, index) => {
    if (!fresh.has(id) || component(id) || !nodes.has(id) || anchors.has(id)) return
    const anchor = mentioned.slice(0, index).reverse().find(component) ?? mentioned.slice(index + 1).find(component) ?? nearest
    if (anchor) anchors.set(id, anchor)
  })
  return anchors
}

function restore(flow: AtendimentoFlow, detached: EditDetached): void {
  const ids = new Set(flow.nodes.map((node) => node.id))
  for (const { index, node } of [...detached.nodes].sort((a, b) => a.index - b.index)) {
    if (ids.has(node.id)) continue
    flow.nodes.splice(Math.min(Math.max(0, index), flow.nodes.length), 0, copy(node))
    ids.add(node.id)
  }
  const edgeIds = new Set(flow.edges.map((edge) => edge.id))
  const handles = new Set(flow.edges.map((edge) => `${edge.source}\u0000${edge.sourceHandle}`))
  for (const edge of detached.edges) {
    const slot = `${edge.source}\u0000${edge.sourceHandle}`
    if (edgeIds.has(edge.id) || handles.has(slot) || !ids.has(edge.source) || !ids.has(edge.target)) continue
    flow.edges.push(copy(edge))
    edgeIds.add(edge.id)
    handles.add(slot)
  }
}

function noteOf(level: AssemblyNote["level"], scope: AssemblyNote["scope"], message: string, extra: Pick<AssemblyNote, "riId" | "nodeId" | "type"> = {}): AssemblyNote {
  return {
    level,
    scope,
    message,
    ...(extra.riId ? { riId: extra.riId } : {}),
    ...(extra.nodeId ? { nodeId: extra.nodeId } : {}),
    ...(extra.type ? { type: extra.type } : {}),
  }
}

function remap(before: AtendimentoNode, after: AtendimentoNode, edges: readonly AtendimentoEdge[]): Map<string, string> {
  const handles = outputHandles(after, [...edges])
  const result = new Map<string, string>()
  const pending: AtendimentoEdge[] = []
  for (const edge of [...edges].sort(byHandle)) {
    const label = labelKey(outputLabel(before, edge.sourceHandle))
    const match = handles.find((handle) => !result.has(handle) && labelKey(outputLabel(after, handle)) === label)
    if (match) result.set(match, edge.target)
    else pending.push(edge)
  }
  for (const edge of pending) if (handles.includes(edge.sourceHandle) && !result.has(edge.sourceHandle)) result.set(edge.sourceHandle, edge.target)
  return result
}

export function applyEdit(base: AtendimentoFlow, delta: unknown, options: EditOptions = {}): EditResult {
  const ri = coerceDelta(delta) ?? { name: "", description: "", nodes: [], edges: [], remove: [] }
  const flow = copy(base)
  const incoming = options.detached ?? EMPTY_DETACHED
  const gone = new Set(incoming.removed ?? [])
  const before = reachFrom(flow.edges, [START_ID])
  for (const { node } of incoming.nodes) before.add(node.id)
  restore(flow, incoming)
  const notes: AssemblyNote[] = []
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const original = new Map(nodes)
  const ids = new Map([...(options.ids ?? [])].filter(([, id]) => nodes.has(id)))
  const fresh = new Map<string, string>()
  let sequence = (options.now ?? new Date()).getTime()
  const context: ConfigContext = { ruleId: () => `rule-${sequence++}` }
  let counter = maxNumericId([...nodes.keys(), ...ids.keys(), ...ids.values(), ...gone])
  const allocate = () => {
    do counter++
    while (nodes.has(String(counter)) || ids.has(String(counter)))
    return String(counter)
  }
  const added: string[] = []
  const mentioned: string[] = []
  const touched = new Set<string>()
  const handled = new Set<string>()
  const returns: Array<{ id: string; target: string; riId: string; fallback?: JsonValue }> = []
  let dropped = 0

  const lookup = (reference: string, includeFresh: boolean): string | undefined => {
    const id = reference.trim()
    if (!id) return undefined
    if (includeFresh && fresh.has(id)) return fresh.get(id)
    const named = ids.get(id)
    if (named && nodes.has(named)) return named
    if (nodes.has(id)) return id
    const folded = id.toLowerCase()
    const candidates = new Set<string>()
    if (includeFresh) for (const [name, value] of fresh) if (name.toLowerCase() === folded) candidates.add(value)
    for (const [name, value] of ids) if (name.toLowerCase() === folded && nodes.has(value)) candidates.add(value)
    for (const key of nodes.keys()) if (key.toLowerCase() === folded) candidates.add(key)
    if (candidates.size === 1) return [...candidates][0]
    return START_ALIASES.has(compactKey(id)) ? START_ID : undefined
  }
  const nameOf = (id: string) => namer(ids)(id)
  const writable = (id: string): AtendimentoNode | undefined => {
    const node = nodes.get(id)
    if (!node) return undefined
    if (node !== original.get(id)) return node
    const clone: AtendimentoNode = { ...node, data: { ...node.data, data: { ...node.data.data } } }
    flow.nodes[flow.nodes.indexOf(node)] = clone
    nodes.set(id, clone)
    touched.add(id)
    return clone
  }
  const record = (outcome: ValueNote[], riId: string, nodeId: string, type: string) => {
    for (const note of outcome) notes.push(noteOf(note.level, "ia", note.message, { riId, nodeId, type }))
  }
  const protocolFix = (node: AtendimentoNode, riId: string) => {
    if (node.data.type !== PROTOCOL_TYPE || node.data.data.opt !== "URL" || text(node.data.data.url_api).trim() !== "") return
    node.data.data.opt = "Automático"
    notes.push(noteOf("warning", "plataforma", "Sem a URL da API de protocolo no pedido, o tipo passou para Automático. Informe a URL no editor para usar o tipo URL.", { riId, nodeId: node.id, type: PROTOCOL_TYPE }))
  }

  const removal = new Set<string>()
  const leaving = new Set([...gone].map((id) => id.toLowerCase()))
  for (const [name, value] of options.ids ?? []) if (gone.has(value)) leaving.add(name.toLowerCase())
  for (const reference of ri.remove) {
    const id = lookup(reference, false)
    const node = id ? nodes.get(id) : undefined
    if (!id || !node || isStart(node)) continue
    removal.add(id)
    leaving.add(reference.trim().toLowerCase())
    leaving.add(id.toLowerCase())
    for (const [name, value] of ids) if (value === id) leaving.add(name.toLowerCase())
  }
  if (removal.size) {
    flow.nodes = flow.nodes.filter((node) => !removal.has(node.id))
    flow.edges = flow.edges.filter((edge) => !removal.has(edge.source) && !removal.has(edge.target))
    for (const id of removal) nodes.delete(id)
  }

  ri.nodes.forEach((raw, index) => {
    const given = raw.id.trim().slice(0, RI_LIMITS.id)
    const label = given || `c${index + 1}`
    const type = canonicalType(raw.type)
    if (!type) {
      notes.push(noteOf("warning", "ia", `O tipo ${quote(raw.type)} não existe e o componente ${quote(label)} foi descartado.`, { riId: label }))
      return
    }
    if (type === START_TYPE) return
    const definition = getDefinition(type)
    if (!definition?.defaults) {
      notes.push(noteOf("warning", "ia", `O componente ${quote(label)} usa um tipo sem formato de Atendimento e foi descartado.`, { riId: label, type }))
      return
    }
    const existing = given ? lookup(given, false) : undefined
    if (existing === START_ID) {
      notes.push(noteOf("warning", "ia", `O Iniciar Fluxo não é editado; o componente ${quote(given)} foi descartado.`, { riId: given, type }))
      return
    }
    if (existing) {
      const current = nodes.get(existing)
      if (!current) return
      if (handled.has(existing)) notes.push(noteOf("hint", "ia", `O id ${quote(given)} apareceu mais de uma vez em nodes; valeu a última versão.`, { riId: given, nodeId: existing, type }))
      handled.add(existing)
      mentioned.push(existing)
      const outcome = configureNode(type, raw.config, context)
      record(outcome.notes, given, existing, type)
      const sameType = current.data.type === type
      const old = isObject(current.data.data) ? current.data.data : {}
      const merged = sameType ? mergeData(type, old, outcome.data, raw.config, context) : outcome.data
      if (outcome.menuTarget !== undefined) returns.push({ id: existing, target: outcome.menuTarget, riId: given, fallback: sameType ? old.targetNodeId : undefined })
      if (sameType && equivalent(type, old, merged)) return
      settleData(type, merged)
      const next: AtendimentoNode = sameType
        ? { ...current, data: { ...current.data, data: orderLike(old, merged) } }
        : { ...current, type: getNodeType(type), data: { ...current.data, type, data: merged, html: getTemplate(type) }, measured: defaultMeasured(type) }
      if (!sameType && !has(current, "measured")) delete next.measured
      flow.nodes[flow.nodes.indexOf(current)] = next
      nodes.set(existing, next)
      touched.add(existing)
      protocolFix(next, given)
      return
    }
    if (added.length >= RI_LIMITS.nodes) {
      dropped++
      return
    }
    let riId = label
    if (!given || fresh.has(label)) {
      let suffix = 2
      while (fresh.has(`${label}_${suffix}`) || lookup(`${label}_${suffix}`, false)) suffix++
      const free = !given && !fresh.has(label) && !lookup(label, false)
      riId = free ? label : `${label}_${suffix}`
      notes.push(noteOf("warning", "ia", given ? `O id ${quote(given)} já está em uso nesta resposta; este componente passou a usar ${quote(riId)}.` : `O ${index + 1}º componente veio sem id e passou a usar ${quote(riId)}.`, { riId, type }))
    }
    const id = allocate()
    const node = newNode(type, { x: 0, y: 0 }, id)
    const outcome = configureNode(type, raw.config, context)
    node.data.data = outcome.data
    settleData(type, node.data.data)
    flow.nodes.push(node)
    nodes.set(id, node)
    fresh.set(riId, id)
    ids.set(riId, id)
    added.push(id)
    mentioned.push(id)
    touched.add(id)
    handled.add(id)
    record(outcome.notes, riId, id, type)
    protocolFix(node, riId)
    if (outcome.menuTarget !== undefined) returns.push({ id, target: outcome.menuTarget, riId })
  })
  if (dropped) notes.push(noteOf("warning", "ia", `Cada edição aceita até ${RI_LIMITS.nodes} componentes novos; ${dropped} foram descartados.`))

  const menus = () => flow.nodes.filter((node) => node.data.type === MENU_TYPE)
  for (const entry of returns) {
    const reference = entry.target.trim()
    let target = reference ? lookup(reference, true) : undefined
    if (target && nodes.get(target)?.data.type !== MENU_TYPE) target = undefined
    if (!target && reference) {
      const titled = menus().filter((menu) => foldText(text(menu.data.data.title)) === foldText(reference))
      if (titled.length === 1) target = titled[0].id
    }
    if (!target && menus().length === 1) target = menus()[0].id
    if (!target && typeof entry.fallback === "string" && entry.fallback.trim() && nodes.get(entry.fallback)?.data.type === MENU_TYPE) target = entry.fallback
    const node = nodes.get(entry.id)
    if (target && node && (node.data.data.targetNodeId !== target || node.data.data.id !== target)) {
      const editable = writable(entry.id)
      if (editable) {
        editable.data.data.targetNodeId = target
        editable.data.data.id = target
      }
    }
    if (!target && reference) notes.push(noteOf("warning", "ia", `targetNodeId ${quote(reference)} não é o id de um Menu de Opções do fluxo.`, { riId: entry.riId, nodeId: entry.id, type: RETURN_TYPE }))
  }

  const rewired = new Map<string, Map<string, string>>()
  const outgoingOf = (id: string) => flow.edges.filter((edge) => edge.source === id)
  for (const id of touched) {
    if (added.includes(id)) continue
    const prior = original.get(id)
    const after = nodes.get(id)
    if (!prior || !after) continue
    const edges = outgoingOf(id)
    const mapped = remap(prior, after, edges)
    const current = new Map(edges.map((edge) => [edge.sourceHandle, edge.target]))
    if (mapped.size !== current.size || [...mapped].some(([handle, target]) => current.get(handle) !== target)) rewired.set(id, mapped)
  }

  const created = new Set<string>()
  const assigned = new Map<string, Set<string>>()
  const edgeLimit = ri.edges.length > RI_LIMITS.edges
  if (edgeLimit) notes.push(noteOf("warning", "ia", `Cada edição aceita até ${RI_LIMITS.edges} conexões; ${ri.edges.length - RI_LIMITS.edges} foram descartadas.`))
  for (const edge of ri.edges.slice(0, RI_LIMITS.edges)) {
    const from = edge.from.trim()
    const to = edge.to.trim()
    const source = lookup(from, true)
    const target = lookup(to, true)
    const sourceNode = source ? nodes.get(source) : undefined
    const sourceType = sourceNode?.data.type
    const report = (message: string, level: AssemblyNote["level"] = "warning") => notes.push(noteOf(level, "ia", message, { riId: source ? nameOf(source) : undefined, nodeId: source, type: sourceType }))
    if (!source || !sourceNode) {
      if (!leaving.has(from.toLowerCase())) notes.push(noteOf("warning", "ia", `A conexão de ${quote(from)} para ${quote(to)} foi descartada: o id ${quote(from)} não existe.`))
      continue
    }
    const targetNode = target ? nodes.get(target) : undefined
    if (!target || !targetNode) {
      report(`A conexão para ${quote(to)} foi descartada: o id ${quote(to)} não existe.`)
      continue
    }
    if (sourceType === NOTE_TYPE || targetNode.data.type === NOTE_TYPE) {
      report(`A conexão para ${quote(to)} foi descartada: Nota nunca é ligada.`)
      continue
    }
    if (target === START_ID) {
      report(`A conexão para ${quote(to)} foi descartada: nada se liga ao Iniciar Fluxo.`)
      continue
    }
    const loop = source === target && sourceType === MENU_TYPE
    if (source === target && !loop) {
      report(`A conexão para ${quote(to)} foi descartada: um componente não se liga a ele mesmo.`)
      continue
    }
    const handles = outputHandles(sourceNode, flow.edges)
    if (!handles.length) {
      report(`A conexão para ${quote(to)} foi descartada: o componente não tem saídas e encerra o caminho.`)
      continue
    }
    const busy = assigned.get(source) ?? new Set<string>()
    const output = edge.output.trim()
    const labels = handles.map((handle) => outputLabel(sourceNode, handle))
    let handle = resolveOutput(sourceNode, handles, edge.output, busy)
    if (!handle && output && handles.length === 1) {
      handle = handles[0]
      report(`A saída ${quote(output)} não existe; foi usada a única saída, ${quote(labels[0])}.`, "hint")
    }
    if (!handle) {
      report(output
        ? `A conexão para ${quote(to)} foi descartada: a saída ${quote(output)} não existe. Saídas: ${listQuoted(labels)}.`
        : `A conexão para ${quote(to)} foi descartada: informe a saída. Saídas: ${listQuoted(labels)}.`)
      continue
    }
    const map = rewired.get(source) ?? new Map(outgoingOf(source).map((entry) => [entry.sourceHandle, entry.target]))
    if (busy.has(handle)) {
      const taken = map.get(handle)
      report(`A conexão para ${quote(to)} foi descartada: a saída ${quote(outputLabel(sourceNode, handle))} já está ligada a ${quote(taken ? nameOf(taken) : "outro componente")}.`)
      continue
    }
    let destination = target
    if (loop) {
      const back = newNode(RETURN_TYPE, { x: 0, y: 0 }, allocate())
      back.data.data = returnData(source)
      flow.nodes.push(back)
      nodes.set(back.id, back)
      added.push(back.id)
      touched.add(back.id)
      destination = back.id
      notes.push(noteOf("warning", "ajuste", `A conexão de volta ao menu ${quote(text(sourceNode.data.data.title).trim() || `ID ${source}`)} foi trocada por Retornar ao Menu.`, { riId: nameOf(source), nodeId: back.id, type: RETURN_TYPE }))
    }
    busy.add(handle)
    assigned.set(source, busy)
    map.set(handle, destination)
    rewired.set(source, map)
    if (!outgoingOf(source).some((entry) => entry.sourceHandle === handle && entry.target === destination)) created.add(edgeKey(source, handle, destination))
  }

  if (rewired.size) {
    const taken = new Set(flow.edges.map((edge) => edge.id))
    const placed = new Map<string, Set<string>>()
    const result: AtendimentoEdge[] = []
    const lastOf = new Map<string, number>()
    for (const edge of flow.edges) {
      const map = rewired.get(edge.source)
      if (map) {
        const done = placed.get(edge.source) ?? new Set<string>()
        if (map.get(edge.sourceHandle) !== edge.target || done.has(edge.sourceHandle)) continue
        done.add(edge.sourceHandle)
        placed.set(edge.source, done)
      }
      result.push(edge)
      lastOf.set(edge.source, result.length - 1)
    }
    const extra: Array<{ after: number; order: number; edge: AtendimentoEdge }> = []
    let order = 0
    for (const [source, map] of rewired) {
      const done = placed.get(source) ?? new Set<string>()
      for (const [handle, target] of [...map].sort(([a], [b]) => handleIndex(a) - handleIndex(b))) {
        if (done.has(handle)) continue
        const edge = createEdge([...taken].map((id) => ({ id })), source, handle, target)
        taken.add(edge.id)
        extra.push({ after: lastOf.get(source) ?? Number.MAX_SAFE_INTEGER, order: order++, edge })
      }
    }
    extra.sort((a, b) => a.after - b.after || a.order - b.order)
    const merged: AtendimentoEdge[] = []
    let cursor = 0
    result.forEach((edge, index) => {
      merged.push(edge)
      while (cursor < extra.length && extra[cursor].after === index) merged.push(extra[cursor++].edge)
    })
    while (cursor < extra.length) merged.push(extra[cursor++].edge)
    flow.edges = merged
  }

  if (created.size) {
    for (const menu of menus()) {
      const entering = flow.edges.filter((edge) => edge.target === menu.id)
      if (entering.length < 2 || !entering.some((edge) => created.has(edgeKey(edge.source, edge.sourceHandle, edge.target)))) continue
      const isNew = (edge: AtendimentoEdge) => created.has(edgeKey(edge.source, edge.sourceHandle, edge.target))
      const upstream = reachFrom(flow.edges, [START_ID], menu.id)
      const kept = entering.find((edge) => !isNew(edge) && upstream.has(edge.source)) ?? entering.find((edge) => upstream.has(edge.source)) ?? entering.find((edge) => !isNew(edge)) ?? entering[0]
      for (const edge of entering) {
        if (edge === kept || !isNew(edge)) continue
        const back = newNode(RETURN_TYPE, { x: 0, y: 0 }, allocate())
        back.data.data = returnData(menu.id)
        flow.nodes.push(back)
        nodes.set(back.id, back)
        added.push(back.id)
        touched.add(back.id)
        const index = flow.edges.indexOf(edge)
        const others = flow.edges.filter((entry) => entry !== edge)
        flow.edges[index] = createEdge(others, edge.source, edge.sourceHandle, back.id)
        notes.push(noteOf("warning", "ajuste", `A conexão de volta ao menu ${quote(text(menu.data.data.title).trim() || `ID ${menu.id}`)} foi trocada por Retornar ao Menu.`, { riId: nameOf(edge.source), nodeId: back.id, type: RETURN_TYPE }))
      }
    }
  }

  const detached: EditDetached = { nodes: [], edges: [] }
  if (options.prune !== false) {
    const after = reachFrom(flow.edges, [START_ID])
    const removed = new Set(flow.nodes.filter((node) => before.has(node.id) && !after.has(node.id) && !isStart(node) && node.data.type !== NOTE_TYPE).map((node) => node.id))
    if (removed.size) {
      flow.nodes.forEach((node, index) => {
        if (removed.has(node.id)) detached.nodes.push({ index, node })
      })
      detached.edges = flow.edges.filter((edge) => removed.has(edge.source) || removed.has(edge.target))
      flow.nodes = flow.nodes.filter((node) => !removed.has(node.id))
      flow.edges = flow.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target))
      for (const id of removed) nodes.delete(id)
    }
  }
  const gathered = [...new Set([...gone, ...removal])]
  if (gathered.length) detached.removed = gathered

  for (const id of touched) {
    const node = nodes.get(id)
    if (node?.data.type === RETURN_TYPE) settleReturn(node, flow)
  }
  place(flow, added.filter((id) => nodes.has(id)), noteAnchors(flow, mentioned, added, touched))

  const name = shorten(ri.name, LIMITS.name)
  if (name && name !== flow.name) flow.name = name
  const description = shorten(ri.description, LIMITS.description)
  if (description && description !== flow.description) flow.description = description

  const kept = new Set([...flow.nodes.map((node) => node.id), ...detached.nodes.map((entry) => entry.node.id)])
  for (const [name, id] of ids) if (!kept.has(id)) ids.delete(name)
  return { flow, notes, changes: countChanges(base, flow), ids, detached }
}

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === ""
}

function fillRequired(node: AtendimentoNode): string[] {
  const data = node.data.data
  const filled: string[] = []
  if (node.data.type === MENU_TYPE) {
    if (blank(data.title)) {
      data.title = MENU_PLACEHOLDER
      filled.push("a mensagem do menu")
    }
    optionIndices(data).forEach((option, position) => {
      if (blank(data[`text-${option}`])) {
        data[`text-${option}`] = `Opção ${position + 1}`
        filled.push(`o título da opção ${position + 1}`)
      }
    })
  }
  if (node.data.type === MESSAGE_TYPE && blank(data.template)) {
    data.template = MESSAGE_PLACEHOLDER
    filled.push("a mensagem")
  }
  return filled
}

export function concludeEdit(original: AtendimentoFlow, result: EditResult, options: EditFillOptions = {}): EditResult {
  const flow = copy(result.flow)
  const notes = [...result.notes]
  const name = namer(result.ids)
  notes.push(...capLists(original, flow, name))
  const diff = diffFlows(original, flow)
  const added = new Set(diff.added)
  const roots = [START_ID, ...flow.nodes.filter((node) => !added.has(node.id)).map((node) => node.id)]
  const reached = reachFrom(flow.edges, roots)
  const lost = new Set(flow.nodes.filter((node) => added.has(node.id) && node.data.type !== NOTE_TYPE && !reached.has(node.id)).map((node) => node.id))
  if (lost.size) {
    for (const node of flow.nodes) {
      if (!lost.has(node.id)) continue
      notes.push(noteOf("warning", "ajuste", `O componente novo ${quote(name(node.id))} ficou sem ligação com o fluxo e foi descartado.`, { riId: name(node.id), type: node.data.type }))
    }
    flow.nodes = flow.nodes.filter((node) => !lost.has(node.id))
    flow.edges = flow.edges.filter((edge) => !lost.has(edge.source) && !lost.has(edge.target))
  }
  const touched = new Set([...diff.added, ...diff.changed].filter((id) => !lost.has(id)))
  for (const node of flow.nodes) {
    if (!touched.has(node.id)) continue
    if (options.fill !== false) notes.push(...provisionalReferences(node, name(node.id)))
    const filled = fillRequired(node)
    if (filled.length) notes.push(noteOf("warning", "ajuste", `Preenchido com texto provisório: ${filled.join(", ")}. Revise.`, { riId: name(node.id), nodeId: node.id, type: node.data.type }))
  }
  const previous = new Map(original.nodes.map((node) => [node.id, node]))
  const linkedBefore = new Set(original.edges.map((edge) => `${edge.source}\u0000${edge.sourceHandle}`))
  const reachable = reachFrom(flow.edges, [START_ID])
  let counter = maxNumericId([...flow.nodes.map((node) => node.id), ...result.ids.keys(), ...result.detached.nodes.map((entry) => entry.node.id), ...(result.detached.removed ?? [])])
  const taken = new Set([...flow.nodes.map((node) => node.id), ...result.ids.keys()])
  const allocate = () => {
    do counter++
    while (taken.has(String(counter)))
    const id = String(counter)
    taken.add(id)
    return id
  }
  const linkedOriginally = new Set(original.edges.map((edge) => edgeKey(edge.source, edge.sourceHandle, edge.target)))
  const unasked = unaskedWaits(flow, (edge) => touched.has(edge.target) || touched.has(edge.source) || !linkedOriginally.has(edgeKey(edge.source, edge.sourceHandle, edge.target)))
  const asked = askBeforeWaits(flow, unasked, allocate, (id) => name(id))
  notes.push(...asked.notes)
  const ends: string[] = []
  for (const node of [...flow.nodes]) {
    if (isStart(node) || node.data.type === NOTE_TYPE || !reachable.has(node.id)) continue
    const connected = new Set(flow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle))
    for (const handle of outputHandles(node)) {
      if (connected.has(handle)) continue
      if (!touched.has(node.id) && !(previous.has(node.id) && linkedBefore.has(`${node.id}\u0000${handle}`))) continue
      const id = allocate()
      const end = newNode(FINISH_TYPE, { x: 0, y: 0 }, id)
      flow.nodes.push(end)
      flow.edges.push(createEdge(flow.edges, node.id, handle, id))
      ends.push(id)
      notes.push(noteOf("warning", "ajuste", `A saída ${quote(outputLabel(node, handle))} estava sem destino e foi ligada a um novo Encerrar Conversa. Revise.`, { riId: name(node.id), nodeId: node.id, type: node.data.type }))
    }
  }
  place(flow, [...asked.added, ...ends])
  const ids = new Map([...result.ids].filter(([, id]) => flow.nodes.some((node) => node.id === id)))
  return { flow, notes, changes: countChanges(original, flow), ids, detached: result.detached }
}

const knownIssues = new WeakMap<AtendimentoFlow, Set<string>>()

function issueKey(issue: { severity: string; nodeId?: string; message: string }): string {
  return JSON.stringify([issue.severity, issue.nodeId ?? null, issue.message])
}

function issuesOf(flow: AtendimentoFlow): Set<string> {
  const known = knownIssues.get(flow)
  if (known) return known
  const keys = new Set(validateFlow(flow).map(issueKey))
  knownIssues.set(flow, keys)
  return keys
}

function requiredNotes(flow: AtendimentoFlow, touched: ReadonlySet<string>, name: (id: string) => string, fill: boolean): AssemblyNote[] {
  const flagged = new Set<string>()
  for (const issue of validateFlow(flow)) for (const field of issue.fields ?? []) flagged.add(JSON.stringify([issue.nodeId ?? "", field.split(".")[0]]))
  const notes: AssemblyNote[] = []
  for (const node of flow.nodes) {
    if (!touched.has(node.id)) continue
    const type = node.data.type
    const required = guideOf(type, fill)?.required
    if (!required?.length) continue
    const accepted = acceptedKeys(type)
    const fields = getDefinition(type)?.fields ?? []
    for (const key of required) {
      const field = fields.find((entry) => entry.key === key)
      if (!field || UNCHECKED_KINDS.has(field.kind) || !accepted.includes(key)) continue
      const value = node.data.data[key]
      const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0) || (isObject(value) && Object.keys(value).length === 0)
      if (flagged.has(JSON.stringify([node.id, key])) || !empty) continue
      notes.push(noteOf("warning", "ia", `Preencha ${quote(field.label)} (${key}), que é obrigatório.`, { riId: name(node.id), nodeId: node.id, type }))
    }
  }
  return notes
}

const knownTexts = new WeakMap<AtendimentoFlow, string>()

function knownText(flow: AtendimentoFlow): string {
  const known = knownTexts.get(flow)
  if (known !== undefined) return known
  const text = JSON.stringify(flow.nodes.map((node) => node.data.data))
  knownTexts.set(flow, text)
  return text
}

function provisionalNotes(flow: AtendimentoFlow, touched: ReadonlySet<string>, name: (id: string) => string, request: string): AssemblyNote[] {
  if (!request) return []
  const notes: AssemblyNote[] = []
  for (const node of flow.nodes) {
    if (!touched.has(node.id)) continue
    for (const label of provisionalLabels(node.data.type, node.data.data, request)) notes.push(noteOf("warning", "plataforma", provisionalMessage(label), { riId: name(node.id), nodeId: node.id, type: node.data.type }))
  }
  return notes
}

function startLinked(flow: AtendimentoFlow): boolean {
  return flow.edges.some((edge) => edge.source === START_ID)
}

function cleared(original: AtendimentoFlow, result: Pick<EditResult, "flow"> & Partial<Pick<EditResult, "detached">>): boolean {
  return startLinked(original) && !startLinked(result.flow) && !result.detached?.nodes.length && result.flow.nodes.every((node) => isStart(node) || node.data.type === NOTE_TYPE)
}

export function reviewEdit(original: AtendimentoFlow, result: Pick<EditResult, "flow" | "notes" | "ids"> & Partial<Pick<EditResult, "detached">>, options: EditFillOptions = {}): EditReview {
  const fill = options.fill !== false
  const diff = diffFlows(original, result.flow)
  const unchanged = !diff.added.length && !diff.changed.length && !diff.removed.length && result.flow.name === original.name && result.flow.description === original.description
  const name = namer(result.ids)
  const present = new Set(result.flow.nodes.map((node) => node.id))
  const riIds = new Map(result.flow.nodes.map((node) => [node.id, name(node.id)]))
  const touched = new Set([...diff.added, ...diff.changed])
  const request = fill ? requestText(options.prompt, knownText(original)) : ""
  const notes = [...result.notes.filter((note) => !note.nodeId || present.has(note.nodeId)), ...requiredNotes(result.flow, touched, name, fill), ...provisionalNotes(result.flow, touched, name, request), ...planNotes(original, result.flow, name, options.prompt)]
  const assembled = { flow: result.flow, platformIds: new Map<string, string>(), riIds, notes, ...(fill ? {} : { fill: false }) }
  const known = issuesOf(original)
  const empty = cleared(original, result)
  const issues = reviewFlow(assembled).filter((issue) => !known.has(issueKey(issue)) && !(empty && issue.nodeId === START_ID && issue.message.startsWith(CONNECT_OUTPUT)))
  const pending = correctionItems(assembled, issues)
  if (unchanged) pending.unshift(NO_CHANGE)
  return { issues, pending, score: scoreOf(issues), changes: countOf(diff), unchanged }
}

export function needsEditCorrection(review: EditReview): boolean {
  return review.unchanged || review.issues.some((issue) => issue.scope === "ia")
}

export function pickEdit<T extends EditReview>(current: T | null | undefined, candidate: T): T {
  if (!current) return candidate
  if (current.unchanged !== candidate.unchanged) return current.unchanged ? candidate : current
  return compareScores(current.score, candidate.score) < 0 ? current : candidate
}

const EDIT_RULES: readonly string[] = [
  "# Modo de edição",
  "Nesta conversa você edita um fluxo que já existe. O pedido traz o fluxo atual em RI: cada componente com o id que ele tem no editor, o tipo, as chaves de config preenchidas e as conexões pelo rótulo da saída. As regras acima valem para tudo o que você criar ou alterar, mas a resposta traz só as mudanças, no formato da RI com a lista remove:",
  "1. nodes traz só os componentes novos e os alterados, cada um com a config completa de como deve ficar. Copie do fluxo atual os valores que não mudam.",
  "2. Componente alterado mantém o id do fluxo atual. Componente novo usa um id novo, curto e em texto, como menu_suporte, diferente de todos os ids do fluxo atual.",
  "3. Quando as saídas de um componente mudam, ele entra em nodes e edges traz todas as saídas dele, com o destino de cada uma. Quando a ligação do início muda, edges traz a conexão que sai de inicio.",
  "4. Componente que não aparece na resposta fica exatamente como está, com as mesmas conexões. Não repita o que não muda.",
  "5. Para remover componentes, liste os ids deles em remove, e eles saem do fluxo junto com as conexões. Quando o caminho continua depois do que sai, ligue em edges a saída anterior ao destino seguinte. Para tirar uma opção de um menu, envie o menu em nodes sem essa opção e liste em remove o que só essa opção alcançava. Para limpar o fluxo, liste em remove todos os componentes: o Início fica, e as notas ficam, a menos que o pedido peça para remover as notas. Quando nada sai do fluxo, remove fica vazio.",
  "6. Para inserir um passo no meio do caminho, ligue a saída anterior ao componente novo e a saída do componente novo ao destino que vinha depois.",
  "7. Cada componente recebe no máximo uma conexão. Para voltar a um menu do fluxo atual, use Retornar ao Menu com targetNodeId igual ao id desse menu.",
  "8. Preencha todas as chaves obrigatórias dos componentes novos e alterados, com valores do pedido ou do fluxo atual. Nunca deixe uma chave obrigatória vazia.",
  "9. name e description ficam vazios, a menos que o pedido peça para mudar o nome ou a descrição do fluxo.",
]

const EDIT_DELIVERY = "Responda só com as mudanças, no formato do modo de edição: os componentes novos e os alterados com a config completa, todas as saídas de cada componente cujas conexões mudam, os ids dos componentes que saem do fluxo em remove e nada do que fica igual."

const cachedEditSystem = new Map<string, string>()

const EDIT_LIMITS: readonly string[] = [
  "# Quantidades e limites",
  "- Quando o pedido diz quantas opções um menu tem, como em fica com 8 opções, o menu fica com exatamente esse número, com as opções do pedido na ordem dele. As opções de voltar e de encerramento entram quando o pedido traz essas opções, e esta regra vale acima das regras de menus da seção Fluxo completo.",
  "- Quando o pedido diz quantas mensagens, perguntas ou outros itens criar, crie exatamente esse número.",
  `- Os limites da plataforma valem em toda edição: o Menu de Opções tem de 1 a ${RI_LIMITS.menuOptions} opções, e até 3 com buttons "true"; a Múltipla Condição tem até ${RI_LIMITS.conditions} condições. Quando o pedido passa de um limite, siga o caminho que o pedido indicar ou divida em dois menus, com uma opção que leva ao segundo.`,
]

export function editSystemPrompt(options: PromptOptions = {}): string {
  const base = systemPrompt(options)
  const known = cachedEditSystem.get(base)
  if (known) return known
  const text = [base, EDIT_RULES.join("\n"), EDIT_LIMITS.join("\n")].join("\n\n")
  cachedEditSystem.set(base, text)
  return text
}

export function editRequestPrompt(base: AtendimentoFlow, description: string, hasImage?: boolean): string {
  const request = description.trim()
  const sections = [
    `# Fluxo atual\n${JSON.stringify(flowToRi(base))}`,
    `# Pedido de edição\n${request || "Aplique ao fluxo atual as mudanças mostradas na imagem anexada."}`,
  ]
  if (hasImage) sections.push("# Imagem\nA imagem anexada é a referência da edição. Use as etapas, os textos e as conexões dela no que for criar ou alterar.")
  sections.push(`# Entrega\n${EDIT_DELIVERY}`)
  return sections.join("\n\n")
}

function snapshotSection(applied: EditSnapshot | undefined): string[] {
  if (!applied) return []
  const lines = ["", "# Mudanças já aplicadas", "Componentes novos e alterados, com as saídas atuais:", JSON.stringify(applied.changes)]
  if (applied.removed.length) lines.push(`Componentes removidos pela lista remove: ${applied.removed.join(", ")}.`)
  if (applied.unreached?.length) lines.push(`Componentes removidos por deixarem de ser alcançados a partir do início: ${applied.unreached.join(", ")}. Para manter um deles, ligue a ele uma saída do fluxo.`)
  return lines
}

export function editCorrectionPrompt(pending: readonly string[], applied?: EditSnapshot, options: PromptOptions = {}): string {
  return [
    "# Pendências",
    "A edição anterior já foi aplicada ao fluxo e gerou estas pendências. Corrija todas e responda só com as mudanças que faltam, no formato do modo de edição.",
    ...pending.map((item) => `- ${item}`),
    "",
    "# Como corrigir",
    "- Use os ids do fluxo atual: os do fluxo enviado no pedido e os dos componentes novos que você já criou.",
    "- Mude só o necessário para resolver cada pendência. O que já está certo não entra na resposta e continua como está.",
    ...(options.fill === false ? [] : [`- ${FILL_CORRECTION}`]),
    "- Componente que entra na resposta vem com a config completa, e quando as saídas dele mudam, edges traz todas as saídas dele.",
    "- Saída sem destino vai para um componente novo que faça sentido para aquele resultado, como mensagem e Encerrar Conversa, Retornar ao Menu ou transferência. Nunca ligue a um componente que já recebe conexão.",
    ...snapshotSection(applied),
  ].join("\n")
}

export function editResumePrompt(length: boolean, applied?: EditSnapshot): string {
  return [
    "# Resposta interrompida",
    "A resposta anterior foi interrompida antes do fim. As mudanças que chegaram completas já foram aplicadas.",
    "Responda só com as mudanças que ainda faltam para atender o pedido, no formato do modo de edição, com os mesmos ids. Mantenha os ids e o conteúdo do que já estava pronto.",
    ...(length ? ["A resposta passou do limite de tamanho de saída. Use textos objetivos e não repita chaves de config com o valor padrão."] : []),
    ...snapshotSection(applied),
  ].join("\n")
}
