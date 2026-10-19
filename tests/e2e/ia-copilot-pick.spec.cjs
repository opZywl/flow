require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow, newNode, outputHandles } = require('../../lib/atendimento/format.ts')
const { NOTE_TYPE, START_ID, START_TYPE, getComponentLabel } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { countChanges, flowToRi } = require('../../lib/atendimento/ai/edit.ts')
const { INTERVIEW_SCHEMA_NAME } = require('../../lib/atendimento/ai/interview.ts')
const { PICK_MIN_WIDTH } = require('../../src/flow/canvas-frame.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const SETTINGS_KEY = 'flow.ia'
const HOST = 'api.openai.com'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const FULL_REQUEST = 'Ver o pedido completo'
const PICK_CANCELLED = 'Seleção cancelada. Você pode responder por texto.'
const OUTDATED = 'O fluxo aberto mudou depois deste pedido. Peça de novo para editar a versão atual.'
const FOCUS_MISSED = 'A edição não mudou o componente que você selecionou. Confira se a mudança ficou no lugar certo antes de aplicar.'
const EDIT_NOW_LABEL = 'Editar agora com o que já foi decidido'
const EDIT_NOW = 'Pode editar agora com o que já foi decidido.'
const QUESTION_WAITING = 'Copiloto, pergunta para responder'
const COPILOT_WIDTH = 384
const NARROW = { width: COPILOT_WIDTH + PICK_MIN_WIDTH - 24, height: 1000 }
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

const OTHER_SOURCE = {
  name: 'Atendimento Suporte Exemplo',
  description: 'Saudação, horário e transferência para o suporte',
  nodes: [
    { id: 'saudacao', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no suporte da Loja Exemplo.' }] },
    { id: 'horario', type: 'envio_pergunta', config: [{ key: 'template', value: 'O suporte atende de segunda a sexta, das 8h às 18h.' }] },
    { id: 'suporte', type: 'departamentos', config: [{ key: 'name', value: 'Suporte' }, { key: 'departamento', value: 'suporte' }] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'saudacao' },
    { from: 'saudacao', output: '', to: 'horario' },
    { from: 'horario', output: '', to: 'suporte' },
  ],
}

const BASE_FLOW = assembled(SOURCE)
const OTHER_FLOW = assembled(OTHER_SOURCE)
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
  pick: { label: MENU_LABEL, candidates: MENUS, ready: false },
}
const READY_PLAN = 'Acrescente a opção Segunda via, que envia o link https://boletos.exemplo.com.br e encerra o atendimento, no menu de opções que o usuário selecionar.'
const ASK_READY = {
  message: 'O fluxo tem dois menus de opções. Pensei na opção Segunda via com o link do boleto, seguindo para o encerramento. Em qual menu ela entra?',
  suggestions: [],
  action: 'ask',
  plan: READY_PLAN,
  pick: { label: MENU_LABEL, candidates: MENUS, ready: true },
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
  pick: { label: MESSAGE_LABEL, candidates: MESSAGES, ready: false },
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
const refineAsk = (boleto) => ({
  message: 'A proposta tem cinco mensagens. Selecione no canvas a mensagem que vem antes do aviso.',
  suggestions: [],
  action: 'ask',
  plan: `Na proposta, acrescente a mensagem ${NOTICE_TEXT} logo depois da mensagem que o usuário escolher.`,
  pick: { label: MESSAGE_LABEL, candidates: [...MESSAGES, boleto], ready: false },
})

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

function beforeDelta(flow, beforeId) {
  const edges = flowToRi(flow).edges
  const entering = edges.find((edge) => edge.to === beforeId)
  return {
    name: '',
    description: '',
    nodes: [{ id: 'aviso', type: 'envio_pergunta', config: [{ key: 'template', value: NOTICE_TEXT }] }],
    edges: [
      ...edges.filter((edge) => edge.from === entering.from).map((edge) => (edge.to === beforeId ? { ...edge, to: 'aviso' } : edge)),
      { from: 'aviso', output: '', to: beforeId },
    ],
  }
}

const OPTION_TEXT = JSON.stringify(optionDelta(BASE_FLOW, FINANCE_MENU))
const NOTICE_DELTA = JSON.stringify(noticeDelta(BASE_FLOW, PAYMENTS))
const MAIN_TEXT = JSON.stringify(optionDelta(BASE_FLOW, MAIN_MENU))

const START = START_ID
const START_KIND = getComponentLabel(START_TYPE)
const NOTE = String(Math.max(...NODE_IDS.map(Number).filter(Number.isFinite)) + 1)
const NOTE_TEXT = 'Conferir o texto do aviso com o financeiro antes do feriado.'
const NOTED_FLOW = (() => {
  const flow = JSON.parse(JSON.stringify(BASE_FLOW))
  const note = newNode(NOTE_TYPE, { x: 540, y: 420 }, NOTE)
  note.data.data.text = NOTE_TEXT
  flow.nodes.push(note)
  return importFlow(flow)
})()
const NOTED_IDS = idsOf(NOTED_FLOW)
const NOTED_STATE = { name: NOTED_FLOW.name, nodes: NOTED_IDS }
const COMPONENTS = NOTED_IDS.filter((id) => id !== NOTE)
const OUTLETS = COMPONENTS.filter((id) => outputHandles(NOTED_FLOW.nodes.find((node) => node.id === id)).length > 0)
const ENDS = COMPONENTS.filter((id) => !OUTLETS.includes(id))
const ANY_LABEL = 'o componente que vem antes do aviso'
const ANY_STATUS = 'Clique em qualquer componente com saída.'
const ANY_LIST = `Selecione ${ANY_LABEL} no canvas ou na lista e confirme. Você pode escolher qualquer componente com saída, inclusive o ${START_KIND}.`
const PLACE_REQUEST = 'adicione uma mensagem de aviso'
const PLACE_DRAFT = `Acrescente a mensagem ${NOTICE_TEXT} logo depois do componente que o usuário selecionar no canvas, e o caminho segue como antes.`
const AFTER_CHOICE = 'Logo depois do selecionado'
const BEFORE_CHOICE = 'Logo antes do selecionado'
const ASK_PLACE = {
  message: `Pensei na mensagem ${NOTICE_TEXT} Ela entra logo depois do componente que você selecionar, ou logo antes dele, se preferir. Depois de qual componente ela entra?`,
  suggestions: [AFTER_CHOICE, BEFORE_CHOICE],
  action: 'ask',
  plan: PLACE_DRAFT,
  pick: { label: ANY_LABEL, any: true, candidates: [], ready: false },
}
const START_PLAN = `Logo depois do ${START_KIND}, ID ${START}, acrescente a mensagem ${NOTICE_TEXT} O caminho segue para a mensagem de boas-vindas, ID ${WELCOME}, como antes.`
const EDIT_START = { message: 'Vou colocar o aviso logo depois do início do atendimento, antes das boas-vindas.', suggestions: [], action: 'edit', plan: START_PLAN, pick: null }
const BEFORE_PLAN = `Logo antes do Enviar Mensagem ${PAYMENTS_TEXT} ID ${PAYMENTS}, acrescente a mensagem ${NOTICE_TEXT} A opção Pagamentos do menu ${FINANCE_TITLE} passa a levar ao aviso, e o aviso segue para essa mensagem.`
const EDIT_BEFORE = { message: 'Vou colocar o aviso logo antes da mensagem dos pagamentos.', suggestions: [], action: 'edit', plan: BEFORE_PLAN, pick: null }
const START_NOTICE = JSON.stringify(noticeDelta(NOTED_FLOW, START))
const BEFORE_NOTICE = JSON.stringify(beforeDelta(NOTED_FLOW, PAYMENTS))

const PLACE_LABEL = 'o componente que vem antes do componente novo'
const PLACE_PROPOSED = 'Antes de editar, confirme no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado, e a minha sugestão já está marcada.'
const PLACE_ASK = 'Antes de editar, selecione no canvas onde o componente novo entra. Ele fica logo depois do componente selecionado.'
const PLACE_LIST = `Selecione ${PLACE_LABEL} no canvas ou na lista e confirme. Você pode escolher qualquer componente com saída, inclusive o ${START_KIND}.`
const DISCARDED = 'Proposta descartada. O fluxo aberto não mudou.'
const BASE_OUTLETS = NODE_IDS.filter((id) => outputHandles(BASE_FLOW.nodes.find((node) => node.id === id)).length > 0)
const BASE_END = NODE_IDS.find((id) => !BASE_OUTLETS.includes(id))
const END_KIND = getComponentLabel(BASE_FLOW.nodes.find((node) => node.id === BASE_END).data.type)
const PLACED_EDIT = { message: 'Vou colocar o aviso logo depois da mensagem dos pagamentos.', suggestions: [], action: 'edit', plan: NOTICE_PLAN, pick: null, adds: true, after: PAYMENTS, layout: [] }
const PLACED_QUESTION = { ...PLACED_EDIT, message: 'Pensei em colocar o aviso logo depois da mensagem dos pagamentos. Pode ser nesse ponto?' }
const INVOICES_PLAN = `Depois do Enviar Mensagem ${INVOICES_TEXT} ID ${INVOICES}, acrescente a mensagem ${NOTICE_TEXT}`
const EDIT_INVOICES = { message: 'Vou colocar o aviso logo depois da mensagem das notas fiscais.', suggestions: [], action: 'edit', plan: INVOICES_PLAN, pick: null, adds: true, after: INVOICES, layout: [] }
const CLOSED_PLAN = `Logo antes do ${END_KIND}, ID ${BASE_END}, acrescente a mensagem ${NOTICE_TEXT}`
const CLOSED_EDIT = { message: 'Vou acrescentar a mensagem de aviso no fluxo.', suggestions: [], action: 'edit', plan: CLOSED_PLAN, pick: null, adds: true, after: BASE_END, layout: [] }
const FAREWELL_PLAN = `Depois do Enviar Mensagem ${FAREWELL_TEXT} ID ${FAREWELL}, acrescente a mensagem ${NOTICE_TEXT} O caminho segue para o encerramento como antes.`
const EDIT_FAREWELL = { message: 'Vou colocar o aviso logo depois da mensagem de despedida.', suggestions: [], action: 'edit', plan: FAREWELL_PLAN, pick: null, adds: true, after: FAREWELL, layout: [] }
const TYPED_ANSWER = 'O texto do aviso pode ser esse mesmo'
const PLACE_ANSWER = 'Prefiro este lugar'
const ASK_NOTICE = {
  message: `Pensei na mensagem ${NOTICE_TEXT} Fica assim ou quer outro texto?`,
  suggestions: ['Pode ser assim', 'Quero outro texto'],
  action: 'ask',
  plan: NOTICE_PLAN,
  pick: null,
  adds: true,
  after: PAYMENTS,
  layout: [],
}
const NAMED_REQUESTS = [
  'adicione uma mensagem de aviso depois da mensagem dos pagamentos',
  `adicione uma mensagem de aviso na saída do ID ${PAYMENTS}`,
  'adicione uma mensagem de aviso na saída da mensagem os pagamentos sao confirmados em ate 2 dias uteis',
]
const INVOICES_NOTICE = JSON.stringify(noticeDelta(BASE_FLOW, INVOICES))
const FAREWELL_NOTICE = JSON.stringify(noticeDelta(BASE_FLOW, FAREWELL))

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
const expectedStart = once(() => engineEdit(NOTED_FLOW, START_NOTICE, START_PLAN))
const expectedBefore = once(() => engineEdit(NOTED_FLOW, BEFORE_NOTICE, BEFORE_PLAN))
const expectedInvoices = once(() => engineEdit(BASE_FLOW, INVOICES_NOTICE, INVOICES_PLAN))
const expectedFarewell = once(() => engineEdit(BASE_FLOW, FAREWELL_NOTICE, FAREWELL_PLAN))

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
const focusMarks = (page) => page.locator('.react-flow [data-pick-focus]')
const banner = (page) => page.getByRole('region', { name: 'Seleção no canvas', exact: true })
const bannerButton = (page, name) => banner(page).getByRole('button', { name, exact: true })
const bannerStatus = (page) => banner(page).getByRole('status')
const chosenStatus = (kind, snippet, id) => new RegExp(`^Selecionado: ${escape(kind)}\\b.*${escape(snippet)}.* · ID ${escape(id)}$`)
const HINT = 'Clique em um dos componentes destacados.'
const selection = (panel) => panel.getByRole('region', { name: 'Seleção do componente', exact: true })
const confirmChoice = (panel) => selection(panel).getByRole('button', { name: 'Confirmar seleção', exact: true })
const removeButtons = (page) => page.getByRole('button', { name: /^Remover .+, ID \S+$/ })
const transformOf = (page, id) => nodeAt(page, id).evaluate((element) => element.style.transform)
const marks = (ids, mark) => Object.fromEntries(ids.map((id) => [id, mark]))
const applyButton = (panel) => panel.getByRole('button', { name: 'Aplicar', exact: true })
const editNowOffered = (panel) => panel.getByRole('button', { name: EDIT_NOW_LABEL, exact: true, disabled: false })
const backgroundButton = (page) => page.getByRole('button', { name: 'Imagem de fundo', exact: true })
const backgroundMenu = (page) => page.getByRole('group', { name: 'Opções da imagem de fundo', exact: true })
const libraryToggle = (page) => page.getByRole('button', { name: 'Componentes', exact: true })
const componentLibrary = (page) => page.getByLabel('Biblioteca de componentes')
const discardButton = (panel) => panel.getByRole('button', { name: 'Descartar', exact: true })
const proposedLine = (panel) => selection(panel).getByText(/^Sugestão do Copiloto: /)
const proposedText = (kind, snippet, id) => new RegExp(`^Sugestão do Copiloto: ${escape(kind)}\\b.*${escape(snippet)}.* · ID ${escape(id)}\\.$`)
const editRequest = (plan, kind, snippet, id) => new RegExp(`# Pedido de edição\\n${escape(plan)}\\n\\n${pickedText(kind, snippet, id)}\\n\\n# Entrega`)
const CARRIED = /^A seleção vai junto: /
const carriedText = (kind, snippet, id) => new RegExp(`^A seleção vai junto: ${escape(kind)}\\b.*${escape(snippet)}.* · ID ${escape(id)}\\.$`)

async function importFile(page, flow, name) {
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
  await expect(nodes(page)).toHaveCount(flow.nodes.length)
}

const framing = (page, ids) => page.evaluate((wanted) => {
  const area = document.querySelector('.react-flow').getBoundingClientRect()
  const zoom = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const node of document.querySelectorAll('.react-flow__node')) {
    const { e: x, f: y } = new DOMMatrixReadOnly(getComputedStyle(node).transform)
    bounds.left = Math.min(bounds.left, x)
    bounds.top = Math.min(bounds.top, y)
    bounds.right = Math.max(bounds.right, x + node.offsetWidth)
    bounds.bottom = Math.max(bounds.bottom, y + node.offsetHeight)
  }
  const whole = Math.min(1, area.width / ((bounds.right - bounds.left) * 1.15), area.height / ((bounds.bottom - bounds.top) * 1.15))
  const inside = wanted.every((id) => {
    const box = document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect()
    return Boolean(box) && box.left >= area.left && box.top >= area.top && box.right <= area.right && box.bottom <= area.bottom
  })
  return { inside, closer: zoom > whole * 1.2 }
}, ids)

const insideCanvas = async (page, ids) => (await framing(page, ids)).inside

async function expectChosen(page, panel, candidates, id, kind) {
  await expectMarks(page, NODE_IDS, { ...marks(candidates, 'candidate'), [id]: 'selected' })
  await expect(markOf(page, id)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerStatus(page)).toHaveText(chosenStatus(kind, SNIPPETS[id], id))
  await expect(choice(panel, id, SNIPPETS[id])).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect.poll(() => insideCanvas(page, [id]), { message: `o componente ${id} aparece no canvas` }).toBe(true)
}

async function expectFramed(page, ids) {
  await expect(async () => {
    await settle(page)
    expect(await framing(page, ids)).toEqual({ inside: true, closer: true })
  }, 'a câmera fica no componente escolhido, com a edição ao lado, em vez de mostrar o fluxo inteiro').toPass({ timeout: 10000 })
}

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

async function seedKey(page) {
  const value = JSON.stringify({ provider: 'openai', keys: { openai: KEY }, models: {}, effortChoice: null, fill: true })
  await page.addInitScript(([name, saved]) => {
    try {
      if (window.sessionStorage.getItem(name) === null) window.sessionStorage.setItem(name, saved)
    } catch {}
  }, [SETTINGS_KEY, value])
}

async function start(page, flow = BASE_FLOW, { library = false } = {}) {
  await seedKey(page)
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await importFile(page, flow, 'base.json')
  if (!library) {
    await libraryToggle(page).click()
    await expect(componentLibrary(page)).toHaveCount(0)
  }
  const panel = await openCopilot(page)
  await expect(panel.getByText('Chave não informada', { exact: true })).toHaveCount(0)
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

test('crie a opção Segunda via with two menus: the canvas outlines both menus, Confirmar sends the chosen one, the camera stays on it and the edit lands on that menu', async ({ page, ai }) => {
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
  await expect(selection(panel)).toContainText(`Selecione ${MENU_LABEL} no canvas ou na lista e confirme.`)
  await expect(confirmChoice(panel)).toBeDisabled()
  await expect(editNowOffered(panel), 'Editar agora espera a seleção').toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  await settle(page)

  await nodeAt(page, MAIN_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })
  await expect(markOf(page, MAIN_MENU)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[MAIN_MENU], MAIN_MENU))
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await nodeAt(page, FINANCE_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
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
  await expectFramed(page, [FINANCE_MENU, boleto])
  await expect(focusMarks(page)).toHaveCount(1)
  await expect(nodeAt(page, FINANCE_MENU).locator('[data-pick-focus]'), 'o menu escolhido continua marcado na prévia').toHaveCount(1)
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)

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
  await expect(focusMarks(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
})

test('a pick marked ready edits as soon as Confirmar is clicked, without another turn, and the request carries the plan and the chosen component', async ({ page, ai }) => {
  const result = await expectedOption()
  const final = result.workflow
  const boleto = idOf(final, BOLETO_TEXT)
  const chosen = youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)
  const panel = await start(page)
  ai.say(ASK_READY)
  await ask(panel, OPTION_REQUEST)

  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_READY)])
  await expect(banner(page)).toContainText(`Selecione ${MENU_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  await expect(selection(panel)).toBeVisible()
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()
  await expect(editNowOffered(panel)).toHaveCount(0)
  await settle(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)

  ai.builds.push({ steps: [OPTION_TEXT] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel).nth(2)).toHaveText(chosen)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel), 'nenhuma resposta nova do Copiloto entre a seleção e a edição').toHaveText([you(OPTION_REQUEST), says(ASK_READY), chosen])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(canvas(page)).toContainText(BOLETO_TEXT)
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(focusMarks(page)).toHaveCount(1)
  await expect(nodeAt(page, FINANCE_MENU).locator('[data-pick-focus]'), 'o menu escolhido fica marcado na prévia').toHaveCount(1)
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)

  expect(ai.turnCalls(), 'Confirmar vai direto para a edição').toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
  const request = lastUser(ai.buildCalls()[0])
  expect(request, 'o pedido de edição leva o plano, uma linha em branco e o componente escolhido').toMatch(new RegExp(`# Pedido de edição\\n${escape(READY_PLAN)}\\n\\n${pickedText(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)}\\n\\n# Entrega`))
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_READY), chosen, APPLIED, says(FOLLOW_UP)])
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const after = await stored(page)
  expect(after.edges.some((edge) => edge.source === FINANCE_MENU && edge.target === boleto), 'a opção nova sai do menu selecionado').toBe(true)
  expect(after.edges.some((edge) => edge.source === MAIN_MENU && edge.target === boleto)).toBe(false)
  await page.waitForTimeout(300)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
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
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
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
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
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
  const askRefine = refineAsk(boleto)
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
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, 'Acesse a segunda via', boleto))
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

