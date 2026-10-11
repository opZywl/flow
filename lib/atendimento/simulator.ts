import { MENU_TYPE, NOTE_TYPE, START_TYPE, TIME_TYPE, getComponentLabel } from "./catalog"
import { conditionIndices, isObject, nonempty, optionIndices, outputHandles, outputLabel } from "./format"
import type { AtendimentoEdge, AtendimentoFlow, AtendimentoNode, JsonObject, JsonValue } from "./types"

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

type Variables = Record<string, string>
type Messages = (data: JsonObject, variables: Variables) => string[]

interface Graph {
  flow: AtendimentoFlow
  nodes: Map<string, AtendimentoNode>
  links: Map<string, Map<string, string>>
}

interface Question {
  waiting: "answer" | "data"
  text?: JsonValue
  fallback?: string
}

interface Chosen {
  node: AtendimentoNode
  data: JsonObject
  variables: Variables
  index: number
}

interface Choice {
  intro: string | ((data: JsonObject) => string)
  before?: Messages
  ask?: (data: JsonObject) => Question | undefined
  answer?: (data: JsonObject, variables: Variables, reply: string) => void
  current?: (node: AtendimentoNode, variables: Variables, now: Date) => string | undefined
  describe?: (node: AtendimentoNode, handle: string, index: number) => string
  outcome?: (chosen: Chosen) => string[]
}

const MAX_STEPS = 100
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const REQUEST_TYPE = "solicitar_dados"
const WAIT_TYPE = "waitForAnswer"
const RETURN_TYPE = "voltar"
const PROTOCOL_SAMPLE = "[protocolo gerado na plataforma]"
const LINK_SAMPLE = "[link do chat gerado na plataforma]"
const INTEGRATION_SAMPLE = "[retorno da integração]"
const DELAY = /^[1-9]\d*$/
const OUTPUT = /^output-(\d+)$/
const TOKEN = /@@@([\w-]+(?::[\w-]+)*)|\{\{\s*([^{}\s]+)\s*\}\}|#NAME\b|\{protocol\}/g
const LANGUAGES = ["pt", "en", "es"]
const INTAKE = [["askName", "nome"], ["askEmail", "e-mail"], ["askNotes", "observações"]] as const
const TICKET_ACTIONS = [["enableComment", "Comentar"], ["enableReopen", "Reabrir"], ["enableClose", "Encerrar"], ["enableCsat", "Avaliar"]] as const
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })

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
const outputIndex = (handle: string) => Number(OUTPUT.exec(handle)?.[1] ?? -1)

function lookup(variables: Variables, key: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key]
  const lower = key.toLowerCase()
  const match = Object.keys(variables).find((entry) => entry.toLowerCase() === lower)
  return match === undefined ? undefined : variables[match]
}

function plain(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : ""
}

function textOf(value: JsonValue | undefined): string | undefined {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : ""
  return text || undefined
}

export function renderText(text: JsonValue | undefined, variables: Variables): string {
  return plain(text).replace(TOKEN, (token: string, legacy: string | undefined, modern: string | undefined) => lookup(variables, legacy ?? modern ?? (token === "#NAME" ? "name" : "protocol")) ?? token)
}

const first = (data: JsonObject, ...keys: string[]) => keys.map((key) => textOf(data[key])).find((value) => value !== undefined)
const quoted = (value: string | undefined) => value ? ` “${value.replace(/\s+/g, " ")}”` : ""
const optional = (value: JsonValue | undefined, variables: Variables): string[] => nonempty(value) ? [renderText(value, variables)] : []
const bubble = (parts: string[]): string[] => parts.length ? [parts.join("\n\n")] : []

