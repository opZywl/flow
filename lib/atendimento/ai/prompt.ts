import { NOTE_TYPE, categories, componentCatalog, expectedFieldTypes } from "../catalog"
import type { ComponentDefinition, FieldSpec, JsonValue } from "../types"
import { AUTO_COMPONENT_LIMIT, COUNT_LIMITS, RI_LIMITS, SIZE_RANGES, type GenerationSize } from "./contracts"
import { guideOf, type ComponentGuide } from "./guide"
import type { RiFlow } from "./ri"
import { describeNumberRule } from "./values"

export interface RequestPromptInput {
  prompt: string
  size: GenerationSize
  count?: number
  name?: string
  image?: { mediaType: string; bytes?: number } | null
  hasImage?: boolean
}

export interface PromptExample {
  title: string
  plainTitle?: string
  ri: RiFlow
}

export interface PromptOptions {
  fill?: boolean
}

const TEXT_KINDS = new Set<FieldSpec["kind"]>(["text", "textarea", "select", "checkbox", "number", "numberText"])

const options = (items: string[]) => JSON.stringify(items.map((text) => ({ text })))

export const PROMPT_EXAMPLES: readonly PromptExample[] = [
  {
    title: "menu com transferência, retorno ao menu e despedida (o pedido não nomeou o departamento: o nome vem do contexto e o ID provisório vem do nome)",
    plainTitle: "menu com transferência, retorno ao menu e despedida",
    ri: {
      name: "Atendimento Clínica Exemplo",
      description: "Boas-vindas, menu principal e transferência para a equipe certa",
      nodes: [
        { id: "boas_vindas", type: "envio_pergunta", config: [{ key: "template", value: "Olá, #NAME. Você está no atendimento da Clínica Exemplo." }] },
        { id: "menu", type: "envio_mensagem", config: [{ key: "title", value: "Como podemos ajudar?" }, { key: "options", value: options(["Agendar consulta", "Horários", "Encerrar"]) }] },
        { id: "agenda", type: "departamentos", config: [{ key: "departamento", value: "agendamento" }, { key: "name", value: "Agendamento" }] },
        { id: "horarios", type: "envio_pergunta", config: [{ key: "template", value: "Atendemos de segunda a sexta, das 8h às 18h." }] },
        { id: "volta_menu", type: "voltar", config: [{ key: "targetNodeId", value: "menu" }] },
        { id: "despedida", type: "envio_pergunta", config: [{ key: "template", value: "Obrigado pelo contato. Até logo." }] },
        { id: "fim", type: "finalizar", config: [] },
      ],
      edges: [
        { from: "inicio", output: "", to: "boas_vindas" },
        { from: "boas_vindas", output: "", to: "menu" },
        { from: "menu", output: "Agendar consulta", to: "agenda" },
        { from: "menu", output: "Horários", to: "horarios" },
        { from: "horarios", output: "", to: "volta_menu" },
        { from: "menu", output: "Encerrar", to: "despedida" },
        { from: "despedida", output: "", to: "fim" },
      ],
    },
  },
  {
    title: "horário de atendimento, dado validado em API e saídas duplas (o pedido informou a URL https://api.exemplo.com/clientes)",
    ri: {
      name: "Segunda via",
      description: "Valida o CPF do titular em horário comercial",
      nodes: [
        {
          id: "horario",
          type: "timeConditions",
          config: [{ key: "timeRules", value: JSON.stringify([{ weekDays: ["monday", "tuesday", "wednesday", "thursday", "friday"], startTime: "08:00", endTime: "18:00" }]) }],
        },
        { id: "fora", type: "envio_pergunta", config: [{ key: "template", value: "Atendemos de segunda a sexta, das 8h às 18h." }] },
        { id: "fim_fora", type: "finalizar", config: [] },
        {
          id: "cpf",
          type: "solicitar_dados",
          config: [
            { key: "text", value: "Informe o CPF do titular, somente números." },
            { key: "channel", value: "CPF" },
            { key: "error", value: "Não encontramos esse CPF." },
            { key: "url_api", value: "https://api.exemplo.com/clientes" },
            { key: "body_value", value: JSON.stringify({ cpf: "{{input}}" }) },
            { key: "response_map", value: JSON.stringify([{ path: "cliente.nome", key: "nome", sample: "Maria", variable: "nome_cliente" }]) },
          ],
        },
        { id: "ok", type: "envio_pergunta", config: [{ key: "template", value: "Obrigado, @@@nome_cliente. A segunda via será enviada em instantes." }] },
        { id: "fim_ok", type: "finalizar", config: [] },
        { id: "financeiro", type: "departamentos", config: [{ key: "departamento", value: "financeiro" }, { key: "name", value: "Financeiro" }] },
      ],
      edges: [
        { from: "inicio", output: "", to: "horario" },
        { from: "horario", output: "Fora do horário", to: "fora" },
        { from: "fora", output: "", to: "fim_fora" },
        { from: "horario", output: "Dentro do horário", to: "cpf" },
        { from: "cpf", output: "Sucesso", to: "ok" },
        { from: "ok", output: "", to: "fim_ok" },
        { from: "cpf", output: "Falha", to: "financeiro" },
      ],
    },
  },
  {
    title: "submenu com volta, dado coletado reaproveitado e nodes na ordem da conversa (o pedido citou os departamentos Suporte Técnico e Financeiro, sem os IDs)",
    plainTitle: "submenu com volta, dado coletado reaproveitado e nodes na ordem da conversa (o pedido citou os departamentos Suporte Técnico e Financeiro)",
    ri: {
      name: "Suporte Internet",
      description: "Triagem do suporte técnico com coleta do endereço e transferência",
      nodes: [
        { id: "boas_vindas", type: "envio_pergunta", config: [{ key: "template", value: "Olá, #NAME. Você está no suporte da Net Exemplo." }] },
        { id: "menu", type: "envio_mensagem", config: [{ key: "title", value: "Como podemos ajudar?" }, { key: "options", value: options(["Suporte técnico", "Segunda via", "Encerrar"]) }] },
        { id: "menu_suporte", type: "envio_mensagem", config: [{ key: "title", value: "Qual é o problema com a sua internet?" }, { key: "options", value: options(["Sem conexão", "Internet lenta", "Voltar ao menu"]) }] },
        { id: "pede_endereco", type: "envio_pergunta", config: [{ key: "template", value: "Para verificarmos a sua região, informe o endereço da instalação com rua, número e bairro." }] },
        { id: "endereco", type: "waitForAnswer", config: [{ key: "customFields", value: "field_1" }] },
        { id: "confirma_endereco", type: "envio_pergunta", config: [{ key: "template", value: "Obrigado, #NAME. Registramos o endereço @@@field_1 e um técnico vai continuar o seu atendimento." }] },
        { id: "tecnico", type: "departamentos", config: [{ key: "departamento", value: "suporte-tecnico" }, { key: "name", value: "Suporte Técnico" }] },
        { id: "dica_lenta", type: "envio_pergunta", config: [{ key: "template", value: "Desligue o roteador da tomada, aguarde 30 segundos e ligue de novo. Se a lentidão continuar, escolha Sem conexão para falar com um técnico." }] },
        { id: "volta_suporte", type: "voltar", config: [{ key: "targetNodeId", value: "menu_suporte" }] },
        { id: "volta_menu", type: "voltar", config: [{ key: "targetNodeId", value: "menu" }] },
        { id: "financeiro", type: "departamentos", config: [{ key: "departamento", value: "financeiro" }, { key: "name", value: "Financeiro" }] },
        { id: "despedida", type: "envio_pergunta", config: [{ key: "template", value: "Obrigado pelo contato, #NAME. Até logo." }] },
        { id: "fim", type: "finalizar", config: [] },
      ],
      edges: [
        { from: "inicio", output: "", to: "boas_vindas" },
        { from: "boas_vindas", output: "", to: "menu" },
        { from: "menu", output: "Suporte técnico", to: "menu_suporte" },
        { from: "menu_suporte", output: "Sem conexão", to: "pede_endereco" },
        { from: "pede_endereco", output: "", to: "endereco" },
        { from: "endereco", output: "", to: "confirma_endereco" },
        { from: "confirma_endereco", output: "", to: "tecnico" },
        { from: "menu_suporte", output: "Internet lenta", to: "dica_lenta" },
        { from: "dica_lenta", output: "", to: "volta_suporte" },
        { from: "menu_suporte", output: "Voltar ao menu", to: "volta_menu" },
        { from: "menu", output: "Segunda via", to: "financeiro" },
        { from: "menu", output: "Encerrar", to: "despedida" },
        { from: "despedida", output: "", to: "fim" },
      ],
    },
  },
]