test('while a selection is open, Editar agora is not offered and Aplicar waits, and after Cancelar seleção the earlier proposal applies', async ({ page, ai }) => {
  const first = await expectedMain()
  const boleto = idOf(first.workflow, BOLETO_TEXT)
  const askRefine = refineAsk(boleto)
  const panel = await start(page)
  ai.say(EDIT_MAIN)
  ai.builds.push({ steps: [MAIN_TEXT] })
  await ask(panel, MAIN_REQUEST)
  await proposal(panel)
  await expect(applyButton(panel)).toBeEnabled()

  ai.say(askRefine)
  await ask(panel, REFINE_REQUEST)
  await expect(messages(panel)).toHaveText([you(MAIN_REQUEST), says(EDIT_MAIN), you(REFINE_REQUEST), says(askRefine)])
  await expect(banner(page)).toBeVisible()
  await expect(selection(panel)).toBeVisible()
  await expect(applyButton(panel), 'Aplicar espera a seleção terminar').toBeDisabled()
  await expect(editNowOffered(panel), 'Editar agora sem o componente escolhido').toHaveCount(0)

  await settle(page)
  await nodeAt(page, boleto).click()
  await expect(markOf(page, boleto)).toHaveAttribute('data-pick', 'selected')
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect(confirmChoice(panel)).toBeEnabled()
  await expect(applyButton(panel)).toBeDisabled()
  await expect(editNowOffered(panel)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
  expect(await saved(page)).toEqual(BASE_STATE)

  await selection(panel).getByRole('button', { name: 'Cancelar seleção', exact: true }).click()
  await expectPickOver(page, panel)
  await expect(messages(panel)).toHaveText([you(MAIN_REQUEST), says(EDIT_MAIN), you(REFINE_REQUEST), says(askRefine), PICK_CANCELLED])
  await expect(composer(panel)).toBeFocused()
  await expect(editNowOffered(panel), 'o plano que dependia da seleção não vira edição').toHaveCount(0)
  await expect(applyButton(panel)).toBeEnabled()
  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(first.workflow) })
  const applied = await stored(page)
  expect(applied.edges.some((edge) => edge.source === MAIN_MENU && edge.target === boleto)).toBe(true)
  expect(applied.nodes.some((node) => JSON.stringify(node.data).includes(NOTICE_TEXT)), 'o aviso da seleção cancelada não entra').toBe(false)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('a selection left open when the panel closes comes back on the same flow and is dropped with a note when the panel reopens on another flow', async ({ page, ai }) => {
  await watchPicks(page)
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await settle(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })

  await trigger(page).click()
  await expect(panel).toBeHidden()
  await expect(banner(page)).toHaveCount(0)
  await expect(marked(page)).toHaveCount(0)
  await expect(trigger(page), 'o botão lembra a seleção pendente').toHaveAccessibleName(QUESTION_WAITING)
  await trigger(page).click()
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName('Copiloto')
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'candidate', [FINANCE_MENU]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  await expect(choice(panel, FINANCE_MENU, SNIPPETS[FINANCE_MENU])).toHaveAttribute('aria-pressed', 'true')
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU)])

  await trigger(page).click()
  await expect(panel).toBeHidden()
  await expect(banner(page)).toHaveCount(0)
  await expect(trigger(page)).toHaveAccessibleName(QUESTION_WAITING)
  await importFile(page, OTHER_FLOW, 'outro.json')
  await page.evaluate(() => {
    window.__pickSeen = false
  })
  await trigger(page).click()
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName('Copiloto')
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), OUTDATED])
  await frames(page)
  await expectPickOver(page, panel)
  expect(await pickSeen(page), 'o canvas não seleciona componentes do outro fluxo').toBe(false)
  await expect(nodes(page)).toHaveCount(OTHER_FLOW.nodes.length)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('the banner names the selected component with its text, Anterior and Próximo walk through the candidates and Enter on the selected one confirms', async ({ page, ai }) => {
  const result = await expectedNotice()
  const panel = await start(page)
  ai.say(ASK_MESSAGE)
  await ask(panel, NOTICE_REQUEST)
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, marks(MESSAGES, 'candidate'))
  await expect(bannerStatus(page)).toHaveText(HINT)
  await expect(bannerButton(page, 'Anterior')).toBeEnabled()
  await expect(bannerButton(page, 'Próximo')).toBeEnabled()
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()

  const walk = [
    ['Próximo', WELCOME],
    ['Próximo', PAYMENTS],
    ['Próximo', INVOICES],
    ['Próximo', FAREWELL],
    ['Próximo', WELCOME],
    ['Anterior', FAREWELL],
    ['Anterior', INVOICES],
    ['Anterior', PAYMENTS],
  ]
  for (const [step, id] of walk) {
    await bannerButton(page, step).click()
    await expectChosen(page, panel, MESSAGES, id, MESSAGE_KIND)
  }
  expect(ai.turnCalls()).toHaveLength(1)

  await settle(page)
  await markOf(page, INVOICES).focus()
  await page.keyboard.press('Enter')
  await expectChosen(page, panel, MESSAGES, INVOICES, MESSAGE_KIND)
  await markOf(page, PAYMENTS).focus()
  await page.keyboard.press('Enter')
  await expectChosen(page, panel, MESSAGES, PAYMENTS, MESSAGE_KIND)
  await expect(banner(page)).toBeVisible()
  expect(ai.turnCalls(), 'Enter num candidato só seleciona').toHaveLength(1)

  ai.say(EDIT_NOTICE)
  ai.builds.push({ steps: [NOTICE_DELTA] })
  await expect(markOf(page, PAYMENTS)).toBeFocused()
  await page.keyboard.press('Enter')
  await expectPickOver(page, panel)
  const sent = youPicked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(NOTICE_REQUEST), says(ASK_MESSAGE), sent, says(EDIT_NOTICE)])
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(lastUser(ai.turnCalls()[1])).toMatch(picked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(NOTICE_PLAN)
})

