const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const { applyEdit, flowToRi, concludeEdit, reviewEdit, needsEditCorrection, pickEdit, diffFlows, deltaBetween, editSnapshot, editSystemPrompt, editRequestPrompt, editCorrectionPrompt, editResumePrompt } = require('../lib/atendimento/ai/edit.ts')
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

test('opções do menu reordenadas acompanham as conexões pelo rótulo, e os números seguem a ordem nova no menu em sequência ou ficam com a opção quando são próprios', () => {
  const delta = { nodes: [{ id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Encerrar' }, { text: 'Agendar consulta' }, { text: 'Boletos' }]) }] }], edges: [] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 0 })
  const outputs = Object.fromEntries(result.flow.edges.filter((edge) => edge.source === MENU.id).map((edge) => [edge.sourceHandle, edge.target]))
  assert.deepEqual(outputs, { 'output-0': BYE.id, 'output-1': NOTICE.id, 'output-2': BOLETOS.id })
  const digitsOf = (flow) => {
    const data = flow.nodes.find((node) => node.id === MENU.id).data.data
    return [data['opt-1'], data['opt-2'], data['opt-3']]
  }
  assert.deepEqual(digitsOf(BASE), ['1', '2', '3'])
  assert.deepEqual(digitsOf(result.flow), ['1', '2', '3'])
  assertNoNewErrors(BASE, result.flow)
  const custom = JSON.parse(JSON.stringify(BASE))
  Object.assign(custom.nodes.find((node) => node.id === MENU.id).data.data, { 'opt-1': '7', 'opt-2': '8', 'opt-3': '0' })
  assert.deepEqual(digitsOf(applyEdit(custom, delta, { now: NOW }).flow), ['0', '7', '8'])
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

const MENU_TEXTS = ['Agendar consulta', 'Boletos', 'Encerrar']
const OVER_LIMIT = 'O menu ficou com 14 opções, e o limite é de 10. Deixe até 10 opções nele: divida em dois menus, com uma opção que leva ao segundo, ou reduza as opções, como o pedido indicar.'
const menuDelta = (texts, extra = {}) => ({ id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify(texts.map((text) => ({ text }))) }], ...extra })
const crowdedDelta = (total) => {
  const texts = [...MENU_TEXTS, ...Array.from({ length: total - MENU_TEXTS.length }, (_, index) => `Assunto ${index + 4}`)]
  return {
    nodes: [menuDelta(texts), ...texts.slice(3).map((text, index) => ({ id: `info_${index + 4}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Sobre ${text}.` }] }))],
    edges: texts.slice(3).map((text, index) => ({ from: MENU.id, output: text, to: `info_${index + 4}` })),
  }
}
const menuOf = (flow) => flow.nodes.find((node) => node.id === MENU.id)
const optionCount = (node) => Object.keys(node.data.data).filter((key) => /^text-\d+$/.test(key)).length
const ownIssues = (review, id = MENU.id) => review.issues.filter((issue) => issue.nodeId === id).map((issue) => `${issue.severity}/${issue.scope}: ${issue.message}`)

test('no modo edição o menu acima do limite fica inteiro até a correção, vira pendência bloqueante e nenhuma opção some em silêncio', () => {
  const result = applyEdit(BASE, crowdedDelta(14), { now: NOW })
  const menu = menuOf(result.flow)
  assert.equal(optionCount(menu), 14)
  assert.equal(menu.data.data['text-14'], 'Assunto 14')
  assert.equal(result.flow.edges.filter((edge) => edge.source === MENU.id).length, 14)
  assert.equal(result.notes.some((note) => /descartad/.test(note.message)), false)
  const review = reviewEdit(BASE, result, { prompt: 'No menu Como podemos ajudar?, acrescente 11 assuntos.' })
  assert.deepEqual(ownIssues(review), [`error/ia: ${OVER_LIMIT}`, 'error/ia: O menu deve ter de 1 a 10 opções.'])
  assert.ok(review.pending.includes(`[${MENU.id}] Menu de Opções: ${OVER_LIMIT}`))
  assert.equal(needsEditCorrection(review), true)
  assert.ok(review.score[0] >= 1)
  assert.match(editCorrectionPrompt(review.pending), /O menu ficou com 14 opções, e o limite é de 10\./)

  const texts = [...MENU_TEXTS.slice(0, 2), 'Mais assuntos', 'Encerrar']
  const fix = {
    nodes: [menuDelta(texts), { id: 'mais', type: 'envio_mensagem', config: [{ key: 'title', value: 'Mais assuntos:' }, { key: 'options', value: JSON.stringify(['Assunto 4', 'Assunto 5'].map((text) => ({ text }))) }] }],
    edges: [{ from: MENU.id, output: 'Agendar consulta', to: NOTICE.id }, { from: MENU.id, output: 'Boletos', to: BOLETOS.id }, { from: MENU.id, output: 'Mais assuntos', to: 'mais' }, { from: MENU.id, output: 'Encerrar', to: BYE.id }, { from: 'mais', output: 'Assunto 4', to: 'info_4' }, { from: 'mais', output: 'Assunto 5', to: 'info_5' }],
  }
  const fixed = applyEdit(result.flow, fix, { now: NOW, ids: result.ids, detached: result.detached })
  assert.equal(optionCount(menuOf(fixed.flow)), 4)
  const after = reviewEdit(BASE, fixed, { prompt: 'No menu Como podemos ajudar?, acrescente 11 assuntos.' })
  assert.deepEqual(ownIssues(after), [])
  assert.equal(after.issues.some((issue) => /limite é de/.test(issue.message)), false)
})

test('a conclusão corta só as opções acima do limite, com as saídas e os passos que só elas alcançavam, e avisa quais ficaram de fora', () => {
  const result = applyEdit(BASE, crowdedDelta(14), { now: NOW })
  const finished = concludeEdit(BASE, result)
  const menu = menuOf(finished.flow)
  assert.equal(optionCount(menu), 10)
  assert.equal(menu.data.data['text-10'], 'Assunto 10')
  for (const key of ['opt-11', 'text-11', 'description-11', 'text-14']) assert.equal(menu.data.data[key], undefined, key)
  assert.deepEqual(finished.flow.edges.filter((edge) => edge.source === MENU.id).map((edge) => edge.sourceHandle).sort(), Array.from({ length: 10 }, (_, index) => `output-${index}`).sort())
  const templates = finished.flow.nodes.map((node) => node.data.data.template).filter((text) => /^Sobre Assunto/.test(text ?? ''))
  assert.deepEqual(templates, Array.from({ length: 7 }, (_, index) => `Sobre Assunto ${index + 4}.`))
  const cut = finished.notes.filter((note) => note.nodeId === MENU.id)
  assert.deepEqual(cut.map((note) => [note.level, note.scope, note.message]), [['error', 'ajuste', 'O menu aceita até 10 opções, e a edição trouxe 14. As opções “Assunto 11”, “Assunto 12”, “Assunto 13”, “Assunto 14” ficaram de fora, com os passos que só elas alcançavam. Para manter todas, peça para dividir em dois menus, com uma opção que leva ao segundo.']])
  const review = reviewEdit(BASE, finished)
  assert.deepEqual(ownIssues(review), [`error/ajuste: ${cut[0].message}`])
  assertNoNewErrors(BASE, finished.flow)
  assertUntouched(BASE, finished.flow, [MENU.id])
  assertRoundTrip(finished.flow)
  const one = concludeEdit(BASE, applyEdit(BASE, crowdedDelta(11), { now: NOW }))
  assert.equal(optionCount(menuOf(one.flow)), 10)
  assert.ok(one.notes.some((note) => note.message.startsWith('O menu aceita até 10 opções, e a edição trouxe 11. A opção “Assunto 11” ficou de fora, com os passos que só ela alcançava.')))
  const exact = concludeEdit(BASE, applyEdit(BASE, crowdedDelta(10), { now: NOW }))
  assert.equal(optionCount(menuOf(exact.flow)), 10)
  assert.equal(exact.notes.some((note) => /ficaram de fora|ficou de fora/.test(note.message)), false)
})

test('a Múltipla Condição acima do limite também fica inteira até a correção e a conclusão corta o excesso com aviso', () => {
  const conditions = Array.from({ length: 22 }, (_, index) => ({ var: 'faixa', value: String(index + 1) }))
  const delta = {
    nodes: [{ id: 'faixas', type: 'multiple_condicional_api', config: [{ key: 'conditions', value: JSON.stringify(conditions) }] }, ...conditions.map((_, index) => ({ id: `faixa_${index + 1}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Faixa ${index + 1}.` }] }))],
    edges: [{ from: NOTICE.id, output: '', to: 'faixas' }, { from: 'faixas', output: '1', to: AGENDA.id }, ...conditions.slice(1).map((_, index) => ({ from: 'faixas', output: String(index + 2), to: `faixa_${index + 2}` }))],
  }
  const result = applyEdit(BASE, delta, { now: NOW })
  const id = result.ids.get('faixas')
  assert.equal(result.flow.nodes.find((node) => node.id === id).data.data['var-22'], 'faixa')
  const review = reviewEdit(BASE, result)
  assert.deepEqual(ownIssues(review, id), ['error/ia: A Múltipla Condição ficou com 22 condições, e o limite é de 20. Deixe até 20 condições nela.', 'warning/ia: O limite é de 20 condições.'])
  assert.equal(needsEditCorrection(review), true)
  const finished = concludeEdit(BASE, result)
  const data = finished.flow.nodes.find((node) => node.id === id).data.data
  assert.equal(data['var-20'], 'faixa')
  assert.equal(data['var-21'], undefined)
  assert.equal(data['value-22'], undefined)
  assert.ok(finished.notes.some((note) => note.nodeId === id && note.level === 'error' && note.message === 'A Múltipla Condição aceita até 20 condições, e a edição trouxe 22. As condições “faixa = 21”, “faixa = 22” ficaram de fora, com os passos que só elas alcançavam.'))
  assert.equal(finished.flow.nodes.some((node) => node.data.data.template === 'Faixa 21.' || node.data.data.template === 'Faixa 22.'), false)
  assertNoNewErrors(BASE, finished.flow)
})

