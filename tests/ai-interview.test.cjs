const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

globalThis.fetch = async () => {
  throw new Error('rede global bloqueada nos testes da conversa')
}

const { zodSchema } = require('ai')
const { interviewTurn, interviewSystemPrompt, copilotSystemPrompt, interviewMessages, interviewFlowSummary, interviewSchema, copilotSchema, settleTurn, placeGiven, INTERVIEW_SCHEMA_NAME, SUGGESTION_LIMITS, PICK_LIMITS, PLACE_LABEL, PLACE_PROPOSED, PLACE_ASK, ARRANGE_LOST } = require('../lib/atendimento/ai/interview.ts')
const { ARRANGE_LIMIT } = require('../lib/atendimento/ai/arrange.ts')
const { RI_LIMITS } = require('../lib/atendimento/ai/contracts.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { componentCatalog, START_TYPE, NOTE_TYPE } = require('../lib/atendimento/catalog.ts')
const { newNode, importFlow, outputHandles } = require('../lib/atendimento/format.ts')

const NOW = new Date('2026-10-13T12:00:00.000Z')
const PROVIDERS = ['openai', 'anthropic', 'google', 'xai']
const KEYS = {
  openai: 'sk-test-0123456789abcdefghijklmnop',
  anthropic: 'sk-ant-test-0123456789abcdefghijkl',
  google: 'AIzaTest0123456789abcdefghijklmnop',
  xai: 'xai-test-0123456789abcdefghijklmn',
}
const MODELS = { openai: 'gpt-6-luna', anthropic: 'claude-opus-5-5', google: 'gemini-3.8-flash', xai: 'grok-4.7' }
const URLS = {
  openai: 'https://api.openai.com/v1/responses',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
  xai: 'https://api.x.ai/v1/responses',
}

const RI = {
  name: 'Boletos Lucas Lima',
  description: 'Envio de boleto',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Lucas Lima.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Segunda via do boleto' }, { text: 'Encerrar' }]) }] },
    { id: 'financeiro', type: 'departamentos', config: [{ key: 'departamento', value: 'financeiro' }, { key: 'name', value: 'Financeiro' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato. Até logo.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Segunda via do boleto', to: 'financeiro' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const FLOW = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(RI, { now: NOW })).flow)))

const ASK = {
  message: 'Pensei em um menu com Segunda via do boleto, Já paguei e Falar com o financeiro. Fica assim?',
  suggestions: ['Pode ser assim', 'Quero mudar as opções', 'Pode montar o fluxo'],
  action: 'ask',
  plan: 'Atendimento de envio de boleto. Menu principal com Segunda via do boleto, Já paguei e Falar com o financeiro.',
}

const calls = []
afterEach(() => {
  calls.length = 0
})

function pieces(text, size = 48) {
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts.length ? parts : ['']
}

function sse(events) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const reply = {
  openai(text) {
    return sse([
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.openai } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      ...pieces(text).map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', delta })),
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      { type: 'response.completed', response: { incomplete_details: null, usage: { input_tokens: 11, output_tokens: 22 } } },
    ])
  },
  anthropic(text) {
    return sse([
      { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage: { input_tokens: 11 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      ...pieces(text).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } },
      { type: 'message_stop' },
    ])
  },
  google(text) {
    return sse([
      ...pieces(text).map((part) => ({ candidates: [{ content: { role: 'model', parts: [{ text: part }] } }] })),
      { candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 } },
    ])
  },
  xai(text) {
    return sse([
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.xai, object: 'response', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
      ...pieces(text).map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta })),
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] } },
      { type: 'response.completed', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.xai, object: 'response', status: 'completed', incomplete_details: null, output: [], usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 } } },
    ])
  },
}

const KEY_ERRORS = {
  openai: { status: 401, body: { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } } },
  anthropic: { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } },
  google: { status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } },
  xai: { status: 400, body: { code: 'Client specified an invalid argument', error: 'Incorrect API key provided: xa***mn. You can obtain an API key from https://console.x.ai.' } },
}

function mock(responder) {
  return async function fetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const call = { url, init, headers: Object.fromEntries(new Headers(init.headers).entries()), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }
    calls.push(call)
    return responder(call, calls.length - 1)
  }
}

function input(provider, extra = {}) {
  return { provider, model: MODELS[provider], apiKey: KEYS[provider], effort: 'medium', history: [{ role: 'user', text: 'Crie um fluxo de envio de boleto.' }], ...extra }
}

function hooks(responder, extra = {}) {
  return { transport: 'browser', signal: new AbortController().signal, fetch: mock(responder), ...extra }
}

function bodyText(call) {
  return JSON.stringify(call.body)
}

function walkSchema(schema, visit, trail = '$') {
  if (!schema || typeof schema !== 'object') return
  visit(schema, trail)
  for (const [key, value] of Object.entries(schema.properties ?? {})) walkSchema(value, visit, `${trail}.${key}`)
  if (schema.items) walkSchema(schema.items, visit, `${trail}[]`)
}

test('o módulo da conversa não usa console, armazenamento, ambiente, comentários nem travessões', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/atendimento/ai/interview.ts'), 'utf8')
  assert.equal(/console\./.test(source), false)
  assert.equal(/localStorage|sessionStorage|indexedDB|process\.env/.test(source), false)
  assert.equal(/\/\/\s|\/\*/.test(source.replace(/https?:\/\//g, '')), false)
  assert.ok(!/[—–]/.test(source))
})

test('o esquema da conversa é portátil: objeto estrito, todos os campos obrigatórios, sem uniões nem formatos', () => {
  const { jsonSchema } = zodSchema(interviewSchema)
  const forbidden = ['anyOf', 'oneOf', 'allOf', '$ref', 'not', 'format', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'default', 'nullable', 'const']
  let objects = 0
  walkSchema(jsonSchema, (schema, trail) => {
    for (const key of forbidden) assert.equal(schema[key], undefined, `${trail} ${key}`)
    if (schema.type === 'object') {
      objects++
      assert.equal(schema.additionalProperties, false, trail)
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), trail)
    }
  })
  assert.equal(objects, 1)
  assert.deepEqual(Object.keys(jsonSchema.properties).sort(), ['action', 'message', 'plan', 'suggestions'])
  assert.deepEqual(jsonSchema.properties.action.enum, ['ask', 'generate', 'edit', 'finish'])
  assert.equal(jsonSchema.properties.suggestions.items.type, 'string')
  assert.equal(INTERVIEW_SCHEMA_NAME, 'turno_conversa')
})

test('o prompt conduz a conversa por assunto, conhece os componentes e segue o estilo sem travessão nem exclamação', () => {
  const prompt = interviewSystemPrompt()
  assert.equal(prompt, interviewSystemPrompt())
  assert.ok(!/[—–!]/.test(prompt), 'travessão ou exclamação no prompt')
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(prompt), 'emoji no prompt')
  for (const topic of ['boas-vindas', 'horário de atendimento', 'opções do menu principal', 'o que acontece em cada opção', 'dados a coletar', 'integrações', 'departamento de cada transferência', 'encerramento e pesquisa de satisfação']) assert.ok(prompt.includes(topic), topic)
  for (const action of ['- ask:', '- generate:', '- edit:', '- finish:']) assert.ok(prompt.includes(action), action)
  assert.match(prompt, /de 2 a 5 sugestões/)
  assert.match(prompt, /precisa de mais alguma coisa/)
  assert.match(prompt, /Atualize plan em toda resposta/)
  assert.match(prompt, /Português do Brasil, cordial e direto/)
  assert.ok(!/\b(Nunca|Não use|Evite)\b/.test(prompt), 'regra em forma negativa')
  const listed = componentCatalog.filter((definition) => ![START_TYPE, NOTE_TYPE].includes(definition.nativeType ?? definition.id))
  assert.equal(listed.length, 60)
  for (const definition of listed) assert.ok(prompt.includes(`- ${definition.label}`), definition.label)
  assert.ok(prompt.length < 16000, String(prompt.length))
})

for (const provider of PROVIDERS) {
  test(`${provider}: devolve a pergunta com sugestões e manda histórico, prompt e esquema no corpo`, async () => {
    const history = [
      { role: 'user', text: 'Crie um fluxo de envio de boleto.' },
      { role: 'assistant', text: 'Qual mensagem de boas-vindas você quer?' },
      { role: 'user', text: 'Olá, aqui é a Lucas Lima.' },
    ]
    const partials = []
    const result = await interviewTurn(input(provider, { history }), hooks(() => reply[provider](JSON.stringify(ASK)), { onPartial: (turn) => partials.push(turn) }))
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(result.turn, ASK)
    assert.equal(calls.length, 1)
    const [call] = calls
    assert.equal(call.url, URLS[provider])
    const body = bodyText(call)
    for (const message of history) assert.ok(body.includes(JSON.stringify(message.text).slice(1, -1)), message.text)
    assert.ok(body.includes('Não há fluxo aberto no editor'))
    assert.ok(body.includes('Preenchimento ligado'))
    assert.ok(body.includes('Como conduzir a conversa'))
    assert.ok(body.includes('turno_conversa') || provider === 'google' || provider === 'anthropic', 'nome do esquema')
    assert.ok(!JSON.stringify(result).includes(KEYS[provider]))
    assert.ok(partials.length > 1)
    assert.ok(partials.some((turn) => typeof turn.message === 'string' && turn.message.length < ASK.message.length))
  })
}

test('cada provedor recebe o esquema estrito como saída estruturada', async () => {
  const read = {
    openai: (body) => [body.text.format.type, body.text.format.strict, body.text.format.schema.properties.action.enum],
    anthropic: (body) => [body.output_config.format.type, true, body.output_config.format.schema.properties.action.enum],
    google: (body) => [body.generationConfig.responseMimeType === 'application/json' ? 'json_schema' : '', true, body.generationConfig.responseSchema.properties.action.enum],
    xai: (body) => [body.text.format.type, body.text.format.strict, body.text.format.schema.properties.action.enum],
  }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(input(provider), hooks(() => reply[provider](JSON.stringify(ASK))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(read[provider](calls[0].body), ['json_schema', true, ['ask', 'generate', 'edit', 'finish']], provider)
  }
})

test('generate traz o plano completo quando não há fluxo aberto', async () => {
  const plan = 'Atendimento de envio de boleto da Lucas Lima. Boas-vindas com o nome do contato. Menu com Segunda via do boleto e Encerrar. Segunda via pede o CPF e envia os boletos.'
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(input(provider), hooks(() => reply[provider](JSON.stringify({ message: 'Vou montar o fluxo agora.', suggestions: [], action: 'generate', plan }))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(result.turn, { message: 'Vou montar o fluxo agora.', suggestions: [], action: 'generate', plan }, provider)
  }
})

test('edit com fluxo aberto manda o resumo do fluxo e devolve o pedido de mudança', async () => {
  const plan = 'Adicionar ao menu a opção Já paguei, que agradece e volta ao menu.'
  for (const provider of PROVIDERS) {
    calls.length = 0
    const history = [
      { role: 'user', text: 'Crie um fluxo de envio de boleto.' },
      { role: 'assistant', text: 'Fluxo montado com 5 componentes.' },
      { role: 'user', text: 'Quero uma opção Já paguei.' },
    ]
    const result = await interviewTurn(input(provider, { history, flow: FLOW }), hooks(() => reply[provider](JSON.stringify({ message: 'Vou incluir a opção Já paguei.', suggestions: [], action: 'edit', plan }))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(result.turn, { message: 'Vou incluir a opção Já paguei.', suggestions: [], action: 'edit', plan }, provider)
    const body = bodyText(calls[0])
    assert.ok(body.includes('Há um fluxo aberto no editor'), provider)
    assert.ok(body.includes('Resumo do fluxo aberto'), provider)
    assert.ok(body.includes('Segunda via do boleto'), provider)
    assert.ok(body.includes('Financeiro'), provider)
  }
})

test('finish devolve a despedida sem sugestões', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const history = [{ role: 'user', text: 'Crie um fluxo de boleto.' }, { role: 'assistant', text: 'Precisa de mais alguma coisa?' }, { role: 'user', text: 'Não, é só isso.' }]
    const result = await interviewTurn(input(provider, { history, flow: FLOW }), hooks(() => reply[provider](JSON.stringify({ message: 'Combinado, o fluxo está pronto. Até logo.', suggestions: ['Abrir de novo'], action: 'finish', plan: '' }))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(result.turn, { message: 'Combinado, o fluxo está pronto. Até logo.', suggestions: [], action: 'finish', plan: '' }, provider)
  }
})

test('chave recusada vira falha em PT-BR nos 4 provedores, sem a chave', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const { status, body } = KEY_ERRORS[provider]
    const result = await interviewTurn(input(provider), hooks(() => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })))
    assert.equal(result.ok, false, provider)
    assert.equal(result.failure.code, 'invalid_key', provider)
    assert.equal(result.failure.error, 'A chave da API foi recusada.', provider)
    assert.match(result.failure.details, /^Confira a chave (da|do) /, provider)
    assert.ok(!JSON.stringify(result).includes(KEYS[provider]), provider)
    assert.equal(calls.length, 1, provider)
  }
})

