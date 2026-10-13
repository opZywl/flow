require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const http = require('node:http')
const https = require('node:https')
const { createEdge, newFlow, newNode } = require('../../lib/atendimento/format.ts')
const { START_TYPE } = require('../../lib/atendimento/catalog.ts')
const { previewFlow } = require('../../lib/atendimento/ai/preview.ts')

const KEYS = {
  openai: 'sk-test-0123456789abcdefghijklmnop',
  anthropic: 'sk-ant-test-0123456789abcdefghijkl',
  google: 'AIzaTest0123456789abcdefghijklmnop',
  xai: 'xai-test-0123456789abcdefghijklmn',
}
const HOSTS = { 'api.openai.com': 'openai', 'api.anthropic.com': 'anthropic', 'generativelanguage.googleapis.com': 'google', 'api.x.ai': 'xai' }
const ENDPOINTS = {
  openai: 'https://api.openai.com/v1/responses',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse',
  xai: 'https://api.x.ai/v1/responses',
}
const PROMPT = 'Atendimento de clínica com menu para agendar consulta e encerrar.'
const BANNER = 'Gerando com IA. O fluxo aparece aqui conforme é criado.'
const DONE_BANNER = 'Fluxo gerado. Importe ou descarte na janela da IA.'
const NOTICE = 'A geração foi interrompida antes do fim e o fluxo pode estar incompleto.'
const EFFORTS = ['Rápido', 'Equilibrado', 'Alto', 'Máximo']
const HINTS = {
  medium: 'Equilíbrio entre velocidade e qualidade. Atende bem a maioria dos fluxos.',
  max: 'Todo o raciocínio que o modelo oferece. É o mais lento e o que mais gasta tokens.',
}
const DROP = { drop: true }

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
const TEXT = JSON.stringify(RI)
const nodeEnd = (count) => TEXT.indexOf(JSON.stringify(RI.nodes[count - 1])) + JSON.stringify(RI.nodes[count - 1]).length
const FIRST = nodeEnd(1)
const THIRD = nodeEnd(3)
const CUT = TEXT.indexOf('"type"', THIRD) + 4
const EARLY = previewFlow({ ...RI, nodes: RI.nodes.slice(0, 1), edges: [] })
const CHECKPOINT = previewFlow({ ...RI, nodes: RI.nodes.slice(0, 3), edges: [] })

const PREVIOUS = (() => {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = 'Fluxo anterior'
  flow.nodes[0].position = { x: 30, y: 60 }
  const message = newNode('envio_pergunta', { x: 350, y: 60 }, '2')
  message.data.data.template = 'Mensagem do fluxo anterior'
  flow.nodes.push(message, newNode('finalizar', { x: 680, y: 60 }, '3'))
  flow.edges = [createEdge([], 'inicio', 'output-0', '2'), createEdge([], '2', 'output-0', '3')]
  return flow
})()
const PREVIOUS_STATE = { name: 'Fluxo anterior', nodes: ['inicio', '2', '3'] }

