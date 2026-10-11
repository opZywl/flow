const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const {
  importFlow, exportFlow, newFlow, newNode, validateFlow, outputHandles, outputLabel, removeMenuOption, createEdge, edgeId,
  nextNodeId, maxNumericId, duplicateNode, stampExport, exportFileName, behaviorSignature, nextOptionDigit, cleanDocument,
} = require('../lib/atendimento/format.ts')
const {
  supportedComponents, pendingComponents, componentCatalog, getTemplate, getDefinition, getComponentLabel, getComponentColor, getCategory, START_ID,
} = require('../lib/atendimento/catalog.ts')
const fieldTypes = require('../lib/atendimento/field-types.json')

const clone = value => JSON.parse(JSON.stringify(value))
const NODE_KEYS = ['id', 'type', 'position', 'data', 'measured', 'selected', 'dragging', 'deletable']
const EDGE_KEYS = ['type', 'source', 'sourceHandle', 'target', 'id']
const link = (flow, source, target, handle = 'output-0') => { const edge = createEdge(flow.edges, source, handle, target); flow.edges.push(edge); return edge }
const messagesOf = (flow, severity) => validateFlow(flow).filter(issue => !severity || issue.severity === severity).map(issue => issue.message)
const issuesOf = (flow, nodeId) => validateFlow(flow).filter(issue => issue.nodeId === nodeId).map(issue => issue.message)

function basic() {
  const flow = newFlow(new Date('2026-10-09T18:08:50.962Z'))
  const message = newNode('envio_pergunta', { x: 400, y: 100 }, '2')
  message.data.data.template = 'Olá, #NAME!\nInformações: @@@empresa 😊'
  flow.nodes.push(message, newNode('finalizar', { x: 800, y: 100 }, '3'))
  link(flow, 'inicio', '2')
  link(flow, '2', '3')
  return flow
}

function menuFlow() {
  const flow = newFlow(new Date('2026-10-09T18:08:50.962Z'))
  const menu = newNode('envio_mensagem', { x: 400, y: 100 }, '2')
  menu.data.data = { message: '', buttons: 'false', 'df-channel': '' }
  for (let i = 1; i <= 3; i++) Object.assign(menu.data.data, { [`opt-${i}`]: String(i), [`text-${i}`]: `Opção ${i}`, [`description-${i}`]: `Descrição ${i}` })
  menu.data.data.title = 'Escolha'
  flow.nodes.push(menu)
  link(flow, 'inicio', '2')
  for (let i = 1; i <= 3; i++) { flow.nodes.push(newNode('finalizar', { x: 800, y: i * 200 }, String(2 + i))); link(flow, '2', String(2 + i), `output-${i - 1}`) }
  return flow
}

function timeFlow(rules) {
  const flow = basic()
  flow.nodes[1] = newNode('timeConditions', { x: 0, y: 0 }, '2')
  flow.nodes[1].data.data.timeRules = rules
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4'))
  flow.edges = [flow.edges[0], createEdge([], '2', 'output-0', '3'), createEdge([], '2', 'output-1', '4')]
  return flow
}

function invalidSamples() {
  const samples = []
  const empty = basic(); empty.name = ''; empty.service_type = ''; empty.nodes[1].data.data.template = ''; samples.push(empty)
  const menu = menuFlow(); Object.assign(menu.nodes[1].data.data, { title: '', 'opt-2': '1', 'text-3': '', buttons: 1, 'opt-9': '9' }); samples.push(menu)
  const wires = basic(); wires.edges.push(createEdge(wires.edges, '3', 'output-4', 'inicio'), createEdge(wires.edges, '2', 'output-0', '2')); samples.push(wires)
  const references = basic()
  references.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3'); Object.assign(references.nodes[2].data.data, { id: 'a', departamento: 'b', enabled: 'sim' })
  references.nodes.push(newNode('tags', { x: 0, y: 0 }, '4'), newNode('flow', { x: 0, y: 0 }, '5'))
  samples.push(references)
  const api = basic(); api.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2'); Object.assign(api.nodes[1].data.data, { url_api: 'ftp://x', method: 'TRACE' }); samples.push(api)
  const request = basic(); request.nodes[1] = newNode('solicitar_dados', { x: 0, y: 0 }, '2'); samples.push(request)
  const protocol = basic(); protocol.nodes[1] = newNode('protocolo', { x: 0, y: 0 }, '2'); protocol.nodes[1].data.data.opt = 'URL'; samples.push(protocol)
  samples.push(timeFlow([{ id: '', weekDays: [], startTime: '9', endTime: '7' }, 'regra', { id: 'r', weekDays: ['funday'], startTime: '08:00', endTime: '09:00' }, { id: 'r2', weekDays: ['monday'], startTime: '18:00', endTime: '08:00' }]))
  const unknown = basic(); unknown.nodes[1].data.type = 'future-type'; samples.push(unknown)
  const starts = basic(); starts.nodes[0].id = 'start-node'; starts.edges[0].source = 'start-node'; starts.nodes.push(newNode('trigger_message', { x: 0, y: 0 }, '9')); samples.push(starts)
  const noStart = basic(); noStart.nodes.shift(); noStart.edges.shift(); samples.push(noStart)
  const orphan = basic(); orphan.nodes.push(newNode('waitForAnswer', { x: 0, y: 0 }, '7')); samples.push(orphan)
  return samples
}

const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

test('new flow starts with the reference start node shape', () => {
  const flow = newFlow()
  assert.deepEqual(Object.keys(flow), ['name', 'description', 'service_type', 'created_at', 'nodes', 'edges', 'viewport'])
  assert.equal(flow.service_type, 'chat')
  const [start] = flow.nodes
  assert.deepEqual(Object.keys(start).sort(), [...NODE_KEYS].sort())
  assert.equal(start.id, 'inicio')
  assert.equal(start.type, 'custom')
  assert.equal(start.deletable, false)
  assert.equal(start.selected, false)
  assert.equal(start.dragging, false)
  assert.deepEqual(start.data, { type: 'trigger_message', data: { title: 'Iniciar Fluxo', buttons: 'false' }, html: '' })
  assert.deepEqual(start.measured, { width: 260, height: 86 })
})

