const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

globalThis.fetch = async () => {
  throw new Error('rede bloqueada nos testes')
}

const { streamObject, zodSchema } = require('ai')
const { MockLanguageModelV2, convertArrayToReadableStream } = require('ai/test')
const { createOpenAI } = require('@ai-sdk/openai')
const { createAnthropic } = require('@ai-sdk/anthropic')
const { createGoogleGenerativeAI } = require('@ai-sdk/google')
const { createXai } = require('@ai-sdk/xai')
const { exportFlow, importFlow, validateFlow, outputHandles, outputLabel, stampExport } = require('../lib/atendimento/format.ts')
const { componentCatalog, getDefinition, mirrorKeys, START_ID, START_TYPE } = require('../lib/atendimento/catalog.ts')
const { RI_TYPES, riSchema, repairRiText, coerceRi, canonicalType, countRi, RI_PROVIDER_OPTIONS, RI_SCHEMA_NAME, RI_SCHEMA_DESCRIPTION } = require('../lib/atendimento/ai/ri.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { configureNode, acceptedKeys, fixedKeys, balanceWeights, daysOf, timeOf } = require('../lib/atendimento/ai/values.ts')
const { layoutBox } = require('../lib/atendimento/ai/layout.ts')
const { reviewFlow, correctionItems, scoreOf, compareScores, evaluateRi, pickBetter, needsCorrection, concludeGeneration, platformScope } = require('../lib/atendimento/ai/review.ts')
const { systemPrompt, componentBlock, requestPrompt, sizeInstruction, correctionPrompt, formatCorrectionPrompt, formatFailurePrompt, describeFormatProblem, PROMPT_EXAMPLES } = require('../lib/atendimento/ai/prompt.ts')
const { COMPONENT_GUIDE } = require('../lib/atendimento/ai/guide.ts')
const { PROVIDERS, PROVIDER_IDS, isProviderId, getProvider, defaultModel, findPreset } = require('../lib/atendimento/ai/providers.ts')
const { SIZE_RANGES, COUNT_LIMITS, AUTO_COMPONENT_LIMIT, RI_LIMITS, MAX_ROUNDS, GENERATION_SIZES } = require('../lib/atendimento/ai/contracts.ts')

const NOW = new Date('2026-10-11T12:00:00.000Z')
const NODE_KEYS = ['id', 'type', 'position', 'data', 'measured', 'selected', 'dragging']
const START_KEYS = ['id', 'type', 'position', 'data', 'deletable', 'measured', 'selected', 'dragging']
const EDGE_KEYS = ['type', 'source', 'sourceHandle', 'target', 'id']
const API_WARNING = 'API não validada: valide na plataforma depois de importar.'
const TERMINALS = ['departamentos', 'flow', 'transferir', 'backToAgent', 'OpenAI', 'voltar', 'finalizar']
const AI_DIR = path.join(__dirname, '..', 'lib', 'atendimento', 'ai')

const pairs = config => Object.entries(config).map(([key, value]) => ({ key, value }))
const node = (id, type, config = {}) => ({ id, type, config: pairs(config) })
const edge = (from, output, to) => ({ from, output, to })
const flowOf = (nodes, edges, extra = {}) => ({ name: 'Fluxo de teste', description: 'Fluxo usado nos testes', nodes, edges, ...extra })
const assemble = (ri, options = {}) => assembleFlow(ri, { now: NOW, ...options })
const configure = (type, config) => {
  let sequence = 0
  return configureNode(type, pairs(config), { ruleId: () => `rule-${++sequence}` })
}
const byRi = (assembled, riId) => assembled.flow.nodes.find(entry => entry.id === assembled.platformIds.get(riId))
const labelsOf = target => outputHandles(target).map(handle => outputLabel(target, handle))
const linkOf = (assembled, from, to) => assembled.flow.edges.find(entry => entry.source === assembled.platformIds.get(from) && entry.target === assembled.platformIds.get(to))
const noteMessages = assembled => assembled.notes.map(note => note.message)
const issueMessages = (issues, scope) => issues.filter(issue => !scope || issue.scope === scope).map(issue => issue.message)
const errorsOf = flow => validateFlow(flow).filter(issue => issue.severity === 'error')

const FULL = {
  envio_mensagem: { title: 'Escolha uma opção', options: JSON.stringify([{ text: 'Primeira opção', description: 'Detalhe da primeira' }, { text: 'Segunda opção' }]) },
  envio_pergunta: { template: 'Olá, #NAME. Seja bem-vindo.' },
  departamentos: { departamento: 'dep-1', name: 'Equipe A' },
  tags: { selectedTag: 'tag-1', tags: 'Cliente novo', message: 'Tag aplicada.' },
  flow: { targetFlow: 'fluxo-1', flowName: 'Fluxo B', flowDescription: 'Pós-venda' },
  finalizar: {},
  timeConditions: { timeRules: JSON.stringify([{ weekDays: 'segunda a sexta', startTime: '8h', endTime: '18h' }]) },
  solicitar_dados: { text: 'Informe o número do pedido.', error: 'Pedido não encontrado.', channel: 'Outro', tentativas: '3', url_api: 'https://example.com/api', body_value: '{"pedido":"{{input}}"}', response_map: JSON.stringify([{ path: 'pedido.status', key: 'status', sample: 'aberto', variable: 'status_pedido' }]) },
  protocolo: { opt: 'Automático', text: 'Seu protocolo é: {protocol}' },
  consulta_api: { url_api: 'https://example.com/consulta', body_value: '{"cpf":"{{cpf}}"}', text: 'Consultando seus dados.', response_map: '[]' },
  waitForAnswer: { customFields: 'name', mask: 'DD/MM/YYYY', logToActivity: 'sim' },
  envio_arquivo: { url: 'https://example.com/arquivos/relatorio.pdf', caption: 'Seu relatório.' },
  envio_imagem: { imagem: 'https://example.com/imagens/banner.png', caption: 'Novidades.' },
  templateMessage: { templateMessage: 'modelo-1', templateName: 'boas_vindas', templateParams: '[]' },
  templateInteractive: { templateMessage: 'modelo-2', templateName: 'modelo_interativo' },
  whatsappFlow: { formId: 'form-1', formName: 'Cadastro', body: 'Preencha o formulário.', cta: 'Abrir formulário', maxReminders: '2' },
  pixCharge: { templateMessage: 'modelo-3', templateName: 'cobranca' },
  whatsappCall: { text: 'Toque no botão para ligar.', displayText: 'Falar por voz', ttlMinutes: '30', respectHours: 'false' },
  transferir: { agente: 'agente-1', agenteName: 'Agente A' },
  backToAgent: { department: 'dep-2', departmentName: 'Equipe B' },
  apptService: { headerMessage: 'Escolha o serviço.', emptyMessage: 'Sem serviços disponíveis.', selectedIds: 'servico-1, servico-2' },
  apptIdentify: {},
  apptLocation: { headerMessage: 'Escolha o local.', emptyMessage: 'Sem locais disponíveis.' },
  apptProvider: { headerMessage: 'Escolha o profissional.', emptyMessage: 'Sem profissionais disponíveis.' },
  apptSlot: { headerMessage: 'Escolha o horário.', emptyMessage: 'Sem horários livres.' },
  apptCustomerIntake: { introMessage: 'Vamos registrar seus dados.', askEmail: 'true', successMessage: 'Dados registrados.' },
  apptBook: { successMessage: 'Agendamento confirmado.', conflictMessage: 'Esse horário acabou de ser ocupado.', errorMessage: 'Não foi possível agendar.' },
  ticketLookup: { headerMessage: 'Seus chamados.', emptyMessage: 'Nenhum chamado encontrado.' },
  ticketCreate: { fallbackQuestion: 'Descreva o problema.', successMessage: 'Chamado {{ticketNumber}} aberto: {{link}}', errorMessage: 'Falha ao abrir o chamado.' },
  ticketDetail: { notFoundMessage: 'Chamado não encontrado.', actionPrompt: 'Escolha uma ação.', commentPrompt: 'Escreva o comentário.' },
  crmIdentify: {},
  crmContact: { successMessage: 'Contato salvo.', errorMessage: 'Falha ao salvar o contato.' },
  crmLead: { successMessage: 'Lead registrado.', errorMessage: 'Falha ao registrar o lead.' },
  crmLeadUpdate: { setStatus: 'qualificado' },
  crmActivity: { title: 'Retornar o contato', dueInDays: '2' },
  sequenceEnroll: { sequenceId: 'lista-1', sequenceName: 'Lista A' },
  sequenceUnenroll: { sequenceId: 'lista-1', sequenceName: 'Lista A' },
  webchatHandoff: { widgetId: 'widget-1', message: 'Continue pelo link {{link}}', ttlHours: '48' },
  note: { text: 'Revisar este trecho.' },
  voltar: { targetNodeId: 'menu' },
  randomizer: { paths: JSON.stringify([{ label: 'Grupo A', weight: 50 }, { label: 'Grupo B', weight: 50 }]) },
  languageRouter: { fallback: 'Português' },
  adCondition: { adIds: '123' },
  waiting_time: { waiting_time: '5' },
  aiAgentBlock: { generative_ai: 'agente-ia-1', generativeAiName: 'Assistente', exits: JSON.stringify([{ name: 'Resolvido', when: 'Quando o contato confirmar a solução' }]) },
  OpenAI: { aiModel: 'modelo-ia-1', 'df-OpenAI': 'ChatGPT' },
  googleSheetsAppend: { spreadsheet: 'planilha-1', sheetName: 'Contatos', columns: JSON.stringify({ Nome: '{{nome}}', Telefone: '{{telefone}}' }) },
  rdStationConversion: { conversionIdentifier: 'chatbot', email: '{{email}}' },
  hubspotUpsertContact: { email: '{{email}}' },
  multiple_condicional_api: { conditions: JSON.stringify([{ var: 'plano', value: 'ouro' }, { var: 'plano', value: 'prata' }]) },
  Data_Input_Condicional: { field: 'campo_teste' },
  External_Message_Http: { url_api: 'https://example.com/mensagem' },
  condicional_api: { condition: 'Igual a', key: 'status', value: 'ativo' },
  Send_DataStore: { url_api: 'https://example.com/datastore' },
  Local_DataStore: { local_datastore: 'Contato' },
  envio_boletos: { channel: 'Enviar todos', text: 'Seus boletos.', url_list: 'https://example.com/boletos', url_send: 'https://example.com/boletos/envio' },
  api_options_menu: { message: 'Escolha uma opção.', apiUrl: 'https://example.com/opcoes', variableName: 'opcao' },
  Consent: {},
  sendConversion: { eventName: 'Lead', value: '99,90' },
  trackEvent: { eventName: 'cadastro_concluido', numericValue: '10' },
  tabulation: { tabulacao: 'tab-1', tabulacaoName: 'Venda concluída' },
}

const DYNAMIC_LABELS = {
  envio_mensagem: ['Primeira opção', 'Segunda opção'],
  randomizer: ['Grupo A', 'Grupo B'],
  multiple_condicional_api: ['plano = ouro', 'plano = prata'],
  aiAgentBlock: ['Resolvido', 'Sem conclusão'],
}

const typeLabels = type => DYNAMIC_LABELS[type] ?? getDefinition(type).outputLabels

function allTypes() {
  const nodes = [node('inicio', START_TYPE)]
  const edges = []
  let spare = 0
  const terminal = () => {
    const type = TERMINALS[spare % TERMINALS.length]
    const id = `fim_${++spare}`
    nodes.push(node(id, type, FULL[type]))
    return id
  }
  let previous = 'inicio'
  let previousType = START_TYPE
  const chained = componentCatalog.map(entry => entry.nativeType).filter(type => type !== START_TYPE && type !== 'note' && !TERMINALS.includes(type))
  for (const type of chained) {
    const id = type === 'envio_mensagem' ? 'menu' : `n_${type.toLowerCase()}`
    nodes.push(node(id, type, FULL[type]))
    edges.push(edge(previous, typeLabels(previousType)[0], id))
    for (const label of typeLabels(type).slice(1)) edges.push(edge(id, label, terminal()))
    previous = id
    previousType = type
  }
  edges.push(edge(previous, typeLabels(previousType)[0], terminal()))
  nodes.push(node('nota', 'note', FULL.note))
  return flowOf(nodes, edges, { name: 'Todos os componentes' })
}

function overlap(flow) {
  const boxes = flow.nodes.map(entry => ({ id: entry.id, x: entry.position.x, y: entry.position.y, ...layoutBox(entry) }))
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) {
      const a = boxes[first]
      const b = boxes[second]
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) return [a.id, b.id]
    }
  }
  return null
}

function walkSchema(schema, visit, trail = '') {
  visit(schema, trail)
  for (const [key, value] of Object.entries(schema.properties ?? {})) walkSchema(value, visit, `${trail}.${key}`)
  if (schema.items) walkSchema(schema.items, visit, `${trail}[]`)
}

