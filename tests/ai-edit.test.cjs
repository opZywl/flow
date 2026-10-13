const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const { applyEdit, flowToRi, concludeEdit, reviewEdit, needsEditCorrection, diffFlows, deltaBetween, editSystemPrompt, editRequestPrompt, editCorrectionPrompt, editResumePrompt } = require('../lib/atendimento/ai/edit.ts')
const { previewEdit } = require('../lib/atendimento/ai/preview.ts')
const { systemPrompt } = require('../lib/atendimento/ai/prompt.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { layoutBox } = require('../lib/atendimento/ai/layout.ts')
const { validateFlow, exportFlow, importFlow, newNode } = require('../lib/atendimento/format.ts')
const { START_ID, getTemplate } = require('../lib/atendimento/catalog.ts')

const NOW = new Date('2026-10-13T12:00:00.000Z')

const RI = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, menu e transferência',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Boletos' }, { text: 'Encerrar' }]) }] },
    { id: 'aviso_agenda', type: 'envio_pergunta', config: [{ key: 'template', value: 'Vou chamar a equipe de agendamento.' }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'departamento', value: '12' }, { key: 'name', value: 'Agendamento' }] },
    { id: 'boletos', type: 'envio_pergunta', config: [{ key: 'template', value: 'Os boletos chegam por e-mail todo dia 5.' }] },
    { id: 'volta', type: 'voltar', config: [{ key: 'targetNodeId', value: 'menu' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato. Até logo.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Agendar consulta', to: 'aviso_agenda' },
    { from: 'aviso_agenda', output: '', to: 'agenda' },
    { from: 'menu', output: 'Boletos', to: 'boletos' },
    { from: 'boletos', output: '', to: 'volta' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

function buildBase() {
  const flow = finalizeFlow(assembleFlow(RI, { now: NOW })).flow
  const welcome = flow.nodes.find((node) => node.data.data.template === RI.nodes[0].config[0].value)
  welcome.data.data.chaveDaPlataforma = 'manter'
  welcome.customFlag = true
  welcome.position = { x: 333.5, y: -12.25 }
  const note = newNode('note', { x: 40, y: 900 }, '40')
  note.data.data.text = 'Lembrete interno.'
  const loose = newNode('envio_pergunta', { x: 40, y: 1100 }, '41')
  loose.data.data.template = 'Mensagem solta que ainda não foi usada.'
  flow.nodes.push(note, loose)
  return importFlow(JSON.parse(JSON.stringify(flow)))
}

const BASE = buildBase()
const byTemplate = (flow, text) => flow.nodes.find((node) => node.data.data.template === text)
const byType = (flow, type) => flow.nodes.filter((node) => node.data.type === type)
const MENU = byType(BASE, 'envio_mensagem')[0]
const WELCOME = byTemplate(BASE, RI.nodes[0].config[0].value)
const NOTICE = byTemplate(BASE, RI.nodes[2].config[0].value)
const AGENDA = byType(BASE, 'departamentos')[0]
const BOLETOS = byTemplate(BASE, RI.nodes[4].config[0].value)
const VOLTA = byType(BASE, 'voltar')[0]
const BYE = byTemplate(BASE, RI.nodes[6].config[0].value)

function errors(flow) {
  return validateFlow(flow).filter((issue) => issue.severity === 'error').map((issue) => `${issue.nodeId}:${issue.message}`)
}

function assertNoNewErrors(before, after) {
  const known = new Set(errors(before))
  assert.deepEqual(errors(after).filter((issue) => !known.has(issue)), [])
}

function assertRoundTrip(flow) {
  const text = exportFlow(flow)
  assert.equal(exportFlow(importFlow(text)), text)
}

function assertUntouched(before, after, cited) {
  const nodes = new Map(after.nodes.map((node) => [node.id, node]))
  for (const node of before.nodes) {
    if (cited.includes(node.id) || !nodes.has(node.id)) continue
    assert.equal(JSON.stringify(nodes.get(node.id)), JSON.stringify(node), `componente ${node.id} mudou`)
  }
  const edges = new Map(after.edges.map((edge) => [edge.id, edge]))
  for (const edge of before.edges) {
    if (cited.includes(edge.source) || !nodes.has(edge.source) || !nodes.has(edge.target)) continue
    assert.equal(JSON.stringify(edges.get(edge.id)), JSON.stringify(edge), `conexão ${edge.id} mudou`)
  }
}

function assertNoOverlap(flow, ids) {
  for (const id of ids) {
    const node = flow.nodes.find((entry) => entry.id === id)
    const box = layoutBox(node)
    for (const other of flow.nodes) {
      if (other.id === id) continue
      const near = layoutBox(other)
      const apart = node.position.x >= other.position.x + near.width || other.position.x >= node.position.x + box.width || node.position.y >= other.position.y + near.height || other.position.y >= node.position.y + box.height
      assert.ok(apart, `${id} sobrepõe ${other.id}`)
    }
  }
}

function assertReturnsValid(flow, before = BASE) {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]))
  const previous = new Map(before.nodes.map((node) => [node.id, node]))
  const broken = new Set(byType(before, 'voltar').filter((node) => previous.get(node.data.data.targetNodeId)?.data.type !== 'envio_mensagem').map((node) => node.id))
  for (const node of byType(flow, 'voltar')) {
    if (broken.has(node.id)) continue
    const target = nodes.get(node.data.data.targetNodeId)
    assert.ok(target, `Retornar ao Menu ${node.id} aponta para ${node.data.data.targetNodeId}`)
    assert.equal(target.data.type, 'envio_mensagem')
    assert.equal(node.data.data.id, node.data.data.targetNodeId)
  }
}

const ADD_FINANCE = {
  name: '',
  description: '',
  nodes: [
    { id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Boletos' }, { text: 'Financeiro' }, { text: 'Encerrar' }]) }] },
    { id: 'aviso_financeiro', type: 'envio_pergunta', config: [{ key: 'template', value: 'Vou chamar a equipe financeira.' }] },
    { id: 'financeiro', type: 'departamentos', config: [{ key: 'departamento', value: '30' }, { key: 'name', value: 'Financeiro' }] },
  ],
  edges: [
    { from: MENU.id, output: 'Agendar consulta', to: NOTICE.id },
    { from: MENU.id, output: 'Boletos', to: BOLETOS.id },
    { from: MENU.id, output: 'Financeiro', to: 'aviso_financeiro' },
    { from: MENU.id, output: 'Encerrar', to: BYE.id },
    { from: 'aviso_financeiro', output: '', to: 'financeiro' },
  ],
}

test('o arquivo de edição não tem console, comentários, travessão nem exclamação nos textos', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/atendimento/ai/edit.ts'), 'utf8')
  assert.equal(/console\./.test(source), false)
  assert.equal(/\/\/\s|\/\*/.test(source.replace(/https?:\/\//g, '')), false)
  assert.equal(/[—–]/.test(source), false)
  for (const text of [editSystemPrompt().slice(systemPrompt().length), editRequestPrompt(BASE, 'Adicione o financeiro.', true), editCorrectionPrompt(['[3] pendência'], { changes: flowToRi(BASE), removed: ['9'] }), editResumePrompt(true)]) {
    assert.equal(/[!—–]/.test(text), false, text)
  }
})

test('flowToRi descreve o fluxo aberto com os ids, os campos preenchidos e as saídas pelo rótulo', () => {
  const ri = flowToRi(BASE)
  assert.equal(ri.name, BASE.name)
  assert.equal(ri.nodes.some((node) => node.id === START_ID || node.type === 'trigger_message'), false)
  assert.deepEqual(new Set(ri.nodes.map((node) => node.id)), new Set(BASE.nodes.filter((node) => node.id !== START_ID).map((node) => node.id)))
  assert.deepEqual(ri.nodes.slice(0, 3).map((node) => node.id), [WELCOME.id, MENU.id, NOTICE.id])
  const menu = ri.nodes.find((node) => node.id === MENU.id)
  assert.equal(menu.type, 'envio_mensagem')
  assert.deepEqual(JSON.parse(menu.config.find((entry) => entry.key === 'options').value), [{ text: 'Agendar consulta' }, { text: 'Boletos' }, { text: 'Encerrar' }])
  assert.deepEqual(ri.nodes.find((node) => node.id === AGENDA.id).config, [{ key: 'departamento', value: '12' }, { key: 'name', value: 'Agendamento' }])
  assert.deepEqual(ri.nodes.find((node) => node.id === VOLTA.id).config.find((entry) => entry.key === 'targetNodeId'), { key: 'targetNodeId', value: MENU.id })
  assert.ok(ri.nodes.find((node) => node.id === '40').config.some((entry) => entry.value === 'Lembrete interno.'))
  assert.ok(ri.nodes.every((node) => node.config.every((entry) => entry.value.trim() !== '')))
  assert.deepEqual(ri.edges.slice(0, 2), [{ from: 'inicio', output: '', to: WELCOME.id }, { from: WELCOME.id, output: '', to: MENU.id }])
  assert.ok(ri.edges.some((edge) => edge.from === MENU.id && edge.output === 'Boletos' && edge.to === BOLETOS.id))
  assert.equal(ri.edges.length, BASE.edges.length)
})

test('reenviar o próprio fluxo como edição não muda nada', () => {
  const result = applyEdit(BASE, flowToRi(BASE), { now: NOW })
  assert.deepEqual(result.changes, { added: 0, changed: 0, removed: 0 })
  assert.equal(exportFlow(result.flow), exportFlow(BASE))
})

test('delta vazio ou inválido devolve o fluxo igual', () => {
  for (const delta of [null, undefined, 'texto', 42, [], {}, { nodes: [], edges: [] }, { name: '', description: '', nodes: [{ id: '', type: 'nada' }], edges: [{ from: 'x', output: '', to: 'y' }] }]) {
    const result = applyEdit(BASE, delta, { now: NOW })
    assert.equal(exportFlow(result.flow), exportFlow(BASE), JSON.stringify(delta))
    assert.deepEqual(result.changes, { added: 0, changed: 0, removed: 0 })
  }
  const review = reviewEdit(BASE, applyEdit(BASE, {}, { now: NOW }))
  assert.equal(review.unchanged, true)
  assert.match(review.pending[0], /nenhuma mudança/)
})

test('adicionar um ramo mantém os não citados idênticos e encaixa os novos à direita, sem sobrepor', () => {
  const result = applyEdit(BASE, ADD_FINANCE, { now: NOW })
  assert.deepEqual(result.changes, { added: 2, changed: 1, removed: 0 })
  assertUntouched(BASE, result.flow, [MENU.id])
  const fresh = result.flow.nodes.filter((node) => !BASE.nodes.some((entry) => entry.id === node.id))
  assert.equal(fresh.length, 2)
  for (const node of fresh) assert.match(node.id, /^\d+$/)
  assert.equal(new Set(result.flow.nodes.map((node) => node.id)).size, result.flow.nodes.length)
  const notice = fresh.find((node) => node.data.type === 'envio_pergunta')
  const finance = fresh.find((node) => node.data.type === 'departamentos')
  assert.equal(result.ids.get('aviso_financeiro'), notice.id)
  assert.equal(result.ids.get('financeiro'), finance.id)
  const menu = result.flow.nodes.find((node) => node.id === MENU.id)
  assert.ok(notice.position.x >= menu.position.x + layoutBox(menu).width)
  assert.ok(finance.position.x >= notice.position.x + layoutBox(notice).width)
  assertNoOverlap(result.flow, fresh.map((node) => node.id))
  assert.deepEqual(menu.position, MENU.position)
  assert.equal(menu.data.data['text-3'], 'Financeiro')
  const outputs = Object.fromEntries(result.flow.edges.filter((edge) => edge.source === MENU.id).map((edge) => [edge.sourceHandle, edge.target]))
  assert.deepEqual(outputs, { 'output-0': NOTICE.id, 'output-1': BOLETOS.id, 'output-2': notice.id, 'output-3': BYE.id })
  for (const edge of BASE.edges.filter((entry) => entry.source === MENU.id && entry.sourceHandle === 'output-0')) assert.ok(result.flow.edges.some((entry) => entry.id === edge.id))
  assertNoNewErrors(BASE, result.flow)
  assertReturnsValid(result.flow)
  assertRoundTrip(result.flow)
  assert.deepEqual(result.notes.filter((note) => note.scope === 'ia'), [])
})

test('componente alterado mantém id, posição, chaves desconhecidas e os campos que a resposta não trouxe', () => {
  const delta = { name: '', description: '', nodes: [{ id: WELCOME.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Bem-vindo de volta, #NAME.' }] }, { id: AGENDA.id, type: 'departamentos', config: [{ key: 'name', value: 'Agenda Central' }] }], edges: [] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 0, changed: 2, removed: 0 })
  const welcome = result.flow.nodes.find((node) => node.id === WELCOME.id)
  assert.deepEqual(welcome.position, { x: 333.5, y: -12.25 })
  assert.equal(welcome.customFlag, true)
  assert.equal(welcome.data.data.chaveDaPlataforma, 'manter')
  assert.equal(welcome.data.data.template, 'Bem-vindo de volta, #NAME.')
  assert.equal(welcome.data.html, WELCOME.data.html)
  assert.deepEqual(welcome.measured, WELCOME.measured)
  assert.deepEqual(Object.keys(welcome.data.data), Object.keys(WELCOME.data.data))
  const agenda = result.flow.nodes.find((node) => node.id === AGENDA.id)
  assert.equal(agenda.data.data.name, 'Agenda Central')
  assert.equal(agenda.data.data.departamento, '12')
  assert.equal(agenda.data.data.id, AGENDA.data.data.id)
  assertUntouched(BASE, result.flow, [WELCOME.id, AGENDA.id])
  assert.deepEqual(result.flow.edges, BASE.edges)
  assertNoNewErrors(BASE, result.flow)
  assertRoundTrip(result.flow)
})

test('valor inválido ou vazio num campo citado mantém o valor atual', () => {
  const delta = { nodes: [{ id: AGENDA.id, type: 'departamentos', config: [{ key: 'name', value: '' }, { key: 'departamento', value: '   ' }] }, { id: MENU.id, type: 'envio_mensagem', config: [{ key: 'buttons', value: 'talvez' }] }], edges: [] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 0, changed: 0, removed: 0 })
  assert.equal(exportFlow(result.flow), exportFlow(BASE))
  assert.ok(result.notes.some((note) => note.scope === 'ia' && /talvez/.test(note.message)))
})

test('trocar o destino de uma opção remove o que só ela alcançava, mas não notas nem componentes já soltos', () => {
  const delta = {
    nodes: [{ id: 'aviso_boletos', type: 'envio_pergunta', config: [{ key: 'template', value: 'A segunda via está no portal.' }] }, { id: 'volta_menu', type: 'voltar', config: [{ key: 'targetNodeId', value: MENU.id }] }],
    edges: [{ from: MENU.id, output: 'Boletos', to: 'aviso_boletos' }, { from: 'aviso_boletos', output: '', to: 'volta_menu' }],
  }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 2, changed: 1, removed: 2 })
  const ids = new Set(result.flow.nodes.map((node) => node.id))
  assert.equal(ids.has(BOLETOS.id), false)
  assert.equal(ids.has(VOLTA.id), false)
  assert.ok(ids.has('40') && ids.has('41'))
  assert.equal(result.flow.edges.some((edge) => edge.source === BOLETOS.id || edge.target === BOLETOS.id), false)
  assert.deepEqual(result.detached.nodes.map((entry) => entry.node.id).sort(), [BOLETOS.id, VOLTA.id].sort())
  assertUntouched(BASE, result.flow, [MENU.id])
  assertReturnsValid(result.flow)
  assertNoNewErrors(BASE, result.flow)
  assertRoundTrip(result.flow)
  const back = applyEdit(result.flow, { nodes: [], edges: [{ from: MENU.id, output: 'Boletos', to: BOLETOS.id }] }, { now: NOW, ids: result.ids, detached: result.detached })
  assert.ok(back.flow.nodes.some((node) => node.id === BOLETOS.id))
  assert.ok(back.flow.nodes.some((node) => node.id === VOLTA.id))
  assert.equal(JSON.stringify(back.flow.nodes.find((node) => node.id === BOLETOS.id)), JSON.stringify(BOLETOS))
})

test('inserir um passo logo depois do início não remove nada', () => {
  const delta = { nodes: [{ id: 'lgpd', type: 'envio_pergunta', config: [{ key: 'template', value: 'Seus dados são tratados conforme a LGPD.' }] }], edges: [{ from: 'inicio', output: '', to: 'lgpd' }, { from: 'lgpd', output: '', to: WELCOME.id }] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 1, changed: 0, removed: 0 })
  const lgpd = result.flow.nodes.find((node) => node.id === result.ids.get('lgpd'))
  assert.deepEqual(result.flow.edges.filter((edge) => edge.source === START_ID).map((edge) => edge.target), [lgpd.id])
  assert.ok(result.flow.edges.some((edge) => edge.source === lgpd.id && edge.target === WELCOME.id))
  assertUntouched(BASE, result.flow, [START_ID])
  assertNoOverlap(result.flow, [lgpd.id])
  assertNoNewErrors(BASE, result.flow)
  assertRoundTrip(result.flow)
})

test('Retornar ao Menu novo aponta para menu existente ou novo, e volta ao próprio menu vira Retornar ao Menu', () => {
  const delta = {
    nodes: [
      { id: 'submenu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Sobre boletos:' }, { key: 'options', value: JSON.stringify([{ text: 'Segunda via' }, { text: 'Voltar' }, { text: 'Repetir' }]) }] },
      { id: 'segunda_via', type: 'envio_pergunta', config: [{ key: 'template', value: 'A segunda via está no portal.' }] },
      { id: 'de_novo', type: 'voltar', config: [{ key: 'targetNodeId', value: 'submenu' }] },
      { id: 'principal', type: 'voltar', config: [{ key: 'targetNodeId', value: MENU.id }] },
    ],
    edges: [
      { from: MENU.id, output: 'Boletos', to: 'submenu' },
      { from: 'submenu', output: 'Segunda via', to: 'segunda_via' },
      { from: 'segunda_via', output: '', to: 'de_novo' },
      { from: 'submenu', output: 'Voltar', to: 'principal' },
      { from: 'submenu', output: 'Repetir', to: 'submenu' },
    ],
  }
  const result = applyEdit(BASE, delta, { now: NOW })
  const submenu = result.ids.get('submenu')
  const returns = byType(result.flow, 'voltar')
  assert.equal(returns.find((node) => node.id === result.ids.get('de_novo')).data.data.targetNodeId, submenu)
  assert.equal(returns.find((node) => node.id === result.ids.get('principal')).data.data.targetNodeId, MENU.id)
  const loop = result.flow.edges.find((edge) => edge.source === submenu && edge.sourceHandle === 'output-2')
  assert.equal(result.flow.nodes.find((node) => node.id === loop.target).data.type, 'voltar')
  assert.ok(result.notes.some((note) => note.scope === 'ajuste' && /Retornar ao Menu/.test(note.message)))
  for (const node of returns.filter((entry) => !BASE.nodes.some((old) => old.id === entry.id))) assert.ok(node.data.data.availableNodes.some((menu) => menu.id === submenu))
  assertReturnsValid(result.flow)
  assertNoNewErrors(BASE, result.flow)
  assertRoundTrip(result.flow)
})

test('conexão nova de volta a um menu que já recebe conexão vira Retornar ao Menu', () => {
  const delta = { nodes: [{ id: BYE.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Posso ajudar em algo mais?' }] }], edges: [{ from: BYE.id, output: '', to: MENU.id }] }
  const result = applyEdit(BASE, delta, { now: NOW })
  const target = result.flow.edges.find((edge) => edge.source === BYE.id).target
  const node = result.flow.nodes.find((entry) => entry.id === target)
  assert.equal(node.data.type, 'voltar')
  assert.equal(node.data.data.targetNodeId, MENU.id)
  assert.equal(result.flow.edges.filter((edge) => edge.target === MENU.id).length, 1)
  assert.ok(result.flow.nodes.some((entry) => entry.id === MENU.id))
  assertReturnsValid(result.flow)
})

test('opções do menu reordenadas acompanham as conexões pelo rótulo e os números das opções se mantêm', () => {
  const delta = { nodes: [{ id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Encerrar' }, { text: 'Agendar consulta' }, { text: 'Boletos' }]) }] }], edges: [] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 0 })
  const outputs = Object.fromEntries(result.flow.edges.filter((edge) => edge.source === MENU.id).map((edge) => [edge.sourceHandle, edge.target]))
  assert.deepEqual(outputs, { 'output-0': BYE.id, 'output-1': NOTICE.id, 'output-2': BOLETOS.id })
  const data = result.flow.nodes.find((node) => node.id === MENU.id).data.data
  assert.deepEqual([data['opt-1'], data['opt-2'], data['opt-3']], [MENU.data.data['opt-3'], MENU.data.data['opt-1'], MENU.data.data['opt-2']])
  assertNoNewErrors(BASE, result.flow)
})

test('trocar o tipo mantém id e posição e atualiza o html', () => {
  const delta = { nodes: [{ id: NOTICE.id, type: 'tags', config: [{ key: 'tags', value: 'Agendamento' }] }], edges: [{ from: NOTICE.id, output: '', to: AGENDA.id }] }
  const result = applyEdit(BASE, delta, { now: NOW })
  const node = result.flow.nodes.find((entry) => entry.id === NOTICE.id)
  assert.equal(node.data.type, 'tags')
  assert.deepEqual(node.position, NOTICE.position)
  assert.equal(node.data.html, getTemplate('tags'))
  assert.ok(result.flow.edges.some((edge) => edge.source === NOTICE.id && edge.target === AGENDA.id))
  assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 0 })
})

test('saídas da resposta com ids e saídas inexistentes viram notas para a IA, sem quebrar o fluxo', () => {
  const delta = { nodes: [{ id: 'extra', type: 'envio_pergunta', config: [{ key: 'template', value: 'Texto.' }] }], edges: [{ from: 'fantasma', output: '', to: 'extra' }, { from: MENU.id, output: 'Não existe', to: 'extra' }, { from: 'extra', output: '', to: 'inicio' }] }
  const result = applyEdit(BASE, delta, { now: NOW })
  const messages = result.notes.filter((note) => note.scope === 'ia').map((note) => note.message)
  assert.ok(messages.some((message) => /fantasma/.test(message)))
  assert.ok(messages.some((message) => /Não existe/.test(message)))
  assert.ok(messages.some((message) => /Iniciar Fluxo/.test(message)))
  assertUntouched(BASE, result.flow, [])
  const review = reviewEdit(BASE, result)
  assert.ok(review.pending.some((item) => /^\[extra\]/.test(item)))
  const finished = concludeEdit(BASE, result)
  assert.equal(finished.flow.nodes.some((node) => node.id === result.ids.get('extra')), false)
  assert.ok(finished.notes.some((note) => /descartado/.test(note.message)))
  assert.equal(exportFlow(finished.flow), exportFlow(BASE))
})

test('a conclusão liga saídas novas sem destino a um Encerrar Conversa e não mexe no resto', () => {
  const delta = { nodes: [{ id: 'pesquisa', type: 'envio_mensagem', config: [{ key: 'title', value: 'Avalie o atendimento.' }, { key: 'options', value: JSON.stringify([{ text: 'Bom' }, { text: 'Ruim' }]) }] }], edges: [{ from: BYE.id, output: '', to: 'pesquisa' }, { from: 'pesquisa', output: 'Bom', to: byType(BASE, 'finalizar')[0].id }] }
  const result = applyEdit(BASE, delta, { now: NOW })
  const review = reviewEdit(BASE, result)
  assert.ok(review.issues.some((issue) => issue.severity === 'error' && issue.scope === 'ia'))
  const finished = concludeEdit(BASE, result)
  const after = reviewEdit(BASE, finished)
  assert.equal(after.issues.some((issue) => issue.severity === 'error'), false)
  const survey = result.ids.get('pesquisa')
  const end = finished.flow.edges.find((edge) => edge.source === survey && edge.sourceHandle === 'output-1')
  assert.equal(finished.flow.nodes.find((node) => node.id === end.target).data.type, 'finalizar')
  assertNoOverlap(finished.flow, finished.flow.nodes.filter((node) => !BASE.nodes.some((old) => old.id === node.id)).map((node) => node.id))
  assertUntouched(BASE, finished.flow, [BYE.id])
  assertNoNewErrors(BASE, finished.flow)
  assertRoundTrip(finished.flow)
})

test('nome e descrição só mudam quando vêm preenchidos e diferentes', () => {
  assert.equal(applyEdit(BASE, { name: '  ', description: '', nodes: [], edges: [] }).flow.name, BASE.name)
  assert.equal(applyEdit(BASE, { name: BASE.name, description: BASE.description, nodes: [], edges: [] }).changes.changed, 0)
  const renamed = applyEdit(BASE, { name: 'Clínica Nova', description: 'Atendimento revisado', nodes: [], edges: [] })
  assert.equal(renamed.flow.name, 'Clínica Nova')
  assert.equal(renamed.flow.description, 'Atendimento revisado')
  assert.equal(reviewEdit(BASE, renamed).unchanged, false)
})

test('ids de rodadas anteriores continuam valendo e não duplicam componentes', () => {
  const first = applyEdit(BASE, ADD_FINANCE, { now: NOW })
  const again = applyEdit(first.flow, ADD_FINANCE, { now: NOW, ids: first.ids, detached: first.detached })
  assert.equal(again.flow.nodes.length, first.flow.nodes.length)
  assert.deepEqual(again.changes, { added: 0, changed: 0, removed: 0 })
  const fix = applyEdit(first.flow, { nodes: [{ id: 'financeiro', type: 'departamentos', config: [{ key: 'name', value: 'Financeiro e Cobrança' }] }], edges: [] }, { now: NOW, ids: first.ids, detached: first.detached })
  assert.equal(fix.flow.nodes.find((node) => node.id === first.ids.get('financeiro')).data.data.name, 'Financeiro e Cobrança')
  assert.equal(fix.flow.nodes.length, first.flow.nodes.length)
  assert.deepEqual(diffFlows(BASE, fix.flow).added.length, 2)
})

test('deltaBetween descreve as mudanças acumuladas e previewEdit reproduz o fluxo editado', () => {
  const first = applyEdit(BASE, ADD_FINANCE, { now: NOW })
  const delta = deltaBetween(BASE, first.flow, first.ids)
  assert.deepEqual(delta.nodes.map((node) => node.id).sort(), [MENU.id, 'aviso_financeiro', 'financeiro'].sort())
  const preview = previewEdit(BASE, delta)
  assert.deepEqual(diffFlows(BASE, preview), diffFlows(BASE, first.flow))
  assert.equal(previewEdit(BASE, null), null)
  assert.equal(previewEdit(BASE, { nodes: [{ id: 'x', type: 'envio_p' }] }), null)
  const partial = previewEdit(BASE, { nodes: [ADD_FINANCE.nodes[1]], edges: [{ from: MENU.id, output: 'Boletos', to: 'aviso_financeiro' }] })
  assert.ok(partial.nodes.some((node) => node.id === BOLETOS.id))
  assert.equal(partial.nodes.length, BASE.nodes.length + 1)
})

test('previewEdit é rápido num fluxo grande', () => {
  const nodes = []
  const edges = [{ from: 'inicio', output: '', to: 'c0' }]
  for (let index = 0; index < 150; index++) {
    nodes.push({ id: `c${index}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Mensagem ${index}.` }] })
    if (index > 0) edges.push({ from: `c${index - 1}`, output: '', to: `c${index}` })
  }
  const big = finalizeFlow(assembleFlow({ name: 'Grande', description: '', nodes, edges }, { now: NOW })).flow
  const delta = { nodes: [{ id: '5', type: 'envio_pergunta', config: [{ key: 'template', value: 'Novo texto.' }] }, { id: 'novo', type: 'envio_pergunta', config: [{ key: 'template', value: 'Passo novo.' }] }], edges: [{ from: '5', output: '', to: 'novo' }, { from: 'novo', output: '', to: '6' }] }
  previewEdit(big, delta)
  const started = performance.now()
  for (let run = 0; run < 10; run++) previewEdit(big, delta)
  const average = (performance.now() - started) / 10
  assert.ok(average < 100, `${average.toFixed(1)} ms por prévia`)
})

test('os prompts de edição levam o fluxo atual, o protocolo e as pendências', () => {
  const system = editSystemPrompt()
  assert.ok(system.startsWith(systemPrompt()))
  assert.match(system, /# Modo de edição/)
  assert.match(system, /só as mudanças/)
  assert.match(system, /Nunca deixe uma chave obrigatória vazia/)
  const request = editRequestPrompt(BASE, 'Adicione o financeiro no menu.')
  assert.ok(request.includes(JSON.stringify(flowToRi(BASE))))
  assert.match(request, /Adicione o financeiro no menu\./)
  assert.doesNotMatch(request, /# Imagem/)
  assert.match(editRequestPrompt(BASE, '', true), /# Imagem/)
  const correction = editCorrectionPrompt(['[financeiro] Departamentos: Informe o nome.'], { changes: deltaBetween(BASE, applyEdit(BASE, ADD_FINANCE).flow), removed: ['9'] })
  assert.match(correction, /\[financeiro\]/)
  assert.match(correction, /Mudanças já aplicadas/)
  assert.match(correction, /removidos.*9/)
  assert.match(editResumePrompt(true), /interrompida/)
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map((file) => file.trim()).filter(Boolean)
for (const [index, file] of referenceFiles.entries()) {
  test(`arquivo de referência ${index + 1}: edições mantêm o resto byte a byte`, { skip: !fs.existsSync(file) && `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.` }, () => {
    const content = fs.readFileSync(file, 'utf8')
    const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    const flow = importFlow(content)
    assert.equal(exportFlow(applyEdit(flow, {}).flow), raw)
    const same = applyEdit(flow, flowToRi(flow), { now: NOW })
    assert.deepEqual(same.changes, { added: 0, changed: 0, removed: 0 })
    assert.equal(exportFlow(same.flow), raw)
    const reachable = new Set([START_ID])
    for (const id of reachable) for (const edge of flow.edges) if (edge.source === id) reachable.add(edge.target)
    const message = flow.nodes.find((node) => node.data.type === 'envio_pergunta' && reachable.has(node.id) && flow.edges.some((edge) => edge.source === node.id))
    const next = flow.edges.find((edge) => edge.source === message.id)
    const delta = {
      nodes: [{ id: message.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Texto revisado pela edição.' }] }, { id: 'passo_novo', type: 'envio_pergunta', config: [{ key: 'template', value: 'Passo novo inserido.' }] }],
      edges: [{ from: message.id, output: '', to: 'passo_novo' }, { from: 'passo_novo', output: '', to: next.target }],
    }
    const result = applyEdit(flow, delta, { now: NOW })
    assert.deepEqual(result.changes, { added: 1, changed: 1, removed: 0 })
    assertUntouched(flow, result.flow, [message.id])
    assertNoNewErrors(flow, result.flow)
    assertReturnsValid(result.flow, flow)
    assertNoOverlap(result.flow, [result.ids.get('passo_novo')])
    assertRoundTrip(result.flow)
    const text = exportFlow(result.flow)
    const untouched = flow.nodes.filter((node) => node.id !== message.id).map((node) => JSON.stringify(node, null, 2).split('\n').map((line, row) => (row ? `    ${line}` : line)).join('\n'))
    for (const block of untouched.slice(0, 20)) assert.ok(text.includes(block))
  })
}

const { FILL_CORRECTION } = require('../lib/atendimento/ai/prompt.ts')
const CONFIRM_DEPARTMENT = 'Confira: ID do departamento provisório, troque pelo valor cadastrado na plataforma.'
const EDIT_PROMPT = 'Adicione no menu uma opção para pagamentos, com aviso e transferência para a equipe, e renomeie o agendamento.'
const menuWith = (option) => ({ id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Boletos' }, { text: option }, { text: 'Encerrar' }]) }] })
const menuEdges = (option, target) => [
  { from: MENU.id, output: 'Agendar consulta', to: NOTICE.id },
  { from: MENU.id, output: 'Boletos', to: BOLETOS.id },
  { from: MENU.id, output: option, to: target },
  { from: MENU.id, output: 'Encerrar', to: BYE.id },
]
const confirmations = (issues) => issues.filter((issue) => issue.message.startsWith('Confira:')).map((issue) => [issue.scope, issue.nodeId, issue.message])

test('no modo edição os IDs do fluxo aberto contam como informados e só o ID novo vira provisório', () => {
  assert.equal(AGENDA.data.data.departamento, '12')
  const delta = {
    nodes: [
      menuWith('Pagamentos'),
      { id: AGENDA.id, type: 'departamentos', config: [{ key: 'departamento', value: '12' }, { key: 'name', value: 'Agenda de consultas' }] },
      { id: 'pagamentos', type: 'departamentos', config: [{ key: 'departamento', value: 'fin-77' }, { key: 'name', value: 'Financeiro' }] },
    ],
    edges: menuEdges('Pagamentos', 'pagamentos'),
  }
  const result = applyEdit(BASE, delta, { now: NOW })
  const added = result.ids.get('pagamentos')
  assert.equal(result.flow.nodes.find((node) => node.id === AGENDA.id).data.data.name, 'Agenda de consultas')
  const review = reviewEdit(BASE, result, { prompt: EDIT_PROMPT })
  assert.deepEqual(confirmations(review.issues), [['plataforma', added, CONFIRM_DEPARTMENT]])
  assert.equal(review.pending.some((item) => item.includes('Confira:')), false)
  assert.equal(confirmations(reviewEdit(BASE, result, { prompt: `${EDIT_PROMPT} O ID do financeiro é fin-77.` }).issues).length, 0)
  assert.equal(confirmations(reviewEdit(BASE, result, { prompt: EDIT_PROMPT, fill: false }).issues).length, 0)
  assert.equal(confirmations(reviewEdit(BASE, result).issues).length, 0)
  const finished = concludeEdit(BASE, result)
  assert.deepEqual(confirmations(reviewEdit(BASE, finished, { prompt: EDIT_PROMPT }).issues), [['plataforma', added, CONFIRM_DEPARTMENT]])
  assertRoundTrip(finished.flow)
})

test('com preenchimento a edição pede o nome na correção e a conclusão completa nome e ID do componente novo', () => {
  const delta = { nodes: [menuWith('Pagamentos'), { id: 'pagamentos', type: 'departamentos', config: [] }], edges: menuEdges('Pagamentos', 'pagamentos') }
  const result = applyEdit(BASE, delta, { now: NOW })
  const added = result.ids.get('pagamentos')
  const review = reviewEdit(BASE, result, { prompt: EDIT_PROMPT })
  assert.ok(review.issues.some((issue) => issue.scope === 'ia' && issue.nodeId === added && issue.message === 'Informe o nome do departamento.'))
  assert.ok(review.pending.some((item) => item.startsWith('[pagamentos]') && item.endsWith('Informe o nome do departamento.')))
  assert.equal(needsEditCorrection(review), true)
  const finished = concludeEdit(BASE, result)
  const data = finished.flow.nodes.find((node) => node.id === added).data.data
  assert.deepEqual([data.name, data.departamento, data.id], ['Atendimento', 'atendimento', 'atendimento'])
  assert.ok(finished.notes.some((note) => note.scope === 'ajuste' && note.nodeId === added && note.message === 'Preenchido com valor provisório: nome do departamento “Atendimento”, ID do departamento “atendimento”. Revise.'))
  assert.equal(finished.flow.nodes.find((node) => node.id === AGENDA.id).data.data.departamento, '12')
  const after = reviewEdit(BASE, finished, { prompt: EDIT_PROMPT })
  assert.deepEqual(confirmations(after.issues), [['plataforma', added, CONFIRM_DEPARTMENT]])
  assert.equal(after.issues.some((issue) => /^Informe o (nome|ID) do departamento/.test(issue.message)), false)
  assertUntouched(BASE, finished.flow, [MENU.id])
  assertRoundTrip(finished.flow)
})

test('sem preenchimento a edição deixa nome e ID em branco como dados da plataforma, sem rodada de correção', () => {
  const delta = { nodes: [menuWith('Pagamentos'), { id: 'pagamentos', type: 'departamentos', config: [] }], edges: menuEdges('Pagamentos', 'pagamentos') }
  const result = applyEdit(BASE, delta, { now: NOW })
  const added = result.ids.get('pagamentos')
  const review = reviewEdit(BASE, result, { prompt: EDIT_PROMPT, fill: false })
  const own = review.issues.filter((issue) => issue.nodeId === added).map((issue) => `${issue.scope}: ${issue.message}`)
  assert.deepEqual(own.sort(), ['plataforma: Informe o ID do departamento.', 'plataforma: Informe o nome do departamento.'])
  assert.equal(review.issues.some((issue) => issue.scope === 'ia'), false)
  assert.equal(needsEditCorrection(review), false)
  const finished = concludeEdit(BASE, result, { fill: false })
  const data = finished.flow.nodes.find((node) => node.id === added).data.data
  assert.deepEqual(['name', 'departamento', 'id'].map((key) => data[key] ?? ''), ['', '', ''])
  assert.equal(finished.notes.some((note) => note.message.startsWith('Preenchido com valor provisório')), false)
  const after = reviewEdit(BASE, finished, { prompt: EDIT_PROMPT, fill: false })
  assert.equal(after.issues.some((issue) => issue.message.startsWith('Confira:')), false)
  assert.equal(after.issues.some((issue) => issue.scope === 'ia'), false)
  assertUntouched(BASE, finished.flow, [MENU.id])
  assertRoundTrip(finished.flow)
})

test('os prompts de edição seguem a opção de preenchimento', () => {
  assert.ok(editSystemPrompt({ fill: false }).startsWith(systemPrompt({ fill: false })))
  assert.ok(editSystemPrompt({ fill: true }).startsWith(systemPrompt()))
  assert.equal(editSystemPrompt(), editSystemPrompt({ fill: true }))
  assert.notEqual(editSystemPrompt({ fill: false }), editSystemPrompt())
  assert.match(editSystemPrompt({ fill: false }), /# Modo de edição/)
  assert.ok(editCorrectionPrompt(['[3] pendência']).includes(FILL_CORRECTION))
  assert.ok(!editCorrectionPrompt(['[3] pendência'], undefined, { fill: false }).includes(FILL_CORRECTION))
  assert.equal(/[!—–]/.test(editCorrectionPrompt(['[3] pendência'])), false)
})