test('every component created in the editor has the reference node shape, html and value types', () => {
  for (const definition of supportedComponents) {
    const node = newNode(definition.nativeType, { x: 10, y: 20 }, '7')
    assert.deepEqual(Object.keys(node), NODE_KEYS, definition.nativeType)
    assert.equal(node.type, 'custom')
    assert.deepEqual(Object.keys(node.data), ['type', 'data', 'html'])
    assert.equal(node.data.html, getTemplate(definition.nativeType))
    assert.equal(node.deletable, definition.nativeType !== 'trigger_message')
    assert.ok(Number.isFinite(node.measured.width) && Number.isFinite(node.measured.height))
    const schema = fieldTypes[definition.nativeType]
    for (const [key, value] of Object.entries(node.data.data)) {
      if (schema[key]) assert.ok(schema[key].includes(valueType(value)), `${definition.nativeType}.${key}`)
    }
    for (const key of ['url_api', 'id', 'departamento', 'selectedTag', 'targetFlow', 'validated_signature']) if (key in node.data.data) assert.equal(node.data.data[key], '')
  }
})

test('defaults follow the values observed in the reference', () => {
  assert.equal(newNode('solicitar_dados', { x: 0, y: 0 }, '2').data.data.channel, 'CPF/CNPJ')
  assert.deepEqual(newNode('consulta_api', { x: 0, y: 0 }, '2').data.data.api_test_values, {})
  const rule = newNode('timeConditions', { x: 0, y: 0 }, '2').data.data.timeRules[0]
  assert.match(rule.id, /^rule-\d{13}$/)
  assert.deepEqual(Object.keys(rule), ['id', 'weekDays', 'startTime', 'endTime'])
  assert.deepEqual(Object.keys(newNode('envio_mensagem', { x: 0, y: 0 }, '2').data.data), ['message', 'buttons', 'df-channel', 'opt-1', 'text-1', 'description-1', 'title'])
  assert.deepEqual(Object.keys(newNode('waitForAnswer', { x: 0, y: 0 }, '2').data.data), ['mask', 'customfields', 'customFields', 'logToActivity', 'autoSaveContact'])
})

test('node ids follow the reference numbering: inicio, then sequential numeric strings', () => {
  assert.equal(nextNodeId([{ id: 'inicio' }]), '2')
  assert.equal(nextNodeId([{ id: 'inicio' }, { id: '2' }, { id: '59' }, { id: 'abc' }]), '60')
  assert.equal(nextNodeId([{ id: 'inicio' }, { id: '4' }], 9), '10')
  assert.equal(maxNumericId(['inicio', 'x-12', '12']), 12)
})

test('edges created in the editor use the reference id pattern and key set', () => {
  const edge = createEdge([], '5', 'output-1', '8')
  assert.deepEqual(edge, { type: 'deletable', source: '5', sourceHandle: 'output-1', target: '8', id: 'xy-edge__5output-1-8' })
  assert.deepEqual(Object.keys(edge), EDGE_KEYS)
  assert.equal(edgeId('inicio', 'output-0', '2'), 'xy-edge__iniciooutput-0-2')
  assert.equal(createEdge([edge], '5', 'output-1', '8').id, 'xy-edge__5output-1-8-1')
  assert.equal(createEdge([edge, { id: 'xy-edge__5output-1-8-1' }], '5', 'output-1', '8').id, 'xy-edge__5output-1-8-2')
})

test('import/export is lossless, keeps unknown fields and serializes like the reference', () => {
  const flow = basic()
  flow.extension = { keep: [true, null, 2, 'false'] }
  flow.nodes[1].data.future = { nested: 'preserved' }
  flow.nodes[1].data.data.custom = { null: null, false: false, literal: 'false' }
  flow.nodes[1].data.html = '<div onclick="neverExecute()">Original</div>'
  flow.edges[0].metadata = { condition: false }
  const imported = importFlow(flow)
  const text = exportFlow(imported)
  assert.equal(text, JSON.stringify(flow, null, 2))
  imported.nodes[1].data.data.template = 'Editada'
  assert.notEqual(flow.nodes[1].data.data.template, 'Editada')
})

test('export stamps created_at with the export instant and names the file like the reference', () => {
  const stamped = stampExport(basic(), new Date('2026-10-09T18:08:50.962Z'))
  assert.equal(stamped.created_at, '2026-10-09T18:08:50.962Z')
  assert.equal(exportFileName({ name: 'Atendimento 0500', created_at: stamped.created_at }), 'Atendimento 0500-2026-10-09.json')
  assert.equal(exportFileName({ name: '   ', created_at: stamped.created_at }), 'Atendimento-2026-10-09.json')
})

test('canvas-only state is never exported', () => {
  const flow = basic()
  flow.nodes[1].selected = true
  flow.nodes[1].dragging = true
  const exported = JSON.parse(exportFlow(flow))
  assert.equal(exported.nodes[1].selected, false)
  assert.equal(exported.nodes[1].dragging, false)
  assert.deepEqual(Object.keys(cleanDocument(flow).nodes[1]), Object.keys(flow.nodes[1]))
})

test('UTF-8 BOM and emoji are supported; malformed or empty JSON reports a PT-BR message', () => {
  const flow = basic()
  assert.deepEqual(importFlow(String.fromCharCode(0xfeff) + JSON.stringify(flow)), flow)
  assert.throws(() => importFlow('{'), /^Error: Arquivo JSON inválido: confira se o conteúdo está completo e sem erros de sintaxe\.$/)
  assert.throws(() => importFlow('   '), /^Error: O arquivo JSON está vazio\.$/)
  assert.throws(() => importFlow(String.fromCharCode(0xfeff)), /vazio/)
})

