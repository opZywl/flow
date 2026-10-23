const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const ROOT = path.resolve(__dirname, '..')
const COMPILE = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
const nothing = () => null
const stub = (known = {}) => new Proxy(known, { get: (target, key) => (key in target ? target[key] : key === '__esModule' ? true : nothing) })
const STUBS = {
  reactflow: stub({ Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' }, BackgroundVariant: { Dots: 'dots' }, useUpdateNodeInternals: () => () => undefined }),
  'reactflow/dist/style.css': {},
  'lucide-react': new Proxy({}, { get: () => nothing }),
  '@/hooks/use-toast': { toast: () => undefined },
  '@/components/ui/dialog': stub(),
  '@/components/ui/popover': stub(),
  './node-library': { __esModule: true, default: nothing },
  './node-config-panel': { __esModule: true, default: nothing },
  './saved-flows': { __esModule: true, default: nothing },
  './custom-edge': { __esModule: true, default: nothing, EdgeActionsContext: React.createContext({}) },
}
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveAlias(request, ...rest) {
  if (STUBS[request]) return `stub:${request}`
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest)
}
const load = Module._load
Module._load = function loadStub(request, ...rest) {
  return STUBS[request] ?? load.call(this, request, ...rest)
}
require.extensions['.tsx'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: COMPILE, fileName: filename })
  module._compile(outputText, filename)
}

const frame = require('../src/flow/canvas-frame.ts')
const node = require('../src/flow/nodes/atendimento-node.tsx')
const builder = require('../src/flow/workflow-builder.tsx')
const { nodeSubject, nodeText } = require('../src/flow/ai/generation-client.ts')
const { componentCatalog, getComponentLabel } = require('../lib/atendimento/catalog.ts')
const { newNode, outputHandles } = require('../lib/atendimento/format.ts')
const { arrangeFlow } = require('../lib/atendimento/ai/arrange.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { layoutBox } = require('../lib/atendimento/ai/layout.ts')

const LIMITS = { minZoom: 0.05, maxZoom: 1, padding: 0.15 }
const CARD = { width: 280, height: 160 }
const PT_TEXT = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^!—–]*\.$/
const card = (x, y) => ({ x, y, ...CARD })
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function reactFlowFit(bounds, width, height, minZoom, maxZoom, padding) {
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(width / (bounds.width * (1 + padding)), height / (bounds.height * (1 + padding)))))
  return { x: width / 2 - (bounds.x + bounds.width / 2) * zoom, y: height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom }
}

function flowNode(type, id, values = {}) {
  const made = newNode(type, { x: 0, y: 0 }, id)
  return { ...made, data: { ...made.data, data: { ...made.data.data, ...values } } }
}

function renderNode(shown, { pick = null, focus = null } = {}) {
  const element = React.createElement(node.AtendimentoNode, { id: shown.id, type: 'custom', data: shown.data, selected: false, isConnectable: false, xPos: 0, yPos: 0, zIndex: 0, dragging: false })
  return renderToStaticMarkup(
    React.createElement(node.NodePickContext.Provider, { value: pick }, React.createElement(node.NodeFocusContext.Provider, { value: focus }, element)),
  )
}

const MENU = flowNode('envio_mensagem', '3', { title: 'Financeiro: escolha uma opção' })
const OTHER_MENU = flowNode('envio_mensagem', '4', { title: 'Como podemos ajudar?' })
const MESSAGE = flowNode('envio_pergunta', '5', { template: 'Os pagamentos são confirmados em até 2 dias úteis.' })