test('a Anthropic no navegador recebe o cabeçalho de acesso direto, sem user-agent, e o esforço vai no corpo', async () => {
  const result = await interviewTurn(input('anthropic', { effort: 'high' }), hooks(() => reply.anthropic(JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  assert.equal(calls[0].headers['anthropic-dangerous-direct-browser-access'], 'true')
  assert.equal(calls[0].headers['x-api-key'], KEYS.anthropic)
  assert.equal(calls[0].headers['user-agent'], undefined)
  assert.equal(calls[0].body.output_config.effort, 'high')
  calls.length = 0
  await interviewTurn(input('anthropic'), hooks(() => reply.anthropic(JSON.stringify(ASK)), { transport: 'server' }))
  assert.equal(calls[0].headers['anthropic-dangerous-direct-browser-access'], undefined)
  calls.length = 0
  await interviewTurn(input('openai', { effort: 'max' }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.equal(calls[0].body.reasoning.effort, 'max')
})

test('o histórico chega ao provedor em ordem, com papéis alternados, e termina com o usuário', async () => {
  const history = [
    { role: 'assistant', text: 'Olá. O que você quer montar?' },
    { role: 'user', text: 'Um fluxo de boleto.' },
    { role: 'user', text: 'Com horário comercial.' },
    { role: 'assistant', text: 'Fluxo montado com 8 componentes.' },
  ]
  const result = await interviewTurn(input('openai', { history }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  const roles = calls[0].body.input.map((message) => message.role)
  assert.deepEqual(roles, ['developer', 'developer', 'user', 'assistant', 'user'])
  const texts = calls[0].body.input.slice(2).map((message) => JSON.stringify(message.content))
  assert.match(texts[0], /Um fluxo de boleto\.\\n\\nCom horário comercial\./)
  assert.match(texts[1], /Fluxo montado com 8 componentes/)
  assert.match(texts[2], /Continue a conversa/)
  assert.ok(!bodyText(calls[0]).includes('O que você quer montar'))
})

test('com o preenchimento desligado o prompt pede os valores cadastrados', async () => {
  const result = await interviewTurn(input('google', { fill: false }), hooks(() => reply.google(JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  const body = bodyText(calls[0])
  assert.ok(body.includes('Preenchimento desligado'))
  assert.ok(!body.includes('Preenchimento ligado'))
})

test('a ação segue o fluxo aberto: generate vira edit com fluxo e edit vira generate sem fluxo', async () => {
  let result = await interviewTurn(input('openai', { flow: FLOW }), hooks(() => reply.openai(JSON.stringify({ message: 'Vou montar.', suggestions: [], action: 'generate', plan: 'Incluir Já paguei.' }))))
  assert.equal(result.turn.action, 'edit')
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks(() => reply.openai(JSON.stringify({ message: 'Vou mudar.', suggestions: [], action: 'edit', plan: '' }))))
  assert.equal(result.turn.action, 'generate')
  assert.equal(result.turn.plan, 'Crie um fluxo de envio de boleto.')
  calls.length = 0
  const empty = { ...FLOW, nodes: FLOW.nodes.filter((node) => node.data.type === START_TYPE), edges: [] }
  await interviewTurn(input('openai', { flow: empty }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.ok(bodyText(calls[0]).includes('Não há fluxo aberto no editor'))
})

test('a fala é limpa de exclamação, travessão e emoji e as sugestões ficam entre 1 e 5, curtas e sem repetição', () => {
  const turn = settleTurn({
    message: 'Ótimo! Vamos lá — qual é o horário? 😀',
    suggestions: ['Pode ser assim.', 'pode ser assim', '  ', 'Das 8h às 18h', 'Sábado também', 'Pode montar o fluxo', 'Outra', 'Mais uma', 'x'.repeat(200)],
    action: 'ask',
    plan: 'Plano',
  }, { hasFlow: false, history: [] })
  assert.equal(turn.message, 'Ótimo. Vamos lá, qual é o horário?')
  assert.deepEqual(turn.suggestions, ['Pode ser assim', 'Das 8h às 18h', 'Sábado também', 'Pode montar o fluxo', 'Outra'])
  assert.equal(SUGGESTION_LIMITS.max, 5)
  const long = settleTurn({ message: '', suggestions: [], action: 'generate', plan: 'a '.repeat(6000) }, { hasFlow: false, history: [] })
  assert.ok(long.plan.length <= 8000)
  assert.equal(long.message, 'Vou montar o fluxo com o que combinamos.')
})

test('resposta fora do formato é reparada e, se continuar errada, pede de novo uma vez', async () => {
  let result = await interviewTurn(input('anthropic'), hooks(() => reply.anthropic('```json\n{"mensagem":"Qual horário?","sugestoes":["Comercial"],"acao":"ask","plano":"Boleto"}\n```')))
  assert.equal(result.ok, true)
  assert.deepEqual(result.turn, { message: 'Qual horário?', suggestions: ['Comercial'], action: 'ask', plan: 'Boleto' })
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks((call, index) => reply.openai(index === 0 ? 'não é JSON' : JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.match(bodyText(calls[1]), /não seguiu o formato pedido/)
})

test('interviewTurn nunca lança: entrada inválida, rede caída e cancelamento viram falhas em PT-BR', async () => {
  let result = await interviewTurn(input('openai', { history: [] }), hooks(() => reply.openai('{}')))
  assert.deepEqual(result, { ok: false, failure: { success: false, code: 'invalid_request', error: 'Escreva o que você precisa no atendimento.', field: 'prompt' } })
  result = await interviewTurn(input('openai', { history: 'oi' }), hooks(() => reply.openai('{}')))
  assert.equal(result.failure.error, 'Não foi possível ler a conversa.')
  result = await interviewTurn(input('openai', { apiKey: '' }), hooks(() => reply.openai('{}')))
  assert.equal(result.failure.field, 'apiKey')
  result = await interviewTurn(input('openai', { effort: 'turbo' }), hooks(() => reply.openai('{}')))
  assert.equal(result.failure.field, 'effort')
  result = await interviewTurn(input('openai', { flow: { nodes: 'x' } }), hooks(() => reply.openai('{}')))
  assert.equal(result.failure.field, 'base')
  result = await interviewTurn(null, hooks(() => reply.openai('{}')))
  assert.equal(result.ok, false)
  assert.equal(calls.length, 0)
  result = await interviewTurn(input('openai'), hooks(() => {
    throw new TypeError('Failed to fetch')
  }))
  assert.equal(result.failure.code, 'network')
  assert.equal(result.failure.error, 'Não foi possível conectar ao provedor.')
  const controller = new AbortController()
  controller.abort()
  result = await interviewTurn(input('openai'), hooks(() => reply.openai(JSON.stringify(ASK)), { signal: controller.signal }))
  assert.deepEqual(result, { ok: false, failure: { success: false, code: 'aborted', error: 'A resposta foi cancelada.' } })
})

test('o resumo do fluxo traz componentes, textos e conexões e fica compacto com 150 componentes', () => {
  const summary = interviewFlowSummary(FLOW)
  assert.match(summary, /Componentes: 5/)
  assert.match(summary, /inicio \(Iniciar Fluxo\) \| -> /)
  assert.match(summary, /\(Menu de Opções\) “Como podemos ajudar\?” opções: Segunda via do boleto, Encerrar \| Segunda via do boleto -> \S+; Encerrar -> \S+/)
  assert.match(summary, /\(Transferir para Departamento\) “Financeiro”/)
  assert.match(summary, /\(Encerrar Conversa\)/)
  const nodes = []
  const edges = [{ from: 'inicio', output: '', to: 'm0' }]
  for (let index = 0; index < 150; index++) {
    nodes.push({ id: `m${index}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Mensagem ${index} com um texto bem mais longo do que cabe no resumo, para conferir que o resumo corta cada texto e continua compacto mesmo com muitos componentes.` }] })
    if (index > 0) edges.push({ from: `m${index - 1}`, output: '', to: `m${index}` })
  }
  const large = finalizeFlow(assembleFlow({ name: 'Grande', description: '', nodes, edges }, { now: NOW })).flow
  const big = interviewFlowSummary(large)
  assert.match(big, /Componentes: 151/)
  assert.equal(big.split('\n').filter((line) => line.startsWith('- ')).length, 152)
  assert.match(big, /“Mensagem 149 com um texto/)
  assert.ok(big.length < 20000, String(big.length))
  const marked = interviewFlowSummary(large, true)
  assert.match(marked, /“Mensagem 149 com um texto [^”]*…” \| -> /)
  assert.equal(marked.split('\n').filter((line) => line.includes('…”')).length, 150)
  assert.ok(marked.length < 20000, String(marked.length))
  const note = newNode('note', { x: 0, y: 0 }, '999')
  note.data.data.text = 'Lembrete.'
  assert.ok(interviewFlowSummary({ ...FLOW, nodes: [...FLOW.nodes, note] }).includes('(Nota)'))
})

const COPILOT_REQUEST = [{ role: 'user', text: 'crie uma opcao 8' }]
const COPILOT_FLOW_MISSING = 'Abra um fluxo para o Copiloto editar.'
const NOTES_HEAD = 'Notas no canvas, anotações do usuário fora do caminho do atendimento:'
const COPILOT_OPENED = 'O fluxo resumido abaixo está aberto no editor, e cada pedido do usuário é uma mudança nesse fluxo.'
const PROPOSAL_NOTICE = 'Há uma proposta em revisão no canvas, ainda não aplicada. O resumo abaixo já inclui essa proposta, e o pedido seguinte ajusta a proposta.'
const BUILDER_FILL = 'Preenchimento ligado: na montagem, nomes cadastrados, IDs e URLs que o usuário não informar recebem valores provisórios, e o editor avisa cada um para ele trocar. Pergunte por esses valores só quando o usuário quiser informar e siga sem eles quando ele preferir.'
const COPILOT_FILL = 'Preenchimento ligado: IDs e URLs que o usuário não informar recebem valores provisórios na edição, e o editor avisa cada um para ele trocar. Os nomes de departamento, tag e fluxo de destino entram na proposta que você confirma com o usuário.'
const PLAIN_FILL = 'Preenchimento desligado: nomes cadastrados, IDs e URLs que o usuário não informar ficam vazios para ele completar no editor. Ao tratar de transferências e integrações, pergunte o nome do departamento cadastrado e a URL da API, e aceite que ele complete depois.'

const copilotInput = (provider, extra = {}) => input(provider, { history: COPILOT_REQUEST, flow: FLOW, scope: 'copilot', ...extra })
const partText = (content) => (typeof content === 'string' ? content : content.map((part) => part.text).join(''))
const lastLine = (text) => text.split('\n').pop()

test('o Copiloto usa o prompt e a situação dele, e a conversa de montagem continua com o prompt e a situação de antes', () => {
  const builder = interviewMessages({ history: COPILOT_REQUEST, flow: FLOW })
  assert.equal(builder.length, 3)
  assert.equal(builder[0].content, interviewSystemPrompt())
  assert.equal(builder[1].content, `# Situação atual\nHá um fluxo aberto no editor, resumido abaixo. Cada pedido vira uma mudança nesse fluxo: quando o pedido estiver completo, devolva edit.\n\n# Resumo do fluxo aberto\n${interviewFlowSummary(FLOW)}\n\n${BUILDER_FILL}`)
  for (const scope of ['builder', 'Copilot', 'copiloto', undefined]) assert.deepEqual(interviewMessages({ history: COPILOT_REQUEST, flow: FLOW, scope, proposal: true }), builder, String(scope))
  assert.ok(!/copiloto|Proposta pronta no canvas/i.test(interviewSystemPrompt()))
  assert.equal(lastLine(interviewMessages({ history: COPILOT_REQUEST, flow: FLOW, fill: false })[1].content), PLAIN_FILL)

  const copilot = interviewMessages({ history: COPILOT_REQUEST, flow: FLOW, scope: 'copilot' })
  assert.equal(copilot[0].content, copilotSystemPrompt())
  assert.notEqual(copilotSystemPrompt(), interviewSystemPrompt())
  assert.equal(copilot[1].content, `# Situação atual\n${COPILOT_OPENED}\n\n# Resumo do fluxo aberto\n${interviewFlowSummary(FLOW)}\n\n${COPILOT_FILL}`)
  assert.deepEqual(copilot.slice(2), [{ role: 'user', content: 'crie uma opcao 8' }])
  assert.equal(lastLine(interviewMessages({ history: COPILOT_REQUEST, flow: FLOW, scope: 'copilot', fill: false })[1].content), PLAIN_FILL)
})

test('a situação do Copiloto avisa que o resumo já inclui a proposta em revisão só com proposal true', () => {
  const state = (proposal) => interviewMessages({ history: COPILOT_REQUEST, flow: FLOW, scope: 'copilot', proposal })[1].content
  assert.ok(state(true).startsWith(`# Situação atual\n${COPILOT_OPENED}\n${PROPOSAL_NOTICE}\n\n# Resumo do fluxo aberto\n${interviewFlowSummary(FLOW)}`))
  assert.ok(!state(false).includes('proposta em revisão'))
  for (const proposal of [undefined, null, 'true', 1, {}]) assert.equal(state(proposal), state(false), String(proposal))
})

test('no Copiloto, generate vira edit, as falas padrão tratam da mudança no fluxo e só ask traz sugestões', async () => {
  const plan = 'No menu Como podemos ajudar?, acrescente a opção 3 Falar com atendente, que transfere para o departamento Atendimento.'
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(copilotInput(provider), hooks(() => reply[provider](JSON.stringify({ message: '', suggestions: ['Pode ser assim'], action: 'generate', plan }))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(result.turn, { message: 'Vou aplicar essa mudança no fluxo.', suggestions: [], action: 'edit', plan }, provider)
    const body = bodyText(calls[0])
    assert.ok(body.includes('Você é o copiloto que edita um fluxo de atendimento'), provider)
    assert.ok(body.includes(COPILOT_OPENED), provider)
    assert.ok(body.includes('Segunda via do boleto'), provider)
    assert.ok(!body.includes('Como conduzir a conversa'), provider)
  }
  const copilot = { hasFlow: false, history: COPILOT_REQUEST, scope: 'copilot' }
  const builder = { hasFlow: false, history: COPILOT_REQUEST }
  assert.equal(settleTurn({ message: 'Vou montar.', suggestions: [], action: 'generate', plan: 'P' }, copilot).action, 'edit')
  assert.equal(settleTurn({ message: 'Vou mudar.', suggestions: [], action: 'edit', plan: 'P' }, copilot).action, 'edit')
  assert.equal(settleTurn({ message: 'Vou montar.', suggestions: [], action: 'generate', plan: 'P' }, builder).action, 'generate')
  assert.deepEqual(settleTurn({ message: '', suggestions: ['Pode ser assim', 'Pode editar agora'], action: 'ask', plan: 'P' }, copilot), { message: 'O que você quer mudar no fluxo?', suggestions: ['Pode ser assim', 'Pode editar agora'], action: 'ask', plan: 'P' })
  assert.deepEqual(settleTurn({ message: '', suggestions: ['Outra'], action: 'edit', plan: '' }, copilot), { message: 'Vou aplicar essa mudança no fluxo.', suggestions: [], action: 'edit', plan: '' })
  assert.deepEqual(settleTurn({ message: '', suggestions: [], action: 'generate', plan: '  ' }, { ...copilot, hasFlow: true }), { message: 'Vou aplicar essa mudança no fluxo.', suggestions: [], action: 'edit', plan: '' })
  assert.equal(settleTurn({ message: 'Vou mudar.', suggestions: [], action: 'edit', plan: '' }, { ...builder, hasFlow: true }).plan, 'crie uma opcao 8')
  assert.equal(settleTurn({ message: 'Vou montar.', suggestions: [], action: 'generate', plan: '' }, builder).plan, 'crie uma opcao 8')
  assert.deepEqual(settleTurn({ message: '', suggestions: ['Outra'], action: 'finish', plan: '' }, copilot), { message: 'Combinado. Quando precisar de outro ajuste, é só escrever aqui.', suggestions: [], action: 'finish', plan: '' })
  assert.equal(settleTurn({ message: '', suggestions: [], action: 'ask', plan: '' }, builder).message, 'Me conte como você quer que o atendimento funcione.')
  assert.deepEqual(settleTurn({ message: 'Vou mudar.', suggestions: ['Outra'], action: 'edit', plan: 'P' }, { ...builder, hasFlow: true }).suggestions, ['Outra'])
})

test('o Copiloto sem fluxo é recusado no campo base, sem chamar o provedor, e o fluxo só com o Início ou com notas segue para a conversa', async () => {
  const empty = { ...FLOW, nodes: FLOW.nodes.filter((node) => node.data.type === START_TYPE), edges: [] }
  const note = newNode('note', { x: 0, y: 0 }, '999')
  note.data.data.text = 'Lembrete.'
  const noted = { ...empty, nodes: [...empty.nodes, note] }
  const missing = { ok: false, failure: { success: false, code: 'invalid_request', error: COPILOT_FLOW_MISSING, field: 'base' } }
  for (const flow of [undefined, null]) {
    assert.deepEqual(await interviewTurn(copilotInput('openai', { flow }), hooks(() => reply.openai(JSON.stringify(ASK)))), missing)
    assert.throws(() => interviewMessages({ history: COPILOT_REQUEST, flow, scope: 'copilot' }), { message: COPILOT_FLOW_MISSING })
  }
  const broken = await interviewTurn(copilotInput('openai', { flow: { nodes: 'x' } }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.deepEqual([broken.failure.field, broken.failure.error], ['base', 'Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo.'])
  const silent = await interviewTurn(copilotInput('openai', { history: [] }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.deepEqual([silent.failure.field, silent.failure.error], ['prompt', 'Escreva o que você precisa no atendimento.'])
  assert.equal(calls.length, 0)
  for (const [flow, notes] of [[empty, false], [noted, true]]) {
    calls.length = 0
    const result = await interviewTurn(copilotInput('openai', { flow }), hooks(() => reply.openai(JSON.stringify(ASK))))
    assert.deepEqual([result.ok, calls.length], [true, 1], String(notes))
    const state = interviewMessages({ history: COPILOT_REQUEST, flow, scope: 'copilot' })[1].content
    assert.ok(state.startsWith(`# Situação atual\n${COPILOT_OPENED}\n\n# Resumo do fluxo aberto\n`), String(notes))
    assert.ok(state.includes('Componentes: 0\n'), String(notes))
    assert.equal(state.includes(`${NOTES_HEAD}\n- “Lembrete.”`), notes)
  }
  calls.length = 0
  const unknown = await interviewTurn(input('openai', { flow: noted, scope: 'outro' }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.equal(unknown.ok, true)
  assert.ok(bodyText(calls[0]).includes('Não há fluxo aberto no editor'))
})

test('o prompt do Copiloto segue as regras da casa: pergunta antes de editar, propõe com sugestões e escreve em forma positiva', () => {
  const prompt = copilotSystemPrompt()
  assert.equal(prompt, copilotSystemPrompt())
  assert.ok(!/[—–!]/.test(prompt), 'travessão ou exclamação no prompt')
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(prompt), 'emoji no prompt')
  assert.ok(!/\b(Nunca|Não use|Evite)\b/.test(prompt), 'regra em forma negativa')
  assert.ok(!/\b(nunca|jamais|evite|proibido)\b|\bnão (faça|use|invente|edite|pergunte|escreva|mude|coloque|repita|deixe|devolva|crie|altere|remova|responda|aplique)\b/i.test(prompt), 'regra em forma negativa')
  assert.match(prompt, /^Você é o copiloto que edita um fluxo de atendimento por WhatsApp já aberto no editor da plataforma de Atendimento\./)
  assert.match(prompt, /a partir do pedido que você escreve em plan/)
  assert.match(prompt, /pergunte antes de editar/)
  assert.match(prompt, /Pergunte propondo/)
  assert.match(prompt, /de 2 a 5 sugestões/)
  assert.match(prompt, /Faça uma pergunta por mensagem/)
  assert.match(prompt, /Atualize plan em toda resposta/)
  assert.match(prompt, /Português do Brasil, cordial e direto/)
  assert.ok(prompt.includes('Vou colocar a opção 8 no menu Como podemos ajudar. Pensei em Falar com atendente, que transfere para o departamento Atendimento. Fica assim ou quer outro texto e outro destino?'))
  for (const answer of ['Pode ser assim', 'Pode editar agora', 'Pode editar agora com o que já foi decidido.']) assert.ok(prompt.includes(answer), answer)
  assert.ok(!prompt.includes('Pode fazer assim'))
  assert.match(prompt, /as outras trazem alternativas concretas tiradas do resumo/)
  for (const decision of ['o texto de uma opção nova', 'quando mais de um serve', 'o departamento de uma transferência', 'o horário de atendimento e o que acontece fora dele', 'os dados a coletar', 'a URL e o retorno de uma integração', 'ficam sem caminho', 'conte o que o fluxo faz hoje', 'proponha manter como está']) assert.ok(prompt.includes(decision), decision)
  for (const action of ['- ask:', '- edit:', '- arrange:', '- finish:']) assert.ok(prompt.includes(action), action)
  assert.match(prompt, /Nesta conversa, as ações são ask, edit, arrange e finish\./)
  assert.match(prompt, /- finish: o usuário já tem o que precisa, inclusive quando decide manter o fluxo como está\./)
  assert.ok(!prompt.includes('- generate:'))
  for (const text of ['Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.', 'Organização pronta no canvas: 5 componentes movidos.', 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.', 'Proposta descartada. O fluxo aberto não mudou.', 'Pedido cancelado. O fluxo aberto não mudou.', 'Precisa mudar mais alguma coisa no fluxo?', 'Aplicar']) assert.ok(prompt.includes(text), text)
  const listed = componentCatalog.filter((definition) => ![START_TYPE, NOTE_TYPE].includes(definition.nativeType ?? definition.id))
  for (const definition of listed) assert.ok(prompt.includes(`- ${definition.label}`), definition.label)
  assert.ok(prompt.length < 24000, String(prompt.length))
})

test('interviewMessages traz exatamente o que o provedor recebe no turno do Copiloto', async () => {
  const history = [
    { role: 'user', text: 'crie uma opcao 8' },
    { role: 'assistant', text: 'Vou acrescentar a opção 8 Falar com atendente, que transfere para o departamento Atendimento.' },
    { role: 'assistant', text: 'Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.' },
    { role: 'user', text: 'troque o texto da opção 8 para Atendimento humano' },
  ]
  const expected = interviewMessages({ history, flow: FLOW, scope: 'copilot', proposal: true })
  assert.deepEqual(expected.map((message) => message.role), ['system', 'system', 'user', 'assistant', 'user'])
  assert.equal(expected[3].content, `${history[1].text}\n\n${history[2].text}`)
  assert.ok(expected[1].content.includes(PROPOSAL_NOTICE))
  let result = await interviewTurn(input('openai', { history, flow: FLOW, scope: 'copilot', proposal: true }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  assert.deepEqual(calls[0].body.input.map((message) => [message.role, partText(message.content)]), expected.map((message) => [message.role === 'system' ? 'developer' : message.role, message.content]))
  calls.length = 0
  result = await interviewTurn(input('anthropic', { history, flow: FLOW, scope: 'copilot', proposal: true }), hooks(() => reply.anthropic(JSON.stringify(ASK))))
  assert.equal(result.ok, true)
  const { system, messages } = calls[0].body
  assert.deepEqual(system.map((part) => part.text), [expected[0].content, expected[1].content])
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' })
  assert.deepEqual(messages.map((message) => [message.role, partText(message.content)]), expected.slice(2).map((message) => [message.role, message.content]))
  const cached = { anthropic: { cacheControl: { type: 'ephemeral' } } }
  assert.deepEqual(interviewMessages({ history, flow: FLOW, scope: 'copilot', proposal: true }, cached), [{ ...expected[0], providerOptions: cached }, ...expected.slice(1)])
})

const MENUS_RI = {
  name: 'Atendimento Lucas Lima',
  description: 'Boletos com dois menus',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Lucas Lima.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Boletos' }, { text: 'Encerrar' }]) }] },
    { id: 'boletos', type: 'envio_mensagem', config: [{ key: 'title', value: 'Qual boleto você quer?' }, { key: 'options', value: JSON.stringify([{ text: 'Boleto atual' }, { text: 'Boleto anterior' }]) }] },
    { id: 'link', type: 'envio_pergunta', config: [{ key: 'template', value: 'Acesse https://lucas-lima.xyz/boleto para baixar o boleto.' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato. Até logo.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Boletos', to: 'boletos' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'boletos', output: 'Boleto atual', to: 'link' },
    { from: 'boletos', output: 'Boleto anterior', to: 'link' },
    { from: 'link', output: '', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const MENUS = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(MENUS_RI, { now: NOW })).flow)))
const MENUS_IDS = MENUS.nodes.map((node) => node.id)
const MENU_IDS = MENUS.nodes.filter((node) => node.data.type === 'envio_mensagem').map((node) => node.id)
const MESSAGE_IDS = MENUS.nodes.filter((node) => node.data.type === 'envio_pergunta').map((node) => node.id)
const MENU_PICK = { label: 'o menu de opções', candidates: MENU_IDS, ready: false, any: false }
const READY_PICK = { ...MENU_PICK, ready: true }
const PICK_ASK = {
  message: 'O fluxo tem dois menus de opções. Selecione no canvas o menu da opção nova e clique em Confirmar.',
  suggestions: ['No menu Como podemos ajudar', 'No menu Qual boleto você quer'],
  action: 'ask',
  plan: 'Criar a opção Falar com atendente, que transfere para o departamento Atendimento, no menu de opções que o usuário selecionar no canvas.',
}
const PICK_LOST = 'Em qual componente você quer fazer essa mudança? Escreva o texto que aparece nele.'
const PICK_MESSAGE = 'Mais de um componente serve para esse pedido. Em qual deles você quer fazer a mudança?'
const summaryTexts = (flow) => new Map(interviewFlowSummary(flow, true).split('\n').flatMap((line) => {
  const found = /^- (\S+) \([^)]*\) ?([^|]*?)(?: \|.*)?$/.exec(line)
  return found ? [[found[1], found[2]]] : []
}))
const PICK_CONTEXT = { hasFlow: true, history: COPILOT_REQUEST, scope: 'copilot', ids: MENUS_IDS, texts: summaryTexts(MENUS) }
const menusInput = (provider, extra = {}) => copilotInput(provider, { history: [{ role: 'user', text: 'crie a opção Falar com atendente' }], flow: MENUS, ...extra })

test('o esquema do Copiloto acrescenta pick, objeto estrito ou null com descrições, e o esquema da montagem continua sem pick', () => {
  const { jsonSchema } = zodSchema(copilotSchema)
  const forbidden = ['oneOf', 'allOf', '$ref', 'not', 'format', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'default', 'nullable', 'const']
  const objects = []
  const unions = []
  const visit = (schema, trail) => {
    for (const key of forbidden) assert.equal(schema[key], undefined, `${trail} ${key}`)
    if (schema.type === 'object') {
      objects.push(trail)
      assert.equal(schema.additionalProperties, false, trail)
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), trail)
    }
    if (schema.anyOf) {
      unions.push(trail)
      schema.anyOf.forEach((option, index) => walkSchema(option, visit, `${trail}/${index}`))
    }
  }
  walkSchema(jsonSchema, visit)
  assert.deepEqual(objects.sort(), ['$', '$.layout[]', '$.pick/0'])
  assert.deepEqual(unions, ['$.pick'])
  assert.deepEqual(Object.keys(jsonSchema.properties).sort(), ['action', 'adds', 'after', 'layout', 'message', 'pick', 'plan', 'suggestions'])
  const { pick } = jsonSchema.properties
  assert.deepEqual(pick.anyOf[1], { type: 'null' })
  assert.deepEqual(Object.keys(pick.anyOf[0].properties), ['label', 'any', 'candidates', 'ready'])
  assert.equal(pick.anyOf[0].properties.label.type, 'string')
  assert.equal(pick.anyOf[0].properties.candidates.items.type, 'string')
  assert.equal(pick.anyOf[0].properties.ready.type, 'boolean')
  assert.match(pick.anyOf[0].properties.ready.description, /^true quando plan já descreve a mudança inteira e só falta saber qual componente/)
  for (const schema of [pick, pick.anyOf[0].properties.label, pick.anyOf[0].properties.candidates, pick.anyOf[0].properties.ready]) assert.ok(schema.description.length > 30, JSON.stringify(schema))
  const builder = zodSchema(interviewSchema).jsonSchema
  for (const key of ['message', 'suggestions', 'plan']) assert.deepEqual(jsonSchema.properties[key], builder.properties[key], key)
  assert.deepEqual(jsonSchema.properties.action.enum, [...builder.properties.action.enum, 'arrange'])
  assert.deepEqual(Object.keys(builder.properties).sort(), ['action', 'message', 'plan', 'suggestions'])
})

test('cada provedor recebe pick no esquema do turno do Copiloto, com o mesmo nome de esquema, e o turno da montagem segue sem pick', async () => {
  const format = {
    openai: (body) => body.text.format,
    anthropic: (body) => body.output_config.format,
    google: (body) => ({ schema: body.generationConfig.responseSchema }),
    xai: (body) => body.text.format,
  }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const copilot = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify({ ...ASK, pick: null }))))
    const builder = await interviewTurn(input(provider, { flow: MENUS }), hooks(() => reply[provider](JSON.stringify(ASK))))
    assert.deepEqual([copilot.ok, builder.ok, calls.length], [true, true, 2], provider)
    assert.deepEqual(copilot.turn, ASK, provider)
    const [turn, build] = calls.map((call) => format[provider](call.body))
    if (provider === 'openai' || provider === 'xai') assert.deepEqual([turn.name, build.name, turn.strict], [INTERVIEW_SCHEMA_NAME, INTERVIEW_SCHEMA_NAME, true], provider)
    assert.ok(turn.schema.required.includes('pick'), provider)
    if (provider === 'google') assert.deepEqual([turn.schema.properties.pick.nullable, turn.schema.properties.pick.type], [true, 'object'], provider)
    else assert.deepEqual(turn.schema.properties.pick.anyOf[1], { type: 'null' }, provider)
    const selection = provider === 'google' ? turn.schema.properties.pick : turn.schema.properties.pick.anyOf[0]
    assert.deepEqual([selection.properties.ready.type, selection.required.includes('ready')], ['boolean', true], provider)
    assert.equal(build.schema.properties.pick, undefined, provider)
    assert.ok(!build.schema.required.includes('pick'), provider)
  }
})

test('no Copiloto, ask com pick devolve a seleção só com IDs do fluxo enviado, sem repetição, e com o rótulo arrumado', async () => {
  assert.equal(MENU_IDS.length, 2)
  const [first, second] = MENU_IDS
  const pick = { label: 'Selecione O menu de opções no canvas.', candidates: [first, ` ${second} `, `ID ${first}`, '999', second] }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify({ ...PICK_ASK, pick }))))
    assert.equal(result.ok, true, provider)
    assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK }, provider)
    assert.equal(calls.length, 1, provider)
    const body = bodyText(calls[0])
    for (const id of MENU_IDS) assert.ok(body.includes(`- ${id} (Menu de Opções)`), `${provider} ${id}`)
  }
})

test('settleTurn guarda pick só no ask do Copiloto, com 2 ou mais IDs do fluxo, e arruma o rótulo e a fala', () => {
  const [first, second] = MENU_IDS
  const ask = (pick, extra = {}, context = PICK_CONTEXT) => settleTurn({ ...PICK_ASK, ...extra, pick }, context)
  assert.deepEqual(ask(MENU_PICK), { ...PICK_ASK, pick: MENU_PICK })
  assert.deepEqual(ask({ label: 'o menu', candidates: [second, first, second, 'x', first] }).pick.candidates, [second, first])
  assert.deepEqual(ask({ label: 'a mensagem', candidates: MESSAGE_IDS }).pick, { label: 'a mensagem', candidates: MESSAGE_IDS, ready: false, any: false })
  for (const candidates of [[], [first], [first, first, ` ${first}`], [first, 'x'], ['x', 'y'], 'abc']) assert.equal('pick' in ask({ label: 'o menu', candidates }), false, JSON.stringify(candidates))
  for (const pick of [null, undefined, 'o menu', [first, second], { label: 'o menu' }, { label: 'o menu', candidates: [] }]) assert.deepEqual(ask(pick), { ...PICK_ASK, message: PICK_LOST }, JSON.stringify(pick))
  const typed = 'Em qual menu entra a opção nova, Como podemos ajudar ou Qual boleto você quer?'
  for (const pick of [null, undefined, { label: 'o menu' }]) assert.deepEqual(ask(pick, { message: typed }), { ...PICK_ASK, message: typed }, JSON.stringify(pick))
  assert.deepEqual(settleTurn({ ...PICK_ASK, action: 'finish', pick: MENU_PICK }, PICK_CONTEXT), { message: PICK_ASK.message, suggestions: [], action: 'finish', plan: PICK_ASK.plan })
  for (const scope of [undefined, 'builder']) assert.equal('pick' in settleTurn({ ...PICK_ASK, pick: MENU_PICK }, { ...PICK_CONTEXT, scope }), false, String(scope))
  assert.equal('pick' in ask(MENU_PICK, {}, { ...PICK_CONTEXT, ids: undefined }), false)

  const label = (text) => ask({ label: text, candidates: MENU_IDS }).pick.label
  assert.equal(label('O menu de opções!'), 'o menu de opções')
  assert.equal(label('  Selecione a mensagem de boas-vindas no canvas.  '), 'a mensagem de boas-vindas')
  assert.equal(label('Selecionar no canvas: Um dos menus'), 'um dos menus')
  assert.equal(label('Menu de Opções — principal 😀'), 'Menu de Opções, principal')
  for (const empty of ['', '   ', 'no canvas', 'Selecione.', null, undefined]) assert.equal(label(empty), 'o componente', String(empty))
  const long = label(`o menu ${'com um texto bem comprido '.repeat(6)}`)
  assert.ok(long.length <= PICK_LIMITS.label && long.startsWith('o menu com um texto'), long)

  assert.equal(ask(MENU_PICK, { message: '' }).message, PICK_MESSAGE)
  assert.ok(!/canvas|lista/i.test(PICK_MESSAGE))
  assert.equal(ask(MENU_PICK, { message: 'Qual dos dois menus? 😀' }).message, 'Qual dos dois menus?')
  assert.deepEqual(ask({ label: 'o menu de opções', candidates: [first, '999'] }), { ...PICK_ASK, message: PICK_LOST })
  assert.equal(ask({ label: 'o menu', candidates: [first] }, { message: '' }).message, PICK_LOST)
  assert.equal(ask({ label: 'o menu', candidates: [first] }, { message: typed }).message, typed)
  assert.equal(ask({ label: '', candidates: [] }, { message: 'A proposta está no canvas. Quer mudar o texto?' }).message, 'A proposta está no canvas. Quer mudar o texto?')
  assert.equal(settleTurn({ ...PICK_ASK, message: '', pick: { label: 'o menu', candidates: [first] } }, { ...PICK_CONTEXT, scope: 'builder' }).message, 'Me conte como você quer que o atendimento funcione.')

  const custom = { ...PICK_CONTEXT, ids: ['inicio', 'menu_a', 'Menu_B', 'Dup', 'dup'] }
  assert.deepEqual(ask({ label: 'o menu', candidates: ['“Menu_A”', 'id: menu_b', 'MENU_A', ' ID Menu_B'] }, {}, custom).pick.candidates, ['menu_a', 'Menu_B'])
  assert.deepEqual(ask({ label: 'o menu', candidates: ['Dup', 'dup', 'DUP'] }, {}, custom).pick.candidates, ['Dup', 'dup'])
  assert.deepEqual(ask({ label: 'o ponto do fluxo', candidates: ['inicio', 'menu_a'] }, {}, custom).pick.candidates, ['inicio', 'menu_a'])
  assert.deepEqual(ask({ label: 'o menu', candidates: ['Menu de Opções “Financeiro” · ID Menu_B', 'Menu de Opções · ID menu_a.'] }, {}, custom).pick.candidates, ['Menu_B', 'menu_a'])
  assert.deepEqual(ask({ label: 'o menu', candidates: [`${first},`, `${second}.`, `ID ${first};`] }).pick.candidates, [first, second])
})

test('no Copiloto, a resposta sem pick, com nomes em português ou com IDs fora do formato é reparada sem nova chamada', async () => {
  const [first, second] = MENU_IDS
  let result = await interviewTurn(menusInput('openai'), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.deepEqual([result.turn, calls.length], [ASK, 1])
  calls.length = 0
  const aliased = JSON.stringify({ mensagem: PICK_ASK.message, sugestoes: PICK_ASK.suggestions, acao: 'ask', plano: PICK_ASK.plan, selecao: { rotulo: 'O menu de opções', candidatos: [Number(first), second] } })
  result = await interviewTurn(menusInput('anthropic'), hooks(() => reply.anthropic(`\`\`\`json\n${aliased}\n\`\`\``)))
  assert.deepEqual([result.turn, calls.length], [{ ...PICK_ASK, pick: MENU_PICK }, 1])
  calls.length = 0
  result = await interviewTurn(menusInput('google'), hooks(() => reply.google(JSON.stringify({ ...PICK_ASK, pick: { label: 'o menu de opções', candidates: `${first}, ${second}` } }))))
  assert.deepEqual([result.turn, calls.length], [{ ...PICK_ASK, pick: MENU_PICK }, 1])
  calls.length = 0
  result = await interviewTurn(menusInput('openai'), hooks((call, index) => reply.openai(index === 0 ? 'não é JSON' : JSON.stringify({ ...PICK_ASK, pick: MENU_PICK }))))
  assert.deepEqual([result.turn, calls.length], [{ ...PICK_ASK, pick: MENU_PICK }, 2])
  assert.match(bodyText(calls[1]), /Responda de novo só com o objeto: message, suggestions, action, plan, pick, adds, after e layout\./)
  calls.length = 0
  await interviewTurn(input('openai'), hooks((call, index) => reply.openai(index === 0 ? 'não é JSON' : JSON.stringify(ASK))))
  assert.match(bodyText(calls[1]), /Responda de novo só com o objeto: message, suggestions, action e plan\./)
})

test('o parcial do Copiloto mostra pick enquanto a resposta chega e o parcial da montagem nunca traz pick', async () => {
  const answer = JSON.stringify({ ...PICK_ASK, pick: MENU_PICK })
  const copilot = []
  let result = await interviewTurn(menusInput('xai'), hooks(() => reply.xai(answer), { onPartial: (turn) => copilot.push(turn) }))
  assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK })
  assert.ok(copilot.some((turn) => turn.pick && turn.pick.label === 'o menu de opções' && turn.pick.candidates.length === 2), JSON.stringify(copilot.at(-1)))
  assert.ok(copilot.every((turn) => turn.pick === undefined || (typeof turn.pick.label === 'string' && turn.pick.candidates.every((id) => typeof id === 'string') && turn.pick.ready === false)))
  const ready = []
  result = await interviewTurn(menusInput('google'), hooks(() => reply.google(JSON.stringify({ ...PICK_ASK, pick: READY_PICK })), { onPartial: (turn) => ready.push(turn) }))
  assert.deepEqual(result.turn, { ...PICK_ASK, pick: READY_PICK })
  assert.deepEqual(ready.at(-1).pick, READY_PICK)
  assert.ok(ready.every((turn) => turn.pick === undefined || typeof turn.pick.ready === 'boolean'), JSON.stringify(ready.map((turn) => turn.pick)))
  const empty = []
  await interviewTurn(menusInput('openai'), hooks(() => reply.openai(JSON.stringify({ ...ASK, pick: null })), { onPartial: (turn) => empty.push(turn) }))
  assert.equal(empty.at(-1).pick, null)
  const builder = []
  result = await interviewTurn(input('xai', { flow: MENUS }), hooks(() => reply.xai(JSON.stringify({ ...PICK_ASK, pick: READY_PICK })), { onPartial: (turn) => builder.push(turn) }))
  assert.equal(result.ok, true)
  assert.equal('pick' in result.turn, false)
  assert.ok(builder.length > 1)
  assert.ok(builder.every((turn) => !('pick' in turn)))
})

test('a confirmação Selecionei no canvas chega ao provedor e o edit seguinte cita o ID, sem pick', async () => {
  const [, second] = MENU_IDS
  const confirmed = `Selecionei no canvas: Menu de Opções Qual boleto você quer? · ID ${second}`
  const history = [
    { role: 'user', text: 'crie a opção Falar com atendente' },
    { role: 'assistant', text: PICK_ASK.message },
    { role: 'user', text: confirmed },
  ]
  const plan = `No menu de opções ID ${second}, Qual boleto você quer?, acrescente a opção Falar com atendente, que transfere para o departamento Atendimento.`
  const answer = { message: 'Vou colocar a opção Falar com atendente no menu Qual boleto você quer.', suggestions: [], action: 'edit', plan, pick: MENU_PICK }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider, { history }), hooks(() => reply[provider](JSON.stringify(answer))))
    assert.deepEqual(result.turn, { message: answer.message, suggestions: [], action: 'edit', plan }, provider)
    assert.ok(bodyText(calls[0]).includes(confirmed), provider)
  }
  const sent = interviewMessages({ history, flow: MENUS, scope: 'copilot' })
  assert.deepEqual(sent.slice(2).map((message) => message.role), ['user', 'assistant', 'user'])
  assert.equal(sent.at(-1).content, confirmed)
  assert.ok(sent[0].content.includes('começa com Selecionei no canvas'))
})

test('os candidatos valem pelos IDs do fluxo enviado com o turno, inclusive os componentes da proposta em revisão', async () => {
  const [first] = MENU_IDS
  const added = newNode('envio_mensagem', { x: 400, y: 400 }, '900')
  added.data.data.title = 'Qual departamento?'
  const proposal = { ...MENUS, nodes: [...MENUS.nodes, added] }
  const answer = JSON.stringify({ ...PICK_ASK, pick: { label: 'o menu de opções', candidates: [first, '900'] } })
  let result = await interviewTurn(menusInput('openai', { flow: proposal, proposal: true }), hooks(() => reply.openai(answer)))
  assert.deepEqual(result.turn.pick, { label: 'o menu de opções', candidates: [first, '900'], ready: false, any: false })
  assert.ok(bodyText(calls[0]).includes('- 900 (Menu de Opções)'))
  calls.length = 0
  result = await interviewTurn(menusInput('openai'), hooks(() => reply.openai(answer)))
  assert.deepEqual(result.turn, { ...PICK_ASK, message: PICK_LOST })
})

test('no Copiloto, o edit com plano vazio depois de um chip devolve o plano vazio para o painel usar o plano combinado', async () => {
  const history = [
    { role: 'user', text: 'crie uma opcao 3' },
    { role: 'assistant', text: 'Vou colocar a opção 3 no menu Como podemos ajudar. Pensei em Falar com atendente, que transfere para o departamento Atendimento. Fica assim?' },
    { role: 'user', text: 'Pode ser assim' },
  ]
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(copilotInput(provider, { history }), hooks(() => reply[provider](JSON.stringify({ message: '', suggestions: [], action: 'edit', plan: '', pick: null }))))
    assert.deepEqual(result.turn, { message: 'Vou aplicar essa mudança no fluxo.', suggestions: [], action: 'edit', plan: '' }, provider)
  }
  let result = await interviewTurn(copilotInput('anthropic', { history }), hooks(() => reply.anthropic('{"mensagem":"Vou colocar a opção 3.","acao":"generate"}')))
  assert.deepEqual(result.turn, { message: 'Vou colocar a opção 3.', suggestions: [], action: 'edit', plan: '' })
  result = await interviewTurn(input('openai', { history, flow: FLOW }), hooks(() => reply.openai(JSON.stringify({ message: '', suggestions: [], action: 'edit', plan: '' }))))
  assert.equal(result.turn.plan, 'Pode ser assim')
})

test('no Copiloto, a proposta em revisão que deixa só o Início ainda pode ser ajustada', async () => {
  const start = { ...FLOW, nodes: FLOW.nodes.filter((node) => node.data.type === START_TYPE), edges: [] }
  const history = [
    { role: 'user', text: 'Apague tudo e deixe só o início' },
    { role: 'assistant', text: 'Proposta pronta no canvas: 0 componentes novos, 0 alterados e 5 removidos.' },
    { role: 'user', text: 'Na verdade, mantenha uma mensagem de boas-vindas' },
  ]
  const state = interviewMessages({ history, flow: start, scope: 'copilot', proposal: true })[1].content
  assert.ok(state.startsWith(`# Situação atual\n${COPILOT_OPENED}\n${PROPOSAL_NOTICE}\n\n# Resumo do fluxo aberto\n`))
  assert.ok(state.includes('Componentes: 0'))
  assert.ok(state.includes('- inicio (Iniciar Fluxo)'))
  const plan = 'Depois do início, envie a mensagem Olá, tudo bem?'
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(copilotInput(provider, { history, flow: start, proposal: true }), hooks(() => reply[provider](JSON.stringify({ message: 'Vou manter uma mensagem de boas-vindas.', suggestions: [], action: 'edit', plan, pick: null }))))
    assert.deepEqual([result.ok, result.turn?.plan, calls.length], [true, plan, 1], provider)
  }
  const missing = { ok: false, failure: { success: false, code: 'invalid_request', error: COPILOT_FLOW_MISSING, field: 'base' } }
  calls.length = 0
  for (const flow of [undefined, null]) assert.deepEqual(await interviewTurn(copilotInput('openai', { history, flow, proposal: true }), hooks(() => reply.openai(JSON.stringify(ASK)))), missing)
  const broken = await interviewTurn(copilotInput('openai', { history, flow: { nodes: 'x' }, proposal: true }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.deepEqual([broken.failure.field, broken.failure.error], ['base', 'Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo.'])
  assert.equal(calls.length, 0)
  await interviewTurn(input('openai', { history, flow: start, proposal: true }), hooks(() => reply.openai(JSON.stringify(ASK))))
  assert.ok(bodyText(calls[0]).includes('Não há fluxo aberto no editor'))
})

test('o prompt do Copiloto pede a seleção no canvas quando mais de um componente serve e usa o ID confirmado no plano', () => {
  const prompt = copilotSystemPrompt()
  const start = prompt.indexOf('# Seleção no canvas')
  const section = prompt.slice(start, prompt.indexOf('# Proposta em revisão'))
  assert.ok(start > prompt.indexOf('# Como perguntar'), 'ordem das seções')
  for (const text of ['mais de um que serve', 'como dois menus de opções ou várias mensagens', 'devolva ask com pick', 'Peça a seleção na primeira pergunta do pedido', 'label diz o que selecionar', 'candidates traz o ID', 'A interface destaca os candidatos para o usuário selecionar um e confirmar', 'traz a sua proposta para o resto do pedido e termina perguntando qual deles', 'Pensei na opção Segunda via com o link do boleto, seguindo para a despedida. Em qual menu ela entra?', 'Nessa pergunta, suggestions traz atalhos em texto, um para cada candidato', 'e só esses atalhos. Com mais de 5 candidatos, suggestions fica vazio', 'Quando só um componente do resumo serve, use esse componente direto', 'pick fica null', 'começa com Selecionei no canvas, ou o atalho que aponta um candidato, traz o componente escolhido e aceita a proposta da pergunta', 'cite em plan o ID e o texto dele', 'Depois de Seleção cancelada', 'use o componente que o texto indica, com o ID dele em plan']) assert.ok(section.includes(text), text)
  assert.ok(!/clique em Confirmar|clicar em Confirmar|Selecione no canvas/.test(section), 'a pergunta da seleção vale no canvas e na lista')
  for (const text of ['quando mais de um serve: peça para o usuário selecionar no canvas', 'pick traz a seleção no canvas quando ela se aplica', '- seleção no canvas cancelada: Seleção cancelada. Você pode responder por texto.', 'A pergunta da seleção no canvas traz as sugestões descritas na seção dela.']) assert.ok(prompt.includes(text), text)
  assert.ok(!/\bpick\b|Selecionei no canvas|Seleção no canvas/.test(interviewSystemPrompt()))
})

test('o prompt do Copiloto confirma o texto novo de uma mensagem, diz o lado de atrás e antes e trata as cópias de um passo como um só componente', () => {
  const prompt = copilotSystemPrompt()
  const decide = prompt.slice(prompt.indexOf('# Como decidir'), prompt.indexOf('# Como perguntar'))
  const list = decide.split('\n').filter((line) => line.startsWith('- '))
  assert.ok(list.includes('- o texto novo de uma mensagem, quando o pedido diz só qual mensagem trocar, como em troque a mensagem de boas-vindas;'))
  assert.ok(decide.includes('4. No pedido com atrás de ou depois de um componente, o componente novo entra logo depois dele, na saída dele, e o caminho segue como antes. No pedido com antes de um componente, o componente novo entra logo antes dele, na entrada dele.'))
  for (const text of ['são cópias de um mesmo passo, uma em cada caminho', 'Conte as cópias como um só componente', 'muda todas as cópias, com o ID de cada uma em plan', 'muda só uma quando o pedido aponta o caminho dela']) assert.ok(decide.includes(text), text)
  assert.ok(prompt.includes('Exemplo para o pedido crie uma opção 8, num fluxo com um só menu, de 7 opções:'))
  assert.ok(!/em um menu com 7 opções/.test(prompt))
  for (const text of ['texto novo de uma mensagem', 'cópias de um mesmo passo', 'na saída dele', 'num fluxo com um só menu']) assert.ok(!interviewSystemPrompt().includes(text), text)
})

test('o candidato copiado da linha do resumo, com o componente entre parênteses, traço ou cerquilha, vale pelo ID', async () => {
  const [first, second] = MENU_IDS
  const ask = (candidates) => settleTurn({ ...PICK_ASK, pick: { label: 'o menu de opções', candidates } }, PICK_CONTEXT)
  assert.deepEqual(ask([`${first} (Menu de Opções)`, `#${second}`]).pick, MENU_PICK)
  assert.deepEqual(ask([`- ${first} (Menu de Opções) “Como podemos ajudar?”`, `ID ${second} (Menu de Opções)`]).pick, MENU_PICK)
  assert.deepEqual(ask([`${first} (Menu de Opções)`, first, `#${first}`]), { ...PICK_ASK, message: PICK_LOST })
  for (const candidates of [['Menu de Opções', 'Menu'], ['(Menu de Opções)', '- (Menu de Opções)'], [`${first}0 (Menu de Opções)`, `x${second}`]]) assert.equal('pick' in ask(candidates), false, JSON.stringify(candidates))
  const answer = JSON.stringify({ ...PICK_ASK, pick: { label: 'o menu de opções', candidates: MENU_IDS.map((id) => `${id} (Menu de Opções)`) } })
  const result = await interviewTurn(menusInput('openai'), hooks(() => reply.openai(answer)))
  assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK })
})

test('com pick, suggestions traz só um atalho em texto para cada candidato, na ordem dos candidatos, até 5, ou fica vazio', async () => {
  const chips = (suggestions, pick = MENU_PICK, context = PICK_CONTEXT) => settleTurn({ ...PICK_ASK, suggestions, pick }, context).suggestions
  const [main, boleto] = PICK_ASK.suggestions
  assert.deepEqual(chips(['Pode ser assim', boleto, 'Pode editar agora', `${main}.`, 'Quero outro texto']), [main, boleto])
  assert.deepEqual(chips([main, 'Pode ser assim', 'Pode editar agora']), [])
  assert.deepEqual(chips(['No menu Como podemos ajudar ou Qual boleto você quer', boleto, main]), [main, boleto])
  assert.deepEqual(chips([main, boleto], MENU_PICK, { ...PICK_CONTEXT, texts: undefined }), [])
  assert.deepEqual(chips([]), [])

  const copies = MESSAGE_IDS.filter((id) => PICK_CONTEXT.texts.get(id) === '“Obrigado pelo contato. Até logo.”')
  assert.equal(copies.length, 2)
  assert.deepEqual(chips(['Na despedida do menu principal', 'Na despedida do boleto'], { label: 'a mensagem', candidates: copies }), [])

  const close = { ...PICK_CONTEXT, ids: ['inicio', 'agora', 'boleto'], texts: new Map([['agora', '“Pode falar agora?” opções: Sim, Depois'], ['boleto', '“Qual boleto você quer?”']]) }
  assert.deepEqual(chips(['Pode editar agora', 'No menu Pode falar agora', 'No menu Qual boleto'], { label: 'o menu', candidates: ['agora', 'boleto'] }, close), ['No menu Pode falar agora', 'No menu Qual boleto'])

  const names = ['Boletos', 'Suporte', 'Planos', 'Financeiro', 'Ouvidoria', 'Cancelamento']
  const ids = names.map((_, index) => `m${index}`)
  const many = { ...PICK_CONTEXT, ids: ['inicio', ...ids], texts: new Map(ids.map((id, index) => [id, `“Menu de ${names[index]}”`])) }
  const shortcuts = names.map((name) => `No menu de ${name}`)
  assert.deepEqual(chips(shortcuts.slice(0, SUGGESTION_LIMITS.max), { label: 'o menu', candidates: ids.slice(0, SUGGESTION_LIMITS.max) }, many), shortcuts.slice(0, SUGGESTION_LIMITS.max))
  assert.deepEqual(chips(shortcuts, { label: 'o menu', candidates: ids }, many), [])

  const answer = { ...PICK_ASK, suggestions: ['Pode ser assim', boleto, main, 'Pode editar agora'], pick: MENU_PICK }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify(answer))))
    assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK }, provider)
  }
  const builder = await interviewTurn(input('openai', { flow: MENUS }), hooks(() => reply.openai(JSON.stringify(answer))))
  assert.deepEqual(builder.turn, { message: PICK_ASK.message, suggestions: answer.suggestions, action: 'ask', plan: PICK_ASK.plan })
})

