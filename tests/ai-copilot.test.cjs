const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const STUBS = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/hooks/use-toast': { toast: () => undefined },
  './flow-select': { FlowSelect: () => null },
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

const copilot = require('../src/flow/ai/copilot-store.ts')
const { importFlow, newFlow, newNode } = require('../lib/atendimento/format.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { applyEdit, diffFlows, flowToRi } = require('../lib/atendimento/ai/edit.ts')
const { previewEdit } = require('../lib/atendimento/ai/preview.ts')
const { documentKey, keyWarning, nodeSubject, nodeText } = require('../src/flow/ai/generation-client.ts')
const { PROVIDERS } = require('../lib/atendimento/ai/providers.ts')

function loadPanel() {
  const file = path.join(ROOT, 'src/flow/ai-copilot.tsx')
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  })
  const panel = new Module(file, module)
  panel.filename = file
  panel.paths = Module._nodeModulePaths(path.dirname(file))
  panel._compile(outputText, file)
  return panel.exports
}

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const NOW = new Date('2026-01-15T12:00:00.000Z')
const PT_TEXT = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^!—–]*\.$/
const BOLETO_TEXT = 'Acesse a segunda via em https://boletos.exemplo.com.br.'
const NEW_OPTION = 'Segunda via de boleto'
const EDIT_MESSAGE = 'Vou aplicar essa mudança no fluxo.'
const OPTION_REQUEST = 'crie uma opcao 8'
const OPTION_QUESTION = 'Pensei na opção Segunda via de boleto, que envia o link do boleto e encerra. Fica assim ou quer outro texto?'
const OPTION_DRAFT = 'No menu Como podemos ajudar?, acrescente a opção Segunda via de boleto.'
const OPTION_PLAN = 'No menu Como podemos ajudar?, acrescente a opção Segunda via de boleto, que envia o link https://boletos.exemplo.com.br e encerra o atendimento.'
const OPTION_EDIT = 'Vou acrescentar a opção Segunda via de boleto no menu.'
const SUMMARY = 'Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.'

const SOURCE = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, menu e transferência para a equipe certa',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: 'Agendamento' }, { key: 'departamento', value: 'agendamento' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato. Até logo.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Agendar consulta', to: 'agenda' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const BASE = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(SOURCE, { now: NOW })).flow)))
const BASE_RI = flowToRi(BASE)
const MENU = BASE_RI.nodes.find((node) => node.type === 'envio_mensagem')
const DELTA = {
  name: '',
  description: '',
  nodes: [
    { id: MENU.id, type: 'envio_mensagem', config: MENU.config.map((entry) => (entry.key === 'options' ? { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }, { text: NEW_OPTION }]) } : entry)) },
    { id: 'boleto', type: 'envio_pergunta', config: [{ key: 'template', value: BOLETO_TEXT }] },
    { id: 'fim_boleto', type: 'finalizar', config: [] },
  ],
  edges: [
    ...BASE_RI.edges.filter((edge) => edge.from === MENU.id),
    { from: MENU.id, output: NEW_OPTION, to: 'boleto' },
    { from: 'boleto', output: '', to: 'fim_boleto' },
  ],
}
const FIRST = applyEdit(BASE, DELTA, { now: NOW }).flow
const FIRST_RI = flowToRi(FIRST)
const textNode = (ri, text) => ri.nodes.find((node) => node.config.some((entry) => entry.value === text))
const SECOND = applyEdit(FIRST, {
  name: '',
  description: '',
  nodes: [
    { id: textNode(FIRST_RI, BOLETO_TEXT).id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Segunda via: https://boletos.exemplo.com.br/2via.' }] },
    { id: textNode(FIRST_RI, 'Obrigado pelo contato. Até logo.').id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato. Volte sempre.' }] },
  ],
  edges: [],
}, { now: NOW }).flow

const ISSUE = { severity: 'warning', scope: 'plataforma', message: 'Confira o departamento Agendamento.', nodeId: '4' }

const [WELCOME, FAREWELL] = BASE.nodes.filter((node) => node.data.type === 'envio_pergunta')
const BOLETO = FIRST.nodes.find((node) => node.data.type === 'envio_pergunta' && !BASE.nodes.some((known) => known.id === node.id))
const MOVED = { ...BASE, nodes: BASE.nodes.map((node) => (node.id === FAREWELL.id ? { ...node, position: { x: node.position.x + 40, y: node.position.y + 24 } } : node)) }
const CHANGED = { ...BASE, nodes: BASE.nodes.map((node) => (node.id === FAREWELL.id ? { ...node, data: { ...node.data, data: { ...node.data.data, template: 'Até a próxima.' } } } : node)) }
const PICK_REQUEST = 'crie uma pergunta de CPF atrás do Enviar Mensagem'
const PICK_QUESTION = 'O fluxo tem duas mensagens. Selecione no canvas a mensagem que vem antes da pergunta de CPF.'
const PICK_DRAFT = 'Depois da mensagem escolhida, acrescente uma pergunta pedindo o CPF do cliente.'
const PICK_PLAN = `Depois da mensagem Obrigado pelo contato. Até logo., ID ${FAREWELL.id}, acrescente uma pergunta pedindo o CPF do cliente.`
const PICK_EDIT = 'Vou acrescentar a pergunta de CPF depois da despedida.'
const PICK_CHIPS = ['Na boas-vindas', 'Na despedida']
const PICK_READY = 'Acrescente uma pergunta pedindo o CPF do cliente logo depois do componente que o usuário selecionar.'
const AGENDA = BASE.nodes.find((node) => node.data.type === 'departamentos')
const FAREWELL_RI = textNode(BASE_RI, 'Obrigado pelo contato. Até logo.').id
const FAREWELL_DELTA = { name: '', description: '', nodes: [{ id: FAREWELL_RI, type: 'envio_pergunta', config: [{ key: 'template', value: 'Até a próxima.' }] }], edges: [] }
const NOTICE_BEFORE = applyEdit(BASE, {
  name: '',
  description: '',
  nodes: [{ id: 'aviso', type: 'envio_pergunta', config: [{ key: 'template', value: 'Aviso: o atendimento vai encerrar.' }] }],
  edges: [{ from: MENU.id, output: 'Encerrar', to: 'aviso' }, { from: 'aviso', output: '', to: FAREWELL_RI }],
}, { now: NOW }).flow
const BOTH = { ...CHANGED, nodes: CHANGED.nodes.map((node) => (node.id === WELCOME.id ? { ...node, data: { ...node.data, data: { ...node.data.data, template: 'Oi, #NAME.' } } } : node)) }
const NOTE = newNode('note', { x: 480, y: 120 }, 'nota')
const BLANK = newFlow(NOW)
const NOTES_ONLY = importFlow({ ...BLANK, nodes: [...BLANK.nodes, { ...NOTE, data: { ...NOTE.data, data: { ...NOTE.data.data, text: 'Revisar o menu com o time de cobrança.' } } }] })
const NOTED = importFlow({ ...BASE, nodes: [...BASE.nodes, NOTE] })
const START_REQUEST = 'Comece com uma mensagem de boas-vindas'
const START_QUESTION = 'Pensei em uma boas-vindas com o nome do cliente, seguida do encerramento. Fica assim?'
const START_DRAFT = 'A partir do Início, acrescente uma mensagem de boas-vindas.'
const START_PLAN = 'A partir do Início, acrescente a mensagem Olá, #NAME. Você está no atendimento da Clínica Exemplo. e depois encerre a conversa.'
const START_EDIT = 'Vou montar a boas-vindas a partir do Início.'
const START_DELTA = {
  name: '',
  description: '',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [{ from: 'inicio', output: '', to: 'boas_vindas' }, { from: 'boas_vindas', output: '', to: 'fim' }],
}
const STARTED = applyEdit(BLANK, START_DELTA, { now: NOW }).flow
const NOTES_STARTED = applyEdit(NOTES_ONLY, START_DELTA, { now: NOW }).flow
const BLANK_MOVED = { ...BLANK, nodes: BLANK.nodes.map((node) => ({ ...node, position: { x: node.position.x + 40, y: node.position.y + 24 } })) }

function received(flow, extra = {}) {
  return {
    ok: true,
    received: { flow, issues: [], rounds: 1, usage: { inputTokens: 11, outputTokens: 22, totalTokens: 33 }, transcript: '', model: 'gpt-6.1-sol', partial: false, mode: 'edit', ...extra },
  }
}

function rejected(code, title, details, field) {
  return { ok: false, rejection: { code, failure: { title, details, items: [] }, ...(field ? { field } : {}) } }
}

function turn(action, message, plan = '', suggestions = []) {
  return { ok: true, turn: { action, message, suggestions, plan } }
}

const asked = (message, suggestions, plan = '') => turn('ask', message, plan, suggestions)
const edited = (plan = '', message = EDIT_MESSAGE) => turn('edit', message, plan)
const picked = (candidates, label = 'A mensagem.', plan = PICK_DRAFT) => ({ ok: true, turn: { action: 'ask', message: PICK_QUESTION, suggestions: PICK_CHIPS, plan, pick: { label, candidates } } })
const readied = (candidates, plan = PICK_READY) => ({ ok: true, turn: { action: 'ask', message: PICK_QUESTION, suggestions: PICK_CHIPS, plan, pick: { label: 'A mensagem.', candidates, ready: true } } })
const choice = (node) => `${copilot.PICK_PREFIX} ${nodeSubject(node)}`
const delayed = (answer) => {
  const release = gate()
  return { release, turn: async () => { await release.opened; return answer } }
}

function fakeCanvas(reach = (request) => request.candidates) {
  const canvas = {
    calls: [],
    request: null,
    start(request) {
      canvas.calls.push(['start', request.label, request.candidates, request.selected])
      canvas.request = request
      return reach(request)
    },
    select(id) {
      canvas.calls.push(['select', id])
    },
    confirm() {
      canvas.calls.push(['confirm'])
    },
    end() {
      canvas.calls.push(['end'])
      canvas.request = null
    },
  }
  return canvas
}

function leave(canvas) {
  const request = canvas.request
  canvas.request = null
  return request
}

function refused(code, error, details, field) {
  return { ok: false, failure: { success: false, code, error, ...(details ? { details } : {}), ...(field ? { field } : {}) } }
}

function waiting(signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })), { once: true })
  })
}

function gate() {
  let open
  const opened = new Promise((resolve) => {
    open = resolve
  })
  return { opened, open }
}

function harness({ flow = BASE, outcomes = [], turns = null, visible = true } = {}) {
  const env = {
    flow,
    accept: true,
    previews: [],
    fresh: [],
    focus: [],
    applied: [],
    notified: [],
    requests: [],
    turns: [],
    settings: { provider: 'openai', model: 'gpt-6.1-sol', apiKey: ` ${KEY} `, effort: 'medium', fill: true },
  }
  const options = {
    get settings() {
      return env.settings
    },
    getFlow: () => env.flow,
    preview: (shown, done, fresh, focus) => {
      env.previews.push(shown ? { flow: shown, done } : null)
      env.fresh.push(fresh)
      env.focus.push(focus)
    },
    applyEdit: (applied) => {
      env.applied.push(applied)
      if (env.accept) env.flow = applied
      return env.accept
    },
    async generate(request, signal, onProgress, onPartial, engine) {
      env.requests.push({ request, signal, engine, onPartial })
      const next = outcomes.shift()
      if (typeof next === 'function') return next({ request, signal, onProgress, onPartial })
      if (!next) throw new Error('pedido inesperado')
      return next
    },
    async turn(input, signal, onPartial) {
      env.turns.push({ ...input, history: JSON.parse(JSON.stringify(input.history)), signal, onPartial })
      const next = turns ? turns.shift() : edited()
      if (typeof next === 'function') return next({ input, signal, onPartial })
      if (!next) throw new Error('turno inesperado')
      return next
    },
    engine: async () => ({ previewEdit, diffFlows }),
    notify: (attention) => env.notified.push(attention),
    interval: 0,
  }
  const store = copilot.createCopilot(() => options)
  if (visible) store.setVisible(true)
  return { store, env, outcomes }
}

function until(store, check) {
  if (check(store.getState())) return Promise.resolve(store.getState())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error('o copiloto não chegou ao estado esperado'))
    }, 2000)
    const stop = store.subscribe(() => {
      if (!check(store.getState())) return
      clearTimeout(timer)
      stop()
      resolve(store.getState())
    })
  })
}

const settled = (store) => until(store, (state) => !state.thinking && !state.running)
const started = (store) => until(store, (state) => state.running)
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (check, limit = 2000) => {
  const deadline = Date.now() + limit
  let value = check()
  while (!value && Date.now() < deadline) {
    await tick()
    value = check()
  }
  return value
}
const liveFrame = (env) => {
  const frame = lastPreview(env)
  return frame && frame.done === false && frame.flow.nodes.length > BASE.nodes.length ? frame : null
}
const kinds = (state) => state.entries.map((entry) => (entry.kind === 'proposal' ? `proposal:${entry.status}` : entry.kind === 'note' ? `note:${entry.text}` : `${entry.kind}`))
const texts = (state) => state.entries.map((entry) => (entry.kind === 'proposal' ? `proposal:${entry.status}` : entry.kind === 'error' ? `error:${entry.failure.title}` : `${entry.kind}:${entry.text}`))
const lastPreview = (env) => env.previews.at(-1)
const proposals = (state) => state.entries.filter((entry) => entry.kind === 'proposal')

const counts = (diff) => [diff.added.length, diff.changed.length, diff.removed.length]

test('the fixtures add two components and change the menu, then change two texts', () => {
  assert.deepEqual(counts(diffFlows(BASE, FIRST)), [2, 1, 0])
  assert.deepEqual(counts(diffFlows(FIRST, SECOND)), [0, 2, 0])
  assert.deepEqual(counts(diffFlows(BASE, SECOND)), [2, 2, 0])
})

test('a request goes to the AI first, then the edit runs on the open flow, shows on the canvas and ends with a pending proposal', async () => {
  const { store, env } = harness({ outcomes: [received(FIRST, { issues: [ISSUE] })] })
  assert.equal(store.send('  Acrescente a opção Segunda via de boleto no menu  '), true)
  let state = store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.running, false)
  assert.deepEqual(kinds(state), ['user'])
  assert.equal(state.entries[0].text, 'Acrescente a opção Segunda via de boleto no menu')
  assert.deepEqual(env.previews, [])
  assert.equal(store.send('outro pedido'), false)
  assert.equal(env.turns.length, 1)
  assert.deepEqual(env.turns[0].history, [{ role: 'user', text: 'Acrescente a opção Segunda via de boleto no menu' }])
  assert.equal(env.turns[0].flow, BASE)
  assert.equal(env.turns[0].proposal, false)
  assert.deepEqual(env.turns[0].settings, env.settings)

  state = await started(store)
  assert.equal(state.thinking, false)
  assert.equal(state.refining, false)
  assert.equal(typeof state.startedAt, 'number')
  assert.deepEqual(texts(state), ['user:Acrescente a opção Segunda via de boleto no menu', `assistant:${EDIT_MESSAGE}`])
  assert.deepEqual(env.previews[0], { flow: BASE, done: false })
  assert.equal(store.send('outro pedido'), false)

  state = await settled(store)
  const { request } = env.requests[0]
  assert.deepEqual(
    { ...request, base: undefined },
    { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, prompt: 'Acrescente a opção Segunda via de boleto no menu', image: null, size: 'auto', effort: 'medium', fill: true, mode: 'edit', base: undefined },
  )
  assert.equal(request.base, BASE)
  assert.equal(typeof env.requests[0].engine.previewEdit, 'function')
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:pending'])
  const entry = state.entries[2]
  assert.equal(state.pending, entry.id)
  assert.equal(state.running, false)
  assert.equal(state.progress, null)
  assert.equal(entry.proposal.flow, FIRST)
  assert.equal(entry.proposal.original, BASE)
  assert.equal(entry.proposal.base, BASE)
  assert.equal(entry.proposal.prompt, 'Acrescente a opção Segunda via de boleto no menu')
  assert.deepEqual(entry.proposal.changes, { added: 2, changed: 1, removed: 0 })
  assert.deepEqual(entry.proposal.issues, [ISSUE])
  assert.equal(entry.proposal.fill, true)
  assert.equal(entry.proposal.effort, 'medium')
  assert.equal(entry.proposal.usage.totalTokens, 33)
  assert.equal(copilot.proposalTitle(entry.proposal), 'Edição pronta com 1 pendência')
  assert.equal(copilot.proposalTone(entry.proposal), 'warning')
  assert.deepEqual(copilot.proposalGroups(entry.proposal).map((group) => [group.title, group.items.length, group.hint]), [
    ['Dados da plataforma', 1, 'Valores provisórios de nomes, IDs e URLs. Troque cada um pelo valor cadastrado na plataforma.'],
  ])
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })
  assert.deepEqual(env.notified, [])
  assert.equal(state.attention, null)
  assert.equal(env.turns.length, 1)
})

