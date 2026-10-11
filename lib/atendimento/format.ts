import type { XYPosition } from "reactflow"
import { API_TYPES, MENU_TYPE, START_ID, START_TYPE, defaultMeasured, getComponentLabel, getDefinition, getTemplate, weekDayOptions } from "./catalog"
import fieldTypes from "./field-types.json"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, FlowIssue, JsonObject, JsonValue } from "./types"

type OutputNode = Pick<AtendimentoNode, "id" | "data">
type SourceEdge = { source: string; sourceHandle?: string | null }
type Report = (message: string, severity?: FlowIssue["severity"]) => void

interface NodeOutputs {
  node: AtendimentoNode
  options?: number[]
  handles: Set<string>
}

const MENU_OPTION_LIMIT = 10
const MENU_TITLE_LIMIT = 1024
const NUMERIC_ID = /^\d+$/
const TEXT_KEY = /^text-\d+$/
const OPTION_KEY = /^(opt|text|description)-(\d+)$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
const WEEK_DAYS = new Set(weekDayOptions.map((day) => day.value))
const FIELD_TYPES = new Map(Object.entries(fieldTypes as Record<string, Record<string, string[]>>).map(([type, fields]) => [type, new Map(Object.entries(fields))]))
const LEGACY_TYPES = new Map([["start", START_TYPE], ["sendMessage", "envio_pergunta"], ["options", MENU_TYPE], ["finalizar", "finalizar"]])
const REFERENCES = new Map([
  ["departamentos", { id: "departamento", name: "name", noun: "do departamento" }],
  ["tags", { id: "selectedTag", name: "tags", noun: "da tag" }],
  ["flow", { id: "targetFlow", name: "flowName", noun: "do fluxo de destino" }],
])
const TYPE_NAMES: Record<string, string> = { string: "texto", number: "número", boolean: "verdadeiro ou falso", object: "objeto", array: "lista", null: "nulo", undefined: "vazio" }
const handleOrder = new Intl.Collator(undefined, { numeric: true })

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const valueType = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value
const typeName = (type: string) => TYPE_NAMES[type] ?? type

function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let suffix = 1; taken.has(id); suffix++) id = `${base}-${suffix}`
  taken.add(id)
  return id
}

function groupBySource<T extends { source: string }>(edges: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const edge of edges) {
    const group = groups.get(edge.source)
    if (group) group.push(edge)
    else groups.set(edge.source, [edge])
  }
  return groups
}

export function maxNumericId(ids: Iterable<string>): number {
  let max = 1
  for (const id of ids) if (NUMERIC_ID.test(id)) max = Math.max(max, Number(id))
  return max
}

export function nextNodeId(nodes: Array<{ id: string }>, floor = 1): string {
  return String(Math.max(maxNumericId(nodes.map((node) => node.id)), floor) + 1)
}

export function edgeId(source: string, sourceHandle: string | null | undefined, target: string, targetHandle?: string | null): string {
  return `xy-edge__${source}${sourceHandle || ""}-${target}${targetHandle || ""}`
}

function connect(taken: Set<string>, source: string, sourceHandle: string, target: string): AtendimentoEdge {
  return { type: "deletable", source, sourceHandle, target, id: uniqueId(edgeId(source, sourceHandle, target), taken) }
}

export function createEdge(edges: Array<{ id: string }>, source: string, sourceHandle: string, target: string): AtendimentoEdge {
  return connect(new Set(edges.map((edge) => edge.id)), source, sourceHandle, target)
}

export function newNode(type: string, position: XYPosition, id: string): AtendimentoNode {
  const definition = getDefinition(type)
  if (!definition?.defaults) throw new Error(`O componente “${type}” ainda não tem exemplo no formato de Atendimento.`)
  return {
    id,
    type: "custom",
    position: { x: position.x, y: position.y },
    data: { type, data: definition.defaults(), html: getTemplate(type) },
    measured: defaultMeasured(type),
    selected: false,
    dragging: false,
    deletable: type !== START_TYPE,
  }
}