const RULES = {
  platform: {
    fill: "Preencha todos os campos de todos os componentes. Nomes de departamento, tag, fluxo de destino, template, agente, lista, tabulação, formulário e aba recebem o nome que o pedido traz ou, sem ele, um nome claro e coerente com o contexto, por exemplo Suporte Técnico. Campos marcados como dado da plataforma (IDs, URLs de APIs, arquivos, imagens e planilhas) recebem o valor que o pedido informar; quando o pedido não traz o valor, use um provisório coerente: ID em letras minúsculas com hífen, feito a partir do nome, por exemplo suporte-tecnico, e URL no domínio da empresa do pedido, por exemplo https://api.lucas-lima.xyz/v1/boletos, ou em https://api.lucas-lima.xyz/ quando o pedido não cita a empresa. O editor avisa o usuário de cada valor provisório para ele trocar pelo cadastrado na plataforma.",
    plain: "Campos marcados como dado da plataforma (IDs e nomes cadastrados, URLs de APIs, arquivos e imagens, planilhas): use só o que o pedido informar. Sem a informação, omita a chave: o campo fica vazio e o usuário completa no editor. Nunca invente IDs, URLs ou planilhas.",
  },
  keys: {
    fill: "Escreva cada chave com o seu valor preenchido. Chaves que ficariam com o valor padrão podem ficar fora da RI.",
    plain: "Escreva só as chaves que mudam o padrão. Chaves vazias e chaves com o valor padrão ficam fora da RI.",
  },
} as const

