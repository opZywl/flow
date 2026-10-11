import { API_TYPES, MENU_TYPE, START_TYPE, getComponentLabel } from "./catalog"
import { isObject, nonempty, optionIndices, outputHandles, outputLabel } from "./format"
import type { AtendimentoFlow, AtendimentoNode, JsonValue } from "./types"

export interface PreviewOption {
  digit: string
  text: string
  handle: string
}

export interface PreviewState {
  messages: string[]
  nodeId: string | null
  waiting: "menu" | "answer" | "data" | "branch" | null
  options: PreviewOption[]
  variables: Record<string, string>
  attempts: number
}

interface Graph {
  flow: AtendimentoFlow
  nodes: Map<string, AtendimentoNode>
  links: Map<string, Map<string, string>>
}

const MAX_STEPS = 100
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const PROTOCOL_SAMPLE = "[protocolo gerado na plataforma]"

export const emptyPreview = (): PreviewState => ({ messages: [], nodeId: null, waiting: null, options: [], variables: {}, attempts: 0 })

function graphOf(flow: AtendimentoFlow): Graph {
  const nodes = new Map<string, AtendimentoNode>()
  for (const node of flow.nodes) if (!nodes.has(node.id)) nodes.set(node.id, node)
  const links = new Map<string, Map<string, string>>()
  for (const edge of flow.edges) {
    const handles = links.get(edge.source) ?? new Map<string, string>()
    if (!handles.has(edge.sourceHandle)) handles.set(edge.sourceHandle, edge.target)
    links.set(edge.source, handles)
  }
  return { flow, nodes, links }
}

const targetOf = (graph: Graph, node: AtendimentoNode, handle: string) => graph.links.get(node.id)?.get(handle)

function lookup(variables: Record<string, string>, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key]
  const lower = key.toLowerCase()
  const match = Object.keys(variables).find((entry) => entry.toLowerCase() === lower)
  return match === undefined ? undefined : variables[match]
}

