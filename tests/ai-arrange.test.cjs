const { test } = require('node:test')
const assert = require('node:assert/strict')

const { arrangeFlow, ARRANGE_LIMIT } = require('../lib/atendimento/ai/arrange.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { LAYOUT, layoutBox } = require('../lib/atendimento/ai/layout.ts')
const { validateFlow, exportFlow, importFlow, newNode } = require('../lib/atendimento/format.ts')
const { START_ID, NOTE_TYPE } = require('../lib/atendimento/catalog.ts')

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
  const note = newNode('note', { x: -500, y: -800 }, '40')
  note.data.data.text = 'Lembrete interno.'
  const loose = newNode('envio_pergunta', { x: 60, y: 1100 }, '41')
  loose.data.data.template = 'Mensagem solta que ainda não foi usada.'
  flow.nodes.push(note, loose)
  return importFlow(JSON.parse(JSON.stringify(flow)))
}

const BASE = buildBase()
const BASE_EXPORT = exportFlow(BASE)
const byTemplate = (text) => BASE.nodes.find((node) => node.data.data.template === text).id
const byType = (type) => BASE.nodes.find((node) => node.data.type === type).id

const ID = {
  inicio: START_ID,
  welcome: byTemplate(RI.nodes[0].config[0].value),
  menu: byType('envio_mensagem'),
  notice: byTemplate(RI.nodes[2].config[0].value),
  agenda: byType('departamentos'),
  boletos: byTemplate(RI.nodes[4].config[0].value),
  volta: byType('voltar'),
  bye: byTemplate(RI.nodes[6].config[0].value),
  fim: byType('finalizar'),
  loose: '41',
  note: '40',
}

const PATH = [ID.inicio, ID.welcome, ID.menu, ID.notice, ID.boletos, ID.bye, ID.agenda, ID.volta, ID.fim, ID.loose]
const COMPONENTS = BASE.nodes.filter((node) => node.data.type !== NOTE_TYPE)
const ORIGIN = { x: Math.min(...COMPONENTS.map((node) => node.position.x)), y: Math.min(...COMPONENTS.map((node) => node.position.y)) }

function pitch(flow, ids) {
  const boxes = ids.map((id) => layoutBox(flow.nodes.find((node) => node.id === id)))
  return { width: Math.max(...boxes.map((box) => box.width)) + LAYOUT.columnGap, height: Math.max(...boxes.map((box) => box.height)) + LAYOUT.rowGap }
}

const PITCH = pitch(BASE, PATH)

const nodeOf = (flow, id) => flow.nodes.find((node) => node.id === id)

function gridOf(flow, id, step = PITCH) {
  const { x, y } = nodeOf(flow, id).position
  const col = (x - ORIGIN.x) / step.width
  const row = (y - ORIGIN.y) / step.height
  assert.ok(Number.isInteger(col) && Number.isInteger(row), `${id} fora da grade: ${x}, ${y}`)
  return { col, row }
}

function rectOf(node) {
  return { id: node.id, ...node.position, ...layoutBox(node) }
}

function assertNoOverlap(flow, ids) {
  const rects = ids.map((id) => rectOf(nodeOf(flow, id)))
  for (let first = 0; first < rects.length; first++) {
    for (let second = first + 1; second < rects.length; second++) {
      const a = rects[first]
      const b = rects[second]
      const apart = a.x + a.width + LAYOUT.columnGap <= b.x || b.x + b.width + LAYOUT.columnGap <= a.x || a.y + a.height + LAYOUT.rowGap <= b.y || b.y + b.height + LAYOUT.rowGap <= a.y
      assert.ok(apart, `${a.id} encosta em ${b.id}`)
    }
  }
}

function withoutPositions(flow) {
  const copy = JSON.parse(exportFlow(flow))
  for (const node of copy.nodes) node.position = { x: 0, y: 0 }
  return JSON.stringify(copy, null, 2)
}

function changedIds(before, after) {
  return after.nodes.filter((node, index) => node.position.x !== before.nodes[index].position.x || node.position.y !== before.nodes[index].position.y).map((node) => node.id)
}