const FORMATS = {
  openai: {
    head: () => [
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: 'gpt-6.1-sol' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
    ],
    delta: (delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', delta }),
    tail: () => [
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      { type: 'response.completed', response: { incomplete_details: null, usage: { input_tokens: 11, output_tokens: 22 } } },
    ],
  },
  anthropic: {
    head: () => [
      { type: 'message_start', message: { id: 'msg_1', model: 'claude-opus-5-5', usage: { input_tokens: 11 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ],
    delta: (text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
    tail: () => [
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 22 } },
      { type: 'message_stop' },
    ],
  },
  google: {
    head: () => [],
    delta: (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] }),
    tail: () => [{ candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 } }],
  },
  xai: {
    head: () => [
      { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: 'grok-4.7', object: 'response', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] } },
    ],
    delta: (delta) => ({ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta }),
    tail: (text) => [
      { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] } },
      { type: 'response.completed', response: { id: 'resp_1', created_at: 1760000000, model: 'grok-4.7', object: 'response', status: 'completed', incomplete_details: null, output: [], usage: { input_tokens: 11, output_tokens: 22, total_tokens: 33 } } },
    ],
  },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`
const line = (payload) => `${JSON.stringify(payload)}\n`
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
const components = (flow) => flow.nodes.filter((node) => node.data.type !== START_TYPE).length
const resultTitle = (issues) => (issues ? `Fluxo gerado com ${plural(issues, 'pendência', 'pendências')}` : 'Fluxo gerado sem pendências')
const progress = (stage, extra = {}) => line({ type: 'progress', progress: { stage, round: 1, maxRounds: 3, ...extra } })

function pieces(text, size = 48) {
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts
}

function script(provider, steps) {
  const format = FORMATS[provider]
  const body = format.head().map(event)
  for (const step of steps) {
    if (typeof step === 'string') body.push(...pieces(step).map((piece) => event(format.delta(piece))))
    else body.push(step)
  }
  if (steps.includes(DROP)) return body
  return [...body, ...format.tail(steps.filter((step) => typeof step === 'string').join('')).map(event)]
}

let engine
function engineResult() {
  engine ??= (async () => {
    const { runGeneration } = require('../../lib/atendimento/ai/runner.ts')
    const body = script('openai', [TEXT]).join('')
    const result = await runGeneration(
      { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEYS.openai, prompt: PROMPT, size: 'auto', effort: 'high' },
      { transport: 'server', signal: new AbortController().signal, fetch: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) },
    )
    if (!result.success) throw new Error(`O motor não gerou o fluxo de referência: ${result.error}`)
    return result
  })()
  return engine
}

function certificate() {
  const length = (size) => {
    if (size < 128) return Buffer.from([size])
    const bytes = []
    for (let rest = size; rest; rest >>= 8) bytes.unshift(rest & 255)
    return Buffer.from([0x80 | bytes.length, ...bytes])
  }
  const der = (tag, ...parts) => {
    const body = Buffer.concat(parts)
    return Buffer.concat([Buffer.from([tag]), length(body.length), body])
  }
  const oid = (text) => {
    const [first, second, ...rest] = text.split('.').map(Number)
    const bytes = [first * 40 + second]
    for (const value of rest) {
      const chunk = [value & 127]
      for (let next = value >> 7; next; next >>= 7) chunk.unshift((next & 127) | 128)
      bytes.push(...chunk)
    }
    return der(0x06, Buffer.from(bytes))
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const algorithm = der(0x30, oid('1.2.840.10045.4.3.2'))
  const name = der(0x30, der(0x31, der(0x30, oid('2.5.4.3'), der(0x0c, Buffer.from('localhost')))))
  const validity = der(0x30, der(0x17, Buffer.from('200101000000Z')), der(0x17, Buffer.from('491231235959Z')))
  const tbs = der(0x30, der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.from([1])), algorithm, name, validity, name, publicKey.export({ type: 'spki', format: 'der' }))
  const signed = der(0x30, tbs, algorithm, der(0x03, Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)))
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: `-----BEGIN CERTIFICATE-----\n${signed.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`,
  }
}

async function play(response, session) {
  for (const step of session.steps) {
    if (response.destroyed) return
    if (typeof step === 'string') {
      response.write(step)
      await sleep(session.delay)
    } else if (step.drop) {
      response.socket.destroy()
      return
    } else if (step.pause) {
      await sleep(step.pause)
    } else {
      step.arrive()
      await step.opened
    }
  }
  if (!response.destroyed) response.end()
}

const test = base.extend({
  servers: [async ({}, use) => {
    const sessions = new Map()
    const serve = (request, response) => {
      request.resume()
      const session = sessions.get(request.url.slice(1))
      if (!session) {
        response.writeHead(404).end()
        return
      }
      response.on('error', () => undefined)
      response.on('close', () => {
        session.closed = !response.writableFinished
      })
      request.socket.setNoDelay(true)
      response.writeHead(200, { 'content-type': session.type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
      response.flushHeaders()
      void play(response, session)
    }
    const secure = https.createServer(certificate(), serve)
    const plain = http.createServer(serve)
    for (const server of [secure, plain]) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    await use({ sessions, secure: `https://127.0.0.1:${secure.address().port}`, plain: `http://127.0.0.1:${plain.address().port}` })
    for (const server of [secure, plain]) {
      server.closeAllConnections()
      server.close()
    }
  }, { scope: 'worker' }],
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(page)
    expect(errors, 'erros não tratados na página').toEqual([])
  },
  ai: async ({ page, servers }, use) => {
    const gates = []
    const ids = []
    const open = (steps, type) => {
      const id = crypto.randomUUID()
      const session = { steps, type, delay: 25, closed: false }
      servers.sessions.set(id, session)
      ids.push(id)
      return { id, session }
    }
    const ai = {
      calls: [],
      fallbacks: [],
      replies: [],
      rescues: [],
      hold() {
        const gate = {}
        gate.reached = new Promise((resolve) => {
          gate.arrive = resolve
        })
        gate.opened = new Promise((resolve) => {
          gate.open = resolve
        })
        gates.push(gate)
        return gate
      },
    }
    await page.route((url) => Object.hasOwn(HOSTS, url.hostname), async (route) => {
      const request = route.request()
      const provider = HOSTS[new URL(request.url()).hostname]
      const call = { provider, url: request.url(), headers: await request.allHeaders(), body: request.postDataJSON() }
      ai.calls.push(call)
      const reply = ai.replies.shift() ?? { steps: [TEXT] }
      if (reply.blocked) return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': 'https://platform.openai.com' }, body: '' })
      if (reply.status) return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
      const { id, session } = open(script(provider, reply.steps), 'text/event-stream; charset=utf-8')
      call.session = session
      return route.continue({ url: `${servers.secure}/${id}` })
    })
    await page.route('**/api/generate-workflow', async (route) => {
      ai.fallbacks.push(route.request().postDataJSON())
      const rescue = ai.rescues.shift()
      if (!rescue) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'unknown', error: 'A rota de reserva não fazia parte deste teste.' }) })
      const { id } = open(rescue, 'application/x-ndjson; charset=utf-8')
      return route.continue({ url: `${servers.plain}/${id}` })
    })
    await use(ai)
    for (const gate of gates) gate.open()
    for (const id of ids) servers.sessions.delete(id)
  },
})

