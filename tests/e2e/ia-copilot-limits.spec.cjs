require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow, validateFlow } = require('../../lib/atendimento/format.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { flowToRi } = require('../../lib/atendimento/ai/edit.ts')
const { INTERVIEW_SCHEMA_NAME, copilotSystemPrompt, interviewMessages } = require('../../lib/atendimento/ai/interview.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const EDIT_BANNER = 'Editando com IA. As mudanças aparecem aqui conforme chegam.'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const FULL_REQUEST = 'Ver o pedido completo'
const REMOVED_HINT = 'Componentes removidos:'
const SECOND_ROUND = 'Editando o fluxo, rodada 2 de 3.'

const WELCOME = 'Olá, #NAME. Você está no atendimento do Pet Shop Exemplo.'
const HOURS = 'Atendemos de segunda a sábado, das 8h às 18h.'
const MENU_TITLE = 'Como podemos ajudar?'
const CURRENT = [
  ['Banho e tosa', 'O banho e tosa funciona de terça a sábado, das 9h às 17h.'],
  ['Consultas', 'As consultas são marcadas pelo telefone (11) 4000-1000.'],
  ['Vacinas', 'A vacinação acontece de segunda a sexta, das 8h às 18h.'],
  ['Hospedagem', 'A hospedagem recebe pets de domingo a domingo.'],
  ['Ração e acessórios', 'Veja os produtos em https://loja.exemplo.com.br.'],
  ['Falar com a recepção', 'Um atendente da recepção responde em instantes.'],
]
const FRESH = [
  ['Exames', 'Os resultados de exames saem em até 3 dias úteis.'],
  ['Cirurgias', 'As cirurgias são marcadas depois de uma consulta.'],
  ['Emergência', 'Para emergências, ligue (11) 4000-2000 a qualquer hora.'],
  ['Adestramento', 'O adestramento tem turmas aos sábados pela manhã.'],
  ['Pet táxi', 'O pet táxi busca e leva o seu pet com hora marcada.'],
  ['Creche', 'A creche recebe pets de segunda a sexta, das 7h às 19h.'],
  ['Farmácia', 'A farmácia tem os remédios receitados pelo veterinário.'],
  ['Planos de saúde', 'Conheça os planos em https://planos.exemplo.com.br.'],
]
const EXTRA = ['Encerrar atendimento', 'Obrigado pelo contato. Até logo.']
const OLD_OPTIONS = CURRENT.map(([text]) => text)
const NEW_OPTIONS = FRESH.map(([text]) => text)
const listText = (items) => `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`

const SOURCE = {
  name: 'Atendimento Pet Shop Exemplo',
  description: 'Boas-vindas, horário e menu com seis opções',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: WELCOME }] },
    { id: 'horario', type: 'envio_pergunta', config: [{ key: 'template', value: HOURS }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: MENU_TITLE }, { key: 'options', value: JSON.stringify(OLD_OPTIONS.map((text) => ({ text }))) }] },
    ...CURRENT.map(([, reply], index) => ({ id: `resposta_${index + 1}`, type: 'envio_pergunta', config: [{ key: 'template', value: reply }] })),
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'horario' },
    { from: 'horario', output: '', to: 'menu' },
    ...OLD_OPTIONS.map((text, index) => ({ from: 'menu', output: text, to: `resposta_${index + 1}` })),
  ],
}

const assembled = (source) => importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(source, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))
const idsOf = (flow) => flow.nodes.map((node) => node.id)
const optionsOf = (node) => Object.keys(node.data.data).filter((key) => /^text-\d+$/.test(key)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).map((key) => node.data.data[key])

const BASE_FLOW = assembled(SOURCE)
const BASE_STATE = { name: BASE_FLOW.name, nodes: idsOf(BASE_FLOW) }
const MENU = flowToRi(BASE_FLOW).nodes.find((node) => node.type === 'envio_mensagem').id
const MENU_NODE = BASE_FLOW.nodes.find((node) => node.id === MENU)
const OLD_TARGETS = BASE_FLOW.nodes.filter((node) => !['inicio', MENU].includes(node.id) && ![WELCOME, HOURS].includes(node.data.data.template)).map((node) => node.id)

