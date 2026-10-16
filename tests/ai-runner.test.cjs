const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

globalThis.fetch = async () => {
  throw new Error('rede global bloqueada nos testes do motor')
}

const { runGeneration, parseGenerationRequest, salvageRi, overlayRi, modelEffort, maxOutputFor, INTERRUPTED_NOTICE } = require('../lib/atendimento/ai/runner.ts')
const { previewFlow } = require('../lib/atendimento/ai/preview.ts')
const { PROVIDERS, effortsFor, defaultEffort, findPreset, providerEffort } = require('../lib/atendimento/ai/providers.ts')
const { EFFORTS } = require('../lib/atendimento/ai/contracts.ts')
const { validateFlow } = require('../lib/atendimento/format.ts')
const { START_ID } = require('../lib/atendimento/catalog.ts')

const KEYS = {
  openai: 'sk-test-0123456789abcdefghijklmnop',
  anthropic: 'sk-ant-test-0123456789abcdefghijkl',
  google: 'AIzaTest0123456789abcdefghijklmnop',
  xai: 'xai-test-0123456789abcdefghijklmn',
}
const MODELS = { openai: 'gpt-6-luna', anthropic: 'claude-opus-5-5', google: 'gemini-3.8-flash', xai: 'grok-4.7' }

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

const calls = []
afterEach(() => {
  calls.length = 0
})

function pieces(text, size = 64) {
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

function mock(responder) {
  return async function fetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const call = { url, init, headers: Object.fromEntries(new Headers(init.headers).entries()), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }
    calls.push(call)
    return responder(call, calls.length - 1)
  }
}

function input(provider, extra = {}) {
  return { provider, model: MODELS[provider], apiKey: KEYS[provider], prompt: 'Atendimento de clínica com menu para agendar consulta e encerrar.', size: 'auto', effort: 'medium', ...extra }
}

function hooks(responder, extra = {}) {
  return { transport: 'browser', signal: new AbortController().signal, fetch: mock(responder), ...extra }
}

async function cut(provider, text, fraction) {
  const full = await reply[provider](text).text()
  return full.slice(0, Math.floor(full.length * fraction))
}

function dropped(provider, text = JSON.stringify(RI), fraction = 0.8) {
  return (async () => {
    const part = await cut(provider, text, fraction)
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(part))
        setTimeout(() => controller.error(new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })), 5)
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })()
}

function hanging(provider, call, text = JSON.stringify(RI), fraction = 0.8) {
  return (async () => {
    const part = await cut(provider, text, fraction)
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(part))
        const signal = call.init.signal
        const stop = () => controller.error(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        if (signal?.aborted) stop()
        else signal?.addEventListener('abort', stop, { once: true })
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })()
}

function assertNoKey(value, key) {
  assert.equal(JSON.stringify(value).includes(key), false, 'a chave apareceu no resultado')
}

