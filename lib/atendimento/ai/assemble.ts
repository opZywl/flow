import { MENU_TYPE, NOTE_TYPE, START_ID, START_TYPE, TIME_TYPE, getComponentLabel, getDefinition } from "../catalog"
import { createEdge, duplicateNode, isObject, newFlow, newNode, nextNodeId, optionIndices, outputHandles, outputLabel } from "../format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, JsonObject } from "../types"
import { LIMITS, RI_LIMITS, type IssueScope } from "./contracts"
import { layoutFlow } from "./layout"
import { canonicalType, coerceRi, type RiFlow } from "./ri"
import { compactKey, foldText, listQuoted, quote, shorten } from "./text"
import { configureNode, settleData, type NoteLevel } from "./values"

export interface AssemblyNote {
  level: NoteLevel
  scope: IssueScope
  message: string
  riId?: string
  nodeId?: string
  type?: string
}

export interface AssembleOptions {
  name?: string
  description?: string
  prompt?: string
  now?: Date
}

export interface AssembledFlow {
  flow: AtendimentoFlow
  platformIds: ReadonlyMap<string, string>
  riIds: ReadonlyMap<string, string>
  notes: AssemblyNote[]
}

const RETURN_TYPE = "voltar"
const FINISH_TYPE = "finalizar"
const START_ALIASES = new Set(["inicio", "start", "iniciarfluxo", "triggermessage", "trigger"])
const NAMED_OUTPUT = /^(?:opcao|opção|saida|saída|caminho|condicao|condição|opt|output|option|path|exit)[\s_-]*(\d+)$/
const DIRECT_OUTPUT = /^output-(\d+)$/i
const FALLBACK_NAME = "Fluxo gerado por IA"

const labelKey = (value: string) => foldText(value).replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "").trim()
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function flowName(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const clean = shorten(candidate ?? "", LIMITS.name)
    if (clean) return clean
  }
  return FALLBACK_NAME
}

function uniqueId(base: string, taken: ReadonlyMap<string, unknown>): string {
  let suffix = 2
  while (taken.has(`${base}_${suffix}`)) suffix++
  return `${base}_${suffix}`
}

function descendants(edges: readonly AtendimentoEdge[], from: string): Set<string> {
  const seen = new Set<string>()
  const queue = [from]
  for (let index = 0; index < queue.length; index++) {
    for (const edge of edges) {
      if (edge.source !== queue[index] || seen.has(edge.target)) continue
      seen.add(edge.target)
      queue.push(edge.target)
    }
  }
  return seen
}

function retarget(flow: AtendimentoFlow, edge: AtendimentoEdge, target: string): void {
  const index = flow.edges.indexOf(edge)
  const others = flow.edges.filter((entry) => entry !== edge)
  flow.edges[index] = createEdge(others, edge.source, edge.sourceHandle, target)
}

function returnData(menuId: string): JsonObject {
  const definition = getDefinition(RETURN_TYPE)
  const data = definition?.configured ? definition.configured() : { id: "" }
  data.id = menuId
  data.targetNodeId = menuId
  return data
}

function chainFrom(flow: AtendimentoFlow, start: string, incoming: ReadonlyMap<string, number>): string[] | null {
  const chain = [start]
  let current = start
  for (;;) {
    const outgoing = flow.edges.filter((edge) => edge.source === current)
    if (!outgoing.length) return chain
    if (outgoing.length > 1) return null
    const next = outgoing[0].target
    if (chain.includes(next) || next === START_ID || (incoming.get(next) ?? 0) > 1) return null
    chain.push(next)
    if (chain.length > 4) return null
    current = next
  }
}