const OLD_EDGES = flowToRi(BASE_FLOW).edges.filter((edge) => edge.from === MENU)
const REPLIES = FRESH.map(([text, reply]) => `${text} envia ${reply}`).join(' ')

const LIMIT_REQUEST = `crie 8 opções no menu de opções #${MENU}: ${listText(NEW_OPTIONS)}`
const REPLACE_PLAN = `No menu ${MENU_TITLE}, ID ${MENU}, troque as 6 opções atuais por estas 8, nesta ordem: ${listText(NEW_OPTIONS)}. O menu ${MENU_TITLE}, ID ${MENU}, fica com 8 opções. Cada opção nova envia a mensagem dela e encerra o atendimento: ${REPLIES} As opções atuais e os passos que só elas alcançam saem do fluxo.`
const REPLACE_CHOICE = 'Trocar as opções atuais'
const SPLIT_CHOICE = 'Dividir em dois menus'
const ASK_LIMIT = {
  message: `O menu ${MENU_TITLE} tem 6 opções e aceita até 10, então cabem mais 4. Posso trocar as 6 opções atuais pelas 8 novas, e as atuais saem do fluxo com os passos que só elas alcançam, ou dividir em dois menus, com a opção Mais opções levando ao segundo. Qual caminho você prefere?`,
  suggestions: [REPLACE_CHOICE, SPLIT_CHOICE, 'Acrescentar só 4 opções'],
  action: 'ask',
  plan: REPLACE_PLAN,
  pick: null,
}
const EDIT_REPLACE = {
  message: `Vou trocar as 6 opções do menu ${MENU_TITLE} pelas 8 novas e tirar do fluxo os passos que só as opções atuais alcançavam.`,
  suggestions: [],
  action: 'edit',
  plan: REPLACE_PLAN,
  pick: null,
}
const EIGHT_REQUEST = `troque as opções do menu de opções #${MENU} por estas 8: ${listText(NEW_OPTIONS)}`
const EDIT_EIGHT = {
  message: `Vou trocar as 6 opções do menu ${MENU_TITLE} pelas 8 novas. As opções atuais e os passos que só elas alcançam saem do fluxo.`,
  suggestions: [],
  action: 'edit',
  plan: REPLACE_PLAN,
  pick: null,
}
const COUNT_ISSUE = `[${MENU}] Menu de Opções: O pedido pede 8 opções neste menu, e ele ficou com 9. Deixe o menu com exatamente 8 opções, as do pedido, na ordem dele.`

const MORE_OPTION = 'Mais opções'
const MORE_TITLE = 'Mais serviços: escolha uma opção'
const SPLIT_PLAN = `No menu ${MENU_TITLE}, ID ${MENU}, mantenha as 6 opções atuais e acrescente no fim a opção ${MORE_OPTION}, que leva a um menu novo com a mensagem ${MORE_TITLE}. O menu ${MENU_TITLE}, ID ${MENU}, fica com 7 opções. O menu novo Mais serviços fica com 8 opções, nesta ordem: ${listText(NEW_OPTIONS)}. Cada opção nova envia a mensagem dela e encerra o atendimento: ${REPLIES}`
const EDIT_SPLIT = {
  message: `Vou manter as 6 opções do menu ${MENU_TITLE}, acrescentar a opção ${MORE_OPTION} e colocar as 8 novas no menu Mais serviços.`,
  suggestions: [],
  action: 'edit',
  plan: SPLIT_PLAN,
  pick: null,
}
const OVER_ISSUE = `[${MENU}] Menu de Opções: O menu ficou com 14 opções, e o limite é de 10. Deixe até 10 opções nele: divida em dois menus, com uma opção que leva ao segundo, ou reduza as opções, como o pedido indicar.`
const OVER_COUNT = `[${MENU}] Menu de Opções: O pedido pede 7 opções neste menu, e ele ficou com 14. Deixe o menu com exatamente 7 opções, as do pedido, na ordem dele.`

const menuDelta = (options) => ({ id: MENU, type: 'envio_mensagem', config: [{ key: 'title', value: MENU_TITLE }, { key: 'options', value: JSON.stringify(options.map(([text]) => ({ text }))) }] })
const freshNodes = (options) =>
  options.flatMap(([, reply], index) => [
    { id: `opcao_${index + 1}`, type: 'envio_pergunta', config: [{ key: 'template', value: reply }] },
    { id: `fim_${index + 1}`, type: 'finalizar', config: [] },
  ])