test('o motor não usa console, armazenamento, ambiente nem comentários', () => {
  for (const file of ['lib/atendimento/ai/runner.ts', 'lib/atendimento/ai/preview.ts', 'app/api/generate-workflow/route.ts']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.equal(/console\./.test(source), false, file)
    assert.equal(/localStorage|sessionStorage|indexedDB|process\.env/.test(source), false, file)
    assert.equal(/\/\/\s|\/\*/.test(source.replace(/https?:\/\//g, '')), false, `${file} tem comentários`)
    assert.ok(!/[—–]/.test(source), file)
  }
})

test('GPT-6 Luna é predefinição da OpenAI e o esforço padrão é médio', () => {
  const openai = PROVIDERS.find((provider) => provider.id === 'openai')
  const luna = findPreset('openai', 'gpt-6-luna')
  assert.ok(openai.presets.includes(luna))
  assert.equal(luna.name, 'GPT-6 Luna')
  assert.match(luna.note, /rápido/)
  assert.ok(luna.vision)
  assert.deepEqual([...EFFORTS], ['low', 'medium', 'high', 'max'])
  for (const provider of PROVIDERS) {
    for (const preset of provider.presets) {
      const efforts = effortsFor(provider.id, preset.id)
      assert.ok(efforts.length >= 3, preset.id)
      assert.ok(efforts.every((effort) => EFFORTS.includes(effort)), preset.id)
      assert.equal(defaultEffort(provider.id, preset.id), 'medium', preset.id)
    }
    assert.deepEqual([...effortsFor(provider.id, 'modelo-da-conta-x')], [...EFFORTS])
    assert.equal(defaultEffort(provider.id, 'modelo-da-conta-x'), 'medium')
  }
  assert.deepEqual([...effortsFor('google', 'gemini-3.8-flash')], ['low', 'medium', 'high'])
  assert.deepEqual([...effortsFor('openai', 'gpt-6-luna')], ['low', 'medium', 'high', 'max'])
  assert.deepEqual(['openai', 'anthropic', 'google', 'xai'].map((provider) => providerEffort(provider, 'max')), ['max', 'max', 'high', 'xhigh'])
  for (const effort of ['low', 'medium', 'high']) for (const provider of ['openai', 'anthropic', 'google', 'xai']) assert.equal(providerEffort(provider, effort), effort)
})

test('o esforço só vai para modelos que aceitam e o máximo de saída respeita cada provedor', () => {
  assert.equal(modelEffort('openai', 'gpt-6-luna', 'max'), 'max')
  assert.equal(modelEffort('openai', 'gpt-5', 'max'), 'high')
  assert.equal(modelEffort('openai', 'o3', 'low'), 'low')
  assert.equal(modelEffort('openai', 'gpt-4o', 'high'), undefined)
  assert.equal(modelEffort('anthropic', 'claude-sonnet-5-5', 'max'), 'max')
  assert.equal(modelEffort('anthropic', 'claude-opus-4-5-20251101', 'max'), 'high')
  assert.equal(modelEffort('anthropic', 'claude-sonnet-4-20250514', 'medium'), undefined)
  assert.equal(modelEffort('anthropic', 'claude-3-7-sonnet-latest', 'medium'), undefined)
  assert.equal(modelEffort('google', 'gemini-3.1-pro-preview', 'max'), 'high')
  assert.equal(modelEffort('google', 'gemini-2.5-flash', 'low'), undefined)
  assert.equal(modelEffort('xai', 'grok-4.3', 'max'), 'xhigh')
  assert.equal(modelEffort('xai', 'grok-4-0709', 'high'), undefined)
  assert.equal(maxOutputFor('openai', 'gpt-6-luna'), 128000)
  assert.equal(maxOutputFor('openai', 'gpt-4o'), undefined)
  assert.equal(maxOutputFor('anthropic', 'claude-opus-5-5'), 128000)
  assert.equal(maxOutputFor('google', 'gemini-3.8-flash'), 65536)
  assert.equal(maxOutputFor('xai', 'grok-4.7'), 128000)
})

test('gera no navegador direto com a Anthropic, com o cabeçalho de acesso direto e sem a chave no resultado', async () => {
  const partials = []
  const progress = []
  const result = await runGeneration(input('anthropic'), hooks(() => reply.anthropic(JSON.stringify(RI)), { onPartial: (ri) => partials.push(ri), onProgress: (value) => progress.push(value) }))
  assert.equal(result.success, true)
  assert.equal(result.partial, undefined)
  assert.equal(result.rounds, 1)
  assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [])
  assertNoKey(result, KEYS.anthropic)
  assert.equal(calls.length, 1)
  const [call] = calls
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(call.headers['anthropic-dangerous-direct-browser-access'], 'true')
  assert.equal(call.headers['x-api-key'], KEYS.anthropic)
  assert.equal(call.headers['user-agent'], undefined)
  assert.equal(progress[0].stage, 'preparando')
  assert.ok(partials.length > 1)
})

test('no servidor a Anthropic não recebe o cabeçalho de acesso direto do navegador', async () => {
  const result = await runGeneration(input('anthropic'), hooks(() => reply.anthropic(JSON.stringify(RI)), { transport: 'server', deadlineMs: 270000 }))
  assert.equal(result.success, true)
  assert.equal(calls[0].headers['anthropic-dangerous-direct-browser-access'], undefined)
})

const EFFORT_BODIES = {
  openai: { read: (body) => body.reasoning?.effort, max: (body) => body.max_output_tokens, expected: { low: 'low', medium: 'medium', high: 'high', max: 'max' }, limit: 128000 },
  anthropic: { read: (body) => body.output_config?.effort, max: (body) => body.max_tokens, expected: { low: 'low', medium: 'medium', high: 'high', max: 'max' }, limit: 128000 },
  google: { read: (body) => body.generationConfig?.thinkingConfig?.thinkingLevel, max: (body) => body.generationConfig?.maxOutputTokens, expected: { low: 'low', medium: 'medium', high: 'high', max: 'high' }, limit: 65536 },
  xai: { read: (body) => body.reasoning?.effort, max: (body) => body.max_output_tokens, expected: { low: 'low', medium: 'medium', high: 'high', max: 'xhigh' }, limit: 128000 },
}

for (const [provider, spec] of Object.entries(EFFORT_BODIES)) {
  test(`o corpo da ${provider} leva o esforço mapeado e o máximo de saída`, async () => {
    for (const effort of EFFORTS) {
      calls.length = 0
      const result = await runGeneration(input(provider, { effort }), hooks(() => reply[provider](JSON.stringify(RI))))
      assert.equal(result.success, true, `${provider} ${effort}`)
      assert.equal(spec.read(calls[0].body), spec.expected[effort], `${provider} ${effort}`)
      assert.equal(spec.max(calls[0].body), spec.limit, provider)
      assertNoKey(result, KEYS[provider])
    }
    calls.length = 0
    const { effort, ...rest } = input(provider)
    const result = await runGeneration(rest, hooks(() => reply[provider](JSON.stringify(RI))))
    assert.equal(result.success, true)
    assert.equal(spec.read(calls[0].body), 'medium')
    if (provider === 'anthropic') assert.equal(calls[0].body.thinking?.type === 'disabled', false)
  })
}

test('modelo legado recebe a chamada sem esforço para não ser recusado', async () => {
  let result = await runGeneration(input('google', { model: 'gemini-2.5-flash', effort: 'high' }), hooks(() => reply.google(JSON.stringify(RI))))
  assert.equal(result.success, true)
  assert.equal(calls[0].body.generationConfig.thinkingConfig, undefined)
  calls.length = 0
  result = await runGeneration(input('anthropic', { model: 'claude-sonnet-4-20250514', effort: 'max' }), hooks(() => reply.anthropic(JSON.stringify(RI))))
  assert.equal(result.success, true)
  assert.equal(calls[0].body.output_config?.effort, undefined)
})

test('recusa do limite de saída ou do esforço repete a mesma rodada sem eles', async () => {
  const result = await runGeneration(input('openai', { effort: 'max' }), hooks((call, index) => {
    if (index === 0) return new Response(JSON.stringify({ error: { message: 'max_output_tokens is too large for this model.', type: 'invalid_request_error' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    if (index === 1) return new Response(JSON.stringify({ error: { message: 'Unsupported value: reasoning.effort does not support max with this model.', type: 'invalid_request_error' } }), { status: 400, headers: { 'content-type': 'application/json' } })
    return reply.openai(JSON.stringify(RI))
  }))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 1)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].body.max_output_tokens, 128000)
  assert.equal(calls[1].body.max_output_tokens, undefined)
  assert.equal(calls[1].body.reasoning?.effort, 'max')
  assert.equal(calls[2].body.reasoning?.effort, undefined)
})

test('stream que cai no meio aproveita os componentes completos e pede a continuação', async () => {
  const partials = []
  let resumed = false
  const result = await runGeneration(input('openai'), hooks((call, index) => index === 0 ? dropped('openai') : reply.openai(JSON.stringify(RI)), {
    onPartial: (ri) => partials.push({ round: calls.length, nodes: ri.nodes.length }),
    onProgress: (value) => {
      if (value.resumed) resumed = true
    },
  }))
  assert.equal(result.success, true)
  assert.equal(result.partial, undefined)
  assert.equal(result.rounds, 2)
  assert.equal(calls.length, 2)
  assert.equal(resumed, true)
  assert.ok(!result.issues.some((issue) => issue.message === INTERRUPTED_NOTICE))
  const second = calls[1].body.input
  assert.deepEqual(second.map((message) => message.role), ['developer', 'user', 'assistant', 'user'])
  const salvaged = JSON.parse(second[2].content[0].text)
  assert.ok(salvaged.nodes.length >= 1 && salvaged.nodes.length <= RI.nodes.length)
  for (const node of salvaged.nodes) assert.deepEqual(node, RI.nodes.find((entry) => entry.id === node.id))
  assert.match(JSON.stringify(second[3].content), /interrompida/)
  assert.match(JSON.stringify(second[3].content), /Mantenha os ids/)
  assert.match(result.transcript, /Retomada 1/)
  const later = partials.filter((entry) => entry.round === 2)
  assert.ok(later.length > 0)
  assert.ok(later.every((entry) => entry.nodes >= salvaged.nodes.length))
  assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [])
})

test('stream que cai na última rodada devolve sucesso parcial com aviso', async () => {
  for (const provider of ['openai', 'anthropic', 'google', 'xai']) {
    calls.length = 0
    const result = await runGeneration(input(provider), hooks(() => dropped(provider)))
    assert.equal(result.success, true, provider)
    assert.equal(result.partial, true, provider)
    assert.equal(result.rounds, 3, provider)
    assert.equal(calls.length, 3, provider)
    const notice = result.issues.find((issue) => issue.message === INTERRUPTED_NOTICE)
    assert.deepEqual(notice, { severity: 'warning', scope: 'ia', message: 'A geração foi interrompida antes do fim e o fluxo pode estar incompleto.' })
    assert.ok(result.workflow.nodes.some((node) => node.id !== START_ID))
    assertNoKey(result, KEYS[provider])
  }
})

test('queda sem nenhum componente completo continua como falha de rede, sem rodadas extras', async () => {
  const result = await runGeneration(input('openai'), hooks(() => dropped('openai', JSON.stringify(RI).slice(0, 120), 0.6)))
  assert.deepEqual(result, { success: false, code: 'network', error: 'Não foi possível conectar ao provedor.', details: 'Verifique a conexão com a internet e tente novamente.' })
  assert.equal(calls.length, 1)
})

test('prazo do servidor com componentes completos vira sucesso parcial, nunca timeout', async () => {
  const result = await runGeneration(input('openai'), hooks((call) => hanging('openai', call), { transport: 'server', deadlineMs: 300 }))
  assert.equal(result.success, true)
  assert.equal(result.partial, true)
  assert.equal(result.rounds, 1)
  assert.equal(calls.length, 1)
  assert.ok(result.issues.some((issue) => issue.message === INTERRUPTED_NOTICE))
})

test('prazo do servidor sem nada aproveitável ainda responde timeout', async () => {
  const result = await runGeneration(input('openai'), hooks((call) => hanging('openai', call, JSON.stringify(RI).slice(0, 120), 0.5), { transport: 'server', deadlineMs: 200 }))
  assert.equal(result.success, false)
  assert.equal(result.code, 'timeout')
})

test('no navegador não há prazo e o cancelamento pelo usuário vira aborted', async () => {
  const controller = new AbortController()
  const pending = runGeneration(input('xai'), hooks((call) => hanging('xai', call), { signal: controller.signal }))
  while (calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
  await new Promise((resolve) => setTimeout(resolve, 30))
  controller.abort()
  const result = await pending
  assert.deepEqual(result, { success: false, code: 'aborted', error: 'A geração foi cancelada.' })
  assert.equal(calls.length, 1)
})

test('onPartial recebe a RI crescendo a cada atualização do stream', async () => {
  const partials = []
  const result = await runGeneration(input('google'), hooks(() => reply.google(JSON.stringify(RI)), { onPartial: (ri) => partials.push(ri) }))
  assert.equal(result.success, true)
  assert.ok(partials.length > 5, String(partials.length))
  for (const ri of partials) {
    assert.ok(Array.isArray(ri.nodes) && Array.isArray(ri.edges))
    assert.equal(typeof ri.name, 'string')
  }
  const counts = partials.map((ri) => ri.nodes.length)
  assert.ok(counts.every((count, index) => index === 0 || count >= counts[index - 1]))
  assert.equal(partials.at(-1).nodes.length, RI.nodes.length)
  assert.equal(partials.at(-1).edges.length, RI.edges.length)
})

test('ouvintes que lançam erro não derrubam a geração', async () => {
  const result = await runGeneration(input('openai'), hooks(() => reply.openai(JSON.stringify(RI)), {
    onPartial: () => {
      throw new Error('falha do ouvinte')
    },
    onProgress: () => {
      throw new Error('falha do ouvinte')
    },
  }))
  assert.equal(result.success, true)
})

test('runGeneration nunca lança: entrada inválida e fetch que explode viram falhas em PT-BR', async () => {
  let result = await runGeneration({ ...input('openai'), effort: 'turbo' }, hooks(() => reply.openai('{}')))
  assert.deepEqual(result, { success: false, code: 'invalid_request', error: 'Escolha um nível de esforço válido.', field: 'effort' })
  result = await runGeneration({ ...input('openai'), provider: 'deepseek' }, hooks(() => reply.openai('{}')))
  assert.equal(result.field, 'provider')
  result = await runGeneration(input('openai'), hooks(() => {
    throw new TypeError('Failed to fetch')
  }))
  assert.equal(result.code, 'network')
  assert.equal(calls.length, 1)
  result = await runGeneration(input('openai', { image: 'data:image/png;base64,AAAA' }), hooks(() => reply.openai('{}')))
  assert.equal(result.field, 'image')
})

test('a imagem em data URL é decodificada no navegador e enviada ao provedor', async () => {
  const png = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64')}`
  const result = await runGeneration(input('anthropic', { image: png }), hooks(() => reply.anthropic(JSON.stringify(RI))))
  assert.equal(result.success, true)
  const content = calls[0].body.messages[0].content
  assert.equal(content[1].type, 'image')
  assert.equal(content[1].source.data, png.split(',')[1])
  assert.match(result.transcript, /\[Imagem anexada: image\/png, 1 KB\]/)
})

test('a validação da solicitação aceita esforço ausente como médio e recusa valor desconhecido', () => {
  const base = { ...input('openai'), stream: true }
  delete base.effort
  const ok = parseGenerationRequest(base)
  assert.equal(ok.ok, true)
  assert.equal(ok.request.input.effort, 'medium')
  assert.equal(ok.request.stream, true)
  for (const effort of EFFORTS) assert.equal(parseGenerationRequest({ ...base, effort }).request.input.effort, effort)
  const bad = parseGenerationRequest({ ...base, effort: 'xhigh' })
  assert.deepEqual(bad, { ok: false, failure: { success: false, code: 'invalid_request', error: 'Escolha um nível de esforço válido.', field: 'effort' } })
})

test('salvageRi descarta o componente e a conexão que podem estar incompletos', () => {
  const nodes = { name: 'x', description: '', nodes: [RI.nodes[0], { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como pod' }] }] }
  assert.deepEqual(salvageRi(nodes).nodes.map((node) => node.id), ['boas_vindas'])
  const edges = { ...RI, edges: [...RI.edges.slice(0, 2), { from: 'menu', output: 'Agendar', to: 'agen' }] }
  const salvaged = salvageRi(edges)
  assert.equal(salvaged.nodes.length, RI.nodes.length)
  assert.deepEqual(salvaged.edges, RI.edges.slice(0, 2))
  const ordered = { description: '', edges: RI.edges.slice(0, 2), name: 'x', nodes: [RI.nodes[0], { id: 'me' }] }
  assert.deepEqual(salvageRi(ordered).nodes.map((node) => node.id), ['boas_vindas'])
  assert.deepEqual(salvageRi(ordered).edges, [RI.edges[0]])
  assert.equal(salvageRi({ name: 'x', nodes: [RI.nodes[0]] }), null)
  assert.equal(salvageRi({ name: 'x', nodes: [{ id: 'nota', type: 'note', config: [] }, RI.nodes[0]] }), null)
  assert.equal(salvageRi(undefined), null)
})

test('overlayRi mantém a rodada anterior enquanto a nova chega', () => {
  const base = { ...RI }
  const fresh = { name: '', description: '', nodes: [{ ...RI.nodes[0], config: [{ key: 'template', value: 'Novo texto.' }] }, { id: 'extra', type: 'finalizar', config: [] }], edges: [{ from: 'inicio', output: '', to: 'boas_vindas' }] }
  const merged = overlayRi(base, fresh)
  assert.equal(merged.name, RI.name)
  assert.deepEqual(merged.nodes.map((node) => node.id), [...RI.nodes.map((node) => node.id), 'extra'])
  assert.equal(merged.nodes[0].config[0].value, 'Novo texto.')
  assert.equal(merged.edges.length, RI.edges.length)
  assert.equal(overlayRi(null, fresh), fresh)
})

test('previewFlow monta o fluxo parcial e ignora o componente incompleto', () => {
  const partial = { name: 'Clínica', nodes: [RI.nodes[0], RI.nodes[1], { id: 'agenda', type: 'departa' }], edges: [RI.edges[0], RI.edges[1], { from: 'menu', output: 'Agendar consulta', to: 'agenda' }] }
  const flow = previewFlow(partial)
  assert.ok(flow)
  assert.equal(flow.nodes[0].id, START_ID)
  assert.deepEqual(flow.nodes.map((node) => node.data.type), ['trigger_message', 'envio_pergunta', 'envio_mensagem'])
  assert.equal(flow.edges.length, 2)
  assert.ok(flow.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)))
  assert.ok(flow.viewport && Number.isFinite(flow.viewport.zoom))
  const again = previewFlow(partial)
  assert.deepEqual(again.nodes.map((node) => node.id), flow.nodes.map((node) => node.id))
  assert.deepEqual(again.nodes.map((node) => node.data), flow.nodes.map((node) => node.data))
  const grown = previewFlow({ ...partial, nodes: [...partial.nodes.slice(0, 2), RI.nodes[2]] })
  assert.deepEqual(grown.nodes.slice(0, 3).map((node) => node.id), flow.nodes.map((node) => node.id))
  assert.equal(grown.nodes.length, 4)
  assert.equal(grown.edges.length, 3)
})

test('previewFlow devolve null sem nenhum componente', () => {
  for (const value of [null, undefined, 'texto', 42, [], {}, { name: 'x' }, { nodes: [] }, { nodes: [{ id: 'a', type: 'envio_p' }] }, { nodes: [{ id: '', type: 'finalizar' }] }, { nodes: [{ id: 'n', type: 'note', config: [{ key: 'text', value: 'x' }] }] }, { nodes: [{ id: 'i', type: 'trigger_message' }] }]) {
    assert.equal(previewFlow(value), null, JSON.stringify(value))
  }
})

test('previewFlow é rápido com 150 componentes', () => {
  const nodes = []
  const edges = [{ from: 'inicio', output: '', to: 'c0' }]
  for (let index = 0; index < 150; index++) {
    if (index % 3 === 0) nodes.push({ id: `c${index}`, type: 'envio_mensagem', config: [{ key: 'title', value: `Menu ${index}` }, { key: 'options', value: JSON.stringify([{ text: 'Seguir' }, { text: 'Encerrar' }]) }] })
    else nodes.push({ id: `c${index}`, type: 'envio_pergunta', config: [{ key: 'template', value: `Mensagem ${index} do atendimento.` }] })
    if (index > 0) edges.push({ from: `c${index - 1}`, output: (index - 1) % 3 === 0 ? 'Seguir' : '', to: `c${index}` })
  }
  const ri = { name: 'Grande', description: '', nodes, edges }
  previewFlow(ri)
  const runs = 10
  const started = performance.now()
  let flow = null
  for (let run = 0; run < runs; run++) flow = previewFlow(ri)
  const average = (performance.now() - started) / runs
  assert.equal(flow.nodes.length, 151)
  assert.ok(average < 100, `${average.toFixed(1)} ms por prévia`)
})

const { assembleFlow, finalizeFlow } = require('../lib/atendimento/ai/assemble.ts')
const { flowToRi } = require('../lib/atendimento/ai/edit.ts')
const { previewEdit } = require('../lib/atendimento/ai/preview.ts')

const OPEN_FLOW = finalizeFlow(assembleFlow(RI, { now: new Date('2026-10-13T12:00:00.000Z') })).flow
const nodeOf = (flow, match) => flow.nodes.find(match)
const OPEN_MENU = nodeOf(OPEN_FLOW, (node) => node.data.type === 'envio_mensagem')
const OPEN_WELCOME = nodeOf(OPEN_FLOW, (node) => node.data.data.template === RI.nodes[0].config[0].value)
const OPEN_AGENDA = nodeOf(OPEN_FLOW, (node) => node.data.type === 'departamentos')
const OPEN_BYE = nodeOf(OPEN_FLOW, (node) => node.data.data.template === RI.nodes[3].config[0].value)
const MENU_EDIT = { id: OPEN_MENU.id, type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Financeiro' }, { text: 'Encerrar' }]) }] }
const WELCOME_EDIT = { id: OPEN_WELCOME.id, type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Bem-vindo à Clínica Exemplo.' }] }
const FINANCE_EDIT = {
  name: '',
  description: '',
  nodes: [
    WELCOME_EDIT,
    MENU_EDIT,
    { id: 'aviso_fin', type: 'envio_pergunta', config: [{ key: 'template', value: 'Vou chamar a equipe financeira.' }] },
    { id: 'fin', type: 'departamentos', config: [{ key: 'departamento', value: '30' }, { key: 'name', value: 'Financeiro' }] },
  ],
  edges: [
    { from: OPEN_MENU.id, output: 'Agendar consulta', to: OPEN_AGENDA.id },
    { from: OPEN_MENU.id, output: 'Financeiro', to: 'aviso_fin' },
    { from: OPEN_MENU.id, output: 'Encerrar', to: OPEN_BYE.id },
    { from: 'aviso_fin', output: '', to: 'fin' },
  ],
}

function editInput(provider, extra = {}) {
  return input(provider, { mode: 'edit', base: OPEN_FLOW, prompt: 'Adicione uma opção Financeiro no menu, com aviso e transferência, e mude a saudação.', ...extra })
}

function textOf(message) {
  return typeof message.content === 'string' ? message.content : message.content.map((part) => part.text ?? '').join('')
}

function assertKept(result, cited) {
  const nodes = new Map(result.workflow.nodes.map((node) => [node.id, node]))
  for (const node of OPEN_FLOW.nodes) {
    if (cited.includes(node.id)) continue
    assert.equal(JSON.stringify(nodes.get(node.id)), JSON.stringify(node), node.id)
  }
}

test('no modo edição o pedido leva a RI do fluxo aberto e a resposta traz o fluxo inteiro com as mudanças', async () => {
  const result = await runGeneration(editInput('openai'), hooks(() => reply.openai(JSON.stringify(FINANCE_EDIT))))
  assert.equal(result.success, true)
  assert.equal(result.mode, 'edit')
  assert.equal(result.rounds, 1)
  assert.deepEqual(result.changes, { added: 2, changed: 2, removed: 0 })
  assert.equal(result.workflow.name, OPEN_FLOW.name)
  assert.equal(result.workflow.created_at, OPEN_FLOW.created_at)
  assertKept(result, [OPEN_MENU.id, OPEN_WELCOME.id])
  assert.equal(result.workflow.nodes.find((node) => node.id === OPEN_WELCOME.id).data.data.template, WELCOME_EDIT.config[0].value)
  assert.equal(result.workflow.nodes.length, OPEN_FLOW.nodes.length + 2)
  assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [])
  assertNoKey(result, KEYS.openai)
  const [system, user] = calls[0].body.input
  assert.match(textOf(system), /# Modo de edição/)
  assert.ok(textOf(user).includes(JSON.stringify(flowToRi(OPEN_FLOW))))
  assert.match(textOf(user), /Adicione uma opção Financeiro/)
  assert.match(result.transcript, /# Fluxo atual/)
})

test('a correção do modo edição aplica sobre o estado já editado', async () => {
  const first = { ...FINANCE_EDIT, nodes: FINANCE_EDIT.nodes.slice(0, 3), edges: FINANCE_EDIT.edges.slice(0, 3) }
  const second = { name: '', description: '', nodes: [FINANCE_EDIT.nodes[3]], edges: [{ from: 'aviso_fin', output: '', to: 'fin' }] }
  const result = await runGeneration(editInput('openai'), hooks((call, index) => reply.openai(JSON.stringify(index === 0 ? first : second))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 2)
  assert.equal(calls.length, 2)
  assert.deepEqual(result.changes, { added: 2, changed: 2, removed: 0 })
  assert.equal(result.workflow.nodes.find((node) => node.id === OPEN_WELCOME.id).data.data.template, WELCOME_EDIT.config[0].value)
  const notice = result.workflow.nodes.find((node) => node.data.data.template === 'Vou chamar a equipe financeira.')
  const link = result.workflow.edges.find((edge) => edge.source === notice.id)
  assert.equal(result.workflow.nodes.find((node) => node.id === link.target).data.data.name, 'Financeiro')
  assert.equal(result.workflow.nodes.filter((node) => node.data.type === 'finalizar').length, OPEN_FLOW.nodes.filter((node) => node.data.type === 'finalizar').length)
  const messages = calls[1].body.input
  assert.deepEqual(messages.map((message) => message.role), ['developer', 'user', 'assistant', 'user'])
  assert.deepEqual(JSON.parse(textOf(messages[2])), { ...first, remove: [] })
  const correction = textOf(messages[3])
  assert.match(correction, /\[aviso_fin\]/)
  assert.match(correction, /Mudanças já aplicadas/)
  assert.match(correction, /"id":"aviso_fin"/)
  assert.match(result.transcript, /Correção 1/)
  assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [])
  assertKept(result, [OPEN_MENU.id, OPEN_WELCOME.id])
})

test('uma queda no meio do modo edição preserva o que já foi aplicado e não duplica componentes', async () => {
  let resumed = false
  const result = await runGeneration(editInput('openai'), hooks((call, index) => index === 0 ? dropped('openai', JSON.stringify(FINANCE_EDIT), 0.7) : reply.openai(JSON.stringify(FINANCE_EDIT)), {
    onProgress: (value) => {
      if (value.resumed) resumed = true
    },
  }))
  assert.equal(result.success, true)
  assert.equal(result.partial, undefined)
  assert.equal(result.rounds, 2)
  assert.equal(resumed, true)
  const salvaged = JSON.parse(textOf(calls[1].body.input[2]))
  assert.ok(salvaged.nodes.length >= 1 && salvaged.nodes.length < FINANCE_EDIT.nodes.length)
  assert.match(textOf(calls[1].body.input[3]), /interrompida/)
  assert.match(textOf(calls[1].body.input[3]), /Mudanças já aplicadas/)
  assert.equal(result.workflow.nodes.length, OPEN_FLOW.nodes.length + 2)
  assert.deepEqual(result.changes, { added: 2, changed: 2, removed: 0 })
  assertKept(result, [OPEN_MENU.id, OPEN_WELCOME.id])

  calls.length = 0
  const cut = await runGeneration(editInput('anthropic'), hooks(() => dropped('anthropic', JSON.stringify(FINANCE_EDIT), 0.7)))
  assert.equal(cut.success, true)
  assert.equal(cut.partial, true)
  assert.equal(cut.mode, 'edit')
  assert.equal(calls.length, 3)
  assert.ok(cut.issues.some((issue) => issue.message === INTERRUPTED_NOTICE))
  assert.equal(cut.workflow.nodes.find((node) => node.id === OPEN_WELCOME.id).data.data.template, WELCOME_EDIT.config[0].value)
  assert.ok(cut.changes.changed >= 1)
  assert.deepEqual(validateFlow(cut.workflow).filter((issue) => issue.severity === 'error'), [])
  assertNoKey(cut, KEYS.anthropic)
})

test('onPartial do modo edição entrega mudanças que previewEdit desenha sobre o fluxo aberto', async () => {
  const partials = []
  const result = await runGeneration(editInput('google'), hooks(() => reply.google(JSON.stringify(FINANCE_EDIT)), { onPartial: (ri) => partials.push(ri) }))
  assert.equal(result.success, true)
  assert.ok(partials.length > 2, String(partials.length))
  for (const ri of partials) {
    const flow = previewEdit(OPEN_FLOW, ri)
    if (flow) assert.ok(flow.nodes.length >= OPEN_FLOW.nodes.length)
  }
  const last = previewEdit(OPEN_FLOW, partials.at(-1))
  assert.equal(last.nodes.length, result.workflow.nodes.length)
  assert.deepEqual(last.nodes.map((node) => node.data.type).sort(), result.workflow.nodes.map((node) => node.data.type).sort())
})

test('resposta sem nenhuma mudança no modo edição pede correção e termina com mensagem clara', async () => {
  const result = await runGeneration(editInput('openai'), hooks(() => reply.openai(JSON.stringify({ name: '', description: '', nodes: [], edges: [] }))))
  assert.deepEqual(result, { success: false, code: 'invalid_output', error: 'O modelo não fez nenhuma mudança no fluxo para este pedido.', details: 'Descreva o que mudar no fluxo e gere novamente.', field: 'prompt' })
  assert.equal(calls.length, 3)
  assert.match(textOf(calls[1].body.input[3]), /nenhuma mudança/)
})

test('a validação da solicitação aceita mode e base e aponta o campo de cada erro', () => {
  const base = input('openai')
  const created = parseGenerationRequest(base)
  assert.equal(created.request.input.mode, 'create')
  assert.equal(created.request.input.base, undefined)
  const edited = parseGenerationRequest({ ...base, mode: 'edit', base: OPEN_FLOW })
  assert.equal(edited.ok, true)
  assert.equal(edited.request.input.mode, 'edit')
  assert.notEqual(edited.request.input.base, OPEN_FLOW)
  assert.deepEqual(edited.request.input.base, OPEN_FLOW)
  assert.equal(parseGenerationRequest({ ...base, mode: 'edit', base: JSON.stringify(OPEN_FLOW) }).ok, true)
  assert.deepEqual(parseGenerationRequest({ ...base, mode: 'remix' }), { ok: false, failure: { success: false, code: 'invalid_request', error: 'Escolha criar um fluxo novo ou editar o fluxo aberto.', field: 'mode' } })
  assert.deepEqual(parseGenerationRequest({ ...base, mode: 'edit' }), { ok: false, failure: { success: false, code: 'invalid_request', error: 'Abra um fluxo para editar.', field: 'base' } })
  const headless = { ...OPEN_FLOW, nodes: OPEN_FLOW.nodes.filter((node) => node.id !== START_ID), edges: OPEN_FLOW.edges.filter((edge) => edge.source !== START_ID) }
  for (const value of [{}, { nodes: 'x' }, '{"name":', [], 42, headless]) {
    const failed = parseGenerationRequest({ ...base, mode: 'edit', base: value })
    assert.equal(failed.ok, false, JSON.stringify(value).slice(0, 60))
    assert.equal(failed.failure.field, 'base')
    assert.equal(failed.failure.error, 'Não foi possível ler o fluxo aberto. Confira o fluxo e tente de novo.')
  }
})

const CONFIRM_DEPARTMENT = 'Confira: ID do departamento provisório, troque pelo valor cadastrado na plataforma.'
const NAMELESS = { ...RI, nodes: RI.nodes.map((node) => (node.id === 'agenda' ? { ...node, config: [] } : node)) }
const PLAIN_RULE = 'use só o que o pedido informar. Sem a informação, omita a chave'
const FILL_RULE = '6. Preencha todos os campos de todos os componentes.'
const departmentOf = (result) => result.workflow.nodes.find((node) => node.data.type === 'departamentos').data.data

test('com preenchimento, o padrão, o nome em branco gera rodada de correção e o ID recebe valor provisório com aviso', async () => {
  const result = await runGeneration(input('openai'), hooks((call, index) => reply.openai(JSON.stringify(index === 0 ? NAMELESS : RI))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 2)
  assert.equal(calls.length, 2)
  const [system, , , correction] = calls[1].body.input
  assert.ok(textOf(system).includes(FILL_RULE))
  assert.ok(!textOf(system).includes(PLAIN_RULE))
  assert.match(textOf(correction), /Informe o nome do departamento\./)
  assert.match(textOf(correction), /Nome pendente recebe o nome que o pedido traz/)
  const data = departmentOf(result)
  assert.deepEqual([data.name, data.departamento], ['Agendamento', 'agendamento'])
  assert.ok(result.issues.some((issue) => issue.scope === 'plataforma' && issue.message === CONFIRM_DEPARTMENT))
  assert.ok(result.issues.some((issue) => issue.scope === 'ajuste' && issue.message === 'Preenchido com valor provisório: ID do departamento “agendamento”. Revise.'))
  assert.deepEqual(validateFlow(result.workflow), [])
})

test('sem preenchimento nome e ID ficam em branco como dados da plataforma, sem rodada de correção nem aviso provisório', async () => {
  const result = await runGeneration(input('openai', { fill: false }), hooks(() => reply.openai(JSON.stringify(NAMELESS))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 1)
  assert.equal(calls.length, 1)
  const system = textOf(calls[0].body.input[0])
  assert.ok(system.includes(PLAIN_RULE))
  assert.ok(!system.includes(FILL_RULE))
  const data = departmentOf(result)
  assert.deepEqual(['name', 'departamento', 'id'].map((key) => data[key] ?? ''), ['', '', ''])
  assert.deepEqual(result.issues.filter((issue) => issue.type === 'departamentos').map((issue) => `${issue.scope}: ${issue.message}`), ['plataforma: Informe o ID do departamento.', 'plataforma: Informe o nome do departamento.'])
  assert.equal(result.issues.some((issue) => issue.message.startsWith('Confira:') || issue.message.startsWith('Preenchido com valor provisório')), false)
  assertNoKey(result, KEYS.openai)
})

const PAYMENT_PROMPT = 'Adicione no menu uma opção para pagamentos, com aviso e transferência para a equipe.'
const paymentEdit = (department) => ({
  name: '',
  description: '',
  nodes: [MENU_EDIT, { id: 'aviso_fin', type: 'envio_pergunta', config: [{ key: 'template', value: 'Vou chamar a equipe financeira.' }] }, { id: 'fin', type: 'departamentos', config: department }],
  edges: FINANCE_EDIT.edges,
})

test('no modo edição com preenchimento o ID que já existe no fluxo aberto não vira provisório e o novo recebe aviso', async () => {
  assert.equal(OPEN_AGENDA.data.data.departamento, 'agendamento')
  const rename = { id: OPEN_AGENDA.id, type: 'departamentos', config: [{ key: 'departamento', value: 'agendamento' }, { key: 'name', value: 'Agenda' }] }
  const delta = paymentEdit([{ key: 'departamento', value: 'fin-77' }, { key: 'name', value: 'Financeiro' }])
  delta.nodes.push(rename)
  const result = await runGeneration(editInput('openai', { prompt: PAYMENT_PROMPT }), hooks(() => reply.openai(JSON.stringify(delta))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 1)
  assert.ok(textOf(calls[0].body.input[0]).includes(FILL_RULE))
  const added = result.workflow.nodes.find((node) => node.data.type === 'departamentos' && node.data.data.departamento === 'fin-77')
  assert.equal(result.workflow.nodes.find((node) => node.id === OPEN_AGENDA.id).data.data.name, 'Agenda')
  assert.deepEqual(result.issues.filter((issue) => issue.message.startsWith('Confira:')).map((issue) => [issue.nodeId, issue.message]), [[added.id, CONFIRM_DEPARTMENT]])
})

test('no modo edição com preenchimento o departamento novo sem nome passa por correção e sai completo', async () => {
  const first = paymentEdit([])
  const second = { name: '', description: '', nodes: [{ id: 'fin', type: 'departamentos', config: [{ key: 'name', value: 'Financeiro' }] }], edges: [] }
  const result = await runGeneration(editInput('openai', { prompt: PAYMENT_PROMPT }), hooks((call, index) => reply.openai(JSON.stringify(index === 0 ? first : second))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 2)
  const correction = textOf(calls[1].body.input[3])
  assert.match(correction, /Informe o nome do departamento\./)
  assert.match(correction, /Nome pendente recebe o nome que o pedido traz/)
  const added = result.workflow.nodes.find((node) => node.data.type === 'departamentos' && node.id !== OPEN_AGENDA.id)
  assert.deepEqual([added.data.data.name, added.data.data.departamento], ['Financeiro', 'financeiro'])
  assert.ok(result.issues.some((issue) => issue.nodeId === added.id && issue.message === CONFIRM_DEPARTMENT))
  assertKept(result, [OPEN_MENU.id, OPEN_WELCOME.id])
})

test('no modo edição sem preenchimento o departamento novo fica em branco, sem correção e sem aviso provisório', async () => {
  const result = await runGeneration(editInput('openai', { prompt: PAYMENT_PROMPT, fill: false }), hooks(() => reply.openai(JSON.stringify(paymentEdit([])))))
  assert.equal(result.success, true)
  assert.equal(result.rounds, 1)
  assert.equal(calls.length, 1)
  const system = textOf(calls[0].body.input[0])
  assert.ok(system.includes(PLAIN_RULE))
  assert.match(system, /# Modo de edição/)
  const added = result.workflow.nodes.find((node) => node.data.type === 'departamentos' && node.id !== OPEN_AGENDA.id)
  assert.deepEqual(['name', 'departamento', 'id'].map((key) => added.data.data[key] ?? ''), ['', '', ''])
  assert.deepEqual(result.issues.filter((issue) => issue.nodeId === added.id).map((issue) => `${issue.scope}: ${issue.message}`).sort(), ['plataforma: Informe o ID do departamento.', 'plataforma: Informe o nome do departamento.'])
  assert.equal(result.issues.some((issue) => issue.message.startsWith('Confira:') || issue.message.startsWith('Preenchido com valor provisório')), false)
  assertKept(result, [OPEN_MENU.id, OPEN_WELCOME.id])
})

test('a validação da solicitação aceita fill e aponta o campo fill quando o valor não é sim ou não', () => {
  const base = input('openai')
  assert.equal(parseGenerationRequest(base).request.input.fill, true)
  assert.equal(parseGenerationRequest({ ...base, fill: null }).request.input.fill, true)
  assert.equal(parseGenerationRequest({ ...base, fill: true }).request.input.fill, true)
  assert.equal(parseGenerationRequest({ ...base, fill: false }).request.input.fill, false)
  assert.equal(parseGenerationRequest({ ...base, mode: 'edit', base: OPEN_FLOW, fill: false }).request.input.fill, false)
  for (const value of ['false', 'sim', 0, 1, {}, []]) {
    assert.deepEqual(parseGenerationRequest({ ...base, fill: value }), { ok: false, failure: { success: false, code: 'invalid_request', error: 'Escolha se a IA preenche os nomes, IDs e URLs que o pedido não traz.', field: 'fill' } }, JSON.stringify(value))
  }
})

const { completeDelta, completePart } = require('../lib/atendimento/ai/runner.ts')
const { newNode } = require('../lib/atendimento/format.ts')

const OPEN_END = nodeOf(OPEN_FLOW, (node) => node.data.type === 'finalizar')
const REMOVE_PROMPT = 'Remova a despedida e encerre direto na opção Encerrar.'
const REMOVE_BYE = { name: '', description: '', nodes: [], edges: [{ from: OPEN_MENU.id, output: 'Encerrar', to: OPEN_END.id }], remove: [OPEN_BYE.id] }
const NEW_END = { name: '', description: '', nodes: [{ id: 'tchau', type: 'finalizar', config: [] }], edges: [{ from: OPEN_MENU.id, output: 'Encerrar', to: 'tchau' }], remove: [OPEN_BYE.id, OPEN_END.id] }
const SCHEMA_OF = {
  openai: (body) => ({ name: body.text.format.name, strict: body.text.format.strict, schema: body.text.format.schema }),
  anthropic: (body) => ({ schema: body.output_config.format.schema }),
  google: (body) => ({ schema: body.generationConfig.responseSchema }),
  xai: (body) => ({ name: body.text.format.name, strict: body.text.format.strict, schema: body.text.format.schema }),
}

function interrupted(text) {
  const events = [
    { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: MODELS.openai } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
    ...pieces(text).map((delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', delta })),
  ]
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')))
      setTimeout(() => controller.error(new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })), 5)
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

test('no modo edição cada provedor recebe o esquema com remove e devolve o fluxo sem o componente removido, e o modo criar segue sem remove', async () => {
  for (const provider of ['openai', 'anthropic', 'google', 'xai']) {
    calls.length = 0
    const result = await runGeneration(editInput(provider, { prompt: REMOVE_PROMPT }), hooks(() => reply[provider](JSON.stringify(REMOVE_BYE))))
    assert.equal(result.success, true, provider)
    assert.deepEqual([result.rounds, calls.length], [1, 1], provider)
    assert.deepEqual(result.changes, { added: 0, changed: 1, removed: 1 }, provider)
    assert.equal(result.workflow.nodes.some((node) => node.id === OPEN_BYE.id), false, provider)
    assert.equal(result.workflow.edges.find((edge) => edge.source === OPEN_MENU.id && edge.sourceHandle === 'output-1').target, OPEN_END.id, provider)
    assertKept(result, [OPEN_MENU.id, OPEN_BYE.id])
    assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [], provider)
    assertNoKey(result, KEYS[provider])
    const edit = SCHEMA_OF[provider](calls[0].body)
    assert.deepEqual(Object.keys(edit.schema.properties), ['name', 'description', 'nodes', 'edges', 'remove'], provider)
    assert.ok(edit.schema.required.includes('remove'), provider)
    assert.deepEqual([edit.schema.properties.remove.type, edit.schema.properties.remove.items.type], ['array', 'string'], provider)
    if (provider === 'openai' || provider === 'xai') assert.deepEqual([edit.name, edit.strict, edit.schema.additionalProperties], ['edicao_ri', true, false], provider)
    if (provider === 'google') assert.equal(JSON.stringify(edit.schema).includes('additionalProperties'), false)
    calls.length = 0
    const created = await runGeneration(input(provider), hooks(() => reply[provider](JSON.stringify(RI))))
    assert.equal(created.success, true, provider)
    const plain = SCHEMA_OF[provider](calls[0].body)
    assert.deepEqual(Object.keys(plain.schema.properties), ['name', 'description', 'nodes', 'edges'], provider)
    assert.ok(!plain.schema.required.includes('remove'), provider)
    if (provider === 'openai' || provider === 'xai') assert.equal(plain.name, 'fluxo_ri', provider)
  }
})

test('limpar o fluxo mantendo o Início e as notas termina em uma rodada, sem a falha de nenhuma mudança', async () => {
  const note = newNode('note', { x: 40, y: 600 }, '99')
  note.data.data.text = 'Revisar o atendimento com a equipe.'
  const noted = { ...OPEN_FLOW, nodes: [...OPEN_FLOW.nodes, note] }
  const components = OPEN_FLOW.nodes.filter((node) => node.id !== START_ID).map((node) => node.id)
  const clear = { name: '', description: '', nodes: [], edges: [], remove: components }
  const result = await runGeneration(editInput('openai', { base: noted, prompt: 'Remova todos os componentes do fluxo, mantendo o Início e as notas.' }), hooks(() => reply.openai(JSON.stringify(clear))))
  assert.equal(result.success, true, JSON.stringify(result))
  assert.deepEqual([result.rounds, calls.length], [1, 1])
  assert.deepEqual(result.changes, { added: 0, changed: 0, removed: components.length })
  assert.deepEqual(result.workflow.nodes.map((node) => node.id), [START_ID, note.id])
  assert.deepEqual(result.workflow.edges, [])
  assert.equal(result.issues.some((issue) => issue.scope === 'ia'), false)
  assert.match(textOf(calls[0].body.input[0]), /Para limpar o fluxo, liste em remove todos os componentes/)
  calls.length = 0
  const empty = await runGeneration(editInput('openai', { base: noted, prompt: 'Limpe o fluxo.' }), hooks(() => reply.openai(JSON.stringify({ ...clear, remove: [] }))))
  assert.deepEqual([empty.code, empty.error, calls.length], ['invalid_output', 'O modelo não fez nenhuma mudança no fluxo para este pedido.', 3])
  assert.match(textOf(calls[1].body.input[3]), /os ids dos componentes que saem do fluxo em remove/)
})

test('onPartial do modo edição leva remove, e previewEdit tira do canvas o que sai enquanto a resposta chega', async () => {
  const partials = []
  const result = await runGeneration(editInput('google', { prompt: REMOVE_PROMPT }), hooks(() => reply.google(JSON.stringify(NEW_END)), { onPartial: (ri) => partials.push(ri) }))
  assert.equal(result.success, true)
  assert.deepEqual(result.changes, { added: 1, changed: 1, removed: 2 })
  assert.ok(partials.length > 1)
  assert.ok(partials.every((ri) => Array.isArray(ri.remove)))
  const streaming = partials.find((ri) => ri.remove.length === 1)
  assert.deepEqual(streaming.remove, [OPEN_BYE.id])
  const preview = previewEdit(OPEN_FLOW, streaming)
  assert.equal(preview.nodes.some((node) => node.id === OPEN_BYE.id), false)
  assert.ok(preview.nodes.some((node) => node.id === OPEN_END.id))
  assert.deepEqual(partials.at(-1).remove, [OPEN_BYE.id, OPEN_END.id])
  const last = previewEdit(OPEN_FLOW, partials.at(-1))
  assert.deepEqual(last.nodes.map((node) => node.id).sort(), result.workflow.nodes.map((node) => node.id).sort())
})

test('uma queda no meio da lista remove aproveita os ids completos e a retomada termina a remoção sem duplicar componentes', async () => {
  const text = JSON.stringify(NEW_END)
  const head = text.slice(0, text.lastIndexOf(OPEN_END.id) + OPEN_END.id.length)
  const result = await runGeneration(editInput('openai', { prompt: REMOVE_PROMPT }), hooks((call, index) => (index === 0 ? interrupted(head) : reply.openai(text))))
  assert.equal(result.success, true, JSON.stringify(result))
  assert.deepEqual([result.rounds, calls.length, result.partial], [2, 2, undefined])
  const salvaged = JSON.parse(textOf(calls[1].body.input[2]))
  assert.deepEqual(salvaged, { ...NEW_END, remove: [OPEN_BYE.id] })
  const resume = textOf(calls[1].body.input[3])
  assert.match(resume, /interrompida/)
  assert.ok(resume.includes(`Componentes removidos pela lista remove: ${OPEN_BYE.id}.`))
  assert.ok(resume.includes(`Componentes removidos por deixarem de ser alcançados a partir do início: ${OPEN_END.id}.`))
  assert.match(result.transcript, /Retomada 1/)
  assert.deepEqual(result.changes, { added: 1, changed: 1, removed: 2 })
  assert.equal(result.workflow.nodes.filter((node) => node.data.type === 'finalizar').length, 1)
  assert.equal(result.workflow.nodes.some((node) => node.id === OPEN_BYE.id || node.id === OPEN_END.id), false)
  assert.deepEqual(validateFlow(result.workflow).filter((issue) => issue.severity === 'error'), [])
})

test('completeDelta deixa de fora o último item da lista aberta e mantém as conexões para componentes do fluxo aberto', () => {
  const edges = [{ from: OPEN_MENU.id, output: 'Encerrar', to: OPEN_END.id }, { from: 'inicio', output: '', to: OPEN_MENU.id }]
  assert.deepEqual(completeDelta({ name: '', description: '', nodes: [], edges, remove: [OPEN_BYE.id, OPEN_WELCOME.id] }), { name: '', description: '', nodes: [], edges, remove: [OPEN_BYE.id] })
  assert.deepEqual(completeDelta({ nodes: [], edges, remove: [] }).edges, edges)
  assert.deepEqual(completeDelta({ nodes: [], edges }).edges, edges.slice(0, 1))
  assert.deepEqual(completeDelta({ remove: [OPEN_BYE.id], edges }).remove, [OPEN_BYE.id])
  assert.deepEqual(completeDelta({ nodes: [{ id: 'novo', type: 'finalizar', config: [] }, { id: 'meio', type: 'envio_p' }] }), { name: '', description: '', nodes: [{ id: 'novo', type: 'finalizar', config: [] }], edges: [], remove: [] })
  assert.deepEqual(completeDelta({ nodes: [], edges: [{ from: '', output: '', to: OPEN_END.id }, { from: OPEN_MENU.id, output: '', to: ' ' }], remove: [] }).edges, [])
  for (const value of [null, undefined, [], 'texto']) assert.equal(completeDelta(value), null, String(value))
  assert.deepEqual(completePart({ nodes: [], edges, remove: [] }).edges, [])
  assert.equal('remove' in completePart({ nodes: [], edges: [], remove: [OPEN_BYE.id] }), false)
})
