const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const STUBS = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
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

function loadPanel() {
  const file = path.join(ROOT, 'src/flow/ai-interview.tsx')
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

const ui = loadPanel()
const PT_TEXT = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^!—–]*\.$/
const FLOW = { name: 'Boleto', description: '', service_type: 'whatsapp', created_at: '', nodes: [{ id: 'start' }, { id: 'n1' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }

function ask(message, suggestions = [], plan = '') {
  return { ok: true, turn: { action: 'ask', message, suggestions, plan } }
}

function act(action, message, plan) {
  return { ok: true, turn: { action, message, suggestions: [], plan } }
}

function harness({ turns = [], runs = [], flow = null } = {}) {
  const calls = { turn: [], run: [] }
  const state = { flow }
  const options = {
    async turn(history, current, signal) {
      calls.turn.push({ history: JSON.parse(JSON.stringify(history)), flow: current, signal })
      const next = turns.shift()
      if (typeof next === 'function') return next(signal)
      if (!next) throw new Error('turno inesperado')
      return next
    },
    async run(action, plan, signal) {
      calls.run.push({ action, plan, signal })
      const next = runs.shift()
      if (typeof next === 'function') return next(signal, state)
      if (!next) throw new Error('montagem inesperada')
      return next
    },
    getFlow: () => state.flow,
  }
  const store = ui.createInterview(() => options)
  const statuses = []
  store.subscribe(() => statuses.push(store.getState().status))
  return { store, calls, state, statuses }
}

function idle(store) {
  const busy = () => ['thinking', 'building'].includes(store.getState().status)
  if (!busy()) return Promise.resolve(store.getState())
  return new Promise((resolve) => {
    const stop = store.subscribe(() => {
      if (busy()) return
      stop()
      resolve(store.getState())
    })
  })
}

function waiting(signal) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })), { once: true })
  })
}

function text(state) {
  return state.entries.map((entry) => `${entry.role}:${entry.text}`)
}

test('perguntas em sequência, geração, nota do resultado e a pergunta seguinte', async () => {
  const { store, calls, state: env, statuses } = harness({
    turns: [
      ask('Vai ter um menu de opções? Quais opções?', ['Segunda via', 'Falar com atendente'], 'Fluxo de envio de boleto.'),
      ask('Como o cliente se identifica, por CPF ou pelo número do contrato?', ['CPF', 'Contrato'], 'Fluxo de envio de boleto com menu de segunda via e atendente.'),
      act('generate', 'Tudo certo, vou montar o fluxo.', 'Fluxo de envio de boleto com menu de segunda via e atendente, pedindo o CPF.'),
      ask('O fluxo está no canvas. Precisa de mais alguma coisa?', ['Não, está ótimo', 'Quero uma pesquisa no fim']),
    ],
    runs: [
      async (signal, env) => {
        env.flow = FLOW
        return { ok: true, components: 18 }
      },
    ],
  })

  assert.equal(store.send('   '), false)
  assert.equal(store.send('Crie um fluxo de envio de boleto'), true)
  assert.equal(store.getState().status, 'thinking')
  assert.equal(store.send('outra'), false)
  let state = await idle(store)
  assert.deepEqual(state.suggestions, ['Segunda via', 'Falar com atendente'])
  assert.equal(state.plan, 'Fluxo de envio de boleto.')
  assert.deepEqual(calls.turn[0].history, [{ role: 'user', text: 'Crie um fluxo de envio de boleto' }])
  assert.equal(calls.turn[0].flow, null)

  store.send('Segunda via e falar com atendente')
  state = await idle(store)
  assert.equal(state.suggestions.length, 2)

  store.send('CPF')
  state = await idle(store)
  assert.equal(calls.run.length, 1)
  assert.equal(calls.run[0].action, 'generate')
  assert.equal(calls.run[0].plan, 'Fluxo de envio de boleto com menu de segunda via e atendente, pedindo o CPF.')
  assert.ok(statuses.includes('building'))
  assert.equal(state.status, 'idle')
  assert.equal(state.built, true)
  assert.deepEqual(text(state).slice(-3), [
    'assistant:Tudo certo, vou montar o fluxo.',
    'system:O fluxo foi montado com 18 componentes.',
    'assistant:O fluxo está no canvas. Precisa de mais alguma coisa?',
  ])
  assert.equal(state.entries.find((entry) => entry.role === 'system').tone, 'success')
  assert.equal(state.plan, 'Fluxo de envio de boleto com menu de segunda via e atendente, pedindo o CPF.')
  assert.deepEqual(state.suggestions, ['Não, está ótimo', 'Quero uma pesquisa no fim'])

  const after = calls.turn[3]
  assert.equal(after.flow, env.flow)
  assert.deepEqual(after.history.slice(-2), [
    { role: 'user', text: 'CPF' },
    { role: 'assistant', text: 'Tudo certo, vou montar o fluxo.\n\nO fluxo foi montado com 18 componentes.' },
  ])
  for (let index = 1; index < after.history.length; index += 1) assert.notEqual(after.history[index].role, after.history[index - 1].role)
})

