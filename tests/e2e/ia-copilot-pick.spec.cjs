require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow } = require('../../lib/atendimento/format.ts')
const { getComponentLabel } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { countChanges, flowToRi } = require('../../lib/atendimento/ai/edit.ts')
const { INTERVIEW_SCHEMA_NAME } = require('../../lib/atendimento/ai/interview.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const FULL_REQUEST = 'Ver o pedido completo'
const PICK_CANCELLED = 'Seleção cancelada. Você pode responder por texto.'
const PICKED = 'Selecionei no canvas'
const MENU_LABEL = 'o menu de opções'
const MESSAGE_LABEL = 'a mensagem'
const MENU_KIND = getComponentLabel('envio_mensagem')
const MESSAGE_KIND = getComponentLabel('envio_pergunta')
const CONFIG = 'Configuração do componente'

const MAIN_TITLE = 'Como podemos ajudar?'
const FINANCE_TITLE = 'Financeiro: escolha uma opção'
const WELCOME_TEXT = 'Olá, #NAME. Você está no atendimento da Loja Exemplo.'
const PAYMENTS_TEXT = 'Os pagamentos são confirmados em até 2 dias úteis.'
const INVOICES_TEXT = 'As notas fiscais ficam em https://notas.exemplo.com.br.'
const FAREWELL_TEXT = 'Obrigado pelo contato. Até logo.'
const NEW_OPTION = 'Segunda via'
const BOLETO_TEXT = 'Acesse a segunda via em https://boletos.exemplo.com.br.'
const NOTICE_TEXT = 'Aviso: a confirmação chega por e-mail em até 2 dias úteis.'

const SOURCE = {
  name: 'Atendimento Loja Exemplo',
  description: 'Menu principal, menu do financeiro e mensagens',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: WELCOME_TEXT }] },
    { id: 'menu_principal', type: 'envio_mensagem', config: [{ key: 'title', value: MAIN_TITLE }, { key: 'options', value: JSON.stringify([{ text: 'Financeiro' }, { text: 'Encerrar' }]) }] },
    { id: 'menu_financeiro', type: 'envio_mensagem', config: [{ key: 'title', value: FINANCE_TITLE }, { key: 'options', value: JSON.stringify([{ text: 'Pagamentos' }, { text: 'Notas fiscais' }]) }] },
    { id: 'pagamentos', type: 'envio_pergunta', config: [{ key: 'template', value: PAYMENTS_TEXT }] },
    { id: 'notas', type: 'envio_pergunta', config: [{ key: 'template', value: INVOICES_TEXT }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: FAREWELL_TEXT }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu_principal' },
    { from: 'menu_principal', output: 'Financeiro', to: 'menu_financeiro' },
    { from: 'menu_principal', output: 'Encerrar', to: 'despedida' },
    { from: 'menu_financeiro', output: 'Pagamentos', to: 'pagamentos' },
    { from: 'menu_financeiro', output: 'Notas fiscais', to: 'notas' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const assembled = (source) => importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(source, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))
const idOf = (flow, text) => flowToRi(flow).nodes.find((node) => node.config.some((entry) => entry.value === text)).id
const idsOf = (flow) => flow.nodes.map((node) => node.id)

const BASE_FLOW = assembled(SOURCE)
const BASE_STATE = { name: BASE_FLOW.name, nodes: idsOf(BASE_FLOW) }
const NODE_IDS = BASE_STATE.nodes
const MAIN_MENU = idOf(BASE_FLOW, MAIN_TITLE)
const FINANCE_MENU = idOf(BASE_FLOW, FINANCE_TITLE)
const WELCOME = idOf(BASE_FLOW, WELCOME_TEXT)
const PAYMENTS = idOf(BASE_FLOW, PAYMENTS_TEXT)
const INVOICES = idOf(BASE_FLOW, INVOICES_TEXT)
const FAREWELL = idOf(BASE_FLOW, FAREWELL_TEXT)
const MENUS = [MAIN_MENU, FINANCE_MENU]
const MESSAGES = [WELCOME, PAYMENTS, INVOICES, FAREWELL]
const SNIPPETS = {
  [MAIN_MENU]: 'Como podemos ajudar',
  [FINANCE_MENU]: 'Financeiro: escolha',
  [WELCOME]: 'Olá, #NAME',
  [PAYMENTS]: 'Os pagamentos',
  [INVOICES]: 'As notas fiscais',
  [FAREWELL]: 'Obrigado pelo contato',
}

const OPTION_REQUEST = 'crie a opção Segunda via'
const OPTION_DRAFT = 'Acrescente a opção Segunda via, que envia o link https://boletos.exemplo.com.br e encerra o atendimento, no menu de opções que o usuário escolher.'
const OPTION_PLAN = `No menu ${FINANCE_TITLE}, ID ${FINANCE_MENU}, acrescente a opção Segunda via, que envia o link https://boletos.exemplo.com.br e encerra o atendimento.`
const ASK_MENU = {
  message: 'O fluxo tem dois menus de opções. Selecione no canvas o menu em que a opção Segunda via entra.',
  suggestions: [],
  action: 'ask',
  plan: OPTION_DRAFT,
  pick: { label: MENU_LABEL, candidates: MENUS },
}
const EDIT_OPTION = { message: 'Vou acrescentar a opção Segunda via no menu Financeiro.', suggestions: [], action: 'edit', plan: OPTION_PLAN, pick: null }
const MENU_ANSWER = 'No menu Financeiro'
const ASK_TEXT = {
  message: 'A opção Segunda via entra no fim do menu Financeiro e envia o link do boleto. Fica assim ou quer outro texto?',
  suggestions: ['Pode ser assim', 'Quero outro texto'],
  action: 'ask',
  plan: OPTION_PLAN,
  pick: null,
}

const NOTICE_REQUEST = 'crie uma mensagem de aviso atrás do Enviar Mensagem'
const NOTICE_DRAFT = `Acrescente a mensagem ${NOTICE_TEXT} logo depois da mensagem que o usuário escolher, e o caminho segue como antes.`
const NOTICE_PLAN = `Depois do Enviar Mensagem ${PAYMENTS_TEXT} ID ${PAYMENTS}, acrescente a mensagem ${NOTICE_TEXT} O caminho segue para o encerramento como antes.`
const ASK_MESSAGE = {
  message: 'O fluxo tem quatro mensagens. Selecione no canvas a mensagem que vem antes do aviso.',
  suggestions: [],
  action: 'ask',
  plan: NOTICE_DRAFT,
  pick: { label: MESSAGE_LABEL, candidates: MESSAGES },
}
const EDIT_NOTICE = { message: 'Vou colocar o aviso logo depois da mensagem dos pagamentos.', suggestions: [], action: 'edit', plan: NOTICE_PLAN, pick: null }

const CHANGE_REQUEST = 'troque o texto da mensagem'
const MESSAGE_ANSWER = 'A mensagem de despedida'
const ASK_FAREWELL = {
  message: 'Qual texto você quer na mensagem de despedida?',
  suggestions: ['Obrigado, até a próxima', 'Volte sempre'],
  action: 'ask',
  plan: 'Troque o texto da mensagem de despedida.',
  pick: null,
}

const MAIN_REQUEST = 'crie a opção Segunda via no menu principal'
const MAIN_PLAN = `No menu ${MAIN_TITLE} ID ${MAIN_MENU}, acrescente a opção Segunda via, que envia o link https://boletos.exemplo.com.br e encerra o atendimento.`
const EDIT_MAIN = { message: 'Vou acrescentar a opção Segunda via no menu principal.', suggestions: [], action: 'edit', plan: MAIN_PLAN, pick: null }
const REFINE_REQUEST = 'coloque um aviso atrás do Enviar Mensagem'

function optionDelta(flow, menuId) {
  const ri = flowToRi(flow)
  const menu = ri.nodes.find((node) => node.id === menuId)
  return {
    name: '',
    description: '',
    nodes: [
      {
        id: menu.id,
        type: 'envio_mensagem',
        config: menu.config.map((entry) => (entry.key === 'options' ? { key: 'options', value: JSON.stringify([...JSON.parse(entry.value), { text: NEW_OPTION }]) } : entry)),
      },
      { id: 'boleto', type: 'envio_pergunta', config: [{ key: 'template', value: BOLETO_TEXT }] },
      { id: 'fim_boleto', type: 'finalizar', config: [] },
    ],
    edges: [
      ...ri.edges.filter((edge) => edge.from === menu.id),
      { from: menu.id, output: NEW_OPTION, to: 'boleto' },
      { from: 'boleto', output: '', to: 'fim_boleto' },
    ],
  }
}

function noticeDelta(flow, afterId) {
  const next = flowToRi(flow).edges.filter((edge) => edge.from === afterId)
  return {
    name: '',
    description: '',
    nodes: [{ id: 'aviso', type: 'envio_pergunta', config: [{ key: 'template', value: NOTICE_TEXT }] }],
    edges: [{ from: afterId, output: '', to: 'aviso' }, ...next.map((edge) => ({ from: 'aviso', output: '', to: edge.to }))],
  }
}

const OPTION_TEXT = JSON.stringify(optionDelta(BASE_FLOW, FINANCE_MENU))
const NOTICE_DELTA = JSON.stringify(noticeDelta(BASE_FLOW, PAYMENTS))
const MAIN_TEXT = JSON.stringify(optionDelta(BASE_FLOW, MAIN_MENU))

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

function once(make) {
  let value
  return () => (value ??= make())
}

const expectedOption = once(() => engineEdit(BASE_FLOW, OPTION_TEXT, OPTION_PLAN))
const expectedNotice = once(() => engineEdit(BASE_FLOW, NOTICE_DELTA, NOTICE_PLAN))
const expectedMain = once(() => engineEdit(BASE_FLOW, MAIN_TEXT, MAIN_PLAN))

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
const chips = (panel) => panel.getByRole('group', { name: 'Sugestões de resposta' }).getByRole('button')
const composer = (panel) => panel.getByLabel('O que você quer mudar no fluxo', { exact: true })
const you = (text) => `Você: ${text}`
const says = (turn) => `Copiloto: ${typeof turn === 'string' ? turn : turn.message}`
const inputOf = (call) => JSON.stringify(call.body.input)
const historyOf = (call) => JSON.stringify(call.body.input.filter((entry) => entry.role === 'user' || entry.role === 'assistant'))
const partText = (content) => (typeof content === 'string' ? content : content.map((part) => part.text ?? '').join(''))
const lastUser = (call) => partText(call.body.input.filter((entry) => entry.role === 'user').at(-1).content)
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: idsOf(flow) }
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pickedText = (kind, snippet, id) => `Selecionei no canvas: ${escape(kind)}\\b.*${escape(snippet)}.* · ID ${escape(id)}\\b`
const picked = (kind, snippet, id) => new RegExp(`^${pickedText(kind, snippet, id)}`)
const youPicked = (kind, snippet, id) => new RegExp(`^Você: ${pickedText(kind, snippet, id)}`)
const labels = ({ added, changed, removed }) => [
  `${added} ${added === 1 ? 'componente novo' : 'componentes novos'}`,
  `${changed} ${changed === 1 ? 'alterado' : 'alterados'}`,
  `${removed} ${removed === 1 ? 'removido' : 'removidos'}`,
]