test('an answer typed with a candidate selected goes to the AI with the selection, so the choice is not lost', async ({ page, ai }) => {
  const result = await expectedOption()
  const typed = 'Pode usar o link do boleto'
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await settle(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expect(markOf(page, FINANCE_MENU)).toHaveAttribute('data-pick', 'selected')

  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await ask(panel, typed)
  await expectPickOver(page, panel)
  const chosen = youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), chosen, you(typed), says(EDIT_OPTION)])
  expect(ai.turnCalls()).toHaveLength(2)
  const second = lastUser(ai.turnCalls()[1])
  expect(second, 'a resposta digitada leva o componente selecionado').toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(second).toContain(typed)
  expect(ai.buildCalls()).toHaveLength(1)
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
})

test('Outro in the selection box opens a field there: Esc closes only the field, and the typed answer goes to the AI with the selected menu', async ({ page, ai }) => {
  const result = await expectedOption()
  const typed = 'Coloque a opção no menu financeiro, depois da última'
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await settle(page)
  const box = selection(panel)
  const other = box.getByRole('button', { name: 'Outro', exact: true })
  await expect(other).toBeVisible()
  await other.click()
  const field = box.getByLabel('Escreva outra resposta', { exact: true })
  await expect(field).toBeFocused()
  await expect(box.getByRole('button', { name: 'Enviar resposta', exact: true })).toBeDisabled()
  await field.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(banner(page), 'o Esc do campo fecha só o campo').toBeVisible()
  await expect(other).toBeVisible()

  await nodeAt(page, FINANCE_MENU).click()
  await expect(markOf(page, FINANCE_MENU)).toHaveAttribute('data-pick', 'selected')
  await other.click()
  await expect(box.getByText(/^A seleção vai junto: Menu de Opções/)).toBeVisible()
  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await field.fill(typed)
  await field.press('Enter')
  await expectPickOver(page, panel)
  const chosen = youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), chosen, you(typed), says(EDIT_OPTION)])
  expect(ai.turnCalls()).toHaveLength(2)
  const second = lastUser(ai.turnCalls()[1])
  expect(second, 'a resposta do Outro leva o componente selecionado').toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(second).toContain(typed)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('a double click on a candidate selects and confirms it in one gesture', async ({ page, ai }) => {
  const result = await expectedOption()
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  await settle(page)

  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await nodeAt(page, FINANCE_MENU).dblclick()
  await expectPickOver(page, panel)
  const chosen = youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), chosen, says(EDIT_OPTION)])
  await expect(nodes(page)).toHaveCount(result.workflow.nodes.length)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(lastUser(ai.turnCalls()[1])).toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(OPTION_PLAN)
})

