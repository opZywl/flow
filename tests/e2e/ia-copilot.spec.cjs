require('../../scripts/register-typescript.cjs')
const { test: base, expect } = require('@playwright/test')
const crypto = require('node:crypto')
const https = require('node:https')
const { importFlow, maxNumericId, newFlow, newNode } = require('../../lib/atendimento/format.ts')
const { NOTE_TYPE, START_TYPE, getComponentLabel } = require('../../lib/atendimento/catalog.ts')
const { assembleFlow, finalizeFlow } = require('../../lib/atendimento/ai/assemble.ts')
const { flowToRi } = require('../../lib/atendimento/ai/edit.ts')
const { INTERVIEW_SCHEMA_NAME, copilotSystemPrompt, interviewSystemPrompt, interviewMessages } = require('../../lib/atendimento/ai/interview.ts')

const KEY = 'sk-test-0123456789abcdefghijklmnop'
const HOST = 'api.openai.com'
const PROMPT = 'No menu, acrescente a opção Segunda via de boleto, que envia o link do boleto e encerra.'
const REFINE_PROMPT = 'Troque o texto do boleto por um link direto e deixe a despedida mais calorosa.'
const EDIT_BANNER = 'Editando com IA. As mudanças aparecem aqui conforme chegam.'
const EDIT_DONE = 'Edição pronta. Aplique ou descarte no Copiloto.'
const EMPTIED_NOTICE = 'O fluxo ficou só com o Início e as notas. Para exportar o JSON, ligue um componente à saída do Início.'
const FILL_ON = 'Nomes, IDs e URLs saem sempre preenchidos. Os valores provisórios aparecem em Dados da plataforma para você conferir.'
const FILL_OFF = 'Dados cadastrados na plataforma, como nomes, IDs e URLs, ficam em branco para você completar no editor.'
const INTRO = 'O copiloto edita o fluxo aberto a partir do seu pedido. Quando faltar alguma informação, como o texto de uma opção ou o destino de uma transferência, ele pergunta antes de mudar. As mudanças aparecem no canvas para você conferir e só valem quando você aplicar. Desfazer (Ctrl+Z) volta ao fluxo anterior.'
const EXAMPLES = [
  'Peça o CPF do cliente antes do menu principal',
  'Troque a mensagem de boas-vindas por uma mais curta',
  'Fora do horário de atendimento, transfira para o departamento Suporte',
  'Acrescente uma pesquisa de satisfação no fim do atendimento',
]
const APPLIED = 'Alterações aplicadas no fluxo. Desfazer (Ctrl+Z) volta ao anterior.'
const DISCARDED = 'Proposta descartada. O fluxo aberto não mudou.'
const CANCELLED = 'Pedido cancelado. O fluxo aberto não mudou.'
const OLD_NOTICE = /só tem o Início|use Gerar com IA/
const REFINE_HINT = 'O próximo pedido ajusta a proposta mostrada no canvas.'
const FALLBACK_ERROR = 'A rota de reserva não fazia parte deste teste.'
const SUMMARY = 'OpenAI · GPT-6.1 Sol · Esforço equilibrado'
const MISSING = 'Chave não informada'
const SETTINGS_KEY = 'flow.ia'
const SETTINGS_DESCRIPTION = 'A chave, o modelo e o esforço valem para o Gerar com IA e para o Copiloto.'
const KEY_LABEL = 'Chave da API da OpenAI'
const KEY_HINT = 'A chave fica guardada só nesta aba, até você fechar a aba, e serve apenas para chamar a API da OpenAI.'
const KEY_MISSING = 'Informe a chave da API da OpenAI.'
const THINKING = 'Pensando no pedido.'
const FOLLOW_UP = 'Precisa mudar mais alguma coisa no fluxo?'
const EDIT_NOW = 'Pode editar agora com o que já foi decidido.'
const EDIT_NOW_LABEL = 'Editar agora com o que já foi decidido'
const FULL_REQUEST = 'Ver o pedido completo'
const KEY_REJECTED = 'A chave da API foi recusada.'
const KEY_DETAILS = 'Confira a chave da OpenAI e tente novamente.'
const BOLETO_TEXT = 'Acesse a segunda via em https://boletos.exemplo.com.br.'
const FAREWELL = 'Obrigado pelo contato. Até logo.'
const REFINED_BOLETO = 'Segunda via direto no link https://boletos.exemplo.com.br/2via.'
const REFINED_FAREWELL = 'Obrigado pelo contato. Volte sempre que precisar.'
const NEW_OPTION = 'Segunda via de boleto'
const PANEL_WIDTH = 384

const PLAN = 'No menu Como podemos ajudar?, acrescente a opção Segunda via de boleto, que envia o link https://boletos.exemplo.com.br e encerra o atendimento.'
const REFINE_PLAN = 'Na proposta, troque a mensagem da Segunda via de boleto por um link direto para a segunda via e deixe a despedida mais calorosa, convidando o cliente a voltar sempre que precisar.'
const EDIT_TURN = { message: 'Vou acrescentar a opção Segunda via de boleto no menu principal.', suggestions: [], action: 'edit', plan: PLAN }
const REFINE_TURN = { message: 'Vou trocar a mensagem do boleto e a despedida.', suggestions: [], action: 'edit', plan: REFINE_PLAN }
const ASK_EDIT = {
  message: 'A opção Segunda via de boleto entra no fim do menu principal e envia o link do boleto. Fica assim ou quer outro texto?',
  suggestions: ['Pode ser assim', 'Quero outro texto'],
  action: 'ask',
  plan: PLAN,
}

const OPTION_REQUEST = 'crie uma opcao 8'
const OPTION_PLAN = 'No menu Como podemos ajudar?, acrescente a opção 8 Segunda via de boleto, que envia o link https://boletos.exemplo.com.br e encerra o atendimento.'
const ASK_OPTION = {
  message: 'O menu Como podemos ajudar? tem 7 opções. Pensei na opção 8 Segunda via de boleto, que envia o link do boleto e encerra o atendimento. Fica assim ou quer outro texto?',
  suggestions: ['Pode ser assim', 'Quero outro texto', 'Transferir para a recepção'],
  action: 'ask',
  plan: 'No menu Como podemos ajudar?, acrescente a opção 8 Segunda via de boleto.',
}
const EDIT_OPTION = { message: 'Vou acrescentar a opção 8 Segunda via de boleto no fim do menu.', suggestions: [], action: 'edit', plan: OPTION_PLAN }
const OPTIONS = ['Agendar consulta', 'Remarcar consulta', 'Cancelar consulta', 'Resultado de exames', 'Convênios aceitos', 'Endereço e horários', 'Falar com a recepção']

const PET_WELCOME = 'Olá, #NAME. Você está no atendimento do Pet Shop Exemplo.'
const PET_HOURS = 'Atendemos de segunda a sábado, das 8h às 18h.'
const NOTE_TEXT = 'Lembrar de revisar os horários do feriado.'
const START_REQUEST = 'Monte o atendimento do Pet Shop Exemplo com boas-vindas, um menu com Horários e Encerrar e uma despedida.'
const START_PLAN = `A partir do Início, envie a mensagem ${PET_WELCOME} Depois mostre o menu Como podemos ajudar? com as opções Horários e Encerrar. Horários envia ${PET_HOURS} e encerra o atendimento. Encerrar envia ${FAREWELL} e encerra o atendimento.`
const START_TURN = { message: 'Vou montar o atendimento a partir do Início, com as boas-vindas, o menu Como podemos ajudar? e a despedida.', suggestions: [], action: 'edit', plan: START_PLAN }
const START_TEXT = JSON.stringify({
  name: '',
  description: '',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: PET_WELCOME }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify([{ text: 'Horários' }, { text: 'Encerrar' }]) }] },
    { id: 'horarios', type: 'envio_pergunta', config: [{ key: 'template', value: PET_HOURS }] },
    { id: 'fim_horarios', type: 'finalizar', config: [] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: FAREWELL }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Horários', to: 'horarios' },
    { from: 'menu', output: 'Encerrar', to: 'despedida' },
    { from: 'horarios', output: '', to: 'fim_horarios' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
})
const START_CHANGES = ['6 componentes novos', '0 alterados', '0 removidos']

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