test('no Copiloto, o edit com pick válido e um plano sem o ID de nenhum candidato volta a ser a pergunta da seleção', async () => {
  const [first, second] = MENU_IDS
  const settle = (extra) => settleTurn({ ...PICK_ASK, pick: MENU_PICK, ...extra }, PICK_CONTEXT)
  for (const action of ['edit', 'generate']) assert.deepEqual(settle({ action }), { ...PICK_ASK, pick: MENU_PICK }, action)
  const edit = { action: 'edit', message: 'Vou colocar a opção Falar com atendente no menu escolhido.', suggestions: [] }
  assert.deepEqual(settle(edit), { message: PICK_MESSAGE, suggestions: [], action: 'ask', plan: PICK_ASK.plan, pick: MENU_PICK })
  assert.equal(settle({ ...edit, message: 'Em qual menu entra a opção Falar com atendente?' }).message, 'Em qual menu entra a opção Falar com atendente?')
  assert.equal(settle({ ...edit, message: '' }).message, PICK_MESSAGE)
  assert.deepEqual(settle({ ...edit, plan: '' }), { message: PICK_MESSAGE, suggestions: [], action: 'ask', plan: '', pick: MENU_PICK })

  const cited = [
    `No menu de opções ID ${second}, Qual boleto você quer?, acrescente a opção Falar com atendente.`,
    `No menu Como podemos ajudar (ID: ${first}), acrescente a opção Falar com atendente.`,
    `Nos menus IDs ${first} e ${second}, acrescente a opção Falar com atendente.`,
    `No menu id #${second}, acrescente a opção Falar com atendente.`,
  ]
  for (const plan of cited) assert.deepEqual(settle({ ...edit, plan }), { message: edit.message, suggestions: [], action: 'edit', plan }, plan)
  for (const plan of [`No menu ID ${second}0, acrescente a opção.`, `No menu ${second}, acrescente a opção.`, 'No menu Qual boleto você quer, acrescente a opção.']) assert.equal(settle({ ...edit, plan }).action, 'ask', plan)
  for (const pick of [null, { label: 'o menu', candidates: [first] }, { label: 'o menu', candidates: [first, '999'] }]) assert.deepEqual(settle({ ...edit, pick }), { message: edit.message, suggestions: [], action: 'edit', plan: PICK_ASK.plan }, JSON.stringify(pick))
  assert.deepEqual(settleTurn({ ...PICK_ASK, ...edit, pick: MENU_PICK }, { ...PICK_CONTEXT, scope: 'builder' }), { message: edit.message, suggestions: [], action: 'edit', plan: PICK_ASK.plan })

  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify({ ...PICK_ASK, action: 'edit', pick: MENU_PICK }))))
    assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK }, provider)
  }
})