test('crie uma opcao 8: the AI asks with suggestions, the answer goes back with the whole conversation and the edit uses the plan as the prompt', async () => {
  const { store, env } = harness({
    turns: [asked(OPTION_QUESTION, ['Pode ser assim', ' Quero outro texto ', 'pode ser assim', '', 7], OPTION_DRAFT), edited(OPTION_PLAN, OPTION_EDIT)],
    outcomes: [received(FIRST)],
  })
  assert.equal(store.send(OPTION_REQUEST), true)
  let state = await settled(store)
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_QUESTION}`])
  assert.deepEqual(state.suggestions, ['Pode ser assim', 'Quero outro texto'])
  assert.equal(state.plan, OPTION_DRAFT)
  assert.equal(state.running, false)
  assert.equal(state.pending, null)
  assert.equal(env.requests.length, 0)
  assert.deepEqual(env.previews, [])
  assert.equal(state.attention, null)
  assert.deepEqual(env.notified, [])
  assert.deepEqual(env.turns[0].history, [{ role: 'user', text: OPTION_REQUEST }])
  assert.equal(env.turns[0].flow, BASE)
  assert.equal(env.turns[0].proposal, false)

  assert.equal(store.send('Pode ser assim'), true)
  state = store.getState()
  assert.equal(state.thinking, true)
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.plan, OPTION_DRAFT)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: OPTION_REQUEST },
    { role: 'assistant', text: OPTION_QUESTION },
    { role: 'user', text: 'Pode ser assim' },
  ])

  state = await started(store)
  assert.equal(state.plan, OPTION_PLAN)
  state = await settled(store)
  assert.equal(env.requests[0].request.prompt, OPTION_PLAN)
  assert.equal(env.requests[0].request.base, BASE)
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_QUESTION}`, 'user:Pode ser assim', `assistant:${OPTION_EDIT}`, 'proposal:pending'])
  assert.equal(proposals(state)[0].proposal.prompt, OPTION_PLAN)
  assert.equal(state.plan, '')
  assert.deepEqual(state.suggestions, [])
  assert.equal(store.editNow(), false)
  assert.equal(env.turns.length, 2)
})

test('generate from the AI is treated as an edit of the open flow', async () => {
  const { store, env } = harness({ turns: [turn('generate', 'Vou montar a opção nova.', OPTION_PLAN)], outcomes: [received(FIRST)] })
  store.send(OPTION_REQUEST)
  const state = await settled(store)
  assert.equal(env.requests.length, 1)
  assert.equal(env.requests[0].request.mode, 'edit')
  assert.equal(env.requests[0].request.base, BASE)
  assert.equal(env.requests[0].request.prompt, OPTION_PLAN)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:pending'])
  assert.equal(state.entries[1].text, 'Vou montar a opção nova.')
})

test('finish ends the request without editing and clears the suggestions and the plan', async () => {
  const { store, env } = harness({
    turns: [asked(OPTION_QUESTION, ['Pode ser assim', 'Deixa para depois'], OPTION_DRAFT), turn('finish', 'Combinado. Quando precisar de outro ajuste, é só escrever aqui.')],
  })
  store.send(OPTION_REQUEST)
  let state = await settled(store)
  assert.equal(state.plan, OPTION_DRAFT)
  store.send('Deixa para depois')
  state = await settled(store)
  assert.deepEqual(texts(state), [
    `user:${OPTION_REQUEST}`,
    `assistant:${OPTION_QUESTION}`,
    'user:Deixa para depois',
    'assistant:Combinado. Quando precisar de outro ajuste, é só escrever aqui.',
  ])
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.plan, '')
  assert.equal(state.running, false)
  assert.equal(env.requests.length, 0)
  assert.deepEqual(env.previews, [])
  assert.equal(store.editNow(), false)
})

test('Editar agora starts the edit with the plan right away, without another turn', async () => {
  const { store, env } = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_PLAN)], outcomes: [received(FIRST)] })
  assert.equal(store.editNow(), false)
  store.send(OPTION_REQUEST)
  await settled(store)
  store.setBlocked(true)
  assert.equal(store.editNow(), false)
  store.setBlocked(false)

  assert.equal(store.editNow(), true)
  let state = store.getState()
  assert.equal(state.running, true)
  assert.equal(state.thinking, false)
  assert.deepEqual(state.suggestions, [])
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_QUESTION}`, `user:${copilot.EDIT_NOW_TEXT}`])
  assert.equal(store.editNow(), false)
  assert.equal(store.send('outro pedido'), false)

  state = await settled(store)
  assert.equal(env.turns.length, 1)
  assert.equal(env.requests.length, 1)
  assert.equal(env.requests[0].request.prompt, OPTION_PLAN)
  assert.equal(env.requests[0].request.base, BASE)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'user', 'proposal:pending'])
  assert.equal(proposals(state)[0].proposal.prompt, OPTION_PLAN)
  assert.equal(state.plan, '')
  assert.equal(store.editNow(), false)
})

test('Editar agora checks the key first and keeps the plan for later', async () => {
  const { store, env } = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_PLAN)], outcomes: [received(FIRST)] })
  store.send(OPTION_REQUEST)
  await settled(store)
  env.settings = { ...env.settings, apiKey: '' }
  assert.equal(store.editNow(), false)
  let state = store.getState()
  assert.equal(state.fieldErrors.apiKey, 'Informe a chave da API da OpenAI.')
  assert.equal(state.focus.field, 'apiKey')
  assert.equal(state.plan, OPTION_PLAN)
  assert.equal(state.entries.length, 2)
  env.settings = { ...env.settings, apiKey: KEY }
  assert.equal(store.editNow(), true)
  await settled(store)
  assert.equal(env.requests[0].request.prompt, OPTION_PLAN)
})

test('a failed turn shows the error and Tentar de novo repeats the same turn', async () => {
  const { store, env } = harness({
    turns: [refused('rate_limit', 'O limite de uso do provedor foi atingido.', 'Aguarde alguns instantes.'), asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT)],
  })
  store.send(OPTION_REQUEST)
  let state = await settled(store)
  assert.deepEqual(kinds(state), ['user', 'error'])
  const error = state.entries[1]
  assert.deepEqual(error.failure, { title: 'O limite de uso do provedor foi atingido.', details: 'Aguarde alguns instantes.', items: [] })
  assert.equal(error.turn, true)
  assert.equal(error.prompt, undefined)
  assert.equal(state.retry, error.id)
  assert.deepEqual(state.fieldErrors, {})
  assert.equal(env.requests.length, 0)
  assert.deepEqual(env.previews, [])

  assert.equal(store.retry(), true)
  state = store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.retry, null)
  assert.deepEqual(kinds(state), ['user'])
  assert.equal(store.retry(), false)
  state = await settled(store)
  assert.equal(env.turns.length, 2)
  assert.deepEqual(env.turns[1].history, env.turns[0].history)
  assert.equal(env.turns[1].flow, env.turns[0].flow)
  assert.equal(env.turns[1].proposal, false)
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_QUESTION}`])
  assert.equal(env.requests.length, 0)
})

test('a turn that throws or answers without text still shows an error, and a refused key marks the key field', async () => {
  const thrown = harness({ turns: [async () => { throw new Error('rede caiu') }] })
  thrown.store.send(OPTION_REQUEST)
  let state = await settled(thrown.store)
  assert.deepEqual(state.entries[1].failure, copilot.CONNECTION_FAILURE)
  assert.equal(state.retry, state.entries[1].id)

  const silent = harness({ turns: [{ ok: false, failure: { success: false, code: 'unknown', error: '  ' } }] })
  silent.store.send(OPTION_REQUEST)
  state = await settled(silent.store)
  assert.deepEqual(state.entries[1].failure, { title: copilot.SILENT_TURN, items: [] })

  const key = harness({ turns: [refused('invalid_key', 'A chave da API foi recusada.', 'Confira a chave da OpenAI e tente novamente.'), asked(OPTION_QUESTION, [], OPTION_DRAFT)] })
  key.store.send(OPTION_REQUEST)
  state = await settled(key.store)
  assert.equal(state.fieldErrors.apiKey, 'A chave da API foi recusada. Confira a chave da OpenAI e tente novamente.')
  assert.equal(state.focus.field, 'apiKey')
  assert.equal(state.retry, state.entries[1].id)
  key.env.settings = { ...key.env.settings, apiKey: '' }
  assert.equal(key.store.retry(), false)
  assert.equal(key.env.turns.length, 1)
  key.env.settings = { ...key.env.settings, apiKey: KEY }
  assert.equal(key.store.retry(), true)
  state = await settled(key.store)
  assert.deepEqual(kinds(state), ['user', 'assistant'])

  const model = harness({ turns: [refused('invalid_request', 'Escolha um modelo válido.', undefined, 'model')] })
  model.store.send(OPTION_REQUEST)
  state = await settled(model.store)
  assert.equal(state.fieldErrors.model, 'Escolha um modelo válido.')
  assert.equal(state.focus.field, 'model')

  const prompt = harness({ turns: [refused('invalid_request', 'Escreva o que você precisa no atendimento.', undefined, 'prompt')] })
  prompt.store.send(OPTION_REQUEST)
  state = await settled(prompt.store)
  assert.deepEqual(state.fieldErrors, {})
  assert.equal(state.focus, null)
})

test('Parar while the AI thinks cancels the turn, ignores the late answer and keeps the canvas as it was', async () => {
  let late
  const release = gate()
  const { store, env } = harness({
    turns: [
      async ({ signal }) => {
        late = signal
        await release.opened
        return edited(OPTION_PLAN)
      },
      asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT),
    ],
  })
  store.send(OPTION_REQUEST)
  assert.equal(store.getState().thinking, true)
  assert.equal(store.apply(), false)
  assert.equal(store.discard(), false)
  assert.equal(store.retry(), false)
  store.cancel()
  assert.equal(late.aborted, true)
  let state = store.getState()
  assert.equal(state.thinking, false)
  assert.deepEqual(kinds(state), ['user', `note:${copilot.COPILOT_TEXT.cancelled}`])
  release.open()
  await tick()
  state = store.getState()
  assert.deepEqual(kinds(state), ['user', `note:${copilot.COPILOT_TEXT.cancelled}`])
  assert.equal(state.running, false)
  assert.equal(state.plan, '')
  assert.equal(env.requests.length, 0)
  assert.deepEqual(env.previews, [])
  assert.equal(store.retry(), false)

  store.send('Na verdade, só a opção Segunda via de boleto')
  state = await settled(store)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: OPTION_REQUEST },
    { role: 'assistant', text: copilot.COPILOT_TEXT.cancelled },
    { role: 'user', text: 'Na verdade, só a opção Segunda via de boleto' },
  ])
  assert.equal(state.plan, OPTION_DRAFT)
})

test('a refinement turn gets the proposal flow with proposal true and the next edit runs on top of the proposal', async () => {
  const { store, env } = harness({
    outcomes: [received(FIRST), received(SECOND, { changes: { added: 0, changed: 2, removed: 0 } })],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  let state = await settled(store)
  const first = state.entries[2]
  assert.equal(store.send('Troque o texto do boleto e a despedida'), true)
  assert.equal(env.turns[1].flow, FIRST)
  assert.equal(env.turns[1].proposal, true)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: 'Acrescente a opção Segunda via de boleto' },
    { role: 'assistant', text: `${EDIT_MESSAGE}\n\n${SUMMARY}` },
    { role: 'user', text: 'Troque o texto do boleto e a despedida' },
  ])
  state = await started(store)
  assert.equal(state.refining, true)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: false })
  await tick()
  assert.equal(env.requests[1].request.base, FIRST)
  assert.equal(env.requests[1].request.prompt, 'Troque o texto do boleto e a despedida')

  state = await settled(store)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:refined', 'user', 'assistant', 'proposal:pending'])
  const second = state.entries[5]
  assert.equal(state.entries[2].id, first.id)
  assert.equal(state.pending, second.id)
  assert.equal(second.proposal.original, BASE)
  assert.equal(second.proposal.base, FIRST)
  assert.deepEqual(second.proposal.changes, { added: 2, changed: 2, removed: 0 })
  assert.deepEqual(lastPreview(env), { flow: SECOND, done: true })
  assert.equal(copilot.STATUS_LABELS.refined, 'Ajustada no pedido seguinte')
})

test('the history sends user and assistant texts, each proposal as a summary and each note, and leaves the errors out', async () => {
  const { store, env } = harness({
    outcomes: [received(FIRST), ({ signal }) => waiting(signal), rejected('provider_error', 'O provedor não respondeu.', 'Tente novamente.'), received(FIRST), received(FIRST)],
  })
  store.send('Pedido A')
  await settled(store)
  assert.equal(store.discard(), true)
  store.send('Pedido B')
  await started(store)
  await tick()
  store.cancel()
  store.send('Pedido C')
  let state = await settled(store)
  assert.equal(state.entries.at(-1).kind, 'error')
  store.send('Pedido D')
  await settled(store)
  env.flow = { ...BASE, name: 'Atendimento renomeado' }
  assert.equal(store.send('Pedido E'), false)
  state = store.getState()
  assert.deepEqual(kinds(state).slice(-2), ['proposal:discarded', `note:${copilot.COPILOT_TEXT.stale}`])
  store.send('Pedido F')
  await settled(store)
  const last = env.turns.at(-1)
  assert.equal(last.flow, env.flow)
  assert.equal(last.proposal, false)
  assert.deepEqual(last.history, [
    { role: 'user', text: 'Pedido A' },
    { role: 'assistant', text: [EDIT_MESSAGE, SUMMARY, copilot.COPILOT_TEXT.discarded].join('\n\n') },
    { role: 'user', text: 'Pedido B' },
    { role: 'assistant', text: [EDIT_MESSAGE, copilot.COPILOT_TEXT.cancelled].join('\n\n') },
    { role: 'user', text: 'Pedido C' },
    { role: 'assistant', text: EDIT_MESSAGE },
    { role: 'user', text: 'Pedido D' },
    { role: 'assistant', text: [EDIT_MESSAGE, SUMMARY, copilot.COPILOT_TEXT.stale].join('\n\n') },
    { role: 'user', text: 'Pedido F' },
  ])
  assert.equal(copilot.proposalSummary({ changes: null }), 'Proposta pronta no canvas.')
  assert.equal(copilot.proposalSummary({ changes: { added: 1, changed: 0, removed: 2 } }), 'Proposta pronta no canvas: 1 componente novo, 0 alterados e 2 removidos.')
})

test('Aplicar with the open flow unchanged applies the proposal once, leaves a note and asks if anything else is needed without calling the AI', async () => {
  const { store, env } = harness({ turns: [edited(), asked('Qual despedida você quer?', ['Volte sempre'], 'Troque a despedida.')], outcomes: [received(FIRST)] })
  assert.equal(store.apply(), false)
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  env.flow = { ...BASE, viewport: { x: 120, y: -40, zoom: 0.6 } }
  const before = env.previews.length
  assert.equal(store.apply(), true)
  assert.equal(env.applied.length, 1)
  assert.notEqual(env.applied[0], FIRST)
  assert.equal(documentKey(env.applied[0]), documentKey(importFlow(FIRST)))
  assert.equal(env.previews.length, before)
  let state = store.getState()
  assert.equal(state.pending, null)
  assert.equal(state.plan, '')
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:applied', `note:${copilot.COPILOT_TEXT.applied}`, 'assistant'])
  assert.equal(state.entries.at(-2).tone, 'success')
  assert.equal(state.entries.at(-1).text, copilot.FOLLOW_UP_TEXT)
  assert.equal(state.thinking, false)
  assert.equal(env.turns.length, 1)
  assert.equal(store.apply(), false)
  assert.equal(store.discard(), false)
  assert.equal(env.applied.length, 1)

  store.send('Agora troque a despedida')
  await settled(store)
  assert.equal(env.turns[1].flow, env.flow)
  assert.equal(env.turns[1].proposal, false)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: 'Acrescente a opção Segunda via de boleto' },
    { role: 'assistant', text: [EDIT_MESSAGE, SUMMARY, copilot.COPILOT_TEXT.applied, copilot.FOLLOW_UP_TEXT].join('\n\n') },
    { role: 'user', text: 'Agora troque a despedida' },
  ])
})