const MENU_SOURCE = {
  name: 'Atendimento Clínica Exemplo',
  description: 'Menu principal com sete opções',
  nodes: [
    { id: 'boas_vindas', type: 'envio_pergunta', config: [{ key: 'template', value: 'Olá, #NAME. Você está no atendimento da Clínica Exemplo.' }] },
    { id: 'menu', type: 'envio_mensagem', config: [{ key: 'title', value: 'Como podemos ajudar?' }, { key: 'options', value: JSON.stringify(OPTIONS.map((text) => ({ text }))) }] },
    { id: 'agenda', type: 'departamentos', config: [{ key: 'name', value: 'Agendamento' }, { key: 'departamento', value: 'agendamento' }] },
    { id: 'exames', type: 'envio_pergunta', config: [{ key: 'template', value: 'Os resultados ficam em https://exames.exemplo.com.br.' }] },
    { id: 'convenios', type: 'envio_pergunta', config: [{ key: 'template', value: 'Atendemos os principais convênios da região.' }] },
    { id: 'endereco', type: 'envio_pergunta', config: [{ key: 'template', value: 'Rua das Flores, 100. De segunda a sexta, das 8h às 18h.' }] },
    { id: 'recepcao', type: 'departamentos', config: [{ key: 'name', value: 'Recepção' }, { key: 'departamento', value: 'recepcao' }] },
    { id: 'despedida', type: 'envio_pergunta', config: [{ key: 'template', value: FAREWELL }] },
    { id: 'fim', type: 'finalizar', config: [] },
  ],
  edges: [
    { from: 'inicio', output: '', to: 'boas_vindas' },
    { from: 'boas_vindas', output: '', to: 'menu' },
    { from: 'menu', output: 'Agendar consulta', to: 'agenda' },
    { from: 'menu', output: 'Remarcar consulta', to: 'agenda' },
    { from: 'menu', output: 'Cancelar consulta', to: 'agenda' },
    { from: 'menu', output: 'Resultado de exames', to: 'exames' },
    { from: 'menu', output: 'Convênios aceitos', to: 'convenios' },
    { from: 'menu', output: 'Endereço e horários', to: 'endereco' },
    { from: 'menu', output: 'Falar com a recepção', to: 'recepcao' },
    { from: 'exames', output: '', to: 'despedida' },
    { from: 'convenios', output: '', to: 'despedida' },
    { from: 'endereco', output: '', to: 'despedida' },
    { from: 'despedida', output: '', to: 'fim' },
  ],
}

const assembled = (source) => importFlow(JSON.parse(JSON.stringify(finalizeFlow(assembleFlow(source, { now: new Date('2026-01-15T12:00:00.000Z') })).flow)))

function optionDelta(flow) {
  const ri = flowToRi(flow)
  const menu = ri.nodes.find((node) => node.type === 'envio_mensagem')
  return {
    menu,
    delta: {
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
    },
  }
}

const BASE_FLOW = assembled(SOURCE)
const { menu: MENU, delta: DELTA } = optionDelta(BASE_FLOW)
const MENU_ID = MENU.id
const TEXT = JSON.stringify(DELTA)
const AFTER_NODES = TEXT.indexOf('"edges"')
const BASE_STATE = { name: BASE_FLOW.name, nodes: BASE_FLOW.nodes.map((node) => node.id) }
const MENU_FLOW = assembled(MENU_SOURCE)
const OPTION_TEXT = JSON.stringify(optionDelta(MENU_FLOW).delta)
const NOTE_FLOW = (() => {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = 'Atendimento Pet Shop Exemplo'
  const note = newNode('note', { x: 120, y: 320 }, '2')
  note.data.data.text = NOTE_TEXT
  flow.nodes.push(note)
  return importFlow(JSON.parse(JSON.stringify(flow)))
})()
const NOTE_NODE = NOTE_FLOW.nodes.find((node) => node.data.type === 'note')

const CLEAR_REQUEST = 'limpe o fluxo pra mim'
const CLEAR_ANSWER = 'Pode limpar'
const CLEAR_PLAN = 'Remova todos os componentes do fluxo, mantendo o Início e as notas.'
const ASK_CLEAR = {
  message: 'Vou remover todos os componentes do fluxo, das boas-vindas à despedida, e deixar só o Início e as notas. Posso limpar?',
  suggestions: [CLEAR_ANSWER, 'Manter como está'],
  action: 'ask',
  plan: CLEAR_PLAN,
}
const CLEAR_TURN = { message: 'Vou limpar o fluxo, mantendo só o Início e as notas.', suggestions: [], action: 'edit', plan: CLEAR_PLAN }
const CLEAR_NOTES = [NOTE_TEXT, 'Conferir com a recepção o departamento do agendamento.']
const CLEAR_FLOW = (() => {
  const flow = JSON.parse(JSON.stringify(BASE_FLOW))
  let id = maxNumericId(flow.nodes.map((node) => node.id))
  CLEAR_NOTES.forEach((text, index) => {
    id += 1
    const note = newNode(NOTE_TYPE, { x: 120 + index * 420, y: 640 }, String(id))
    note.data.data.text = text
    flow.nodes.push(note)
  })
  return importFlow(JSON.parse(JSON.stringify(flow)))
})()
const CLEAR_KEPT = CLEAR_FLOW.nodes.filter((node) => node.data.type === START_TYPE || node.data.type === NOTE_TYPE)
const CLEAR_IDS = CLEAR_FLOW.nodes.filter((node) => !CLEAR_KEPT.includes(node)).map((node) => node.id)
const CLEAR_DELTA = { name: '', description: '', nodes: [], edges: [], remove: CLEAR_IDS }
const CLEAR_TEXT = JSON.stringify(CLEAR_DELTA)
const CLEAR_STATE = { name: CLEAR_FLOW.name, nodes: CLEAR_FLOW.nodes.map((node) => node.id) }

const DROPPED_OPTION = 'Resultado de exames'
const EXAMS_TEXT = 'Os resultados ficam em https://exames.exemplo.com.br.'
const DROP_REQUEST = `remova a opção ${DROPPED_OPTION}`

function dropOption(flow, option) {
  const ri = flowToRi(flow)
  const menu = ri.nodes.find((node) => node.type === 'envio_mensagem')
  const branch = []
  let next = ri.edges.find((edge) => edge.from === menu.id && edge.output === option)?.to
  while (next) {
    const at = next
    branch.push(at)
    next = ri.edges.find((edge) => edge.from === at)?.to
  }
  return {
    menu,
    branch,
    delta: {
      name: '',
      description: '',
      nodes: [
        {
          id: menu.id,
          type: 'envio_mensagem',
          config: menu.config.map((entry) => (entry.key === 'options' ? { key: 'options', value: JSON.stringify(JSON.parse(entry.value).filter((item) => item.text !== option)) } : entry)),
        },
      ],
      edges: ri.edges.filter((edge) => edge.from === menu.id && edge.output !== option),
      remove: branch,
    },
  }
}

const DROP = dropOption(MENU_FLOW, DROPPED_OPTION)
const DROP_TEXT = JSON.stringify(DROP.delta)
const DROP_KEPT = OPTIONS.filter((text) => text !== DROPPED_OPTION)
const DROP_PLAN = `No menu Como podemos ajudar?, tire a opção ${DROPPED_OPTION} e remova os componentes que só ela alcança: a mensagem Os resultados ficam em https://exames.exemplo.com.br, ID ${DROP.branch[0]}, a despedida Obrigado pelo contato, ID ${DROP.branch[1]}, e o Encerrar Conversa, ID ${DROP.branch[2]}. As outras opções continuam como estão.`
const DROP_TURN = { message: `Vou tirar a opção ${DROPPED_OPTION} do menu e remover a mensagem e a despedida que só ela usava.`, suggestions: [], action: 'edit', plan: DROP_PLAN }
const MENU_STATE = { name: MENU_FLOW.name, nodes: MENU_FLOW.nodes.map((node) => node.id) }

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
const expectedEdit = () => (expected ??= engineEdit(BASE_FLOW, TEXT, PLAN))

