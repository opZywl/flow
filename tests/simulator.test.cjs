const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { componentCatalog } = require('../lib/atendimento/catalog.ts')
const { createEdge, importFlow, newFlow, newNode, outputHandles } = require('../lib/atendimento/format.ts')
const { advancePreview, emptyPreview, renderText, replyPreview, startPreview } = require('../lib/atendimento/simulator.ts')

const link = (flow, source, target, handle = 'output-0') => flow.edges.push(createEdge(flow.edges, source, handle, target))
const message = (flow, id, text) => { const node = newNode('envio_pergunta', { x: 0, y: 0 }, id); node.data.data.template = text; flow.nodes.push(node); return node }
const add = (flow, type, id, data = {}) => { const node = newNode(type, { x: 0, y: 0 }, id); Object.assign(node.data.data, data); flow.nodes.push(node); return node }
const MONDAY_10H = new Date(2026, 9, 5, 10, 0)
const SUNDAY_10H = new Date(2026, 9, 4, 10, 0)
const TYPES = componentCatalog.map(entry => entry.nativeType ?? entry.id)

function menuFlow() {
  const flow = newFlow()
  add(flow, 'envio_mensagem', '2', { 'opt-1': '10', 'text-1': 'Primeira', title: 'Escolha uma opção:', 'opt-2': '20', 'text-2': 'Segunda' })
  message(flow, '3', 'A')
  message(flow, '4', 'B')
  link(flow, '2', '4', 'output-1')
  link(flow, 'inicio', '2')
  link(flow, '2', '3', 'output-0')
  return flow
}

function scenario(type, data = {}) {
  const flow = newFlow()
  const node = add(flow, type, '2', data)
  add(flow, 'finalizar', 'fim')
  link(flow, 'inicio', '2')
  outputHandles(node, flow.edges).forEach((handle, index) => {
    message(flow, `d${index + 1}`, `Destino ${index + 1}`)
    link(flow, '2', `d${index + 1}`, handle)
    link(flow, `d${index + 1}`, 'fim')
  })
  return flow
}

const play = (flow, replies = [], variables) => replies.reduce((state, reply) => replyPreview(flow, state, reply, MONDAY_10H), variables ? advancePreview(flow, 'inicio', { variables }, MONDAY_10H) : startPreview(flow, MONDAY_10H))
const arrive = (index, ...before) => [...before, `Destino ${index}`, 'Conversa finalizada.']
const listing = (intro, ...labels) => `${intro}\n\n${labels.map((label, index) => `${index + 1}. ${label}`).join('\n')}`
const texts = state => state.options.map(option => option.text)

const passes = (...messages) => ({ waiting: null, messages: arrive(1, ...messages) })
const ends = (...messages) => ({ waiting: null, messages })
const waits = (waiting, ...messages) => ({ waiting, messages })
const asks = (intro, labels, ...before) => ({ waiting: 'branch', messages: [...before, listing(intro, ...labels)] })
const SUCCESS_FIRST = ['Sucesso', 'Falha']
const FAILURE_FIRST = ['Falha', 'Sucesso']