function assertOnlyPositions(result) {
  assert.equal(exportFlow(BASE), BASE_EXPORT)
  assert.deepEqual(result.flow.nodes.map((node) => node.id), BASE.nodes.map((node) => node.id))
  assert.equal(withoutPositions(result.flow), withoutPositions(BASE))
  assert.deepEqual([...result.moved].sort(), changedIds(BASE, result.flow).sort())
  assert.deepEqual(validateFlow(result.flow), validateFlow(BASE))
  const text = exportFlow(result.flow)
  assert.equal(exportFlow(importFlow(text)), text)
}

const cellsOf = (pairs) => pairs.map(([id, col, row]) => ({ id, col, row }))

test('arrange exports a 60 cell limit and the layout contract', () => {
  assert.equal(ARRANGE_LIMIT, 60)
  assert.equal(typeof arrangeFlow, 'function')
  assert.ok(validateFlow(BASE).some((issue) => issue.nodeId === ID.loose))
  assert.equal(PITCH.width, Math.max(...COMPONENTS.map((node) => layoutBox(node).width)) + LAYOUT.columnGap)
  assert.equal(PITCH.height, Math.max(...COMPONENTS.map((node) => layoutBox(node).height)) + LAYOUT.rowGap)
  assert.deepEqual(ORIGIN, { x: 60, y: -12.25 })
})

test('an L puts a column going down from Início and the last row going right', () => {
  const shape = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]
  const result = arrangeFlow(BASE, PATH.map((id, index) => ({ id, col: shape[index][0], row: shape[index][1] })))
  PATH.forEach((id, index) => assert.deepEqual(gridOf(result.flow, id), { col: shape[index][0], row: shape[index][1] }))
  const column = PATH.slice(0, 6).map((id) => nodeOf(result.flow, id).position)
  const floor = PATH.slice(5).map((id) => nodeOf(result.flow, id).position)
  assert.ok(column.every((position) => position.x === ORIGIN.x))
  assert.ok(column.every((position, index) => index === 0 || position.y > column[index - 1].y))
  assert.ok(floor.every((position) => position.y === column[5].y))
  assert.ok(floor.every((position, index) => index === 0 || position.x > floor[index - 1].x))
  assert.deepEqual(nodeOf(result.flow, ID.inicio).position, ORIGIN)
  assert.deepEqual(nodeOf(result.flow, ID.note).position, nodeOf(BASE, ID.note).position)
  assertNoOverlap(result.flow, PATH)
  assertOnlyPositions(result)
})

test('a casa draws a triangle roof over square walls', () => {
  const shape = [[2, 0], [1, 1], [3, 1], [0, 2], [4, 2], [0, 3], [4, 3], [0, 4], [2, 4], [4, 4]]
  const result = arrangeFlow(BASE, PATH.map((id, index) => ({ id, col: shape[index][0], row: shape[index][1] })))
  PATH.forEach((id, index) => assert.deepEqual(gridOf(result.flow, id), { col: shape[index][0], row: shape[index][1] }))
  const at = (index) => nodeOf(result.flow, PATH[index]).position
  assert.equal(at(0).x, (at(3).x + at(4).x) / 2)
  assert.equal(at(1).y, at(2).y)
  assert.ok(at(0).y < at(1).y && at(1).y < at(3).y)
  assert.equal(at(1).x - at(3).x, at(4).x - at(2).x)
  assert.equal(at(3).x, at(7).x)
  assert.equal(at(4).x, at(9).x)
  assert.equal(at(7).y, at(8).y)
  assert.equal(at(8).y, at(9).y)
  assert.equal(at(4).x - at(3).x, 4 * PITCH.width)
  assert.equal(at(7).y - at(3).y, 2 * PITCH.height)
  assertNoOverlap(result.flow, PATH)
  assertOnlyPositions(result)
})

test('a single row keeps every component on one line in path order', () => {
  const result = arrangeFlow(BASE, PATH.map((id, col) => ({ id, col, row: 0 })))
  const positions = PATH.map((id) => nodeOf(result.flow, id).position)
  assert.ok(positions.every((position) => position.y === ORIGIN.y))
  positions.forEach((position, index) => assert.equal(position.x, ORIGIN.x + index * PITCH.width))
  assert.deepEqual([...result.moved].sort(), [...PATH].sort())
  assertNoOverlap(result.flow, PATH)
  assertOnlyPositions(result)
})