let option
const expectedOption = () => (option ??= engineEdit(MENU_FLOW, OPTION_TEXT, OPTION_PLAN))

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
    return { text, result: await engineEdit(first, text, REFINE_PLAN) }
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
      const reply = kind === 'turn' ? ai.turns.shift() : ai.builds.shift() ?? { steps: [TEXT] }
      if (!reply) {
        ai.unexpected.push(kind)
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Resposta não prevista no teste.', type: 'invalid_request_error' } }) })
      }
      if (reply.blocked) return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': 'https://platform.openai.com' }, body: '' })
      if (reply.status) return route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
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
const editNowButton = (panel) => panel.getByRole('button', { name: EDIT_NOW_LABEL, exact: true })
const composer = (panel) => panel.getByLabel('O que você quer mudar no fluxo', { exact: true })
const sendButton = (panel) => panel.getByRole('button', { name: 'Enviar pedido', exact: true })
const you = (text) => `Você: ${text}`
const says = (turn) => `Copiloto: ${typeof turn === 'string' ? turn : turn.message}`
const inputOf = (call) => JSON.stringify(call.body.input)
const historyOf = (call) => JSON.stringify(call.body.input.filter((entry) => entry.role === 'user' || entry.role === 'assistant'))
const partText = (content) => (typeof content === 'string' ? content : content.map((part) => part.text ?? '').join(''))
const systemOf = (call) => call.body.input.filter((entry) => entry.role === 'developer' || entry.role === 'system').map((entry) => partText(entry.content))
const copilotState = (flow, proposal = false) => interviewMessages({ history: [{ role: 'user', text: PROMPT }], flow, fill: true, scope: 'copilot', proposal })[1].content
function proposalLines(flow) {
  const plain = copilotState(flow).split('\n')
  return copilotState(flow, true).split('\n').filter((line) => line.trim() && !plain.includes(line))
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')))
const saved = async (page) => {
  const flow = await stored(page)
  return { name: flow.name, nodes: flow.nodes.map((node) => node.id) }
}
const library = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workflow-library') || '[]').map((entry) => ({ id: entry.id, name: entry.flow.name, nodes: entry.flow.nodes.map((node) => node.id) })))
const components = (flow) => flow.nodes.filter((node) => node.data.type !== START_TYPE).length
const removedList = (flow, ids) => ids.map((id) => `${getComponentLabel(flow.nodes.find((node) => node.id === id).data.type)} · ID ${id}`).join(', ')

const settingsWindow = (page) => page.getByRole('dialog', { name: 'Configurar IA', exact: true })
const generateDialog = (page) => page.getByRole('dialog', { name: 'Gerar fluxo com IA', exact: true })
const settingsButton = (scope) => scope.getByRole('button', { name: 'Configurar IA', exact: true })
const sessionSettings = (page) => page.evaluate((name) => JSON.parse(sessionStorage.getItem(name) || 'null'), SETTINGS_KEY)
const localText = (page) => page.evaluate(() => Array.from({ length: localStorage.length }, (_, index) => `${localStorage.key(index)}=${localStorage.getItem(localStorage.key(index))}`).join('\n'))

async function seedKey(page, key = KEY) {
  const value = JSON.stringify({ provider: 'openai', keys: { openai: key }, models: {}, effortChoice: null, fill: true })
  await page.addInitScript(([name, saved]) => {
    try {
      if (window.sessionStorage.getItem(name) === null) window.sessionStorage.setItem(name, saved)
    } catch {}
  }, [SETTINGS_KEY, value])
}

async function openEditor(page, flow = BASE_FLOW, { key = KEY } = {}) {
  if (key) await seedKey(page, key)
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'base.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(flow.nodes.length)
}

async function openCopilot(page) {
  await trigger(page).click()
  const panel = copilot(page)
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  return panel
}

async function finishSettings(page) {
  const settings = settingsWindow(page)
  await settings.getByRole('button', { name: 'Concluir', exact: true }).click()
  await expect(settings).toHaveCount(0)
}

async function startsWithoutKey(target) {
  const errors = []
  target.on('pageerror', (error) => errors.push(error.message))
  await target.goto('/flow')
  await expect(target.getByLabel('Nome do fluxo')).toBeVisible()
  expect(JSON.stringify(await sessionSettings(target)), 'a chave não passa para outra aba').not.toContain(KEY)
  const panel = await openCopilot(target)
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await settingsButton(panel).click()
  const key = settingsWindow(target).getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('')
  expect(errors).toEqual([])
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

test('the Copiloto button opens a side panel next to the canvas, keeps it mounted, sets the AI only in the Configurar IA window and Gerar com IA closes it', async ({ page }) => {
  await openEditor(page, BASE_FLOW, { key: '' })
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
  await expect(composer(panel)).toBeFocused()
  await expect(settingsWindow(page)).toHaveCount(0)
  const settings = settingsButton(panel)
  await expect(settings).toHaveCount(1)
  await expect(settings).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await expect(panel.getByLabel(KEY_LABEL)).toHaveCount(0)
  for (const name of ['Provedor de IA', 'Modelo', 'Esforço']) await expect(panel.getByRole('combobox', { name, exact: true }), `${name} fica só na janela Configurar IA`).toHaveCount(0)
  const closeBox = await panel.getByRole('button', { name: 'Fechar Copiloto', exact: true }).boundingBox()
  const settingsBox = await settings.boundingBox()
  const logBox = await conversation(panel).boundingBox()
  expect(settingsBox.y, 'Configurar IA fica na linha logo abaixo do cabeçalho').toBeGreaterThanOrEqual(closeBox.y + closeBox.height)
  expect(settingsBox.y + settingsBox.height, 'e acima da conversa').toBeLessThanOrEqual(logBox.y + 1)

  await settings.click()
  const config = settingsWindow(page)
  await expect(config).toBeVisible()
  await expect(config).toHaveAccessibleDescription(SETTINGS_DESCRIPTION)
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('')
  await expect(key).not.toHaveAttribute('aria-invalid')
  await expect(key).toHaveAttribute('type', 'password')
  await expect(config.getByText(KEY_HINT, { exact: true })).toBeVisible()
  await config.getByRole('button', { name: 'Mostrar chave', exact: true }).click()
  await expect(key).toHaveAttribute('type', 'text')
  await config.getByRole('button', { name: 'Ocultar chave', exact: true }).click()
  await expect(key).toHaveAttribute('type', 'password')
  await expect(config.getByRole('combobox', { name: 'Provedor de IA', exact: true })).toHaveCount(0)
  await expect(config.getByRole('combobox', { name: 'Modelo', exact: true })).toHaveText(/^GPT-6\.1 Sol/)
  await expect(config.getByRole('button', { name: 'Buscar modelos da API', exact: true })).toBeDisabled()
  await expect(config.getByRole('combobox', { name: 'Esforço', exact: true })).toHaveText('Equilibrado')
  await expect(config.getByRole('button', { name: 'Concluir', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(config).toHaveCount(0)
  await expect(settings, 'o foco volta para Configurar IA').toBeFocused()
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  const log = conversation(panel)
  await expect(log).toHaveAttribute('aria-live', 'polite')
  await expect(log.getByText(INTRO)).toBeVisible()
  await expect(log.getByText('Exemplos:', { exact: true })).toBeVisible()
  for (const example of EXAMPLES) await expect(log.getByRole('button', { name: example, exact: true })).toBeVisible()
  await expect(composer(panel)).toHaveAttribute('placeholder', 'O que você quer mudar no fluxo?')
  await expect(sendButton(panel)).toBeDisabled()
  await expect(panel.getByRole('checkbox', { name: 'Preencher todos os campos' })).toBeChecked()
  await expect(panel.getByRole('group', { name: 'Sugestões de resposta' })).toHaveCount(0)
  await expect(editNowButton(panel)).toHaveCount(0)

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
  await expect(sendButton(panel)).toBeEnabled()

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

test('crie uma opcao 8: the Copiloto asks what the new option does before editing, edits with the plan, Aplicar applies it and it asks if anything else is needed', async ({ page, ai }) => {
  const result = await expectedOption()
  const final = result.workflow
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })
  const thinking = ai.hold()
  ai.say(ASK_OPTION, thinking)
  ai.say(EDIT_OPTION)
  ai.builds.push({ steps: [OPTION_TEXT] })

  await openEditor(page, MENU_FLOW)
  const panel = await openCopilot(page)
  await ask(panel, OPTION_REQUEST)
  const log = conversation(panel)
  await thinking.reached
  await expect(log.getByRole('status')).toHaveText(THINKING)
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST)])
  await composer(panel).fill('outro pedido')
  await expect(sendButton(panel)).toBeDisabled()
  await composer(panel).press('Enter')
  await expect(composer(panel)).toHaveValue('outro pedido')
  await composer(panel).fill('')
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  thinking.open()

  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_OPTION)])
  await expect(chips(panel)).toHaveText(ASK_OPTION.suggestions)
  await expect(editNowButton(panel)).toHaveText('Editar agora')
  await expect(log.getByRole('status')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(MENU_FLOW.nodes.length)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  const first = ai.turnCalls()[0]
  expect(first.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(first.body).toMatchObject({ model: 'gpt-6.1-sol', stream: true })
  expect(inputOf(first)).toContain('# Resumo do fluxo aberto')
  expect(inputOf(first)).toContain('Como podemos ajudar?')
  expect(historyOf(first)).toContain(OPTION_REQUEST)
  expect(systemOf(first), 'o turno do Copiloto usa o prompt e a situação do Copiloto, sem proposta em revisão').toEqual([copilotSystemPrompt(), copilotState(MENU_FLOW)])
  expect(systemOf(first)).not.toContain(interviewSystemPrompt())

  await chips(panel).filter({ hasText: 'Pode ser assim' }).click()
  const cards = await proposal(panel)
  await expect(cards).toHaveText(['2 componentes novos', '1 alterado', '0 removidos'])
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_OPTION), you('Pode ser assim'), says(EDIT_OPTION)])
  await expect(panel.getByRole('group', { name: 'Sugestões de resposta' })).toHaveCount(0)
  await expect(editNowButton(panel)).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(page.locator('.react-flow')).toContainText(NEW_OPTION)
  await expect(page.locator('.react-flow')).toContainText(BOLETO_TEXT)
  expect(ai.turnCalls()).toHaveLength(2)
  const second = ai.turnCalls()[1]
  expect(historyOf(second)).toContain(OPTION_REQUEST)
  expect(historyOf(second)).toContain(ASK_OPTION.message)
  expect(historyOf(second)).toContain('Pode ser assim')
  expect(inputOf(second)).toContain('# Resumo do fluxo aberto')
  expect(systemOf(second)).toEqual([copilotSystemPrompt(), copilotState(MENU_FLOW)])
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain('# Modo de edição')
  expect(build).toContain(OPTION_PLAN)
  expect(build).not.toContain(OPTION_REQUEST)
  expect(ai.buildCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual({ name: MENU_FLOW.name, nodes: MENU_FLOW.nodes.map((node) => node.id) })

  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(OPTION_PLAN, { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(OPTION_REQUEST), says(ASK_OPTION), you('Pode ser assim'), says(EDIT_OPTION), APPLIED, says(FOLLOW_UP)])
  await expect(panel.getByText('Aplicada', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow')).toContainText(NEW_OPTION)
  await expect.poll(() => saved(page)).toEqual({ name: MENU_FLOW.name, nodes: final.nodes.map((node) => node.id) })
  await expect(composer(panel)).toHaveAttribute('placeholder', 'O que você quer mudar no fluxo?')
  await page.waitForTimeout(300)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('Editar agora edits right away with what was decided, without another question', async ({ page, ai }) => {
  const final = (await expectedEdit()).workflow
  const hold = ai.hold()
  ai.say(ASK_EDIT)
  ai.builds.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })

  await openEditor(page)
  const panel = await openCopilot(page)
  await ask(panel, PROMPT)
  await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT)])
  await expect(chips(panel)).toHaveText(ASK_EDIT.suggestions)
  const editNow = editNowButton(panel)
  await expect(editNow).toHaveText('Editar agora')
  await expect(editNow).toHaveAttribute('title', EDIT_NOW_LABEL)

  await editNow.click()
  await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT), you(EDIT_NOW)])
  await expect(editNow).toHaveCount(0)
  await expect(panel.getByRole('group', { name: 'Sugestões de resposta' })).toHaveCount(0)
  await hold.reached
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toBeVisible()
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  await expect(page.locator('.react-flow')).toContainText(BOLETO_TEXT)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain(PLAN)
  expect(build).not.toContain(PROMPT)
  hold.open()

  await proposal(panel)
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(PLAN, { exact: true })).toBeVisible()
  await expect(editNow).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(await saved(page)).toEqual(BASE_STATE)
})