const DEFAULT_STEPS = {
  trigger_message: passes(),
  envio_mensagem: waits('menu', '1. Opção 1'),
  envio_pergunta: passes(''),
  departamentos: ends('Transferido para o departamento. A prévia termina aqui.'),
  tags: passes('Tag aplicada ao atendimento.'),
  flow: ends('Encaminhado para o fluxo. A prévia termina aqui.'),
  finalizar: ends('Conversa finalizada.'),
  timeConditions: asks('Condições de Tempo: escolha o caminho a testar.', ['Fora do horário', 'Dentro do horário (agora)']),
  solicitar_dados: waits('data', 'Informe o dado solicitado.'),
  protocolo: passes('Seu protocolo é: [protocolo gerado na plataforma]'),
  consulta_api: asks('Consulta API: a requisição não é enviada na prévia. Escolha o resultado a testar.', FAILURE_FIRST),
  waitForAnswer: waits('answer'),
  envio_arquivo: passes('Arquivo enviado.'),
  envio_imagem: passes('Imagem enviada.'),
  templateMessage: passes('Template enviado.'),
  templateInteractive: passes('Template interativo enviado.'),
  whatsappFlow: asks('Enviar Formulário: o formulário não abre na prévia. Escolha o resultado a testar.', ['Respondido', 'Não respondido'], 'Formulário enviado.'),
  pixCharge: passes('Cobrança PIX enviada pelo template.'),
  whatsappCall: asks('Transferir para Ligação: a ligação não acontece na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  transferir: ends('Transferido para o agente. A prévia termina aqui.'),
  backToAgent: ends('Atendimento devolvido ao agente no departamento. A prévia termina aqui.'),
  apptService: asks('Escolher Serviço: a lista de serviços vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.', ['Serviço escolhido', 'Nenhum disponível']),
  apptIdentify: asks('Identificar Cliente: a identificação é feita pela agenda da plataforma e não é simulada. Escolha o resultado a testar.', ['Identificado', 'Não identificado']),
  apptLocation: asks('Escolher Local: a lista de locais vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.', ['Local escolhido', 'Nenhum disponível']),
  apptProvider: asks('Escolher Profissional: a lista de profissionais vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.', ['Profissional escolhido', 'Nenhum disponível']),
  apptSlot: asks('Escolher Horário: a lista de horários vem da agenda da plataforma e não é carregada na prévia. Escolha o resultado a testar.', ['Horário escolhido', 'Nenhum disponível']),
  apptCustomerIntake: asks('Dados do Cliente: a plataforma pede nome. Escolha o resultado a testar.', ['Dados registrados', 'Dados não registrados']),
  apptBook: asks('Confirmar Agendamento: o agendamento não é criado na prévia. Escolha o resultado a testar.', ['Agendado', 'Não agendado']),
  ticketLookup: asks('Consultar Chamados: os chamados não são carregados na prévia. Escolha o resultado a testar.', ['Chamado escolhido', 'Nenhum chamado']),
  ticketCreate: asks('Abrir Chamado: o chamado não é criado na prévia. Escolha o resultado a testar.', ['Chamado aberto', 'Não aberto']),
  ticketDetail: asks('Detalhe do Chamado: o chamado não é consultado na prévia. Escolha o resultado a testar.', ['Encontrado', 'Não encontrado']),
  crmIdentify: asks('Identificar Cliente: a consulta ao CRM não é feita na prévia. Escolha o resultado a testar.', ['Identificado', 'Não identificado']),
  crmContact: asks('Criar/Atualizar Contato: o CRM não é chamado na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  crmLead: asks('Capturar Lead: o CRM não é chamado na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  crmLeadUpdate: asks('Qualificar Lead: o CRM não é chamado na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  crmActivity: asks('Agendar Follow-up: a atividade não é criada na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  sequenceEnroll: asks('Inscrever em Lista: a inscrição não é feita na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  sequenceUnenroll: passes('Contato removido da lista.'),
  webchatHandoff: asks('Continuar no Chat: o link não é gerado na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  note: ends('Prévia interrompida: Nota (ID 2) não participa do atendimento.'),
  voltar: ends('Prévia interrompida: Retornar ao Menu (ID 2) não tem menu de destino.'),
  randomizer: asks('Randomizador: na plataforma o caminho é sorteado pelos pesos. Escolha o caminho a testar.', ['Caminho A (peso 50)', 'Caminho B (peso 50)']),
  languageRouter: asks('Idioma: a identificação acontece na plataforma. Escolha o idioma a testar.', ['Português', 'Inglês', 'Espanhol', 'Outro idioma']),
  adCondition: asks('Veio do anúncio? A origem da conversa não é conhecida na prévia. Escolha o caminho a testar.', ['Sim', 'Não']),
  waiting_time: passes('Tempo de espera não definido. Na prévia a conversa segue sem esperar.'),
  aiAgentBlock: asks('Agente de IA: a conversa com o agente não é simulada na prévia. Escolha a saída a testar.', ['Sem conclusão']),
  OpenAI: ends('Atendimento encaminhado para a IA “IA Generativa”. A prévia termina aqui.'),
  googleSheetsAppend: asks('Google Planilhas: a linha não é gravada na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  rdStationConversion: asks('RD Station: a conversão não é enviada na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  hubspotUpsertContact: asks('HubSpot: o contato não é enviado na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  multiple_condicional_api: asks('Múltipla Condição: escolha o caminho a testar.', ['Condição 1']),
  Data_Input_Condicional: waits('answer'),
  External_Message_Http: asks('API de Mensagem: a requisição não é enviada na prévia. Escolha o resultado a testar.', FAILURE_FIRST),
  condicional_api: asks('Condicional: escolha o caminho a testar.', ['Falso', 'Verdadeiro']),
  Send_DataStore: passes('Envio para o DataStore simulado.'),
  Local_DataStore: asks('DataStore Local: a base não é consultada na prévia. Escolha o resultado a testar.', FAILURE_FIRST),
  envio_boletos: asks('Enviar Boletos: os boletos não são consultados na prévia. Escolha o resultado a testar.', FAILURE_FIRST),
  api_options_menu: asks('Menu de Opções API: as opções vêm da API e não são carregadas na prévia. Escolha o resultado a testar.', SUCCESS_FIRST),
  Consent: asks('Consentimento: escolha a resposta do contato a testar.', ['Aceitou', 'Recusou']),
  sendConversion: passes('Conversão “Lead” enviada. Na plataforma, só é enviada quando a conversa veio de anúncio.'),
  trackEvent: passes('Evento sem nome registrado.'),
  tabulation: passes('Tabulação aplicada ao atendimento.'),
}

test('menu routing uses the option position even when edges are shuffled, by digit or by title', () => {
  const flow = menuFlow()
  const state = startPreview(flow)
  assert.equal(state.waiting, 'menu')
  assert.equal(state.messages[0], 'Escolha uma opção:\n\n10. Primeira\n20. Segunda')
  assert.deepEqual(replyPreview(flow, state, '10').messages.slice(0, 1), ['A'])
  assert.deepEqual(replyPreview(flow, state, '20').messages.slice(0, 1), ['B'])
  assert.deepEqual(replyPreview(flow, state, ' segunda ').messages.slice(0, 1), ['B'])
  const invalid = replyPreview(flow, state, '10foo')
  assert.equal(invalid.waiting, 'menu')
  assert.equal(invalid.messages[0], 'Opção inválida.\n\n10. Primeira\n20. Segunda')
})

test('waiting for a message stores the answer for @@@ variables and #NAME, case-insensitively', () => {
  const flow = newFlow()
  add(flow, 'waitForAnswer', '2', { customFields: 'name' })
  add(flow, 'waitForAnswer', '3', { customFields: 'custom:ab12:empresa' })
  message(flow, '4', 'Olá #NAME, da @@@EMPRESA (@@@ab12:empresa) @@@desconhecida')
  link(flow, 'inicio', '2'); link(flow, '2', '3'); link(flow, '3', '4')
  let state = startPreview(flow)
  assert.equal(state.waiting, 'answer')
  state = replyPreview(flow, state, 'Maria')
  assert.equal(state.waiting, 'answer')
  state = replyPreview(flow, state, 'ACME')
  assert.equal(state.messages[0], 'Olá Maria, da ACME (ACME) @@@desconhecida')
  assert.equal(flow.nodes[3].data.data.template, 'Olá #NAME, da @@@EMPRESA (@@@ab12:empresa) @@@desconhecida')
})

test('time conditions offer both branches, mark the current one and follow output-0 for outside hours', () => {
  const flow = newFlow()
  flow.nodes.push(newNode('timeConditions', { x: 0, y: 0 }, '2'))
  message(flow, '3', 'Fechado')
  message(flow, '4', 'Aberto')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  const open = startPreview(flow, MONDAY_10H)
  assert.equal(open.waiting, 'branch')
  assert.equal(open.messages[0], 'Condições de Tempo: escolha o caminho a testar.\n\n1. Fora do horário\n2. Dentro do horário (agora)')
  assert.deepEqual(open.options.map(option => option.text), ['Fora do horário', 'Dentro do horário (agora)'])
  assert.deepEqual(startPreview(flow, SUNDAY_10H).options.map(option => option.text), ['Fora do horário (agora)', 'Dentro do horário'])
  assert.equal(replyPreview(flow, open, '1').messages[0], 'Fechado')
  assert.equal(replyPreview(flow, open, '2').messages[0], 'Aberto')
  assert.match(replyPreview(flow, open, 'Aberto').messages[0], /^Opção inválida\./)
})

test('API preview never sends a request and fills response_map samples on success', () => {
  const flow = newFlow()
  add(flow, 'consulta_api', '2', { text: 'Consultando', response_map: [{ path: 'protocol', key: 'protocol', sample: 'PRT-0001', variable: 'protocol' }] })
  message(flow, '3', 'Falha ao consultar')
  message(flow, '4', 'Protocolo @@@protocol')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  const state = startPreview(flow)
  assert.equal(state.waiting, 'branch')
  assert.deepEqual(state.messages, ['Consultando', 'Consulta API: a requisição não é enviada na prévia. Escolha o resultado a testar.\n\n1. Falha\n2. Sucesso'])
  assert.deepEqual(state.options.map(option => [option.text, option.handle]), [['Falha', 'output-0'], ['Sucesso', 'output-1']])
  assert.equal(replyPreview(flow, state, '1').messages[0], 'Falha ao consultar')
  assert.equal(replyPreview(flow, state, '2').messages[0], 'Protocolo PRT-0001')
})

test('request data asks the question, retries with the error message and then follows the failure output', () => {
  const flow = newFlow()
  add(flow, 'solicitar_dados', '2', { text: 'Digite o ticket', error: 'Ticket não encontrado', tentativas: '2', response_map: [{ path: 'situacao', key: 'situacao', sample: 'Em análise', variable: 'SITUACAO' }] })
  message(flow, '3', 'Encaminhando para a equipe')
  message(flow, '4', 'Situação: @@@situacao, ticket @@@input')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  let state = startPreview(flow)
  assert.deepEqual([state.waiting, state.messages[0]], ['data', 'Digite o ticket'])
  state = replyPreview(flow, state, '123')
  assert.equal(state.waiting, 'branch')
  assert.equal(state.messages[0], 'Solicitar Dados: a API não é chamada na prévia. Escolha o resultado da validação.\n\n1. Falha\n2. Sucesso')
  const retry = replyPreview(flow, state, '1')
  assert.deepEqual([retry.waiting, retry.messages[0], retry.attempts], ['data', 'Ticket não encontrado', 2])
  const second = replyPreview(flow, retry, '456')
  assert.equal(replyPreview(flow, second, '1').messages[0], 'Encaminhando para a equipe')
  assert.equal(replyPreview(flow, state, '2').messages[0], 'Situação: Em análise, ticket 123')
})

test('request data without configured texts uses short defaults', () => {
  const flow = newFlow()
  add(flow, 'solicitar_dados', '2', { tentativas: '3' })
  message(flow, '3', 'Caminho de falha')
  message(flow, '4', 'Validado')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  const state = startPreview(flow)
  assert.deepEqual(state.messages, ['Informe o dado solicitado.'])
  const retry = replyPreview(flow, replyPreview(flow, state, 'abc'), '1')
  assert.deepEqual(retry.messages, ['Não foi possível validar. Tente novamente.'])
})

test('protocol, tags, transfers and finish are simulated without platform calls', () => {
  const flow = newFlow()
  flow.nodes.push(newNode('protocolo', { x: 0, y: 0 }, '2'))
  add(flow, 'tags', '3', { tags: 'VIP' })
  add(flow, 'departamentos', '4', { name: 'Equipe A' })
  link(flow, 'inicio', '2'); link(flow, '2', '3'); link(flow, '3', '4')
  const state = startPreview(flow)
  assert.deepEqual(state.messages, [
    'Seu protocolo é: [protocolo gerado na plataforma]',
    'Tag “VIP” aplicada ao atendimento.',
    'Transferido para o departamento “Equipe A”. A prévia termina aqui.',
  ])
  assert.equal(state.waiting, null)
  assert.equal(state.nodeId, null)
})

test('finishing components end the preview with a short note, even without names', () => {
  const finish = newFlow()
  add(finish, 'finalizar', '2', { message: 'Até logo, #NAME' })
  link(finish, 'inicio', '2')
  assert.deepEqual(advancePreview(finish, 'inicio', { variables: { name: 'Ana' } }).messages, ['Até logo, Ana', 'Conversa finalizada.'])
  const bare = newFlow()
  add(bare, 'tags', '2')
  add(bare, 'departamentos', '3')
  link(bare, 'inicio', '2'); link(bare, '2', '3')
  assert.deepEqual(startPreview(bare).messages, ['Tag aplicada ao atendimento.', 'Transferido para o departamento. A prévia termina aqui.'])
  const target = newFlow()
  add(target, 'flow', '2', { targetFlow: 'f-1' })
  link(target, 'inicio', '2')
  assert.deepEqual(startPreview(target).messages, ['Encaminhado para o fluxo “f-1”. A prévia termina aqui.'])
  const spaced = newFlow()
  add(spaced, 'departamentos', '2', { name: '   ', departamento: 'dep-9' })
  link(spaced, 'inicio', '2')
  assert.deepEqual(startPreview(spaced).messages, ['Transferido para o departamento “dep-9”. A prévia termina aqui.'])
})

test('disconnected outputs name the component and its id', () => {
  const empty = newFlow()
  assert.deepEqual(startPreview(empty).messages, ['A saída “Próximo” de Iniciar Fluxo (ID inicio) não está conectada.'])
  const loose = newFlow()
  message(loose, '2', 'Olá')
  link(loose, 'inicio', '2')
  const state = startPreview(loose)
  assert.deepEqual(state.messages, ['Olá', 'A saída “Próximo” de Enviar Mensagem (ID 2) não está conectada.'])
  assert.equal(state.waiting, null)
  const menu = menuFlow()
  menu.edges = menu.edges.filter(edge => edge.sourceHandle !== 'output-1')
  const reply = replyPreview(menu, startPreview(menu), '20')
  assert.deepEqual(reply.messages, ['A saída “Segunda” de Menu de Opções (ID 2) não está conectada.'])
  assert.equal(reply.waiting, null)
  const branch = scenario('apptBook', { errorMessage: 'Não foi possível agendar' })
  branch.edges = branch.edges.filter(edge => !(edge.source === '2' && edge.sourceHandle === 'output-1'))
  assert.deepEqual(play(branch, ['2']).messages, ['Não foi possível agendar', 'A saída “Não agendado” de Confirmar Agendamento (ID 2) não está conectada.'])
})

test('unsupported, missing or absent components stop the preview with a clear message', () => {
  const unknown = newFlow()
  unknown.nodes.push({ id: '2', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'future-type', data: {}, html: '' } })
  link(unknown, 'inicio', '2')
  assert.deepEqual(startPreview(unknown).messages, ['Prévia interrompida: future-type (ID 2) não tem simulação.'])
  assert.deepEqual(advancePreview(newFlow(), 'ghost').messages, ['Componente de destino não encontrado (ID ghost).'])
  const headless = newFlow()
  headless.nodes = []
  assert.deepEqual(startPreview(headless), { ...emptyPreview(), messages: ['O fluxo não tem o componente Iniciar Fluxo.'] })
  assert.deepEqual(advancePreview(newFlow(), undefined), emptyPreview())
})

test('replying without a pending question restarts the preview', () => {
  const flow = menuFlow()
  assert.deepEqual(replyPreview(flow, emptyPreview(), 'oi'), startPreview(flow))
  assert.deepEqual(replyPreview(flow, { ...startPreview(flow), nodeId: 'ghost' }, '10'), startPreview(flow))
})

test('the first connection of an output wins, as in the exported order', () => {
  const flow = newFlow()
  message(flow, '2', 'Primeiro')
  message(flow, '3', 'Segundo')
  flow.edges.push(createEdge(flow.edges, 'inicio', 'output-0', '2'), createEdge(flow.edges, 'inicio', 'output-0', '3'))
  assert.equal(startPreview(flow).messages[0], 'Primeiro')
})

test('automatic cycles stop after a bounded number of steps', () => {
  const flow = newFlow()
  message(flow, '2', 'loop')
  message(flow, '3', 'volta')
  link(flow, 'inicio', '2'); link(flow, '2', '3'); link(flow, '3', '2')
  const state = startPreview(flow)
  assert.equal(state.messages.length, 100)
  assert.equal(state.messages.at(-1), 'Prévia interrompida após 100 etapas automáticas. Verifique se há um ciclo sem resposta do contato.')
})

test('text rendering keeps unknown tokens and replaces {protocol}', () => {
  assert.equal(renderText('Seu protocolo é: {protocol} @@@x', { protocol: '42' }), 'Seu protocolo é: 42 @@@x')
  assert.equal(renderText(undefined, {}), '')
  assert.equal(renderText(5, {}), '5')
})

test('text rendering replaces {{variable}} markers in a single pass and ignores values that are not text', () => {
  assert.equal(renderText('Olá {{nome}}, protocolo {{ protocol }}, {protocol} e {{desconhecida}}', { nome: 'Ana', protocol: '42' }), 'Olá Ana, protocolo 42, 42 e {{desconhecida}}')
  assert.equal(renderText('{{NOME}} @@@nome #NAME', { nome: 'Ana', name: 'Ana Maria' }), 'Ana Ana Ana Maria')
  assert.equal(renderText('{{custom:c1:empresa}} {{empresa}}', { 'custom:c1:empresa': 'Loja A', empresa: 'Loja A' }), 'Loja A Loja A')
  assert.equal(renderText('@@@a {{b}}', { a: '{{b}}', b: '@@@a' }), '{{b}} @@@a')
  assert.equal(renderText('{{}} {{ }} {{a b}}', { a: 'x' }), '{{}} {{ }} {{a b}}')
  assert.equal(renderText({ texto: 'objeto' }, {}), '')
  assert.equal(renderText(['lista'], {}), '')
  assert.equal(renderText(null, {}), '')
})

test('variables named after Object.prototype members are left untouched unless captured', () => {
  const text = '@@@toString @@@constructor @@@__proto__ @@@hasOwnProperty #NAME {{constructor}} {{__proto__}}'
  assert.equal(renderText(text, {}), text)
  assert.equal(renderText('@@@constructor', { Constructor: 'capturado' }), 'capturado')
  assert.equal(renderText('@@@toString {{toString}}', { toString: 'valor' }), 'valor valor')
})

test('preview notes are PT-BR sentences that never cite the reference file', () => {
  const flows = [menuFlow(), newFlow()]
  const unknown = newFlow()
  unknown.nodes.push({ id: '2', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'future-type', data: {}, html: '' } })
  link(unknown, 'inicio', '2')
  flows.push(unknown)
  const notes = flows.flatMap(flow => {
    const state = startPreview(flow)
    return [...state.messages, ...replyPreview(flow, state, '99').messages]
  })
  for (const note of notes) assert.doesNotMatch(note, /JSON de referência|referência|undefined|null/, note)
})

test('every catalog component has an explicit first preview step for a new component', () => {
  assert.equal(new Set(TYPES).size, TYPES.length)
  assert.deepEqual([...TYPES].sort(), Object.keys(DEFAULT_STEPS).sort())
  for (const type of TYPES) {
    const state = startPreview(scenario(type), MONDAY_10H)
    assert.deepEqual({ waiting: state.waiting, messages: state.messages }, DEFAULT_STEPS[type], type)
    if (state.waiting) assert.equal(state.nodeId, '2', type)
    else assert.equal(state.nodeId, null, type)
  }
})

test('every output of every component can be reached in the preview, with professional notes', () => {
  for (const type of TYPES) {
    const flow = scenario(type)
    const handles = outputHandles(flow.nodes.find(node => node.id === '2'), flow.edges)
    const reached = new Set()
    const seen = new Set()
    const queue = [startPreview(flow, MONDAY_10H)]
    while (queue.length) {
      const state = queue.shift()
      for (const text of state.messages) {
        assert.equal(typeof text, 'string', type)
        assert.doesNotMatch(text, /não tem simulação|referência|undefined|null|\[object Object\]|[!—–]|\p{Extended_Pictographic}/u, `${type}: ${text}`)
        const match = /^Destino (\d+)$/.exec(text)
        if (match) reached.add(Number(match[1]))
      }
      if (!state.waiting) continue
      const key = `${state.nodeId} ${state.waiting} ${state.attempts}`
      if (seen.has(key)) continue
      seen.add(key)
      if (state.waiting === 'answer' || state.waiting === 'data') {
        assert.deepEqual(state.options, [], type)
        queue.push(replyPreview(flow, state, 'resposta', MONDAY_10H))
        continue
      }
      assert.deepEqual(state.options.map(option => option.handle), handles, type)
      assert.equal(new Set(state.options.map(option => option.digit)).size, handles.length, type)
      for (const option of state.options) queue.push(replyPreview(flow, state, option.digit, MONDAY_10H))
    }
    assert.deepEqual([...reached].sort((a, b) => a - b), handles.map((_, index) => index + 1), type)
  }
})

test('new menus without texts list the output label and skip the blank line', () => {
  const flow = scenario('envio_mensagem')
  const state = startPreview(flow)
  assert.deepEqual([state.waiting, state.messages], ['menu', ['1. Opção 1']])
  assert.deepEqual(replyPreview(flow, state, 'opção 1').messages, arrive(1))
  assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1))
  assert.deepEqual(startPreview(scenario('envio_mensagem', { 'opt-1': '', title: '   ' })).messages, ['1. Opção 1'])
  assert.deepEqual(play(scenario('envio_mensagem', { title: 'Olá {{nome}}' }), [], { nome: 'Ana' }).messages, ['Olá Ana\n\n1. Opção 1'])
  const empty = scenario('envio_mensagem')
  empty.nodes.find(node => node.id === '2').data.data = { title: 'Sem opções' }
  assert.deepEqual(startPreview(empty).messages, ['Prévia interrompida: Menu de Opções (ID 2) não tem opções.'])
})

test('files and images are described in text, with the caption and its variables', () => {
  const file = scenario('envio_arquivo', { url: 'https://arquivos.exemplo/manual.pdf', filename: 'manual.pdf', mime_type: 'application/pdf', caption: 'Segue o manual, #NAME' })
  assert.deepEqual(play(file, [], { name: 'Ana' }).messages, arrive(1, 'Arquivo “manual.pdf” enviado.\n\nSegue o manual, Ana'))
  assert.equal(startPreview(scenario('envio_arquivo', { url: 'https://arquivos.exemplo/manual.pdf' })).messages[0], 'Arquivo “https://arquivos.exemplo/manual.pdf” enviado.')
  assert.deepEqual(startPreview(scenario('envio_arquivo', { url: 'https://arquivos.exemplo/audio.ogg', filename: 'audio.ogg', mime_type: 'audio/ogg', voice_note: true })).messages, arrive(1, 'Mensagem de voz enviada.'))
  const image = scenario('envio_imagem', { imagem: 'https://arquivos.exemplo/foto.png', url: 'https://arquivos.exemplo/foto.png', caption: 'Confira {{produto}}' })
  assert.deepEqual(play(image, [], { produto: 'o catálogo' }).messages, arrive(1, 'Imagem “https://arquivos.exemplo/foto.png” enviada.\n\nConfira o catálogo'))
  assert.equal(startPreview(scenario('envio_imagem', { url: 'https://arquivos.exemplo/banner.png', filename: 'banner.png' })).messages[0], 'Imagem “banner.png” enviada.')
  assert.equal(startPreview(scenario('envio_imagem', { url: 'https://arquivos.exemplo/banner.png' })).messages[0], 'Imagem “https://arquivos.exemplo/banner.png” enviada.')
})

test('templates and PIX charges name the template, or its ID when the name is empty', () => {
  assert.deepEqual(startPreview(scenario('templateMessage', { templateMessage: 'tpl-1', id: 'tpl-1', templateName: 'boas_vindas_teste' })).messages, arrive(1, 'Template “boas_vindas_teste” enviado.'))
  assert.equal(startPreview(scenario('templateMessage', { templateMessage: 'tpl-1' })).messages[0], 'Template “tpl-1” enviado.')
  assert.deepEqual(startPreview(scenario('templateInteractive', { id: 'tpl-2', templateMessage: 'tpl-2' })).messages, arrive(1, 'Template interativo “tpl-2” enviado.'))
  assert.deepEqual(startPreview(scenario('pixCharge', { id: 'tpl-3', templateMessage: 'tpl-3', templateName: 'cobranca_teste' })).messages, arrive(1, 'Cobrança PIX enviada pelo template “cobranca_teste”.'))
})

test('the form shows its body, waits for the result and confirms only when answered', () => {
  const flow = scenario('whatsappFlow', { formId: 'form-1', formName: 'Cadastro de teste', body: 'Preencha o cadastro, #NAME', cta: 'Abrir', successMessage: 'Recebemos o cadastro', errorMessage: 'Cadastro não recebido' })
  const state = play(flow, [], { name: 'Ana' })
  assert.equal(state.waiting, 'branch')
  assert.deepEqual(state.messages, ['Preencha o cadastro, Ana', listing('Enviar Formulário: o formulário não abre na prévia. Escolha o resultado a testar.', 'Respondido', 'Não respondido')])
  const answered = replyPreview(flow, state, '1')
  assert.deepEqual(answered.messages, arrive(1, 'Recebemos o cadastro'))
  assert.equal(answered.variables.whatsappFlowResponse, '[resposta do formulário]')
  const unanswered = replyPreview(flow, state, '2')
  assert.deepEqual(unanswered.messages, arrive(2))
  assert.equal(Object.hasOwn(unanswered.variables, 'whatsappFlowResponse'), false)
  const echoed = scenario('whatsappFlow', { formId: 'form-1', outputVar: 'respostaCadastro', successMessage: 'Recebido: {{respostaCadastro}}' })
  assert.deepEqual(play(echoed, ['1']).messages, arrive(1, 'Recebido: [resposta do formulário]'))
  assert.equal(play(scenario('whatsappFlow', { formId: 'form-1', outputVar: '' }), ['1']).variables.whatsappFlowResponse, undefined)
  assert.equal(startPreview(scenario('whatsappFlow', { formName: 'Cadastro de teste' })).messages[0], 'Formulário “Cadastro de teste” enviado.')
  assert.equal(startPreview(scenario('whatsappFlow', { formId: 'form-1' })).messages[0], 'Formulário “form-1” enviado.')
})

test('transfers to an agent, back to the agent and to the AI agents end the preview', () => {
  assert.deepEqual(startPreview(scenario('transferir', { id: 'ag-1', agente: 'ag-1', agenteName: 'Agente A' })).messages, ['Transferido para o agente “Agente A”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('transferir', { agente: 'ag-1' })).messages, ['Transferido para o agente “ag-1”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('backToAgent', { department: 'dep-1', id: 'dep-1', departmentName: 'Equipe B' })).messages, ['Atendimento devolvido ao agente no departamento “Equipe B”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('backToAgent', { department: 'dep-1' })).messages, ['Atendimento devolvido ao agente no departamento “dep-1”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('OpenAI', { aiModel: 'modelo-teste', 'df-OpenAI': 'Assistente A' })).messages, ['Atendimento encaminhado para a IA “modelo-teste”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('OpenAI', { 'df-OpenAI': 'Assistente A' })).messages, ['Atendimento encaminhado para a IA “Assistente A”. A prévia termina aqui.'])
  assert.deepEqual(startPreview(scenario('OpenAI', { aiProvider: '' })).messages, ['Atendimento encaminhado para a IA. A prévia termina aqui.'])
  const state = startPreview(scenario('transferir'))
  assert.deepEqual([state.waiting, state.nodeId, state.options], [null, null, []])
})

test('the call transfer shows the button only on success and the error message on failure', () => {
  const flow = scenario('whatsappCall', { text: 'Fale com a equipe, #NAME', displayText: 'Chamar a equipe', errorMessage: 'Ligação indisponível', outsideHoursMessage: 'Fora do horário de ligação' })
  const state = play(flow, [], { name: 'Ana' })
  assert.deepEqual(state.messages, [listing('Transferir para Ligação: a ligação não acontece na prévia. Escolha o resultado a testar.', 'Sucesso', 'Falha')])
  assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1, 'Fale com a equipe, Ana\n\n[Chamar a equipe]'))
  assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2, 'Ligação indisponível'))
  assert.deepEqual(play(scenario('whatsappCall', { displayText: 'Chamar' }), ['1']).messages, arrive(1, '[Chamar]'))
  assert.deepEqual(play(scenario('whatsappCall'), ['1']).messages, arrive(1))
})

function returnFlow(data) {
  const flow = newFlow()
  add(flow, 'envio_mensagem', 'm', { title: 'Menu\nprincipal', 'text-1': 'Repetir' })
  add(flow, 'voltar', 'v', data)
  link(flow, 'inicio', 'm')
  link(flow, 'm', 'v')
  return flow
}

test('return to menu sends the destination menu again with its current title', () => {
  const flow = returnFlow({ id: 'm', targetNodeId: 'm', availableNodes: [{ id: 'm', value: 'm', name: 'Título antigo' }], targetNodeName: 'Título antigo', title: '', description: '' })
  const state = replyPreview(flow, startPreview(flow), '1')
  assert.deepEqual([state.waiting, state.nodeId], ['menu', 'm'])
  assert.deepEqual(state.messages, ['Retorno ao menu “Menu principal”.', 'Menu\nprincipal\n\n1. Repetir'])
  assert.deepEqual(replyPreview(flow, state, '1').messages, state.messages)
  const untitled = returnFlow({ id: 'm', targetNodeId: 'm' })
  untitled.nodes.find(node => node.id === 'm').data.data.title = ''
  assert.deepEqual(replyPreview(untitled, startPreview(untitled), '1').messages, ['Retorno ao menu “m”.', '1. Repetir'])
  const greeting = returnFlow({ id: 'm', targetNodeId: 'm' })
  greeting.nodes.find(node => node.id === 'm').data.data.title = 'Olá {{nome}}, escolha uma opção:'
  assert.deepEqual(play(greeting, ['1'], { nome: 'Ana' }).messages, ['Retorno ao menu “Olá Ana, escolha uma opção:”.', 'Olá Ana, escolha uma opção:\n\n1. Repetir'])
  const blankTitle = returnFlow({ id: 'm', targetNodeId: 'm' })
  blankTitle.nodes.find(node => node.id === 'm').data.data.title = '{{vazio}}'
  assert.deepEqual(play(blankTitle, ['1'], { vazio: ' ' }).messages, ['Retorno ao menu “m”.', '1. Repetir'])
  const unset = returnFlow({ id: '' })
  assert.deepEqual(replyPreview(unset, startPreview(unset), '1').messages, ['Prévia interrompida: Retornar ao Menu (ID v) não tem menu de destino.'])
  const gone = returnFlow({ id: 'x', targetNodeId: 'x' })
  assert.deepEqual(replyPreview(gone, startPreview(gone), '1').messages, ['Componente de destino não encontrado (ID x).'])
  const other = returnFlow({ id: 'e', targetNodeId: 'e' })
  add(other, 'finalizar', 'e', { message: 'Até logo' })
  assert.deepEqual(replyPreview(other, startPreview(other), '1').messages, ['Retorno ao menu “e”.', 'Até logo', 'Conversa finalizada.'])
})

test('the chat handoff stores the link and replaces {{link}} only on success', () => {
  const flow = scenario('webchatHandoff', { widgetId: 'w-1', message: 'Continue pelo chat: {{link}} ({{linkChat}})', outputVar: 'linkChat', errorMessage: 'Não foi possível gerar o link', welcomeMessage: 'Boas-vindas ao chat' })
  const state = startPreview(flow)
  assert.deepEqual(state.messages, [listing('Continuar no Chat: o link não é gerado na prévia. Escolha o resultado a testar.', 'Sucesso', 'Falha')])
  const success = replyPreview(flow, state, '1')
  assert.deepEqual(success.messages, arrive(1, 'Continue pelo chat: [link do chat gerado na plataforma] ([link do chat gerado na plataforma])'))
  assert.deepEqual(success.variables, { linkChat: '[link do chat gerado na plataforma]' })
  const failure = replyPreview(flow, state, '2')
  assert.deepEqual([failure.messages, failure.variables], [arrive(2, 'Não foi possível gerar o link'), {}])
  assert.deepEqual(play(scenario('webchatHandoff', { message: 'Link: {{link}}', outputVar: '' }), ['1']).messages, arrive(1, 'Link: [link do chat gerado na plataforma]'))
})

test('the waiting time continues at once and describes the configured delay', () => {
  const delay = value => startPreview(scenario('waiting_time', { waiting_time: value, id: value })).messages[0]
  assert.equal(delay('1000'), 'Tempo de espera de 1 segundo. Na prévia a conversa segue sem esperar.')
  assert.equal(delay('3000'), 'Tempo de espera de 3 segundos. Na prévia a conversa segue sem esperar.')
  assert.equal(delay('1500'), 'Tempo de espera de 1,5 segundos. Na prévia a conversa segue sem esperar.')
  assert.equal(delay('120000'), 'Tempo de espera de 120 segundos. Na prévia a conversa segue sem esperar.')
  for (const value of ['', '0', 'abc', ' 3000', '-1000']) assert.equal(delay(value), 'Tempo de espera não definido. Na prévia a conversa segue sem esperar.', value)
  const state = startPreview(scenario('waiting_time', { waiting_time: '4000', id: '4000' }))
  assert.deepEqual([state.waiting, state.messages.slice(1)], [null, arrive(1)])
})

test('the randomizer shows the weights and stores the chosen path in the variable', () => {
  const flow = scenario('randomizer', { paths: [{ label: 'Variante A', weight: 70 }, { label: '', weight: 30.5 }, { label: 'Variante C' }], variable: 'grupo' })
  const state = startPreview(flow)
  assert.deepEqual(state.messages, [listing('Randomizador: na plataforma o caminho é sorteado pelos pesos. Escolha o caminho a testar.', 'Variante A (peso 70)', 'Caminho 2 (peso 30,5)', 'Variante C')])
  const second = replyPreview(flow, state, '2')
  assert.deepEqual([second.messages, second.variables], [arrive(2), { grupo: 'Caminho 2' }])
  assert.equal(replyPreview(flow, state, '1').variables.grupo, 'Variante A')
  assert.deepEqual(play(scenario('randomizer'), ['1']).variables, {})
})

test('the language router stores the language code, except for other languages', () => {
  const flow = scenario('languageRouter', { variable: 'idioma_contato' })
  const state = startPreview(flow)
  assert.deepEqual(['1', '2', '3', '4'].map(digit => replyPreview(flow, state, digit).variables.idioma_contato), ['pt', 'en', 'es', undefined])
  assert.deepEqual(replyPreview(flow, state, '4').messages, arrive(4))
  assert.deepEqual(play(scenario('languageRouter'), ['2']).variables, { idioma: 'en' })
  assert.deepEqual(play(scenario('languageRouter', { variable: '' }), ['2']).variables, {})
})

test('the ad origin and the consent ask the tester for the path', () => {
  for (const [type, labels] of [['adCondition', ['Sim', 'Não']], ['Consent', ['Aceitou', 'Recusou']]]) {
    const flow = scenario(type)
    const state = startPreview(flow)
    assert.deepEqual(texts(state), labels, type)
    assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1), type)
    assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2), type)
    assert.match(replyPreview(flow, state, labels[0]).messages[0], /^Opção inválida\./, type)
  }
})

