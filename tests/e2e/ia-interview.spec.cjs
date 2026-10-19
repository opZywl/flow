require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow } = require('../../lib/atendimento/format.ts')
const { START_TYPE } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { flowToRi } = require('../../lib/atendimento/ai/edit.ts')
const { INTERVIEW_SCHEMA_NAME } = require('../../lib/atendimento/ai/interview.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const ENDPOINT = 'https://api.openai.com/v1/responses'
const MODE = 'Conversar com a IA'
const BUILD_NOW = 'Pode montar o fluxo agora com o que já foi decidido.'
const ENDED = 'Conversa encerrada.'
const INTRO = 'Monte o fluxo conversando'
const STARTER = 'Crie um fluxo de envio de boleto.'
const KEY_MISSING = 'Informe a chave da API da OpenAI.'
const KEY_REJECTED = 'A chave da API foi recusada.'
const KEY_DETAILS = 'Confira a chave da OpenAI e tente novamente.'
const KEY_LABEL = 'Chave da API da OpenAI'
const SETTINGS_KEY = 'flow.ia'
const SUMMARY = 'OpenAI · GPT-6.1 Sol · Esforço equilibrado'
const MISSING = 'Chave não informada'

const REQUEST = 'crie um fluxo de envio de boleto'
const WELCOME = 'Use a mensagem Olá, você está no financeiro da Boletos Exemplo.'
const PLAN_MENU = 'Atendimento de envio de boleto da Boletos Exemplo. Menu principal com Segunda via do boleto, Já paguei e Falar com o financeiro.'
const PLAN_FINAL = `${PLAN_MENU} Boas-vindas: Olá, você está no financeiro da Boletos Exemplo. Segunda via envia o link do boleto, Já paguei agradece e encerra, Falar com o financeiro transfere para o departamento Financeiro.`

const ASK_MENU = {
  message: 'Pensei em um menu com Segunda via do boleto, Já paguei e Falar com o financeiro. Fica assim ou quer mudar alguma opção?',
  suggestions: ['Pode ser assim', 'Quero mudar as opções', 'Pode montar o fluxo'],
  action: 'ask',
  plan: PLAN_MENU,
}
const ASK_WELCOME = {
  message: 'Combinado. Qual mensagem de boas-vindas você quer usar?',
  suggestions: ['Pode escolher por mim', 'Pode montar o fluxo'],
  action: 'ask',
  plan: PLAN_MENU,
}
const GENERATE = { message: 'Vou montar o fluxo com o que combinamos.', suggestions: [], action: 'generate', plan: PLAN_FINAL }
const ASK_MORE = {
  message: 'O fluxo de envio de boleto está pronto no canvas. Precisa de mais alguma coisa?',
  suggestions: ['Adicionar pesquisa de satisfação', 'Mudar o horário de atendimento', 'Não, é só isso'],
  action: 'ask',
  plan: PLAN_FINAL,
}

const EDIT_REQUEST = 'adicione uma opção de falar com atendente'
const DEPARTMENT = 'Para o departamento Suporte'
const NEW_OPTION = 'Falar com atendente'
const EDIT_PLAN = 'No menu Como podemos ajudar com o seu boleto, acrescente a opção Falar com atendente, que transfere para o departamento Suporte.'
const ASK_DEPARTMENT = {
  message: 'Vou colocar a opção Falar com atendente no menu Como podemos ajudar com o seu boleto. Para qual departamento ela transfere?',
  suggestions: ['Suporte', 'Financeiro', 'Pode escolher por mim'],
  action: 'ask',
  plan: 'No menu Como podemos ajudar com o seu boleto, acrescente a opção Falar com atendente, que transfere para um departamento.',
}
const EDIT = { message: 'Vou acrescentar a opção Falar com atendente, que transfere para o Suporte.', suggestions: [], action: 'edit', plan: EDIT_PLAN }
const ASK_AFTER_EDIT = {
  message: 'A opção Falar com atendente já está no menu. Precisa de mais alguma coisa?',
  suggestions: ['Adicionar pesquisa de satisfação', 'Não, é só isso'],
  action: 'ask',
  plan: EDIT_PLAN,
}

const BOLETO = {
  name: 'Envio de boleto',
  description: 'Segunda via do boleto, confirmação de pagamento e financeiro',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no financeiro da Boletos Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar com o seu boleto?' }, { key: 'options', value: JSON.stringify([{ text: 'Segunda via do boleto' }, { text: 'Já paguei' }, { text: 'Falar com o financeiro' }]) }] },
    { id: 'segunda_via', type: 'envio_pergunta', config: [{ key: 'template', value: 'Acesse a segunda via em https://boletos.exemplo.com.br.' }] },
    { id: 'pago', type: 'envio_pergunta', config: [{ key: 'template', value: 'Obrigado. A baixa do pagamento leva até 3 dias úteis.' }] },
    { id: 'financeiro', type: 'departamentos', config: [{ key: 'name', value: 'Financeiro' }, { key: 'departamento', value: 'financeiro' }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Segunda via do boleto', to: 'segunda_via' },
    { from: 'menu', output: 'Já paguei', to: 'pago' },
    { from: 'menu', output: 'Falar com o financeiro', to: 'financeiro' },
    { from: 'segunda_via', output: '', to: 'fim' },
    { from: 'pago', output: '', to: 'fim' },
  ],
}
const BOLETO_TEXT = JSON.stringify(BOLETO)
const BOLETO_FIRST = BOLETO_TEXT.indexOf(JSON.stringify(BOLETO.nodes[0])) + JSON.stringify(BOLETO.nodes[0]).length

const SOURCE = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Boas-vindas, menu e transferência para a equipe certa',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Agendar consulta' }, { text: 'Encerrar' }]) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: 'Agendamento' }, { key: 'departamento', value: 'agendamento' }] },
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
const BASE_FLOW = importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(SOURCE, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))
const BASE_STATE = { name: BASE_FLOW.name, nodes: BASE_FLOW.nodes.map((node) => node.id) }

