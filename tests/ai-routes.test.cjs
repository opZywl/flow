const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveAlias(request, ...rest) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...rest)
}

const calls = []
let responder = null
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const call = { url, init, headers: Object.fromEntries(new Headers(init.headers).entries()), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }
  calls.push(call)
  if (!responder) throw new Error('rede bloqueada nos testes')
  return responder(call, calls.length - 1)
}

afterEach(() => {
  responder = null
  calls.length = 0
})

const generate = require('../app/api/generate-workflow/route.ts')
const listing = require('../app/api/ai-models/route.ts')
const { validateFlow } = require('../lib/atendimento/format.ts')
const { PROVIDERS } = require('../lib/atendimento/ai/providers.ts')

const KEYS = {
  openai: 'sk-test-0123456789abcdefghijklmnop',
  anthropic: 'sk-ant-test-0123456789abcdefghijkl',
  google: 'AIzaTest0123456789abcdefghijklmnop',
  xai: 'xai-test-0123456789abcdefghijklmn',
}
const MODELS = { openai: 'gpt-6.1-sol', anthropic: 'claude-opus-5-5', google: 'gemini-3.8-flash', xai: 'grok-4.7' }
const PNG = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64')}`

const RI = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, menu e transferência para a equipe certa',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: 'Agendamento' }] },
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
const BROKEN_RI = { ...RI, edges: RI.edges.filter((edge) => edge.output !== 'Encerrar') }
const OPEN_RI = { ...RI, nodes: RI.nodes.filter((node) => !['despedida', 'fim'].includes(node.id)), edges: RI.edges.filter((edge) => edge.output !== 'Encerrar' && edge.from !== 'despedida') }

function pieces(text, size = 64) {
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts.length ? parts : ['']
}

function sse(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function errorResponse(status, body, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

const reply = {
  openai(text, finish) {
    return sse([
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.openai } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      ...pieces(text).map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', delta })),
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      { type: finish ? 'response.incomplete' : 'response.completed', response: { incomplete_details: finish ? { reason: finish } : null, usage: { input_tokens: 11, output_tokens: 22 } } },
    ])
  },
  anthropic(text, stop = 'end_turn') {
    return sse([
      { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage: { input_tokens: 11 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      ...pieces(text).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 22 } },
      { type: 'message_stop' },
    ])
  },
  google(text, finish = 'STOP') {
    return sse([
      ...pieces(text).map((part) => ({ candidates: [{ content: { role: 'model', parts: [{ text: part }] } }] })),
      { candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: finish }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 } },
    ])
  },
  xai(text, finish) {
    return sse([
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.xai, object: 'response', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
      ...pieces(text).map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta })),
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] } },
      { type: 'response.completed', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.xai, object: 'response', status: finish ? 'incomplete' : 'completed', incomplete_details: finish ? { reason: finish } : null, output: [], usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 } } },
    ])
  },
}

function request(url, body, init = {}) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: init.signal,
  })
}

function payload(provider = 'openai', extra = {}) {
  return { provider, model: MODELS[provider], apiKey: KEYS[provider], prompt: 'Atendimento de clínica com menu para agendar consulta e encerrar.', size: 'auto', ...extra }
}

async function run(body, init) {
  const response = await generate.POST(request('/api/generate-workflow', body, init))
  const text = await response.text()
  return { response, text, data: response.headers.get('content-type').includes('ndjson') ? text : JSON.parse(text) }
}

async function list(body) {
  const response = await listing.POST(request('/api/ai-models', body))
  const text = await response.text()
  return { response, text, data: JSON.parse(text) }
}

function events(text) {
  return text.trim().split('\n').map((line) => JSON.parse(line))
}

function assertNoKey(text, key) {
  assert.equal(text.includes(key), false, 'a chave apareceu na resposta')
  for (const call of calls) assert.equal(call.url.includes(key), false, 'a chave apareceu na URL')
}

function userText(call) {
  return JSON.stringify(call.body)
}

test('o módulo da rota exporta só campos válidos de rota do Next', () => {
  assert.deepEqual(Object.keys(generate).sort(), ['POST', 'maxDuration', 'runtime'])
  assert.deepEqual(Object.keys(listing).sort(), ['POST', 'maxDuration', 'runtime'])
  assert.equal(generate.runtime, 'nodejs')
  assert.equal(listing.runtime, 'nodejs')
  assert.ok(generate.maxDuration >= 280 && generate.maxDuration <= 300)
  assert.ok(listing.maxDuration >= 20 && listing.maxDuration <= 60)
})

