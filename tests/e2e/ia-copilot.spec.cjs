require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow } = require('../../lib/atendimento/format.ts')
const { START_TYPE } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { flowToRi } = require('../../lib/atendimento/ai/edit.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const PROMPT = 'No menu, acrescente a opção Segunda via de boleto, que envia o link do boleto e encerra.'
const REFINE_PROMPT = 'Troque o texto do boleto por um link direto e deixe a despedida mais calorosa.'
const EDIT_BANNER = 'Editando com IA. As mudanças aparecem aqui conforme chegam.'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const FILL_ON = 'Nomes, IDs e URLs saem sempre preenchidos. Os valores provisórios aparecem em Dados da plataforma para você conferir.'
const FILL_OFF = 'Dados cadastrados na plataforma, como nomes, IDs e URLs, ficam em branco para você completar no editor.'
const INTRO = 'O copiloto edita o fluxo aberto a partir do seu pedido. As mudanças aparecem no canvas para você conferir e só valem quando você aplicar. Desfazer (Ctrl+Z) volta ao fluxo anterior.'
const EXAMPLES = [
  'Peça o CPF do cliente antes do menu principal',
  'Troque a mensagem de boas-vindas por uma mais curta',
  'Fora do horário de atendimento, transfira para o departamento Suporte',
  'Acrescente uma pesquisa de satisfação no fim do atendimento',
]
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const DISCARDED = 'Proposta descartada. O fluxo aberto não mudou.'
const CANCELLED = 'Pedido cancelado. O fluxo aberto não mudou.'
const EMPTY_NOTICE = 'O fluxo aberto só tem o Início. Para criar um fluxo do zero, use Gerar com IA.'
const REFINE_HINT = 'O próximo pedido ajusta a proposta mostrada no canvas.'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const SUMMARY = 'OpenAI · GPT-6.1 Sol · Esforço equilibrado'
const BOLETO_TEXT = 'Acesse a segunda via em https://boletos.exemplo.com.br.'
const FAREWELL = 'Obrigado pelo contato. Até logo.'
const REFINED_BOLETO = 'Segunda via direto no link https://boletos.exemplo.com.br/2via.'
const REFINED_FAREWELL = 'Obrigado pelo contato. Volte sempre que precisar.'
const NEW_OPTION = 'Segunda via de boleto'
const PANEL_WIDTH = 384

const SOURCE = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, menu e transferência para a equipe certa',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: 'Agendamento' }, { key: 'departamento', value: 'agendamento' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: FAREWELL }] },
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

const BASE_FLOW = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(SOURCE, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))
const BASE_RI = flowToRi(BASE_FLOW)
const MENU = BASE_RI.nodes.find((node) => node.type === 'envio_mensagem')
const MENU_ID = MENU.id
const DELTA = {
  name: '',
  description: '',
  nodes: [
    {
      id: MENU_ID,
      type: 'envio_mensagem',
      config: MENU.config.map((entry) => (entry.key === 'options' ? { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }, { text: NEW_OPTION }]) } : entry)),
    },
    { id: 'boleto', type: 'envio_pergunta', config: [{ key: 'template', value: BOLETO_TEXT }] },
    { id: 'fim_boleto', type: 'finalizar', config: [] },
  ],
  edges: [
    ...BASE_RI.edges.filter((edge) => edge.from === MENU_ID),
    { from: MENU_ID, output: NEW_OPTION, to: 'boleto' },
    { from: 'boleto', output: '', to: 'fim_boleto' },
  ],
}
const TEXT = JSON.stringify(DELTA)
const AFTER_NODES = TEXT.indexOf('"edges"')
const BASE_STATE = { name: BASE_FLOW.name, nodes: BASE_FLOW.nodes.map((node) => node.id) }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`

function pieces(text, size = 48) {
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts
}

function script(steps) {
  const body = [
    { type: 'response.created', response: { id: 'resp_1', created_at: 1760000000, model: 'gpt-6.1-sol' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
  ].map(event)
  for (const step of steps) {
    if (typeof step === 'string') body.push(...pieces(step).map((piece) => event({ type: 'response.output_text.delta', item_id: 'msg_1', delta: piece })))
    else body.push(step)
  }
  return [
    ...body,
    event({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } }),
    event({ type: 'response.completed', response: { incomplete_details: null, usage: { input_tokens: 11, output_tokens: 22 } } }),
  ]
}

async function engineEdit(baseFlow, text, prompt) {
  const { runGeneration } = require('../../lib/atendimento/ai/runner.ts')
  const body = script([text]).join('')
  const result = await runGeneration(
    { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, prompt, size: 'auto', effort: 'medium', mode: 'edit', base: baseFlow, fill: true },
    { transport: 'server', signal: new AbortController().signal, fetch: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) },
  )
  if (!result.success) throw new Error(`O motor não aplicou a edição de referência: ${result.error}`)
  return result
}

let expected
const expectedEdit = () => (expected ??= engineEdit(BASE_FLOW, TEXT, PROMPT))

let refined
function expectedRefinement() {
  refined ??= (async () => {
    const first = (await expectedEdit()).workflow
    const ri = flowToRi(first)
    const find = (text) => ri.nodes.find((node) => node.config.some((entry) => entry.value === text))
    const delta = {
      name: '',
      description: '',
      nodes: [
        { id: find(BOLETO_TEXT).id, type: 'envio_pergunta', config: [{ key: 'template', value: REFINED_BOLETO }] },
        { id: find(FAREWELL).id, type: 'envio_pergunta', config: [{ key: 'template', value: REFINED_FAREWELL }] },
      ],
      edges: [],
    }
    const text = JSON.stringify(delta)
    return { text, result: await engineEdit(first, text, REFINE_PROMPT) }
  })()
  return refined
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

async function play(response, steps) {
  for (const step of steps) {
    if (response.destroyed) return
    if (typeof step === 'string') {
      response.write(step)
      await sleep(20)
    } else {
      step.arrive()
      await step.opened
    }
  }
  if (!response.destroyed) response.end()
}

const test = base.extend({
  server: [async ({}, use) => {
    const sessions = new Map()
    const server = https.createServer(certificate(), (request, response) => {
      request.resume()
      const steps = sessions.get(request.url.slice(1))
      if (!steps) {
        response.writeHead(404).end()
        return
      }
      response.on('error', () => undefined)
      request.socket.setNoDelay(true)
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
      response.flushHeaders()
      void play(response, steps)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    await use({ sessions, url: `https://127.0.0.1:${server.address().port}` })
    server.closeAllConnections()
    server.close()
  }, { scope: 'worker' }],
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(page)
    expect(errors, 'erros não tratados na página').toEqual([])
  },
  ai: async ({ page, server }, use) => {
    const gates = []
    const ids = []
    const ai = {
      calls: [],
      fallbacks: [],
      replies: [],
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
    await page.route((url) => url.hostname === HOST, async (route) => {
      const request = route.request()
      ai.calls.push({ url: request.url(), body: request.postDataJSON(), headers: request.headers() })
      const reply = ai.replies.shift() ?? { steps: [TEXT] }
      if (reply.blocked) return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': 'https://platform.openai.com' }, body: '' })
      const id = crypto.randomUUID()
      server.sessions.set(id, script(reply.steps))
      ids.push(id)
      return route.continue({ url: `${server.url}/${id}` })
    })
    await page.route('**/api/generate-workflow', async (route) => {
      ai.fallbacks.push(route.request().postDataJSON())
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'unknown', error: FALLBACK_ERROR }) })
    })
    await use(ai)
    for (const gate of gates) gate.open()
    for (const id of ids) server.sessions.delete(id)
  },
})

