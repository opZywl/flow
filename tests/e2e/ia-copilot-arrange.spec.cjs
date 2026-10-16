require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow, maxNumericId, newNode } = require('../../lib/atendimento/format.ts')
const { NOTE_TYPE, START_ID } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { arrangeFlow } = require('../../lib/atendimento/ai/arrange.ts')
const { INTERVIEW_SCHEMA_NAME, copilotSystemPrompt } = require('../../lib/atendimento/ai/interview.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const DISCARDED = 'Proposta descartada. O fluxo aberto não mudou.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const EDIT_BANNER = 'Editando com IA. As mudanças aparecem aqui conforme chegam.'
const PLACEHOLDER = 'O que você quer mudar no fluxo?'
const REFINE_PLACEHOLDER = 'Peça um ajuste nesta proposta'
const ARRANGED_TITLE = 'Organização pronta'
const ARRANGE_LOST = 'Qual formato você quer para o fluxo? Por exemplo: em L, em coluna ou como uma casa.'
const ARRANGE_SECTION = '# Organização no canvas'
const movedLabel = (count) => `${count} ${count === 1 ? 'componente movido' : 'componentes movidos'}`
const arrangedSummary = (count) => `Organização pronta no canvas: ${movedLabel(count)}.`

const WELCOME_TEXT = 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.'
const HOURS_TEXT = 'Atendemos de segunda a sexta, das 8h às 18h.'
const FAREWELL_TEXT = 'Obrigado pelo contato. Até logo.'
const NOTE_TEXT = 'Conferir o horário do feriado com a recepção.'

const SOURCE = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, horário, menu, recepção e despedida',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: WELCOME_TEXT }] },
    { id: 'horario', type: 'envio_pergunta', config: [{ key: 'template', value: HOURS_TEXT }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Falar com a recepção' }, { text: 'Encerrar' }]) }] },
    { id: 'recepcao', type: 'departamentos', config: [{ key: 'name', value: 'Recepção' }, { key: 'departamento', value: 'recepcao' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: FAREWELL_TEXT }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'horario' },
    { from: 'horario', output: '', to: 'menu' },
    { from: 'menu', output: 'Falar com a recepção', to: 'recepcao' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const assembled = (source) => importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(source, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))

const BASE_FLOW = (() => {
  const flow = JSON.parse(JSON.stringify(assembled(SOURCE)))
  const note = newNode(NOTE_TYPE, { x: 700, y: 420 }, String(maxNumericId(flow.nodes.map((node) => node.id)) + 1))
  note.data.data.text = NOTE_TEXT
  flow.nodes.push(note)
  return importFlow(JSON.parse(JSON.stringify(flow)))
})()
const NOTE = BASE_FLOW.nodes.find((node) => node.data.type === NOTE_TYPE).id
const COMPONENTS = BASE_FLOW.nodes.filter((node) => node.data.type !== NOTE_TYPE).map((node) => node.id)

const handleIndex = (edge) => Number(/^output-(\d+)$/.exec(edge.sourceHandle)?.[1] ?? Number.MAX_SAFE_INTEGER)

function pathFrom(flow) {
  const order = [START_ID]
  for (const id of order) {
    const next = flow.edges.filter((edge) => edge.source === id).sort((first, second) => handleIndex(first) - handleIndex(second))
    for (const edge of next) if (!order.includes(edge.target)) order.push(edge.target)
  }
  return order
}

const PATH = pathFrom(BASE_FLOW)
const DOWN = PATH.slice(0, 4)
const ACROSS = PATH.slice(DOWN.length - 1)
const L_LAYOUT = PATH.map((id, index) => (index < DOWN.length ? { id, col: 0, row: index } : { id, col: index - DOWN.length + 1, row: DOWN.length - 1 }))
const ARRANGED = arrangeFlow(BASE_FLOW, L_LAYOUT)
const MOVED = ARRANGED.moved.length

const REQUEST = 'organize o fluxo em L'
const AGAIN = 'organize o fluxo em L de novo'
const ANSWER = 'Em L, começando pelo Início'
const ARRANGE_TURN = {
  message: 'Vou organizar o fluxo em L: o Início no alto de uma coluna que desce até o menu, e a última linha segue para a direita até o fim do atendimento.',
  suggestions: [],
  action: 'arrange',
  plan: '',
  pick: null,
  adds: false,
  after: '',
  layout: L_LAYOUT,
}
const LOST_TURN = {
  message: 'Vou organizar o fluxo em L.',
  suggestions: [],
  action: 'arrange',
  plan: '',
  pick: null,
  adds: false,
  after: '',
  layout: SOURCE.nodes.map((node, index) => (index < 3 ? { id: node.id, col: 0, row: index + 1 } : { id: node.id, col: index - 2, row: 3 })),
}

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
  for (const step of steps) body.push(...pieces(step).map((piece) => event({ type: 'response.output_text.delta', item_id: 'msg_1', delta: piece })))
  return [
    ...body,
    event({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } }),
    event({ type: 'response.completed', response: { incomplete_details: null, usage: { input_tokens: 11, output_tokens: 22 } } }),
  ]
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
    response.write(step)
    await sleep(20)
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
    const ids = []
    const ai = {
      calls: [],
      turns: [],
      builds: [],
      fallbacks: [],
      unexpected: [],
      say(turn) {
        ai.turns.push({ steps: [JSON.stringify(turn)] })
      },
      turnCalls: () => ai.calls.filter((call) => call.kind === 'turn'),
      buildCalls: () => ai.calls.filter((call) => call.kind === 'build'),
    }
    await page.route((url) => url.hostname === HOST, async (route) => {
      const request = route.request()
      const body = request.postDataJSON()
      const kind = body?.text?.format?.name === INTERVIEW_SCHEMA_NAME ? 'turn' : 'build'
      ai.calls.push({ kind, url: request.url(), body, headers: request.headers() })
      const reply = kind === 'turn' ? ai.turns.shift() : ai.builds.shift()
      if (!reply) {
        ai.unexpected.push(kind)
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Resposta não prevista no teste.', type: 'invalid_request_error' } }) })
      }
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
    for (const id of ids) server.sessions.delete(id)
    expect(ai.unexpected, 'chamadas ao provedor sem resposta prevista').toEqual([])
    expect(ai.calls.every((call) => !JSON.stringify(call.body).includes(KEY)), 'a chave não vai no corpo da requisição').toBe(true)
  },
})

test.use({ ignoreHTTPSErrors: true })

const trigger = (page) => page.locator('[data-copilot-trigger]')
const copilot = (page) => page.getByRole('region', { name: 'Copiloto', exact: true })
const conversation = (panel) => panel.getByRole('log', { name: 'Conversa com o Copiloto' })
const messages = (panel) => conversation(panel).locator(':scope > div.flex > p, :scope > p')
const composer = (panel) => panel.getByLabel('O que você quer mudar no fluxo', { exact: true })
const applyButton = (panel) => panel.getByRole('button', { name: 'Aplicar', exact: true })
const discardButton = (panel) => panel.getByRole('button', { name: 'Descartar', exact: true })
const arrangedCards = (panel) => panel.getByRole('heading', { name: ARRANGED_TITLE, exact: true })
const changesOf = (panel, index = 0) => panel.getByRole('list', { name: 'Mudanças no fluxo aberto' }).nth(index).getByRole('listitem')
const undoButton = (page) => page.getByRole('button', { name: 'Desfazer', exact: true })
const saveButton = (page) => page.getByRole('button', { name: 'Salvar', exact: true })
const nodes = (page) => page.locator('.react-flow__node')
const edges = (page) => page.locator('.react-flow__edge')
const you = (text) => `Você: ${text}`
const says = (turn) => `Copiloto: ${typeof turn === 'string' ? turn : turn.message}`
const inputOf = (call) => JSON.stringify(call.body.input)
const historyOf = (call) => JSON.stringify(call.body.input.filter((entry) => entry.role === 'user' || entry.role === 'assistant'))
const partText = (content) => (typeof content === 'string' ? content : content.map((part) => part.text ?? '').join(''))
const systemOf = (call) => call.body.input.filter((entry) => entry.role === 'developer' || entry.role === 'system').map((entry) => partText(entry.content))
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const shapeOf = (flow) => flow.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))
const placesOf = (flow) => Object.fromEntries(flow.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]))
const ascending = (values) => values.every((value, index) => index === 0 || value > values[index - 1])

