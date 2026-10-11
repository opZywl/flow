import type { ComponentDefinition, FieldSpec, Measured } from "./types"
import templates from "./templates.json"

export const START_TYPE = "trigger_message"
export const START_ID = "inicio"
export const MENU_TYPE = "envio_mensagem"
export const API_TYPES: ReadonlySet<string> = new Set(["consulta_api", "solicitar_dados"])

export const categories = [
  { id: "messages", label: "Mensagens", color: "#b87900" },
  { id: "templates", label: "Templates", color: "#07856b" },
  { id: "routing", label: "Roteamento e transferência", color: "#358451" },
  { id: "schedule", label: "Agendamentos", color: "#7938df" },
  { id: "tickets", label: "Tickets", color: "#087fa9" },
  { id: "crm", label: "CRM", color: "#10843d" },
  { id: "livechat", label: "Livechat", color: "#138639" },
  { id: "control", label: "Controle de fluxo", color: "#db3046" },
  { id: "conditions", label: "Condições", color: "#075681" },
  { id: "ai", label: "Inteligência artificial (IA)", color: "#8b4bd3" },
  { id: "apis", label: "APIs", color: "#327e98" },
  { id: "collection", label: "Coleta de dados", color: "#b96900" },
] as const

export const weekDayOptions = [
  { value: "monday", label: "Seg" },
  { value: "tuesday", label: "Ter" },
  { value: "wednesday", label: "Qua" },
  { value: "thursday", label: "Qui" },
  { value: "friday", label: "Sex" },
  { value: "saturday", label: "Sáb" },
  { value: "sunday", label: "Dom" },
]

export const newTimeRule = (id = `rule-${Date.now()}`) => ({
  id,
  weekDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  startTime: "08:00",
  endTime: "17:59",
})

const methodField: FieldSpec = { key: "method", label: "Método HTTP", kind: "select", options: [{ value: "POST", label: "POST" }] }
const variablesHint = "Use @@@variavel para valores capturados ou retornados por API e #NAME para o nome do contato."