const canvas = (page) => page.locator('.react-flow')
const nodes = (page) => page.locator('.react-flow__node')
const nodeAt = (page, id) => page.locator(`.react-flow__node[data-id="${id}"]`)
const markOf = (page, id) => page.locator(`.react-flow__node[data-id="${id}"][data-pick], .react-flow__node[data-id="${id}"] [data-pick]`).first()
const marked = (page) => page.locator('.react-flow [data-pick="candidate"], .react-flow [data-pick="dimmed"], .react-flow [data-pick="selected"]')
const banner = (page) => page.getByRole('region', { name: 'Seleção no canvas', exact: true })
const bannerButton = (page, name) => banner(page).getByRole('button', { name, exact: true })
const bannerStatus = (page) => banner(page).getByRole('status')
const HINT = 'Clique em um dos componentes destacados.'
const selection = (panel) => panel.getByRole('region', { name: 'Seleção do componente', exact: true })
const confirmChoice = (panel) => selection(panel).getByRole('button', { name: 'Confirmar seleção', exact: true })
const removeButtons = (page) => page.getByRole('button', { name: /^Remover .+, ID \S+$/ })
const transformOf = (page, id) => nodeAt(page, id).evaluate((element) => element.style.transform)
const marks = (ids, mark) => Object.fromEntries(ids.map((id) => [id, mark]))