test.use({ ignoreHTTPSErrors: true })

async function openEditor(page) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'anterior.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PREVIOUS)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(PREVIOUS.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(PREVIOUS.nodes.length)
}

async function openDialog(page) {
  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  return dialog
}

async function fillRequest(dialog, { label = 'Chave da API da OpenAI', key = KEYS.openai, watch = true } = {}) {
  await dialog.getByLabel(label).fill(key)
  await dialog.getByLabel('Descrição do atendimento').fill(PROMPT)
  const box = dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })
  if (watch) await box.check()
  else await box.uncheck()
}

async function chooseProvider(dialog, name) {
  const radio = dialog.page().getByRole('radio', { name, exact: true })
  await dialog.locator('label', { has: radio }).click()
  await expect(radio).toBeChecked()
}

const saved = (page) => page.evaluate(() => {
  const flow = JSON.parse(localStorage.getItem('workflow'))
  return { name: flow.name, nodes: flow.nodes.map((node) => node.id) }
})

const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library') || '[]').map((entry) => ({ name: entry.flow.name, nodes: entry.flow.nodes.map((node) => node.id) })))

const summaryOf = (dialog) => dialog.getByRole('list', { name: 'Resumo do fluxo gerado' }).getByRole('listitem')

test('watching on the canvas: the collapsed panel follows the stream, the read-only preview grows before the end and the result reopens to import', async ({ page, ai }) => {
  const final = (await engineResult()).workflow
  const issues = (await engineResult()).issues.length
  const early = ai.hold()
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, FIRST), early, TEXT.slice(FIRST, THIRD), hold, TEXT.slice(THIRD)] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await expect(dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Ver detalhes' })).toBeFocused()
  await early.reached
  await expect(nodes).toHaveCount(EARLY.nodes.length)
  await expect(canvas).toContainText('Olá, #NAME. Você está no atendimento da Clínica Exemplo.')
  await expect(canvas).not.toContainText('Como podemos ajudar?')
  await expect(page.getByText(BANNER)).toBeVisible()
  early.open()
  await hold.reached
  await expect(nodes).toHaveCount(CHECKPOINT.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(CHECKPOINT.edges.length)
  await expect(canvas).toContainText('Olá, #NAME. Você está no atendimento da Clínica Exemplo.')
  await expect(canvas).toContainText('Como podemos ajudar?')
  await expect(canvas).not.toContainText('Obrigado pelo contato. Até logo.')
  await expect(canvas).not.toContainText('Mensagem do fluxo anterior')
  const counted = `${plural(components(CHECKPOINT), 'componente', 'componentes')} e ${plural(CHECKPOINT.edges.length, 'conexão', 'conexões')}`
  await expect(page.locator('[data-canvas-overlay]').filter({ hasText: BANNER })).toContainText(plural(components(CHECKPOINT), 'componente', 'componentes'))
  await expect(panel).toContainText(`Gerando o fluxo, rodada 1 de 3: ${counted}.`)
  for (const name of ['Salvar', 'Exportar JSON', 'Importar JSON', 'Prévia', 'Novo fluxo', 'Limpar fluxo']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  await expect(page.getByLabel('Nome do fluxo')).toBeDisabled()
  await nodes.filter({ hasText: 'Como podemos ajudar?' }).click()
  await expect(page.getByLabel('Configuração do componente')).toHaveCount(0)
  await page.getByLabel('Biblioteca de componentes').getByRole('button', { name: 'Enviar Mensagem', exact: true }).click()
  await expect(page.getByText('Geração com IA em andamento', { exact: true })).toBeVisible()
  await expect(nodes).toHaveCount(CHECKPOINT.nodes.length)
  expect(await saved(page)).toEqual(PREVIOUS_STATE)

  hold.open()
  const importButton = dialog.getByRole('button', { name: 'Importar para o editor' })
  await expect(importButton).toBeFocused({ timeout: 15000 })
  await expect(panel).toHaveCount(0)
  await expect(dialog.getByRole('heading', { name: resultTitle(issues), exact: true })).toBeVisible()
  await expect(summaryOf(dialog)).toHaveText([plural(components(final), 'componente', 'componentes'), plural(final.edges.length, 'conexão', 'conexões'), 'GPT-6.1 Sol', 'Esforço equilibrado', '1 rodada', '33 tokens'])
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.getByText(DONE_BANNER)).toBeVisible()
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(dialog.getByText('Importar abre este fluxo no editor e guarda o fluxo que estava aberto em Meus fluxos.')).toBeVisible()
  expect(ai.calls).toHaveLength(1)
  expect(ai.calls[0].url).toBe(ENDPOINTS.openai)
  expect(ai.calls[0].headers.authorization).toBe(`Bearer ${KEYS.openai}`)
  expect(ai.calls[0].body).toMatchObject({ model: 'gpt-6.1-sol', stream: true, reasoning: { effort: 'medium' } })
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(PREVIOUS_STATE)

  await importButton.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(page.getByText(DONE_BANNER)).toHaveCount(0)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(final.name)
  await expect(page.getByLabel('Nome do fluxo')).toBeEnabled()
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
  await expect.poll(() => saved(page)).toEqual({ name: final.name, nodes: final.nodes.map((node) => node.id) })
})