test('Esc on the open Imagem de fundo menu closes only the menu and the selection stays until the next Esc', async ({ page, ai }) => {
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await settle(page)
  await nodeAt(page, MAIN_MENU).click()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })

  await backgroundButton(page).click()
  await expect(backgroundMenu(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(backgroundMenu(page)).toHaveCount(0)
  await expect(backgroundButton(page)).toBeFocused()
  await expect(backgroundButton(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, { [MAIN_MENU]: 'selected', [FINANCE_MENU]: 'candidate' })
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[MAIN_MENU], MAIN_MENU))
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect(selection(panel)).toBeVisible()
  await expect(choice(panel, MAIN_MENU, SNIPPETS[MAIN_MENU])).toHaveAttribute('aria-pressed', 'true')
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU)])

  await page.keyboard.press('Escape')
  await expectPickOver(page, panel)
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), PICK_CANCELLED])
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('the component library steps aside while picking and comes back when the selection ends, with the chosen menu still in view', async ({ page, ai }) => {
  const result = await expectedOption()
  const boleto = idOf(result.workflow, BOLETO_TEXT)
  const panel = await start(page, BASE_FLOW, { library: true })
  await expect(componentLibrary(page)).toBeVisible()
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  await expect(componentLibrary(page), 'a biblioteca sai durante a seleção').toHaveCount(0)
  await expect(libraryToggle(page)).toBeDisabled()
  await bannerButton(page, 'Cancelar').click()
  await expectPickOver(page, panel)
  await expect(componentLibrary(page), 'a biblioteca volta depois de Cancelar').toBeVisible()
  await expect(libraryToggle(page)).toBeEnabled()

  ai.say(ASK_MENU)
  await ask(panel, 'Prefiro escolher o menu')
  await expectMarks(page, NODE_IDS, marks(MENUS, 'candidate'))
  await expect(componentLibrary(page)).toHaveCount(0)
  await settle(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expect(markOf(page, FINANCE_MENU)).toHaveAttribute('data-pick', 'selected')
  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  await expect(componentLibrary(page), 'a biblioteca volta depois de Confirmar').toBeVisible()
  await expect.poll(() => insideCanvas(page, [FINANCE_MENU]), { message: 'o menu escolhido continua à vista' }).toBe(true)
  await proposal(panel)
  await expectFramed(page, [FINANCE_MENU, boleto])
  expect(ai.turnCalls()).toHaveLength(3)
  expect(lastUser(ai.turnCalls()[2])).toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.buildCalls()).toHaveLength(1)
})