function editDelta(base) {
  const ri = flowToRi(base)
  const menu = ri.nodes.find((node) => node.type === 'envio_mensagem')
  return JSON.stringify({
    name: '',
    description: '',
    nodes: [
      {
        id: menu.id,
        type: 'envio_mensagem',
        config: menu.config.map((entry) => (entry.key === 'options' ? { key: 'options', value: JSON.stringify([...JSON.parse(entry.value), { text: NEW_OPTION }]) } : entry)),
      },
      { id: 'atendente', type: 'departamentos', config: [{ key: 'name', value: 'Suporte' }, { key: 'departamento', value: 'suporte' }] },
    ],
    edges: [...ri.edges.filter((edge) => edge.from === menu.id), { from: menu.id, output: NEW_OPTION, to: 'atendente' }],
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
const components = (flow) => flow.nodes.filter((node) => node.data.type !== START_TYPE).length
const user = (text) => `Você: ${text}`
const assistant = (turn) => `IA: ${turn.message}`
const turnText = (turn) => JSON.stringify(turn)
const builtNote = (flow) => `O fluxo foi montado com ${plural(components(flow), 'componente', 'componentes')}.`

function editNote(changes) {
  const parts = [
    changes.added > 0 ? plural(changes.added, 'novo', 'novos') : '',
    changes.changed > 0 ? plural(changes.changed, 'alterado', 'alterados') : '',
    changes.removed > 0 ? plural(changes.removed, 'removido', 'removidos') : '',
  ].filter(Boolean)
  return parts.length ? `Alterações aplicadas: ${parts.join(', ')}.` : 'Nenhuma alteração foi necessária no fluxo.'
}

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

const references = {}
function reference(name, request, text) {
  references[name] ??= (async () => {
    const { runGeneration } = require('../../lib/atendimento/ai/runner.ts')
    const body = script([text]).join('')
    const result = await runGeneration(
      { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, size: 'auto', effort: 'medium', fill: true, ...request },
      { transport: 'server', signal: new AbortController().signal, fetch: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) },
    )
    if (!result.success) throw new Error(`O motor não montou o fluxo de referência ${name}: ${result.error}`)
    return result
  })()
  return references[name]
}
const createdFlow = () => reference('boleto', { prompt: PLAN_FINAL }, BOLETO_TEXT)
const editedFlow = (base, delta) => reference('edicao', { prompt: EDIT_PLAN, mode: 'edit', base }, delta)

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
      await sleep(15)
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
      turns: [],
      builds: [],
      fallbacks: [],
      unexpected: [],
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
      say(turn, ...gates) {
        ai.turns.push({ steps: [...gates, turnText(turn)] })
      },
      turnCalls: () => ai.calls.filter((call) => call.kind === 'turn'),
      buildCalls: () => ai.calls.filter((call) => call.kind === 'build'),
    }
    await page.route((url) => url.hostname === HOST, async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') {
        ai.unexpected.push(`${request.method()} ${request.url()}`)
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
      }
      const body = request.postDataJSON()
      const kind = body?.text?.format?.name === INTERVIEW_SCHEMA_NAME ? 'turn' : 'build'
      ai.calls.push({ kind, url: request.url(), headers: await request.allHeaders(), body })
      const reply = (kind === 'turn' ? ai.turns : ai.builds).shift()
      if (!reply) {
        ai.unexpected.push(kind)
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Resposta não prevista no teste.', type: 'invalid_request_error' } }) })
      }
      if (reply.status) return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
      const id = crypto.randomUUID()
      server.sessions.set(id, script(reply.steps))
      ids.push(id)
      return route.continue({ url: `${server.url}/${id}` })
    })
    await page.route('**/api/generate-workflow', async (route) => {
      ai.fallbacks.push(route.request().postDataJSON())
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'unknown', error: 'A rota de reserva não fazia parte deste teste.' }) })
    })
    await use(ai)
    for (const gate of gates) gate.open()
    for (const id of ids) server.sessions.delete(id)
    expect(ai.unexpected, 'chamadas ao provedor sem resposta prevista').toEqual([])
    expect(ai.fallbacks, 'chamadas à rota de reserva').toEqual([])
    expect(ai.calls.every((call) => !JSON.stringify(call.body).includes(KEY)), 'a chave não vai no corpo da requisição').toBe(true)
  },
})