test('no Copiloto, a fala que pede a seleção sem pick vira a pergunta por texto, e as outras falas continuam como vieram', () => {
  const ask = (message, extra = {}) => settleTurn({ ...PICK_ASK, message, pick: null, ...extra }, PICK_CONTEXT)
  const requests = [
    PICK_ASK.message,
    'Selecione no canvas o menu da opção nova.',
    'Escolha no canvas o menu da opção nova.',
    'Clique no menu certo no canvas.',
    'Pode selecionar no canvas o menu da opção nova?',
    'Selecione o menu dela e confirme.',
    'Selecione o menu e clique em Confirmar.',
  ]
  for (const message of requests) assert.deepEqual(ask(message), { ...PICK_ASK, message: PICK_LOST }, message)
  const others = [
    'Você selecionou no canvas o menu Qual boleto você quer. Pensei em Falar com atendente. Fica assim?',
    'A proposta está no canvas. Quer mudar o texto?',
    'Quer selecionar outro departamento?',
    'Escolha o departamento e confirme.',
    'Em qual menu entra a opção nova?',
    'Pensei em Falar com atendente. Confirma que fica assim?',
  ]
  for (const message of others) assert.deepEqual(ask(message), { ...PICK_ASK, message }, message)
  for (const action of ['edit', 'finish']) assert.equal(ask(PICK_ASK.message, { action }).message, PICK_ASK.message, action)
  assert.equal(settleTurn({ ...PICK_ASK, pick: null }, { ...PICK_CONTEXT, scope: 'builder' }).message, PICK_ASK.message)
})

test('o resumo do Copiloto marca com reticências o texto cortado, e a conversa de montagem recebe o resumo de antes', () => {
  const options = ['Boletos', 'Suporte técnico', 'Planos', 'Cancelamento', 'Financeiro', 'Ouvidoria', 'Encerrar']
  const long = 'Mensagem com um texto bem mais longo do que cabe no resumo, para conferir que o resumo corta cada texto.'
  const ri = {
    name: 'Cortes',
    description: '',
    nodes: [
      { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify(options.map((text) => ({ text }))) }] },
      { id: 'longa', type: 'envio_pergunta', config: [{ key: 'template', value: long }] },
      { id: 'curta', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado pelo contato.' }] },
    ],
    edges: [{ from: 'inicio', output: '', to: 'menu' }, { from: 'menu', output: 'Boletos', to: 'longa' }, { from: 'longa', output: '', to: 'curta' }],
  }
  const flow = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(ri, { now: NOW })).flow)))
  const builder = interviewFlowSummary(flow)
  const copilot = interviewFlowSummary(flow, true)
  assert.match(builder, /“Como podemos ajudar\?” opções: Boletos, Suporte técnico, Planos, Cancelamento, Financeiro, \| Boletos -> \S+; /)
  assert.match(builder, /“Mensagem com um texto bem mais longo do que cabe no resumo, para” \| -> /)
  assert.ok(!builder.includes('…'))
  assert.match(copilot, /“Como podemos ajudar\?” opções \(7\): Boletos, Suporte técnico, Planos, Cancelamento, Financeiro… \| Boletos -> \S+; .*Ouvidoria -> \S+; Encerrar -> \S+$/m)
  assert.match(copilot, /“Mensagem com um texto bem mais longo do que cabe no resumo, para…” \| -> /)
  assert.match(copilot, /“Obrigado pelo contato\.”/)
  assert.equal(copilot.split('\n').filter((line) => line.includes('…')).length, 2)
  assert.equal(interviewFlowSummary(FLOW, true), interviewFlowSummary(FLOW))
  const state = (scope) => interviewMessages({ history: COPILOT_REQUEST, flow, scope })[1].content
  assert.ok(state('copilot').includes(`# Resumo do fluxo aberto\n${copilot}\n`))
  assert.ok(state(undefined).includes(`# Resumo do fluxo aberto\n${builder}\n`))
  assert.ok(!state(undefined).includes('…'))
})

test('settleTurn mantém ready true só no ask do Copiloto com a seleção válida e o plano preenchido, sem o ID de um candidato no plano', () => {
  const [first, second] = MENU_IDS
  const farewell = MESSAGE_IDS.find((id) => PICK_CONTEXT.texts.get(id) === '“Obrigado pelo contato. Até logo.”')
  const settle = (extra = {}, context = PICK_CONTEXT) => settleTurn({ ...PICK_ASK, pick: READY_PICK, ...extra }, context)
  assert.deepEqual(settle(), { ...PICK_ASK, pick: READY_PICK })
  assert.deepEqual(settle({ pick: { ...READY_PICK, candidates: [` ${second} `, `ID ${first}`, '999'] } }).pick, { ...READY_PICK, candidates: [second, first] })
  for (const plan of ['', '   ']) assert.deepEqual(settle({ plan }), { ...PICK_ASK, plan: '', pick: MENU_PICK }, JSON.stringify(plan))
  for (const ready of [false, 'true', 1, null, undefined]) assert.deepEqual(settle({ pick: { ...MENU_PICK, ready } }).pick, MENU_PICK, String(ready))
  assert.deepEqual(settle({ pick: { label: MENU_PICK.label, candidates: MENU_IDS } }).pick, MENU_PICK)
  const chosen = [
    `No menu de opções ID ${second}, acrescente a opção Falar com atendente.`,
    `Acrescente a opção Falar com atendente no menu de opções que o usuário selecionar, IDs ${first} ou ${second}.`,
  ]
  for (const plan of chosen) assert.deepEqual(settle({ plan }).pick, MENU_PICK, plan)
  assert.deepEqual(settle({ plan: `${PICK_ASK.plan} Depois da opção, o caminho segue para a despedida ID ${farewell}.` }).pick, READY_PICK)
  assert.deepEqual(settle({ action: 'edit' }), { ...PICK_ASK, pick: READY_PICK })
  const edit = { action: 'edit', message: 'Vou colocar a opção Falar com atendente no menu Qual boleto você quer.', suggestions: [], plan: chosen[0] }
  assert.deepEqual(settle(edit), edit)
  assert.deepEqual(settle({ action: 'finish' }), { message: PICK_ASK.message, suggestions: [], action: 'finish', plan: PICK_ASK.plan })
  for (const candidates of [[first], [first, '999'], ['998', '999']]) assert.equal('pick' in settle({ pick: { ...READY_PICK, candidates } }), false, JSON.stringify(candidates))
  for (const scope of [undefined, 'builder']) assert.equal('pick' in settle({}, { ...PICK_CONTEXT, scope }), false, String(scope))
})

test('no Copiloto, o ask com a seleção pronta chega com ready true, e a resposta reparada lê ready, pronto ou pronta', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify({ ...PICK_ASK, pick: READY_PICK }))))
    assert.deepEqual([result.turn, calls.length], [{ ...PICK_ASK, pick: READY_PICK }, 1], provider)
  }
  const [first, second] = MENU_IDS
  const repaired = async (selection) => {
    calls.length = 0
    const text = JSON.stringify({ mensagem: PICK_ASK.message, sugestoes: PICK_ASK.suggestions, acao: 'ask', plano: PICK_ASK.plan, selecao: { rotulo: 'O menu de opções', candidatos: [first, second], ...selection } })
    const result = await interviewTurn(menusInput('anthropic'), hooks(() => reply.anthropic(`\`\`\`json\n${text}\n\`\`\``)))
    assert.equal(calls.length, 1, JSON.stringify(selection))
    assert.deepEqual(result.turn.pick.candidates, MENU_IDS, JSON.stringify(selection))
    return result.turn.pick.ready
  }
  for (const selection of [{ ready: true }, { pronta: true }, { pronto: 'true' }, { pronta: ' Sim ' }]) assert.equal(await repaired(selection), true, JSON.stringify(selection))
  for (const selection of [{}, { ready: false }, { pronta: 'talvez' }, { ready: 1 }]) assert.equal(await repaired(selection), false, JSON.stringify(selection))
  calls.length = 0
  const loose = await interviewTurn(menusInput('google'), hooks(() => reply.google(JSON.stringify({ ...PICK_ASK, pick: { ...MENU_PICK, ready: 'true' } }))))
  assert.deepEqual([loose.turn, calls.length], [{ ...PICK_ASK, pick: READY_PICK }, 1])
  calls.length = 0
  const blank = await interviewTurn(menusInput('openai'), hooks(() => reply.openai(JSON.stringify({ ...PICK_ASK, plan: ' ', pick: READY_PICK }))))
  assert.deepEqual(blank.turn, { ...PICK_ASK, plan: '', pick: MENU_PICK })
})

const ANY_PICK = { label: 'o componente que vem antes da mensagem nova', any: true, candidates: [], ready: false }
const ANY_ASK = {
  message: 'Pensei na mensagem Obrigado pelo contato, volte sempre. Ela entra logo depois do componente que você selecionar, ou logo antes dele, se preferir. Depois de qual componente ela entra?',
  suggestions: ['Logo depois do selecionado', 'Logo antes do selecionado'],
  action: 'ask',
  plan: 'Acrescente a mensagem Obrigado pelo contato, volte sempre, logo depois do componente que o usuário selecionar, na saída dele, e o caminho segue como antes.',
}
const ANY_MESSAGE = 'O componente novo entra logo depois do componente que você selecionar, ou logo antes dele, se preferir. Depois de qual componente ele entra?'
const THANKS = [{ role: 'user', text: 'adicione uma mensagem de agradecimento' }]

test('no Copiloto, o componente novo sem ponto no fluxo pede a seleção no canvas inteiro, com any true, candidates vazio e as sugestões de posição', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider, { history: THANKS }), hooks(() => reply[provider](JSON.stringify({ ...ANY_ASK, pick: ANY_PICK }))))
    assert.deepEqual([result.turn, calls.length], [{ ...ANY_ASK, pick: ANY_PICK }, 1], provider)
    const body = calls[0].body
    const schema = provider === 'openai' || provider === 'xai' ? body.text.format.schema : provider === 'anthropic' ? body.output_config.format.schema : body.generationConfig.responseSchema
    const selection = provider === 'google' ? schema.properties.pick : schema.properties.pick.anyOf[0]
    assert.deepEqual([selection.properties.any.type, selection.required.includes('any')], ['boolean', true], provider)
  }
  const { jsonSchema } = zodSchema(copilotSchema)
  const selection = jsonSchema.properties.pick.anyOf[0]
  assert.match(selection.properties.any.description, /^true quando o pedido cria um componente sem dizer o ponto do fluxo: o usuário seleciona qualquer componente com saída, o Início inclusive, e candidates fica vazio; false quando candidates traz os componentes que servem$/)
  assert.match(selection.properties.candidates.description, /; vazio com any true$/)
  assert.match(jsonSchema.properties.pick.description, /ou quando o pedido cria um componente sem dizer o ponto do fluxo; null nas outras respostas$/)
  assert.equal(zodSchema(interviewSchema).jsonSchema.properties.pick, undefined)
})