test('when the canvas is too narrow for the selection, it stays in the panel list and the canvas never enters pick mode', async ({ page, ai }) => {
  const result = await expectedOption()
  await page.setViewportSize(NARROW)
  await watchPicks(page)
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)

  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU)])
  await expect(selection(panel)).toBeVisible()
  await expect(selection(panel)).toContainText(`Selecione ${MENU_LABEL} na lista e confirme.`)
  await frames(page)
  await expect(banner(page)).toHaveCount(0)
  await expect(marked(page)).toHaveCount(0)
  expect(await pickSeen(page), 'o canvas estreito não entra no modo de seleção').toBe(false)
  for (const id of MENUS) await expect(choice(panel, id, SNIPPETS[id]), `opção do componente ${id} no painel`).toHaveCount(1)
  await expect(confirmChoice(panel)).toBeDisabled()
  await expect(editNowOffered(panel)).toHaveCount(0)

  await choice(panel, FINANCE_MENU, SNIPPETS[FINANCE_MENU]).click()
  await expect(choice(panel, FINANCE_MENU, SNIPPETS[FINANCE_MENU])).toHaveAttribute('aria-pressed', 'true')
  await expect(choice(panel, MAIN_MENU, SNIPPETS[MAIN_MENU])).toHaveAttribute('aria-pressed', 'false')
  await expect(confirmChoice(panel)).toBeEnabled()
  await expect(banner(page)).toHaveCount(0)
  expect(await pickSeen(page)).toBe(false)

  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })
  await confirmChoice(panel).click()
  await expect(selection(panel)).toBeHidden()
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_MENU), youPicked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU), says(EDIT_OPTION)])
  await expect(nodes(page)).toHaveCount(result.workflow.nodes.length)
  expect(await pickSeen(page)).toBe(false)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(lastUser(ai.turnCalls()[1])).toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.buildCalls()).toHaveLength(1)
})

test('a proposal that leaves the selected component unchanged warns before Aplicar', async ({ page, ai }) => {
  const result = await expectedMain()
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })
  const panel = await start(page)
  ai.say(ASK_MENU)
  await ask(panel, OPTION_REQUEST)
  await expect(banner(page)).toBeVisible()
  await settle(page)
  await nodeAt(page, FINANCE_MENU).click()
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))

  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [MAIN_TEXT] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(panel.getByRole('heading', { name: 'Edição pronta com 1 pendência', exact: true })).toBeVisible()
  await expect(panel.getByText(FOCUS_MISSED, { exact: true }), 'o aviso aparece sem abrir as pendências').toBeVisible()
  await panel.getByText('Ver pendências (1)', { exact: true }).click()
  await expect(panel.getByRole('listitem').filter({ hasText: FOCUS_MISSED })).toHaveText(new RegExp(`${escape(MENU_KIND)} · ID ${escape(FINANCE_MENU)}: ${escape(FOCUS_MISSED)}$`))
  await expect(applyButton(panel)).toBeEnabled()
  expect(ai.turnCalls()).toHaveLength(2)
  expect(lastUser(ai.turnCalls()[1])).toMatch(picked(MENU_KIND, SNIPPETS[FINANCE_MENU], FINANCE_MENU))
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(OPTION_PLAN)
  expect(await saved(page)).toEqual(BASE_STATE)
})