function choice(panel, id, snippet) {
  const buttons = selection(panel).getByRole('button')
  const reference = new RegExp(`\\bID ${escape(id)}\\b`)
  return buttons.filter({ hasText: reference }).or(buttons.filter({ hasText: snippet })).or(selection(panel).getByRole('button', { name: reference }))
}

async function expectMarks(page, ids, expected) {
  for (const id of ids) await expect(markOf(page, id), `componente ${id}`).toHaveAttribute('data-pick', expected[id] ?? 'dimmed')
}

async function expectPickOver(page, panel) {
  await expect(banner(page)).toBeHidden()
  await expect(marked(page)).toHaveCount(0)
  await expect(selection(panel)).toBeHidden()
}

async function settle(page) {
  let last = null
  await expect.poll(async () => {
    const now = await page.locator('.react-flow__viewport').evaluate((element) => element.style.transform)
    const steady = now === last
    last = now
    return steady
  }, { intervals: [150] }).toBe(true)
}

const allInside = (page) => page.evaluate(() => {
  const area = document.querySelector('.react-flow').getBoundingClientRect()
  return [...document.querySelectorAll('.react-flow__node')].every((node) => {
    const box = node.getBoundingClientRect()
    return box.left >= area.left && box.top >= area.top && box.right <= area.right && box.bottom <= area.bottom
  })
})