const introLines = (fill: boolean): string[] => [
  "Você é especialista em fluxos de atendimento por WhatsApp para a plataforma de Atendimento. Monte o fluxo completo que o pedido descreve e responda só com a RI (representação intermediária) no esquema pedido. O sistema converte a RI no JSON de Atendimento, confere cada componente e mostra o fluxo no editor enquanto a resposta chega.",
  "",
  "# Formato da RI",
  "- name: nome curto do fluxo. description: uma frase sobre o fluxo.",
  "- nodes: os componentes, cada um com id, type e config.",
  "- id: curto, estável e único, com letras minúsculas, números e _, até 30 caracteres. Nomeie pelo papel no fluxo, por exemplo menu_principal, cpf_titular ou fim_financeiro, nunca pela posição.",
  "- type: um dos tipos da seção Componentes.",
  "- config: pares key e value. Use só as chaves listadas no componente. Chave omitida fica com o padrão.",
  "- value é sempre texto: o próprio texto nos campos de texto; \"true\" ou \"false\" em sim ou não; número em texto; listas e objetos em JSON, por exemplo [{\"text\":\"Agendar\"}].",
  "- edges: as conexões, cada uma com from, output e to.",
  "- output: o rótulo da saída como listado, por exemplo \"Sucesso\" ou o texto da opção do menu, ou o número da saída a partir de 1. Use \"\" quando o componente tem uma única saída.",
  "",
  "# Regras do fluxo",
  "1. O Iniciar Fluxo já existe, com id \"inicio\". Não o coloque em nodes. Ligue-o ao primeiro passo com {\"from\":\"inicio\",\"output\":\"\",\"to\":\"<id>\"}.",
  "2. Cada componente recebe no máximo uma conexão. Quando dois caminhos terminam igual, crie um componente para cada caminho. Para voltar a um menu, use Retornar ao Menu (voltar) com targetNodeId igual ao id do menu na RI. Nunca crie conexão de volta.",
  "3. Ligue todas as saídas de todos os componentes. Componentes sem saídas encerram o caminho.",
  "4. Nada se liga ao início, nenhum componente se liga a ele mesmo e Nota nunca é ligada.",
  `5. Menu de Opções: de 1 a ${RI_LIMITS.menuOptions} opções. buttons "true" só com até 3 opções.`,
  `6. ${fill ? RULES.platform.fill : RULES.platform.plain}`,
  "7. Variáveis: nas mensagens, @@@variavel mostra valores capturados (Aguardando Mensagem, Entrada de Dados, response_map) e #NAME mostra o nome do contato. Em corpos de API e integrações, use {{variavel}}. Nomes de variável têm letras, números e _, sem espaços e sem {{ }}.",
  "8. Textos em português do Brasil, claros, profissionais e específicos do pedido. Sem emojis, a menos que o pedido peça.",
  "9. Use o componente mais adequado a cada etapa. Também existem componentes de agenda, chamados, CRM, IA, integrações, condições e coleta de dados.",
  "10. Para se despedir antes de encerrar, use Enviar Mensagem e depois Encerrar Conversa.",
  "",
  "# Fluxo completo",
  "1. Antes de escrever, percorra o pedido inteiro e separe cada etapa, menu, opção, pergunta, validação, integração, transferência e encerramento citados. Cada um vira componente. Escreva todos, sem resumir, sem juntar etapas em uma mensagem só e sem deixar ramo para depois.",
  "2. Mensagens completas e naturais, como um atendente cordial escreveria: frases inteiras, com as informações que o pedido traz (horários, prazos, documentos, endereços) e o próximo passo do contato. Nunca use texto provisório, reticências ou colchetes para completar depois. Não invente preços, telefones, endereços ou prazos que o pedido não deu; escreva a mensagem de modo que funcione sem eles.",
  "3. Toda saída de todo componente vai a um destino que faz sentido para aquele resultado. Saídas de falha (Falha, Inválido, Fora do horário, não identificado, sem resposta) recebem tratamento próprio: uma mensagem clara e depois transferência para atendente, Retornar ao Menu ou despedida com Encerrar Conversa.",
  "4. Menus: cada opção leva ao seu próprio caminho. Um ramo que só informa termina em Retornar ao Menu, para o contato escolher de novo. Todo submenu tem uma opção para voltar, ligada a Retornar ao Menu com o menu anterior. O menu principal tem uma opção de encerramento, que leva à despedida e ao Encerrar Conversa. Textos das opções curtos e diferentes entre si; em output, repita o texto exato da opção.",
  "5. Dados coletados são reaproveitados: depois de Aguardando Mensagem, Entrada de Dados ou response_map, use o valor nas mensagens seguintes com @@@campo, para confirmar o dado ou personalizar a resposta, e nas APIs com {{campo}}.",
  `6. ${fill ? RULES.keys.fill : RULES.keys.plain}`,
  "",
  "# Ordem de escrita",
  "O editor mostra cada componente assim que ele chega, e uma resposta interrompida só aproveita o que veio antes. Por isso:",
  "1. Escreva os nodes na ordem do caminho da conversa: primeiro o passo ligado ao inicio, depois o seguinte. Em um componente com várias saídas, escreva o ramo inteiro da primeira saída, até o encerramento ou o Retornar ao Menu, antes de começar o ramo da saída seguinte.",
  "2. Escreva as edges na mesma ordem dos nodes: primeiro a conexão que sai do inicio e depois, para cada componente da lista, a conexão que chega a ele.",
  "3. Cada Nota vem em nodes logo depois do componente que ela explica, e o editor a mostra ao lado dele. A nota geral do fluxo vem antes de todos os componentes e fica junto do início.",
  "4. Nas correções, mantenha os mesmos ids e a mesma ordem.",
]