test('Aplicar when the editor refuses keeps the proposal pending with a note', async () => {
  const { store, env } = harness({ outcomes: [received(FIRST)] })
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  env.accept = false
  assert.equal(store.apply(), false)
  let state = store.getState()
  assert.ok(state.pending)
  assert.deepEqual(kinds(state).slice(-2), ['proposal:pending', `note:${copilot.COPILOT_TEXT.rejected}`])
  env.accept = true
  assert.equal(store.apply(), true)
  state = store.getState()
  assert.equal(state.pending, null)
  assert.equal(env.applied.length, 2)
})

test('Aplicar after the open flow changed drops the proposal and clears the canvas', async () => {
  const { store, env } = harness({ outcomes: [received(FIRST)] })
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  env.flow = { ...BASE, name: 'Atendimento renomeado' }
  assert.equal(store.apply(), false)
  const state = store.getState()
  assert.equal(env.applied.length, 0)
  assert.equal(state.pending, null)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:discarded', `note:${copilot.COPILOT_TEXT.stale}`])
  assert.equal(lastPreview(env), null)
  assert.equal(store.apply(), false)
})

test('Descartar clears the canvas, the plan and the suggestions and keeps the open flow', async () => {
  const { store, env } = harness({
    turns: [edited(), asked('Qual texto você quer no boleto?', ['Link direto', 'Texto curto'], 'Troque o texto do boleto.')],
    outcomes: [received(FIRST)],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  store.send('Troque o texto do boleto')
  let state = await settled(store)
  assert.equal(state.plan, 'Troque o texto do boleto.')
  assert.deepEqual(state.suggestions, ['Link direto', 'Texto curto'])
  assert.equal(store.discard(), true)
  state = store.getState()
  assert.equal(lastPreview(env), null)
  assert.equal(env.flow, BASE)
  assert.equal(env.applied.length, 0)
  assert.equal(state.pending, null)
  assert.equal(state.plan, '')
  assert.deepEqual(state.suggestions, [])
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:discarded', 'user', 'assistant', `note:${copilot.COPILOT_TEXT.discarded}`])
  assert.equal(copilot.STATUS_LABELS.discarded, 'Descartada')
})

test('Parar aborts the edit, restores the canvas and ignores the late answer', async () => {
  let late
  const { store, env } = harness({
    outcomes: [
      ({ signal }) => {
        late = signal
        return waiting(signal)
      },
      received(FIRST),
      ({ signal }) => waiting(signal),
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  await tick()
  store.cancel()
  assert.equal(late.aborted, true)
  let state = store.getState()
  assert.equal(state.running, false)
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.COPILOT_TEXT.cancelled}`])
  assert.equal(lastPreview(env), null)
  await tick()
  assert.equal(store.getState().entries.length, 3)
  assert.equal(store.retry(), false)

  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  store.send('Troque o texto do boleto')
  await started(store)
  await waitFor(() => lastPreview(env)?.flow === FIRST && lastPreview(env)?.done === false)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: false })
  store.cancel()
  state = store.getState()
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })
  assert.equal(proposals(state).at(-1).status, 'pending')
  assert.equal(state.pending, proposals(state).at(-1).id)
  assert.equal(env.requests[2].signal.aborted, true)
  assert.equal(env.applied.length, 0)
})

test('a failed edit shows the error, restores the canvas and Tentar de novo sends the same request without another turn', async () => {
  const { store, env } = harness({
    turns: [edited(OPTION_PLAN, OPTION_EDIT)],
    outcomes: [rejected('rate_limit', 'O limite de uso do provedor foi atingido.', 'Aguarde alguns instantes.'), received(FIRST)],
  })
  store.send(OPTION_REQUEST)
  let state = await settled(store)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'error'])
  const error = state.entries[2]
  assert.deepEqual(error.failure, { title: 'O limite de uso do provedor foi atingido.', details: 'Aguarde alguns instantes.', items: [] })
  assert.equal(error.prompt, OPTION_PLAN)
  assert.equal(error.turn, undefined)
  assert.equal(state.retry, error.id)
  assert.equal(state.plan, OPTION_PLAN)
  assert.equal(lastPreview(env), null)
  assert.deepEqual(state.fieldErrors, {})

  assert.equal(store.retry(), true)
  state = await settled(store)
  assert.equal(env.turns.length, 1)
  assert.deepEqual(env.requests[1].request, env.requests[0].request)
  assert.equal(env.requests[1].request.prompt, OPTION_PLAN)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:pending'])
  assert.equal(state.retry, null)
  assert.equal(state.plan, '')

  const thrown = harness({ outcomes: [async () => { throw new Error('rede caiu') }] })
  thrown.store.send('Acrescente a opção Segunda via de boleto')
  state = await settled(thrown.store)
  assert.deepEqual(state.entries[2].failure, copilot.CONNECTION_FAILURE)
})

test('a refused key on the edit marks the key field and asks to open the settings', async () => {
  const { store } = harness({
    outcomes: [rejected('invalid_key', 'A chave da API foi recusada.', 'Confira a chave da OpenAI e tente novamente.'), received(FIRST)],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  const state = await settled(store)
  assert.equal(state.fieldErrors.apiKey, 'A chave da API foi recusada. Confira a chave da OpenAI e tente novamente.')
  assert.equal(state.focus.field, 'apiKey')
  assert.equal(state.retry, state.entries[2].id)
  store.clearFieldError('apiKey')
  assert.deepEqual(store.getState().fieldErrors, {})
})

test('invalid credentials send nothing, mark the field and keep the conversation as it was', () => {
  const { store, env } = harness()
  env.settings = { ...env.settings, apiKey: '  ' }
  assert.equal(store.send('Acrescente a opção Segunda via de boleto'), false)
  let state = store.getState()
  assert.equal(env.turns.length, 0)
  assert.equal(env.requests.length, 0)
  assert.deepEqual(state.entries, [])
  assert.equal(state.thinking, false)
  assert.equal(state.running, false)
  assert.deepEqual(state.fieldErrors, { apiKey: 'Informe a chave da API da OpenAI.' })
  assert.equal(state.focus.field, 'apiKey')
  const seq = state.focus.seq

  env.settings = { ...env.settings, apiKey: KEY, model: 'modelo inválido' }
  assert.equal(store.send('Acrescente a opção Segunda via de boleto'), false)
  state = store.getState()
  assert.equal(state.fieldErrors.model, 'Escolha um modelo válido.')
  assert.equal(state.focus.field, 'model')
  assert.ok(state.focus.seq > seq)
  assert.equal(env.previews.length, 0)
  assert.equal(env.turns.length, 0)

  store.markField('apiKey', 'A chave da API parece incompleta. Confira o valor copiado.')
  assert.equal(store.getState().focus.field, 'apiKey')
  store.clearFieldError('apiKey', 'model')
  assert.deepEqual(store.getState().fieldErrors, {})
})

test('an open flow with only Início goes to the AI like any other flow and the edit builds on it from Início, without Gerar com IA', async () => {
  const { store, env } = harness({ flow: BLANK, turns: [asked(START_QUESTION, ['Pode ser assim'], START_DRAFT), edited(START_PLAN, START_EDIT)], outcomes: [received(STARTED)] })
  assert.equal(store.send(START_REQUEST), true)
  assert.equal(store.getState().thinking, true)
  assert.equal(env.turns[0].flow, BLANK)
  assert.equal(env.turns[0].proposal, false)
  assert.deepEqual(env.turns[0].history, [{ role: 'user', text: START_REQUEST }])
  let state = await settled(store)
  assert.deepEqual(texts(state), [`user:${START_REQUEST}`, `assistant:${START_QUESTION}`])
  assert.equal(state.plan, START_DRAFT)
  assert.deepEqual(state.suggestions, ['Pode ser assim'])
  assert.equal(env.requests.length, 0)

  assert.equal(store.send('Pode ser assim'), true)
  assert.equal(env.turns[1].flow, BLANK)
  state = await settled(store)
  assert.equal(env.turns.length, 2)
  assert.equal(env.requests.length, 1)
  const { request } = env.requests[0]
  assert.equal(request.mode, 'edit')
  assert.equal(request.provider, 'openai')
  assert.equal(request.base, BLANK)
  assert.equal(request.prompt, START_PLAN)
  assert.deepEqual(env.previews[0], { flow: BLANK, done: false })
  assert.deepEqual(texts(state), [`user:${START_REQUEST}`, `assistant:${START_QUESTION}`, 'user:Pode ser assim', `assistant:${START_EDIT}`, 'proposal:pending'])
  const proposal = proposals(state)[0].proposal
  assert.equal(proposal.original, BLANK)
  assert.equal(proposal.base, BLANK)
  assert.deepEqual(proposal.changes, { added: 2, changed: 0, removed: 0 })
  assert.deepEqual(proposal.removed, [])
  assert.deepEqual(lastPreview(env), { flow: STARTED, done: true })
  assert.equal(store.apply(), true)
  assert.equal(env.applied.length, 1)
  assert.equal(documentKey(env.applied[0]), documentKey(importFlow(STARTED)))
  assert.deepEqual(kinds(store.getState()).slice(-2), [`note:${copilot.COPILOT_TEXT.applied}`, 'assistant'])
})

test('a turn answered after the Início was moved still edits the open flow, and only a busy Gerar com IA, an empty or long request or a missing flow block a request', async () => {
  const answer = delayed(edited(START_PLAN, START_EDIT))
  const moved = harness({ flow: BLANK, turns: [answer.turn], outcomes: [received(STARTED)] })
  assert.equal(moved.store.send(START_REQUEST), true)
  moved.env.flow = BLANK_MOVED
  answer.release.open()
  const state = await settled(moved.store)
  assert.equal(moved.env.requests.length, 1)
  assert.equal(moved.env.requests[0].request.base, BLANK_MOVED)
  assert.equal(moved.env.requests[0].request.prompt, START_PLAN)
  assert.equal(proposals(state)[0].proposal.original, BLANK_MOVED)

  const busy = harness({ flow: BLANK })
  busy.store.setBlocked(true)
  assert.equal(busy.store.send(START_REQUEST), false)
  assert.equal(busy.env.turns.length, 0)
  busy.store.setBlocked(false)
  assert.equal(busy.store.send('   '), false)
  assert.equal(busy.store.send(`${'a'.repeat(8001)}`), false)
  assert.equal(busy.env.turns.length, 0)
  assert.deepEqual(busy.store.getState().entries, [])

  const missing = harness({ flow: null })
  assert.equal(missing.store.send(START_REQUEST), false)
  assert.equal(missing.env.turns.length, 0)
  assert.equal(missing.env.requests.length, 0)
  assert.deepEqual(missing.store.getState().entries, [])
  assert.deepEqual(missing.env.previews, [])
})

test('notes stay annotations: a flow with only Início and notes is edited with the notes kept, and a note never becomes a candidate to select', async () => {
  const { store, env } = harness({ flow: NOTES_ONLY, turns: [edited(START_PLAN, START_EDIT)], outcomes: [received(NOTES_STARTED)] })
  assert.equal(store.send(START_REQUEST), true)
  assert.equal(env.turns[0].flow, NOTES_ONLY)
  let state = await settled(store)
  assert.equal(env.requests[0].request.base, NOTES_ONLY)
  const proposal = proposals(state)[0].proposal
  assert.deepEqual(proposal.changes, { added: 2, changed: 0, removed: 0 })
  assert.deepEqual(proposal.removed, [])
  assert.deepEqual(proposal.issues, [])
  const note = (flow) => flow.nodes.find((node) => node.id === NOTE.id)
  assert.equal(note(proposal.flow).data.data.text, note(NOTES_ONLY).data.data.text)
  assert.equal(store.apply(), true)
  assert.equal(note(env.applied[0]).data.type, 'note')

  const noted = harness({ flow: NOTED, turns: [picked([NOTE.id, WELCOME.id, FAREWELL.id])] })
  noted.store.send(PICK_REQUEST)
  state = await settled(noted.store)
  assert.equal(noted.env.turns[0].flow, NOTED)
  assert.deepEqual(state.pick.candidates, [
    { id: WELCOME.id, text: nodeSubject(WELCOME) },
    { id: FAREWELL.id, text: nodeSubject(FAREWELL) },
  ])
  assert.equal(copilot.readPick({ label: 'a mensagem', candidates: [NOTE.id, WELCOME.id] }, NOTED), null)
  assert.equal(copilot.readPick({ label: 'a mensagem', candidates: [NOTE.id, WELCOME.id, FAREWELL.id] }, NOTED).candidates.length, 2)
})

test('a question that arrives with the panel closed asks for attention, and a goodbye does not', async () => {
  const release = gate()
  const { store, env } = harness({
    turns: [
      async () => {
        await release.opened
        return asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT)
      },
      turn('finish', 'Combinado.'),
      refused('provider_error', 'O provedor não respondeu.', 'Tente novamente.'),
    ],
  })
  store.send(OPTION_REQUEST)
  store.setVisible(false)
  release.open()
  let state = await settled(store)
  assert.equal(state.attention, 'question')
  assert.deepEqual(env.notified, ['question'])
  assert.deepEqual(state.suggestions, ['Pode ser assim'])
  assert.deepEqual(env.previews, [])

  store.setVisible(true)
  assert.equal(store.getState().attention, null)
  store.setVisible(false)
  store.send('Deixa para depois')
  state = await settled(store)
  assert.equal(state.attention, null)
  assert.deepEqual(env.notified, ['question'])

  store.send('Outro pedido')
  state = await settled(store)
  assert.equal(state.attention, 'failed')
  assert.deepEqual(env.notified, ['question', 'failed'])
})

test('a closed panel keeps the edit running without touching the canvas and asks for attention', async () => {
  const release = gate()
  const { store, env } = harness({
    outcomes: [
      async ({ onPartial }) => {
        await release.opened
        onPartial(DELTA)
        await tick()
        return received(FIRST)
      },
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  assert.deepEqual(env.previews, [{ flow: BASE, done: false }])
  store.setVisible(false)
  assert.deepEqual(env.previews, [{ flow: BASE, done: false }, null])
  release.open()
  let state = await settled(store)
  assert.deepEqual(env.previews, [{ flow: BASE, done: false }, null])
  assert.equal(state.attention, 'ready')
  assert.deepEqual(env.notified, ['ready'])
  assert.ok(state.pending)

  store.setVisible(true)
  state = store.getState()
  assert.equal(state.attention, null)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })

  store.setVisible(false)
  assert.equal(lastPreview(env), null)
  env.flow = { ...BASE, description: 'Outro texto' }
  store.setVisible(true)
  state = store.getState()
  assert.equal(state.pending, null)
  assert.equal(lastPreview(env), null)
  assert.deepEqual(kinds(state).slice(-2), ['proposal:discarded', `note:${copilot.COPILOT_TEXT.stale}`])
})

test('the first frame of a request opens the canvas preview even right after an import, and the stream frames follow it', async () => {
  const release = gate()
  const { store, env } = harness({
    outcomes: [
      async ({ onPartial }) => {
        onPartial(DELTA)
        await release.opened
        return received(FIRST)
      },
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  assert.deepEqual(env.previews[0], { flow: BASE, done: false })
  assert.equal(env.fresh[0], true)
  await waitFor(() => env.previews.length >= 2)
  assert.equal(env.previews.length, 2)
  assert.equal(env.previews[1].done, false)
  assert.equal(env.fresh[1], false)
  release.open()
  await settled(store)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })
  assert.equal(env.fresh.at(-1), true)
})

test('the live preview builds each partial answer on top of the base', async () => {
  const release = gate()
  const { store, env } = harness({
    outcomes: [
      async ({ onPartial, onProgress }) => {
        onProgress({ stage: 'gerando', round: 1, maxRounds: 3 })
        onPartial(DELTA)
        await release.opened
        return received(FIRST)
      },
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  await waitFor(() => liveFrame(env))
  assert.deepEqual(store.getState().progress, { stage: 'gerando', round: 1, maxRounds: 3 })
  const live = lastPreview(env)
  assert.equal(live.done, false)
  assert.ok(live.flow.nodes.length > BASE.nodes.length)
  assert.ok(JSON.stringify(live.flow).includes(BOLETO_TEXT))
  release.open()
  await settled(store)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })
})

test('reopening while an edit runs shows the latest partial result again', async () => {
  const release = gate()
  const { store, env } = harness({
    outcomes: [
      async ({ onPartial }) => {
        onPartial(DELTA)
        await release.opened
        return rejected('provider_error', 'O provedor não respondeu.', 'Tente novamente.')
      },
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  await waitFor(() => liveFrame(env))
  const live = lastPreview(env)
  assert.equal(live.done, false)
  store.setVisible(false)
  assert.equal(lastPreview(env), null)
  store.setVisible(true)
  assert.deepEqual(lastPreview(env), live)
  store.setVisible(false)
  release.open()
  const state = await settled(store)
  assert.equal(state.attention, 'failed')
  assert.deepEqual(env.notified, ['failed'])
  assert.equal(lastPreview(env), null)
})

test('while Gerar com IA owns the canvas the copilot neither shows nor clears previews', async () => {
  const { store, env } = harness({ outcomes: [received(FIRST)] })
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  const count = env.previews.length
  store.setBlocked(true)
  assert.equal(store.apply(), false)
  store.setVisible(false)
  store.setVisible(true)
  assert.equal(env.previews.length, count)
  assert.equal(store.getState().attention, null)
  store.setBlocked(false)
  assert.deepEqual(lastPreview(env), { flow: FIRST, done: true })
  assert.equal(store.apply(), true)
})

test('dispose aborts the running edit or the turn and releases the canvas', async () => {
  let signal
  const { store, env } = harness({
    outcomes: [
      (call) => {
        signal = call.signal
        return waiting(call.signal)
      },
    ],
  })
  store.send('Acrescente a opção Segunda via de boleto')
  await started(store)
  await tick()
  store.dispose()
  assert.equal(signal.aborted, true)
  assert.equal(store.getState().running, false)
  assert.equal(lastPreview(env), null)

  let question
  const thinking = harness({
    turns: [
      (call) => {
        question = call.signal
        return waiting(call.signal)
      },
    ],
  })
  thinking.store.send(OPTION_REQUEST)
  thinking.store.dispose()
  assert.equal(question.aborted, true)
  assert.equal(thinking.store.getState().thinking, false)
  await tick()
  assert.deepEqual(kinds(thinking.store.getState()), ['user'])
})

test('texts are in PT-BR without exclamation marks or dashes', () => {
  for (const text of Object.values(copilot.COPILOT_TEXT)) assert.match(text, PT_TEXT)
  assert.match(copilot.CONNECTION_FAILURE.title, PT_TEXT)
  assert.match(copilot.CONNECTION_FAILURE.details, PT_TEXT)
  assert.match(copilot.EDIT_NOW_TEXT, PT_TEXT)
  assert.match(copilot.SILENT_TURN, PT_TEXT)
  assert.equal(copilot.FOLLOW_UP_TEXT, 'Precisa mudar mais alguma coisa no fluxo?')
  assert.equal(copilot.EDIT_NOW_TEXT, 'Pode editar agora com o que já foi decidido.')
  for (const label of Object.values(copilot.STATUS_LABELS)) assert.doesNotMatch(label, /[!—–]/)
  const proposal = { issues: [], blocking: 0, partial: false }
  assert.equal(copilot.proposalTitle(proposal), 'Edição pronta')
  assert.equal(copilot.proposalTitle({ ...proposal, issues: [ISSUE, ISSUE] }), 'Edição pronta com 2 pendências')
  assert.equal(copilot.proposalTitle({ ...proposal, partial: true }), 'Edição feita em parte')
  assert.equal(copilot.proposalTone(proposal), 'success')
  assert.equal(copilot.proposalTone({ ...proposal, blocking: 1 }), 'danger')
  assert.deepEqual(copilot.credentialErrors({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: '', effort: 'medium', fill: true }), { apiKey: 'Informe a chave da API da Anthropic.' })
})

test('the Copiloto keeps ChatGPT, Claude, Gemini and Grok: the picker lists all four, the chosen provider goes in the turn, the edit and the proposal, and the key warning checks every provider', async () => {
  assert.deepEqual(PROVIDERS.map((entry) => [entry.id, entry.name]), [['openai', 'ChatGPT'], ['anthropic', 'Claude'], ['google', 'Gemini'], ['xai', 'Grok']])
  assert.deepEqual(copilot.SETTINGS_FIELDS, ['provider', 'apiKey', 'model', 'effort'])
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const selects = []
  const stub = STUBS['./flow-select']
  const plain = stub.FlowSelect
  stub.FlowSelect = (props) => {
    selects.push(props)
    return null
  }
  let html = ''
  try {
    html = renderToStaticMarkup(React.createElement(panel.default, { id: 'copiloto', open: true, onClose: () => undefined, getCurrentFlow: () => BLANK, onLivePreview: () => undefined, onWorkflowEdited: () => true }))
  } finally {
    stub.FlowSelect = plain
  }
  const picker = selects.find((props) => props.id.endsWith('-provider'))
  assert.deepEqual(picker.options, [
    { value: 'openai', label: 'ChatGPT' },
    { value: 'anthropic', label: 'Claude' },
    { value: 'google', label: 'Gemini' },
    { value: 'xai', label: 'Grok' },
  ])
  assert.equal(picker.value, 'openai')
  assert.match(html, /<label[^>]*>Provedor de IA<\/label>/)
  assert.match(html, />OpenAI · GPT-6\.1 Sol · Esforço equilibrado</)

  const { store, env } = harness({ outcomes: [received(FIRST, { model: 'claude-opus-5-5' })] })
  env.settings = { ...env.settings, provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-api03-0123456789abcdef' }
  store.send(OPTION_REQUEST)
  const state = await settled(store)
  assert.equal(env.turns[0].settings.provider, 'anthropic')
  assert.equal(env.requests[0].request.provider, 'anthropic')
  assert.equal(env.requests[0].request.model, 'claude-opus-5-5')
  assert.equal(proposals(state)[0].proposal.provider, 'anthropic')
  assert.equal(proposals(state)[0].proposal.model, 'claude-opus-5-5')

  const wrong = harness({ turns: [refused('invalid_request', 'Escolha um provedor de IA válido.', undefined, 'provider')] })
  wrong.store.send(OPTION_REQUEST)
  const failed = await settled(wrong.store)
  assert.equal(failed.fieldErrors.provider, 'Escolha um provedor de IA válido.')
  assert.equal(failed.focus.field, 'provider')

  const missing = [['openai', 'da OpenAI'], ['anthropic', 'da Anthropic'], ['google', 'do Google'], ['xai', 'da xAI']]
  for (const [provider, of] of missing) assert.deepEqual(copilot.credentialErrors({ provider, model: 'modelo-1', apiKey: '', effort: 'medium', fill: true }), { apiKey: `Informe a chave da API ${of}.` })
  const [openai, anthropic, google, xai] = PROVIDERS
  assert.equal(keyWarning(openai, `  ${KEY}  `), '')
  assert.equal(keyWarning(openai, 'sk-ant-api03-exemplo'), 'Esta chave parece ser da Anthropic. Confira o provedor escolhido.')
  assert.equal(keyWarning(anthropic, KEY), 'Esta chave parece ser da OpenAI. Confira o provedor escolhido.')
  assert.equal(keyWarning(xai, 'AIzaSyExemplo0123456789'), 'Esta chave parece ser do Google. Confira o provedor escolhido.')
  assert.equal(keyWarning(google, 'xai-exemplo0123456789'), 'Esta chave parece ser da xAI. Confira o provedor escolhido.')
  assert.equal(keyWarning(google, 'chave0123456789'), 'Chaves do Google costumam começar com AIza.')
})

test('the panel renders the empty conversation, the examples, the composer and the notices', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const props = {
    id: 'copiloto',
    open: true,
    onClose: () => undefined,
    getCurrentFlow: () => BASE,
    onLivePreview: () => undefined,
    onWorkflowEdited: () => true,
  }
  const html = renderToStaticMarkup(React.createElement(panel.default, props))
  assert.match(html, /<section id="copiloto" aria-label="Copiloto"/)
  assert.match(html, /<h2[^>]*>Copiloto<\/h2>/)
  assert.match(html, /Edita o fluxo aberto/)
  assert.match(html, /aria-label="Configurar IA"/)
  assert.match(html, /aria-label="Fechar Copiloto"/)
  assert.match(html, /role="log"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /aria-label="Conversa com o Copiloto"/)
  assert.equal(
    panel.COPILOT_INTRO,
    'O copiloto edita o fluxo aberto a partir do seu pedido. Quando faltar alguma informação, como o texto de uma opção ou o destino de uma transferência, ele pergunta antes de mudar. As mudanças aparecem no canvas para você conferir e só valem quando você aplicar. Desfazer (Ctrl+Z) volta ao fluxo anterior.',
  )
  assert.ok(html.includes(panel.COPILOT_INTRO))
  assert.match(html, /Exemplos:/)
  for (const example of panel.COPILOT_EXAMPLES) assert.ok(html.includes(example), example)
  assert.match(html, /placeholder="O que você quer mudar no fluxo\?"/)
  assert.match(html, /O que você quer mudar no fluxo<\/label>/)
  assert.match(html, /aria-label="Enviar pedido"/)
  assert.match(html, /Preencher todos os campos/)
  assert.match(html, /Nomes, IDs e URLs saem sempre preenchidos\./)
  assert.match(html, /OpenAI · GPT-6\.1 Sol · Esforço equilibrado/)
  assert.match(html, /Chave da API da OpenAI/)
  assert.match(html, /É a mesma usada no Gerar com IA\./)
  assert.doesNotMatch(html, /O fluxo aberto só tem o Início|Abrir Gerar com IA/)
  assert.doesNotMatch(html, /role="status" class="rounded-lg/)
  assert.doesNotMatch(html, /Sugestões de resposta/)
  assert.doesNotMatch(html, /Editar agora/)
  assert.doesNotMatch(html, /[!—–]/)
  assert.equal(panel.THINKING_TEXT, 'Pensando no pedido.')
  assert.deepEqual(panel.ATTENTION_TOASTS.question, { title: 'O Copiloto tem uma pergunta', description: 'Abra o Copiloto para responder.' })
  assert.deepEqual(panel.ATTENTION_TOASTS.ready, { title: 'Edição do Copiloto pronta', description: 'Abra o Copiloto para revisar e aplicar.' })
  assert.equal(panel.ATTENTION_TOASTS.failed.variant, 'destructive')
  for (const notice of Object.values(panel.ATTENTION_TOASTS)) assert.doesNotMatch(`${notice.title} ${notice.description}`, /[!—–]/)

  for (const flow of [BLANK, NOTES_ONLY, null]) {
    const markup = renderToStaticMarkup(React.createElement(panel.default, { ...props, getCurrentFlow: () => flow }))
    assert.equal(markup, html)
  }
  const busy = renderToStaticMarkup(React.createElement(panel.default, { ...props, dialogBusy: true }))
  assert.match(busy, /<p id="[^"]*-notice" role="status" class="[^"]*">Aguarde a geração do Gerar com IA terminar\.<\/p>/)
  assert.match(busy, /aria-describedby="[^"]*-keys [^"]*-notice"/)
  assert.doesNotMatch(busy, /Abrir Gerar com IA|O fluxo aberto só tem o Início/)
  const busyBlank = renderToStaticMarkup(React.createElement(panel.default, { ...props, dialogBusy: true, getCurrentFlow: () => BLANK }))
  assert.equal(busyBlank, busy)
  const classes = (markup) => /<section id="copiloto" aria-label="Copiloto" class="([^"]*)"/.exec(markup)[1].split(/\s+/)
  assert.ok(classes(html).includes('flex'))
  assert.ok(!classes(html).includes('hidden'))
  assert.ok(classes(html).includes('nokey'))
  const closed = renderToStaticMarkup(React.createElement(panel.default, { ...props, open: false }))
  assert.ok(classes(closed).includes('hidden'))
  assert.ok(!classes(closed).includes('flex'))
  for (const example of panel.COPILOT_EXAMPLES) assert.doesNotMatch(example, /[!—–]/)
})

const stripTags = (markup) => {
  let text = markup
  let previous
  do {
    previous = text
    text = text.replace(/<[^>]*>|<([a-zA-Z]+)/g, '')
  } while (text !== previous)
  return text
}

const markupButtons = (html) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((match) => ({ attrs: match[1], text: stripTags(match[2]), disabled: / disabled=""/.test(match[1]) }))

test('a candidate names the component, a short main text and the ID', () => {
  assert.equal(nodeSubject(FAREWELL), `Enviar Mensagem “Obrigado pelo contato. Até logo.” · ID ${FAREWELL.id}`)
  assert.equal(nodeSubject(WELCOME), `Enviar Mensagem “Olá, #NAME. Você está no atendimento da…” · ID ${WELCOME.id}`)
  const menu = BASE.nodes.find((node) => node.data.type === 'envio_mensagem')
  assert.equal(nodeSubject(menu), `Menu de Opções “Como podemos ajudar?” · ID ${menu.id}`)
  const end = BASE.nodes.find((node) => node.data.type === 'finalizar')
  assert.equal(nodeSubject(end), `Encerrar Conversa · ID ${end.id}`)
  assert.equal(nodeText({ id: 'x', data: { type: 'envio_pergunta', data: { template: '  Linha 1\n\n  Linha 2  ' } } }), 'Linha 1 Linha 2')
  const long = nodeText({ id: 'x', data: { type: 'envio_pergunta', data: { template: 'a'.repeat(80) } } })
  assert.equal(long.length, 48)
  assert.ok(long.endsWith('…'))
  assert.equal(nodeText({ id: 'x', data: { type: 'desconhecido', data: {} } }), '')
})

test('an ask with pick keeps the question, the suggestions and the plan and lists the candidates found in the open flow', async () => {
  const { store, env } = harness({ turns: [picked([` ${WELCOME.id} `, 'nao_existe', Number(FAREWELL.id), WELCOME.id, null])] })
  assert.equal(store.send(PICK_REQUEST), true)
  const state = await settled(store)
  assert.deepEqual(texts(state), [`user:${PICK_REQUEST}`, `assistant:${PICK_QUESTION}`])
  assert.deepEqual(state.pick, {
    label: 'a mensagem',
    candidates: [
      { id: WELCOME.id, text: nodeSubject(WELCOME) },
      { id: FAREWELL.id, text: nodeSubject(FAREWELL) },
    ],
    selected: null,
    ready: false,
  })
  assert.deepEqual(state.suggestions, PICK_CHIPS)
  assert.equal(state.plan, PICK_DRAFT)
  assert.equal(state.thinking, false)
  assert.equal(state.attention, null)
  assert.deepEqual(env.notified, [])
  assert.deepEqual(env.previews, [])
  assert.equal(env.requests.length, 0)
  assert.equal(env.turns[0].flow, BASE)
  assert.equal(env.turns[0].proposal, false)
})

test('a pick with fewer than 2 components of the flow is a plain question, and only ask turns bring a pick', async () => {
  const single = harness({ turns: [picked([WELCOME.id, 'nao_existe', WELCOME.id])] })
  single.store.send(PICK_REQUEST)
  let state = await settled(single.store)
  assert.equal(state.pick, null)
  assert.deepEqual(state.suggestions, PICK_CHIPS)
  assert.equal(state.plan, PICK_DRAFT)
  assert.deepEqual(texts(state), [`user:${PICK_REQUEST}`, `assistant:${PICK_QUESTION}`])

  const shaped = (pick) => ({ ok: true, turn: { action: 'ask', message: PICK_QUESTION, suggestions: [], plan: '', pick } })
  const odd = harness({ turns: [shaped('menu'), shaped({ label: 'a mensagem', candidates: WELCOME.id }), shaped(null)] })
  for (let index = 0; index < 3; index++) {
    odd.store.send(`${PICK_REQUEST} ${index}`)
    state = await settled(odd.store)
    assert.equal(state.pick, null)
    assert.equal(state.entries.at(-1).text, PICK_QUESTION)
  }

  const unnamed = harness({ turns: [picked([WELCOME.id, FAREWELL.id], '   ')] })
  unnamed.store.send(PICK_REQUEST)
  state = await settled(unnamed.store)
  assert.equal(state.pick.label, 'o componente')

  const editing = harness({
    turns: [{ ok: true, turn: { action: 'edit', message: PICK_EDIT, suggestions: [], plan: PICK_PLAN, pick: { label: 'a mensagem', candidates: [WELCOME.id, FAREWELL.id] } } }],
    outcomes: [received(FIRST)],
  })
  editing.store.send(PICK_REQUEST)
  state = await settled(editing.store)
  assert.equal(state.pick, null)
  assert.equal(editing.env.requests[0].request.prompt, PICK_PLAN)
})

test('on a refinement the pick is checked against the proposal shown on the canvas', async () => {
  const { store, env } = harness({ turns: [edited(), picked([FAREWELL.id, BOLETO.id])], outcomes: [received(FIRST)] })
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  store.send(PICK_REQUEST)
  const state = await settled(store)
  assert.equal(env.turns[1].flow, FIRST)
  assert.equal(env.turns[1].proposal, true)
  assert.deepEqual(state.pick.candidates, [
    { id: FAREWELL.id, text: nodeSubject(FAREWELL) },
    { id: BOLETO.id, text: nodeSubject(BOLETO) },
  ])
  assert.ok(state.pending)

  const open = harness({ turns: [picked([FAREWELL.id, BOLETO.id])] })
  open.store.send(PICK_REQUEST)
  assert.equal((await settled(open.store)).pick, null)
})

test('selecting a candidate and confirming sends the selection with the ID and the next turn edits at that component', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(FIRST)] })
  assert.equal(store.selectPick(WELCOME.id), false)
  assert.equal(store.confirmPick(), false)
  assert.equal(store.cancelPick(), false)
  store.send(PICK_REQUEST)
  await settled(store)
  assert.equal(store.confirmPick(), false)
  assert.equal(store.selectPick('nao_existe'), false)
  assert.equal(store.getState().pick.selected, null)
  assert.equal(store.selectPick(WELCOME.id), true)
  assert.equal(store.getState().pick.selected, WELCOME.id)
  assert.equal(store.selectPick(null), true)
  assert.equal(store.getState().pick.selected, null)
  assert.equal(store.confirmPick(), false)
  assert.equal(store.selectPick(FAREWELL.id), true)
  assert.equal(env.turns.length, 1)

  assert.equal(store.confirmPick(), true)
  let state = store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.pick, null)
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.plan, PICK_DRAFT)
  const selection = state.entries.at(-1)
  assert.equal(selection.kind, 'user')
  assert.equal(selection.text, `Selecionei no canvas: Enviar Mensagem “Obrigado pelo contato. Até logo.” · ID ${FAREWELL.id}`)
  assert.ok(selection.text.includes(`ID ${FAREWELL.id}`))
  assert.equal(store.confirmPick(), false)
  assert.equal(store.selectPick(WELCOME.id), false)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: PICK_REQUEST },
    { role: 'assistant', text: PICK_QUESTION },
    { role: 'user', text: choice(FAREWELL) },
  ])
  assert.equal(env.turns[1].flow, BASE)
  assert.equal(env.turns[1].proposal, false)

  state = await settled(store)
  assert.equal(env.requests.length, 1)
  assert.equal(env.requests[0].request.prompt, PICK_PLAN)
  assert.equal(env.requests[0].request.base, BASE)
  assert.deepEqual(texts(state), [`user:${PICK_REQUEST}`, `assistant:${PICK_QUESTION}`, `user:${choice(FAREWELL)}`, `assistant:${PICK_EDIT}`, 'proposal:pending'])
  assert.equal(proposals(state)[0].proposal.prompt, PICK_PLAN)
  assert.equal(state.pick, null)
})