test.use({ ignoreHTTPSErrors: true })

const inputOf = (call) => JSON.stringify(call.body.input)
const historyOf = (call) => JSON.stringify(call.body.input.filter((entry) => entry.role === 'user' || entry.role === 'assistant'))
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: flow.nodes.map((node) => node.id) }
}
const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library') || '[]').map((entry) => ({ name: entry.flow.name, nodes: entry.flow.nodes.map((node) => node.id) })))

const settingsWindow = (page) => page.getByRole('dialog', { name: 'Configurar IA', exact: true })

async function seedKey(page) {
  const value = JSON.stringify({ provider: 'openai', keys: { openai: KEY }, models: {}, effortChoice: null, fill: true })
  await page.addInitScript(([name, saved]) => {
    try {
      if (window.sessionStorage.getItem(name) === null) window.sessionStorage.setItem(name, saved)
    } catch {}
  }, [SETTINGS_KEY, value])
}

async function openBlank(page, { key = true } = {}) {
  if (key) await seedKey(page)
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
}

async function openBase(page) {
  await openBlank(page)
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toHaveValue(BASE_FLOW.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
}

async function openDialog(page) {
  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Gerar fluxo com IA', exact: true })
  await expect(dialog.getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  return dialog
}

async function chooseMode(dialog, name) {
  const radio = dialog.page().getByRole('radio', { name, exact: true })
  await dialog.locator('label', { has: radio }).click()
  await expect(radio).toBeChecked()
}

async function startChat(page, { watch = false } = {}) {
  const dialog = await openDialog(page)
  await chooseMode(dialog, MODE)
  const box = dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })
  if (watch) await box.check()
  else await box.uncheck()
  const chat = dialog.getByRole('region', { name: 'Conversa com a IA' })
  await expect(chat).toBeVisible()
  return { dialog, chat }
}

