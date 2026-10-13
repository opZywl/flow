const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { layoutBox, LAYOUT } = require('../lib/atendimento/ai/layout.ts')
const { applyEdit, concludeEdit, flowToRi } = require('../lib/atendimento/ai/edit.ts')
const { systemPrompt } = require('../lib/atendimento/ai/prompt.ts')
const { exportFlow, importFlow } = require('../lib/atendimento/format.ts')
const { START_ID } = require('../lib/atendimento/catalog.ts')

const NOW = new Date('2026-10-13T12:00:00.000Z')

const pairs = (config) => Object.entries(config).map(([key, value]) => ({ key, value }))
const node = (id, type, config = {}) => ({ id, type, config: pairs(config) })
const edge = (from, output, to) => ({ from, output, to })
const note = (id, text) => node(id, 'note', { text })
const build = (nodes, edges) => finalizeFlow(assembleFlow({ name: 'Notas', description: 'Fluxo com notas', nodes, edges }, { now: NOW }))
const byRi = (assembled, riId) => assembled.flow.nodes.find((entry) => entry.id === assembled.platformIds.get(riId))
const rect = (entry) => ({ x: entry.position.x, y: entry.position.y, ...layoutBox(entry) })

function apart(first, second) {
  const a = rect(first)
  const b = rect(second)
  return a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height
}

function overlaps(flow) {
  const found = []
  for (let first = 0; first < flow.nodes.length; first++) {
    for (let second = first + 1; second < flow.nodes.length; second++) {
      if (!apart(flow.nodes[first], flow.nodes[second])) found.push([flow.nodes[first].id, flow.nodes[second].id])
    }
  }
  return found
}

function distance(first, second) {
  const a = rect(first)
  const b = rect(second)
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width))
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height))
  return Math.hypot(dx, dy)
}

const MENU = JSON.stringify([{ text: 'Financeiro' }, { text: 'Suporte' }, { text: 'Encerrar' }])

const COMPONENTS = [
  node('boas_vindas', 'envio_pergunta', { template: 'Olá, #NAME. Este é o atendimento da Lucas Lima.' }),
  node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: MENU }),
  node('financeiro', 'envio_pergunta', { template: 'Os boletos chegam por e-mail todo dia 5.' }),
  node('volta', 'voltar', { targetNodeId: 'menu' }),
  node('suporte', 'departamentos', { departamento: 'suporte-tecnico', name: 'Suporte Técnico' }),
  node('despedida', 'envio_pergunta', { template: 'Obrigado pelo contato. Até logo.' }),
  node('fim', 'finalizar'),
]

const EDGES = [
  edge('inicio', '', 'boas_vindas'),
  edge('boas_vindas', '', 'menu'),
  edge('menu', 'Financeiro', 'financeiro'),
  edge('financeiro', '', 'volta'),
  edge('menu', 'Suporte', 'suporte'),
  edge('menu', 'Encerrar', 'despedida'),
  edge('despedida', '', 'fim'),
]

const after = (id) => COMPONENTS.findIndex((entry) => entry.id === id) + 1

function withNotes(entries) {
  const nodes = [...COMPONENTS]
  for (const [anchor, entry] of [...entries].reverse()) nodes.splice(anchor ? after(anchor) : 0, 0, entry)
  return nodes
}

const NOTED = withNotes([
  [null, note('nota_geral', 'Fluxo de boas-vindas com menu de financeiro e suporte.')],
  ['menu', note('nota_menu', 'As três opções aparecem como botões.')],
  ['financeiro', note('nota_financeiro', 'Texto revisado pelo time de cobrança.')],
  ['financeiro', note('nota_financeiro_2', 'Atualizar quando o vencimento mudar.')],
  ['suporte', note('nota_suporte', 'Fila do suporte no horário comercial.')],
])

test('cada nota fica ao lado do componente que vem logo antes dela', () => {
  const assembled = build(NOTED, EDGES)
  const menu = byRi(assembled, 'menu')
  const menuNote = byRi(assembled, 'nota_menu')
  assert.ok(distance(menuNote, menu) <= LAYOUT.noteGap + LAYOUT.noteStep, 'nota do menu longe do menu')
  for (const [riId, anchorId] of [['nota_menu', 'menu'], ['nota_financeiro', 'financeiro'], ['nota_suporte', 'suporte']]) {
    const target = byRi(assembled, riId)
    const anchor = byRi(assembled, anchorId)
    const nearest = assembled.flow.nodes.filter((entry) => entry.data.type !== 'note').sort((a, b) => distance(target, a) - distance(target, b))[0]
    assert.equal(distance(target, anchor), distance(target, nearest), `${riId} perto de ${anchorId}`)
    assert.ok(distance(target, anchor) < LAYOUT.columnGap, `${riId} a ${distance(target, anchor)}px de ${anchorId}`)
  }
  const second = byRi(assembled, 'nota_financeiro_2')
  assert.ok(distance(second, byRi(assembled, 'financeiro')) < LAYOUT.columnGap + LAYOUT.noteHeight, 'segunda nota do financeiro longe dele')
})