test('when the edit after a selection comes without a plan, the prompt is the plan agreed so far followed by the selection', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited('', PICK_EDIT)], outcomes: [received(FIRST)] })
  store.send(PICK_REQUEST)
  await settled(store)
  store.selectPick(FAREWELL.id)
  store.confirmPick()
  const state = await settled(store)
  const prompt = `${PICK_DRAFT}\n\n${choice(FAREWELL)}`
  assert.equal(env.requests[0].request.prompt, prompt)
  assert.ok(env.requests[0].request.prompt.includes(`ID ${FAREWELL.id}`))
  assert.equal(proposals(state)[0].proposal.prompt, prompt)
})

test('a pick marked ready edits right after Confirmar seleção, without another turn, with the plan and the selection as the prompt and the focus on the chosen component', async () => {
  const { store, env } = harness({ turns: [readied([WELCOME.id, FAREWELL.id]), turn('finish', 'Combinado.')], outcomes: [received(CHANGED)] })
  store.send(PICK_REQUEST)
  let state = await settled(store)
  assert.equal(state.pick.ready, true)
  assert.equal(state.plan, PICK_READY)
  assert.deepEqual(state.suggestions, PICK_CHIPS)
  store.selectPick(FAREWELL.id)
  assert.equal(store.confirmPick(), true)
  const prompt = `${PICK_READY}\n\n${choice(FAREWELL)}`
  state = store.getState()
  assert.equal(state.thinking, false)
  assert.equal(state.running, true)
  assert.equal(state.pick, null)
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.plan, prompt)
  assert.deepEqual(texts(state), [`user:${PICK_REQUEST}`, `assistant:${PICK_QUESTION}`, `user:${choice(FAREWELL)}`])
  assert.deepEqual(env.previews, [{ flow: BASE, done: false }])
  assert.deepEqual(env.focus, [FAREWELL.id])
  assert.equal(store.confirmPick(), false)
  assert.equal(store.send('outro pedido'), false)

  state = await settled(store)
  assert.equal(env.turns.length, 1)
  assert.equal(env.requests.length, 1)
  assert.equal(env.requests[0].request.prompt, prompt)
  assert.ok(prompt.includes(`ID ${FAREWELL.id}`))
  assert.equal(env.requests[0].request.base, BASE)
  assert.equal(env.requests[0].request.provider, 'openai')
  assert.deepEqual(texts(state), [`user:${PICK_REQUEST}`, `assistant:${PICK_QUESTION}`, `user:${choice(FAREWELL)}`, 'proposal:pending'])
  const proposal = proposals(state)[0].proposal
  assert.equal(proposal.prompt, prompt)
  assert.equal(proposal.focus, FAREWELL.id)
  assert.equal(proposal.missed, false)
  assert.deepEqual(env.focus, [FAREWELL.id, FAREWELL.id])
  assert.deepEqual(lastPreview(env), { flow: CHANGED, done: true })
  assert.equal(state.plan, '')

  store.send('Era só isso')
  await settled(store)
  assert.equal(env.turns[1].proposal, true)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: PICK_REQUEST },
    { role: 'assistant', text: PICK_QUESTION },
    { role: 'user', text: choice(FAREWELL) },
    { role: 'assistant', text: copilot.proposalSummary(proposal) },
    { role: 'user', text: 'Era só isso' },
  ])
})