const places = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map((node) => {
  const { e: x, f: y } = new DOMMatrixReadOnly(getComputedStyle(node).transform)
  return [node.getAttribute('data-id'), { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }]
})))

const viewOf = (page) => page.locator('.react-flow__viewport').evaluate((element) => {
  const { a: zoom, e: x, f: y } = new DOMMatrixReadOnly(getComputedStyle(element).transform)
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, zoom: Math.round(zoom * 1000) / 1000 }
})

const allInside = (page) => page.evaluate(() => {
  const area = document.querySelector('.react-flow').getBoundingClientRect()
  return [...document.querySelectorAll('.react-flow__node')].every((node) => {
    const box = node.getBoundingClientRect()
    return box.left >= area.left && box.top >= area.top && box.right <= area.right && box.bottom <= area.bottom
  })
})

async function settle(page) {
  let last = null
  await expect.poll(async () => {
    const now = await page.locator('.react-flow__viewport').evaluate((element) => element.style.transform)
    const steady = now === last
    last = now
    return steady
  }, { intervals: [150] }).toBe(true)
}

async function expectFramed(page) {
  await expect(async () => {
    await settle(page)
    expect(await allInside(page)).toBe(true)
  }, 'a câmera enquadra o fluxo organizado inteiro, como em qualquer proposta').toPass({ timeout: 10000 })
}