const freshEdges = (from, options) => [
  ...options.map(([text], index) => ({ from, output: text, to: `opcao_${index + 1}` })),
  ...options.map((_, index) => ({ from: `opcao_${index + 1}`, output: '', to: `fim_${index + 1}` })),
]

function replaceDelta(options) {
  return { name: '', description: '', nodes: [menuDelta(options), ...freshNodes(options)], edges: freshEdges(MENU, options) }
}

const REPLACE_TEXT = JSON.stringify(replaceDelta(FRESH))
const NINE_TEXT = JSON.stringify(replaceDelta([...FRESH, EXTRA]))
const FIX_TEXT = JSON.stringify({ name: '', description: '', nodes: [menuDelta(FRESH)], edges: NEW_OPTIONS.map((text, index) => ({ from: MENU, output: text, to: `opcao_${index + 1}` })) })
const OVER_TEXT = JSON.stringify({
  name: '',
  description: '',
  nodes: [menuDelta([...CURRENT, ...FRESH]), ...freshNodes(FRESH)],
  edges: [...OLD_EDGES, ...freshEdges(MENU, FRESH)],
})
const SPLIT_TEXT = JSON.stringify({
  name: '',
  description: '',
  nodes: [
    menuDelta([...CURRENT, [MORE_OPTION]]),
    { id: 'menu_mais', type: 'envio_mensagem', config: [{ key: 'title', value: MORE_TITLE }, { key: 'options', value: JSON.stringify(NEW_OPTIONS.map((text) => ({ text }))) }] },
  ],
  edges: [...OLD_EDGES, { from: MENU, output: MORE_OPTION, to: 'menu_mais' }, ...NEW_OPTIONS.map((text, index) => ({ from: 'menu_mais', output: text, to: `opcao_${index + 1}` }))],
})

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

async function engineRun(baseFlow, texts, prompt) {
  const { runGeneration } = require('../../lib/atendimento/ai/runner.ts')
  const requests = []
  const result = await runGeneration(
    { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, prompt, size: 'auto', effort: 'medium', mode: 'edit', base: baseFlow, fill: true },
    {
      transport: 'server',
      signal: new AbortController().signal,
      fetch: async (url, init) => {
        requests.push(JSON.parse(init.body))
        const text = texts[Math.min(requests.length, texts.length) - 1]
        return new Response(script([text]).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
      },
    },
  )
  if (!result.success) throw new Error(`O motor não aplicou a edição de referência: ${result.error}`)
  return { result, requests }
}

function once(make) {
  let value
  return () => (value ??= make())
}

const expectedReplace = once(() => engineRun(BASE_FLOW, [REPLACE_TEXT], REPLACE_PLAN))
const expectedCorrection = once(() => engineRun(BASE_FLOW, [NINE_TEXT, FIX_TEXT], REPLACE_PLAN))
const expectedSplit = once(() => engineRun(BASE_FLOW, [OVER_TEXT, SPLIT_TEXT], SPLIT_PLAN))

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
      say(turn, ...holds) {
        ai.turns.push({ steps: [...holds, JSON.stringify(turn)] })
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
    for (const gate of gates) gate.open()
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
const historyOf = (call) => JSON.stringify(call.body.input.filter((entry) => entry.role === 'user' || entry.role === 'assistant'))
const partText = (content) => (typeof content === 'string' ? content : content.map((part) => part.text ?? '').join(''))
const systemOf = (call) => call.body.input.filter((entry) => entry.role === 'developer' || entry.role === 'system').map((entry) => partText(entry.content))
const lastOf = (input, role) => partText(input.filter((entry) => entry.role === role).at(-1).content)
const copilotState = (flow, text) => interviewMessages({ history: [{ role: 'user', text }], flow, fill: true, scope: 'copilot', proposal: false })[1].content
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: idsOf(flow) }
}
const labels = ({ added, changed, removed }) => [
  `${added} ${added === 1 ? 'componente novo' : 'componentes novos'}`,
  `${changed} ${changed === 1 ? 'alterado' : 'alterados'}`,
  `${removed} ${removed === 1 ? 'removido' : 'removidos'}`,
]
const canvas = (page) => page.locator('.react-flow')
const nodes = (page) => page.locator('.react-flow__node')
const menuOutputs = (page) => page.locator(`.react-flow__node[data-id="${MENU}"] .react-flow__handle.source`)
const applyButton = (panel) => panel.getByRole('button', { name: 'Aplicar', exact: true })
const proposalHeadings = (panel) => panel.getByRole('heading', { name: /^Edição pronta/ })