test('o menu que já passava do limite no fluxo aberto não perde opções quando a edição só muda o texto dele', () => {
  const crowded = JSON.parse(JSON.stringify(BASE))
  const data = crowded.nodes.find((node) => node.id === MENU.id).data.data
  for (let index = 4; index <= 12; index++) Object.assign(data, { [`opt-${index}`]: String(index), [`text-${index}`]: `Extra ${index}`, [`description-${index}`]: '' })
  const base = importFlow(crowded)
  const result = applyEdit(base, { nodes: [{ id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Escolha um assunto:' }] }], edges: [] }, { now: NOW })
  assert.equal(optionCount(menuOf(result.flow)), 12)
  const review = reviewEdit(base, result)
  assert.equal(review.issues.some((issue) => /limite é de/.test(issue.message)), false)
  const finished = concludeEdit(base, result)
  assert.equal(optionCount(menuOf(finished.flow)), 12)
  assert.equal(finished.notes.some((note) => /ficaram de fora/.test(note.message)), false)
  const grown = applyEdit(base, { nodes: [menuDelta([...MENU_TEXTS, ...Array.from({ length: 10 }, (_, index) => `Extra ${index + 4}`)])], edges: [] }, { now: NOW })
  assert.equal(optionCount(menuOf(grown.flow)), 13)
  assert.ok(reviewEdit(base, grown).issues.some((issue) => issue.nodeId === MENU.id && issue.message.startsWith('O menu ficou com 13 opções, e o limite é de 10.')))
  assert.equal(optionCount(menuOf(concludeEdit(base, grown).flow)), 12)
})

const countIssue = (asked, got) => `error/ia: O pedido pede ${asked} ${asked === 1 ? 'opção' : 'opções'} neste menu, e ele ficou com ${got}. Deixe o menu com exatamente ${asked} ${asked === 1 ? 'opção' : 'opções'}, as do pedido, na ordem dele.`
const PLANS_DELTA = (texts) => ({
  nodes: [
    menuDelta(['Agendar consulta', 'Boletos', 'Planos', 'Encerrar']),
    { id: 'planos', type: 'envio_mensagem', config: [{ key: 'title', value: 'Qual plano você quer?' }, { key: 'options', value: JSON.stringify(texts.map((text) => ({ text }))) }] },
    ...texts.map((text, index) => ({ id: `plano_${index}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Plano ${text}.` }] })),
  ],
  edges: [
    { from: MENU.id, output: 'Agendar consulta', to: NOTICE.id },
    { from: MENU.id, output: 'Boletos', to: BOLETOS.id },
    { from: MENU.id, output: 'Planos', to: 'planos' },
    { from: MENU.id, output: 'Encerrar', to: BYE.id },
    ...texts.map((text, index) => ({ from: 'planos', output: text, to: `plano_${index}` })),
  ],
})

test('quando o plano diz com quantas opções o menu fica, a revisão confere o número e bloqueia a opção a mais, como um Voltar que o pedido não trouxe', () => {
  const exact = applyEdit(BASE, PLANS_DELTA(['Básico', 'Plus', 'Premium']), { now: NOW })
  const extra = applyEdit(BASE, PLANS_DELTA(['Básico', 'Plus', 'Premium', 'Voltar']), { now: NOW })
  const plan = 'No menu Como podemos ajudar?, acrescente a opção Planos antes de Encerrar, que leva ao menu Qual plano você quer?, com Básico, Plus e Premium. O menu Como podemos ajudar? fica com 4 opções. O menu Qual plano você quer? fica com 3 opções.'
  const planos = (result) => result.ids.get('planos')
  assert.deepEqual(reviewEdit(BASE, exact, { prompt: plan }).issues.filter((issue) => /pede/.test(issue.message)), [])
  const review = reviewEdit(BASE, extra, { prompt: plan })
  assert.deepEqual(ownIssues(review, planos(extra)), [countIssue(3, 4)])
  assert.deepEqual(ownIssues(review), [])
  assert.equal(review.issues.find((issue) => issue.nodeId === planos(extra) && /pede/.test(issue.message)).riId, 'planos')
  assert.ok(review.pending.includes(`[planos] Menu de Opções: ${countIssue(3, 4).slice('error/ia: '.length)}`))
  assert.equal(needsEditCorrection(review), true)
  const cited = [
    `No menu ID ${MENU.id}, acrescente a opção Planos, que leva ao menu Qual plano você quer?, que fica com 3 opções: Básico, Plus e Premium.`,
    'O menu “Qual plano você quer?” fica com três opções.',
    'O menu Qual plano você quer? passa a ter exatamente 3 opções; ele recebe Básico, Plus e Premium.',
    'O menu Qual plano você quer? fica com 3 opções no total.',
    'O menu *Qual plano você quer?* 😀 fica com 3 opções.',
    'No menu Qual plano você quer?, troque as 4 opções atuais por estas 3 opções, nesta ordem: Básico, Plus e Premium.',
    'Troque as opções do menu Qual plano você quer? pelas 3 novas: Básico, Plus e Premium.',
    'Substitua todas as opções do menu Qual plano você quer? por estas 3: Básico, Plus e Premium.',
  ]
  for (const text of cited) assert.deepEqual(ownIssues(reviewEdit(BASE, extra, { prompt: text }), planos(extra)), [countIssue(3, 4)], text)
  assert.deepEqual(ownIssues(reviewEdit(BASE, exact, { prompt: `O menu ID ${MENU.id} fica com 3 opções.` })), [countIssue(3, 4)])
  assert.deepEqual(ownIssues(reviewEdit(BASE, exact, { prompt: `Os menus IDs ${MENU.id} e 999 ficam com 4 opções.` })), [])
  const finished = concludeEdit(BASE, extra)
  assert.deepEqual(ownIssues(reviewEdit(BASE, finished, { prompt: plan }), planos(extra)), [countIssue(3, 4)])
})

test('a contagem de opções só vale quando o plano diz o total do menu, e fica de fora quando o número não aponta um menu só', () => {
  const extra = applyEdit(BASE, PLANS_DELTA(['Básico', 'Plus', 'Premium', 'Voltar']), { now: NOW })
  const silent = [
    'Acrescente uma opção Planos no menu, com um submenu de 3 opções.',
    'No menu Como podemos ajudar?, com 3 opções, acrescente a opção Planos.',
    'O menu Como podemos ajudar? fica com as 3 opções atuais e ganha a opção Planos.',
    'Crie o submenu de planos com Básico, Plus e Premium; ele fica com três opções.',
    'O menu Como podemos ajudar? fica com 4 opções, e o submenu de planos fica com 3 opções.',
    'O menu Qual plano você quer? fica com 12 opções.',
    'O menu Qual plano você quer? fica com 3 opções. O menu Qual plano você quer? fica com 4 opções.',
    'No menu Qual plano você quer?, troque as opções Plus e Premium por estas 3 opções: Ouro, Prata e Bronze.',
    'No menu Qual plano você quer?, troque a opção Plus por 3 opções: Ouro, Prata e Bronze.',
    '',
  ]
  for (const plan of silent) assert.deepEqual(review(plan), [], plan)
  function review(plan) {
    return reviewEdit(BASE, extra, { prompt: plan }).issues.filter((issue) => /pede/.test(issue.message)).map((issue) => issue.message)
  }
  const counted = (result, prompt) => ownIssues(reviewEdit(BASE, result, { prompt })).filter((text) => text.includes('O pedido pede'))
  const single = applyEdit(BASE, { nodes: [menuDelta([...MENU_TEXTS.slice(0, 2), 'Financeiro', 'Voltar', 'Encerrar'])], edges: [] }, { now: NOW })
  assert.deepEqual(counted(single, 'Acrescente a opção Financeiro antes de Encerrar. Ele fica com 4 opções.'), [countIssue(4, 5)])
  assert.deepEqual(counted(single, 'Acrescente a opção Financeiro antes de Encerrar. Ele fica com 5 opções.'), [])
  const same = applyEdit(BASE, { nodes: [{ id: WELCOME.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Bem-vindo.' }] }], edges: [] }, { now: NOW })
  assert.deepEqual(counted(same, 'Troque a saudação. O menu Como podemos ajudar? fica com 3 opções.'), [])
  assert.deepEqual(counted(same, 'Troque a saudação. O menu Como podemos ajudar? fica com 1 opção.'), [countIssue(1, 3)])
  const generic = applyEdit(BASE, { nodes: [menuDelta(MENU_TEXTS), { id: 'escolha', type: 'envio_mensagem', config: [{ key: 'title', value: 'Escolha uma das opções:' }, { key: 'options', value: JSON.stringify([{ text: 'A' }, { text: 'B' }]) }] }], edges: [{ from: BOLETOS.id, output: '', to: 'escolha' }] }, { now: NOW })
  const plain = (prompt) => reviewEdit(BASE, generic, { prompt }).issues.filter((issue) => /pede/.test(issue.message)).map((issue) => issue.riId)
  assert.deepEqual(plain('O menu Como podemos ajudar? fica com 2 opções.'), [MENU.id])
  assert.deepEqual(plain('O menu de opções fica com 3 opções.'), ['escolha'])
})

test('o prompt de edição pede o número exato de opções, as opções de voltar só quando o pedido traz, e os limites da plataforma', () => {
  for (const fill of [true, false]) {
    const system = editSystemPrompt({ fill })
    const section = system.slice(system.indexOf('# Quantidades e limites'))
    assert.ok(system.indexOf('# Quantidades e limites') > system.indexOf('# Modo de edição'))
    for (const text of ['o menu fica com exatamente esse número, com as opções do pedido na ordem dele', 'As opções de voltar e de encerramento entram quando o pedido traz essas opções', 'vale acima das regras de menus da seção Fluxo completo', 'crie exatamente esse número', 'o Menu de Opções tem de 1 a 10 opções, e até 3 com buttons "true"', 'a Múltipla Condição tem até 20 condições', 'divida em dois menus, com uma opção que leva ao segundo']) assert.ok(section.includes(text), text)
    assert.equal(/[!—–]/.test(section), false)
    assert.ok(!/\b(nunca|jamais|evite|proibido)\b|\bnão (faça|use|crie|deixe|coloque)\b/i.test(section))
    assert.deepEqual(section.split('\n').slice(1).map((line) => line.slice(0, 2)), ['- ', '- ', '- '])
    assert.ok(!systemPrompt({ fill }).includes('# Quantidades e limites'))
  }
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

const FIM = byType(BASE, 'finalizar')[0]
const NOTE_ID = '40'
const LOOSE_ID = '41'
const COMPONENTS = BASE.nodes.filter((node) => node.id !== START_ID && node.data.type !== 'note').map((node) => node.id)
const outputsOf = (flow, id) => Object.fromEntries(flow.edges.filter((edge) => edge.source === id).map((edge) => [edge.sourceHandle, edge.target]))
const idsOf = (flow) => flow.nodes.map((node) => node.id)

test('remove tira um componente do meio com as conexões, e a saída anterior segue para o destino seguinte', () => {
  const delta = { name: '', description: '', nodes: [], edges: [{ from: MENU.id, output: 'Agendar consulta', to: AGENDA.id }], remove: [NOTICE.id] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(diffFlows(BASE, result.flow), { added: [], changed: [MENU.id], removed: [NOTICE.id] })
  assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 1 })
  assert.equal(result.flow.edges.some((edge) => edge.source === NOTICE.id || edge.target === NOTICE.id), false)
  assert.deepEqual(outputsOf(result.flow, MENU.id), { 'output-0': AGENDA.id, 'output-1': BOLETOS.id, 'output-2': BYE.id })
  assert.equal(result.flow.edges.filter((edge) => edge.target === AGENDA.id).length, 1)
  assert.deepEqual(result.detached.nodes, [])
  assert.deepEqual(result.detached.removed, [NOTICE.id])
  assertUntouched(BASE, result.flow, [MENU.id])
  assertNoNewErrors(BASE, result.flow)
  assertReturnsValid(result.flow)
  assertRoundTrip(result.flow)
  const review = reviewEdit(BASE, result)
  assert.deepEqual([review.unchanged, needsEditCorrection(review)], [false, false])
  const finished = concludeEdit(BASE, result)
  assert.deepEqual(finished.changes, { added: 0, changed: 1, removed: 1 })
  assert.equal(exportFlow(finished.flow), exportFlow(result.flow))

  const cut = applyEdit(BASE, { remove: [NOTICE.id] }, { now: NOW })
  assert.deepEqual(diffFlows(BASE, cut.flow), { added: [], changed: [MENU.id], removed: [NOTICE.id, AGENDA.id] })
  assert.deepEqual(cut.detached.nodes.map((entry) => entry.node.id), [AGENDA.id])
  const pending = reviewEdit(BASE, cut)
  assert.equal(needsEditCorrection(pending), true)
  assert.ok(pending.pending.some((item) => item.startsWith(`[${MENU.id}]`) && item.includes('Conecte a saída “Agendar consulta”')))
  const snapshot = editSnapshot(BASE, cut)
  assert.deepEqual([snapshot.removed, snapshot.unreached], [[NOTICE.id], [AGENDA.id]])
  assert.equal(JSON.stringify(snapshot.changes).includes('"remove"'), false)
  const correction = editCorrectionPrompt(pending.pending, snapshot)
  assert.ok(correction.includes(`Componentes removidos pela lista remove: ${NOTICE.id}.`))
  assert.ok(correction.includes(`Componentes removidos por deixarem de ser alcançados a partir do início: ${AGENDA.id}. Para manter um deles, ligue a ele uma saída do fluxo.`))
  const fixed = applyEdit(cut.flow, { edges: [{ from: MENU.id, output: 'Agendar consulta', to: AGENDA.id }] }, { now: NOW, ids: cut.ids, detached: cut.detached })
  assert.deepEqual(diffFlows(BASE, fixed.flow), { added: [], changed: [MENU.id], removed: [NOTICE.id] })
  assert.equal(JSON.stringify(fixed.flow.nodes.find((node) => node.id === AGENDA.id)), JSON.stringify(AGENDA))
  assert.deepEqual(fixed.detached, { nodes: [], edges: [], removed: [NOTICE.id] })
  assert.equal(needsEditCorrection(reviewEdit(BASE, fixed)), false)

  const resent = applyEdit(cut.flow, { remove: [NOTICE.id], edges: [{ from: NOTICE.id, output: '', to: AGENDA.id }, { from: MENU.id, output: 'Agendar consulta', to: AGENDA.id }] }, { now: NOW, ids: cut.ids, detached: cut.detached })
  assert.deepEqual(diffFlows(BASE, resent.flow), { added: [], changed: [MENU.id], removed: [NOTICE.id] })
  assert.equal(resent.notes.some((note) => note.message.includes('não existe')), false)
  assert.equal(needsEditCorrection(reviewEdit(BASE, resent)), false)
})

test('tirar uma opção do menu com remove leva o ramo dela, e as outras opções seguem para os mesmos destinos', () => {
  const menu = { id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] }
  const delta = { name: '', description: '', nodes: [menu], edges: [{ from: MENU.id, output: 'Agendar consulta', to: NOTICE.id }, { from: MENU.id, output: 'Encerrar', to: BYE.id }], remove: [BOLETOS.id, VOLTA.id] }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(diffFlows(BASE, result.flow), { added: [], changed: [MENU.id], removed: [BOLETOS.id, VOLTA.id] })
  assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 2 })
  const data = result.flow.nodes.find((node) => node.id === MENU.id).data.data
  assert.deepEqual(Object.keys(data).filter((key) => /^text-\d+$/.test(key)).map((key) => data[key]), ['Agendar consulta', 'Encerrar'])
  assert.deepEqual(outputsOf(result.flow, MENU.id), { 'output-0': NOTICE.id, 'output-1': BYE.id })
  assert.deepEqual(result.detached.nodes, [])
  assert.ok([NOTE_ID, LOOSE_ID].every((id) => idsOf(result.flow).includes(id)))
  assertUntouched(BASE, result.flow, [MENU.id])
  assertReturnsValid(result.flow)
  assertNoNewErrors(BASE, result.flow)
  assertRoundTrip(result.flow)
  assert.equal(needsEditCorrection(reviewEdit(BASE, result)), false)
  assert.deepEqual(diffFlows(BASE, previewEdit(BASE, delta)), diffFlows(BASE, result.flow))
  const kept = previewEdit(BASE, { ...delta, remove: [] })
  assert.ok([BOLETOS.id, VOLTA.id].every((id) => idsOf(kept).includes(id)))
})

test('tirar uma opção de um menu numerado em sequência renumera as que ficam, e números próprios se mantêm', () => {
  const menu = { id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] }
  const delta = { name: '', description: '', nodes: [menu], edges: [{ from: MENU.id, output: 'Agendar consulta', to: NOTICE.id }, { from: MENU.id, output: 'Encerrar', to: BYE.id }], remove: [BOLETOS.id, VOLTA.id] }
  const digitsOf = (flow) => {
    const data = flow.nodes.find((node) => node.id === MENU.id).data.data
    return Object.keys(data).filter((key) => /^opt-\d+$/.test(key)).map((key) => data[key])
  }
  assert.deepEqual(digitsOf(BASE), ['1', '2', '3'])
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(digitsOf(result.flow), ['1', '2'])
  assert.deepEqual(outputsOf(result.flow, MENU.id), { 'output-0': NOTICE.id, 'output-1': BYE.id })
  assertRoundTrip(result.flow)
  const custom = JSON.parse(JSON.stringify(BASE))
  custom.nodes.find((node) => node.id === MENU.id).data.data['opt-3'] = '0'
  assert.deepEqual(digitsOf(applyEdit(custom, delta, { now: NOW }).flow), ['1', '0'])
  const mixed = { ...delta, nodes: [{ ...menu, config: [menu.config[0], { key: 'options', value: JSON.stringify([{ text: 'Encerrar' }, { text: 'Financeiro' }]) }] }], edges: [{ from: MENU.id, output: 'Encerrar', to: BYE.id }, { from: MENU.id, output: 'Financeiro', to: NOTICE.id }], remove: [BOLETOS.id, VOLTA.id] }
  assert.deepEqual(digitsOf(applyEdit(BASE, mixed, { now: NOW }).flow), ['1', '2'])
})

test('limpar o fluxo com remove deixa só o Início e as notas, e o Início sem destino não pede correção', () => {
  const delta = { name: '', description: '', nodes: [], edges: [], remove: COMPONENTS }
  const result = applyEdit(BASE, delta, { now: NOW })
  assert.deepEqual(idsOf(result.flow), [START_ID, NOTE_ID])
  assert.deepEqual(result.flow.edges, [])
  assert.equal(JSON.stringify(result.flow.nodes[0]), JSON.stringify(BASE.nodes[0]))
  assert.equal(JSON.stringify(result.flow.nodes[1]), JSON.stringify(BASE.nodes.find((node) => node.id === NOTE_ID)))
  assert.deepEqual(result.changes, { added: 0, changed: 0, removed: COMPONENTS.length })
  assert.deepEqual(diffFlows(BASE, result.flow).removed, COMPONENTS)
  assert.deepEqual(result.detached.nodes, [])
  const review = reviewEdit(BASE, result)
  assert.equal(review.unchanged, false)
  assert.deepEqual(review.issues.filter((issue) => issue.scope === 'ia'), [])
  assert.deepEqual(review.pending, [])
  assert.equal(needsEditCorrection(review), false)
  const finished = concludeEdit(BASE, result)
  assert.deepEqual(idsOf(finished.flow), [START_ID, NOTE_ID])
  assert.deepEqual(finished.changes, { added: 0, changed: 0, removed: COMPONENTS.length })
  assert.equal(reviewEdit(BASE, finished).issues.some((issue) => issue.nodeId === START_ID), false)
  assert.deepEqual(errors(finished.flow), [`${START_ID}:Conecte a saída “Próximo”.`])
  assert.equal(JSON.stringify(importFlow(JSON.parse(JSON.stringify(finished.flow)))), JSON.stringify(finished.flow))
  const notes = applyEdit(BASE, { ...delta, remove: [...COMPONENTS, NOTE_ID] }, { now: NOW })
  assert.deepEqual(idsOf(notes.flow), [START_ID])
  assert.equal(notes.changes.removed, COMPONENTS.length + 1)

  const first = applyEdit(BASE, { remove: [WELCOME.id] }, { now: NOW })
  assert.deepEqual(idsOf(first.flow), [START_ID, NOTE_ID, LOOSE_ID])
  assert.ok(first.detached.nodes.length > 0)
  const pending = reviewEdit(BASE, first)
  assert.ok(pending.issues.some((issue) => issue.scope === 'ia' && issue.nodeId === START_ID && issue.message.startsWith('Conecte a saída')))
  assert.equal(needsEditCorrection(pending), true)
  const rest = COMPONENTS.filter((id) => id !== WELCOME.id)
  const second = applyEdit(first.flow, { remove: rest }, { now: NOW, ids: first.ids, detached: first.detached })
  assert.deepEqual(idsOf(second.flow), [START_ID, NOTE_ID])
  assert.deepEqual(second.detached.nodes, [])
  assert.deepEqual([...second.detached.removed].sort(), [...COMPONENTS].sort())
  assert.equal(needsEditCorrection(reviewEdit(BASE, second)), false)

  const kept = applyEdit(BASE, { remove: COMPONENTS.filter((id) => id !== LOOSE_ID) }, { now: NOW })
  assert.deepEqual(idsOf(kept.flow), [START_ID, NOTE_ID, LOOSE_ID])
  assert.deepEqual(kept.detached.nodes, [])
  const unlinked = reviewEdit(BASE, kept)
  assert.ok(unlinked.issues.some((issue) => issue.nodeId === START_ID && issue.message.startsWith('Conecte a saída')))
  assert.equal(needsEditCorrection(unlinked), true)
})

test('remove ignora ids desconhecidos e o Início, resolve os ids como as conexões e o pedido só com eles continua sem mudança', () => {
  for (const remove of [[START_ID], ['Início', 'start', 'fantasma', '', '  '], [`${MENU.id}0`]]) {
    const result = applyEdit(BASE, { name: '', description: '', nodes: [], edges: [], remove }, { now: NOW })
    assert.equal(exportFlow(result.flow), exportFlow(BASE), JSON.stringify(remove))
    assert.deepEqual(result.changes, { added: 0, changed: 0, removed: 0 })
    assert.equal(result.detached.removed, undefined)
    const review = reviewEdit(BASE, result)
    assert.equal(review.unchanged, true)
    assert.match(review.pending[0], /nenhuma mudança.*em remove\.$/)
  }
  const mixed = applyEdit(BASE, { remove: ['fantasma', START_ID, ` ${BYE.id} `], edges: [{ from: MENU.id, output: 'Encerrar', to: FIM.id }] }, { now: NOW })
  assert.deepEqual(diffFlows(BASE, mixed.flow), { added: [], changed: [MENU.id], removed: [BYE.id] })
  assert.equal(outputsOf(mixed.flow, MENU.id)['output-2'], FIM.id)
  const first = applyEdit(BASE, ADD_FINANCE, { now: NOW })
  const finance = first.ids.get('financeiro')
  const second = applyEdit(first.flow, { remove: ['FINANCEIRO'] }, { now: NOW, ids: first.ids, detached: first.detached })
  assert.equal(idsOf(second.flow).includes(finance), false)
  assert.equal(second.ids.has('financeiro'), false)
  assert.ok(second.ids.has('aviso_financeiro'))
  assert.deepEqual(diffFlows(BASE, second.flow).removed, [])
  assert.deepEqual(diffFlows(first.flow, second.flow).removed, [finance])
})

test('a conexão que sai de um componente removido é ignorada, e a conexão para ele vira pendência para a IA', () => {
  const result = applyEdit(BASE, { remove: [NOTICE.id], edges: [{ from: NOTICE.id, output: '', to: AGENDA.id }, { from: MENU.id, output: 'Agendar consulta', to: AGENDA.id }] }, { now: NOW })
  assert.deepEqual(result.notes.filter((note) => note.scope === 'ia'), [])
  assert.deepEqual(diffFlows(BASE, result.flow), { added: [], changed: [MENU.id], removed: [NOTICE.id] })
  assert.equal(needsEditCorrection(reviewEdit(BASE, result)), false)
  const back = applyEdit(BASE, { remove: [NOTICE.id], edges: [{ from: MENU.id, output: 'Agendar consulta', to: NOTICE.id }] }, { now: NOW })
  assert.ok(back.notes.some((note) => note.scope === 'ia' && note.message.includes(`o id “${NOTICE.id}” não existe`)))
  assert.equal(idsOf(back.flow).includes(NOTICE.id), false)
  assert.equal(needsEditCorrection(reviewEdit(BASE, back)), true)
})

test('as remoções contam como mudança no diff, na contagem e na verificação de pedido sem mudança', () => {
  const removal = applyEdit(BASE, { remove: [LOOSE_ID] }, { now: NOW })
  assert.deepEqual(removal.changes, { added: 0, changed: 0, removed: 1 })
  assert.deepEqual(diffFlows(BASE, removal.flow), { added: [], changed: [], removed: [LOOSE_ID] })
  const review = reviewEdit(BASE, removal)
  assert.equal(review.unchanged, false)
  assert.deepEqual(review.changes, { added: 0, changed: 0, removed: 1 })
  assert.equal(review.pending.some((item) => /nenhuma mudança/.test(item)), false)
  assert.equal(needsEditCorrection(review), false)
  const empty = reviewEdit(BASE, applyEdit(BASE, { remove: [] }, { now: NOW }))
  assert.equal(empty.unchanged, true)
  assert.equal(pickEdit(empty, review), review)
  assert.equal(pickEdit(review, empty), review)
  assert.deepEqual(concludeEdit(BASE, removal).changes, { added: 0, changed: 0, removed: 1 })
})

test('os ids removidos ficam reservados: componente novo, rodada seguinte e conclusão usam ids novos', () => {
  assert.equal(LOOSE_ID, String(Math.max(...BASE.nodes.map((node) => Number(node.id)).filter(Number.isFinite))))
  const step = { id: 'aviso_novo', type: 'envio_pergunta', config: [{ key: 'template', value: 'Aviso antes de encerrar.' }] }
  const insert = [{ from: BYE.id, output: '', to: 'aviso_novo' }, { from: 'aviso_novo', output: '', to: FIM.id }]
  const same = applyEdit(BASE, { nodes: [step], edges: insert, remove: [LOOSE_ID] }, { now: NOW })
  assert.equal(same.ids.get('aviso_novo'), '42')
  assert.deepEqual(diffFlows(BASE, same.flow), { added: ['42'], changed: [BYE.id], removed: [LOOSE_ID] })
  const first = applyEdit(BASE, { remove: [LOOSE_ID] }, { now: NOW })
  const second = applyEdit(first.flow, { nodes: [step], edges: insert }, { now: NOW, ids: first.ids, detached: first.detached })
  assert.equal(second.ids.get('aviso_novo'), '42')
  assert.deepEqual(second.detached.removed, [LOOSE_ID])
  assert.deepEqual(diffFlows(BASE, second.flow), { added: ['42'], changed: [BYE.id], removed: [LOOSE_ID] })
  const ended = applyEdit(BASE, { remove: [LOOSE_ID, FIM.id] }, { now: NOW })
  const finished = concludeEdit(BASE, ended)
  const end = finished.flow.edges.find((edge) => edge.source === BYE.id)
  assert.equal(end.target, '42')
  assert.equal(finished.flow.nodes.find((node) => node.id === '42').data.type, 'finalizar')
  assert.deepEqual(diffFlows(BASE, finished.flow), { added: ['42'], changed: [BYE.id], removed: [FIM.id, LOOSE_ID] })
})

test('previewEdit aplica remove dos deltas parciais, e deltaBetween leva as remoções para a prévia reproduzir o fluxo editado', () => {
  const partial = previewEdit(BASE, { remove: [NOTICE.id] })
  assert.ok(partial)
  assert.equal(idsOf(partial).includes(NOTICE.id), false)
  assert.ok(idsOf(partial).includes(AGENDA.id))
  assert.equal(outputsOf(partial, MENU.id)['output-0'], undefined)
  assert.equal(previewEdit(BASE, { nodes: [], edges: [], remove: [] }), null)
  assert.equal(previewEdit(BASE, { remove: ['  ', ''] }), null)
  assert.deepEqual(idsOf(previewEdit(BASE, { remove: COMPONENTS })), [START_ID, NOTE_ID])
  for (const delta of [{ remove: [NOTICE.id] }, { remove: COMPONENTS }, { remove: [WELCOME.id] }, { edges: [{ from: MENU.id, output: 'Agendar consulta', to: AGENDA.id }], remove: [NOTICE.id] }]) {
    const result = applyEdit(BASE, delta, { now: NOW })
    const replay = deltaBetween(BASE, result.flow, result.ids)
    assert.deepEqual(replay.remove, diffFlows(BASE, result.flow).removed, JSON.stringify(delta))
    assert.deepEqual(diffFlows(BASE, previewEdit(BASE, replay)), diffFlows(BASE, result.flow), JSON.stringify(delta))
  }
  assert.deepEqual(deltaBetween(BASE, applyEdit(BASE, ADD_FINANCE, { now: NOW }).flow).remove, [])
})

test('o modo de edição pede as remoções em remove, em forma positiva, e a entrega e as pendências citam remove', () => {
  const rules = editSystemPrompt().slice(systemPrompt().length)
  assert.match(rules, /a resposta traz só as mudanças, no formato da RI com a lista remove:/)
  const rule = rules.split('\n').find((line) => line.startsWith('5. '))
  for (const text of ['Para remover componentes, liste os ids deles em remove, e eles saem do fluxo junto com as conexões.', 'Quando o caminho continua depois do que sai, ligue em edges a saída anterior ao destino seguinte.', 'Para tirar uma opção de um menu, envie o menu em nodes sem essa opção e liste em remove o que só essa opção alcançava.', 'Para limpar o fluxo, liste em remove todos os componentes: o Início fica, e as notas ficam, a menos que o pedido peça para remover as notas.', 'Quando nada sai do fluxo, remove fica vazio.']) assert.ok(rule.includes(text), text)
  assert.ok(!/\b(nunca|não)\b|desligue|deixa de ser alcançado/i.test(rule), rule)
  assert.deepEqual(rules.split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => Number(line.split('.')[0])), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.match(editRequestPrompt(BASE, 'Remova o aviso do agendamento.'), /# Entrega\n.*os ids dos componentes que saem do fluxo em remove e nada do que fica igual\.$/)
  assert.match(reviewEdit(BASE, applyEdit(BASE, {})).pending[0], /^\[fluxo\] A resposta não trouxe nenhuma mudança\. .*, as saídas que mudam em edges e os ids dos componentes que saem do fluxo em remove\.$/)
  for (const text of [rules, editCorrectionPrompt(['[3] pendência'], editSnapshot(BASE, applyEdit(BASE, { remove: [NOTICE.id] })))]) assert.equal(/[!—–]/.test(text), false, text)
})

test('um componente em remove e em nodes fica no fluxo como alteração, com aviso de ajuste, e o caminho depois dele continua', () => {
  const notice = { id: NOTICE.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Aguarde, vou chamar o agendamento.' }] }
  const result = applyEdit(BASE, { name: '', description: '', nodes: [notice], edges: [{ from: NOTICE.id, output: '', to: AGENDA.id }], remove: [NOTICE.id, NOTICE.id] }, { now: NOW })
  assert.deepEqual(diffFlows(BASE, result.flow), { added: [], changed: [NOTICE.id], removed: [] })
  const node = result.flow.nodes.find((entry) => entry.id === NOTICE.id)
  assert.equal(node.data.data.template, 'Aguarde, vou chamar o agendamento.')
  assert.deepEqual(node.position, NOTICE.position)
  assert.equal(result.notes.filter((note) => note.nodeId === NOTICE.id && note.message.includes('veio para alterar e para remover')).length, 1)
  assert.equal(needsEditCorrection(reviewEdit(BASE, result)), false)
  assert.equal(result.detached.removed, undefined)
  const menu = { id: MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] }
  const dropped = applyEdit(BASE, { name: '', description: '', nodes: [menu], edges: [{ from: MENU.id, output: 'Agendar consulta', to: NOTICE.id }, { from: MENU.id, output: 'Encerrar', to: BYE.id }], remove: [MENU.id, BOLETOS.id, VOLTA.id] }, { now: NOW })
  assert.deepEqual(diffFlows(BASE, dropped.flow), { added: [], changed: [MENU.id], removed: [BOLETOS.id, VOLTA.id] })
  assertReturnsValid(dropped.flow)
  assertNoNewErrors(BASE, dropped.flow)
})

test('quando o Início fica sem destino e o resto sai sem caminho, a correção oferece limpar de vez ou religar o Início', () => {
  const tidy = applyEdit(BASE, { remove: [LOOSE_ID] }, { now: NOW }).flow
  const partial = applyEdit(tidy, { remove: [WELCOME.id] }, { now: NOW })
  assert.deepEqual(idsOf(partial.flow), [START_ID, NOTE_ID])
  const left = partial.detached.nodes.map((entry) => entry.node.id)
  assert.ok(left.length > 0)
  const review = reviewEdit(tidy, partial)
  assert.equal(needsEditCorrection(review), true)
  const item = review.pending.find((entry) => entry.startsWith(`[${START_ID}]`))
  assert.ok(item && item.includes('Para limpar o fluxo, liste em remove também'), item)
  for (const id of left) assert.ok(item.includes(`“${id}”`), id)
  assert.ok(item.endsWith('Para manter o caminho, ligue a saída do Início ao componente que vem depois dele.'))
  assert.equal(review.pending.some((entry) => entry.startsWith(`[${START_ID}]`) && entry.includes('Conecte a saída')), false)
  assert.ok(!/[—–!]/.test(item))
})