test('settleTurn guarda a seleção com any só no ask do Copiloto, com candidates vazio e ready só com plano, e mantém o edit quando o plano já cita o componente', () => {
  const [farewell] = MESSAGE_IDS
  const settle = (extra = {}, context = PICK_CONTEXT) => settleTurn({ ...ANY_ASK, pick: ANY_PICK, ...extra }, context)
  assert.deepEqual(settle(), { ...ANY_ASK, pick: ANY_PICK })
  assert.deepEqual(settle({ pick: { ...ANY_PICK, ready: true } }).pick, { ...ANY_PICK, ready: true })
  assert.equal(settle({ plan: ' ', pick: { ...ANY_PICK, ready: true } }).pick.ready, false)
  assert.equal(settle({ pick: { ...ANY_PICK, ready: 'true' } }).pick.ready, false)
  assert.deepEqual(settle({ pick: { ...ANY_PICK, candidates: [...MENU_IDS, 'inicio'] } }).pick, ANY_PICK)
  assert.deepEqual(settle({ pick: { ...ANY_PICK, label: 'Selecione no canvas O componente anterior.' } }).pick.label, 'o componente anterior')
  assert.deepEqual(settle({ pick: { ...ANY_PICK, label: '' } }).pick.label, 'o componente')
  assert.deepEqual(settle({ suggestions: ['Logo depois do selecionado', 'Logo antes do selecionado', 'Logo depois do selecionado.', 'Pode editar agora'] }).suggestions, ['Logo depois do selecionado', 'Logo antes do selecionado', 'Pode editar agora'])
  assert.equal(settle({ message: '' }).message, ANY_MESSAGE)
  assert.ok(!/canvas/i.test(ANY_MESSAGE))
  const edit = { action: 'edit', message: 'Vou colocar a mensagem nova.', suggestions: [] }
  for (const action of ['edit', 'generate']) assert.deepEqual(settle({ ...edit, action }), { message: ANY_MESSAGE, suggestions: [], action: 'ask', plan: ANY_ASK.plan, pick: ANY_PICK }, action)
  assert.equal(settle({ ...edit, message: 'Depois de qual componente ela entra?' }).message, 'Depois de qual componente ela entra?')
  const cited = `Acrescente a mensagem Obrigado pelo contato logo depois do componente ID ${farewell}, na saída dele.`
  assert.deepEqual(settle({ ...edit, plan: cited }), { message: edit.message, suggestions: [], action: 'edit', plan: cited })
  assert.deepEqual(settle({ ...edit, plan: 'Acrescente a mensagem logo depois do Início, ID inicio.' }).action, 'edit')
  assert.deepEqual(settle({ action: 'finish' }), { message: ANY_ASK.message, suggestions: [], action: 'finish', plan: ANY_ASK.plan })
  for (const scope of [undefined, 'builder']) assert.equal('pick' in settle({}, { ...PICK_CONTEXT, scope }), false, String(scope))
  for (const ids of [undefined, [], ['inicio'], ['inicio', ' ', 'inicio']]) assert.deepEqual(settle({}, { ...PICK_CONTEXT, ids }), { ...ANY_ASK, message: PICK_LOST }, JSON.stringify(ids))
  assert.deepEqual(settle({}, { ...PICK_CONTEXT, ids: ['inicio', 'x'] }).pick, ANY_PICK)
  for (const any of ['true', 1, null]) {
    assert.deepEqual(settle({ pick: { ...ANY_PICK, any } }), ANY_ASK, String(any))
    assert.deepEqual(settle({ pick: { ...ANY_PICK, any }, message: 'Selecione no canvas o componente que vem antes da mensagem nova.' }), { ...ANY_ASK, message: PICK_LOST }, String(any))
  }
  assert.deepEqual(settle({ pick: { ...MENU_PICK } }).pick, MENU_PICK)
})

test('no Copiloto, a seleção com any chega no parcial e a resposta reparada lê any, qualquer ou todos', async () => {
  const partials = []
  const result = await interviewTurn(menusInput('xai', { history: THANKS }), hooks(() => reply.xai(JSON.stringify({ ...ANY_ASK, pick: ANY_PICK })), { onPartial: (turn) => partials.push(turn) }))
  assert.deepEqual(result.turn, { ...ANY_ASK, pick: ANY_PICK })
  assert.ok(partials.some((turn) => turn.pick && turn.pick.any === true && turn.pick.ready === false), JSON.stringify(partials.at(-1)))
  assert.ok(partials.every((turn) => turn.pick === undefined || turn.pick === null || typeof turn.pick.any === 'boolean'))
  const repaired = async (selection) => {
    calls.length = 0
    const text = JSON.stringify({ mensagem: ANY_ASK.message, sugestoes: ANY_ASK.suggestions, acao: 'ask', plano: ANY_ASK.plan, selecao: { rotulo: 'O componente que vem antes da mensagem nova', ...selection } })
    const turn = await interviewTurn(menusInput('anthropic', { history: THANKS }), hooks(() => reply.anthropic(`\`\`\`json\n${text}\n\`\`\``)))
    assert.equal(calls.length, 1, JSON.stringify(selection))
    return turn.turn
  }
  for (const selection of [{ any: true }, { qualquer: 'sim' }, { todos: 'true', candidatos: [MENU_IDS[0]] }]) assert.deepEqual(await repaired(selection), { ...ANY_ASK, pick: ANY_PICK }, JSON.stringify(selection))
  assert.deepEqual(await repaired({ qualquer: 'talvez' }), ANY_ASK)
})

test('o prompt do Copiloto pede o canvas inteiro para o componente novo sem ponto, confere quantidades e limites e propõe caminhos válidos antes de editar', () => {
  const prompt = copilotSystemPrompt()
  const start = prompt.indexOf('# Componente novo sem ponto no fluxo')
  const middle = prompt.indexOf('# Quantidades e limites')
  assert.ok(prompt.indexOf('# Proposta em revisão') < start && start < middle && middle < prompt.indexOf('# Plano'), 'ordem das seções')
  const position = prompt.slice(start, middle)
  const limits = prompt.slice(middle, prompt.indexOf('# Plano'))
  const numbers = (section) => section.split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => Number(line.split('.')[0]))
  assert.deepEqual([numbers(position), numbers(limits)], [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]])
  for (const text of ['sem dizer o ponto do fluxo, antes ou depois de qual componente, peça para o usuário selecionar no canvas o componente que fica antes do novo', 'mesmo quando um ponto parece o mais provável', 'devolva ask com pick, com any true e candidates vazio', 'Servem para essa seleção os componentes que têm saída, o Início inclusive, porque o componente novo se liga à saída do selecionado', 'A opção nova de um menu entra no menu', 'diz que ele entra logo depois do componente selecionado, ou logo antes dele, se o usuário preferir', 'Depois de qual componente ela entra?', 'ready fica true quando plan já descreve o componente novo inteiro, escrito para entrar logo depois do componente que o usuário selecionar', 'a interface edita logo que ele confirma a seleção de um componente com uma saída', 'quando ainda falta outra decisão sobre o componente novo, ready fica false', 'suggestions traz Logo depois do selecionado e Logo antes do selecionado', 'A mensagem que começa com Selecionei no canvas traz o componente escolhido', 'na saída dele, e o caminho segue como antes', 'ele entra logo antes, na entrada dele', 'com o Início escolhido, ele entra logo depois do Início', 'pergunte em qual saída o componente novo entra, propondo a mais provável', 'Cite em plan o ID do componente escolhido', 'Quando o fluxo tem só o Início, o componente novo entra logo depois dele, sem seleção']) assert.ok(position.includes(text), text)
  for (const text of ['plan e o resultado trazem exatamente esse número', 'As opções a mais, como Voltar e Encerrar, entram quando o usuário pede ou aceita a sua proposta delas', 'escreva com quantas opções cada menu novo ou alterado fica no fim, contando todas, como em: o menu Como podemos ajudar? fica com 8 opções', 'o Menu de Opções tem de 1 a 10 opções, mostra até 3 como botões e, com mais opções, vai como lista', 'a mensagem do menu tem até 1024 caracteres', 'a Múltipla Condição tem até 20 condições', 'o Randomizador tem ao menos 2 caminhos, com pesos que somam 100', 'o Solicitar Dados faz de 1 a 5 tentativas', 'somando os itens que o componente já tem no resumo com os que o pedido acrescenta', 'opções (12) diz quantas opções o menu tem quando a lista vem cortada', 'diga quantos itens o componente tem e quantos cabem', 'trocar as opções atuais pelas novas, avisando que as opções atuais e os passos que só elas alcançam saem do fluxo', 'dividir em dois menus, com uma opção que leva ao segundo', 'ou reduzir o número de opções', 'Edite depois que o usuário escolher um caminho', 'O menu Como podemos ajudar? tem 6 opções e aceita até 10, então cabem mais 4.', 'Trocar as opções atuais, Dividir em dois menus e Acrescentar só 4 opções', 'explique o limite em uma frase e proponha alternativas que cabem nele', 'plan e a edição seguem sempre o formato da plataforma, também quando o usuário insiste']) assert.ok(limits.includes(text), text)
  for (const section of [position, limits]) {
    assert.ok(!/[—–!]/.test(section))
    assert.ok(!/\b(nunca|jamais|evite|proibido)\b|\bnão (faça|use|invente|edite|pergunte|escreva|mude|coloque|repita|deixe|devolva|crie|altere|remova|responda|aplique)\b/i.test(section))
  }
  const builder = interviewSystemPrompt()
  for (const text of ['any true', 'Logo antes do selecionado', 'Quantidades e limites', 'fica com 8 opções', 'Dividir em dois menus']) assert.ok(!builder.includes(text), text)
})

test('o resumo do Copiloto diz quantas opções o menu tem quando a lista vem cortada, e o resumo da montagem segue sem o número', () => {
  const options = Array.from({ length: 12 }, (_, index) => `Assunto número ${index + 1}`)
  const ri = {
    name: 'Muitos assuntos',
    description: '',
    nodes: [
      { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Sobre qual assunto?' }, { key: 'options', value: JSON.stringify(options.map((text) => ({ text }))) }] },
      { id: 'curto', type: 'envio_mensagem', config: [{ key: 'title', value: 'Confirma?' }, { key: 'options', value: JSON.stringify([{ text: 'Sim' }, { text: 'Não' }]) }] },
    ],
    edges: [{ from: 'inicio', output: '', to: 'menu' }, { from: 'menu', output: '1', to: 'curto' }],
  }
  const flow = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(ri, { now: NOW })).flow)))
  const crowded = JSON.parse(JSON.stringify(flow))
  const data = crowded.nodes.find((node) => node.data.data.title === 'Sobre qual assunto?').data.data
  for (let index = 11; index <= 12; index++) Object.assign(data, { [`opt-${index}`]: String(index), [`text-${index}`]: `Assunto número ${index}`, [`description-${index}`]: '' })
  const copilot = interviewFlowSummary(crowded, true)
  assert.match(copilot, /“Sobre qual assunto\?” opções \(12\): Assunto número 1, Assunto número 2, [^|]*… \| /)
  assert.match(copilot, /“Confirma\?” opções: Sim, Não \| /)
  assert.equal(copilot.split('\n').filter((line) => /opções \(\d+\)/.test(line)).length, 1)
  assert.ok(!/opções \(\d+\)/.test(interviewFlowSummary(crowded)))
  assert.match(interviewFlowSummary(crowded), /“Sobre qual assunto\?” opções: Assunto número 1, /)
})

test('o prompt do Copiloto pede ready true quando só falta o componente, com o plano escrito para o componente que o usuário selecionar', () => {
  const prompt = copilotSystemPrompt()
  const section = prompt.slice(prompt.indexOf('# Seleção no canvas'), prompt.indexOf('# Proposta em revisão'))
  const rule = section.split('\n').find((line) => line.includes('ready fica true'))
  assert.ok(rule, 'regra de ready')
  for (const text of ['Em pick, ready fica true quando plan já descreve a mudança inteira, com as suas propostas, e só falta saber qual componente', 'escreva plan para o componente que o usuário selecionar', 'deixe os IDs dos candidatos só em candidates', 'no menu de opções que o usuário selecionar', 'a interface edita logo que o usuário confirma a seleção', 'Quando ainda falta outra decisão além do componente, ready fica false']) assert.ok(rule.includes(text), text)
  assert.ok(section.indexOf(rule) > section.indexOf('candidates traz o ID') && section.indexOf(rule) < section.indexOf('A interface destaca os candidatos'), 'ordem das regras')
  assert.deepEqual(section.split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => Number(line.split('.')[0])), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.ok(!/\bready\b/.test(interviewSystemPrompt()))
})

const noteNode = (id, text, y = 0) => {
  const node = newNode('note', { x: 0, y }, id)
  if (text !== undefined) node.data.data.text = text
  return node
}

test('o resumo do Copiloto conta só os componentes e traz as notas no fim, como anotações sem ID, e o resumo da montagem segue com as notas como antes', () => {
  const short = 'Lembrete: revisar o horário de atendimento.'
  const long = `Aqui entra a segunda via com o link https://lucas-lima.xyz/boleto. ${'O time de cobrança revisa cada texto antes de publicar o fluxo. '.repeat(4)}`
  const flow = { ...FLOW, nodes: [...FLOW.nodes, noteNode('999', short), noteNode('998', long, 200), noteNode('997', undefined, 400)] }
  const copilot = interviewFlowSummary(flow, true)
  const lines = copilot.split('\n')
  assert.equal(lines[1], 'Componentes: 5')
  assert.equal(copilot.slice(0, copilot.indexOf(`\n${NOTES_HEAD}\n`)), interviewFlowSummary(FLOW, true))
  const notes = lines.slice(lines.indexOf(NOTES_HEAD))
  assert.equal(notes.length, 3)
  assert.equal(notes[1], `- “${short}”`)
  assert.match(notes[2], /^- “Aqui entra a segunda via com o link https:\/\/lucas-lima\.xyz\/boleto\. O time de cobrança [^”]*…”$/)
  assert.ok(notes[2].length <= 205, String(notes[2].length))
  assert.ok(!/\(Nota\)|\b99[789]\b/.test(copilot))
  const builder = interviewFlowSummary(flow)
  assert.equal(builder.split('\n')[1], 'Componentes: 8')
  for (const id of ['999', '998', '997']) assert.ok(builder.includes(`- ${id} (Nota)`), id)
  assert.ok(!builder.includes(NOTES_HEAD))
  assert.equal(interviewFlowSummary({ ...FLOW, nodes: [...FLOW.nodes, noteNode('997')] }, true), interviewFlowSummary(FLOW, true))
})

test('no fluxo só com o Início, com ou sem notas, o Copiloto pergunta e edita a partir do Início, e os IDs das notas ficam fora da seleção', async () => {
  const start = { ...FLOW, nodes: FLOW.nodes.filter((node) => node.data.type === START_TYPE), edges: [] }
  const noted = { ...start, nodes: [...start.nodes, noteNode('999', 'Aqui entra o menu de boletos.'), noteNode('998', 'Revisar com o financeiro.', 200)] }
  const history = [{ role: 'user', text: 'crie um menu com Boletos e Suporte' }]
  const question = {
    message: 'Vou começar o fluxo com esse menu, logo depois do Início. Pensei em enviar o link do boleto na opção Boletos e transferir a opção Suporte para o departamento Suporte. Fica assim ou quer outro destino?',
    suggestions: ['Pode ser assim', 'Suporte vai para o Atendimento', 'Pode editar agora'],
    action: 'ask',
    plan: 'Logo depois do Início, envie o menu Como podemos ajudar? com as opções Boletos, que envia o link https://lucas-lima.xyz/boleto, e Suporte, que transfere para o departamento Suporte.',
  }
  const edit = { message: 'Vou montar o menu logo depois do Início.', suggestions: [], action: 'edit', plan: question.plan }
  const answered = [...history, { role: 'assistant', text: question.message }, { role: 'user', text: 'Pode ser assim' }]
  for (const provider of PROVIDERS) {
    for (const [flow, notes] of [[start, false], [noted, true]]) {
      const label = `${provider} ${notes}`
      calls.length = 0
      let result = await interviewTurn(copilotInput(provider, { history, flow }), hooks(() => reply[provider](JSON.stringify({ ...question, pick: null }))))
      assert.deepEqual([result.ok, result.turn, calls.length], [true, question, 1], label)
      const body = bodyText(calls[0])
      assert.ok(body.includes('Componentes: 0'), label)
      assert.ok(body.includes('o pedido monta o atendimento a partir do Início'), label)
      assert.equal(body.includes(NOTES_HEAD), notes, label)
      calls.length = 0
      result = await interviewTurn(copilotInput(provider, { history: answered, flow }), hooks(() => reply[provider](JSON.stringify({ ...edit, action: 'generate', pick: null }))))
      assert.deepEqual([result.ok, result.turn, calls.length], [true, edit, 1], label)
    }
  }
  const state = interviewMessages({ history, flow: noted, scope: 'copilot' })[1].content
  assert.ok(state.includes(`Componentes: 0\nCada linha: id (componente) textos principais | saídas e destinos.\n- inicio (Iniciar Fluxo)\n${NOTES_HEAD}\n- “Aqui entra o menu de boletos.”\n- “Revisar com o financeiro.”\n\n`), state)
  for (const candidates of [['999', '998'], ['inicio', '999']]) {
    const result = await interviewTurn(copilotInput('openai', { history, flow: noted }), hooks(() => reply.openai(JSON.stringify({ ...question, pick: { label: 'a nota', candidates, ready: false } }))))
    assert.deepEqual(result.turn, question, JSON.stringify(candidates))
  }
  const [first, second] = MENU_IDS
  const menusNoted = { ...MENUS, nodes: [...MENUS.nodes, noteNode('999', 'Menu principal revisado.')] }
  let result = await interviewTurn(menusInput('openai', { flow: menusNoted }), hooks(() => reply.openai(JSON.stringify({ ...PICK_ASK, pick: { ...MENU_PICK, candidates: [first, '999', second] } }))))
  assert.deepEqual(result.turn, { ...PICK_ASK, pick: MENU_PICK })
  result = await interviewTurn(menusInput('openai', { flow: menusNoted }), hooks(() => reply.openai(JSON.stringify({ ...PICK_ASK, pick: { ...MENU_PICK, candidates: [first, '999'] } }))))
  assert.deepEqual(result.turn, { ...PICK_ASK, message: PICK_LOST })
})

test('o prompt do Copiloto monta a partir do Início no fluxo só com o Início, pergunta o que faltar e mantém as notas como anotações', () => {
  const prompt = copilotSystemPrompt()
  const decide = prompt.slice(prompt.indexOf('# Como decidir'), prompt.indexOf('# Como perguntar'))
  const rules = decide.split('\n').filter((line) => /^\d+\. /.test(line))
  assert.deepEqual(rules.map((line) => Number(line.split('.')[0])), [1, 2, 3, 4, 5, 6, 7])
  const [start, notes] = rules.slice(5)
  for (const text of ['Quando o resumo tem só o Início, com Componentes: 0, o pedido monta o atendimento a partir do Início', 'o primeiro componente entra na saída do Início, e os outros seguem dele', 'Pergunte o que faltar como em qualquer pedido, propondo a resposta mais provável, e devolva edit com o pedido completo', 'Exemplo para o pedido crie um menu com Boletos e Suporte, num fluxo só com o Início: Vou começar o fluxo com esse menu, logo depois do Início.', 'Fica assim ou quer outro destino?']) assert.ok(start.includes(text), text)
  for (const text of ['As notas no fim do resumo são anotações do usuário no canvas, fora do caminho do atendimento, e ficam no fluxo como estão', 'Use o texto delas como contexto quando o pedido citar uma nota', 'trate em plan e em candidates só dos componentes']) assert.ok(notes.includes(text), text)
  for (const text of ['Componentes: 0', 'a partir do Início', 'anotações do usuário']) assert.ok(!interviewSystemPrompt().includes(text), text)
})