async function openEditor(page, flow = BASE_FLOW) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
  await expect(nodes(page)).toHaveCount(flow.nodes.length)
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

async function start(page) {
  await openEditor(page)
  const panel = await openCopilot(page)
  await typeKey(panel)
  return panel
}

async function ask(panel, text) {
  const input = composer(panel)
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

async function proposal(panel, count = 1) {
  await expect(proposalHeadings(panel)).toHaveCount(count, { timeout: 15000 })
  await expect(applyButton(panel)).toBeEnabled()
  return panel.getByRole('list', { name: 'Mudanças no fluxo aberto' }).nth(count - 1).getByRole('listitem')
}

async function expectUntouched(page, panel) {
  await expect(proposalHeadings(panel)).toHaveCount(0)
  await expect(applyButton(panel)).toHaveCount(0)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect(menuOutputs(page)).toHaveCount(OLD_OPTIONS.length)
  for (const text of OLD_OPTIONS) await expect(canvas(page)).toContainText(text)
  for (const text of NEW_OPTIONS) await expect(canvas(page)).not.toContainText(text)
  expect(await saved(page)).toEqual(BASE_STATE)
}

async function expectReplaced(page, final) {
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const after = await stored(page)
  const menu = after.nodes.find((node) => node.id === MENU)
  expect(optionsOf(menu), 'o menu fica com as 8 opções pedidas, na ordem').toEqual(NEW_OPTIONS)
  expect(after.edges.filter((edge) => edge.source === MENU), 'uma saída para cada opção').toHaveLength(NEW_OPTIONS.length)
  for (const id of OLD_TARGETS) expect(after.nodes.some((node) => node.id === id), `o passo ${id} da opção antiga sai do fluxo`).toBe(false)
  expect(validateFlow(importFlow(after)).filter((issue) => issue.severity === 'error'), 'o fluxo aplicado segue o formato da plataforma').toEqual([])
}

test('8 options on a menu that already has 6: the Copiloto tells the limit and proposes replacing, nothing changes before the confirmation, and after it the build replaces the options', async ({ page, ai }) => {
  expect(MENU, 'o menu do exemplo é o #4').toBe('4')
  expect(optionsOf(MENU_NODE)).toEqual(OLD_OPTIONS)
  const { result } = await expectedReplace()
  const final = result.workflow
  expect(result.rounds, 'a resposta com as 8 opções pedidas não precisa de correção').toBe(1)
  expect(result.changes).toEqual({ added: FRESH.length * 2, changed: 1, removed: OLD_TARGETS.length })
  expect(optionsOf(final.nodes.find((node) => node.id === MENU))).toEqual(NEW_OPTIONS)

  const panel = await start(page)
  ai.say(ASK_LIMIT)
  await ask(panel, LIMIT_REQUEST)
  await expect(messages(panel)).toHaveText([you(LIMIT_REQUEST), says(ASK_LIMIT)])
  await expect(chips(panel)).toHaveText(ASK_LIMIT.suggestions)
  await page.waitForTimeout(300)
  await expectUntouched(page, panel)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls(), 'nada é editado antes da confirmação').toHaveLength(0)
  const turn = ai.turnCalls()[0]
  expect(historyOf(turn)).toContain(LIMIT_REQUEST)
  expect(systemOf(turn), 'o turno recebe o prompt do Copiloto e o resumo do fluxo aberto').toEqual([copilotSystemPrompt(), copilotState(BASE_FLOW, LIMIT_REQUEST)])
  expect(systemOf(turn)[1], 'o resumo conta as opções do menu mesmo com a lista cortada').toContain(`opções (${OLD_OPTIONS.length}): ${OLD_OPTIONS[0]}`)

  ai.say(EDIT_REPLACE)
  ai.builds.push({ steps: [REPLACE_TEXT] })
  await chips(panel).filter({ hasText: REPLACE_CHOICE }).click()
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(LIMIT_REQUEST), says(ASK_LIMIT), you(REPLACE_CHOICE), says(EDIT_REPLACE)])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  const removed = panel.getByText(REMOVED_HINT)
  await expect(removed, 'a proposta mostra o que sai do fluxo').toBeVisible()
  for (const id of OLD_TARGETS) await expect(removed).toContainText(new RegExp(`· ID ${id}(,|\\.)`))
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(menuOutputs(page)).toHaveCount(NEW_OPTIONS.length)
  for (const text of NEW_OPTIONS) await expect(canvas(page)).toContainText(text)
  for (const text of OLD_OPTIONS) await expect(canvas(page)).not.toContainText(text)

  expect(ai.turnCalls()).toHaveLength(2)
  const confirmed = ai.turnCalls()[1]
  expect(historyOf(confirmed)).toContain(ASK_LIMIT.message)
  expect(historyOf(confirmed)).toContain(REPLACE_CHOICE)
  expect(ai.buildCalls(), 'a troca sai em uma rodada, sem correção').toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain('# Modo de edição')
  expect(build).toContain('# Quantidades e limites')
  expect(build).toContain(REPLACE_PLAN)
  expect(build).not.toContain(LIMIT_REQUEST)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(REPLACE_PLAN, { exact: true })).toBeVisible()
  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(LIMIT_REQUEST), says(ASK_LIMIT), you(REPLACE_CHOICE), says(EDIT_REPLACE), APPLIED, says(FOLLOW_UP)])
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expectReplaced(page, final)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('a build answer with 9 options when the plan asked for 8 goes back for a correction round and the final proposal has exactly 8', async ({ page, ai }) => {
  const { result, requests } = await expectedCorrection()
  const final = result.workflow
  expect(result.rounds, 'o motor pede a rodada de correção').toBe(2)
  expect(requests).toHaveLength(2)
  expect(optionsOf(final.nodes.find((node) => node.id === MENU)), 'a proposta final tem as 8 opções pedidas').toEqual(NEW_OPTIONS)
  const correction = lastOf(requests[1].input, 'user')
  expect(correction).toContain('# Pendências')
  expect(correction, 'a revisão aponta a contagem de opções pedida no plano').toContain(`- ${COUNT_ISSUE}`)

  const panel = await start(page)
  const hold = ai.hold()
  ai.say(EDIT_EIGHT)
  ai.builds.push({ steps: [NINE_TEXT] }, { steps: [hold, FIX_TEXT] })
  await ask(panel, EIGHT_REQUEST)
  await hold.reached
  await expect(conversation(panel).getByRole('status')).toHaveText(SECOND_ROUND)
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await expect(canvas(page), 'a prévia mostra a primeira resposta, com a opção a mais').toContainText(EXTRA[0])
  await expect(menuOutputs(page)).toHaveCount(NEW_OPTIONS.length + 1)
  await expect(proposalHeadings(panel)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls(), 'a resposta com 9 opções volta para a correção').toHaveLength(2)
  const [first, second] = ai.buildCalls()
  expect(JSON.stringify(first.body)).toContain(REPLACE_PLAN)
  expect(second.body.input.map((entry) => entry.role).slice(-2)).toEqual(['assistant', 'user'])
  expect(JSON.parse(lastOf(second.body.input, 'assistant')), 'a correção leva a resposta com 9 opções').toEqual(JSON.parse(NINE_TEXT))
  expect(lastOf(second.body.input, 'user'), 'o pedido de correção aponta a contagem de opções').toBe(correction)
  expect(await saved(page)).toEqual(BASE_STATE)

  hold.open()
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true }), 'a proposta final não traz pendência de contagem').toBeVisible()
  await expect(panel.getByText('GPT-6.1 Sol · Esforço equilibrado · 66 tokens', { exact: true }), 'as duas rodadas somam os tokens').toBeVisible()
  await expect(messages(panel)).toHaveText([you(EIGHT_REQUEST), says(EDIT_EIGHT)])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(menuOutputs(page)).toHaveCount(NEW_OPTIONS.length)
  await expect(canvas(page)).not.toContainText(EXTRA[0])
  for (const text of NEW_OPTIONS) await expect(canvas(page)).toContainText(text)
  expect(ai.buildCalls()).toHaveLength(2)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expectReplaced(page, final)
  const after = await stored(page)
  expect(JSON.stringify(after.nodes), 'a opção a mais e a mensagem dela não entram no fluxo').not.toContain(EXTRA[0])
  expect(JSON.stringify(after.nodes)).not.toContain(EXTRA[1])
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(2)
})