async function fitCanvas(page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Ajustar à tela', exact: true }).click()
    await settle(page)
    expect(await allInside(page)).toBe(true)
  }).toPass({ timeout: 10000 })
}

async function centerOf(page, id) {
  const box = await nodeAt(page, id).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const hitAt = (page, point) => page.evaluate(({ x, y }) => {
  const hit = document.elementFromPoint(x, y)
  if (!hit) return ''
  const node = hit.closest('.react-flow__node')
  if (node) return `componente ${node.getAttribute('data-id')}`
  return hit.classList.contains('react-flow__pane') ? 'canvas' : hit.tagName.toLowerCase()
}, point)

async function throughDimmed(page, ids) {
  for (const id of ids) {
    const point = await centerOf(page, id)
    if ((await hitAt(page, point)) === 'canvas') return { id, point }
  }
  return null
}

async function drag(page, id, dx, dy) {
  const { x, y } = await centerOf(page, id)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

async function watchPicks(page) {
  await page.addInitScript(() => {
    window.__pickSeen = false
    const look = () => {
      if (document.querySelector('[data-pick="candidate"], [data-pick="selected"], [data-pick="dimmed"]')) window.__pickSeen = true
    }
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pick'] })
  })
}

const pickSeen = (page) => page.evaluate(() => window.__pickSeen === true)
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

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

async function start(page, flow = BASE_FLOW) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
  await expect(nodes(page)).toHaveCount(flow.nodes.length)
  await page.getByRole('button', { name: 'Componentes', exact: true }).click()
  await expect(page.getByLabel('Biblioteca de componentes')).toHaveCount(0)
  const panel = await openCopilot(page)
  await typeKey(panel)
  await fitCanvas(page)
  return panel
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

test('crie a opção Segunda via with two menus: the canvas outlines both menus, Confirmar sends the chosen one and the edit lands on that menu', async ({ page, ai }) => {
  const result = await expectedOption()
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })
  const final = result.workflow
  const boleto = idOf(final, BOLETO_TEXT)
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)

  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU)])
  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText(`Selecione ${MENU_LABEL} no canvas.`)
  await expect(bannerStatus(page)).toHaveText(HINT)
  await expect(bannerButton(page, 'Cancelar')).toBeEnabled()
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  for (const id of MENUS) {
    await expect(markOf(page, id), `candidato ${id}`).toHaveAttribute('role', 'button')
    await expect(markOf(page, id), `candidato ${id}`).toHaveAttribute('aria-pressed', 'false')
    await expect(markOf(page, id), `candidato ${id}`).toHaveAttribute('aria-label', new RegExp(`^${escape(MENU_KIND)}, .+, ID ${escape(id)}$`))
  }
  await expect(selection(panel)).toBeVisible()
  await expect(confirmChoice(panel)).toBeDisabled()
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  await settle(page)

  await nodeAt(page, MAIN_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })
  await expect(markOf(page, MAIN_MENU)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${MENU_KIND} · ID ${MAIN_MENU}`)
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await nodeAt(page, FINANCE_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${MENU_KIND} · ID ${FINANCE_MENU}`)
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect(selection(panel).getByRole('button', { pressed: true })).toHaveText(new RegExp(`· ID ${escape(FINANCE_MENU)}$`))
  await expect(confirmChoice(panel)).toBeEnabled()
  expect(ai.turnCalls()).toHaveLength(1)

  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const chosen = youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)
  await expect(messages(panel).nth(2)).toHaveText(chosen)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), chosen, says(EDIT_OPTION)])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(canvas(page)).toContainText(BOLETO_TEXT)
  await expect(nodes(page)).toHaveCount(final.nodes.length)

  expect(ai.turnCalls()).toHaveLength(2)
  const second = ai.turnCalls()[1]
  expect(historyOf(second)).toContain(OPTION_REQUEST)
  expect(historyOf(second)).toContain(ASK_MENU.message)
  expect(historyOf(second)).toContain(PICKED)
  expect(historyOf(second)).toContain(`ID ${FINANCE_MENU}`)
  expect(lastUser(second), 'o turno seguinte recebe o componente selecionado').toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain('# Modo de edição')
  expect(build).toContain(OPTION_PLAN)
  expect(build).not.toContain(PICKED)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(OPTION_PLAN, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), chosen, says(EDIT_OPTION), APPLIED, says(FOLLOW_UP)])
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const after = await stored(page)
  expect(after.edges.some((edge) => edge.source === FINANCE_MENU && edge.target === boleto), 'a opção nova sai do menu selecionado').toBe(true)
  expect(after.edges.some((edge) => edge.source === MAIN_MENU && edge.target === boleto)).toBe(false)
  expect(JSON.stringify(after.nodes.find((node) => node.id === FINANCE_MENU).data)).toContain(NEW_OPTION)
  expect(JSON.stringify(after.nodes.find((node) => node.id === MAIN_MENU).data)).not.toContain(NEW_OPTION)
  await expect(marked(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
})

