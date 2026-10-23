import type { XYPosition } from "reactflow"
import { MENU_TYPE, NOTE_TYPE, START_ID, START_TYPE, defaultMeasured, getComponentLabel, getDefinition, getNodeType, getTemplate, weekDayOptions } from "./catalog"
import fieldTypes from "./field-types.json"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, FlowIssue, JsonObject, JsonValue } from "./types"
import { variableWarnings } from "./variables"

type OutputNode = Pick<AtendimentoNode, "id" | "data">
type SourceEdge = { source: string; sourceHandle?: string | null }
type Severity = FlowIssue["severity"]
type Report = (message: string, severity?: Severity, ...fields: string[]) => void
type Check = (rules: Rules) => void

interface NodeOutputs {
  node: AtendimentoNode
  keys?: number[]
  handles: Set<string>
}

interface Outputs {
  count: number
  label: (index: number) => string
}

interface Rules {
  data: JsonObject
  keys?: number[]
  report: Report
  nodes: ReadonlyMap<string, AtendimentoNode>
}

const CONDITIONS_TYPE = "multiple_condicional_api"
const MENU_OPTIONS_FIELD = "options"
const CONDITIONS_FIELD = "conditions"
const MENU_OPTION_LIMIT = 10
const MENU_TITLE_LIMIT = 1024
const CONDITION_LIMIT = 20
const NUMERIC_ID = /^\d+$/
const OPTION_KEY = /^(opt|text|description)-(\d+)$/
const CONDITION_KEY = /^(var|value)-(\d+)$/
const OUTPUT_HANDLE = /^output-(\d+)$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const DELAY = /^[1-9]\d*$/
const DECIMAL = /^\d+([.,]\d+)?$/
const SIGNED_DECIMAL = /^-?\d+([.,]\d+)?$/
const CURRENCY = /^[A-Z]{3}$/
const ATTEMPTS = /^[1-5]$/
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
const DATA_KINDS = ["CPF/CNPJ", "CPF", "CNPJ", "other"]
const COMPARISONS = ["Igual a", "Diferente de"]
const DATASTORES = ["contact", "datastore"]
const INVOICE_MODES = ["Enviar Todos", "Enviar Menu", "Catalog"]
const TICKET_ACTIONS = ["enableComment", "enableReopen", "enableClose", "enableCsat"]
const INVALID_URL = "Informe uma URL válida, iniciada por http:// ou https://."
const WAIT_TYPE = "waitForAnswer"
const QUESTION_TYPE = "envio_pergunta"
export const WAIT_QUESTION_MESSAGE = "Coloque um Enviar Mensagem com a pergunta logo antes do Aguardando Mensagem."
const WEEK_DAYS = new Set(weekDayOptions.map((day) => day.value))
const FIELD_TYPES = new Map(Object.entries(fieldTypes as Record<string, Record<string, string[]>>).map(([type, fields]) => [type, new Map(Object.entries(fields))]))
const LEGACY_TYPES = new Map([["start", START_TYPE], ["sendMessage", "envio_pergunta"], ["options", MENU_TYPE], ["finalizar", "finalizar"]])
const TEMPLATE_REFERENCE = { id: "templateMessage", name: "templateName", noun: "do template" }
const REFERENCES = new Map([
  ["departamentos", { id: "departamento", name: "name", noun: "do departamento" }],
  ["tags", { id: "selectedTag", name: "tags", noun: "da tag" }],
  ["flow", { id: "targetFlow", name: "flowName", noun: "do fluxo de destino" }],
  ["transferir", { id: "agente", name: "agenteName", noun: "do agente" }],
  ["backToAgent", { id: "department", name: "departmentName", noun: "do departamento" }],
  ["templateMessage", TEMPLATE_REFERENCE],
  ["templateInteractive", TEMPLATE_REFERENCE],
  ["pixCharge", TEMPLATE_REFERENCE],
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
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const filled = (value: unknown) => typeof value === "number" || nonempty(value)
const positiveInteger = (value: unknown) => typeof value === "number" ? Number.isInteger(value) && value > 0 : typeof value === "string" && NUMERIC_ID.test(value.trim()) && Number(value) > 0
const optionalType = (value: Record<string, unknown>, key: string, type: string) => !has(value, key) || valueType(value[key]) === type

function requireText(data: JsonObject, key: string, message: string, report: Report, severity: Severity = "warning", ...related: string[]) {
  if (!nonempty(data[key])) report(message, severity, ...related, key)
}

function checkUrl(data: JsonObject, key: string, report: Report, missing?: string, invalid: Severity = "error", absent: Severity = "warning") {
  const value = data[key]
  if (!nonempty(value)) {
    if (missing) report(missing, absent, key)
  } else if (!isHttpUrl(value)) report(INVALID_URL, invalid, key)
}

function checkFlag(data: JsonObject, key: string, report: Report) {
  if (has(data, key) && data[key] !== "true" && data[key] !== "false") report(`O campo ${key} deve ser o texto "true" ou "false".`, "error", key)
}

function checkSpaces(data: JsonObject, key: string, report: Report) {
  const value = data[key]
  if (typeof value === "string" && /\s/.test(value)) report("O nome da variável não pode ter espaços.", "warning", key)
}

function checkVariable(data: JsonObject, key: string, report: Report, missing?: string) {
  const value = data[key]
  if (!nonempty(value)) {
    if (missing) report(missing, "warning", key)
    return
  }
  checkSpaces(data, key, report)
  if (/[{}]/.test(value)) report("Informe só o nome da variável, sem {{ }}.", "warning", key)
}

function checkWhole(data: JsonObject, key: string, message: string, report: Report) {
  const value = data[key]
  if (typeof value === "number" && !(Number.isInteger(value) && value >= 0)) report(message, "warning", key)
}

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
  const node = { id, type: getNodeType(type), position: { x: position.x, y: position.y }, data: { type, data: definition.defaults(), html: getTemplate(type) } }
  if (type === START_TYPE) return { ...node, deletable: false, measured: defaultMeasured(type), selected: false, dragging: false }
  return { ...node, measured: defaultMeasured(type), selected: false, dragging: false }
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
    ...("deletable" in clone ? { deletable: true } : {}),
  }
}