test('conversion, event, tabulation and tag notes name what was registered', () => {
  assert.deepEqual(startPreview(scenario('sendConversion', { eventName: 'Purchase', onlyFromAd: false })).messages, arrive(1, 'Conversão “Purchase” enviada.'))
  assert.equal(startPreview(scenario('sendConversion', { customEventName: 'cadastro_teste' })).messages[0], 'Conversão “cadastro_teste” enviada. Na plataforma, só é enviada quando a conversa veio de anúncio.')
  assert.deepEqual(startPreview(scenario('trackEvent', { eventName: 'evento_teste' })).messages, arrive(1, 'Evento “evento_teste” registrado.'))
  assert.equal(startPreview(scenario('tabulation', { tabulation: 'tab-1', id: 'tab-1', tabulacao: 'tab-1', tabulacaoName: 'Tabulação A' })).messages[0], 'Tabulação “Tabulação A” aplicada ao atendimento.')
  assert.equal(startPreview(scenario('tabulation', { tabulacao: 'tab-1' })).messages[0], 'Tabulação “tab-1” aplicada ao atendimento.')
  assert.deepEqual(play(scenario('tags', { tags: 'VIP', selectedTag: 't-1', message: 'Bem-vindo ao grupo {{grupo}}, #NAME' }), [], { name: 'Ana', grupo: 'VIP' }).messages, arrive(1, 'Tag “VIP” aplicada ao atendimento.', 'Bem-vindo ao grupo VIP, Ana'))
  assert.equal(startPreview(scenario('tags', { selectedTag: 't-1' })).messages[0], 'Tag “t-1” aplicada ao atendimento.')
})