function joinList(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}` : items.join("")
}

function storeAnswer(variables: Variables, field: string, value: string) {
  variables[field] = value
  const parts = field.split(":")
  if (parts[0] === "custom" && parts.length >= 3) {
    variables[parts.slice(1).join(":")] = value
    variables[parts[parts.length - 1]] = value
  }
}

function remember(variables: Variables, field: JsonValue | undefined, value: string) {
  const key = textOf(field)
  if (key) storeAnswer(variables, key, value)
}

function applyResponseSamples(node: AtendimentoNode, variables: Variables) {
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

function comparison(data: JsonObject, variables: Variables): string | undefined {
  const key = textOf(data.key)
  const actual = key === undefined ? undefined : lookup(variables, key)
  if (actual === undefined) return undefined
  const equal = actual.trim() === plain(data.value).trim()
  if (data.condition === "Igual a") return equal ? "output-1" : "output-0"
  if (data.condition === "Diferente de") return equal ? "output-0" : "output-1"
  return undefined
}

function matchingCondition(data: JsonObject, variables: Variables): string | undefined {
  const position = conditionIndices(data).findIndex((condition) => {
    const key = textOf(data[`var-${condition}`])
    const actual = key === undefined ? undefined : lookup(variables, key)
    return actual !== undefined && actual.trim() === plain(data[`value-${condition}`]).trim()
  })
  return position < 0 ? undefined : `output-${position}`
}

function weight(data: JsonObject, index: number): string {
  const path = Array.isArray(data.paths) ? data.paths[index] : undefined
  return isObject(path) && typeof path.weight === "number" && Number.isFinite(path.weight) ? ` (peso ${decimal.format(path.weight)})` : ""
}

function delayNotice(value: JsonValue | undefined): string {
  const milliseconds = plain(value)
  if (!DELAY.test(milliseconds)) return "Tempo de espera não definido. Na prévia a conversa segue sem esperar."
  const seconds = Number(milliseconds) / 1000
  return `Tempo de espera de ${decimal.format(seconds)} ${seconds === 1 ? "segundo" : "segundos"}. Na prévia a conversa segue sem esperar.`
}

function requested(data: JsonObject): string {
  const items = INTAKE.filter(([key]) => data[key] === true).map(([, item]) => item)
  return items.length ? `a plataforma pede ${joinList(items)}` : "a plataforma não pede dados"
}

function ticketActions(data: JsonObject, variables: Variables): string[] {
  const actions = TICKET_ACTIONS.filter(([key]) => data[key] === true).map(([, action]) => action)
  return bubble([...optional(data.actionPrompt, variables), ...(actions.length ? [`Ações oferecidas pela plataforma: ${joinList(actions)}.`] : [])])
}

function callButton(data: JsonObject, variables: Variables): string[] {
  const button = renderText(data.displayText, variables).trim()
  return bubble([...optional(data.text, variables), ...(button ? [`[${button}]`] : [])])
}

const withCaption = (notice: string, data: JsonObject, variables: Variables) => [notice, ...optional(data.caption, variables)].join("\n\n")
const greeting: Messages = (data, variables) => optional(data.introMessage, variables)

const apiSamples = ({ node, variables, index }: Chosen): string[] => {
  if (index === 1) applyResponseSamples(node, variables)
  return []
}

const stored = (key: string, sample: string) => ({ data, variables, index }: Chosen): string[] => {
  if (index === 0) remember(variables, data[key], sample)
  return []
}

const created = (sample: string, extra: Variables = {}) => ({ data, variables, index }: Chosen): string[] => {
  if (index !== 0) return optional(data.errorMessage, variables)
  remember(variables, data.outputVar, sample)
  Object.assign(variables, extra)
  return optional(data.successMessage, variables)
}

const concluded = ({ data, variables, index }: Chosen): string[] => index === 0 ? optional(data.doneMessage, variables) : []

const scheduleList = (intro: string, sample: string): Choice => ({
  intro,
  outcome: ({ data, variables, index }) => {
    if (index !== 0) return optional(data.emptyMessage, variables)
    const header = optional(data.headerMessage, variables)
    remember(variables, data.outputVar, sample)
    return header
  },
})

const integration = (intro: string): Choice => ({ intro, outcome: stored("resultVar", INTEGRATION_SAMPLE) })

const NOTICES = new Map<string, Messages>([
  [START_TYPE, () => []],
  ["envio_pergunta", (data, variables) => [renderText(data.template, variables)]],
  ["protocolo", (data, variables) => {
    if (!lookup(variables, "protocol")) variables.protocol = PROTOCOL_SAMPLE
    return [renderText(data.text, variables)]
  }],
  ["tags", (data, variables) => [`Tag${quoted(first(data, "tags", "selectedTag"))} aplicada ao atendimento.`, ...optional(data.message, variables)]],
  ["envio_arquivo", (data, variables) => [withCaption(data.voice_note === true ? "Mensagem de voz enviada." : `Arquivo${quoted(first(data, "filename", "url"))} enviado.`, data, variables)]],
  ["envio_imagem", (data, variables) => [withCaption(`Imagem${quoted(first(data, "filename", "imagem", "url"))} enviada.`, data, variables)]],
  ["templateMessage", (data) => [`Template${quoted(first(data, "templateName", "templateMessage"))} enviado.`]],
  ["templateInteractive", (data) => [`Template interativo${quoted(first(data, "templateName", "templateMessage"))} enviado.`]],
  ["pixCharge", (data) => [`Cobrança PIX enviada pelo template${quoted(first(data, "templateName", "templateMessage"))}.`]],
  ["tabulation", (data) => [`Tabulação${quoted(first(data, "tabulacaoName", "tabulacao"))} aplicada ao atendimento.`]],
  ["sendConversion", (data) => [`Conversão${quoted(first(data, "customEventName", "eventName"))} enviada.${data.onlyFromAd === true ? " Na plataforma, só é enviada quando a conversa veio de anúncio." : ""}`]],
  ["trackEvent", (data) => {
    const event = first(data, "eventName")
    return [event ? `Evento${quoted(event)} registrado.` : "Evento sem nome registrado."]
  }],
  ["waiting_time", (data) => [delayNotice(data.waiting_time)]],
  ["Send_DataStore", () => ["Envio para o DataStore simulado."]],
  ["sequenceUnenroll", (data) => [data.allSequences === true ? "Contato removido de todas as listas." : `Contato removido da lista${quoted(first(data, "sequenceName", "sequenceId"))}.`]],
])

const ENDINGS = new Map<string, Messages>([
  ["finalizar", (data, variables) => [...optional(data.message, variables), "Conversa finalizada."]],
  ["departamentos", (data) => [`Transferido para o departamento${quoted(first(data, "name", "departamento"))}. A prévia termina aqui.`]],
  ["transferir", (data) => [`Transferido para o agente${quoted(first(data, "agenteName", "agente"))}. A prévia termina aqui.`]],
  ["backToAgent", (data) => [`Atendimento devolvido ao agente no departamento${quoted(first(data, "departmentName", "department"))}. A prévia termina aqui.`]],
  ["flow", (data) => [`Encaminhado para o fluxo${quoted(first(data, "flowName", "targetFlow"))}. A prévia termina aqui.`]],
  ["OpenAI", (data) => [`Atendimento encaminhado para a IA${quoted(first(data, "aiModel", "df-OpenAI", "aiProvider"))}. A prévia termina aqui.`]],
])

const CHOICES = new Map<string, Choice>([
  [TIME_TYPE, {
    intro: "Condições de Tempo: escolha o caminho a testar.",
    current: (node, variables, now) => insideBusinessHours(node, now) ? "output-1" : "output-0",
  }],
  ["consulta_api", {
    intro: "Consulta API: a requisição não é enviada na prévia. Escolha o resultado a testar.",
    before: (data, variables) => optional(data.text, variables),
    outcome: apiSamples,
  }],
  [REQUEST_TYPE, {
    intro: "Solicitar Dados: a API não é chamada na prévia. Escolha o resultado da validação.",
    ask: (data) => ({ waiting: "data", text: data.text, fallback: "Informe o dado solicitado." }),
    answer: (data, variables, reply) => {
      variables.input = reply
    },
    outcome: apiSamples,
  }],
  ["whatsappFlow", {
    intro: "Enviar Formulário: o formulário não abre na prévia. Escolha o resultado a testar.",
    before: (data, variables) => nonempty(data.body) ? [renderText(data.body, variables)] : [`Formulário${quoted(first(data, "formName", "formId"))} enviado.`],
    outcome: ({ data, variables, index }) => index === 0 ? optional(data.successMessage, variables) : [],
  }],
  ["whatsappCall", {
    intro: "Transferir para Ligação: a ligação não acontece na prévia. Escolha o resultado a testar.",
    outcome: ({ data, variables, index }) => index === 0 ? callButton(data, variables) : optional(data.errorMessage, variables),
  }],
  ["webchatHandoff", {
    intro: "Continuar no Chat: o link não é gerado na prévia. Escolha o resultado a testar.",
    outcome: ({ data, variables, index }) => {
      if (index !== 0) return optional(data.errorMessage, variables)
      remember(variables, data.outputVar, LINK_SAMPLE)
      return optional(data.message, { ...variables, link: LINK_SAMPLE })
    },
  }],
  ["randomizer", {
    intro: "Randomizador: na plataforma o caminho é sorteado pelos pesos. Escolha o caminho a testar.",
    describe: (node, handle, index) => `${outputLabel(node, handle)}${weight(node.data.data, index)}`,
    outcome: ({ node, data, variables, index }) => {
      remember(variables, data.variable, outputLabel(node, `output-${index}`))
      return []
    },
  }],
  ["languageRouter", {
    intro: "Idioma: a identificação acontece na plataforma. Escolha o idioma a testar.",
    outcome: ({ data, variables, index }) => {
      const language = LANGUAGES[index]
      if (language) remember(variables, data.variable, language)
      return []
    },
  }],
  ["adCondition", { intro: "Veio do anúncio? A origem da conversa não é conhecida na prévia. Escolha o caminho a testar." }],
  ["Consent", { intro: "Consentimento: escolha a resposta do contato a testar." }],
  ["condicional_api", {
    intro: "Condicional: escolha o caminho a testar.",
    current: (node, variables) => comparison(node.data.data, variables),
  }],
  ["multiple_condicional_api", {
    intro: "Múltipla Condição: escolha o caminho a testar.",
    current: (node, variables) => matchingCondition(node.data.data, variables),
  }],
  ["Data_Input_Condicional", {
    intro: "Entrada de Dados: a validação não é executada na prévia. Escolha o resultado a testar.",
    ask: () => ({ waiting: "answer" }),
    answer: (data, variables, reply) => remember(variables, data.field, reply),
  }],
  ["External_Message_Http", { intro: "API de Mensagem: a requisição não é enviada na prévia. Escolha o resultado a testar." }],
  ["Local_DataStore", { intro: "DataStore Local: a base não é consultada na prévia. Escolha o resultado a testar." }],
  ["envio_boletos", {
    intro: "Enviar Boletos: os boletos não são consultados na prévia. Escolha o resultado a testar.",
    before: (data, variables) => optional(data.text, variables),
  }],
  ["api_options_menu", {
    intro: "Menu de Opções API: as opções vêm da API e não são carregadas na prévia. Escolha o resultado a testar.",
    before: (data, variables) => optional(data.message, variables),
    outcome: stored("variableName", "[opção escolhida]"),
  }],
  ["googleSheetsAppend", integration("Google Planilhas: a linha não é gravada na prévia. Escolha o resultado a testar.")],
  ["rdStationConversion", integration("RD Station: a conversão não é enviada na prévia. Escolha o resultado a testar.")],
  ["hubspotUpsertContact", integration("HubSpot: o contato não é enviado na prévia. Escolha o resultado a testar.")],
  ["apptService", scheduleList("Escolher Serviço: a lista de serviços vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.", "[serviço escolhido]")],
  ["apptIdentify", {
    intro: "Identificar Cliente: a identificação é feita pela agenda da plataforma e não é simulada. Escolha o resultado a testar.",
    outcome: stored("contactVar", "[cliente identificado]"),
  }],
  ["apptLocation", scheduleList("Escolher Local: a lista de locais vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.", "[local escolhido]")],
  ["apptProvider", scheduleList("Escolher Profissional: a lista de profissionais vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.", "[profissional escolhido]")],
  ["apptSlot", scheduleList("Escolher Horário: a lista de horários vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.", "[horário escolhido]")],
  ["apptCustomerIntake", {
    intro: (data) => `Dados do Cliente: ${requested(data)}. Escolha o resultado a testar.`,
    before: greeting,
    outcome: ({ data, variables, index }) => index === 0 ? optional(data.successMessage, variables) : [],
  }],
  ["apptBook", {
    intro: "Confirmar Agendamento: o agendamento não é criado na prévia. Escolha o resultado a testar.",
    outcome: created("[agendamento criado]"),
  }],
  ["ticketLookup", scheduleList("Consultar Chamados: os chamados não são carregados na prévia. Escolha o resultado a testar.", "[chamado escolhido]")],
  ["ticketCreate", {
    intro: "Abrir Chamado: o chamado não é criado na prévia. Escolha o resultado a testar.",
    before: (data, variables) => [...greeting(data, variables), ...(nonempty(data.formId) ? ["O formulário é enviado pela plataforma e não abre na prévia."] : [])],
    ask: (data) => !nonempty(data.formId) && nonempty(data.fallbackQuestion) ? { waiting: "data", text: data.fallbackQuestion } : undefined,
    outcome: created("[chamado aberto]", { ticketNumber: "[número do chamado]", link: "[link do chamado]" }),
  }],
  ["ticketDetail", {
    intro: "Detalhe do Chamado: o chamado não é consultado na prévia. Escolha o resultado a testar.",
    outcome: ({ data, variables, index }) => index === 0 ? ticketActions(data, variables) : optional(data.notFoundMessage, variables),
  }],
  ["crmIdentify", {
    intro: "Identificar Cliente: a consulta ao CRM não é feita na prévia. Escolha o resultado a testar.",
    outcome: ({ data, variables, index }) => {
      if (index === 0) {
        remember(variables, data.contactVar, "[contato identificado]")
        remember(variables, data.leadVar, "[ID do CRM]")
      }
      return []
    },
  }],
  ["crmContact", {
    intro: "Criar/Atualizar Contato: o CRM não é chamado na prévia. Escolha o resultado a testar.",
    before: greeting,
    outcome: created("[ID do contato]"),
  }],
  ["crmLead", {
    intro: "Capturar Lead: o CRM não é chamado na prévia. Escolha o resultado a testar.",
    before: greeting,
    ask: (data) => nonempty(data.qualifyPrompt) ? { waiting: "data", text: data.qualifyPrompt } : undefined,
    outcome: created("[ID do lead]"),
  }],
  ["crmLeadUpdate", { intro: "Qualificar Lead: o CRM não é chamado na prévia. Escolha o resultado a testar.", outcome: concluded }],
  ["crmActivity", { intro: "Agendar Follow-up: a atividade não é criada na prévia. Escolha o resultado a testar.", outcome: concluded }],
  ["sequenceEnroll", { intro: "Inscrever em Lista: a inscrição não é feita na prévia. Escolha o resultado a testar." }],
  ["aiAgentBlock", { intro: "Agente de IA: a conversa com o agente não é simulada na prévia. Escolha a saída a testar." }],
])

function listOptions(options: PreviewOption[]): string {
  return options.map((option) => `${option.digit}. ${option.text}`).join("\n")
}

function disconnected(node: AtendimentoNode, handle: string): string {
  return `A saída “${outputLabel(node, handle)}” de ${getComponentLabel(node.data.type)} (ID ${node.id}) não está conectada.`
}

const interrupted = (node: AtendimentoNode, reason: string) => `Prévia interrompida: ${getComponentLabel(node.data.type)} (ID ${node.id}) ${reason}.`

function wait(state: PreviewState, node: AtendimentoNode, waiting: PreviewState["waiting"], options: PreviewOption[] = []): PreviewState {
  return { ...state, nodeId: node.id, waiting, options }
}

function finish(state: PreviewState, ...messages: string[]): PreviewState {
  state.messages.push(...messages)
  return { ...state, nodeId: null, waiting: null, options: [] }
}

function proceed(graph: Graph, node: AtendimentoNode, state: PreviewState): string | PreviewState {
  return targetOf(graph, node, "output-0") ?? finish(state, disconnected(node, "output-0"))
}

function offer(edges: AtendimentoEdge[], node: AtendimentoNode, state: PreviewState, choice: Choice, now: Date): PreviewState {
  const current = choice.current?.(node, state.variables, now)
  const options = outputHandles(node, edges).map((handle, index) => ({
    digit: String(index + 1),
    text: `${choice.describe ? choice.describe(node, handle, index) : outputLabel(node, handle)}${handle === current ? " (agora)" : ""}`,
    handle,
  }))
  if (!options.length) return finish(state, interrupted(node, "não tem saídas"))
  const intro = typeof choice.intro === "string" ? choice.intro : choice.intro(node.data.data)
  state.messages.push(`${intro}\n\n${listOptions(options)}`)
  return wait(state, node, "branch", options)
}

function enter(graph: Graph, node: AtendimentoNode, state: PreviewState, choice: Choice, now: Date): PreviewState {
  const { data } = node.data
  state.messages.push(...(choice.before?.(data, state.variables) ?? []))
  const question = choice.ask?.(data)
  if (!question) return offer(graph.flow.edges, node, state, choice, now)
  const asked = renderText(question.text, state.variables) || question.fallback
  if (asked) state.messages.push(asked)
  return { ...wait(state, node, question.waiting), attempts: question.waiting === "data" ? 1 : state.attempts }
}

function menu(node: AtendimentoNode, state: PreviewState): PreviewState {
  const { data } = node.data
  const options = optionIndices(data).map((option, index) => {
    const handle = `output-${index}`
    return { digit: textOf(data[`opt-${option}`]) ?? String(option), text: outputLabel(node, handle), handle }
  })
  if (!options.length) return finish(state, interrupted(node, "não tem opções"))
  const title = renderText(data.title, state.variables)
  state.messages.push(nonempty(title) ? `${title}\n\n${listOptions(options)}` : listOptions(options))
  return wait(state, node, "menu", options)
}

function returnToMenu(graph: Graph, node: AtendimentoNode, state: PreviewState): string | PreviewState {
  const target = textOf(node.data.data.targetNodeId)
  if (target === undefined) return finish(state, interrupted(node, "não tem menu de destino"))
  const destination = graph.nodes.get(target)
  if (!destination) return finish(state, `Componente de destino não encontrado (ID ${target}).`)
  state.messages.push(`Retorno ao menu${quoted(textOf(destination.data.data.title) ?? target)}.`)
  return target
}

function visit(graph: Graph, node: AtendimentoNode, state: PreviewState, now: Date): string | PreviewState {
  const { type, data } = node.data
  const ending = ENDINGS.get(type)
  if (ending) return finish(state, ...ending(data, state.variables))
  const notice = NOTICES.get(type)
  if (notice) {
    state.messages.push(...notice(data, state.variables))
    return proceed(graph, node, state)
  }
  const choice = CHOICES.get(type)
  if (choice) return enter(graph, node, state, choice, now)
  if (type === MENU_TYPE) return menu(node, state)
  if (type === WAIT_TYPE) return wait(state, node, "answer")
  if (type === RETURN_TYPE) return returnToMenu(graph, node, state)
  if (type === NOTE_TYPE) return finish(state, interrupted(node, "não participa do atendimento"))
  return finish(state, interrupted(node, "não tem simulação"))
}

function run(graph: Graph, startId: string | undefined, base: Partial<PreviewState>, now: Date): PreviewState {
  const state: PreviewState = { ...emptyPreview(), ...base, messages: [...(base.messages || [])], variables: { ...(base.variables || {}) }, nodeId: null, waiting: null, options: [] }
  let id = startId
  for (let steps = 0; id && steps < MAX_STEPS; steps++) {
    const node = graph.nodes.get(id)
    if (!node) return finish(state, `Componente de destino não encontrado (ID ${id}).`)
    const next = visit(graph, node, state, now)
    if (typeof next !== "string") return next
    id = next
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
  const { type, data } = node.data
  const choice = CHOICES.get(type)
  const follow = (handle: string, messages: string[] = []): PreviewState => {
    const target = targetOf(graph, node, handle)
    return target ? run(graph, target, { variables, messages }, now) : { ...emptyPreview(), variables, messages: [...messages, disconnected(node, handle)] }
  }
  if (current.waiting === "answer" || current.waiting === "data") {
    if (!choice) {
      remember(variables, data.customFields, text)
      return follow("output-0")
    }
    choice.answer?.(data, variables, text)
    return offer(flow.edges, node, { ...current, variables, messages: [] }, choice, now)
  }
  const option = current.options.find((entry) => entry.digit === text) || (current.waiting === "menu" ? current.options.find((entry) => entry.text.trim().toLowerCase() === text.toLowerCase()) : undefined)
  if (!option) return { ...current, messages: [`Opção inválida.\n\n${listOptions(current.options)}`] }
  if (type === REQUEST_TYPE && option.handle === "output-0") {
    const limit = Number(data.tentativas) || 1
    if (current.attempts < limit) return { ...current, variables, waiting: "data", options: [], attempts: current.attempts + 1, messages: [renderText(data.error, variables) || "Não foi possível validar. Tente novamente."] }
  }
  return follow(option.handle, choice?.outcome?.({ node, data, variables, index: outputIndex(option.handle) }) ?? [])
}