const known: ComponentDefinition[] = [
  {
    id: "start", label: "Iniciar Fluxo", category: "control", nativeType: START_TYPE, outputs: 1,
    measured: { width: 260, height: 86 },
    defaults: () => ({ title: "Iniciar Fluxo", buttons: "false" }),
    fields: [], summary: [],
  },
  {
    id: "menu", label: "Menu de Opções", category: "messages", nativeType: MENU_TYPE,
    measured: { width: 260, height: 212 },
    defaults: () => ({ message: "", buttons: "false", "df-channel": "", "opt-1": "1", "text-1": "Opção 1", "description-1": "", title: "Escolha uma opção:" }),
    fields: [
      { key: "title", label: "Mensagem do menu", kind: "textarea", placeholder: "Mensagem das opções", hint: "Até 1024 caracteres. Compatível com emojis, formatação de texto e links." },
      { key: "buttons", label: "Exibir como botões", kind: "select", options: [{ value: "false", label: "Não" }, { value: "true", label: "Sim" }], hint: "Até 3 botões. Acima de 3 é gerada uma lista com no máximo 10 opções." },
    ],
    summary: ["title"],
  },
  {
    id: "message", label: "Enviar Mensagem", category: "messages", nativeType: "envio_pergunta", outputs: 1,
    measured: { width: 260, height: 130 },
    defaults: () => ({ envio_pergunta: "", template: "" }),
    fields: [{ key: "template", label: "Mensagem", kind: "textarea", placeholder: "Digite uma mensagem", hint: variablesHint }],
    summary: ["template"],
  },
  {
    id: "department", label: "Transferir para Departamento", category: "routing", nativeType: "departamentos", outputs: 0,
    measured: { width: 330, height: 138 },
    defaults: () => ({ departamentos: "", "df-channel": "", id: "", departamento: "", name: "", enabled: true, userManager: null }),
    fields: [
      { key: "departamento", label: "ID do departamento", kind: "text", mirror: "id", placeholder: "ID cadastrado na plataforma" },
      { key: "name", label: "Nome do departamento", kind: "text" },
      { key: "enabled", label: "Departamento ativo", kind: "checkbox" },
    ],
    summary: ["name", "departamento"],
  },
  {
    id: "tag", label: "Aplicar Tag", category: "routing", nativeType: "tags", outputs: 1,
    measured: { width: 260, height: 138 },
    defaults: () => ({ id: "", tags: "", selectedTag: "" }),
    fields: [
      { key: "selectedTag", label: "ID da tag", kind: "text", mirror: "id", placeholder: "ID cadastrado na plataforma" },
      { key: "tags", label: "Nome da tag", kind: "text" },
    ],
    summary: ["tags", "selectedTag"],
  },
  {
    id: "flow", label: "Transferir para Fluxo", category: "control", nativeType: "flow", outputs: 0,
    measured: { width: 260, height: 138 },
    defaults: () => ({ id: "", targetFlow: "", flowName: "", flowDescription: "" }),
    fields: [
      { key: "targetFlow", label: "ID do fluxo de destino", kind: "text", mirror: "id", placeholder: "ID cadastrado na plataforma" },
      { key: "flowName", label: "Nome do fluxo de destino", kind: "text" },
      { key: "flowDescription", label: "Descrição do fluxo de destino", kind: "textarea" },
    ],
    summary: ["flowName", "targetFlow"],
  },
  {
    id: "finish", label: "Encerrar Conversa", category: "control", nativeType: "finalizar", outputs: 0,
    measured: { width: 260, height: 86 },
    defaults: () => ({ message: "", "df-channel": "" }),
    fields: [], summary: [],
  },
  {
    id: "time", label: "Condições de Tempo", category: "conditions", nativeType: "timeConditions", outputs: 2,
    outputLabels: ["Fora do horário", "Dentro do horário"],
    measured: { width: 262, height: 86 },
    defaults: () => ({ timeConditions: "", timeRules: [newTimeRule()] }),
    fields: [{ key: "timeRules", label: "Horários de atendimento", kind: "timeRules" }],
    summary: [],
  },
  {
    id: "request-data", label: "Solicitar Dados", category: "apis", nativeType: "solicitar_dados", outputs: 2,
    outputLabels: ["Falha", "Sucesso"],
    measured: { width: 392, height: 174 },
    defaults: () => ({
      channel: "CPF/CNPJ", url_api: "", curl: "", method: "POST", body_value: "", text: "", error: "",
      parsed_body: {}, parameterExplanations: {}, tentativas: "3", isApiValidated: false, validated_signature: "",
      headers: [], response_map: [],
    }),
    fields: [
      { key: "text", label: "Mensagem de solicitação", kind: "textarea", placeholder: "Digite uma mensagem...", hint: variablesHint },
      { key: "error", label: "Mensagem de erro", kind: "textarea", placeholder: "Mensagem de erro..." },
      { key: "channel", label: "Tipo de dado", kind: "select", options: [{ value: "CPF/CNPJ", label: "CPF/CNPJ" }, { value: "CPF", label: "CPF" }, { value: "CNPJ", label: "CNPJ" }, { value: "other", label: "Outro (ex.: número de ticket)" }] },
      { key: "tentativas", label: "Quantidade de tentativas", kind: "select", options: ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value })) },
      { key: "url_api", label: "URL da API", kind: "url", placeholder: "https://" },
      methodField,
      { key: "body_value", label: "Corpo da requisição", kind: "textarea", placeholder: "{\n  \"d\": \"{{input}}\"\n}", hint: "{{input}} recebe o dado digitado pelo contato." },
      { key: "headers", label: "Cabeçalhos", kind: "json" },
      { key: "response_map", label: "Mapeamento da resposta", kind: "json", hint: "Cada item: path, key, sample e variable. A variável pode ser usada nas mensagens como @@@variavel." },
    ],
    summary: ["text"],
  },
  {
    id: "protocol", label: "Protocolo", category: "apis", nativeType: "protocolo", outputs: 1,
    measured: { width: 260, height: 174 },
    defaults: () => ({ url_api: "", opt: "Automático", text: "Seu protocolo é: {protocol}" }),
    fields: [
      { key: "opt", label: "Tipo de protocolo", kind: "select", options: [{ value: "Automático", label: "Automático" }, { value: "NewActivities", label: "Novas Atividades" }, { value: "URL", label: "URL" }] },
      { key: "text", label: "Mensagem", kind: "textarea", placeholder: "Digite uma mensagem...", hint: "{protocol} é substituído pelo número do protocolo." },
      { key: "url_api", label: "URL da API", kind: "url", placeholder: "https://", hint: "Usada quando o tipo de protocolo é URL." },
    ],
    summary: ["text"],
  },
  {
    id: "api", label: "Consulta API", category: "apis", nativeType: "consulta_api", outputs: 2,
    outputLabels: ["Falha", "Sucesso"],
    measured: { width: 442, height: 190 },
    defaults: () => ({
      url_api: "", method: "POST", text: "", curl: "", body_value: "", parsed_body: {}, parameterExplanations: {},
      headers: [], api_test_values: {}, isApiValidated: false, validated_signature: "", response_map: [],
    }),
    fields: [
      { key: "url_api", label: "URL da API", kind: "url", placeholder: "https://" },
      methodField,
      { key: "body_value", label: "Corpo da requisição", kind: "textarea", placeholder: "{\n  \"campo\": \"{{variavel}}\"\n}", hint: "Use {{variavel}} para enviar valores capturados no atendimento." },
      { key: "text", label: "Mensagem", kind: "textarea", placeholder: "Digite uma mensagem..." },
      { key: "headers", label: "Cabeçalhos", kind: "json" },
      { key: "api_test_values", label: "Valores de teste", kind: "json" },
      { key: "response_map", label: "Mapeamento da resposta", kind: "json", hint: "Cada item: path, key, sample e variable. A variável pode ser usada nas mensagens como @@@variavel." },
    ],
    summary: ["url_api"],
  },
  {
    id: "wait", label: "Aguardando Mensagem", category: "collection", nativeType: "waitForAnswer", outputs: 1,
    measured: { width: 285, height: 138 },
    defaults: () => ({ mask: "", customfields: "", customFields: "", logToActivity: false, autoSaveContact: false }),
    fields: [
      { key: "customFields", label: "Salvar resposta no campo", kind: "text", placeholder: "Ex.: name, empresa ou custom:ID:campo", suggestions: ["name", "empresa", "field_1", "field_2", "field_3", "field_4", "field_5"], hint: "A resposta fica disponível nas mensagens seguintes como @@@campo." },
      { key: "mask", label: "Máscara", kind: "select", options: [{ value: "", label: "Sem máscara" }, { value: "DD/MM/YYYY", label: "DD/MM/YYYY" }] },
      { key: "logToActivity", label: "Registrar na atividade", kind: "checkbox" },
      { key: "autoSaveContact", label: "Salvar no contato automaticamente", kind: "checkbox" },
    ],
    summary: ["customFields"],
  },
]