test('Seleção do componente lists the candidates, stays in sync with the canvas both ways and Confirmar seleção sends the chosen message', async ({ page, ai }) => {
  const result = await expectedNotice()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const after = flowToRi(final).edges.find((edge) => edge.from === notice)
  const candidates = marks(MESSAGES, 'candidate')
  const panel = await start(page)
  ai.say(ASK_MESSAGE)
  await ask(panel, NOTICE_REQUEST)

  await expect(messages(panel)).toHaveText([you(NOTICE_REQUEST), says(ASK_MESSAGE)])
  await expect(banner(page)).toContainText(`Selecione ${MESSAGE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, candidates)
  await expect(selection(panel)).toBeVisible()
  for (const id of MESSAGES) await expect(choice(panel, id, SNIPPETS[id]), `opção do componente ${id} no painel`).toHaveCount(1)
  for (const id of MENUS) await expect(choice(panel, id, SNIPPETS[id]), `componente ${id} fora da seleção`).toHaveCount(0)
  await expect(confirmChoice(panel)).toBeDisabled()
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()

  await choice(panel, PAYMENTS, SNIPPETS[PAYMENTS]).click()
  await expect(choice(panel, PAYMENTS, SNIPPETS[PAYMENTS])).toHaveAttribute('aria-pressed', 'true')
  await expectMarks(page, NODE_IDS, { ...candidates, [PAYMENTS]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${MESSAGE_KIND} · ID ${PAYMENTS}`)
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect(confirmChoice(panel)).toBeEnabled()

  await settle(page)
  await nodeAt(page, INVOICES).click()
  await expectMarks(page, NODE_IDS, { ...candidates, [INVOICES]: 'selected' })
  await expect(choice(panel, INVOICES, SNIPPETS[INVOICES])).toHaveAttribute('aria-pressed', 'true')
  await expect(choice(panel, PAYMENTS, SNIPPETS[PAYMENTS])).toHaveAttribute('aria-pressed', 'false')
  await expect(confirmChoice(panel)).toBeEnabled()

  await choice(panel, PAYMENTS, SNIPPETS[PAYMENTS]).click()
  await expectMarks(page, NODE_IDS, { ...candidates, [PAYMENTS]: 'selected' })
  await expect(banner(page)).toBeVisible()
  expect(ai.turnCalls()).toHaveLength(1)

  ai.say(EDIT_NOTICE)
  ai.builds.push({ steps: [NOTICE_DELTA] })
  await confirmChoice(panel).click()
  await expectPickOver(page, panel)
  const sent = youPicked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(NOTICE_REQUEST), says(ASK_MESSAGE), sent, says(EDIT_NOTICE)])
  await expect(canvas(page)).toContainText(NOTICE_TEXT)

  expect(ai.turnCalls()).toHaveLength(2)
  const second = ai.turnCalls()[1]
  expect(historyOf(second)).toContain(PICKED)
  expect(historyOf(second)).toContain(`ID ${PAYMENTS}`)
  expect(lastUser(second)).toMatch(picked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(lastUser(second)).not.toMatch(new RegExp(`\\bID ${escape(INVOICES)}\\b`))
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(NOTICE_PLAN)
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.some((edge) => edge.source === PAYMENTS && edge.target === notice), 'o aviso entra logo depois da mensagem selecionada').toBe(true)
  expect(applied.edges.some((edge) => edge.source === notice && edge.target === after.to)).toBe(true)
  expect(applied.edges.some((edge) => edge.source === INVOICES && edge.target === notice)).toBe(false)
})