test('a nota à direita fica alinhada no topo com um vão pequeno quando há espaço', () => {
  const assembled = build([node('aviso', 'envio_pergunta', { template: 'Aviso.' }), note('nota_aviso', 'Explica o aviso.'), node('fim', 'finalizar')], [edge('inicio', '', 'aviso'), edge('aviso', '', 'fim')])
  const fim = byRi(assembled, 'fim')
  const nota = byRi(assembled, 'nota_aviso')
  const aviso = byRi(assembled, 'aviso')
  assert.deepEqual(overlaps(assembled.flow), [])
  assert.ok(distance(nota, aviso) <= LAYOUT.noteGap + LAYOUT.noteStep)
  assert.ok(fim.position.x > aviso.position.x)

  const lone = build([node('aviso', 'envio_pergunta', { template: 'Aviso.' }), note('nota_aviso', 'Explica o aviso.')], [edge('inicio', '', 'aviso')])
  const loneNote = byRi(lone, 'nota_aviso')
  const loneAnchor = byRi(lone, 'aviso')
  const end = lone.flow.nodes.find((entry) => entry.data.type === 'finalizar')
  assert.ok(end)
  assert.deepEqual(overlaps(lone.flow), [])
  assert.ok(distance(loneNote, loneAnchor) <= LAYOUT.noteGap + LAYOUT.noteStep)
})

test('a nota geral, escrita antes de todos os componentes, fica junto do Início', () => {
  const assembled = build(NOTED, EDGES)
  const start = assembled.flow.nodes.find((entry) => entry.id === START_ID)
  const general = byRi(assembled, 'nota_geral')
  assert.ok(distance(general, start) <= LAYOUT.noteGap + LAYOUT.noteStep, `nota geral a ${distance(general, start)}px do início`)
  const nearest = assembled.flow.nodes.filter((entry) => entry !== general).sort((a, b) => distance(general, a) - distance(general, b))[0]
  assert.equal(distance(general, nearest), distance(general, start))
})

test('várias notas não se sobrepõem entre si nem aos componentes', () => {
  const crowded = withNotes([
    [null, note('geral_1', 'Primeira nota geral.')],
    [null, note('geral_2', 'Segunda nota geral.')],
    [null, note('geral_3', 'Terceira nota geral.')],
    ...['menu', 'menu', 'menu', 'financeiro', 'financeiro', 'volta', 'suporte', 'despedida', 'fim', 'fim'].map((anchor, index) => [anchor, note(`nota_${index + 1}`, `Nota ${index + 1}.`)]),
  ])
  const assembled = build(crowded, EDGES)
  assert.deepEqual(overlaps(assembled.flow), [])
  const notes = assembled.flow.nodes.filter((entry) => entry.data.type === 'note')
  assert.equal(notes.length, 13)
  for (const first of notes) {
    for (const second of assembled.flow.nodes) {
      if (first === second) continue
      const a = rect(first)
      const b = rect(second)
      const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
      const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
      assert.ok(Math.max(gapX, gapY) >= LAYOUT.noteGap, `${first.id} encostada em ${second.id}`)
    }
  }
  const again = build(JSON.parse(JSON.stringify(crowded)), EDGES)
  assert.deepEqual(again.flow, assembled.flow)
})

test('as notas não mudam a posição de nenhum outro componente', () => {
  const plain = build(COMPONENTS, EDGES)
  const noted = build(NOTED, EDGES)
  for (const [riId, id] of plain.platformIds) {
    if (id === START_ID) continue
    const before = plain.flow.nodes.find((entry) => entry.id === id)
    const now = byRi(noted, riId)
    assert.deepEqual(now.position, before.position, riId)
  }
  const extras = (assembled) => assembled.flow.nodes.filter((entry) => !assembled.riIds.has(entry.id)).map((entry) => [entry.data.type, entry.position])
  assert.deepEqual(extras(noted), extras(plain))
  assert.deepEqual(noted.flow.nodes.find((entry) => entry.id === START_ID).position, { x: 120, y: 120 })
})