function countIncoming(edges: readonly AtendimentoEdge[]): Map<string, number> {
  const incoming = new Map<string, number>()
  for (const edge of edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  return incoming
}

function routeMenuReturns(flow: AtendimentoFlow, riIds: Map<string, string>, notes: AssemblyNote[]): void {
  for (const menu of flow.nodes.filter((node) => node.data.type === MENU_TYPE)) {
    const incoming = flow.edges.filter((edge) => edge.target === menu.id)
    if (incoming.length < 2) continue
    const below = descendants(flow.edges, menu.id)
    const kept = incoming.find((edge) => !below.has(edge.source)) ?? incoming[0]
    const title = String(menu.data.data.title ?? "").trim() || `ID ${menu.id}`
    for (const edge of incoming) {
      if (edge === kept) continue
      const node = newNode(RETURN_TYPE, { x: 0, y: 0 }, nextNodeId(flow.nodes))
      node.data.data = returnData(menu.id)
      flow.nodes.push(node)
      retarget(flow, edge, node.id)
      const origin = riIds.get(edge.source)
      notes.push({
        level: "warning",
        scope: "ajuste",
        message: `A conexão de volta ao menu ${quote(title)} foi trocada por Retornar ao Menu.`,
        nodeId: node.id,
        ...(origin ? { riId: origin } : {}),
        type: RETURN_TYPE,
      })
    }
  }
}

function cloneSharedTails(flow: AtendimentoFlow, riIds: Map<string, string>): void {
  for (const node of [...flow.nodes]) {
    if (node.data.type === MENU_TYPE || node.id === START_ID) continue
    const incoming = flow.edges.filter((edge) => edge.target === node.id)
    if (incoming.length < 2) continue
    const chain = chainFrom(flow, node.id, countIncoming(flow.edges))
    if (!chain) continue
    for (const edge of incoming.slice(1)) {
      const copies = new Map<string, string>()
      for (const id of chain) {
        const original = flow.nodes.find((entry) => entry.id === id)
        if (!original) continue
        const clone = duplicateNode(original, nextNodeId(flow.nodes))
        flow.nodes.push(clone)
        copies.set(id, clone.id)
        const origin = riIds.get(id)
        if (origin) riIds.set(clone.id, origin)
      }
      for (let index = 0; index < chain.length - 1; index++) {
        const link = flow.edges.find((entry) => entry.source === chain[index] && entry.target === chain[index + 1])
        const source = copies.get(chain[index])
        const target = copies.get(chain[index + 1])
        if (link && source && target) flow.edges.push(createEdge(flow.edges, source, link.sourceHandle, target))
      }
      const head = copies.get(chain[0])
      if (head) retarget(flow, edge, head)
    }
  }
}

function settleReturns(flow: AtendimentoFlow): void {
  const menus = flow.nodes.filter((node) => node.data.type === MENU_TYPE).map((node) => ({ id: node.id, value: node.id, name: String(node.data.data.title ?? "") }))
  for (const node of flow.nodes) {
    if (node.data.type !== RETURN_TYPE) continue
    const data = node.data.data
    data.availableNodes = menus.map((menu) => ({ ...menu }))
    data.targetNodeName = menus.find((menu) => menu.id === data.targetNodeId)?.name ?? ""
  }
}

function numberTimeRules(flow: AtendimentoFlow, now: Date): void {
  let sequence = now.getTime()
  for (const node of flow.nodes) {
    const rules = node.data.data.timeRules
    if (node.data.type !== TIME_TYPE || !Array.isArray(rules)) continue
    node.data.data.timeRules = rules.map((rule) => (isObject(rule) ? { ...rule, id: `rule-${sequence++}` } : rule))
  }
}

function resolveOutput(node: AtendimentoNode, handles: readonly string[], output: string, busy: ReadonlySet<string>): string | undefined {
  const text = output.trim()
  if (!text) return handles.length === 1 ? handles[0] : undefined
  const direct = DIRECT_OUTPUT.exec(text)
  if (direct && handles.includes(`output-${Number(direct[1])}`)) return `output-${Number(direct[1])}`
  const key = labelKey(text)
  const matches = handles.filter((handle) => labelKey(outputLabel(node, handle)) === key)
  if (matches.length) return matches.find((handle) => !busy.has(handle)) ?? matches[0]
  const position = /^\d+$/.test(text) ? Number(text) : Number(NAMED_OUTPUT.exec(key)?.[1] ?? Number.NaN)
  if (Number.isInteger(position) && position >= 1 && position <= handles.length) return handles[position - 1]
  return undefined
}

export function assembleFlow(input: RiFlow, options: AssembleOptions = {}): AssembledFlow {
  const now = options.now ?? new Date()
  const ri = coerceRi(input) ?? { name: "", description: "", nodes: [], edges: [] }
  const notes: AssemblyNote[] = []
  const flow = newFlow(now)
  flow.name = flowName(options.name, ri.name, options.prompt)
  flow.description = shorten(options.description || ri.description || options.prompt || "", LIMITS.description)

  const platformIds = new Map<string, string>([[START_ID, START_ID]])
  const riIds = new Map<string, string>([[START_ID, START_ID]])
  const nodes = new Map<string, AtendimentoNode>(flow.nodes.map((node) => [node.id, node]))
  const returns: Array<{ node: AtendimentoNode; target: string; riId: string }> = []
  let ruleSequence = now.getTime()
  const context = { ruleId: () => `rule-${ruleSequence++}` }
  let startSeen = false
  let dropped = 0
  let counter = 1

  ri.nodes.forEach((raw, index) => {
    const given = raw.id.trim().slice(0, RI_LIMITS.id)
    let riId = given || `c${index + 1}`
    const type = canonicalType(raw.type)
    if (!type) {
      notes.push({ level: "warning", scope: "ia", message: `O tipo ${quote(raw.type)} não existe e o componente ${quote(riId)} foi descartado.`, riId })
      return
    }
    if (type === START_TYPE) {
      if (startSeen) notes.push({ level: "warning", scope: "ia", message: `O fluxo tem um único início; o componente ${quote(riId)} foi descartado.`, riId, type })
      startSeen = true
      if (given && !platformIds.has(riId)) platformIds.set(riId, START_ID)
      return
    }
    if (counter - 1 >= RI_LIMITS.nodes) {
      dropped++
      return
    }
    if (platformIds.has(riId)) {
      const renamed = uniqueId(riId, platformIds)
      notes.push({
        level: "warning",
        scope: "ia",
        message: given ? `O id ${quote(riId)} já está em uso; este componente passou a usar ${quote(renamed)}.` : `O ${index + 1}º componente veio sem id e passou a usar ${quote(renamed)}.`,
        riId: renamed,
        type,
      })
      riId = renamed
    } else if (!given) {
      notes.push({ level: "warning", scope: "ia", message: `O ${index + 1}º componente veio sem id e passou a usar ${quote(riId)}.`, riId, type })
    }
    const node = newNode(type, { x: 0, y: 0 }, String(++counter))
    const outcome = configureNode(type, raw.config, context)
    node.data.data = outcome.data
    settleData(type, node.data.data)
    flow.nodes.push(node)
    nodes.set(node.id, node)
    platformIds.set(riId, node.id)
    riIds.set(node.id, riId)
    for (const note of outcome.notes) notes.push({ level: note.level, scope: "ia", message: note.message, riId, nodeId: node.id, type })
    if (type === RETURN_TYPE) returns.push({ node, target: outcome.menuTarget ?? "", riId })
  })
  if (dropped) notes.push({ level: "warning", scope: "ia", message: `O fluxo aceita até ${RI_LIMITS.nodes} componentes; ${dropped} foram descartados.` })

  const folded = new Map<string, string | null>()
  for (const id of platformIds.keys()) {
    const key = id.toLowerCase()
    folded.set(key, folded.has(key) && folded.get(key) !== id ? null : id)
  }
  const resolve = (reference: string): string | undefined => {
    const id = reference.trim()
    const exact = platformIds.get(id)
    if (exact) return exact
    const match = folded.get(id.toLowerCase())
    if (match) return platformIds.get(match)
    return START_ALIASES.has(compactKey(id)) ? START_ID : undefined
  }

  const menus = () => flow.nodes.filter((node) => node.data.type === MENU_TYPE)
  for (const entry of returns) {
    const reference = entry.target.trim()
    const resolved = reference ? resolve(reference) : undefined
    let target = resolved && nodes.get(resolved)?.data.type === MENU_TYPE ? resolved : undefined
    if (!target && reference) {
      const titled = menus().filter((menu) => foldText(String(menu.data.data.title ?? "")) === foldText(reference))
      if (titled.length === 1) target = titled[0].id
    }
    if (!target && menus().length === 1) target = menus()[0].id
    if (target) {
      entry.node.data.data.targetNodeId = target
      entry.node.data.data.id = target
    } else if (reference) {
      notes.push({
        level: "warning",
        scope: "ia",
        message: `targetNodeId ${quote(reference)} não é o id de um Menu de Opções desta RI.`,
        riId: entry.riId,
        nodeId: entry.node.id,
        type: RETURN_TYPE,
      })
    }
  }

  const edgeLimit = ri.edges.length > RI_LIMITS.edges
  if (edgeLimit) notes.push({ level: "warning", scope: "ia", message: `O fluxo aceita até ${RI_LIMITS.edges} conexões; ${ri.edges.length - RI_LIMITS.edges} foram descartadas.` })
  const used = new Map<string, Map<string, string>>()
  for (const edge of ri.edges.slice(0, RI_LIMITS.edges)) {
    const from = edge.from.trim()
    const to = edge.to.trim()
    const source = resolve(from)
    const target = resolve(to)
    const sourceNode = source ? nodes.get(source) : undefined
    const sourceType = sourceNode?.data.type
    const origin = source ? riIds.get(source) : undefined
    const report = (message: string) => notes.push({ level: "warning", scope: "ia", message, ...(origin ? { riId: origin } : {}), ...(source ? { nodeId: source } : {}), ...(sourceType ? { type: sourceType } : {}) })
    if (!source || !sourceNode) {
      notes.push({ level: "warning", scope: "ia", message: `A conexão de ${quote(from)} para ${quote(to)} foi descartada: o id ${quote(from)} não existe.` })
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
    if (source === target) {
      report(`A conexão para ${quote(to)} foi descartada: um componente não se liga a ele mesmo.`)
      continue
    }
    const handles = outputHandles(sourceNode)
    if (!handles.length) {
      report(`A conexão para ${quote(to)} foi descartada: ${getComponentLabel(sourceNode.data.type)} não tem saídas e encerra o caminho.`)
      continue
    }
    const busy = used.get(source) ?? new Map<string, string>()
    const handle = resolveOutput(sourceNode, handles, edge.output, new Set(busy.keys()))
    const labels = handles.map((entry) => outputLabel(sourceNode, entry))
    if (!handle) {
      report(edge.output.trim()
        ? `A conexão para ${quote(to)} foi descartada: a saída ${quote(edge.output.trim())} não existe. Saídas: ${listQuoted(labels)}.`
        : `A conexão para ${quote(to)} foi descartada: informe a saída. Saídas: ${listQuoted(labels)}.`)
      continue
    }
    const taken = busy.get(handle)
    if (taken !== undefined) {
      report(`A conexão para ${quote(to)} foi descartada: a saída ${quote(outputLabel(sourceNode, handle))} já está ligada a ${quote(riIds.get(taken) ?? taken)}.`)
      continue
    }
    busy.set(handle, target)
    used.set(source, busy)
    flow.edges.push(createEdge(flow.edges, source, handle, target))
  }

  if (!flow.edges.some((edge) => edge.source === START_ID)) {
    const entered = new Set(flow.edges.map((edge) => edge.target))
    const candidates = flow.nodes.filter((node) => node.id !== START_ID && node.data.type !== NOTE_TYPE)
    const first = candidates.find((node) => !entered.has(node.id)) ?? candidates[0]
    if (first) flow.edges.unshift(createEdge(flow.edges, START_ID, "output-0", first.id))
  }

  routeMenuReturns(flow, riIds, notes)
  cloneSharedTails(flow, riIds)
  settleReturns(flow)
  numberTimeRules(flow, now)
  layoutFlow(flow)
  return { flow, platformIds, riIds, notes }
}

const blank = (value: unknown) => typeof value !== "string" || value.trim() === ""

function fillRequired(node: AtendimentoNode): string[] {
  const data = node.data.data
  const filled: string[] = []
  if (node.data.type === MENU_TYPE) {
    if (blank(data.title)) {
      data.title = "Escolha uma opção."
      filled.push("a mensagem do menu")
    }
    optionIndices(data).forEach((option, position) => {
      if (blank(data[`text-${option}`])) {
        data[`text-${option}`] = `Opção ${position + 1}`
        filled.push(`o título da opção ${position + 1}`)
      }
    })
  }
  if (node.data.type === "envio_pergunta" && blank(data.template)) {
    data.template = "Mensagem a definir."
    filled.push("a mensagem")
  }
  if (node.data.type === "randomizer" && (!Array.isArray(data.paths) || data.paths.length < 2)) {
    data.paths = [{ label: "Caminho A", weight: 50 }, { label: "Caminho B", weight: 50 }]
    filled.push("os caminhos")
  }
  if (node.data.type === "aiAgentBlock" && Array.isArray(data.exits)) {
    data.exits.forEach((exit, index) => {
      if (isObject(exit) && blank(exit.name)) {
        exit.name = `Saída ${index + 1}`
        filled.push(`o nome da saída ${index + 1}`)
      }
    })
  }
  return filled
}

function detachUnreachable(flow: AtendimentoFlow, riIds: ReadonlyMap<string, string>, notes: AssemblyNote[]): void {
  const reachable = new Set([START_ID, ...descendants(flow.edges, START_ID)])
  const detached = new Set(flow.edges.filter((edge) => !reachable.has(edge.source)).map((edge) => edge.source))
  if (!detached.size) return
  flow.edges = flow.edges.filter((edge) => !detached.has(edge.source))
  for (const node of flow.nodes) {
    if (!detached.has(node.id)) continue
    const origin = riIds.get(node.id)
    notes.push({
      level: "warning",
      scope: "ajuste",
      message: "O componente não é alcançado a partir do início e as conexões dele foram removidas. Ligue-o no editor ou exclua.",
      nodeId: node.id,
      ...(origin ? { riId: origin } : {}),
      type: node.data.type,
    })
  }
}

export function finalizeFlow(assembled: AssembledFlow): AssembledFlow {
  const flow = copy(assembled.flow)
  const riIds = new Map(assembled.riIds)
  const notes = [...assembled.notes]
  for (const node of flow.nodes) {
    const filled = fillRequired(node)
    if (!filled.length) continue
    const origin = riIds.get(node.id)
    notes.push({
      level: "warning",
      scope: "ajuste",
      message: `Preenchido com texto provisório: ${filled.join(", ")}. Revise.`,
      nodeId: node.id,
      ...(origin ? { riId: origin } : {}),
      type: node.data.type,
    })
  }
  detachUnreachable(flow, riIds, notes)
  const reachable = new Set([START_ID, ...descendants(flow.edges, START_ID)])
  for (const node of [...flow.nodes]) {
    if (!reachable.has(node.id) || node.data.type === NOTE_TYPE) continue
    const connected = new Set(flow.edges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle))
    for (const handle of outputHandles(node)) {
      if (connected.has(handle)) continue
      const end = newNode(FINISH_TYPE, { x: 0, y: 0 }, nextNodeId(flow.nodes))
      flow.nodes.push(end)
      flow.edges.push(createEdge(flow.edges, node.id, handle, end.id))
      const origin = riIds.get(node.id)
      notes.push({
        level: "warning",
        scope: "ajuste",
        message: `A saída ${quote(outputLabel(node, handle))} estava sem destino e foi ligada a um novo Encerrar Conversa. Revise.`,
        nodeId: node.id,
        ...(origin ? { riId: origin } : {}),
        type: node.data.type,
      })
    }
  }
  layoutFlow(flow)
  return { flow, platformIds: new Map(assembled.platformIds), riIds, notes }
}