export const DELIVERY = "Responda com a RI do fluxo inteiro, dentro do tamanho pedido: todos os ramos, mensagens completas, todas as saídas ligadas, e nodes e edges na ordem do caminho da conversa."

function stringValue(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") return value.trim() ? JSON.stringify(value) : undefined
  if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(String(value))
  return undefined
}

function objectKeys(keys: readonly string[]): string {
  return `{${keys.map((key) => JSON.stringify(key)).join(",")}}`
}

function selectText(field: FieldSpec): string {
  const choices = (field.options ?? []).filter((option) => option.value !== "")
  return `um de: ${choices.map((option) => (option.label && option.label !== option.value ? `${JSON.stringify(option.value)} (${option.label})` : JSON.stringify(option.value))).join(", ")}`
}

function jsonText(type: string, field: FieldSpec): string {
  if (field.key === "response_map") return `lista JSON de itens ${objectKeys(["path", "key", "sample", "variable"])}`
  if (field.key === "selectedIds") return "lista JSON de IDs em texto"
  return expectedFieldTypes(type, field.key)?.[0] === "object" ? "objeto JSON" : "lista JSON"
}

export function fieldTypeText(type: string, field: FieldSpec): string | undefined {
  switch (field.kind) {
    case "text":
    case "textarea":
      return "texto"
    case "url":
      return "URL http(s)"
    case "select":
      return (field.options ?? []).length < 2 ? undefined : selectText(field)
    case "checkbox":
      return "\"true\" ou \"false\""
    case "number":
      return describeNumberRule({ integer: field.step !== undefined && Number.isInteger(field.step), min: field.min, max: field.max }).replace(/^um /, "")
    case "numberText":
      return field.step !== undefined && Number.isInteger(field.step) ? `${describeNumberRule({ integer: true, min: field.min, max: field.max }).replace(/^um /, "")}, em texto` : "número em texto"
    case "json":
      return jsonText(type, field)
    case "timeRules":
      return `lista JSON de regras ${JSON.stringify({ weekDays: ["monday", "friday"], startTime: "08:00", endTime: "18:00" })}`
    case "menuOptions":
      return `lista JSON de ${field.min ?? 1} a ${field.max ?? RI_LIMITS.menuOptions} opções ${objectKeys(["text", "description"])}`
    case "conditionPairs":
      return `lista JSON de ${field.min ?? 1} a ${field.max ?? RI_LIMITS.conditions} condições ${objectKeys(["var", "value"])}`
    case "weightedPaths":
      return `lista JSON de caminhos ${objectKeys(["label", "weight"])}`
    case "objectList":
      return `lista JSON de itens ${objectKeys((field.itemFields ?? []).map((item) => item.key))}`
    case "menuNode":
      return "id de um Menu de Opções na RI"
  }
  return undefined
}

