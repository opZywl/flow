const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createEdge, importFlow, newFlow, newNode } = require('../lib/atendimento/format.ts')
const { advancePreview, emptyPreview, renderText, replyPreview, startPreview } = require('../lib/atendimento/simulator.ts')

const link = (flow, source, target, handle = 'output-0') => flow.edges.push(createEdge(flow.edges, source, handle, target))
const message = (flow, id, text) => { const node = newNode('envio_pergunta', { x: 0, y: 0 }, id); node.data.data.template = text; flow.nodes.push(node); return node }
const add = (flow, type, id, data = {}) => { const node = newNode(type, { x: 0, y: 0 }, id); Object.assign(node.data.data, data); flow.nodes.push(node); return node }
const MONDAY_10H = new Date(2026, 9, 5, 10, 0)
const SUNDAY_10H = new Date(2026, 9, 4, 10, 0)

function menuFlow() {
  const flow = newFlow()
  add(flow, 'envio_mensagem', '2', { 'opt-1': '10', 'text-1': 'Primeira', 'opt-2': '20', 'text-2': 'Segunda' })
  message(flow, '3', 'A')
  message(flow, '4', 'B')
  link(flow, '2', '4', 'output-1')
  link(flow, 'inicio', '2')
  link(flow, '2', '3', 'output-0')
  return flow
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
  add(flow, 'waitForAnswer', '3', { customFields: 'custom:6a97:empresa' })
  message(flow, '4', 'Olá #NAME, da @@@EMPRESA (@@@6a97:empresa) @@@desconhecida')
  link(flow, 'inicio', '2'); link(flow, '2', '3'); link(flow, '3', '4')
  let state = startPreview(flow)
  assert.equal(state.waiting, 'answer')
  state = replyPreview(flow, state, 'Maria')
  assert.equal(state.waiting, 'answer')
  state = replyPreview(flow, state, 'ERA')
  assert.equal(state.messages[0], 'Olá Maria, da ERA (ERA) @@@desconhecida')
  assert.equal(flow.nodes[3].data.data.template, 'Olá #NAME, da @@@EMPRESA (@@@6a97:empresa) @@@desconhecida')
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
  add(flow, 'consulta_api', '2', { text: 'Consultando', response_map: [{ path: 'protocol', key: 'protocol', sample: '*113772*', variable: 'protocol' }] })
  message(flow, '3', 'Não conseguimos abrir')
  message(flow, '4', 'Protocolo @@@protocol')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  const state = startPreview(flow)
  assert.equal(state.waiting, 'branch')
  assert.deepEqual(state.messages, ['Consultando', 'Consulta API: a requisição não é enviada na prévia. Escolha o resultado a testar.\n\n1. Falha\n2. Sucesso'])
  assert.deepEqual(state.options.map(option => [option.text, option.handle]), [['Falha', 'output-0'], ['Sucesso', 'output-1']])
  assert.equal(replyPreview(flow, state, '1').messages[0], 'Não conseguimos abrir')
  assert.equal(replyPreview(flow, state, '2').messages[0], 'Protocolo *113772*')
})

test('request data asks the question, retries with the error message and then follows the failure output', () => {
  const flow = newFlow()
  add(flow, 'solicitar_dados', '2', { text: 'Digite o ticket', error: 'Ticket não encontrado', tentativas: '2', response_map: [{ path: 'FASE', key: 'FASE', sample: 'Novo', variable: 'FASE' }] })
  message(flow, '3', 'Vamos transferir')
  message(flow, '4', 'Fase: @@@fase, ticket @@@input')
  link(flow, 'inicio', '2'); link(flow, '2', '3', 'output-0'); link(flow, '2', '4', 'output-1')
  let state = startPreview(flow)
  assert.deepEqual([state.waiting, state.messages[0]], ['data', 'Digite o ticket'])
  state = replyPreview(flow, state, '123')
  assert.equal(state.waiting, 'branch')
  assert.equal(state.messages[0], 'Solicitar Dados: a API não é chamada na prévia. Escolha o resultado da validação.\n\n1. Falha\n2. Sucesso')
  const retry = replyPreview(flow, state, '1')
  assert.deepEqual([retry.waiting, retry.messages[0], retry.attempts], ['data', 'Ticket não encontrado', 2])
  const second = replyPreview(flow, retry, '456')
  assert.equal(replyPreview(flow, second, '1').messages[0], 'Vamos transferir')
  assert.equal(replyPreview(flow, state, '2').messages[0], 'Fase: Novo, ticket 123')
})

test('request data without configured texts uses short defaults', () => {
  const flow = newFlow()
  add(flow, 'solicitar_dados', '2', { tentativas: '3' })
  message(flow, '3', 'Falhou')
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
  add(flow, 'departamentos', '4', { name: 'Suporte' })
  link(flow, 'inicio', '2'); link(flow, '2', '3'); link(flow, '3', '4')
  const state = startPreview(flow)
  assert.deepEqual(state.messages, [
    'Seu protocolo é: [protocolo gerado na plataforma]',
    'Tag “VIP” aplicada ao atendimento.',
    'Transferido para o departamento “Suporte”. A prévia termina aqui.',
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
})

test('unsupported, missing or absent components stop the preview with a clear message', () => {
  const unknown = newFlow()
  unknown.nodes.push({ id: '2', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'future-type', data: {}, html: '' } })
  link(unknown, 'inicio', '2')
  assert.deepEqual(startPreview(unknown).messages, ['Prévia interrompida: future-type não tem simulação.'])
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

test('variables named after Object.prototype members are left untouched unless captured', () => {
  const text = '@@@toString @@@constructor @@@__proto__ @@@hasOwnProperty #NAME'
  assert.equal(renderText(text, {}), text)
  assert.equal(renderText('@@@constructor', { Constructor: 'capturado' }), 'capturado')
  assert.equal(renderText('@@@toString', { toString: 'valor' }), 'valor')
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

const reference = process.env.FLOW_REFERENCE
test('reference flow: greeting, main menu and business-hours branches', { skip: !reference || !fs.existsSync(reference) }, () => {
  const flow = importFlow(fs.readFileSync(reference, 'utf8'))
  const state = startPreview(flow, MONDAY_10H)
  assert.equal(state.waiting, 'menu')
  assert.match(state.messages.at(-1), /1\. Suporte\n2\. Ativações\n3\. Comercial\n4\. Financeiro/)
  const support = replyPreview(flow, state, '1', MONDAY_10H)
  assert.deepEqual(support.options.map(option => option.text), ['Fora do horário', 'Dentro do horário (agora)'])
  assert.match(replyPreview(flow, support, '1', MONDAY_10H).messages[0], /fora do horário/)
  assert.match(replyPreview(flow, support, '2', MONDAY_10H).messages[0], /nome da sua empresa/)
  assert.deepEqual(replyPreview(flow, state, '4', MONDAY_10H).messages, ['Encaminhado para o fluxo “Fluxo Financeiro”. A prévia termina aqui.'])
})