test('a ready pick without a plan still asks the AI after Confirmar seleção, and a typed answer or a chip still goes to the AI while a ready pick is open', async () => {
  assert.equal(copilot.readPick({ label: 'a mensagem', candidates: [WELCOME.id, FAREWELL.id], ready: true }, BASE).ready, true)
  assert.equal(copilot.readPick({ label: 'a mensagem', candidates: [WELCOME.id, FAREWELL.id], ready: 'true' }, BASE).ready, false)
  assert.equal(copilot.readPick({ label: 'a mensagem', candidates: [WELCOME.id, FAREWELL.id] }, BASE).ready, false)

  const blank = harness({ turns: [readied([WELCOME.id, FAREWELL.id], ''), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(CHANGED)] })
  blank.store.send(PICK_REQUEST)
  let state = await settled(blank.store)
  assert.equal(state.pick.ready, true)
  assert.equal(state.plan, '')
  blank.store.selectPick(FAREWELL.id)
  assert.equal(blank.store.confirmPick(), true)
  state = blank.store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.running, false)
  assert.equal(blank.env.turns.length, 2)
  assert.deepEqual(blank.env.turns[1].history.at(-1), { role: 'user', text: choice(FAREWELL) })
  state = await settled(blank.store)
  assert.equal(blank.env.requests[0].request.prompt, PICK_PLAN)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)

  const typed = harness({ turns: [readied([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', [], PICK_PLAN)] })
  typed.store.send(PICK_REQUEST)
  await settled(typed.store)
  typed.store.selectPick(FAREWELL.id)
  assert.equal(typed.store.send('Pode ser assim'), true)
  state = typed.store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.running, false)
  assert.deepEqual(texts(state).slice(-2), [`user:${choice(FAREWELL)}`, 'user:Pode ser assim'])
  assert.deepEqual(typed.env.turns[1].history.at(-1), { role: 'user', text: `${choice(FAREWELL)}\n\nPode ser assim` })
  await settled(typed.store)
  assert.equal(typed.env.requests.length, 0)

  const chip = harness({ turns: [readied([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', [], PICK_PLAN)] })
  chip.store.send(PICK_REQUEST)
  await settled(chip.store)
  chip.store.selectPick(FAREWELL.id)
  assert.equal(chip.store.send(PICK_CHIPS[1], false), true)
  assert.equal(chip.store.getState().thinking, true)
  assert.deepEqual(chip.env.turns[1].history.at(-1), { role: 'user', text: PICK_CHIPS[1] })
  await settled(chip.store)
  assert.equal(chip.env.requests.length, 0)
})

test('a ready pick keeps the selection when the key is refused or Gerar com IA is busy, ends with the outdated note when the flow changed and still edits after a move', async () => {
  const key = harness({ turns: [readied([WELCOME.id, FAREWELL.id])], outcomes: [received(CHANGED)] })
  key.store.send(PICK_REQUEST)
  await settled(key.store)
  key.store.selectPick(FAREWELL.id)
  key.env.settings = { ...key.env.settings, apiKey: '' }
  assert.equal(key.store.confirmPick(), false)
  let state = key.store.getState()
  assert.equal(state.pick.selected, FAREWELL.id)
  assert.equal(state.fieldErrors.apiKey, 'Informe a chave da API da OpenAI.')
  assert.equal(state.entries.length, 2)
  assert.equal(key.env.requests.length, 0)
  key.store.setBlocked(true)
  key.env.settings = { ...key.env.settings, apiKey: KEY }
  assert.equal(key.store.confirmPick(), false)
  assert.equal(key.store.getState().pick.selected, FAREWELL.id)
  key.store.setBlocked(false)
  assert.equal(key.store.confirmPick(), true)
  await settled(key.store)
  assert.equal(key.env.turns.length, 1)
  assert.equal(key.env.requests[0].request.prompt, `${PICK_READY}\n\n${choice(FAREWELL)}`)

  const changed = harness({ turns: [readied([WELCOME.id, FAREWELL.id])] })
  changed.store.send(PICK_REQUEST)
  await settled(changed.store)
  changed.store.selectPick(FAREWELL.id)
  changed.env.flow = CHANGED
  assert.equal(changed.store.confirmPick(), false)
  state = changed.store.getState()
  assert.equal(state.pick, null)
  assert.equal(state.plan, '')
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(changed.env.requests.length, 0)

  const moved = harness({ turns: [readied([WELCOME.id, FAREWELL.id])], outcomes: [received(CHANGED)] })
  moved.store.send(PICK_REQUEST)
  await settled(moved.store)
  moved.store.selectPick(FAREWELL.id)
  moved.env.flow = MOVED
  assert.equal(moved.store.confirmPick(), true)
  state = await settled(moved.store)
  assert.equal(moved.env.turns.length, 1)
  assert.equal(moved.env.requests[0].request.base, MOVED)
  assert.equal(proposals(state)[0].proposal.original, MOVED)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
})

test('after a ready edit fails or is stopped, Tentar de novo and Editar agora send the same prompt with the focus on the chosen component', async () => {
  const prompt = `${PICK_READY}\n\n${choice(FAREWELL)}`
  const failed = harness({
    turns: [readied([WELCOME.id, FAREWELL.id])],
    outcomes: [rejected('rate_limit', 'O limite de uso do provedor foi atingido.', 'Aguarde alguns instantes.'), received(CHANGED)],
  })
  failed.store.send(PICK_REQUEST)
  await settled(failed.store)
  failed.store.selectPick(FAREWELL.id)
  failed.store.confirmPick()
  let state = await settled(failed.store)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'user', 'error'])
  assert.equal(state.entries.at(-1).prompt, prompt)
  assert.equal(state.plan, prompt)
  assert.equal(failed.store.retry(), true)
  state = await settled(failed.store)
  assert.equal(failed.env.turns.length, 1)
  assert.equal(failed.env.requests[1].request.prompt, prompt)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)

  const stopped = harness({ turns: [readied([WELCOME.id, FAREWELL.id])], outcomes: [({ signal }) => waiting(signal), received(CHANGED)] })
  stopped.store.send(PICK_REQUEST)
  await settled(stopped.store)
  stopped.store.selectPick(FAREWELL.id)
  stopped.store.confirmPick()
  await waitFor(() => stopped.env.requests.length === 1)
  stopped.store.cancel()
  state = stopped.store.getState()
  assert.equal(stopped.env.requests[0].signal.aborted, true)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'user', `note:${copilot.COPILOT_TEXT.cancelled}`])
  assert.equal(stopped.store.editNow(), true)
  state = await settled(stopped.store)
  assert.equal(stopped.env.turns.length, 1)
  assert.equal(stopped.env.requests[1].request.prompt, prompt)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
  assert.equal(stopped.env.focus.at(-1), FAREWELL.id)
})

test('Cancelar seleção leaves the pick with a muted note, hides Editar agora until the next answer and the answer can come by text', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', ['Pode ser assim'], PICK_PLAN)] })
  store.send(PICK_REQUEST)
  await settled(store)
  store.selectPick(FAREWELL.id)
  assert.equal(store.cancelPick(), true)
  let state = store.getState()
  assert.equal(state.pick, null)
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.PICK_CANCELLED}`])
  assert.equal(state.entries.at(-1).tone, 'muted')
  assert.deepEqual(state.suggestions, PICK_CHIPS)
  assert.equal(state.plan, '')
  assert.equal(store.editNow(), false)
  assert.equal(env.requests.length, 0)
  assert.equal(store.cancelPick(), false)
  assert.equal(store.confirmPick(), false)
  assert.equal(store.send('Na despedida, que agradece o contato'), true)
  assert.deepEqual(env.turns[1].history, [
    { role: 'user', text: PICK_REQUEST },
    { role: 'assistant', text: `${PICK_QUESTION}\n\n${copilot.PICK_CANCELLED}` },
    { role: 'user', text: 'Na despedida, que agradece o contato' },
  ])
  state = await settled(store)
  assert.equal(state.plan, PICK_PLAN)
  assert.equal(store.editNow(), true)
})

test('after Cancelar seleção, an edit that comes without a plan still carries the plan of the question and the typed answer', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited('', PICK_EDIT)], outcomes: [received(FIRST)] })
  store.send(PICK_REQUEST)
  await settled(store)
  store.cancelPick()
  store.send('Na despedida, que agradece o contato')
  const state = await settled(store)
  assert.equal(env.requests[0].request.prompt, `${PICK_DRAFT}\n\nNa despedida, que agradece o contato`)
  assert.equal(proposals(state)[0].proposal.focus, null)
  assert.equal(env.focus[0], null)
})

test('a chip clicked while picking goes alone, a typed answer brings the selected candidate along, and a send refused for the key keeps the pick', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', [], PICK_PLAN)] })
  store.send(PICK_REQUEST)
  await settled(store)
  store.selectPick(WELCOME.id)
  env.settings = { ...env.settings, apiKey: '' }
  assert.equal(store.send(PICK_CHIPS[1], false), false)
  assert.equal(store.send('Pode ser assim'), false)
  assert.equal(store.getState().pick.selected, WELCOME.id)
  assert.equal(store.getState().entries.length, 2)
  env.settings = { ...env.settings, apiKey: KEY }
  assert.equal(store.send(PICK_CHIPS[1], false), true)
  assert.equal(store.getState().pick, null)
  const state = await settled(store)
  assert.equal(state.pick, null)
  assert.deepEqual(env.turns[1].history.at(-1), { role: 'user', text: PICK_CHIPS[1] })

  const typed = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(CHANGED)] })
  typed.store.send(PICK_REQUEST)
  await settled(typed.store)
  typed.store.selectPick(FAREWELL.id)
  assert.equal(typed.store.send('Pode ser assim'), true)
  assert.deepEqual(texts(typed.store.getState()).slice(-2), [`user:${choice(FAREWELL)}`, 'user:Pode ser assim'])
  assert.deepEqual(typed.env.turns[1].history.at(-1), { role: 'user', text: `${choice(FAREWELL)}\n\nPode ser assim` })
  const done = await settled(typed.store)
  assert.equal(proposals(done)[0].proposal.focus, FAREWELL.id)

  const unselected = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', [], PICK_PLAN)] })
  unselected.store.send(PICK_REQUEST)
  await settled(unselected.store)
  unselected.store.send('Na despedida')
  assert.deepEqual(texts(unselected.store.getState()).slice(-1), ['user:Na despedida'])
  await settled(unselected.store)
})

test('Aplicar, Descartar, a stale proposal, Parar and dispose clear the pick', async () => {
  const refine = async () => {
    const setup = harness({ turns: [edited(), picked([FAREWELL.id, BOLETO.id])], outcomes: [received(FIRST)] })
    setup.store.send('Acrescente a opção Segunda via de boleto')
    await settled(setup.store)
    setup.store.send(PICK_REQUEST)
    const state = await settled(setup.store)
    assert.ok(state.pick)
    assert.ok(state.pending)
    return setup
  }
  const applied = await refine()
  assert.equal(applied.store.apply(), false)
  assert.ok(applied.store.getState().pick)
  assert.equal(applied.store.cancelPick(), true)
  assert.equal(applied.store.apply(), true)
  assert.equal(applied.store.getState().pick, null)
  assert.equal(applied.store.getState().plan, '')

  const discarded = await refine()
  assert.equal(discarded.store.discard(), true)
  assert.equal(discarded.store.getState().pick, null)
  assert.equal(discarded.store.getState().plan, '')

  const outdated = await refine()
  outdated.store.setVisible(false)
  outdated.env.flow = CHANGED
  outdated.store.setVisible(true)
  let state = outdated.store.getState()
  assert.equal(state.pick, null)
  assert.deepEqual(kinds(state).slice(-4), ['proposal:discarded', 'user', 'assistant', `note:${copilot.COPILOT_TEXT.stale}`])
  assert.equal(outdated.store.confirmPick(), false)

  const disposed = await refine()
  disposed.store.dispose()
  assert.equal(disposed.store.getState().pick, null)

  const stopped = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), ({ signal }) => waiting(signal)] })
  stopped.store.send(PICK_REQUEST)
  await settled(stopped.store)
  stopped.store.selectPick(FAREWELL.id)
  assert.equal(stopped.store.confirmPick(), true)
  stopped.store.cancel()
  state = stopped.store.getState()
  assert.equal(state.pick, null)
  assert.equal(state.thinking, false)
  assert.deepEqual(kinds(state).slice(-2), ['user', `note:${copilot.COPILOT_TEXT.cancelled}`])
  assert.equal(stopped.store.selectPick(FAREWELL.id), false)
  assert.equal(stopped.store.confirmPick(), false)
})

test('confirming after the open flow changed ends with the outdated note, and a moved component keeps the selection valid', async () => {
  const changed = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  changed.store.send(PICK_REQUEST)
  await settled(changed.store)
  changed.store.selectPick(FAREWELL.id)
  changed.env.flow = CHANGED
  assert.equal(changed.store.confirmPick(), false)
  let state = changed.store.getState()
  assert.equal(state.pick, null)
  assert.equal(state.plan, '')
  assert.deepEqual(state.suggestions, [])
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(changed.env.turns.length, 1)

  const moved = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(FIRST)] })
  moved.store.send(PICK_REQUEST)
  await settled(moved.store)
  moved.store.selectPick(FAREWELL.id)
  moved.env.flow = MOVED
  assert.equal(moved.store.confirmPick(), true)
  assert.equal(moved.env.turns[1].flow, MOVED)
  state = await settled(moved.store)
  assert.equal(moved.env.requests[0].request.base, MOVED)
  assert.equal(proposals(state)[0].proposal.original, MOVED)
})

test('while picking, Editar agora waits for the selection, and reopening the panel on another flow drops the old selection', async () => {
  const waiting = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  waiting.store.send(PICK_REQUEST)
  let state = await settled(waiting.store)
  assert.ok(state.pick)
  assert.ok(state.plan)
  assert.equal(waiting.store.editNow(), false)
  assert.equal(waiting.env.requests.length, 0)

  const reopened = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  reopened.store.send(PICK_REQUEST)
  await settled(reopened.store)
  reopened.store.selectPick(FAREWELL.id)
  reopened.store.setVisible(false)
  reopened.env.flow = CHANGED
  reopened.store.setVisible(true)
  state = reopened.store.getState()
  assert.equal(state.pick, null)
  assert.deepEqual(kinds(state).slice(-1), [`note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(reopened.store.confirmPick(), false)
  assert.equal(reopened.env.turns.length, 1)
})

