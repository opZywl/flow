import { MENU_TYPE, NOTE_TYPE, START_ID, START_TYPE, TIME_TYPE, getComponentLabel, getDefinition, mirrorKeys } from "../catalog"
import { createEdge, duplicateNode, isObject, newFlow, newNode, nextNodeId, optionIndices, outputHandles, outputLabel, validateFlow } from "../format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, FieldSpec, JsonObject } from "../types"
import { LIMITS, RI_LIMITS, type IssueScope } from "./contracts"
import { guideOf } from "./guide"
import { layoutFlow } from "./layout"
import { canonicalType, coerceRi, type RiFlow } from "./ri"
import { compactKey, foldText, listQuoted, quote, shorten } from "./text"
import { acceptedKeys, configureNode, settleData, slugOf, type NoteLevel } from "./values"

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
  known?: string
  fill?: boolean
  now?: Date
}

export interface AssembledFlow {
  flow: AtendimentoFlow
  platformIds: ReadonlyMap<string, string>
  riIds: ReadonlyMap<string, string>
  notes: AssemblyNote[]
  fill?: boolean
}

const RETURN_TYPE = "voltar"
const FINISH_TYPE = "finalizar"
const START_ALIASES = new Set(["inicio", "start", "iniciarfluxo", "triggermessage", "trigger"])
const NAMED_OUTPUT = /^(?:opcao|opção|saida|saída|caminho|condicao|condição|opt|output|option|path|exit)[\s_-]*(\d+)$/
const DIRECT_OUTPUT = /^output-(\d+)$/i
const FALLBACK_NAME = "Fluxo gerado por IA"
const PROTOCOL_TYPE = "protocolo"
const MESSAGE_TYPE = "envio_pergunta"
const MENU_TITLE_LIMIT = 1024
const MENU_PLACEHOLDER = "Escolha uma opção."
const WAIT_TYPE = "waitForAnswer"
const GENERIC_QUESTION = "Por favor, envie a sua resposta para continuarmos."
const DATE_HINT = "Use o formato DD/MM/AAAA."
const GENERIC_FIELD = /^(field\d*|campo\d*|campogenerico\d*|resposta\d*|answer\d*)$/
const KNOWN_QUESTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(name|nome|nomecompleto|fullname|seunome)$/, "Por favor, digite o seu nome."],
  [/^(empresa|company|nomedaempresa|razaosocial)$/, "Por favor, informe o nome da sua empresa."],
  [/^(email|mail)$/, "Por favor, informe o seu e-mail."],
  [/^(telefone|phone|celular|whatsapp|fone)$/, "Por favor, informe o seu telefone com DDD."],
  [/^(cpfcnpj|documento|document)$/, "Por favor, informe o seu CPF ou CNPJ."],
  [/^cpf$/, "Por favor, informe o seu CPF."],
  [/^cnpj$/, "Por favor, informe o CNPJ da empresa."],
  [/^(endereco|address)$/, "Por favor, informe o seu endereço com rua, número e bairro."],
  [/^(cep|zipcode|zip)$/, "Por favor, informe o seu CEP."],
  [/^(cidade|city)$/, "Por favor, informe a sua cidade."],
  [/^(datanascimento|nascimento|birthdate|birthday)$/, "Por favor, informe a sua data de nascimento."],
  [/^(data|date)$/, "Por favor, informe a data."],
  [/^(problema|problem|motivo|assunto|subject|reason)$/, "Por favor, descreva em poucas palavras o motivo do contato."],
  [/^(descricao|description|problemdescription|detalhes|details)$/, "Por favor, conte com detalhes o que aconteceu."],
  [/^(pedido|order|numeropedido|ordernumber)$/, "Por favor, informe o número do seu pedido."],
  [/^(protocolo|protocol)$/, "Por favor, informe o número do protocolo."],
]
const UNCHECKED_KINDS = new Set(["menuOptions", "conditionPairs", "menuNode"])