test('the RI covers the 62 catalog types and the guide describes every one of them', () => {
  const types = componentCatalog.map(entry => entry.nativeType)
  assert.equal(RI_TYPES.length, 62)
  assert.deepEqual([...RI_TYPES].sort(), [...types].sort())
  assert.deepEqual(Object.keys(COMPONENT_GUIDE).sort(), [...types].sort())
  for (const definition of componentCatalog) {
    const type = definition.nativeType
    const guide = COMPONENT_GUIDE[type]
    const accepted = acceptedKeys(type)
    assert.ok(guide.does.length > 10, type)
    for (const key of [...(guide.required ?? []), ...(guide.platform ?? [])]) assert.ok(accepted.includes(key), `${type}.${key}`)
    if (definition.outputRule) {
      assert.ok(guide.dynamic, type)
      assert.equal(guide.outputs, undefined, type)
    } else {
      assert.equal(guide.dynamic, undefined, type)
      assert.equal((guide.outputs ?? []).length, definition.outputLabels.length, type)
    }
    for (const field of definition.fields ?? []) {
      const platformData = field.kind === 'url' || /cadastrad[oa] na plataforma/.test(field.placeholder ?? '')
      if (platformData) assert.ok(guide.platform?.includes(field.key), `${type}.${field.key} deve ser dado da plataforma`)
    }
  }
})

test('the RI schema is portable: strict objects, every property required, no unions, no formats and the 62 types as an enum', () => {
  const { jsonSchema } = zodSchema(riSchema)
  const forbidden = ['anyOf', 'oneOf', 'allOf', '$ref', 'not', 'format', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'default', 'nullable', 'const']
  let objects = 0
  walkSchema(jsonSchema, (schema, trail) => {
    for (const key of forbidden) assert.equal(schema[key], undefined, `${trail} ${key}`)
    if (schema.type === 'object') {
      objects++
      assert.equal(schema.additionalProperties, false, trail)
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), trail)
    }
  })
  assert.equal(objects, 4)
  assert.deepEqual(jsonSchema.properties.nodes.items.properties.type.enum, RI_TYPES)
  assert.ok(JSON.stringify(jsonSchema).length < 3000)
  assert.equal(RI_SCHEMA_NAME, 'fluxo_ri')
  assert.ok(RI_SCHEMA_DESCRIPTION.length > 10)
  assert.equal(riSchema.safeParse({ name: 'x', description: '', nodes: [{ id: 'a', type: 'inventado', config: [] }], edges: [] }).success, false)
  for (const example of PROMPT_EXAMPLES) assert.equal(riSchema.safeParse(example.ri).success, true, example.title)
})