test('no Copiloto, o plano de remoção cita cada componente pelo texto e pelo ID e, para limpar o fluxo, remove todos os componentes mantendo o Início e as notas', async () => {
  const prompt = copilotSystemPrompt()
  const plan = prompt.slice(prompt.indexOf('# Plano'), prompt.indexOf('# Ações'))
  const rules = plan.split('\n').filter((line) => /^\d+\. /.test(line))
  assert.deepEqual(rules.map((line) => Number(line.split('.')[0])), [1, 2, 3, 4])
  const removal = rules[3]
  for (const text of ['4. Na remoção, plan cita cada componente que sai do fluxo pelo texto e pelo ID que aparecem no resumo', 'como em: Remova a mensagem Aguarde um instante, ID 7, e ligue a opção Boletos direto à mensagem com o link do boleto, ID 9.', 'Quando o usuário pede para limpar o fluxo, plan pede para remover todos os componentes, citando o ID de cada um, e manter o Início e as notas, como em: Remova todos os componentes, IDs 2, 3, 4, 5 e 6, mantendo o Início e as notas.']) assert.ok(removal.includes(text), text)
  assert.ok(!/[—–!]/.test(removal))
  for (const text of ['Na remoção', 'limpar o fluxo', 'mantendo o Início e as notas']) assert.ok(!interviewSystemPrompt().includes(text), text)
  const history = [
    { role: 'user', text: 'limpe o fluxo pra mim' },
    { role: 'assistant', text: 'Posso remover todos os componentes e deixar só o Início. Quer manter as notas do canvas?' },
    { role: 'user', text: 'Pode limpar, mantendo só o Início e as notas' },
  ]
  const clear = { message: 'Vou remover todos os componentes, mantendo o Início e as notas.', suggestions: [], action: 'edit', plan: 'Remova todos os componentes do fluxo, mantendo o Início e as notas.' }
  const noted = { ...FLOW, nodes: [...FLOW.nodes, noteNode('999', 'Revisar com o financeiro.')] }
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(copilotInput(provider, { history, flow: noted }), hooks(() => reply[provider](JSON.stringify({ ...clear, pick: null }))))
    assert.deepEqual([result.ok, result.turn, calls.length], [true, clear, 1], provider)
    const body = bodyText(calls[0])
    assert.ok(body.includes(removal.slice(3)), provider)
    assert.ok(body.includes('Pode limpar, mantendo só o Início e as notas'), provider)
  }
})

test('a conversa tenta de novo sozinha quando a conexão cai, antes ou no meio da resposta, e só mostra a falha de rede depois das novas tentativas', async () => {
  calls.length = 0
  let result = await interviewTurn(input('openai'), hooks((call, index) => {
    if (index === 0) throw new TypeError('Failed to fetch')
    return reply.openai(JSON.stringify(ASK))
  }))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.equal(JSON.stringify(calls[1].body), JSON.stringify(calls[0].body))
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks(async (call, index) => {
    if (index > 0) return reply.openai(JSON.stringify(ASK))
    const full = await reply.openai(JSON.stringify(ASK)).text()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(full.slice(0, Math.floor(full.length / 3))))
        setTimeout(() => controller.error(new TypeError('network error')), 5)
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }))
  assert.equal(result.ok, true)
  assert.deepEqual(result.turn, ASK)
  assert.equal(calls.length, 2)
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks(() => {
    throw new TypeError('Failed to fetch')
  }))
  assert.equal(result.failure.code, 'network')
  assert.equal(result.failure.details, 'Verifique a conexão com a internet e tente novamente. Detalhe técnico: Failed to fetch')
  assert.equal(calls.length, 3)
  calls.length = 0
  const controller = new AbortController()
  const pending = interviewTurn(input('openai'), hooks(() => {
    setTimeout(() => controller.abort(), 20)
    throw new TypeError('Failed to fetch')
  }, { signal: controller.signal }))
  result = await pending
  assert.deepEqual(result, { ok: false, failure: { success: false, code: 'aborted', error: 'A resposta foi cancelada.' } })
  assert.equal(calls.length, 1)
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks(() => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } })))
  assert.equal(result.failure.code, 'invalid_key')
  assert.equal(calls.length, 1, 'recusa do provedor não repete')
})

const BUILDER_SCHEMA = '{"type":"object","properties":{"message":{"type":"string","description":"Fala para o usuário: a proposta e uma pergunta, o aviso de montagem ou de edição, ou a despedida"},"suggestions":{"type":"array","items":{"type":"string"},"description":"De 2 a 5 respostas curtas que o usuário pode clicar; vazio fora de ask"},"action":{"type":"string","enum":["ask","generate","edit","finish"],"description":"ask pergunta, generate monta o fluxo novo, edit altera o fluxo aberto, finish encerra a conversa"},"plan":{"type":"string","description":"Descrição consolidada do atendimento com todas as decisões até aqui; na edição, o pedido de mudança completo"}},"required":["message","suggestions","action","plan"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}'
const BUILDER_PROMPT_SHA256 = 'ef4e398a2747dca3aa51051bfc26b2cbeb65a5b3978fd2486e488de9098a0239'
const BUILDER_FIELDS = ['action', 'message', 'plan', 'suggestions']
const COPILOT_FIELDS = ['action', 'adds', 'after', 'layout', 'message', 'pick', 'plan', 'suggestions']
const BUILDER_ACTIONS = ['ask', 'generate', 'edit', 'finish']
const NUMERIC_LIMITS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']
const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex')
const ANCHOR_IDS = MENUS.nodes.filter((node) => node.data.type !== NOTE_TYPE && outputHandles(node).length > 0).map((node) => node.id)
const CLOSED_IDS = MENUS_IDS.filter((id) => !ANCHOR_IDS.includes(id))
const WELCOME = MESSAGE_IDS[0]
const PLACE_PLAN = `Acrescente a mensagem Obrigado pela preferência, volte sempre, logo depois do componente ID ${WELCOME}, na saída dele, e o caminho segue como antes.`
const PLACE_EDIT = { message: 'Vou acrescentar a mensagem de agradecimento logo depois das boas-vindas.', suggestions: [], action: 'edit', plan: PLACE_PLAN, pick: null, adds: true, after: WELCOME, layout: [] }
const PLACE_CONTEXT = { hasFlow: true, history: THANKS, scope: 'copilot', ids: MENUS_IDS, anchors: ANCHOR_IDS, texts: summaryTexts(MENUS) }
const PROPOSAL_DONE = 'Proposta pronta no canvas: 1 componente novo, 1 alterado e 0 removidos.'
const APPLIED_DONE = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const CANCELLED_DONE = 'Pedido cancelado. O fluxo aberto não mudou.'
const PICK_DROPPED = 'Seleção cancelada. Você pode responder por texto.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const WELCOME_CHOICE = `Selecionei no canvas: Enviar Mensagem “Olá, #NAME. Você está no atendimento da Lucas Lima.” · ID ${WELCOME}`
const MENU_CHOICE = `Selecionei no canvas: Menu de Opções “Como podemos ajudar?” · ID ${MENU_IDS[0]}`
const SPOT_QUESTION = 'Pensei em colocar a mensagem logo depois das boas-vindas. Pode ser nesse ponto?'
const WHICH_MENU = 'Qual menu você quer mudar? Selecione no canvas o menu e confirme.'
const placePick = (selected) => ({ label: PLACE_LABEL, candidates: [], ready: selected !== undefined, any: true, ...(selected === undefined ? {} : { selected }) })
const placeAsk = (message, selected, plan = PLACE_PLAN) => ({ message, suggestions: [], action: 'ask', plan, pick: placePick(selected) })
const editOf = (turn) => ({ message: turn.message, suggestions: [], action: 'edit', plan: turn.plan })
const complete = (turn) => ({ pick: null, adds: false, after: '', layout: [], ...turn })
const said = (...texts) => texts.map((text) => (typeof text === 'string' ? { role: 'user', text } : text))
const answer = (text) => ({ role: 'assistant', text })
const SHAPE = [{ role: 'user', text: 'organiza o fluxo em L' }]
const L_CELLS = MENUS_IDS.map((id, index) => (index < 5 ? { id, col: 0, row: index } : { id, col: index - 4, row: 4 }))
const ARRANGE = { message: 'Vou organizar o fluxo em L, com uma coluna descendo e a última linha seguindo para a direita.', suggestions: [], action: 'arrange', plan: '', pick: null, adds: false, after: '', layout: L_CELLS }
const ARRANGE_CONTEXT = { ...PLACE_CONTEXT, history: SHAPE }
const arranged = (layout = L_CELLS, message = ARRANGE.message) => ({ message, suggestions: [], action: 'arrange', plan: '', layout })
const formatOf = {
  openai: (body) => ({ mode: [body.text.format.type, body.text.format.strict, body.text.format.name], schema: body.text.format.schema }),
  anthropic: (body) => ({ mode: [body.output_config.format.type], schema: body.output_config.format.schema }),
  google: (body) => ({ mode: [body.generationConfig.responseMimeType], schema: body.generationConfig.responseSchema }),
  xai: (body) => ({ mode: [body.text.format.type, body.text.format.strict, body.text.format.name], schema: body.text.format.schema }),
}
const STRICT_MODE = {
  openai: ['json_schema', true, INTERVIEW_SCHEMA_NAME],
  anthropic: ['json_schema'],
  google: ['application/json'],
  xai: ['json_schema', true, INTERVIEW_SCHEMA_NAME],
}

test('os textos da seleção do lugar e da organização são os combinados, sem exclamação, travessão nem emoji', () => {
  assert.equal(PLACE_LABEL, 'o componente que vem antes do componente novo')
  assert.equal(PLACE_PROPOSED, 'Antes de editar, confirme no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado, e a minha sugestão já está marcada.')
  assert.equal(PLACE_ASK, 'Antes de editar, selecione no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado.')
  assert.equal(ARRANGE_LOST, 'Qual formato você quer para o fluxo? Por exemplo: em L, em coluna ou como uma casa.')
  assert.equal(ARRANGE_LIMIT, RI_LIMITS.nodes)
  for (const text of [PLACE_LABEL, PLACE_PROPOSED, PLACE_ASK, ARRANGE_LOST]) assert.ok(!/[—–!]|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), text)
  assert.ok(PLACE_LABEL.length <= PICK_LIMITS.label)
})

test('o esquema do Copiloto traz adds, after e layout obrigatórios e a ação arrange, e o esquema e o prompt da montagem continuam byte a byte os mesmos', () => {
  const { jsonSchema } = zodSchema(copilotSchema)
  assert.deepEqual(Object.keys(jsonSchema.properties).sort(), COPILOT_FIELDS)
  assert.deepEqual([...jsonSchema.required].sort(), COPILOT_FIELDS)
  assert.equal(jsonSchema.additionalProperties, false)
  const { action, adds, after, layout } = jsonSchema.properties
  assert.deepEqual(action.enum, [...BUILDER_ACTIONS, 'arrange'])
  assert.match(action.description, /\barrange\b/)
  assert.deepEqual([adds.type, after.type, layout.type, layout.items.type], ['boolean', 'string', 'array', 'object'])
  assert.equal(layout.items.additionalProperties, false)
  assert.deepEqual(Object.keys(layout.items.properties), ['id', 'col', 'row'])
  assert.deepEqual([...layout.items.required].sort(), ['col', 'id', 'row'])
  assert.deepEqual(['id', 'col', 'row'].map((key) => layout.items.properties[key].type), ['string', 'integer', 'integer'])
  assert.match(action.description, /^ask pergunta, edit altera o fluxo aberto, arrange muda só as posições dos componentes no canvas, finish encerra a conversa$/)
  assert.match(adds.description, /^true quando plan cria componentes novos no caminho do atendimento; false nas outras respostas$/)
  assert.match(after.description, /^ID do resumo do fluxo do componente que fica logo antes dos componentes novos: o ponto que o usuário indicou ou a sua sugestão; vazio quando nada novo é criado$/)
  assert.match(layout.description, /^Com arrange, uma célula para cada componente do resumo, o Início inclusive, desenhando o formato pedido e seguindo o caminho a partir do Início; vazio nas outras respostas$/)
  for (const key of ['col', 'row']) assert.ok(layout.items.properties[key].description.includes(`de 0 a ${ARRANGE_LIMIT}`), key)
  assert.match(layout.items.properties.id.description, /ID do componente, como aparece no resumo do fluxo/)
  const walk = (schema, trail) => {
    for (const key of NUMERIC_LIMITS) assert.equal(schema[key], undefined, `${trail} ${key}`)
    if (schema.anyOf) schema.anyOf.forEach((option, index) => walkSchema(option, walk, `${trail}/${index}`))
  }
  walkSchema(jsonSchema, walk)
  const builder = zodSchema(interviewSchema).jsonSchema
  assert.equal(JSON.stringify(builder), BUILDER_SCHEMA)
  for (const key of ['message', 'suggestions', 'plan']) assert.deepEqual(jsonSchema.properties[key], builder.properties[key], key)
  assert.equal(sha256(interviewSystemPrompt()), BUILDER_PROMPT_SHA256)
})

test('os 4 provedores recebem o esquema estrito do Copiloto com adds, after, layout e arrange, e a conversa de montagem segue sem eles', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const copilot = await interviewTurn(menusInput(provider), hooks(() => reply[provider](JSON.stringify(complete(ASK)))))
    const builder = await interviewTurn(input(provider, { flow: MENUS }), hooks(() => reply[provider](JSON.stringify(ASK))))
    assert.deepEqual([copilot.ok, builder.ok, calls.length], [true, true, 2], provider)
    assert.deepEqual([copilot.turn, builder.turn], [ASK, ASK], provider)
    const [turn, build] = calls.map((call) => formatOf[provider](call.body))
    assert.deepEqual([turn.mode, build.mode], [STRICT_MODE[provider], STRICT_MODE[provider]], provider)
    assert.deepEqual([...turn.schema.required].sort(), COPILOT_FIELDS, provider)
    assert.deepEqual(Object.keys(turn.schema.properties).sort(), COPILOT_FIELDS, provider)
    assert.deepEqual(turn.schema.properties.action.enum, [...BUILDER_ACTIONS, 'arrange'], provider)
    const { adds, after, layout } = turn.schema.properties
    assert.deepEqual([adds.type, after.type, layout.type, layout.items.type], ['boolean', 'string', 'array', 'object'], provider)
    assert.deepEqual([...layout.items.required].sort(), ['col', 'id', 'row'], provider)
    assert.deepEqual(['id', 'col', 'row'].map((key) => layout.items.properties[key].type), ['string', 'integer', 'integer'], provider)
    if (provider !== 'google') assert.deepEqual([turn.schema.additionalProperties, layout.items.additionalProperties], [false, false], provider)
    assert.deepEqual([...build.schema.required].sort(), BUILDER_FIELDS, provider)
    assert.deepEqual(Object.keys(build.schema.properties).sort(), BUILDER_FIELDS, provider)
    assert.deepEqual(build.schema.properties.action.enum, BUILDER_ACTIONS, provider)
  }
})

test('placeGiven vale pela seleção no canvas, por palavra de posição, por ID ou pelo texto de um componente, nas falas do usuário depois da última proposta', () => {
  const texts = summaryTexts(MENUS)
  const given = (history, ids = MENUS_IDS) => placeGiven(history, texts, ids)
  const base = 'adicione uma mensagem de agradecimento'
  assert.equal(given(said(base)), false)
  assert.equal(given(said(base, 'pode ser uma mensagem curta')), false)
  assert.equal(given([]), false)
  assert.equal(given(said(base, answer(PLACE_PROPOSED), `Selecionei no canvas: Enviar Mensagem “Olá, #NAME. Você está no atendimento da Lucas Lima.” · ID ${WELCOME}`)), true)
  for (const choice of ['Selecionei no canvas: Encerrar Conversa', 'selecionei no CANVAS: Encerrar Conversa', 'Logo antes do selecionado\n\nSelecionei no canvas: Encerrar Conversa']) assert.equal(given(said(base, answer(PLACE_ASK), choice)), true, choice)
  assert.equal(given(said(base, answer(PLACE_ASK), 'Encerrar Conversa')), false)
  const positions = ['depois do menu', 'antes da despedida', 'após o menu', 'entre o menu e a despedida', 'no início do fluxo', 'no começo do fluxo', 'no fim do fluxo', 'no final do fluxo', 'no fim', 'logo depois do menu', 'logo após o menu', 'no lugar de uma mensagem antiga']
  for (const phrase of positions) {
    assert.equal(given(said(`${base} ${phrase}`)), true, phrase)
    assert.equal(given(said(base, answer('Onde ela entra?'), phrase)), true, phrase)
  }
  for (const alone of ['em seguida', 'Em seguida.']) assert.equal(given(said(base, answer('Onde ela entra?'), alone)), true, alone)
  assert.equal(given(said(`${base} em seguida`)), false)
  for (const phrase of [`na saída do ID ${WELCOME}`, `na saída do #${WELCOME}`, 'na saída do ID 3', 'na saída do id 4']) assert.equal(given(said(`${base} ${phrase}`)), true, phrase)
  for (const phrase of ['na saída do menu Como podemos ajudar', 'no menu QUAL BOLETO VOCE QUER', 'na mensagem obrigado pelo contato. ate logo', 'na mensagem Olá, #NAME. Você está no atendimento da Lucas Lima.']) assert.equal(given(said(`${base} ${phrase}`)), true, phrase)
  assert.equal(given(said(base, answer('Onde ela entra? Depois do menu Como podemos ajudar?'))), false)
  const boundaries = [answer(PROPOSAL_DONE), answer(`Vou acrescentar a mensagem.\n\n${PROPOSAL_DONE}`), answer(APPLIED_DONE), answer(`${APPLIED_DONE}\n\n${FOLLOW_UP}`), answer('Organização pronta no canvas: 5 componentes movidos.'), answer(CANCELLED_DONE), answer(`Vou colocar a mensagem depois do menu.\n\n${CANCELLED_DONE}`)]
  for (const boundary of boundaries) {
    assert.equal(given(said(`${base} depois do menu`, boundary, 'adicione também uma tag Cliente')), false, boundary.text)
    assert.equal(given(said(`Selecionei no canvas: Menu de Opções Como podemos ajudar? · ID 3`, boundary, 'adicione também uma tag Cliente')), false, boundary.text)
    assert.equal(given(said(base, boundary, 'adicione também uma tag Cliente depois do menu')), true, boundary.text)
    assert.equal(given(said(base, boundary)), false, boundary.text)
  }
  assert.equal(given(said(`${base} depois do menu`, answer(PROPOSAL_DONE), 'agora uma tag', answer(APPLIED_DONE), 'adicione também uma tag Cliente')), false)
  assert.equal(given(said(base, answer(PROPOSAL_DONE), 'agora depois do menu', answer('Qual tag?'), 'Cliente')), true)
  assert.equal(given(said(`${base} depois do menu`, answer('Vou acrescentar a mensagem. Fica assim?'), 'adicione também uma tag Cliente')), true)
  for (const chip of ['Logo depois do selecionado', 'Logo antes do selecionado', 'depois da selecionada', 'Logo depois do componente selecionado', 'Logo antes da mensagem selecionada', 'depois do menu selecionado']) assert.equal(given(said(base, answer('Depois de qual componente ela entra?'), chip)), false, chip)
  assert.equal(given(said(base, answer('Depois de qual componente ela entra?'), 'Logo antes do selecionado, no fim do fluxo')), true)
  for (const phrase of ['quero falar da entrega', 'com antecedência', 'no menu', 'para os suportes']) assert.equal(given(said(`${base} ${phrase}`)), false, phrase)
  for (const phrase of ['na saída do ID 99', 'na saída do #99', 'na saída do ID 20']) {
    assert.equal(given(said(`${base} ${phrase}`)), false, phrase)
    assert.equal(placeGiven(said(`${base} ${phrase}`), texts), true, phrase)
  }
  assert.equal(placeGiven(said(`${base} na saída do id abc`), texts), false)
  assert.equal(placeGiven(said(`${base} no menu Como podemos ajudar`)), false)
  assert.equal(placeGiven(said(`${base} no menu Como podemos ajudar`), texts), true)
  const names = new Map([['a', '“Menu”'], ['b', '“Sim” opções: Sim, Não'], ['c', '“Suporte”'], ['d', '“Atendimento geral”']])
  assert.equal(placeGiven(said(`${base} no menu, opção sim`), names, ['a', 'b', 'c', 'd']), false)
  assert.equal(placeGiven(said(`${base} para os suportes`), names, ['a', 'b', 'c', 'd']), false)
  assert.equal(placeGiven(said(`${base} no SUPORTE`), names, ['a', 'b', 'c', 'd']), true)
  assert.equal(placeGiven(said(`${base} no atendimento geral`), names, ['a', 'b', 'c']), false)
  assert.equal(placeGiven(said(`${base} no atendimento geral`), names, ['a', 'b', 'c', 'd']), true)
  const sizes = new Map([['e', '“Boleto”'], ['f', '“Plano”']])
  assert.deepEqual([placeGiven(said(`${base} no boleto`), sizes, ['e', 'f']), placeGiven(said(`${base} no plano`), sizes, ['e', 'f'])], [true, false])
  for (const history of [null, undefined, 'depois do menu', [{ role: 'user' }, { role: 'system', text: 'depois do menu' }, { text: 'depois do menu' }]]) assert.equal(placeGiven(history, texts, MENUS_IDS), false, JSON.stringify(history))
})