test('cancelling from the panel aborts the provider stream and leaves the open flow untouched', async ({ page, ai }) => {
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, THIRD), hold, TEXT.slice(THIRD)] })
  await openEditor(page)
  let dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const nodes = page.locator('.react-flow__node')
  await hold.reached
  await expect(nodes).toHaveCount(CHECKPOINT.nodes.length)
  await expect(page.getByText(BANNER)).toBeVisible()
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Geração cancelada', { exact: true })).toBeVisible()
  await expect(page.getByText('O fluxo aberto no editor não foi alterado.', { exact: true })).toBeVisible()
  await expect(page.locator('[data-ai-trigger]')).toBeFocused()
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(PREVIOUS.nodes.length)
  await expect(page.locator('.react-flow')).toContainText('Mensagem do fluxo anterior')
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(PREVIOUS.name)
  await expect(page.getByLabel('Nome do fluxo')).toBeEnabled()
  await expect.poll(() => ai.calls[0].session.closed).toBe(true)
  expect(await saved(page)).toEqual(PREVIOUS_STATE)

  dialog = await openDialog(page)
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Cancelar geração' })).toHaveCount(0)
  await expect(dialog.getByLabel('Descrição do atendimento')).toHaveValue(PROMPT)
  expect(ai.calls).toHaveLength(1)
  expect(ai.fallbacks).toEqual([])
})