test('com fluxo aberto o pedido vira edição e a nota conta as mudanças', async () => {
  const { store, calls } = harness({
    flow: FLOW,
    turns: [
      ask('Onde a pesquisa entra, depois do envio do boleto?', ['Sim, no fim'], 'Adicionar uma pesquisa de satisfação no fim.'),
      act('edit', '', 'Adicionar uma pesquisa de satisfação de 1 a 5 depois do envio do boleto.'),
      ask('Precisa de mais alguma coisa?', []),
    ],
    runs: [{ ok: true, changes: { added: 2, changed: 1, removed: 0 } }],
  })
  store.send('Preciso também de uma pesquisa')
  await idle(store)
  store.send('Sim, no fim')
  const state = await idle(store)
  assert.deepEqual(calls.run.map((call) => [call.action, call.plan]), [['edit', 'Adicionar uma pesquisa de satisfação de 1 a 5 depois do envio do boleto.']])
  assert.ok(text(state).includes('system:Alterações aplicadas: 2 novos, 1 alterado.'))
  assert.equal(text(state).at(-1), 'assistant:Precisa de mais alguma coisa?')
  assert.equal(calls.turn[0].flow, FLOW)
})

test('edição sem fluxo aberto vira geração e montar agora força o plano atual', async () => {
  const { store, calls } = harness({
    turns: [
      act('edit', 'Vou montar.', 'Fluxo de boleto.'),
      ask('Mais alguma coisa?', [], 'Fluxo de boleto.'),
      ask('Quer mudar a mensagem de boas vindas?', ['Sim'], 'Fluxo de boleto com boas vindas.'),
      ask('Mais alguma coisa?', []),
    ],
    runs: [
      async (signal, env) => {
        env.flow = FLOW
        return { ok: true, components: 1 }
      },
      { ok: true, changes: { added: 0, changed: 0, removed: 0 } },
    ],
  })
  assert.equal(store.buildNow(), false)
  store.send('Boleto')
  let state = await idle(store)
  assert.equal(calls.run[0].action, 'generate')
  assert.ok(text(state).includes('system:O fluxo foi montado com 1 componente.'))
  assert.equal(store.buildNow(), true)
  state = await idle(store)
  assert.equal(calls.turn[2].history.at(-1).text, ui.BUILD_NOW_TEXT)
  assert.deepEqual([calls.run[1].action, calls.run[1].plan], ['edit', 'Fluxo de boleto com boas vindas.'])
  assert.equal(text(state).includes('assistant:Quer mudar a mensagem de boas vindas?'), false)
  assert.ok(text(state).includes('system:Nenhuma alteração foi necessária no fluxo.'))
})