test('adicione uma mensagem de aviso without a position: the whole canvas is offered, Início included and the note dimmed, and the notice lands right after the chosen component', async ({ page, ai }) => {
  const result = await expectedStart()
  expect(result.changes).toEqual({ added: 1, changed: 0, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const candidates = marks(OUTLETS, 'candidate')
  expect(ENDS.length, 'o fluxo do teste tem componentes sem saída').toBeGreaterThan(0)
  const chosen = youPicked(START_KIND, '', START)
  const panel = await start(page, NOTED_FLOW)
  ai.say(ASK_PLACE)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(ASK_PLACE)])
  await expect(banner(page)).toContainText(`Selecione ${ANY_LABEL} no canvas.`)
  await expect(bannerStatus(page)).toHaveText(ANY_STATUS)
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()
  await expectMarks(page, NOTED_IDS, candidates)
  await expect(markOf(page, NOTE), 'a nota fica esmaecida, fora da seleção').toHaveAttribute('data-pick', 'dimmed')
  await expect(markOf(page, START), 'o Iniciar Fluxo também é candidato').toHaveAttribute('role', 'button')
  await expect(markOf(page, START)).toHaveAttribute('aria-label', `${START_KIND}, ID ${START}`)
  await expect(page.locator('.react-flow__edge')).toHaveCount(NOTED_FLOW.edges.length)
  await expect(page.locator('.react-flow__edge.opacity-30'), 'nenhuma conexão fica esmaecida').toHaveCount(0)
  await expect(selection(panel)).toContainText(ANY_LIST)
  const listed = selection(panel).getByRole('list').getByRole('button')
  await expect(listed, 'a lista traz os componentes com saída').toHaveCount(OUTLETS.length)
  expect((await listed.allTextContents()).map((text) => text.match(/\bID (\S+)$/)?.[1]).sort()).toEqual([...OUTLETS].sort())
  for (const id of ENDS) await expect(markOf(page, id), 'componente sem saída fica fora da seleção').toHaveAttribute('data-pick', 'dimmed')
  await expect(selection(panel)).not.toContainText(NOTE_TEXT)
  await expect(chips(panel), 'a pergunta propõe logo depois e sugere logo antes do selecionado').toHaveText([AFTER_CHOICE, BEFORE_CHOICE])
  await expect(editNowOffered(panel)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(inputOf(ai.turnCalls()[0])).toContain(PLACE_REQUEST)
  expect(inputOf(ai.turnCalls()[0]), 'a nota aparece no resumo como anotação').toContain(NOTE_TEXT)

  await settle(page)
  await nodeAt(page, START).click()
  await expectMarks(page, NOTED_IDS, { ...candidates, [START]: 'selected' })
  await expect(markOf(page, START)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerStatus(page)).toHaveText(`Selecionado: ${START_KIND} · ID ${START}`)
  await expect(choice(panel, START, START_KIND)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  expect(ai.turnCalls()).toHaveLength(1)

  ai.say(EDIT_START)
  ai.builds.push({ steps: [START_NOTICE] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel).nth(2)).toHaveText(chosen)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(ASK_PLACE), chosen, says(EDIT_START)])
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText(FOCUS_MISSED, { exact: true }), 'o aviso entrou na saída do componente escolhido').toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(focusMarks(page)).toHaveCount(1)
  await expect(nodeAt(page, START).locator('[data-pick-focus]'), 'o componente escolhido fica marcado na prévia').toHaveCount(1)

  expect(ai.turnCalls(), 'a seleção volta para a IA, que escreve o pedido com o componente escolhido').toHaveLength(2)
  const second = ai.turnCalls()[1]
  expect(lastUser(second), 'o turno seguinte recebe o componente selecionado').toMatch(picked(START_KIND, '', START))
  expect(historyOf(second)).toContain(ASK_PLACE.message)
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain(START_PLAN)
  expect(build).not.toContain(PICKED)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(NOTED_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(ASK_PLACE), chosen, says(EDIT_START), APPLIED, says(FOLLOW_UP)])
  await expect.poll(() => saved(page)).toEqual({ name: NOTED_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === START).map((edge) => edge.target), 'o aviso entra logo depois do Iniciar Fluxo').toEqual([notice])
  expect(applied.edges.some((edge) => edge.source === notice && edge.target === WELCOME), 'o caminho segue para as boas-vindas como antes').toBe(true)
  expect(applied.nodes.find((node) => node.id === NOTE).data, 'a nota continua como estava').toEqual(NOTED_FLOW.nodes.find((node) => node.id === NOTE).data)
  await expect(marked(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('in a whole canvas selection, the suggestion to place it before carries the selected component and the notice lands right before it', async ({ page, ai }) => {
  const result = await expectedBefore()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const chosen = youPicked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS)
  const panel = await start(page, NOTED_FLOW)
  ai.say(ASK_PLACE)
  await ask(panel, PLACE_REQUEST)
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NOTED_IDS, marks(OUTLETS, 'candidate'))
  await expect(chips(panel)).toHaveText([AFTER_CHOICE, BEFORE_CHOICE])
  await settle(page)
  await nodeAt(page, PAYMENTS).click()
  await expect(markOf(page, PAYMENTS)).toHaveAttribute('data-pick', 'selected')
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))

  ai.say(EDIT_BEFORE)
  ai.builds.push({ steps: [BEFORE_NOTICE] })
  await chips(panel).filter({ hasText: BEFORE_CHOICE }).click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(ASK_PLACE), chosen, you(BEFORE_CHOICE), says(EDIT_BEFORE)])
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  await expect(nodeAt(page, PAYMENTS).locator('[data-pick-focus]'), 'a mensagem escolhida fica marcada na prévia').toHaveCount(1)
  expect(ai.turnCalls()).toHaveLength(2)
  const second = lastUser(ai.turnCalls()[1])
  expect(second, 'a sugestão leva o componente selecionado').toMatch(picked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(second).toContain(BEFORE_CHOICE)
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(BEFORE_PLAN)
  expect(await saved(page)).toEqual(NOTED_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: NOTED_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.target === PAYMENTS).map((edge) => edge.source), 'o aviso entra logo antes da mensagem selecionada').toEqual([notice])
  expect(applied.edges.some((edge) => edge.source === FINANCE_MENU && edge.target === notice), 'a opção Pagamentos passa pelo aviso').toBe(true)
  expect(applied.edges.some((edge) => edge.source === PAYMENTS && edge.target === notice)).toBe(false)
})

test('an edit that creates a component without the place opens the whole canvas selection with the suggestion of the Copiloto marked, builds nothing before Confirmar, and Confirmar on the suggestion edits right away with the plan', async ({ page, ai }) => {
  const result = await expectedNotice()
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const candidates = marks(BASE_OUTLETS, 'candidate')
  const chosen = youPicked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS)
  expect(BASE_OUTLETS, 'a sugestão do Copiloto tem saída').toContain(PAYMENTS)
  const panel = await start(page)
  ai.say(PLACED_EDIT)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED)])
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, { ...candidates, [PAYMENTS]: 'selected' })
  await expect(markOf(page, PAYMENTS)).toHaveAttribute('aria-pressed', 'true')
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await expect(bannerButton(page, 'Confirmar')).toBeEnabled()
  await expect.poll(() => insideCanvas(page, [PAYMENTS]), { message: 'a sugestão do Copiloto aparece no canvas' }).toBe(true)
  await expect(selection(panel)).toContainText(PLACE_LIST)
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await expect(selection(panel).getByRole('list').getByRole('button'), 'a lista traz os componentes com saída').toHaveCount(BASE_OUTLETS.length)
  await expect(choice(panel, PAYMENTS, SNIPPETS[PAYMENTS])).toHaveAttribute('aria-pressed', 'true')
  await expect(confirmChoice(panel)).toBeEnabled()
  await expect(chips(panel)).toHaveCount(0)
  await expect(editNowOffered(panel)).toHaveCount(0)
  await settle(page)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  await expect(canvas(page)).not.toContainText(NOTICE_TEXT)
  await expect(panel.getByRole('heading', { name: /^Edição pronta/ })).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls(), 'nada é montado antes de Confirmar').toHaveLength(0)
  const format = ai.turnCalls()[0].body.text.format
  expect(format).toMatchObject({ type: 'json_schema', strict: true, name: INTERVIEW_SCHEMA_NAME })
  expect(format.schema.required, 'o Copiloto responde sempre se cria componente e depois de qual').toEqual(expect.arrayContaining(['adds', 'after', 'layout']))
  expect(await saved(page)).toEqual(BASE_STATE)

  ai.builds.push({ steps: [NOTICE_DELTA] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel).nth(2)).toHaveText(chosen)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel), 'nenhuma resposta nova do Copiloto entre a confirmação e a edição').toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED), chosen])
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(focusMarks(page)).toHaveCount(1)
  await expect(nodeAt(page, PAYMENTS).locator('[data-pick-focus]'), 'a sugestão confirmada fica marcada na prévia').toHaveCount(1)
  expect(ai.turnCalls(), 'Confirmar na sugestão vai direto para a edição').toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
  expect(lastUser(ai.buildCalls()[0]), 'o pedido de edição leva o plano e o componente confirmado').toMatch(editRequest(NOTICE_PLAN, MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED), chosen, APPLIED, says(FOLLOW_UP)])
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === PAYMENTS).map((edge) => edge.target), 'o aviso entra logo depois da sugestão confirmada').toEqual([notice])
  await expect(marked(page)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('choosing a component other than the suggestion asks the AI once more before the edit, and the question of the AI stays as the message', async ({ page, ai }) => {
  const result = await expectedInvoices()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const candidates = marks(BASE_OUTLETS, 'candidate')
  const sent = youPicked(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES)
  const panel = await start(page)
  ai.say(PLACED_QUESTION)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel), 'a pergunta da IA fica como mensagem da seleção').toHaveText([you(PLACE_REQUEST), says(PLACED_QUESTION)])
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, { ...candidates, [PAYMENTS]: 'selected' })
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await settle(page)
  await nodeAt(page, INVOICES).click()
  await expectMarks(page, NODE_IDS, { ...candidates, [INVOICES]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES))
  await expect(choice(panel, INVOICES, SNIPPETS[INVOICES])).toHaveAttribute('aria-pressed', 'true')
  await expect(choice(panel, PAYMENTS, SNIPPETS[PAYMENTS])).toHaveAttribute('aria-pressed', 'false')
  await expect(proposedLine(panel), 'a sugestão do Copiloto continua à vista').toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)

  ai.say(EDIT_INVOICES)
  ai.builds.push({ steps: [INVOICES_NOTICE] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACED_QUESTION), sent, says(EDIT_INVOICES)])
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(canvas(page)).toContainText(NOTICE_TEXT)
  await expect(nodes(page)).toHaveCount(final.nodes.length)
  await expect(nodeAt(page, INVOICES).locator('[data-pick-focus]'), 'o componente escolhido fica marcado na prévia').toHaveCount(1)
  expect(ai.calls.map((call) => call.kind), 'outro componente volta para a IA antes da edição').toEqual(['turn', 'turn', 'build'])
  const second = ai.turnCalls()[1]
  expect(lastUser(second), 'o turno seguinte recebe o componente escolhido').toMatch(picked(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES))
  expect(historyOf(second)).toContain(PLACED_QUESTION.message)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain(INVOICES_PLAN)
  expect(build).not.toContain(NOTICE_PLAN)
  expect(build).not.toContain(PICKED)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === INVOICES).map((edge) => edge.target), 'o aviso entra logo depois do componente escolhido').toEqual([notice])
  expect(applied.edges.some((edge) => edge.source === PAYMENTS && edge.target === notice), 'a sugestão recusada fica como estava').toBe(false)
})