test('conditions mark the expected path when the compared variable is known', () => {
  const equal = scenario('condicional_api', { condition: 'Igual a', key: 'situacao', value: 'ativo' })
  assert.deepEqual(play(equal, [], { situacao: ' ativo ' }).messages, [listing('Condicional: escolha o caminho a testar.', 'Falso', 'Verdadeiro (agora)')])
  assert.deepEqual(texts(play(equal, [], { SITUACAO: 'inativo' })), ['Falso (agora)', 'Verdadeiro'])
  assert.deepEqual(texts(play(equal, [], {})), ['Falso', 'Verdadeiro'])
  const different = scenario('condicional_api', { condition: 'Diferente de', key: 'situacao', value: 'ativo' })
  assert.deepEqual(texts(play(different, [], { situacao: 'ativo' })), ['Falso (agora)', 'Verdadeiro'])
  assert.deepEqual(texts(play(different, [], { situacao: 'bloqueado' })), ['Falso', 'Verdadeiro (agora)'])
  assert.deepEqual(texts(play(scenario('condicional_api', { condition: 'Contém', key: 'situacao', value: 'ativo' }), [], { situacao: 'ativo' })), ['Falso', 'Verdadeiro'])
  assert.deepEqual(play(equal, ['1'], { situacao: 'ativo' }).messages, arrive(1))
  const multiple = scenario('multiple_condicional_api', { 'var-1': 'plano', 'value-1': 'basico', 'var-2': 'plano', 'value-2': 'premium', 'var-3': 'plano', 'value-3': 'premium', 'var-4': '', 'value-4': '' })
  assert.deepEqual(play(multiple, [], { plano: 'premium' }).messages, [listing('Múltipla Condição: escolha o caminho a testar.', 'plano = basico', 'plano = premium (agora)', 'plano = premium', 'Condição 4')])
  assert.deepEqual(texts(play(multiple, [], {})), ['plano = basico', 'plano = premium', 'plano = premium', 'Condição 4'])
  assert.deepEqual(play(multiple, ['4']).messages, arrive(4))
})