test('the official provider packages send the RI schema as strict structured output', async () => {
  const run = async (factory, provider, model) => {
    let request
    const fetch = async (url, init) => {
      request = { url: String(url), body: JSON.parse(init.body) }
      return new Response(JSON.stringify({ error: { message: 'chave inválida', type: 'authentication_error' } }), { status: 401, headers: { 'content-type': 'application/json' } })
    }
    const result = streamObject({ model: factory(fetch)(model), schema: riSchema, schemaName: RI_SCHEMA_NAME, schemaDescription: RI_SCHEMA_DESCRIPTION, prompt: 'Teste', maxRetries: 0, providerOptions: RI_PROVIDER_OPTIONS[provider], onError: () => undefined })
    await assert.rejects(result.object)
    return request
  }
  const schema = zodSchema(riSchema).jsonSchema
  const openai = await run(fetch => createOpenAI({ apiKey: 'teste-openai', fetch }).responses, 'openai', defaultModel('openai').id)
  assert.equal(openai.url, 'https://api.openai.com/v1/responses')
  assert.equal(openai.body.text.format.type, 'json_schema')
  assert.equal(openai.body.text.format.strict, true)
  assert.deepEqual(openai.body.text.format.schema, schema)
  const anthropic = await run(fetch => createAnthropic({ apiKey: 'teste-anthropic', fetch }), 'anthropic', 'claude-sonnet-5-5')
  assert.equal(anthropic.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(anthropic.body.output_config.format.type, 'json_schema')
  assert.equal(anthropic.body.tools, undefined)
  assert.equal(anthropic.body.tool_choice, undefined)
  const google = await run(fetch => createGoogleGenerativeAI({ apiKey: 'teste-google', fetch }), 'google', defaultModel('google').id)
  assert.ok(google.url.startsWith(`https://generativelanguage.googleapis.com/v1beta/models/${defaultModel('google').id}:streamGenerateContent`))
  assert.equal(google.body.generationConfig.responseMimeType, 'application/json')
  assert.deepEqual(google.body.generationConfig.responseSchema.properties.nodes.items.properties.type.enum, RI_TYPES)
  assert.ok(!JSON.stringify(google.body.generationConfig.responseSchema).includes('additionalProperties'))
  const xai = await run(fetch => createXai({ apiKey: 'teste-xai', fetch }), 'xai', defaultModel('xai').id)
  assert.equal(xai.url, 'https://api.x.ai/v1/chat/completions')
  assert.equal(xai.body.response_format.json_schema.strict, true)
  assert.deepEqual(xai.body.response_format.json_schema.schema, schema)
})

test('a RI with the 62 types becomes a valid Atendimento flow that exports and reimports byte for byte', () => {
  const ri = allTypes()
  assert.equal(new Set(ri.nodes.map(entry => entry.type)).size, 62)
  const assembled = assemble(ri)
  const { flow } = assembled
  assert.equal(new Set(flow.nodes.map(entry => entry.data.type)).size, 62)
  assert.deepEqual(assembled.notes, [])
  assert.deepEqual(validateFlow(flow), [
    { severity: 'warning', message: API_WARNING, nodeId: assembled.platformIds.get('n_solicitar_dados') },
    { severity: 'warning', message: API_WARNING, nodeId: assembled.platformIds.get('n_consulta_api') },
  ])
  const issues = reviewFlow(assembled)
  assert.deepEqual(issues.map(issue => [issue.severity, issue.scope, issue.riId]), [['warning', 'plataforma', 'n_solicitar_dados'], ['warning', 'plataforma', 'n_consulta_api']])
  assert.deepEqual(correctionItems(assembled, issues), [])
  assert.deepEqual(scoreOf(issues), [0, 0, 2])

  const text = exportFlow(flow)
  assert.deepEqual(JSON.parse(text), flow)
  const imported = importFlow(text)
  assert.deepEqual(imported, flow)
  assert.equal(exportFlow(imported), text)
  assert.equal(exportFlow(importFlow(exportFlow(stampExport(imported, NOW)))), exportFlow(stampExport(flow, NOW)))

  assert.deepEqual(flow.nodes.map(entry => entry.id), ['inicio', ...flow.nodes.slice(1).map((_, index) => String(index + 2))])
  for (const entry of JSON.parse(text).nodes) {
    assert.deepEqual(Object.keys(entry), entry.id === START_ID ? START_KEYS : NODE_KEYS, entry.id)
    assert.deepEqual(entry.measured, getDefinition(entry.data.type).measured, entry.id)
  }
  for (const entry of flow.edges) {
    assert.deepEqual(Object.keys(entry), EDGE_KEYS)
    assert.equal(entry.id, `xy-edge__${entry.source}${entry.sourceHandle}-${entry.target}`)
  }
  assert.equal(overlap(flow), null)
  assert.equal(flow.name, 'Todos os componentes')
  assert.equal(flow.service_type, 'chat')
  assert.equal(flow.created_at, NOW.toISOString())

  const data = riId => byRi(assembled, riId).data.data
  assert.deepEqual(data('n_timeconditions').timeRules, [{ id: `rule-${NOW.getTime()}`, weekDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '08:00', endTime: '18:00' }])
  assert.equal(data('n_solicitar_dados').channel, 'other')
  assert.equal(data('n_solicitar_dados').curl, "curl -X POST 'https://example.com/api' \\\n  -d '{\"pedido\":\"{{input}}\"}'")
  assert.equal(data('n_solicitar_dados').isApiValidated, false)
  assert.deepEqual(Object.keys(data('n_consulta_api')), Object.keys(getDefinition('consulta_api').configured()))
  assert.deepEqual([data('n_envio_arquivo').filename, data('n_envio_arquivo').mime_type], ['relatorio.pdf', 'application/pdf'])
  assert.deepEqual([data('n_envio_imagem').url, data('n_envio_imagem').filename], ['https://example.com/imagens/banner.png', 'banner.png'])
  assert.deepEqual([data('n_waiting_time').waiting_time, data('n_waiting_time').id], ['5000', '5000'])
  assert.deepEqual([data('n_tabulation').id, data('n_tabulation').tabulation], ['tab-1', 'tab-1'])
  assert.equal(data('n_local_datastore').local_datastore, 'contact')
  assert.equal(data('n_envio_boletos').channel, 'Enviar Todos')
  assert.equal(data('n_sendconversion').value, '99.90')
  assert.equal(data('n_languagerouter').fallback, 'pt')
  assert.equal(data('n_waitforanswer').logToActivity, true)
  assert.deepEqual(data('n_apptservice').selectedIds, ['servico-1', 'servico-2'])
  assert.deepEqual(data('n_googlesheetsappend').columns, [{ header: 'Nome', value: '{{nome}}' }, { header: 'Telefone', value: '{{telefone}}' }])
  const back = flow.nodes.find(entry => entry.data.type === 'voltar').data.data
  const menu = byRi(assembled, 'menu')
  assert.deepEqual(back, { id: menu.id, targetNodeId: menu.id, availableNodes: [{ id: menu.id, value: menu.id, name: 'Escolha uma opção' }], targetNodeName: 'Escolha uma opção', title: '', description: '' })
})

test('every mirrored field is copied to its platform keys', () => {
  const mirrored = componentCatalog.flatMap(definition => (definition.fields ?? []).filter(field => field.mirror).map(field => [definition.nativeType, field]))
  assert.equal(mirrored.length, 12)
  const assembled = assemble(allTypes())
  for (const [type, field] of mirrored) {
    const target = assembled.flow.nodes.find(entry => entry.data.type === type)
    for (const key of mirrorKeys(field)) assert.deepEqual(target.data.data[key], target.data.data[field.key], `${type}.${key}`)
  }
})

test('values become the platform type of each field kind', () => {
  assert.deepEqual(Object.values(configure('apptCustomerIntake', { askName: 'não', askEmail: 'Sim', askNotes: '1' }).data).slice(0, 3), [false, true, true])
  assert.equal(configure('languageRouter', { fallback: 'ESPANHOL' }).data.fallback, 'es')
  assert.equal(configure('envio_mensagem', { title: 'Menu', options: '["A","B"]', buttons: 'Sim' }).data.buttons, 'true')
  assert.equal(configure('solicitar_dados', { channel: 'cpf/cnpj' }).data.channel, 'CPF/CNPJ')
  for (const [text, value] of [['5', '5000'], ['5s', '5000'], ['30 segundos', '30000'], ['2 minutos', '120000'], ['15000', '15000']]) {
    const { data } = configure('waiting_time', { waiting_time: text })
    assert.deepEqual([data.waiting_time, data.id], [value, value], text)
  }
  assert.deepEqual([configure('aiAgentBlock', { maxTurns: '8', timeoutMinutes: '30' }).data.maxTurns, configure('aiAgentBlock', { timeoutMinutes: '30' }).data.timeoutMinutes], [8, 30])
  assert.equal(configure('webchatHandoff', { ttlHours: '48' }).data.ttlHours, 48)
  assert.equal(configure('sendConversion', { value: 'R$ 1.299,90' }).data.value, '1299.90')
  assert.equal(configure('whatsappCall', { ttlMinutes: '45' }).data.ttlMinutes, '45')
  assert.equal(configure('trackEvent', { numericValue: '-2,5' }).data.numericValue, '-2.5')

  const api = configure('consulta_api', { url_api: 'api.exemplo.com/v1/clientes', api_test_values: '{"cpf":"123"}', headers: '{"Authorization":"Bearer x"}', response_map: '[{"path":"cliente.nome","variable":"{{nome cliente}}"}]' })
  assert.equal(api.data.url_api, 'https://api.exemplo.com/v1/clientes')
  assert.deepEqual(api.data.api_test_values, { cpf: '123' })
  assert.deepEqual(api.data.headers, [{ Authorization: 'Bearer x' }])
  assert.deepEqual(api.data.response_map, [{ path: 'cliente.nome', key: '', sample: '', variable: 'nome_cliente' }])
  assert.deepEqual(configure('apptLocation', { selectedIds: '["local-1", 2]' }).data.selectedIds, ['local-1', '2'])
  assert.deepEqual(configure('apptProvider', { selectedIds: 'prof-1;prof-2' }).data.selectedIds, ['prof-1', 'prof-2'])
  assert.deepEqual(configure('templateMessage', { templateParams: '"[\\"nome\\"]"' }).data.templateParams, ['nome'])

  const rules = configure('timeConditions', { timeRules: JSON.stringify([{ dias: ['sábado', 'domingo'], inicio: '9h', fim: '13h30' }, { weekDays: 'seg-sex', startTime: '08:00:00', endTime: '24:00' }]) }).data.timeRules
  assert.deepEqual(rules, [
    { id: 'rule-1', weekDays: ['saturday', 'sunday'], startTime: '09:00', endTime: '13:30' },
    { id: 'rule-2', weekDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '08:00', endTime: '23:59' },
  ])
  assert.deepEqual(daysOf(['terça-feira e quinta-feira', 'Sexta a Domingo']), ['tuesday', 'thursday', 'friday', 'saturday', 'sunday'])
  assert.deepEqual(daysOf('todos os dias'), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  assert.equal(daysOf(['funday']), undefined)
  assert.deepEqual(['8', '8h', '18h30', '7:5', '25:00'].map(timeOf), ['08:00', '08:00', '18:30', undefined, undefined])

  assert.deepEqual(configure('randomizer', { paths: '["Controle","Variação 1","Variação 2"]' }).data.paths, [{ label: 'Controle', weight: 33 }, { label: 'Variação 1', weight: 33 }, { label: 'Variação 2', weight: 34 }])
  assert.deepEqual(configure('randomizer', { paths: '[{"nome":"A","peso":"1"},{"nome":"B","peso":3}]' }).data.paths, [{ label: 'A', weight: 25 }, { label: 'B', weight: 75 }])
  assert.deepEqual(configure('randomizer', { paths: '{"A":"70%","B":null}' }).data.paths, [{ label: 'A', weight: 70 }, { label: 'B', weight: 30 }])
  assert.deepEqual(balanceWeights([1, 1, 1]), [34, 33, 33])
  assert.deepEqual(balanceWeights([0, 0]), [50, 50])
  assert.deepEqual(balanceWeights([60, undefined, undefined]), [60, 20, 20])

  assert.deepEqual(configure('aiAgentBlock', { exits: '["Resolvido",{"nome":"Transferir","quando":"Pedido de atendente","requireFields":"sim"}]' }).data.exits, [
    { name: 'Resolvido', when: '', requireFields: false },
    { name: 'Transferir', when: 'Pedido de atendente', requireFields: true },
  ])
  assert.deepEqual(configure('googleSheetsAppend', { columns: '[{"coluna":"Data","valor":"{{DATE_TIME_BRAZIL}}"}]' }).data.columns, [{ header: 'Data', value: '{{DATE_TIME_BRAZIL}}' }])

  assert.equal(configure('envio_pergunta', { template: '"Olá\\nTudo bem?"' }).data.template, 'Olá\nTudo bem?')
  assert.equal(configure('envio_pergunta', { template: '  Linha 1\\nLinha 2  ' }).data.template, 'Linha 1\nLinha 2')
  assert.equal(configure('apptService', { outputVar: '{{servico escolhido}}' }).data.outputVar, 'servico_escolhido')
  assert.equal(configure('randomizer', { variable: '@@@grupo' }).data.variable, 'grupo')
  assert.equal(configure('condicional_api', { key: '{{status}}' }).data.key, 'status')
  assert.equal(configure('apptService', { outputVar: '   ' }).data.outputVar, 'appt_serviceId')
  assert.equal(configure('webchatHandoff', { message: 'Continue pelo chat do site.' }).data.message, 'Continue pelo chat do site.')
})

test('invalid values keep the default and explain the accepted format', () => {
  const cases = [
    ['apptCustomerIntake', { askName: 'talvez' }, 'askName', true, 'O valor “talvez” não vale para “Pedir nome” (askName) e o padrão foi mantido. Use “true” ou “false”.'],
    ['languageRouter', { fallback: 'francês' }, 'fallback', 'pt', 'O valor “francês” não vale para “Idioma padrão” (fallback) e o padrão foi mantido. Use “pt” (Português), “en” (Inglês), “es” (Espanhol).'],
    ['crmActivity', { dueInDays: '-1' }, 'dueInDays', 1, 'O valor “-1” não vale para “Prazo em dias” (dueInDays) e o padrão foi mantido. Use um número inteiro a partir de 0.'],
    ['aiAgentBlock', { maxTurns: '2,5' }, 'maxTurns', 15, 'O valor “2,5” não vale para “Máximo de turnos” (maxTurns) e o padrão foi mantido. Use um número inteiro a partir de 0.'],
    ['whatsappCall', { ttlMinutes: 'meia hora' }, 'ttlMinutes', '', 'O valor “meia hora” não vale para “Validade do botão (minutos)” (ttlMinutes) e o padrão foi mantido. Use um número inteiro a partir de 1.'],
    ['consulta_api', { api_test_values: '[1,2]' }, 'api_test_values', {}, 'O valor “[1,2]” não vale para “Valores de teste” (api_test_values) e o padrão foi mantido. Use um objeto JSON.'],
    ['solicitar_dados', { headers: 'Authorization: x' }, 'headers', [], 'O valor “Authorization: x” não vale para “Cabeçalhos” (headers) e o padrão foi mantido. Use uma lista JSON.'],
    ['envio_arquivo', { url: 'ftp://arquivos/x.pdf' }, 'url', '', 'O valor “ftp://arquivos/x.pdf” de “URL do arquivo” (url) não é uma URL http(s) e foi descartado.'],
    ['waiting_time', { waiting_time: '90 segundos' }, 'waiting_time', '', null],
  ]
  for (const [type, config, key, value, message] of cases) {
    const { data, notes } = configure(type, config)
    assert.deepEqual(data[key], value, `${type}.${key}`)
    assert.equal(notes.length, 1, `${type}.${key}`)
    assert.equal(notes[0].level, 'warning')
    if (message) assert.equal(notes[0].message, message)
  }
  const rules = configure('timeConditions', { timeRules: '[{"weekDays":["funday"],"startTime":"08:00","endTime":"18:00"}]' })
  assert.equal(rules.data.timeRules.length, 1)
  assert.deepEqual(rules.data.timeRules[0].weekDays, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  assert.match(rules.notes[0].message, /^O valor “.+” não vale para “Horários de atendimento” \(timeRules\) e o padrão foi mantido\. Use uma lista JSON de regras/)
})

test('unknown keys are discarded with a warning that lists the accepted keys', () => {
  const message = configure('envio_pergunta', { texto: 'Olá', Template: 'Oi', mensagem: 'x' })
  assert.deepEqual(message.data, { envio_pergunta: '', template: 'Oi' })
  assert.deepEqual(message.notes, [{ level: 'warning', message: 'As chaves “texto”, “mensagem” não existem e foram descartadas. Chaves aceitas: template.' }])
  const finish = configure('finalizar', { message: 'Tchau' })
  assert.deepEqual(finish.data, { message: '', 'df-channel': '' })
  assert.deepEqual(finish.notes.map(note => note.message), ['A chave “message” não existe e foi descartada. Este componente não tem chaves.'])
  const department = configure('departamentos', { id: 'outro', departamento: 'dep-9', name: 'Vendas', curl: 'x' })
  assert.deepEqual(department.notes, [])
  assert.deepEqual(department.data, { departamentos: '', 'df-channel': '', id: 'dep-9', departamento: 'dep-9', name: 'Vendas', enabled: true, userManager: null })
  const fixed = configure('consulta_api', { method: 'GET', url_api: 'https://example.com/x' })
  assert.deepEqual([fixed.data.method, fixed.notes.length], ['POST', 0])
  assert.deepEqual(fixedKeys('consulta_api'), ['method'])
  assert.ok(!acceptedKeys('consulta_api').includes('method'))

  const assembled = assemble(flowOf([node('a', 'envio_pergunta', { texto: 'Olá' }), node('b', 'componente_inventado', { x: '1' }), node('c', 'finalizar')], [edge('inicio', '', 'a'), edge('a', '', 'c')]))
  assert.deepEqual(noteMessages(assembled), [
    'A chave “texto” não existe e foi descartada. Chaves aceitas: template.',
    'O tipo “componente_inventado” não existe e o componente “b” foi descartado.',
  ])
  assert.deepEqual(assembled.flow.nodes.map(entry => entry.data.type), [START_TYPE, 'envio_pergunta', 'finalizar'])
  assert.deepEqual(correctionItems(assembled, reviewFlow(assembled)), [
    '[a] Enviar Mensagem: Preencha a mensagem.',
    '[a] Enviar Mensagem: A chave “texto” não existe e foi descartada. Chaves aceitas: template.',
    '[b] O tipo “componente_inventado” não existe e o componente “b” foi descartado.',
  ])
})

test('the base shape follows the platform: configured when any key is filled, default otherwise', () => {
  for (const definition of componentCatalog.filter(entry => entry.configured)) {
    const type = definition.nativeType
    const empty = configure(type, {})
    const expected = type === 'voltar' ? definition.configured() : definition.defaults()
    assert.deepEqual(Object.keys(empty.data), Object.keys(expected), type)
  }
  assert.deepEqual(Object.keys(configure('condicional_api', { key: 'status' }).data), ['condition', 'key', 'value'])
  assert.deepEqual(Object.keys(configure('waitForAnswer', { customFields: 'empresa' }).data), ['mask', 'customfields', 'customFields', 'logToActivity', 'autoSaveContact'])
  assert.deepEqual(Object.keys(configure('flow', { flowName: 'Pós-venda' }).data), ['id', 'targetFlow', 'flowName', 'flowDescription'])
  const menu = configure('envio_mensagem', { title: 'Escolha', options: '["A","B","C","D"]' }).data
  assert.deepEqual(Object.keys(menu), ['message', 'buttons', 'df-channel', 'opt-1', 'text-1', 'description-1', 'title', 'opt-2', 'text-2', 'description-2', 'opt-3', 'text-3', 'description-3', 'opt-4', 'text-4', 'description-4'])
  assert.deepEqual([menu['opt-1'], menu['opt-4'], menu['text-4']], ['1', '4', 'D'])
  const conditions = configure('multiple_condicional_api', { conditions: '["plano = ouro","{{idade}}: 30"]' }).data
  assert.deepEqual(conditions, { 'var-1': 'plano', 'value-1': 'ouro', 'var-2': 'idade', 'value-2': '30' })
})

test('dynamic outputs follow menu options, conditions, weighted paths and agent exits', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Escolha um assunto', options: JSON.stringify([{ text: 'Planos', description: 'Conheça os planos' }, 'Suporte', { titulo: 'Financeiro' }]) }),
    node('cond', 'multiple_condicional_api', { conditions: JSON.stringify([{ variable: '{{plano}}', value: 'ouro' }, 'plano = prata']) }),
    node('ab', 'randomizer', { paths: JSON.stringify({ 'Versão A': 70, 'Versão B': 30 }) }),
    node('agente', 'aiAgentBlock', { generative_ai: 'agente-1', generativeAiName: 'Vendas', exits: JSON.stringify([{ name: 'Venda', when: 'Quando comprar' }, { name: 'Dúvida', when: 'Quando perguntar' }]) }),
    ...['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'].map(id => node(id, 'finalizar')),
  ], [
    edge('inicio', '', 'menu'),
    edge('menu', 'Planos', 'cond'),
    edge('menu', 'suporte', 'ab'),
    edge('menu', 'FINANCEIRO', 'agente'),
    edge('cond', 'plano = ouro', 'f1'),
    edge('cond', 'Condição 2', 'f2'),
    edge('ab', 'Versão A', 'f3'),
    edge('ab', 'versao b', 'f4'),
    edge('agente', 'Venda', 'f5'),
    edge('agente', 'dúvida', 'f6'),
    edge('agente', 'Sem conclusão', 'f7'),
  ])
  const assembled = assemble(ri)
  assert.deepEqual(assembled.notes, [])
  assert.deepEqual(labelsOf(byRi(assembled, 'menu')), ['Planos', 'Suporte', 'Financeiro'])
  assert.equal(byRi(assembled, 'menu').data.data['description-1'], 'Conheça os planos')
  assert.deepEqual(labelsOf(byRi(assembled, 'cond')), ['plano = ouro', 'plano = prata'])
  assert.deepEqual(labelsOf(byRi(assembled, 'ab')), ['Versão A', 'Versão B'])
  assert.deepEqual(byRi(assembled, 'ab').data.data.paths, [{ label: 'Versão A', weight: 70 }, { label: 'Versão B', weight: 30 }])
  assert.deepEqual(labelsOf(byRi(assembled, 'agente')), ['Venda', 'Dúvida', 'Sem conclusão'])
  const handles = [['menu', 'cond'], ['menu', 'ab'], ['menu', 'agente'], ['cond', 'f1'], ['cond', 'f2'], ['ab', 'f3'], ['ab', 'f4'], ['agente', 'f5'], ['agente', 'f6'], ['agente', 'f7']]
  assert.deepEqual(handles.map(([from, to]) => linkOf(assembled, from, to).sourceHandle), ['output-0', 'output-1', 'output-2', 'output-0', 'output-1', 'output-0', 'output-1', 'output-0', 'output-1', 'output-2'])
  assert.deepEqual(errorsOf(assembled.flow), [])
  assert.deepEqual(issueMessages(reviewFlow(assembled)), [])

  const indexed = assemble(flowOf([node('menu', 'envio_mensagem', { title: 'Escolha', 'text-2': 'Segunda', 'text-1': 'Primeira', 'description-1': 'Detalhe', 'opt-1': '9' })], []))
  const menuData = byRi(indexed, 'menu').data.data
  assert.deepEqual([menuData['opt-1'], menuData['text-1'], menuData['description-1'], menuData['opt-2'], menuData['text-2']], ['1', 'Primeira', 'Detalhe', '2', 'Segunda'])

  const crowded = assemble(flowOf([node('menu', 'envio_mensagem', { title: 'Escolha', buttons: 'true', options: JSON.stringify(Array.from({ length: 12 }, (_, index) => `Item ${index + 1}`)) })], []))
  const crowdedNode = byRi(crowded, 'menu')
  assert.equal(outputHandles(crowdedNode).length, 10)
  assert.equal(crowdedNode.data.data.buttons, 'false')
  assert.ok(noteMessages(crowded).includes('O menu aceita até 10 opções; 2 foram descartadas.'))
  const buttons = assemble(flowOf([node('menu', 'envio_mensagem', { title: 'Escolha', buttons: 'true', options: '["A","B","C"]' })], []))
  assert.equal(byRi(buttons, 'menu').data.data.buttons, 'true')
  const many = configure('multiple_condicional_api', { conditions: JSON.stringify(Array.from({ length: 22 }, (_, index) => ({ var: 'faixa', value: String(index) }))) })
  assert.equal(Object.keys(many.data).length, 40)
  assert.deepEqual(many.notes.map(note => note.message), ['A Múltipla Condição aceita até 20 condições; 2 foram descartadas.'])
})