const blank = (value: unknown) => typeof value !== "string" || value.trim() === ""
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
    for (const edge of incoming) {
      if (edge === kept) continue
      const node = newNode(RETURN_TYPE, { x: 0, y: 0 }, nextNodeId(flow.nodes))
      node.data.data = returnData(menu.id)
      flow.nodes.push(node)
      retarget(flow, edge, node.id)
      notes.push(returnNote(menu, node, riIds.get(edge.source)))
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

function returnNote(menu: AtendimentoNode, back: AtendimentoNode, origin: string | undefined): AssemblyNote {
  const title = String(menu.data.data.title ?? "").trim() || `ID ${menu.id}`
  return {
    level: "warning",
    scope: "ajuste",
    message: `A conexão de volta ao menu ${quote(title)} foi trocada por Retornar ao Menu.`,
    nodeId: back.id,
    ...(origin ? { riId: origin } : {}),
    type: RETURN_TYPE,
  }
}

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0) || (isObject(value) && Object.keys(value).length === 0)

function requireKeys(flow: AtendimentoFlow, riIds: ReadonlyMap<string, string>, notes: AssemblyNote[], fill: boolean): void {
  const flagged = new Set<string>()
  for (const issue of validateFlow(flow)) for (const field of issue.fields ?? []) flagged.add(JSON.stringify([issue.nodeId ?? "", field.split(".")[0]]))
  for (const node of flow.nodes) {
    const type = node.data.type
    const required = guideOf(type, fill)?.required
    if (!required?.length) continue
    const accepted = acceptedKeys(type)
    const fields = getDefinition(type)?.fields ?? []
    for (const key of required) {
      const field = fields.find((entry) => entry.key === key)
      if (!field || UNCHECKED_KINDS.has(field.kind) || !accepted.includes(key)) continue
      if (flagged.has(JSON.stringify([node.id, key])) || !isEmptyValue(node.data.data[key])) continue
      const origin = riIds.get(node.id)
      notes.push({ level: "warning", scope: "ia", message: `Preencha ${quote(field.label)} (${key}), que é obrigatório.`, nodeId: node.id, ...(origin ? { riId: origin } : {}), type })
    }
  }
}

function linkStart(flow: AtendimentoFlow, riIds: ReadonlyMap<string, string>, notes: AssemblyNote[]): void {
  if (flow.edges.some((edge) => edge.source === START_ID)) return
  const entered = new Set(flow.edges.map((edge) => edge.target))
  const candidates = flow.nodes.filter((node) => node.id !== START_ID && node.data.type !== NOTE_TYPE)
  const roots = candidates.filter((node) => !entered.has(node.id))
  let first: AtendimentoNode | undefined
  let best = -1
  let rooted = false
  for (const node of candidates) {
    const reach = descendants(flow.edges, node.id)
    reach.delete(node.id)
    const root = !entered.has(node.id)
    if (reach.size > best || (reach.size === best && root && !rooted)) {
      first = node
      best = reach.size
      rooted = root
    }
  }
  if (!first) return
  flow.edges.unshift(createEdge(flow.edges, START_ID, "output-0", first.id))
  if (roots.length === 1 && roots[0] === first) return
  const origin = riIds.get(first.id)
  notes.push({
    level: "warning",
    scope: "ajuste",
    message: `O início não estava ligado e foi ligado a ${quote(origin ?? first.id)}, o componente que alcança mais passos. Revise.`,
    nodeId: first.id,
    ...(origin ? { riId: origin } : {}),
    type: first.data.type,
  })
}

function provisionalFields(type: string): FieldSpec[] {
  const platform = guideOf(type)?.platform ?? []
  return (getDefinition(type)?.fields ?? []).filter((field) => platform.includes(field.key) && (field.kind === "url" || /^ID\b/.test(field.label) || /\bID\b/.test(field.placeholder ?? "")))
}

export function provisionalMessage(label: string): string {
  return `Confira: ${label} ${/^(URL|Planilha)\b/.test(label) ? "provisória" : "provisório"}, troque pelo valor cadastrado na plataforma.`
}