test('a second component on a used cell moves to the next free cell of that row', () => {
  const result = arrangeFlow(BASE, cellsOf([
    [ID.inicio, 0, 0],
    [ID.welcome, 0, 0],
    [ID.menu, 1, 0],
    [ID.notice, 0, 0],
    [ID.boletos, 0, 1],
    [ID.bye, 0, 1],
    [ID.agenda, 2, 1],
    [ID.volta, 1, 2],
    [ID.fim, 1, 2],
    [ID.loose, 3, 2],
  ]))
  assert.deepEqual(gridOf(result.flow, ID.inicio), { col: 0, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.menu), { col: 1, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.welcome), { col: 2, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.notice), { col: 3, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.boletos), { col: 0, row: 1 })
  assert.deepEqual(gridOf(result.flow, ID.agenda), { col: 2, row: 1 })
  assert.deepEqual(gridOf(result.flow, ID.bye), { col: 1, row: 1 })
  assert.deepEqual(gridOf(result.flow, ID.volta), { col: 1, row: 2 })
  assert.deepEqual(gridOf(result.flow, ID.loose), { col: 3, row: 2 })
  assert.deepEqual(gridOf(result.flow, ID.fim), { col: 2, row: 2 })
  assertNoOverlap(result.flow, PATH)
  assertOnlyPositions(result)
})

test('the same id listed twice keeps its first cell', () => {
  const cells = PATH.map((id, col) => ({ id, col, row: 0 }))
  const result = arrangeFlow(BASE, [...cells, { id: ID.inicio, col: 5, row: 3 }, { id: ID.menu, col: 0, row: 4 }])
  assert.deepEqual(result, arrangeFlow(BASE, cells))
  assert.deepEqual(gridOf(result.flow, ID.inicio), { col: 0, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.menu), { col: 2, row: 0 })
})

test('unknown ids and broken cells are ignored', () => {
  const cells = PATH.map((id, col) => ({ id, col, row: 0 }))
  const noisy = [{ id: 'fantasma', col: 0, row: 0 }, { id: '999', col: 1, row: 0 }, null, { col: 2, row: 0 }, { id: 7, col: 3, row: 0 }, ...cells, { id: 'outro', col: 0, row: 9 }]
  const result = arrangeFlow(BASE, noisy)
  assert.deepEqual(result, arrangeFlow(BASE, cells))
  assert.equal(result.flow.nodes.length, BASE.nodes.length)
  assert.ok(!result.moved.includes('fantasma') && !result.moved.includes('999'))
  assert.deepEqual(arrangeFlow(BASE, [{ id: 'fantasma', col: 0, row: 0 }]), { flow: BASE, moved: [] })
  assert.deepEqual(arrangeFlow(BASE, []), { flow: BASE, moved: [] })
  assertOnlyPositions(result)
})

test('notes keep their place unless listed', () => {
  const unlisted = arrangeFlow(BASE, PATH.map((id, row) => ({ id, col: 0, row })))
  assert.deepEqual(nodeOf(unlisted.flow, ID.note).position, nodeOf(BASE, ID.note).position)
  assert.ok(!unlisted.moved.includes(ID.note))
  const listed = arrangeFlow(BASE, [...PATH.map((id, row) => ({ id, col: 0, row })), { id: ID.note, col: 1, row: 0 }])
  const step = pitch(BASE, [...PATH, ID.note])
  assert.deepEqual(gridOf(listed.flow, ID.note, step), { col: 1, row: 0 })
  assert.ok(listed.moved.includes(ID.note))
  PATH.forEach((id, row) => assert.deepEqual(gridOf(listed.flow, id, step), { col: 0, row }))
  assertNoOverlap(listed.flow, [...PATH, ID.note])
  assertOnlyPositions(unlisted)
  assertOnlyPositions(listed)
})

test('components left out go to free cells after the last used row in path order from Início', () => {
  const result = arrangeFlow(BASE, cellsOf([[ID.menu, 2, 0], [ID.inicio, 0, 0], [ID.welcome, 1, 0], [ID.note, 1, 1]]))
  const step = pitch(BASE, [...PATH, ID.note])
  assert.deepEqual(gridOf(result.flow, ID.inicio, step), { col: 0, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.welcome, step), { col: 1, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.menu, step), { col: 2, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.note, step), { col: 1, row: 1 })
  const rest = [ID.notice, ID.boletos, ID.bye, ID.agenda, ID.volta, ID.fim, ID.loose]
  rest.forEach((id, index) => assert.deepEqual(gridOf(result.flow, id, step), { col: index % 3, row: 2 + Math.floor(index / 3) }))
  assertNoOverlap(result.flow, [...PATH, ID.note])
  assertOnlyPositions(result)
})