test('connections resolve outputs by index, by label and by name, and report what cannot be linked', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["A","B","C"]' }),
    node('api', 'consulta_api', { url_api: 'https://example.com/api' }),
    node('ok', 'envio_pergunta', { template: 'Tudo certo.' }),
    node('erro', 'envio_pergunta', { template: 'Não foi possível consultar.' }),
    node('b', 'envio_pergunta', { template: 'Opção B.' }),
    node('c', 'envio_pergunta', { template: 'Opção C.' }),
    node('fim_ok', 'finalizar'),
    node('fim_erro', 'finalizar'),
    node('fim_b', 'finalizar'),
    node('fim_c', 'finalizar'),
    node('nota', 'note', { text: 'Lembrete.' }),
  ], [
    edge('Inicio', 'Próximo', 'MENU'),
    edge('menu', '1', 'api'),
    edge('menu', 'output-1', 'b'),
    edge('menu', 'Opção 3', 'c'),
    edge('api', 'SUCESSO', 'ok'),
    edge('api', 'falha', 'erro'),
    edge('ok', '', 'fim_ok'),
    edge('erro', 'próximo', 'fim_erro'),
    edge('b', '1', 'fim_b'),
    edge('c', 'output-0', 'fim_c'),
    edge('api', 'OK', 'fim_ok'),
    edge('api', '', 'fim_ok'),
    edge('menu', 'A', 'erro'),
    edge('ok', '', 'ok'),
    edge('ok', '', 'inicio'),
    edge('nota', '', 'ok'),
    edge('ok', '', 'nota'),
    edge('fim_ok', '', 'ok'),
    edge('fantasma', '', 'ok'),
    edge('ok', '', 'fantasma'),
    edge('api', '3', 'fim_ok'),
  ])
  const assembled = assemble(ri)
  const handle = (from, to) => linkOf(assembled, from, to)?.sourceHandle
  assert.deepEqual([handle('menu', 'api'), handle('menu', 'b'), handle('menu', 'c')], ['output-0', 'output-1', 'output-2'])
  assert.deepEqual([handle('api', 'ok'), handle('api', 'erro')], ['output-1', 'output-0'])
  assert.deepEqual([handle('ok', 'fim_ok'), handle('erro', 'fim_erro'), handle('b', 'fim_b'), handle('c', 'fim_c')], ['output-0', 'output-0', 'output-0', 'output-0'])
  assert.equal(assembled.flow.edges[0].id, 'xy-edge__iniciooutput-0-2')
  assert.deepEqual(noteMessages(assembled), [
    'A conexão para “fim_ok” foi descartada: a saída “OK” não existe. Saídas: “Falha”, “Sucesso”.',
    'A conexão para “fim_ok” foi descartada: informe a saída. Saídas: “Falha”, “Sucesso”.',
    'A conexão para “erro” foi descartada: a saída “A” já está ligada a “api”.',
    'A conexão para “ok” foi descartada: um componente não se liga a ele mesmo.',
    'A conexão para “inicio” foi descartada: nada se liga ao Iniciar Fluxo.',
    'A conexão para “ok” foi descartada: Nota nunca é ligada.',
    'A conexão para “nota” foi descartada: Nota nunca é ligada.',
    'A conexão para “ok” foi descartada: Encerrar Conversa não tem saídas e encerra o caminho.',
    'A conexão de “fantasma” para “ok” foi descartada: o id “fantasma” não existe.',
    'A conexão para “fantasma” foi descartada: o id “fantasma” não existe.',
    'A conexão para “fim_ok” foi descartada: a saída “3” não existe. Saídas: “Falha”, “Sucesso”.',
  ])
  assert.deepEqual(assembled.notes.map(note => note.riId), ['api', 'api', 'menu', 'ok', 'ok', 'nota', 'ok', 'fim_ok', undefined, 'ok', 'api'])
  assert.deepEqual(errorsOf(assembled.flow), [])
  assert.equal(assembled.flow.edges.length, 10)
})

test('the start is linked automatically, accepts an explicit start and keeps a single one', () => {
  const automatic = assemble(flowOf([node('nota', 'note', { text: 'x' }), node('boas_vindas', 'envio_pergunta', { template: 'Olá.' }), node('fim', 'finalizar')], [edge('boas_vindas', '', 'fim')]))
  assert.deepEqual(automatic.flow.edges.map(entry => [entry.source, entry.target]), [['inicio', '3'], ['3', '4']])
  assert.deepEqual(automatic.notes, [])
  assert.deepEqual(errorsOf(automatic.flow), [])

  const cycle = assemble(flowOf([node('menu', 'envio_mensagem', { title: 'Escolha', options: '["Repetir"]' }), node('msg', 'envio_pergunta', { template: 'Ok.' })], [edge('menu', 'Repetir', 'msg'), edge('msg', '', 'menu')]))
  assert.equal(cycle.flow.edges[0].source, START_ID)
  assert.equal(cycle.flow.edges[0].target, cycle.platformIds.get('menu'))

  const explicit = assemble(flowOf([node('comeco', START_TYPE), node('a', 'envio_pergunta', { template: 'Olá.' }), node('b', 'finalizar')], [edge('comeco', '', 'a'), edge('a', '', 'b')]))
  assert.deepEqual(explicit.flow.nodes.map(entry => entry.id), ['inicio', '2', '3'])
  assert.deepEqual(explicit.flow.edges.map(entry => entry.id), ['xy-edge__iniciooutput-0-2', 'xy-edge__2output-0-3'])
  assert.deepEqual(explicit.notes, [])
  assert.equal(explicit.platformIds.get('comeco'), START_ID)

  const twice = assemble(flowOf([node('inicio', START_TYPE), node('outro', START_TYPE), node('a', 'envio_pergunta', { template: 'Olá.' }), node('b', 'finalizar')], [edge('start', '', 'a'), edge('a', '', 'b')]))
  assert.deepEqual(noteMessages(twice), ['O fluxo tem um único início; o componente “outro” foi descartado.'])
  assert.deepEqual(twice.flow.nodes.filter(entry => entry.data.type === START_TYPE).map(entry => entry.id), ['inicio'])
  assert.deepEqual(errorsOf(twice.flow), [])

  const taken = assemble(flowOf([node('inicio', 'envio_pergunta', { template: 'Olá.' }), node('fim', 'finalizar')], [edge('inicio', '', 'inicio_2'), edge('inicio_2', '', 'fim')]))
  assert.deepEqual(noteMessages(taken), ['O id “inicio” já está em uso; este componente passou a usar “inicio_2”.'])
  assert.deepEqual(taken.flow.edges.map(entry => [entry.source, entry.target]), [['inicio', '2'], ['2', '3']])

  const unnamed = assemble(flowOf([node('', 'envio_pergunta', { template: 'Olá.' }), node('c1', 'finalizar')], []))
  assert.deepEqual(noteMessages(unnamed), [
    'O 1º componente veio sem id e passou a usar “c1”.',
    'O id “c1” já está em uso; este componente passou a usar “c1_2”.',
    'O início não estava ligado e foi ligado a “c1”, o componente que alcança mais passos. Revise.',
  ])
})