test('finish encerra com a despedida e encerrar conversa fecha sem chamar a IA', async () => {
  const { store, calls } = harness({ turns: [ask('Qual o nome da empresa?', ['lucas-lima.xyz'], 'Fluxo.'), act('finish', 'Combinado, até a próxima.', '')] })
  store.send('Crie um fluxo')
  await idle(store)
  store.send('Não preciso de mais nada')
  let state = await idle(store)
  assert.equal(state.status, 'finished')
  assert.equal(text(state).at(-1), 'assistant:Combinado, até a próxima.')
  assert.deepEqual(state.suggestions, [])
  assert.equal(state.plan, 'Fluxo.')
  assert.equal(calls.run.length, 0)

  const other = harness({ turns: [ask('Quais opções?', [], 'Menu.')] })
  other.store.send('Menu')
  await idle(other.store)
  other.store.finish()
  state = other.store.getState()
  assert.equal(state.status, 'finished')
  assert.equal(text(state).at(-1), 'system:Conversa encerrada.')
  assert.equal(other.calls.turn.length, 1)
  other.store.reset()
  assert.deepEqual(other.store.getState().entries, [])
  assert.equal(other.store.getState().status, 'idle')
})

test('erro do motor aparece e tentar de novo repete o mesmo turno', async () => {
  const { store, calls } = harness({
    turns: [
      { ok: false, failure: { success: false, error: 'A chave foi recusada pelo provedor.', details: 'HTTP 401', code: 'provider_auth' } },
      ask('Quais opções o menu terá?', ['Boleto']),
    ],
  })
  assert.equal(store.retry(), false)
  store.send('Crie um fluxo de boleto')
  let state = await idle(store)
  assert.equal(state.status, 'error')
  assert.deepEqual(state.failure, { title: 'A chave foi recusada pelo provedor.', details: 'HTTP 401' })
  assert.equal(state.retryable, true)
  assert.equal(store.retry(), true)
  state = await idle(store)
  assert.equal(state.status, 'idle')
  assert.equal(state.failure, null)
  assert.deepEqual(calls.turn[1].history, calls.turn[0].history)
  assert.deepEqual(text(state), ['user:Crie um fluxo de boleto', 'assistant:Quais opções o menu terá?'])
})

test('falha na montagem permite tentar de novo só a montagem', async () => {
  const { store, calls } = harness({
    turns: [act('generate', '', 'Fluxo de boleto.'), ask('Precisa de mais alguma coisa?', [])],
    runs: [{ ok: false, error: 'O fluxo gerado não passou na validação.' }, { ok: true, components: 5 }],
  })
  store.send('Boleto')
  let state = await idle(store)
  assert.equal(state.status, 'error')
  assert.equal(state.failure.title, 'O fluxo gerado não passou na validação.')
  store.retry()
  state = await idle(store)
  assert.equal(calls.turn.length, 2)
  assert.deepEqual(calls.run.map((call) => call.plan), ['Fluxo de boleto.', 'Fluxo de boleto.'])
  assert.ok(text(state).includes('system:O fluxo foi montado com 5 componentes.'))

  const thrown = harness({ turns: [async () => { throw new Error('rede caiu') }] })
  thrown.store.send('Oi')
  state = await idle(thrown.store)
  assert.equal(state.status, 'error')
  assert.match(state.failure.title, PT_TEXT)
  assert.equal(state.failure.details, 'rede caiu')
})

test('cancelar aborta o pedido e ignora a resposta atrasada', async () => {
  let late
  const { store, calls } = harness({
    turns: [
      (signal) => {
        late = signal
        return waiting(signal)
      },
      ask('Quais opções?', []),
      act('generate', '', 'Fluxo.'),
    ],
    runs: [(signal) => waiting(signal)],
  })
  store.send('Boleto')
  assert.equal(store.getState().status, 'thinking')
  store.cancel()
  assert.equal(late.aborted, true)
  let state = store.getState()
  assert.equal(state.status, 'idle')
  assert.equal(text(state).at(-1), 'system:Pedido cancelado. Você pode escrever de novo quando quiser.')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getState().status, 'idle')

  store.send('Boleto de novo')
  await idle(store)
  store.send('Menu simples')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getState().status, 'building')
  assert.equal(store.getState().building, 'generate')
  store.cancel()
  assert.equal(calls.run[0].signal.aborted, true)
  state = store.getState()
  assert.equal(state.status, 'idle')
  assert.equal(state.building, null)
  assert.equal(text(state).at(-1), 'system:A montagem foi cancelada.')
  assert.equal(calls.turn.length, 3)
  assert.equal(store.retry(), false)
})

