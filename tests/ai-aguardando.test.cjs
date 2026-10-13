const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { WAIT_QUESTION_MESSAGE, validateFlow, exportFlow, importFlow, newFlow, newNode, createEdge, outputHandles } = require('../lib/atendimento/format.ts')
const { componentCatalog, START_ID, START_TYPE } = require('../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow, waitQuestion } = require('../lib/atendimento/ai/assemble.ts')
const { evaluateRi, needsCorrection, concludeGeneration, reviewFlow } = require('../lib/atendimento/ai/review.ts')
const { applyEdit, concludeEdit, reviewEdit, needsEditCorrection } = require('../lib/atendimento/ai/edit.ts')
const { layoutBox } = require('../lib/atendimento/ai/layout.ts')
const { COMPONENT_GUIDE } = require('../lib/atendimento/ai/guide.ts')

const NOW = new Date('2026-10-13T12:00:00.000Z')
const pairs = config => Object.entries(config).map(([key, value]) => ({ key, value }))
const node = (id, type, config = {}) => ({ id, type, config: pairs(config) })
const edge = (from, output, to) => ({ from, output, to })
const flowOf = (nodes, edges) => ({ name: 'Fluxo de teste', description: 'Fluxo usado nos testes', nodes, edges })
const waitIssues = flow => validateFlow(flow).filter(issue => issue.message === WAIT_QUESTION_MESSAGE)
const typeOf = (flow, id) => flow.nodes.find(entry => entry.id === id)?.data.type
const incoming = (flow, id) => flow.edges.filter(entry => entry.target === id)

function assertEveryWaitAsked(flow) {
  for (const wait of flow.nodes.filter(entry => entry.data.type === 'waitForAnswer')) {
    for (const link of incoming(flow, wait.id)) assert.equal(typeOf(flow, link.source), 'envio_pergunta', `entrada de ${wait.id}`)
  }
  assert.deepEqual(waitIssues(flow), [])
}

function assertNoOverlap(flow) {
  const boxes = flow.nodes.map(entry => ({ id: entry.id, x: entry.position.x, y: entry.position.y, ...layoutBox(entry) }))
  for (let first = 0; first < boxes.length; first++) {
    for (let second = first + 1; second < boxes.length; second++) {
      const a = boxes[first]
      const b = boxes[second]
      const apart = a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height
      assert.ok(apart, `${a.id} sobrepõe ${b.id}`)
    }
  }
}

function assertRoundTrip(flow) {
  const text = exportFlow(flow)
  const imported = importFlow(text)
  assert.deepEqual(imported, flow)
  assert.equal(exportFlow(imported), text)
}

function chain(originType) {
  const flow = newFlow(NOW)
  const wait = newNode('waitForAnswer', { x: 900, y: 0 }, '3')
  wait.data.data.customFields = 'name'
  flow.nodes.push(wait)
  let source = START_ID
  let handle = 'output-0'
  if (originType !== START_TYPE) {
    const origin = newNode(originType, { x: 400, y: 0 }, '2')
    flow.nodes.push(origin)
    source = origin.id
    handle = outputHandles(origin)[0] ?? 'output-0'
    flow.edges.push(createEdge(flow.edges, START_ID, 'output-0', origin.id))
  }
  flow.edges.push(createEdge(flow.edges, source, handle, wait.id))
  return flow
}

test('the editor warns about a waitForAnswer whose input comes from anything other than Enviar Mensagem', () => {
  const origins = [START_TYPE, ...componentCatalog.map(entry => entry.nativeType).filter(type => type !== START_TYPE && type !== 'note' && type !== 'envio_pergunta')]
  assert.ok(origins.length >= 60, `${origins.length} tipos`)
  for (const type of origins) {
    const flow = chain(type)
    assert.deepEqual(waitIssues(flow).filter(issue => issue.nodeId === '3'), [{ severity: 'warning', message: WAIT_QUESTION_MESSAGE, nodeId: '3' }], type)
  }
  const asked = chain('envio_pergunta')
  asked.nodes[1].data.data.template = 'Qual é o seu nome?'
  assert.deepEqual(waitIssues(asked), [])
  const twice = chain('waitForAnswer')
  twice.nodes.find(entry => entry.id === '2').data.data.customFields = 'empresa'
  assert.deepEqual(waitIssues(twice).map(issue => issue.nodeId).sort(), ['2', '3'])
  const merged = chain('envio_mensagem')
  merged.edges.push(createEdge(merged.edges, START_ID, 'output-0', '3'))
  assert.equal(waitIssues(merged).length, 1)
  const orphan = newFlow(NOW)
  orphan.nodes.push(newNode('waitForAnswer', { x: 0, y: 0 }, '2'))
  assert.deepEqual(waitIssues(orphan), [])
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map(file => file.trim()).filter(Boolean)
for (const [index, file] of referenceFiles.entries()) {
  test(`arquivo de referência ${index + 1}: nenhum aviso de pergunta antes do Aguardando Mensagem`, { skip: !fs.existsSync(file) && `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.` }, () => {
    const content = fs.readFileSync(file, 'utf8')
    const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    const flow = importFlow(content)
    const waits = flow.nodes.filter(entry => entry.data.type === 'waitForAnswer')
    assert.ok(waits.length > 0)
    assertEveryWaitAsked(flow)
    const kept = concludeEdit(flow, applyEdit(flow, {}, { now: NOW }))
    assert.equal(exportFlow(kept.flow), raw)
  })
}

test('waitForAnswer guide says it always comes right after an Enviar Mensagem with the question', () => {
  const rules = COMPONENT_GUIDE.waitForAnswer.rules.join(' ')
  assert.ok(rules.includes('Faça a pergunta antes, com Enviar Mensagem.'))
  assert.ok(rules.includes('Ele vem sempre logo depois de um Enviar Mensagem com a pergunta, ligado direto na saída desse Enviar Mensagem, e guarda a resposta.'))
  assert.ok(!/[—–!]/.test(rules))
})

test('generation sends the missing question back to the model and explains where it goes', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: '["Cadastro","Encerrar"]' }),
    node('espera', 'waitForAnswer', { customFields: 'name' }),
    node('obrigado', 'envio_pergunta', { template: 'Obrigado, @@@name.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Cadastro', 'espera'), edge('espera', '', 'obrigado'), edge('obrigado', '', 'fim'), edge('menu', 'Encerrar', 'fim')])
  const evaluation = evaluateRi(ri, { now: NOW })
  const issue = evaluation.issues.find(entry => entry.message === WAIT_QUESTION_MESSAGE)
  assert.deepEqual([issue.severity, issue.scope, issue.riId, issue.type], ['warning', 'ia', 'espera', 'waitForAnswer'])
  assert.equal(needsCorrection(evaluation), true)
  assert.ok(evaluation.pending.includes('[espera] Aguardando Mensagem: Coloque um Enviar Mensagem com a pergunta logo antes do Aguardando Mensagem. A pergunta vai num Enviar Mensagem (envio_pergunta) ligado direto à entrada do Aguardando Mensagem, que guarda a resposta. Ligue “menu” ao novo Enviar Mensagem e ligue esse Enviar Mensagem a “espera”.'), evaluation.pending.join('\n'))
  for (const item of evaluation.pending) assert.ok(!/[—–!]/.test(item), item)

  const fixed = evaluateRi(flowOf([
    node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: '["Cadastro","Encerrar"]' }),
    node('pede_nome', 'envio_pergunta', { template: 'Qual é o seu nome?' }),
    node('espera', 'waitForAnswer', { customFields: 'name' }),
    node('obrigado', 'envio_pergunta', { template: 'Obrigado, @@@name.' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Cadastro', 'pede_nome'), edge('pede_nome', '', 'espera'), edge('espera', '', 'obrigado'), edge('obrigado', '', 'fim'), edge('menu', 'Encerrar', 'fim')]), { now: NOW })
  assert.equal(fixed.issues.some(entry => entry.message === WAIT_QUESTION_MESSAGE), false)
  assert.equal(needsCorrection(fixed), false)
})

test('finalizeFlow puts a coherent question right before each waitForAnswer still without one', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: '["Cadastro","Suporte"]' }),
    node('nome', 'waitForAnswer', { customFields: 'name' }),
    node('empresa', 'waitForAnswer', { customFields: 'empresa' }),
    node('problema', 'waitForAnswer', { customFields: 'custom:6a9705d5:problem_description' }),
    node('data', 'waitForAnswer', { customFields: 'field_2', mask: 'DD/MM/YYYY' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Cadastro', 'nome'), edge('nome', '', 'empresa'), edge('empresa', '', 'fim'), edge('menu', 'Suporte', 'problema'), edge('problema', '', 'data'), edge('data', '', 'fim')])
  const assembled = assembleFlow(ri, { now: NOW })
  assert.equal(waitIssues(assembled.flow).length, 4)
  const finished = finalizeFlow(assembled)
  const { flow } = finished
  assertEveryWaitAsked(flow)
  const questionOf = riId => {
    const id = assembled.platformIds.get(riId)
    const [link] = incoming(flow, id)
    return flow.nodes.find(entry => entry.id === link.source).data.data.template
  }
  assert.equal(questionOf('nome'), 'Por favor, digite o seu nome.')
  assert.equal(questionOf('empresa'), 'Por favor, informe o nome da sua empresa.')
  assert.equal(questionOf('problema'), 'Por favor, conte com detalhes o que aconteceu.')
  assert.equal(questionOf('data'), 'Por favor, envie a sua resposta para continuarmos. Use o formato DD/MM/AAAA.')
  const menu = flow.nodes.find(entry => entry.id === assembled.platformIds.get('menu'))
  const fromMenu = flow.edges.filter(entry => entry.source === menu.id)
  assert.deepEqual(fromMenu.map(entry => entry.sourceHandle), ['output-0', 'output-1'])
  for (const link of fromMenu) assert.equal(typeOf(flow, link.target), 'envio_pergunta')
  const adjustments = finished.notes.filter(note => note.message.startsWith('Foi incluído um Enviar Mensagem com a pergunta'))
  assert.equal(adjustments.length, 4)
  for (const note of adjustments) {
    assert.equal(note.scope, 'ajuste')
    assert.equal(note.type, 'envio_pergunta')
    assert.match(note.message, /Revise\.$/)
    assert.ok(!/[—–!]/.test(note.message))
  }
  assert.deepEqual(adjustments.map(note => note.riId).sort(), ['data', 'empresa', 'nome', 'problema'])
  assert.deepEqual(validateFlow(flow).filter(issue => issue.severity === 'error'), [])
  assertNoOverlap(flow)
  assertRoundTrip(flow)

  const outcome = concludeGeneration(evaluateRi(ri, { now: NOW }))
  assertEveryWaitAsked(outcome.workflow)
  assert.equal(outcome.issues.some(issue => issue.message === WAIT_QUESTION_MESSAGE), false)
  assert.equal(outcome.issues.filter(issue => issue.message.startsWith('Foi incluído um Enviar Mensagem')).length, 4)
  assertRoundTrip(outcome.workflow)
  assert.deepEqual(reviewFlow(finished).filter(issue => issue.scope === 'ia' && issue.message === WAIT_QUESTION_MESSAGE), [])
})

test('the question follows the field the waitForAnswer keeps, or stays generic and cordial', () => {
  assert.equal(waitQuestion({ customFields: 'name' }), 'Por favor, digite o seu nome.')
  assert.equal(waitQuestion({ customFields: 'custom:ab12:email' }), 'Por favor, informe o seu e-mail.')
  assert.equal(waitQuestion({ customFields: 'custom:ab12:cpf' }), 'Por favor, informe o seu CPF.')
  assert.equal(waitQuestion({ customFields: 'custom:ab12:numero_contrato' }), 'Por favor, informe: numero contrato.')
  assert.equal(waitQuestion({ customFields: 'field_1' }), 'Por favor, envie a sua resposta para continuarmos.')
  assert.equal(waitQuestion({ customFields: '' }), 'Por favor, envie a sua resposta para continuarmos.')
  assert.equal(waitQuestion({}), 'Por favor, envie a sua resposta para continuarmos.')
})

const BASE_RI = flowOf([
  node('boas_vindas', 'envio_pergunta', { template: 'Olá, #NAME. Você está no atendimento da Loja Exemplo.' }),
  node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: '["Pedidos","Encerrar"]' }),
  node('pedidos', 'envio_pergunta', { template: 'Vou chamar a equipe de pedidos.' }),
  node('equipe', 'departamentos', { departamento: '12', name: 'Pedidos' }),
  node('despedida', 'envio_pergunta', { template: 'Obrigado pelo contato. Até logo.' }),
  node('fim', 'finalizar'),
], [edge('inicio', '', 'boas_vindas'), edge('boas_vindas', '', 'menu'), edge('menu', 'Pedidos', 'pedidos'), edge('pedidos', '', 'equipe'), edge('menu', 'Encerrar', 'despedida'), edge('despedida', '', 'fim')])

