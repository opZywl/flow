import { NOTE_TYPE, START_TYPE, getComponentLabel } from "./catalog"
import type { AtendimentoFlow, JsonObject, JsonValue } from "./types"

export interface PlatformVariable {
  token: string
  description: string
}

export interface CreatedVariable extends PlatformVariable {
  nodeId: string
  source: string
}

export interface VariableWarning {
  nodeId: string
  message: string
  fields: string[]
}

interface VariableNode {
  id: string
  type: string
  created: string[]
}

export interface VariableGraph {
  nodes: VariableNode[]
  edges: Array<[string, string]>
}

export const PLATFORM_VARIABLES: readonly PlatformVariable[] = [
  { token: "#NAME", description: "Nome do contato" },
  { token: "@@@GREETING", description: "Bom dia / Boa tarde / Boa noite" },
  { token: "#DATE_BRAZIL", description: "Data de hoje (dd/mm/aaaa)" },
  { token: "#TIME_PM", description: "Hora atual (24h)" },
  { token: "#DATE_TIME_BRAZIL", description: "Data e hora" },
  { token: "#PROTOCOL", description: "Gera um número de protocolo" },
]

const HASH_NAMES = new Set(PLATFORM_VARIABLES.flatMap((variable) => (variable.token.startsWith("#") ? [variable.token.slice(1)] : [])))
const PLATFORM_FIELDS = new Set(PLATFORM_VARIABLES.flatMap((variable) => (variable.token.startsWith("@@@") ? [variable.token.slice(3).toLowerCase()] : [])))
const HASH_LIST = "#NAME, @@@GREETING, #DATE_BRAZIL, #TIME_PM, #DATE_TIME_BRAZIL e #PROTOCOL"

const OUTPUT_KEYS: ReadonlyMap<string, readonly string[]> = new Map(Object.entries({
  whatsappFlow: ["outputVar"],
  apptService: ["outputVar"],
  apptIdentify: ["contactVar"],
  apptLocation: ["outputVar"],
  apptProvider: ["outputVar"],
  apptSlot: ["outputVar"],
  apptBook: ["outputVar"],
  ticketLookup: ["outputVar"],
  ticketCreate: ["outputVar"],
  crmIdentify: ["contactVar", "leadVar"],
  crmContact: ["outputVar"],
  crmLead: ["outputVar"],
  webchatHandoff: ["outputVar"],
  randomizer: ["variable"],
  languageRouter: ["variable"],
  googleSheetsAppend: ["resultVar"],
  rdStationConversion: ["resultVar"],
  hubspotUpsertContact: ["resultVar"],
  condicional_api: ["key"],
  api_options_menu: ["variableName"],
}))

const SKIPPED_KEYS = new Set(["curl", "parsed_body", "parameterExplanations", "response_map", "api_test_values", "validated_signature"])
const NAME = /^[\w-]+$/
const HEX = /^[0-9A-F]{3,8}$/
const USED = /@@@([\w-]+(?::[\w-]+)*)|#([A-Z][A-Z0-9_]{2,})\b/g

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)
const baseName = (name: string) => (name.split(":").pop() ?? name).toLowerCase()

function variableName(value: JsonValue | undefined): string {
  if (typeof value !== "string") return ""
  const name = value.trim().split(":").pop()?.trim() ?? ""
  return NAME.test(name) ? name : ""
}

export function createdVariables(type: string, data: JsonObject): string[] {
  const names = (OUTPUT_KEYS.get(type) ?? []).map((key) => variableName(data[key]))
  if (type === "waitForAnswer") names.unshift(variableName(data.customFields) || variableName(data.customfields))
  if (Array.isArray(data.response_map)) {
    for (const item of data.response_map) if (isObject(item)) names.push(variableName(item.variable))
  }
  const seen = new Set<string>()
  return names.filter((name) => {
    if (!name || seen.has(name.toLowerCase())) return false
    seen.add(name.toLowerCase())
    return true
  })
}

