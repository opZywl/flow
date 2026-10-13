import { NoObjectGeneratedError, streamObject } from "ai"
import type { ModelMessage } from "ai"
import { z } from "zod"
import { NOTE_TYPE, START_ID, START_TYPE, categories, componentCatalog, getComponentLabel } from "../catalog"
import { importFlow } from "../format"
import type { AtendimentoFlow } from "../types"
import { LIMITS } from "./contracts"
import type { Effort, GenerateFailure } from "./contracts"
import { flowToRi } from "./edit"
import { guideOf } from "./guide"
import type { ProviderId } from "./providers"
import type { RiFlow, RiNode } from "./ri"
import { createSetup, describeFailure, isFormatFailure, notify, parseGenerationRequest, relax, stopped, unfinished } from "./runner"
import type { ModelSetup, StreamWatch, Transport } from "./runner"
import { foldText, parseJsonText, quote, shorten, sliceObject } from "./text"

export interface InterviewMessage {
  role: "assistant" | "user"
  text: string
}

export type InterviewAction = "ask" | "generate" | "edit" | "finish"

export type InterviewScope = "builder" | "copilot"

export interface InterviewTurn {
  message: string
  suggestions: string[]
  action: InterviewAction
  plan: string
}

export interface InterviewInput {
  provider: ProviderId
  model: string
  apiKey: string
  effort: Effort
  fill?: boolean
  history: InterviewMessage[]
  flow?: AtendimentoFlow | null
  scope?: InterviewScope
  proposal?: boolean
}

export interface InterviewHooks {
  transport: Transport
  signal: AbortSignal
  fetch?: typeof fetch
  onPartial?: (turn: Partial<InterviewTurn>) => void
}

export type InterviewResult = { ok: true; turn: InterviewTurn } | { ok: false; failure: GenerateFailure }

export const INTERVIEW_ACTIONS: readonly InterviewAction[] = ["ask", "generate", "edit", "finish"]

export const INTERVIEW_SCHEMA_NAME = "turno_conversa"
export const INTERVIEW_SCHEMA_DESCRIPTION = "Próxima fala do assistente que monta o fluxo de atendimento conversando"

export const SUGGESTION_LIMITS = { min: 2, max: 5, length: 80 } as const

export const interviewSchema: z.ZodType<InterviewTurn> = z.object({
  message: z.string().describe("Fala para o usuário: a proposta e uma pergunta, o aviso de montagem ou de edição, ou a despedida"),
  suggestions: z.array(z.string()).describe("De 2 a 5 respostas curtas que o usuário pode clicar; vazio fora de ask"),
  action: z.enum(["ask", "generate", "edit", "finish"]).describe("ask pergunta, generate monta o fluxo novo, edit altera o fluxo aberto, finish encerra a conversa"),
  plan: z.string().describe("Descrição consolidada do atendimento com todas as decisões até aqui; na edição, o pedido de mudança completo"),
})

const HISTORY_MESSAGES = 80
const HISTORY_CHARS = 60_000
const RELAX_LIMIT = 2
const PART_LIMIT = 70
const SUMMARY_LIMIT = 32_000
const VALIDATION_PROMPT = "Conversa para montar um fluxo de atendimento."
const HISTORY_EMPTY = "Escreva o que você precisa no atendimento."
const HISTORY_INVALID = "Não foi possível ler a conversa."
const FLOW_INVALID = "Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo."
const CONTINUE = "Continue a conversa a partir do último registro."
const FORMAT_RETRY = "A resposta anterior não seguiu o formato pedido. Responda de novo só com o objeto: message, suggestions, action e plan."
const OMITTED = "Mensagens anteriores da conversa foram resumidas no plano."
const ABORTED = "A resposta foi cancelada."
const UNKNOWN = "Não foi possível continuar a conversa."

const DEFAULT_MESSAGES: Readonly<Record<InterviewAction, string>> = {
  ask: "Me conte como você quer que o atendimento funcione.",
  generate: "Vou montar o fluxo com o que combinamos.",
  edit: "Vou aplicar essa mudança no fluxo.",
  finish: "Combinado. Quando precisar de outro ajuste, é só escrever aqui.",
}