test('the data entry waits for the answer, stores it in the field and asks for the validation result', () => {
  const flow = scenario('Data_Input_Condicional', { field: 'custom:c1:documento', validation: 'cpf' })
  const start = startPreview(flow)
  assert.deepEqual([start.waiting, start.messages, start.nodeId], ['answer', [], '2'])
  const answered = replyPreview(flow, start, ' 123 ')
  assert.equal(answered.waiting, 'branch')
  assert.deepEqual(answered.messages, [listing('Entrada de Dados: a validação não é executada na prévia. Escolha o resultado a testar.', 'Válido', 'Inválido')])
  assert.deepEqual([answered.variables['custom:c1:documento'], answered.variables.documento], ['123', '123'])
  assert.deepEqual(replyPreview(flow, answered, '2').messages, arrive(2))
  assert.equal(replyPreview(flow, answered, '1').variables.documento, '123')
  assert.deepEqual(play(scenario('Data_Input_Condicional'), ['abc']).variables, {})
})

test('message API, local datastore and invoices ask for the result, failure first', () => {
  const cases = [
    ['External_Message_Http', { url_api: 'https://api.exemplo/mensagem' }, 'API de Mensagem: a requisição não é enviada na prévia. Escolha o resultado a testar.', []],
    ['Local_DataStore', { local_datastore: 'contact' }, 'DataStore Local: a base não é consultada na prévia. Escolha o resultado a testar.', []],
    ['envio_boletos', { text: 'Buscando os boletos, #NAME' }, 'Enviar Boletos: os boletos não são consultados na prévia. Escolha o resultado a testar.', ['Buscando os boletos, Ana']],
  ]
  for (const [type, data, intro, before] of cases) {
    const flow = scenario(type, data)
    const state = play(flow, [], { name: 'Ana' })
    assert.deepEqual(state.messages, [...before, listing(intro, 'Falha', 'Sucesso')], type)
    assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1), type)
    assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2), type)
  }
})