test('Ver detalhes reopens the dialog, Acompanhar no canvas and Esc collapse it again, and closing the result clears the preview', async ({ page, ai }) => {
  const final = (await engineResult()).workflow
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, THIRD), hold, TEXT.slice(THIRD)] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const nodes = page.locator('.react-flow__node')
  const details = panel.getByRole('button', { name: 'Ver detalhes' })
  await hold.reached
  await expect(nodes).toHaveCount(CHECKPOINT.nodes.length)

  await details.click()
  await expect(dialog).toBeVisible()
  await expect(panel).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Cancelar geração' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo' })).toBeDisabled()
  await expect(nodes).toHaveCount(CHECKPOINT.nodes.length)

  await dialog.getByRole('button', { name: 'Acompanhar no canvas' }).click()
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(details).toBeFocused()

  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(panel).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(details).toBeFocused()
  await expect(page.getByText(BANNER)).toBeVisible()
  expect(ai.calls[0].session.closed).toBe(false)

  hold.open()
  await expect(dialog.getByRole('button', { name: 'Importar para o editor' })).toBeFocused({ timeout: 15000 })
  await expect(nodes).toHaveCount(final.nodes.length)
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(PREVIOUS.nodes.length)
  await expect(page.locator('.react-flow')).toContainText('Mensagem do fluxo anterior')
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(PREVIOUS.name)
  expect(await saved(page)).toEqual(PREVIOUS_STATE)
  expect(ai.calls).toHaveLength(1)
})

test('discarding the result clears the preview and returns to the form', async ({ page, ai }) => {
  const final = (await engineResult()).workflow
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const nodes = page.locator('.react-flow__node')
  const discard = dialog.getByRole('button', { name: 'Descartar' })
  await expect(discard).toBeVisible({ timeout: 15000 })
  await expect(nodes).toHaveCount(final.nodes.length)
  await discard.click()
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo' })).toBeEnabled()
  await expect(dialog.getByText('Fluxo descartado.', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Descrição do atendimento')).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Ver resultado' })).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(PREVIOUS.nodes.length)

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.react-flow')).toContainText('Mensagem do fluxo anterior')
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(PREVIOUS.name)
  expect(await saved(page)).toEqual(PREVIOUS_STATE)
  expect(await library(page)).toEqual([])
  expect(ai.calls).toHaveLength(1)
})

test('without Acompanhar no canvas the dialog stays open and the canvas never changes', async ({ page, ai }) => {
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, THIRD), hold, TEXT.slice(THIRD)] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog, { watch: false })
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const nodes = page.locator('.react-flow__node')
  await expect(dialog.getByRole('button', { name: 'Cancelar geração' })).toBeFocused()
  await hold.reached
  await expect(dialog).toContainText('Gerando o fluxo, rodada 1 de 3')
  await expect(dialog.getByRole('button', { name: 'Acompanhar no canvas' })).toHaveCount(0)
  await expect(panel).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(PREVIOUS.nodes.length)

  hold.open()
  await expect(dialog.getByRole('button', { name: 'Importar para o editor' })).toBeFocused({ timeout: 15000 })
  await expect(panel).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(PREVIOUS.nodes.length)
  await expect(page.locator('.react-flow')).toContainText('Mensagem do fluxo anterior')

  await dialog.getByRole('button', { name: 'Editar solicitação' }).click()
  await expect(dialog.getByRole('button', { name: 'Ver resultado' })).toBeVisible()
  await expect(dialog.getByLabel('Descrição do atendimento')).toHaveValue(PROMPT)
  await expect(dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })).not.toBeChecked()
  expect(await saved(page)).toEqual(PREVIOUS_STATE)
  expect(ai.calls).toHaveLength(1)
  expect(ai.fallbacks).toEqual([])
})