const PREFERRED_KEYS = [
  "title",
  "template",
  "text",
  "message",
  "headerMessage",
  "introMessage",
  "body",
  "fallbackQuestion",
  "actionPrompt",
  "name",
  "departmentName",
  "agenteName",
  "flowName",
  "templateName",
  "formName",
  "sequenceName",
  "tabulacaoName",
  "generativeAiName",
  "sheetName",
  "eventName",
  "tags",
  "displayText",
  "caption",
  "url_api",
  "url",
  "options",
  "timeRules",
  "paths",
  "exits",
  "conditions",
  "columns",
  "customFields",
  "field",
  "channel",
  "key",
  "targetNodeId",
  "waiting_time",
]

const WEEK_DAYS: Readonly<Record<string, string>> = { monday: "seg", tuesday: "ter", wednesday: "qua", thursday: "qui", friday: "sex", saturday: "sáb", sunday: "dom" }

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

function asText(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function pick(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (record[key] !== undefined) return record[key]
  return undefined
}

function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/)
  return end < 0 ? text.trim() : text.slice(0, end + 1).trim()
}

function componentSection(): string {
  const lines: string[] = []
  const listed = new Set<string>()
  const groups = [...categories.map((category) => ({ id: category.id as string, label: category.label as string })), { id: "", label: "Outros" }]
  for (const group of groups) {
    const items = componentCatalog.filter((definition) => {
      const type = definition.nativeType ?? definition.id
      if (type === START_TYPE || type === NOTE_TYPE || listed.has(type)) return false
      return group.id ? definition.category === group.id : true
    })
    if (!items.length) continue
    lines.push(`## ${group.label}`)
    for (const definition of items) {
      const type = definition.nativeType ?? definition.id
      listed.add(type)
      const does = guideOf(type)?.does
      lines.push(`- ${definition.label}${does ? `: ${firstSentence(does)}` : ""}`)
    }
  }
  return lines.join("\n")
}

const PROMPT_LINES = [
  "Você é o assistente que monta fluxos de atendimento por WhatsApp conversando com o usuário, na plataforma de Atendimento. Você planeja o atendimento a partir do pedido e confirma com o usuário cada decisão, um assunto por vez, até o fluxo ficar completo. Outro sistema desenha o fluxo no editor a partir do plano que você escreve.",
  "",
  "# Como conduzir a conversa",
  "1. No primeiro pedido, planeje o fluxo inteiro antes de perguntar: etapas, menus e opções, dados a coletar, integrações, transferências e encerramento.",
  "2. Pergunte sobre um assunto por vez, nesta ordem, e pule o que o usuário já decidiu: mensagem de boas-vindas; horário de atendimento e o que acontece fora dele; opções do menu principal; o que acontece em cada opção, uma opção por vez; dados a coletar do contato e como validar; integrações e APIs; departamento de cada transferência; encerramento e pesquisa de satisfação.",
  "3. Proponha o que você planejou para o assunto e pergunte se fica assim. Exemplo para um fluxo de envio de boleto: Pensei em um menu com Segunda via do boleto, Já paguei e Falar com o financeiro. Fica assim ou quer mudar alguma opção?",
  "4. Cada pergunta traz de 2 a 5 sugestões em suggestions: respostas curtas, prontas para clicar, com até 60 caracteres, escritas como o usuário responderia. Inclua uma para aceitar a proposta, como Pode ser assim, e uma para montar já, como Pode montar o fluxo.",
  "5. Aceite respostas livres. Quando o usuário pede algo a mais, coloque no plano e pergunte o que faltar sobre esse pedido.",
  "6. Quando o usuário não sabe ou deixa a escolha com você, adote a sua proposta e siga para o próximo assunto.",
  "7. Mensagens curtas: até 3 frases, com uma única pergunta, no fim.",
  "",
  "# Plano",
  "1. plan traz sempre a descrição consolidada do atendimento, com todas as decisões tomadas até aqui, escrita como um cliente descreve o próprio atendimento para quem vai montar o fluxo: empresa e assunto, boas-vindas, horário, cada menu com as opções na ordem, o que acontece em cada opção, as mensagens principais, os dados coletados e como validar, as integrações com as URLs informadas, os departamentos de cada transferência e o encerramento.",
  "2. Atualize plan em toda resposta, inclusive nas perguntas. Decisão nova entra no plano e decisão mudada substitui a anterior.",
  "3. O plano reúne o que o usuário disse e as suas propostas que ele aceitou, em parágrafos objetivos, com até 6.000 caracteres.",
  "4. Com fluxo aberto, plan traz o pedido de mudança completo: o que criar, alterar ou remover, citando os componentes do fluxo atual pelo texto ou pelo nome que aparecem no resumo do fluxo.",
  "",
  "# Ações",
  "- ask: ainda falta decidir algo. message traz a proposta e a pergunta, e suggestions traz as respostas sugeridas.",
  "- generate: não há fluxo aberto e o plano cobre todos os assuntos, ou o usuário pediu para montar. Quando o usuário pede para montar antes do fim, use as suas propostas nos assuntos que faltam. message avisa em uma frase que você vai montar o fluxo, suggestions fica vazio e plan traz a descrição completa.",
  "- edit: há um fluxo aberto e o pedido de mudança está completo. message avisa em uma frase o que vai mudar, suggestions fica vazio e plan traz o pedido de mudança completo.",
  "- finish: o usuário disse que já tem tudo de que precisa ou encerrou a conversa. message traz uma despedida curta e suggestions fica vazio.",
  "",
  "# Depois de montar ou editar",
  "1. A interface registra no histórico cada vez que o fluxo é montado ou editado. Na resposta seguinte, use ask: diga em uma frase o que ficou pronto e pergunte se precisa de mais alguma coisa, com sugestões como Adicionar pesquisa de satisfação, Mudar o horário de atendimento e Não, é só isso.",
  "2. Com fluxo aberto, cada pedido novo vira uma edição: pergunte o que faltar para a mudança, um assunto por vez, e devolva edit com o pedido completo. Depois de cada edição, pergunte de novo se precisa de mais alguma coisa.",
  "",
  "# Estilo",
  "1. Português do Brasil, cordial e direto, tratando o usuário por você.",
  "2. Escreva só com letras, números e a pontuação comum: ponto final, vírgula, dois-pontos e ponto de interrogação na pergunta.",
  "3. Fale do atendimento com as palavras do usuário: menu, opção, mensagem, transferência, horário. Os nomes de componente servem para você planejar.",
  "",
  "# Componentes da plataforma",
  "Use esta lista para propor etapas que a plataforma oferece, como validar CPF em uma API, enviar boletos, abrir chamado, agendar ou registrar lead.",
]