const field = (chat) => chat.getByRole('textbox', { name: 'Sua resposta para a IA' })
const chips = (chat) => chat.getByRole('group', { name: 'Sugestões de resposta' }).getByRole('button')
const log = (chat) => chat.getByRole('log')
const entries = (chat) => log(chat).locator(':scope > div > p:not([role="status"]), :scope > p')
const waiting = (chat) => log(chat).getByRole('status')

async function type(chat, text) {
  await field(chat).fill(text)
  await field(chat).press('Enter')
}

async function closeDialog(page) {
  await page.getByRole('dialog', { name: 'Gerar fluxo com IA' }).getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('crie um fluxo de envio de boleto: the AI asks with suggestions, builds the flow from the plan, applies it in the editor and asks if anything else is needed', async ({ page, ai }) => {
  const final = (await createdFlow()).workflow
  const thinking = ai.hold()
  const building = ai.hold()
  ai.say(ASK_MENU, thinking)
  ai.say(ASK_WELCOME)
  ai.say(GENERATE)
  ai.builds.push({ steps: [BOLETO_TEXT.slice(0, BOLETO_FIRST), building, BOLETO_TEXT.slice(BOLETO_FIRST)] })
  ai.say(ASK_MORE)

  await openBlank(page)
  const { dialog, chat } = await startChat(page, { watch: true })
  await expect(dialog.getByLabel('Descrição do atendimento')).toBeHidden()
  await expect(dialog.getByText('Imagem de referência')).toBeHidden()
  await expect(dialog.getByRole('combobox', { name: 'Tamanho do fluxo' })).toBeHidden()
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo', exact: true })).toHaveCount(0)
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Configurar IA', exact: true })).toBeVisible()
  await expect(dialog.getByLabel(KEY_LABEL)).toHaveCount(0)
  for (const name of ['Provedor de IA', 'Modelo', 'Esforço']) await expect(dialog.getByRole('combobox', { name, exact: true }), `${name} fica só na janela Configurar IA`).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: 'Preencher todos os campos' })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })).toBeChecked()
  await expect(chat.getByText(INTRO)).toBeVisible()
  await expect(chips(chat).first()).toHaveText(STARTER)
  await expect(chat.getByRole('button', { name: 'Montar o fluxo agora' })).toBeDisabled()
  await expect(chat.getByRole('button', { name: 'Encerrar conversa' })).toBeDisabled()

  await field(chat).fill(REQUEST)
  await chat.getByRole('button', { name: 'Enviar resposta' }).click()
  await expect(field(chat)).toHaveValue('')
  await thinking.reached
  await expect(waiting(chat)).toHaveText('Pensando na próxima pergunta.')
  await expect(chat.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
  thinking.open()

  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU)])
  await expect(chips(chat)).toHaveText(ASK_MENU.suggestions)
  await expect(waiting(chat)).toHaveCount(0)
  await expect(field(chat)).toBeFocused()
  const first = ai.turnCalls()[0]
  expect(first.url).toBe(ENDPOINT)
  expect(first.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(first.body).toMatchObject({ model: 'gpt-6.1-sol', stream: true, reasoning: { effort: 'medium' } })
  expect(historyOf(first)).toContain(REQUEST)
  expect(inputOf(first)).toContain('Não há fluxo aberto no editor.')

  await chips(chat).filter({ hasText: 'Pode ser assim' }).click()
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU), user('Pode ser assim'), assistant(ASK_WELCOME)])
  await expect(chips(chat)).toHaveText(ASK_WELCOME.suggestions)
  const second = ai.turnCalls()[1]
  expect(historyOf(second)).toContain(ASK_MENU.message)
  expect(historyOf(second)).toContain('Pode ser assim')

  await chat.getByText('Ver o plano').click()
  await expect(chat.getByText(PLAN_MENU, { exact: true })).toBeVisible()

  await type(chat, WELCOME)
  await building.reached
  const panel = page.getByRole('region', { name: 'Geração com IA' })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.react-flow')).toContainText('Olá, #NAME. Você está no financeiro da Boletos Exemplo.')
  await expect(page.locator('.react-flow')).not.toContainText('Como podemos ajudar com o seu boleto?')
  expect(ai.buildCalls()).toHaveLength(1)
  const build = ai.buildCalls()[0]
  expect(build.body.text.format.name).toBe('fluxo_ri')
  expect(JSON.stringify(build.body)).toContain(PLAN_FINAL)
  expect(JSON.stringify(build.body)).not.toContain('# Modo de edição')
  building.open()

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 })
  await expect(panel).toHaveCount(0)
  await expect(entries(chat)).toHaveText([
    user(REQUEST),
    assistant(ASK_MENU),
    user('Pode ser assim'),
    assistant(ASK_WELCOME),
    user(WELCOME),
    assistant(GENERATE),
    builtNote(final),
    assistant(ASK_MORE),
  ], { timeout: 15000 })
  await expect(chips(chat)).toHaveText(ASK_MORE.suggestions)
  await expect(chat.getByRole('button', { name: 'Montar o fluxo agora' })).toBeEnabled()
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect(page.locator('.react-flow')).toContainText('Como podemos ajudar com o seu boleto?')
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toHaveValue(final.name)
  await expect.poll(() => saved(page)).toEqual({ name: final.name, nodes: final.nodes.map((node) => node.id) })
  expect(await library(page)).toEqual([])

  expect(ai.turnCalls()).toHaveLength(4)
  const after = inputOf(ai.turnCalls()[3])
  expect(historyOf(ai.turnCalls()[3])).toContain(builtNote(final))
  expect(after).toContain('# Resumo do fluxo aberto')
  expect(after).toContain('Como podemos ajudar com o seu boleto?')
  expect(historyOf(ai.turnCalls()[3])).toContain(WELCOME)

  await closeDialog(page)
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toBeEnabled()
})

