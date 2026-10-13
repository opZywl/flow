const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createEdge, newFlow, newNode } = require('../lib/atendimento/format.ts')
const { CURRENT_KEY, LIBRARY_KEY, clearedFlow, findSameSaved, isBlankFlow, readCurrentId, readLibrary, removeSaved, upsertSaved, writeCurrentId, writeLibrary } = require('../lib/atendimento/library.ts')

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  }
}

function filled(name = 'Atendimento') {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = name
  flow.description = 'Descrição mantida'
  flow.nodes.push(newNode('envio_pergunta', { x: 350, y: 60 }, '2'), newNode('finalizar', { x: 680, y: 60 }, '3'))
  flow.edges = [createEdge([], 'inicio', 'output-0', '2'), createEdge([], '2', 'output-0', '3')]
  return flow
}

test('a blank flow has only the start node and no connections', () => {
  assert.equal(isBlankFlow(newFlow()), true)
  assert.equal(isBlankFlow(filled()), false)
  const onlyEdge = newFlow()
  onlyEdge.edges = [createEdge([], 'inicio', 'output-0', 'inicio')]
  assert.equal(isBlankFlow(onlyEdge), false)
})

test('clearing keeps the start node and the flow settings and drops every other node and edge', () => {
  const flow = filled('Meu fluxo')
  const cleared = clearedFlow(flow)
  assert.deepEqual(cleared.nodes, [flow.nodes[0]])
  assert.deepEqual(cleared.edges, [])
  assert.equal(cleared.name, 'Meu fluxo')
  assert.equal(cleared.description, 'Descrição mantida')
  assert.equal(cleared.service_type, flow.service_type)
  assert.equal(flow.nodes.length, 3)
  assert.equal(isBlankFlow(cleared), true)
})

test('clearing a flow without start adds a fresh start node', () => {
  const flow = filled()
  flow.nodes = flow.nodes.slice(1)
  const cleared = clearedFlow(flow)
  assert.equal(cleared.nodes.length, 1)
  assert.equal(cleared.nodes[0].id, 'inicio')
})

test('saved flows round trip through storage, newest first, replacing by id', () => {
  const storage = memoryStorage()
  assert.deepEqual(readLibrary(storage), [])
  const first = { id: 'a', savedAt: '2026-01-01T00:00:00.000Z', flow: filled('Primeiro') }
  const second = { id: 'b', savedAt: '2026-01-02T00:00:00.000Z', flow: filled('Segundo') }
  let entries = upsertSaved(upsertSaved([], first), second)
  writeLibrary(storage, entries)
  assert.deepEqual(readLibrary(storage).map(entry => entry.id), ['b', 'a'])
  const updated = { ...first, savedAt: '2026-01-03T00:00:00.000Z', flow: filled('Primeiro editado') }
  entries = upsertSaved(readLibrary(storage), updated)
  writeLibrary(storage, entries)
  assert.deepEqual(readLibrary(storage).map(entry => [entry.id, entry.flow.name]), [['a', 'Primeiro editado'], ['b', 'Segundo']])
  writeLibrary(storage, removeSaved(removeSaved(readLibrary(storage), 'a'), 'b'))
  assert.equal(storage.data.has(LIBRARY_KEY), false)
})

test('corrupted or foreign library entries are ignored instead of breaking the editor', () => {
  assert.deepEqual(readLibrary(memoryStorage({ [LIBRARY_KEY]: '{not json' })), [])
  assert.deepEqual(readLibrary(memoryStorage({ [LIBRARY_KEY]: '{"id":"a"}' })), [])
  const good = { id: 'ok', savedAt: '2026-01-01T00:00:00.000Z', flow: filled() }
  const stored = JSON.stringify([null, { id: '', savedAt: 'x', flow: good.flow }, { id: 'x', savedAt: 'x', flow: { nodes: 'no' } }, good])
  assert.deepEqual(readLibrary(memoryStorage({ [LIBRARY_KEY]: stored })).map(entry => entry.id), ['ok'])
})

test('the open saved flow id is stored and cleared', () => {
  const storage = memoryStorage()
  assert.equal(readCurrentId(storage), null)
  writeCurrentId(storage, 'abc')
  assert.equal(storage.getItem(CURRENT_KEY), 'abc')
  assert.equal(readCurrentId(storage), 'abc')
  writeCurrentId(storage, null)
  assert.equal(storage.data.has(CURRENT_KEY), false)
})

test('a flow already in the library is found by content, ignoring viewport and creation date', () => {
  const saved = { id: 'a', savedAt: '2026-01-01T00:00:00.000Z', flow: filled('Igual') }
  const moved = { ...filled('Igual'), viewport: { x: 99, y: 12, zoom: 0.5 }, created_at: '2030-01-01T00:00:00.000Z' }
  assert.equal(findSameSaved([saved], moved)?.id, 'a')
  assert.equal(findSameSaved([saved], filled('Outro')), undefined)
})
