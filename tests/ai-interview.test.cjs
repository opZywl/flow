const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

globalThis.fetch = async () => {
  throw new Error('rede global bloqueada nos testes da conversa')
}

const { zodSchema } = require('ai')
const { interviewTurn, interviewSystemPrompt, copilotSystemPrompt, interviewMessages, interviewFlowSummary, interviewSchema, copilotSchema, settleTurn, INTERVIEW_SCHEMA_NAME, SUGGESTION_LIMITS, PICK_LIMITS } = require('../lib/atendimento/ai/interview.ts')
const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { componentCatalog, START_TYPE, NOTE_TYPE } = require('../lib/atendimento/catalog.ts')
const { newNode, importFlow } = require('../lib/atendimento/format.ts')

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
  const note = newNode('note', { x: 0, y: 0 }, '999')
  note.data.data.text = 'Lembrete.'
  assert.ok(interviewFlowSummary({ ...FLOW, nodes: [...FLOW.nodes, note] }).includes('(Nota)'))
})

const COPILOT_REQUEST = [{ role: 'user', text: 'crie uma opcao 8' }]
const COPILOT_FLOW_MISSING = 'Abra um fluxo com componentes para o Copiloto editar.'
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
  for (const [flow, count] of [[empty, 0], [noted, 1]]) {
    calls.length = 0
    const result = await interviewTurn(copilotInput('openai', { flow }), hooks(() => reply.openai(JSON.stringify(ASK))))
    assert.deepEqual([result.ok, calls.length], [true, 1], String(count))
    const state = interviewMessages({ history: COPILOT_REQUEST, flow, scope: 'copilot' })[1].content
    assert.ok(state.startsWith(`# Situação atual\n${COPILOT_OPENED}\n\n# Resumo do fluxo aberto\n`), String(count))
    assert.ok(state.includes(`Componentes: ${count}`), String(count))
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
  for (const action of ['- ask:', '- edit:', '- finish:']) assert.ok(prompt.includes(action), action)
  assert.match(prompt, /- finish: o usuário já tem o que precisa, inclusive quando decide manter o fluxo como está\./)
  assert.ok(!prompt.includes('- generate:'))
  for (const text of ['Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.', 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.', 'Proposta descartada. O fluxo aberto não mudou.', 'Pedido cancelado. O fluxo aberto não mudou.', 'Precisa mudar mais alguma coisa no fluxo?', 'Aplicar']) assert.ok(prompt.includes(text), text)
  const listed = componentCatalog.filter((definition) => ![START_TYPE, NOTE_TYPE].includes(definition.nativeType ?? definition.id))
  for (const definition of listed) assert.ok(prompt.includes(`- ${definition.label}`), definition.label)
  assert.ok(prompt.length < 16000, String(prompt.length))
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
const MENU_PICK = { label: 'o menu de opções', candidates: MENU_IDS }
const PICK_ASK = {
  message: 'O fluxo tem dois menus de opções. Selecione no canvas o menu da opção nova e clique em Confirmar.',
  suggestions: ['No menu Como podemos ajudar', 'No menu Qual boleto você quer'],
  action: 'ask',
  plan: 'Criar a opção Falar com atendente, que transfere para o departamento Atendimento, no menu de opções que o usuário selecionar no canvas.',
}
const PICK_LOST = 'Em qual componente você quer fazer essa mudança? Escreva o texto que aparece nele.'
const PICK_CONTEXT = { hasFlow: true, history: COPILOT_REQUEST, scope: 'copilot', ids: MENUS_IDS }
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
  assert.deepEqual(objects, ['$', '$.pick/0'])
  assert.deepEqual(unions, ['$.pick'])
  assert.deepEqual(Object.keys(jsonSchema.properties).sort(), ['action', 'message', 'pick', 'plan', 'suggestions'])
  const { pick } = jsonSchema.properties
  assert.deepEqual(pick.anyOf[1], { type: 'null' })
  assert.deepEqual(Object.keys(pick.anyOf[0].properties), ['label', 'candidates'])
  assert.equal(pick.anyOf[0].properties.label.type, 'string')
  assert.equal(pick.anyOf[0].properties.candidates.items.type, 'string')
  for (const schema of [pick, pick.anyOf[0].properties.label, pick.anyOf[0].properties.candidates]) assert.ok(schema.description.length > 30, JSON.stringify(schema))
  const builder = zodSchema(interviewSchema).jsonSchema
  for (const key of ['message', 'suggestions', 'action', 'plan']) assert.deepEqual(jsonSchema.properties[key], builder.properties[key], key)
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
  assert.deepEqual(ask({ label: 'a mensagem', candidates: MESSAGE_IDS }).pick, { label: 'a mensagem', candidates: MESSAGE_IDS })
  for (const candidates of [[], [first], [first, first, ` ${first}`], [first, 'x'], ['x', 'y'], 'abc']) assert.equal('pick' in ask({ label: 'o menu', candidates }), false, JSON.stringify(candidates))
  for (const pick of [null, undefined, 'o menu', [first, second], { label: 'o menu' }, { label: 'o menu', candidates: [] }]) assert.deepEqual(ask(pick), PICK_ASK, JSON.stringify(pick))
  for (const action of ['edit', 'generate', 'finish']) assert.equal('pick' in settleTurn({ ...PICK_ASK, action, pick: MENU_PICK }, PICK_CONTEXT), false, action)
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

  assert.equal(ask(MENU_PICK, { message: '' }).message, 'Selecione o menu de opções no canvas e clique em Confirmar.')
  assert.equal(ask(MENU_PICK, { message: 'Qual dos dois menus? 😀' }).message, 'Qual dos dois menus?')
  assert.deepEqual(ask({ label: 'o menu de opções', candidates: [first, '999'] }), { ...PICK_ASK, message: PICK_LOST })
  assert.equal(ask({ label: 'o menu', candidates: [first] }, { message: '' }).message, PICK_LOST)
  const typed = 'Em qual menu entra a opção nova, Como podemos ajudar ou Qual boleto você quer?'
  assert.equal(ask({ label: 'o menu', candidates: [first] }, { message: typed }).message, typed)
  assert.equal(ask({ label: '', candidates: [] }, { message: 'A proposta está no canvas. Quer mudar o texto?' }).message, 'A proposta está no canvas. Quer mudar o texto?')
  assert.equal(settleTurn({ ...PICK_ASK, message: '', pick: { label: 'o menu', candidates: [first] } }, { ...PICK_CONTEXT, scope: 'builder' }).message, 'Me conte como você quer que o atendimento funcione.')

  const custom = { ...PICK_CONTEXT, ids: ['inicio', 'menu_a', 'Menu_B', 'Dup', 'dup'] }
  assert.deepEqual(ask({ label: 'o menu', candidates: ['“Menu_A”', 'id: menu_b', 'MENU_A', ' ID Menu_B'] }, {}, custom).pick.candidates, ['menu_a', 'Menu_B'])
  assert.deepEqual(ask({ label: 'o menu', candidates: ['Dup', 'dup', 'DUP'] }, {}, custom).pick.candidates, ['Dup', 'dup'])
  assert.deepEqual(ask({ label: 'o ponto do fluxo', candidates: ['inicio', 'menu_a'] }, {}, custom).pick.candidates, ['inicio', 'menu_a'])
  assert.deepEqual(ask({ label: 'o menu', candidates: ['Menu de Opções “Financeiro” · ID Menu_B', 'Menu de Opções · ID menu_a.'] }, {}, custom).pick.candidates, ['Menu_B', 'menu_a'])
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
  assert.match(bodyText(calls[1]), /Responda de novo só com o objeto: message, suggestions, action, plan e pick\./)
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
  assert.ok(copilot.every((turn) => turn.pick === undefined || (typeof turn.pick.label === 'string' && turn.pick.candidates.every((id) => typeof id === 'string'))))
  const empty = []
  await interviewTurn(menusInput('openai'), hooks(() => reply.openai(JSON.stringify({ ...ASK, pick: null })), { onPartial: (turn) => empty.push(turn) }))
  assert.equal(empty.at(-1).pick, null)
  const builder = []
  result = await interviewTurn(input('xai', { flow: MENUS }), hooks(() => reply.xai(answer), { onPartial: (turn) => builder.push(turn) }))
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
  assert.deepEqual(result.turn.pick, { label: 'o menu de opções', candidates: [first, '900'] })
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
  for (const text of ['mais de um que serve', 'como dois menus de opções ou várias mensagens', 'devolva ask com pick', 'label diz o que selecionar', 'candidates traz o ID', 'clicar em Confirmar', 'Nessa pergunta, suggestions traz atalhos em texto, um para cada candidato', 'Quando só um componente do resumo serve, use esse componente direto', 'pick fica null', 'começa com Selecionei no canvas', 'cite em plan o ID e o texto dele', 'Depois de Seleção cancelada']) assert.ok(section.includes(text), text)
  for (const text of ['quando mais de um serve: peça para o usuário selecionar no canvas', 'pick traz a seleção no canvas quando ela se aplica', '- seleção no canvas cancelada: Seleção cancelada. Você pode responder por texto.']) assert.ok(prompt.includes(text), text)
  assert.ok(!/\bpick\b|Selecionei no canvas|Seleção no canvas/.test(interviewSystemPrompt()))
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
