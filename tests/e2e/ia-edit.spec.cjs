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
const EDIT_BANNER = 'Editando com IA. As mudanças aparecem aqui conforme chegam.'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte na janela da IA.'
const CREATE_BANNER = 'Gerando com IA. O fluxo aparece aqui conforme é criado.'
const EDIT_BLOCKED = 'Disponível quando o fluxo aberto tem componentes além do Início.'
const FILL_ON = 'Nomes, IDs e URLs saem sempre preenchidos. Os valores provisórios aparecem em Dados da plataforma para você conferir.'
const FILL_OFF = 'Dados cadastrados na plataforma, como nomes, IDs e URLs, ficam em branco para você completar no editor.'
const BOLETO_TEXT = 'Acesse a segunda via em https://boletos.exemplo.com.br.'
const NEW_OPTION = 'Segunda via de boleto'

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
const components = (flow) => flow.nodes.filter((node) => node.data.type !== START_TYPE).length

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

let expected
function expectedEdit() {
  expected ??= (async () => {
    const { runGeneration } = require('../../lib/atendimento/ai/runner.ts')
    const body = script([TEXT]).join('')
    const result = await runGeneration(
      { provider: 'openai', model: 'gpt-6.1-sol', apiKey: KEY, prompt: PROMPT, size: 'auto', effort: 'medium', mode: 'edit', base: BASE_FLOW, fill: true },
      { transport: 'server', signal: new AbortController().signal, fetch: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) },
    )
    if (!result.success) throw new Error(`O motor não aplicou a edição de referência: ${result.error}`)
    return result
  })()
  return expected
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
      ai.calls.push({ url: request.url(), body: request.postDataJSON() })
      const reply = ai.replies.shift() ?? { steps: [TEXT] }
      if (reply.blocked) return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': 'https://platform.openai.com' }, body: '' })
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
  },
})

test.use({ ignoreHTTPSErrors: true })

async function openEditor(page) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
}

async function openDialog(page) {
  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Gerar fluxo com IA' })).toBeVisible()
  return dialog
}

async function chooseMode(dialog, name) {
  const radio = dialog.page().getByRole('radio', { name, exact: true })
  await dialog.locator('label', { has: radio }).click()
  await expect(radio).toBeChecked()
}

async function requestEdit(dialog, { watch = false } = {}) {
  await dialog.getByLabel('Chave da API da OpenAI').fill(KEY)
  await chooseMode(dialog, 'Editar o fluxo aberto')
  await dialog.getByLabel('O que mudar no fluxo aberto').fill(PROMPT)
  const box = dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' })
  if (watch) await box.check()
  else await box.uncheck()
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: flow.nodes.map((node) => node.id) }
}
const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library') || '[]').map((entry) => ({ id: entry.id, name: entry.flow.name, nodes: entry.flow.nodes.map((node) => node.id) })))

async function boxes(page) {
  return page.locator('.react-flow__node').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { id: element.getAttribute('data-id'), x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }))
}