let cachedPrompt: string | undefined

export function interviewSystemPrompt(): string {
  if (cachedPrompt === undefined) cachedPrompt = [...PROMPT_LINES, componentSection()].join("\n")
  return cachedPrompt
}

function weekDays(days: unknown): string {
  if (!Array.isArray(days)) return ""
  return days.map((day) => WEEK_DAYS[asText(day)] ?? asText(day)).filter(Boolean).join(",")
}

function itemText(item: unknown): string {
  if (!isRecord(item)) return asText(item)
  if (Array.isArray(item.weekDays)) return `${weekDays(item.weekDays)} ${asText(item.startTime)}-${asText(item.endTime)}`.trim()
  if (item.var !== undefined) return `${asText(item.var)} = ${asText(item.value)}`
  return asText(pick(item, ["text", "name", "label", "title", "header", "key"]))
}

function readable(value: string): string {
  const trimmed = value.trim()
  if (!/^[[{]/.test(trimmed)) return trimmed
  const parsed = parseJsonText(trimmed)
  if (!parsed.ok) return trimmed
  const list = Array.isArray(parsed.value) ? parsed.value : [parsed.value]
  return list.map(itemText).filter((text) => text.trim()).join(", ")
}

function brief(node: RiNode): string {
  const config = new Map(node.config.map((entry) => [entry.key, entry.value]))
  const keys = [...new Set([...(guideOf(node.type)?.required ?? []), ...PREFERRED_KEYS])]
  const parts: string[] = []
  for (const key of keys) {
    const value = config.get(key)
    if (!value) continue
    const text = shorten(readable(value), PART_LIMIT)
    if (!text) continue
    parts.push(key === "options" ? `opções: ${text}` : key === "targetNodeId" ? `volta para ${text}` : quote(text))
    if (parts.length >= 2) break
  }
  return parts.join(" ")
}

function summaryLines(ri: RiFlow, detailed: boolean): string[] {
  const outgoing = new Map<string, string[]>()
  for (const edge of ri.edges) {
    const target = edge.output.trim() ? `${edge.output.trim()} -> ${edge.to}` : `-> ${edge.to}`
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), target])
  }
  const exits = (id: string) => {
    const list = outgoing.get(id)
    return list?.length ? ` | ${list.join("; ")}` : ""
  }
  const lines = [`- ${START_ID} (${getComponentLabel(START_TYPE)})${exits(START_ID)}`]
  for (const node of ri.nodes) {
    const detail = detailed ? brief(node) : ""
    lines.push(`- ${node.id} (${getComponentLabel(node.type)})${detail ? ` ${detail}` : ""}${exits(node.id)}`)
  }
  return lines
}