const comparable = (value: string) => foldText(value).replace(/^https?:\/\//, "").replace(/\/+$/, "")

function mentioned(value: string, request: string): boolean {
  const key = comparable(value)
  if (!key) return true
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(request)
}

export function requestText(prompt?: string, known?: string): string {
  return prompt?.trim() ? foldText([prompt, known ?? ""].join("\n")) : ""
}

export function provisionalLabels(type: string, data: JsonObject, request: string): string[] {
  return provisionalFields(type)
    .filter((field) => {
      if (type === PROTOCOL_TYPE && field.key === "url_api" && data.opt !== "URL") return false
      const value = data[field.key]
      return typeof value === "string" && value.trim() !== "" && !mentioned(value, request)
    })
    .map((field) => field.label)
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
  const fill = options.fill !== false
  const request = fill ? requestText(options.prompt, options.known) : ""
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
    if (type === PROTOCOL_TYPE && node.data.data.opt === "URL" && String(node.data.data.url_api ?? "").trim() === "") {
      node.data.data.opt = "Automático"
      notes.push({
        level: "warning",
        scope: "plataforma",
        message: "Sem a URL da API de protocolo no pedido, o tipo passou para Automático. Informe a URL no editor para usar o tipo URL.",
        riId,
        nodeId: node.id,
        type,
      })
    }
    if (request) {
      for (const label of provisionalLabels(type, node.data.data, request)) notes.push({ level: "warning", scope: "plataforma", message: provisionalMessage(label), riId, nodeId: node.id, type })
    }
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
  const unresolved = new Map<string, Array<{ target: string; output: string; to: string; note: AssemblyNote }>>()
  for (const edge of ri.edges.slice(0, RI_LIMITS.edges)) {
    const from = edge.from.trim()
    const to = edge.to.trim()
    const source = resolve(from)
    const target = resolve(to)
    const sourceNode = source ? nodes.get(source) : undefined
    const sourceType = sourceNode?.data.type
    const origin = source ? riIds.get(source) : undefined
    const report = (message: string, level: NoteLevel = "warning"): AssemblyNote => {
      const note: AssemblyNote = { level, scope: "ia", message, ...(origin ? { riId: origin } : {}), ...(source ? { nodeId: source } : {}), ...(sourceType ? { type: sourceType } : {}) }
      notes.push(note)
      return note
    }
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
    const loop = source === target && sourceType === MENU_TYPE
    if (source === target && !loop) {
      report(`A conexão para ${quote(to)} foi descartada: um componente não se liga a ele mesmo.`)
      continue
    }
    const handles = outputHandles(sourceNode)
    if (!handles.length) {
      report(`A conexão para ${quote(to)} foi descartada: ${getComponentLabel(sourceNode.data.type)} não tem saídas e encerra o caminho.`)
      continue
    }
    const busy = used.get(source) ?? new Map<string, string>()
    const output = edge.output.trim()
    const labels = handles.map((entry) => outputLabel(sourceNode, entry))
    let handle = resolveOutput(sourceNode, handles, edge.output, new Set(busy.keys()))
    if (!handle && output && handles.length === 1) {
      handle = handles[0]
      report(`A saída ${quote(output)} não existe; foi usada a única saída, ${quote(labels[0])}.`, "hint")
    }
    if (!handle) {
      const note = report(output
        ? `A conexão para ${quote(to)} foi descartada: a saída ${quote(output)} não existe. Saídas: ${listQuoted(labels)}.`
        : `A conexão para ${quote(to)} foi descartada: informe a saída. Saídas: ${listQuoted(labels)}.`)
      if (output && !loop) unresolved.set(source, [...(unresolved.get(source) ?? []), { target, output, to, note }])
      continue
    }
    const taken = busy.get(handle)
    if (taken !== undefined) {
      report(`A conexão para ${quote(to)} foi descartada: a saída ${quote(outputLabel(sourceNode, handle))} já está ligada a ${quote(riIds.get(taken) ?? taken)}.`)
      continue
    }
    let destination = target
    if (loop) {
      const back = newNode(RETURN_TYPE, { x: 0, y: 0 }, nextNodeId(flow.nodes))
      back.data.data = returnData(source)
      flow.nodes.push(back)
      destination = back.id
      notes.push(returnNote(sourceNode, back, origin))
    }
    busy.set(handle, destination)
    used.set(source, busy)
    flow.edges.push(createEdge(flow.edges, source, handle, destination))
  }

  for (const [source, pending] of unresolved) {
    const sourceNode = nodes.get(source)
    if (!sourceNode || pending.length !== 1) continue
    const busy = used.get(source) ?? new Map<string, string>()
    const free = outputHandles(sourceNode).filter((handle) => !busy.has(handle))
    if (free.length !== 1) continue
    const [entry] = pending
    busy.set(free[0], entry.target)
    used.set(source, busy)
    flow.edges.push(createEdge(flow.edges, source, free[0], entry.target))
    const index = notes.indexOf(entry.note)
    if (index >= 0) {
      notes[index] = {
        ...entry.note,
        scope: "ajuste",
        message: `A saída ${quote(entry.output)} não existe; a conexão para ${quote(entry.to)} foi ligada à única saída livre, ${quote(outputLabel(sourceNode, free[0]))}. Revise.`,
      }
    }
  }

  linkStart(flow, riIds, notes)
  requireKeys(flow, riIds, notes, fill)
  routeMenuReturns(flow, riIds, notes)
  cloneSharedTails(flow, riIds)
  settleReturns(flow)
  numberTimeRules(flow, now)
  layoutFlow(flow)
  return { flow, platformIds, riIds, notes, ...(fill ? {} : { fill: false }) }
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

function lowerLabel(label: string): string {
  return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(label) ? `${label[0].toLocaleLowerCase("pt-BR")}${label.slice(1)}` : label
}

function fillReferences(node: AtendimentoNode): { filled: string[]; ids: string[] } {
  const filled: string[] = []
  const ids: string[] = []
  const references = guideOf(node.data.type)?.references
  const definition = getDefinition(node.data.type)
  if (!references?.length || !definition) return { filled, ids }
  const fieldOf = (key: string) => definition.fields?.find((field) => field.key === key)
  const set = (key: string, value: string) => {
    if (definition.configured && !Object.prototype.hasOwnProperty.call(node.data.data, key)) node.data.data = { ...definition.configured(), ...node.data.data }
    node.data.data[key] = value
    const field = fieldOf(key)
    if (field) for (const mirror of mirrorKeys(field)) node.data.data[mirror] = value
  }
  for (const reference of references) {
    const skip = reference.unless ? node.data.data[reference.unless] : undefined
    if (skip === true || !blank(skip)) continue
    if (reference.name && blank(node.data.data[reference.name])) {
      set(reference.name, reference.fallback)
      filled.push(`${lowerLabel(fieldOf(reference.name)?.label ?? reference.name)} ${quote(reference.fallback)}`)
    }
    if (reference.id && blank(node.data.data[reference.id])) {
      const name = reference.name ? node.data.data[reference.name] : undefined
      const id = (typeof name === "string" ? slugOf(name) : "") || slugOf(reference.fallback)
      set(reference.id, id)
      const label = fieldOf(reference.id)?.label ?? reference.id
      filled.push(`${lowerLabel(label)} ${quote(id)}`)
      ids.push(label)
    }
  }
  return { filled, ids }
}

function titleCut(title: string): number {
  const floor = title.length - MENU_TITLE_LIMIT
  const fits = (end: number) => end >= floor && end < title.length && title.slice(0, end).trim() !== "" && title.slice(end).trim() !== ""
  const ends = (pattern: RegExp) => [...title.matchAll(pattern)].map((match) => (match.index ?? 0) + match[0].length).filter(fits)
  for (const pattern of [/\n[ \t]*\n\s*/g, /\n\s*/g, /[.!?:;]\s+/g]) {
    const found = ends(pattern)
    if (found.length) return found[found.length - 1]
  }
  return ends(/\s+/g)[0] ?? title.length
}

function splitLongMenus(flow: AtendimentoFlow, riIds: ReadonlyMap<string, string>, notes: AssemblyNote[]): void {
  for (const menu of flow.nodes.filter((node) => node.data.type === MENU_TYPE)) {
    const title = String(menu.data.data.title ?? "")
    if (title.length <= MENU_TITLE_LIMIT) continue
    const cut = titleCut(title)
    const lead = newNode(MESSAGE_TYPE, { x: 0, y: 0 }, nextNodeId(flow.nodes))
    const whole = cut >= title.length
    lead.data.data.template = title.slice(0, cut).trim()
    menu.data.data.title = whole ? MENU_PLACEHOLDER : title.slice(cut).trim()
    flow.nodes.push(lead)
    for (const edge of flow.edges.filter((entry) => entry.target === menu.id)) retarget(flow, edge, lead.id)
    flow.edges.push(createEdge(flow.edges, lead.id, "output-0", menu.id))
    const origin = riIds.get(menu.id)
    notes.push({
      level: "warning",
      scope: "ajuste",
      message: whole
        ? `A mensagem do menu passava de ${MENU_TITLE_LIMIT} caracteres e foi inteira para um Enviar Mensagem antes do menu; o menu ficou com um texto provisório. Revise.`
        : `A mensagem do menu passava de ${MENU_TITLE_LIMIT} caracteres; o começo foi para um Enviar Mensagem antes do menu. Revise.`,
      nodeId: lead.id,
      ...(origin ? { riId: origin } : {}),
      type: MESSAGE_TYPE,
    })
  }
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

function fieldName(value: string): string {
  const parts = value.split(":")
  return (parts[parts.length - 1] ?? "").trim()
}

export function waitQuestion(data: JsonObject): string {
  const field = fieldName(typeof data.customFields === "string" ? data.customFields : "")
  const key = compactKey(field)
  const known = KNOWN_QUESTIONS.find(([pattern]) => pattern.test(key))?.[1]
  const human = field.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  const question = known ?? (key && !GENERIC_FIELD.test(key) && human ? `Por favor, informe: ${human}.` : GENERIC_QUESTION)
  return data.mask === "DD/MM/YYYY" ? `${question} ${DATE_HINT}` : question
}

export function unaskedWaits(flow: AtendimentoFlow, include: (edge: AtendimentoEdge) => boolean = () => true): AtendimentoEdge[] {
  const types = new Map(flow.nodes.map((node) => [node.id, node.data.type]))
  return flow.edges.filter((edge) => {
    const source = types.get(edge.source)
    return types.get(edge.target) === WAIT_TYPE && source !== undefined && source !== MESSAGE_TYPE && source !== NOTE_TYPE && include(edge)
  })
}

export function askBeforeWaits(flow: AtendimentoFlow, edges: readonly AtendimentoEdge[], nextId: () => string, riOf: (id: string) => string | undefined): { notes: AssemblyNote[]; added: string[] } {
  const notes: AssemblyNote[] = []
  const added: string[] = []
  for (const edge of edges) {
    const wait = flow.nodes.find((node) => node.id === edge.target)
    if (!wait || !flow.edges.includes(edge)) continue
    const ask = newNode(MESSAGE_TYPE, { x: 0, y: 0 }, nextId())
    const question = waitQuestion(wait.data.data)
    ask.data.data.template = question
    flow.nodes.push(ask)
    retarget(flow, edge, ask.id)
    flow.edges.push(createEdge(flow.edges, ask.id, "output-0", wait.id))
    added.push(ask.id)
    const origin = riOf(wait.id)
    notes.push({
      level: "warning",
      scope: "ajuste",
      message: `Foi incluído um Enviar Mensagem com a pergunta ${quote(question)} logo antes do Aguardando Mensagem. Revise.`,
      nodeId: ask.id,
      ...(origin ? { riId: origin } : {}),
      type: MESSAGE_TYPE,
    })
  }
  return { notes, added }
}

export function provisionalReferences(node: AtendimentoNode, riId?: string): AssemblyNote[] {
  const provisional = fillReferences(node)
  if (!provisional.filled.length) return []
  const base = { nodeId: node.id, ...(riId ? { riId } : {}), type: node.data.type }
  return [
    { level: "warning", scope: "ajuste", message: `Preenchido com valor provisório: ${provisional.filled.join(", ")}. Revise.`, ...base },
    ...provisional.ids.map((label): AssemblyNote => ({ level: "warning", scope: "plataforma", message: provisionalMessage(label), ...base })),
  ]
}

export function finalizeFlow(assembled: AssembledFlow): AssembledFlow {
  const flow = copy(assembled.flow)
  const riIds = new Map(assembled.riIds)
  const notes = [...assembled.notes]
  const fill = assembled.fill !== false
  for (const node of flow.nodes) {
    const origin = riIds.get(node.id)
    if (fill) notes.push(...provisionalReferences(node, origin))
    const filled = fillRequired(node)
    if (!filled.length) continue
    notes.push({
      level: "warning",
      scope: "ajuste",
      message: `Preenchido com texto provisório: ${filled.join(", ")}. Revise.`,
      nodeId: node.id,
      ...(origin ? { riId: origin } : {}),
      type: node.data.type,
    })
  }
  splitLongMenus(flow, riIds, notes)
  settleReturns(flow)
  detachUnreachable(flow, riIds, notes)
  notes.push(...askBeforeWaits(flow, unaskedWaits(flow), () => nextNodeId(flow.nodes), (id) => riIds.get(id)).notes)
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
  return { flow, platformIds: new Map(assembled.platformIds), riIds, notes, ...(assembled.fill === false ? { fill: false } : {}) }
}