test('as rotas não usam console e não guardam a chave fora da requisição', () => {
  for (const file of ['app/api/generate-workflow/route.ts', 'app/api/ai-models/route.ts']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.equal(/console\./.test(source), false, file)
    assert.equal(/localStorage|sessionStorage|process\.env/.test(source), false, file)
    assert.equal(/\/\/\s|\/\*/.test(source.replace(/https?:\/\//g, '')), false, `${file} tem comentários`)
  }
})

test('gera com ChatGPT e devolve o fluxo no formato de Atendimento', async () => {
  responder = () => reply.openai(JSON.stringify(RI))
  const { response, data, text } = await run(payload('openai', { name: 'Clínica Exemplo' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(data.success, true)
  assert.equal(data.rounds, 1)
  assert.deepEqual(data.model, { provider: 'openai', id: MODELS.openai })
  assert.deepEqual(data.usage, { inputTokens: 11, outputTokens: 22, totalTokens: 33 })
  assert.equal(data.workflow.name, 'Clínica Exemplo')
  assert.equal(data.workflow.nodes[0].id, 'inicio')
  assert.equal(data.workflow.nodes[0].data.type, 'trigger_message')
  assert.deepEqual(data.workflow.nodes.map((node) => node.data.type).sort(), ['departamentos', 'envio_mensagem', 'envio_pergunta', 'envio_pergunta', 'finalizar', 'trigger_message'])
  assert.ok(data.workflow.edges.every((edge) => edge.type === 'deletable' && edge.id.startsWith('xy-edge__')))
  assert.ok(Math.abs(Date.parse(data.workflow.created_at) - Date.now()) < 60000)
  assert.deepEqual(validateFlow(data.workflow).filter((issue) => issue.severity === 'error'), [])
  assert.ok(Array.isArray(data.issues))
  assert.ok(data.issues.every((issue) => issue.scope !== 'ia' || issue.severity !== 'error'))
  assert.ok(data.issues.some((issue) => issue.scope === 'plataforma'))
  assert.match(data.transcript, /Atendimento de clínica com menu/)
  assertNoKey(text, KEYS.openai)

  assert.equal(calls.length, 1)
  const [call] = calls
  assert.equal(call.url, 'https://api.openai.com/v1/responses')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.headers.authorization, `Bearer ${KEYS.openai}`)
  assert.equal(call.body.model, MODELS.openai)
  assert.equal(call.body.stream, true)
  assert.equal(call.body.store, false)
  assert.equal(call.body.text.format.type, 'json_schema')
  assert.equal(call.body.text.format.strict, true)
  assert.equal(call.body.text.format.name, 'fluxo_ri')
  assert.equal(call.body.temperature, undefined)
  assert.equal(call.body.input[0].role, 'developer')
  assert.ok(call.body.input[0].content.length > 1000)
  assert.equal(call.body.input[1].role, 'user')
  assert.match(userText(call), /Atendimento de clínica com menu/)
})

test('corrige as pendências do fluxo em uma nova rodada com o histórico da conversa', async () => {
  responder = (call, index) => reply.openai(JSON.stringify(index === 0 ? BROKEN_RI : RI))
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 2)
  assert.deepEqual(data.usage, { inputTokens: 22, outputTokens: 44, totalTokens: 66 })
  assert.equal(calls.length, 2)
  const second = calls[1].body.input
  assert.deepEqual(second.map((message) => message.role), ['developer', 'user', 'assistant', 'user'])
  assert.deepEqual(JSON.parse(second[2].content[0].text), BROKEN_RI)
  const correction = JSON.stringify(second[3].content)
  assert.match(correction, /\[menu\]/)
  assert.match(correction, /Encerrar/)
  assert.match(data.transcript, /\[menu\]/)
  assert.deepEqual(validateFlow(data.workflow).filter((issue) => issue.severity === 'error'), [])
  assert.equal(data.issues.some((issue) => issue.scope === 'ia' && issue.severity === 'error'), false)
})

test('para em 3 rodadas, devolve a melhor e liga as saídas restantes a um Encerrar Conversa', async () => {
  responder = () => reply.openai(JSON.stringify(OPEN_RI))
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 3)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[2].body.input.map((message) => message.role), ['developer', 'user', 'assistant', 'user', 'assistant', 'user'])
  assert.ok(data.issues.some((issue) => issue.scope === 'ajuste'))
  assert.deepEqual(validateFlow(data.workflow).filter((issue) => issue.severity === 'error'), [])
})

test('uma correção que piora não substitui a rodada melhor', async () => {
  const worse = {
    name: 'Pior',
    description: 'Menu sem nenhuma saída ligada',
    nodes: [{ id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Escolha' }, { key: 'options', value: JSON.stringify([{ text: 'A' }, { text: 'B' }, { text: 'C' }]) }] }],
    edges: [{ from: 'inicio', output: '', to: 'menu' }],
  }
  responder = (call, index) => reply.openai(JSON.stringify(index === 0 ? OPEN_RI : worse))
  const { data } = await run(payload('openai'))
  assert.equal(data.success, true)
  assert.equal(data.rounds, 3)
  const types = data.workflow.nodes.map((node) => node.data.type)
  assert.ok(types.includes('departamentos'))
  assert.equal(data.workflow.nodes.filter((node) => node.data.type === 'envio_mensagem').length, 1)
  assert.equal(data.workflow.nodes.find((node) => node.data.type === 'envio_mensagem').data.data['text-1'], 'Agendar consulta')
})

test('pede a RI de novo quando a resposta sai fora do formato', async () => {
  responder = (call, index) => reply.openai(index === 0 ? 'Segue o fluxo pedido, sem JSON.' : JSON.stringify(RI))
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 2)
  const second = calls[1].body.input
  assert.deepEqual(second.map((message) => message.role), ['developer', 'user', 'assistant', 'user'])
  assert.match(second[2].content[0].text, /sem JSON/)
})

test('repara a resposta com cercas de código e valores fora de texto', async () => {
  const loose = { ...RI, nodes: RI.nodes.map((node) => node.id === 'menu' ? { ...node, config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: [{ text: 'Agendar consulta' }, { text: 'Encerrar' }] }] } : node) }
  responder = () => reply.openai(`\`\`\`json\n${JSON.stringify(loose)}\n\`\`\``)
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 1)
  assert.equal(data.workflow.nodes.filter((node) => node.data.type === 'envio_mensagem').length, 1)
})

test('falha com invalid_output quando nenhuma rodada segue o formato', async () => {
  responder = () => reply.openai('Não consegui montar o fluxo.')
  const { response, data, text } = await run(payload('openai'))
  assert.equal(response.status, 422)
  assert.deepEqual(data, { success: false, code: 'invalid_output', error: 'A resposta do modelo não seguiu o formato esperado.', details: 'Gere novamente ou escolha outro modelo.' })
  assert.equal(calls.length, 3)
  assertNoKey(text, KEYS.openai)
})

test('resposta cortada por tamanho e bloqueio de conteúdo não geram novas rodadas', async () => {
  responder = () => reply.openai(JSON.stringify(RI).slice(0, 200), 'max_output_tokens')
  let result = await run(payload('openai'))
  assert.equal(result.response.status, 422)
  assert.equal(result.data.code, 'output_too_long')
  assert.equal(result.data.error, 'A resposta do modelo foi interrompida por excesso de tamanho.')
  assert.equal(calls.length, 1)

  calls.length = 0
  responder = () => reply.anthropic('', 'refusal')
  result = await run(payload('anthropic'))
  assert.equal(result.response.status, 422)
  assert.equal(result.data.code, 'content_filter')
  assert.equal(result.data.error, 'O provedor bloqueou a resposta.')
  assert.equal(calls.length, 1)
})

const REFUSAL = 'I can’t help with that request.'

function refusalStream(provider, withEvents = true) {
  const model = MODELS[provider]
  return sse([
    { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model, object: 'response', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
    ...(withEvents ? [
      { type: 'response.content_part.added', item_id: 'msg_1', output_index: 0, content_index: 0, part: { type: 'refusal', refusal: '' } },
      { type: 'response.refusal.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: REFUSAL },
      { type: 'response.refusal.done', item_id: 'msg_1', output_index: 0, content_index: 0, refusal: REFUSAL },
      { type: 'response.content_part.done', item_id: 'msg_1', output_index: 0, content_index: 0, part: { type: 'refusal', refusal: REFUSAL } },
    ] : []),
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: REFUSAL }] } },
    { type: 'response.completed', response: { id: 'resp_1', created_at: 1760000000, model, object: 'response', status: 'completed', incomplete_details: null, output: [], usage: { input_tokens: 11, output_tokens: 5, total_tokens: 16 } } },
  ])
}

for (const [provider, withEvents] of [['openai', true], ['xai', true], ['xai', false]]) {
  test(`recusa da ${provider}${withEvents ? '' : ' só no item final'} vira content_filter sem novas rodadas`, async () => {
    responder = () => refusalStream(provider, withEvents)
    const { response, data, text } = await run(payload(provider))
    assert.equal(response.status, 422)
    assert.deepEqual(data, { success: false, code: 'content_filter', error: 'O provedor bloqueou a resposta.', details: 'Revise a descrição e tente novamente.' })
    assert.equal(calls.length, 1)
    assertNoKey(text, KEYS[provider])
  })
}

test('texto do modelo que cita refusal não é tratado como recusa', async () => {
  const quoted = { ...RI, description: 'Trata "type":"refusal" e response.failed como texto comum' }
  responder = () => reply.openai(JSON.stringify(quoted))
  const { data } = await run(payload('openai'))
  assert.equal(data.success, true)
  assert.equal(calls.length, 1)
})