test('the edit that follows a selection keeps the canvas focus on the chosen component in every frame, on the proposal and on reopen, and other edits have no focus', async () => {
  const release = gate()
  const { store, env } = harness({
    turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT), edited(OPTION_PLAN, OPTION_EDIT)],
    outcomes: [
      async ({ onPartial }) => {
        onPartial(FAREWELL_DELTA)
        await release.opened
        return received(CHANGED)
      },
      received(FIRST),
    ],
  })
  store.send(PICK_REQUEST)
  await settled(store)
  store.selectPick(FAREWELL.id)
  store.confirmPick()
  await started(store)
  await waitFor(() => env.focus.length >= 2)
  assert.deepEqual(env.focus, [FAREWELL.id, FAREWELL.id])
  assert.deepEqual(env.fresh, [true, false])
  assert.equal(lastPreview(env).done, false)
  assert.ok(JSON.stringify(lastPreview(env).flow).includes('Até a próxima.'))
  release.open()
  let state = await settled(store)
  assert.deepEqual(env.focus, [FAREWELL.id, FAREWELL.id, FAREWELL.id])
  assert.deepEqual(lastPreview(env), { flow: CHANGED, done: true })
  const proposal = proposals(state)[0].proposal
  assert.equal(proposal.focus, FAREWELL.id)
  assert.equal(proposal.missed, false)
  assert.equal(copilot.proposalTitle(proposal), 'Edição pronta')
  store.setVisible(false)
  assert.equal(lastPreview(env), null)
  assert.equal(env.focus.at(-1), undefined)
  store.setVisible(true)
  assert.deepEqual(lastPreview(env), { flow: CHANGED, done: true })
  assert.equal(env.focus.at(-1), FAREWELL.id)

  store.discard()
  const count = env.focus.length
  store.send(OPTION_REQUEST)
  state = await settled(store)
  assert.deepEqual(env.focus.slice(count), [null, null])
  assert.equal(proposals(state).at(-1).proposal.focus, null)
  assert.equal(proposals(state).at(-1).proposal.missed, false)
})

test('the focus follows the plan: a plan that names another candidate drops it and a plan without any ID keeps it', async () => {
  const other = `Depois da mensagem de boas-vindas, ID ${WELCOME.id}, acrescente uma pergunta pedindo o CPF do cliente.`
  const moved = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(other, PICK_EDIT)], outcomes: [received(FIRST)] })
  moved.store.send(PICK_REQUEST)
  await settled(moved.store)
  moved.store.selectPick(FAREWELL.id)
  moved.store.confirmPick()
  let state = await settled(moved.store)
  assert.deepEqual(moved.env.focus, [null, null])
  assert.equal(proposals(state)[0].proposal.focus, null)
  assert.equal(proposals(state)[0].proposal.missed, false)

  const vague = 'Depois da despedida, acrescente uma pergunta pedindo o CPF do cliente.'
  const kept = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(vague, PICK_EDIT)], outcomes: [received(CHANGED)] })
  kept.store.send(PICK_REQUEST)
  await settled(kept.store)
  kept.store.selectPick(FAREWELL.id)
  kept.store.confirmPick()
  state = await settled(kept.store)
  assert.deepEqual(kept.env.focus, [FAREWELL.id, FAREWELL.id])
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
})

test('a proposal that leaves the selected component as it was carries a warning, and one that changes it or connects a new component to it does not', async () => {
  const run = async (result, extra = {}) => {
    const setup = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(result, extra)] })
    setup.store.send(PICK_REQUEST)
    await settled(setup.store)
    setup.store.selectPick(FAREWELL.id)
    setup.store.confirmPick()
    return proposals(await settled(setup.store))[0].proposal
  }
  const missed = await run(FIRST, { issues: [ISSUE] })
  assert.equal(missed.focus, FAREWELL.id)
  assert.equal(missed.missed, true)
  assert.deepEqual(missed.issues, [{ severity: 'warning', scope: 'ia', message: copilot.FOCUS_MISSED, nodeId: FAREWELL.id }, ISSUE])
  assert.equal(copilot.proposalTitle(missed), 'Edição pronta com 2 pendências')
  assert.equal(copilot.proposalTone(missed), 'warning')
  assert.deepEqual(copilot.proposalGroups(missed).map((group) => [group.title, group.items.length]), [['Revise', 1], ['Dados da plataforma', 1]])

  const before = await run(NOTICE_BEFORE)
  assert.equal(before.missed, false)
  assert.deepEqual(before.issues, [])
  const changed = await run(CHANGED)
  assert.equal(changed.missed, false)

  const refining = harness({
    turns: [edited('Troque a despedida por Até a próxima.'), picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)],
    outcomes: [received(CHANGED), received(BOTH)],
  })
  refining.store.send('Troque a despedida')
  await settled(refining.store)
  refining.store.send(PICK_REQUEST)
  await settled(refining.store)
  refining.store.selectPick(FAREWELL.id)
  refining.store.confirmPick()
  const refined = proposals(await settled(refining.store)).at(-1).proposal
  assert.equal(refined.base, CHANGED)
  assert.ok(refined.diff.changed.includes(FAREWELL.id))
  assert.equal(refined.missed, true)
})

test('citesId finds the ID of a component in a plan and touches sees a change, a removal or a new connection into it', () => {
  assert.equal(copilot.citesId(PICK_PLAN, FAREWELL.id), true)
  assert.equal(copilot.citesId('No menu Como podemos ajudar?, ID: 3, acrescente a opção.', '3'), true)
  assert.equal(copilot.citesId('Use o componente id 3.', '3'), true)
  assert.equal(copilot.citesId('Use o componente ID 31.', '3'), false)
  assert.equal(copilot.citesId('Use o componente de ID 3a.', '3'), false)
  assert.equal(copilot.citesId('Depois da despedida, acrescente a pergunta.', FAREWELL.id), false)
  assert.equal(copilot.citesId('No menu ID menu.x, acrescente a opção.', 'menu.x'), true)
  assert.equal(copilot.citesId('No menu ID menu_x, acrescente a opção.', 'menu.x'), false)
  assert.equal(copilot.touches(diffFlows(BASE, CHANGED), BASE, CHANGED, FAREWELL.id), true)
  assert.equal(copilot.touches(diffFlows(BASE, NOTICE_BEFORE), BASE, NOTICE_BEFORE, FAREWELL.id), true)
  assert.equal(diffFlows(BASE, NOTICE_BEFORE).changed.includes(FAREWELL.id), false)
  assert.equal(copilot.touches(diffFlows(BASE, FIRST), BASE, FIRST, FAREWELL.id), false)
  assert.equal(copilot.touches(diffFlows(BASE, FIRST), BASE, FIRST, MENU.id), true)
  const removed = { ...BASE, nodes: BASE.nodes.filter((node) => node.id !== AGENDA.id), edges: BASE.edges.filter((edge) => edge.target !== AGENDA.id && edge.source !== AGENDA.id) }
  assert.equal(copilot.touches(diffFlows(BASE, removed), BASE, removed, AGENDA.id), true)
})

test('closing the panel in the middle of a selection leaves the question reminder on the Copiloto button without a toast', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  store.setVisible(false)
  assert.equal(store.getState().attention, null)
  store.setVisible(true)
  store.send(PICK_REQUEST)
  await settled(store)
  store.selectPick(FAREWELL.id)
  store.setVisible(false)
  let state = store.getState()
  assert.equal(state.attention, 'question')
  assert.deepEqual(env.notified, [])
  store.setVisible(true)
  state = store.getState()
  assert.equal(state.attention, null)
  assert.equal(state.pick.selected, FAREWELL.id)
  store.cancelPick()
  store.setVisible(false)
  assert.equal(store.getState().attention, null)
  assert.deepEqual(env.notified, [])
})

test('Editar agora after a selection whose turn was stopped sends the plan with the selection, and after the AI answered it sends the new plan', async () => {
  const stopped = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), ({ signal }) => waiting(signal)], outcomes: [received(CHANGED)] })
  stopped.store.send(PICK_REQUEST)
  await settled(stopped.store)
  stopped.store.selectPick(FAREWELL.id)
  stopped.store.confirmPick()
  stopped.store.cancel()
  let state = stopped.store.getState()
  assert.equal(state.plan, PICK_DRAFT)
  assert.equal(stopped.store.editNow(), true)
  state = await settled(stopped.store)
  assert.equal(stopped.env.requests[0].request.prompt, `${PICK_DRAFT}\n\n${choice(FAREWELL)}`)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'user', `note:${copilot.COPILOT_TEXT.cancelled}`, 'user', 'proposal:pending'])
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
  assert.equal(stopped.env.focus[0], FAREWELL.id)

  const answered = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', ['Pode ser assim'], PICK_PLAN)], outcomes: [received(CHANGED)] })
  answered.store.send(PICK_REQUEST)
  await settled(answered.store)
  answered.store.selectPick(FAREWELL.id)
  answered.store.confirmPick()
  await settled(answered.store)
  assert.equal(answered.store.editNow(), true)
  state = await settled(answered.store)
  assert.equal(answered.env.requests[0].request.prompt, PICK_PLAN)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
})