function hasComponents(flow: AtendimentoFlow): boolean {
  return flow.nodes.some((node) => node.data.type !== START_TYPE && node.data.type !== NOTE_TYPE)
}

export function interviewFlowSummary(flow: AtendimentoFlow): string {
  const ri = flowToRi(flow)
  const head = [`Nome: ${flow.name || "sem nome"}`, `Componentes: ${ri.nodes.length}`, "Cada linha: id (componente) textos principais | saídas e destinos."]
  const detailed = [...head, ...summaryLines(ri, true)].join("\n")
  if (detailed.length <= SUMMARY_LIMIT) return detailed
  return [...head, ...summaryLines(ri, false)].join("\n")
}

function fillLine(fill: boolean): string {
  return fill
    ? "Preenchimento ligado: na montagem, nomes cadastrados, IDs e URLs que o usuário não informar recebem valores provisórios, e o editor avisa cada um para ele trocar. Pergunte por esses valores só quando o usuário quiser informar e siga sem eles quando ele preferir."
    : "Preenchimento desligado: nomes cadastrados, IDs e URLs que o usuário não informar ficam vazios para ele completar no editor. Ao tratar de transferências e integrações, pergunte o nome do departamento cadastrado e a URL da API, e aceite que ele complete depois."
}

function stateText(flow: AtendimentoFlow | null, fill: boolean): string {
  const lines = ["# Situação atual"]
  if (flow) {
    lines.push("Há um fluxo aberto no editor, resumido abaixo. Cada pedido vira uma mudança nesse fluxo: quando o pedido estiver completo, devolva edit.", "", "# Resumo do fluxo aberto", interviewFlowSummary(flow))
  } else {
    lines.push("Não há fluxo aberto no editor. Quando o plano estiver completo ou o usuário pedir para montar, devolva generate.")
  }
  lines.push("", fillLine(fill))
  return lines.join("\n")
}

function cleanHistory(history: unknown): InterviewMessage[] | null {
  if (!Array.isArray(history)) return null
  const messages: InterviewMessage[] = []
  for (const entry of history) {
    if (!isRecord(entry) || (entry.role !== "user" && entry.role !== "assistant") || typeof entry.text !== "string") return null
    const text = entry.text.trim().slice(0, LIMITS.prompt)
    if (!text) continue
    const last = messages[messages.length - 1]
    if (last && last.role === entry.role) last.text = `${last.text}\n\n${text}`
    else messages.push({ role: entry.role, text })
  }
  while (messages.length && messages[0].role === "assistant") messages.shift()
  return messages
}

function trimHistory(messages: InterviewMessage[]): InterviewMessage[] {
  const total = messages.reduce((sum, message) => sum + message.text.length, 0)
  if (messages.length <= HISTORY_MESSAGES && total <= HISTORY_CHARS) return messages
  const [first, ...rest] = messages
  const kept: InterviewMessage[] = []
  let used = first.text.length
  for (let index = rest.length - 1; index >= 0 && kept.length < HISTORY_MESSAGES - 2; index--) {
    if (used + rest[index].text.length > HISTORY_CHARS) break
    used += rest[index].text.length
    kept.unshift(rest[index])
  }
  if (kept[0]?.role === "user") kept.unshift({ role: "assistant", text: OMITTED })
  return [first, ...kept]
}

function conversation(messages: InterviewMessage[]): ModelMessage[] {
  const list: ModelMessage[] = messages.map((message) => ({ role: message.role, content: message.text }))
  if (messages[messages.length - 1]?.role === "assistant") list.push({ role: "user", content: CONTINUE })
  return list
}