function indexedKeys(data: JsonObject, key: string): number[] {
  const prefix = `${key}-`
  return Object.keys(data).flatMap((name) => name.startsWith(prefix) && NUMERIC_ID.test(name.slice(prefix.length)) ? [Number(name.slice(prefix.length))] : []).sort((a, b) => a - b)
}

export function optionIndices(data: JsonObject): number[] {
  return indexedKeys(data, "text")
}

export function conditionIndices(data: JsonObject): number[] {
  return indexedKeys(data, "var")
}

function outputKeys(node: OutputNode): number[] | undefined {
  const rule = getDefinition(node.data.type)?.outputRule
  return rule?.kind === "indexedKeys" ? indexedKeys(node.data.data, rule.key) : undefined
}

const listOf = (value: JsonValue | undefined): JsonValue[] => Array.isArray(value) ? value : []

function outputsOf(node: OutputNode, keys?: number[]): Outputs | undefined {
  const { data } = node.data
  const definition = getDefinition(node.data.type)
  if (!definition) return undefined
  const rule = definition.outputRule
  if (!rule) return { count: definition.outputs || 0, label: (index) => definition.outputLabels?.[index] || "Próximo" }
  const fallback = (index: number) => rule.fallbackLabel.replace("{n}", String(index + 1))
  if (rule.kind === "indexedKeys") {
    const indices = keys ?? indexedKeys(data, rule.key)
    return { count: indices.length, label: (index) => {
      const main = data[`${rule.key}-${indices[index]}`]
      const pair = rule.pairKey ? data[`${rule.pairKey}-${indices[index]}`] : undefined
      if (!rule.pairKey) return nonempty(main) ? main : fallback(index)
      return nonempty(main) && nonempty(pair) ? `${main} = ${pair}` : fallback(index)
    } }
  }
  const items = listOf(data[rule.key])
  const trailing = rule.trailing ?? []
  return { count: items.length + trailing.length, label: (index) => {
    if (index >= items.length) return trailing[index - items.length]
    const item = items[index]
    const text = isObject(item) && rule.labelKey ? item[rule.labelKey] : undefined
    return nonempty(text) ? text : fallback(index)
  } }
}

function handleIndex(handle: string): number {
  const match = OUTPUT_HANDLE.exec(handle)
  return match ? Number(match[1]) : -1
}

function handlesOf(node: OutputNode, edgesFrom: (id: string) => readonly SourceEdge[], keys?: number[]): string[] {
  const outputs = outputsOf(node, keys)
  if (!outputs) return [...new Set(edgesFrom(node.id).map((edge) => edge.sourceHandle || "output-0"))]
  return Array.from({ length: outputs.count }, (_, index) => `output-${index}`)
}

