const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const runtime = require('react/jsx-runtime')

const ROOT = path.resolve(__dirname, '..')
const seen = { hosts: [], contents: [], selects: [], interviews: [], panels: [], forwarded: [] }
const record = (render) => (type, props, key) => {
  if (typeof type === 'string') seen.hosts.push({ type, props })
  return render(type, props, key)
}
const passThrough = ({ children }) => children
const forward = (name) => (...args) => {
  seen.forwarded.push([name, ...args])
  return true
}
const STUBS = {
  '@/components/ui/dialog': {
    Dialog: passThrough,
    DialogContent: (props) => {
      seen.contents.push(props)
      return props.children
    },
    DialogDescription: passThrough,
    DialogHeader: passThrough,
    DialogTitle: passThrough,
  },
  '@/hooks/use-toast': { toast: () => undefined },
  './flow-select': {
    FlowSelect: (props) => {
      seen.selects.push(props)
      return null
    },
  },
  './ai-interview': {
    InterviewPanel: (props) => {
      seen.panels.push(props)
      return null
    },
    useInterview: (options) => {
      seen.interviews.push(options)
      const state = { entries: [], suggestions: [], plan: 'Fluxo de envio de boleto.', status: 'error', building: null, failure: null, retryable: true, built: false }
      return { ...state, busy: false, canBuild: true, hasFlow: false, send: forward('send'), buildNow: forward('buildNow'), retry: forward('retry'), cancel: () => undefined, finish: () => undefined, reset: () => undefined }
    },
  },
  './nodes/atendimento-node': { categoryTint: (value) => value, componentIcon: () => () => null, nodeSummary: () => '' },
  'lucide-react': new Proxy({}, { get: () => () => null }),
  'react/jsx-runtime': { ...runtime, jsx: record(runtime.jsx), jsxs: record(runtime.jsxs) },
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
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  })
  module._compile(outputText, filename)
}

const calls = []
let provider = null
const generate = require('../app/api/generate-workflow/route.ts')
const listing = require('../app/api/ai-models/route.ts')
const { validateFlow, exportFlow, importFlow } = require('../lib/atendimento/format.ts')
const { RI_TYPES } = require('../lib/atendimento/ai/ri.ts')
const { START_ID } = require('../lib/atendimento/catalog.ts')
const { PROMPT_EXAMPLES } = require('../lib/atendimento/ai/prompt.ts')
const { evaluateRi, concludeGeneration } = require('../lib/atendimento/ai/review.ts')
const { stampExport } = require('../lib/atendimento/format.ts')
const { PROVIDERS } = require('../lib/atendimento/ai/providers.ts')
const { previewFlow } = require('../lib/atendimento/ai/preview.ts')
const settings = require('../src/flow/ai/settings-store.ts')

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const forward = (route) => route.POST(new Request(`http://localhost${url}`, { method: 'POST', headers: init.headers, body: init.body, signal: init.signal }))
  if (url === '/api/generate-workflow') {
    calls.push({ url, body: JSON.parse(init.body), headers: Object.fromEntries(new Headers(init.headers).entries()) })
    return forward(generate)
  }
  if (url === '/api/ai-models') {
    calls.push({ url, body: JSON.parse(init.body), headers: Object.fromEntries(new Headers(init.headers).entries()) })
    return forward(listing)
  }
  if (!provider) throw new Error('rede bloqueada nos testes')
  return provider(url, init)
}

afterEach(() => {
  provider = null
  calls.length = 0
  settings.resetAiSettings()
})

const client = require('../src/flow/ai/generation-client.ts')
const KEY = 'sk-test-0123456789abcdefghijklmnop'
const BASE = { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, prompt: 'Atendimento da Clínica Exemplo', size: 'auto', image: null }
const DIALOG_FIELDS = ['provider', 'apiKey', 'model', 'effort', 'mode', 'description', 'image', 'size', 'count', 'name', 'fill']
const FAILURE_CODES = ['invalid_request', 'unsupported_media', 'payload_too_large', 'invalid_key', 'forbidden', 'billing', 'model_not_found', 'rate_limit', 'provider_error', 'provider_unavailable', 'network', 'timeout', 'invalid_output', 'output_too_long', 'content_filter', 'aborted', 'unknown']
const PT_TEXT = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^!—–]*\.$/

const signal = () => new AbortController().signal
const stream = (chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } })
const ndjson = (events) => events.map((event) => `${JSON.stringify(event)}\n`).join('')

function bytesOf(text, size) {
  const bytes = new TextEncoder().encode(text)
  const parts = []
  for (let index = 0; index < bytes.length; index += size) parts.push(bytes.slice(index, index + size))
  return parts
}

function serve(body, init) {
  const previous = globalThis.fetch
  globalThis.fetch = async () => {
    globalThis.fetch = previous
    return new Response(body, init)
  }
}