test('a provider rejection stays on the key field, and when the browser cannot reach the provider the generation falls back to the server route', async ({ page, ai }) => {
  const reference = await engineResult()
  const final = reference.workflow
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  const effort = dialog.getByRole('combobox', { name: 'Esforço' })
  await effort.click()
  await page.getByRole('option', { name: 'Alto', exact: true }).click()
  await expect(effort).toHaveText('Alto')

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const key = dialog.getByLabel('Chave da API da OpenAI')
  const rejected = dialog.getByText('A chave da API foi recusada. Confira a chave da OpenAI e tente novamente.', { exact: true })
  for (let attempt = 1; attempt <= 2; attempt++) {
    ai.replies.push({ status: 401, body: { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } } })
    await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()
    await expect.poll(() => ai.calls.length).toBe(attempt)
    await expect(rejected).toBeVisible()
    await expect(key).toBeFocused()
    await expect(key).toHaveAttribute('aria-invalid', 'true')
    await page.waitForTimeout(600)
    await expect(rejected).toBeVisible()
    await expect(key).toBeFocused()
    await expect(panel).toHaveCount(0)
  }
  expect(ai.fallbacks).toEqual([])

  const hold = ai.hold()
  ai.replies.push({ blocked: true })
  ai.rescues.push([progress('preparando'), progress('gerando', { nodes: 2, edges: 1 }), hold, line({ type: 'result', result: reference })])
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()
  await expect(rejected).toHaveCount(0)
  await hold.reached
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Gerando o fluxo, rodada 1 de 3: 2 componentes e 1 conexão.')
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(PREVIOUS.nodes.length)
  expect(ai.calls).toHaveLength(3)
  expect(ai.fallbacks).toEqual([{ provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEYS.openai, prompt: PROMPT, image: null, size: 'auto', effort: 'high', fill: true, stream: true }])

  hold.open()
  const importButton = dialog.getByRole('button', { name: 'Importar para o editor' })
  await expect(importButton).toBeFocused({ timeout: 15000 })
  await expect(summaryOf(dialog)).toContainText(['GPT-6.1 Sol', 'Esforço alto', '1 rodada'])
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await importButton.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(BANNER)).toHaveCount(0)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(final.name)
  await expect.poll(() => saved(page)).toEqual({ name: final.name, nodes: final.nodes.map((node) => node.id) })
  expect(ai.calls).toHaveLength(3)
  expect(ai.fallbacks).toHaveLength(1)
})

test('the effort selector follows each model and the chosen level reaches the provider request body', async ({ page, ai }) => {
  await page.goto('/flow')
  const dialog = await openDialog(page)
  await dialog.getByLabel('Descrição do atendimento').fill(PROMPT)
  await dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' }).uncheck()
  const model = dialog.getByRole('combobox', { name: 'Modelo' })
  const effort = dialog.getByRole('combobox', { name: 'Esforço' })
  const options = async (labels) => {
    await effort.click()
    await expect(page.getByRole('option')).toHaveText(labels)
  }
  const generate = async (provider, read, sent, chip) => {
    await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()
    await expect(dialog.getByRole('button', { name: 'Importar para o editor' })).toBeFocused({ timeout: 15000 })
    await expect(summaryOf(dialog).filter({ hasText: /^Esforço / })).toHaveText(chip)
    const call = ai.calls.at(-1)
    expect(call.provider).toBe(provider)
    expect(call.url).toBe(ENDPOINTS[provider])
    expect(read(call.body)).toBe(sent)
    await dialog.getByRole('button', { name: 'Editar solicitação' }).click()
    return call
  }

  await expect(model).toHaveText('GPT-6.1 Sol (recomendado)')
  await expect(effort).toHaveText('Equilibrado')
  await expect(dialog.getByText(HINTS.medium, { exact: true })).toBeVisible()
  await options(EFFORTS)
  await page.getByRole('option', { name: 'Máximo', exact: true }).click()
  await expect(effort).toHaveText('Máximo')
  await expect(dialog.getByText(HINTS.max, { exact: true })).toBeVisible()
  await dialog.getByLabel('Chave da API da OpenAI').fill(KEYS.openai)
  const openai = await generate('openai', (body) => body.reasoning?.effort, 'max', 'Esforço máximo')
  expect(openai.headers.authorization).toBe(`Bearer ${KEYS.openai}`)

  await chooseProvider(dialog, 'Gemini')
  await expect(model).toHaveText('Gemini 3.8 Flash (recomendado)')
  await expect(effort).toHaveText('Alto')
  await options(['Rápido', 'Equilibrado', 'Alto'])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Chave da API do Google').fill(KEYS.google)
  const google = await generate('google', (body) => body.generationConfig?.thinkingConfig?.thinkingLevel, 'high', 'Esforço alto')
  expect(google.headers['x-goog-api-key']).toBe(KEYS.google)

  await chooseProvider(dialog, 'Claude')
  await expect(model).toHaveText('Claude Opus 5.5 (recomendado)')
  await expect(effort).toHaveText('Máximo')
  await options(EFFORTS)
  await page.getByRole('option', { name: 'Rápido', exact: true }).click()
  await expect(effort).toHaveText('Rápido')
  await dialog.getByLabel('Chave da API da Anthropic').fill(KEYS.anthropic)
  const anthropic = await generate('anthropic', (body) => body.output_config?.effort, 'low', 'Esforço rápido')
  expect(anthropic.headers['x-api-key']).toBe(KEYS.anthropic)
  expect(anthropic.headers['anthropic-dangerous-direct-browser-access']).toBe('true')

  await chooseProvider(dialog, 'Grok')
  await expect(model).toHaveText('Grok 4.7 (recomendado)')
  await expect(effort).toHaveText('Rápido')
  await options(EFFORTS)
  await page.getByRole('option', { name: 'Máximo', exact: true }).click()
  await expect(effort).toHaveText('Máximo')
  await dialog.getByLabel('Chave da API da xAI').fill(KEYS.xai)
  const xai = await generate('xai', (body) => body.reasoning?.effort, 'xhigh', 'Esforço máximo')
  expect(xai.headers.authorization).toBe(`Bearer ${KEYS.xai}`)

  expect(ai.calls.map((call) => call.provider)).toEqual(['openai', 'google', 'anthropic', 'xai'])
  expect(ai.fallbacks).toEqual([])
})