for (const provider of ['openai', 'xai']) {
  test(`response.failed da ${provider} vira provider_unavailable sem novas rodadas`, async () => {
    responder = () => sse([
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS[provider], object: 'response', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: '{"name":"Atend' },
      { type: 'response.failed', response: { id: 'resp_1', created_at: 1760000000, model: MODELS[provider], object: 'response', status: 'failed', error: { code: 'server_error', message: 'The server had an error.' }, incomplete_details: null, output: [], usage: { input_tokens: 11, output_tokens: 3, total_tokens: 14 } } },
    ])
    const { response, data } = await run(payload(provider))
    assert.equal(response.status, 502)
    assert.deepEqual(data, { success: false, code: 'provider_unavailable', error: 'O provedor está indisponível no momento.', details: 'Tente novamente em alguns instantes.' })
    assert.equal(calls.length, 1)
  })
}

function withoutStop(text) {
  return sse([
    { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage: { input_tokens: 11 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...pieces(text).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } },
  ])
}

test('Claude sem message_stop não trava a geração e segue na rodada seguinte', { timeout: 10000 }, async () => {
  responder = (call, index) => index === 0 ? withoutStop(JSON.stringify(RI)) : reply.anthropic(JSON.stringify(RI))
  const { response, data } = await run(payload('anthropic'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 2)
  assert.equal(calls.length, 2)
})

test('Claude com corpo vazio ou cortado sem message_stop responde em vez de travar', { timeout: 10000 }, async () => {
  for (const make of [() => new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } }), () => withoutStop(JSON.stringify(RI).slice(0, 120))]) {
    calls.length = 0
    responder = make
    const { response, data } = await run(payload('anthropic'))
    assert.equal(response.status, 422)
    assert.equal(data.code, 'invalid_output')
    assert.equal(calls.length, 3)
  }

  calls.length = 0
  responder = () => withoutStop(JSON.stringify(RI).slice(0, 120))
  const { data } = await run(payload('anthropic', { stream: true }))
  const last = events(data).at(-1)
  assert.equal(last.type, 'result')
  assert.equal(last.result.code, 'invalid_output')
})

function dropped(provider, text = JSON.stringify(RI).slice(0, 120)) {
  const head = {
    openai: reply.openai,
    anthropic: reply.anthropic,
    google: reply.google,
    xai: reply.xai,
  }[provider]
  const encoder = new TextEncoder()
  return (async () => {
    const full = await head(text).text()
    const part = full.slice(0, Math.floor(full.length * (text.length < 200 ? 0.6 : 0.8)))
    const socket = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(part))
        setTimeout(() => controller.error(new TypeError('terminated', { cause: socket })), 5)
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })()
}

for (const provider of ['openai', 'anthropic', 'google', 'xai']) {
  test(`queda da conexão no meio do streaming da ${provider} sem componentes completos vira network`, async () => {
    responder = () => dropped(provider)
    const { response, data, text } = await run(payload(provider))
    assert.equal(response.status, 502)
    assert.deepEqual(data, { success: false, code: 'network', error: 'Não foi possível conectar ao provedor.', details: 'Verifique a conexão com a internet e tente novamente.' })
    assert.equal(text.includes('Failed to process'), false)
    assertNoKey(text, KEYS[provider])
  })
}

for (const provider of ['openai', 'anthropic', 'google', 'xai']) {
  test(`queda da conexão da ${provider} depois de componentes completos retoma a geração e devolve o fluxo parcial`, async () => {
    responder = () => dropped(provider, JSON.stringify(RI))
    const { response, data, text } = await run(payload(provider))
    assert.equal(response.status, 200)
    assert.equal(data.success, true)
    assert.equal(data.partial, true)
    assert.equal(data.rounds, 3)
    assert.equal(calls.length, 3)
    assert.ok(data.issues.some((issue) => issue.scope === 'ia' && issue.message === 'A geração foi interrompida antes do fim e o fluxo pode estar incompleto.'))
    assert.ok(data.workflow.nodes.some((node) => node.data.type === 'envio_pergunta'))
    assert.match(userText(calls[1]), /interrompida/)
    assertNoKey(text, KEYS[provider])
  })
}

test('prazo de leitura do corpo esgotado no streaming vira timeout', async () => {
  responder = async () => {
    const full = await reply.openai(JSON.stringify(RI)).text()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(full.slice(0, 200)))
        setTimeout(() => controller.error(Object.assign(new TypeError('terminated'), { cause: Object.assign(new Error('Body Timeout Error'), { code: 'UND_ERR_BODY_TIMEOUT' }) })), 5)
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 504)
  assert.equal(data.code, 'timeout')
})

test('RI sem componentes em todas as rodadas falha com mensagem clara', async () => {
  responder = () => reply.google(JSON.stringify({ name: 'Vazio', description: '', nodes: [], edges: [] }))
  const { response, data } = await run(payload('google', { prompt: 'asdf qwer' }))
  assert.equal(response.status, 422)
  assert.deepEqual(data, { success: false, code: 'invalid_output', error: 'O modelo não gerou nenhum componente para esta descrição.', details: 'Descreva as etapas do atendimento e gere novamente.', field: 'prompt' })
})

test('RI só com o início ou só com notas falha como resposta sem componentes', async () => {
  for (const nodes of [[{ id: 'inicio', type: 'trigger_message', config: [] }], [{ id: 'nota', type: 'note', config: [{ key: 'text', value: 'Revisar.' }] }]]) {
    responder = () => reply.google(JSON.stringify({ name: 'Sem componentes', description: '', nodes, edges: [] }))
    const { response, data } = await run(payload('google', { prompt: 'asdf qwer' }))
    assert.equal(response.status, 422)
    assert.equal(data.code, 'invalid_output')
    assert.equal(data.error, 'O modelo não gerou nenhum componente para esta descrição.')
  }
})