test('placeGiven lê só as palavras do próprio usuário: o texto ditado, o texto entre aspas e a posição sem um componente depois dela não dão o lugar', () => {
  const given = (...history) => placeGiven(said(...history), summaryTexts(MENUS), MENUS_IDS)
  for (const text of [
    'adicione a mensagem: Aguarde, em seguida um atendente vai falar com você.',
    'adicione uma mensagem: Entre em contato pelo 0800 123 4567.',
    'adicione uma mensagem: Antes de continuar, tenha o seu CPF em mãos.',
    'adicione uma pergunta com o texto: Depois do envio, qual o seu CPF?',
    'adicione um aviso com a mensagem:\nDepois do almoço retornamos.\nObrigado pela espera.',
    'adicione a mensagem “Depois do almoço retornamos, obrigado pela espera”',
    'adicione a mensagem "Antes do envio, confira o seu CPF"',
    `adicione a mensagem: Seu protocolo é o #${WELCOME}`,
    'adicione uma mensagem de agradecimento, depois eu ajusto o texto',
    'adicione uma pergunta de CPF, depois o atendente valida',
    'adicione uma mensagem avisando que no fim de semana o atendimento é pelo site',
    'adicione uma mensagem avisando que no final de semana não atendemos',
    'adicione uma mensagem avisando que depois das 18h o atendimento é por email',
    'adicione uma mensagem avisando que antes das 8h não atendemos',
  ]) assert.equal(given(text), false, text)
  for (const [question, text] of [
    ['Qual texto você quer no aviso?', 'Seu pedido foi recebido e em seguida enviamos o boleto'],
    [ANY_ASK.message, 'Logo depois dele'],
    [ANY_ASK.message, 'Pode ser logo depois'],
    [ANY_ASK.message, 'Pode ser em seguida'],
  ]) assert.equal(given('adicione um aviso', answer(question), text), false, text)
  for (const text of [
    'adicione depois do menu a mensagem: Aguarde, em seguida um atendente vai falar com você.',
    'coloque depois da mensagem: Obrigado pelo contato. Até logo.',
    'adicione depois das boas-vindas a mensagem “Antes de continuar, tenha o seu CPF em mãos”',
    `na saída do ID ${WELCOME}, adicione a mensagem: Entre em contato pelo 0800 123 4567.`,
    'adicione uma mensagem no fim, depois eu ajusto o texto',
  ]) assert.equal(given(text), true, text)
})

test('placeGiven: o nome de uma palavra vale com no, na ou o tipo do componente logo antes, e o nome de mais palavras vale em qualquer ponto da fala', () => {
  const names = new Map([['3', '“Cliente”'], ['5', '“Atendimento”'], ['6', '“Equipe de Suporte”']])
  const given = (text) => placeGiven(said(text), names, ['3', '5', '6'])
  for (const text of [
    'adicione o horário de atendimento, de segunda a sexta das 8h às 18h',
    'adicione uma pesquisa de satisfação do atendimento',
    'adicione uma mensagem avisando que o atendimento responde em até 2 horas',
    'adicione uma pergunta pedindo o CPF do cliente',
    'adicione uma tag cliente',
  ]) assert.equal(given(text), false, text)
  for (const text of [
    'adicione uma mensagem no Atendimento',
    'adicione uma mensagem no departamento Atendimento',
    'adicione uma pergunta de CPF na tag Cliente',
    'adicione uma pergunta de CPF depois do Cliente',
    'adicione uma mensagem para a equipe de suporte',
  ]) assert.equal(given(text), true, text)
})

test('placeGiven reconhece ao fim, ao final e na saída de um componente, lê as opções dos menus como nomes, com no, na ou opção antes delas, e o lugar proposto pela IA segue para a seleção', () => {
  const texts = new Map([['2', '“Olá, tudo bem?”'], ['3', '“Como podemos ajudar?” opções: Agendar consulta, Boletos, Segunda via, Encerrar'], ['4', '“Escolha” opções (12): Primeira opção longa, Segunda opção cortada…']])
  const given = (...history) => placeGiven(said(...history), texts, ['2', '3', '4'])
  for (const text of [
    'adicione uma pesquisa de satisfação ao final do fluxo',
    'adicione uma pesquisa ao fim do atendimento',
    'coloque uma tag Cliente na saída da mensagem de boas-vindas',
    'coloque uma tag Cliente na saída do menu',
    'na opção Agendar consulta, envie a mensagem Vamos agendar',
    'na opção Boletos, envie o link do boleto',
    'no Boletos, envie o link do boleto',
    'nas opções Segunda via e Boletos, envie o link',
    'na primeira opção longa, envie o link',
  ]) assert.equal(given(text), true, text)
  for (const text of [
    'adicione uma mensagem avisando que a segunda via chega por email',
    'adicione uma mensagem para quem quer agendar consulta',
    'quero falar dos boletos atrasados',
    'na segunda opção cortada, envie o link',
    'adicione uma pergunta: Na opção Boletos, qual o seu CPF?',
  ]) assert.equal(given(text), false, text)
  const proposal = 'Vou colocar a opção 3 no menu Como podemos ajudar. Pensei em Falar com atendente, que transfere para o departamento Atendimento. Fica assim ou quer outro texto e outro destino?'
  assert.equal(given('crie uma opção 3', answer(proposal), 'Pode ser assim'), false)
  assert.equal(given('crie a opção Falar com atendente no menu principal'), false)
})

test('placeGiven: a seleção no canvas vale como lugar só depois de uma pergunta sobre o lugar do componente novo, e Pedido cancelado fecha o pedido', () => {
  const given = (...history) => placeGiven(said(...history), summaryTexts(MENUS), MENUS_IDS)
  const base = 'adicione uma mensagem de agradecimento'
  for (const question of [PLACE_PROPOSED, PLACE_ASK, `Vou acrescentar a mensagem.\n\n${PLACE_PROPOSED}`, ANY_ASK.message, ANY_MESSAGE, SPOT_QUESTION, 'Em qual menu ela entra?', 'Qual componente vem antes dela?', 'Selecione no canvas o componente que vem antes da mensagem nova.']) {
    assert.equal(given(base, answer(question), WELCOME_CHOICE), true, question)
  }
  const compound = 'troque o título do menu para Escolha uma opção e acrescente uma mensagem de agradecimento'
  for (const question of [WHICH_MENU, PICK_MESSAGE, PICK_ASK.message, 'Qual mensagem você quer trocar?', FOLLOW_UP]) {
    assert.equal(given(compound, answer(question), MENU_CHOICE), false, question)
    assert.equal(given(compound, answer(question), `${MENU_CHOICE}\n\nLogo depois da despedida`), true, question)
  }
  assert.equal(given(base, WELCOME_CHOICE), false)
  assert.equal(given(compound, answer(WHICH_MENU), MENU_CHOICE, answer('Qual texto você quer no agradecimento?'), 'Obrigado pela preferência'), false)
  assert.equal(given(compound, answer(WHICH_MENU), MENU_CHOICE, answer(PLACE_PROPOSED), WELCOME_CHOICE), true)
  assert.equal(given(`${base} depois do menu`, answer(PICK_DROPPED), 'pode ser assim'), true)
  assert.equal(given(base, answer(ANY_ASK.message), answer(PICK_DROPPED), 'depois da despedida'), true)
  assert.equal(given('adicione uma mensagem de aviso depois do menu', answer(`Vou colocar o aviso depois do menu.\n\n${CANCELLED_DONE}`), 'adicione uma tag Cliente'), false)
  assert.equal(given('adicione uma mensagem de aviso', answer(PLACE_PROPOSED), WELCOME_CHOICE, answer(CANCELLED_DONE), 'adicione uma tag Cliente'), false)
})

test('settleTurn: o edit do Copiloto que cria componente sem o lugar dito pelo usuário vira a seleção no canvas, com a sugestão do Copiloto marcada quando ela tem saída', () => {
  const settle = (extra = {}, context = PLACE_CONTEXT) => settleTurn({ ...PLACE_EDIT, ...extra }, context)
  assert.deepEqual(ANCHOR_IDS.length > 2 && CLOSED_IDS.length > 0, true)
  assert.deepEqual(settle(), placeAsk(PLACE_PROPOSED, WELCOME))
  for (const after of ANCHOR_IDS) assert.deepEqual(settle({ after }), placeAsk(PLACE_PROPOSED, after), after)
  for (const after of [...CLOSED_IDS, '99', '', 'boas_vindas']) assert.deepEqual(settle({ after }), placeAsk(PLACE_ASK), after)
  const question = 'Pensei na mensagem Obrigado pela preferência, volte sempre. Depois de qual componente ela entra?'
  assert.deepEqual(settle({ message: question }), placeAsk(question, WELCOME))
  assert.deepEqual(settle({ message: question, after: CLOSED_IDS[0] }), placeAsk(question))
  assert.deepEqual(settle({ message: '' }), placeAsk(PLACE_PROPOSED, WELCOME))
  assert.deepEqual(settle({ suggestions: ['Logo depois do selecionado', 'Pode editar agora'] }), placeAsk(PLACE_PROPOSED, WELCOME))
  assert.deepEqual(settle({ action: 'generate' }), placeAsk(PLACE_PROPOSED, WELCOME))
  assert.deepEqual(settle({}, { ...PLACE_CONTEXT, anchors: [ANCHOR_IDS[0], WELCOME] }), placeAsk(PLACE_PROPOSED, WELCOME))
  for (const anchors of [[], [ANCHOR_IDS[0]], [WELCOME, WELCOME]]) assert.deepEqual(settle({}, { ...PLACE_CONTEXT, anchors }), editOf(PLACE_EDIT), JSON.stringify(anchors))
  for (const adds of [false, undefined, null, 'true', 1]) assert.deepEqual(settle({ adds }), editOf(PLACE_EDIT), String(adds))
  for (const scope of [undefined, 'builder']) assert.deepEqual(settle({}, { ...PLACE_CONTEXT, scope }), editOf(PLACE_EDIT), String(scope))
  const opening = { action: 'ask', message: 'Fica assim?', suggestions: ['Pode ser assim', 'Quero outro texto'] }
  const opened = { message: 'Fica assim?', suggestions: ['Pode ser assim', 'Quero outro texto'], action: 'ask', plan: PLACE_PLAN }
  assert.deepEqual(settle(opening), { ...opened, place: { after: WELCOME } }, 'a pergunta leva o ponto em aberto para o Editar agora')
  for (const after of [...CLOSED_IDS, '99', '']) assert.deepEqual(settle({ ...opening, after }), { ...opened, place: {} }, after)
  for (const adds of [false, undefined]) assert.deepEqual(settle({ ...opening, adds }), opened, String(adds))
  assert.deepEqual(settle({ ...opening, plan: '' }), { ...opened, plan: '' })
  assert.deepEqual(settle(opening, { ...PLACE_CONTEXT, history: [...THANKS, answer('Onde ela entra?'), { role: 'user', text: 'Logo depois das boas-vindas' }] }), opened)
  assert.deepEqual(settle(opening, { ...PLACE_CONTEXT, anchors: [WELCOME] }), opened)
  assert.deepEqual(settle(opening, { ...PLACE_CONTEXT, scope: 'builder' }), opened)
  assert.deepEqual(settle({ action: 'finish' }), { message: PLACE_EDIT.message, suggestions: [], action: 'finish', plan: PLACE_PLAN })
  const chosen = [...THANKS, answer(PLACE_PROPOSED), { role: 'user', text: `Selecionei no canvas: Enviar Mensagem “Olá, #NAME. Você está no atendimento da Lucas Lima.” · ID ${WELCOME}` }]
  const worded = [...THANKS, answer('Onde ela entra?'), { role: 'user', text: 'Logo depois das boas-vindas' }]
  for (const history of [chosen, worded]) assert.deepEqual(settle({}, { ...PLACE_CONTEXT, history }), editOf(PLACE_EDIT), history.at(-1).text)
  const later = [...worded, answer(PROPOSAL_DONE), { role: 'user', text: 'adicione também uma tag Cliente' }]
  assert.deepEqual(settle({}, { ...PLACE_CONTEXT, history: later }), placeAsk(PLACE_PROPOSED, WELCOME))
  const cancelled = [{ role: 'user', text: 'adicione uma mensagem de aviso depois do menu' }, answer(`Vou colocar o aviso depois do menu.\n\n${CANCELLED_DONE}`), { role: 'user', text: 'adicione uma tag Cliente' }]
  const compound = [{ role: 'user', text: 'troque o título do menu para Escolha uma opção e acrescente uma mensagem de agradecimento' }, answer(WHICH_MENU), { role: 'user', text: MENU_CHOICE }]
  for (const history of [cancelled, compound]) assert.deepEqual(settle({}, { ...PLACE_CONTEXT, history }), placeAsk(PLACE_PROPOSED, WELCOME), history.at(-1).text)
  assert.deepEqual(settle({}, { ...PLACE_CONTEXT, history: [...compound.slice(0, 2), { role: 'user', text: `${MENU_CHOICE}\n\nLogo depois das boas-vindas` }] }), editOf(PLACE_EDIT))
  assert.deepEqual([settle().pick.ready, settle({ after: CLOSED_IDS[0] }).pick.ready, settle({ after: '' }).pick.ready, settle({ message: question, after: '99' }).pick.ready], [true, false, false, false])
  for (const after of [`ID ${WELCOME}`, ` ${WELCOME} `, `${WELCOME} (Enviar Mensagem)`, `#${WELCOME}`]) assert.deepEqual(settle({ after }).pick, placePick(WELCOME), after)
  for (const after of [null, undefined, 2, ['2']]) assert.deepEqual(settle({ after }).pick, after === 2 ? placePick(WELCOME) : placePick(), String(after))
  assert.deepEqual(settle({ plan: '' }), placeAsk(PLACE_PROPOSED, WELCOME, ''))
  assert.deepEqual(settle({ pick: ANY_PICK }), placeAsk(PLACE_PROPOSED, WELCOME))
  assert.deepEqual(settle({ pick: { ...ANY_PICK, ready: true }, message: '' }), placeAsk(PLACE_PROPOSED, WELCOME))
  assert.deepEqual(settle({ pick: MENU_PICK }), { message: PICK_MESSAGE, suggestions: [], action: 'ask', plan: PLACE_PLAN, pick: MENU_PICK })
  const cited = `No menu de opções ID ${MENU_IDS[1]}, acrescente a opção Falar com atendente.`
  assert.deepEqual(settle({ pick: MENU_PICK, plan: cited }), placeAsk(PLACE_PROPOSED, WELCOME, cited))
  assert.deepEqual(settle({ pick: MENU_PICK, plan: cited }, { ...PLACE_CONTEXT, history: worded }), { message: PLACE_EDIT.message, suggestions: [], action: 'edit', plan: cited })
  const raw = JSON.parse(JSON.stringify({ ...PLACE_EDIT, pick: ANY_PICK, layout: L_CELLS }))
  const before = JSON.stringify(raw)
  settleTurn(raw, PLACE_CONTEXT)
  assert.equal(JSON.stringify(raw), before)
})

test('no Copiloto, os 4 provedores levam o componente novo à seleção do lugar com a sugestão marcada, e o edit segue depois da seleção ou do lugar dito', async () => {
  const chosen = [...THANKS, answer(PLACE_PROPOSED), { role: 'user', text: `Selecionei no canvas: Enviar Mensagem “Olá, #NAME. Você está no atendimento da Lucas Lima.” · ID ${WELCOME}` }]
  const worded = [{ role: 'user', text: 'adicione uma mensagem de agradecimento logo depois das boas-vindas' }]
  for (const provider of PROVIDERS) {
    calls.length = 0
    let result = await interviewTurn(menusInput(provider, { history: THANKS }), hooks(() => reply[provider](JSON.stringify(PLACE_EDIT))))
    assert.deepEqual([result.turn, calls.length], [placeAsk(PLACE_PROPOSED, WELCOME), 1], provider)
    calls.length = 0
    result = await interviewTurn(menusInput(provider, { history: THANKS }), hooks(() => reply[provider](JSON.stringify({ ...PLACE_EDIT, after: CLOSED_IDS[0] }))))
    assert.deepEqual([result.turn, calls.length], [placeAsk(PLACE_ASK), 1], provider)
    for (const history of [chosen, worded]) {
      calls.length = 0
      result = await interviewTurn(menusInput(provider, { history }), hooks(() => reply[provider](JSON.stringify(PLACE_EDIT))))
      assert.deepEqual([result.turn, calls.length], [editOf(PLACE_EDIT), 1], `${provider} ${history.at(-1).text}`)
    }
  }
  const start = { ...FLOW, nodes: FLOW.nodes.filter((node) => node.data.type === START_TYPE), edges: [] }
  calls.length = 0
  let result = await interviewTurn(copilotInput('openai', { history: THANKS, flow: start }), hooks(() => reply.openai(JSON.stringify({ ...PLACE_EDIT, after: 'inicio' }))))
  assert.deepEqual([result.turn, calls.length], [editOf(PLACE_EDIT), 1])
  const noted = { ...MENUS, nodes: [...MENUS.nodes, noteNode('999', 'Revisar com o financeiro.')] }
  result = await interviewTurn(menusInput('openai', { history: THANKS, flow: noted }), hooks(() => reply.openai(JSON.stringify({ ...PLACE_EDIT, after: '999' }))))
  assert.deepEqual(result.turn, placeAsk(PLACE_ASK))
  result = await interviewTurn(input('openai', { history: THANKS, flow: MENUS }), hooks(() => reply.openai(JSON.stringify(PLACE_EDIT))))
  assert.deepEqual(result.turn, editOf(PLACE_EDIT))
})

test('no Copiloto, os 4 provedores pedem o lugar depois de um pedido cancelado e depois da seleção feita para outra mudança, e seguem com a seleção feita para o lugar', async () => {
  const cancelled = said('adicione uma mensagem de aviso depois do menu', answer(`Vou colocar o aviso depois do menu.\n\n${CANCELLED_DONE}`), 'adicione uma tag Cliente')
  const compound = said('troque o título do menu para Escolha uma opção e acrescente uma mensagem de agradecimento', answer(WHICH_MENU), MENU_CHOICE)
  const spotted = said('adicione uma mensagem de agradecimento', answer(SPOT_QUESTION), WELCOME_CHOICE)
  const anywhere = said('adicione uma mensagem de agradecimento', answer(ANY_ASK.message), WELCOME_CHOICE)
  for (const provider of PROVIDERS) {
    for (const history of [cancelled, compound]) {
      calls.length = 0
      const result = await interviewTurn(menusInput(provider, { history }), hooks(() => reply[provider](JSON.stringify(PLACE_EDIT))))
      assert.deepEqual([result.turn, calls.length], [placeAsk(PLACE_PROPOSED, WELCOME), 1], `${provider} ${history.at(-1).text}`)
    }
    for (const history of [spotted, anywhere]) {
      calls.length = 0
      const result = await interviewTurn(menusInput(provider, { history }), hooks(() => reply[provider](JSON.stringify(PLACE_EDIT))))
      assert.deepEqual([result.turn, calls.length], [editOf(PLACE_EDIT), 1], `${provider} ${history[1].text}`)
    }
  }
})