function labelOf(node: OutputNode, handle: string, keys?: number[]): string {
  const outputs = outputsOf(node, keys)
  const index = handleIndex(handle)
  return outputs && index >= 0 && index < outputs.count ? outputs.label(index) : handle
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
    if (!nonempty(node.type) || !isObject(node.data) || !nonempty(node.data.type) || !isObject(node.data.data) || typeof node.data.html !== "string") {
      throw new Error(`Componente ${node.id}: esperado type em texto e data com type, data e html.`)
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
  const patterns = Object.entries(getDefinition(type)?.fieldTypePatterns ?? {}).map(([pattern, types]) => [new RegExp(pattern), types] as const)
  for (const [key, value] of Object.entries(data)) {
    const expected = schema?.get(key) ?? patterns.find(([pattern]) => pattern.test(key))?.[1]
    const actual = valueType(value)
    if (expected && !expected.includes(actual)) report(`Campo ${key}: esperado ${expected.map(typeName).join(" ou ")}, recebido ${typeName(actual)}.`, "error", key)
  }
}

function checkMenu({ data, keys, report }: Rules) {
  const options = keys ?? optionIndices(data)
  if (!nonempty(data.title)) report("Preencha a mensagem do menu.", "error", "title")
  else if (data.title.length > MENU_TITLE_LIMIT) report(`A mensagem do menu tem ${data.title.length} caracteres; o limite é ${MENU_TITLE_LIMIT}.`, "error", "title")
  if (options.length < 1 || options.length > MENU_OPTION_LIMIT) report(`O menu deve ter de 1 a ${MENU_OPTION_LIMIT} opções.`, "error", MENU_OPTIONS_FIELD)
  if (options.some((option, position) => option !== position + 1)) report("As opções devem usar chaves consecutivas (text-1, text-2…).", "error", MENU_OPTIONS_FIELD)
  const digits = new Map<string, string>()
  options.forEach((option, position) => {
    const key = `opt-${option}`
    if (!nonempty(data[`text-${option}`])) report(`Opção ${position + 1}: informe o título.`, "error", `text-${option}`)
    if (!nonempty(data[key])) report(`Opção ${position + 1}: informe o número.`, "error", key)
    const digit = String(data[key] ?? "").trim()
    const first = digits.get(digit)
    if (digit && first) report(`O número de opção ${digit} está repetido.`, "error", first, key)
    if (first === undefined) digits.set(digit, key)
  })
  const present = new Set(options)
  for (const key of Object.keys(data)) {
    const match = OPTION_KEY.exec(key)
    if (match && !present.has(Number(match[2]))) report(`Campo ${key} sem a opção correspondente text-${match[2]}.`, "error", key)
  }
  checkFlag(data, "buttons", report)
}

function checkConditions({ data, keys, report }: Rules) {
  const conditions = keys ?? conditionIndices(data)
  if (conditions.length === 0) report("Cadastre ao menos uma condição.", "warning", CONDITIONS_FIELD)
  if (conditions.length > CONDITION_LIMIT) report(`O limite é de ${CONDITION_LIMIT} condições.`, "warning", CONDITIONS_FIELD)
  if (conditions.some((condition, position) => condition !== position + 1)) report("As condições devem usar chaves consecutivas (var-1, var-2…).", "warning", CONDITIONS_FIELD)
  conditions.forEach((condition, position) => {
    if (!nonempty(data[`var-${condition}`])) report(`Condição ${position + 1}: informe a variável.`, "warning", `var-${condition}`)
    if (!has(data, `value-${condition}`)) report(`Campo var-${condition} sem o valor value-${condition}.`, "warning", `value-${condition}`)
  })
  const present = new Set(conditions)
  for (const key of Object.keys(data)) {
    const match = CONDITION_KEY.exec(key)
    if (match && match[1] === "value" && !present.has(Number(match[2]))) report(`Campo ${key} sem a variável var-${match[2]}.`, "warning", key)
  }
}

function checkTimeRules({ data, report }: Rules) {
  const rules = data.timeRules
  if (!Array.isArray(rules) || rules.length === 0) {
    report("Cadastre ao menos uma regra de horário.", "error", "timeRules")
    return
  }
  rules.forEach((rule, index) => {
    const label = `Regra de horário ${index + 1}`
    const path = `timeRules.${index}`
    const times = [`${path}.startTime`, `${path}.endTime`]
    if (!isObject(rule)) report(`${label} inválida.`, "error", path)
    else if (!nonempty(rule.id)) report(`${label}: ID ausente.`, "error", `${path}.id`)
    else if (!Array.isArray(rule.weekDays) || rule.weekDays.length === 0) report(`${label}: selecione ao menos um dia.`, "error", `${path}.weekDays`)
    else if (!rule.weekDays.every((day) => WEEK_DAYS.has(String(day)))) report(`${label}: dia da semana inválido.`, "error", `${path}.weekDays`)
    else if (!TIME.test(String(rule.startTime)) || !TIME.test(String(rule.endTime))) report(`${label}: informe início e fim no formato HH:MM.`, "error", ...times)
    else if (String(rule.startTime) > String(rule.endTime)) report(`${label}: o início não pode ser posterior ao fim.`, "error", ...times)
  })
}

function checkPaths({ data, report }: Rules) {
  const paths = data.paths
  if (!Array.isArray(paths) || paths.length < 2) report("Cadastre ao menos dois caminhos.", "error", "paths")
  if (Array.isArray(paths) && paths.length) {
    let total = 0
    let weighted = true
    paths.forEach((path, index) => {
      const weight = isObject(path) ? path.weight : undefined
      if (!finite(weight) || weight < 0) {
        weighted = false
        report(`Caminho ${index + 1}: informe um peso numérico.`, "error", isObject(path) ? `paths.${index}.weight` : `paths.${index}`)
      } else total += weight
      if (isObject(path) && !nonempty(path.label)) report(`Caminho ${index + 1}: informe o nome.`, "warning", `paths.${index}.label`)
    })
    if (weighted && total === 0) report("A soma dos pesos deve ser maior que zero.", "error", "paths")
    else if (weighted && Math.abs(total - 100) > 1e-9) report(`Os pesos somam ${(Math.round(total * 100) / 100).toLocaleString("pt-BR")}; o total esperado é 100.`, "warning", "paths")
  }
  checkSpaces(data, "variable", report)
}

function checkAgent({ data, report }: Rules) {
  requireText(data, "generative_ai", "Informe o ID do agente de IA.", report)
  if (nonempty(data.generative_ai)) requireText(data, "generativeAiName", "Informe o nome do agente de IA.", report)
  const exits = data.exits
  if (Array.isArray(exits)) {
    if (exits.length === 0) report("Cadastre ao menos uma saída para o agente.", "warning", "exits")
    const names = new Map<string, string>()
    exits.forEach((exit, index) => {
      const label = `Saída ${index + 1} do agente`
      const path = `exits.${index}`
      if (!isObject(exit) || !optionalType(exit, "name", "string") || !optionalType(exit, "when", "string") || !optionalType(exit, "requireFields", "boolean")) {
        report(`${label} inválida: nome e condição devem ser texto e a exigência de campos, verdadeiro ou falso.`, "error", path)
        return
      }
      if (!nonempty(exit.name)) report(`${label}: informe o nome.`, "error", `${path}.name`)
      else {
        const name = exit.name.trim().toLocaleLowerCase("pt-BR")
        const first = names.get(name)
        if (first) report(`O nome de saída ${exit.name.trim()} está repetido.`, "warning", first, `${path}.name`)
        else names.set(name, `${path}.name`)
      }
      if (!nonempty(exit.when)) report(`${label}: descreva quando usar.`, "warning", `${path}.when`)
    })
  }
  checkWhole(data, "maxTurns", "O máximo de turnos deve ser um número inteiro, a partir de 0.", report)
  checkWhole(data, "timeoutMinutes", "O tempo limite deve ser um número inteiro de minutos, a partir de 0.", report)
}

function checkReturn({ data, report, nodes }: Rules) {
  const target = data.targetNodeId
  if (!nonempty(target)) {
    report("Selecione o menu de destino.", "warning", "targetNodeId")
    return
  }
  const node = nodes.get(target)
  if (!node) report("O menu de destino não existe mais no fluxo.", "warning", "targetNodeId")
  else if (node.data.type !== MENU_TYPE) report("O destino deve ser um Menu de Opções.", "warning", "targetNodeId")
  if (data.id !== target) report("O campo id deve ser igual ao menu de destino.", "warning", "id")
}

function checkReference(type: string, { data, report }: Rules) {
  const reference = REFERENCES.get(type)
  if (!reference) return
  if (!nonempty(data[reference.id])) report(`Informe o ID ${reference.noun}.`, "warning", reference.id)
  else if (data.id !== data[reference.id]) report(`O campo id deve ser igual ao ID ${reference.noun}.`, "warning", "id")
  if (!nonempty(data[reference.name])) report(`Informe o nome ${reference.noun}.`, "warning", reference.name)
}

function checkChoiceList(noun: string, list: string) {
  return ({ data, report }: Rules) => {
    checkVariable(data, "outputVar", report, "Informe a variável de saída.")
    requireText(data, "headerMessage", "Preencha a mensagem da lista.", report)
    requireText(data, "emptyMessage", `Preencha a mensagem sem ${noun}.`, report)
    const ids = data.selectedIds
    if (list && Array.isArray(ids) && !ids.every(nonempty)) report(`Cada item de ${list} oferecidos deve ser um ID em texto.`, "warning", ...ids.flatMap((id, index) => nonempty(id) ? [] : [`selectedIds.${index}`]))
  }
}

function checkApi({ data, report }: Rules) {
  checkUrl(data, "url_api", report, "Informe a URL da API.")
  if (has(data, "method") && !HTTP_METHODS.includes(String(data.method))) report("Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.", "error", "method")
}

function checkValidatedApi(rules: Rules) {
  checkApi(rules)
  if (rules.data.isApiValidated === false && nonempty(rules.data.url_api)) rules.report("API não validada: use Validar API no componente ou valide na plataforma.", "warning")
}

const CHECKS = new Map<string, Check>([
  ["envio_pergunta", ({ data, report }) => requireText(data, "template", "Preencha a mensagem.", report, "error")],
  [MENU_TYPE, checkMenu],
  ["envio_arquivo", ({ data, report }) => {
    checkUrl(data, "url", report, "Informe a URL do arquivo.", "warning")
    if (nonempty(data.url) && !nonempty(data.mime_type)) report("Informe o tipo do arquivo (MIME).", "warning", "mime_type")
    if (data.voice_note === true && nonempty(data.mime_type) && !data.mime_type.trim().toLowerCase().startsWith("audio/")) report("Mensagem de voz exige um arquivo de áudio.", "warning", "mime_type", "voice_note")
  }],
  ["envio_imagem", ({ data, report }) => {
    if (!nonempty(data.imagem) && !nonempty(data.url)) report("Informe a URL da imagem.", "warning", "imagem", "url")
    for (const key of ["imagem", "url"]) checkUrl(data, key, report, undefined, "warning")
  }],
  ["whatsappFlow", ({ data, report }) => {
    const form = nonempty(data.formId) || nonempty(data.metaFlowId)
    const interactive = (has(data, "sendMode") ? data.sendMode : "interactive") === "interactive"
    if (!form) report("Informe o ID do formulário ou o ID do Flow na Meta.", "warning", "formId", "metaFlowId")
    else if (interactive) {
      requireText(data, "body", "Preencha o corpo da mensagem.", report)
      requireText(data, "cta", "Informe o texto do botão.", report)
    }
    if (!interactive) requireText(data, "templateName", "Informe o nome do template.", report)
    requireText(data, "outputVar", "Informe a variável da resposta.", report)
    if (typeof data.maxReminders === "number" && !(Number.isInteger(data.maxReminders) && data.maxReminders >= 0)) report("O máximo de lembretes deve ser um número inteiro a partir de 0.", "error", "maxReminders")
  }],
  ["whatsappCall", ({ data, report }) => {
    if (data.mode === "button") requireText(data, "displayText", "Informe o texto do botão de ligação.", report)
    if (filled(data.ttlMinutes) && !positiveInteger(data.ttlMinutes)) report("A validade do botão deve ser um número inteiro de minutos.", "warning", "ttlMinutes")
  }],
  ["voltar", checkReturn],
  ["webchatHandoff", ({ data, report }) => {
    requireText(data, "widgetId", "Informe o ID do widget do chat.", report)
    if (!nonempty(data.message)) report("Preencha a mensagem com o link do chat.", "warning", "message")
    else if (!data.message.includes("{{link}}")) report("Inclua {{link}} na mensagem para enviar o link do chat.", "warning", "message")
    if (has(data, "ttlHours") && !positiveInteger(data.ttlHours)) report("A validade do link deve ser um número inteiro de horas.", "warning", "ttlHours")
    if (nonempty(data.outputVar) && !VARIABLE_NAME.test(data.outputVar)) report("Use apenas letras, números e _ no nome da variável.", "warning", "outputVar")
  }],
  ["timeConditions", checkTimeRules],
  ["waiting_time", ({ data, report }) => {
    const delay = data.waiting_time
    if (!nonempty(delay)) report("Selecione o tempo de espera.", "warning", "waiting_time")
    else {
      if (!DELAY.test(delay)) report("Tempo de espera inválido.", "error", "waiting_time")
      if (data.id !== delay) report("O campo id deve ser igual ao tempo de espera.", "warning", "id")
    }
  }],
  ["randomizer", checkPaths],
  ["languageRouter", ({ data, report }) => {
    requireText(data, "fallback", "Selecione o idioma padrão.", report)
    checkSpaces(data, "variable", report)
  }],
  ["adCondition", ({ data, report }) => requireText(data, "adMatch", "Selecione como identificar o anúncio.", report)],
  ["sendConversion", ({ data, report }) => {
    requireText(data, "eventName", "Informe o evento de conversão.", report)
    if (nonempty(data.value) && !DECIMAL.test(data.value.trim())) report("Informe o valor da conversão como número, por exemplo 99.90.", "warning", "value")
    if (has(data, "currency") && !CURRENCY.test(String(data.currency))) report("Informe a moeda com 3 letras, por exemplo BRL.", "warning", "currency")
  }],
  ["trackEvent", ({ data, report }) => {
    requireText(data, "eventName", "Informe o nome do evento.", report)
    if (nonempty(data.numericValue) && !SIGNED_DECIMAL.test(data.numericValue.trim())) report("Informe o valor numérico como número.", "warning", "numericValue")
  }],
  ["tabulation", ({ data, report }) => {
    if (!nonempty(data.tabulacao)) report("Informe o ID da tabulação.", "warning", "tabulacao")
    else if (data.id !== data.tabulacao || data.tabulation !== data.tabulacao) report("Os campos id e tabulation devem ser iguais ao ID da tabulação.", "warning", ...["id", "tabulation"].filter((key) => data[key] !== data.tabulacao))
    requireText(data, "tabulacaoName", "Informe o nome da tabulação.", report)
  }],
  ["protocolo", ({ data, report }) => {
    if (data.opt === "URL") checkUrl(data, "url_api", report, "Informe a URL da API de protocolo.", "error", "error")
  }],
  ["solicitar_dados", (rules) => {
    const { data, report } = rules
    checkValidatedApi(rules)
    requireText(data, "text", "Preencha a mensagem de solicitação.", report)
    if (has(data, "channel") && !DATA_KINDS.includes(String(data.channel))) report("Tipo de dado desconhecido: use CPF/CNPJ, CPF, CNPJ ou Outro.", "warning", "channel")
    if (has(data, "tentativas") && !ATTEMPTS.test(String(data.tentativas).trim())) report("A quantidade de tentativas deve ser de 1 a 5.", "warning", "tentativas")
  }],
  ["consulta_api", checkValidatedApi],
  ["condicional_api", ({ data, report }) => {
    if (!nonempty(data.condition)) report("Escolha a comparação.", "warning", "condition")
    else if (!COMPARISONS.includes(data.condition)) report("Comparação desconhecida: use Igual a ou Diferente de.", "warning", "condition")
    requireText(data, "key", "Informe a chave a comparar.", report)
  }],
  [CONDITIONS_TYPE, checkConditions],
  ["Data_Input_Condicional", ({ data, report }) => requireText(data, "field", "Informe o campo avaliado.", report)],
  ["External_Message_Http", checkApi],
  ["Send_DataStore", checkApi],
  ["Local_DataStore", ({ data, report }) => {
    if (!nonempty(data.local_datastore)) report("Escolha a base de dados.", "warning", "local_datastore")
    else if (!DATASTORES.includes(data.local_datastore)) report("Base de dados desconhecida: use Contato ou Datastore.", "warning", "local_datastore")
  }],
  ["envio_boletos", ({ data, report }) => {
    if (has(data, "channel") && !INVOICE_MODES.includes(String(data.channel))) report("Modo de envio desconhecido: use Enviar todos, Enviar menu ou Catálogo.", "warning", "channel")
    checkUrl(data, "url_list", report, "Informe a URL da API que lista os boletos.")
    checkUrl(data, "url_send", report, "Informe a URL da API que envia os boletos.")
  }],
  ["api_options_menu", ({ data, report }) => {
    checkUrl(data, "apiUrl", report, "Informe a URL da API das opções.")
    checkUrl(data, "postUrl", report)
    requireText(data, "message", "Preencha a mensagem do menu.", report)
    requireText(data, "variableName", "Informe a variável da opção escolhida.", report)
    checkFlag(data, "buttons", report)
    checkFlag(data, "endConversation", report)
  }],
  ["googleSheetsAppend", ({ data, report }) => {
    requireText(data, "spreadsheet", "Informe a planilha.", report)
    if (!Array.isArray(data.columns)) return
    if (data.columns.length === 0) report("Cadastre ao menos uma coluna.", "warning", "columns")
    data.columns.forEach((column, index) => {
      if (!isObject(column) || typeof column.header !== "string" || typeof column.value !== "string") report(`Coluna ${index + 1} inválida: informe nome e valor.`, "error", `columns.${index}`)
      else if (!nonempty(column.header)) report(`Coluna ${index + 1}: informe o nome.`, "warning", `columns.${index}.header`)
    })
  }],
  ["rdStationConversion", ({ data, report }) => {
    requireText(data, "conversionIdentifier", "Informe o identificador da conversão.", report)
    requireText(data, "email", "Informe o e-mail do contato.", report)
  }],
  ["hubspotUpsertContact", ({ data, report }) => requireText(data, "email", "Informe o e-mail do contato.", report)],
  ["apptService", checkChoiceList("serviços", "Serviços")],
  ["apptLocation", checkChoiceList("locais", "Locais")],
  ["apptProvider", checkChoiceList("profissionais", "Profissionais")],
  ["apptSlot", checkChoiceList("horários", "")],
  ["apptIdentify", ({ data, report }) => checkVariable(data, "contactVar", report, "Informe a variável do cliente.")],
  ["apptCustomerIntake", ({ data, report }) => {
    if (data.askName !== true && data.askEmail !== true && data.askNotes !== true) report("Selecione ao menos um dado para pedir ao cliente.", "warning", "askName", "askEmail", "askNotes")
  }],
  ["apptBook", ({ data, report }) => {
    checkVariable(data, "outputVar", report, "Informe a variável de saída.")
    requireText(data, "successMessage", "Preencha a mensagem de confirmação.", report)
    requireText(data, "conflictMessage", "Preencha a mensagem de horário ocupado.", report)
    requireText(data, "errorMessage", "Preencha a mensagem de erro.", report)
  }],
  ["ticketLookup", (rules) => {
    requireText(rules.data, "lookupScope", "Selecione o escopo da consulta.", rules.report)
    checkChoiceList("chamados", "")(rules)
  }],
  ["ticketCreate", ({ data, report }) => {
    if (!nonempty(data.formId)) requireText(data, "fallbackQuestion", "Informe o formulário ou a pergunta alternativa.", report, "warning", "formId")
    else requireText(data, "subjectFieldKey", "Informe o campo de assunto do formulário.", report)
    requireText(data, "defaultPriority", "Selecione a prioridade padrão.", report)
    requireText(data, "defaultType", "Selecione o tipo padrão.", report)
    requireText(data, "successMessage", "Preencha a mensagem de chamado aberto.", report)
    requireText(data, "errorMessage", "Preencha a mensagem de erro.", report)
    checkVariable(data, "outputVar", report, "Informe a variável de saída.")
  }],
  ["ticketDetail", ({ data, report }) => {
    checkVariable(data, "inputVar", report, "Informe a variável com o ID do chamado.")
    requireText(data, "notFoundMessage", "Preencha a mensagem de chamado não encontrado.", report)
    if (TICKET_ACTIONS.some((action) => data[action] === true)) requireText(data, "actionPrompt", "Preencha a pergunta das ações.", report)
    if (data.enableComment === true) requireText(data, "commentPrompt", "Preencha o pedido de comentário.", report)
  }],
  ["crmIdentify", ({ data, report }) => {
    checkVariable(data, "contactVar", report, "Informe a variável do contato.")
    checkVariable(data, "leadVar", report)
  }],
  ["crmContact", ({ data, report }) => checkVariable(data, "outputVar", report, "Informe a variável que recebe o ID do contato.")],
  ["crmLead", ({ data, report }) => checkVariable(data, "outputVar", report, "Informe a variável que recebe o ID do lead.")],
  ["crmLeadUpdate", ({ data, report }) => {
    checkVariable(data, "inputVar", report, "Informe a variável com o ID do lead.")
    if (!nonempty(data.setStatus) && !nonempty(data.addTags) && !nonempty(data.setValue)) report("Defina ao menos uma alteração: status, tags ou valor.", "warning", "setStatus", "addTags", "setValue")
  }],
  ["crmActivity", ({ data, report }) => {
    requireText(data, "title", "Informe o título da atividade.", report)
    requireText(data, "activityType", "Selecione o tipo de atividade.", report)
    checkWhole(data, "dueInDays", "O prazo deve ser um número inteiro de dias, a partir de 0.", report)
    if (!nonempty(data.leadVar) && !nonempty(data.contactVar)) report("Informe a variável do lead ou do contato.", "warning", "leadVar", "contactVar")
    checkVariable(data, "leadVar", report)
    checkVariable(data, "contactVar", report)
  }],
  ["sequenceEnroll", ({ data, report }) => {
    requireText(data, "sequenceId", "Informe o ID da lista.", report)
    if (nonempty(data.sequenceId)) requireText(data, "sequenceName", "Informe o nome da lista.", report)
  }],
  ["sequenceUnenroll", ({ data, report }) => {
    if (!nonempty(data.sequenceId) && data.allSequences !== true) report("Informe o ID da lista ou marque Remover de todas as listas.", "warning", "sequenceId", "allSequences")
  }],
  ["aiAgentBlock", checkAgent],
  ["OpenAI", ({ data, report }) => {
    if (!nonempty(data.aiModel) && !nonempty(data["df-OpenAI"])) report("Selecione o agente de IA.", "warning", "df-OpenAI", "aiModel")
  }],
])

export function validateFlow(flow: AtendimentoFlow): FlowIssue[] {
  try {
    assertShape(flow)
  } catch (error) {
    return [{ severity: "error", message: (error as Error).message }]
  }
  const issues: FlowIssue[] = []
  const reported = new Map<string, FlowIssue>()
  const add = (message: string, nodeId?: string, severity: Severity = "error", fields: readonly string[] = []) => {
    const key = JSON.stringify([severity, nodeId ?? null, message])
    const known = reported.get(key)
    if (known) {
      const merged = [...new Set([...(known.fields ?? []), ...fields])]
      if (merged.length) known.fields = merged
      return
    }
    const issue: FlowIssue = { severity, message, nodeId }
    if (fields.length) issue.fields = [...new Set(fields)]
    reported.set(key, issue)
    issues.push(issue)
  }
  if (!nonempty(flow.name)) add("Informe o nome do fluxo.")
  if (!nonempty(flow.service_type)) add("Informe o tipo de serviço do fluxo (padrão: chat).")
  const starts = flow.nodes.filter((node) => node.data.type === START_TYPE)
  if (starts.length === 0) add("Adicione o componente Iniciar Fluxo.")
  if (starts.length > 1) add("O fluxo deve ter um único componente Iniciar Fluxo.")
  for (const start of starts) if (start.id !== START_ID) add(`O ID deste componente deve ser "${START_ID}".`, start.id)

  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const outgoing = groupBySource(flow.edges)
  const edgesFrom = (id: string) => outgoing.get(id) ?? []
  const outputs = new Map<string, NodeOutputs>(flow.nodes.map((node) => {
    const keys = outputKeys(node)
    return [node.id, { node, keys, handles: new Set(handlesOf(node, edgesFrom, keys)) }]
  }))

  const used = new Map<string, Set<string>>()
  const incoming = new Map<string, number>()
  const linked = new Set(flow.edges.flatMap((edge) => [edge.source, edge.target]))
  for (const edge of flow.edges) {
    const source = outputs.get(edge.source)!
    const target = outputs.get(edge.target)!.node
    if (source.node.data.type === NOTE_TYPE || target.data.type === NOTE_TYPE) {
      for (const node of [source.node, target]) if (node.data.type === NOTE_TYPE) add("Notas não podem ser conectadas.", node.id)
      continue
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
    if (!source.handles.has(edge.sourceHandle)) add(`A saída ${edge.sourceHandle} não existe neste componente.`, edge.source)
    if (target.data.type === START_TYPE) add("Este componente não pode receber conexões.", edge.target)
    if (target.data.type === WAIT_TYPE && source.node.data.type !== QUESTION_TYPE) add(WAIT_QUESTION_MESSAGE, edge.target, "warning")
    if (edge.source === edge.target) add("O componente não pode se conectar a ele mesmo.", edge.source)
    const handles = used.get(edge.source) ?? new Set<string>()
    if (handles.has(edge.sourceHandle)) add(`A saída “${labelOf(source.node, edge.sourceHandle, source.keys)}” tem mais de um destino.`, edge.source)
    used.set(edge.source, handles.add(edge.sourceHandle))
  }

  const reachable = new Set(starts.map((node) => node.id))
  for (const id of reachable) if (nodes.get(id)?.data.type !== NOTE_TYPE) for (const edge of edgesFrom(id)) reachable.add(edge.target)

  for (const { node, keys, handles } of outputs.values()) {
    const { type, data } = node.data
    const report: Report = (message, severity, ...fields) => add(message, node.id, severity, fields)
    checkFieldTypes(type, data, report)
    const nodeType = getNodeType(type)
    if (!getDefinition(type) && type !== NOTE_TYPE) report("Tipo preservado do arquivo, sem exemplo no formato de Atendimento.", "warning")
    else if (node.type !== nodeType) report(`Este componente é gravado pela plataforma com type ${nodeType}.`, "warning")
    if (type === NOTE_TYPE) continue
    if (type !== START_TYPE && !linked.has(node.id)) report("Componente sem conexões; ele não será executado.", "warning")
    else {
      if (!reachable.has(node.id)) report("Componente desconectado do início.")
      if ((incoming.get(node.id) ?? 0) > 1) report("O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.", "warning")
      const connected = used.get(node.id)
      for (const handle of handles) if (!connected?.has(handle)) report(`Conecte a saída “${labelOf(node, handle, keys)}”.`)
    }
    const rules: Rules = { data, keys, report, nodes }
    checkReference(type, rules)
    CHECKS.get(type)?.(rules)
  }
  for (const warning of variableWarnings(flow)) add(warning.message, warning.nodeId, "warning", warning.fields)
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
  return { ...flow, nodes: flow.nodes.map((node) => ({ ...node })), edges: flow.edges.map((edge) => ({ ...edge })) }
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

function renumberOutputs(edges: AtendimentoEdge[], nodeId: string, move: (index: number) => number | undefined): AtendimentoEdge[] {
  const taken = new Set<string>()
  const result: AtendimentoEdge[] = []
  for (const edge of edges) {
    let next = edge
    const index = edge.source === nodeId ? handleIndex(edge.sourceHandle) : -1
    if (index >= 0) {
      const target = move(index)
      if (target === undefined) continue
      if (target !== index) {
        const handle = `output-${target}`
        const followsPattern = edge.id === edgeId(edge.source, edge.sourceHandle, edge.target)
        next = { ...edge, sourceHandle: handle, id: followsPattern ? edgeId(edge.source, handle, edge.target) : edge.id }
      }
    }
    const id = uniqueId(next.id, taken)
    result.push(id === next.id ? next : { ...next, id })
  }
  return result
}

function withData(flow: AtendimentoFlow, nodeId: string, data: JsonObject, edges: AtendimentoEdge[]): AtendimentoFlow {
  return {
    ...flow,
    nodes: flow.nodes.map((entry) => entry.id === nodeId ? { ...entry, data: { ...entry.data, data } } : entry),
    edges,
  }
}

export function removeOutput(flow: AtendimentoFlow, nodeId: string, removed: number, data: JsonObject): AtendimentoFlow {
  return withData(flow, nodeId, data, renumberOutputs(flow.edges, nodeId, (index) => index === removed ? undefined : index > removed ? index - 1 : index))
}

export function insertOutput(flow: AtendimentoFlow, nodeId: string, inserted: number, data: JsonObject): AtendimentoFlow {
  return withData(flow, nodeId, data, renumberOutputs(flow.edges, nodeId, (index) => index >= inserted ? index + 1 : index))
}

function reindex(data: JsonObject, pattern: RegExp, indices: number[], removed: number, value: (prefix: string, position: number, current: JsonValue) => JsonValue): JsonObject {
  const positions = new Map(indices.filter((index) => index !== removed).map((index, position) => [index, position + 1]))
  const result: JsonObject = {}
  for (const [key, current] of Object.entries(data)) {
    const match = pattern.exec(key)
    if (!match) {
      result[key] = current
      continue
    }
    const position = positions.get(Number(match[2]))
    if (position !== undefined) result[`${match[1]}-${position}`] = value(match[1], position, current)
  }
  return result
}

export function removeMenuOption(flow: AtendimentoFlow, nodeId: string, option: number): AtendimentoFlow {
  const node = flow.nodes.find((entry) => entry.id === nodeId)
  if (!node || node.data.type !== MENU_TYPE) return flow
  const indices = optionIndices(node.data.data)
  const removed = indices.indexOf(option)
  if (indices.length <= 1 || removed < 0) return flow
  const sequential = indices.every((index, position) => String(node.data.data[`opt-${index}`] ?? "").trim() === String(position + 1))
  const data = reindex(node.data.data, OPTION_KEY, indices, option, (prefix, position, value) => sequential && prefix === "opt" ? String(position) : value)
  return removeOutput(flow, nodeId, removed, data)
}

export function removeCondition(flow: AtendimentoFlow, nodeId: string, condition: number): AtendimentoFlow {
  const node = flow.nodes.find((entry) => entry.id === nodeId)
  if (!node || node.data.type !== CONDITIONS_TYPE) return flow
  const indices = conditionIndices(node.data.data)
  const removed = indices.indexOf(condition)
  if (indices.length <= 1 || removed < 0) return flow
  return removeOutput(flow, nodeId, removed, reindex(node.data.data, CONDITION_KEY, indices, condition, (_, __, value) => value))
}