const spentCorner = (panel) => panel.locator('p').filter({ hasText: 'gastos no total' })
const spentText = (calls) => `${(33 * calls).toLocaleString('pt-BR')} tokens gastos no total, ${(11 * calls).toLocaleString('pt-BR')} de entrada e ${(22 * calls).toLocaleString('pt-BR')} de saída`

test('the Copiloto corner adds up the tokens of every call to the AI as each one ends and keeps the total after a reload', async ({ page, ai }) => {
  const hold = ai.hold()
  ai.say(ASK_EDIT)
  ai.builds.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })

  await openEditor(page)
  const panel = await openCopilot(page)
  const corner = spentCorner(panel)
  await expect(corner).toHaveText(spentText(0))
  await expect(corner).toHaveAttribute('title', 'Entrada: 0. Saída: 0.')
  const box = await corner.boundingBox()
  const area = await panel.boundingBox()
  expect(box.x - area.x).toBeLessThan(24)
  expect(area.y + area.height - (box.y + box.height)).toBeLessThan(24)

  await ask(panel, PROMPT)
  await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT)])
  await expect(corner).toHaveText(spentText(1))

  await editNowButton(panel).click()
  await hold.reached
  await expect(corner).toHaveText(spentText(1))
  hold.open()
  await proposal(panel)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls().length).toBeGreaterThanOrEqual(1)
  await expect(corner).toHaveText(spentText(ai.calls.length))
  await expect(corner).toHaveAttribute('title', `Entrada: ${11 * ai.calls.length}. Saída: ${22 * ai.calls.length}.`)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flow.ia.tokens')))).toEqual({ inputTokens: 11 * ai.calls.length, outputTokens: 22 * ai.calls.length, totalTokens: 33 * ai.calls.length })

  await page.reload()
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await expect(spentCorner(await openCopilot(page))).toHaveText(spentText(ai.calls.length))
})

const tokensSaved = (target) => target.evaluate(() => new Promise((resolve) => {
  const request = indexedDB.open('flow.ia', 1)
  request.onupgradeneeded = () => request.transaction.abort()
  request.onerror = () => resolve(null)
  request.onsuccess = () => {
    const read = request.result.transaction('tokens', 'readonly').objectStore('tokens').get('total')
    read.onsuccess = () => {
      resolve(read.result ?? null)
      request.result.close()
    }
    read.onerror = () => resolve(null)
  }
}))

test('two tabs whose Copiloto answers end at the same moment both reach the total, in each corner and in the saved total', async ({ page, server }) => {
  const context = page.context()
  const errors = []
  const value = JSON.stringify({ provider: 'openai', keys: { openai: KEY }, models: {}, effortChoice: null, fill: true })
  await context.addInitScript(([name, saved]) => {
    try {
      if (window.sessionStorage.getItem(name) === null) window.sessionStorage.setItem(name, saved)
    } catch {}
  }, [SETTINGS_KEY, value])
  const gates = []
  await context.route((url) => url.hostname === HOST, async (route) => {
    const gate = {}
    gate.reached = new Promise((resolve) => {
      gate.arrive = resolve
    })
    gate.opened = new Promise((resolve) => {
      gate.open = resolve
    })
    gates.push(gate)
    const id = crypto.randomUUID()
    server.sessions.set(id, script([gate, JSON.stringify(ASK_EDIT)]))
    return route.continue({ url: `${server.url}/${id}` })
  })
  const second = await context.newPage()
  second.on('pageerror', (error) => errors.push(error.message))
  const panels = []
  for (const tab of [page, second]) {
    await tab.goto('/flow')
    await expect(tab.getByLabel('Nome do fluxo')).toBeVisible()
    panels.push(await openCopilot(tab))
  }
  for (const panel of panels) await expect(spentCorner(panel)).toHaveText(spentText(0))
  for (const panel of panels) await ask(panel, PROMPT)
  await expect.poll(() => gates.length).toBe(2)
  await Promise.all(gates.map((gate) => gate.reached))
  for (const gate of gates) gate.open()
  for (const panel of panels) await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT)])
  for (const panel of panels) await expect(spentCorner(panel)).toHaveText(spentText(2))
  await expect.poll(() => tokensSaved(page)).toEqual({ inputTokens: 22, outputTokens: 44, totalTokens: 66 })
  await second.close()
  expect(errors).toEqual([])
})