function fieldLine(definition: ComponentDefinition, field: FieldSpec, guide: ComponentGuide | undefined, defaults: Record<string, JsonValue>): string | undefined {
  const type = definition.nativeType ?? definition.id
  const kind = fieldTypeText(type, field)
  if (!kind) return undefined
  const parts = [kind]
  if (guide?.required?.includes(field.key)) parts.push("obrigatório")
  if (guide?.platform?.includes(field.key)) parts.push("dado da plataforma")
  const fallback = TEXT_KINDS.has(field.kind) ? stringValue(defaults[field.key]) : undefined
  if (fallback) parts.push(`padrão ${fallback}`)
  const hint = field.hint ? ` ${field.hint}` : ""
  const usual = field.suggestions?.length ? ` Valores usuais: ${field.suggestions.map((value) => JSON.stringify(value)).join(", ")}.` : ""
  return `- ${field.key}: ${parts.join(", ")}. ${field.label}.${hint}${usual}`
}

function outputsLine(definition: ComponentDefinition, guide: ComponentGuide | undefined): string {
  if ((definition.nativeType ?? definition.id) === NOTE_TYPE) return "Sem entradas nem saídas: fica fora do caminho."
  if (definition.outputRule) return `Saídas: ${guide?.dynamic ?? "dinâmicas."}`
  const labels = definition.outputLabels ?? []
  if (!labels.length) return "Sem saídas: encerra o caminho."
  const described = labels.map((label, index) => {
    const meaning = guide?.outputs?.[index]
    return meaning ? `${JSON.stringify(label)} (${meaning})` : JSON.stringify(label)
  })
  return labels.length === 1 ? `Saída única: ${described[0]}.` : `Saídas: ${described.join(", ")}.`
}