test('the API options menu shows its message and stores a sample option only on success', () => {
  const flow = scenario('api_options_menu', { message: 'Escolha a fatura', variableName: 'fatura' })
  const state = startPreview(flow)
  assert.deepEqual(state.messages, ['Escolha a fatura', listing('Menu de Opções API: as opções vêm da API e não são carregadas na prévia. Escolha o resultado a testar.', 'Sucesso', 'Falha')])
  assert.deepEqual(replyPreview(flow, state, '1').variables, { fatura: '[opção escolhida]' })
  assert.deepEqual(replyPreview(flow, state, '2').variables, {})
  assert.equal(play(scenario('api_options_menu'), ['1']).variables.option, '[opção escolhida]')
})

test('the datastore upload continues without asking', () => {
  const state = startPreview(scenario('Send_DataStore', { url_api: 'https://api.exemplo/datastore' }))
  assert.deepEqual([state.waiting, state.messages], [null, arrive(1, 'Envio para o DataStore simulado.')])
})

test('integrations store the sample result only on success', () => {
  for (const [type, data, key] of [['googleSheetsAppend', { resultVar: 'linha' }, 'linha'], ['rdStationConversion', { resultVar: 'conversao' }, 'conversao'], ['hubspotUpsertContact', {}, 'hubspot_id']]) {
    const flow = scenario(type, data)
    const state = startPreview(flow)
    assert.deepEqual(texts(state), SUCCESS_FIRST, type)
    const success = replyPreview(flow, state, '1')
    assert.deepEqual([success.messages, success.variables], [arrive(1), { [key]: '[retorno da integração]' }], type)
    assert.deepEqual(replyPreview(flow, state, '2').variables, {}, type)
  }
  assert.deepEqual(play(scenario('googleSheetsAppend'), ['1']).variables, {})
})