test('adicione uma opção de falar com atendente: the chat builds its own flow first, the AI asks the department, applies the edit on the built flow, Desfazer goes back and the AI asks again', async ({ page, ai }) => {
  const built = (await createdFlow()).workflow
  const builtState = { name: built.name, nodes: built.nodes.map((node) => node.id) }
  const applying = ai.hold()
  ai.say(ASK_MENU)
  ai.say(ASK_WELCOME)
  ai.say(GENERATE)
  ai.builds.push({ steps: [BOLETO_TEXT] })
  ai.say(ASK_MORE)
  ai.say(ASK_DEPARTMENT)
  ai.say(EDIT)
  ai.say(ASK_AFTER_EDIT)

  await openBase(page)
  const { dialog, chat } = await startChat(page)
  await expect(dialog.getByRole('radio', { name: 'Editar o fluxo aberto', exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('O que mudar no fluxo aberto')).toHaveCount(0)
  await expect(chat.getByText(/^Conte o que o seu atendimento precisa fazer\./)).toBeVisible()
  await expect(chips(chat).first()).toHaveText(STARTER)

  await type(chat, REQUEST)
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU)])
  const opening = inputOf(ai.turnCalls()[0])
  expect(opening).toContain('Não há fluxo aberto no editor.')
  expect(opening).not.toContain('# Resumo do fluxo aberto')
  expect(opening).not.toContain('Agendar consulta')
  await chips(chat).filter({ hasText: 'Pode ser assim' }).click()
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU), user('Pode ser assim'), assistant(ASK_WELCOME)])
  expect(inputOf(ai.turnCalls()[1])).not.toContain('# Resumo do fluxo aberto')
  await type(chat, WELCOME)
  const creation = [user(REQUEST), assistant(ASK_MENU), user('Pode ser assim'), assistant(ASK_WELCOME), user(WELCOME), assistant(GENERATE), builtNote(built), assistant(ASK_MORE)]
  await expect(entries(chat)).toHaveText(creation, { timeout: 15000 })
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(PLAN_FINAL)
  expect(JSON.stringify(ai.buildCalls()[0].body)).not.toContain('# Modo de edição')
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toHaveValue(built.name)
  await expect.poll(() => saved(page)).toEqual(builtState)
  await expect.poll(() => library(page)).toEqual([BASE_STATE])
  expect(inputOf(ai.turnCalls()[3])).toContain('# Resumo do fluxo aberto')
  expect(inputOf(ai.turnCalls()[3])).toContain('Como podemos ajudar com o seu boleto?')

  const before = await stored(page)
  const delta = editDelta(importFlow(before))
  const result = await editedFlow(importFlow(before), delta)
  const final = result.workflow
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  ai.builds.push({ steps: [applying, delta] })

  await type(chat, EDIT_REQUEST)
  await expect(entries(chat)).toHaveText([...creation, user(EDIT_REQUEST), assistant(ASK_DEPARTMENT)])
  await expect(chips(chat)).toHaveText(ASK_DEPARTMENT.suggestions)
  const asked = inputOf(ai.turnCalls()[4])
  expect(asked).toContain(EDIT_REQUEST)
  expect(asked).toContain('# Resumo do fluxo aberto')
  expect(asked).toContain('Como podemos ajudar com o seu boleto?')
  expect(asked).not.toContain('Agendar consulta')

  await type(chat, DEPARTMENT)
  await applying.reached
  await expect(waiting(chat)).toHaveText('Aplicando as alterações no canvas.')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(chat.getByRole('button', { name: 'Montar o fluxo agora' })).toBeDisabled()
  expect(ai.buildCalls()).toHaveLength(2)
  const build = JSON.stringify(ai.buildCalls()[1].body)
  expect(build).toContain('# Modo de edição')
  expect(build).toContain('# Fluxo atual')
  expect(build).toContain(EDIT_PLAN)
  expect(build).toContain('Como podemos ajudar com o seu boleto?')
  expect(await saved(page)).toEqual(builtState)
  applying.open()

  await expect(entries(chat)).toHaveText([
    ...creation,
    user(EDIT_REQUEST),
    assistant(ASK_DEPARTMENT),
    user(DEPARTMENT),
    assistant(EDIT),
    editNote(result.changes),
    assistant(ASK_AFTER_EDIT),
  ], { timeout: 15000 })
  await expect(chips(chat)).toHaveText(ASK_AFTER_EDIT.suggestions)
  const nodes = page.locator('.react-flow__node')
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow')).toContainText(NEW_OPTION)
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toHaveValue(built.name)
  await expect.poll(() => saved(page)).toEqual({ name: built.name, nodes: final.nodes.map((node) => node.id) })
  expect(await library(page)).toEqual([BASE_STATE])
  expect(ai.buildCalls()).toHaveLength(2)
  expect(ai.turnCalls()).toHaveLength(7)
  const after = inputOf(ai.turnCalls()[6])
  expect(historyOf(ai.turnCalls()[6])).toContain(editNote(result.changes))
  expect(after).toContain(NEW_OPTION)

  const edited = await stored(page)
  for (const node of before.nodes) {
    const kept = edited.nodes.find((entry) => entry.id === node.id)
    expect(kept, node.id).toBeTruthy()
    expect(kept.position, node.id).toEqual(node.position)
  }

  await closeDialog(page)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(nodes).toHaveCount(before.nodes.length)
  await expect(page.locator('.react-flow')).not.toContainText(NEW_OPTION)
  await expect.poll(() => saved(page)).toEqual(builtState)
  const undone = await stored(page)
  expect(undone.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(before.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(undone.edges).toEqual(before.edges)

  ai.say(ASK_MENU)
  const restarted = (await openDialog(page)).getByRole('region', { name: 'Conversa com a IA' })
  await restarted.getByRole('button', { name: 'Encerrar conversa' }).click()
  await restarted.getByRole('button', { name: 'Nova conversa' }).click()
  await type(restarted, REQUEST)
  await expect(entries(restarted)).toHaveText([user(REQUEST), assistant(ASK_MENU)])
  expect(inputOf(ai.turnCalls()[7])).toContain('Não há fluxo aberto no editor.')
  expect(inputOf(ai.turnCalls()[7])).not.toContain('# Resumo do fluxo aberto')
})