export function componentBlock(definition: ComponentDefinition, options: PromptOptions = {}): string {
  const type = definition.nativeType ?? definition.id
  const guide = guideOf(type, options.fill !== false)
  const defaults = { ...(definition.defaults?.() ?? {}), ...(definition.configured?.() ?? {}) }
  const lines = [`### ${type} | ${definition.label}`, guide?.does ?? definition.label]
  const fields = (definition.fields ?? []).flatMap((field) => fieldLine(definition, field, guide, defaults) ?? [])
  if (fields.length) lines.push(...fields)
  else if (type !== "trigger_message") lines.push("Sem chaves de config.")
  lines.push(outputsLine(definition, guide))
  if (guide?.rules?.length) lines.push(`Regras: ${guide.rules.join(" ")}`)
  return lines.join("\n")
}

function plainExample(example: PromptExample): PromptExample {
  const nodes = example.ri.nodes.map((node) => {
    const ids = new Set((guideOf(node.type)?.references ?? []).flatMap((reference) => (reference.id ? [reference.id] : [])))
    return ids.size ? { ...node, config: node.config.filter((entry) => !ids.has(entry.key)) } : node
  })
  return { title: example.plainTitle ?? example.title, ri: { ...example.ri, nodes } }
}

export function promptExamples(options: PromptOptions = {}): readonly PromptExample[] {
  return options.fill === false ? PROMPT_EXAMPLES.map(plainExample) : PROMPT_EXAMPLES
}

function examplesSection(fill: boolean): string {
  return promptExamples({ fill }).map((example, index) => `Exemplo ${index + 1}, ${example.title}:\n${JSON.stringify(example.ri)}`).join("\n\n")
}

const cachedSystem = new Map<boolean, string>()

export function systemPrompt(options: PromptOptions = {}): string {
  const fill = options.fill !== false
  const cached = cachedSystem.get(fill)
  if (cached) return cached
  const sections = categories.flatMap((category) => {
    const members = componentCatalog.filter((definition) => definition.category === category.id)
    return members.length ? [`## ${category.label}\n\n${members.map((definition) => componentBlock(definition, { fill })).join("\n\n")}`] : []
  })
  const text = [
    introLines(fill).join("\n"),
    "# Componentes\nCada componente traz type | nome, a função, as chaves de config e as saídas.",
    ...sections,
    "# Exemplos\nIDs, nomes e URLs fictícios. Os exemplos mostram o formato e a ordem de escrita; o tamanho e o conteúdo do seu fluxo vêm do pedido.",
    examplesSection(fill),
  ].join("\n\n")
  cachedSystem.set(fill, text)
  return text
}

export function sizeInstruction(size: GenerationSize, count?: number): string {
  if (size === "custom") {
    const exact = Math.min(COUNT_LIMITS.max, Math.max(COUNT_LIMITS.min, Math.round(Number(count) || COUNT_LIMITS.min)))
    return `Gere exatamente ${exact} componentes, sem contar o início.`
  }
  if (size === "auto") return `Escreva todos os componentes que o pedido descreve, sem resumir. A quantidade vem do pedido, até ${AUTO_COMPONENT_LIMIT}, sem contar o início.`
  const [min, max] = SIZE_RANGES[size]
  return `Gere entre ${min} e ${max} componentes, sem contar o início.`
}