function sse(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function openaiReply(text) {
  const parts = []
  for (let index = 0; index < text.length; index += 512) parts.push(text.slice(index, index + 512))
  return sse([
    { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: BASE.model } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
    ...parts.map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', delta })),
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
    { type: 'response.completed', response: { incomplete_details: null, usage: { input_tokens: 11, output_tokens: 22 } } },
  ])
}

function model(...replies) {
  let index = 0
  provider = () => {
    const reply = replies[Math.min(index++, replies.length - 1)]
    return openaiReply(typeof reply === 'string' ? reply : JSON.stringify(reply))
  }
  return () => index
}

const pair = (config) => Object.entries(config).map(([key, value]) => ({ key, value }))
const n = (id, type, config = {}) => ({ id, type, config: pair(config) })
const e = (from, output, to) => ({ from, output, to })
const options = (...items) => JSON.stringify(items.map((text) => ({ text })))

const SUCCESS = (() => {
  const outcome = concludeGeneration(evaluateRi(PROMPT_EXAMPLES[0].ri, { prompt: 'Clínica' }))
  return { success: true, workflow: stampExport(outcome.workflow), issues: outcome.issues, rounds: 1, transcript: '## Sistema', model: { provider: 'openai', id: BASE.model } }
})()

test('o cliente envia o pedido com stream true, aceita NDJSON e lê o progresso e o fluxo da rota real', async () => {
  model(PROMPT_EXAMPLES[0].ri)
  const stages = []
  const out = await client.requestGeneration(BASE, signal(), (progress) => stages.push(progress.stage))
  assert.equal(out.ok, true, JSON.stringify(out))
  const [call] = calls
  assert.deepEqual(call.body, { ...BASE, stream: true })
  assert.match(call.headers.accept, /application\/x-ndjson/)
  assert.equal(call.headers['content-type'], 'application/json')
  for (const stage of ['preparando', 'gerando', 'montando', 'validando']) assert.ok(stages.includes(stage), stage)
  assert.equal(out.received.model, BASE.model)
  assert.equal(out.received.rounds, 1)
  assert.equal(errorsOf(out.received.flow).length, 0)
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('o NDJSON partido em bytes no meio de caracteres acentuados chega inteiro', async () => {
  const text = ndjson([{ type: 'progress', progress: { stage: 'gerando', round: 1, maxRounds: 3, nodes: 2, edges: 1 } }, { type: 'result', result: SUCCESS }])
  for (const size of [1, 3, 7, 64]) {
    const progress = []
    serve(stream(bytesOf(text, size)), { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } })
    const out = await client.requestGeneration(BASE, signal(), (value) => progress.push(value))
    assert.equal(out.ok, true)
    assert.equal(out.received.flow.nodes.length, SUCCESS.workflow.nodes.length)
    assert.equal(out.received.flow.name, SUCCESS.workflow.name)
    assert.equal(progress.length, 1)
    assert.deepEqual({ ...progress[0], pending: undefined }, { stage: 'gerando', round: 1, maxRounds: 3, nodes: 2, edges: 1, pending: undefined })
  }
})

test('NDJSON sem result, com linhas inválidas ou progresso fora do contrato vira conexão interrompida', async () => {
  const progress = []
  serve(stream(bytesOf(`${ndjson([{ type: 'progress', progress: { stage: 'inventado', round: 1, maxRounds: 3 } }])}não é json\n{"type":"outro"}\n`, 5)), { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  const out = await client.requestGeneration(BASE, signal(), (value) => progress.push(value))
  assert.equal(out.ok, false)
  assert.match(out.rejection.failure.title, /interrompida/)
  assert.deepEqual(progress, [])
})

test('queda da conexão depois do progresso vira conexão interrompida, e o cancelamento continua rejeitando', async () => {
  const progress = []
  let step = 0
  const broken = new ReadableStream({
    pull(controller) {
      if (step++ === 0) controller.enqueue(new TextEncoder().encode(ndjson([{ type: 'progress', progress: { stage: 'gerando', round: 1, maxRounds: 3, nodes: 2, edges: 1 } }])))
      else controller.error(new TypeError('network error'))
    },
  })
  serve(broken, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  const out = await client.requestGeneration(BASE, signal(), (value) => progress.push(value))
  assert.equal(out.ok, false)
  assert.equal(out.rejection.failure.title, 'A conexão foi interrompida antes do fim da geração.')
  assert.equal(progress.length, 1)

  const controller = new AbortController()
  const cancelled = new ReadableStream({
    pull(stream) {
      controller.abort()
      stream.error(new DOMException('Aborted', 'AbortError'))
    },
  })
  serve(cancelled, { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  await assert.rejects(client.requestGeneration(BASE, controller.signal, () => {}))
})

test('falhas da rota chegam com código e campo do diálogo, em NDJSON e em JSON', async () => {
  serve(ndjson([{ type: 'result', result: { success: false, code: 'invalid_key', error: 'A chave da API foi recusada.', details: 'Confira a chave.' } }]), { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  let out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.rejection.code, 'invalid_key')
  assert.equal(out.rejection.failure.details, 'Confira a chave.')
  const fields = { provider: 'provider', model: 'model', apiKey: 'apiKey', prompt: 'description', image: 'image', size: 'size', count: 'count', name: 'name', effort: 'effort', mode: 'mode', base: 'mode', fill: 'fill' }
  for (const [sent, shown] of Object.entries(fields)) {
    serve(JSON.stringify({ success: false, code: 'invalid_request', error: 'Campo inválido.', field: sent }), { status: 400, headers: { 'content-type': 'application/json' } })
    out = await client.requestGeneration(BASE, signal(), () => {})
    assert.equal(out.rejection.field, shown)
    assert.ok(DIALOG_FIELDS.includes(out.rejection.field))
  }
  serve(JSON.stringify(SUCCESS), { status: 200, headers: { 'content-type': 'application/json' } })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, true)
  serve('<html>erro</html>', { status: 502, headers: { 'content-type': 'text/html' } })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.match(`${out.rejection.failure.title} ${out.rejection.failure.details ?? ''}`, /502|servidor|provedor/i)
  serve('', { status: 413 })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.match(out.rejection.failure.title, /grande/)
  serve(JSON.stringify({ success: true, workflow: { nodes: 'x' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.rejection.code, 'invalid_output')
})

test('as falhas reais da rota seguem o contrato: código conhecido, campo do pedido e texto em PT-BR', async () => {
  const cases = [
    [{ ...BASE, size: 'custom', count: 1 }, 'count'],
    [{ ...BASE, provider: 'outro' }, 'provider'],
    [{ ...BASE, apiKey: '' }, 'apiKey'],
    [{ ...BASE, prompt: '' }, 'description'],
    [{ ...BASE, model: 'modelo inválido/../x' }, 'model'],
  ]
  for (const [request, field] of cases) {
    const out = await client.requestGeneration(request, signal(), () => {})
    assert.equal(out.ok, false)
    assert.ok(FAILURE_CODES.includes(out.rejection.code), out.rejection.code)
    assert.equal(out.rejection.field, field)
    assert.match(out.rejection.failure.title, PT_TEXT)
  }
  provider = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  const out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.rejection.code, 'invalid_key')
  assert.match(out.rejection.failure.title, PT_TEXT)
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('a busca de modelos envia provedor e chave e filtra ids fora do contrato', async () => {
  serve(JSON.stringify({ models: [{ id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', vision: true }, { id: 'bad/id', name: 'x' }, { id: 'gpt-6.1-sol', name: 'repetido' }, { id: 'o3-mini' }, 'x'] }), { status: 200, headers: { 'content-type': 'application/json' } })
  let out = await client.requestModels('openai', KEY, signal())
  assert.deepEqual(out, { ok: true, models: [{ id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', vision: true }, { id: 'o3-mini', name: 'o3-mini' }] })
  serve(JSON.stringify({ error: 'A chave da API foi recusada.', code: 'invalid_key', field: 'apiKey' }), { status: 401, headers: { 'content-type': 'application/json' } })
  out = await client.requestModels('openai', KEY, signal())
  assert.deepEqual(out, { ok: false, error: 'A chave da API foi recusada.', details: undefined })
  serve('<html></html>', { status: 500 })
  out = await client.requestModels('openai', KEY, signal())
  assert.equal(out.ok, false)
  assert.match(out.details, /500/)
  provider = () => new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol', object: 'model' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  out = await client.requestModels('openai', KEY, signal())
  assert.deepEqual(calls[0].body, { provider: 'openai', apiKey: KEY })
  assert.equal(out.ok, true)
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('os textos de progresso seguem as etapas do contrato', () => {
  assert.equal(client.progressText({ stage: 'gerando', round: 2, maxRounds: 3, nodes: 1, edges: 0 }), 'Gerando o fluxo, rodada 2 de 3: 1 componente e 0 conexões.')
  assert.equal(client.stageText({ stage: 'corrigindo', round: 2, maxRounds: 3, pending: 1 }), 'Corrigindo 1 pendência, rodada 2 de 3.')
  for (const stage of ['preparando', 'gerando', 'montando', 'validando', 'corrigindo']) assert.match(client.stageText({ stage, round: 1, maxRounds: 3 }), PT_TEXT)
  assert.equal(client.readProgress({ stage: 'gerando', round: 1, maxRounds: 3 })?.stage, 'gerando')
  assert.equal(client.readProgress({ stage: 'outro', round: 1, maxRounds: 3 }), null)
})

const errorsOf = (flow) => validateFlow(flow).filter((issue) => issue.severity === 'error')

const MENU_TIME = {
  name: 'Atendimento com horário',
  description: 'Menu dentro do horário comercial',
  nodes: [
    n('horario', 'timeConditions', { timeRules: JSON.stringify([{ weekDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '08:00', endTime: '18:00' }, { weekDays: ['saturday'], startTime: '08:00', endTime: '12:00' }]) }),
    n('fora', 'envio_pergunta', { template: 'Estamos fora do horário. Voltamos às 8h.' }),
    n('fim_fora', 'finalizar'),
    n('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: options('Financeiro', 'Suporte', 'Comercial') }),
    n('fin', 'departamentos', { name: 'Financeiro' }),
    n('sup', 'departamentos', { name: 'Suporte' }),
    n('com', 'departamentos', { name: 'Comercial' }),
  ],
  edges: [e('inicio', '', 'horario'), e('horario', 'Dentro do horário', 'menu'), e('horario', 'Fora do horário', 'fora'), e('fora', '', 'fim_fora'), e('menu', 'Financeiro', 'fin'), e('menu', 'Suporte', 'sup'), e('menu', 'Comercial', 'com')],
}
const SCHEDULE = {
  name: 'Agendamento de consultas',
  description: 'Agenda pelo WhatsApp',
  nodes: [
    n('oi', 'envio_pergunta', { template: 'Olá, #NAME. Vamos agendar sua consulta.' }),
    n('ident', 'apptIdentify'),
    n('serv', 'apptService', { headerMessage: 'Escolha o serviço.', emptyMessage: 'Sem serviços.' }),
    n('local', 'apptLocation', { headerMessage: 'Escolha a unidade.', emptyMessage: 'Sem unidades.' }),
    n('prof', 'apptProvider', { headerMessage: 'Escolha o profissional.', emptyMessage: 'Sem profissionais.' }),
    n('slot', 'apptSlot', { headerMessage: 'Escolha o horário.', emptyMessage: 'Sem horários.' }),
    n('dados', 'apptCustomerIntake', { askEmail: 'sim' }),
    n('book', 'apptBook', { successMessage: 'Consulta marcada.', conflictMessage: 'Horário ocupado.', errorMessage: 'Falha ao agendar.' }),
    n('fim', 'finalizar'),
  ],
  edges: [e('inicio', '', 'oi'), e('oi', '', 'ident'), e('ident', '1', 'serv'), e('serv', '1', 'local'), e('local', '1', 'prof'), e('prof', '1', 'slot'), e('slot', '1', 'dados'), e('dados', '1', 'book'), e('book', 'Agendado', 'fim')],
}
const TICKETS = {
  name: 'Chamados',
  nodes: [
    n('menu', 'envio_mensagem', { title: 'Suporte técnico', options: options('Abrir chamado', 'Consultar chamados') }),
    n('abrir', 'ticketCreate', { fallbackQuestion: 'Descreva o problema.', successMessage: 'Chamado {{ticketNumber}} aberto: {{link}}', errorMessage: 'Falha ao abrir.' }),
    n('lista', 'ticketLookup', { headerMessage: 'Seus chamados.', emptyMessage: 'Nenhum chamado.' }),
    n('det', 'ticketDetail', { notFoundMessage: 'Não encontrado.', actionPrompt: 'Escolha uma ação.', commentPrompt: 'Escreva o comentário.' }),
    n('volta', 'voltar', { targetNodeId: 'menu' }),
    n('fim', 'finalizar'),
  ],
  edges: [e('inicio', '', 'menu'), e('menu', 'Abrir chamado', 'abrir'), e('menu', 'Consultar chamados', 'lista'), e('lista', 'Chamado escolhido', 'det'), e('det', 'Encontrado', 'volta'), e('abrir', 'Chamado aberto', 'fim')],
}
const BILLING = {
  name: 'Cobrança',
  nodes: [
    n('cpf', 'solicitar_dados', { text: 'Informe seu CPF.', error: 'CPF inválido.', channel: 'Outro', tentativas: '3', url_api: 'https://api.exemplo.com.br/cliente', body_value: '{"cpf":"{{input}}"}' }),
    n('bol', 'envio_boletos', { channel: 'Enviar todos', text: 'Seus boletos.', url_list: 'https://api.exemplo.com.br/boletos', url_send: 'https://api.exemplo.com.br/boletos/envio' }),
    n('pix', 'pixCharge', { templateName: 'cobranca_pix' }),
    n('fim', 'finalizar'),
    n('humano', 'departamentos', { name: 'Cobrança' }),
  ],
  edges: [e('inicio', '', 'cpf'), e('cpf', '1', 'bol'), e('cpf', '2', 'humano'), e('bol', '1', 'pix'), e('pix', '1', 'fim')],
}
const CRM = {
  name: 'Captação no CRM',
  nodes: [
    n('id', 'crmIdentify'),
    n('contato', 'crmContact', { successMessage: 'Contato salvo.', errorMessage: 'Falha ao salvar.' }),
    n('lead', 'crmLead', { successMessage: 'Lead registrado.', errorMessage: 'Falha no lead.' }),
    n('upd', 'crmLeadUpdate', { setStatus: 'qualificado' }),
    n('ativ', 'crmActivity', { title: 'Ligar para o cliente', dueInDays: '2' }),
    n('seq', 'sequenceEnroll', { sequenceName: 'Nutrição' }),
    n('fim', 'finalizar'),
  ],
  edges: [e('inicio', '', 'id'), e('id', '1', 'contato'), e('contato', '1', 'lead'), e('lead', '1', 'upd'), e('upd', '1', 'ativ'), e('ativ', '1', 'seq'), e('seq', '1', 'fim')],
}
const AGENT = {
  name: 'Agente de IA',
  nodes: [
    n('ia', 'aiAgentBlock', { generativeAiName: 'Assistente', exits: JSON.stringify([{ name: 'Resolvido', when: 'Quando resolver' }, { name: 'Quer humano', when: 'Quando pedir atendente' }]) }),
    n('fim', 'finalizar'),
    n('hum', 'departamentos', { name: 'Atendimento' }),
    n('gpt', 'OpenAI', { 'df-OpenAI': 'ChatGPT' }),
  ],
  edges: [e('inicio', '', 'ia'), e('ia', 'Resolvido', 'fim'), e('ia', 'Quer humano', 'hum'), e('ia', 'Sem conclusão', 'gpt')],
}
const ALL_TYPES = (() => {
  const types = RI_TYPES.filter((type) => !['trigger_message', 'note'].includes(type))
  const nodes = types.map((type, index) => n(`c${index + 1}`, type))
  const edges = [e('inicio', '', 'c1'), ...types.slice(1).map((_, index) => e(`c${index + 1}`, '1', `c${index + 2}`))]
  return { name: 'Todos os componentes', nodes: [...nodes, n('nota', 'note', { text: 'Revisar.' })], edges }
})()

const twelve = Array.from({ length: 12 }, (_, index) => `Opção ${index + 1}`)
const LLM_MISTAKES = {
  'campo com tipo errado': {
    name: 'Tipos errados',
    nodes: [
      { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: '' }, { key: 'options', value: '[{"a":1},{"text":""}]' }] },
      n('wait', 'waiting_time', { waiting_time: 'cinco minutos' }),
      n('cond', 'condicional_api', { condition: 'maior', value: 'true' }),
      n('proto', 'protocolo', { opt: 'qualquer' }),
      n('hora', 'timeConditions', { timeRules: 'segunda a sexta 25h às 8h' }),
      n('sorteio', 'randomizer', { paths: 'x' }),
      n('agente', 'aiAgentBlock', { exits: '[{"a":1}]' }),
      n('msg', 'envio_pergunta', { template: '' }),
      n('fim', 'finalizar'),
    ],
    edges: [e('inicio', '', 'menu'), e('menu', '1', 'wait'), e('menu', '2', 'cond'), e('wait', '', 'proto'), e('cond', '0', 'hora'), e('proto', '', 'sorteio'), e('sorteio', '1', 'agente'), e('agente', '1', 'msg'), e('msg', '', 'fim')],
  },
  'saída fora do intervalo': { ...MENU_TIME, edges: [...MENU_TIME.edges.filter((edge) => edge.from !== 'menu' && edge.from !== 'horario'), e('horario', '0', 'menu'), e('horario', '9', 'fora'), e('menu', '5', 'fin'), e('menu', '-1', 'sup'), e('menu', 'Inexistente', 'com')] },
  'ligação para id inexistente': { ...SCHEDULE, edges: [...SCHEDULE.edges, e('book', 'Não agendado', 'nao_existe'), e('fantasma', '', 'fim'), e('slot', '2', 'menu_principal')] },
  'nó solto e ilha sem início': { ...BILLING, nodes: [...BILLING.nodes, n('solto', 'envio_pergunta', { template: 'Mensagem perdida.' }), n('solto2', 'tags', { tags: 'VIP' }), n('sozinho', 'departamentos', { name: 'Ninguém' })], edges: [...BILLING.edges.filter((edge) => edge.to !== 'pix'), e('solto', '', 'solto2'), e('solto2', '', 'pix')] },
  'menu com 12 opções': { name: 'Menu grande', nodes: [n('menu', 'envio_mensagem', { title: 'Escolha', options: options(...twelve) }), ...twelve.map((_, index) => n(`d${index + 1}`, 'departamentos', { name: `Equipe ${index + 1}` }))], edges: [e('inicio', '', 'menu'), ...twelve.map((text, index) => e('menu', text, `d${index + 1}`))] },
  'resposta em cerca de código': '```json\n' + JSON.stringify(TICKETS) + '\n```',
  'valores fora de texto e config em mapa': JSON.stringify({ name: 'Mapa', nodes: [{ id: 'espera', type: 'WAITING_TIME', config: { waiting_time: 5 } }, { id: 'menu', type: 'Menu de Opções', config: { title: 'Escolha', options: ['A', 'B'], buttons: false } }], edges: [{ source: 'inicio', target: 'espera' }, { source: 'espera', sourceHandle: 1, target: 'menu' }] }),
}

async function generateFrom(...replies) {
  model(...replies)
  return client.requestGeneration(BASE, signal(), () => {})
}

function assertImportable(out, label) {
  assert.equal(out.ok, true, `${label}: ${JSON.stringify(out.ok ? '' : out.rejection)}`)
  const flow = out.received.flow
  assert.deepEqual(errorsOf(flow).map((issue) => issue.message), [], label)
  const file = exportFlow(flow)
  assert.deepEqual(errorsOf(importFlow(JSON.parse(file))), [], label)
  for (const issue of out.received.issues) assert.ok(!/[!—–]/.test(issue.message), `${label}: ${issue.message}`)
  return flow
}

for (const [label, ri] of Object.entries({ 'menu com horário': MENU_TIME, agendamento: SCHEDULE, chamados: TICKETS, cobrança: BILLING, CRM, 'agente de IA': AGENT, 'os 62 tipos': ALL_TYPES })) {
  test(`cenário realista com modelo simulado: ${label}`, async () => {
    const flow = assertImportable(await generateFrom(ri), label)
    const expected = ri.nodes.length
    assert.ok(flow.nodes.length >= expected, `${label}: ${flow.nodes.length} < ${expected}`)
  })
}

test('os 62 tipos aparecem no fluxo gerado', async () => {
  const flow = assertImportable(await generateFrom(ALL_TYPES), '62 tipos')
  const types = new Set(flow.nodes.map((node) => node.data.type))
  for (const type of RI_TYPES) assert.ok(types.has(type), type)
})

for (const [label, ri] of Object.entries(LLM_MISTAKES)) {
  test(`erro típico de LLM vira fluxo válido: ${label}`, async () => {
    const used = model(ri)
    const out = await client.requestGeneration(BASE, signal(), () => {})
    assertImportable(out, label)
    assert.ok(used() >= 1)
  })
}

test('RI vazia em todas as rodadas vira erro no campo da descrição', async () => {
  const used = model({ name: '', description: '', nodes: [], edges: [] })
  const out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.equal(out.rejection.code, 'invalid_output')
  assert.equal(out.rejection.field, 'description')
  assert.equal(out.rejection.failure.title, 'O modelo não gerou nenhum componente para esta descrição.')
  assert.match(out.rejection.failure.title, PT_TEXT)
  assert.ok(used() >= 1 && used() <= 3)
})

test('RI vazia seguida de uma correção completa entrega o fluxo completo', async () => {
  const used = model({ name: '', description: '', nodes: [], edges: [] }, TICKETS)
  const flow = assertImportable(await client.requestGeneration(BASE, signal(), () => {}), 'RI vazia e correção')
  assert.ok(flow.nodes.length >= TICKETS.nodes.length)
  assert.ok(used() >= 2)
})

test('o menu com 12 opções fica com 10 e avisa as descartadas', async () => {
  const out = await generateFrom(LLM_MISTAKES['menu com 12 opções'])
  const menu = out.received.flow.nodes.find((node) => node.data.type === 'envio_mensagem')
  assert.equal(menu.data.data['text-10'], 'Opção 10')
  assert.equal(menu.data.data['text-11'], undefined)
  assert.ok(out.received.issues.some((issue) => /até 10 opções/.test(issue.message)))
})

test('o componente fora do início perde as conexões e o aviso pede para ligar no editor', async () => {
  const out = await generateFrom(LLM_MISTAKES['nó solto e ilha sem início'])
  const flow = out.received.flow
  const reachable = new Set([START_ID])
  for (let grew = true; grew;) {
    grew = false
    for (const edge of flow.edges) if (reachable.has(edge.source) && !reachable.has(edge.target)) grew = reachable.add(edge.target)
  }
  for (const edge of flow.edges) assert.ok(reachable.has(edge.source), edge.source)
  assert.ok(out.received.issues.some((issue) => issue.scope === 'ajuste' && /não é alcançado a partir do início/.test(issue.message)))
})

test('campos obrigatórios vazios recebem texto provisório e aviso de revisão', async () => {
  const out = await generateFrom(LLM_MISTAKES['campo com tipo errado'])
  const flow = out.received.flow
  const menu = flow.nodes.find((node) => node.data.type === 'envio_mensagem')
  assert.equal(menu.data.data.title, 'Escolha uma opção.')
  assert.equal(menu.data.data['text-1'], 'Opção 1')
  const paths = flow.nodes.find((node) => node.data.type === 'randomizer').data.data.paths
  assert.ok(Array.isArray(paths) && paths.length >= 2)
  assert.ok(out.received.issues.some((issue) => issue.scope === 'ajuste' && /^Preenchido com texto provisório: /.test(issue.message)))
  assert.ok(out.received.issues.some((issue) => /cinco minutos/.test(issue.message)))
})

test('tipo inexistente pede a RI de novo e segue quando a correção chega', async () => {
  const wrong = { ...MENU_TIME, nodes: [...MENU_TIME.nodes, n('x', 'enviar_whatsapp', { text: 'oi' })], edges: [...MENU_TIME.edges] }
  const used = model(wrong, MENU_TIME)
  const out = await client.requestGeneration(BASE, signal(), () => {})
  assertImportable(out, 'tipo inexistente corrigido')
  assert.equal(used(), 2)
  assert.equal(out.received.rounds, 2)
})

test('tipo inexistente em todas as rodadas e resposta cortada viram erro claro em PT-BR', async () => {
  const wrong = { ...MENU_TIME, nodes: [...MENU_TIME.nodes, n('x', 'enviar_whatsapp', { text: 'oi' })] }
  for (const reply of [wrong, JSON.stringify(SCHEDULE).slice(0, 300), 'Não consigo gerar esse fluxo.']) {
    const used = model(reply)
    const out = await client.requestGeneration(BASE, signal(), () => {})
    assert.equal(out.ok, false)
    assert.equal(out.rejection.code, 'invalid_output')
    assert.match(out.rejection.failure.title, PT_TEXT)
    assert.ok(used() >= 1 && used() <= 3)
  }
})

test('nomes de tipo por rótulo e caixa trocada são aceitos sem nova rodada', async () => {
  const ri = { ...AGENT, nodes: AGENT.nodes.map((node) => (node.type === 'finalizar' ? { ...node, type: 'Encerrar Conversa' } : node.type === 'departamentos' ? { ...node, type: 'DEPARTAMENTOS' } : node)) }
  const used = model(JSON.stringify(ri))
  const out = await client.requestGeneration(BASE, signal(), () => {})
  assertImportable(out, 'rótulos')
  assert.ok(used() >= 1)
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function watchProvider() {
  const seen = []
  const inner = provider
  provider = (url, init) => {
    seen.push({ url, body: JSON.parse(init.body), headers: Object.fromEntries(new Headers(init.headers).entries()) })
    return inner(url, init)
  }
  return seen
}

test('a geração roda direto no navegador com o provedor simulado, sem passar pela rota', async () => {
  model(TICKETS)
  const seen = watchProvider()
  const stages = []
  const partials = []
  const out = await client.generateFlow({ ...BASE, effort: 'high' }, signal(), (progress) => stages.push(progress.stage), (ri) => partials.push(ri))
  assertImportable(out, 'geração direta')
  assert.equal(calls.length, 0)
  assert.ok(seen.length >= 1 && seen.length <= 3)
  for (const call of seen) assert.equal(call.url, 'https://api.openai.com/v1/responses')
  for (const call of seen) assert.equal(call.body.reasoning?.effort, 'high')
  assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`)
  assert.equal(seen[0].body.model, BASE.model)
  for (const stage of ['preparando', 'gerando', 'montando', 'validando']) assert.ok(stages.includes(stage), stage)
  assert.ok(partials.length >= 1)
  assert.equal(out.received.model, BASE.model)
  assert.equal(out.received.partial, false)
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('o esforço escolhido vai no corpo da requisição direta e da rota, e o padrão é equilibrado', async () => {
  for (const [effort, expected] of [['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['max', 'max'], [undefined, 'medium']]) {
    model(TICKETS)
    const seen = watchProvider()
    const request = effort ? { ...BASE, effort } : BASE
    const out = await client.generateFlow(request, signal(), () => {})
    assert.equal(out.ok, true, String(effort))
    assert.equal(seen[0].body.reasoning?.effort, expected, String(effort))
    provider = null
  }
  model(TICKETS)
  const out = await client.requestGeneration({ ...BASE, effort: 'max' }, signal(), () => {})
  assert.equal(out.ok, true)
  assert.equal(calls[0].body.effort, 'max')
})

test('a rota vira reserva quando o fetch direto falha antes de qualquer resposta', async () => {
  let direct = 0
  let served = 0
  provider = () => {
    if (direct === 0) {
      direct++
      throw new TypeError('Failed to fetch')
    }
    served++
    return openaiReply(JSON.stringify(TICKETS))
  }
  const stages = []
  const out = await client.generateFlow({ ...BASE, effort: 'high' }, signal(), (progress) => stages.push(progress.stage))
  assertImportable(out, 'reserva pela rota')
  assert.equal(direct, 1)
  assert.ok(served >= 1 && served <= 3)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generate-workflow')
  assert.deepEqual(calls[0].body, { ...BASE, effort: 'high', stream: true })
  assert.ok(stages.includes('gerando'))
})

test('sem o motor no navegador a geração usa a rota, e uma recusa do provedor não aciona a reserva', async () => {
  model(TICKETS)
  let out = await client.generateFlow(BASE, signal(), () => {}, undefined, null)
  assert.equal(out.ok, true)
  assert.equal(calls.length, 1)
  calls.length = 0
  provider = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  out = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.equal(out.rejection.code, 'invalid_key')
  assert.equal(calls.length, 0)
  assert.equal(JSON.stringify(out).includes(KEY), false)
  provider = () => {
    throw new TypeError('Failed to fetch')
  }
  out = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.equal(out.rejection.code, 'network')
  assert.equal(calls.length, 1)
  assert.match(out.rejection.failure.title, PT_TEXT)
})

test('o cancelamento da geração direta não chama a rota', async () => {
  const controller = new AbortController()
  provider = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    setTimeout(() => controller.abort(), 5)
  })
  const out = await client.generateFlow(BASE, controller.signal, () => {})
  assert.equal(out.ok, false)
  assert.equal(out.rejection.code, 'aborted')
  assert.equal(calls.length, 0)
})

test('a prévia acompanha o streaming: RI parcial vira fluxo no canvas, no máximo a cada intervalo', async () => {
  model(ALL_TYPES)
  const partials = []
  const out = await client.generateFlow(BASE, signal(), () => {}, (ri) => partials.push(ri))
  assert.equal(out.ok, true)
  assert.ok(partials.length >= 3, String(partials.length))
  const flows = partials.map((ri) => previewFlow(ri)).filter(Boolean)
  assert.ok(flows.length >= 2)
  const sizes = flows.map((flow) => flow.nodes.length)
  assert.ok(sizes[sizes.length - 1] > sizes[0], sizes.join(','))
  assert.ok(sizes[sizes.length - 1] >= ALL_TYPES.nodes.length)

  const sent = []
  const feed = client.previewFeed(previewFlow, (flow) => sent.push(flow), 600)
  for (const ri of partials) feed.push(ri)
  await sleep(15)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].nodes.length, sizes[sizes.length - 1])
  feed.push(partials[0])
  feed.push(partials[partials.length - 2])
  await sleep(10)
  assert.equal(sent.length, 1)
  await sleep(700)
  assert.equal(sent.length, 2)
  feed.push(partials[partials.length - 1])
  feed.stop()
  await sleep(700)
  assert.equal(sent.length, 2)
})

test('a prévia ignora RI sem componentes e falhas da montagem', async () => {
  const sent = []
  let feed = client.previewFeed(previewFlow, (flow) => sent.push(flow), 0)
  feed.push({ name: 'x', nodes: [], edges: [] })
  feed.push(null)
  await sleep(5)
  feed.push({ nodes: [{ id: 'a', type: 'tipo_incompl' }] })
  await sleep(5)
  assert.equal(sent.length, 0)
  feed = client.previewFeed(() => {
    throw new Error('falhou')
  }, (flow) => sent.push(flow), 0)
  feed.push(TICKETS)
  await sleep(5)
  assert.equal(sent.length, 0)
})

test('o resultado parcial chega marcado para o diálogo avisar e permitir importar', () => {
  const out = client.readOutcome({ ...SUCCESS, partial: true }, 200)
  assert.equal(out.ok, true)
  assert.equal(out.received.partial, true)
  assert.equal(client.readOutcome(SUCCESS, 200).received.partial, false)
  assert.equal(client.stageText({ stage: 'corrigindo', round: 2, maxRounds: 3, resumed: true }), 'Retomando a geração interrompida, rodada 2 de 3.')
  assert.equal(client.readProgress({ stage: 'corrigindo', round: 2, maxRounds: 3, resumed: true }).resumed, true)
  assert.equal(client.readProgress({ stage: 'corrigindo', round: 2, maxRounds: 3 }).resumed, undefined)
})

test('o GPT-6 Luna aparece nas opções de modelo da OpenAI', () => {
  const openai = PROVIDERS.find((entry) => entry.id === 'openai')
  const options = client.modelChoices(openai, 'gpt-6.1-sol')
  const luna = options.find((option) => option.value === 'gpt-6-luna')
  assert.deepEqual(luna, { value: 'gpt-6-luna', label: 'GPT-6 Luna (o mais rápido)', group: 'Recomendados' })
  assert.deepEqual(options.map((option) => option.value), ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'])
  const listed = client.modelChoices(openai, 'gpt-6-luna', [{ id: 'gpt-6-luna', name: 'GPT-6 Luna' }, { id: 'o3-mini', name: 'o3-mini' }])
  assert.equal(listed.find((option) => option.value === 'gpt-6-luna').label, 'GPT-6 Luna (o mais rápido)')
  assert.equal(listed.find((option) => option.value === 'gpt-6.1-sol').label, 'GPT-6.1 Sol (não encontrado na conta)')
  assert.deepEqual(client.modelChoices(openai, 'modelo-x').slice(0, 1), [{ value: 'modelo-x', label: 'modelo-x' }])
})

test('o seletor de esforço usa as opções do modelo e se ajusta ao trocar de modelo', () => {
  assert.deepEqual(client.effortChoices('openai', 'gpt-6-luna'), [
    { value: 'low', label: 'Rápido' },
    { value: 'medium', label: 'Equilibrado' },
    { value: 'high', label: 'Alto' },
    { value: 'max', label: 'Máximo' },
  ])
  assert.deepEqual(client.effortChoices('google', 'gemini-3.8-flash').map((option) => option.value), ['low', 'medium', 'high'])
  for (const provider of PROVIDERS) {
    for (const preset of provider.presets) {
      const values = client.effortChoices(provider.id, preset.id).map((option) => option.value)
      assert.equal(client.pickEffort(null, provider.id, preset.id), 'medium', preset.id)
      for (const choice of ['low', 'medium', 'high', 'max']) assert.ok(values.includes(client.pickEffort(choice, provider.id, preset.id)), `${preset.id} ${choice}`)
    }
  }
  assert.equal(client.pickEffort('max', 'google', 'gemini-3.8-flash'), 'high')
  assert.equal(client.pickEffort('max', 'openai', 'gpt-6-luna'), 'max')
  assert.equal(client.pickEffort('low', 'google', 'gemini-3.1-pro-preview'), 'low')
  assert.equal(client.pickEffort('max', 'anthropic', 'modelo-da-conta'), 'max')
})

const EDIT_BASE = importFlow(SUCCESS.workflow)
const EDITED = EDIT_BASE.nodes.find((node) => node.data.type === 'envio_pergunta')
const EDITED_TEXT = 'Olá, #NAME. Esta é a nova mensagem de boas-vindas.'
const EDIT_DELTA = { name: '', description: '', nodes: [{ id: EDITED.id, type: 'envio_pergunta', config: [{ key: 'template', value: EDITED_TEXT }] }], edges: [] }
const EDIT_REQUEST = { ...BASE, prompt: 'Troque a mensagem de boas-vindas.', effort: 'medium', fill: false, mode: 'edit', base: EDIT_BASE }

function captureEngine(reply) {
  const engine = {
    inputs: [],
    runGeneration: async (input) => {
      engine.inputs.push(input)
      return reply
    },
    previewFlow: () => null,
    previewEdit: () => null,
    diffFlows: () => ({ added: [], changed: [], removed: [] }),
  }
  return engine
}

test('o pedido de edição leva mode, base e fill ao motor do navegador, e o pedido novo leva só fill', async () => {
  for (const fill of [true, false]) {
    const engine = captureEngine({ ...SUCCESS, mode: 'edit', changes: { added: 1, changed: 2, removed: 3 } })
    const out = await client.generateFlow({ ...EDIT_REQUEST, fill }, signal(), () => {}, undefined, engine)
    assert.equal(out.ok, true)
    assert.equal(engine.inputs.length, 1)
    assert.equal(engine.inputs[0].mode, 'edit')
    assert.equal(engine.inputs[0].base, EDIT_BASE)
    assert.equal(engine.inputs[0].fill, fill)
    assert.equal(out.received.mode, 'edit')
    assert.deepEqual(out.received.changes, { added: 1, changed: 2, removed: 3 })
  }
  for (const fill of [true, false]) {
    const engine = captureEngine(SUCCESS)
    const out = await client.generateFlow({ ...BASE, fill }, signal(), () => {}, undefined, engine)
    assert.equal(out.ok, true)
    assert.equal(engine.inputs[0].fill, fill)
    assert.equal('mode' in engine.inputs[0], false)
    assert.equal('base' in engine.inputs[0], false)
    assert.equal(out.received.mode, 'create')
    assert.equal(out.received.changes, undefined)
  }
})

test('a edição roda no navegador com o provedor simulado e devolve o fluxo aberto com a mudança', async () => {
  model(EDIT_DELTA)
  const seen = watchProvider()
  const out = await client.generateFlow(EDIT_REQUEST, signal(), () => {})
  assert.equal(out.ok, true, JSON.stringify(out.ok ? '' : out.rejection))
  assert.equal(calls.length, 0)
  assert.ok(seen.length >= 1)
  assert.match(JSON.stringify(seen[0].body), /Modo de edição/)
  assert.equal(out.received.mode, 'edit')
  assert.deepEqual(out.received.changes, { added: 0, changed: 1, removed: 0 })
  const edited = out.received.flow.nodes.find((node) => node.id === EDITED.id)
  assert.equal(edited.data.data.template, EDITED_TEXT)
  assert.deepEqual(edited.position, EDITED.position)
  for (const node of EDIT_BASE.nodes) {
    if (node.id === EDITED.id) continue
    assert.equal(JSON.stringify(out.received.flow.nodes.find((entry) => entry.id === node.id)), JSON.stringify(node), node.id)
  }
  assert.deepEqual(out.received.flow.edges, EDIT_BASE.edges)
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('a rota de reserva recebe mode, base e fill no corpo do pedido de edição', async () => {
  let direct = 0
  provider = () => {
    if (direct++ === 0) throw new TypeError('Failed to fetch')
    return openaiReply(JSON.stringify(EDIT_DELTA))
  }
  const out = await client.generateFlow(EDIT_REQUEST, signal(), () => {})
  assert.equal(out.ok, true, JSON.stringify(out.ok ? '' : out.rejection))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/generate-workflow')
  assert.deepEqual(calls[0].body, { ...JSON.parse(JSON.stringify(EDIT_REQUEST)), stream: true })
  assert.equal(calls[0].body.mode, 'edit')
  assert.equal(calls[0].body.fill, false)
  assert.deepEqual(calls[0].body.base, JSON.parse(JSON.stringify(EDIT_BASE)))
  assert.equal(out.received.mode, 'edit')
  assert.deepEqual(out.received.changes, { added: 0, changed: 1, removed: 0 })
  assert.equal(JSON.stringify(out).includes(KEY), false)
})

test('as mudanças lidas da resposta ignoram valores fora do contrato', () => {
  assert.deepEqual(client.readOutcome({ ...SUCCESS, mode: 'edit', changes: { added: 2, changed: -1, removed: 'x' } }, 200).received.changes, { added: 2, changed: 0, removed: 0 })
  assert.equal(client.readOutcome({ ...SUCCESS, mode: 'edit', changes: 'x' }, 200).received.changes, undefined)
  assert.equal(client.readOutcome({ ...SUCCESS, mode: 'outro' }, 200).received.mode, 'create')
  assert.equal(client.stageText({ stage: 'validando', round: 1, maxRounds: 3 }, true), 'Validando os locais e as conexões.')
  assert.equal(client.progressText({ stage: 'gerando', round: 1, maxRounds: 3, nodes: 4, edges: 3 }, { nodes: 9, edges: 9 }, true), 'Editando o fluxo, rodada 1 de 3.')
  for (const stage of ['preparando', 'gerando', 'montando', 'validando', 'corrigindo']) assert.match(client.stageText({ stage, round: 1, maxRounds: 3 }, true), PT_TEXT)
})

const HISTORY = [
  { role: 'user', text: 'Crie um fluxo de envio de boleto.' },
  { role: 'assistant', text: 'Pensei em um menu com Segunda via do boleto e Falar com o financeiro. Fica assim?' },
  { role: 'user', text: 'Pode ser assim, e peça o CPF antes.' },
]
const TURN = {
  message: 'Combinado. Quer validar o CPF em uma API?',
  suggestions: ['Sim, tenho a URL', 'Não precisa', 'Pode montar o fluxo'],
  action: 'ask',
  plan: 'Envio de boleto com menu de Segunda via do boleto e Falar com o financeiro, pedindo o CPF antes.',
}
const TURN_INPUT = { provider: 'openai', model: BASE.model, apiKey: KEY, effort: 'high', fill: false, history: HISTORY, flow: EDIT_BASE }

function captureTurn(reply) {
  const engine = {
    inputs: [],
    hooks: [],
    interviewTurn: async (input, hooks) => {
      engine.inputs.push(input)
      engine.hooks.push(hooks)
      return reply
    },
  }
  return engine
}

test('o turno da conversa leva provedor, modelo, chave, esforço, fill, histórico e fluxo ao motor do navegador', async () => {
  for (const fill of [true, false]) {
    for (const flow of [EDIT_BASE, null]) {
      const engine = captureTurn({ ok: true, turn: TURN })
      const controller = new AbortController()
      const out = await client.requestTurn({ ...TURN_INPUT, fill, flow }, controller.signal, engine)
      assert.deepEqual(out, { ok: true, turn: TURN })
      assert.equal(engine.inputs.length, 1)
      const [input] = engine.inputs
      assert.deepEqual(Object.keys(input).sort(), ['apiKey', 'effort', 'fill', 'flow', 'history', 'model', 'provider'])
      assert.equal(input.provider, 'openai')
      assert.equal(input.model, BASE.model)
      assert.equal(input.apiKey, KEY)
      assert.equal(input.effort, 'high')
      assert.equal(input.fill, fill)
      assert.equal(input.history, HISTORY)
      assert.equal(input.flow, flow)
      assert.equal(engine.hooks[0].transport, 'browser')
      assert.equal(engine.hooks[0].signal, controller.signal)
    }
  }
  const engine = captureTurn({ ok: true, turn: TURN })
  const { flow, ...withoutFlow } = TURN_INPUT
  await client.requestTurn(withoutFlow, signal(), engine)
  assert.equal(engine.inputs[0].flow, null)
  assert.equal(calls.length, 0)
})

test('sem o motor da conversa o turno falha com texto em PT-BR, sem chamar rota nem provedor', async () => {
  const out = await client.requestTurn(TURN_INPUT, signal(), null)
  assert.equal(out.ok, false)
  assert.equal(out.failure.success, false)
  assert.ok(FAILURE_CODES.includes(out.failure.code))
  assert.match(out.failure.error, PT_TEXT)
  assert.match(out.failure.details, PT_TEXT)
  assert.equal(calls.length, 0)
})

test('o turno roda no navegador com o provedor simulado e envia chave, modelo, esforço, fill, histórico e o fluxo aberto', async () => {
  for (const fill of [false, true]) {
    model(TURN)
    const seen = watchProvider()
    const out = await client.requestTurn({ ...TURN_INPUT, fill }, signal())
    assert.equal(out.ok, true, JSON.stringify(out.ok ? '' : out.failure))
    assert.equal(out.turn.action, 'ask')
    assert.equal(out.turn.plan, TURN.plan)
    assert.deepEqual(out.turn.suggestions, TURN.suggestions)
    assert.equal(calls.length, 0)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'https://api.openai.com/v1/responses')
    assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`)
    assert.equal(seen[0].body.model, BASE.model)
    assert.equal(seen[0].body.reasoning?.effort, 'high')
    const body = JSON.stringify(seen[0].body)
    for (const message of HISTORY) assert.ok(body.includes(JSON.stringify(message.text).slice(1, -1)), message.text)
    assert.ok(body.includes(`Nome: ${EDIT_BASE.name}`))
    assert.ok(body.includes(fill ? 'Preenchimento ligado' : 'Preenchimento desligado'))
    assert.ok(!body.includes(fill ? 'Preenchimento desligado' : 'Preenchimento ligado'))
    assert.equal(body.includes(KEY), false)
    assert.equal(JSON.stringify(out).includes(KEY), false)
    provider = null
  }
  model(TURN)
  const seen = watchProvider()
  const out = await client.requestTurn({ ...TURN_INPUT, flow: null }, signal())
  assert.equal(out.ok, true)
  const body = JSON.stringify(seen[0].body)
  assert.ok(!body.includes(`Nome: ${EDIT_BASE.name}`))
  assert.ok(body.includes('Não há fluxo aberto no editor'))
})

test('o total de tokens soma cada chamada da geração direta, da rota de reserva e da conversa, sem contar duas vezes', async () => {
  const tokens = require('../src/flow/ai/token-store.ts')
  const total = () => tokens.readTokens().totalTokens
  let before = total()
  model('não é json', TICKETS)
  let seen = watchProvider()
  let out = await client.generateFlow({ ...BASE, effort: 'high' }, signal(), () => {})
  assert.equal(out.ok, true)
  assert.ok(seen.length >= 2)
  assert.equal(out.received.usage.totalTokens, 33 * seen.length)
  assert.equal(total() - before, 33 * seen.length)

  before = total()
  model(TICKETS)
  seen = watchProvider()
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(out.received.usage.totalTokens, 33 * seen.length)
  assert.equal(total() - before, 33 * seen.length)

  before = total()
  let direct = 0
  provider = () => {
    if (direct++ === 0) throw new TypeError('Failed to fetch')
    return openaiReply(JSON.stringify(TICKETS))
  }
  out = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(out.ok, true)
  assert.equal(total() - before, out.received.usage.totalTokens)
  assert.equal(total() - before, 33 * (direct - 1))

  before = total()
  model(TURN)
  const turn = await client.requestTurn(TURN_INPUT, signal())
  assert.equal(turn.ok, true)
  assert.equal(total() - before, 33)

  before = total()
  provider = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  assert.equal((await client.requestTurn(TURN_INPUT, signal())).ok, false)
  assert.equal(total() - before, 0)

  const start = tokens.readTokens()
  const text = ndjson([
    { type: 'usage', usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 } },
    { type: 'usage', usage: { inputTokens: -1, outputTokens: 'x' } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    { type: 'result', result: { ...SUCCESS, usage: { inputTokens: 6, outputTokens: 7, totalTokens: 13 } } },
  ])
  serve(stream(bytesOf(text, 7)), { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, true)
  assert.deepEqual(out.received.usage, { inputTokens: 6, outputTokens: 7, totalTokens: 13 })
  assert.deepEqual(tokens.readTokens(), { inputTokens: start.inputTokens + 6, outputTokens: start.outputTokens + 7, totalTokens: start.totalTokens + 13 })
})

test('o total soma as chamadas de uma geração que falha, no navegador e pela rota, e segue os eventos de uso da rota', async () => {
  const tokens = require('../src/flow/ai/token-store.ts')
  const total = () => tokens.readTokens().totalTokens
  let before = total()
  model('não é json')
  let seen = watchProvider()
  let out = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(out.rejection.code, 'invalid_output')
  assert.equal(calls.length, 0)
  assert.equal(seen.length, 3)
  assert.equal(total() - before, 99)

  before = total()
  model('não é json')
  seen = watchProvider()
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.equal(calls.length, 1)
  assert.equal(seen.length, 3)
  assert.equal(total() - before, 99)

  before = total()
  calls.length = 0
  let direct = 0
  provider = () => {
    if (direct++ === 0) throw new TypeError('Failed to fetch')
    return openaiReply('não é json')
  }
  out = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(out.ok, false)
  assert.equal(calls.length, 1)
  assert.equal(total() - before, 33 * (direct - 1))

  before = total()
  serve(stream(bytesOf(ndjson([{ type: 'usage', usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 } }, { type: 'result', result: { ...SUCCESS, usage: { inputTokens: 50, outputTokens: 60, totalTokens: 110 } } }]), 7)), { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
  out = await client.requestGeneration(BASE, signal(), () => {})
  assert.equal(out.ok, true)
  assert.equal(total() - before, 11)
})

test('o total do canto sobe quando a tentativa termina, antes de a geração acabar', async () => {
  const tokens = require('../src/flow/ai/token-store.ts')
  const before = tokens.readTokens().totalTokens
  const controller = new AbortController()
  let index = 0
  provider = (url, init) => (index++ === 0
    ? openaiReply('não é json')
    : new Response(new ReadableStream({
      start(stream) {
        init.signal.addEventListener('abort', () => stream.error(new DOMException('Aborted', 'AbortError')), { once: true })
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  const pending = client.generateFlow(BASE, controller.signal, () => {})
  while (index < 2) await sleep(5)
  assert.equal(tokens.readTokens().totalTokens - before, 33)
  controller.abort()
  assert.equal((await pending).rejection.code, 'aborted')
  assert.equal(tokens.readTokens().totalTokens - before, 33)
})

test('a chave recusada no turno volta com o código do campo da chave e sem a chave no texto', async () => {
  provider = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  const out = await client.requestTurn(TURN_INPUT, signal())
  assert.equal(out.ok, false)
  assert.equal(out.failure.code, 'invalid_key')
  assert.match(out.failure.error, PT_TEXT)
  assert.equal(JSON.stringify(out).includes(KEY), false)
  assert.equal(calls.length, 0)
})

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const REQUEST = 'Crie um fluxo de envio de boleto.'
const KEY_MISSING = 'Informe a chave da API da OpenAI.'
const MODEL_INVALID = 'Escolha um modelo válido.'
const refuseKey = () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })
const submitEvent = () => ({ preventDefault: () => undefined })

function windowState() {
  const { open, focus, errors } = settings.readAiSettingsDialog()
  return { open, focus, errors }
}

function renderDialog(props = {}, { live = false, state = {}, hooks = null } = {}) {
  const { default: AIWorkflowDialog } = require('../src/flow/ai-workflow-dialog.tsx')
  for (const list of Object.values(seen)) list.length = 0
  const { useState, useSyncExternalStore, useRef, useEffect } = React
  React.useState = (initial) => {
    const [value, update] = useState(initial)
    return [typeof initial === 'string' && Object.hasOwn(state, initial) ? state[initial] : value, update]
  }
  if (live) React.useSyncExternalStore = (subscribe, getSnapshot) => getSnapshot()
  if (hooks) {
    let index = 0
    hooks.effects.length = 0
    React.useRef = (initial) => (hooks.refs[index++] ??= { current: initial })
    React.useEffect = (effect) => {
      hooks.effects.push(effect)
    }
  }
  try {
    const html = renderToStaticMarkup(React.createElement(AIWorkflowDialog, { open: true, onOpenChange: () => undefined, onWorkflowGenerated: () => true, ...props }))
    const host = (type, match = () => true) => seen.hosts.find((entry) => entry.type === type && match(entry.props))?.props
    return {
      html,
      form: host('form'),
      settingsButton: host('button', (props) => props['aria-haspopup'] === 'dialog'),
      content: seen.contents.at(-1),
      interview: seen.interviews.at(-1),
      chat: seen.panels.at(-1)?.interview,
      selects: [...seen.selects],
    }
  } finally {
    React.useState = useState
    React.useSyncExternalStore = useSyncExternalStore
    React.useRef = useRef
    React.useEffect = useEffect
  }
}

function runEffects(hooks) {
  const frames = []
  globalThis.window = { requestAnimationFrame: (task) => frames.push(task), cancelAnimationFrame: () => undefined }
  try {
    const cleanups = hooks.effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === 'function')
    for (const frame of frames.splice(0)) frame()
    for (const cleanup of cleanups) cleanup()
  } finally {
    delete globalThis.window
  }
}

function settingsOpened(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error('O Configurar IA não abriu.'))
    }, timeout)
    const stop = settings.subscribeAiSettingsDialog(() => {
      if (!settings.readAiSettingsDialog().open) return
      clearTimeout(timer)
      stop()
      resolve(windowState())
    })
  })
}

async function refusals() {
  provider = refuseKey
  const turn = await client.requestTurn({ provider: 'openai', model: BASE.model, apiKey: KEY, effort: 'medium', fill: true, history: [{ role: 'user', text: REQUEST }], flow: null }, signal())
  const generation = await client.generateFlow(BASE, signal(), () => {})
  assert.equal(turn.failure.code, 'invalid_key')
  assert.equal(generation.rejection.code, 'invalid_key')
  let reached = 0
  provider = () => {
    reached++
    return refuseKey()
  }
  return {
    turn: [turn.failure.error, turn.failure.details].filter(Boolean).join(' '),
    generation: [generation.rejection.failure.title, generation.rejection.failure.details].filter(Boolean).join(' '),
    reached: () => reached,
  }
}

test('o Gerar com IA mostra o resumo da IA com o botão Configurar IA no lugar do provedor, da chave, do modelo e do esforço, nos dois modos', () => {
  for (const state of [{}, { create: 'chat' }]) {
    const view = renderDialog({}, { state })
    assert.match(view.html, /<h3 id="[^"]*-ai-title" class="[^"]*">Modelo de IA<\/h3><div class="[^"]*rounded-xl[^"]*">/)
    assert.match(view.html, /<span class="[^"]*" title="OpenAI · GPT-6\.1 Sol · Esforço equilibrado">OpenAI · GPT-6\.1 Sol · Esforço equilibrado<\/span>/)
    assert.match(view.html, />Chave não informada</)
    assert.match(view.html, /<button type="button" aria-haspopup="dialog" class="[^"]*">Configurar IA<\/button><\/div><\/fieldset>/)
    assert.doesNotMatch(view.html, /Provedor de IA|Chave da API|Mostrar chave|Ocultar chave|Buscar modelos da API|Chave informada|type="password"|-provider-choice|>Esforço</)
    assert.doesNotMatch(view.html, /aria-label="(ChatGPT|Claude|Gemini|Grok)"/)
    assert.doesNotMatch(view.html, /[!—–]/)
    assert.equal(view.selects.length, 1)
    assert.match(view.selects[0].id, /-size$/)
    assert.equal(Boolean(view.chat), Boolean(state.create))
  }

  settings.updateAiSettings({ keys: { openai: KEY }, models: { openai: 'gpt-6-luna' }, effortChoice: 'high' })
  const keyed = renderDialog({}, { live: true })
  assert.match(keyed.html, />OpenAI · GPT-6 Luna · Esforço alto</)
  assert.doesNotMatch(keyed.html, /Chave não informada/)
  assert.equal(keyed.html.includes(KEY), false)

  settings.resetAiSettings()
  renderDialog().settingsButton.onClick()
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: {} })
})

test('pedir sem a chave abre o Configurar IA na chave com o erro, leva só os campos da IA, mantém o pedido e não chama o provedor', () => {
  let reached = 0
  provider = () => {
    reached++
    return refuseKey()
  }
  let prevented = false
  renderDialog().form.onSubmit({ preventDefault: () => (prevented = true) })
  assert.equal(prevented, true)
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: KEY_MISSING } })
  settings.closeAiSettings()

  settings.updateAiSettings({ models: { openai: 'modelo inválido/../x' } })
  renderDialog({}, { live: true, state: { '': REQUEST } }).form.onSubmit(submitEvent())
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: KEY_MISSING, model: MODEL_INVALID } })
  settings.closeAiSettings()

  settings.updateAiSettings({ keys: { openai: KEY } })
  renderDialog({}, { live: true, state: { '': REQUEST } }).form.onSubmit(submitEvent())
  assert.deepEqual(windowState(), { open: true, focus: 'model', errors: { model: MODEL_INVALID } })
  settings.resetAiSettings()

  const { chat } = renderDialog({}, { state: { create: 'chat' } })
  assert.equal(chat.send(REQUEST), false)
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: KEY_MISSING } })
  settings.closeAiSettings()
  assert.equal(chat.buildNow(), false)
  assert.equal(chat.retry(), false)
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: KEY_MISSING } })
  assert.deepEqual(seen.forwarded, [])
  assert.equal(reached, 0)
  assert.equal(calls.length, 0)
})

test('a chave recusada na conversa, na montagem pela conversa e na geração abre o Configurar IA na chave com a mensagem da recusa', async () => {
  const expected = await refusals()
  settings.updateAiSettings({ keys: { openai: KEY } })

  const { interview } = renderDialog({}, { live: true, state: { create: 'chat' } })
  const turn = await interview.turn([{ role: 'user', text: REQUEST }], null, signal())
  assert.equal(turn.ok, false)
  assert.equal(turn.failure.code, 'invalid_key')
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: expected.turn } })
  settings.closeAiSettings()

  const run = await interview.run('generate', 'Fluxo de envio de boleto com o menu de segunda via.', signal())
  assert.equal(run.ok, false)
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: expected.generation } })
  settings.closeAiSettings()

  const { form } = renderDialog({}, { live: true, state: { '': REQUEST } })
  const shown = settingsOpened()
  form.onSubmit(submitEvent())
  assert.equal(windowState().open, false)
  assert.deepEqual(await shown, { open: true, focus: 'apiKey', errors: { apiKey: expected.generation } })
  assert.equal(expected.reached(), 3)
  assert.equal(JSON.stringify(settings.readAiSettingsDialog()).includes(KEY), false)
  assert.equal(calls.length, 0)
})

test('a recusa que chega com o Gerar com IA fechado ou recolhido abre o Configurar IA quando o diálogo abrir de novo, uma vez só', async () => {
  const expected = await refusals()
  settings.updateAiSettings({ keys: { openai: KEY } })
  const hooks = { refs: [], effects: [] }
  const { interview } = renderDialog({ open: false }, { live: true, hooks })
  const turn = await interview.turn([{ role: 'user', text: REQUEST }], null, signal())
  assert.equal(turn.ok, false)
  assert.equal(windowState().open, false)

  const { content } = renderDialog({}, { live: true, hooks })
  content.onOpenAutoFocus(submitEvent())
  assert.equal(windowState().open, false)
  runEffects(hooks)
  assert.deepEqual(windowState(), { open: true, focus: 'apiKey', errors: { apiKey: expected.turn } })
  settings.closeAiSettings()

  renderDialog({}, { live: true, hooks })
  runEffects(hooks)
  assert.equal(windowState().open, false)
  assert.equal(expected.reached(), 1)
})