function tidy(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\uFE0F?/gu, "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\?!+/g, "?")
    .replace(/!+/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

function cleanSuggestions(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const value of values) {
    const text = shorten(tidy(value).replace(/[.,;:]+$/, ""), SUGGESTION_LIMITS.length)
    const key = foldText(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(text)
    if (list.length >= SUGGESTION_LIMITS.max) break
  }
  return list
}

function clipPlan(text: string): string {
  const plan = text.trim()
  if (plan.length <= LIMITS.prompt) return plan
  const cut = plan.slice(0, LIMITS.prompt)
  const space = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"))
  return (space >= LIMITS.prompt / 2 ? cut.slice(0, space) : cut).trim()
}

function coerceTurn(value: unknown): InterviewTurn | null {
  if (!isRecord(value)) return null
  const rawSuggestions = pick(value, ["suggestions", "sugestoes", "sugestões", "options", "opcoes", "opções"])
  const suggestions = Array.isArray(rawSuggestions) ? rawSuggestions.map(asText) : typeof rawSuggestions === "string" && rawSuggestions.trim() ? [rawSuggestions] : []
  const rawAction = asText(pick(value, ["action", "acao", "ação"])).trim().toLowerCase()
  return {
    message: asText(pick(value, ["message", "mensagem", "pergunta", "question", "text"])),
    suggestions,
    action: (INTERVIEW_ACTIONS as readonly string[]).includes(rawAction) ? (rawAction as InterviewAction) : "ask",
    plan: asText(pick(value, ["plan", "plano", "description", "descricao", "descrição"])),
  }
}

function repairTurnText(text: string): string | null {
  const parsed = parseJsonText(sliceObject(text))
  if (!parsed.ok) return null
  const turn = coerceTurn(parsed.value)
  return turn ? JSON.stringify(turn) : null
}

function partialTurn(value: unknown): Partial<InterviewTurn> | null {
  if (!isRecord(value)) return null
  const partial: Partial<InterviewTurn> = {}
  if (typeof value.message === "string") partial.message = tidy(value.message)
  if (Array.isArray(value.suggestions)) partial.suggestions = cleanSuggestions(value.suggestions.filter((entry): entry is string => typeof entry === "string"))
  if (typeof value.action === "string" && (INTERVIEW_ACTIONS as readonly string[]).includes(value.action)) partial.action = value.action as InterviewAction
  if (typeof value.plan === "string") partial.plan = value.plan
  return partial
}

function userText(messages: readonly InterviewMessage[], last: boolean): string {
  const users = messages.filter((message) => message.role === "user").map((message) => message.text)
  return last ? users[users.length - 1] ?? "" : users.join("\n")
}

export function settleTurn(raw: InterviewTurn, context: { hasFlow: boolean; history: readonly InterviewMessage[] }): InterviewTurn {
  let action = raw.action
  if (action === "generate" && context.hasFlow) action = "edit"
  else if (action === "edit" && !context.hasFlow) action = "generate"
  let plan = clipPlan(raw.plan)
  if ((action === "generate" || action === "edit") && !plan) plan = clipPlan(userText(context.history, action === "edit"))
  const message = tidy(raw.message) || DEFAULT_MESSAGES[action]
  const suggestions = action === "finish" ? [] : cleanSuggestions(raw.suggestions)
  return { message, suggestions, action, plan }
}

function reject(error: string, field?: GenerateFailure["field"]): { ok: false; failure: GenerateFailure } {
  return { ok: false, failure: { success: false, code: "invalid_request", error, ...(field ? { field } : {}) } }
}

interface TurnAttempt {
  turn?: InterviewTurn
  error?: unknown
}

async function settleObject(object: PromiseLike<InterviewTurn>, watch: StreamWatch, signal: AbortSignal): Promise<InterviewTurn> {
  let turn: InterviewTurn
  try {
    turn = await Promise.race([object, unfinished()])
  } catch (error) {
    if (signal.aborted) throw error
    if (watch.refusal) throw stopped("content-filter", error)
    if (watch.failed) throw stopped("error", error)
    throw error
  }
  if (watch.refusal) throw stopped("content-filter")
  if (watch.failed) throw stopped("error")
  return turn
}

async function callTurn(setup: ModelSetup, messages: ModelMessage[], signal: AbortSignal, onPartial: InterviewHooks["onPartial"]): Promise<TurnAttempt> {
  setup.watch.refusal = false
  setup.watch.failed = false
  try {
    const result = streamObject({
      model: setup.model,
      schema: interviewSchema,
      schemaName: INTERVIEW_SCHEMA_NAME,
      schemaDescription: INTERVIEW_SCHEMA_DESCRIPTION,
      messages,
      allowSystemInMessages: true,
      providerOptions: setup.providerOptions,
      ...(setup.maxOutputTokens !== undefined ? { maxOutputTokens: setup.maxOutputTokens } : {}),
      abortSignal: signal,
      experimental_repairText: async ({ text }) => repairTurnText(text),
      onError: () => undefined,
    })
    const follow = async () => {
      for await (const value of result.partialObjectStream) {
        if (!onPartial) continue
        const partial = partialTurn(value)
        if (partial) notify(onPartial, partial)
      }
    }
    await follow().catch(() => undefined)
    try {
      return { turn: await settleObject(result.object, setup.watch, signal) }
    } catch (error) {
      return { error }
    }
  } catch (error) {
    return { error }
  }
}

async function converse(setup: ModelSetup, messages: ModelMessage[], hooks: InterviewHooks): Promise<InterviewTurn> {
  let relaxed = 0
  let corrected = false
  for (;;) {
    const attempt = await callTurn(setup, messages, hooks.signal, hooks.onPartial)
    if (attempt.turn) return attempt.turn
    const { error } = attempt
    if (hooks.signal.aborted) throw error
    if (relaxed < RELAX_LIMIT && relax(setup, error)) {
      relaxed++
      continue
    }
    if (!corrected && isFormatFailure(error)) {
      corrected = true
      const text = NoObjectGeneratedError.isInstance(error) ? (error.text ?? "").slice(0, LIMITS.prompt) : ""
      messages.push({ role: "assistant", content: text || "{}" }, { role: "user", content: FORMAT_RETRY })
      continue
    }
    throw error
  }
}

function interviewFailure(failure: GenerateFailure): GenerateFailure {
  if (failure.code === "aborted") return { success: false, code: "aborted", error: ABORTED }
  if (failure.code === "unknown") return { success: false, code: "unknown", error: UNKNOWN, details: "Tente novamente." }
  return failure
}

export async function interviewTurn(input: InterviewInput, hooks: InterviewHooks): Promise<InterviewResult> {
  try {
    if (!isRecord(input)) return reject(HISTORY_INVALID)
    const checked = parseGenerationRequest({ provider: input.provider, model: input.model, apiKey: input.apiKey, effort: input.effort, fill: input.fill, prompt: VALIDATION_PROMPT })
    if (!checked.ok) return { ok: false, failure: checked.failure }
    const resolved = checked.request.input
    const history = cleanHistory(input.history)
    if (!history) return reject(HISTORY_INVALID, "prompt")
    if (!history.some((message) => message.role === "user")) return reject(HISTORY_EMPTY, "prompt")
    let flow: AtendimentoFlow | null = null
    if (input.flow !== undefined && input.flow !== null) {
      try {
        const opened = importFlow(input.flow)
        flow = hasComponents(opened) ? opened : null
      } catch {
        return reject(FLOW_INVALID, "base")
      }
    }
    if (hooks.signal.aborted) return { ok: false, failure: { success: false, code: "aborted", error: ABORTED } }
    const setup = createSetup(resolved, { transport: hooks.transport, signal: hooks.signal, fetch: hooks.fetch })
    const trimmed = trimHistory(history)
    const messages: ModelMessage[] = [
      { role: "system", content: interviewSystemPrompt(), ...(setup.systemOptions ? { providerOptions: setup.systemOptions } : {}) },
      { role: "system", content: stateText(flow, resolved.fill) },
      ...conversation(trimmed),
    ]
    try {
      const raw = await converse(setup, messages, hooks)
      return { ok: true, turn: settleTurn(raw, { hasFlow: flow !== null, history }) }
    } catch (error) {
      return { ok: false, failure: interviewFailure(describeFailure(error, resolved.provider, resolved.apiKey, { client: hooks.signal })) }
    }
  } catch {
    return { ok: false, failure: { success: false, code: "unknown", error: UNKNOWN, details: "Tente novamente." } }
  }
}