const PLACE_LABEL = 'o componente que vem antes do componente novo'
const FINANCE = finalizeFlow(assembleFlow({
  name: 'Atendimento Financeiro',
  description: 'Menu do financeiro com boletos e notas',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no financeiro.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Financeiro: escolha uma opção' }, { key: 'options', value: JSON.stringify([{ text: 'Boletos' }, { text: 'Notas fiscais' }, { text: 'Encerrar' }]) }] },
    { id: 'boletos', type: 'envio_pergunta', config: [{ key: 'template', value: 'Os boletos chegam por e-mail todo dia 5.' }] },
    { id: 'notas', type: 'envio_pergunta', config: [{ key: 'template', value: 'As notas ficam no portal do cliente.' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Boletos', to: 'boletos' },
    { from: 'menu', output: 'Notas fiscais', to: 'notas' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}, { now: new Date('2026-10-16T12:00:00.000Z') })).flow
const idOf = (flow, text) => flow.nodes.find((entry) => entry.data.data.template === text || entry.data.data.title === text).id
const FAREWELL = idOf(FINANCE, 'Obrigado pelo contato.')
const ANCHORS = FINANCE.nodes.filter((entry) => entry.data.type !== 'note' && outputHandles(entry).length > 0).map((entry) => entry.id)
const boxesOf = (flow, ids = flow.nodes.map((entry) => entry.id)) => new Map(flow.nodes.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, { ...entry.position, ...layoutBox(entry) }]))
const copyOf = (value) => JSON.parse(JSON.stringify(value))

function lShape(flow) {
  const ids = flow.nodes.map((entry) => entry.id)
  const down = Math.ceil(ids.length / 2)
  return ids.map((id, index) => (index < down ? { id, col: 0, row: index } : { id, col: index - down + 1, row: down - 1 }))
}

test('the canvas pick needs at least 360 by 300 pixels, below that the panel keeps the list', () => {
  assert.equal(frame.PICK_MIN_WIDTH, 360)
  assert.equal(frame.PICK_MIN_HEIGHT, 300)
  assert.equal(frame.roomForPick(360, 300), true)
  assert.equal(frame.roomForPick(1056, 815), true)
  assert.equal(frame.roomForPick(359, 900), false)
  assert.equal(frame.roomForPick(256, 600), false)
  assert.equal(frame.roomForPick(548, 244), false)
})

test('fitBox matches the React Flow fit in the whole canvas and moves below a measured banner', () => {
  const bounds = { x: 100, y: 50, width: 1800, height: 900 }
  const whole = frame.fitBox(bounds, { x: 0, y: 0, width: 1000, height: 700 }, LIMITS)
  const expected = reactFlowFit(bounds, 1000, 700, LIMITS.minZoom, LIMITS.maxZoom, LIMITS.padding)
  close(whole.zoom, expected.zoom)
  close(whole.x, expected.x)
  close(whole.y, expected.y)
  const below = frame.fitBox(bounds, { x: 0, y: 92, width: 1000, height: 608 }, LIMITS)
  const shifted = reactFlowFit(bounds, 1000, 608, LIMITS.minZoom, LIMITS.maxZoom, LIMITS.padding)
  close(below.y, shifted.y + 92)
  close(below.zoom, shifted.zoom)
  assert.equal(frame.fitBox(card(0, 0), { x: 0, y: 0, width: 1000, height: 700 }, LIMITS).zoom, 1)
  assert.equal(frame.fitBox({ x: 0, y: 0, width: 400000, height: 100 }, { x: 0, y: 0, width: 1000, height: 700 }, LIMITS).zoom, LIMITS.minZoom)
})

test('frameAround keeps every candidate when they fit above the floor', () => {
  const anchor = card(0, 0)
  const others = [card(420, 0), card(0, 300)]
  const result = frame.frameAround(anchor, others, { x: 0, y: 80, width: 1000, height: 700 }, LIMITS, 0.4)
  assert.equal(result.count, 3)
  assert.deepEqual(result.bounds, { x: 0, y: 0, width: 700, height: 460 })
  assert.deepEqual(result.view, frame.fitBox(result.bounds, { x: 0, y: 80, width: 1000, height: 700 }, LIMITS))
})

test('frameAround in a big flow keeps the nearest candidates readable and centers them at the floor zoom', () => {
  const area = { x: 0, y: 100, width: 400, height: 500 }
  const anchor = card(0, 0)
  const near = card(0, 200)
  const far = card(6000, 0)
  const result = frame.frameAround(anchor, [far, near], area, LIMITS, 0.4)
  assert.equal(result.count, 2)
  assert.deepEqual(result.bounds, { x: 0, y: 0, width: 280, height: 360 })
  assert.equal(result.view.zoom, 0.4)
  assert.deepEqual(result.view, frame.centerView(result.bounds, area, 0.4))
  assert.ok(frame.shownIn(result.bounds, result.view, area, 16))
  assert.equal(frame.shownIn(far, result.view, area, 16), false)
})

test('frameAround skips a far candidate in one direction and still takes one that fits in the other', () => {
  const area = { x: 0, y: 0, width: 400, height: 2000 }
  const result = frame.frameAround(card(0, 0), [card(1200, 0), card(0, 1300)], area, LIMITS, 0.4)
  assert.equal(result.count, 2)
  assert.deepEqual(result.bounds, { x: 0, y: 0, width: 280, height: 1460 })
})

test('frameAround with only the anchor that fits stays on it', () => {
  const result = frame.frameAround(card(500, 500), [], { x: 0, y: 64, width: 1000, height: 700 }, LIMITS, 0.5)
  assert.equal(result.count, 1)
  assert.equal(result.view.zoom, 1)
  assert.deepEqual(result.bounds, card(500, 500))
})

test('betterFrame prefers the frame with more candidates and then the closer zoom', () => {
  const few = { view: { x: 0, y: 0, zoom: 1 }, bounds: card(0, 0), count: 1 }
  const many = { view: { x: 0, y: 0, zoom: 0.5 }, bounds: card(0, 0), count: 3 }
  const near = { view: { x: 0, y: 0, zoom: 0.8 }, bounds: card(0, 0), count: 3 }
  assert.equal(frame.betterFrame(few, many), many)
  assert.equal(frame.betterFrame(many, few), many)
  assert.equal(frame.betterFrame(many, near), near)
  assert.equal(frame.betterFrame(near, many), near)
})

test('shownIn checks the free area under the banner, the side margins and the minimap corner', () => {
  const area = { x: 0, y: 90, width: 800, height: 510 }
  const view = { x: 0, y: 0, zoom: 1 }
  assert.equal(frame.shownIn(card(100, 120), view, area, 16), true)
  assert.equal(frame.shownIn(card(100, 60), view, area, 16), false)
  assert.equal(frame.shownIn(card(8, 120), view, area, 16), false)
  assert.equal(frame.shownIn(card(500, 420), view, area, 16), true)
  assert.equal(frame.shownIn(card(510, 420), view, area, 16), false)
  assert.equal(frame.shownIn(card(500, 430), view, area, 16), false)
  assert.equal(frame.shownIn(card(500, 420), view, area, 16, { x: 600, y: 450 }), false)
  assert.equal(frame.overlapsCorner(card(100, 120), view, { x: 600, y: 450 }), false)
  assert.equal(frame.overlapsCorner(card(400, 300), view, { x: 600, y: 450 }), true)
  assert.equal(frame.overlapsCorner(card(400, 300), view, null), false)
})

test('stepCandidate walks the candidates in the panel order, wraps around and skips the hidden ones', () => {
  const order = ['7', '3', '12']
  const all = new Set(order)
  assert.equal(frame.stepCandidate(order, all, null, 1), '7')
  assert.equal(frame.stepCandidate(order, all, null, -1), '12')
  assert.equal(frame.stepCandidate(order, all, '7', 1), '3')
  assert.equal(frame.stepCandidate(order, all, '12', 1), '7')
  assert.equal(frame.stepCandidate(order, all, '7', -1), '12')
  assert.equal(frame.stepCandidate(order, new Set(['7', '12']), '7', 1), '12')
  assert.equal(frame.stepCandidate(order, new Set(['7', '12']), '3', 1), '7')
  assert.equal(frame.stepCandidate(order, new Set(['3']), '3', 1), '3')
  assert.equal(frame.stepCandidate(order, new Set(), null, 1), null)
})

test('editedIds marks added, rewritten, moved and reconnected components and ignores the same content written another way', () => {
  const menu = { id: '3', type: 'custom', position: { x: 10, y: 20 }, data: { type: 'envio_mensagem', data: { title: 'Menu', options: '[]' }, html: '<p>a</p>' } }
  const message = { id: '5', type: 'custom', position: { x: 400, y: 20 }, data: { type: 'envio_pergunta', data: { template: 'Oi' }, html: '' } }
  const end = { id: '9', type: 'custom', position: { x: 800, y: 20 }, data: { type: 'finalizar', data: {}, html: '' } }
  const before = { nodes: [menu, message, end], edges: [{ id: '5-output-0', type: 'deletable', source: '5', sourceHandle: 'output-0', target: '9' }] }
  const same = {
    nodes: [
      { position: { y: 20, x: 10 }, data: { html: '<p>b</p>', data: { options: '[]', title: 'Menu' }, type: 'envio_mensagem' }, type: 'custom', id: '3', measured: { width: 280, height: 160 }, selected: false },
      { ...message },
      end,
    ],
    edges: [{ ...before.edges[0] }],
  }
  assert.deepEqual([...frame.editedIds(before, same)], [])
  const notice = { id: '10', type: 'custom', position: { x: 600, y: 200 }, data: { type: 'envio_pergunta', data: { template: 'Aviso' }, html: '' } }
  const after = {
    nodes: [{ ...menu, data: { ...menu.data, data: { title: 'Menu novo', options: '[]' } } }, message, { ...end, position: { x: 900, y: 20 } }, notice],
    edges: [
      { id: '5-output-0', type: 'deletable', source: '5', sourceHandle: 'output-0', target: '10' },
      { id: '10-output-0', type: 'deletable', source: '10', sourceHandle: 'output-0', target: '9' },
    ],
  }
  assert.deepEqual([...frame.editedIds(before, after)].sort(), ['10', '3', '5', '9'])
})

test('the preview focus follows the store: an id that exists sets it, null clears it and leaving it out keeps the current one', () => {
  const nodes = [{ id: 'inicio' }, { id: '3' }, { id: '4' }]
  assert.equal(frame.previewFocusOf('3', null, nodes), '3')
  assert.equal(frame.previewFocusOf('4', '3', nodes), '4')
  assert.equal(frame.previewFocusOf(null, '3', nodes), null)
  assert.equal(frame.previewFocusOf(undefined, '3', nodes), '3')
  assert.equal(frame.previewFocusOf(undefined, null, nodes), null)
  assert.equal(frame.previewFocusOf('9', '3', nodes), null)
  assert.equal(frame.previewFocusOf(undefined, '9', nodes), null)
})

test('zoomScale keeps the outline and the badge the same size on screen when zoomed out', () => {
  assert.equal(frame.zoomScale(0.5), 2)
  assert.equal(frame.zoomScale(0.05), 20)
  assert.equal(frame.zoomScale(1), 1)
  assert.equal(frame.zoomScale(1.6), 1)
  assert.equal(frame.zoomScale(0), 1)
})

test('the banner subject matches the text the panel lists and sends for every component type', () => {
  const long = 'Escolha uma das opções abaixo para falar com o time financeiro sobre boletos e notas'
  let compared = 0
  for (const definition of componentCatalog) {
    if (!definition.defaults || !definition.summary?.length) continue
    const type = definition.nativeType ?? definition.id
    const variants = [
      Object.fromEntries(definition.summary.map((key) => [key, long])),
      Object.fromEntries(definition.summary.map((key) => [key, '  Texto   curto\n em linhas '])),
      Object.fromEntries(definition.summary.map((key) => [key, 42.5])),
      Object.fromEntries(definition.summary.map((key, index) => [key, index === 0 ? '' : long])),
      Object.fromEntries(definition.summary.map((key) => [key, `${'x'.repeat(60)} fim`])),
    ]
    for (const values of variants) {
      const shown = flowNode(type, '42', values)
      assert.equal(node.nodeHeadline(shown.data), nodeText(shown), `${type} ${JSON.stringify(values)}`)
      assert.equal(node.pickSubject(shown.id, shown.data), nodeSubject(shown), `${type} ${JSON.stringify(values)}`)
      compared += 1
    }
  }
  assert.ok(compared > 50)
  assert.equal(node.pickSubject(MENU.id, MENU.data), `${getComponentLabel('envio_mensagem')} “Financeiro: escolha uma opção” · ID 3`)
  assert.equal(node.pickSubject('9', newNode('finalizar', { x: 0, y: 0 }, '9').data), `${getComponentLabel('finalizar')} · ID 9`)
})

test('Enter on the selected candidate confirms, Enter or Space on another selects and a held key never confirms', () => {
  assert.equal(node.pickKeyAction('Enter', 'selected'), 'confirm')
  assert.equal(node.pickKeyAction('Enter', 'selected', true), 'select')
  assert.equal(node.pickKeyAction('Enter', 'candidate'), 'select')
  assert.equal(node.pickKeyAction(' ', 'selected'), 'select')
  assert.equal(node.pickKeyAction(' ', 'candidate'), 'select')
  assert.equal(node.pickKeyAction('Escape', 'selected'), null)
  assert.equal(node.pickKeyAction('a', 'candidate'), null)
})

test('candidates carry the zoom compensated outline, the keyboard hint and the badge on the selected one', () => {
  const pick = { candidates: new Set(['3', '4']), selected: '4', select: () => undefined, confirm: () => undefined, hint: 'dica-da-selecao' }
  const candidate = renderNode(MENU, { pick })
  assert.match(candidate, /data-pick="candidate"/)
  assert.match(candidate, /role="button"/)
  assert.match(candidate, /tabindex="0"/)
  assert.match(candidate, /aria-pressed="false"/)
  assert.match(candidate, /aria-describedby="dica-da-selecao"/)
  assert.match(candidate, /outline-dashed outline-\[length:calc\(2px\*var\(--pick-scale,1\)\)\] outline-offset-\[calc\(4px\*var\(--pick-scale,1\)\)\]/)
  assert.doesNotMatch(candidate, /scale-\[var\(--pick-scale,1\)\]/)
  assert.match(candidate, /translate-y-0 opacity-100[^"]*" title="ID 3"/)
  const selected = renderNode(OTHER_MENU, { pick })
  assert.match(selected, /data-pick="selected"/)
  assert.match(selected, /aria-pressed="true"/)
  assert.match(selected, /outline-\[length:calc\(3px\*var\(--pick-scale,1\)\)\]/)
  assert.match(selected, /scale-\[var\(--pick-scale,1\)\]/)
  const dimmed = renderNode(MESSAGE, { pick })
  assert.match(dimmed, /data-pick="dimmed"/)
  assert.match(dimmed, /opacity-40/)
  assert.doesNotMatch(dimmed, /role="button"|aria-describedby|data-pick-focus/)
})

test('after Confirmar the chosen component keeps a passive outline with its ID until the pick marks take over', () => {
  const focused = renderNode(MENU, { focus: '3' })
  assert.match(focused, /data-pick-focus=""/)
  assert.match(focused, /outline outline-\[length:calc\(2px\*var\(--pick-scale,1\)\)\]/)
  assert.match(focused, /translate-y-0 opacity-100[^"]*" title="ID 3"/)
  assert.doesNotMatch(focused, /data-pick="|role="button"|tabindex/)
  const other = renderNode(OTHER_MENU, { focus: '3' })
  assert.doesNotMatch(other, /data-pick/)
  const plain = renderNode(MENU)
  assert.doesNotMatch(plain, /data-pick|--pick-scale/)
  const picking = renderNode(MENU, { focus: '3', pick: { candidates: new Set(['3', '4']), selected: null, select: () => undefined, confirm: () => undefined } })
  assert.match(picking, /data-pick="candidate"/)
  assert.doesNotMatch(picking, /data-pick-focus/)
})

test('the canvas banner shows the main text of the selected component, Anterior and Próximo, and the keyboard hint', () => {
  const props = { hintId: 'dica', label: 'o menu de opções', selection: '', steps: 2, onStep: () => undefined, onCancel: () => undefined, onConfirm: () => undefined }
  const empty = renderToStaticMarkup(React.createElement(builder.PickBanner, props))
  assert.match(empty, /aria-label="Seleção no canvas"/)
  assert.match(empty, /Selecione o menu de opções no canvas\./)
  assert.match(empty, /role="status"[^>]*>Clique em um dos componentes destacados\.</)
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/)
  assert.match(empty, /<button type="button" aria-label="Anterior" title="Componente anterior"[^>]*><\/button>/)
  assert.match(empty, /<button type="button" aria-label="Próximo" title="Próximo componente"[^>]*><\/button>/)
  assert.doesNotMatch(empty, /aria-label="(Anterior|Próximo)"[^>]*disabled=""/)
  const hint = /<p id="dica" class="sr-only">([^<]+)<\/p>/.exec(empty)
  assert.ok(hint)
  assert.match(hint[1], PT_TEXT)
  const subject = node.pickSubject(MENU.id, MENU.data)
  const chosen = renderToStaticMarkup(React.createElement(builder.PickBanner, { ...props, selection: subject }))
  assert.match(chosen, new RegExp(`role="status" title="${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
  assert.match(chosen, new RegExp(`Selecionado: <span[^>]*>${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`))
  assert.doesNotMatch(chosen, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/)
  assert.match(chosen, /title="Confirmar \(Enter ou duplo clique no componente\)"/)
  const single = renderToStaticMarkup(React.createElement(builder.PickBanner, { ...props, steps: 1 }))
  assert.match(single, /<button type="button" disabled="" aria-label="Anterior"/)
  assert.match(single, /<button type="button" disabled="" aria-label="Próximo"/)
  const bare = renderToStaticMarkup(React.createElement(builder.PickBanner, { ...props, hintId: undefined }))
  assert.doesNotMatch(bare, /sr-only/)
})

test('a pick open to any component asks on the canvas to click any component, and the chosen Iniciar Fluxo shows in the banner', () => {
  const props = { hintId: 'dica', label: 'o componente', selection: '', steps: 6, onStep: () => undefined, onCancel: () => undefined, onConfirm: () => undefined }
  const open = renderToStaticMarkup(React.createElement(builder.PickBanner, { ...props, any: true }))
  assert.match(open, /Selecione o componente no canvas\./)
  const status = /role="status"[^>]*>([^<]+)</.exec(open)
  assert.ok(status)
  assert.equal(status[1], 'Clique em qualquer componente com saída.')
  assert.match(status[1], PT_TEXT)
  assert.match(open, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/)
  assert.doesNotMatch(open, /aria-label="(Anterior|Próximo)"[^>]*disabled=""/)
  const listed = renderToStaticMarkup(React.createElement(builder.PickBanner, props))
  assert.match(listed, /role="status"[^>]*>Clique em um dos componentes destacados\.</)
  const start = flowNode('trigger_message', 'inicio')
  const subject = node.pickSubject(start.id, start.data)
  assert.equal(subject, `${getComponentLabel('trigger_message')} · ID inicio`)
  const chosen = renderToStaticMarkup(React.createElement(builder.PickBanner, { ...props, any: true, selection: subject }))
  assert.match(chosen, new RegExp(`Selecionado: <span[^>]*>${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`))
  assert.doesNotMatch(chosen, /Clique em qualquer componente/)
})

test('with every component as candidate, Iniciar Fluxo and the messages carry the candidate mark and only the notes stay dimmed', () => {
  const start = flowNode('trigger_message', 'inicio')
  const note = flowNode('note', 'nota', { text: 'Revisar o menu com o time de cobrança.' })
  const pick = { candidates: new Set(['inicio', MENU.id, OTHER_MENU.id, MESSAGE.id]), selected: null, select: () => undefined, confirm: () => undefined, hint: 'dica' }
  const first = renderNode(start, { pick })
  assert.match(first, /data-pick="candidate"/)
  assert.match(first, /role="button"/)
  assert.match(first, new RegExp(`aria-label="${getComponentLabel('trigger_message')}, ID inicio"`))
  assert.match(first, /title="ID inicio"/)
  for (const shown of [MENU, OTHER_MENU, MESSAGE]) assert.match(renderNode(shown, { pick }), /data-pick="candidate"/)
  const dimmed = renderNode(note, { pick })
  assert.match(dimmed, /data-pick="dimmed"/)
  assert.match(dimmed, /opacity-40/)
  assert.doesNotMatch(dimmed, /role="button"/)
  const picked = renderNode(start, { pick: { ...pick, selected: 'inicio' } })
  assert.match(picked, /data-pick="selected"/)
  assert.match(picked, /aria-pressed="true"/)
})

test('a listed pick fades the connections, a pick open to any component keeps them readable, and both lock them', () => {
  const locked = { selectable: false, deletable: false, focusable: false, updatable: false }
  assert.deepEqual(builder.edgeLock(true, false, true), { ...locked, className: 'opacity-30 transition-opacity' })
  assert.deepEqual(builder.edgeLock(true, true, true), locked)
  assert.deepEqual(builder.edgeLock(false, false, true), locked)
  assert.equal(builder.edgeLock(false, false, false), null)
})

test('a pick request with the suggested component starts with it selected, also when every component with an output is a candidate', () => {
  const shown = new Set(FINANCE.nodes.map((entry) => entry.id))
  assert.equal(ANCHORS.length, 6)
  assert.ok(ANCHORS.includes('inicio') && ANCHORS.includes(FAREWELL))
  const opened = builder.pickStart({ label: `${PLACE_LABEL}.`, candidates: ANCHORS, selected: FAREWELL, any: true }, shown)
  assert.deepEqual(opened, { label: PLACE_LABEL, order: ANCHORS, candidates: new Set(ANCHORS), selected: FAREWELL, any: true })
  const listed = builder.pickStart({ label: 'o menu de opções', candidates: [MENU.id, OTHER_MENU.id], selected: OTHER_MENU.id }, new Set([MENU.id, OTHER_MENU.id, MESSAGE.id]))
  assert.equal(listed.selected, OTHER_MENU.id)
  assert.equal(listed.any, false)
  const end = FINANCE.nodes.find((entry) => outputHandles(entry).length === 0).id
  assert.equal(builder.pickStart({ label: PLACE_LABEL, candidates: ANCHORS, selected: end, any: true }, shown).selected, null)
  assert.equal(builder.pickStart({ label: PLACE_LABEL, candidates: ANCHORS, selected: null, any: true }, shown).selected, null)
  const gone = builder.pickStart({ label: PLACE_LABEL, candidates: ANCHORS, selected: FAREWELL, any: true }, new Set([...shown].filter((id) => id !== FAREWELL)))
  assert.equal(gone.selected, null)
  assert.deepEqual(gone.order, ANCHORS.filter((id) => id !== FAREWELL))
  assert.deepEqual(builder.pickStart({ label: ' ', candidates: ['3', '3', 4, null, '5', '9'], selected: '5' }, new Set(['3', '5'])), { label: 'o componente', order: ['3', '5'], candidates: new Set(['3', '5']), selected: '5', any: false })
  assert.equal(builder.pickStart({ label: PLACE_LABEL, candidates: ['99'], selected: '99', any: true }, shown), null)
  const subject = node.pickSubject(FAREWELL, FINANCE.nodes.find((entry) => entry.id === FAREWELL).data)
  const banner = renderToStaticMarkup(React.createElement(builder.PickBanner, { hintId: 'dica', label: opened.label, selection: subject, steps: opened.order.length, any: opened.any, onStep: () => undefined, onCancel: () => undefined, onConfirm: () => undefined }))
  assert.match(banner, /Selecione o componente que vem antes do componente novo no canvas\./)
  assert.match(banner, new RegExp(`Selecionado: <span[^>]*>${escape(subject)}</span>`))
  assert.doesNotMatch(banner, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/)
})

test('the canvas pick starts framed on the suggested component instead of the first candidate, also beside the minimap', () => {
  const boxes = boxesOf(FINANCE, ANCHORS)
  const area = { x: 0, y: 92, width: 560, height: 420 }
  const first = builder.pickFrame(boxes, ANCHORS, null, area, null)
  assert.ok(frame.shownIn(boxes.get('inicio'), first.view, area, 16))
  assert.equal(frame.shownIn(boxes.get(FAREWELL), first.view, area, 16), false)
  const suggested = builder.pickFrame(boxes, ANCHORS, FAREWELL, area, null)
  assert.ok(frame.shownIn(boxes.get(FAREWELL), suggested.view, area, 16))
  assert.equal(frame.shownIn(boxes.get('inicio'), suggested.view, area, 16), false)
  assert.ok(suggested.count > 1)
  assert.ok(suggested.view.zoom >= 0.4)
  const anchor = boxes.get(FAREWELL)
  assert.deepEqual(suggested, frame.frameAround(anchor, [...boxes.values()].filter((box) => box !== anchor), area, LIMITS, 0.4))
  const corner = { x: 360, y: 362 }
  assert.ok(frame.overlapsCorner(suggested.bounds, suggested.view, corner))
  const beside = builder.pickFrame(boxes, ANCHORS, FAREWELL, area, corner)
  assert.ok(frame.shownIn(boxes.get(FAREWELL), beside.view, area, 16, corner))
  assert.equal(frame.overlapsCorner(beside.bounds, beside.view, corner), false)
  assert.deepEqual(builder.pickFrame(boxes, ANCHORS, 'sumiu', area, null), first)
  assert.equal(builder.pickFrame(new Map(), ANCHORS, FAREWELL, area, null), null)
})

test('an arranged preview is a new layout of the same components, and an edit, a new component or a new connection is not', () => {
  const arranged = arrangeFlow(FINANCE, lShape(FINANCE))
  assert.equal(arranged.moved.length, FINANCE.nodes.length - 1)
  assert.deepEqual(builder.relaidIds(FINANCE, arranged.flow), arranged.moved)
  const column = arrangeFlow(arranged.flow, arranged.flow.nodes.map((entry, index) => ({ id: entry.id, col: 0, row: index })))
  assert.ok(column.moved.length > 0)
  assert.deepEqual(builder.relaidIds(arranged.flow, column.flow), column.moved)
  assert.deepEqual(builder.relaidIds(FINANCE, copyOf(FINANCE)), [])
  assert.deepEqual(builder.relaidIds(arranged.flow, arranged.flow), [])
  const reordered = copyOf(arranged.flow)
  for (const entry of reordered.nodes) {
    entry.data.data = Object.fromEntries(Object.entries(entry.data.data).reverse())
    entry.data.html = '<p>outro html</p>'
  }
  assert.deepEqual(builder.relaidIds(FINANCE, reordered), arranged.moved)
  const rewritten = copyOf(arranged.flow)
  rewritten.nodes.find((entry) => entry.id === FAREWELL).data.data.template = 'Até logo.'
  assert.deepEqual(builder.relaidIds(FINANCE, rewritten), [])
  const grown = copyOf(arranged.flow)
  grown.nodes.push(newNode('envio_pergunta', { x: 0, y: 0 }, '40'))
  assert.deepEqual(builder.relaidIds(FINANCE, grown), [])
  const rewired = copyOf(arranged.flow)
  const exit = rewired.edges.find((edge) => edge.source === FAREWELL)
  exit.target = rewired.nodes.find((entry) => outputHandles(entry).length === 0 && entry.id !== exit.target).id
  assert.deepEqual(builder.relaidIds(FINANCE, rewired), [])
  const twin = copyOf(arranged.flow)
  twin.nodes[1] = { ...twin.nodes[0] }
  assert.deepEqual(builder.relaidIds(FINANCE, twin), [])
})

test('an arranged preview frames every component at its new position, and following centers one component at the follow zoom', () => {
  const arranged = arrangeFlow(FINANCE, lShape(FINANCE)).flow
  const boxes = boxesOf(arranged)
  const area = { x: 0, y: 92, width: 1000, height: 608 }
  const whole = builder.previewFrame(boxes, FAREWELL, true, area, 1)
  for (const [id, box] of boxes) assert.ok(frame.shownIn(box, whole.view, area, 16), `componente ${id}`)
  assert.deepEqual(whole, builder.previewFrame(boxes, null, false, area, 1))
  assert.deepEqual(whole, builder.previewFrame(boxes, 'sumiu', false, area, 1))
  const before = builder.previewFrame(boxesOf(FINANCE), null, false, area, 1)
  assert.ok([...boxes.values()].some((box) => !frame.shownIn(box, before.view, area, 16)))
  const followed = builder.previewFrame(boxes, FAREWELL, false, area, 1)
  assert.equal(followed.view.zoom, 1)
  assert.deepEqual(followed.bounds, boxes.get(FAREWELL))
  assert.deepEqual(followed.view, frame.centerView(boxes.get(FAREWELL), area, 1))
  assert.ok(frame.shownIn(boxes.get(FAREWELL), followed.view, area, 16))
  const closer = builder.previewFrame(boxes, FAREWELL, false, area, 1.44)
  assert.equal(closer.view.zoom, 1.44)
  assert.deepEqual(closer.view, frame.centerView(boxes.get(FAREWELL), area, 1.44))
  assert.equal(builder.previewFrame(new Map(), null, false, area, 1), null)
})

test('the followed component is the newest one, then the last changed one, then the one already followed, and never the start', () => {
  const base = copyOf(FINANCE)
  const ids = base.nodes.filter((entry) => entry.data.type !== 'trigger_message').map((entry) => entry.id)
  assert.equal(builder.followTarget(base.nodes, null, null), ids[ids.length - 1])
  const grown = copyOf(base)
  grown.nodes.push(newNode('envio_pergunta', { x: 0, y: 0 }, '40'), newNode('envio_pergunta', { x: 0, y: 0 }, '41'))
  assert.equal(builder.followTarget(grown.nodes, base.nodes, ids[0]), '41')
  const edited = copyOf(base)
  edited.nodes.find((entry) => entry.id === ids[1]).data.html = '<p>novo</p>'
  assert.equal(builder.followTarget(edited.nodes, base.nodes, ids[0]), ids[1])
  assert.equal(builder.followTarget(copyOf(base).nodes, base.nodes, ids[0]), ids[0])
  assert.equal(builder.followTarget(copyOf(base).nodes, base.nodes, 'sumiu'), ids[ids.length - 1])
  assert.equal(builder.followTarget(base.nodes.filter((entry) => entry.data.type === 'trigger_message'), null, null), null)
})