test('connections back to a menu become Retornar ao Menu and shared endings are cloned', () => {
  const returning = assemble(flowOf([
    node('menu', 'envio_mensagem', { title: 'Menu principal', options: '["Horários","Encerrar"]' }),
    node('horarios', 'envio_pergunta', { template: 'Das 8h às 18h.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Horários', 'horarios'), edge('horarios', '', 'menu'), edge('menu', 'Encerrar', 'fim')]))
  const menu = byRi(returning, 'menu')
  const back = returning.flow.nodes.find(entry => entry.data.type === 'voltar')
  assert.equal(back.id, '5')
  assert.deepEqual(back.data.data, { id: menu.id, targetNodeId: menu.id, availableNodes: [{ id: menu.id, value: menu.id, name: 'Menu principal' }], targetNodeName: 'Menu principal', title: '', description: '' })
  assert.equal(linkOf(returning, 'horarios', 'horarios'), undefined)
  assert.ok(returning.flow.edges.some(entry => entry.source === byRi(returning, 'horarios').id && entry.target === back.id))
  assert.deepEqual(returning.notes.map(note => [note.scope, note.message, note.riId, note.nodeId]), [['ajuste', 'A conexão de volta ao menu “Menu principal” foi trocada por Retornar ao Menu.', 'horarios', '5']])
  assert.deepEqual(validateFlow(returning.flow), [])

  const shared = assemble(flowOf([
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["A","B","C"]' }),
    node('despedida', 'envio_pergunta', { template: 'Até logo.' }),
    node('fim', 'finalizar'),
    node('api', 'consulta_api', { url_api: 'https://example.com/api' }),
  ], [edge('inicio', '', 'menu'), edge('menu', 'A', 'despedida'), edge('menu', 'B', 'despedida'), edge('despedida', '', 'fim'), edge('menu', 'C', 'api'), edge('api', 'Falha', 'despedida')]))
  assert.deepEqual(shared.flow.nodes.map(entry => [entry.id, entry.data.type, shared.riIds.get(entry.id)]), [
    ['inicio', START_TYPE, 'inicio'],
    ['2', 'envio_mensagem', 'menu'],
    ['3', 'envio_pergunta', 'despedida'],
    ['4', 'finalizar', 'fim'],
    ['5', 'consulta_api', 'api'],
    ['6', 'envio_pergunta', 'despedida'],
    ['7', 'finalizar', 'fim'],
    ['8', 'envio_pergunta', 'despedida'],
    ['9', 'finalizar', 'fim'],
  ])
  assert.ok(validateFlow(shared.flow).every(issue => !issue.message.includes('mais de uma conexão')))
  assert.deepEqual(shared.flow.edges.filter(entry => entry.target === '3').length, 1)

  const branching = assemble(flowOf([
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["A","B"]' }),
    node('api', 'consulta_api', { url_api: 'https://example.com/api' }),
    node('ok', 'finalizar'),
    node('erro', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'A', 'api'), edge('menu', 'B', 'api'), edge('api', 'Sucesso', 'ok'), edge('api', 'Falha', 'erro')]))
  const review = reviewFlow(branching)
  assert.ok(review.some(issue => issue.scope === 'ia' && issue.riId === 'api' && issue.message === 'O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.'))
})

test('limits, hints and deterministic fixes keep the flow inside what the platform accepts', () => {
  const crowded = flowOf(Array.from({ length: RI_LIMITS.nodes + 3 }, (_, index) => node(`m${index}`, 'envio_pergunta', { template: `Mensagem ${index}.` })), [])
  const big = assemble(crowded)
  assert.equal(big.flow.nodes.length, RI_LIMITS.nodes + 1)
  assert.ok(noteMessages(big).includes(`O fluxo aceita até ${RI_LIMITS.nodes} componentes; 3 foram descartados.`))
  const wired = assemble(flowOf([node('a', 'envio_pergunta', { template: 'A.' })], Array.from({ length: RI_LIMITS.edges + 2 }, () => edge('inicio', '', 'a'))))
  assert.ok(noteMessages(wired).includes(`O fluxo aceita até ${RI_LIMITS.edges} conexões; 2 foram descartadas.`))

  const longText = 'x'.repeat(RI_LIMITS.value + 50)
  const many = Object.fromEntries(Array.from({ length: RI_LIMITS.configEntries + 1 }, (_, index) => [index === 0 ? 'template' : `extra_${index}`, index === 0 ? longText : 'y']))
  const hinted = assemble(flowOf([node('a', 'envio_pergunta', many), node('fim', 'finalizar')], [edge('a', '', 'fim')]))
  assert.equal(byRi(hinted, 'a').data.data.template.length, RI_LIMITS.value)
  const hints = hinted.notes.filter(note => note.level === 'hint').map(note => note.message)
  assert.deepEqual(hints, [`Só os primeiros ${RI_LIMITS.configEntries} pares de config foram usados.`, `O valor de template passou de ${RI_LIMITS.value} caracteres e foi cortado.`])
  const review = reviewFlow(hinted)
  assert.ok(review.every(issue => !hints.includes(issue.message)))
  const items = correctionItems(hinted, review)
  for (const hint of hints) assert.ok(items.includes(`[a] Enviar Mensagem: ${hint}`), hint)

  const fixes = assemble(flowOf([
    node('chat', 'webchatHandoff', { widgetId: 'widget-1', message: 'Continue pelo chat do site.' }),
    node('audio', 'envio_arquivo', { url: 'https://example.com/audios/aviso%20geral.ogg', voice_note: 'true' }),
    node('foto', 'envio_imagem', { imagem: 'https://example.com/fotos/vitrine.jpg?v=2' }),
    node('ok', 'finalizar'),
    node('erro', 'finalizar'),
    node('fim', 'finalizar'),
  ], [edge('chat', 'Sucesso', 'audio'), edge('chat', 'Falha', 'erro'), edge('audio', '', 'foto'), edge('foto', '', 'fim')]))
  assert.equal(byRi(fixes, 'chat').data.data.message, 'Continue pelo chat do site.\n{{link}}')
  assert.deepEqual([byRi(fixes, 'audio').data.data.filename, byRi(fixes, 'audio').data.data.mime_type, byRi(fixes, 'audio').data.data.voice_note], ['aviso geral.ogg', 'audio/ogg', true])
  assert.deepEqual([byRi(fixes, 'foto').data.data.url, byRi(fixes, 'foto').data.data.filename], ['https://example.com/fotos/vitrine.jpg?v=2', 'vitrine.jpg'])
  assert.deepEqual(validateFlow(fixes.flow).filter(issue => issue.nodeId !== byRi(fixes, 'ok').id), [])
})

test('random and malformed RIs always assemble into importable flows without structural errors', () => {
  let state = 20261011
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const pick = list => list[Math.floor(random() * list.length)]
  const VALUES = ['', 'texto livre', '1', '-3', '2,5', '15', 'sim', 'não', 'talvez', 'true', 'false', '[]', '{}', '[1,2]', '["A","B","C","D"]', '{"a":1}', 'https://example.com/x', 'ftp://x', 'example.com/y', '{{var}}', 'nome cliente', 'null', '[{"label":"A","weight":"x"},{"label":"","weight":-5}]', '[{"name":"","when":3},"Resolvido","Resolvido"]', '[{"weekDays":["mon"],"startTime":"8","endTime":"7"}]', '[{"weekDays":["funday"],"startTime":"8","endTime":"9"}]', 'segunda a sexta', '9999999999', JSON.stringify(Array.from({ length: 15 }, (_, index) => `Opção ${index}`)), '{"Coluna":"{{v}}"}', '["x = 1","y: 2",{"var":"{{z}}","value":"3"}]', 'Igual a', 'Português', '5', '120 segundos', 'Enviar menu', 'contact', 'DD/MM/YYYY', '```json\n["A"]\n```', '"texto entre aspas"']
  const EXTRA_KEYS = ['id', 'curl', 'df-channel', 'opt-3', 'text-12', 'description-2', 'var-2', 'value-5', 'chave_inventada', 'isApiValidated', 'availableNodes', 'message', 'method']
  const TYPES = [...RI_TYPES, 'inventado', 'MENU DE OPÇÕES', 'retornar ao menu', '']
  const OUTPUTS = ['', '1', '2', '3', 'output-0', 'output-5', 'Sucesso', 'Falha', 'Próximo', 'Opção 2', 'xyz', 'Sem conclusão', 'Fora do horário']
  const STRUCTURAL = [
    /^Campo .+: esperado /,
    /não existe neste componente\.$/,
    /tem mais de um destino\.$/,
    /^Este componente não pode receber conexões\.$/,
    /^O componente não pode se conectar a ele mesmo\.$/,
    /^Notas não podem ser conectadas\.$/,
    /único componente Iniciar Fluxo/,
    /^Adicione o componente Iniciar Fluxo\.$/,
    /^O ID deste componente deve ser/,
    /chaves consecutivas/,
    /^O número de opção .+ está repetido\.$/,
    /sem a opção correspondente/,
    /^O menu deve ter de 1 a 10 opções\.$/,
    /deve ser o texto "true" ou "false"\.$/,
    /^Informe uma URL válida/,
    /^Método HTTP inválido/,
    /^Tempo de espera inválido\.$/,
    /informe um peso numérico\.$/,
    /^A soma dos pesos/,
    /^Os pesos somam/,
    /^Saída \d+ do agente inválida/,
    /^Coluna \d+ inválida/,
    /^Regra de horário \d+ inválida\.$/,
    /ID ausente\.$/,
    /dia da semana inválido\.$/,
    /formato HH:MM\.$/,
    /^O campo id deve ser igual/,
    /^Os campos id e tabulation/,
    /^Campo (var|value)-\d+ sem/,
    /^O limite é de 20 condições\.$/,
    /^O máximo de lembretes/,
    /gravado pela plataforma com type/,
    /^Tipo preservado do arquivo/,
    /^Informe só o nome da variável, sem \{\{ \}\}\.$/,
    /^O nome da variável não pode ter espaços\.$/,
    /^A validade do (botão|link)/,
    /^O máximo de turnos/,
    /^O tempo limite deve ser/,
    /^O prazo deve ser/,
    /^Cada item de .+ deve ser um ID em texto\.$/,
  ]
  for (let round = 0; round < 300; round++) {
    const count = 1 + Math.floor(random() * 14)
    const ids = Array.from({ length: count }, (_, index) => (random() < 0.1 ? '' : `n${index}`))
    const nodes = ids.map(id => {
      const type = pick(TYPES)
      const definition = getDefinition(type)
      const keys = [...(definition ? acceptedKeys(type) : []), ...EXTRA_KEYS].filter(() => random() < 0.5)
      return { id, type, config: keys.map(key => ({ key: random() < 0.1 ? key.toUpperCase() : key, value: pick(VALUES) })) }
    })
    const refs = [...ids.filter(Boolean), 'inicio', 'fantasma', '']
    const edges = Array.from({ length: Math.floor(random() * count * 2.5) }, () => edge(pick(refs), pick(OUTPUTS), pick(refs)))
    const ri = flowOf(nodes, edges, { name: random() < 0.2 ? '' : `Fluxo ${round}` })
    const assembled = assemble(ri, { prompt: 'Teste aleatório' })
    const imported = importFlow(JSON.stringify(assembled.flow))
    assert.deepEqual(imported, assembled.flow, `rodada ${round}`)
    for (const issue of validateFlow(assembled.flow)) assert.ok(!STRUCTURAL.some(pattern => pattern.test(issue.message)), `rodada ${round}: ${issue.message}`)
    assert.equal(overlap(assembled.flow), null, `rodada ${round}`)
    const final = finalizeFlow(assembled)
    const reachable = new Set([START_ID])
    for (const id of reachable) for (const entry of final.flow.edges) if (entry.source === id) reachable.add(entry.target)
    for (const issue of validateFlow(final.flow)) {
      assert.ok(!STRUCTURAL.some(pattern => pattern.test(issue.message)), `rodada ${round}: ${issue.message}`)
      if (issue.message.startsWith('Conecte a saída')) assert.ok(!reachable.has(issue.nodeId), `rodada ${round}: ${issue.nodeId} ${issue.message}`)
    }
    assert.equal(overlap(final.flow), null, `rodada ${round}`)
    assert.ok(final.flow.viewport.zoom >= 0.3 && final.flow.viewport.zoom <= 1)
    const issues = reviewFlow(final)
    assert.ok(issues.every(issue => ['ia', 'plataforma', 'ajuste'].includes(issue.scope)))
    assert.deepEqual(scoreOf(issues).length, 3)
  }
})

test('the layout goes left to right without overlaps, is deterministic and fits the viewport', () => {
  const ri = allTypes()
  const first = assemble(ri)
  const second = assemble(JSON.parse(JSON.stringify(ri)))
  assert.deepEqual(first.flow, second.flow)
  assert.equal(overlap(first.flow), null)
  const positions = new Map(first.flow.nodes.map(entry => [entry.id, entry.position]))
  for (const entry of first.flow.edges) assert.ok(positions.get(entry.target).x > positions.get(entry.source).x, entry.id)
  const { zoom, x, y } = first.flow.viewport
  assert.ok(zoom >= 0.3 && zoom <= 1)
  assert.ok(Number.isFinite(x) && Number.isFinite(y))
  const note = first.flow.nodes.find(entry => entry.data.type === 'note')
  const lowest = Math.max(...first.flow.nodes.filter(entry => entry !== note).map(entry => entry.position.y + layoutBox(entry).height))
  assert.ok(note.position.y > lowest)
  assert.deepEqual(first.flow.nodes[0].position, { x: 120, y: 120 })

  const menu = assemble(flowOf([node('menu', 'envio_mensagem', { title: 'Escolha', options: JSON.stringify(Array.from({ length: 10 }, (_, index) => `Opção ${index + 1}`)) })], []))
  assert.ok(layoutBox(byRi(menu, 'menu')).height >= 10 * 29)
  const orphans = assemble(flowOf([node('a', 'envio_pergunta', { template: 'A.' }), node('b', 'envio_pergunta', { template: 'B.' }), node('c', 'envio_pergunta', { template: 'C.' })], [edge('inicio', '', 'a')]))
  assert.equal(overlap(orphans.flow), null)
  assert.equal(byRi(orphans, 'b').position.x, byRi(orphans, 'c').position.x)
  assert.ok(byRi(orphans, 'b').position.x > byRi(orphans, 'a').position.x)
})

test('review scopes: errors and fixable warnings go to the AI, platform data stays for the user', () => {
  const expected = [
    'Informe a URL da API das opções.',
    'Informe a URL da API que envia os boletos.',
    'Informe a URL da API que lista os boletos.',
    'Informe a URL da API.',
    'Informe a URL da imagem.',
    'Informe a URL do arquivo.',
    'Informe a planilha.',
    'Informe o ID da lista ou marque Remover de todas as listas.',
    'Informe o ID da lista.',
    'Informe o ID da tabulação.',
    'Informe o ID da tag.',
    'Informe o ID do agente de IA.',
    'Informe o ID do agente.',
    'Informe o ID do departamento.',
    'Informe o ID do fluxo de destino.',
    'Informe o ID do formulário ou o ID do Flow na Meta.',
    'Informe o ID do template.',
    'Informe o ID do widget do chat.',
    'Informe o nome da tabulação.',
    'Selecione o agente de IA.',
    'Informe o nome da tag.',
    'Informe o nome do agente.',
    'Informe o nome do departamento.',
    'Informe o nome do fluxo de destino.',
    'Informe o nome do template.',
  ]
  const platform = new Set()
  const fixable = new Set()
  for (const definition of componentCatalog.filter(entry => entry.nativeType !== START_TYPE)) {
    const evaluation = evaluateRi(flowOf([node('c', definition.nativeType)], [edge('inicio', '', 'c')]), { now: NOW })
    for (const issue of evaluation.issues) {
      assert.ok(['ia', 'plataforma'].includes(issue.scope), issue.message)
      if (issue.severity === 'error') assert.equal(issue.scope, 'ia', issue.message)
      ;(issue.scope === 'plataforma' ? platform : fixable).add(issue.message)
    }
    assert.deepEqual(evaluation.pending, correctionItems(evaluation.assembled, evaluation.issues))
  }
  assert.deepEqual([...platform].sort(), [...expected].sort())
  assert.ok(fixable.has('Preencha a mensagem.'))
  assert.ok(fixable.has('Selecione o menu de destino.'))
  assert.equal(platformScope('API não validada: valide na plataforma depois de importar.'), 'plataforma')
  assert.equal(platformScope('Informe o nome do evento.'), 'ia')
  assert.equal(platformScope('Informe a variável de saída.'), 'ia')
})

test('correction messages cite the RI id, the component and the pending item, and the best round wins', () => {
  const broken = flowOf([
    node('boas_vindas', 'envio_pergunta', { texto: 'Olá' }),
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["Vendas","Suporte"]' }),
    node('vendas', 'departamentos', { name: 'Vendas' }),
  ], [edge('inicio', '', 'boas_vindas'), edge('boas_vindas', '', 'menu'), edge('menu', 'Vendas', 'vendas')])
  const first = evaluateRi(broken, { now: NOW, prompt: 'Atendimento comercial' })
  assert.deepEqual(first.pending, [
    '[boas_vindas] Enviar Mensagem: Preencha a mensagem.',
    '[menu] Menu de Opções: Conecte a saída “Suporte”.',
    '[boas_vindas] Enviar Mensagem: A chave “texto” não existe e foi descartada. Chaves aceitas: template.',
  ])
  assert.deepEqual(first.issues.map(issue => [issue.severity, issue.scope, issue.riId, issue.type]), [
    ['error', 'ia', 'boas_vindas', 'envio_pergunta'],
    ['error', 'ia', 'menu', 'envio_mensagem'],
    ['warning', 'ia', 'boas_vindas', 'envio_pergunta'],
    ['warning', 'plataforma', 'vendas', 'departamentos'],
  ])
  assert.deepEqual(first.score, [2, 1, 1])
  assert.equal(needsCorrection(first), true)
  assert.equal(correctionPrompt(first.pending), [
    '# Pendências',
    'A RI anterior gerou estas pendências. Corrija todas e devolva a RI completa, com todos os componentes e conexões. Mantenha os ids que não precisam mudar.',
    '- [boas_vindas] Enviar Mensagem: Preencha a mensagem.',
    '- [menu] Menu de Opções: Conecte a saída “Suporte”.',
    '- [boas_vindas] Enviar Mensagem: A chave “texto” não existe e foi descartada. Chaves aceitas: template.',
  ].join('\n'))

  const fixed = JSON.parse(JSON.stringify(broken))
  fixed.nodes[0].config = [{ key: 'template', value: 'Olá, #NAME.' }]
  fixed.nodes.push(node('suporte', 'departamentos', { name: 'Suporte' }))
  fixed.edges.push(edge('menu', 'Suporte', 'suporte'))
  const second = evaluateRi(fixed, { now: NOW })
  assert.deepEqual(second.pending, [])
  assert.deepEqual(second.score, [0, 0, 2])
  assert.equal(needsCorrection(second), false)
  assert.ok(compareScores(second.score, first.score) < 0)
  assert.equal(pickBetter(first, second), second)
  assert.equal(pickBetter(second, first), second)
  assert.equal(pickBetter(null, first), first)
  const tie = evaluateRi(fixed, { now: NOW })
  assert.equal(pickBetter(second, tie), tie)

  const outcome = concludeGeneration(first)
  assert.deepEqual(issueMessages(outcome.issues, 'ajuste'), ['Preenchido com texto provisório: a mensagem. Revise.', 'A saída “Suporte” estava sem destino e foi ligada a um novo Encerrar Conversa. Revise.'])
  assert.ok(!issueMessages(outcome.issues).some(message => message.startsWith('Conecte a saída')))
  assert.deepEqual(errorsOf(outcome.workflow).map(issue => issue.message), [])
  assert.equal(byRi({ ...first.assembled, flow: outcome.workflow }, 'boas_vindas').data.data.template, 'Mensagem a definir.')
  const done = concludeGeneration(second)
  assert.equal(exportFlow(done.workflow).length > 0, true)
  assert.deepEqual(done.issues.map(issue => issue.scope), ['plataforma', 'plataforma'])

  const open = finalizeFlow(assemble(flowOf([node('api', 'consulta_api', { url_api: 'https://example.com/api' }), node('solto', 'envio_pergunta', { template: 'Sem ligação.' })], [edge('inicio', '', 'api')])))
  assert.deepEqual(open.flow.nodes.map(entry => entry.data.type), [START_TYPE, 'consulta_api', 'envio_pergunta', 'finalizar', 'finalizar'])
  assert.deepEqual(open.notes.map(note => note.message), [
    'A saída “Falha” estava sem destino e foi ligada a um novo Encerrar Conversa. Revise.',
    'A saída “Sucesso” estava sem destino e foi ligada a um novo Encerrar Conversa. Revise.',
  ])
  assert.equal(overlap(open.flow), null)

  assert.equal(formatCorrectionPrompt('nodes.0.type: valor inválido'), 'A resposta anterior não está no formato da RI: nodes.0.type: valor inválido. Responda de novo, só com a RI completa.')
  assert.equal(formatCorrectionPrompt(), 'A resposta anterior não está no formato da RI. Responda de novo, só com a RI completa.')
  const invalid = riSchema.safeParse({ name: 'x', nodes: [{ id: 'a', type: 'inventado', config: [] }], edges: [] })
  assert.equal(describeFormatProblem({ cause: { cause: invalid.error } }), 'description: campo ausente; nodes.0.type: "inventado" não é um tipo da lista')
  assert.equal(describeFormatProblem({ name: 'AI_NoObjectGeneratedError', cause: { name: 'AI_JSONParseError' } }), 'o texto não é um JSON válido')
  assert.equal(formatFailurePrompt(new Error('x')), 'A resposta anterior não está no formato da RI: a resposta não seguiu o esquema. Responda de novo, só com a RI completa.')
})

test('a protocol by URL without the URL falls back to Automático and the missing URL stays with the user', () => {
  const ri = flowOf([node('proto', 'protocolo', { opt: 'URL', text: 'Seu protocolo é {protocol}.' }), node('fim', 'finalizar')], [edge('inicio', '', 'proto'), edge('proto', '', 'fim')])
  const evaluation = evaluateRi(ri, { now: NOW })
  assert.equal(byRi(evaluation.assembled, 'proto').data.data.opt, 'Automático')
  assert.deepEqual(evaluation.issues.map(issue => [issue.severity, issue.scope, issue.riId, issue.message]), [
    ['warning', 'plataforma', 'proto', 'Sem a URL da API de protocolo no pedido, o tipo passou para Automático. Informe a URL no editor para usar o tipo URL.'],
  ])
  assert.equal(needsCorrection(evaluation), false)
  const outcome = concludeGeneration(evaluation)
  assert.deepEqual(errorsOf(outcome.workflow), [])
  assert.ok(exportFlow(outcome.workflow).length > 0)

  const given = assemble(flowOf([node('proto', 'protocolo', { opt: 'URL', url_api: 'https://example.com/protocolos', text: 'Protocolo {protocol}.' })], [edge('inicio', '', 'proto')]))
  assert.equal(byRi(given, 'proto').data.data.opt, 'URL')

  const manual = assemble(flowOf([node('proto', 'protocolo', { text: 'Protocolo {protocol}.' }), node('fim', 'finalizar')], [edge('inicio', '', 'proto'), edge('proto', '', 'fim')]))
  byRi(manual, 'proto').data.data.opt = 'URL'
  const review = reviewFlow(manual)
  assert.deepEqual(review.map(issue => [issue.severity, issue.scope, issue.message]), [['error', 'plataforma', 'Informe a URL da API de protocolo.']])
  assert.equal(needsCorrection({ issues: review }), false)
})

test('a wrong label on a single output uses that output, and one unknown label takes the only free output', () => {
  const single = assemble(flowOf([
    node('a', 'envio_pergunta', { template: 'Olá.' }),
    node('b', 'envio_pergunta', { template: 'Tudo bem?' }),
    node('c', 'envio_pergunta', { template: 'Até logo.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'a'), edge('a', '0', 'b'), edge('b', 'Continuar', 'c'), edge('c', 'Sim', 'fim')]))
  assert.deepEqual([linkOf(single, 'a', 'b')?.sourceHandle, linkOf(single, 'b', 'c')?.sourceHandle, linkOf(single, 'c', 'fim')?.sourceHandle], ['output-0', 'output-0', 'output-0'])
  assert.deepEqual(single.notes.map(note => [note.level, note.riId, note.message]), [
    ['hint', 'a', 'A saída “0” não existe; foi usada a única saída, “Próximo”.'],
    ['hint', 'b', 'A saída “Continuar” não existe; foi usada a única saída, “Próximo”.'],
    ['hint', 'c', 'A saída “Sim” não existe; foi usada a única saída, “Próximo”.'],
  ])
  const review = reviewFlow(single)
  assert.deepEqual(review, [])
  assert.equal(correctionItems(single, review).length, 3)
  const final = finalizeFlow(single)
  assert.deepEqual(final.notes.filter(note => note.level !== 'hint'), [])
  assert.equal(final.flow.nodes.length, 5)

  const free = assemble(flowOf([node('api', 'consulta_api', { url_api: 'https://example.com/api' }), node('ok', 'finalizar'), node('erro', 'finalizar')], [edge('inicio', '', 'api'), edge('api', 'Sucesso', 'ok'), edge('api', 'Deu erro', 'erro')]))
  assert.deepEqual([linkOf(free, 'api', 'ok')?.sourceHandle, linkOf(free, 'api', 'erro')?.sourceHandle], ['output-1', 'output-0'])
  assert.deepEqual(free.notes.map(note => [note.scope, note.riId, note.message]), [['ajuste', 'api', 'A saída “Deu erro” não existe; a conexão para “erro” foi ligada à única saída livre, “Falha”. Revise.']])

  const twoWrong = assemble(flowOf([node('api', 'consulta_api', { url_api: 'https://example.com/api' }), node('ok', 'finalizar'), node('erro', 'finalizar')], [edge('inicio', '', 'api'), edge('api', 'Talvez', 'ok'), edge('api', 'Deu erro', 'erro')]))
  assert.equal(twoWrong.flow.edges.filter(entry => entry.source === byRi(twoWrong, 'api').id).length, 0)
  assert.deepEqual(twoWrong.notes.map(note => note.scope), ['ia', 'ia'])
})

test('without a start link the start goes to the root that reaches the most components', () => {
  const ri = flowOf([
    node('fora', 'envio_pergunta', { template: 'Atendemos de segunda a sexta.' }),
    node('fim_fora', 'finalizar'),
    node('horario', 'timeConditions', { timeRules: JSON.stringify([{ weekDays: 'segunda a sexta', startTime: '08:00', endTime: '18:00' }]) }),
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["Vendas","Suporte"]' }),
    node('vendas', 'departamentos', { name: 'Vendas' }),
    node('suporte', 'departamentos', { name: 'Suporte' }),
  ], [edge('fora', '', 'fim_fora'), edge('horario', 'Dentro do horário', 'menu'), edge('menu', 'Vendas', 'vendas'), edge('menu', 'Suporte', 'suporte')])
  const assembled = assemble(ri)
  assert.equal(linkOf(assembled, 'inicio', 'horario')?.sourceHandle, 'output-0')
  assert.deepEqual(assembled.notes.map(note => [note.scope, note.riId, note.message]), [['ajuste', 'horario', 'O início não estava ligado e foi ligado a “horario”, o componente que alcança mais passos. Revise.']])
  const final = finalizeFlow(assembled)
  const reachable = new Set([START_ID])
  for (const id of reachable) for (const entry of final.flow.edges) if (entry.source === id) reachable.add(entry.target)
  for (const id of ['horario', 'menu', 'vendas', 'suporte']) assert.ok(reachable.has(byRi(final, id).id), id)
})

test('a partial or empty correction never replaces a complete round, and a real fix still wins', () => {
  const nodes = [
    node('boas_vindas', 'envio_pergunta', { template: 'Olá.' }),
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["Vendas","Suporte","Financeiro"]' }),
    node('vendas', 'departamentos', { name: 'Vendas' }),
    node('suporte', 'departamentos', { name: 'Suporte' }),
    node('financeiro', 'envio_pergunta', { template: 'Boletos.' }),
    node('fim', 'finalizar'),
  ]
  const edges = [edge('inicio', '', 'boas_vindas'), edge('boas_vindas', '', 'menu'), edge('menu', 'Vendas', 'vendas'), edge('menu', 'Suporte', 'suporte'), edge('menu', 'Financeiro', 'financeiro')]
  const complete = evaluateRi(flowOf(nodes, edges), { now: NOW })
  const partial = evaluateRi(flowOf([node('financeiro', 'envio_pergunta', { template: 'Boletos.' }), node('fim', 'finalizar')], [edge('financeiro', '', 'fim')]), { now: NOW })
  const empty = evaluateRi(flowOf([], []), { now: NOW })
  assert.ok(compareScores(partial.score, complete.score) < 0)
  assert.ok(compareScores(empty.score, complete.score) < 0)
  assert.equal(pickBetter(complete, partial), complete)
  assert.equal(pickBetter(complete, empty), complete)
  assert.equal(pickBetter(empty, complete), complete)
  const fixed = evaluateRi(flowOf(nodes, [...edges, edge('financeiro', '', 'fim')]), { now: NOW })
  assert.equal(pickBetter(complete, fixed), fixed)
  assert.equal(pickBetter(fixed, complete), fixed)
})

test('a time rule that crosses midnight becomes valid rules instead of a blocking error', () => {
  const night = configure('timeConditions', { timeRules: JSON.stringify([{ weekDays: 'segunda a sexta', startTime: '22:00', endTime: '06:00' }]) })
  assert.deepEqual(night.data.timeRules, [
    { id: 'rule-1', weekDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '22:00', endTime: '23:59' },
    { id: 'rule-2', weekDays: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], startTime: '00:00', endTime: '06:00' },
  ])
  assert.deepEqual(night.notes, [{ level: 'hint', message: 'A regra das 22:00 às 06:00 passa da meia-noite e foi dividida em duas: 22:00 às 23:59 e 00:00 às 06:00 do dia seguinte.' }])
  const sunday = configure('timeConditions', { timeRules: JSON.stringify([{ weekDays: ['sunday'], startTime: '23:00', endTime: '01:00' }]) })
  assert.deepEqual(sunday.data.timeRules.map(rule => rule.weekDays), [['sunday'], ['monday']])
  const midnight = configure('timeConditions', { timeRules: JSON.stringify([{ weekDays: ['saturday'], startTime: '18:00', endTime: '00:00' }]) })
  assert.deepEqual(midnight.data.timeRules, [{ id: 'rule-1', weekDays: ['saturday'], startTime: '18:00', endTime: '23:59' }])
  assert.deepEqual(midnight.notes, [{ level: 'hint', message: 'A regra das 18:00 às 00:00 passou a terminar às 23:59.' }])

  const evaluation = evaluateRi(flowOf([node('plantao', 'timeConditions', { timeRules: JSON.stringify([{ weekDays: 'todos', startTime: '22:00', endTime: '07:00' }]) }), node('fora', 'finalizar'), node('dentro', 'finalizar')], [edge('inicio', '', 'plantao'), edge('plantao', '1', 'fora'), edge('plantao', '2', 'dentro')]), { now: NOW })
  assert.deepEqual(errorsOf(evaluation.assembled.flow), [])
  assert.equal(needsCorrection(evaluation), false)
  assert.ok(exportFlow(concludeGeneration(evaluation).workflow).length > 0)
})

test('response_map accepts a variable map and Portuguese keys, and empty mappings are reported', () => {
  const api = { url_api: 'https://example.com/pedidos' }
  const mapped = configure('consulta_api', { ...api, response_map: JSON.stringify({ status_pedido: 'pedido.status', 'pedido.previsao': 'previsao' }) })
  assert.deepEqual(mapped.data.response_map, [
    { path: 'pedido.status', key: '', sample: '', variable: 'status_pedido' },
    { path: 'pedido.previsao', key: '', sample: '', variable: 'previsao' },
  ])
  assert.deepEqual(mapped.notes, [])
  const item = configure('consulta_api', { ...api, response_map: JSON.stringify({ path: 'pedido.status', variable: 'status' }) })
  assert.deepEqual(item.data.response_map, [{ path: 'pedido.status', key: '', sample: '', variable: 'status' }])
  const aliases = configure('consulta_api', { ...api, response_map: JSON.stringify([{ campo: 'pedido.status', chave: 'status', exemplo: 'entregue', variavel: 'status_pedido' }, { caminho: 'pedido.id' }]) })
  assert.deepEqual(aliases.data.response_map, [
    { path: 'pedido.status', key: 'status', sample: 'entregue', variable: 'status_pedido' },
    { path: 'pedido.id', key: '', sample: '', variable: '' },
  ])
  assert.deepEqual(aliases.notes, [{ level: 'warning', message: 'Cada item de response_map precisa de path e variable.' }])
  const columns = configure('googleSheetsAppend', { spreadsheet: 'planilha-1', columns: JSON.stringify(['Nota', 'Contato']) })
  assert.deepEqual(columns.data.columns, [{ header: 'Nota', value: '' }, { header: 'Contato', value: '' }])
  assert.deepEqual(columns.notes, [{ level: 'warning', message: 'Cada coluna de columns precisa de header e value; use {{variavel}} no value.' }])
})

test('a menu message above 1024 characters is split into a message before the menu', () => {
  const notice = Array.from({ length: 16 }, (_, index) => `Item ${index + 1}: seus dados são tratados conforme a LGPD e usados só para este atendimento.`).join(' ')
  const title = `${notice}\n\nEscolha uma opção:`
  assert.ok(title.length > 1024)
  const ri = flowOf([node('menu', 'envio_mensagem', { title, options: '["Vendas","Suporte"]' }), node('vendas', 'departamentos', { name: 'Vendas' }), node('suporte', 'departamentos', { name: 'Suporte' })], [edge('inicio', '', 'menu'), edge('menu', 'Vendas', 'vendas'), edge('menu', 'Suporte', 'suporte')])
  const assembled = assemble(ri)
  assert.ok(errorsOf(assembled.flow).some(issue => issue.message.endsWith('o limite é 1024.')))
  const final = finalizeFlow(assembled)
  const menu = byRi(final, 'menu')
  const lead = final.flow.nodes.find(entry => entry.data.type === 'envio_pergunta')
  assert.equal(menu.data.data.title, 'Escolha uma opção:')
  assert.equal(lead.data.data.template, notice)
  assert.deepEqual(final.flow.edges.filter(entry => entry.target === lead.id || entry.target === menu.id).map(entry => [entry.source, entry.target]), [[START_ID, lead.id], [lead.id, menu.id]])
  assert.deepEqual(final.notes.map(note => [note.scope, note.riId, note.message]), [['ajuste', 'menu', 'A mensagem do menu passava de 1024 caracteres; o começo foi para um Enviar Mensagem antes do menu. Revise.']])
  assert.deepEqual(errorsOf(final.flow), [])
  assert.ok(exportFlow(final.flow).length > 0)

  const flat = 'palavra '.repeat(200).trim()
  const plain = finalizeFlow(assemble(flowOf([node('menu', 'envio_mensagem', { title: flat, options: '["A"]' }), node('fim', 'finalizar')], [edge('inicio', '', 'menu'), edge('menu', 'A', 'fim')])))
  const plainMenu = byRi(plain, 'menu')
  const plainLead = plain.flow.nodes.find(entry => entry.data.type === 'envio_pergunta')
  assert.ok(plainMenu.data.data.title.length <= 1024)
  assert.equal(`${plainLead.data.data.template} ${plainMenu.data.data.title}`, flat)
  assert.deepEqual(errorsOf(plain.flow), [])
})

test('required keys left empty are sent back to the model once, without repeating what the validation already says', () => {
  const assembled = assemble(flowOf([
    node('espera', 'waitForAnswer', { logToActivity: 'sim' }),
    node('crm', 'crmContact'),
    node('msg', 'envio_pergunta'),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'espera'), edge('espera', '', 'crm'), edge('crm', 'Sucesso', 'msg'), edge('msg', '', 'fim')]))
  assert.deepEqual(assembled.notes.map(note => [note.scope, note.riId, note.message]), [
    ['ia', 'espera', 'Preencha “Salvar resposta no campo” (customFields), que é obrigatório.'],
    ['ia', 'crm', 'Preencha “Mensagem de sucesso” (successMessage), que é obrigatório.'],
    ['ia', 'crm', 'Preencha “Mensagem de erro” (errorMessage), que é obrigatório.'],
  ])
  const evaluation = evaluateRi(flowOf([node('espera', 'waitForAnswer', { logToActivity: 'sim' }), node('fim', 'finalizar')], [edge('inicio', '', 'espera'), edge('espera', '', 'fim')]), { now: NOW })
  assert.equal(needsCorrection(evaluation), true)
  assert.ok(evaluation.pending.includes('[espera] Aguardando Mensagem: Preencha “Salvar resposta no campo” (customFields), que é obrigatório.'))
  assert.equal(reviewFlow(assembled).filter(issue => issue.riId === 'msg' && issue.message.startsWith('Preencha')).length, 1)
})

test('a menu option linked to the menu itself becomes Retornar ao Menu', () => {
  const assembled = assemble(flowOf([
    node('menu', 'envio_mensagem', { title: 'Menu', options: '["Horários","Ver as opções de novo"]' }),
    node('horarios', 'envio_pergunta', { template: 'Das 8h às 18h.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Horários', 'horarios'), edge('menu', 'Ver as opções de novo', 'menu'), edge('horarios', '', 'fim')]))
  const menu = byRi(assembled, 'menu')
  const back = assembled.flow.nodes.find(entry => entry.data.type === 'voltar')
  assert.deepEqual(assembled.flow.edges.find(entry => entry.target === back.id), { type: 'deletable', source: menu.id, sourceHandle: 'output-1', target: back.id, id: `xy-edge__${menu.id}output-1-${back.id}` })
  assert.equal(back.data.data.targetNodeId, menu.id)
  assert.equal(back.data.data.targetNodeName, 'Menu')
  assert.deepEqual(assembled.notes.map(note => [note.scope, note.riId, note.message]), [['ajuste', 'menu', 'A conexão de volta ao menu “Menu” foi trocada por Retornar ao Menu.']])
  assert.deepEqual(validateFlow(assembled.flow), [])
  const final = finalizeFlow(assembled)
  assert.ok(!final.flow.nodes.some(entry => entry.data.type === 'finalizar' && entry.id !== byRi(final, 'fim').id))
})

test('without a start link the start reaches the main flow even when the menu is in a cycle', () => {
  const assembled = assemble(flowOf([
    node('menu', 'envio_mensagem', { title: 'Escolha', options: '["Vendas","Encerrar"]' }),
    node('vendas', 'envio_pergunta', { template: 'Falando de vendas.' }),
    node('sobra', 'finalizar'),
    node('tchau', 'finalizar'),
  ], [edge('menu', 'Vendas', 'vendas'), edge('vendas', '', 'menu'), edge('menu', 'Encerrar', 'tchau')]))
  assert.equal(linkOf(assembled, 'inicio', 'menu')?.sourceHandle, 'output-0')
  assert.ok(noteMessages(assembled).includes('O início não estava ligado e foi ligado a “menu”, o componente que alcança mais passos. Revise.'))
  const final = finalizeFlow(assembled)
  const reachable = new Set([START_ID])
  for (const id of reachable) for (const entry of final.flow.edges) if (entry.source === id) reachable.add(entry.target)
  for (const id of ['menu', 'vendas', 'tchau']) assert.ok(reachable.has(byRi(final, id).id), id)
})

test('Retornar ao Menu follows the final menu title after the long message is split or filled', () => {
  const notice = 'Aviso importante sobre o atendimento. '.repeat(30).trim()
  const final = finalizeFlow(assemble(flowOf([
    node('menu', 'envio_mensagem', { title: `${notice}\n\nEscolha uma opção:`, options: '["Horários","Ver de novo"]' }),
    node('horarios', 'envio_pergunta', { template: 'Das 8h às 18h.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Horários', 'horarios'), edge('menu', 'Ver de novo', 'menu'), edge('horarios', '', 'fim')])))
  const back = final.flow.nodes.find(entry => entry.data.type === 'voltar')
  assert.equal(byRi(final, 'menu').data.data.title, 'Escolha uma opção:')
  assert.equal(back.data.data.targetNodeName, 'Escolha uma opção:')
  assert.deepEqual(back.data.data.availableNodes.map(entry => entry.name), ['Escolha uma opção:'])
  assert.deepEqual(errorsOf(final.flow), [])

  const filled = finalizeFlow(assemble(flowOf([node('menu', 'envio_mensagem', { options: '["A","Ver de novo"]' }), node('fim', 'finalizar')], [edge('inicio', '', 'menu'), edge('menu', 'A', 'fim'), edge('menu', 'Ver de novo', 'menu')])))
  assert.equal(filled.flow.nodes.find(entry => entry.data.type === 'voltar').data.data.targetNodeName, 'Escolha uma opção.')
})

test('a long menu message without a safe cut goes whole to the message before the menu', () => {
  for (const title of [`Leia: https://exemplo.com/${'x'.repeat(1300)}`, `${'😀'.repeat(600)}.`]) {
    const final = finalizeFlow(assemble(flowOf([node('menu', 'envio_mensagem', { title, options: '["A"]' }), node('fim', 'finalizar')], [edge('inicio', '', 'menu'), edge('menu', 'A', 'fim')])))
    const lead = final.flow.nodes.find(entry => entry.data.type === 'envio_pergunta')
    assert.equal(lead.data.data.template, title)
    assert.equal(byRi(final, 'menu').data.data.title, 'Escolha uma opção.')
    assert.ok(noteMessages(final).includes('A mensagem do menu passava de 1024 caracteres e foi inteira para um Enviar Mensagem antes do menu; o menu ficou com um texto provisório. Revise.'))
    assert.deepEqual(errorsOf(final.flow), [])
  }
})

test('a Condicional with an empty value is a valid filled check and needs no correction', () => {
  const evaluation = evaluateRi(flowOf([
    node('tem', 'condicional_api', { key: 'cpf', condition: 'Diferente de', value: '' }),
    node('sim', 'finalizar'),
    node('nao', 'finalizar'),
  ], [edge('inicio', '', 'tem'), edge('tem', 'Verdadeiro', 'sim'), edge('tem', 'Falso', 'nao')]), { now: NOW })
  assert.deepEqual(evaluation.pending, [])
  assert.equal(needsCorrection(evaluation), false)
  assert.ok(!COMPONENT_GUIDE.condicional_api.required.includes('value'))
})

test('response_map maps variables named like aliases and nested objects, and odd time rules are handled', () => {
  const api = { url_api: 'https://example.com/pagamentos' }
  const pix = configure('consulta_api', { ...api, response_map: JSON.stringify({ chave: 'pagamento.pix.chave', valor: 'pagamento.valor' }) })
  assert.deepEqual(pix.data.response_map, [
    { path: 'pagamento.pix.chave', key: '', sample: '', variable: 'chave' },
    { path: 'pagamento.valor', key: '', sample: '', variable: 'valor' },
  ])
  assert.deepEqual(pix.notes, [])
  const nested = configure('consulta_api', { ...api, response_map: JSON.stringify({ cliente: { nome: 'nome_cliente' }, status_pedido: { path: 'pedido.status', exemplo: 'entregue' } }) })
  assert.deepEqual(nested.data.response_map, [
    { path: 'cliente.nome', key: '', sample: '', variable: 'nome_cliente' },
    { path: 'pedido.status', key: '', sample: 'entregue', variable: 'status_pedido' },
  ])
  assert.deepEqual(nested.notes, [])

  const allDay = configure('timeConditions', { timeRules: JSON.stringify([{ weekDays: 'todos', startTime: '00:00', endTime: '00:00' }]) })
  assert.deepEqual(allDay.data.timeRules.map(rule => [rule.startTime, rule.endTime]), [['00:00', '23:59']])
  assert.deepEqual(allDay.notes, [{ level: 'hint', message: 'A regra das 00:00 às 00:00 passou a terminar às 23:59.' }])
  const same = configure('timeConditions', { timeRules: JSON.stringify([{ weekDays: ['monday'], startTime: '08:00', endTime: '08:00' }]) })
  assert.deepEqual(same.notes, [{ level: 'warning', message: 'A regra das 08:00 às 08:00 começa e termina no mesmo horário; informe o horário de fim.' }])
})

test('repairRiText fixes fences, non text values, config maps and type names', () => {
  const text = '```json\n' + JSON.stringify({
    name: 'Fluxo',
    nodes: [
      { id: 'menu', type: 'Menu de Opções', config: [{ key: 'title', value: 'Escolha' }, { key: 'options', value: ['A', 'B'] }, { key: 'buttons', value: false }] },
      { id: 'espera', type: 'WAITING_TIME', config: { waiting_time: 5 } },
      { id: 'ia', type: 'openai', config: [] },
      { id: 'cliente', type: 'Identificar Cliente', config: [] },
    ],
    edges: [{ source: 'menu', sourceHandle: 1, target: 'espera' }],
  }) + '\n```'
  const repaired = JSON.parse(repairRiText(text))
  assert.deepEqual(repaired, {
    name: 'Fluxo',
    description: '',
    nodes: [
      { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Escolha' }, { key: 'options', value: '["A","B"]' }, { key: 'buttons', value: 'false' }] },
      { id: 'espera', type: 'waiting_time', config: [{ key: 'waiting_time', value: '5' }] },
      { id: 'ia', type: 'OpenAI', config: [] },
      { id: 'cliente', type: 'Identificar Cliente', config: [] },
    ],
    edges: [{ from: 'menu', output: '1', to: 'espera' }],
  })
  assert.equal(riSchema.safeParse(repaired).success, false)
  repaired.nodes.pop()
  assert.equal(riSchema.safeParse(repaired).success, true)
  assert.equal(repairRiText('Aqui está: {"name":"x","nodes":[],"edges":[]} Obrigado.'), JSON.stringify({ name: 'x', description: '', nodes: [], edges: [] }))
  assert.equal(repairRiText('sem json'), null)
  assert.equal(repairRiText('[1,2]'), null)
  assert.equal(coerceRi(null), null)
  assert.equal(canonicalType('Retornar ao Menu'), 'voltar')
  assert.equal(canonicalType('return-menu'), 'voltar')
  assert.equal(canonicalType('identificar cliente'), undefined)
  assert.equal(canonicalType('inventado'), undefined)
  assert.deepEqual(countRi({ nodes: [{}, {}], edges: [{}] }), { nodes: 2, edges: 1 })
  assert.deepEqual(countRi(undefined), { nodes: 0, edges: 0 })
})

test('a simulated model streams the RI through streamObject, the repair and the assembly', async () => {
  const ri = PROMPT_EXAMPLES[0].ri
  const body = `\`\`\`json\n${JSON.stringify(ri)}\n\`\`\``
  let call
  const model = new MockLanguageModelV2({
    doStream: async options => {
      call = options
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: body.slice(0, 120) },
          { type: 'text-delta', id: 't1', delta: body.slice(120) },
          { type: 'text-end', id: 't1' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 } },
        ]),
      }
    },
  })
  const result = streamObject({
    model,
    schema: riSchema,
    schemaName: RI_SCHEMA_NAME,
    schemaDescription: RI_SCHEMA_DESCRIPTION,
    system: systemPrompt(),
    prompt: requestPrompt({ prompt: 'Clínica com agendamento', size: 'medium' }),
    experimental_repairText: async ({ text }) => repairRiText(text),
  })
  const object = await result.object
  assert.deepEqual(object, ri)
  assert.deepEqual(await result.usage, { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 })
  assert.equal(call.responseFormat.type, 'json')
  assert.equal(call.responseFormat.name, RI_SCHEMA_NAME)
  assert.deepEqual(call.responseFormat.schema.properties.nodes.items.properties.type.enum, RI_TYPES)
  assert.equal(call.prompt[0].role, 'system')
  assert.equal(call.prompt[0].content, systemPrompt())
  const evaluation = evaluateRi(object, { now: NOW, prompt: 'Clínica com agendamento' })
  assert.deepEqual(evaluation.pending, [])
  assert.deepEqual(evaluation.score, [0, 0, 1])

  const plain = new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: JSON.stringify(PROMPT_EXAMPLES[1].ri) },
        { type: 'text-end', id: 't1' },
        { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } },
      ]),
    }),
  })
  const counts = []
  const streamed = streamObject({ model: plain, schema: riSchema, prompt: 'x', experimental_repairText: async ({ text }) => repairRiText(text) })
  for await (const partial of streamed.partialObjectStream) counts.push(countRi(partial))
  assert.deepEqual(counts.at(-1), { nodes: 7, edges: 7 })
  assert.deepEqual(await streamed.object, PROMPT_EXAMPLES[1].ri)
})