const clinicFlow = (department) => importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow({
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, tag, menu e transferência',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'tag', type: 'tags', config: [{ key: 'tags', value: 'Cliente' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Boletos' }]) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: department }, { key: 'departamento', value: department.toLowerCase() }] },
    { id: 'boletos', type: 'envio_pergunta', config: [{ key: 'template', value: 'Acesse https://lucas-lima.xyz/boleto para baixar o boleto.' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'tag' },
    { from: 'tag', output: '', to: 'menu' },
    { from: 'menu', output: 'Agendar consulta', to: 'agenda' },
    { from: 'menu', output: 'Boletos', to: 'boletos' },
    { from: 'boletos', output: '', to: 'fim' },
  ],
}, { now: NOW })).flow)))

test('no Copiloto, o texto ditado, a resposta solta e o nome comum de uma palavra levam à seleção do lugar, e ao final, na saída e a opção do menu dão o lugar', async () => {
  const flow = clinicFlow('Atendimento')
  const welcome = flow.nodes.find((node) => node.data.type === 'envio_pergunta').id
  const plan = `Logo depois da mensagem de boas-vindas, ID ${welcome}, acrescente o pedido.`
  const edit = { message: 'Vou acrescentar o pedido.', suggestions: [], action: 'edit', plan, pick: null, adds: true, after: welcome, layout: [] }
  const run = async (history) => (await interviewTurn(copilotInput('openai', { history, flow }), hooks(() => reply.openai(JSON.stringify(edit))))).turn
  const asked = { message: PLACE_PROPOSED, suggestions: [], action: 'ask', plan, pick: placePick(welcome) }
  for (const history of [
    said('adicione a mensagem: Aguarde, em seguida um atendente vai falar com você.'),
    said('adicione uma mensagem: Entre em contato pelo 0800 123 4567.'),
    said('adicione uma mensagem: Antes de continuar, tenha o seu CPF em mãos.'),
    said('adicione uma mensagem de agradecimento, depois eu ajusto o texto'),
    said('adicione um aviso', answer('Qual texto você quer no aviso?'), 'Seu pedido foi recebido e em seguida enviamos o boleto'),
    said('adicione uma mensagem de agradecimento', answer(ANY_ASK.message), 'Logo depois dele'),
    said('adicione o horário de atendimento, de segunda a sexta das 8h às 18h'),
    said('adicione uma pesquisa de satisfação do atendimento'),
    said('adicione uma pergunta pedindo o CPF do cliente'),
  ]) assert.deepEqual(await run(history), asked, history.at(-1).text)
  for (const history of [
    said('adicione uma pesquisa de satisfação ao final do fluxo'),
    said('coloque uma mensagem na saída da tag Cliente'),
    said('na opção Agendar consulta, envie a mensagem Vamos agendar'),
    said('adicione uma mensagem no Atendimento'),
  ]) assert.deepEqual(await run(history), { message: edit.message, suggestions: [], action: 'edit', plan }, history.at(-1).text)
})

test('settleTurn: arrange do Copiloto guarda só as células dos componentes do fluxo, arredondadas e dentro do limite, e com menos de 2 células vira pergunta', () => {
  const settle = (extra = {}, context = ARRANGE_CONTEXT) => settleTurn({ ...ARRANGE, ...extra }, context)
  assert.deepEqual(settle(), arranged())
  assert.deepEqual(settle({ plan: 'Organize o fluxo em L.', suggestions: ['Pode ser assim'], pick: ANY_PICK }), arranged())
  assert.deepEqual(settle({ layout: [...L_CELLS, { id: '99', col: 5, row: 5 }, { id: '999', col: 6, row: 0 }, { id: '', col: 1, row: 1 }] }), arranged())
  const rough = [{ id: 'inicio', col: 0.4, row: -0.4 }, { id: WELCOME, col: 1.6, row: 2.5 }, { id: '3', col: -5, row: ARRANGE_LIMIT + 40 }, { id: '4', col: 1e9, row: 7 }]
  assert.deepEqual(settle({ layout: rough }).layout, [{ id: 'inicio', col: 0, row: 0 }, { id: WELCOME, col: 2, row: 3 }, { id: '3', col: 0, row: ARRANGE_LIMIT }, { id: '4', col: ARRANGE_LIMIT, row: 7 }])
  for (const layout of [[], [L_CELLS[0]], [L_CELLS[0], { id: '99', col: 1, row: 0 }], 'em L', null]) {
    const turn = settle({ layout, message: '' })
    assert.deepEqual([turn.action, turn.message, 'layout' in turn], ['ask', ARRANGE_LOST, false], JSON.stringify(layout))
  }
  const question = 'Qual formato você quer, em L ou em coluna?'
  assert.deepEqual([settle({ layout: [], message: question }).action, settle({ layout: [], message: question }).message], ['ask', question])
  assert.deepEqual(settle({ layout: [], message: question, suggestions: ['Em L.', 'Em coluna', 'em coluna', 'Como uma casa'] }), { message: question, suggestions: ['Em L', 'Em coluna', 'Como uma casa'], action: 'ask', plan: '' })
  assert.deepEqual(settle({ layout: [L_CELLS[0]], message: 'Vou organizar o fluxo em L.', suggestions: ['Em L'], plan: 'Organize o fluxo em L.' }), { message: ARRANGE_LOST, suggestions: [], action: 'ask', plan: '' })
  assert.deepEqual(settle({ layout: [], message: question, suggestions: ['Em L'], plan: 'Organize o fluxo em L.' }), { message: question, suggestions: ['Em L'], action: 'ask', plan: '' })
  assert.deepEqual(settle({ message: '' }), arranged(L_CELLS, 'Vou organizar os componentes no canvas.'))
  assert.deepEqual(settle({}, { ...ARRANGE_CONTEXT, ids: undefined }).message, ARRANGE_LOST)
  const loose = [{ id: 'ID 3', col: '2', row: 1 }, { id: '3', col: 5, row: 5 }, { id: '4', col: 'x', row: 0 }, { id: '5', col: 1 }, { id: ' inicio ', col: 0, row: 0 }, 'inicio', null, { id: 6, col: 3, row: 3 }]
  assert.deepEqual(settle({ layout: loose }).layout, [{ id: '3', col: 2, row: 1 }, { id: 'inicio', col: 0, row: 0 }, { id: '6', col: 3, row: 3 }])
  for (const scope of [undefined, 'builder']) {
    const turn = settle({}, { ...ARRANGE_CONTEXT, scope })
    assert.notEqual(turn.action, 'arrange', String(scope))
    assert.deepEqual(['layout' in turn, 'pick' in turn, 'adds' in turn, 'after' in turn], [false, false, false, false], String(scope))
  }
  for (const action of ['ask', 'edit', 'finish']) {
    const turn = settle({ action, plan: 'Organize o fluxo em L.' })
    assert.deepEqual([turn.action, 'layout' in turn, 'adds' in turn, 'after' in turn], [action, false, false, false], action)
  }
})

test('no Copiloto, os 4 provedores devolvem a organização com arrange e as células do fluxo, sem chamar a edição', async () => {
  for (const provider of PROVIDERS) {
    calls.length = 0
    const result = await interviewTurn(menusInput(provider, { history: SHAPE }), hooks(() => reply[provider](JSON.stringify(ARRANGE))))
    assert.deepEqual([result.turn, calls.length], [arranged(), 1], provider)
    calls.length = 0
    const lost = await interviewTurn(menusInput(provider, { history: SHAPE }), hooks(() => reply[provider](JSON.stringify({ ...ARRANGE, message: '', plan: 'Organize os componentes no canvas em L, com o Início no alto da coluna.', layout: [L_CELLS[0], { id: '99', col: 0, row: 1 }] }))))
    assert.deepEqual([lost.turn.action, lost.turn.message, lost.turn.plan, 'layout' in lost.turn, calls.length], ['ask', ARRANGE_LOST, '', false, 1], provider)
  }
  const noted = { ...MENUS, nodes: [...MENUS.nodes, noteNode('999', 'Revisar com o financeiro.')] }
  const result = await interviewTurn(menusInput('openai', { history: SHAPE, flow: noted }), hooks(() => reply.openai(JSON.stringify({ ...ARRANGE, layout: [...L_CELLS, { id: '999', col: 5, row: 0 }] }))))
  assert.deepEqual(result.turn, arranged())
  calls.length = 0
  const builder = await interviewTurn(input('openai', { history: SHAPE, flow: MENUS }), hooks(() => reply.openai(JSON.stringify(ARRANGE))))
  assert.deepEqual([builder.ok, calls.length], [true, 1])
  assert.notEqual(builder.turn.action, 'arrange')
  assert.deepEqual(Object.keys(builder.turn).sort(), BUILDER_FIELDS)
  const partials = []
  const streamed = await interviewTurn(menusInput('xai', { history: SHAPE }), hooks(() => reply.xai(JSON.stringify(ARRANGE)), { onPartial: (turn) => partials.push(turn) }))
  assert.deepEqual(streamed.turn, arranged())
  assert.ok(partials.length > 1)
  assert.ok(partials.some((turn) => turn.action === 'arrange'))
  assert.deepEqual(partials.at(-1).layout, L_CELLS)
  assert.ok(partials.every((turn) => turn.layout === undefined || turn.layout.every((cell) => typeof cell.id === 'string' && Number.isInteger(cell.col) && Number.isInteger(cell.row))), JSON.stringify(partials.map((turn) => turn.layout)))
  const built = []
  await interviewTurn(input('xai', { history: SHAPE, flow: MENUS }), hooks(() => reply.xai(JSON.stringify({ ...ARRANGE, action: 'ask', message: 'Qual formato?' })), { onPartial: (turn) => built.push(turn) }))
  assert.ok(built.length > 1)
  assert.ok(built.every((turn) => !['layout', 'adds', 'after', 'pick'].some((key) => key in turn) && turn.action !== 'arrange'))
})

test('no Copiloto, a resposta fora do formato é reparada com adds, after e layout, inclusive com nomes em português e células fracionadas, sem nova chamada', async () => {
  const fenced = (value) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``
  let result = await interviewTurn(menusInput('anthropic', { history: THANKS }), hooks(() => reply.anthropic(fenced({ mensagem: PLACE_EDIT.message, acao: 'edit', plano: PLACE_PLAN, cria: 'sim', depois: WELCOME }))))
  assert.deepEqual([result.turn, calls.length], [placeAsk(PLACE_PROPOSED, WELCOME), 1])
  calls.length = 0
  result = await interviewTurn(menusInput('anthropic', { history: THANKS }), hooks(() => reply.anthropic(fenced({ mensagem: PLACE_EDIT.message, acao: 'edit', plano: PLACE_PLAN, adds: 'talvez', after: WELCOME }))))
  assert.deepEqual([result.turn, calls.length], [editOf(PLACE_EDIT), 1])
  calls.length = 0
  const cells = L_CELLS.map(({ id, col, row }) => ({ componente: id, coluna: col, linha: row }))
  result = await interviewTurn(menusInput('anthropic', { history: SHAPE }), hooks(() => reply.anthropic(fenced({ mensagem: ARRANGE.message, acao: 'arrange', celulas: cells }))))
  assert.deepEqual([result.turn, calls.length], [arranged(), 1])
  calls.length = 0
  result = await interviewTurn(menusInput('openai', { history: SHAPE }), hooks(() => reply.openai(JSON.stringify({ ...ARRANGE, layout: L_CELLS.map((cell) => ({ ...cell, col: cell.col + 0.4, row: String(cell.row) })) }))))
  assert.deepEqual([result.turn, calls.length], [arranged(), 1])
  calls.length = 0
  result = await interviewTurn(menusInput('google', { history: THANKS }), hooks(() => reply.google(JSON.stringify({ message: PLACE_EDIT.message, suggestions: [], action: 'edit', plan: PLACE_PLAN, pick: null }))))
  assert.deepEqual([result.turn, calls.length], [editOf(PLACE_EDIT), 1])
  calls.length = 0
  result = await interviewTurn(input('anthropic', { history: SHAPE, flow: MENUS }), hooks(() => reply.anthropic(fenced({ mensagem: 'Qual formato?', acao: 'arrange', plano: '', celulas: cells, cria: 'sim', depois: WELCOME }))))
  assert.deepEqual([result.turn, calls.length], [{ message: 'Qual formato?', suggestions: [], action: 'ask', plan: '' }, 1])
  calls.length = 0
  result = await interviewTurn(menusInput('openai', { history: SHAPE }), hooks((call, index) => reply.openai(index === 0 ? 'não é JSON' : JSON.stringify(ARRANGE))))
  assert.deepEqual([result.turn, calls.length], [arranged(), 2])
  assert.match(bodyText(calls[1]), /Responda de novo só com o objeto: message, suggestions, action, plan, pick, adds, after e layout\./)
})

test('o prompt do Copiloto pede adds e after em toda resposta, com o ponto do componente novo vindo do usuário, e organiza o canvas no formato pedido com arrange e layout, em forma positiva', () => {
  const prompt = copilotSystemPrompt()
  const order = ['# Proposta em revisão', '# Ponto do componente novo', '# Componente novo sem ponto no fluxo', '# Quantidades e limites', '# Plano', '# Ações', '# Organização no canvas', '# Registros da interface', '# Estilo', '# Componentes da plataforma']
  const starts = order.map((head) => prompt.indexOf(`\n${head}\n`))
  assert.ok(starts.every((start) => start > 0), JSON.stringify(starts))
  assert.deepEqual([...starts].sort((first, second) => first - second), starts)
  const section = (head) => {
    const start = prompt.indexOf(`\n${head}\n`) + 1
    return prompt.slice(start, prompt.indexOf('\n# ', start))
  }
  const numbers = (text) => text.split('\n').filter((line) => /^\d+\. /.test(line)).map((line) => Number(line.split('.')[0]))
  const place = section('# Ponto do componente novo')
  const arrange = section('# Organização no canvas')
  const actions = section('# Ações')
  assert.deepEqual([numbers(place), numbers(arrange)], [[1, 2], [1, 2, 3, 4, 5, 6]])
  for (const text of [
    '1. O ponto de cada componente novo no caminho do atendimento vem do usuário: dito na conversa, como logo depois da mensagem de boas-vindas, ou escolhido na seleção no canvas.',
    'Quando a resposta é edit e o ponto ainda está em aberto, a interface pede a seleção no canvas antes de editar, com a sua sugestão já marcada.',
    '2. Preencha adds e after em toda resposta.',
    'adds fica true quando plan cria componentes novos no caminho do atendimento.',
    'after traz o ID, como aparece no resumo, do componente que fica logo antes dos componentes novos: o ponto que o usuário indicou ou, enquanto ele está em aberto, a sua sugestão.',
    'Quando nada novo é criado, adds fica false e after fica vazio.',
  ]) assert.ok(place.includes(text), text)
  for (const text of [
    '1. Quando o usuário pede para organizar, arrumar ou posicionar os componentes em um formato, como L, U, T, casa, coluna, linha, grade, escada, zigue-zague, círculo ou qualquer desenho, devolva arrange com layout',
    'uma célula para cada componente do resumo, o Início inclusive',
    `com col e row inteiros, de 0 a ${ARRANGE_LIMIT}, que desenham o formato.`,
    'col cresce para a direita e row cresce para baixo.',
    '2. Distribua as células seguindo o caminho a partir do Início, com cada componente ao lado do anterior no desenho.',
    '3. Um L é uma coluna que desce e, no fim, a última linha seguindo para a direita. Com 6 componentes: col 0 de row 0 a row 3 e, na row 3, col 1 e col 2.',
    '4. Uma casa tem paredes em quadrado e um telhado em triângulo em cima delas, desenhados pelo contorno a partir do Início.',
    'Com 12 componentes: a parede da esquerda em col 0, de row 4 a row 2, o telhado em col 1 row 1, col 2 row 0 e col 3 row 1, a parede da direita em col 4, de row 2 a row 4, e a base em row 4, de col 3 a col 1.',
    '5. A organização muda só as posições no canvas.',
    '6. Nas outras respostas, layout fica vazio.',
  ]) assert.ok(arrange.includes(text), text)
  assert.ok(actions.includes('Nesta conversa, as ações são ask, edit, arrange e finish.'))
  assert.ok(actions.includes('- arrange: o usuário pediu para organizar os componentes no canvas em um formato. message diz em uma frase como os componentes ficam, suggestions e plan ficam vazios e layout traz as células.'))
  assert.ok(section('# Registros da interface').includes('- organização pronta no canvas, com a contagem dos componentes movidos: Organização pronta no canvas: 5 componentes movidos.'))
  for (const text of [place, arrange, actions]) {
    assert.ok(!/[—–!]/.test(text), text)
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), text)
    assert.ok(!/(^|[^\p{L}])(não|nunca|jamais|evite|proibido)(?![\p{L}])/iu.test(text), text)
  }
  const builder = interviewSystemPrompt()
  for (const text of ['adds', 'after', 'arrange', 'layout', 'Ponto do componente novo', 'Organização no canvas', 'zigue-zague', 'telhado', 'Organização pronta no canvas']) assert.ok(!builder.includes(text), text)
})

test('cada chamada do turno informa os tokens na hora, inclusive o pedido de novo por formato e a falha', async () => {
  const ONE = { inputTokens: 11, outputTokens: 22, totalTokens: 33 }
  const spent = []
  const onUsage = (usage) => spent.push(usage)
  let result = await interviewTurn(input('openai'), hooks((call, index) => reply.openai(index === 0 ? 'não é JSON' : JSON.stringify(ASK)), { onUsage }))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(spent, [ONE, ONE])

  spent.length = 0
  calls.length = 0
  result = await interviewTurn(input('openai'), hooks(() => reply.openai('não é JSON'), { onUsage }))
  assert.equal(result.ok, false)
  assert.deepEqual(spent, calls.map(() => ONE))

  spent.length = 0
  calls.length = 0
  const cached = () => sse([
    { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage: { input_tokens: 11, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...pieces(JSON.stringify(ASK)).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } },
    { type: 'message_stop' },
  ])
  result = await interviewTurn(input('anthropic'), hooks(cached, { onUsage }))
  assert.equal(result.ok, true)
  assert.deepEqual(spent, [{ inputTokens: 161, outputTokens: 22, totalTokens: 183 }])
})

test('o cache do Claude conta também no turno que falha no formato, e a queda depois do cabeçalho conta a entrada informada', async () => {
  const CACHED = { inputTokens: 161, outputTokens: 22, totalTokens: 183 }
  const claude = (text, usage = { input_tokens: 11, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 }) => [
    { type: 'message_start', message: { id: 'msg_1', model: MODELS.anthropic, usage } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...pieces(text).map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } },
    { type: 'message_stop' },
  ]
  const spent = []
  const onUsage = (usage) => spent.push(usage)
  let result = await interviewTurn(input('anthropic'), hooks((call, index) => sse(claude(index === 0 ? 'não é JSON' : JSON.stringify(ASK))), { onUsage }))
  assert.equal(result.ok, true)
  assert.deepEqual(spent, [CACHED, CACHED])

  spent.length = 0
  calls.length = 0
  const dropped = () => new Response(new ReadableStream({
    start(controller) {
      const events = claude(JSON.stringify(ASK), { input_tokens: 16000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 }).slice(0, 3)
      controller.enqueue(new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')))
      setTimeout(() => controller.error(new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })), 5)
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  result = await interviewTurn(input('anthropic'), hooks((call, index) => (index === 0 ? dropped() : sse(claude(JSON.stringify(ASK)))), { onUsage }))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.deepEqual(spent, [{ inputTokens: 16000, outputTokens: 1, totalTokens: 16001 }, CACHED])
})

test('o uso do turno que terminou chega antes de o novo pedido acabar', async () => {
  const ONE = { inputTokens: 11, outputTokens: 22, totalTokens: 33 }
  const spent = []
  const controller = new AbortController()
  const stalled = (call) => new Response(new ReadableStream({
    start(stream) {
      call.init.signal.addEventListener('abort', () => stream.error(new DOMException('Aborted', 'AbortError')), { once: true })
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const pending = interviewTurn(input('openai'), hooks((call, index) => (index === 0 ? reply.openai('não é JSON') : stalled(call)), { signal: controller.signal, onUsage: (usage) => spent.push(usage) }))
  while (calls.length < 2) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(spent, [ONE])
  controller.abort()
  assert.equal((await pending).failure.code, 'aborted')
  assert.deepEqual(spent, [ONE])
})