test('values that cannot become JSON are rejected with a PT-BR message', () => {
  const circular = basic()
  circular.self = circular
  assert.throws(() => importFlow(circular), /^Error: O fluxo contém valores que não podem ser convertidos em JSON\.$/)
  assert.throws(() => importFlow({ nodes: [], edges: [], value: 1n }), /não podem ser convertidos/)
  assert.throws(() => importFlow(undefined), /^Error: O JSON deve conter um objeto de fluxo\.$/)
  assert.throws(() => importFlow(null), /objeto de fluxo/)
})

test('imported nodes missing optional reference keys get them; existing values are kept', () => {
  const flow = basic()
  delete flow.nodes[1].measured
  delete flow.nodes[1].selected
  delete flow.nodes[1].deletable
  delete flow.nodes[1].dragging
  const imported = importFlow(flow)
  assert.deepEqual(imported.nodes[1].measured, { width: 260, height: 130 })
  assert.equal(imported.nodes[1].selected, false)
  assert.equal(imported.nodes[1].deletable, true)
  assert.equal('dragging' in imported.nodes[1], false)
})

test('catalog has every screenshot entry and distinguishes components without JSON data', () => {
  assert.equal(supportedComponents.length, 12)
  assert.equal(componentCatalog.length, 62)
  assert.equal(pendingComponents.length, 50)
  assert.equal(new Set(componentCatalog.map(entry => entry.id)).size, componentCatalog.length)
  assert.ok(pendingComponents.every(entry => !entry.nativeType && !entry.defaults))
  assert.throws(() => newNode('invented', { x: 0, y: 0 }, '2'), /^Error: O componente “invented” ainda não tem exemplo no formato de Atendimento\.$/)
})

test('catalog lookups treat names that exist on Object.prototype as unknown types', () => {
  for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(getDefinition(type), undefined, type)
    assert.equal(getTemplate(type), '', type)
    assert.equal(getComponentLabel(type), type)
    assert.equal(getCategory(type), undefined, type)
    assert.equal(getComponentColor(type), '#64748b')
  }
  assert.equal(getCategory('envio_pergunta').label, 'Mensagens')
  assert.equal(getComponentColor('consulta_api'), '#327e98')
  assert.equal(getDefinition('envio_mensagem').label, 'Menu de Opções')
})

test('all twelve reference component types can be created and exported', () => {
  for (const definition of supportedComponents.filter(entry => entry.nativeType !== 'trigger_message')) {
    const flow = newFlow()
    const node = newNode(definition.nativeType, { x: 300, y: 0 }, '2')
    if (definition.nativeType === 'envio_pergunta') node.data.data.template = 'Teste'
    if (definition.nativeType === 'departamentos') Object.assign(node.data.data, { id: 'dep', departamento: 'dep', name: 'Suporte' })
    if (definition.nativeType === 'tags') Object.assign(node.data.data, { id: 'tag', selectedTag: 'tag', tags: 'Cliente' })
    if (definition.nativeType === 'flow') Object.assign(node.data.data, { id: 'flx', targetFlow: 'flx', flowName: 'Financeiro' })
    if (['consulta_api', 'solicitar_dados'].includes(definition.nativeType)) node.data.data.url_api = 'https://example.com/api'
    if (definition.nativeType === 'solicitar_dados') node.data.data.text = 'Informe o número'
    flow.nodes.push(node)
    link(flow, 'inicio', '2')
    let next = 3
    for (const handle of outputHandles(node)) { const id = String(next++); flow.nodes.push(newNode('finalizar', { x: 600, y: 0 }, id)); link(flow, '2', id, handle) }
    assert.doesNotThrow(() => exportFlow(flow), definition.nativeType)
    assert.deepEqual(validateFlow(flow), [], definition.nativeType)
  }
})

test('output labels follow the meaning proven by the reference flow', () => {
  const at = type => newNode(type, { x: 0, y: 0 }, '2')
  assert.deepEqual(outputHandles(at('timeConditions')).map(handle => outputLabel(at('timeConditions'), handle)), ['Fora do horário', 'Dentro do horário'])
  assert.deepEqual(outputHandles(at('consulta_api')).map(handle => outputLabel(at('consulta_api'), handle)), ['Falha', 'Sucesso'])
  assert.deepEqual(outputHandles(at('solicitar_dados')).map(handle => outputLabel(at('solicitar_dados'), handle)), ['Falha', 'Sucesso'])
  assert.deepEqual(outputHandles(at('finalizar')), [])
  assert.deepEqual(outputHandles(at('departamentos')), [])
  assert.deepEqual(outputHandles(at('flow')), [])
  assert.equal(outputLabel(at('envio_pergunta'), 'output-0'), 'Próximo')
  const menu = menuFlow().nodes[1]
  assert.deepEqual(outputHandles(menu).map(handle => outputLabel(menu, handle)), ['Opção 1', 'Opção 2', 'Opção 3'])
  menu.data.data['text-2'] = ' '
  assert.equal(outputLabel(menu, 'output-1'), 'Opção 2')
})

test('unknown types expose the outputs already connected in the file', () => {
  const node = { id: '9', data: { type: 'future-type', data: {}, html: '' } }
  const edges = [{ source: '9', sourceHandle: 'b' }, { source: '1', sourceHandle: 'x' }, { source: '9', sourceHandle: 'a' }, { source: '9', sourceHandle: 'b' }]
  assert.deepEqual(outputHandles(node, edges), ['b', 'a'])
  assert.deepEqual(outputHandles(node), [])
  assert.equal(outputLabel(node, 'b'), 'b')
})