test('Parar while the Copiloto thinks keeps the open flow and the late answer never shows up', async ({ page, ai }) => {
  const late = ai.hold()
  ai.say(ASK_EDIT, late)
  await openEditor(page)
  const panel = await openCopilot(page)
  await ask(panel, PROMPT)
  await late.reached
  const log = conversation(panel)
  await expect(log.getByRole('status')).toHaveText(THINKING)
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Parar', exact: true }).click()
  await expect(messages(panel)).toHaveText([you(PROMPT), CANCELLED])
  await expect(log.getByRole('status')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0)
  await expect(composer(panel)).toBeFocused()
  late.open()
  await page.waitForTimeout(500)
  await expect(messages(panel)).toHaveText([you(PROMPT), CANCELLED])
  await expect(log.getByText(ASK_EDIT.message)).toHaveCount(0)
  await expect(panel.getByRole('group', { name: 'Sugestões de resposta' })).toHaveCount(0)
  await expect(editNowButton(panel)).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(await saved(page)).toEqual(BASE_STATE)

  ai.say(ASK_EDIT)
  await ask(panel, PROMPT)
  await expect(messages(panel)).toHaveText([you(PROMPT), CANCELLED, you(PROMPT), says(ASK_EDIT)])
  await expect(chips(panel)).toHaveText(ASK_EDIT.suggestions)
  expect(historyOf(ai.turnCalls()[1])).toContain(CANCELLED)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('a key refused on the question opens Configurar IA on the key with the error and Tentar de novo repeats the same turn', async ({ page, ai }) => {
  ai.turns.push({ status: 401, body: { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } } })
  ai.say(ASK_EDIT)
  await openEditor(page)
  const panel = await openCopilot(page)
  await expect(panel.getByText(MISSING, { exact: true })).toHaveCount(0)
  await ask(panel, PROMPT)

  const config = settingsWindow(page)
  await expect(config).toBeVisible({ timeout: 15000 })
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue(KEY)
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(config.getByText(`${KEY_REJECTED} ${KEY_DETAILS}`, { exact: true })).toBeVisible()
  await finishSettings(page)

  const alert = panel.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(KEY_REJECTED)
  await expect(alert).toContainText(KEY_DETAILS)
  await expect(alert).not.toContainText(KEY)
  await expect(panel.getByLabel(KEY_LABEL)).toHaveCount(0)
  await expect(messages(panel)).toHaveText([you(PROMPT)])
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)

  await alert.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
  await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT)])
  await expect(alert).toHaveCount(0)
  await expect(chips(panel)).toHaveText(ASK_EDIT.suggestions)
  await expect(config).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(inputOf(ai.turnCalls()[1])).toBe(inputOf(ai.turnCalls()[0]))
  expect(ai.turnCalls()[1].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.buildCalls()).toHaveLength(0)
})

async function steadyView(page) {
  let last = ''
  await expect.poll(async () => {
    const now = await page.evaluate(() => getComputedStyle(document.querySelector('.react-flow__viewport')).transform)
    const steady = now === last
    last = now
    return steady
  }, { intervals: [200] }).toBe(true)
}

test('an edit through the Copiloto shows live on the canvas, lists the changes and Aplicar is one undoable step in the same Meus fluxos entry', async ({ page, ai }) => {
  const result = await expectedEdit()
  const final = result.workflow
  expect(result.changes).toEqual({ added: 2, changed: 1, removed: 0 })
  const hold = ai.hold()
  ai.say(EDIT_TURN)
  ai.builds.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })

  await openEditor(page)
  await page.getByRole('button', { name: 'Novo fluxo', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Meus fluxos, 1', exact: true }).click()
  await page.getByRole('button', { name: `Abrir ${BASE_FLOW.name}`, exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  const entry = (await library(page))[0]
  expect(entry).toEqual({ id: entry.id, ...BASE_STATE })

  const panel = await openCopilot(page)
  await ask(panel, PROMPT)
  const log = conversation(panel)
  await expect(log.getByText(PROMPT)).toHaveText(you(PROMPT))
  await expect(log.getByText(INTRO)).toHaveCount(0)
  await expect(log.getByText(EDIT_TURN.message)).toHaveText(says(EDIT_TURN))
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

  const zoom = page.locator('[data-canvas-overlay]').filter({ hasText: EDIT_BANNER }).getByRole('group', { name: 'Zoom da prévia' })
  const level = async () => Number((await zoom.textContent()).match(/(\d+)%/)[1])
  await expect(zoom).toBeVisible()
  await steadyView(page)
  const fitted = await level()
  await panel.getByRole('button', { name: 'Parar', exact: true }).focus()
  await page.keyboard.press('Control+Equal')
  await expect.poll(level).toBeGreaterThan(fitted)
  await steadyView(page)
  const closer = await level()
  await page.keyboard.press('Control+Minus')
  await expect.poll(level).toBeLessThan(closer)
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toBeFocused()

  hold.open()
  const chipsOfChanges = await proposal(panel)
  await expect(chipsOfChanges).toHaveText(['2 componentes novos', '1 alterado', '0 removidos'])
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText('GPT-6.1 Sol · Esforço equilibrado · 33 tokens', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(composer(panel)).toHaveAttribute('placeholder', 'Peça um ajuste nesta proposta')
  await expect(panel.getByText(REFINE_HINT, { exact: true })).toBeVisible()
  await expect(panel.getByText(PLAN, { exact: true })).toBeHidden()
  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(PLAN, { exact: true })).toBeVisible()
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
  const asked = inputOf(ai.turnCalls()[0])
  expect(asked).toContain('# Resumo do fluxo aberto')
  expect(asked).toContain(PROMPT)
  const sent = JSON.stringify(ai.buildCalls()[0].body)
  expect(sent).toContain('# Modo de edição')
  expect(sent).toContain('# Fluxo atual')
  expect(sent).toContain(PLAN)
  expect(sent).not.toContain(PROMPT)
  expect(ai.turnCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.buildCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.fallbacks).toEqual([])
  expect(await saved(page)).toEqual(BASE_STATE)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.getByText('Alterações aplicadas', { exact: true })).toBeVisible()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(log.getByText(FOLLOW_UP, { exact: false })).toHaveText(says(FOLLOW_UP))
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
  expect(ai.turnCalls()).toHaveLength(1)
})

test('Descartar and Parar leave the open flow exactly as it was', async ({ page, ai }) => {
  const final = (await expectedEdit()).workflow
  ai.say(EDIT_TURN)
  await openEditor(page)
  const panel = await openCopilot(page)
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
  ai.say(EDIT_TURN)
  ai.builds.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })
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
  await expect(editNowButton(panel)).toBeVisible()
  hold.open()
  await sleep(300)
  await expect(panel.getByRole('heading', { name: /^Edição pronta/ })).toHaveCount(1)
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(2)
  expect(historyOf(ai.turnCalls()[1])).toContain(DISCARDED)

  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled()
  expect(await saved(page)).toEqual(BASE_STATE)
  const kept = await stored(page)
  expect(kept.nodes).toEqual(BASE_FLOW.nodes)
  expect(kept.edges).toEqual(BASE_FLOW.edges)
  expect(await library(page)).toEqual([])
})