export function newFlow(now = new Date()): AtendimentoFlow {
  return {
    name: "Novo atendimento",
    description: "",
    service_type: "chat",
    created_at: now.toISOString(),
    nodes: [newNode(START_TYPE, { x: 120, y: 120 }, START_ID)],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function duplicateNode(node: AtendimentoNode, id: string): AtendimentoNode {
  const clone = copy(node)
  const { type } = clone.data
  if (type === "timeConditions" && Array.isArray(clone.data.data.timeRules)) {
    clone.data.data.timeRules = clone.data.data.timeRules.map((rule, index) => isObject(rule) ? { ...rule, id: `rule-${Date.now() + index}` } : rule)
  }
  return {
    ...clone,
    id,
    position: { x: node.position.x + 40, y: node.position.y + 40 },
    ...("selected" in clone ? { selected: false } : {}),
    ...("dragging" in clone ? { dragging: false } : {}),
    deletable: true,
  }
}

export function optionIndices(data: JsonObject): number[] {
  return Object.keys(data).filter((key) => TEXT_KEY.test(key)).map((key) => Number(key.slice(5))).sort((a, b) => a - b)
}

function handlesOf(node: OutputNode, edgesFrom: (id: string) => readonly SourceEdge[], options?: number[]): string[] {
  const definition = getDefinition(node.data.type)
  if (!definition) return [...new Set(edgesFrom(node.id).map((edge) => edge.sourceHandle || "output-0"))]
  const count = node.data.type === MENU_TYPE ? (options ?? optionIndices(node.data.data)).length : definition.outputs || 0
  return Array.from({ length: count }, (_, index) => `output-${index}`)
}

function labelOf(node: OutputNode, handle: string, options?: number[]): string {
  const index = Number(handle.replace("output-", ""))
  if (node.data.type === MENU_TYPE) {
    const option = (options ?? optionIndices(node.data.data))[index]
    const text = option === undefined ? undefined : node.data.data[`text-${option}`]
    return nonempty(text) ? text : `Opção ${index + 1}`
  }
  const definition = getDefinition(node.data.type)
  if (!definition) return handle
  return definition.outputLabels?.[index] || "Próximo"
}

export function outputHandles(node: OutputNode, edges: SourceEdge[] = []): string[] {
  return handlesOf(node, (id) => edges.filter((edge) => edge.source === id))
}

export function outputLabel(node: OutputNode, handle: string): string {
  return labelOf(node, handle)
}

function assertShape(value: unknown): asserts value is AtendimentoFlow {
  if (!isObject(value)) throw new Error("O JSON deve conter um objeto de fluxo.")
  for (const key of ["name", "description", "service_type", "created_at"]) {
    if (value[key] === undefined) throw new Error(`Campo obrigatório ausente: ${key}.`)
    if (typeof value[key] !== "string") throw new Error(`O campo ${key} deve ser texto.`)
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error("O fluxo deve conter as listas nodes e edges.")
  if (!isObject(value.viewport) || !finite(value.viewport.x) || !finite(value.viewport.y) || !finite(value.viewport.zoom) || value.viewport.zoom <= 0) {
    throw new Error("Campo viewport inválido: informe x, y e um zoom maior que zero.")
  }
  const nodeIds = new Set<string>()
  for (const [index, node] of value.nodes.entries()) {
    if (!isObject(node) || !nonempty(node.id)) throw new Error(`O ${index + 1}º componente da lista não tem um ID válido.`)
    if (nodeIds.has(node.id)) throw new Error(`ID de componente duplicado: ${node.id}.`)
    nodeIds.add(node.id)
    if (node.type !== "custom" || !isObject(node.data) || !nonempty(node.data.type) || !isObject(node.data.data) || typeof node.data.html !== "string") {
      throw new Error(`Componente ${node.id}: esperado type "custom" e data com type, data e html.`)
    }
    if (!isObject(node.position) || !finite(node.position.x) || !finite(node.position.y)) throw new Error(`Componente ${node.id}: posição inválida.`)
    if (node.measured !== undefined && (!isObject(node.measured) || !finite(node.measured.width) || !finite(node.measured.height))) throw new Error(`Componente ${node.id}: measured deve ter width e height numéricos.`)
    for (const key of ["selected", "dragging", "deletable"]) {
      if (node[key] !== undefined && typeof node[key] !== "boolean") throw new Error(`Componente ${node.id}: ${key} deve ser true ou false.`)
    }
  }
  const edgeIds = new Set<string>()
  for (const [index, edge] of value.edges.entries()) {
    if (!isObject(edge) || !nonempty(edge.id)) throw new Error(`A ${index + 1}ª conexão da lista não tem um ID válido.`)
    if (edgeIds.has(edge.id)) throw new Error(`ID de conexão duplicado: ${edge.id}.`)
    edgeIds.add(edge.id)
    if (!nonempty(edge.source) || !nonempty(edge.target) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Conexão ${edge.id}: componente de origem ou destino inexistente.`)
    if (edge.type !== "deletable") throw new Error(`Conexão ${edge.id}: esperado type "deletable".`)
    if (!nonempty(edge.sourceHandle)) throw new Error(`Conexão ${edge.id}: sourceHandle obrigatório.`)
    if (edge.targetHandle !== undefined && edge.targetHandle !== null && typeof edge.targetHandle !== "string") throw new Error(`Conexão ${edge.id}: targetHandle inválido.`)
  }
}

function layoutLeftToRight(flow: AtendimentoFlow) {
  const outgoing = groupBySource(flow.edges)
  const depth = new Map<string, number>([[START_ID, 0]])
  let deepest = 0
  for (const [id, level] of depth) {
    deepest = Math.max(deepest, level)
    const edges = (outgoing.get(id) ?? []).sort((a, b) => handleOrder.compare(a.sourceHandle, b.sourceHandle))
    for (const edge of edges) if (!depth.has(edge.target)) depth.set(edge.target, level + 1)
  }
  const rows = new Map<number, number>()
  for (const node of flow.nodes) {
    const column = depth.get(node.id) ?? deepest + 1
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    node.position = { x: 120 + column * 380, y: 120 + row * 260 }
  }
}

function legacyMenu(id: string, data: Record<string, unknown>): JsonObject {
  if (!Array.isArray(data.options) || data.options.length === 0) throw new Error(`Menu ${id}: informe ao menos uma opção.`)
  if (data.options.length > MENU_OPTION_LIMIT) throw new Error(`Menu ${id}: o limite é de ${MENU_OPTION_LIMIT} opções.`)
  const payload: JsonObject = { message: "", buttons: "false", "df-channel": "" }
  data.options.forEach((option, index) => {
    if (!isObject(option) || !nonempty(option.text)) throw new Error(`Menu ${id}: a opção ${index + 1} não tem título.`)
    payload[`opt-${index + 1}`] = String(option.digit ?? index + 1)
    payload[`text-${index + 1}`] = String(option.text)
    payload[`description-${index + 1}`] = String(option.description ?? "")
  })
  payload.title = String(data.message ?? "")
  return payload
}

function migrateLegacy(value: Record<string, unknown>): AtendimentoFlow {
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error("Formato antigo inválido: nodes e edges são obrigatórios.")
  const seen = new Set<string>()
  const entries = value.nodes.map((original: unknown, index: number) => {
    if (!isObject(original) || !nonempty(original.id) || !isObject(original.data) || !isObject(original.position) || !finite(original.position.x) || !finite(original.position.y)) throw new Error(`O ${index + 1}º componente do formato antigo é inválido.`)
    const legacy = String(original.type)
    const type = LEGACY_TYPES.get(legacy)
    if (!type) throw new Error(`O componente antigo “${legacy}” (${original.id}) não tem equivalente no formato de Atendimento.`)
    if (seen.has(original.id)) throw new Error(`Formato antigo inválido: ID duplicado ${original.id}.`)
    seen.add(original.id)
    return { id: original.id, start: original.type === "start", legacy, type, data: original.data, position: { x: original.position.x, y: original.position.y } }
  })
  if (entries.filter((entry) => entry.start).length !== 1) throw new Error("Formato antigo inválido: o fluxo deve ter exatamente um início.")

  const flow = newFlow()
  flow.name = nonempty(value.name) ? value.name : "Fluxo importado"
  if (typeof value.description === "string") flow.description = value.description
  const ids = new Map<string, string>()
  const finals = new Map<string, AtendimentoNode>()
  let counter = 1
  flow.nodes = entries.map(({ id, type, data, position }) => {
    const node = newNode(type, position, type === START_TYPE ? START_ID : String(++counter))
    ids.set(id, node.id)
    if (type === "envio_pergunta") node.data.data.template = String(data.message ?? "")
    if (type === MENU_TYPE) node.data.data = legacyMenu(id, data)
    const finalMessage = data.message ?? data.finalMessage
    if (type === "finalizar" && nonempty(finalMessage)) {
      const message = newNode("envio_pergunta", position, "")
      message.data.data.template = finalMessage
      finals.set(node.id, message)
    }
    return node
  })
  for (const message of finals.values()) {
    message.id = String(++counter)
    flow.nodes.push(message)
  }

  const kinds = new Map(entries.map((entry) => [entry.id, entry.legacy]))
  const used = new Map<string, Set<string>>()
  for (const edge of value.edges) if (isObject(edge) && nonempty(edge.source) && nonempty(edge.sourceHandle)) used.set(edge.source, (used.get(edge.source) ?? new Set<string>()).add(edge.sourceHandle))
  const taken = new Set<string>()
  const edges: AtendimentoEdge[] = []
  for (const [index, edge] of value.edges.entries()) {
    if (!isObject(edge) || !nonempty(edge.source) || !nonempty(edge.target)) throw new Error(`A ${index + 1}ª conexão do formato antigo é inválida.`)
    const source = ids.get(edge.source)
    const finish = ids.get(edge.target)
    if (!source || !finish) throw new Error(`A ${index + 1}ª conexão do formato antigo aponta para um componente inexistente.`)
    let handle = nonempty(edge.sourceHandle) ? edge.sourceHandle : "output-0"
    if (!nonempty(edge.sourceHandle) && kinds.get(edge.source) === "options") {
      const busy = used.get(edge.source) ?? new Set<string>()
      let position = 0
      while (busy.has(`output-${position}`)) position++
      handle = `output-${position}`
      used.set(edge.source, busy.add(handle))
    }
    edges.push(connect(taken, source, handle, finals.get(finish)?.id || finish))
  }
  for (const [finish, message] of finals) edges.push(connect(taken, message.id, "output-0", finish))
  flow.edges = edges
  layoutLeftToRight(flow)
  return flow
}

export function nextOptionDigit(data: JsonObject): string {
  const digits = new Set(optionIndices(data).map((index) => String(data[`opt-${index}`] ?? "").trim()))
  let candidate = digits.size + 1
  while (digits.has(String(candidate))) candidate++
  return String(candidate)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    throw new Error(text.trim() ? "Arquivo JSON inválido: confira se o conteúdo está completo e sem erros de sintaxe." : "O arquivo JSON está vazio.")
  }
}

function snapshot(input: unknown): unknown {
  if (input === undefined) return undefined
  try {
    return copy(input)
  } catch {
    throw new Error("O fluxo contém valores que não podem ser convertidos em JSON.")
  }
}

function isLegacy(value: unknown): value is Record<string, unknown> {
  return isObject(value) && Array.isArray(value.nodes) && value.nodes.length > 0
    && !value.nodes.some((node) => isObject(node) && (node.type === "custom" || (isObject(node.data) && typeof node.data.type === "string")))
}

export function importFlow(input: unknown): AtendimentoFlow {
  let value = typeof input === "string" ? parseJson(input) : snapshot(input)
  if (isObject(value) && isObject(value.flowData)) value = value.flowData
  if (isLegacy(value)) value = migrateLegacy(value)
  assertShape(value)
  for (const node of value.nodes) {
    if (node.measured === undefined) node.measured = defaultMeasured(node.data.type)
    if (node.selected === undefined) node.selected = false
    if (node.deletable === undefined) node.deletable = node.data.type !== START_TYPE
  }
  return value
}

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function checkFieldTypes(type: string, data: JsonObject, report: Report) {
  const schema = FIELD_TYPES.get(type)
  for (const [key, value] of Object.entries(data)) {
    const expected = schema?.get(key) ?? (type === MENU_TYPE && OPTION_KEY.test(key) ? ["string"] : undefined)
    const actual = valueType(value)
    if (expected && !expected.includes(actual)) report(`Campo ${key}: esperado ${expected.map(typeName).join(" ou ")}, recebido ${typeName(actual)}.`)
  }
}

function checkMenu(data: JsonObject, options: number[], report: Report) {
  if (!nonempty(data.title)) report("Preencha a mensagem do menu.")
  else if (data.title.length > MENU_TITLE_LIMIT) report(`A mensagem do menu tem ${data.title.length} caracteres; o limite é ${MENU_TITLE_LIMIT}.`)
  if (options.length < 1 || options.length > MENU_OPTION_LIMIT) report(`O menu deve ter de 1 a ${MENU_OPTION_LIMIT} opções.`)
  if (options.some((option, position) => option !== position + 1)) report("As opções devem usar chaves consecutivas (text-1, text-2…).")
  const digits = new Set<string>()
  options.forEach((option, position) => {
    if (!nonempty(data[`text-${option}`])) report(`Opção ${position + 1}: informe o título.`)
    if (!nonempty(data[`opt-${option}`])) report(`Opção ${position + 1}: informe o número.`)
    const digit = String(data[`opt-${option}`] ?? "").trim()
    if (digit && digits.has(digit)) report(`O número de opção ${digit} está repetido.`)
    digits.add(digit)
  })
  const present = new Set(options)
  for (const key of Object.keys(data)) {
    const match = OPTION_KEY.exec(key)
    if (match && !present.has(Number(match[2]))) report(`Campo ${key} sem a opção correspondente text-${match[2]}.`)
  }
  if (data.buttons !== "true" && data.buttons !== "false") report("O campo buttons deve ser o texto \"true\" ou \"false\".")
}

function checkTimeRules(rules: JsonValue | undefined, report: Report) {
  if (!Array.isArray(rules) || rules.length === 0) {
    report("Cadastre ao menos uma regra de horário.")
    return
  }
  rules.forEach((rule, index) => {
    const label = `Regra de horário ${index + 1}`
    if (!isObject(rule)) report(`${label} inválida.`)
    else if (!nonempty(rule.id)) report(`${label}: ID ausente.`)
    else if (!Array.isArray(rule.weekDays) || rule.weekDays.length === 0) report(`${label}: selecione ao menos um dia.`)
    else if (!rule.weekDays.every((day) => WEEK_DAYS.has(String(day)))) report(`${label}: dia da semana inválido.`)
    else if (!TIME.test(String(rule.startTime)) || !TIME.test(String(rule.endTime))) report(`${label}: informe início e fim no formato HH:MM.`)
    else if (String(rule.startTime) > String(rule.endTime)) report(`${label}: o início não pode ser posterior ao fim.`)
  })
}

function checkPayload(type: string, data: JsonObject, options: number[] | undefined, report: Report) {
  if (type === "envio_pergunta" && !nonempty(data.template)) report("Preencha a mensagem.")
  if (options) checkMenu(data, options, report)
  const reference = REFERENCES.get(type)
  if (reference) {
    if (!nonempty(data[reference.id])) report(`Informe o ID ${reference.noun}.`)
    else if (data.id !== data[reference.id]) report(`O campo id deve ser igual ao ID ${reference.noun}.`, "warning")
    if (!nonempty(data[reference.name])) report(`Informe o nome ${reference.noun}.`, "warning")
  }
  if (type === "protocolo" && data.opt === "URL" && !nonempty(data.url_api)) report("Informe a URL da API de protocolo.")
  if (type === "solicitar_dados" && !nonempty(data.text)) report("Preencha a mensagem de solicitação.", "warning")
  if (API_TYPES.has(type)) {
    if (!nonempty(data.url_api)) report("Informe a URL da API.")
    else if (!isHttpUrl(data.url_api)) report("Informe uma URL válida, iniciada por http:// ou https://.")
    if (!HTTP_METHODS.includes(String(data.method))) report("Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.")
  }
  if (type === "timeConditions") checkTimeRules(data.timeRules, report)
}

export function validateFlow(flow: AtendimentoFlow): FlowIssue[] {
  try {
    assertShape(flow)
  } catch (error) {
    return [{ severity: "error", message: (error as Error).message }]
  }
  const issues: FlowIssue[] = []
  const reported = new Set<string>()
  const add = (message: string, nodeId?: string, severity: FlowIssue["severity"] = "error") => {
    const key = JSON.stringify([severity, nodeId ?? null, message])
    if (reported.has(key)) return
    reported.add(key)
    issues.push({ severity, message, nodeId })
  }
  if (!nonempty(flow.name)) add("Informe o nome do fluxo.")
  if (!nonempty(flow.service_type)) add("Informe o tipo de serviço do fluxo (padrão: chat).")
  const starts = flow.nodes.filter((node) => node.data.type === START_TYPE)
  if (starts.length === 0) add("Adicione o componente Iniciar Fluxo.")
  if (starts.length > 1) add("O fluxo deve ter um único componente Iniciar Fluxo.")
  for (const start of starts) if (start.id !== START_ID) add(`O ID deste componente deve ser "${START_ID}".`, start.id)

  const outgoing = groupBySource(flow.edges)
  const edgesFrom = (id: string) => outgoing.get(id) ?? []
  const outputs = new Map<string, NodeOutputs>(flow.nodes.map((node) => {
    const options = node.data.type === MENU_TYPE ? optionIndices(node.data.data) : undefined
    return [node.id, { node, options, handles: new Set(handlesOf(node, edgesFrom, options)) }]
  }))

  const used = new Map<string, Set<string>>()
  const incoming = new Map<string, number>()
  for (const edge of flow.edges) {
    const source = outputs.get(edge.source)!
    const target = outputs.get(edge.target)!.node
    if (!source.handles.has(edge.sourceHandle)) add(`A saída ${edge.sourceHandle} não existe neste componente.`, edge.source)
    if (target.data.type === START_TYPE) add("Este componente não pode receber conexões.", edge.target)
    if (edge.source === edge.target) add("O componente não pode se conectar a ele mesmo.", edge.source)
    const handles = used.get(edge.source) ?? new Set<string>()
    if (handles.has(edge.sourceHandle)) add(`A saída “${labelOf(source.node, edge.sourceHandle, source.options)}” tem mais de um destino.`, edge.source)
    used.set(edge.source, handles.add(edge.sourceHandle))
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  }

  const reachable = new Set(starts.map((node) => node.id))
  for (const id of reachable) for (const edge of edgesFrom(id)) reachable.add(edge.target)

  for (const { node, options, handles } of outputs.values()) {
    const { type, data } = node.data
    const report: Report = (message, severity) => add(message, node.id, severity)
    checkFieldTypes(type, data, report)
    if (!getDefinition(type)) report("Tipo preservado do arquivo, sem exemplo no formato de Atendimento.", "warning")
    if (!reachable.has(node.id)) report("Componente desconectado do início.")
    if ((incoming.get(node.id) ?? 0) > 1) report("O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.", "warning")
    const connected = used.get(node.id)
    for (const handle of handles) if (!connected?.has(handle)) report(`Conecte a saída “${labelOf(node, handle, options)}”.`)
    checkPayload(type, data, options, report)
  }
  return issues
}

function describeIssues(flow: AtendimentoFlow, issues: FlowIssue[]): string {
  const nodes = new Map<string, AtendimentoNode>(issues.some((issue) => issue.nodeId) ? flow.nodes.map((node) => [node.id, node]) : [])
  return issues.map(({ message, nodeId }) => {
    if (!nodeId) return message
    const node = nodes.get(nodeId)
    return `${node ? `${getComponentLabel(node.data.type)} · ` : ""}ID ${nodeId}: ${message}`
  }).join("\n")
}

export function cleanDocument(flow: AtendimentoFlow): AtendimentoFlow {
  return {
    ...flow,
    nodes: flow.nodes.map((node) => Object.fromEntries(Object.entries(node).map(([key, value]) => [key, key === "selected" || key === "dragging" ? false : value])) as AtendimentoNode),
  }
}

export function exportFlow(flow: AtendimentoFlow): string {
  const errors = validateFlow(flow).filter((issue) => issue.severity === "error")
  if (errors.length) throw new Error(describeIssues(flow, errors))
  return JSON.stringify(cleanDocument(flow), null, 2)
}

export function stampExport(flow: AtendimentoFlow, now = new Date()): AtendimentoFlow {
  return { ...flow, created_at: now.toISOString() }
}

export function exportFileName(flow: Pick<AtendimentoFlow, "name" | "created_at">): string {
  return `${flow.name.trim() || "Atendimento"}-${flow.created_at.slice(0, 10)}.json`
}

export function behaviorSignature(flow: Pick<AtendimentoFlow, "nodes" | "edges">): string {
  return JSON.stringify([
    flow.nodes.map((node) => [node.id, node.data.type, node.data.data]),
    flow.edges.map((edge) => [edge.source, edge.sourceHandle, edge.target]),
  ])
}

export function removeMenuOption(flow: AtendimentoFlow, nodeId: string, option: number): AtendimentoFlow {
  const node = flow.nodes.find((entry) => entry.id === nodeId)
  if (!node || node.data.type !== MENU_TYPE) return flow
  const indices = optionIndices(node.data.data)
  const removed = indices.indexOf(option)
  if (indices.length <= 1 || removed < 0) return flow
  const positions = new Map<number, number>()
  indices.filter((index) => index !== option).forEach((index, position) => { if (!positions.has(index)) positions.set(index, position + 1) })
  const sequential = indices.every((index, position) => String(node.data.data[`opt-${index}`] ?? "").trim() === String(position + 1))
  const data: JsonObject = {}
  for (const [key, value] of Object.entries(node.data.data)) {
    const match = OPTION_KEY.exec(key)
    if (!match) {
      data[key] = value
      continue
    }
    const position = positions.get(Number(match[2]))
    if (position === undefined) continue
    data[`${match[1]}-${position}`] = sequential && match[1] === "opt" ? String(position) : value
  }
  const taken = new Set<string>()
  const edges: AtendimentoEdge[] = []
  for (const edge of flow.edges) {
    let next = edge
    if (edge.source === nodeId) {
      const index = Number(edge.sourceHandle.replace("output-", ""))
      if (index === removed) continue
      if (index > removed) {
        const handle = `output-${index - 1}`
        const followsPattern = edge.id === edgeId(edge.source, edge.sourceHandle, edge.target)
        next = { ...edge, sourceHandle: handle, id: followsPattern ? edgeId(edge.source, handle, edge.target) : edge.id }
      }
    }
    const id = uniqueId(next.id, taken)
    edges.push(id === next.id ? next : { ...next, id })
  }
  return {
    ...flow,
    nodes: flow.nodes.map((entry) => entry.id === nodeId ? { ...entry, data: { ...entry.data, data } } : entry),
    edges,
  }
}