function base() {
  return importFlow(exportFlow(finalizeFlow(assembleFlow(BASE_RI, { now: NOW })).flow))
}

test('concludeEdit puts the question before a new waitForAnswer and keeps the rest of the flow', () => {
  const original = base()
  const menu = original.nodes.find(entry => entry.data.type === 'envio_mensagem')
  const notice = original.nodes.find(entry => entry.data.data.template === 'Vou chamar a equipe de pedidos.')
  const bye = original.nodes.find(entry => entry.data.data.template === 'Obrigado pelo contato. Até logo.')
  const delta = {
    nodes: [node('numero_pedido', 'waitForAnswer', { customFields: 'custom:ab12:pedido' })],
    edges: [edge(menu.id, 'Pedidos', 'numero_pedido'), edge('numero_pedido', '', notice.id), edge(menu.id, 'Encerrar', bye.id)],
  }
  const applied = applyEdit(original, delta, { now: NOW })
  const waitId = applied.ids.get('numero_pedido')
  assert.ok(waitId)
  assert.equal(typeOf(applied.flow, incoming(applied.flow, waitId)[0].source), 'envio_mensagem')
  const review = reviewEdit(original, applied)
  assert.equal(needsEditCorrection(review), true)
  assert.ok(review.pending.some(item => item.includes(WAIT_QUESTION_MESSAGE) && item.includes('A pergunta vai num Enviar Mensagem (envio_pergunta) ligado direto à entrada do Aguardando Mensagem')), review.pending.join('\n'))

  const done = concludeEdit(original, applied)
  const { flow } = done
  assertEveryWaitAsked(flow)
  const [link] = incoming(flow, waitId)
  const ask = flow.nodes.find(entry => entry.id === link.source)
  assert.equal(ask.data.type, 'envio_pergunta')
  assert.equal(ask.data.data.template, 'Por favor, informe o número do seu pedido.')
  assert.ok(!original.nodes.some(entry => entry.id === ask.id))
  const fromMenu = flow.edges.find(entry => entry.source === menu.id && entry.sourceHandle === 'output-0')
  assert.equal(fromMenu.target, ask.id)
  const note = done.notes.find(entry => entry.message.startsWith('Foi incluído um Enviar Mensagem'))
  assert.deepEqual([note.scope, note.nodeId, note.riId, note.type], ['ajuste', ask.id, 'numero_pedido', 'envio_pergunta'])
  assert.match(note.message, /Revise\.$/)
  for (const entry of original.nodes) {
    if (entry.id === menu.id) continue
    const after = flow.nodes.find(candidate => candidate.id === entry.id)
    assert.equal(JSON.stringify(after), JSON.stringify(entry), `componente ${entry.id} mudou`)
  }
  assertNoOverlap(flow)
  assert.deepEqual(validateFlow(flow).filter(issue => issue.severity === 'error'), [])
  assertRoundTrip(flow)
})