test('editing the open flow adds a menu option, keeps the other components and applies as one undoable step in the same Meus fluxos entry', async ({ page, ai }) => {
  const result = await expectedEdit()
  const final = result.workflow
  const added = final.nodes.filter((node) => !BASE_FLOW.nodes.some((entry) => entry.id === node.id))
  expect(added).toHaveLength(2)
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })

  await openEditor(page)
  await page.getByRole('button', { name: 'Novo fluxo', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Meus fluxos, 1', exact: true }).click()
  await page.getByRole('button', { name: `Abrir ${BASE_FLOW.name}`, exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  const entry = (await library(page))[0]
  expect(entry).toEqual({ id: entry.id, ...BASE_STATE })

  const dialog = await openDialog(page)
  await expect(dialog.getByRole('radio', { name: 'Criar fluxo novo', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: 'Editar o fluxo aberto', exact: true })).toBeEnabled()
  await requestEdit(dialog)
  await expect(dialog.getByLabel('O que mudar no fluxo aberto')).toHaveAttribute('placeholder', /^Ex\.: No menu principal, acrescente a opção/)
  await expect(dialog.getByLabel('Descrição do atendimento')).toHaveCount(0)
  await expect(dialog.getByRole('combobox', { name: 'Tamanho do fluxo' })).toBeHidden()
  await expect(dialog.getByRole('checkbox', { name: 'Preencher todos os campos' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Editar fluxo', exact: true }).click()

  const apply = dialog.getByRole('button', { name: 'Aplicar alterações' })
  await expect(apply).toBeFocused({ timeout: 15000 })
  await expect(dialog.getByRole('heading', { name: /^Edição pronta/ })).toBeVisible()
  await expect(dialog.getByRole('list', { name: 'Mudanças no fluxo aberto' }).getByRole('listitem')).toHaveText(['2 componentes novos', '1 alterado', '0 removidos'])
  await expect(dialog.getByRole('list', { name: 'Resumo do fluxo editado' }).getByRole('listitem').first()).toHaveText(`${components(final)} componentes`)
  await expect(dialog.getByRole('button', { name: 'Importar para o editor' })).toHaveCount(0)
  await expect(dialog.getByText('Aplicar alterações atualiza o fluxo aberto no editor. Para voltar ao fluxo anterior, use Desfazer (Ctrl+Z).')).toBeVisible()
  expect(ai.calls).toHaveLength(1)
  const sent = JSON.stringify(ai.calls[0].body)
  expect(sent).toContain('# Modo de edição')
  expect(sent).toContain('# Fluxo atual')
  expect(sent).toContain(PROMPT)
  expect(ai.fallbacks).toEqual([])
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  expect(await saved(page)).toEqual(BASE_STATE)

  await apply.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Alterações aplicadas', { exact: true })).toBeVisible()
  const nodes = page.locator('.react-flow__node')
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect(page.locator('.react-flow')).toContainText(BOLETO_TEXT)
  await expect(page.locator('.react-flow')).toContainText(NEW_OPTION)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: final.nodes.map((node) => node.id) })

  const after = await stored(page)
  for (const node of BASE_FLOW.nodes) {
    const kept = after.nodes.find((entry) => entry.id === node.id)
    expect(kept, node.id).toBeTruthy()
    expect(kept.position, node.id).toEqual(node.position)
    if (node.id !== MENU_ID) expect(kept.data, node.id).toEqual(node.data)
  }
  for (const edge of BASE_FLOW.edges) {
    if (edge.source !== MENU_ID) expect(after.edges.find((entry) => entry.id === edge.id), edge.id).toEqual(edge)
    else expect(after.edges.find((entry) => entry.source === edge.source && entry.sourceHandle === edge.sourceHandle)?.target, edge.id).toBe(edge.target)
  }

  const placed = await boxes(page)
  const menuBox = placed.find((box) => box.id === MENU_ID)
  for (const node of added) {
    const box = placed.find((entry) => entry.id === node.id)
    expect(box, node.id).toBeTruthy()
    for (const other of placed) {
      if (other.id === box.id) continue
      const apart = box.x >= other.x + other.width || other.x >= box.x + box.width || box.y >= other.y + other.height || other.y >= box.y + box.height
      expect(apart, `${box.id} sobrepõe ${other.id}`).toBe(true)
    }
  }
  const boleto = after.nodes.find((node) => node.data.data.template === BOLETO_TEXT)
  expect(placed.find((box) => box.id === boleto.id).x).toBeGreaterThan(menuBox.x + menuBox.width)

  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect.poll(() => library(page)).toEqual([{ id: entry.id, name: BASE_FLOW.name, nodes: final.nodes.map((node) => node.id) }])

  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await expect(page.locator('.react-flow')).not.toContainText(BOLETO_TEXT)
  await expect(page.locator('.react-flow')).not.toContainText(NEW_OPTION)
  await expect.poll(() => saved(page)).toEqual(BASE_STATE)
  const undone = await stored(page)
  expect(undone.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(BASE_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(undone.edges).toEqual(BASE_FLOW.edges)
})

test('watching an edit starts from the open flow, shows the changes arriving and Descartar leaves the flow as it was', async ({ page, ai }) => {
  const final = (await expectedEdit()).workflow
  const hold = ai.hold()
  ai.replies.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })
  await openEditor(page)
  const dialog = await openDialog(page)
  await requestEdit(dialog, { watch: true })
  await dialog.getByRole('button', { name: 'Editar fluxo', exact: true }).click()

  const panel = page.getByRole('region', { name: 'Geração com IA' })
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Editando fluxo com IA' })).toBeVisible()
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await expect(page.getByText(CREATE_BANNER)).toHaveCount(0)
  await hold.reached
  await expect(canvas).toContainText(BOLETO_TEXT)
  await expect(canvas).toContainText(NEW_OPTION)
  await expect.poll(() => nodes.count()).toBeGreaterThan(BASE_FLOW.nodes.length)
  await expect(canvas).toContainText('Olá, #NAME. Você está no atendimento da Clínica Exemplo.')
  await expect(canvas).toContainText('Obrigado pelo contato. Até logo.')
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled()
  expect(await saved(page)).toEqual(BASE_STATE)

  hold.open()
  const apply = dialog.getByRole('button', { name: 'Aplicar alterações' })
  await expect(apply).toBeFocused({ timeout: 15000 })
  await expect(panel).toHaveCount(0)
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()

  await dialog.getByRole('button', { name: 'Descartar' }).click()
  await expect(dialog.getByText('Edição descartada. O fluxo aberto não mudou.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Editar fluxo', exact: true })).toBeEnabled()
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(nodes).toHaveCount(BASE_FLOW.nodes.length)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(canvas).not.toContainText(BOLETO_TEXT)
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
  expect(await saved(page)).toEqual(BASE_STATE)
  const kept = await stored(page)
  expect(kept.nodes).toEqual(BASE_FLOW.nodes)
  expect(kept.edges).toEqual(BASE_FLOW.edges)
  expect(await library(page)).toEqual([])
})

test('the edit option is disabled while the open flow only has Início', async ({ page }) => {
  await page.goto('/flow')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  let dialog = await openDialog(page)
  const edit = dialog.getByRole('radio', { name: 'Editar o fluxo aberto', exact: true })
  await expect(edit).toBeDisabled()
  await expect(dialog.getByRole('radio', { name: 'Criar fluxo novo', exact: true })).toBeChecked()
  await expect(dialog.getByText(EDIT_BLOCKED)).toBeVisible()
  await expect(dialog.getByLabel('Descrição do atendimento')).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Tamanho do fluxo' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Gerar fluxo', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BASE_FLOW)) })
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  dialog = await openDialog(page)
  await expect(edit).toBeEnabled()
  await expect(dialog.getByText(EDIT_BLOCKED)).toHaveCount(0)
})