test.use({ ignoreHTTPSErrors: true })

const trigger = (page) => page.locator('[data-copilot-trigger]')
const copilot = (page) => page.getByRole('region', { name: 'Copiloto', exact: true })
const composer = (panel) => panel.getByLabel('O que você quer mudar no fluxo', { exact: true })
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: flow.nodes.map((node) => node.id) }
}
const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library') || '[]').map((entry) => ({ id: entry.id, name: entry.flow.name, nodes: entry.flow.nodes.map((node) => node.id) })))
const components = (flow) => flow.nodes.filter((node) => node.data.type !== START_TYPE).length

async function openEditor(page) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
}

async function openCopilot(page) {
  await trigger(page).click()
  const panel = copilot(page)
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  return panel
}

async function typeKey(panel) {
  const settings = panel.getByRole('button', { name: 'Configurar IA', exact: true })
  if ((await settings.getAttribute('aria-expanded')) !== 'true') await settings.click()
  await panel.getByLabel('Chave da API da OpenAI').fill(KEY)
}

async function ask(panel, text) {
  const input = composer(panel)
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

async function proposal(panel, count = 1) {
  const cards = panel.getByRole('heading', { name: /^Edição pronta/ })
  await expect(cards).toHaveCount(count, { timeout: 15000 })
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toBeEnabled()
  return panel.getByRole('list', { name: 'Mudanças no fluxo aberto' }).nth(count - 1).getByRole('listitem')
}

test('the Copiloto button opens a side panel next to the canvas, keeps it mounted and Gerar com IA closes it', async ({ page }) => {
  await openEditor(page)
  const button = trigger(page)
  await expect(button).toHaveAccessibleName('Copiloto')
  await expect(button).toHaveAttribute('title', 'Copiloto')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(button).toBeVisible()
  const header = await page.getByRole('button', { name: 'Gerar com IA', exact: true }).boundingBox()
  const own = await button.boundingBox()
  expect(own.x).toBeGreaterThan(header.x)

  const panel = await openCopilot(page)
  const id = await panel.getAttribute('id')
  expect(id).toBeTruthy()
  await expect(button).toHaveAttribute('aria-controls', id)
  await expect(panel.getByRole('heading', { name: 'Copiloto', exact: true })).toBeVisible()
  await expect(panel.getByText('Edita o fluxo aberto', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Configurar IA', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByLabel('Chave da API da OpenAI')).toBeFocused()
  await expect(panel.getByText('A chave fica só nesta página, não é salva e serve apenas para chamar a API da OpenAI. É a mesma usada no Gerar com IA.')).toBeVisible()
  const log = panel.getByRole('log', { name: 'Conversa com o Copiloto' })
  await expect(log).toHaveAttribute('aria-live', 'polite')
  await expect(log.getByText(INTRO)).toBeVisible()
  await expect(log.getByText('Exemplos:', { exact: true })).toBeVisible()
  for (const example of EXAMPLES) await expect(log.getByRole('button', { name: example, exact: true })).toBeVisible()
  await expect(composer(panel)).toHaveAttribute('placeholder', 'O que você quer mudar no fluxo?')
  await expect(panel.getByRole('button', { name: 'Enviar pedido', exact: true })).toBeDisabled()
  await expect(panel.getByRole('checkbox', { name: 'Preencher todos os campos' })).toBeChecked()

  const box = await panel.boundingBox()
  const viewport = page.viewportSize()
  expect(Math.round(box.width)).toBe(PANEL_WIDTH)
  expect(Math.round(box.x + box.width)).toBe(viewport.width)
  expect(Math.round(box.y)).toBe(56)
  expect(Math.round(box.y + box.height)).toBe(viewport.height)
  const canvas = await page.locator('.react-flow').boundingBox()
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(box.x + 1)

  await page.getByRole('button', { name: 'Abrir prévia', exact: true }).click()
  const bot = page.getByRole('region', { name: 'Assistente de prévia' })
  await expect(bot).toBeVisible()
  await expect.poll(async () => {
    const shown = await bot.boundingBox()
    return shown.x + shown.width <= box.x
  }).toBe(true)

  await log.getByRole('button', { name: EXAMPLES[2], exact: true }).click()
  await expect(composer(panel)).toHaveValue(EXAMPLES[2])
  await expect(composer(panel)).toBeFocused()
  await expect(panel.getByRole('button', { name: 'Enviar pedido', exact: true })).toBeEnabled()

  await button.click()
  await expect(panel).toBeHidden()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => {
    const shown = await bot.boundingBox()
    return Math.round(shown.x + shown.width)
  }).toBe(viewport.width - 16)
  await button.click()
  await expect(panel).toBeVisible()
  await expect(composer(panel)).toHaveValue(EXAMPLES[2])

  await panel.getByRole('button', { name: 'Fechar Copiloto', exact: true }).click()
  await expect(panel).toBeHidden()
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-expanded', 'false')

  await button.click()
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  await expect(panel).toBeHidden()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
})

test('Gerar com IA only creates flows: Criar fluxo novo and Conversar com a IA, without Editar o fluxo aberto', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Criar fluxo novo', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Conversar com a IA', exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('radio', { name: 'Editar o fluxo aberto', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('radiogroup', { name: 'O que fazer' }).getByRole('radio')).toHaveCount(2)
})

test('an edit through the Copiloto shows live on the canvas, lists the changes and Aplicar is one undoable step in the same Meus fluxos entry', async ({ page, ai }) => {
  const result = await expectedEdit()
  const final = result.workflow
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })

  await openEditor(page)
  await page.getByRole('button', { name: 'Novo fluxo', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Meus fluxos, 1', exact: true }).click()
  await page.getByRole('button', { name: `Abrir ${BASE_FLOW.name}`, exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  const entry = (await library(page))[0]
  expect(entry).toEqual({ id: entry.id, ...BASE_STATE })

  const panel = await openCopilot(page)
  await typeKey(panel)
  await ask(panel, PROMPT)
  const log = panel.getByRole('log', { name: 'Conversa com o Copiloto' })
  await expect(log.getByText(PROMPT)).toHaveText(`Você: ${PROMPT}`)
  await expect(log.getByText(INTRO)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toBeVisible()
  await expect(log.getByRole('status').first()).toHaveText(/^(Enviando a solicitação|Preparando a edição|Editando o fluxo, rodada 1 de 3)\.$/)

  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await hold.reached
  await expect(canvas).toContainText(BOLETO_TEXT)
  await expect(canvas).toContainText(NEW_OPTION)
  await expect.poll(() => nodes.count()).toBeGreaterThan(BASE_FLOW.nodes.length)
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled()
  expect(await saved(page)).toEqual(BASE_STATE)

  hold.open()
  const chips = await proposal(panel)
  await expect(chips).toHaveText(['2 componentes novos', '1 alterado', '0 removidos'])
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText('GPT-6.1 Sol · Esforço equilibrado · 33 tokens', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(composer(panel)).toHaveAttribute('placeholder', 'Peça um ajuste nesta proposta')
  await expect(panel.getByText(REFINE_HINT, { exact: true })).toBeVisible()
  expect(ai.calls).toHaveLength(1)
  const sent = JSON.stringify(ai.calls[0].body)
  expect(sent).toContain('# Modo de edição')
  expect(sent).toContain('# Fluxo atual')
  expect(sent).toContain(PROMPT)
  expect(sent).not.toContain(KEY)
  expect(ai.calls[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByText('Alterações aplicadas', { exact: true })).toBeVisible()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(panel.getByText('Aplicada', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(composer(panel)).toHaveAttribute('placeholder', 'O que você quer mudar no fluxo?')
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect(canvas).toContainText(BOLETO_TEXT)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: final.nodes.map((node) => node.id) })

  const after = await stored(page)
  expect(after.nodes.filter((node) => node.data.type !== START_TYPE)).toHaveLength(components(final))
  for (const node of BASE_FLOW.nodes) {
    const kept = after.nodes.find((item) => item.id === node.id)
    expect(kept, node.id).toBeTruthy()
    expect(kept.position, node.id).toEqual(node.position)
    if (node.id !== MENU_ID) expect(kept.data, node.id).toEqual(node.data)
  }

  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect.poll(() => library(page)).toEqual([{ id: entry.id, name: BASE_FLOW.name, nodes: final.nodes.map((node) => node.id) }])

  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(canvas).not.toContainText(BOLETO_TEXT)
  await expect(canvas).not.toContainText(NEW_OPTION)
  await expect.poll(() => saved(page)).toEqual(BASE_STATE)
  const undone = await stored(page)
  expect(undone.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(BASE_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(undone.edges).toEqual(BASE_FLOW.edges)
})

test('Descartar and Parar leave the open flow exactly as it was', async ({ page, ai }) => {
  const final = (await expectedEdit()).workflow
  await openEditor(page)
  const panel = await openCopilot(page)
  await typeKey(panel)
  await ask(panel, PROMPT)
  await proposal(panel)
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()

  await panel.getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(panel.getByText(DISCARDED, { exact: true })).toBeVisible()
  await expect(panel.getByText('Descartada', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(canvas).not.toContainText(BOLETO_TEXT)
  await expect(composer(panel)).toHaveAttribute('placeholder', 'O que você quer mudar no fluxo?')

  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })
  await ask(panel, PROMPT)
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await hold.reached
  await expect(canvas).toContainText(BOLETO_TEXT)
  await panel.getByRole('button', { name: 'Parar', exact: true }).click()
  await expect(panel.getByText(CANCELLED, { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(canvas).not.toContainText(BOLETO_TEXT)
  await expect(composer(panel)).toBeFocused()
  hold.open()
  await sleep(300)
  await expect(panel.getByRole('heading', { name: /^Edição pronta/ })).toHaveCount(1)
  expect(ai.calls).toHaveLength(2)

  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
  expect(await saved(page)).toEqual(BASE_STATE)
  const kept = await stored(page)
  expect(kept.nodes).toEqual(BASE_FLOW.nodes)
  expect(kept.edges).toEqual(BASE_FLOW.edges)
  expect(await library(page)).toEqual([])
})

test('a refinement sends the proposal as the base and the changes still count from the open flow', async ({ page, ai }) => {
  const first = (await expectedEdit()).workflow
  const second = await expectedRefinement()
  expect(second.result.changes).toEqual({ added: 0, changed: 2, removed: 0 })
  await openEditor(page)
  const panel = await openCopilot(page)
  await typeKey(panel)
  await ask(panel, PROMPT)
  await proposal(panel)
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(nodes).toHaveCount(first.nodes.length)

  ai.replies.push({ steps: [second.text] })
  await ask(panel, REFINE_PROMPT)
  const chips = await proposal(panel, 2)
  await expect(chips).toHaveText(['2 componentes novos', '2 alterados', '0 removidos'])
  await expect(panel.getByText('Ajustada no pedido seguinte', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(1)
  await expect(canvas).toContainText(REFINED_BOLETO)
  await expect(canvas).toContainText(REFINED_FAREWELL)
  await expect(canvas).toContainText(NEW_OPTION)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()

  expect(ai.calls).toHaveLength(2)
  const firstSent = JSON.stringify(ai.calls[0].body)
  const refineSent = JSON.stringify(ai.calls[1].body)
  expect(firstSent).not.toContain(BOLETO_TEXT)
  expect(refineSent).toContain(BOLETO_TEXT)
  expect(refineSent).toContain(NEW_OPTION)
  expect(refineSent).toContain(REFINE_PROMPT)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(nodes).toHaveCount(second.result.workflow.nodes.length)
  await expect(canvas).toContainText(REFINED_BOLETO)
  await expect(canvas).toContainText(REFINED_FAREWELL)
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: second.result.workflow.nodes.map((node) => node.id) })
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(canvas).toContainText(FAREWELL)
  await expect(canvas).not.toContainText(REFINED_FAREWELL)
  await expect.poll(() => saved(page)).toEqual(BASE_STATE)
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
})

test('closing the panel keeps the edit running off the canvas, then a toast and a badge lead back to the proposal', async ({ page, ai }) => {
  const final = (await expectedEdit()).workflow
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })
  await openEditor(page)
  const panel = await openCopilot(page)
  await typeKey(panel)
  await ask(panel, PROMPT)
  await hold.reached
  const nodes = page.locator('.react-flow__node')
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await trigger(page).click()
  await expect(panel).toBeHidden()
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()

  hold.open()
  await expect(page.getByText('Edição do Copiloto pronta', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Abra o Copiloto para revisar e aplicar.', { exact: true })).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName(/^Copiloto.*edição pronta para revisar$/)
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  expect(await saved(page)).toEqual(BASE_STATE)

  await trigger(page).click()
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName('Copiloto')
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(nodes).toHaveCount(final.nodes.length)
  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: final.nodes.map((node) => node.id) })
})

test('with only Início the Copiloto points to Gerar com IA', async ({ page, ai }) => {
  await page.goto('/flow')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  const panel = await openCopilot(page)
  await expect(panel.getByText(EMPTY_NOTICE, { exact: true })).toBeVisible()
  await typeKey(panel)
  await composer(panel).fill(EXAMPLES[3])
  await expect(panel.getByRole('button', { name: 'Enviar pedido', exact: true })).toBeDisabled()
  await composer(panel).press('Enter')
  await expect(composer(panel)).toHaveValue(EXAMPLES[3])
  await expect(panel.getByRole('log', { name: 'Conversa com o Copiloto' }).getByText(EXAMPLES[3], { exact: true })).toHaveCount(1)
  expect(ai.calls).toEqual([])

  await panel.getByRole('button', { name: 'Abrir Gerar com IA', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  await expect(panel).toBeHidden()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  await trigger(page).click()
  await expect(panel).toBeVisible()
  await expect(panel.getByText(EMPTY_NOTICE, { exact: true })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Enviar pedido', exact: true })).toBeEnabled()
})

test('Preencher todos os campos sends fill true by default and fill false when unchecked', async ({ page, ai }) => {
  await openEditor(page)
  const panel = await openCopilot(page)
  await typeKey(panel)
  const fill = panel.getByRole('checkbox', { name: 'Preencher todos os campos' })
  await expect(fill).toBeChecked()
  await expect(panel.getByText(FILL_ON, { exact: true })).toBeVisible()

  ai.replies.push({ blocked: true })
  await ask(panel, PROMPT)
  const failure = panel.getByText(FALLBACK_ERROR, { exact: true })
  await expect(failure).toBeVisible({ timeout: 15000 })
  await expect(panel.getByRole('button', { name: 'Tentar de novo', exact: true })).toBeVisible()
  expect(ai.fallbacks).toHaveLength(1)
  expect(ai.fallbacks[0]).toMatchObject({ fill: true, mode: 'edit', size: 'auto', prompt: PROMPT, image: null, effort: 'medium', stream: true })
  expect(ai.fallbacks[0].base.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(BASE_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(ai.fallbacks[0].base.edges).toEqual(BASE_FLOW.edges)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)

  await fill.uncheck()
  await expect(panel.getByText(FILL_OFF, { exact: true })).toBeVisible()
  await expect(panel.getByText(FILL_ON, { exact: true })).toHaveCount(0)
  ai.replies.push({ blocked: true })
  await ask(panel, PROMPT)
  await expect.poll(() => ai.fallbacks.length).toBe(2)
  expect(ai.fallbacks[1]).toMatchObject({ fill: false, mode: 'edit', size: 'auto' })
  await expect(panel.getByText(FALLBACK_ERROR, { exact: true })).toHaveCount(2)
  await expect(panel.getByRole('button', { name: 'Tentar de novo', exact: true })).toHaveCount(1)

  await fill.check()
  ai.replies.push({ blocked: true })
  await panel.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
  await expect.poll(() => ai.fallbacks.length).toBe(3)
  expect(ai.fallbacks[2]).toMatchObject({ fill: true, mode: 'edit', prompt: PROMPT })
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  expect(await saved(page)).toEqual(BASE_STATE)
  expect(ai.calls.every((call) => !JSON.stringify(call.body).includes(KEY))).toBe(true)
})

test('a key typed in Gerar com IA is reused by the Copiloto and a missing key keeps the request', async ({ page, ai }) => {
  await openEditor(page)
  let panel = await openCopilot(page)
  await composer(panel).fill(PROMPT)
  await panel.getByRole('button', { name: 'Configurar IA', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Configurar IA', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText('Chave não informada', { exact: true })).toBeVisible()
  await composer(panel).press('Enter')
  await expect(panel.getByRole('button', { name: 'Configurar IA', exact: true })).toHaveAttribute('aria-expanded', 'true')
  const key = panel.getByLabel('Chave da API da OpenAI')
  await expect(key).toBeFocused()
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(panel.getByText('Informe a chave da API da OpenAI.', { exact: true })).toBeVisible()
  await expect(composer(panel)).toHaveValue(PROMPT)
  expect(ai.calls).toEqual([])
  await trigger(page).click()
  await expect(panel).toBeHidden()

  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Chave da API da OpenAI').fill(KEY)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  panel = await openCopilot(page)
  const settings = panel.getByRole('button', { name: 'Configurar IA', exact: true })
  if ((await settings.getAttribute('aria-expanded')) === 'true') await settings.click()
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText('Chave não informada', { exact: true })).toHaveCount(0)
  await settings.click()
  await expect(panel.getByLabel('Chave da API da OpenAI')).toHaveValue(KEY)
  await expect(panel.getByText('Informe a chave da API da OpenAI.', { exact: true })).toHaveCount(0)
  await settings.click()
  await expect(composer(panel)).toHaveValue(PROMPT)
  await composer(panel).press('Enter')
  await proposal(panel)
  expect(ai.calls).toHaveLength(1)
  expect(ai.calls[0].headers.authorization).toBe(`Bearer ${KEY}`)
})