test('the system prompt is generated from the catalog: every type, every accepted key and the rules', () => {
  const prompt = systemPrompt()
  assert.equal(systemPrompt(), prompt)
  assert.ok(prompt.length < 60000, `${prompt.length} caracteres`)
  for (const definition of componentCatalog) {
    const type = definition.nativeType
    const block = componentBlock(definition)
    assert.equal(componentBlock(definition), block)
    assert.ok(prompt.includes(block), type)
    assert.ok(block.startsWith(`### ${type} | ${definition.label}\n`), type)
    const listed = [...block.matchAll(/^- ([^:]+):/gm)].map(match => match[1])
    assert.deepEqual(listed, acceptedKeys(type), type)
    for (const key of fixedKeys(type)) assert.ok(!listed.includes(key), `${type}.${key}`)
    if (type === 'note') assert.ok(block.includes('Sem entradas nem saídas: fica fora do caminho.') && !block.includes('encerra o caminho'), type)
    else if (!definition.outputRule && definition.outputLabels.length === 0) assert.ok(block.includes('Sem saídas: encerra o caminho.'), type)
    for (const label of definition.outputRule ? [] : definition.outputLabels) assert.ok(block.includes(JSON.stringify(label)), `${type} ${label}`)
  }
  for (const rule of [
    'O Iniciar Fluxo já existe, com id "inicio".',
    'Cada componente recebe no máximo uma conexão.',
    'Ligue todas as saídas de todos os componentes.',
    'Nada se liga ao início',
    'Menu de Opções: de 1 a 10 opções. buttons "true" só com até 3 opções.',
    'Nunca invente IDs, URLs ou planilhas.',
    '@@@variavel',
    '#NAME',
    'use Enviar Mensagem e depois Encerrar Conversa',
  ]) assert.ok(prompt.includes(rule), rule)
  for (const example of PROMPT_EXAMPLES) {
    assert.ok(prompt.includes(JSON.stringify(example.ri)))
    const evaluation = evaluateRi(example.ri, { now: NOW })
    assert.deepEqual(evaluation.pending, [], example.title)
    assert.ok(evaluation.issues.every(issue => issue.scope === 'plataforma'), example.title)
    assert.deepEqual(errorsOf(concludeGeneration(evaluation).workflow), [])
  }
})