const missing: Array<[string, string, string]> = [
  ["file", "Enviar Arquivo", "messages"], ["image", "Enviar Imagem", "messages"],
  ["template-message", "Mensagem Template", "templates"], ["interactive-template", "Template Interativo", "templates"],
  ["form", "Enviar Formulário", "templates"], ["pix", "Cobrança PIX", "templates"],
  ["transfer-other", "Transferir para… (outro destino)", "routing"], ["agent", "Transferir para Agente", "routing"], ["back-agent", "Voltar ao Agente", "routing"],
  ["service", "Escolher Serviço", "schedule"], ["schedule-client", "Identificar Cliente…", "schedule"],
  ["location", "Escolher Local", "schedule"], ["professional", "Escolher Profissional", "schedule"],
  ["time-slot", "Escolher Horário", "schedule"], ["client-data", "Dados do Cliente…", "schedule"], ["booking", "Confirmar Agendamento", "schedule"],
  ["list-tickets", "Consultar Chamados", "tickets"], ["open-ticket", "Abrir Chamado", "tickets"], ["ticket-detail", "Detalhe do Chamado", "tickets"],
  ["crm-client", "Identificar Cliente", "crm"], ["contact", "Criar/Atualizar Contato", "crm"], ["lead", "Capturar Lead", "crm"],
  ["qualify", "Qualificar Lead", "crm"], ["follow-up", "Agendar Follow-up", "crm"], ["subscribe", "Inscrever em…", "crm"], ["unsubscribe", "Remover da…", "crm"],
  ["livechat", "Continuar no Chat…", "livechat"],
  ["note", "Nota", "control"], ["return-menu", "Retornar Menu", "control"],
  ["random", "Randomizador (teste A/B)", "conditions"], ["language", "Idioma", "conditions"], ["ad", "Veio do anúncio?", "conditions"], ["delay", "Tempo de Espera", "conditions"],
  ["ai-agent", "Agente de IA (com…)", "ai"], ["ai-agents", "Agentes de IA", "ai"],
  ["sheets", "Google Planilhas…", "apis"], ["rd", "RD Station: registrar…", "apis"], ["hubspot", "HubSpot: criar/atualizar…", "apis"],
  ["multi-condition", "Múltipla Condição…", "apis"], ["data-entry", "Entrada de Dados…", "apis"], ["message-api", "API de Mensagem…", "apis"],
  ["condition", "Condicional", "apis"], ["datastore", "Enviar para DataStore", "apis"], ["local-datastore", "DataStore Local", "apis"],
  ["invoice", "Enviar Boletos", "apis"], ["api-menu", "Menu de Opções API", "apis"],
  ["consent", "Consentimento", "collection"], ["conversion", "Enviar conversão", "collection"], ["event", "Registrar Evento", "collection"], ["tabulation", "Tabulação", "collection"],
]

export const componentCatalog: ComponentDefinition[] = [
  ...known, ...missing.map(([id, label, category]) => ({ id, label, category })),
]
export const supportedComponents = known
export const pendingComponents = componentCatalog.filter((entry) => !entry.nativeType)

const definitionByType = new Map<string, ComponentDefinition>(known.flatMap((entry) => entry.nativeType ? [[entry.nativeType, entry] as const] : []))
const categoryById = new Map<string, (typeof categories)[number]>(categories.map((category) => [category.id, category]))
const templateByType = new Map(Object.entries(templates as Record<string, string>))

export const getDefinition = (type: string) => definitionByType.get(type)
export const getComponentLabel = (type: string) => getDefinition(type)?.label || type
export const getCategory = (type: string) => {
  const category = getDefinition(type)?.category
  return category === undefined ? undefined : categoryById.get(category)
}
export const getComponentColor = (type: string) => getCategory(type)?.color || "#64748b"
export const getTemplate = (type: string): string => templateByType.get(type) ?? ""
export const defaultMeasured = (type: string): Measured => ({ ...(getDefinition(type)?.measured || { width: 260, height: 86 }) })