test('schedule and ticket lists show the header on the positive path and the empty message on the other', () => {
  const lists = [
    ['apptService', 'appt_serviceId', '[serviço escolhido]'],
    ['apptLocation', 'appt_locationId', '[local escolhido]'],
    ['apptProvider', 'appt_providerId', '[profissional escolhido]'],
    ['apptSlot', 'appt_slotStart', '[horário escolhido]'],
    ['ticketLookup', 'ticketId', '[chamado escolhido]'],
  ]
  for (const [type, key, sample] of lists) {
    const flow = scenario(type, { headerMessage: `Opções para {{nome}}: {{${key}}}`, emptyMessage: 'Nada disponível para {{nome}}' })
    const state = play(flow, [], { nome: 'Ana' })
    const chosen = replyPreview(flow, state, '1')
    assert.deepEqual([chosen.messages, chosen.variables], [arrive(1, `Opções para Ana: {{${key}}}`), { nome: 'Ana', [key]: sample }], type)
    const empty = replyPreview(flow, state, '2')
    assert.deepEqual([empty.messages, empty.variables], [arrive(2, 'Nada disponível para Ana'), { nome: 'Ana' }], type)
  }
  assert.deepEqual(play(scenario('apptService', { outputVar: 'servico' }), ['1']).variables, { servico: '[serviço escolhido]' })
  assert.deepEqual(play(scenario('apptService'), ['1']).messages, arrive(1))
})

test('client identification stores the sample client in the configured variables', () => {
  const appt = scenario('apptIdentify')
  assert.deepEqual(play(appt, ['1']).variables, { appt_contactId: '[cliente identificado]' })
  assert.deepEqual(play(appt, ['2']).variables, {})
  const crm = scenario('crmIdentify')
  assert.deepEqual(play(crm, ['1']).variables, { crmContactName: '[contato identificado]', crmContactId: '[ID do CRM]' })
  assert.deepEqual(play(crm, ['2']).variables, {})
  assert.deepEqual(play(scenario('crmIdentify', { leadVar: '' }), ['1']).variables, { crmContactName: '[contato identificado]' })
})

test('the customer intake lists the requested data and confirms on success', () => {
  const flow = scenario('apptCustomerIntake', { introMessage: 'Precisamos de alguns dados, #NAME', askEmail: true, askNotes: true, successMessage: 'Cadastro concluído' })
  const state = play(flow, [], { name: 'Ana' })
  assert.deepEqual(state.messages, ['Precisamos de alguns dados, Ana', listing('Dados do Cliente: a plataforma pede nome, e-mail e observações. Escolha o resultado a testar.', 'Dados registrados', 'Dados não registrados')])
  assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1, 'Cadastro concluído'))
  assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2))
  const intro = data => startPreview(scenario('apptCustomerIntake', data)).messages[0].split('\n')[0]
  assert.equal(intro({ askEmail: true }), 'Dados do Cliente: a plataforma pede nome e e-mail. Escolha o resultado a testar.')
  assert.equal(intro({ askName: false, askNotes: true }), 'Dados do Cliente: a plataforma pede observações. Escolha o resultado a testar.')
  assert.equal(intro({ askName: false }), 'Dados do Cliente: a plataforma não pede dados. Escolha o resultado a testar.')
})

test('the booking stores the appointment before the confirmation and shows the error on failure', () => {
  const flow = scenario('apptBook', { successMessage: 'Reserva {{appt_appointmentId}} confirmada', errorMessage: 'Não foi possível agendar', conflictMessage: 'Horário ocupado' })
  const state = startPreview(flow)
  const booked = replyPreview(flow, state, '1')
  assert.deepEqual([booked.messages, booked.variables], [arrive(1, 'Reserva [agendamento criado] confirmada'), { appt_appointmentId: '[agendamento criado]' }])
  const failed = replyPreview(flow, state, '2')
  assert.deepEqual([failed.messages, failed.variables], [arrive(2, 'Não foi possível agendar'), {}])
})

test('the ticket creation asks the fallback question or explains the form, then fills the ticket markers', () => {
  const flow = scenario('ticketCreate', { introMessage: 'Vamos registrar a solicitação', fallbackQuestion: 'Descreva o problema', successMessage: 'Chamado {{ticketNumber}} aberto: {{link}}', errorMessage: 'Falha ao registrar a solicitação' })
  const asked = startPreview(flow)
  assert.deepEqual([asked.waiting, asked.messages], ['data', ['Vamos registrar a solicitação', 'Descreva o problema']])
  const result = replyPreview(flow, asked, 'Sem acesso')
  assert.deepEqual([result.waiting, result.messages, result.variables], ['branch', [listing('Abrir Chamado: o chamado não é criado na prévia. Escolha o resultado a testar.', 'Chamado aberto', 'Não aberto')], {}])
  const opened = replyPreview(flow, result, '1')
  assert.deepEqual(opened.messages, arrive(1, 'Chamado [número do chamado] aberto: [link do chamado]'))
  assert.deepEqual(opened.variables, { ticketId: '[chamado aberto]', ticketNumber: '[número do chamado]', link: '[link do chamado]' })
  assert.deepEqual(replyPreview(flow, result, '2').messages, arrive(2, 'Falha ao registrar a solicitação'))
  const form = startPreview(scenario('ticketCreate', { formId: 'form-1', fallbackQuestion: 'Descreva o problema' }))
  assert.deepEqual([form.waiting, form.messages[0]], ['branch', 'O formulário é enviado pela plataforma e não abre na prévia.'])
})