test('textos do painel em PT-BR sem exclamação nem travessão', () => {
  for (const status of ['thinking', 'building']) assert.match(ui.waitingText(status, 'generate'), PT_TEXT)
  assert.match(ui.waitingText('building', 'edit'), PT_TEXT)
  assert.equal(ui.waitingText('thinking', null), 'Pensando na próxima pergunta.')
  assert.equal(ui.waitingText('building', 'generate'), 'Montando o fluxo no canvas.')
  assert.equal(ui.resultNote('edit', { ok: true, changes: { added: 1, changed: 0, removed: 3 } }), 'Alterações aplicadas: 1 novo, 3 removidos.')
  assert.match(ui.resultNote('edit', { ok: true }), PT_TEXT)
  assert.match(ui.resultNote('generate', { ok: true }), PT_TEXT)
  assert.match(ui.BUILD_NOW_TEXT, PT_TEXT)
  for (const starter of ui.INTERVIEW_STARTERS) assert.match(starter, PT_TEXT)
  assert.deepEqual(ui.toHistory([
    { id: '1', role: 'assistant', text: 'a' },
    { id: '2', role: 'system', text: 'b' },
    { id: '3', role: 'user', text: ' ' },
    { id: '4', role: 'user', text: 'c' },
  ]), [{ role: 'assistant', text: 'a\n\nb' }, { role: 'user', text: 'c' }])
})

test('o painel renderiza o log acessível, as sugestões e o plano', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const noop = () => false
  const handle = {
    entries: [
      { id: 'm1', role: 'user', text: 'Crie um fluxo de envio de boleto' },
      { id: 'm2', role: 'assistant', text: 'Quais opções o menu terá?' },
      { id: 'm3', role: 'system', text: 'O fluxo foi montado com 18 componentes.', tone: 'success' },
    ],
    suggestions: ['Segunda via', 'Atendente'],
    plan: 'Fluxo de envio de boleto.',
    status: 'thinking',
    building: null,
    failure: { title: 'A IA não respondeu desta vez.' },
    retryable: true,
    built: true,
    busy: true,
    canBuild: false,
    hasFlow: false,
    send: noop, buildNow: noop, retry: noop, cancel: noop, finish: noop, reset: noop,
  }
  const html = renderToStaticMarkup(React.createElement(ui.InterviewPanel, { interview: handle }))
  assert.match(html, /role="log"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /Pensando na próxima pergunta\./)
  assert.match(html, /Segunda via/)
  assert.match(html, /Ver o plano/)
  assert.match(html, /Fluxo de envio de boleto\./)
  assert.match(html, /Tentar de novo/)
  assert.match(html, /Montar o fluxo agora/)
  assert.match(html, /Encerrar conversa/)
  assert.match(html, /Cancelar/)
  assert.doesNotMatch(html, /[!—–]/)
  const fresh = renderToStaticMarkup(React.createElement(ui.InterviewPanel, { interview: { ...handle, entries: [], suggestions: [], plan: '', status: 'idle', busy: false, failure: null, retryable: false } }))
  assert.match(fresh, /Crie um fluxo de envio de boleto\./)
  assert.doesNotMatch(fresh, /Ver o plano/)

  let seen = null
  function Probe() {
    seen = ui.useInterview({ turn: async () => ask('x'), run: async () => ({ ok: true }), getFlow: () => FLOW })
    return React.createElement(ui.InterviewPanel, { interview: seen })
  }
  const mounted = renderToStaticMarkup(React.createElement(Probe))
  assert.match(mounted, /role="log"/)
  assert.equal(seen.status, 'idle')
  assert.equal(seen.busy, false)
  assert.equal(seen.canBuild, false)
  assert.equal(seen.hasFlow, true)
  for (const name of ['send', 'buildNow', 'retry', 'cancel', 'finish', 'reset']) assert.equal(typeof seen[name], 'function')
})