test('Montar o fluxo agora builds right away with the current plan, even when the AI would keep asking', async ({ page, ai }) => {
  const final = (await reference('agora', { prompt: PLAN_MENU }, BOLETO_TEXT)).workflow
  const building = ai.hold()
  ai.say(ASK_MENU)
  ai.say(ASK_WELCOME)
  ai.builds.push({ steps: [building, BOLETO_TEXT] })
  ai.say(ASK_MORE)

  await openBlank(page)
  const { dialog, chat } = await startChat(page)
  const buildNow = chat.getByRole('button', { name: 'Montar o fluxo agora' })
  await expect(buildNow).toBeDisabled()
  await type(chat, 'Quero um fluxo de envio de boleto.')
  await expect(entries(chat)).toHaveText([user('Quero um fluxo de envio de boleto.'), assistant(ASK_MENU)])
  await expect(buildNow).toBeEnabled()

  await buildNow.click()
  await building.reached
  await expect(waiting(chat)).toHaveText('Montando o fluxo no canvas.')
  await expect(buildNow).toBeDisabled()
  await expect(chat.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Geração com IA' })).toHaveCount(0)
  expect(historyOf(ai.turnCalls()[1])).toContain(BUILD_NOW)
  const build = ai.buildCalls()[0]
  expect(JSON.stringify(build.body)).toContain(PLAN_MENU)
  expect(await library(page)).toEqual([])
  building.open()

  await expect(entries(chat)).toHaveText([
    user('Quero um fluxo de envio de boleto.'),
    assistant(ASK_MENU),
    user(BUILD_NOW),
    builtNote(final),
    assistant(ASK_MORE),
  ], { timeout: 15000 })
  await expect(chat.getByText(ASK_WELCOME.message)).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await expect(page.getByLabel('Nome do fluxo', { exact: true })).toHaveValue(final.name)
  await expect.poll(() => saved(page)).toEqual({ name: final.name, nodes: final.nodes.map((node) => node.id) })
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo', exact: true })).toHaveCount(0)
  expect(ai.buildCalls()).toHaveLength(1)
  expect(ai.turnCalls()).toHaveLength(3)
})

test('Encerrar conversa ends the chat, a late answer never shows up and Nova conversa starts over with an empty history', async ({ page, ai }) => {
  ai.say(ASK_MENU)
  await openBlank(page)
  const { chat } = await startChat(page)
  const finish = chat.getByRole('button', { name: 'Encerrar conversa' })
  const restart = chat.getByRole('button', { name: 'Nova conversa' })
  const buildNow = chat.getByRole('button', { name: 'Montar o fluxo agora' })
  await expect(finish).toBeDisabled()
  await type(chat, 'Quero um fluxo de envio de boleto.')
  await expect(entries(chat)).toHaveText([user('Quero um fluxo de envio de boleto.'), assistant(ASK_MENU)])

  await finish.click()
  await expect(entries(chat)).toHaveText([user('Quero um fluxo de envio de boleto.'), assistant(ASK_MENU), ENDED])
  await expect(chat.getByRole('group', { name: 'Sugestões de resposta' })).toHaveCount(0)
  await expect(finish).toHaveCount(0)
  await expect(restart).toBeVisible()
  await expect(buildNow).toBeDisabled()
  await expect(field(chat)).toHaveAttribute('placeholder', 'Escreva para retomar a conversa')
  expect(ai.turnCalls()).toHaveLength(1)

  await restart.click()
  await expect(chat.getByText(INTRO)).toBeVisible()
  await expect(log(chat)).not.toContainText('Você:')
  await expect(log(chat)).not.toContainText(ASK_MENU.message)
  await expect(chat.getByText('Ver o plano')).toHaveCount(0)
  await expect(finish).toBeDisabled()
  await expect(buildNow).toBeDisabled()
  await expect(chips(chat).first()).toHaveText(STARTER)

  const late = ai.hold()
  ai.say(ASK_MENU, late)
  await chips(chat).filter({ hasText: STARTER }).click()
  await late.reached
  await expect(waiting(chat)).toBeVisible()
  const restarted = historyOf(ai.turnCalls()[1])
  expect(restarted).toContain(STARTER)
  expect(restarted).not.toContain('Quero um fluxo de envio de boleto.')
  expect(restarted).not.toContain(ASK_MENU.message)
  await finish.click()
  await expect(entries(chat)).toHaveText([user(STARTER), ENDED])
  await expect(waiting(chat)).toHaveCount(0)
  late.open()
  await page.waitForTimeout(500)
  await expect(entries(chat)).toHaveText([user(STARTER), ENDED])

  ai.say(ASK_WELCOME)
  await restart.click()
  await type(chat, REQUEST)
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_WELCOME)])
  expect(historyOf(ai.turnCalls()[2])).not.toContain(STARTER)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('a key rejected on a turn opens Configurar IA on the key with the error, shows it in the chat and Tentar de novo sends the same history again', async ({ page, ai }) => {
  ai.turns.push({ status: 401, body: { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } } })
  ai.say(ASK_MENU)
  await openBlank(page)
  const { chat } = await startChat(page)
  await type(chat, REQUEST)

  const config = settingsWindow(page)
  await expect(config).toBeVisible({ timeout: 15000 })
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue(KEY)
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(config.getByText(`${KEY_REJECTED} ${KEY_DETAILS}`, { exact: true })).toBeVisible()
  await config.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(config).toHaveCount(0)

  const alert = chat.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(KEY_REJECTED)
  await expect(alert).toContainText(KEY_DETAILS)
  await expect(alert).not.toContainText(KEY)
  await expect(entries(chat)).toHaveText([user(REQUEST)])
  expect(ai.turnCalls()).toHaveLength(1)

  await alert.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU)])
  await expect(alert).toHaveCount(0)
  await expect(chips(chat)).toHaveText(ASK_MENU.suggestions)
  await expect(config).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(inputOf(ai.turnCalls()[1])).toBe(inputOf(ai.turnCalls()[0]))
  expect(ai.turnCalls()[1].headers.authorization).toBe(`Bearer ${KEY}`)
})