test('known payload field types cannot be corrupted by raw JSON edits and are named in PT-BR', () => {
  const flow = basic()
  flow.nodes[2].data.data.message = 123
  assert.throws(() => exportFlow(flow), /Campo message: esperado texto, recebido número\./)
  const department = basic()
  department.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3')
  Object.assign(department.nodes[2].data.data, { id: 'd', departamento: 'd', name: 'Suporte', enabled: 'sim', userManager: 'x' })
  const messages = issuesOf(department, '3')
  assert.ok(messages.includes('Campo enabled: esperado verdadeiro ou falso, recebido texto.'))
  assert.ok(messages.includes('Campo userManager: esperado nulo, recebido texto.'))
  const time = timeFlow({})
  assert.ok(issuesOf(time, '2').includes('Campo timeRules: esperado lista, recebido objeto.'))
})

test('invalid JSON leaves the caller object untouched', () => {
  const source = basic()
  const before = clone(source)
  assert.throws(() => importFlow('{'))
  assert.deepEqual(source, before)
})

test('structural errors are rejected on import', () => {
  const duplicateNode = basic(); duplicateNode.nodes.push(clone(duplicateNode.nodes[0])); assert.throws(() => importFlow(duplicateNode), /ID de componente duplicado: inicio\./)
  const duplicateEdge = basic(); duplicateEdge.edges.push(clone(duplicateEdge.edges[0])); assert.throws(() => importFlow(duplicateEdge), /ID de conexão duplicado/)
  const missing = basic(); missing.edges[0].target = 'missing'; assert.throws(() => importFlow(missing), /inexistente/)
  const position = basic(); position.nodes[0].position.x = Infinity; assert.throws(() => importFlow(position), /posição/)
  const viewport = basic(); viewport.viewport.zoom = 0; assert.throws(() => importFlow(viewport), /viewport inválido/)
  const wrapper = basic(); wrapper.nodes[0].data.data = []; assert.throws(() => importFlow(wrapper), /esperado/)
  const handle = basic(); handle.edges[0].sourceHandle = null; assert.throws(() => importFlow(handle), /sourceHandle/)
  const edgeType = basic(); edgeType.edges[0].type = 'custom'; assert.throws(() => importFlow(edgeType), /deletable/)
  const flag = basic(); flag.nodes[1].selected = 'no'; assert.throws(() => importFlow(flag), /selected deve ser true ou false/)
  const measured = basic(); measured.nodes[1].measured = { width: 1 }; assert.throws(() => importFlow(measured), /measured deve ter width e height/)
  const nodeId = basic(); nodeId.nodes[1].id = ''; assert.throws(() => importFlow(nodeId), /O 2º componente da lista não tem um ID válido\./)
  const edgeIdless = basic(); delete edgeIdless.edges[1].id; assert.throws(() => importFlow(edgeIdless), /A 2ª conexão da lista não tem um ID válido\./)
  const target = basic(); target.edges[0].targetHandle = 1; assert.throws(() => importFlow(target), /targetHandle inválido/)
  const name = basic(); delete name.name; assert.throws(() => importFlow(name), /Campo obrigatório ausente: name\./)
  const created = basic(); created.created_at = 5; assert.throws(() => importFlow(created), /O campo created_at deve ser texto\./)
  const lists = basic(); delete lists.edges; assert.throws(() => importFlow(lists), /listas nodes e edges/)
})

test('an empty name or service type is a validation error, not an import error', () => {
  const flow = basic(); flow.name = ''; flow.service_type = ''
  const imported = importFlow(flow)
  const messages = messagesOf(imported)
  assert.ok(messages.includes('Informe o nome do fluxo.'))
  assert.ok(messages.includes('Informe o tipo de serviço do fluxo (padrão: chat).'))
  assert.throws(() => exportFlow(imported), /nome do fluxo/)
})