test('GPT-6 Luna is listed among the OpenAI models and is the model sent to the provider', async ({ page, ai }) => {
  await openEditor(page)
  const dialog = await openDialog(page)
  const model = dialog.getByRole('combobox', { name: 'Modelo' })
  await expect(model).toHaveText('GPT-6.1 Sol (recomendado)')
  await model.click()
  await expect(page.getByRole('option')).toHaveText(['GPT-6.1 Sol (recomendado)', 'GPT-6 Astra (o mais capaz)', 'GPT-6 Luna (o mais rápido)'])
  await expect(page.getByRole('listbox').getByText('Recomendados', { exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'GPT-6 Luna (o mais rápido)', exact: true }).click()
  await expect(model).toHaveText('GPT-6 Luna (o mais rápido)')
  await expect(dialog.getByText('ID gpt-6-luna. Analisa imagens.')).toBeVisible()
  const effort = dialog.getByRole('combobox', { name: 'Esforço' })
  await effort.click()
  await expect(page.getByRole('option')).toHaveText(EFFORTS)
  await page.keyboard.press('Escape')

  await chooseProvider(dialog, 'Claude')
  await model.click()
  await expect(page.getByRole('option', { name: /Luna/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await chooseProvider(dialog, 'ChatGPT')
  await expect(model).toHaveText('GPT-6 Luna (o mais rápido)')

  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()
  await expect(dialog.getByRole('button', { name: 'Importar para o editor' })).toBeFocused({ timeout: 15000 })
  await expect(summaryOf(dialog)).toContainText(['GPT-6 Luna'])
  expect(ai.calls).toHaveLength(1)
  expect(ai.calls[0].body.model).toBe('gpt-6-luna')
  expect(ai.calls[0].body.reasoning?.effort).toBe('medium')
})

test('importing keeps the previous flow in Meus fluxos', async ({ page, ai }) => {
  const final = (await engineResult()).workflow
  await openEditor(page)
  await expect(page.getByRole('button', { name: 'Meus fluxos', exact: true })).toBeVisible()
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()
  const importButton = dialog.getByRole('button', { name: 'Importar para o editor' })
  await expect(importButton).toBeFocused({ timeout: 15000 })
  expect(await library(page)).toEqual([])

  await importButton.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(final.name)
  await expect.poll(() => library(page)).toEqual([PREVIOUS_STATE])
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library'))[0].flow)
  expect(stored.edges.map((edge) => edge.id)).toEqual(PREVIOUS.edges.map((edge) => edge.id))
  expect(stored.nodes.map((node) => node.data)).toEqual(PREVIOUS.nodes.map((node) => node.data))

  await page.getByRole('button', { name: 'Meus fluxos, 1', exact: true }).click()
  const entries = page.getByRole('list', { name: 'Meus fluxos' }).getByRole('listitem')
  await expect(entries).toHaveCount(1)
  await expect(entries).toContainText(['Fluxo anterior'])
  await expect(entries).toContainText([`${PREVIOUS.nodes.length} componentes`])
  await page.getByRole('button', { name: 'Abrir Fluxo anterior', exact: true }).click()
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(PREVIOUS.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(PREVIOUS.nodes.length)
  await expect(page.locator('.react-flow')).toContainText('Mensagem do fluxo anterior')
  await expect.poll(() => library(page)).toEqual([{ name: final.name, nodes: final.nodes.map((node) => node.id) }, PREVIOUS_STATE])
})

test('a stream that drops midway resumes in the next round and finishes without a timeout', async ({ page, ai }) => {
  const final = (await engineResult()).workflow
  const issues = (await engineResult()).issues.length
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, CUT), DROP] }, { steps: [hold, TEXT] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const canvas = page.locator('.react-flow')
  await hold.reached
  await expect(panel).toContainText('rodada 2 de 3')
  await expect(page.locator('.react-flow__node')).toHaveCount(CHECKPOINT.nodes.length)
  await expect(canvas).toContainText('Como podemos ajudar?')
  await expect(canvas).not.toContainText('Obrigado pelo contato. Até logo.')
  expect(ai.calls).toHaveLength(2)
  const input = ai.calls[1].body.input
  expect(input).toHaveLength(4)
  expect(input.slice(2).map((message) => message.role)).toEqual(['assistant', 'user'])
  expect(JSON.parse(input[2].content[0].text).nodes).toEqual(RI.nodes.slice(0, 3))
  expect(JSON.stringify(input[3].content)).toContain('Resposta interrompida')

  hold.open()
  const importButton = dialog.getByRole('button', { name: 'Importar para o editor' })
  await expect(importButton).toBeFocused({ timeout: 15000 })
  await expect(dialog.getByRole('heading', { name: resultTitle(issues), exact: true })).toBeVisible()
  await expect(summaryOf(dialog)).toContainText(['2 rodadas'])
  await expect(dialog.getByText(NOTICE)).toHaveCount(0)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/demorou demais/)).toHaveCount(0)
  expect(ai.fallbacks).toEqual([])

  await importButton.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await expect(canvas).toContainText('Obrigado pelo contato. Até logo.')
  await expect.poll(() => saved(page)).toEqual({ name: final.name, nodes: final.nodes.map((node) => node.id) })
})

test('a stream that drops in every round still delivers a usable partial flow, without a timeout', async ({ page, ai }) => {
  ai.replies.push({ steps: [TEXT.slice(0, CUT), { pause: 1500 }, DROP] }, { steps: [TEXT.slice(0, CUT), DROP] }, { steps: [TEXT.slice(0, CUT), DROP] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await fillRequest(dialog)
  await dialog.getByRole('button', { name: 'Gerar fluxo' }).click()

  const importButton = dialog.getByRole('button', { name: 'Importar para o editor' })
  await expect(importButton).toBeFocused({ timeout: 20000 })
  await expect(dialog.getByRole('heading', { name: 'Fluxo gerado em parte', exact: true })).toBeVisible()
  await expect(dialog.getByText('A geração foi interrompida antes do fim. Os componentes que chegaram completos foram mantidos.')).toBeVisible()
  await expect(dialog.getByText(NOTICE)).toBeVisible()
  await expect(summaryOf(dialog)).toContainText(['3 rodadas'])
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/demorou demais/)).toHaveCount(0)
  await expect(importButton).toBeEnabled()
  const count = Number.parseInt(await summaryOf(dialog).first().textContent(), 10)
  expect(count).toBeGreaterThanOrEqual(3)
  expect(ai.calls).toHaveLength(3)
  expect(ai.calls.slice(1).every((call) => JSON.stringify(call.body.input).includes('Resposta interrompida'))).toBe(true)
  expect(ai.fallbacks).toEqual([])

  await importButton.click()
  const canvas = page.locator('.react-flow')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(RI.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(count + 1)
  await expect(canvas).toContainText('Olá, #NAME. Você está no atendimento da Clínica Exemplo.')
  await expect(canvas).toContainText('Como podemos ajudar?')
  await expect(canvas).not.toContainText('Obrigado pelo contato. Até logo.')
  await expect.poll(async () => (await saved(page)).nodes.length).toBe(count + 1)
})