export function requestPrompt(input: RequestPromptInput): string {
  const prompt = input.prompt.trim()
  const sections = [`# Pedido\n${prompt || "Monte o fluxo mostrado na imagem anexada."}`, `# Tamanho\n${sizeInstruction(input.size, input.count)}`]
  const name = input.name?.trim()
  if (name) sections.push(`# Nome do fluxo\n${name}`)
  if (input.image || input.hasImage) sections.push("# Imagem\nA imagem anexada mostra o fluxo de referência. Reproduza todas as etapas, mensagens, opções e conexões, com os textos da imagem.")
  sections.push(`# Entrega\n${DELIVERY}`)
  return sections.join("\n\n")
}

export const FILL_CORRECTION = "Nome pendente recebe o nome que o pedido traz ou um nome coerente com o contexto. ID e URL recebem o valor do pedido ou um provisório coerente, como manda a regra 6."

export const CORRECTION_RULES: readonly string[] = [
  "Mude só o necessário para resolver cada pendência. Tudo o que já está certo continua igual: mesmos ids, tipos, textos, opções, chaves e conexões.",
  "Não remova, não resuma e não junte componentes, a menos que a pendência peça.",
  FILL_CORRECTION,
  "Saída sem destino vai para um componente novo que faça sentido para aquele resultado, como mensagem e Encerrar Conversa, Retornar ao Menu ou transferência. Nunca ligue a um componente que já recebe conexão.",
  "Mantenha a ordem do caminho da conversa em nodes e edges, com os componentes novos no ponto do caminho em que entram.",
]

export function correctionRules(options: PromptOptions = {}): readonly string[] {
  return options.fill === false ? CORRECTION_RULES.filter((rule) => rule !== FILL_CORRECTION) : CORRECTION_RULES
}

export function correctionPrompt(items: readonly string[], options: PromptOptions = {}): string {
  return [
    "# Pendências",
    "A RI anterior gerou estas pendências. Corrija todas e devolva a RI completa, com todos os componentes e conexões. Mantenha os ids que não precisam mudar.",
    ...items.map((item) => `- ${item}`),
    "",
    "# Como corrigir",
    ...correctionRules(options).map((rule) => `- ${rule}`),
  ].join("\n")
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object"

function zodIssues(error: unknown): unknown[] | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 4 && isRecord(current); depth++) {
    if (Array.isArray(current.issues)) return current.issues
    current = current.cause
  }
  return undefined
}

function isParseFailure(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && isRecord(current); depth++) {
    if (typeof current.name === "string" && /JSONParse/i.test(current.name)) return true
    current = current.cause
  }
  return false
}

function issueText(issue: unknown): string {
  if (!isRecord(issue)) return "valor inválido"
  const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "raiz"
  if (issue.code === "invalid_type") return issue.received === "undefined" ? `${path}: campo ausente` : `${path}: esperado ${String(issue.expected)}, recebido ${String(issue.received)}`
  if (issue.code === "invalid_enum_value") return `${path}: ${JSON.stringify(issue.received)} não é um tipo da lista`
  if (issue.code === "unrecognized_keys") return `${path}: chave fora do esquema`
  return `${path}: valor inválido`
}

export function describeFormatProblem(error: unknown): string {
  const issues = zodIssues(error)
  if (issues?.length) return issues.slice(0, 5).map(issueText).join("; ")
  if (isParseFailure(error)) return "o texto não é um JSON válido"
  return "a resposta não seguiu o esquema"
}

export function formatCorrectionPrompt(problem?: string): string {
  const detail = problem?.trim().replace(/\.+$/, "")
  return `A resposta anterior não está no formato da RI${detail ? `: ${detail}` : ""}. Responda de novo, só com a RI completa.`
}

export function formatFailurePrompt(error?: unknown): string {
  return formatCorrectionPrompt(describeFormatProblem(error))
}