export function renderText(text: JsonValue | undefined, variables: Record<string, string>): string {
  return String(text ?? "")
    .replace(/@@@([\w-]+(?::[\w-]+)*)/g, (token, key: string) => lookup(variables, key) ?? token)
    .replace(/#NAME\b/g, (token) => lookup(variables, "name") ?? token)
    .replace(/\{protocol\}/g, (token) => lookup(variables, "protocol") ?? token)
}

function storeAnswer(variables: Record<string, string>, field: string, value: string) {
  variables[field] = value
  const parts = field.split(":")
  if (parts[0] === "custom" && parts.length >= 3) {
    variables[parts.slice(1).join(":")] = value
    variables[parts[parts.length - 1]] = value
  }
}

function applyResponseSamples(node: AtendimentoNode, variables: Record<string, string>) {
  const map = node.data.data.response_map
  if (!Array.isArray(map)) return
  for (const item of map) if (isObject(item) && typeof item.variable === "string" && item.variable) variables[item.variable] = String(item.sample ?? "")
}

function insideBusinessHours(node: AtendimentoNode, now: Date): boolean {
  const rules = node.data.data.timeRules
  if (!Array.isArray(rules)) return false
  const day = DAYS[now.getDay()]
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return rules.some((rule) => isObject(rule) && Array.isArray(rule.weekDays) && rule.weekDays.includes(day) && typeof rule.startTime === "string" && typeof rule.endTime === "string" && rule.startTime <= time && time <= rule.endTime)
}

function listOptions(options: PreviewOption[]): string {
  return options.map((option) => `${option.digit}. ${option.text}`).join("\n")
}

function branchOptions(node: AtendimentoNode, edges: AtendimentoFlow["edges"], current?: string): PreviewOption[] {
  return outputHandles(node, edges).map((handle, index) => ({ digit: String(index + 1), text: `${outputLabel(node, handle)}${handle === current ? " (agora)" : ""}`, handle }))
}

function quoted(value: JsonValue | undefined): string {
  const text = String(value ?? "").trim()
  return text ? ` “${text}”` : ""
}

function disconnected(node: AtendimentoNode, handle: string): string {
  return `A saída “${outputLabel(node, handle)}” de ${getComponentLabel(node.data.type)} (ID ${node.id}) não está conectada.`
}

function wait(state: PreviewState, node: AtendimentoNode, waiting: PreviewState["waiting"], options: PreviewOption[] = []): PreviewState {
  return { ...state, nodeId: node.id, waiting, options }
}

function finish(state: PreviewState, message: string): PreviewState {
  state.messages.push(message)
  return { ...state, nodeId: null, waiting: null, options: [] }
}

function run(graph: Graph, startId: string | undefined, base: Partial<PreviewState>, now: Date): PreviewState {
  const state: PreviewState = { ...emptyPreview(), ...base, messages: [...(base.messages || [])], variables: { ...(base.variables || {}) }, nodeId: null, waiting: null, options: [] }
  let id = startId
  for (let steps = 0; id && steps < MAX_STEPS; steps++) {
    const node = graph.nodes.get(id)
    if (!node) return finish(state, `Componente de destino não encontrado (ID ${id}).`)
    const data = node.data.data
    switch (node.data.type) {
      case START_TYPE:
        break
      case "envio_pergunta":
        state.messages.push(renderText(data.template, state.variables))
        break
      case "protocolo":
        if (!lookup(state.variables, "protocol")) state.variables.protocol = PROTOCOL_SAMPLE
        state.messages.push(renderText(data.text, state.variables))
        break
      case "tags":
        state.messages.push(`Tag${quoted(data.tags || data.selectedTag)} aplicada ao atendimento.`)
        break
      case MENU_TYPE: {
        const options = optionIndices(data).map((option, index) => ({ digit: String(data[`opt-${option}`] ?? option).trim(), text: String(data[`text-${option}`] ?? ""), handle: `output-${index}` }))
        state.messages.push(`${renderText(data.title, state.variables)}\n\n${listOptions(options)}`)
        return wait(state, node, "menu", options)
      }
      case "waitForAnswer":
        return wait(state, node, "answer")
      case "solicitar_dados":
        state.messages.push(renderText(data.text, state.variables) || "Informe o dado solicitado.")
        return { ...wait(state, node, "data"), attempts: 1 }
      case "consulta_api":
      case "timeConditions": {
        const schedule = node.data.type === "timeConditions"
        const current = schedule ? (insideBusinessHours(node, now) ? "output-1" : "output-0") : undefined
        if (!schedule && nonempty(data.text)) state.messages.push(renderText(data.text, state.variables))
        const options = branchOptions(node, graph.flow.edges, current)
        const intro = schedule ? "Condições de Tempo: escolha o caminho a testar." : "Consulta API: a requisição não é enviada na prévia. Escolha o resultado a testar."
        state.messages.push(`${intro}\n\n${listOptions(options)}`)
        return wait(state, node, "branch", options)
      }
      case "finalizar":
        if (nonempty(data.message)) state.messages.push(renderText(data.message, state.variables))
        return finish(state, "Conversa finalizada.")
      case "departamentos":
        return finish(state, `Transferido para o departamento${quoted(data.name || data.departamento)}. A prévia termina aqui.`)
      case "flow":
        return finish(state, `Encaminhado para o fluxo${quoted(data.flowName || data.targetFlow)}. A prévia termina aqui.`)
      default:
        return finish(state, `Prévia interrompida: ${getComponentLabel(node.data.type)} não tem simulação.`)
    }
    id = targetOf(graph, node, "output-0")
    if (!id) return finish(state, disconnected(node, "output-0"))
  }
  if (id) state.messages.push(`Prévia interrompida após ${MAX_STEPS} etapas automáticas. Verifique se há um ciclo sem resposta do contato.`)
  return { ...state, nodeId: null, waiting: null, options: [] }
}

function begin(graph: Graph, now: Date): PreviewState {
  const start = graph.flow.nodes.find((node) => node.data.type === START_TYPE)
  if (!start) return { ...emptyPreview(), messages: ["O fluxo não tem o componente Iniciar Fluxo."] }
  return run(graph, start.id, {}, now)
}

export function advancePreview(flow: AtendimentoFlow, startId: string | undefined, base: Partial<PreviewState> = {}, now = new Date()): PreviewState {
  return run(graphOf(flow), startId, base, now)
}

export function startPreview(flow: AtendimentoFlow, now = new Date()): PreviewState {
  return begin(graphOf(flow), now)
}

export function replyPreview(flow: AtendimentoFlow, current: PreviewState, reply: string, now = new Date()): PreviewState {
  const graph = graphOf(flow)
  const node = current.nodeId === null ? undefined : graph.nodes.get(current.nodeId)
  if (!node || !current.waiting) return begin(graph, now)
  const text = reply.trim()
  const variables = { ...current.variables }
  const follow = (handle: string): PreviewState => {
    const target = targetOf(graph, node, handle)
    return target ? run(graph, target, { variables }, now) : { ...emptyPreview(), variables, messages: [disconnected(node, handle)] }
  }
  if (current.waiting === "answer") {
    const field = node.data.data.customFields
    if (typeof field === "string" && field) storeAnswer(variables, field, text)
    return follow("output-0")
  }
  if (current.waiting === "data") {
    variables.input = text
    const options = branchOptions(node, flow.edges)
    return { ...current, variables, waiting: "branch", options, messages: [`Solicitar Dados: a API não é chamada na prévia. Escolha o resultado da validação.\n\n${listOptions(options)}`] }
  }
  const option = current.options.find((entry) => entry.digit === text) || (current.waiting === "menu" ? current.options.find((entry) => entry.text.trim().toLowerCase() === text.toLowerCase()) : undefined)
  if (!option) return { ...current, messages: [`Opção inválida.\n\n${listOptions(current.options)}`] }
  if (node.data.type === "solicitar_dados" && option.handle === "output-0") {
    const limit = Number(node.data.data.tentativas) || 1
    if (current.attempts < limit) return { ...current, variables, waiting: "data", options: [], attempts: current.attempts + 1, messages: [renderText(node.data.data.error, variables) || "Não foi possível validar. Tente novamente."] }
  }
  if (option.handle === "output-1" && API_TYPES.has(node.data.type)) applyResponseSamples(node, variables)
  return follow(option.handle)
}