test('a refinement asks with the proposal on the canvas, sends the proposal as the base and the changes still count from the open flow', async ({ page, ai }) => {
  const first = (await expectedEdit()).workflow
  const second = await expectedRefinement()
  expect(second.result.changes).toEqual({ added: 0, changed: 2, removed: 0 })
  ai.say(EDIT_TURN)
  await openEditor(page)
  const panel = await openCopilot(page)
  await ask(panel, PROMPT)
  await proposal(panel)
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(nodes).toHaveCount(first.nodes.length)

  ai.say(REFINE_TURN)
  ai.builds.push({ steps: [second.text] })
  await ask(panel, REFINE_PROMPT)
  const changes = await proposal(panel, 2)
  await expect(changes).toHaveText(['2 componentes novos', '2 alterados', '0 removidos'])
  await expect(panel.getByText('Ajustada no pedido seguinte', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toHaveCount(1)
  await expect(messages(panel)).toHaveText([you(PROMPT), says(EDIT_TURN), you(REFINE_PROMPT), says(REFINE_TURN)])
  await expect(canvas).toContainText(REFINED_BOLETO)
  await expect(canvas).toContainText(REFINED_FAREWELL)
  await expect(canvas).toContainText(NEW_OPTION)
  await expect(page.getByText(EDIT_DONE)).toBeVisible()

  expect(ai.turnCalls()).toHaveLength(2)
  const refineTurn = ai.turnCalls()[1]
  expect(inputOf(ai.turnCalls()[0])).not.toContain(BOLETO_TEXT)
  expect(inputOf(refineTurn)).toContain('# Resumo do fluxo aberto')
  expect(inputOf(refineTurn)).toContain(BOLETO_TEXT)
  expect(historyOf(refineTurn)).toContain('Proposta pronta no canvas: 2 componentes novos, 1 alterado e 0 removidos.')
  expect(historyOf(refineTurn)).toContain(REFINE_PROMPT)
  const notice = proposalLines(BASE_FLOW)
  expect(notice.length).toBeGreaterThan(0)
  expect(systemOf(ai.turnCalls()[0]), 'o primeiro pedido não fala de proposta em revisão').toEqual([copilotSystemPrompt(), copilotState(BASE_FLOW)])
  const [refinePrompt, refineState] = systemOf(refineTurn)
  expect(refinePrompt).toBe(copilotSystemPrompt())
  for (const line of notice) expect(refineState, 'o ajuste avisa que há uma proposta em revisão').toContain(line)
  expect(ai.buildCalls()).toHaveLength(2)
  const firstSent = JSON.stringify(ai.buildCalls()[0].body)
  const refineSent = JSON.stringify(ai.buildCalls()[1].body)
  expect(firstSent).not.toContain(BOLETO_TEXT)
  expect(refineSent).toContain(BOLETO_TEXT)
  expect(refineSent).toContain(NEW_OPTION)
  expect(refineSent).toContain(REFINE_PLAN)
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
  ai.say(EDIT_TURN)
  ai.builds.push({ steps: [TEXT.slice(0, AFTER_NODES), hold, TEXT.slice(AFTER_NODES)] })
  await openEditor(page)
  const panel = await openCopilot(page)
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
  await expect(trigger(page)).toHaveAccessibleName('Copiloto, edição pronta para revisar')
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

test('a question that arrives with the panel closed shows a toast and a badge that lead back to it', async ({ page, ai }) => {
  const late = ai.hold()
  ai.say(ASK_EDIT, late)
  await openEditor(page)
  const panel = await openCopilot(page)
  await ask(panel, PROMPT)
  await late.reached
  await trigger(page).click()
  await expect(panel).toBeHidden()
  late.open()

  await expect(page.getByText('O Copiloto tem uma pergunta', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Abra o Copiloto para responder.', { exact: true })).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName('Copiloto, pergunta para responder')
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)

  await trigger(page).click()
  await expect(panel).toBeVisible()
  await expect(trigger(page)).toHaveAccessibleName('Copiloto')
  await expect(messages(panel)).toHaveText([you(PROMPT), says(ASK_EDIT)])
  await expect(chips(panel)).toHaveText(ASK_EDIT.suggestions)
  await expect(editNowButton(panel)).toBeVisible()
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('a new flow with only Início: the Copiloto builds the request starting from Início, shows the proposal and Aplicar is one undoable step', async ({ page, ai }) => {
  await seedKey(page)
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  const undo = page.getByRole('button', { name: 'Desfazer', exact: true })
  await expect(nodes).toHaveCount(1)
  await expect(undo).toBeDisabled()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('workflow') !== null)).toBe(true)
  const opened = importFlow(await stored(page))
  expect(components(opened)).toBe(0)
  const result = await engineEdit(opened, START_TEXT, START_PLAN)
  const final = result.workflow
  expect(result.changes).toEqual({ added: 6, changed: 0, removed: 0 })
  const welcome = final.nodes.find((node) => node.data.data.template === PET_WELCOME).id
  ai.say(START_TURN)
  ai.builds.push({ steps: [START_TEXT] })

  const panel = await openCopilot(page)
  await expect(panel.getByText(OLD_NOTICE)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Abrir Gerar com IA', exact: true })).toHaveCount(0)
  await composer(panel).fill(START_REQUEST)
  await expect(sendButton(panel)).toBeEnabled()
  await composer(panel).press('Enter')
  await expect(composer(panel)).toHaveValue('')
  const changes = await proposal(panel)
  await expect(changes).toHaveText(START_CHANGES)
  await expect(messages(panel)).toHaveText([you(START_REQUEST), says(START_TURN)])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(canvas).toContainText(PET_WELCOME)
  await expect(canvas).toContainText(PET_HOURS)
  expect(await saved(page)).toEqual({ name: opened.name, nodes: ['inicio'] })

  expect(ai.turnCalls()).toHaveLength(1)
  const turn = ai.turnCalls()[0]
  expect(turn.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(historyOf(turn)).toContain(START_REQUEST)
  expect(systemOf(turn), 'o turno do Copiloto recebe o fluxo só com o Início').toEqual([copilotSystemPrompt(), copilotState(opened)])
  expect(ai.buildCalls()).toHaveLength(1)
  const build = JSON.stringify(ai.buildCalls()[0].body)
  expect(build).toContain('# Modo de edição')
  expect(build).toContain('# Fluxo atual')
  expect(build).toContain(START_PLAN)
  expect(build).not.toContain(START_REQUEST)
  expect(ai.fallbacks).toEqual([])

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(START_REQUEST), says(START_TURN), APPLIED, says(FOLLOW_UP)])
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect.poll(() => saved(page)).toEqual({ name: opened.name, nodes: final.nodes.map((node) => node.id) })
  const after = await stored(page)
  expect(after.edges.filter((edge) => edge.source === 'inicio').map((edge) => edge.target), 'o atendimento começa no Início').toEqual([welcome])

  await undo.click()
  await expect(nodes).toHaveCount(1)
  await expect(canvas).not.toContainText(PET_WELCOME)
  await expect.poll(() => saved(page)).toEqual({ name: opened.name, nodes: ['inicio'] })
  await expect(undo, 'Aplicar entra como um só passo no histórico').toBeDisabled()
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('a flow with only Início and a note goes through the Copiloto too, and the note stays as it was', async ({ page, ai }) => {
  const result = await engineEdit(NOTE_FLOW, START_TEXT, START_PLAN)
  const final = result.workflow
  expect(result.changes).toEqual({ added: 6, changed: 0, removed: 0 })
  ai.say(START_TURN)
  ai.builds.push({ steps: [START_TEXT] })

  await openEditor(page, NOTE_FLOW)
  const memo = page.locator(`.react-flow__node[data-id="${NOTE_NODE.id}"]`)
  await expect(memo).toContainText(NOTE_TEXT)
  const panel = await openCopilot(page)
  await expect(panel.getByText(OLD_NOTICE)).toHaveCount(0)
  await ask(panel, START_REQUEST)
  const changes = await proposal(panel)
  await expect(changes, 'a nota não conta como componente').toHaveText(START_CHANGES)
  await expect(page.locator('.react-flow__node')).toHaveCount(final.nodes.length)
  await expect(memo).toContainText(NOTE_TEXT)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(systemOf(ai.turnCalls()[0])).toEqual([copilotSystemPrompt(), copilotState(NOTE_FLOW)])
  expect(ai.buildCalls()).toHaveLength(1)
  expect(JSON.stringify(ai.buildCalls()[0].body)).toContain(START_PLAN)

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect.poll(() => saved(page)).toEqual({ name: NOTE_FLOW.name, nodes: final.nodes.map((node) => node.id) })
  const after = await stored(page)
  const kept = after.nodes.find((node) => node.id === NOTE_NODE.id)
  expect(kept.data, 'a nota continua com o mesmo texto').toEqual(NOTE_NODE.data)
  expect(kept.position).toEqual(NOTE_NODE.position)
  expect(after.edges.some((edge) => edge.source === NOTE_NODE.id || edge.target === NOTE_NODE.id), 'a nota segue fora das conexões').toBe(false)
  await expect(memo).toContainText(NOTE_TEXT)
})

test('Preencher todos os campos sends fill true by default and fill false when unchecked', async ({ page, ai }) => {
  await openEditor(page)
  const panel = await openCopilot(page)
  const fill = panel.getByRole('checkbox', { name: 'Preencher todos os campos' })
  await expect(fill).toBeChecked()
  await expect(panel.getByText(FILL_ON, { exact: true })).toBeVisible()

  ai.say(EDIT_TURN)
  ai.builds.push({ blocked: true })
  await ask(panel, PROMPT)
  const failure = panel.getByText(FALLBACK_ERROR, { exact: true })
  await expect(failure).toBeVisible({ timeout: 15000 })
  await expect(panel.getByRole('button', { name: 'Tentar de novo', exact: true })).toBeVisible()
  expect(ai.fallbacks).toHaveLength(1)
  expect(ai.fallbacks[0]).toMatchObject({ fill: true, mode: 'edit', size: 'auto', prompt: PLAN, image: null, effort: 'medium', stream: true })
  expect(ai.fallbacks[0].base.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(BASE_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(ai.fallbacks[0].base.edges).toEqual(BASE_FLOW.edges)
  await expect(page.getByText(EDIT_BANNER)).toHaveCount(0)

  await fill.uncheck()
  await expect(panel.getByText(FILL_OFF, { exact: true })).toBeVisible()
  await expect(panel.getByText(FILL_ON, { exact: true })).toHaveCount(0)
  ai.say(EDIT_TURN)
  ai.builds.push({ blocked: true })
  await ask(panel, PROMPT)
  await expect.poll(() => ai.fallbacks.length).toBe(2)
  expect(ai.fallbacks[1]).toMatchObject({ fill: false, mode: 'edit', size: 'auto', prompt: PLAN })
  await expect(panel.getByText(FALLBACK_ERROR, { exact: true })).toHaveCount(2)
  await expect(panel.getByRole('button', { name: 'Tentar de novo', exact: true })).toHaveCount(1)

  await fill.check()
  ai.builds.push({ blocked: true })
  await panel.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
  await expect.poll(() => ai.fallbacks.length).toBe(3)
  expect(ai.fallbacks[2]).toMatchObject({ fill: true, mode: 'edit', prompt: PLAN })
  expect(ai.turnCalls()).toHaveLength(2)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  expect(await saved(page)).toEqual(BASE_STATE)
})

test('a request without the key opens Configurar IA on the key and keeps the request, and the key typed there from Gerar com IA is reused by the Copiloto', async ({ page, ai }) => {
  await openEditor(page, BASE_FLOW, { key: '' })
  let panel = await openCopilot(page)
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await composer(panel).fill(PROMPT)
  await composer(panel).press('Enter')
  const config = settingsWindow(page)
  await expect(config).toBeVisible()
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await expect(config.getByText(KEY_MISSING, { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  expect(ai.calls).toEqual([])
  await page.keyboard.press('Escape')
  await expect(config).toHaveCount(0)
  await expect(composer(panel), 'o foco volta para o pedido').toBeFocused()
  await expect(composer(panel)).toHaveValue(PROMPT)
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await trigger(page).click()
  await expect(panel).toBeHidden()

  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = generateDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toBeVisible()
  await expect(dialog.getByLabel(KEY_LABEL)).toHaveCount(0)
  await settingsButton(dialog).click()
  await expect(config).toBeVisible()
  await expect(key).toBeFocused()
  await expect(key).not.toHaveAttribute('aria-invalid')
  await expect(config.getByText(KEY_MISSING, { exact: true })).toHaveCount(0)
  await key.fill(KEY)
  await finishSettings(page)
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(ai.calls).toEqual([])

  panel = await openCopilot(page)
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true })).toHaveCount(0)
  await expect(composer(panel)).toHaveValue(PROMPT)
  ai.say(EDIT_TURN)
  await composer(panel).press('Enter')
  await proposal(panel)
  await expect(config).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
  expect(ai.turnCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.buildCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
})

test('a key typed in Configurar IA from the Copiloto is used by Gerar com IA without typing it again', async ({ page, ai }) => {
  await openEditor(page, BASE_FLOW, { key: '' })
  const panel = await openCopilot(page)
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await settingsButton(panel).click()
  const config = settingsWindow(page)
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await expect(key).toBeFocused()
  await expect(key).toHaveValue('')
  await key.fill(KEY)
  await finishSettings(page)
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Gerar com IA', exact: true }).click()
  const dialog = generateDialog(page)
  await expect(dialog).toBeVisible()
  await expect(panel).toBeHidden()
  await expect(dialog.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel(KEY_LABEL)).toHaveCount(0)
  const mode = page.getByRole('radio', { name: 'Conversar com a IA', exact: true })
  await dialog.locator('label', { has: mode }).click()
  await expect(mode).toBeChecked()
  const chat = dialog.getByRole('region', { name: 'Conversa com a IA' })
  await expect(chat).toBeVisible()
  ai.say(ASK_EDIT)
  const answer = chat.getByRole('textbox', { name: 'Sua resposta para a IA' })
  await answer.fill(PROMPT)
  await answer.press('Enter')
  await expect(chat.getByRole('log')).toContainText(ASK_EDIT.message, { timeout: 15000 })
  await expect(config).toHaveCount(0)
  await expect(dialog.getByText(MISSING, { exact: true })).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.turnCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(historyOf(ai.turnCalls()[0])).toContain(PROMPT)
  expect(ai.buildCalls()).toHaveLength(0)
})

test('the key typed in Configurar IA survives a reload in the same tab, never goes to localStorage, and another tab or a new browser context starts without it', async ({ page, ai, browser }) => {
  await openEditor(page, BASE_FLOW, { key: '' })
  let panel = await openCopilot(page)
  await expect(panel.getByText(MISSING, { exact: true })).toBeVisible()
  await settingsButton(panel).click()
  const config = settingsWindow(page)
  const key = config.getByLabel(KEY_LABEL, { exact: true })
  await key.fill(KEY)
  await finishSettings(page)
  await expect(panel.getByText(MISSING, { exact: true })).toHaveCount(0)
  await expect.poll(() => sessionSettings(page), { message: 'a chave fica na sessionStorage da aba' }).toMatchObject({ provider: 'openai', keys: { openai: KEY } })
  expect(await localText(page), 'a chave nunca vai para a localStorage').not.toContain(KEY)
  await expect.poll(() => saved(page)).toEqual(BASE_STATE)

  await page.reload()
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(BASE_FLOW.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(BASE_FLOW.nodes.length)
  panel = await openCopilot(page)
  await expect(panel.getByText(SUMMARY, { exact: true })).toBeVisible()
  await expect(panel.getByText(MISSING, { exact: true }), 'depois de recarregar a aba a chave continua').toHaveCount(0)
  await settingsButton(panel).click()
  await expect(key).toHaveValue(KEY)
  await expect(key).not.toHaveAttribute('aria-invalid')
  await finishSettings(page)
  ai.say(EDIT_TURN)
  await ask(panel, PROMPT)
  await proposal(panel)
  await expect(config).toHaveCount(0)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.turnCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.buildCalls()[0].headers.authorization).toBe(`Bearer ${KEY}`)
  expect(await localText(page)).not.toContain(KEY)

  const tab = await page.context().newPage()
  try {
    await startsWithoutKey(tab)
  } finally {
    await tab.close()
  }

  const other = await browser.newContext()
  try {
    await startsWithoutKey(await other.newPage())
  } finally {
    await other.close()
  }
  expect(await sessionSettings(page)).toMatchObject({ keys: { openai: KEY } })
})

test('limpe o fluxo: the Copiloto confirms, Pode limpar edits with remove listing every component, Aplicar leaves only Início and the notes and Desfazer brings the flow back', async ({ page, ai }) => {
  const result = await engineEdit(CLEAR_FLOW, CLEAR_TEXT, CLEAR_PLAN)
  const final = result.workflow
  expect(result.changes).toEqual({ added: 0, changed: 0, removed: CLEAR_IDS.length })
  expect(result.rounds, 'a limpeza sai na primeira rodada').toBe(1)
  expect(final.nodes.map((node) => node.id)).toEqual(CLEAR_KEPT.map((node) => node.id))
  expect(final.edges).toEqual([])
  const hold = ai.hold()
  const third = `"${CLEAR_IDS[2]}",`
  const cut = CLEAR_TEXT.indexOf(third, CLEAR_TEXT.indexOf('"remove"')) + third.length
  ai.say(ASK_CLEAR)
  ai.say(CLEAR_TURN)
  ai.builds.push({ steps: [CLEAR_TEXT.slice(0, cut), hold, CLEAR_TEXT.slice(cut)] })

  await openEditor(page, CLEAR_FLOW)
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  const undo = page.getByRole('button', { name: 'Desfazer', exact: true })
  const shown = (id) => page.locator(`.react-flow__node[data-id="${id}"]`)
  for (const text of CLEAR_NOTES) await expect(canvas).toContainText(text)
  const panel = await openCopilot(page)
  await ask(panel, CLEAR_REQUEST)
  await expect(messages(panel)).toHaveText([you(CLEAR_REQUEST), says(ASK_CLEAR)])
  await expect(chips(panel)).toHaveText(ASK_CLEAR.suggestions)
  await expect(nodes).toHaveCount(CLEAR_FLOW.nodes.length)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(0)
  expect(historyOf(ai.turnCalls()[0])).toContain(CLEAR_REQUEST)
  expect(systemOf(ai.turnCalls()[0]), 'o turno do Copiloto recebe o fluxo com os componentes e as notas').toEqual([copilotSystemPrompt(), copilotState(CLEAR_FLOW)])

  await chips(panel).filter({ hasText: CLEAR_ANSWER }).click()
  await hold.reached
  await expect(messages(panel)).toHaveText([you(CLEAR_REQUEST), says(ASK_CLEAR), you(CLEAR_ANSWER), says(CLEAR_TURN)])
  await expect(page.getByText(EDIT_BANNER)).toBeVisible()
  for (const id of CLEAR_IDS.slice(0, 2)) await expect(shown(id), 'a prévia ao vivo já tira o que chegou em remove').toHaveCount(0)
  for (const id of CLEAR_IDS.slice(3)) await expect(shown(id), 'o que ainda não chegou em remove continua no canvas').toHaveCount(1)
  await expect(canvas).toContainText(FAREWELL)
  for (const node of CLEAR_KEPT) await expect(shown(node.id)).toHaveCount(1)
  expect(await saved(page)).toEqual(CLEAR_STATE)
  hold.open()

  const changes = await proposal(panel)
  await expect(changes).toHaveText(['0 componentes novos', '0 alterados', `${CLEAR_IDS.length} removidos`])
  await expect(panel.getByText(removedList(CLEAR_FLOW, CLEAR_IDS)), 'o cartão lista cada componente removido').toBeVisible()
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true }), 'a limpeza pedida não aparece como falha').toBeVisible()
  await expect(panel.getByText(EMPTIED_NOTICE, { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Aplicar', exact: true })).toBeEnabled()
  await expect(nodes).toHaveCount(CLEAR_KEPT.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  for (const text of CLEAR_NOTES) await expect(canvas).toContainText(text)
  await expect(canvas).not.toContainText(FAREWELL)
  await expect(canvas).not.toContainText('Como podemos ajudar?')
  expect(await saved(page)).toEqual(CLEAR_STATE)

  expect(ai.turnCalls()).toHaveLength(2)
  const confirmed = ai.turnCalls()[1]
  expect(historyOf(confirmed)).toContain(CLEAR_REQUEST)
  expect(historyOf(confirmed)).toContain(ASK_CLEAR.message)
  expect(historyOf(confirmed)).toContain(CLEAR_ANSWER)
  expect(ai.buildCalls(), 'a limpeza não pede rodada de correção').toHaveLength(1)
  const build = ai.buildCalls()[0]
  const sent = JSON.stringify(build.body)
  expect(sent).toContain('# Modo de edição')
  expect(sent).toContain('# Fluxo atual')
  expect(sent).toContain(CLEAR_PLAN)
  expect(sent).not.toContain(CLEAR_REQUEST)
  const format = build.body.text.format
  expect(format).toMatchObject({ type: 'json_schema', strict: true })
  expect(format.schema.required, 'remove vem sempre na resposta da edição').toContain('remove')
  expect(format.schema.properties.remove).toMatchObject({ type: 'array', items: { type: 'string' } })
  expect(build.headers.authorization).toBe(`Bearer ${KEY}`)
  expect(ai.fallbacks).toEqual([])

  await panel.getByText(FULL_REQUEST, { exact: true }).click()
  await expect(panel.getByText(CLEAR_PLAN, { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(CLEAR_REQUEST), says(ASK_CLEAR), you(CLEAR_ANSWER), says(CLEAR_TURN), APPLIED, says(FOLLOW_UP)])
  await expect(panel.getByText('Aplicada', { exact: true })).toBeVisible()
  await expect(nodes).toHaveCount(CLEAR_KEPT.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await expect.poll(() => saved(page)).toEqual({ name: CLEAR_FLOW.name, nodes: CLEAR_KEPT.map((node) => node.id) })
  const after = await stored(page)
  expect(after.edges, 'nenhuma conexão fica no fluxo limpo').toEqual([])
  for (const node of CLEAR_KEPT) {
    const kept = after.nodes.find((item) => item.id === node.id)
    expect(kept.data, node.id).toEqual(node.data)
    expect(kept.position, node.id).toEqual(node.position)
  }
  for (const text of CLEAR_NOTES) await expect(canvas).toContainText(text)

  await undo.click()
  await expect(nodes).toHaveCount(CLEAR_FLOW.nodes.length)
  await expect(canvas).toContainText(FAREWELL)
  await expect.poll(() => saved(page)).toEqual(CLEAR_STATE)
  const undone = await stored(page)
  expect(undone.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual(CLEAR_FLOW.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data })))
  expect(undone.edges).toEqual(CLEAR_FLOW.edges)
  await expect(undo, 'Aplicar entra como um só passo no histórico').toBeDisabled()
  expect(ai.turnCalls()).toHaveLength(2)
  expect(ai.buildCalls()).toHaveLength(1)
})

test('remova a opção: the edit sends the menu without the option, remove takes its branch away, and the proposal and the applied flow show it', async ({ page, ai }) => {
  const result = await engineEdit(MENU_FLOW, DROP_TEXT, DROP_PLAN)
  const final = result.workflow
  expect(DROP.branch).toHaveLength(3)
  expect(result.changes).toEqual({ added: 0, changed: 1, removed: DROP.branch.length })
  expect(result.rounds).toBe(1)
  expect(final.nodes.map((node) => node.id)).toEqual(MENU_FLOW.nodes.map((node) => node.id).filter((id) => !DROP.branch.includes(id)))
  ai.say(DROP_TURN)
  ai.builds.push({ steps: [DROP_TEXT] })

  await openEditor(page, MENU_FLOW)
  const nodes = page.locator('.react-flow__node')
  const canvas = page.locator('.react-flow')
  await expect(canvas).toContainText(DROPPED_OPTION)
  await expect(canvas).toContainText(EXAMS_TEXT)
  const panel = await openCopilot(page)
  await ask(panel, DROP_REQUEST)
  const changes = await proposal(panel)
  await expect(changes).toHaveText(['0 componentes novos', '1 alterado', `${DROP.branch.length} removidos`])
  await expect(panel.getByRole('heading', { name: 'Edição pronta', exact: true })).toBeVisible()
  await expect(panel.getByText(removedList(MENU_FLOW, DROP.branch)), 'o cartão lista o ramo removido').toBeVisible()
  await expect(messages(panel)).toHaveText([you(DROP_REQUEST), says(DROP_TURN)])
  await expect(page.getByText(EDIT_DONE)).toBeVisible()
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(canvas).not.toContainText(DROPPED_OPTION)
  await expect(canvas).not.toContainText(EXAMS_TEXT)
  for (const text of DROP_KEPT) await expect(canvas).toContainText(text)
  for (const id of DROP.branch) await expect(page.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(0)
  expect(await saved(page)).toEqual(MENU_STATE)

  expect(ai.turnCalls()).toHaveLength(1)
  expect(historyOf(ai.turnCalls()[0])).toContain(DROP_REQUEST)
  expect(systemOf(ai.turnCalls()[0])).toEqual([copilotSystemPrompt(), copilotState(MENU_FLOW)])
  expect(ai.buildCalls()).toHaveLength(1)
  const sent = JSON.stringify(ai.buildCalls()[0].body)
  expect(sent).toContain('# Modo de edição')
  expect(sent).toContain(DROP_PLAN)
  expect(sent).not.toContain(DROP_REQUEST)
  expect(ai.buildCalls()[0].body.text.format.schema.required).toContain('remove')
  expect(ai.fallbacks).toEqual([])

  await panel.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(panel.getByText(APPLIED, { exact: true })).toBeVisible()
  await expect(messages(panel)).toHaveText([you(DROP_REQUEST), says(DROP_TURN), APPLIED, says(FOLLOW_UP)])
  await expect(nodes).toHaveCount(final.nodes.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(final.edges.length)
  await expect(canvas).not.toContainText(DROPPED_OPTION)
  await expect.poll(() => saved(page)).toEqual({ name: MENU_FLOW.name, nodes: final.nodes.map((node) => node.id) })
  const after = await stored(page)
  const applied = flowToRi(importFlow(after))
  expect(applied, 'o fluxo aplicado é o da proposta').toEqual(flowToRi(final))
  const menu = applied.nodes.find((node) => node.id === DROP.menu.id)
  expect(JSON.parse(menu.config.find((entry) => entry.key === 'options').value).map((item) => item.text)).toEqual(DROP_KEPT)
  expect(applied.edges.filter((edge) => edge.from === DROP.menu.id), 'as outras opções seguem para os mesmos destinos').toEqual(DROP.delta.edges)
  expect(after.edges.some((edge) => DROP.branch.includes(edge.source) || DROP.branch.includes(edge.target)), 'as conexões do ramo saem junto').toBe(false)
  for (const node of MENU_FLOW.nodes) {
    if (node.id === DROP.menu.id || DROP.branch.includes(node.id)) continue
    const kept = after.nodes.find((item) => item.id === node.id)
    expect(kept.data, node.id).toEqual(node.data)
    expect(kept.position, node.id).toEqual(node.position)
  }

  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(nodes).toHaveCount(MENU_FLOW.nodes.length)
  await expect(canvas).toContainText(DROPPED_OPTION)
  await expect(canvas).toContainText(EXAMS_TEXT)
  await expect.poll(() => saved(page)).toEqual(MENU_STATE)
  const undone = await stored(page)
  expect(undone.edges).toEqual(MENU_FLOW.edges)
  expect(ai.turnCalls()).toHaveLength(1)
  expect(ai.buildCalls()).toHaveLength(1)
})