test('col and row are rounded and clamped to the limit', () => {
  const result = arrangeFlow(BASE, cellsOf([
    [ID.inicio, -4, -2],
    [ID.welcome, 1.4, 0.4],
    [ID.menu, 1.6, -0.4],
    [ID.notice, 75, 3],
    [ID.boletos, 0, 999],
    [ID.bye, Infinity, -Infinity],
    [ID.agenda, NaN, 1],
    [ID.volta, 3, '2'],
  ]))
  assert.deepEqual(gridOf(result.flow, ID.inicio), { col: 0, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.welcome), { col: 1, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.menu), { col: 2, row: 0 })
  assert.deepEqual(gridOf(result.flow, ID.notice), { col: ARRANGE_LIMIT, row: 3 })
  assert.deepEqual(gridOf(result.flow, ID.boletos), { col: 0, row: ARRANGE_LIMIT })
  assert.deepEqual(gridOf(result.flow, ID.bye), { col: ARRANGE_LIMIT, row: 0 })
  const width = ARRANGE_LIMIT + 1
  const rest = [ID.agenda, ID.volta, ID.fim, ID.loose]
  rest.forEach((id, index) => assert.deepEqual(gridOf(result.flow, id), { col: index % width, row: ARRANGE_LIMIT + 1 + Math.floor(index / width) }))
  assertNoOverlap(result.flow, PATH)
  assertOnlyPositions(result)
})

test('arranging again with the same cells moves nothing', () => {
  const shape = [[2, 0], [1, 1], [3, 1], [0, 2], [4, 2], [0, 3], [4, 3], [0, 4], [2, 4], [4, 4]]
  const cells = PATH.map((id, index) => ({ id, col: shape[index][0], row: shape[index][1] }))
  const first = arrangeFlow(BASE, cells)
  const L = PATH.map((id, index) => ({ id, col: index < 6 ? 0 : index - 5, row: index < 6 ? index : 5 }))
  const twice = arrangeFlow(arrangeFlow(BASE, L).flow, L)
  assert.deepEqual(twice.moved, [])
  assert.ok(first.moved.length > 0)
})

test('the source flow stays untouched and the result is a separate copy', () => {
  const result = arrangeFlow(BASE, PATH.map((id, row) => ({ id, col: 0, row })))
  assert.equal(exportFlow(BASE), BASE_EXPORT)
  assert.notEqual(result.flow, BASE)
  assert.notEqual(result.flow.nodes, BASE.nodes)
  result.flow.nodes.forEach((node, index) => {
    assert.notEqual(node, BASE.nodes[index])
    assert.notEqual(node.data, BASE.nodes[index].data)
  })
  assert.deepEqual(result.flow.viewport, BASE.viewport)
  assert.deepEqual(result.flow.edges, BASE.edges)
  assert.equal(nodeOf(result.flow, ID.welcome).customFlag, true)
  assert.equal(nodeOf(result.flow, ID.welcome).data.data.chaveDaPlataforma, 'manter')
})

test('random layouts never overlap boxes and only move positions', () => {
  let seed = 7
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const pool = [...PATH, ID.note, 'fantasma']
  for (let round = 0; round < 60; round++) {
    const cells = []
    const count = 1 + Math.floor(random() * 14)
    for (let index = 0; index < count; index++) {
      const id = pool[Math.floor(random() * pool.length)]
      const spread = round % 3 === 0 ? 3 : 80
      cells.push({ id, col: random() * spread - 5, row: random() * spread - 5 })
    }
    const result = arrangeFlow(BASE, cells)
    const known = cells.filter((cell) => nodeOf(BASE, cell.id))
    const grid = known.length ? [...PATH, ...(known.some((cell) => cell.id === ID.note) ? [ID.note] : [])] : []
    if (!known.length) assert.deepEqual(result, { flow: BASE, moved: [] })
    for (const node of result.flow.nodes) assert.ok(Number.isFinite(node.position.x) && Number.isFinite(node.position.y))
    if (!grid.includes(ID.note)) assert.deepEqual(nodeOf(result.flow, ID.note).position, nodeOf(BASE, ID.note).position)
    assertNoOverlap(result.flow, grid)
    assertOnlyPositions(result)
  }
})