test('the answer of the AI shows while it is written, repeated fragments do not touch the state, and a stopped or failed turn leaves nothing behind', async () => {
  const release = gate()
  let partial
  const { store } = harness({
    turns: [
      async ({ onPartial }) => {
        partial = onPartial
        onPartial({ message: 'Pensei na opção' })
        await release.opened
        return asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT)
      },
      async ({ onPartial, signal }) => {
        partial = onPartial
        return waiting(signal)
      },
      async ({ onPartial }) => {
        onPartial({ message: 'Vou aplicar' })
        return refused('provider_error', 'O provedor não respondeu.', 'Tente novamente.')
      },
    ],
  })
  store.send(OPTION_REQUEST)
  assert.equal(store.getState().thinking, true)
  assert.equal(store.getState().incoming, 'Pensei na opção')
  let updates = 0
  const stop = store.subscribe(() => {
    updates += 1
  })
  partial({ message: 'Pensei na opção Segunda via' })
  assert.equal(store.getState().incoming, 'Pensei na opção Segunda via')
  partial({ message: 'Pensei na opção Segunda via', plan: 'No menu' })
  partial({ plan: 'No menu Como podemos ajudar?' })
  partial({ message: ' Pensei na opção Segunda via ' })
  partial({ message: 7 })
  assert.equal(updates, 1)
  stop()
  release.open()
  let state = await settled(store)
  assert.equal(state.incoming, '')
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_QUESTION}`])

  store.send('Pode ser assim')
  partial({ message: 'Vou' })
  assert.equal(store.getState().incoming, 'Vou')
  store.cancel()
  assert.equal(store.getState().incoming, '')
  partial({ message: 'Vou aplicar a mudança' })
  assert.equal(store.getState().incoming, '')

  store.send('Pode ser assim')
  state = await settled(store)
  assert.equal(state.incoming, '')
  assert.equal(state.entries.at(-1).kind, 'error')
})

test('requestTurn hands the partial answers to the interview engine only when the panel asks for them', async () => {
  const { requestTurn } = require('../src/flow/ai/generation-client.ts')
  const calls = []
  const engine = {
    interviewTurn: async (input, hooks) => {
      calls.push(hooks)
      hooks.onPartial?.({ message: 'Pensei' })
      return { ok: true, turn: { action: 'ask', message: OPTION_QUESTION, suggestions: [], plan: '' } }
    },
  }
  const signal = new AbortController().signal
  const input = { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, effort: 'medium', fill: true, history: [{ role: 'user', text: OPTION_REQUEST }], flow: BASE, scope: 'copilot' }
  const seen = []
  await requestTurn(input, signal, engine, (turn) => seen.push(turn))
  await requestTurn(input, signal, engine)
  assert.equal(typeof calls[0].onPartial, 'function')
  assert.deepEqual(seen, [{ message: 'Pensei' }])
  assert.deepEqual(calls[1], { transport: 'browser', signal })
})

test('linkPick clears the canvas selection when the panel selects a candidate the canvas could not show', async () => {
  const { store } = harness({ turns: [picked([WELCOME.id, FAREWELL.id, AGENDA.id])] })
  const canvas = fakeCanvas((request) => request.candidates.slice(0, 2))
  const unlink = copilot.linkPick(store, canvas)
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  assert.deepEqual(canvas.calls, [['start', 'a mensagem', [WELCOME.id, FAREWELL.id, AGENDA.id], null]])
  store.selectPick(AGENDA.id)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['select', null])
  store.selectPick(FAREWELL.id)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['select', FAREWELL.id])
  store.selectPick(null)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['select', null])
  unlink()
})

test('a question with a pick that arrives with the panel closed asks for attention like any question', async () => {
  const answer = delayed(picked([WELCOME.id, FAREWELL.id]))
  const { store, env } = harness({ turns: [answer.turn] })
  store.send(PICK_REQUEST)
  store.setVisible(false)
  answer.release.open()
  const state = await settled(store)
  assert.equal(state.attention, 'question')
  assert.deepEqual(env.notified, ['question'])
  assert.ok(state.pick)
  store.setVisible(true)
  assert.equal(store.getState().attention, null)
  assert.ok(store.getState().pick)
})

test('an edit turn without a plan uses the plan agreed so far followed by the last answer, within the prompt limit', async () => {
  const { store, env } = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT), edited('', OPTION_EDIT)], outcomes: [received(FIRST)] })
  store.send(OPTION_REQUEST)
  await settled(store)
  store.send('Pode ser assim')
  const state = await settled(store)
  assert.equal(env.requests[0].request.prompt, `${OPTION_DRAFT}\n\nPode ser assim`)
  assert.equal(proposals(state)[0].proposal.prompt, `${OPTION_DRAFT}\n\nPode ser assim`)

  const big = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], 'a '.repeat(3995)), edited('', OPTION_EDIT)], outcomes: [received(FIRST)] })
  big.store.send(OPTION_REQUEST)
  await settled(big.store)
  big.store.send('Pode ser assim')
  await settled(big.store)
  const prompt = big.env.requests[0].request.prompt
  assert.ok(prompt.length <= 8000)
  assert.ok(prompt.endsWith('\n\nPode ser assim'))

  const plain = harness({ turns: [edited('', OPTION_EDIT)], outcomes: [received(FIRST)] })
  plain.store.send(OPTION_REQUEST)
  await settled(plain.store)
  assert.equal(plain.env.requests[0].request.prompt, OPTION_REQUEST)
})

test('an edit a turn returns runs on the flow the turn saw and is dropped with a note when that flow changed', async () => {
  const changed = delayed(edited(OPTION_PLAN, OPTION_EDIT))
  const first = harness({ turns: [changed.turn] })
  first.store.send(OPTION_REQUEST)
  first.env.flow = CHANGED
  changed.release.open()
  let state = await settled(first.store)
  assert.equal(first.env.requests.length, 0)
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(state.plan, '')
  assert.equal(state.running, false)
  assert.equal(first.store.editNow(), false)
  assert.deepEqual(first.env.notified, [])
  assert.deepEqual(first.env.previews, [])

  const cleared = delayed(edited(OPTION_PLAN, OPTION_EDIT))
  const second = harness({ turns: [cleared.turn] })
  second.store.send(OPTION_REQUEST)
  second.store.setVisible(false)
  second.env.flow = newFlow(NOW)
  cleared.release.open()
  state = await settled(second.store)
  assert.equal(second.env.requests.length, 0)
  assert.deepEqual(kinds(state), ['user', `note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(state.attention, 'failed')
  assert.deepEqual(second.env.notified, ['failed'])

  const moved = delayed(edited(OPTION_PLAN, OPTION_EDIT))
  const third = harness({ turns: [moved.turn], outcomes: [received(FIRST)] })
  third.store.send(OPTION_REQUEST)
  third.env.flow = MOVED
  moved.release.open()
  state = await settled(third.store)
  assert.equal(third.env.requests[0].request.base, MOVED)
  assert.equal(third.env.requests[0].request.prompt, OPTION_PLAN)
  assert.equal(proposals(state)[0].proposal.original, MOVED)
  assert.equal(third.store.apply(), true)
})

test('a refinement answered after its proposal went stale edits nothing and leaves a single stale note', async () => {
  const reopened = delayed(edited('Troque o texto do boleto.'))
  const first = harness({ turns: [edited(), reopened.turn], outcomes: [received(FIRST)] })
  first.store.send('Acrescente a opção Segunda via de boleto')
  await settled(first.store)
  first.store.send('Troque o texto do boleto')
  first.store.setVisible(false)
  first.env.flow = CHANGED
  first.store.setVisible(true)
  reopened.release.open()
  let state = await settled(first.store)
  assert.equal(first.env.requests.length, 1)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:discarded', 'user', `note:${copilot.COPILOT_TEXT.stale}`])
  assert.equal(state.plan, '')
  assert.equal(state.pending, null)
  assert.deepEqual(first.env.notified, [])

  const closed = delayed(edited('Troque o texto do boleto.'))
  const second = harness({ turns: [edited(), closed.turn], outcomes: [received(FIRST)] })
  second.store.send('Acrescente a opção Segunda via de boleto')
  await settled(second.store)
  second.store.send('Troque o texto do boleto')
  second.store.setVisible(false)
  second.env.flow = CHANGED
  closed.release.open()
  state = await settled(second.store)
  assert.equal(second.env.requests.length, 1)
  assert.deepEqual(kinds(state), ['user', 'assistant', 'proposal:discarded', 'user', `note:${copilot.COPILOT_TEXT.stale}`])
  assert.equal(state.attention, 'failed')
  assert.deepEqual(second.env.notified, ['failed'])
})