test('a request that says where the new component goes edits right away without the selection, and a later request without the place asks for it again', async ({ page, ai }) => {
  const result = await expectedNotice()
  await watchPicks(page)
  const panel = await start(page)
  const shown = []
  for (const [index, request] of NAMED_REQUESTS.entries()) {
    ai.say(PLACED_EDIT)
    ai.builds.push({ steps: [NOTICE_DELTA] })
    await ask(panel, request)
    const cards = await proposal(panel, index + 1)
    await expect(cards).toHaveText(labels(result.changes))
    shown.push(you(request), says(PLACED_EDIT))
    await expect(messages(panel)).toHaveText(shown)
    await expect(canvas(page)).toContainText(NOTICE_TEXT)
    await frames(page)
    await expect(banner(page)).toHaveCount(0)
    await expect(selection(panel)).toHaveCount(0)
    await expect(marked(page)).toHaveCount(0)
    expect(await pickSeen(page), `sem seleção no canvas com o lugar dito em: ${request}`).toBe(false)
    expect(ai.turnCalls()).toHaveLength(index + 1)
    expect(ai.buildCalls()).toHaveLength(index + 1)
    expect(lastUser(ai.turnCalls()[index])).toBe(request)
    expect(lastUser(ai.buildCalls()[index])).toContain(NOTICE_PLAN)
    await discardButton(panel).click()
    shown.push(DISCARDED)
    await expect(messages(panel)).toHaveText(shown)
    await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  }

  ai.say(PLACED_EDIT)
  await ask(panel, PLACE_REQUEST)
  shown.push(you(PLACE_REQUEST), says(PLACE_PROPOSED))
  await expect(messages(panel), 'o lugar dito antes da última proposta não vale para o pedido novo').toHaveText(shown)
  await expect(banner(page)).toBeVisible()
  await expectMarks(page, NODE_IDS, { ...marks(BASE_OUTLETS, 'candidate'), [PAYMENTS]: 'selected' })
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(await pickSeen(page)).toBe(true)
  expect(ai.turnCalls()).toHaveLength(NAMED_REQUESTS.length + 1)
  expect(historyOf(ai.turnCalls().at(-1))).toContain('Proposta pronta no canvas')
  expect(ai.buildCalls()).toHaveLength(NAMED_REQUESTS.length)

  await bannerButton(page, 'Cancelar').click()
  await expectPickOver(page, panel)
  await expect(messages(panel)).toHaveText([...shown, PICK_CANCELLED])
  expect(ai.turnCalls()).toHaveLength(NAMED_REQUESTS.length + 1)
  expect(ai.buildCalls()).toHaveLength(NAMED_REQUESTS.length)
  expect(await saved(page)).toEqual(BASE_STATE)
})

test('when the suggestion of the Copiloto has no output, the selection opens with nothing marked and confirming a component asks the AI once more, so the edit carries a plan written for the chosen component', async ({ page, ai }) => {
  const result = await expectedFarewell()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const chosen = youPicked(MESSAGE_KIND, SNIPPETS[FAREWELL], FAREWELL)
  expect(BASE_END, 'o fluxo do teste tem um componente sem saída').toBeTruthy()
  expect(CLOSED_PLAN, 'o plano da IA foi escrito para o componente sem saída').toContain(`ID ${BASE_END},`)
  const panel = await start(page)
  ai.say(CLOSED_EDIT)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACE_ASK)])
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expect(bannerStatus(page)).toHaveText(ANY_STATUS)
  await expect(bannerButton(page, 'Confirmar')).toBeDisabled()
  await expectMarks(page, NODE_IDS, marks(BASE_OUTLETS, 'candidate'))
  await expect(markOf(page, BASE_END), 'o componente sem saída fica fora da seleção').toHaveAttribute('data-pick', 'dimmed')
  await expect(selection(panel)).toContainText(PLACE_LIST)
  await expect(proposedLine(panel), 'sem sugestão quando o componente sugerido não tem saída').toHaveCount(0)
  await expect(selection(panel).getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(confirmChoice(panel)).toBeDisabled()
  await expect(chips(panel)).toHaveCount(0)
  expect(ai.buildCalls()).toHaveLength(0)

  await settle(page)
  await nodeAt(page, FAREWELL).click()
  await expect(markOf(page, FAREWELL)).toHaveAttribute('data-pick', 'selected')
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[FAREWELL], FAREWELL))
  expect(ai.turnCalls()).toHaveLength(1)
  ai.say(EDIT_FAREWELL)
  ai.builds.push({ steps: [FAREWELL_NOTICE] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel), 'a IA escreve o pedido de novo para o componente escolhido').toHaveText([you(PLACE_REQUEST), says(PLACE_ASK), chosen, says(EDIT_FAREWELL)])
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(nodeAt(page, FAREWELL).locator('[data-pick-focus]'), 'o componente escolhido fica marcado na prévia').toHaveCount(1)
  expect(ai.calls.map((call) => call.kind), 'sem sugestão válida, a seleção volta para a IA antes da edição').toEqual(['turn', 'turn', 'build'])
  const second = ai.turnCalls()[1]
  expect(lastUser(second), 'o turno seguinte recebe o componente escolhido').toMatch(picked(MESSAGE_KIND, SNIPPETS[FAREWELL], FAREWELL))
  expect(historyOf(second)).toContain(PLACE_ASK)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build, 'a edição leva o plano escrito para o componente escolhido').toContain(FAREWELL_PLAN)
  expect(build, 'o plano escrito para o componente sem saída fica de fora').not.toContain(CLOSED_PLAN)
  expect(build).not.toContain(PICKED)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === FAREWELL).map((edge) => edge.target), 'o aviso entra logo depois do componente escolhido').toEqual([notice])
  expect(applied.edges.some((edge) => edge.source === notice && edge.target === BASE_END), 'o caminho segue para o encerramento como antes').toBe(true)
})