test('a build answer past the 10-option limit is never cut silently: the correction round splits it into two menus and every option stays', async ({ page, ai }) => {
  const { result, requests } = await expectedSplit()
  const final = result.workflow
  expect(result.rounds, 'o motor pede a rodada de correção').toBe(2)
  const correction = lastOf(requests[1].input, 'user')
  expect(correction, 'a revisão aponta o limite de opções do menu').toContain(`- ${OVER_ISSUE}`)
  expect(correction, 'e a contagem que o plano pediu').toContain(`- ${OVER_COUNT}`)
  const more = final.nodes.find((node) => node.data.type === 'envio_mensagem' && node.data.data.title === MORE_TITLE)
  expect(optionsOf(final.nodes.find((node) => node.id === MENU))).toEqual([...OLD_OPTIONS, MORE_OPTION])
  expect(optionsOf(more)).toEqual(NEW_OPTIONS)
  expect(result.changes).toEqual({ added: FRESH.length * 2 + 1, changed: 1, removed: 0 })
  const moreOutputs = page.locator(`.react-flow__node[data-id="${more.id}"] .react-flow__handle.source`)

  const panel = await start(page)
  ai.say(ASK_LIMIT)
  await ask(panel, LIMIT_REQUEST)
  await expect(chips(panel)).toHaveText(ASK_LIMIT.suggestions)
  await expectUntouched(page, panel)
  expect(ai.buildCalls()).toHaveLength(0)

  const hold = ai.hold()
  ai.say(EDIT_SPLIT)
  ai.builds.push({ steps: [OVER_TEXT] }, { steps: [hold, SPLIT_TEXT] })
  await chips(panel).filter({ hasText: SPLIT_CHOICE }).click()
  await hold.reached
  await expect(conversation(panel).getByRole('status')).toHaveText(SECOND_ROUND)
  await expect(menuOutputs(page), 'a prévia mostra as 14 opções da primeira resposta, sem corte').toHaveCount(CURRENT.length + FRESH.length)
  for (const text of [...OLD_OPTIONS, ...NEW_OPTIONS]) await expect(canvas(page)).toContainText(text)
  await expect(proposalHeadings(panel)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls(), 'a resposta acima do limite volta para a correção').toHaveLength(2)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(SPLIT_PLAN)
  expect(JSON.parse(lastOf(ai.buildCalls()[1].body.input, 'assistant'))).toEqual(JSON.parse(OVER_TEXT))
  expect(lastOf(ai.buildCalls()[1].body.input, 'user')).toBe(correction)
  expect(await saved(page)).toEqual(BASE_STATE)

  hold.open()
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText(REMOVED_HINT), 'nenhuma opção sai do fluxo').toHaveCount(0)
  await expect(messages(panel)).toHaveText([you(LIMIT_REQUEST), says(ASK_LIMIT), you(SPLIT_CHOICE), says(EDIT_SPLIT)])
  await expect(menuOutputs(page)).toHaveCount(CURRENT.length + 1)
  await expect(moreOutputs).toHaveCount(FRESH.length)
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  for (const text of [...OLD_OPTIONS, MORE_OPTION, ...NEW_OPTIONS]) await expect(canvas(page)).toContainText(text)
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const after = await stored(page)
  expect(optionsOf(after.nodes.find((node) => node.id === MENU)), 'o menu principal fica com as 6 opções e a que leva ao segundo').toEqual([...OLD_OPTIONS, MORE_OPTION])
  expect(optionsOf(after.nodes.find((node) => node.id === more.id)), 'o segundo menu traz as 8 opções novas').toEqual(NEW_OPTIONS)
  expect(after.edges.some((edge) => edge.source === MENU && edge.target === more.id), 'a opção Mais opções leva ao segundo menu').toBe(true)
  for (const id of OLD_TARGETS) expect(after.nodes.some((node) => node.id === id), `o passo ${id} continua no fluxo`).toBe(true)
  expect(validateFlow(importFlow(after)).filter((issue) => issue.severity === 'error')).toEqual([])
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(2)
})