test('uma nota nova na edição fica ao lado do componente que vem antes dela no delta', () => {
  const base = importFlow(JSON.parse(exportFlow(build(COMPONENTS, EDGES).flow)))
  const assembled = build(COMPONENTS, EDGES)
  const ids = new Map([...assembled.platformIds].filter(([riId]) => riId !== START_ID))
  const suporteId = ids.get('suporte')
  const delta = {
    name: '',
    description: '',
    nodes: [
      node(suporteId, 'departamentos', { departamento: 'suporte-tecnico', name: 'Suporte Técnico N2' }),
      note('nota_n2', 'O suporte passou para o nível 2.'),
    ],
    edges: [],
  }
  const result = concludeEdit(base, applyEdit(base, delta, { now: NOW, ids }))
  const added = result.flow.nodes.find((entry) => entry.data.type === 'note')
  const suporte = result.flow.nodes.find((entry) => entry.id === suporteId)
  assert.ok(added)
  assert.ok(distance(added, suporte) <= LAYOUT.noteGap + LAYOUT.noteStep, `nota a ${distance(added, suporte)}px do suporte`)
  assert.deepEqual(overlaps(result.flow), [])
  for (const entry of base.nodes) assert.deepEqual(result.flow.nodes.find((other) => other.id === entry.id).position, entry.position, entry.id)

  const first = applyEdit(base, { name: '', description: '', nodes: [note('nota_topo', 'Resumo do fluxo.'), node(ids.get('menu'), 'envio_mensagem', { title: 'Escolha uma opção.', options: MENU })], edges: [] }, { now: NOW, ids })
  const top = first.flow.nodes.find((entry) => entry.data.type === 'note')
  const menu = first.flow.nodes.find((entry) => entry.id === ids.get('menu'))
  assert.ok(distance(top, menu) <= LAYOUT.noteGap + LAYOUT.noteStep, 'nota sem componente antes fica junto do alterado mais próximo')
  assert.deepEqual(overlaps(first.flow), [])

  const both = applyEdit(base, { name: '', description: '', nodes: [note('a', 'Primeira.'), note('b', 'Segunda.')], edges: [] }, { now: NOW, ids })
  const start = both.flow.nodes.find((entry) => entry.id === START_ID)
  for (const entry of both.flow.nodes.filter((item) => item.data.type === 'note')) assert.ok(distance(entry, start) < LAYOUT.columnGap + LAYOUT.noteHeight, entry.id)
  assert.deepEqual(overlaps(both.flow), [])
})

test('o prompt pede cada nota logo depois do componente que ela explica', () => {
  const prompt = systemPrompt()
  assert.ok(prompt.includes('Cada Nota vem em nodes logo depois do componente que ela explica'))
  assert.ok(prompt.includes('A nota geral do fluxo vem antes de todos os componentes'))
})

test('o fluxo com notas faz a ida e volta byte a byte', () => {
  const assembled = build(NOTED, EDGES)
  const text = exportFlow(assembled.flow)
  assert.equal(exportFlow(importFlow(text)), text)
  assert.equal(exportFlow(importFlow(JSON.parse(text))), text)
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map((file) => file.trim()).filter(Boolean)
for (const [index, file] of referenceFiles.entries()) {
  test(`arquivo de referência ${index + 1}: nota nova na edição mantém o resto byte a byte`, { skip: !fs.existsSync(file) && `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.` }, () => {
    const content = fs.readFileSync(file, 'utf8')
    const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    const flow = importFlow(content)
    assert.equal(exportFlow(flow), raw)
    const anchor = flow.nodes.find((entry) => entry.data.type === 'envio_pergunta') ?? flow.nodes.find((entry) => entry.id !== START_ID)
    const original = flow.nodes.find((entry) => entry.id === anchor.id)
    const result = applyEdit(flow, { name: '', description: '', nodes: [flowToRi(flow).nodes.find((entry) => entry.id === anchor.id), note('nota_ref', 'Conferir com a equipe.')], edges: [] }, { now: new Date('2026-10-13T12:00:00.000Z') })
    const added = result.flow.nodes.find((entry) => !flow.nodes.some((other) => other.id === entry.id))
    assert.equal(added.data.type, 'note')
    assert.equal(added.data.data.text, 'Conferir com a equipe.')
    assert.ok(distance(added, original) <= LAYOUT.noteGap + 40 * LAYOUT.noteStep, `nota a ${distance(added, original)}px do componente`)
    for (const other of result.flow.nodes) if (other !== added) assert.ok(apart(added, other), `nota sobre ${other.id}`)
    const exported = JSON.parse(exportFlow(result.flow))
    const rawJson = JSON.parse(raw)
    assert.deepEqual(exported.nodes.filter((entry) => entry.id !== added.id), rawJson.nodes)
    assert.deepEqual(exported.edges, rawJson.edges)
    const text = exportFlow(result.flow)
    assert.equal(exportFlow(importFlow(text)), text)
  })
}