test('Preencher todos os campos sends fill true by default and fill false when unchecked, in create and edit', async ({ page, ai }) => {
  await openEditor(page)
  const dialog = await openDialog(page)
  await dialog.getByLabel('Chave da API da OpenAI').fill(KEY)
  await dialog.getByLabel('Descrição do atendimento').fill('Atendimento de clínica com menu para agendar consulta e encerrar.')
  await dialog.getByRole('checkbox', { name: 'Acompanhar no canvas' }).uncheck()
  const fill = dialog.getByRole('checkbox', { name: 'Preencher todos os campos' })
  const failure = dialog.getByText('A rota de reserva não fazia parte deste teste.')
  await expect(fill).toBeChecked()
  await expect(dialog.getByText(FILL_ON)).toBeVisible()

  ai.replies.push({ blocked: true })
  await dialog.getByRole('button', { name: 'Gerar fluxo', exact: true }).click()
  await expect(failure).toBeVisible({ timeout: 15000 })
  expect(ai.fallbacks).toHaveLength(1)
  expect(ai.fallbacks[0]).toMatchObject({ fill: true, size: 'auto', stream: true })
  expect(ai.fallbacks[0]).not.toHaveProperty('mode')
  expect(ai.fallbacks[0]).not.toHaveProperty('base')

  await fill.uncheck()
  await expect(dialog.getByText(FILL_OFF)).toBeVisible()
  await expect(dialog.getByText(FILL_ON)).toHaveCount(0)
  ai.replies.push({ blocked: true })
  await dialog.getByRole('button', { name: 'Gerar fluxo', exact: true }).click()
  await expect.poll(() => ai.fallbacks.length).toBe(2)
  expect(ai.fallbacks[1]).toMatchObject({ fill: false })
  expect(ai.fallbacks[1]).not.toHaveProperty('mode')

  await chooseMode(dialog, 'Editar o fluxo aberto')
  await dialog.getByLabel('O que mudar no fluxo aberto').fill(PROMPT)
  await expect(fill).not.toBeChecked()
  ai.replies.push({ blocked: true })
  await dialog.getByRole('button', { name: 'Editar fluxo', exact: true }).click()
  await expect.poll(() => ai.fallbacks.length).toBe(3)
  expect(ai.fallbacks[2]).toMatchObject({ fill: false, mode: 'edit', prompt: PROMPT, size: 'auto' })
  expect(ai.fallbacks[2].base.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(BASE_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(ai.fallbacks[2].base.edges).toEqual(BASE_FLOW.edges)

  await fill.check()
  ai.replies.push({ blocked: true })
  await dialog.getByRole('button', { name: 'Editar fluxo', exact: true }).click()
  await expect.poll(() => ai.fallbacks.length).toBe(4)
  expect(ai.fallbacks[3]).toMatchObject({ fill: true, mode: 'edit' })
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  expect(await saved(page)).toEqual(BASE_STATE)
  expect(ai.calls.every((call) => !JSON.stringify(call.body).includes(KEY))).toBe(true)
})