test('Cancelar and Esc leave pick mode with a note so the answer can be typed, and typing while picking also leaves it with a normal turn', async ({ page, ai }) => {
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await expect(selection(panel)).toBeVisible()

  await bannerButton(page, 'Cancelar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), PICK_CANCELLED])
  await expect(composer(panel)).toBeFocused()
  expect(ai.turnCalls()).toHaveLength(1)

  ai.say(ASK_TEXT)
  await ask(panel, MENU_ANSWER)
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), PICK_CANCELLED, you(MENU_ANSWER), says(ASK_TEXT)])
  await expect(chips(panel)).toHaveText(ASK_TEXT.suggestions)
  await expect(banner(page)).toBeHidden()
  await expect(marked(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  const answered = ai.turnCalls()[1]
  expect(lastUser(answered)).toBe(MENU_ANSWER)
  expect(historyOf(answered)).not.toContain(PICKED)

  ai.say(ASK_MESSAGE)
  await ask(panel, NOTICE_REQUEST)
  await expect(banner(page)).toContainText(`Selecione ${MESSAGE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, marks(MESSAGES, 'candidate'))
  await settle(page)
  await nodeAt(page, PAYMENTS).click()
  await expect(markOf(page, PAYMENTS)).toHaveAttribute('data-pick', 'selected')
  await page.keyboard.press('Escape')
  await expectPickOver(page, panel)
  await expect(messages(panel).last()).toHaveText(PICK_CANCELLED)
  await expect(panel.getByText(PICK_CANCELLED, { exact: true })).toHaveCount(2)
  await expect(composer(panel)).toBeFocused()
  expect(ai.turnCalls()).toHaveLength(3)

  ai.say(ASK_MESSAGE)
  await ask(panel, CHANGE_REQUEST)
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, marks(MESSAGES, 'candidate'))
  ai.say(ASK_FAREWELL)
  await ask(panel, MESSAGE_ANSWER)
  await expectPickOver(page, panel)
  await expect(messages(panel).last()).toHaveText(says(ASK_FAREWELL))
  await expect(messages(panel).filter({ hasText: you(MESSAGE_ANSWER) })).toHaveCount(1)
  await expect(chips(panel)).toHaveText(ASK_FAREWELL.suggestions)
  expect(ai.turnCalls()).toHaveLength(5)
  const typed = ai.turnCalls()[4]
  expect(lastUser(typed)).toBe(MESSAGE_ANSWER)
  expect(historyOf(typed)).not.toContain(PICKED)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(await saved(page)).toEqual(BASE_STATE)
})

test('while picking, editing is locked: the config panel closes, candidates do not move, Delete and the remove button remove nothing, and after Cancelar the canvas edits again', async ({ page, ai }) => {
  const panel = await start(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expect(page.getByLabel(CONFIG)).toContainText(`ID ${FINANCE_MENU} ·`)
  await expect(nodeAt(page, FINANCE_MENU)).toHaveClass(/\bselected\b/)

  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await expect(page.getByLabel(CONFIG)).toBeHidden()
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  await expect(removeButtons(page)).toHaveCount(0)
  await settle(page)

  const before = await transformOf(page, FINANCE_MENU)
  await drag(page, FINANCE_MENU, -40, -30)
  await nodeAt(page, MAIN_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })
  expect(await transformOf(page, FINANCE_MENU), 'o candidato arrastado continua no lugar').toBe(before)
  await expect(removeButtons(page)).toHaveCount(0)

  await page.keyboard.press('Delete')
  await page.keyboard.press('Backspace')
  await nodeAt(page, FINANCE_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect(removeButtons(page)).toHaveCount(0)
  expect(await transformOf(page, FINANCE_MENU)).toBe(before)

  await settle(page)
  for (const id of [FAREWELL, PAYMENTS, INVOICES, WELCOME]) {
    const events = await page.locator(`.react-flow__node[data-id="${id}"]`).evaluate((element) => getComputedStyle(element).pointerEvents)
    expect(events, `o componente esmaecido ${id} não recebe clique`).toBe('none')
  }
  const dimmed = await throughDimmed(page, [FAREWELL, PAYMENTS, INVOICES, WELCOME])
  if (dimmed) {
    await page.mouse.click(dimmed.point.x, dimmed.point.y)
    await expect(markOf(page, dimmed.id)).toHaveAttribute('data-pick', 'dimmed')
  }
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${MENU_KIND} · ID ${FINANCE_MENU}`)
  await expect(page.getByLabel(CONFIG)).toBeHidden()

  await markOf(page, MAIN_MENU).focus()
  await page.keyboard.press('Enter')
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })
  await markOf(page, FINANCE_MENU).focus()
  await page.keyboard.press('Space')
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  expect(ai.turnCalls()).toHaveLength(1)

  await bannerButton(page, 'Cancelar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), PICK_CANCELLED])
  await expect.poll(() => saved(page)).toEqual(BASE_STATE)
  const kept = await stored(page)
  for (const node of BASE_FLOW.nodes) expect(kept.nodes.find((item) => item.id === node.id).position, node.id).toEqual(node.position)

  await nodeAt(page, FINANCE_MENU).hover()
  await expect(page.getByRole('button', { name: `Remover ${MENU_KIND}, ID ${FINANCE_MENU}`, exact: true })).toBeVisible()
  await settle(page)
  await drag(page, FINANCE_MENU, -40, -30)
  await expect.poll(() => transformOf(page, FINANCE_MENU), { message: 'fora da seleção, o componente volta a se mover' }).not.toBe(before)
  const origin = BASE_FLOW.nodes.find((node) => node.id === FINANCE_MENU).position
  await expect.poll(async () => (await stored(page)).nodes.find((node) => node.id === FINANCE_MENU).position).not.toEqual(origin)

  await nodeAt(page, MAIN_MENU).click()
  await expect(page.getByLabel(CONFIG)).toContainText(`ID ${MAIN_MENU} ·`)
  await page.keyboard.press('Delete')
  await expect(nodeAt(page, MAIN_MENU)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length - 1)
  await expect(marked(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('a pick with fewer than two valid candidates never enters pick mode and the question shows as a normal message', async ({ page, ai }) => {
  await watchPicks(page)
  const panel = await start(page)
  const answers = [
    [OPTION_REQUEST, { ...ASK_TEXT, pick: { label: MENU_LABEL, candidates: [FINANCE_MENU, 'menu_inexistente'] } }],
    ['Quero outro texto', { message: 'Qual texto você quer na opção nova?', suggestions: ['Segunda via do boleto', 'Boleto atualizado'], action: 'ask', plan: OPTION_PLAN, pick: { label: MENU_LABEL, candidates: [FINANCE_MENU, FINANCE_MENU] } }],
    ['Segunda via do boleto', { message: 'Depois da opção, o link do boleto segue para o encerramento. Fica assim?', suggestions: ['Pode ser assim', 'Quero mudar'], action: 'ask', plan: OPTION_PLAN, pick: { label: MESSAGE_LABEL, candidates: [PAYMENTS] } }],
  ]
  const shown = []
  for (const [answer, turn] of answers) {
    ai.say(turn)
    await ask(panel, answer)
    shown.push(you(answer), says(turn))
    await expect(messages(panel)).toHaveText(shown)
    await expect(chips(panel)).toHaveText(turn.suggestions)
    await frames(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(selection(panel)).toHaveCount(0)
    await expect(marked(page)).toHaveCount(0)
    expect(await pickSeen(page), `sem seleção no canvas depois de ${answer}`).toBe(false)
  }
  expect(ai.turnCalls()).toHaveLength(answers.length)
  expect(ai.buildCalls()).toHaveLength(0)

  ai.say(ASK_MENU)
  await ask(panel, 'Prefiro escolher o menu')
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  expect(await pickSeen(page), 'a observação registra a seleção quando ela acontece').toBe(true)
  await bannerButton(page, 'Cancelar').click()
  await expectPickOver(page, panel)
})

test('with a proposal on the canvas, the pick runs on the preview, a component that only exists in the proposal can be chosen and the adjustment builds on it', async ({ page, ai }) => {
  const first = await expectedMain()
  const boleto = idOf(first.workflow, BOLETO_TEXT)
  expect(NODE_IDS).not.toContain(boleto)
  const shown = idsOf(first.workflow)
  const options = [...MESSAGES, boleto]
  const candidates = marks(options, 'candidate')
  const refinePlan = `Na proposta, depois do Enviar Mensagem ${BOLETO_TEXT} ID ${boleto}, acrescente a mensagem ${NOTICE_TEXT} O caminho segue para o encerramento como antes.`
  const refineText = JSON.stringify(noticeDelta(first.workflow, boleto))
  const second = await engineEdit(first.workflow, refineText, refinePlan)
  const notice = idOf(second.workflow, NOTICE_TEXT)
  const askRefine = {
    message: 'A proposta tem cinco mensagens. Selecione no canvas a mensagem que vem antes do aviso.',
    suggestions: [],
    action: 'ask',
    plan: `Na proposta, acrescente a mensagem ${NOTICE_TEXT} logo depois da mensagem que o usuário escolher.`,
    pick: { label: MESSAGE_LABEL, candidates: options },
  }
  const editRefine = { message: 'Vou colocar o aviso logo depois da mensagem da segunda via.', suggestions: [], action: 'edit', plan: refinePlan, pick: null }

  const panel = await start(page)
  ai.say(EDIT_MAIN)
  ai.builds.push({ steps: [MAIN_TEXT] })
  await ask(panel, MAIN_REQUEST)
  await proposal(panel)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(nodes(page)).toHaveCount(shown.length)

  ai.say(askRefine)
  await ask(panel, REFINE_REQUEST)
  await expect(banner(page)).toContainText(`Selecione ${MESSAGE_LABEL} no canvas.`)
  await expect(nodes(page)).toHaveCount(shown.length)
  await expectMarks(page, shown, candidates)
  await expect(choice(panel, boleto, 'Acesse a segunda via')).toHaveCount(1)
  const refineTurn = ai.turnCalls()[1]
  expect(inputOf(refineTurn)).toContain(BOLETO_TEXT)
  expect(historyOf(refineTurn)).toContain('Proposta pronta no canvas')
  expect(historyOf(refineTurn)).toContain(REFINE_REQUEST)

  await settle(page)
  await nodeAt(page, boleto).click()
  await expectMarks(page, shown, { ...candidates, [boleto]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${MESSAGE_KIND} · ID ${boleto}`)
  ai.say(editRefine)
  ai.builds.push({ steps: [refineText] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel, 2)
  await expect(cards).toHaveText(labels(countChanges(BASE_FLOW, second.workflow)))
  await expect(panel.getByText('Ajustada no pedido seguinte', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(1)
  await expect(nodes(page)).toHaveCount(second.workflow.nodes.length)
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  await expect(messages(panel)).toHaveText([you(MAIN_REQUEST), says(EDIT_MAIN), you(REFINE_REQUEST), says(askRefine), youPicked(MESSAGE_KIND, 'Acesse a segunda via', boleto), says(editRefine)])

  expect(ai.turnCalls()).toHaveLength(3)
  const third = ai.turnCalls()[2]
  expect(lastUser(third)).toMatch(picked(MESSAGE_KIND, 'Acesse a segunda via', boleto))
  expect(ai.buildCalls()).toHaveLength(2)
  const refineSent = JSON.stringify(ai.buildCalls()[1].body)
  expect(refineSent).toContain(refinePlan)
  expect(refineSent).toContain(BOLETO_TEXT)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(second.workflow) })
  const applied = await stored(page)
  expect(applied.edges.some((edge) => edge.source === boleto && edge.target === notice), 'o aviso entra depois da mensagem que só existia na proposta').toBe(true)
  await expect(marked(page)).toHaveCount(0)
})