function expectL(shown) {
  const column = DOWN.map((id) => shown[id])
  const row = ACROSS.map((id) => shown[id])
  const path = PATH.map((id) => shown[id])
  expect(new Set(column.map((point) => point.x)).size, 'a coluna do L fica alinhada').toBe(1)
  expect(ascending(column.map((point) => point.y)), 'a coluna desce a partir do Início seguindo o caminho').toBe(true)
  expect(new Set(row.map((point) => point.y)).size, 'a última linha do L fica alinhada').toBe(1)
  expect(ascending(row.map((point) => point.x)), 'a última linha segue para a direita seguindo o caminho').toBe(true)
  expect(Math.max(...path.map((point) => point.y)), 'a linha que vai para a direita é a de baixo').toBe(row[0].y)
  expect(Math.min(...path.map((point) => point.x)), 'a coluna fica à esquerda').toBe(column[0].x)
  expect(Math.min(...path.map((point) => point.y)), 'o Início fica no alto da coluna').toBe(shown[START_ID].y)
}

async function start(page) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect.poll(() => places(page), { message: 'o canvas abre o fluxo nas posições do arquivo' }).toEqual(placesOf(BASE_FLOW))
  await trigger(page).click()
  const panel = copilot(page)
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  const settings = panel.getByRole('button', { name: 'Configurar IA', exact: true })
  if ((await settings.getAttribute('aria-expanded')) !== 'true') await settings.click()
  await panel.getByLabel('Chave da API da OpenAI').fill(KEY)
  return panel
}