test('an answer typed while the place selection only shows the suggestion of the Copiloto goes without a selection, so the AI asks for the place again, and the selection goes along only after the user picks a component', async ({ page, ai }) => {
  const result = await expectedInvoices()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const candidates = marks(BASE_OUTLETS, 'candidate')
  const suggested = { ...candidates, [PAYMENTS]: 'selected' }
  const sent = youPicked(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES)
  const panel = await start(page)
  const box = selection(panel)
  const other = box.getByRole('button', { name: 'Outro', exact: true })
  const field = box.getByLabel('Escreva outra resposta', { exact: true })
  ai.say(PLACED_EDIT)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED)])
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, suggested)
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await other.click()
  await expect(field).toBeFocused()
  await expect(box.getByText(CARRIED), 'a sugestão marcada pelo Copiloto não vai junto com a resposta').toHaveCount(0)
  await field.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(banner(page)).toBeVisible()
  expect(ai.turnCalls()).toHaveLength(1)

  ai.say(PLACED_EDIT)
  await ask(panel, TYPED_ANSWER)
  await expect(messages(panel), 'a resposta vai sozinha e a IA pergunta o lugar de novo').toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED), you(TYPED_ANSWER), says(PLACE_PROPOSED)])
  await expect(messages(panel).filter({ hasText: PICKED }), 'nenhuma seleção que o usuário não fez entra na conversa').toHaveCount(0)
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, suggested)
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await expect(panel.getByRole('heading', { name: /^Edição pronta/ })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  const second = ai.turnCalls()[1]
  expect(lastUser(second), 'a resposta digitada vai sozinha para a IA').toBe(TYPED_ANSWER)
  expect(historyOf(second)).not.toContain(PICKED)
  expect(ai.buildCalls(), 'sem o lugar escolhido pelo usuário, nada é montado').toHaveLength(0)
  expect(await saved(page)).toEqual(BASE_STATE)

  await settle(page)
  await nodeAt(page, INVOICES).click()
  await expectMarks(page, NODE_IDS, { ...candidates, [INVOICES]: 'selected' })
  await expect(bannerStatus(page)).toHaveText(chosenStatus(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES))
  await other.click()
  await expect(field).toBeFocused()
  await expect(box.getByText(CARRIED), 'o componente escolhido pelo usuário vai junto com a resposta').toHaveText(carriedText(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES))
  ai.say(EDIT_INVOICES)
  ai.builds.push({ steps: [INVOICES_NOTICE] })
  await field.fill(PLACE_ANSWER)
  await field.press('Enter')
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(PLACE_PROPOSED), you(TYPED_ANSWER), says(PLACE_PROPOSED), sent, you(PLACE_ANSWER), says(EDIT_INVOICES)])
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(nodeAt(page, INVOICES).locator('[data-pick-focus]'), 'o componente escolhido fica marcado na prévia').toHaveCount(1)
  expect(ai.turnCalls()).toHaveLength(3)
  const third = lastUser(ai.turnCalls()[2])
  expect(third, 'a resposta leva o componente que o usuário escolheu').toMatch(picked(MESSAGE_KIND, SNIPPETS[INVOICES], INVOICES))
  expect(third).toContain(PLACE_ANSWER)
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain(INVOICES_PLAN)
  expect(build).not.toContain(NOTICE_PLAN)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === INVOICES).map((edge) => edge.target), 'o aviso entra logo depois do componente escolhido').toEqual([notice])
  expect(applied.edges.some((edge) => edge.source === PAYMENTS && edge.target === notice), 'a sugestão que o usuário não escolheu fica como estava').toBe(false)
})

test('Editar agora after a question opens the place pick right away when a new component has no place yet, without another turn, and nothing is built before Confirmar', async ({ page, ai }) => {
  const result = await expectedNotice()
  expect(result.changes).toEqual({ added: 1, changed: 1, removed: 0 })
  const final = result.workflow
  const notice = idOf(final, NOTICE_TEXT)
  const chosen = youPicked(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS)
  expect(ASK_NOTICE.plan, 'o plano da pergunta já traz o lugar escolhido pela IA').toContain(`ID ${PAYMENTS},`)
  const panel = await start(page)
  ai.say(ASK_NOTICE)
  await ask(panel, PLACE_REQUEST)

  await expect(messages(panel)).toHaveText([you(PLACE_REQUEST), says(ASK_NOTICE)])
  await expect(chips(panel)).toHaveText(ASK_NOTICE.suggestions)
  await expect(banner(page)).toHaveCount(0)
  await expect(selection(panel)).toHaveCount(0)
  const editNow = editNowOffered(panel)
  await expect(editNow).toBeVisible()
  await expect(editNow).toHaveText('Editar agora')
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)

  await editNow.click()
  await expect(messages(panel), 'Editar agora abre a seleção do lugar sem outra volta da IA').toHaveText([you(PLACE_REQUEST), says(ASK_NOTICE), you(EDIT_NOW), says(PLACE_PROPOSED)])
  await expect(banner(page)).toContainText(`Selecione ${PLACE_LABEL} no canvas.`)
  await expectMarks(page, NODE_IDS, { ...marks(BASE_OUTLETS, 'candidate'), [PAYMENTS]: 'selected' })
  await expect(proposedLine(panel)).toHaveText(proposedText(MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  await expect(editNowOffered(panel), 'Editar agora espera a seleção').toHaveCount(0)
  await expect(panel.getByRole('heading', { name: /^Edição pronta/ })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toHaveCount(0)
  await expect(nodes(page)).toHaveCount(BASE_FLOW.nodes.length)
  expect(ai.turnCalls(), 'Editar agora abre a seleção sem chamar a IA de novo').toHaveLength(1)
  expect(ai.buildCalls(), 'nada é montado com o lugar que só a IA escolheu').toHaveLength(0)
  expect(await saved(page)).toEqual(BASE_STATE)

  ai.builds.push({ steps: [NOTICE_DELTA] })
  await bannerButton(page, 'Confirmar').click()
  await expectPickOver(page, panel)
  const cards = await proposal(panel)
  await expect(cards).toHaveText(labels(result.changes))
  await expect(messages(panel), 'Confirmar na sugestão vai direto para a edição').toHaveText([you(PLACE_REQUEST), says(ASK_NOTICE), you(EDIT_NOW), says(PLACE_PROPOSED), chosen])
  await expect(panel.getByText(FOCUS_MISSED, { exact: true })).toHaveCount(0)
  await expect(nodeAt(page, PAYMENTS).locator('[data-pick-focus]'), 'o lugar confirmado fica marcado na prévia').toHaveCount(1)
  expect(ai.calls.map((call) => call.kind)).toEqual(['turn', 'build'])
  expect(lastUser(ai.buildCalls()[0]), 'o pedido de edição leva o plano e o lugar confirmado').toMatch(editRequest(NOTICE_PLAN, MESSAGE_KIND, SNIPPETS[PAYMENTS], PAYMENTS))
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await applyButton(panel).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: BASE_FLOW.name, nodes: idsOf(final) })
  const applied = await stored(page)
  expect(applied.edges.filter((edge) => edge.source === PAYMENTS).map((edge) => edge.target), 'o aviso entra logo depois do lugar confirmado').toEqual([notice])
})