test('request prompts describe the size, the name and the image', () => {
  assert.equal(sizeInstruction('auto'), `Use a quantidade de componentes que o pedido exigir, até ${AUTO_COMPONENT_LIMIT}, sem contar o início.`)
  for (const size of ['small', 'medium', 'large']) assert.equal(sizeInstruction(size), `Gere entre ${SIZE_RANGES[size][0]} e ${SIZE_RANGES[size][1]} componentes, sem contar o início.`)
  assert.equal(sizeInstruction('custom', 12), 'Gere exatamente 12 componentes, sem contar o início.')
  assert.equal(sizeInstruction('custom', 1), `Gere exatamente ${COUNT_LIMITS.min} componentes, sem contar o início.`)
  assert.equal(sizeInstruction('custom', 500), `Gere exatamente ${COUNT_LIMITS.max} componentes, sem contar o início.`)
  assert.deepEqual(GENERATION_SIZES, ['auto', 'small', 'medium', 'large', 'custom'])
  assert.equal(MAX_ROUNDS, 3)
  assert.equal(requestPrompt({ prompt: '  Clínica odontológica  ', size: 'small', name: 'Clínica' }), [
    '# Pedido\nClínica odontológica',
    '# Tamanho\nGere entre 3 e 6 componentes, sem contar o início.',
    '# Nome do fluxo\nClínica',
  ].join('\n\n'))
  const withImage = requestPrompt({ prompt: '', size: 'auto', image: { mediaType: 'image/png', bytes: 2048 } })
  assert.ok(withImage.startsWith('# Pedido\nMonte o fluxo mostrado na imagem anexada.'))
  assert.ok(withImage.endsWith('# Imagem\nA imagem anexada mostra o fluxo de referência. Reproduza as etapas, as mensagens, as opções e as conexões.'))
  assert.ok(!requestPrompt({ prompt: 'x', size: 'auto', image: null }).includes('# Imagem'))
})