export function variableGraph(flow: Pick<AtendimentoFlow, "nodes" | "edges">): VariableGraph {
  return {
    nodes: flow.nodes.map((node) => ({ id: node.id, type: node.data.type, created: isObject(node.data.data) ? createdVariables(node.data.type, node.data.data) : [] })),
    edges: flow.edges.map((edge): [string, string] => [edge.source, edge.target]),
  }
}

function ancestorsInOrder(graph: VariableGraph, nodeId: string): VariableNode[] {
  const into = new Map<string, string[]>()
  const out = new Map<string, string[]>()
  for (const [source, target] of graph.edges) {
    into.set(target, [...(into.get(target) ?? []), source])
    out.set(source, [...(out.get(source) ?? []), target])
  }
  const ancestors = new Set<string>()
  const stack = [...(into.get(nodeId) ?? [])]
  while (stack.length) {
    const id = stack.pop() as string
    if (ancestors.has(id)) continue
    ancestors.add(id)
    stack.push(...(into.get(id) ?? []))
  }
  ancestors.delete(nodeId)
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const start = graph.nodes.find((node) => node.type === START_TYPE)
  const order: VariableNode[] = []
  const seen = new Set<string>()
  const queue = start ? [start.id] : []
  while (queue.length) {
    const id = queue.shift() as string
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node && ancestors.has(id)) order.push(node)
    queue.push(...(out.get(id) ?? []))
  }
  return order
}

export function createdBefore(graph: VariableGraph, nodeId: string): CreatedVariable[] {
  const seen = new Set<string>()
  const list: CreatedVariable[] = []
  for (const node of ancestorsInOrder(graph, nodeId)) {
    for (const name of node.created) {
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      const source = getComponentLabel(node.type)
      list.push({ token: `@@@${name}`, description: `Criada em ${source} (ID ${node.id})`, nodeId: node.id, source })
    }
  }
  return list
}

export function availableVariables(flow: Pick<AtendimentoFlow, "nodes" | "edges">, nodeId: string): { always: readonly PlatformVariable[]; created: CreatedVariable[] } {
  return { always: PLATFORM_VARIABLES, created: createdBefore(variableGraph(flow), nodeId) }
}

function usedVariables(data: JsonObject): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const scan = (value: JsonValue | undefined, field: string) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(USED)) {
        if (match[2] && HEX.test(match[2])) continue
        const token = match[0]
        const fields = used.get(token) ?? []
        if (!fields.includes(field)) fields.push(field)
        used.set(token, fields)
      }
    } else if (Array.isArray(value)) {
      for (const item of value) scan(item, field)
    } else if (isObject(value)) {
      for (const item of Object.values(value)) scan(item, field)
    }
  }
  for (const [key, value] of Object.entries(data)) if (!SKIPPED_KEYS.has(key)) scan(value, key)
  return used
}

export function variableWarnings(flow: Pick<AtendimentoFlow, "nodes" | "edges">): VariableWarning[] {
  const graph = variableGraph(flow)
  const creators = new Map<string, VariableNode>()
  for (const node of graph.nodes) for (const name of node.created) if (!creators.has(name.toLowerCase())) creators.set(name.toLowerCase(), node)
  const warnings: VariableWarning[] = []
  for (const node of flow.nodes) {
    if (node.data.type === START_TYPE || node.data.type === NOTE_TYPE || !isObject(node.data.data)) continue
    const used = usedVariables(node.data.data)
    if (!used.size) continue
    let available: Set<string> | undefined
    for (const [token, fields] of used) {
      if (token.startsWith("#")) {
        if (!HASH_NAMES.has(token.slice(1))) warnings.push({ nodeId: node.id, fields, message: `Variável ${token} desconhecida. As variáveis da plataforma são ${HASH_LIST}.` })
        continue
      }
      const name = baseName(token.slice(3))
      if (PLATFORM_FIELDS.has(name)) continue
      const creator = creators.get(name)
      if (!creator) continue
      available ??= new Set(createdBefore(graph, node.id).map((variable) => baseName(variable.token.slice(3))))
      if (available.has(name)) continue
      warnings.push({ nodeId: node.id, fields, message: `A variável ${token} ainda não existe aqui: ela é criada depois, em ${getComponentLabel(creator.type)} (ID ${creator.id}).` })
    }
  }
  return warnings
}