async function ask(panel, text) {
  const input = composer(panel)
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

test('organize o fluxo em L: the turn answers arrange, the canvas previews a column going down and then a row going right without any edit request, Aplicar saves only the positions in one undoable step and a second run with Descartar leaves the canvas as it was', async ({ page, ai }) => {
  expect([...PATH].sort(), 'o caminho a partir do Início passa por todos os componentes').toEqual([...COMPONENTS].sort())
  expect([...ARRANGED.moved].sort(), 'o Início já está no canto de cima, então só os outros componentes se movem').toEqual(PATH.slice(1).sort())
  expect(MOVED).toBeGreaterThan(1)
  expect(ARRANGED.flow.edges).toEqual(BASE_FLOW.edges)
  const before = placesOf(BASE_FLOW)
  const panel = await start(page)
  const undo = undoButton(page)
  expect(new Set(DOWN.map((id) => before[id].x)).size, 'antes do pedido o fluxo ainda não está em L').toBeGreaterThan(1)
  await expect(undo).toBeDisabled()

  ai.say(ARRANGE_TURN)
  await ask(panel, REQUEST)
  await expect(arrangedCards(panel)).toHaveCount(1, { timeout: 15000 })
  await expect(changesOf(panel), 'o cartão mostra só quantos componentes mudaram de lugar').toHaveText([movedLabel(MOVED)])
  await expect(messages(panel)).toHaveText([you(REQUEST), says(ARRANGE_TURN)])
  await expect(panel.getByRole('heading', { name: /^Edição/ })).toHaveCount(0)
  await expect(panel.getByText(/Componentes removidos/)).toHaveCount(0)
  await expect(applyButton(panel)).toBeEnabled()
  await expect(discardButton(panel)).toBeEnabled()
  await expect(composer(panel)).toHaveAttribute('placeholder', REFINE_PLACEHOLDER)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(saveButton(page), 'a prévia trava o canvas como qualquer proposta').toBeDisabled()
  await expect.poll(() => places(page), { message: 'o canvas mostra as posições da organização' }).toEqual(placesOf(ARRANGED.flow))
  const shown = await places(page)
  expectL(shown)
  expect(shown[NOTE], 'a nota fica onde estava').toEqual(before[NOTE])
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect(edges(page)).toHaveCount(BASE_FLOW.edges.length)
  await expectFramed(page)

  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls(), 'a organização sai do turno, sem pedido de edição').toHaveLength(0)
  expect(ai.fallbacks).toEqual([])
  const turn = ai.turnCalls()[0]
  expect(turn.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(historyOf(turn)).toContain(REQUEST)
  for (const id of PATH) expect(inputOf(turn), `o resumo do fluxo traz o ID ${id}`).toContain(`- ${id} (`)
  const [prompt] = systemOf(turn)
  expect(prompt).toBe(copilotSystemPrompt())
  expect(prompt).toContain(ARRANGE_SECTION)
  const format = turn.body.text.format
  expect(format).toMatchObject({ type: 'json_schema', strict: true, name: INTERVIEW_SCHEMA_NAME })
  expect(format.schema.required).toEqual(expect.arrayContaining(['message', 'suggestions', 'action', 'plan', 'pick', 'adds', 'after', 'layout']))
  expect(format.schema.properties.action.enum).toContain('arrange')
  expect(format.schema.properties.layout).toMatchObject({ type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, col: { type: 'integer' }, row: { type: 'integer' } } } })
  expect(format.schema.properties.layout.items.required).toEqual(expect.arrayContaining(['id', 'col', 'row']))
  expect(shapeOf(await stored(page)), 'a prévia não salva nada').toEqual(shapeOf(BASE_FLOW))

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(REQUEST), says(ARRANGE_TURN), APPLIED, says(FOLLOW_UP)])
  await expect(panel.getByText('Aplicada', { exact: true })).toBeVisible()
  await expect(applyButton(panel)).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(composer(panel)).toHaveAttribute('placeholder', PLACEHOLDER)
  await expect(saveButton(page)).toBeEnabled()
  await expect.poll(async () => shapeOf(await stored(page)), { message: 'Aplicar salva as posições da organização' }).toEqual(shapeOf(ARRANGED.flow))
  const after = await stored(page)
  expect(after.name).toBe(BASE_FLOW.name)
  expect(after.edges, 'as conexões continuam as mesmas').toEqual(BASE_FLOW.edges)
  await expect.poll(() => places(page), { message: 'o canvas fica com o fluxo organizado' }).toEqual(placesOf(ARRANGED.flow))
  await expect(undo).toBeEnabled()

  await undo.click()
  await expect.poll(() => places(page), { message: 'Desfazer devolve as posições anteriores' }).toEqual(before)
  await expect.poll(async () => shapeOf(await stored(page))).toEqual(shapeOf(BASE_FLOW))
  expect((await stored(page)).edges).toEqual(BASE_FLOW.edges)
  await expect(undo, 'Aplicar entra como um só passo no histórico').toBeDisabled()

  await settle(page)
  const view = await viewOf(page)
  ai.say(ARRANGE_TURN)
  await ask(panel, AGAIN)
  await expect(arrangedCards(panel)).toHaveCount(2, { timeout: 15000 })
  await expect(changesOf(panel, 1)).toHaveText([movedLabel(MOVED)])
  await expect(applyButton(panel)).toBeEnabled()
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect.poll(() => places(page), { message: 'a segunda organização aparece no canvas' }).toEqual(placesOf(ARRANGED.flow))
  expect(ai.turnCalls()).toHaveLength(2)
  const again = historyOf(ai.turnCalls()[1])
  expect(again, 'o pedido seguinte sabe da organização aplicada').toContain(arrangedSummary(MOVED))
  expect(again).toContain(APPLIED)
  expect(again).toContain(AGAIN)
  expect(ai.buildCalls()).toHaveLength(0)

  await discardButton(panel).click()
  await expect(panel.getByText(DISCARDED, { exact: true })).toBeVisible()
  await expect(panel.getByText('Descartada', { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(REQUEST), says(ARRANGE_TURN), APPLIED, says(FOLLOW_UP), you(AGAIN), says(ARRANGE_TURN), DISCARDED])
  await expect(applyButton(panel)).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(composer(panel)).toHaveAttribute('placeholder', PLACEHOLDER)
  await expect.poll(() => places(page), { message: 'Descartar devolve o canvas como estava' }).toEqual(before)
  await expect.poll(() => viewOf(page), { message: 'a câmera volta para onde estava' }).toEqual(view)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect(edges(page)).toHaveCount(BASE_FLOW.edges.length)
  await expect(saveButton(page)).toBeEnabled()
  await expect(undo).toBeDisabled()
  const kept = await stored(page)
  expect(shapeOf(kept)).toEqual(shapeOf(BASE_FLOW))
  expect(kept.edges).toEqual(BASE_FLOW.edges)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(ai.fallbacks).toEqual([])
})