test('the ticket detail shows the active actions on the positive path', () => {
  const flow = scenario('ticketDetail', { actionPrompt: 'O que deseja fazer, #NAME?', notFoundMessage: 'Chamado não localizado', enableReopen: false })
  const state = play(flow, [], { name: 'Ana' })
  assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1, 'O que deseja fazer, Ana?\n\nAções oferecidas pela plataforma: Comentar, Encerrar e Avaliar.'))
  assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2, 'Chamado não localizado'))
  assert.deepEqual(play(scenario('ticketDetail', { enableComment: false, enableReopen: false, enableClose: false }), ['1']).messages, arrive(1, 'Ações oferecidas pela plataforma: Avaliar.'))
  assert.deepEqual(play(scenario('ticketDetail', { enableComment: false, enableReopen: false, enableClose: false, enableCsat: false }), ['1']).messages, arrive(1))
})

test('the CRM contact and lead register sample ids and show their messages', () => {
  const contact = scenario('crmContact', { introMessage: 'Vamos salvar o contato', successMessage: 'Contato {{crmContactId}} salvo', errorMessage: 'Não foi possível salvar' })
  const state = startPreview(contact)
  assert.deepEqual(state.messages, ['Vamos salvar o contato', listing('Criar/Atualizar Contato: o CRM não é chamado na prévia. Escolha o resultado a testar.', 'Sucesso', 'Falha')])
  assert.deepEqual(replyPreview(contact, state, '1').messages, arrive(1, 'Contato [ID do contato] salvo'))
  assert.deepEqual(replyPreview(contact, state, '2').messages, arrive(2, 'Não foi possível salvar'))
  const lead = scenario('crmLead', { qualifyPrompt: 'Qual é o orçamento?', successMessage: 'Lead registrado', errorMessage: 'Lead não registrado' })
  const asked = startPreview(lead)
  assert.deepEqual([asked.waiting, asked.messages], ['data', ['Qual é o orçamento?']])
  const result = replyPreview(lead, asked, 'Alto')
  assert.deepEqual([result.messages, result.variables], [[listing('Capturar Lead: o CRM não é chamado na prévia. Escolha o resultado a testar.', 'Sucesso', 'Falha')], {}])
  const captured = replyPreview(lead, result, '1')
  assert.deepEqual([captured.messages, captured.variables], [arrive(1, 'Lead registrado'), { crmLeadId: '[ID do lead]' }])
  assert.deepEqual(replyPreview(lead, result, '2').messages, arrive(2, 'Lead não registrado'))
})

test('the lead update, the follow-up and the list enrollment follow the chosen result', () => {
  for (const [type, data, done] of [['crmLeadUpdate', { setStatus: 'etapa_teste', doneMessage: 'Lead atualizado' }, ['Lead atualizado']], ['crmActivity', { title: 'Retornar contato', doneMessage: 'Follow-up agendado' }, ['Follow-up agendado']], ['sequenceEnroll', { sequenceId: 'lista-1', sequenceName: 'Lista A' }, []]]) {
    const flow = scenario(type, data)
    const state = startPreview(flow)
    assert.deepEqual(texts(state), SUCCESS_FIRST, type)
    assert.deepEqual(replyPreview(flow, state, '1').messages, arrive(1, ...done), type)
    assert.deepEqual(replyPreview(flow, state, '2').messages, arrive(2), type)
  }
})

test('the list removal names the list or all the lists', () => {
  assert.deepEqual(startPreview(scenario('sequenceUnenroll', { sequenceId: 'lista-1', sequenceName: 'Lista A' })).messages, arrive(1, 'Contato removido da lista “Lista A”.'))
  assert.equal(startPreview(scenario('sequenceUnenroll', { sequenceId: 'lista-1' })).messages[0], 'Contato removido da lista “lista-1”.')
  assert.equal(startPreview(scenario('sequenceUnenroll', { sequenceId: 'lista-1', allSequences: true })).messages[0], 'Contato removido de todas as listas.')
})

test('the AI agent lists its exits by name and the no-conclusion output last', () => {
  const flow = scenario('aiAgentBlock', { exits: [{ name: 'Compra', when: 'Quando quiser comprar', requireFields: false }, { name: '', when: '' }] })
  const state = startPreview(flow)
  assert.deepEqual(state.messages, [listing('Agente de IA: a conversa com o agente não é simulada na prévia. Escolha a saída a testar.', 'Compra', 'Saída 2', 'Sem conclusão')])
  assert.deepEqual(replyPreview(flow, state, '3').messages, arrive(3))
})

test('notes never take part in the preview', () => {
  const loose = scenario('envio_pergunta', { template: 'Olá' })
  add(loose, 'note', 'nota', { text: 'Revisar este texto' })
  assert.deepEqual(startPreview(loose).messages, arrive(1, 'Olá'))
  const wired = newFlow()
  message(wired, '2', 'Antes')
  add(wired, 'note', '3')
  link(wired, 'inicio', '2'); link(wired, '2', '3')
  assert.deepEqual(startPreview(wired).messages, ['Antes', 'Prévia interrompida: Nota (ID 3) não participa do atendimento.'])
})

test('choices without outputs stop instead of waiting for an impossible answer', () => {
  const conditions = scenario('multiple_condicional_api')
  conditions.nodes.find(node => node.id === '2').data.data = {}
  assert.deepEqual(startPreview(conditions).messages, ['Prévia interrompida: Múltipla Condição (ID 2) não tem saídas.'])
  const paths = scenario('randomizer', { paths: [] })
  const state = startPreview(paths)
  assert.deepEqual([state.waiting, state.messages], [null, ['Prévia interrompida: Randomizador (teste A/B) (ID 2) não tem saídas.']])
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map(file => file.trim()).filter(Boolean)
if (!referenceFiles.length) {
  test('reference flows: the preview answers every reachable choice', { skip: `Defina FLOW_REFERENCE com um ou mais arquivos JSON, separados por "${path.delimiter}".` }, () => {})
}
for (const [index, file] of referenceFiles.entries()) {
  test(`reference flow ${index + 1}: the preview answers every reachable choice without breaking`, { skip: !fs.existsSync(file) && `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.` }, () => {
    const flow = importFlow(fs.readFileSync(file, 'utf8'))
    const nodes = new Map(flow.nodes.map(node => [node.id, node]))
    const queue = [startPreview(flow, MONDAY_10H), startPreview(flow, SUNDAY_10H)]
    const seen = new Set()
    while (queue.length) {
      const state = queue.shift()
      for (const text of state.messages) {
        assert.equal(typeof text, 'string')
        assert.doesNotMatch(text, /não tem simulação|undefined|\[object Object\]/, text)
      }
      if (!state.waiting) continue
      const key = `${state.nodeId} ${state.waiting} ${state.attempts}`
      if (seen.has(key)) continue
      seen.add(key)
      const node = nodes.get(state.nodeId)
      assert.ok(node, String(state.nodeId))
      if (state.waiting === 'menu' || state.waiting === 'branch') {
        const handles = outputHandles(node, flow.edges)
        assert.ok(state.options.length > 0, node.id)
        assert.equal(new Set(state.options.map(option => option.digit)).size, state.options.length, node.id)
        for (const option of state.options) {
          assert.ok(handles.includes(option.handle), `${node.id} ${option.handle}`)
          queue.push(replyPreview(flow, state, option.digit, MONDAY_10H))
        }
      } else queue.push(replyPreview(flow, state, '12345', MONDAY_10H))
    }
  })
}
