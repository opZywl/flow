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
const { importFlow, newFlow } = require('../lib/atendimento/format.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { applyEdit, diffFlows, flowToRi } = require('../lib/atendimento/ai/edit.ts')
const { previewEdit } = require('../lib/atendimento/ai/preview.ts')
const { documentKey } = require('../src/flow/ai/generation-client.ts')

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
    preview: (shown, done, fresh) => {
      env.previews.push(shown ? { flow: shown, done } : null)
      env.fresh.push(fresh)
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
    async turn(input, signal) {
      env.turns.push({ ...input, history: JSON.parse(JSON.stringify(input.history)), signal })
      const next = turns ? turns.shift() : edited()
      if (typeof next === 'function') return next({ input, signal })
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
  state = await settled(store)
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
  state = await settled(store)
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
  await tick()
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

test('an open flow with only Início blocks the request, and so does a busy Gerar com IA', () => {
  const empty = harness({ flow: newFlow(NOW) })
  assert.equal(empty.store.send('Acrescente uma pesquisa de satisfação no fim'), false)
  assert.equal(empty.env.turns.length, 0)
  assert.equal(empty.env.requests.length, 0)
  assert.deepEqual(empty.store.getState().entries, [])
  assert.equal(empty.env.previews.length, 0)
  assert.equal(empty.store.send('   '), false)

  const busy = harness()
  busy.store.setBlocked(true)
  assert.equal(busy.store.send('Acrescente uma pesquisa de satisfação no fim'), false)
  assert.equal(busy.env.turns.length, 0)
  busy.store.setBlocked(false)
  assert.equal(busy.store.send(`${'a'.repeat(8001)}`), false)
  assert.equal(busy.env.turns.length, 0)
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
  await tick()
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
  await tick()
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
  await tick()
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
    onOpenGenerate: () => undefined,
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
  assert.doesNotMatch(html, /O fluxo aberto só tem o Início/)
  assert.doesNotMatch(html, /Sugestões de resposta/)
  assert.doesNotMatch(html, /Editar agora/)
  assert.doesNotMatch(html, /[!—–]/)
  assert.equal(panel.THINKING_TEXT, 'Pensando no pedido.')
  assert.deepEqual(panel.ATTENTION_TOASTS.question, { title: 'O Copiloto tem uma pergunta', description: 'Abra o Copiloto para responder.' })
  assert.deepEqual(panel.ATTENTION_TOASTS.ready, { title: 'Edição do Copiloto pronta', description: 'Abra o Copiloto para revisar e aplicar.' })
  assert.equal(panel.ATTENTION_TOASTS.failed.variant, 'destructive')
  for (const notice of Object.values(panel.ATTENTION_TOASTS)) assert.doesNotMatch(`${notice.title} ${notice.description}`, /[!—–]/)

  const empty = renderToStaticMarkup(React.createElement(panel.default, { ...props, getCurrentFlow: () => newFlow(NOW) }))
  assert.match(empty, /O fluxo aberto só tem o Início\. Para criar um fluxo do zero, use Gerar com IA\./)
  assert.match(empty, /Abrir Gerar com IA/)
  const busy = renderToStaticMarkup(React.createElement(panel.default, { ...props, dialogBusy: true }))
  assert.match(busy, /Aguarde a geração do Gerar com IA terminar\./)
  const classes = (markup) => /<section id="copiloto" aria-label="Copiloto" class="([^"]*)"/.exec(markup)[1].split(/\s+/)
  assert.ok(classes(html).includes('flex'))
  assert.ok(!classes(html).includes('hidden'))
  assert.ok(classes(html).includes('nokey'))
  const closed = renderToStaticMarkup(React.createElement(panel.default, { ...props, open: false }))
  assert.ok(classes(closed).includes('hidden'))
  assert.ok(!classes(closed).includes('flex'))
  for (const example of panel.COPILOT_EXAMPLES) assert.doesNotMatch(example, /[!—–]/)
})