test('RI vazia numa rodada e completa na correção devolve o fluxo completo', async () => {
  responder = (call, index) => reply.google(JSON.stringify(index === 0 ? { name: 'Vazio', description: '', nodes: [], edges: [] } : RI))
  const { response, data } = await run(payload('google'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.ok(data.workflow.nodes.some((node) => node.data.type === 'departamentos'))
})

test('gera com Claude em NDJSON, com progresso e imagem de referência', async () => {
  responder = () => reply.anthropic(JSON.stringify(RI))
  const { response, data, text } = await run(payload('anthropic', { image: PNG, stream: true }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-accel-buffering'), 'no')
  const lines = events(data)
  const last = lines.at(-1)
  assert.equal(last.type, 'result')
  assert.equal(last.result.success, true)
  assert.equal(last.result.rounds, 1)
  assert.ok(lines.slice(0, -1).every((event) => event.type === 'progress'))
  const stages = lines.slice(0, -1).map((event) => event.progress.stage)
  assert.equal(stages[0], 'preparando')
  for (const stage of ['gerando', 'montando', 'validando']) assert.ok(stages.includes(stage), stage)
  const generating = lines.filter((event) => event.type === 'progress' && event.progress.stage === 'gerando')
  assert.ok(generating.some((event) => event.progress.nodes === RI.nodes.length && event.progress.edges === RI.edges.length))
  assert.ok(lines.slice(0, -1).every((event) => event.progress.maxRounds === 3))
  assert.match(last.result.transcript, /\[Imagem anexada: image\/png, 1 KB\]/)
  assertNoKey(text, KEYS.anthropic)

  const [call] = calls
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(call.headers['x-api-key'], KEYS.anthropic)
  assert.equal(call.headers['anthropic-version'], '2023-06-01')
  assert.equal(call.headers.authorization, undefined)
  assert.equal(call.body.model, MODELS.anthropic)
  assert.equal(call.body.output_config.format.type, 'json_schema')
  assert.equal(call.body.tool_choice, undefined)
  assert.equal(call.body.tools, undefined)
  assert.equal(call.body.temperature, undefined)
  assert.equal(call.body.system[0].cache_control.type, 'ephemeral')
  const content = call.body.messages[0].content
  assert.equal(content[0].type, 'text')
  assert.equal(content[1].type, 'image')
  assert.equal(content[1].source.type, 'base64')
  assert.equal(content[1].source.media_type, 'image/png')
  assert.equal(content[1].source.data, PNG.split(',')[1])
})

test('Claude Sonnet 5.5 também recebe saída estruturada nativa, sem ferramenta forçada', async () => {
  responder = () => reply.anthropic(JSON.stringify(RI))
  const { data } = await run(payload('anthropic', { model: 'claude-sonnet-5-5' }))
  assert.equal(data.success, true)
  assert.equal(calls[0].body.model, 'claude-sonnet-5-5')
  assert.equal(calls[0].body.output_config.format.type, 'json_schema')
  assert.equal(calls[0].body.tool_choice, undefined)
})

test('gera com Gemini pela URL oficial, com a chave só no cabeçalho', async () => {
  responder = () => reply.google(JSON.stringify(RI))
  const { response, data, text } = await run(payload('google', { image: PNG }))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assertNoKey(text, KEYS.google)
  const [call] = calls
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse')
  assert.equal(call.headers['x-goog-api-key'], KEYS.google)
  assert.equal(call.body.generationConfig.responseMimeType, 'application/json')
  assert.equal(call.body.generationConfig.responseSchema.type, 'object')
  assert.equal(JSON.stringify(call.body.generationConfig.responseSchema).includes('additionalProperties'), false)
  assert.equal(call.body.generationConfig.temperature, undefined)
  assert.ok(call.body.systemInstruction.parts[0].text.length > 1000)
  assert.equal(call.body.contents[0].parts[1].inlineData.mimeType, 'image/png')
})

test('gera com Grok pela Responses API com esquema estrito', async () => {
  responder = () => reply.xai(JSON.stringify(RI))
  const { response, data, text } = await run(payload('xai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assertNoKey(text, KEYS.xai)
  const [call] = calls
  assert.equal(call.url, 'https://api.x.ai/v1/responses')
  assert.equal(call.headers.authorization, `Bearer ${KEYS.xai}`)
  assert.equal(call.body.model, MODELS.xai)
  assert.equal(call.body.text.format.type, 'json_schema')
  assert.equal(call.body.text.format.strict, true)
  assert.equal(call.body.store, false)
})

test('modelo da Anthropic desconhecido pelo pacote gera sem avisos no log do servidor', async () => {
  const warnings = []
  const onWarning = (warning) => warnings.push(warning.message)
  const original = console.warn
  process.on('warning', onWarning)
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    responder = () => reply.anthropic(JSON.stringify(RI))
    const { response, data } = await run(payload('anthropic', { model: 'claude-haiku-5-5' }))
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(response.status, 200)
    assert.equal(data.success, true)
    assert.equal(calls[0].body.model, 'claude-haiku-5-5')
  } finally {
    process.off('warning', onWarning)
    console.warn = original
  }
  assert.deepEqual(warnings, [])
})

test('limite do Google com retry-after no cabeçalho usa o tempo do cabeçalho', async () => {
  responder = () => errorResponse(429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }, { 'retry-after': '7' })
  const { data } = await list({ provider: 'google', apiKey: KEYS.google })
  assert.deepEqual(data, { code: 'rate_limit', error: 'Limite de uso atingido no provedor.', details: 'Aguarde cerca de 7 segundos e tente novamente. Se o limite continuar, verifique o plano da conta do Google.' })
})

test('ignora URLs e chaves do ambiente do servidor', async () => {
  const saved = { ...process.env }
  Object.assign(process.env, { OPENAI_BASE_URL: 'https://desvio.example/v1', OPENAI_API_KEY: 'sk-ambiente-000000000000', ANTHROPIC_BASE_URL: 'https://desvio.example/v1', ANTHROPIC_API_KEY: 'sk-ant-ambiente-0000000000' })
  try {
    for (const provider of ['openai', 'anthropic']) {
      calls.length = 0
      responder = () => reply[provider](JSON.stringify(RI))
      const { data } = await run(payload(provider))
      assert.equal(data.success, true)
      assert.equal(new URL(calls[0].url).host, provider === 'openai' ? 'api.openai.com' : 'api.anthropic.com')
      assert.equal(JSON.stringify(calls[0].headers).includes('ambiente'), false)
    }
  } finally {
    for (const key of ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})

const PROVIDER_ERRORS = [
  ['openai', 401, { error: { message: `Incorrect API key provided: ${KEYS.openai}.`, type: 'invalid_request_error', code: 'invalid_api_key' } }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave da OpenAI e tente novamente.'],
  ['anthropic', 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave da Anthropic e tente novamente.'],
  ['google', 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave do Google e tente novamente.'],
  ['xai', 400, { code: 'Client specified an invalid argument', error: `Incorrect API key provided: ${KEYS.xai}.` }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave da xAI e tente novamente.'],
  ['openai', 403, { error: { message: 'Project does not have access to model gpt-6-astra.', type: 'invalid_request_error', code: 'model_not_found' } }, 'forbidden', 'A chave não tem acesso a este modelo ou recurso.', 'Verifique as permissões da conta da OpenAI.'],
  ['openai', 404, { error: { message: 'The model `gpt-9` does not exist or you do not have access to it.', type: 'invalid_request_error', code: 'model_not_found' } }, 'model_not_found', 'O modelo escolhido não está disponível para esta chave.', 'Escolha outro modelo ou use Buscar modelos da API.'],
  ['anthropic', 404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-x' } }, 'model_not_found', 'O modelo escolhido não está disponível para esta chave.', 'Escolha outro modelo ou use Buscar modelos da API.'],
  ['anthropic', 400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 'billing', 'Saldo insuficiente na conta do provedor.', 'Adicione créditos na conta da Anthropic e tente novamente.'],
  ['openai', 429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } }, 'billing', 'Saldo insuficiente na conta do provedor.', 'Adicione créditos na conta da OpenAI e tente novamente.'],
  ['google', 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde alguns instantes ou verifique os créditos da conta do Google.'],
  ['google', 429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.8-flash\nPlease retry in 38.2s.', status: 'RESOURCE_EXHAUSTED' } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde cerca de 39 segundos e tente novamente. Se o limite continuar, verifique o plano da conta do Google.'],
  ['google', 429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' }] } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde cerca de 12 segundos e tente novamente. Se o limite continuar, verifique o plano da conta do Google.'],
  ['anthropic', 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'provider_unavailable', 'O provedor está indisponível no momento.', 'Tente novamente em alguns instantes.'],
  ['anthropic', 403, { type: 'error', error: { type: 'permission_error', message: 'Your API key does not have permission to use the specified resource.' } }, 'forbidden', 'A chave não tem acesso a este modelo ou recurso.', 'Verifique as permissões da conta da Anthropic.'],
  ['xai', 403, { code: 'The caller does not have permission to execute the specified operation', error: "Your newly created teams doesn't have any credits yet. You can purchase credits on https://console.x.ai/team/00000000-0000-0000-0000-000000000000." }, 'billing', 'Saldo insuficiente na conta do provedor.', 'Adicione créditos na conta da xAI e tente novamente.'],
  ['xai', 503, { error: { message: 'Service unavailable' } }, 'provider_unavailable', 'O provedor está indisponível no momento.', 'Tente novamente em alguns instantes.'],
  ['openai', 400, { error: { message: `Invalid input: Bearer ${KEYS.openai} rejected.`, type: 'invalid_request_error', code: 'invalid_value' } }, 'provider_error', 'O provedor recusou a solicitação.', 'Detalhe do provedor: Invalid input: [chave oculta] rejected.'],
]

for (const [provider, status, body, code, error, details] of PROVIDER_ERRORS) {
  test(`mapeia HTTP ${status} da ${provider} para ${code} em PT-BR, sem a chave`, async () => {
    responder = () => errorResponse(status, body, { 'retry-after-ms': '0' })
    const { response, data, text } = await run(payload(provider, { stream: false }))
    assert.equal(response.status, 502)
    assert.deepEqual(data, { success: false, code, error, details })
    assertNoKey(text, KEYS[provider])
    assert.equal(text.includes('stack'), false)
    assert.ok(calls.length >= 1 && calls.length <= 3)
  })
}

test('sem créditos na OpenAI responde na hora, sem repetir a chamada', async () => {
  responder = () => errorResponse(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } }, { 'retry-after-ms': '0' })
  const { data } = await run(payload('openai'))
  assert.equal(data.code, 'billing')
  assert.equal(data.error, 'Saldo insuficiente na conta do provedor.')
  assert.equal(calls.length, 1)
})

test('repete chamadas com limite temporário e segue quando o provedor volta', async () => {
  responder = (call, index) => index === 0 ? errorResponse(429, { error: { message: 'Rate limit reached', type: 'requests', code: 'rate_limit_exceeded' } }, { 'retry-after-ms': '0' }) : reply.openai(JSON.stringify(RI))
  const { data } = await run(payload('openai'))
  assert.equal(data.success, true)
  assert.equal(data.rounds, 1)
  assert.equal(calls.length, 2)
})

test('falha de rede vira network', async () => {
  responder = () => {
    throw new TypeError('fetch failed')
  }
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 502)
  assert.deepEqual(data, { success: false, code: 'network', error: 'Não foi possível conectar ao provedor.', details: 'Verifique a conexão com a internet e tente novamente.' })
})

test('falha do provedor na correção devolve a melhor rodada anterior', async () => {
  responder = (call, index) => index === 0 ? reply.openai(JSON.stringify(BROKEN_RI)) : errorResponse(401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error' } })
  const { response, data } = await run(payload('openai'))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.rounds, 2)
  assert.ok(data.issues.some((issue) => issue.scope === 'ajuste'))
})

test('erro no meio do streaming vira mensagem do provedor', async () => {
  responder = () => sse([
    { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage: { input_tokens: 11 } } },
    { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
  ])
  const { response, data } = await run(payload('anthropic'))
  assert.equal(response.status, 502)
  assert.equal(data.code, 'provider_unavailable')
})

test('cancelamento pelo cliente encerra a geração com aborted', async () => {
  const controller = new AbortController()
  responder = (call) => new Promise((resolve, reject) => {
    call.init.signal.addEventListener('abort', () => reject(call.init.signal.reason), { once: true })
    setTimeout(() => controller.abort(), 20)
  })
  const { response, data } = await run(payload('openai'), { signal: controller.signal })
  assert.equal(response.status, 499)
  assert.deepEqual(data, { success: false, code: 'aborted', error: 'A geração foi cancelada.' })
})

test('cancelar a leitura do NDJSON interrompe a chamada ao provedor', async () => {
  let aborted = false
  responder = (call) => new Promise((resolve, reject) => {
    call.init.signal.addEventListener('abort', () => {
      aborted = true
      reject(call.init.signal.reason)
    }, { once: true })
  })
  const response = await generate.POST(request('/api/generate-workflow', payload('openai', { stream: true })))
  const reader = response.body.getReader()
  const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).trim().split('\n')[0])
  assert.equal(first.progress.stage, 'preparando')
  while (calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
  await reader.cancel()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(aborted, true)
})

const INPUT_ERRORS = [
  ['provedor desconhecido', { provider: 'deepseek' }, 'provider', 'Escolha um provedor de IA suportado.'],
  ['chave ausente', { apiKey: '' }, 'apiKey', 'Informe a chave da API.'],
  ['chave curta', { apiKey: 'sk-1' }, 'apiKey', 'Informe a chave da API.'],
  ['chave com espaço', { apiKey: 'sk-test 0123456789' }, 'apiKey', 'A chave da API tem caracteres inválidos.'],
  ['chave longa', { apiKey: `sk-${'a'.repeat(600)}` }, 'apiKey', 'A chave da API é longa demais.'],
  ['modelo vazio', { model: '' }, 'model', 'Escolha um modelo válido.'],
  ['modelo com barra', { model: 'models/../files' }, 'model', 'Escolha um modelo válido.'],
  ['modelo com pontos seguidos', { model: 'gpt..6' }, 'model', 'Escolha um modelo válido.'],
  ['modelo com URL', { model: 'https://desvio.example' }, 'model', 'Escolha um modelo válido.'],
  ['sem descrição nem imagem', { prompt: '   ' }, 'prompt', 'Descreva o atendimento ou envie uma imagem de referência.'],
  ['descrição longa', { prompt: 'a'.repeat(8001) }, 'prompt', 'A descrição pode ter até 8.000 caracteres.'],
  ['imagem em URL', { image: 'https://desvio.example/imagem.png' }, 'image', 'Imagem inválida. Envie PNG ou JPG de até 5 MB.'],
  ['imagem GIF', { image: `data:image/gif;base64,${Buffer.from('GIF89a0000').toString('base64')}` }, 'image', 'Imagem inválida. Envie PNG ou JPG de até 5 MB.'],
  ['imagem com assinatura errada', { image: `data:image/png;base64,${Buffer.alloc(64, 7).toString('base64')}` }, 'image', 'Imagem inválida. Envie PNG ou JPG de até 5 MB.'],
  ['imagem grande demais', { image: `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]).toString('base64')}` }, 'image', 'Imagem inválida. Envie PNG ou JPG de até 5 MB.'],
  ['imagem com modelo só de texto', { image: PNG, model: 'o3-mini' }, 'model', 'O modelo o3-mini não analisa imagens. Escolha outro modelo ou remova a imagem.'],
  ['tamanho inválido', { size: 'enorme' }, 'size', 'Tamanho do fluxo inválido.'],
  ['quantidade baixa', { size: 'custom', count: 1 }, 'count', 'Informe de 2 a 60 componentes.'],
  ['quantidade alta', { size: 'custom', count: 61 }, 'count', 'Informe de 2 a 60 componentes.'],
  ['quantidade fracionada', { size: 'custom', count: 2.5 }, 'count', 'Informe de 2 a 60 componentes.'],
  ['nome longo', { name: 'n'.repeat(81) }, 'name', 'O nome do fluxo pode ter até 80 caracteres.'],
  ['preenchimento em texto', { fill: 'false' }, 'fill', 'Escolha se a IA preenche os nomes, IDs e URLs que o pedido não traz.'],
  ['preenchimento numérico', { fill: 0 }, 'fill', 'Escolha se a IA preenche os nomes, IDs e URLs que o pedido não traz.'],
]

for (const [label, change, field, error] of INPUT_ERRORS) {
  test(`valida a entrada: ${label}`, async () => {
    const { response, data, text } = await run({ ...payload('openai'), ...change, stream: true })
    assert.equal(response.status, 400)
    assert.match(response.headers.get('content-type'), /^application\/json/)
    assert.deepEqual(data, { success: false, code: 'invalid_request', error, field })
    assert.equal(calls.length, 0)
    assert.equal(text.includes(KEYS.openai), false)
  })
}

test('aceita quantidade personalizada, imagem sem descrição e campos opcionais ausentes', async () => {
  responder = () => reply.openai(JSON.stringify(RI))
  const { data } = await run({ provider: 'openai', model: MODELS.openai, apiKey: KEYS.openai, prompt: '', image: PNG, size: 'custom', count: '12' })
  assert.equal(data.success, true)
  assert.match(userText(calls[0]), /12/)
})

test('recusa corpo que não é JSON, JSON inválido e corpo grande demais', async () => {
  let result = await run('{"provider":"openai"}', { headers: { 'content-type': 'text/plain' } })
  assert.equal(result.response.status, 415)
  assert.equal(result.data.code, 'unsupported_media')
  result = await run('{"provider":', {})
  assert.equal(result.response.status, 400)
  assert.deepEqual(result.data, { success: false, code: 'invalid_request', error: 'Não foi possível ler a solicitação.' })
  result = await run('[1,2]', {})
  assert.equal(result.response.status, 400)
  result = await run({ ...payload('openai'), prompt: 'a'.repeat(9 * 1024 * 1024) })
  assert.equal(result.response.status, 413)
  assert.deepEqual(result.data, { success: false, code: 'payload_too_large', error: 'A solicitação é grande demais.' })
  assert.equal(calls.length, 0)
})

const LISTINGS = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    auth: (key) => ({ authorization: `Bearer ${key}` }),
    body: {
      object: 'list',
      data: [
        { id: 'gpt-6.1-sol', created: 1790000000 },
        { id: 'gpt-12-teste', created: 1795000000 },
        { id: 'gpt-6-astra', created: 1789000000 },
        { id: 'gpt-5-mini', created: 1750000000 },
        { id: 'o3-mini', created: 1740000000 },
        { id: 'gpt-6-astra-2026-09-01', created: 1789000001 },
        { id: 'text-embedding-3-large', created: 1700000000 },
        { id: 'gpt-4o-realtime-preview', created: 1730000000 },
        { id: 'gpt-image-1', created: 1745000000 },
        { id: 'whisper-1', created: 1600000000 },
        { id: 'gpt-6-codex', created: 1790000001 },
        { id: 'o1-mini', created: 1720000000 },
        { id: 'gpt-4o', created: 1715000000, shutdown_date: '2020-01-01' },
      ],
    },
    expected: [
      { id: 'gpt-12-teste', name: 'gpt-12-teste', vision: true },
      { id: 'gpt-6.1-sol', name: 'gpt-6.1-sol', vision: true },
      { id: 'gpt-6-astra', name: 'gpt-6-astra', vision: true },
      { id: 'gpt-5-mini', name: 'gpt-5-mini', vision: true },
      { id: 'o3-mini', name: 'o3-mini', vision: false },
    ],
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models?limit=1000',
    auth: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: {
      data: [
        { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-10-07T00:00:00Z', lifecycle: 'active', capabilities: { image_input: { supported: true }, structured_outputs: { supported: true } } },
        { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-28T00:00:00Z', lifecycle: 'active', capabilities: null },
        { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-22T00:00:00Z', lifecycle: 'active', capabilities: { image_input: { supported: true }, structured_outputs: { supported: true } } },
        { type: 'model', id: 'claude-legado-4', display_name: 'Claude Legado 4', created_at: '2025-01-01T00:00:00Z', lifecycle: 'deprecated' },
        { type: 'model', id: 'claude-texto-1', display_name: 'Claude Texto', created_at: '2025-02-01T00:00:00Z', lifecycle: 'active', capabilities: { image_input: { supported: false }, structured_outputs: { supported: true } } },
        { type: 'model', id: 'claude-sem-formato', display_name: 'Claude Sem Formato', created_at: '2025-03-01T00:00:00Z', lifecycle: 'active', capabilities: { structured_outputs: { supported: false } } },
      ],
      has_more: false,
      last_id: 'claude-sem-formato',
    },
    expected: [
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', vision: true },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', vision: true },
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', vision: true },
      { id: 'claude-texto-1', name: 'Claude Texto', vision: false },
    ],
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    auth: (key) => ({ 'x-goog-api-key': key }),
    body: {
      models: [
        { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.10-flash', displayName: 'Gemini 3.10 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', displayName: 'Gemini Embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3.8-flash-image', displayName: 'Gemini Image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash-tts', displayName: 'Gemini TTS', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemma-4-27b', displayName: 'Gemma', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-5', displayName: 'Imagen', supportedGenerationMethods: ['predict'] },
      ],
    },
    expected: [
      { id: 'gemini-3.10-flash', name: 'Gemini 3.10 Flash', vision: true },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', vision: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', vision: true },
    ],
  },
  xai: {
    url: 'https://api.x.ai/v1/language-models',
    auth: (key) => ({ authorization: `Bearer ${key}` }),
    body: {
      models: [
        { id: 'grok-4.3', created: 1780000000, input_modalities: ['text', 'image'], output_modalities: ['text'] },
        { id: 'grok-4.7', created: 1790000000, input_modalities: ['text', 'image'], output_modalities: ['text'] },
        { id: 'grok-code-2', created: 1785000000, input_modalities: ['text'], output_modalities: ['text'] },
        { id: 'grok-imagine', created: 1786000000, input_modalities: ['text'], output_modalities: ['image'] },
      ],
    },
    expected: [
      { id: 'grok-4.7', name: 'grok-4.7', vision: true },
      { id: 'grok-code-2', name: 'grok-code-2', vision: false },
      { id: 'grok-4.3', name: 'grok-4.3', vision: true },
    ],
  },
}

for (const [provider, spec] of Object.entries(LISTINGS)) {
  test(`lista os modelos da ${provider} pela URL oficial, filtrados e ordenados`, async () => {
    responder = () => new Response(JSON.stringify(spec.body), { status: 200, headers: { 'content-type': 'application/json' } })
    const { response, data, text } = await list({ provider, apiKey: KEYS[provider] })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(data, { models: spec.expected })
    assertNoKey(text, KEYS[provider])
    assert.equal(calls.length, 1)
    const [call] = calls
    assert.equal(call.url, spec.url)
    assert.equal(call.init.method, 'GET')
    assert.equal(call.init.redirect, 'error')
    assert.ok(call.init.signal instanceof AbortSignal)
    for (const [name, value] of Object.entries(spec.auth(KEYS[provider]))) assert.equal(call.headers[name], value)
    const authHeaders = ['authorization', 'x-api-key', 'x-goog-api-key'].filter((name) => call.headers[name] !== undefined)
    assert.equal(authHeaders.length, 1)
  })
}

test('segue a paginação da Anthropic e do Google com tokens codificados, até 5 páginas', async () => {
  responder = (call, index) => new Response(JSON.stringify({ data: [{ id: `claude-pagina-${index}`, display_name: `Página ${index}`, created_at: `2026-0${index + 1}-01T00:00:00Z` }], has_more: true, last_id: `id&${index}` }), { status: 200 })
  let result = await list({ provider: 'anthropic', apiKey: KEYS.anthropic })
  assert.equal(calls.length, 5)
  assert.equal(calls[1].url, 'https://api.anthropic.com/v1/models?limit=1000&after_id=id%260')
  assert.deepEqual(result.data.models.map((model) => model.id), ['claude-pagina-4', 'claude-pagina-3', 'claude-pagina-2', 'claude-pagina-1', 'claude-pagina-0'])

  calls.length = 0
  responder = (call, index) => new Response(JSON.stringify({ models: [{ name: `models/gemini-${index}.0-flash`, displayName: `Gemini ${index}`, supportedGenerationMethods: ['generateContent'] }], ...(index < 2 ? { nextPageToken: `t/${index}?x=1` } : {}) }), { status: 200 })
  result = await list({ provider: 'google', apiKey: KEYS.google })
  assert.equal(calls.length, 3)
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=t%2F0%3Fx%3D1')
  assert.deepEqual(result.data.models.map((model) => model.id), ['gemini-2.0-flash', 'gemini-1.0-flash', 'gemini-0.0-flash'])
})

test('limita a lista a 200 modelos sem repetir', async () => {
  const data = Array.from({ length: 260 }, (_, index) => ({ id: `gpt-5-teste-${index}`, created: 1700000000 + index }))
  data.push({ id: 'gpt-5-teste-259', created: 1 })
  responder = () => new Response(JSON.stringify({ data }), { status: 200 })
  const result = await list({ provider: 'openai', apiKey: KEYS.openai })
  assert.equal(result.data.models.length, 200)
  assert.equal(result.data.models[0].id, 'gpt-5-teste-259')
  assert.equal(new Set(result.data.models.map((model) => model.id)).size, 200)
})

const LISTING_ERRORS = [
  ['openai', 401, { error: { message: `Incorrect API key provided: ${KEYS.openai}`, type: 'invalid_request_error' } }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave da OpenAI e tente novamente.'],
  ['google', 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave do Google e tente novamente.'],
  ['xai', 400, { code: 'Client specified an invalid argument', error: 'Incorrect API key provided: xa***mn.' }, 'invalid_key', 'A chave da API foi recusada.', 'Confira a chave da xAI e tente novamente.'],
  ['anthropic', 403, { type: 'error', error: { type: 'permission_error', message: 'Your organization does not have access.' } }, 'forbidden', 'A chave não tem acesso à lista de modelos.', 'Verifique as permissões da conta da Anthropic.'],
  ['anthropic', 403, { type: 'error', error: { type: 'permission_error', message: 'Your API key does not have permission to use the specified resource.' } }, 'forbidden', 'A chave não tem acesso à lista de modelos.', 'Verifique as permissões da conta da Anthropic.'],
  ['xai', 403, { code: 'The caller does not have permission to execute the specified operation', error: "Your newly created teams doesn't have any credits yet. You can purchase credits on https://console.x.ai/team/00000000-0000-0000-0000-000000000000." }, 'billing', 'Saldo insuficiente na conta do provedor.', 'Adicione créditos na conta da xAI e tente novamente.'],
  ['openai', 429, { error: { message: 'Rate limit reached' } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde alguns instantes ou verifique os créditos da conta da OpenAI.'],
  ['google', 429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.8-flash\nPlease retry in 38.2s.', status: 'RESOURCE_EXHAUSTED' } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde cerca de 39 segundos e tente novamente. Se o limite continuar, verifique o plano da conta do Google.'],
  ['google', 429, { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' }] } }, 'rate_limit', 'Limite de uso atingido no provedor.', 'Aguarde cerca de 12 segundos e tente novamente. Se o limite continuar, verifique o plano da conta do Google.'],
  ['openai', 429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } }, 'billing', 'Saldo insuficiente na conta do provedor.', 'Adicione créditos na conta da OpenAI e tente novamente.'],
  ['anthropic', 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'provider_unavailable', 'O provedor está indisponível no momento.', 'Tente novamente em alguns instantes.'],
  ['openai', 400, { error: { message: `Bad request for ${KEYS.openai}` } }, 'provider_error', 'O provedor recusou a solicitação.', 'Detalhe do provedor: Bad request for [chave oculta]'],
]

for (const [provider, status, body, code, error, details] of LISTING_ERRORS) {
  test(`busca de modelos mapeia HTTP ${status} da ${provider} para ${code}`, async () => {
    responder = () => errorResponse(status, body)
    const { response, data, text } = await list({ provider, apiKey: KEYS[provider] })
    assert.equal(response.status, 502)
    assert.deepEqual(data, { code, error, details })
    assertNoKey(text, KEYS[provider])
  })
}

test('busca de modelos trata rede, resposta inválida e entrada inválida', async () => {
  responder = () => {
    throw new TypeError('fetch failed')
  }
  let result = await list({ provider: 'openai', apiKey: KEYS.openai })
  assert.equal(result.response.status, 502)
  assert.equal(result.data.code, 'network')

  responder = () => new Response('<html>erro</html>', { status: 200 })
  result = await list({ provider: 'openai', apiKey: KEYS.openai })
  assert.equal(result.response.status, 502)
  assert.equal(result.data.code, 'provider_error')

  calls.length = 0
  responder = null
  result = await list({ provider: 'mistral', apiKey: KEYS.openai })
  assert.deepEqual(result.data, { code: 'invalid_request', error: 'Escolha um provedor de IA suportado.', field: 'provider' })
  result = await list({ provider: 'openai', apiKey: '' })
  assert.deepEqual(result.data, { code: 'invalid_request', error: 'Informe a chave da API.', field: 'apiKey' })
  const response = await listing.POST(request('/api/ai-models', '{}', { headers: { 'content-type': 'text/plain' } }))
  assert.equal(response.status, 415)
  assert.equal(calls.length, 0)
})

test('as predefinições de cada provedor passam na validação de modelo da rota', async () => {
  for (const provider of PROVIDERS) {
    assert.ok(provider.presets.length >= 2)
    for (const preset of provider.presets) {
      calls.length = 0
      responder = () => reply[provider.id](JSON.stringify(RI))
      const { data } = await run({ ...payload(provider.id), model: preset.id })
      assert.equal(data.success, true, `${provider.id} ${preset.id}`)
      assert.equal(data.model.id, preset.id)
    }
  }
})

const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')

const OPEN_FLOW = finalizeFlow(assembleFlow(RI, { now: new Date('2026-10-13T12:00:00.000Z') })).flow
const OPEN_MENU = OPEN_FLOW.nodes.find((node) => node.data.type === 'envio_mensagem')
const OPEN_AGENDA = OPEN_FLOW.nodes.find((node) => node.data.type === 'departamentos')
const OPEN_BYE = OPEN_FLOW.nodes.find((node) => node.data.data.template === RI.nodes[3].config[0].value)
const EDIT_DELTA = {
  name: '',
  description: '',
  nodes: [
    { id: OPEN_MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Financeiro' }, { text: 'Encerrar' }]) }] },
    { id: 'fin', type: 'departamentos', config: [{ key: 'departamento', value: '30' }, { key: 'name', value: 'Financeiro' }] },
  ],
  edges: [
    { from: OPEN_MENU.id, output: 'Agendar consulta', to: OPEN_AGENDA.id },
    { from: OPEN_MENU.id, output: 'Financeiro', to: 'fin' },
    { from: OPEN_MENU.id, output: 'Encerrar', to: OPEN_BYE.id },
  ],
}

test('a rota edita o fluxo aberto com mode edit e base, em JSON e em NDJSON', async () => {
  responder = () => reply.openai(JSON.stringify(EDIT_DELTA))
  const { response, data, text } = await run(payload('openai', { mode: 'edit', base: OPEN_FLOW, prompt: 'Adicione a opção Financeiro.' }))
  assert.equal(response.status, 200)
  assert.equal(data.success, true)
  assert.equal(data.mode, 'edit')
  assert.deepEqual(data.changes, { added: 1, changed: 1, removed: 0 })
  assert.equal(data.workflow.nodes.length, OPEN_FLOW.nodes.length + 1)
  for (const node of OPEN_FLOW.nodes.filter((entry) => entry.id !== OPEN_MENU.id)) assert.equal(JSON.stringify(data.workflow.nodes.find((entry) => entry.id === node.id)), JSON.stringify(node))
  assert.deepEqual(validateFlow(data.workflow).filter((issue) => issue.severity === 'error'), [])
  assert.match(userText(calls[0]), /Modo de edição/)
  assertNoKey(text, KEYS.openai)

  calls.length = 0
  responder = () => reply.anthropic(JSON.stringify(EDIT_DELTA))
  const streamed = await run(payload('anthropic', { mode: 'edit', base: OPEN_FLOW, prompt: 'Adicione a opção Financeiro.', stream: true }))
  const lines = events(streamed.data)
  const result = lines.at(-1)
  assert.equal(result.type, 'result')
  assert.equal(result.result.mode, 'edit')
  assert.deepEqual(result.result.changes, { added: 1, changed: 1, removed: 0 })
  assert.ok(lines.some((line) => line.type === 'progress'))
  assertNoKey(streamed.text, KEYS.anthropic)
})

test('a rota valida mode desconhecido e base ausente ou inválida no campo certo, sem chamar o provedor', async () => {
  responder = () => reply.openai(JSON.stringify(EDIT_DELTA))
  let result = await run(payload('openai', { mode: 'remix' }))
  assert.equal(result.response.status, 400)
  assert.deepEqual(result.data, { success: false, code: 'invalid_request', error: 'Escolha criar um fluxo novo ou editar o fluxo aberto.', field: 'mode' })
  result = await run(payload('openai', { mode: 'edit' }))
  assert.equal(result.response.status, 400)
  assert.deepEqual(result.data, { success: false, code: 'invalid_request', error: 'Abra um fluxo para editar.', field: 'base' })
  for (const base of [{ nodes: 'x' }, 'não é json', { ...OPEN_FLOW, edges: [{ id: 'e', type: 'deletable', source: 'inicio', sourceHandle: 'output-0', target: 'fantasma' }] }]) {
    result = await run(payload('openai', { mode: 'edit', base }))
    assert.equal(result.response.status, 400)
    assert.equal(result.data.field, 'base')
    assert.equal(result.data.error, 'Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo.')
  }
  assert.equal(calls.length, 0)
  responder = () => reply.openai(JSON.stringify(RI))
  result = await run(payload('openai', { mode: 'create', base: { qualquer: true } }))
  assert.equal(result.response.status, 200)
  assert.equal(result.data.success, true)
  assert.equal(result.data.mode, undefined)
})

test('a rota repassa fill: com preenchimento o ID recebe valor provisório e sem preenchimento fica em branco como dado da plataforma', async () => {
  responder = () => reply.openai(JSON.stringify(RI))
  const filled = await run(payload('openai'))
  assert.equal(filled.response.status, 200)
  const department = (data) => data.workflow.nodes.find((node) => node.data.type === 'departamentos').data.data
  assert.equal(department(filled.data).departamento, 'agendamento')
  assert.ok(filled.data.issues.some((issue) => issue.message === 'Confira: ID do departamento provisório, troque pelo valor cadastrado na plataforma.'))
  assert.match(userText(calls[0]), /Preencha todos os campos de todos os componentes/)

  calls.length = 0
  const plain = await run(payload('openai', { fill: false }))
  assert.equal(plain.response.status, 200)
  assert.equal(department(plain.data).departamento ?? '', '')
  assert.ok(plain.data.issues.some((issue) => issue.scope === 'plataforma' && issue.message === 'Informe o ID do departamento.'))
  assert.equal(plain.data.issues.some((issue) => issue.message.startsWith('Confira:')), false)
  assert.match(userText(calls[0]), /use só o que o pedido informar/)
  assert.doesNotMatch(userText(calls[0]), /Preencha todos os campos de todos os componentes/)
  assertNoKey(plain.text, KEYS.openai)

  calls.length = 0
  responder = () => reply.openai(JSON.stringify(EDIT_DELTA))
  const edited = await run(payload('openai', { mode: 'edit', base: OPEN_FLOW, prompt: 'Adicione a opção Financeiro.', fill: false }))
  assert.equal(edited.response.status, 200)
  assert.equal(edited.data.mode, 'edit')
  assert.match(userText(calls[0]), /use só o que o pedido informar/)
})
