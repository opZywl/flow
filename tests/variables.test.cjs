const { test } = require('node:test')
const assert = require('node:assert/strict')
const { newFlow, newNode, createEdge, validateFlow } = require('../lib/atendimento/format.ts')
const { PLATFORM_VARIABLES, availableVariables, createdVariables, variableWarnings } = require('../lib/atendimento/variables.ts')
const { renderText } = require('../lib/atendimento/simulator.ts')

const DATE = new Date('2026-01-15T12:00:00.000Z')

function chain(...steps) {
  const flow = newFlow(DATE)
  let previous = 'inicio'
  steps.forEach(([type, data], index) => {
    const node = newNode(type, { x: 300 * (index + 1), y: 60 }, String(index + 2))
    Object.assign(node.data.data, data)
    flow.nodes.push(node)
    flow.edges.push(createEdge(flow.edges, previous, 'output-0', node.id))
    previous = node.id
  })
  return flow
}

const tokens = (list) => list.map((variable) => variable.token)

test('the six platform variables are always available with the platform descriptions', () => {
  assert.deepEqual(tokens(PLATFORM_VARIABLES), ['#NAME', '@@@GREETING', '#DATE_BRAZIL', '#TIME_PM', '#DATE_TIME_BRAZIL', '#PROTOCOL'])
  assert.equal(PLATFORM_VARIABLES[0].description, 'Nome do contato')
  assert.equal(PLATFORM_VARIABLES[5].description, 'Gera um número de protocolo')
})

test('components create variables from the answer field, the response map and their output variables', () => {
  assert.deepEqual(createdVariables('waitForAnswer', { customFields: 'custom:12:cpf' }), ['cpf'])
  assert.deepEqual(createdVariables('waitForAnswer', { customFields: '', customfields: 'empresa' }), ['empresa'])
  assert.deepEqual(createdVariables('consulta_api', { response_map: [{ path: 'data.nome', variable: 'nome' }, { path: 'data.plano', variable: 'plano' }, { path: 'x', variable: 'nome' }] }), ['nome', 'plano'])
  assert.deepEqual(createdVariables('ticketCreate', { outputVar: 'chamado_id' }), ['chamado_id'])
  assert.deepEqual(createdVariables('crmIdentify', { contactVar: 'contato', leadVar: 'lead' }), ['contato', 'lead'])
  assert.deepEqual(createdVariables('envio_pergunta', { template: '@@@cpf' }), [])
  assert.deepEqual(createdVariables('constructor', {}), [])
})

test('a component sees only the variables created before it on a path from the start', () => {
  const flow = chain(
    ['envio_pergunta', { template: 'Qual é o seu CPF?' }],
    ['waitForAnswer', { customFields: 'cpf' }],
    ['envio_pergunta', { template: 'Obrigado, #NAME. CPF @@@cpf recebido.' }],
  )
  assert.deepEqual(tokens(availableVariables(flow, '4').created), ['@@@cpf'])
  assert.deepEqual(availableVariables(flow, '4').created[0].nodeId, '3')
  assert.deepEqual(availableVariables(flow, '3').created, [])
  assert.deepEqual(availableVariables(flow, '2').created, [])
  assert.deepEqual(tokens(availableVariables(flow, '4').always), tokens(PLATFORM_VARIABLES))
})

test('using a variable before the component that creates it is a warning, and so is an unknown platform variable', () => {
  const flow = chain(
    ['envio_pergunta', { template: '@@@GREETING, #NOME. Seu CPF @@@cpf. Data #DATE_BRAZIL.' }],
    ['waitForAnswer', { customFields: 'cpf' }],
    ['envio_pergunta', { template: 'CPF @@@cpf e campo @@@email do contato.' }],
  )
  const warnings = variableWarnings(flow)
  assert.deepEqual(warnings.map(({ nodeId, message }) => [nodeId, message]), [
    ['2', 'Variável #NOME desconhecida. As variáveis da plataforma são #NAME, @@@GREETING, #DATE_BRAZIL, #TIME_PM, #DATE_TIME_BRAZIL e #PROTOCOL.'],
    ['2', 'A variável @@@cpf ainda não existe aqui: ela é criada depois, em Aguardando Mensagem (ID 3).'],
  ])
  assert.deepEqual(warnings[1].fields, ['template'])
  const issues = validateFlow(flow).filter((issue) => issue.nodeId === '2' && /variável/i.test(issue.message))
  assert.ok(issues.length === 2 && issues.every((issue) => issue.severity === 'warning'))
  for (const { message } of warnings) assert.doesNotMatch(message, /[!—–]/)
})

test('the preview fills the six platform variables', () => {
  const variables = { name: 'Ana' }
  const morning = new Date('2026-01-15T12:05:00.000Z')
  assert.equal(renderText('@@@GREETING, #NAME.', variables, morning), 'Bom dia, Ana.')
  assert.equal(renderText('@@@GREETING', {}, new Date('2026-01-15T18:00:00.000Z')), 'Boa tarde')
  assert.equal(renderText('@@@GREETING', {}, new Date('2026-01-15T23:30:00.000Z')), 'Boa noite')
  assert.equal(renderText('#DATE_BRAZIL #TIME_PM', {}, morning), '15/01/2026 09:05')
  assert.equal(renderText('#DATE_TIME_BRAZIL', {}, morning), '15/01/2026 09:05')
  const protocol = {}
  const first = renderText('Protocolo #PROTOCOL', protocol, morning)
  assert.notEqual(first, 'Protocolo #PROTOCOL')
  assert.equal(renderText('Protocolo #PROTOCOL', protocol, morning), first)
  assert.equal(renderText('#NAME', {}, morning), '#NAME')
})
