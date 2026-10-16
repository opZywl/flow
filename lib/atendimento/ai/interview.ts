import { NoObjectGeneratedError, streamObject } from "ai"
import type { ModelMessage } from "ai"
import { z } from "zod"
import { NOTE_TYPE, START_ID, START_TYPE, categories, componentCatalog, getComponentLabel } from "../catalog"
import { importFlow, outputHandles } from "../format"
import type { AtendimentoFlow } from "../types"
import { ARRANGE_LIMIT } from "./arrange"
import type { LayoutCell } from "./arrange"
import { DEFAULT_FILL, LIMITS, RI_LIMITS } from "./contracts"
import type { Effort, GenerateFailure } from "./contracts"
import { flowToRi } from "./edit"
import { guideOf } from "./guide"
import type { ProviderId } from "./providers"
import type { RiFlow, RiNode } from "./ri"
import { RETRY_DELAYS_MS, createSetup, describeFailure, isFormatFailure, isTransient, notify, parseGenerationRequest, pause, relax, stopped, unfinished } from "./runner"
import type { ModelSetup, StreamWatch, Transport } from "./runner"
import { foldText, parseJsonText, quote, shorten, sliceObject } from "./text"

export interface InterviewMessage {
  role: "assistant" | "user"
  text: string
}

export type InterviewAction = "ask" | "generate" | "edit" | "finish" | "arrange"

export type InterviewScope = "builder" | "copilot"

export interface InterviewPick {
  label: string
  candidates: string[]
  ready: boolean
  any: boolean
  selected?: string
}

export interface InterviewTurn {
  message: string
  suggestions: string[]
  action: InterviewAction
  plan: string
  pick?: InterviewPick | null
  layout?: LayoutCell[]
}

export interface InterviewReply extends InterviewTurn {
  adds?: boolean
  after?: string
}