test('a turn answered while Gerar com IA is busy does not start the edit and Editar agora runs it afterwards', async () => {
  const answer = delayed(edited(OPTION_PLAN, OPTION_EDIT))
  const { store, env } = harness({ turns: [answer.turn], outcomes: [received(FIRST)] })
  store.send(OPTION_REQUEST)
  store.setVisible(false)
  store.setBlocked(true)
  answer.release.open()
  let state = await settled(store)
  assert.equal(env.requests.length, 0)
  assert.deepEqual(texts(state), [`user:${OPTION_REQUEST}`, `assistant:${OPTION_EDIT}`, `note:${copilot.COPILOT_TEXT.paused}`])
  assert.equal(state.entries.at(-1).tone, 'muted')
  assert.equal(state.plan, OPTION_PLAN)
  assert.equal(state.attention, null)
  assert.deepEqual(env.notified, [])
  assert.deepEqual(env.previews, [])
  assert.equal(store.editNow(), false)
  store.setBlocked(false)
  store.setVisible(true)
  assert.equal(store.editNow(), true)
  state = await settled(store)
  assert.equal(env.requests.length, 1)
  assert.equal(env.requests[0].request.prompt, OPTION_PLAN)
  assert.equal(env.requests[0].request.base, BASE)
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.COPILOT_TEXT.paused}`, 'user', 'proposal:pending'])
})

test('Editar agora runs on the flow the question saw: a content change ends with the outdated note and a moved component still edits', async () => {
  const changed = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_PLAN)] })
  changed.store.send(OPTION_REQUEST)
  await settled(changed.store)
  changed.env.flow = CHANGED
  assert.equal(changed.store.editNow(), false)
  let state = changed.store.getState()
  assert.equal(changed.env.requests.length, 0)
  assert.deepEqual(kinds(state), ['user', 'assistant', `note:${copilot.COPILOT_TEXT.outdated}`])
  assert.equal(state.plan, '')
  assert.deepEqual(state.suggestions, [])
  assert.equal(changed.store.editNow(), false)

  const moved = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_PLAN)], outcomes: [received(FIRST)] })
  moved.store.send(OPTION_REQUEST)
  await settled(moved.store)
  moved.env.flow = MOVED
  assert.equal(moved.store.editNow(), true)
  await settled(moved.store)
  assert.equal(moved.env.requests[0].request.base, MOVED)
  assert.equal(moved.env.requests[0].request.prompt, OPTION_PLAN)
})

test('a new message after the open flow changed leaves the plan made for the old flow behind', async () => {
  const { store, env } = harness({ turns: [asked(OPTION_QUESTION, ['Pode ser assim'], OPTION_DRAFT), edited('', OPTION_EDIT)], outcomes: [received(FIRST)] })
  store.send(OPTION_REQUEST)
  await settled(store)
  env.flow = CHANGED
  assert.equal(store.send('Pode ser assim'), true)
  assert.equal(store.getState().plan, '')
  assert.equal(env.turns[1].flow, CHANGED)
  await settled(store)
  assert.equal(env.requests[0].request.prompt, 'Pode ser assim')
  assert.equal(env.requests[0].request.base, CHANGED)
})

test('linkPick shows the pick on the canvas while the panel is visible, mirrors the selection both ways and confirms through the canvas', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), edited(PICK_PLAN, PICK_EDIT)], outcomes: [received(FIRST)] })
  const canvas = fakeCanvas()
  const seen = { confirmed: [], cancelled: 0, lists: [] }
  const unlink = copilot.linkPick(store, canvas, {
    confirm: (id) => {
      seen.confirmed.push(id)
      store.confirmPick()
    },
    cancel: () => {
      seen.cancelled += 1
    },
    listOnly: (key) => seen.lists.push(key),
  })
  await tick()
  assert.deepEqual(canvas.calls, [])
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  assert.deepEqual(canvas.calls, [['start', 'a mensagem', [WELCOME.id, FAREWELL.id], null]])
  assert.deepEqual(seen.lists, [''])

  canvas.request.onSelect(FAREWELL.id)
  assert.equal(store.getState().pick.selected, FAREWELL.id)
  await tick()
  assert.equal(canvas.calls.length, 1)

  canvas.request.onSelect('nao_existe')
  assert.equal(store.getState().pick.selected, FAREWELL.id)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['select', FAREWELL.id])

  store.selectPick(WELCOME.id)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['select', WELCOME.id])

  const request = leave(canvas)
  request.onConfirm(FAREWELL.id)
  assert.deepEqual(seen.confirmed, [FAREWELL.id])
  let state = store.getState()
  assert.equal(state.thinking, true)
  assert.equal(state.pick, null)
  assert.equal(state.entries.at(-1).text, choice(FAREWELL))
  request.onSelect(WELCOME.id)
  request.onCancel()
  await tick()
  assert.equal(canvas.calls.length, 3)
  state = await settled(store)
  assert.equal(env.requests[0].request.prompt, PICK_PLAN)
  assert.equal(seen.cancelled, 0)
  assert.equal(state.entries.some((entry) => entry.kind === 'note'), false)
  unlink()
  assert.equal(canvas.calls.length, 3)
})

test('linkPick leaves the canvas pick when the panel hides or Gerar com IA takes the canvas and starts it again with the selection', async () => {
  const { store } = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  const canvas = fakeCanvas()
  const unlink = copilot.linkPick(store, canvas)
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  store.selectPick(FAREWELL.id)
  await tick()
  const shown = ['start', 'a mensagem', [WELCOME.id, FAREWELL.id]]
  assert.deepEqual(canvas.calls, [[...shown, null], ['select', FAREWELL.id]])
  store.setVisible(false)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['end'])
  store.setVisible(true)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), [...shown, FAREWELL.id])
  store.setBlocked(true)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['end'])
  store.setBlocked(false)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), [...shown, FAREWELL.id])
  const count = canvas.calls.length
  unlink()
  assert.deepEqual(canvas.calls.slice(count), [['end']])
  store.cancelPick()
  await tick()
  assert.equal(canvas.calls.length, count + 1)
})

test('linkPick ends the canvas pick before the proposal preview goes away and starts it after the preview is back', async () => {
  const { store, env } = harness({ turns: [edited(), picked([FAREWELL.id, BOLETO.id])], outcomes: [received(FIRST)] })
  const shownOn = []
  const canvas = fakeCanvas((request) => {
    shownOn.push(lastPreview(env))
    return request.candidates
  })
  const order = []
  const end = canvas.end
  canvas.end = () => {
    order.push(env.previews.length)
    end()
  }
  const unlink = copilot.linkPick(store, canvas)
  store.send('Acrescente a opção Segunda via de boleto')
  await settled(store)
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  assert.deepEqual(canvas.calls, [['start', 'a mensagem', [FAREWELL.id, BOLETO.id], null]])
  assert.deepEqual(shownOn, [{ flow: FIRST, done: true }])
  const before = env.previews.length
  store.setVisible(false)
  assert.deepEqual(canvas.calls.at(-1), ['end'])
  assert.deepEqual(order, [before])
  assert.equal(lastPreview(env), null)
  store.setVisible(true)
  assert.equal(canvas.calls.length, 2)
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['start', 'a mensagem', [FAREWELL.id, BOLETO.id], null])
  assert.deepEqual(shownOn.at(-1), { flow: FIRST, done: true })
  store.discard()
  assert.deepEqual(canvas.calls.at(-1), ['end'])
  unlink()
  assert.equal(canvas.calls.length, 4)
})

test('linkPick ends the canvas pick when the pick clears, and Cancelar on the canvas adds the note without another end', async () => {
  const { store } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), picked([WELCOME.id, FAREWELL.id])] })
  const canvas = fakeCanvas()
  let cancelled = 0
  const unlink = copilot.linkPick(store, canvas, {
    cancel: () => {
      cancelled += 1
    },
  })
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  store.cancelPick()
  await tick()
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end'])
  assert.equal(cancelled, 0)
  store.send('Quero escolher no canvas')
  await settled(store)
  await tick()
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end', 'start'])
  leave(canvas).onCancel()
  assert.equal(cancelled, 1)
  const state = store.getState()
  assert.equal(state.pick, null)
  assert.equal(state.entries.at(-1).text, copilot.PICK_CANCELLED)
  await tick()
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end', 'start'])
  unlink()
  assert.equal(canvas.calls.length, 3)
})

test('linkPick keeps the pick in the panel list when the canvas finds fewer than 2 candidates and tries again on reopen', async () => {
  const { store } = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  const canvas = fakeCanvas(() => [WELCOME.id, 'outro'])
  const lists = []
  const unlink = copilot.linkPick(store, canvas, { listOnly: (key) => lists.push(key) })
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  const key = copilot.pickKey(store.getState().pick)
  assert.ok(key)
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end'])
  assert.deepEqual(lists, [key])
  store.selectPick(FAREWELL.id)
  await tick()
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end'])
  store.setVisible(false)
  await tick()
  store.setVisible(true)
  await tick()
  assert.deepEqual(canvas.calls.map((call) => call[0]), ['start', 'end', 'start', 'end'])
  assert.deepEqual(canvas.calls[2], ['start', 'a mensagem', [WELCOME.id, FAREWELL.id], FAREWELL.id])
  assert.deepEqual(lists, [key, key])
  assert.equal(store.getState().pick.selected, FAREWELL.id)
  unlink()

  const broken = harness({ turns: [picked([WELCOME.id, FAREWELL.id])] })
  const failing = fakeCanvas(() => {
    throw new Error('canvas indisponível')
  })
  const brokenLists = []
  const off = copilot.linkPick(broken.store, failing, { listOnly: (value) => brokenLists.push(value) })
  broken.store.send(PICK_REQUEST)
  await settled(broken.store)
  await tick()
  assert.deepEqual(brokenLists, [copilot.pickKey(broken.store.getState().pick)])
  assert.ok(broken.store.getState().pick)
  off()
})

test('linkPick starts the canvas pick again when the confirm on the canvas is refused for the key', async () => {
  const { store, env } = harness({ turns: [picked([WELCOME.id, FAREWELL.id]), asked('Qual pergunta de CPF você quer?', [], PICK_PLAN)] })
  const canvas = fakeCanvas()
  const unlink = copilot.linkPick(store, canvas)
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  env.settings = { ...env.settings, apiKey: '' }
  leave(canvas).onConfirm(FAREWELL.id)
  let state = store.getState()
  assert.equal(state.thinking, false)
  assert.equal(state.pick.selected, FAREWELL.id)
  assert.equal(state.fieldErrors.apiKey, 'Informe a chave da API da OpenAI.')
  await tick()
  assert.deepEqual(canvas.calls.at(-1), ['start', 'a mensagem', [WELCOME.id, FAREWELL.id], FAREWELL.id])
  env.settings = { ...env.settings, apiKey: KEY }
  leave(canvas).onConfirm(FAREWELL.id)
  assert.equal(store.getState().thinking, true)
  await settled(store)
  assert.deepEqual(env.turns[1].history.at(-1), { role: 'user', text: choice(FAREWELL) })
  await tick()
  assert.equal(canvas.calls.filter((call) => call[0] === 'start').length, 2)
  assert.equal(canvas.calls.filter((call) => call[0] === 'end').length, 0)
  unlink()
})

test('linkPick confirms a ready pick on the canvas straight into the edit, without another turn', async () => {
  const { store, env } = harness({ turns: [readied([WELCOME.id, FAREWELL.id])], outcomes: [received(CHANGED)] })
  const canvas = fakeCanvas()
  const unlink = copilot.linkPick(store, canvas)
  store.send(PICK_REQUEST)
  await settled(store)
  await tick()
  assert.deepEqual(canvas.calls, [['start', 'a mensagem', [WELCOME.id, FAREWELL.id], null]])
  leave(canvas).onConfirm(FAREWELL.id)
  let state = store.getState()
  assert.equal(state.thinking, false)
  assert.equal(state.running, true)
  assert.equal(state.pick, null)
  assert.equal(state.entries.at(-1).text, choice(FAREWELL))
  assert.deepEqual(env.focus, [FAREWELL.id])
  state = await settled(store)
  assert.equal(env.turns.length, 1)
  assert.equal(env.requests[0].request.prompt, `${PICK_READY}\n\n${choice(FAREWELL)}`)
  assert.equal(proposals(state)[0].proposal.focus, FAREWELL.id)
  await tick()
  assert.equal(canvas.calls.length, 1)
  unlink()
  assert.equal(canvas.calls.length, 1)
})

test('the pick box shows the hint, one pressed button per candidate and confirms only after a selection', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const pick = { label: 'a mensagem', candidates: [{ id: WELCOME.id, text: nodeSubject(WELCOME) }, { id: FAREWELL.id, text: nodeSubject(FAREWELL) }], selected: null }
  const render = (extra = {}) =>
    renderToStaticMarkup(React.createElement(panel.PickBox, { id: 'escolha', pick, onCanvas: true, disabled: false, onSelect: () => undefined, onCancel: () => undefined, onConfirm: () => undefined, ...extra }))
  let html = render()
  assert.equal(panel.PICK_REGION, 'Seleção do componente')
  assert.match(html, /^<div role="region" aria-label="Seleção do componente"/)
  assert.ok(html.includes('Selecione a mensagem no canvas ou na lista e confirme.'))
  assert.doesNotMatch(html, /[!—–]/)
  let buttons = markupButtons(html)
  assert.deepEqual(buttons.map((button) => button.text), [nodeSubject(WELCOME), nodeSubject(FAREWELL), 'Cancelar seleção', 'Confirmar seleção'])
  for (const node of [WELCOME, FAREWELL]) assert.ok(html.includes(`<span class="whitespace-nowrap">· ID ${node.id}</span>`), `o ID ${node.id} não quebra a linha`)
  assert.ok(buttons[0].attrs.includes('aria-pressed="false"'))
  assert.ok(buttons[1].attrs.includes('aria-pressed="false"'))
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false, false, true])

  html = render({ pick: { ...pick, selected: FAREWELL.id } })
  buttons = markupButtons(html)
  assert.ok(buttons[0].attrs.includes('aria-pressed="false"'))
  assert.ok(buttons[1].attrs.includes('aria-pressed="true"'))
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false, false, false])

  html = render({ onCanvas: false })
  assert.ok(html.includes('Selecione a mensagem na lista e confirme.'))
  assert.ok(!html.includes('no canvas'))

  html = render({ pick: { ...pick, selected: FAREWELL.id }, disabled: true })
  assert.deepEqual(markupButtons(html).map((button) => button.disabled), [true, true, false, true])

  html = render({ pick: { ...pick, selected: FAREWELL.id }, disabled: true, blocked: true, onCanvas: false })
  assert.ok(html.includes('Aguarde a geração do Gerar com IA terminar para selecionar a mensagem.'))
  assert.ok(!html.includes('Selecione a mensagem'))
  assert.deepEqual(markupButtons(html).map((button) => button.disabled), [true, true, false, true])

  const props = { id: 'copiloto', open: true, onClose: () => undefined, getCurrentFlow: () => BASE, onLivePreview: () => undefined, onWorkflowEdited: () => true }
  const canvas = { start: () => [], select: () => undefined, confirm: () => undefined, end: () => undefined }
  const whole = renderToStaticMarkup(React.createElement(panel.default, { ...props, pick: canvas }))
  assert.match(whole, /<section id="copiloto" aria-label="Copiloto"/)
  assert.doesNotMatch(whole, /Seleção do componente/)
})

test('the answer being written shows as a Copiloto bubble hidden from screen readers, outside the message list', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  assert.equal(renderToStaticMarkup(React.createElement(panel.IncomingReply, { text: '' })), '')
  const html = renderToStaticMarkup(React.createElement(panel.IncomingReply, { text: 'Pensei na opção Segunda via' }))
  assert.match(html, /^<div class="flex justify-start" aria-hidden="true"><div class="[^"]*rounded-2xl[^"]*">Pensei na opção Segunda via<\/div><\/div>$/)
  assert.doesNotMatch(html, /<p[ >]/)
})

test('the proposal card warns in the open when the edit did not change the selected component', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const proposal = {
    flow: FIRST,
    original: BASE,
    base: BASE,
    prompt: PICK_PLAN,
    issues: [{ severity: 'warning', scope: 'ia', message: copilot.FOCUS_MISSED, nodeId: FAREWELL.id }],
    blocking: 0,
    changes: { added: 2, changed: 1, removed: 0 },
    diff: diffFlows(BASE, FIRST),
    removed: [],
    partial: false,
    rounds: 1,
    provider: 'openai',
    model: 'gpt-6.1-sol',
    effort: 'medium',
    fill: true,
    focus: FAREWELL.id,
    missed: true,
  }
  const render = (extra = {}) =>
    renderToStaticMarkup(
      React.createElement(panel.ProposalCard, { entryId: 'p1', proposal: { ...proposal, ...extra }, status: 'pending', meta: 'GPT', applyId: 'aplicar', canApply: true, canDiscard: true, onApply: () => undefined, onDiscard: () => undefined }),
    )
  let html = render()
  assert.match(html, />Edição pronta com 1 pendência</)
  assert.equal(html.split(copilot.FOCUS_MISSED).length - 1, 2)
  assert.ok(html.includes(`Enviar Mensagem · ID ${FAREWELL.id}: </span>${copilot.FOCUS_MISSED}`))
  html = render({ missed: false, issues: [] })
  assert.ok(!html.includes(copilot.FOCUS_MISSED))
  assert.match(html, />Edição pronta</)
})

test('the proposal card lists every removed component, the ones the edit listed in remove and the ones left without a path from the start', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const end = BASE.nodes.find((node) => node.id === BASE.edges.find((edge) => edge.source === FAREWELL.id).target)
  const flow = applyEdit(BASE, { name: '', description: '', nodes: [], edges: [], remove: [FAREWELL.id] }, { now: NOW }).flow
  const diff = diffFlows(BASE, flow)
  assert.deepEqual(diff.removed, [FAREWELL.id, end.id])
  const proposal = { flow, original: BASE, base: BASE, prompt: 'Remova a despedida.', issues: [], blocking: 0, changes: { added: 0, changed: 0, removed: 2 }, diff, removed: [FAREWELL, end], partial: false, rounds: 1, provider: 'openai', model: 'gpt-6.1-sol', effort: 'medium', fill: true, focus: null, missed: false }
  const html = renderToStaticMarkup(React.createElement(panel.ProposalCard, { entryId: 'p1', proposal, status: 'pending', meta: 'GPT', applyId: 'aplicar', canApply: true, canDiscard: true, onApply: () => undefined, onDiscard: () => undefined }))
  assert.ok(html.includes(`Componentes removidos: Enviar Mensagem · ID ${FAREWELL.id}, Encerrar Conversa · ID ${end.id}.`), html)
  assert.ok(!html.includes('deixarem de ser alcançados'))
})

test('the reply bar shows the full text of each suggestion in a tooltip and locks with the composer', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const panel = loadPanel()
  const chips = ['Transferir para o departamento Financeiro', 'Transferir para o departamento Comercial']
  const render = (extra = {}) =>
    renderToStaticMarkup(React.createElement(panel.Replies, { suggestions: chips, editNow: true, disabled: false, onAnswer: () => undefined, onEditNow: () => undefined, ...extra }))
  let html = render()
  assert.match(html, /role="group" aria-label="Sugestões de resposta"/)
  let buttons = markupButtons(html)
  assert.deepEqual(buttons.map((button) => button.text), [...chips, 'Editar agora'])
  assert.ok(buttons[0].attrs.includes(`title="${chips[0]}"`))
  assert.ok(buttons[1].attrs.includes(`title="${chips[1]}"`))
  assert.ok(buttons[2].attrs.includes('aria-label="Editar agora com o que já foi decidido"'))
  assert.deepEqual(buttons.map((button) => button.disabled), [false, false, false])
  buttons = markupButtons(render({ disabled: true }))
  assert.deepEqual(buttons.map((button) => button.disabled), [true, true, true])
  assert.equal(render({ suggestions: [], editNow: false }), '')
  html = render({ suggestions: [] })
  assert.doesNotMatch(html, /Sugestões de resposta/)
  assert.match(html, /Editar agora/)
})

test('chips and Editar agora lock only while the Copiloto or Gerar com IA is busy, and after a question focus never lands on an older Aplicar', async () => {
  const panel = loadPanel()
  const reply = (extra = {}) => panel.canReply({ busy: false, dialogBusy: false, ...extra })
  assert.equal(reply(), true)
  assert.equal(reply({ busy: true }), false)
  assert.equal(reply({ dialogBusy: true }), false)
  assert.equal(reply({ busy: true, dialogBusy: true }), false)

  const { store } = harness({
    turns: [edited(), asked('Qual texto você quer no boleto?', ['Quero outro texto'], 'Troque o texto do boleto.'), asked('Qual texto?', [], 'Troque o texto do boleto.')],
    outcomes: [received(FIRST)],
  })
  assert.equal(panel.landing([], null), 'prompt')
  store.send('Acrescente a opção Segunda via de boleto')
  let state = await settled(store)
  assert.equal(panel.landing(state.entries, state.pending), 'apply')
  store.send('Troque o texto do boleto')
  state = await settled(store)
  assert.ok(state.pending)
  assert.equal(panel.landing(state.entries, state.pending), 'prompt')
  store.send('Quero outro texto')
  state = await settled(store)
  assert.ok(state.pending)
  assert.equal(panel.landing(state.entries, state.pending), 'prompt')
})

test('every Copiloto turn goes to the interview with scope copilot and the proposal flag, and proposal false stays out', async () => {
  const panel = loadPanel()
  const { requestTurn } = require('../src/flow/ai/generation-client.ts')
  const settings = { provider: 'openai', model: 'gpt-6.1-sol', apiKey: ` ${KEY} `, effort: 'medium', fill: false }
  const history = [{ role: 'user', text: OPTION_REQUEST }]
  const refining = panel.copilotTurnInput({ history, flow: FIRST, proposal: true, settings })
  assert.deepEqual(refining, { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, effort: 'medium', fill: false, history, flow: FIRST, scope: 'copilot', proposal: true })
  const opened = panel.copilotTurnInput({ history, flow: BASE, proposal: false, settings })
  assert.equal(opened.scope, 'copilot')
  assert.equal(opened.proposal, false)

  const calls = []
  const engine = {
    interviewTurn: async (input, hooks) => {
      calls.push({ input, hooks })
      return { ok: true, turn: { action: 'ask', message: OPTION_QUESTION, suggestions: [], plan: '' } }
    },
  }
  const signal = new AbortController().signal
  assert.deepEqual(await requestTurn(refining, signal, engine), { ok: true, turn: { action: 'ask', message: OPTION_QUESTION, suggestions: [], plan: '' } })
  await requestTurn(opened, signal, engine)
  const { scope, proposal, ...builder } = opened
  await requestTurn(builder, signal, engine)
  assert.equal(calls[0].input.scope, 'copilot')
  assert.equal(calls[0].input.proposal, true)
  assert.equal(calls[0].input.flow, FIRST)
  assert.deepEqual(calls[0].hooks, { transport: 'browser', signal })
  assert.equal(calls[1].input.scope, 'copilot')
  assert.equal('proposal' in calls[1].input, false)
  assert.equal('scope' in calls[2].input, false)
  assert.equal(scope, 'copilot')
  assert.equal(proposal, false)
})

test('the selection texts are in PT-BR without exclamation marks or dashes', () => {
  assert.equal(copilot.PICK_PREFIX, 'Selecionei no canvas:')
  assert.equal(copilot.PICK_CANCELLED, 'Seleção cancelada. Você pode responder por texto.')
  assert.equal(copilot.PICK_LABEL, 'o componente')
  for (const text of [copilot.PICK_CANCELLED, copilot.COPILOT_TEXT.paused, copilot.COPILOT_TEXT.outdated, copilot.FOCUS_MISSED]) assert.match(text, PT_TEXT)
  const panel = loadPanel()
  assert.equal(panel.pickHint('o menu de opções', true), 'Selecione o menu de opções no canvas ou na lista e confirme.')
  assert.equal(panel.pickHint('o menu de opções', false), 'Selecione o menu de opções na lista e confirme.')
  assert.equal(panel.pickHint('o menu de opções', true, true), 'Aguarde a geração do Gerar com IA terminar para selecionar o menu de opções.')
  assert.equal(panel.pickHint('o menu de opções', false, true), 'Aguarde a geração do Gerar com IA terminar para selecionar o menu de opções.')
  for (const onCanvas of [true, false]) for (const blocked of [true, false]) assert.match(panel.pickHint(copilot.PICK_LABEL, onCanvas, blocked), PT_TEXT)
  assert.equal(copilot.pickLabel(' O menu   de opções. '), 'o menu de opções')
  assert.equal(copilot.pickLabel('Menu de Opções'), 'Menu de Opções')
  assert.equal(copilot.pickLabel(''), 'o componente')
  assert.equal(copilot.pickLabel(7), 'o componente')
  assert.ok(copilot.pickLabel('a '.repeat(80)).length <= 60)
})