test('names and descriptions come from the request, the RI or the prompt', () => {
  const ri = flowOf([node('a', 'finalizar')], [], { name: '', description: '' })
  assert.equal(assemble(ri).flow.name, 'Fluxo gerado por IA')
  assert.equal(assemble(ri, { prompt: 'Atendimento da pizzaria do bairro' }).flow.name, 'Atendimento da pizzaria do bairro')
  assert.equal(assemble({ ...ri, name: 'Pizzaria' }, { prompt: 'x' }).flow.name, 'Pizzaria')
  assert.equal(assemble({ ...ri, name: 'Pizzaria' }, { name: 'Delivery' }).flow.name, 'Delivery')
  const long = assemble(ri, { prompt: 'palavra '.repeat(40) })
  assert.ok(long.flow.name.length <= 80)
  assert.ok(!long.flow.name.endsWith(' '))
  assert.equal(assemble({ ...ri, description: 'Resumo do fluxo' }).flow.description, 'Resumo do fluxo')
  assert.equal(assemble(ri, { prompt: 'Pedido do usuário' }).flow.description, 'Pedido do usuário')
})

test('providers list ChatGPT, Claude, Gemini and Grok with two current models each', () => {
  assert.deepEqual(PROVIDERS.map(provider => provider.id), [...PROVIDER_IDS])
  assert.deepEqual(PROVIDERS.map(provider => provider.name), ['ChatGPT', 'Claude', 'Gemini', 'Grok'])
  const ids = PROVIDERS.flatMap(provider => provider.presets.map(preset => preset.id))
  assert.equal(new Set(ids).size, 8)
  for (const provider of PROVIDERS) {
    assert.equal(provider.presets.length, 2, provider.id)
    assert.equal(getProvider(provider.id), provider)
    assert.equal(defaultModel(provider.id), provider.presets[0])
    assert.ok(provider.of && provider.vendor && provider.keyPlaceholder, provider.id)
    for (const preset of provider.presets) {
      assert.ok(preset.vision, preset.id)
      assert.equal(findPreset(provider.id, preset.id), preset)
      assert.match(preset.id, /^[a-z0-9][a-z0-9.-]+$/)
    }
    assert.ok(RI_PROVIDER_OPTIONS[provider.id], provider.id)
  }
  assert.deepEqual(ids, ['gpt-6.1-sol', 'gpt-6-astra', 'claude-opus-5-5', 'claude-sonnet-5-5', 'gemini-3.8-flash', 'gemini-3.1-pro-preview', 'grok-4.7', 'grok-4.3'])
  assert.equal(isProviderId('anthropic'), true)
  assert.equal(isProviderId('deepseek'), false)
  assert.equal(isProviderId('toString'), false)
  assert.equal(findPreset('openai', 'gpt-4o'), undefined)
  assert.throws(() => getProvider('outro'), /Provedor de IA desconhecido/)
  assert.deepEqual(RI_PROVIDER_OPTIONS.anthropic, { anthropic: { structuredOutputMode: 'outputFormat' } })
  assert.deepEqual(RI_PROVIDER_OPTIONS.openai, { openai: { strictJsonSchema: true, store: false } })
})

test('texts are PT-BR without exclamations or dashes, and the AI modules have no console or comments', () => {
  const texts = [systemPrompt(), correctionPrompt(['x']), formatCorrectionPrompt('y'), requestPrompt({ prompt: 'x', size: 'auto', image: { mediaType: 'image/png' } })]
  const samples = [
    assemble(flowOf([node('a', 'envio_pergunta', { texto: 'x' }), node('b', 'inventado')], [edge('a', 'X', 'b'), edge('z', '', 'a'), edge('a', '', 'inicio')])),
    assemble(flowOf([node('m', 'envio_mensagem', { title: 'x', options: JSON.stringify(Array.from({ length: 11 }, (_, index) => String(index))) }), node('v', 'voltar', { targetNodeId: 'zz' })], [edge('m', '1', 'm')])),
  ]
  for (const sample of samples) texts.push(...noteMessages(sample), ...correctionItems(sample, reviewFlow(sample)), ...noteMessages(finalizeFlow(sample)))
  for (const text of texts) {
    assert.ok(!text.includes('—'), text)
    assert.ok(!text.includes('–'), text)
    assert.ok(!/!(?!=)/.test(text.replace(/"[^"]*"/g, '')), text)
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), text)
  }
  for (const file of fs.readdirSync(AI_DIR).filter(name => name.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(AI_DIR, file), 'utf8')
    assert.ok(!source.includes('console.'), file)
    assert.ok(!/^\s*\/\//m.test(source), file)
    assert.ok(!source.includes('/*'), file)
    assert.ok(!source.includes('—'), file)
    assert.ok(!/from "@\//.test(source), file)
  }
  for (const file of ['providers.ts', 'contracts.ts']) {
    const source = fs.readFileSync(path.join(AI_DIR, file), 'utf8')
    assert.ok(!/from "(ai|zod|@ai-sdk\/[^"]+)"/.test(source), file)
  }
})