export interface SettleContext {
  hasFlow: boolean
  history: readonly InterviewMessage[]
  scope?: InterviewScope
  ids?: Iterable<string>
  anchors?: Iterable<string>
  texts?: ReadonlyMap<string, string>
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

export type InterviewMessagesInput = Pick<InterviewInput, "history" | "flow" | "fill" | "scope" | "proposal">

export const INTERVIEW_ACTIONS: readonly InterviewAction[] = ["ask", "generate", "edit", "finish"]

const COPILOT_ACTIONS: readonly InterviewAction[] = [...INTERVIEW_ACTIONS, "arrange"]

export const PLACE_LABEL = "o componente que vem antes do componente novo"
export const PLACE_PROPOSED = "Antes de editar, confirme no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado, e a minha sugestão já está marcada."
export const PLACE_ASK = "Antes de editar, selecione no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado."
export const ARRANGE_LOST = "Qual formato você quer para o fluxo? Por exemplo: em L, em coluna ou como uma casa."

export const INTERVIEW_SCHEMA_NAME = "turno_conversa"
export const INTERVIEW_SCHEMA_DESCRIPTION = "Próxima fala do assistente que monta o fluxo de atendimento conversando"

export const SUGGESTION_LIMITS = { min: 2, max: 5, length: 80 } as const

export const PICK_LIMITS = { min: 2, label: 60 } as const

const TURN_FIELDS = {
  message: z.string().describe("Fala para o usuário: a proposta e uma pergunta, o aviso de montagem ou de edição, ou a despedida"),
  suggestions: z.array(z.string()).describe("De 2 a 5 respostas curtas que o usuário pode clicar; vazio fora de ask"),
  action: z.enum(["ask", "generate", "edit", "finish"]).describe("ask pergunta, generate monta o fluxo novo, edit altera o fluxo aberto, finish encerra a conversa"),
  plan: z.string().describe("Descrição consolidada do atendimento com todas as decisões até aqui; na edição, o pedido de mudança completo"),
}

export const interviewSchema: z.ZodType<InterviewTurn> = z.object(TURN_FIELDS)

export const copilotSchema: z.ZodType<InterviewReply> = z.object({
  ...TURN_FIELDS,
  action: z.enum(["ask", "generate", "edit", "finish", "arrange"]).describe("ask pergunta, edit altera o fluxo aberto, arrange muda só as posições dos componentes no canvas, finish encerra a conversa"),
  pick: z
    .object({
      label: z.string().describe("O que o usuário seleciona no canvas, com o artigo, como o menu de opções ou a mensagem"),
      any: z.boolean().describe("true quando o pedido cria um componente sem dizer o ponto do fluxo: o usuário seleciona qualquer componente com saída, o Início inclusive, e candidates fica vazio; false quando candidates traz os componentes que servem"),
      candidates: z.array(z.string()).describe("IDs do resumo do fluxo de todos os componentes que servem para o pedido; vazio com any true"),
      ready: z.boolean().describe("true quando plan já descreve a mudança inteira e só falta saber qual componente, com plan escrito para o componente que o usuário selecionar; false quando ainda falta outra decisão"),
    })
    .nullable()
    .describe("Seleção no canvas, com ask, quando mais de um componente do resumo serve para o pedido ou quando o pedido cria um componente sem dizer o ponto do fluxo; null nas outras respostas"),
  adds: z.boolean().describe("true quando plan cria componentes novos no caminho do atendimento; false nas outras respostas"),
  after: z.string().describe("ID do resumo do fluxo do componente que fica logo antes dos componentes novos: o ponto que o usuário indicou ou a sua sugestão; vazio quando nada novo é criado"),
  layout: z
    .array(
      z.object({
        id: z.string().describe("ID do componente, como aparece no resumo do fluxo"),
        col: z.number().int().describe(`Coluna da célula, de 0 a ${ARRANGE_LIMIT}, crescendo para a direita`),
        row: z.number().int().describe(`Linha da célula, de 0 a ${ARRANGE_LIMIT}, crescendo para baixo`),
      }),
    )
    .describe("Com arrange, uma célula para cada componente do resumo, o Início inclusive, desenhando o formato pedido e seguindo o caminho a partir do Início; vazio nas outras respostas"),
})

const HISTORY_MESSAGES = 80
const HISTORY_CHARS = 60_000
const RELAX_LIMIT = 2
const PART_LIMIT = 70
const NOTE_LIMIT = 200
const SUMMARY_LIMIT = 32_000
const NOTES_HEAD = "Notas no canvas, anotações do usuário fora do caminho do atendimento:"
const VALIDATION_PROMPT = "Conversa para montar um fluxo de atendimento."
const HISTORY_EMPTY = "Escreva o que você precisa no atendimento."
const HISTORY_INVALID = "Não foi possível ler a conversa."
const FLOW_INVALID = "Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo."
const COPILOT_FLOW_MISSING = "Abra um fluxo para o Copiloto editar."
const CONTINUE = "Continue a conversa a partir do último registro."
const FORMAT_RETRY = "A resposta anterior não seguiu o formato pedido. Responda de novo só com o objeto: message, suggestions, action e plan."
const COPILOT_FORMAT_RETRY = "A resposta anterior não seguiu o formato pedido. Responda de novo só com o objeto: message, suggestions, action, plan, pick, adds, after e layout."
const PICK_FALLBACK = "o componente"
const PICK_LOST = "Em qual componente você quer fazer essa mudança? Escreva o texto que aparece nele."
const PICK_MESSAGE = "Mais de um componente serve para esse pedido. Em qual deles você quer fazer a mudança?"
const PICK_ANY_MESSAGE = "O componente novo entra logo depois do componente que você selecionar, ou logo antes dele, se preferir. Depois de qual componente ele entra?"
const PICK_KEYS = ["pick", "selecao", "seleção", "selection"]
const PICK_LABEL_KEYS = ["label", "rotulo", "rótulo"]
const PICK_CANDIDATE_KEYS = ["candidates", "candidatos", "ids"]
const PICK_READY_KEYS = ["ready", "pronto", "pronta"]
const PICK_ANY_KEYS = ["any", "qualquer", "todos"]
const READY_WORDS = new Set(["true", "sim"])
const ADDS_KEYS = ["adds", "cria", "novos"]
const AFTER_KEYS = ["after", "depois", "apos", "após"]
const LAYOUT_KEYS = ["layout", "celulas", "células", "cells"]
const CELL_ID_KEYS = ["id", "componente"]
const CELL_COL_KEYS = ["col", "coluna", "column"]
const CELL_ROW_KEYS = ["row", "linha"]
const ARRANGE_MIN = 2
const PLACE_MARKS = ["Proposta pronta no canvas", "Organização pronta no canvas", "Alterações aplicadas no fluxo"]
const PLACE_PICKED = "selecionei no canvas"
const PLACE_WORDS = /(?:^| )(?:depois|antes|apos|entre|no inicio|no comeco|no fim|no final|logo depois|logo apos|em seguida|no lugar de)(?= |$)/
const PLACE_SELECTED = /(?:^| )(?:logo )?(?:depois|antes|apos) (?:d[oa]|o|a) (?:componente )?selecionad[oa](?= |$)/g
const PLACE_LOOSE_ID = /(?:\bid\s*[:#]?\s*|#)\d+(?![\p{L}\p{N}_-])/iu
const PLACE_NAME_MIN = 6
const ARTICLES = new Set(["o", "a", "os", "as", "um", "uma"])
const OMITTED = "Mensagens anteriores da conversa foram resumidas no plano."
const ABORTED = "A resposta foi cancelada."
const UNKNOWN = "Não foi possível continuar a conversa."

const DEFAULT_MESSAGES: Readonly<Record<InterviewAction, string>> = {
  ask: "Me conte como você quer que o atendimento funcione.",
  generate: "Vou montar o fluxo com o que combinamos.",
  edit: "Vou aplicar essa mudança no fluxo.",
  finish: "Combinado. Quando precisar de outro ajuste, é só escrever aqui.",
  arrange: "Vou organizar os componentes no canvas.",
}

const COPILOT_MESSAGES: Readonly<Record<InterviewAction, string>> = {
  ask: "O que você quer mudar no fluxo?",
  generate: "Vou aplicar essa mudança no fluxo.",
  edit: "Vou aplicar essa mudança no fluxo.",
  finish: "Combinado. Quando precisar de outro ajuste, é só escrever aqui.",
  arrange: "Vou organizar os componentes no canvas.",
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

const COPILOT_LINES = [
  "Você é o copiloto que edita um fluxo de atendimento por WhatsApp já aberto no editor da plataforma de Atendimento. Você confere cada pedido do usuário com o resumo do fluxo, pergunta o que faltar propondo a resposta mais provável e edita quando a mudança está clara. Outro sistema aplica a mudança a partir do pedido que você escreve em plan e mostra o resultado no canvas como proposta.",
  "",
  "# Como decidir",
  "1. Leia o pedido junto com o resumo do fluxo e identifique o que criar, alterar ou remover, em que ponto do fluxo, com quais textos e para onde vai cada saída.",
  "2. Quando o pedido diz o que fazer e o resumo mostra onde, devolva edit, como nestes pedidos:",
  "- Troque a mensagem de boas-vindas por Olá, tudo bem?",
  "- Na opção Segunda via, envie o link https://lucas-lima.xyz/boleto antes de encerrar.",
  "3. Quando falta uma decisão que muda o resultado, pergunte antes de editar. Estas decisões pedem confirmação:",
  "- o texto de uma opção nova e o que acontece quando o contato escolhe essa opção;",
  "- o texto novo de uma mensagem, quando o pedido diz só qual mensagem trocar, como em troque a mensagem de boas-vindas;",
  "- o menu, o componente ou o ponto do fluxo, quando mais de um serve: peça para o usuário selecionar no canvas;",
  "- o departamento de uma transferência;",
  "- o horário de atendimento e o que acontece fora dele;",
  "- os dados a coletar e como validar cada um;",
  "- a URL e o retorno de uma integração;",
  "- o que fazer com os componentes que ficam sem caminho quando o pedido remove uma opção;",
  "- o pedido que o fluxo já atende: conte o que o fluxo faz hoje, com os textos do resumo, proponha manter como está e pergunte se ele quer mudar algum ponto, como o departamento da transferência.",
  "4. No pedido com atrás de ou depois de um componente, o componente novo entra logo depois dele, na saída dele, e o caminho segue como antes. No pedido com antes de um componente, o componente novo entra logo antes dele, na entrada dele.",
  "5. Componentes do mesmo tipo e com os mesmos textos no resumo são cópias de um mesmo passo, uma em cada caminho. Conte as cópias como um só componente: o pedido sobre esse passo muda todas as cópias, com o ID de cada uma em plan, e muda só uma quando o pedido aponta o caminho dela, como a despedida da opção Planos.",
  "6. Quando o resumo tem só o Início, com Componentes: 0, o pedido monta o atendimento a partir do Início: o primeiro componente entra na saída do Início, e os outros seguem dele, na ordem da conversa. Pergunte o que faltar como em qualquer pedido, propondo a resposta mais provável, e devolva edit com o pedido completo. Exemplo para o pedido crie um menu com Boletos e Suporte, num fluxo só com o Início: Vou começar o fluxo com esse menu, logo depois do Início. Pensei em enviar o link do boleto na opção Boletos e transferir a opção Suporte para o departamento Suporte. Fica assim ou quer outro destino?",
  "7. As notas no fim do resumo são anotações do usuário no canvas, fora do caminho do atendimento, e ficam no fluxo como estão. Use o texto delas como contexto quando o pedido citar uma nota, e trate em plan e em candidates só dos componentes.",
  "",
  "# Como perguntar",
  "1. Pergunte propondo: use o resumo do fluxo para sugerir a resposta mais provável e peça confirmação. Exemplo para o pedido crie uma opção 8, num fluxo com um só menu, de 7 opções: Vou colocar a opção 8 no menu Como podemos ajudar. Pensei em Falar com atendente, que transfere para o departamento Atendimento. Fica assim ou quer outro texto e outro destino?",
  "2. Faça uma pergunta por mensagem, sobre um assunto, no fim de uma mensagem com até 3 frases.",
  "3. Cada pergunta traz de 2 a 5 sugestões em suggestions: respostas curtas, prontas para clicar, com até 60 caracteres, escritas como o usuário responderia. A primeira aceita a proposta, como Pode ser assim, e as outras trazem alternativas concretas tiradas do resumo, como outro departamento que o fluxo já usa. Quando o pedido ainda tem outro assunto em aberto depois desta pergunta, inclua também uma para editar já com as suas propostas no que falta, como Pode editar agora. A pergunta da seleção no canvas traz as sugestões descritas na seção dela.",
  "4. Quando o usuário aceita ou deixa a escolha com você, adote a sua proposta: devolva edit quando a mudança fica clara, ou pergunte sobre o próximo assunto do pedido que ainda está em aberto.",
  "5. Quando o usuário pede para fazer já, devolva edit com o que já foi decidido e as suas propostas no que faltar. Pedem isso respostas como Pode editar agora e a mensagem Pode editar agora com o que já foi decidido.",
  "6. Quando a resposta traz um pedido novo, junte esse pedido ao que está em andamento e pergunte o que faltar sobre ele.",
  "",
  "# Seleção no canvas",
  "1. Quando o pedido cita um componente sem dizer qual e o resumo mostra mais de um que serve, como dois menus de opções ou várias mensagens, peça para o usuário selecionar o componente no canvas, mesmo quando um deles parece o mais provável pelo assunto: devolva ask com pick. Peça a seleção na primeira pergunta do pedido.",
  "2. Em pick, label diz o que selecionar, com o artigo, como o menu de opções ou a mensagem, e candidates traz o ID, como aparece no resumo, de cada componente que serve para o pedido.",
  "3. Em pick, ready fica true quando plan já descreve a mudança inteira, com as suas propostas, e só falta saber qual componente. Nesse caso, escreva plan para o componente que o usuário selecionar e deixe os IDs dos candidatos só em candidates, como em: Acrescente a opção Falar com atendente, que transfere para o departamento Atendimento, no menu de opções que o usuário selecionar. Com ready true, a interface edita logo que o usuário confirma a seleção. Quando ainda falta outra decisão além do componente, ready fica false.",
  "4. A interface destaca os candidatos para o usuário selecionar um e confirmar. message conta que mais de um componente serve, traz a sua proposta para o resto do pedido e termina perguntando qual deles, como: O fluxo tem dois menus de opções. Pensei na opção Segunda via com o link do boleto, seguindo para a despedida. Em qual menu ela entra?",
  "5. Nessa pergunta, suggestions traz atalhos em texto, um para cada candidato, com o texto dele, como No menu Como podemos ajudar, e só esses atalhos. Com mais de 5 candidatos, suggestions fica vazio.",
  "6. Quando só um componente do resumo serve, use esse componente direto. Nas outras respostas, pick fica null.",
  "7. A mensagem do usuário que começa com Selecionei no canvas, ou o atalho que aponta um candidato, traz o componente escolhido e aceita a proposta da pergunta. Siga o pedido com esse componente: cite em plan o ID e o texto dele e devolva edit quando o pedido fica completo com essa escolha; pergunte só o que ainda faltar.",
  "8. Depois de Seleção cancelada, o usuário responde por texto: use o componente que o texto indica, com o ID dele em plan, ou peça a seleção de novo quando o texto ainda serve para mais de um.",
  "",
  "# Proposta em revisão",
  "1. Quando a situação atual indica uma proposta em revisão, o resumo já inclui a proposta, e o pedido seguinte ajusta essa proposta: plan traz só o ajuste.",
  "2. O usuário aplica ou descarta a proposta com os botões Aplicar e Descartar, no cartão da proposta. Quando ele pede para aplicar ou descartar, devolva finish e lembre em uma frase que basta clicar em Aplicar ou em Descartar no cartão.",
  "",
  "# Ponto do componente novo",
  "1. O ponto de cada componente novo no caminho do atendimento vem do usuário: dito na conversa, como logo depois da mensagem de boas-vindas, ou escolhido na seleção no canvas. Quando a resposta é edit e o ponto ainda está em aberto, a interface pede a seleção no canvas antes de editar, com a sua sugestão já marcada.",
  "2. Preencha adds e after em toda resposta. adds fica true quando plan cria componentes novos no caminho do atendimento. after traz o ID, como aparece no resumo, do componente que fica logo antes dos componentes novos: o ponto que o usuário indicou ou, enquanto ele está em aberto, a sua sugestão. Quando nada novo é criado, adds fica false e after fica vazio.",
  "",
  "# Componente novo sem ponto no fluxo",
  "1. Quando o pedido cria um componente para o caminho do atendimento, como uma mensagem, uma tag ou um menu, sem dizer o ponto do fluxo, antes ou depois de qual componente, peça para o usuário selecionar no canvas o componente que fica antes do novo, mesmo quando um ponto parece o mais provável: devolva ask com pick, com any true e candidates vazio. Servem para essa seleção os componentes que têm saída, o Início inclusive, porque o componente novo se liga à saída do selecionado. A opção nova de um menu entra no menu, e o caminho dela segue dessa opção.",
  "2. Nessa pergunta, message traz a sua proposta para o componente novo, diz que ele entra logo depois do componente selecionado, ou logo antes dele, se o usuário preferir, e termina perguntando o ponto, como: Pensei na mensagem Obrigado pelo contato, volte sempre. Ela entra logo depois do componente que você selecionar, ou logo antes dele, se preferir. Depois de qual componente ela entra?",
  "3. Em pick, label diz o que selecionar, como o componente que vem antes da mensagem nova. ready fica true quando plan já descreve o componente novo inteiro, escrito para entrar logo depois do componente que o usuário selecionar, e a interface edita logo que ele confirma a seleção de um componente com uma saída; quando ainda falta outra decisão sobre o componente novo, ready fica false. suggestions traz Logo depois do selecionado e Logo antes do selecionado.",
  "4. A mensagem que começa com Selecionei no canvas traz o componente escolhido: o componente novo entra logo depois dele, na saída dele, e o caminho segue como antes. Com Logo antes do selecionado na resposta, ele entra logo antes, na entrada dele, e com o Início escolhido, ele entra logo depois do Início. Quando o componente escolhido tem mais de uma saída, como um menu, pergunte em qual saída o componente novo entra, propondo a mais provável. Cite em plan o ID do componente escolhido e devolva edit quando o pedido fica completo.",
  "5. Quando o fluxo tem só o Início, o componente novo entra logo depois dele, sem seleção.",
  "",
  "# Quantidades e limites",
  "1. Quando o pedido diz quantos itens quer, como opções, mensagens ou perguntas, plan e o resultado trazem exatamente esse número. As opções a mais, como Voltar e Encerrar, entram quando o usuário pede ou aceita a sua proposta delas.",
  "2. Em plan, escreva com quantas opções cada menu novo ou alterado fica no fim, contando todas, como em: o menu Como podemos ajudar? fica com 8 opções. Para um menu que já existe, cite também o ID dele nessa frase.",
  `3. Limites da plataforma: o Menu de Opções tem de 1 a ${RI_LIMITS.menuOptions} opções, mostra até 3 como botões e, com mais opções, vai como lista; a mensagem do menu tem até 1024 caracteres; a Múltipla Condição tem até ${RI_LIMITS.conditions} condições; o Randomizador tem ao menos 2 caminhos, com pesos que somam 100; o Solicitar Dados faz de 1 a 5 tentativas. Os outros componentes seguem as chaves e os valores da plataforma.`,
  "4. Antes de editar, confira se o pedido cabe nos limites, somando os itens que o componente já tem no resumo com os que o pedido acrescenta. No resumo, opções (12) diz quantas opções o menu tem quando a lista vem cortada.",
  `5. Quando o pedido passa de um limite, diga quantos itens o componente tem e quantos cabem e proponha caminhos que respeitam o limite: trocar as opções atuais pelas novas, avisando que as opções atuais e os passos que só elas alcançam saem do fluxo; dividir em dois menus, com uma opção que leva ao segundo; ou reduzir o número de opções. Edite depois que o usuário escolher um caminho. Exemplo para o pedido crie 8 opções no menu Como podemos ajudar?, que já tem 6: O menu Como podemos ajudar? tem 6 opções e aceita até ${RI_LIMITS.menuOptions}, então cabem mais 4. Posso trocar as 6 opções atuais pelas 8 novas, e as atuais saem do fluxo com os passos que só elas alcançam, ou dividir em dois menus, com a opção Mais opções levando ao segundo. Qual caminho você prefere? Nesse exemplo, suggestions traz Trocar as opções atuais, Dividir em dois menus e Acrescentar só 4 opções.`,
  "6. Quando o pedido pede algo fora do formato da plataforma, explique o limite em uma frase e proponha alternativas que cabem nele. plan e a edição seguem sempre o formato da plataforma, também quando o usuário insiste: explique de novo e ofereça as alternativas.",
  "",
  "# Plano",
  "1. plan traz o pedido de mudança completo, escrito como um cliente pede a quem edita o fluxo: o que criar, alterar ou remover, citando os componentes pelo texto ou pelo nome que aparecem no resumo, os textos novos, as opções na ordem e o destino de cada saída.",
  "2. Atualize plan em toda resposta, inclusive nas perguntas, com as decisões tomadas e as suas propostas para o que falta.",
  "3. plan descreve só a mudança desta conversa que ainda falta fazer no fluxo do resumo, e todo o resto do fluxo continua como está. As mudanças já aplicadas e a proposta em revisão já aparecem no resumo.",
  "4. Na remoção, plan cita cada componente que sai do fluxo pelo texto e pelo ID que aparecem no resumo, como em: Remova a mensagem Aguarde um instante, ID 7, e ligue a opção Boletos direto à mensagem com o link do boleto, ID 9. Quando o usuário pede para limpar o fluxo, plan pede para remover todos os componentes, citando o ID de cada um, e manter o Início e as notas, como em: Remova todos os componentes, IDs 2, 3, 4, 5 e 6, mantendo o Início e as notas.",
  "",
  "# Ações",
  "Nesta conversa, as ações são ask, edit, arrange e finish.",
  "- ask: falta uma decisão. message traz a proposta e a pergunta, suggestions traz as respostas sugeridas e pick traz a seleção no canvas quando ela se aplica.",
  "- edit: a mudança está clara. message diz em uma frase o que vai mudar, suggestions fica vazio e plan traz o pedido de mudança completo.",
  "- arrange: o usuário pediu para organizar os componentes no canvas em um formato. message diz em uma frase como os componentes ficam, suggestions e plan ficam vazios e layout traz as células.",
  "- finish: o usuário já tem o que precisa, inclusive quando decide manter o fluxo como está. message traz uma despedida curta e suggestions fica vazio.",
  "",
  "# Organização no canvas",
  `1. Quando o usuário pede para organizar, arrumar ou posicionar os componentes em um formato, como L, U, T, casa, coluna, linha, grade, escada, zigue-zague, círculo ou qualquer desenho, devolva arrange com layout: uma célula para cada componente do resumo, o Início inclusive, com col e row inteiros, de 0 a ${ARRANGE_LIMIT}, que desenham o formato. col cresce para a direita e row cresce para baixo.`,
  "2. Distribua as células seguindo o caminho a partir do Início, com cada componente ao lado do anterior no desenho. Quando o pedido vem sem formato, organize em colunas pelo caminho: col cresce a cada passo a partir do Início, e cada saída de um menu segue em uma row.",
  "3. Um L é uma coluna que desce e, no fim, a última linha seguindo para a direita. Com 6 componentes: col 0 de row 0 a row 3 e, na row 3, col 1 e col 2.",
  "4. Uma casa tem paredes em quadrado e um telhado em triângulo em cima delas, desenhados pelo contorno a partir do Início. Com 12 componentes: a parede da esquerda em col 0, de row 4 a row 2, o telhado em col 1 row 1, col 2 row 0 e col 3 row 1, a parede da direita em col 4, de row 2 a row 4, e a base em row 4, de col 3 a col 1.",
  "5. A organização muda só as posições no canvas. Quando o pedido também cria, altera ou remove componentes, faça a edição primeiro e organize depois que o usuário aplicar a proposta.",
  "6. Nas outras respostas, layout fica vazio.",
  "",
  "# Registros da interface",
  "A interface escreve no histórico, como falas suas, o que acontece com cada pedido:",
  "- proposta pronta no canvas, com a contagem das mudanças: Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.",
  "- organização pronta no canvas, com a contagem dos componentes movidos: Organização pronta no canvas: 5 componentes movidos.",
  "- proposta aplicada ao fluxo aberto: Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.",
  "- proposta descartada: Proposta descartada. O fluxo aberto não mudou.",
  "- pedido cancelado antes de a proposta ficar pronta: Pedido cancelado. O fluxo aberto não mudou.",
  "- seleção no canvas cancelada: Seleção cancelada. Você pode responder por texto.",
  "- pergunta feita depois de aplicar: Precisa mudar mais alguma coisa no fluxo?",
  "A resposta a essa pergunta traz um pedido novo, que segue as regras acima, ou encerra a conversa com finish.",
  "",
  "# Estilo",
  "1. Português do Brasil, cordial e direto, tratando o usuário por você.",
  "2. Escreva só com letras, números e a pontuação comum: ponto final, vírgula, dois-pontos e ponto de interrogação na pergunta.",
  "3. Fale do atendimento com as palavras do usuário: menu, opção, mensagem, transferência, horário. Os nomes de componente servem para você planejar.",
  "",
  "# Componentes da plataforma",
  "Use esta lista para entender os componentes do resumo e propor as etapas que a plataforma oferece.",
]

let cachedCopilotPrompt: string | undefined

export function copilotSystemPrompt(): string {
  if (cachedCopilotPrompt === undefined) cachedCopilotPrompt = [...COPILOT_LINES, componentSection()].join("\n")
  return cachedCopilotPrompt
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

function marked(text: string, limit: number = PART_LIMIT): string {
  const full = text.replace(/\s+/g, " ").trim()
  const cut = shorten(full, limit)
  return cut.length < full.length ? `${cut.replace(/[\s,;:.]+$/, "")}…` : cut
}

function listCount(value: string): number {
  const parsed = parseJsonText(value.trim())
  return parsed.ok && Array.isArray(parsed.value) ? parsed.value.length : 0
}

function brief(node: RiNode, mark = false): string {
  const config = new Map(node.config.map((entry) => [entry.key, entry.value]))
  const keys = [...new Set([...(guideOf(node.type)?.required ?? []), ...PREFERRED_KEYS])]
  const parts: string[] = []
  for (const key of keys) {
    const value = config.get(key)
    if (!value) continue
    const text = mark ? marked(readable(value)) : shorten(readable(value), PART_LIMIT)
    if (!text) continue
    const count = mark && key === "options" && text.endsWith("…") ? listCount(value) : 0
    parts.push(key === "options" ? `opções${count ? ` (${count})` : ""}: ${text}` : key === "targetNodeId" ? `volta para ${text}` : quote(text))
    if (parts.length >= 2) break
  }
  return parts.join(" ")
}

function componentTexts(flow: AtendimentoFlow): Map<string, string> {
  return new Map(flowToRi(flow).nodes.map((node) => [node.id, brief(node, true)]))
}

const isNote = (node: RiNode) => node.type === NOTE_TYPE

function noteLines(notes: readonly RiNode[]): string[] {
  const lines = notes.flatMap((node) => {
    const text = marked(node.config.find((entry) => entry.key === "text")?.value ?? "", NOTE_LIMIT)
    return text ? [`- ${quote(text)}`] : []
  })
  return lines.length ? [NOTES_HEAD, ...lines] : []
}

function summaryLines(ri: RiFlow, detailed: boolean, mark: boolean): string[] {
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
    const detail = detailed ? brief(node, mark) : ""
    lines.push(`- ${node.id} (${getComponentLabel(node.type)})${detail ? ` ${detail}` : ""}${exits(node.id)}`)
  }
  return lines
}

function hasComponents(flow: AtendimentoFlow): boolean {
  return flow.nodes.some((node) => node.data.type !== START_TYPE && node.data.type !== NOTE_TYPE)
}

export function interviewFlowSummary(flow: AtendimentoFlow, copilot = false): string {
  const ri = flowToRi(flow)
  const shown = copilot ? { ...ri, nodes: ri.nodes.filter((node) => !isNote(node)) } : ri
  const head = [`Nome: ${flow.name || "sem nome"}`, `Componentes: ${shown.nodes.length}`, "Cada linha: id (componente) textos principais | saídas e destinos."]
  const notes = copilot ? noteLines(ri.nodes.filter(isNote)) : []
  const detailed = [...head, ...summaryLines(shown, true, copilot), ...notes].join("\n")
  if (detailed.length <= SUMMARY_LIMIT) return detailed
  return [...head, ...summaryLines(shown, false, copilot)].join("\n")
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

const COPILOT_OPENED = "O fluxo resumido abaixo está aberto no editor, e cada pedido do usuário é uma mudança nesse fluxo."
const COPILOT_PROPOSAL = "Há uma proposta em revisão no canvas, ainda não aplicada. O resumo abaixo já inclui essa proposta, e o pedido seguinte ajusta a proposta."
const COPILOT_FILL = "Preenchimento ligado: IDs e URLs que o usuário não informar recebem valores provisórios na edição, e o editor avisa cada um para ele trocar. Os nomes de departamento, tag e fluxo de destino entram na proposta que você confirma com o usuário."

function copilotStateText(flow: AtendimentoFlow, fill: boolean, proposal: boolean): string {
  const lines = ["# Situação atual", COPILOT_OPENED]
  if (proposal) lines.push(COPILOT_PROPOSAL)
  lines.push("", "# Resumo do fluxo aberto", interviewFlowSummary(flow, true), "", fill ? COPILOT_FILL : fillLine(false))
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

function cleanSuggestions(values: readonly string[], limit: number = SUGGESTION_LIMITS.max): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const value of values) {
    const text = shorten(tidy(value).replace(/[.,;:]+$/, ""), SUGGESTION_LIMITS.length)
    const key = foldText(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(text)
    if (list.length >= limit) break
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

function candidateTexts(value: unknown): string[] {
  const list = Array.isArray(value) ? value.map(asText) : typeof value === "string" ? value.split(/[,;]/) : [asText(value)]
  return list.map((entry) => entry.trim()).filter(Boolean)
}

function coercePick(value: unknown): InterviewPick | null {
  if (!isRecord(value)) return null
  return {
    label: asText(pick(value, PICK_LABEL_KEYS)),
    candidates: candidateTexts(pick(value, PICK_CANDIDATE_KEYS)),
    ready: READY_WORDS.has(asText(pick(value, PICK_READY_KEYS)).trim().toLowerCase()),
    any: READY_WORDS.has(asText(pick(value, PICK_ANY_KEYS)).trim().toLowerCase()),
  }
}

function cellIndex(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(number) ? Math.min(ARRANGE_LIMIT, Math.max(0, Math.round(number))) : null
}

function coerceLayout(value: unknown): LayoutCell[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const id = asText(pick(entry, CELL_ID_KEYS)).trim()
    const col = cellIndex(pick(entry, CELL_COL_KEYS))
    const row = cellIndex(pick(entry, CELL_ROW_KEYS))
    return id && col !== null && row !== null ? [{ id, col, row }] : []
  })
}

function coerceTurn(value: unknown, copilot = false): InterviewReply | null {
  if (!isRecord(value)) return null
  const rawSuggestions = pick(value, ["suggestions", "sugestoes", "sugestões", "options", "opcoes", "opções"])
  const suggestions = Array.isArray(rawSuggestions) ? rawSuggestions.map(asText) : typeof rawSuggestions === "string" && rawSuggestions.trim() ? [rawSuggestions] : []
  const rawAction = asText(pick(value, ["action", "acao", "ação"])).trim().toLowerCase()
  const actions: readonly string[] = copilot ? COPILOT_ACTIONS : INTERVIEW_ACTIONS
  const turn: InterviewTurn = {
    message: asText(pick(value, ["message", "mensagem", "pergunta", "question", "text"])),
    suggestions,
    action: actions.includes(rawAction) ? (rawAction as InterviewAction) : "ask",
    plan: asText(pick(value, ["plan", "plano", "description", "descricao", "descrição"])),
  }
  if (!copilot) return turn
  return {
    ...turn,
    pick: coercePick(pick(value, PICK_KEYS)),
    adds: READY_WORDS.has(asText(pick(value, ADDS_KEYS)).trim().toLowerCase()),
    after: asText(pick(value, AFTER_KEYS)).trim(),
    layout: coerceLayout(pick(value, LAYOUT_KEYS)),
  }
}

function repairTurnText(text: string, copilot = false): string | null {
  const parsed = parseJsonText(sliceObject(text))
  if (!parsed.ok) return null
  const turn = coerceTurn(parsed.value, copilot)
  return turn ? JSON.stringify(turn) : null
}

function partialPick(value: unknown): InterviewPick | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const candidates = Array.isArray(value.candidates) ? value.candidates.filter((entry): entry is string => typeof entry === "string") : []
  return { label: typeof value.label === "string" ? tidy(value.label) : "", candidates: candidates.map((entry) => entry.trim()).filter(Boolean), ready: value.ready === true, any: value.any === true }
}

function partialLayout(value: readonly unknown[]): LayoutCell[] {
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim() || typeof entry.col !== "number" || typeof entry.row !== "number") return []
    const col = cellIndex(entry.col)
    const row = cellIndex(entry.row)
    return col === null || row === null ? [] : [{ id: entry.id.trim(), col, row }]
  })
}

function partialTurn(value: unknown, copilot = false): Partial<InterviewReply> | null {
  if (!isRecord(value)) return null
  const partial: Partial<InterviewReply> = {}
  const actions: readonly string[] = copilot ? COPILOT_ACTIONS : INTERVIEW_ACTIONS
  if (typeof value.message === "string") partial.message = tidy(value.message)
  if (Array.isArray(value.suggestions)) partial.suggestions = cleanSuggestions(value.suggestions.filter((entry): entry is string => typeof entry === "string"))
  if (typeof value.action === "string" && actions.includes(value.action)) partial.action = value.action as InterviewAction
  if (typeof value.plan === "string") partial.plan = value.plan
  if (copilot) {
    const selection = partialPick(value.pick)
    if (selection !== undefined) partial.pick = selection
    if (typeof value.adds === "boolean") partial.adds = value.adds
    if (typeof value.after === "string") partial.after = value.after.trim()
    if (Array.isArray(value.layout)) partial.layout = partialLayout(value.layout)
  }
  return partial
}

function userText(messages: readonly InterviewMessage[], last: boolean): string {
  const users = messages.filter((message) => message.role === "user").map((message) => message.text)
  return last ? users[users.length - 1] ?? "" : users.join("\n")
}

function idResolver(ids: Iterable<string> | undefined): (value: string) => string | undefined {
  const known = new Set<string>()
  const folded = new Map<string, string | null>()
  for (const id of ids ?? []) {
    if (typeof id !== "string" || !id.trim()) continue
    known.add(id)
    const key = foldText(id)
    const seen = folded.get(key)
    folded.set(key, seen === undefined || seen === id ? id : null)
  }
  return (value) => {
    const text = value.trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim()
    const bare = text.replace(/^id(?:\s*[:#]\s*|\s+)/i, "")
    for (const option of [value, text, bare]) if (known.has(option)) return option
    const tagged = text.match(/\bID\s*[:#]?\s*([^\s.,;:]+)[.,;:]*$/i)?.[1]
    if (tagged && known.has(tagged)) return tagged
    const found = folded.get(foldText(bare))
    if (found) return found
    const head = bare.replace(/^[-#\s]+/, "").split(/[\s(]/)[0].replace(/[.,;:]+$/, "")
    return known.has(head) ? head : folded.get(foldText(head)) ?? undefined
  }
}

function pickLabel(value: unknown): string {
  const strip = (text: string) => text.replace(/[\s.,;:]+$/, "")
  const text = strip(tidy(asText(value)))
    .replace(/^selecion(?:e|ar)\b\s*/i, "")
    .replace(/^no canvas\b[\s,:]*/i, "")
    .replace(/[\s,]*\bno canvas$/i, "")
  const label = strip(shorten(strip(text), PICK_LIMITS.label))
  if (!label) return PICK_FALLBACK
  const first = label.split(" ")[0]
  return ARTICLES.has(first.toLowerCase()) ? `${first.toLowerCase()}${label.slice(first.length)}` : label
}

function distinct(ids: readonly string[]): number {
  return new Set(ids.filter((id) => typeof id === "string" && id.trim())).size
}

function settlePick(value: unknown, ids: readonly string[], plan: string, anchors: readonly string[] = ids): InterviewPick | null {
  if (!isRecord(value)) return null
  if (value.any === true) return distinct(anchors) < PICK_LIMITS.min ? null : { label: pickLabel(value.label), candidates: [], ready: value.ready === true && plan !== "", any: true }
  if (!Array.isArray(value.candidates)) return null
  const resolve = idResolver(ids)
  const candidates: string[] = []
  for (const entry of value.candidates) {
    const id = resolve(asText(entry))
    if (id !== undefined && !candidates.includes(id)) candidates.push(id)
  }
  if (candidates.length < PICK_LIMITS.min) return null
  const ready = value.ready === true && plan !== "" && !candidates.some((id) => citesId(plan, id))
  return { label: pickLabel(value.label), candidates, ready, any: false }
}

function wantedPick(value: unknown): boolean {
  return isRecord(value) && (value.any === true || (Array.isArray(value.candidates) && value.candidates.some((entry) => asText(entry).trim() !== "")))
}

function asksSelection(text: string): boolean {
  return (/\b(selecione|selecionar|escolha|escolher|clique)\b/i.test(text) && /\bcanvas\b/i.test(text)) || (/\bselecione\b/i.test(text) && /\bconfirm(e|ar)\b/i.test(text))
}

const escapeId = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function citesId(plan: string, id: string): boolean {
  return new RegExp(`\\b[Ii][Dd][Ss]?(?!\\p{L})\\s*[:#]?\\s*(?:[^\\s,;:.()]+\\s*(?:,|\\be\\b|\\bou\\b)\\s*)*${escapeId(id)}(?![\\p{L}\\p{N}_-])`, "u").test(plan)
}

function hashesId(text: string, id: string): boolean {
  return new RegExp(`#${escapeId(id)}(?![\\p{L}\\p{N}_-])`, "u").test(text)
}

function plainText(text: string): string {
  return foldText(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

function spoken(message: unknown, role: InterviewMessage["role"]): string | null {
  return isRecord(message) && message.role === role && typeof message.text === "string" ? message.text : null
}

function placeWindow(history: readonly InterviewMessage[]): string[] {
  if (!Array.isArray(history)) return []
  let start = 0
  history.forEach((message, index) => {
    const text = spoken(message, "assistant")
    if (text !== null && PLACE_MARKS.some((mark) => text.includes(mark))) start = index + 1
  })
  return history.slice(start).flatMap((message) => {
    const text = spoken(message, "user")
    return text === null ? [] : [text]
  })
}

function placeNames(texts: ReadonlyMap<string, string> | undefined, known: readonly string[] | null): string[] {
  if (!(texts instanceof Map)) return []
  const names = new Set<string>()
  for (const [id, text] of texts) {
    if (typeof text !== "string" || (known && !known.includes(id))) continue
    const quoted = [...text.matchAll(/“([^”]*)”/g)].map((match) => match[1])
    for (const part of quoted.length ? quoted : [text]) {
      const name = plainText(part)
      if (name.length >= PLACE_NAME_MIN) names.add(name)
    }
  }
  return [...names]
}

export function placeGiven(history: readonly InterviewMessage[], texts?: ReadonlyMap<string, string>, ids?: Iterable<string>): boolean {
  const said = placeWindow(history)
  if (!said.length) return false
  const known = ids === undefined || ids === null ? null : [...ids].filter((id) => typeof id === "string" && id.trim() !== "")
  const names = placeNames(texts, known)
  return said.some((text) => {
    if (text.split("\n").some((line) => plainText(line).startsWith(PLACE_PICKED))) return true
    const plain = plainText(text)
    if (PLACE_WORDS.test(plain.replace(PLACE_SELECTED, " "))) return true
    if (known ? known.some((id) => citesId(text, id) || hashesId(text, id)) : PLACE_LOOSE_ID.test(text)) return true
    const padded = ` ${plain} `
    return names.some((name) => padded.includes(` ${name} `))
  })
}

function placeTurn(said: string, plan: string, after: unknown, anchors: readonly string[]): InterviewTurn {
  const proposed = idResolver(anchors)(asText(after))
  const pick: InterviewPick = { label: PLACE_LABEL, candidates: [], ready: true, any: true, ...(proposed === undefined ? {} : { selected: proposed }) }
  const message = said.endsWith("?") ? said : proposed === undefined ? PLACE_ASK : PLACE_PROPOSED
  return { message, suggestions: [], action: "ask", plan, pick }
}

function settleLayout(value: unknown, ids: readonly string[]): LayoutCell[] {
  if (!Array.isArray(value)) return []
  const resolve = idResolver(ids)
  const cells: LayoutCell[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const id = resolve(asText(entry.id))
    const col = cellIndex(entry.col)
    const row = cellIndex(entry.row)
    if (id === undefined || col === null || row === null || seen.has(id)) continue
    seen.add(id)
    cells.push({ id, col, row })
  }
  return cells
}

function settleArrange(raw: InterviewReply, ids: readonly string[], said: string, plan: string, chips: readonly string[]): InterviewTurn {
  const layout = settleLayout(raw.layout, ids)
  if (layout.length >= ARRANGE_MIN) return { message: said || COPILOT_MESSAGES.arrange, suggestions: [], action: "arrange", plan: "", layout }
  if (said.endsWith("?")) return { message: said, suggestions: cleanSuggestions(chips), action: "ask", plan }
  return { message: ARRANGE_LOST, suggestions: [], action: "ask", plan }
}

function wordsOf(text: string): Set<string> {
  return new Set(foldText(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2))
}

function pickSuggestions(values: readonly string[], candidates: readonly string[], texts: ReadonlyMap<string, string> | undefined): string[] {
  if (!texts || candidates.length > SUGGESTION_LIMITS.max) return []
  const own = candidates.map((id) => wordsOf(texts.get(id) ?? ""))
  const marks = own.map((words, index) => [...words].filter((word) => own.every((other, at) => at === index || !other.has(word))))
  const best: { chip: string; score: number }[] = []
  for (const chip of cleanSuggestions(values, Number.POSITIVE_INFINITY)) {
    const said = wordsOf(chip)
    const scores = marks.map((words) => words.filter((word) => said.has(word)).length)
    const hits = scores.flatMap((score, index) => (score > 0 ? [index] : []))
    if (hits.length !== 1) continue
    const [index] = hits
    if ((best[index]?.score ?? 0) < scores[index]) best[index] = { chip, score: scores[index] }
  }
  const chips = candidates.map((_, index) => best[index]?.chip ?? "")
  return chips.every(Boolean) ? chips : []
}

function settleMessage(said: string, fallback: string, selection: InterviewPick | null, lost: boolean): string {
  if (lost && (!said || /canvas|selecion|confirmar/i.test(said))) return PICK_LOST
  if (said) return said
  return selection ? (selection.any ? PICK_ANY_MESSAGE : PICK_MESSAGE) : fallback
}

function placeOpen(context: SettleContext, ids: readonly string[], anchors: readonly string[]): boolean {
  return distinct(anchors) >= PICK_LIMITS.min && !placeGiven(context.history, context.texts, context.ids === undefined ? undefined : ids)
}

export function settleTurn(raw: InterviewReply, context: SettleContext): InterviewTurn {
  const copilot = context.scope === "copilot"
  const ids = [...(context.ids ?? [])]
  const chips = Array.isArray(raw.suggestions) ? raw.suggestions.filter((entry): entry is string => typeof entry === "string") : []
  let action = raw.action
  if (action === "arrange" && !copilot) action = "ask"
  if (action === "generate" && (copilot || context.hasFlow)) action = "edit"
  else if (action === "edit" && !copilot && !context.hasFlow) action = "generate"
  let plan = clipPlan(asText(raw.plan))
  if ((action === "generate" || action === "edit") && !plan && !copilot) plan = clipPlan(userText(context.history, action === "edit"))
  let said = tidy(asText(raw.message))
  if (action === "arrange") return settleArrange(raw, ids, said, plan, chips)
  const anchors = context.anchors === undefined ? ids : [...context.anchors]
  const offered = copilot && action !== "finish" ? settlePick(raw.pick, ids, plan, anchors) : null
  const unplaced = offered !== null && action === "edit" && !(offered.any ? ids : offered.candidates).some((id) => citesId(plan, id))
  const listed = unplaced && offered !== null && !offered.any
  if (copilot && action === "edit" && raw.adds === true && !listed && placeOpen(context, ids, anchors)) return placeTurn(said, plan, raw.after, anchors)
  if (unplaced) {
    action = "ask"
    if (!asksSelection(said) && !said.endsWith("?")) said = ""
  }
  const selection = action === "ask" ? offered : null
  const lost = copilot && action === "ask" && !selection && (wantedPick(raw.pick) || asksSelection(said))
  const suggestions = action === "finish" || (copilot && action !== "ask") ? [] : selection && !selection.any ? pickSuggestions(chips, selection.candidates, context.texts) : cleanSuggestions(chips)
  const message = settleMessage(said, (copilot ? COPILOT_MESSAGES : DEFAULT_MESSAGES)[action], selection, lost)
  return selection ? { message, suggestions, action, plan, pick: selection } : { message, suggestions, action, plan }
}

function reject(error: string, field?: GenerateFailure["field"]): { ok: false; failure: GenerateFailure } {
  return { ok: false, failure: { success: false, code: "invalid_request", error, ...(field ? { field } : {}) } }
}

interface InterviewContext {
  history: InterviewMessage[]
  flow: AtendimentoFlow | null
  fill: boolean
  scope: InterviewScope
  proposal: boolean
}

type ContextCheck = { ok: true; context: InterviewContext } | { ok: false; failure: GenerateFailure }

type SystemOptions = ModelSetup["systemOptions"]

function readContext(input: InterviewMessagesInput, fill: boolean): ContextCheck {
  const history = cleanHistory(input.history)
  if (!history) return reject(HISTORY_INVALID, "prompt")
  if (!history.some((message) => message.role === "user")) return reject(HISTORY_EMPTY, "prompt")
  const scope: InterviewScope = input.scope === "copilot" ? "copilot" : "builder"
  let flow: AtendimentoFlow | null = null
  if (input.flow !== undefined && input.flow !== null) {
    try {
      const opened = importFlow(input.flow)
      flow = scope === "copilot" || hasComponents(opened) ? opened : null
    } catch {
      return reject(FLOW_INVALID, "base")
    }
  }
  if (scope === "copilot" && !flow) return reject(COPILOT_FLOW_MISSING, "base")
  return { ok: true, context: { history, flow, fill, scope, proposal: input.proposal === true } }
}

function systemTexts({ flow, fill, scope, proposal }: InterviewContext): [string, string] {
  if (scope === "copilot" && flow) return [copilotSystemPrompt(), copilotStateText(flow, fill, proposal)]
  return [interviewSystemPrompt(), stateText(flow, fill)]
}

function contextMessages(context: InterviewContext, systemOptions?: SystemOptions): ModelMessage[] {
  const [prompt, state] = systemTexts(context)
  return [
    { role: "system", content: prompt, ...(systemOptions ? { providerOptions: systemOptions } : {}) },
    { role: "system", content: state },
    ...conversation(trimHistory(context.history)),
  ]
}

export function interviewMessages(input: InterviewMessagesInput, systemOptions?: SystemOptions): ModelMessage[] {
  const read = readContext(input, input.fill ?? DEFAULT_FILL)
  if (!read.ok) throw new Error(read.failure.error)
  return contextMessages(read.context, systemOptions)
}

interface TurnAttempt {
  turn?: InterviewReply
  error?: unknown
}

interface TurnFormat {
  schema: z.ZodType<InterviewReply>
  copilot: boolean
  retry: string
}

const BUILDER_FORMAT: TurnFormat = { schema: interviewSchema, copilot: false, retry: FORMAT_RETRY }
const COPILOT_FORMAT: TurnFormat = { schema: copilotSchema, copilot: true, retry: COPILOT_FORMAT_RETRY }

async function settleObject(object: PromiseLike<InterviewReply>, watch: StreamWatch, signal: AbortSignal): Promise<InterviewReply> {
  let turn: InterviewReply
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

async function callTurn(setup: ModelSetup, messages: ModelMessage[], signal: AbortSignal, onPartial: InterviewHooks["onPartial"], format: TurnFormat): Promise<TurnAttempt> {
  setup.watch.refusal = false
  setup.watch.failed = false
  setup.watch.reached = false
  try {
    const result = streamObject({
      model: setup.model,
      schema: format.schema,
      schemaName: INTERVIEW_SCHEMA_NAME,
      schemaDescription: INTERVIEW_SCHEMA_DESCRIPTION,
      messages,
      allowSystemInMessages: true,
      providerOptions: setup.providerOptions,
      ...(setup.maxOutputTokens !== undefined ? { maxOutputTokens: setup.maxOutputTokens } : {}),
      abortSignal: signal,
      experimental_repairText: async ({ text }) => repairTurnText(text, format.copilot),
      onError: () => undefined,
    })
    const follow = async () => {
      for await (const value of result.partialObjectStream) {
        if (!onPartial) continue
        const partial = partialTurn(value, format.copilot)
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

async function converse(setup: ModelSetup, messages: ModelMessage[], hooks: InterviewHooks, format: TurnFormat): Promise<InterviewReply> {
  let relaxed = 0
  let corrected = false
  let dropped = 0
  for (;;) {
    const attempt = await callTurn(setup, messages, hooks.signal, hooks.onPartial, format)
    if (attempt.turn) return attempt.turn
    const { error } = attempt
    if (hooks.signal.aborted) throw error
    if (relaxed < RELAX_LIMIT && relax(setup, error)) {
      relaxed++
      continue
    }
    if (dropped < RETRY_DELAYS_MS.length && isTransient(error)) {
      await pause(RETRY_DELAYS_MS[dropped], hooks.signal)
      dropped++
      continue
    }
    if (!corrected && isFormatFailure(error)) {
      corrected = true
      const text = NoObjectGeneratedError.isInstance(error) ? (error.text ?? "").slice(0, LIMITS.prompt) : ""
      messages.push({ role: "assistant", content: text || "{}" }, { role: "user", content: format.retry })
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
    const read = readContext(input, resolved.fill)
    if (!read.ok) return { ok: false, failure: read.failure }
    const { context } = read
    if (hooks.signal.aborted) return { ok: false, failure: { success: false, code: "aborted", error: ABORTED } }
    const setup = createSetup(resolved, { transport: hooks.transport, signal: hooks.signal, fetch: hooks.fetch })
    const messages = contextMessages(context, setup.systemOptions)
    try {
      const raw = await converse(setup, messages, hooks, context.scope === "copilot" ? COPILOT_FORMAT : BUILDER_FORMAT)
      const ids = context.flow ? context.flow.nodes.filter((node) => node.data.type !== NOTE_TYPE).map((node) => node.id) : []
      const anchors = context.flow ? context.flow.nodes.filter((node) => node.data.type !== NOTE_TYPE && outputHandles(node).length > 0).map((node) => node.id) : []
      const texts = context.scope === "copilot" && context.flow ? componentTexts(context.flow) : undefined
      return { ok: true, turn: settleTurn(raw, { hasFlow: context.flow !== null, history: context.history, scope: context.scope, ids, anchors, texts }) }
    } catch (error) {
      return { ok: false, failure: interviewFailure(describeFailure(error, resolved.provider, resolved.apiKey, { client: hooks.signal })) }
    }
  } catch {
    return { ok: false, failure: { success: false, code: "unknown", error: UNKNOWN, details: "Tente novamente." } }
  }
}