test('unknown native types preserve their payload and connections', () => {
  const flow = basic(); flow.nodes[1].data.type = 'future-type'; flow.edges[1].sourceHandle = 'custom-future-handle'
  assert.deepEqual(JSON.parse(exportFlow(importFlow(flow))), flow)
  assert.deepEqual(validateFlow(flow), [{ severity: 'warning', message: 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.', nodeId: '2' }])
})

test('types named after Object.prototype members are validated as plain unknown types', () => {
  for (const type of ['constructor', 'toString', '__proto__']) {
    const flow = basic()
    flow.nodes[1].data.type = type
    flow.nodes[1].data.data = JSON.parse('{"constructor":"x","toString":1,"__proto__":null}')
    assert.deepEqual(validateFlow(flow).map(issue => [issue.severity, issue.message]), [['warning', 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.']], type)
  }
  const keys = basic()
  Object.assign(keys.nodes[1].data.data, { constructor: 1, toString: [], hasOwnProperty: null })
  assert.deepEqual(validateFlow(keys), [])
})

test('connection rules: existing handles, one destination per output, no self loops, start never receives', () => {
  const wrongHandle = basic(); wrongHandle.edges[1].sourceHandle = 'output-8'; assert.throws(() => exportFlow(wrongHandle), /A saída output-8 não existe neste componente\./)
  const twoTargets = basic(); twoTargets.edges.push(createEdge(twoTargets.edges, 'inicio', 'output-0', '3')); assert.throws(() => exportFlow(twoTargets), /A saída “Próximo” tem mais de um destino\./)
  const selfLoop = basic(); selfLoop.edges[1].target = '2'; assert.throws(() => exportFlow(selfLoop), /O componente não pode se conectar a ele mesmo\./)
  const toStart = basic(); toStart.edges[1].target = 'inicio'; assert.throws(() => exportFlow(toStart), /Iniciar Fluxo · ID inicio: Este componente não pode receber conexões\./)
})

test('identical issues are reported once', () => {
  const flow = basic()
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4'))
  const back = newNode('envio_pergunta', { x: 0, y: 0 }, '5')
  back.data.data.template = 'Volta'
  flow.nodes.push(back)
  link(flow, '5', 'inicio')
  link(flow, '2', 'inicio', 'output-0')
  const start = issuesOf(flow, 'inicio')
  assert.equal(start.filter(message => message === 'Este componente não pode receber conexões.').length, 1)
  const menu = menuFlow()
  Object.assign(menu.nodes[1].data.data, { 'opt-1': '1', 'opt-2': '1', 'opt-3': '1' })
  assert.deepEqual(issuesOf(menu, '2'), ['O número de opção 1 está repetido.'])
})

test('the start component must use the reference id and be unique', () => {
  const flow = basic(); flow.nodes[0].id = 'start-node'; flow.edges[0].source = 'start-node'
  assert.throws(() => exportFlow(flow), /Iniciar Fluxo · ID start-node: O ID deste componente deve ser "inicio"\./)
  const none = basic(); none.nodes.shift(); none.edges.shift()
  assert.ok(messagesOf(none).includes('Adicione o componente Iniciar Fluxo.'))
  const two = basic(); two.nodes.push(newNode('trigger_message', { x: 0, y: 0 }, '9'))
  const messages = messagesOf(two)
  assert.ok(messages.includes('O fluxo deve ter um único componente Iniciar Fluxo.'))
  assert.ok(issuesOf(two, '9').includes('O ID deste componente deve ser "inicio".'))
})

test('export errors name the component and its id, one issue per line', () => {
  const flow = basic()
  flow.name = ''
  flow.nodes[1].data.data.template = ''
  flow.nodes.push(newNode('waitForAnswer', { x: 0, y: 0 }, '4'))
  let error
  try { exportFlow(flow) } catch (cause) { error = cause }
  assert.ok(error instanceof Error)
  assert.deepEqual(error.message.split('\n'), [
    'Informe o nome do fluxo.',
    'Enviar Mensagem · ID 2: Preencha a mensagem.',
    'Aguardando Mensagem · ID 4: Componente desconectado do início.',
    'Aguardando Mensagem · ID 4: Conecte a saída “Próximo”.',
  ])
})

test('a component receiving two connections is reported as a warning', () => {
  const flow = menuFlow()
  flow.edges = flow.edges.map(edge => edge.target === '5' ? { ...edge, target: '4' } : edge)
  flow.nodes = flow.nodes.filter(node => node.id !== '5')
  assert.deepEqual(validateFlow(flow), [{ severity: 'warning', message: 'O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.', nodeId: '4' }])
})

test('unreachable cycles are rejected without infinite traversal; reachable cycles are allowed', () => {
  const flow = basic()
  for (const id of ['10', '11']) { const node = newNode('envio_pergunta', { x: 0, y: 0 }, id); node.data.data.template = id; flow.nodes.push(node) }
  link(flow, '10', '11'); link(flow, '11', '10')
  assert.throws(() => exportFlow(flow), /desconectado/)
  assert.deepEqual(issuesOf(flow, '10'), ['Componente desconectado do início.'])
  const cycle = basic()
  cycle.nodes = cycle.nodes.filter(node => node.id !== '3')
  const back = newNode('envio_pergunta', { x: 0, y: 0 }, '4')
  back.data.data.template = 'De novo'
  cycle.nodes.push(back)
  cycle.edges = [cycle.edges[0], createEdge([], '2', 'output-0', '4'), createEdge([], '4', 'output-0', '2')]
  assert.doesNotThrow(() => exportFlow(cycle))
})

test('validation scales linearly with components and connections', () => {
  const flow = newFlow()
  const size = 20000
  for (let i = 2; i <= size; i++) {
    const node = newNode('envio_pergunta', { x: i, y: 0 }, String(i))
    node.data.data.template = 'Mensagem'
    flow.nodes.push(node)
    flow.edges.push({ type: 'deletable', source: i === 2 ? 'inicio' : String(i - 1), sourceHandle: 'output-0', target: String(i), id: `e${i}` })
  }
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, String(size + 1)))
  flow.edges.push({ type: 'deletable', source: String(size), sourceHandle: 'output-0', target: String(size + 1), id: 'last' })
  flow.nodes.push({ id: 'hub', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'future-type', data: {}, html: '' } })
  for (let i = 0; i < 10000; i++) flow.edges.push({ type: 'deletable', source: 'hub', sourceHandle: `h-${i}`, target: 'hub', id: `hub-${i}` })
  const started = process.hrtime.bigint()
  const issues = validateFlow(flow)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.deepEqual(issues.map(issue => [issue.severity, issue.nodeId, issue.message]), [
    ['error', 'hub', 'O componente não pode se conectar a ele mesmo.'],
    ['warning', 'hub', 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.'],
    ['error', 'hub', 'Componente desconectado do início.'],
    ['warning', 'hub', 'O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.'],
  ])
  assert.ok(elapsed < 1500, `validação levou ${elapsed.toFixed(0)} ms`)
})

test('menu limits: consecutive options, unique digits, at most 10 options and 1024 characters', () => {
  const duplicated = menuFlow(); duplicated.nodes[1].data.data['opt-2'] = '1'; assert.throws(() => exportFlow(duplicated), /O número de opção 1 está repetido\./)
  const sparse = menuFlow(); delete sparse.nodes[1].data.data['text-2']
  assert.deepEqual(issuesOf(sparse, '2'), [
    'A saída output-2 não existe neste componente.',
    'As opções devem usar chaves consecutivas (text-1, text-2…).',
    'Campo opt-2 sem a opção correspondente text-2.',
    'Campo description-2 sem a opção correspondente text-2.',
  ])
  const long = menuFlow(); long.nodes[1].data.data.title = 'a'.repeat(1025); assert.throws(() => exportFlow(long), /A mensagem do menu tem 1025 caracteres; o limite é 1024\./)
  const limit = menuFlow(); limit.nodes[1].data.data.title = 'a'.repeat(1024); assert.doesNotThrow(() => exportFlow(limit))
  const buttons = menuFlow(); buttons.nodes[1].data.data.buttons = true; assert.throws(() => exportFlow(buttons), /buttons deve ser o texto "true" ou "false"/)
  const many = menuFlow()
  for (let i = 4; i <= 11; i++) Object.assign(many.nodes[1].data.data, { [`opt-${i}`]: String(i), [`text-${i}`]: `Opção ${i}`, [`description-${i}`]: '' })
  assert.ok(issuesOf(many, '2').includes('O menu deve ter de 1 a 10 opções.'))
  const none = menuFlow()
  for (const key of Object.keys(none.nodes[1].data.data)) if (/^(opt|text|description)-/.test(key)) delete none.nodes[1].data.data[key]
  assert.ok(issuesOf(none, '2').includes('O menu deve ter de 1 a 10 opções.'))
})

test('menu options point to the missing title or number', () => {
  const flow = menuFlow()
  Object.assign(flow.nodes[1].data.data, { 'text-2': '  ', 'opt-1': '', title: '' })
  assert.deepEqual(issuesOf(flow, '2'), ['Preencha a mensagem do menu.', 'Opção 1: informe o número.', 'Opção 2: informe o título.'])
})

test('removing a middle option keeps destinations, renumbers digits and edge ids', () => {
  const flow = menuFlow()
  flow.edges[3].extra = { keep: true }
  const updated = removeMenuOption(flow, '2', 2)
  const data = updated.nodes[1].data.data
  assert.deepEqual(Object.keys(data), ['message', 'buttons', 'df-channel', 'opt-1', 'text-1', 'description-1', 'opt-2', 'text-2', 'description-2', 'title'])
  assert.equal(data['text-2'], 'Opção 3')
  assert.equal(data['opt-2'], '2')
  assert.equal(data['description-2'], 'Descrição 3')
  const branch = updated.edges.find(edge => edge.source === '2' && edge.sourceHandle === 'output-1')
  assert.equal(branch.target, '5')
  assert.equal(branch.id, 'xy-edge__2output-1-5')
  assert.deepEqual(branch.extra, { keep: true })
  assert.equal(updated.edges.some(edge => edge.target === '4'), false)
  assert.equal(flow.nodes[1].data.data['text-2'], 'Opção 2')
  assert.doesNotThrow(() => validateFlow(updated))
})

test('renumbered edges keep unique ids and custom ids', () => {
  const flow = newFlow(new Date('2026-10-09T18:08:50.962Z'))
  const menu = newNode('envio_mensagem', { x: 0, y: 0 }, '2')
  Object.assign(menu.data.data, { 'opt-2': '2', 'text-2': 'B', 'description-2': '', 'opt-3': '3', 'text-3': 'C', 'description-3': '' })
  flow.nodes.push(menu, newNode('finalizar', { x: 0, y: 0 }, '3'), newNode('finalizar', { x: 0, y: 0 }, '4'))
  flow.edges = [
    { type: 'deletable', source: 'inicio', sourceHandle: 'output-0', target: '2', id: 'xy-edge__iniciooutput-0-2' },
    { type: 'deletable', source: '2', sourceHandle: 'output-0', target: '3', id: 'xy-edge__2output-1-4' },
    { type: 'deletable', source: '2', sourceHandle: 'output-2', target: '4', id: 'xy-edge__2output-2-4' },
  ]
  const updated = removeMenuOption(flow, '2', 2)
  assert.deepEqual(updated.edges.map(edge => [edge.sourceHandle, edge.target, edge.id]), [
    ['output-0', '2', 'xy-edge__iniciooutput-0-2'],
    ['output-0', '3', 'xy-edge__2output-1-4'],
    ['output-1', '4', 'xy-edge__2output-1-4-1'],
  ])
  assert.equal(updated.edges[0], flow.edges[0])
})

test('custom option digits are preserved when removing an option', () => {
  const flow = menuFlow()
  Object.assign(flow.nodes[1].data.data, { 'opt-1': '10', 'opt-2': '20', 'opt-3': '30' })
  const data = removeMenuOption(flow, '2', 1).nodes[1].data.data
  assert.deepEqual([data['opt-1'], data['opt-2']], ['20', '30'])
})

test('the final menu option cannot be removed and new options get the next free digit', () => {
  let flow = menuFlow()
  flow = removeMenuOption(flow, '2', 3)
  flow = removeMenuOption(flow, '2', 2)
  assert.equal(removeMenuOption(flow, '2', 1), flow)
  assert.equal(removeMenuOption(flow, '2', 7), flow)
  assert.equal(removeMenuOption(flow, 'inicio', 1), flow)
  assert.equal(removeMenuOption(flow, 'missing', 1), flow)
  assert.equal(nextOptionDigit({ 'opt-1': '1', 'text-1': 'a', 'opt-2': '3', 'text-2': 'b' }), '4')
  assert.equal(nextOptionDigit({ 'opt-1': '2', 'text-1': 'a' }), '3')
  assert.equal(nextOptionDigit({ 'opt-1': '1', 'text-1': 'a', 'opt-2': '2', 'text-2': 'b' }), '3')
})

test('API rules are validated without executing requests', () => {
  const api = basic(); api.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2'); api.nodes[1].data.data.url_api = 'javascript:alert(1)'
  assert.throws(() => exportFlow(api), /Informe uma URL válida, iniciada por http:\/\/ ou https:\/\/\./)
  const empty = basic(); empty.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2')
  assert.ok(issuesOf(empty, '2').includes('Informe a URL da API.'))
  const method = basic(); method.nodes[1] = newNode('solicitar_dados', { x: 0, y: 0 }, '2'); Object.assign(method.nodes[1].data.data, { url_api: 'https://example.com', method: 'TRACE' })
  const messages = issuesOf(method, '2')
  assert.ok(messages.includes('Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.'))
  assert.ok(messages.includes('Preencha a mensagem de solicitação.'))
  const protocol = basic(); protocol.nodes[1] = newNode('protocolo', { x: 0, y: 0 }, '2'); protocol.nodes[1].data.data.opt = 'URL'
  assert.ok(issuesOf(protocol, '2').includes('Informe a URL da API de protocolo.'))
})

test('time rules report the specific problem', () => {
  const rule = (overrides = {}) => ({ id: 'rule-1', weekDays: ['monday'], startTime: '08:00', endTime: '17:59', ...overrides })
  const cases = [
    [[], 'Cadastre ao menos uma regra de horário.'],
    [['regra'], 'Regra de horário 1 inválida.'],
    [[rule({ id: '' })], 'Regra de horário 1: ID ausente.'],
    [[rule({ weekDays: [] })], 'Regra de horário 1: selecione ao menos um dia.'],
    [[rule({ weekDays: ['monday', 'funday'] })], 'Regra de horário 1: dia da semana inválido.'],
    [[rule({ startTime: '25:00' })], 'Regra de horário 1: informe início e fim no formato HH:MM.'],
    [[rule(), rule({ id: 'rule-2', endTime: '8:00' })], 'Regra de horário 2: informe início e fim no formato HH:MM.'],
    [[rule({ startTime: '18:00', endTime: '08:00' })], 'Regra de horário 1: o início não pode ser posterior ao fim.'],
  ]
  for (const [rules, message] of cases) assert.deepEqual(issuesOf(timeFlow(rules), '2'), [message], message)
  assert.deepEqual(validateFlow(timeFlow([rule({ startTime: '08:00', endTime: '08:00' })])), [])
})

test('references keep id mirrored and warn when it diverges or the name is missing', () => {
  const flow = basic()
  flow.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3')
  Object.assign(flow.nodes[2].data.data, { id: 'a', departamento: 'b' })
  assert.deepEqual(validateFlow(flow), [
    { severity: 'warning', message: 'O campo id deve ser igual ao ID do departamento.', nodeId: '3' },
    { severity: 'warning', message: 'Informe o nome do departamento.', nodeId: '3' },
  ])
  const tag = basic(); tag.nodes[2] = newNode('tags', { x: 0, y: 0 }, '3')
  tag.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4')); link(tag, '3', '4')
  assert.deepEqual(issuesOf(tag, '3'), ['Informe o ID da tag.', 'Informe o nome da tag.'])
  const target = basic(); target.nodes[2] = newNode('flow', { x: 0, y: 0 }, '3')
  assert.deepEqual(issuesOf(target, '3'), ['Informe o ID do fluxo de destino.', 'Informe o nome do fluxo de destino.'])
})

test('issue messages are short PT-BR sentences that never cite the reference file', () => {
  const messages = invalidSamples().flatMap(flow => validateFlow(flow).map(issue => issue.message))
  assert.ok(messages.length > 40)
  for (const message of messages) {
    assert.doesNotMatch(message, /JSON de referência|referência/i, message)
    assert.match(message, /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“]/, message)
    assert.match(message, /\.$/, message)
    assert.ok(message.length <= 110, message)
    assert.doesNotMatch(message, /esperado (string|boolean|array|number|object|null)|recebido (string|boolean|array|number|object|null|undefined)/, message)
  }
  assert.ok(messages.includes('Componente desconectado do início.'))
})

test('duplicate creates a deletable copy with a new id and new rule ids', () => {
  const node = newNode('timeConditions', { x: 10, y: 10 }, '2')
  node.selected = true
  const copy = duplicateNode(node, '9')
  assert.equal(copy.id, '9')
  assert.equal(copy.selected, false)
  assert.equal(copy.deletable, true)
  assert.deepEqual(copy.position, { x: 50, y: 50 })
  assert.deepEqual(Object.keys(copy), NODE_KEYS)
  assert.notEqual(copy.data.data.timeRules[0], node.data.data.timeRules[0])
})

test('behavior signature ignores layout, viewport and metadata', () => {
  const flow = basic()
  const moved = clone(flow); moved.nodes[1].position = { x: 999, y: 999 }; moved.viewport = { x: 5, y: 5, zoom: 2 }; moved.name = 'Outro'
  assert.equal(behaviorSignature(moved), behaviorSignature(flow))
  const edited = clone(flow); edited.nodes[1].data.data.template = 'Mudou'
  assert.notEqual(behaviorSignature(edited), behaviorSignature(flow))
})

test('legacy flows migrate to the reference numbering, edge ids and shapes', () => {
  const legacy = {
    nodes: [
      { id: 'start-node', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'welcome', type: 'sendMessage', position: { x: 0, y: 150 }, data: { message: 'Olá' } },
      { id: 'menu', type: 'options', position: { x: 0, y: 300 }, data: { message: 'Escolha', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } },
      { id: 'end', type: 'finalizar', position: { x: 0, y: 450 }, data: { message: 'Até logo' } },
    ],
    edges: [
      { id: 'e1', source: 'start-node', target: 'welcome', type: 'custom', selected: true, animated: true },
      { id: 'e2', source: 'welcome', target: 'menu', type: 'custom' },
      { id: 'e3', source: 'menu', sourceHandle: 'output-0', target: 'end', type: 'custom' },
      { id: 'e4', source: 'menu', sourceHandle: 'output-1', target: 'end', type: 'custom' },
    ],
  }
  for (const input of [legacy, { flowData: legacy }]) {
    const flow = importFlow(input)
    assert.deepEqual(flow.nodes.map(node => node.id), ['inicio', '2', '3', '4', '5'])
    assert.deepEqual(flow.nodes.map(node => node.data.type), ['trigger_message', 'envio_pergunta', 'envio_mensagem', 'finalizar', 'envio_pergunta'])
    for (const node of flow.nodes) assert.deepEqual(Object.keys(node), NODE_KEYS)
    for (const edge of flow.edges) { assert.deepEqual(Object.keys(edge), EDGE_KEYS); assert.equal(edge.id, edgeId(edge.source, edge.sourceHandle, edge.target)) }
    assert.equal(flow.nodes[1].data.data.template, 'Olá')
    assert.equal(flow.nodes[2].data.data['text-2'], 'B')
    assert.equal(flow.nodes[4].data.data.template, 'Até logo')
    assert.ok(flow.edges.some(edge => edge.source === '5' && edge.target === '4'))
    assert.equal(flow.edges.filter(edge => edge.target === '4').length, 1)
    assert.ok(flow.nodes[1].position.x > flow.nodes[0].position.x)
  }
})

test('legacy layout places components by distance from the start, left to right', () => {
  const flow = importFlow({
    nodes: [
      { id: 'start-node', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'welcome', type: 'sendMessage', position: { x: 0, y: 150 }, data: { message: 'Olá' } },
      { id: 'menu', type: 'options', position: { x: 0, y: 300 }, data: { message: 'Escolha', options: [{ text: 'A' }, { text: 'B' }] } },
      { id: 'end', type: 'finalizar', position: { x: 0, y: 450 }, data: { message: 'Até logo' } },
      { id: 'orphan', type: 'sendMessage', position: { x: 9, y: 9 }, data: { message: 'Solto' } },
    ],
    edges: [
      { id: 'e1', source: 'start-node', target: 'welcome' },
      { id: 'e2', source: 'welcome', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'output-1', target: 'end' },
      { id: 'e4', source: 'menu', sourceHandle: 'output-0', target: 'end' },
    ],
  })
  assert.deepEqual(flow.nodes.map(node => [node.id, node.position.x, node.position.y]), [
    ['inicio', 120, 120], ['2', 500, 120], ['3', 880, 120], ['4', 1640, 120], ['5', 2020, 120], ['6', 1260, 120],
  ])
  assert.deepEqual(flow.edges.map(edge => edge.id), ['xy-edge__iniciooutput-0-2', 'xy-edge__2output-0-3', 'xy-edge__3output-1-6', 'xy-edge__3output-0-6', 'xy-edge__6output-0-4'])
  assert.equal(flow.name, 'Fluxo importado')
})

test('legacy menus without sourceHandle get one output per edge, in order', () => {
  const flow = importFlow({
    name: 'Menu antigo',
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'm', type: 'options', position: { x: 0, y: 0 }, data: { message: 'Escolha', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } },
      { id: 'a', type: 'sendMessage', position: { x: 0, y: 0 }, data: { message: 'A' } },
      { id: 'b', type: 'sendMessage', position: { x: 0, y: 0 }, data: { message: 'B' } },
      { id: 'f', type: 'finalizar', position: { x: 0, y: 0 }, data: {} },
      { id: 'g', type: 'finalizar', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [
      { id: '1', source: 's', target: 'm' }, { id: '2', source: 'm', target: 'a' }, { id: '3', source: 'm', target: 'b' },
      { id: '4', source: 'a', target: 'f' }, { id: '5', source: 'b', target: 'g' },
    ],
  })
  assert.equal(flow.name, 'Menu antigo')
  assert.deepEqual(flow.edges.filter(edge => edge.source === '2').map(edge => [edge.sourceHandle, edge.target]), [['output-0', '3'], ['output-1', '4']])
  assert.doesNotThrow(() => exportFlow(flow))
})

test('unsupported or malformed legacy components fail explicitly instead of silently disappearing', () => {
  const position = { x: 0, y: 0 }
  assert.throws(() => importFlow({ nodes: [{ id: 'code', type: 'code', position, data: { code: 'return true' } }], edges: [] }), /^Error: O componente antigo “code” \(code\) não tem equivalente no formato de Atendimento\.$/)
  for (const type of ['constructor', 'toString', '__proto__']) {
    assert.throws(() => importFlow({ nodes: [{ id: 'x', type, position, data: {} }], edges: [] }), /não tem equivalente/, type)
  }
  const start = { id: 's', type: 'start', position, data: {} }
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: [] } }], edges: [] }), /Menu m: informe ao menos uma opção\./)
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: Array.from({ length: 11 }, (_, i) => ({ text: String(i) })) } }], edges: [] }), /Menu m: o limite é de 10 opções\./)
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: [{ text: '' }] } }], edges: [] }), /Menu m: a opção 1 não tem título\./)
  assert.throws(() => importFlow({ nodes: [start, start], edges: [] }), /ID duplicado s/)
  assert.throws(() => importFlow({ nodes: [{ ...start, id: 't' }, start], edges: [] }), /exatamente um início/)
  assert.throws(() => importFlow({ nodes: [start, { id: 'b' }], edges: [] }), /O 2º componente do formato antigo é inválido\./)
  assert.throws(() => importFlow({ nodes: [start], edges: [{ source: 's', target: 'ghost' }] }), /A 1ª conexão do formato antigo aponta para um componente inexistente\./)
  assert.throws(() => importFlow({ nodes: [start], edges: [{ source: 's' }] }), /A 1ª conexão do formato antigo é inválida\./)
  assert.throws(() => importFlow({ nodes: [start] }), /nodes e edges são obrigatórios/)
})

const reference = process.env.FLOW_REFERENCE
test('reference file: lossless round trip, zero issues and editor-compatible ids', { skip: !reference || !fs.existsSync(reference) }, () => {
  const raw = fs.readFileSync(reference, 'utf8')
  const flow = importFlow(raw)
  assert.equal(exportFlow(flow), raw)
  assert.deepEqual(validateFlow(flow), [])
  assert.equal(nextNodeId(flow.nodes), '60')
  for (const edge of flow.edges) assert.equal(edge.id, edgeId(edge.source, edge.sourceHandle, edge.target))
  assert.equal(START_ID, flow.nodes.find(node => node.data.type === 'trigger_message').id)
  for (const node of flow.nodes) for (const handle of outputHandles(node, flow.edges)) assert.ok(flow.edges.some(edge => edge.source === node.id && edge.sourceHandle === handle), `${node.id} ${handle}`)
})