test('concludeEdit leaves an old waitForAnswer that the edit does not touch as it was', () => {
  const original = base()
  const menu = original.nodes.find(entry => entry.data.type === 'envio_mensagem')
  const notice = original.nodes.find(entry => entry.data.data.template === 'Vou chamar a equipe de pedidos.')
  const old = newNode('waitForAnswer', { x: 2000, y: 1200 }, '30')
  old.data.data.customFields = 'name'
  original.nodes.push(old)
  const index = original.edges.findIndex(entry => entry.source === menu.id && entry.sourceHandle === 'output-0')
  original.edges[index] = createEdge(original.edges.filter((_, position) => position !== index), menu.id, 'output-0', old.id)
  original.edges.push(createEdge(original.edges, old.id, 'output-0', notice.id))
  const before = importFlow(exportFlow(original))
  assert.equal(waitIssues(before).length, 1)
  const delta = { nodes: [node(notice.id, 'envio_pergunta', { template: 'Vou chamar a equipe de pedidos agora.' })], edges: [] }
  const done = concludeEdit(before, applyEdit(before, delta, { now: NOW }))
  assert.equal(incoming(done.flow, old.id)[0].source, menu.id)
  assert.equal(done.notes.some(entry => entry.message.startsWith('Foi incluído um Enviar Mensagem')), false)
  assert.equal(done.flow.nodes.length, before.nodes.length)
  const review = reviewEdit(before, done)
  assert.equal(review.issues.some(issue => issue.message === WAIT_QUESTION_MESSAGE), false)
  assertRoundTrip(done.flow)
})