test('an arrange answer that only names IDs outside the flow becomes the question about the shape, moves nothing, and the next answer arranges the flow', async ({ page, ai }) => {
  for (const cell of LOST_TURN.layout) expect(COMPONENTS, `${cell.id} não é ID do fluxo`).not.toContain(cell.id)
  const before = placesOf(BASE_FLOW)
  const panel = await start(page)
  ai.say(LOST_TURN)
  await ask(panel, REQUEST)

  await expect(messages(panel)).toHaveText([you(REQUEST), says(ARRANGE_LOST)])
  await expect(arrangedCards(panel)).toHaveCount(0)
  await expect(applyButton(panel)).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(composer(panel)).toHaveAttribute('placeholder', PLACEHOLDER)
  await expect(saveButton(page)).toBeEnabled()
  expect(await places(page), 'nenhum componente sai do lugar').toEqual(before)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(ai.fallbacks).toEqual([])
  expect(shapeOf(await stored(page))).toEqual(shapeOf(BASE_FLOW))

  ai.say(ARRANGE_TURN)
  await ask(panel, ANSWER)
  await expect(arrangedCards(panel)).toHaveCount(1, { timeout: 15000 })
  await expect(changesOf(panel)).toHaveText([movedLabel(MOVED)])
  await expect(messages(panel)).toHaveText([you(REQUEST), says(ARRANGE_LOST), you(ANSWER), says(ARRANGE_TURN)])
  await expect.poll(() => places(page), { message: 'a resposta seguinte organiza o fluxo em L' }).toEqual(placesOf(ARRANGED.flow))
  expectL(await places(page))
  expect(ai.turnCalls()).toHaveLength(2)
  const second = historyOf(ai.turnCalls()[1])
  expect(second, 'a pergunta sobre o formato vai no histórico').toContain(ARRANGE_LOST)
  expect(second).toContain(ANSWER)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(ai.fallbacks).toEqual([])
  expect(shapeOf(await stored(page))).toEqual(shapeOf(BASE_FLOW))
})