test('without a key the first message opens Configurar IA on the key with the error and nothing reaches the provider until the key is typed there', async ({ page, ai }) => {
  await openBlank(page, { key: false })
  const { dialog, chat } = await startChat(page)
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toBeVisible()
  await type(chat, REQUEST)
  const config = settingsWindow(page)
  await expect(config).toBeVisible()
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(config.getByText(KEY_MISSING, { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  expect(ai.calls).toEqual([])

  ai.say(ASK_MENU)
  await key.fill(KEY)
  await expect(key).not.toHaveAttribute('aria-invalid')
  await expect(config.getByText(KEY_MISSING, { exact: true })).toHaveCount(0)
  await config.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(config).toHaveCount(0)
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  await type(chat, REQUEST)
  await expect(log(chat)).toContainText(ASK_MENU.message)
  await expect(chips(chat)).toHaveText(ASK_MENU.suggestions)
  await expect(config).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.turnCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
})

test('closing and reopening the dialog keeps the conversation, even while the AI is answering', async ({ page, ai }) => {
  ai.say(ASK_MENU)
  const late = ai.hold()
  ai.say(ASK_WELCOME, late)
  await openBlank(page)
  let { chat } = await startChat(page)
  await type(chat, REQUEST)
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU)])

  await closeDialog(page)
  let dialog = await openDialog(page)
  chat = dialog.getByRole('region', { name: 'Conversa com a IA' })
  await expect(dialog.getByRole('radio', { name: MODE, exact: true })).toBeChecked()
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU)])
  await expect(chips(chat)).toHaveText(ASK_MENU.suggestions)
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo', exact: true })).toHaveCount(0)

  await chips(chat).filter({ hasText: 'Pode ser assim' }).click()
  await late.reached
  await expect(waiting(chat)).toBeVisible()
  await closeDialog(page)
  late.open()
  await page.waitForTimeout(500)

  dialog = await openDialog(page)
  chat = dialog.getByRole('region', { name: 'Conversa com a IA' })
  await expect(entries(chat)).toHaveText([user(REQUEST), assistant(ASK_MENU), user('Pode ser assim'), assistant(ASK_WELCOME)])
  await expect(chips(chat)).toHaveText(ASK_WELCOME.suggestions)
  const second = historyOf(ai.turnCalls()[1])
  expect(second).toContain(REQUEST)
  expect(second).toContain(ASK_MENU.message)
  expect(second).toContain('Pode ser assim')
  expect(ai.turnCalls()).toHaveLength(2)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
})
