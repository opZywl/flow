const { test } = require('node:test')
const assert = require('node:assert/strict')
const { exportFlow, importFlow, validateFlow } = require('../lib/atendimento/format.ts')
const { componentCatalog, getDefinition, getComponentLabel, NOTE_TYPE } = require('../lib/atendimento/catalog.ts')
const { evaluateRi, concludeGeneration, needsCorrection, platformScope } = require('../lib/atendimento/ai/review.ts')
const { systemPrompt, componentBlock, correctionPrompt, PROMPT_EXAMPLES } = require('../lib/atendimento/ai/prompt.ts')
const { COMPONENT_GUIDE } = require('../lib/atendimento/ai/guide.ts')
const { mimeOf, slugOf, acceptedKeys } = require('../lib/atendimento/ai/values.ts')

const NOW = new Date('2026-10-11T12:00:00.000Z')
const pairs = config => Object.entries(config).map(([key, value]) => ({ key, value }))
const node = (id, type, config = {}) => ({ id, type, config: pairs(config) })
const edge = (from, output, to) => ({ from, output, to })
const flowOf = (nodes, edges) => ({ name: 'Fluxo de teste', description: 'Fluxo usado nos testes', nodes, edges })
const blockOf = type => componentBlock(getDefinition(type))
const lineOf = (type, key) => blockOf(type).split('\n').find(line => line.startsWith(`- ${key}:`))
const summary = issues => issues.map(issue => `${issue.severity}/${issue.scope}: ${issue.message}`)

test('Qualificar Lead: setStatus is optional and a tag-only update needs no correction', () => {
  const line = lineOf('crmLeadUpdate', 'setStatus')
  assert.ok(line, 'setStatus listado')
  assert.ok(!line.includes('obrigatório'), line)
  assert.ok(blockOf('crmLeadUpdate').includes('Defina ao menos um entre setStatus, addTags e setValue, só os que o pedido mandar alterar.'))
  assert.ok(!(COMPONENT_GUIDE.crmLeadUpdate.required ?? []).includes('setStatus'))
  const evaluation = evaluateRi(flowOf(
    [node('lead', 'crmLeadUpdate', { addTags: 'vip' }), node('ok', 'finalizar'), node('falha', 'finalizar')],
    [edge('inicio', '', 'lead'), edge('lead', 'Sucesso', 'ok'), edge('lead', 'Falha', 'falha')],
  ), { now: NOW })
  assert.deepEqual(evaluation.pending, [])
  assert.deepEqual(summary(evaluation.issues), [])
  const target = evaluation.assembled.flow.nodes.find(entry => entry.data.type === 'crmLeadUpdate')
  assert.equal(target.data.data.setStatus, '')
  assert.equal(target.data.data.addTags, 'vip')
})

test('HubSpot lifecyclestage lists the internal values the field accepts', () => {
  const suggestions = getDefinition('hubspotUpsertContact').fields.find(field => field.key === 'lifecyclestage').suggestions
  assert.deepEqual(suggestions, ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer', 'evangelist', 'other'])
  const line = lineOf('hubspotUpsertContact', 'lifecyclestage')
  assert.ok(line.endsWith(`Valores usuais: ${suggestions.map(value => JSON.stringify(value)).join(', ')}.`), line)
  const block = blockOf('hubspotUpsertContact')
  assert.ok(block.includes('lifecyclestage aceita só os valores usuais listados, em inglês e sem traduzir.'), block)
})

test('every catalog suggestion reaches the prompt line of its field', () => {
  let checked = 0
  for (const definition of componentCatalog) {
    for (const field of definition.fields ?? []) {
      if (!field.suggestions?.length) continue
      const line = lineOf(definition.nativeType, field.key)
      if (!line) continue
      for (const value of field.suggestions) assert.ok(line.includes(JSON.stringify(value)), `${definition.nativeType}.${field.key} ${value}`)
      checked++
    }
  }
  assert.ok(checked >= 4, `${checked} campos`)
})

test('Inteligência without an agent becomes a platform data item, without a correction round', () => {
  const ri = flowOf([node('ia', 'OpenAI')], [edge('inicio', '', 'ia')])
  const evaluation = evaluateRi(ri, { now: NOW })
  assert.deepEqual(summary(evaluation.issues), ['warning/plataforma: Selecione o agente de IA.'])
  assert.deepEqual(evaluation.pending, [])
  assert.equal(needsCorrection(evaluation), false)
  assert.deepEqual(summary(concludeGeneration(evaluation).issues), ['warning/plataforma: Selecione o agente de IA.'])
  for (const config of [{ 'df-OpenAI': 'ChatGPT' }, { aiModel: 'modelo-ia-1' }]) {
    const named = evaluateRi(flowOf([node('ia', 'OpenAI', config)], [edge('inicio', '', 'ia')]), { now: NOW })
    assert.deepEqual(summary(named.issues), [], JSON.stringify(config))
  }
  const issue = validateFlow(evaluation.assembled.flow).find(entry => entry.message === 'Selecione o agente de IA.')
  assert.deepEqual(issue.fields, ['df-OpenAI', 'aiModel'])
  const text = exportFlow(evaluation.assembled.flow)
  assert.equal(exportFlow(importFlow(text)), text)
  const agent = JSON.parse(text).nodes.find(entry => entry.data.type === 'OpenAI')
  assert.deepEqual(agent.data.data, { openai: '', 'df-OpenAI': '', aiProvider: 'IA Generativa', aiModel: '' })
})

test('JSON lists without a known format are platform data', () => {
  for (const [type, key] of [['rdStationConversion', 'customFields'], ['hubspotUpsertContact', 'properties'], ['trackEvent', 'properties']]) {
    const line = lineOf(type, key)
    assert.ok(line.includes('lista JSON') && line.includes('dado da plataforma'), line)
  }
  for (const definition of componentCatalog) {
    for (const field of definition.fields ?? []) {
      if (field.kind !== 'json' || field.hint !== 'Lista JSON no formato da plataforma.') continue
      assert.ok(lineOf(definition.nativeType, field.key).includes('dado da plataforma'), `${definition.nativeType}.${field.key}`)
    }
  }
})

test('the Enviar Arquivo rule only promises what the URL can give', () => {
  const rule = blockOf('envio_arquivo').split('\n').find(line => line.startsWith('Regras:'))
  assert.ok(!rule.includes('deduzidos da URL'), rule)
  assert.ok(rule.includes('informe filename e mime_type'), rule)
  const listed = /como ([a-z0-9, ]+) e ([a-z0-9]+)\./.exec(rule)
  assert.ok(listed, rule)
  const extensions = [...listed[1].split(', '), listed[2]]
  assert.ok(extensions.length >= 6, extensions.join(','))
  for (const extension of extensions) assert.notEqual(mimeOf(`arquivo.${extension}`), '', extension)
  const sending = config => evaluateRi(flowOf([node('arq', 'envio_arquivo', config), node('fim', 'finalizar')], [edge('inicio', '', 'arq'), edge('arq', '', 'fim')]), { now: NOW })
  const assembled = url => sending({ url })
  const known = assembled('https://cdn.exemplo.com/docs/contrato.pdf')
  assert.deepEqual(summary(known.issues), [])
  const unknown = assembled('https://drive.exemplo.com/uc?id=abc123')
  assert.deepEqual(summary(unknown.issues), ['warning/ia: Informe o tipo do arquivo (MIME).'])
  const explicit = sending({ url: 'https://drive.exemplo.com/uc?id=abc123', filename: 'manual.pdf', mime_type: 'application/pdf' })
  assert.deepEqual(summary(explicit.issues), [])
})

test('Entrada de Dados is described as the step that waits for the answer', () => {
  const block = blockOf('Data_Input_Condicional')
  assert.ok(!block.includes('Valida um campo informado pelo contato.'), block)
  assert.ok(block.includes('Aguarda a resposta do contato, guarda o texto em field'), block)
  assert.ok(block.includes('Faça a pergunta antes, com Enviar Mensagem'), block)
  assert.ok(block.includes('não coloque Aguardando Mensagem antes dele'), block)
  for (const label of getDefinition('Data_Input_Condicional').outputLabels) assert.ok(block.includes(label), label)
})

test('the Nota block says it stays out of the path, and only the real dead ends say they close it', () => {
  const note = blockOf(NOTE_TYPE)
  assert.ok(note.includes('Sem entradas nem saídas: fica fora do caminho.'), note)
  assert.ok(!note.includes('encerra o caminho'), note)
  for (const definition of componentCatalog) {
    if (definition.nativeType === NOTE_TYPE || definition.outputRule || definition.outputLabels.length) continue
    assert.ok(blockOf(definition.nativeType).includes('Sem saídas: encerra o caminho.'), definition.nativeType)
  }
  assert.ok(systemPrompt().includes(note))
})

test('protocol and overnight rules tell the model what to do without inventing data', () => {
  const protocol = blockOf('protocolo')
  assert.ok(protocol.includes('Use opt "URL" só quando o pedido informar a URL da API em url_api; sem ela, use "Automático", que dispensa url_api.'), protocol)
  assert.ok(getDefinition('protocolo').fields.find(field => field.key === 'opt').options.some(option => option.value === 'Automático'))
  const time = blockOf('timeConditions')
  assert.ok(time.includes('Horário que passa da meia-noite vira duas regras.'), time)
})

test('guide keys exist in the catalog and the prompt keeps its size budget', () => {
  for (const [type, guide] of Object.entries(COMPONENT_GUIDE)) {
    const definition = getDefinition(type)
    assert.ok(definition, type)
    const keys = new Set((definition.fields ?? []).map(field => field.key))
    for (const key of [...(guide.required ?? []), ...(guide.platform ?? [])]) assert.ok(keys.has(key), `${type}.${key}`)
    for (const key of guide.required ?? []) assert.ok(!(guide.platform ?? []).includes(key), `${type}.${key}`)
  }
  const prompt = systemPrompt()
  assert.ok(prompt.length < 60000, `${prompt.length} caracteres`)
  assert.ok(!/[—–]/.test(prompt), 'sem travessão')
  assert.ok(!/!/.test(prompt.split('# Exemplos')[0]), 'sem exclamação')
})

test('menus, transfers and captured answers guide the model to complete paths', () => {
  assert.ok(blockOf('envio_mensagem').includes('Em submenus, inclua uma opção para voltar, ligada a Retornar ao Menu.'))
  assert.ok(blockOf('voltar').includes('no fim dos ramos que só informam e na opção de voltar dos submenus'))
  assert.ok(blockOf('departamentos').includes('Para avisar o contato da transferência, coloque antes um Enviar Mensagem.'))
  const wait = blockOf('waitForAnswer')
  assert.ok(wait.includes('Faça a pergunta antes, com Enviar Mensagem.') && wait.includes('Depois use @@@campo nas mensagens.'), wait)
  const prompt = systemPrompt()
  const order = ['# Regras do fluxo', '# Fluxo completo', '# Ordem de escrita', '# Componentes', '# Exemplos'].map(title => prompt.indexOf(title))
  assert.ok(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])), order.join(','))
})

const CONFIRM_ID = 'Confira: ID do departamento provisório, troque pelo valor cadastrado na plataforma.'
const CONFIRM_URL = 'Confira: URL da API provisória, troque pelo valor cadastrado na plataforma.'
const API_WARNING = 'API não validada: valide na plataforma depois de importar.'
const NAME_FIELDS = {
  departamentos: 'name',
  tags: 'tags',
  flow: 'flowName',
  transferir: 'agenteName',
  backToAgent: 'departmentName',
  templateMessage: 'templateName',
  templateInteractive: 'templateName',
  pixCharge: 'templateName',
  sequenceEnroll: 'sequenceName',
  sequenceUnenroll: 'sequenceName',
  tabulation: 'tabulacaoName',
  aiAgentBlock: 'generativeAiName',
  whatsappFlow: 'formName',
  googleSheetsAppend: 'sheetName',
}
const referencesOf = type => COMPONENT_GUIDE[type].references ?? []
const single = (type, config = {}) => flowOf([node('c', type, config)], [edge('inicio', '', 'c')])

test('names are never platform data and every reference in the guide points to real keys', () => {
  for (const [type, key] of Object.entries(NAME_FIELDS)) {
    assert.ok(!(COMPONENT_GUIDE[type].platform ?? []).includes(key), `${type}.${key}`)
    assert.ok(!lineOf(type, key).includes('dado da plataforma'), `${type}.${key}`)
    assert.ok(referencesOf(type).some(reference => reference.name === key), `${type}.${key}`)
  }
  for (const [type, guide] of Object.entries(COMPONENT_GUIDE)) {
    for (const reference of guide.references ?? []) {
      const accepted = acceptedKeys(type)
      for (const key of [reference.name, reference.id, reference.unless].filter(Boolean)) assert.ok(accepted.includes(key), `${type}.${key}`)
      assert.ok(reference.name || reference.id, type)
      assert.ok(reference.fallback.trim() && slugOf(reference.fallback), type)
      if (reference.id) assert.ok(guide.platform.includes(reference.id), `${type}.${reference.id}`)
    }
  }
})

test('an empty name is an AI pending item that asks for a correction round', () => {
  for (const [type, key] of Object.entries(NAME_FIELDS)) {
    if (!(COMPONENT_GUIDE[type].required ?? []).includes(key)) continue
    const config = Object.fromEntries(referencesOf(type).filter(reference => reference.id).map(reference => [reference.id, 'cadastro-1']))
    const evaluation = evaluateRi(single(type, config), { now: NOW, prompt: 'Pedido com cadastro-1' })
    const named = evaluation.issues.filter(issue => issue.scope === 'ia' && (issue.message.startsWith('Informe o nome') || issue.message.includes(`(${key})`)))
    assert.equal(named.length, 1, `${type}: ${summary(evaluation.issues).join(' | ')}`)
    assert.equal(needsCorrection(evaluation), true, type)
    assert.ok(evaluation.pending.some(item => item.includes(named[0].message)), type)
  }
  const evaluation = evaluateRi(single('departamentos', { departamento: 'suporte' }), { now: NOW, prompt: 'Suporte da NetFibra' })
  assert.deepEqual(summary(evaluation.issues), ['warning/ia: Informe o nome do departamento.'])
  assert.deepEqual(evaluation.pending, [`[c] ${getComponentLabel('departamentos')}: Informe o nome do departamento.`])
  const fixed = evaluateRi(single('departamentos', { departamento: 'suporte', name: 'Suporte' }), { now: NOW, prompt: 'Suporte da NetFibra' })
  assert.deepEqual(summary(fixed.issues), [])
  for (const message of ['Informe o nome do departamento.', 'Informe o nome da tag.', 'Informe o nome do fluxo de destino.', 'Informe o nome do template.', 'Informe o nome do agente.', 'Informe o nome do agente de IA.', 'Informe o nome da lista.', 'Informe o nome da tabulação.']) {
    assert.equal(platformScope(message), 'ia', message)
  }
  for (const message of ['Informe o ID do departamento.', 'Informe a URL da API.', 'Informe a planilha.', API_WARNING]) assert.equal(platformScope(message), 'plataforma', message)
  const correction = correctionPrompt(evaluation.pending)
  assert.ok(correction.includes('Nome pendente recebe o nome que o pedido traz ou um nome coerente com o contexto.'), correction)
})

test('rule 6 asks for every field filled, with provisional IDs and URLs, in positive form', () => {
  const prompt = systemPrompt()
  const rule = prompt.split('\n').find(line => line.startsWith('6. Preencha todos os campos'))
  assert.ok(rule, 'regra 6')
  for (const part of [
    'Preencha todos os campos de todos os componentes.',
    'Nomes de departamento, tag, fluxo de destino, template, agente, lista, tabulação, formulário e aba recebem o nome que o pedido traz',
    'um nome claro e coerente com o contexto',
    'ID em letras minúsculas com hífen, feito a partir do nome, por exemplo suporte-tecnico',
    'URL no domínio da empresa do pedido, por exemplo https://api.lucas-lima.xyz/v1/boletos',
    'https://api.lucas-lima.xyz/',
  ]) assert.ok(rule.includes(part), part)
  for (const banned of ['omita', 'Nunca invente', 'fica vazio', 'Chaves vazias']) assert.ok(!prompt.includes(banned), banned)
  assert.ok(prompt.includes('Escreva cada chave com o seu valor preenchido.'))
  for (const example of PROMPT_EXAMPLES) {
    for (const entry of example.ri.nodes.filter(item => item.type === 'departamentos')) {
      const config = Object.fromEntries(entry.config.map(item => [item.key, item.value]))
      assert.ok(config.name?.trim(), `${example.title} ${entry.id}`)
      assert.equal(config.departamento, slugOf(config.name), `${example.title} ${entry.id}`)
    }
  }
  assert.equal(slugOf('Suporte Técnico'), 'suporte-tecnico')
  assert.equal(slugOf('  Cobrança / PIX  '), 'cobranca-pix')
  assert.equal(slugOf('Atendimento concluído'), 'atendimento-concluido')
})

test('a provisional platform ID or URL stays visible to the user without a correction round', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: JSON.stringify([{ text: 'Suporte técnico' }, { text: 'Segunda via' }]) }),
    node('tecnico', 'departamentos', { departamento: 'suporte-tecnico', name: 'Suporte Técnico' }),
    node('boletos', 'consulta_api', { url_api: 'https://api.netfibra.com.br/v1/boletos', text: 'Consultando seus boletos.' }),
    node('ok', 'finalizar'),
    node('erro', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Suporte técnico', 'tecnico'), edge('menu', 'Segunda via', 'boletos'), edge('boletos', 'Falha', 'erro'), edge('boletos', 'Sucesso', 'ok')])
  const prompt = 'Atendimento da NetFibra com menu de suporte técnico e segunda via de boletos.'
  const evaluation = evaluateRi(ri, { now: NOW, prompt })
  assert.deepEqual(evaluation.issues.map(issue => [issue.scope, issue.riId, issue.message]), [
    ['plataforma', 'tecnico', CONFIRM_ID],
    ['plataforma', 'boletos', CONFIRM_URL],
    ['plataforma', 'boletos', API_WARNING],
  ])
  assert.deepEqual(evaluation.pending, [])
  assert.equal(needsCorrection(evaluation), false)
  assert.deepEqual(concludeGeneration(evaluation).issues.map(issue => issue.message), [CONFIRM_ID, CONFIRM_URL, API_WARNING])

  const given = evaluateRi(ri, { now: NOW, prompt: `${prompt} Departamento suporte-tecnico e API api.netfibra.com.br/v1/boletos/.` })
  assert.deepEqual(summary(given.issues), [`warning/plataforma: ${API_WARNING}`])
  assert.deepEqual(summary(evaluateRi(ri, { now: NOW }).issues), [`warning/plataforma: ${API_WARNING}`])
  const partial = evaluateRi(single('departamentos', { departamento: 'suporte', name: 'Suporte' }), { now: NOW, prompt: 'Equipe de suportes' })
  assert.deepEqual(summary(partial.issues), [`warning/plataforma: ${CONFIRM_ID}`])
  const known = evaluateRi(single('departamentos', { departamento: 'dep-42', name: 'Suporte' }), { now: NOW, prompt: 'Troque a mensagem de boas-vindas', known: JSON.stringify({ departamento: 'dep-42' }) })
  assert.deepEqual(summary(known.issues), [])
  assert.deepEqual(summary(evaluateRi(single('departamentos', { departamento: 'dep-42', name: 'Suporte' }), { now: NOW, known: 'dep-42' }).issues), [])

  const automatic = evaluateRi(flowOf([node('proto', 'protocolo', { url_api: 'https://api.exemplo.com.br/protocolos', text: 'Protocolo {protocol}.' }), node('fim', 'finalizar')], [edge('inicio', '', 'proto'), edge('proto', '', 'fim')]), { now: NOW, prompt: 'Protocolo automático' })
  assert.deepEqual(summary(automatic.issues), [])
  const image = evaluateRi(flowOf([node('img', 'envio_imagem', { imagem: 'https://cdn.exemplo.com.br/banner.png' }), node('fim', 'finalizar')], [edge('inicio', '', 'img'), edge('img', '', 'fim')]), { now: NOW, prompt: 'Envie o banner' })
  assert.deepEqual(summary(image.issues), ['warning/plataforma: Confira: URL da imagem provisória, troque pelo valor cadastrado na plataforma.'])
})

test('after the rounds an empty name or ID gets a provisional value and the flow never leaves with an empty department', () => {
  const ri = flowOf([
    node('menu', 'envio_mensagem', { title: 'Como podemos ajudar?', options: JSON.stringify([{ text: 'Atendimento' }, { text: 'Suporte' }, { text: 'Sair da lista' }]) }),
    node('atendimento', 'departamentos'),
    node('suporte', 'departamentos', { name: 'Suporte Técnico' }),
    node('sair', 'sequenceUnenroll', { allSequences: 'true' }),
    node('fim', 'finalizar'),
  ], [edge('inicio', '', 'menu'), edge('menu', 'Atendimento', 'atendimento'), edge('menu', 'Suporte', 'suporte'), edge('menu', 'Sair da lista', 'sair'), edge('sair', '', 'fim')])
  const evaluation = evaluateRi(ri, { now: NOW, prompt: 'Menu de atendimento' })
  assert.ok(needsCorrection(evaluation))
  const outcome = concludeGeneration(evaluation)
  const dataOf = riId => outcome.workflow.nodes.find(entry => entry.id === evaluation.assembled.platformIds.get(riId)).data.data
  assert.deepEqual(dataOf('atendimento'), { departamentos: '', 'df-channel': '', id: 'atendimento', departamento: 'atendimento', name: 'Atendimento', enabled: true, userManager: null })
  assert.deepEqual([dataOf('suporte').name, dataOf('suporte').departamento, dataOf('suporte').id], ['Suporte Técnico', 'suporte-tecnico', 'suporte-tecnico'])
  assert.deepEqual([dataOf('sair').sequenceId, dataOf('sair').sequenceName], ['', ''])
  assert.deepEqual(outcome.issues.map(issue => [issue.scope, issue.riId, issue.message]), [
    ['ajuste', 'atendimento', 'Preenchido com valor provisório: nome do departamento “Atendimento”, ID do departamento “atendimento”. Revise.'],
    ['ajuste', 'suporte', 'Preenchido com valor provisório: ID do departamento “suporte-tecnico”. Revise.'],
    ['plataforma', 'atendimento', CONFIRM_ID],
    ['plataforma', 'suporte', CONFIRM_ID],
  ])
  assert.deepEqual(validateFlow(outcome.workflow), [])
  for (const entry of outcome.workflow.nodes.filter(item => item.data.type === 'departamentos')) assert.ok(entry.data.data.name.trim(), entry.id)
  const text = exportFlow(outcome.workflow)
  assert.equal(exportFlow(importFlow(text)), text)

  for (const [type, guide] of Object.entries(COMPONENT_GUIDE)) {
    if (!guide.references?.length) continue
    const done = concludeGeneration(evaluateRi(single(type), { now: NOW, prompt: 'Pedido sem dados' }))
    const target = done.workflow.nodes.find(entry => entry.data.type === type)
    const keys = new Set(guide.references.flatMap(reference => [reference.name, reference.id]).filter(Boolean))
    for (const key of keys) assert.ok(String(target.data.data[key] ?? '').trim(), `${type}.${key}`)
    for (const issue of validateFlow(done.workflow)) assert.ok(!(issue.fields ?? []).some(field => keys.has(field)), `${type}: ${issue.message}`)
    assert.ok(done.issues.some(issue => issue.scope === 'ajuste' && issue.message.startsWith('Preenchido com valor provisório: ')), type)
    const exported = exportFlow(done.workflow)
    assert.equal(exportFlow(importFlow(exported)), exported, type)
  }
})

const { promptExamples, correctionRules, FILL_CORRECTION } = require('../lib/atendimento/ai/prompt.ts')
const { guideOf } = require('../lib/atendimento/ai/guide.ts')
const PLAIN_RULE = '6. Campos marcados como dado da plataforma (IDs e nomes cadastrados, URLs de APIs, arquivos e imagens, planilhas): use só o que o pedido informar. Sem a informação, omita a chave: o campo fica vazio e o usuário completa no editor. Nunca invente IDs, URLs ou planilhas.'
const PLAIN_KEYS = '6. Escreva só as chaves que mudam o padrão. Chaves vazias e chaves com o valor padrão ficam fora da RI.'
const plainLineOf = (type, key) => componentBlock(getDefinition(type), { fill: false }).split('\n').find(line => line.startsWith(`- ${key}:`))

test('without fill the names go back to platform data and the prompt asks to leave missing values out', () => {
  for (const [type, key] of Object.entries(NAME_FIELDS)) {
    const line = plainLineOf(type, key)
    assert.ok(line.includes('dado da plataforma'), line)
    assert.ok(!line.includes('obrigatório'), line)
    assert.ok(guideOf(type, false).platform.includes(key), `${type}.${key}`)
    assert.ok(!(guideOf(type, false).required ?? []).includes(key), `${type}.${key}`)
    for (const reference of referencesOf(type).filter(entry => entry.id)) assert.ok(plainLineOf(type, reference.id).includes('dado da plataforma'), `${type}.${reference.id}`)
  }
  assert.ok(plainLineOf('flow', 'flowDescription').includes('dado da plataforma'))
  assert.ok(plainLineOf('whatsappFlow', 'templateName').includes('dado da plataforma'))
  assert.ok(!lineOf('flow', 'flowDescription').includes('dado da plataforma'))
  assert.ok(plainLineOf('envio_pergunta', 'template').includes('obrigatório'))
  assert.equal(guideOf('envio_pergunta', false), COMPONENT_GUIDE.envio_pergunta)
  assert.equal(guideOf('departamentos', true), COMPONENT_GUIDE.departamentos)
  assert.equal(guideOf('nao_existe', false), undefined)

  const plain = systemPrompt({ fill: false })
  const lines = plain.split('\n')
  assert.ok(lines.includes(PLAIN_RULE))
  assert.ok(lines.includes(PLAIN_KEYS))
  for (const removed of ['Preencha todos os campos', 'Escreva cada chave com o seu valor preenchido', 'provisório coerente', 'api.lucas-lima.xyz']) assert.ok(!plain.includes(removed), removed)
  assert.equal(systemPrompt(), systemPrompt({ fill: true }))
  assert.notEqual(plain, systemPrompt())
  assert.ok(!systemPrompt().split('\n').includes(PLAIN_RULE))

  const examples = promptExamples({ fill: false })
  assert.equal(examples.length, PROMPT_EXAMPLES.length)
  assert.equal(promptExamples(), PROMPT_EXAMPLES)
  for (const example of examples) {
    assert.ok(plain.includes(JSON.stringify(example.ri)), example.title)
    assert.ok(!example.title.includes('provisório') && !example.title.includes('sem os IDs'), example.title)
    for (const entry of example.ri.nodes.filter(item => item.type === 'departamentos')) {
      assert.deepEqual(entry.config.map(item => item.key), ['name'], `${example.title} ${entry.id}`)
    }
  }
  assert.ok(PROMPT_EXAMPLES.some(example => example.ri.nodes.some(entry => entry.config.some(item => item.key === 'departamento'))))

  assert.ok(correctionPrompt(['[c] pendência']).includes(FILL_CORRECTION))
  assert.ok(!correctionPrompt(['[c] pendência'], { fill: false }).includes(FILL_CORRECTION))
  assert.equal(correctionRules({ fill: false }).length, correctionRules().length - 1)
  assert.ok(!correctionRules({ fill: false }).includes(FILL_CORRECTION))
  for (const text of [plain, correctionPrompt(['x'], { fill: false })]) assert.equal(/[!—–]/.test(text), false)
})

test('without fill a missing name, ID or URL is platform data with no correction round, no provisional value and no warning', () => {
  for (const message of ['Informe o nome do departamento.', 'Informe o nome da tag.', 'Informe o nome do fluxo de destino.', 'Informe o nome do template.', 'Informe o nome do agente.', 'Informe o nome do agente de IA.', 'Informe o nome da lista.', 'Informe o nome da tabulação.', 'Informe o ID do departamento.', 'Informe a URL da API.']) {
    assert.equal(platformScope(message, false), 'plataforma', message)
  }
  assert.equal(platformScope('Informe o nome do evento.', false), 'ia')
  assert.equal(platformScope('Informe o nome do departamento.'), 'ia')

  const empty = evaluateRi(single('departamentos'), { now: NOW, prompt: 'Menu de atendimento', fill: false })
  assert.deepEqual(summary(empty.issues), ['warning/plataforma: Informe o ID do departamento.', 'warning/plataforma: Informe o nome do departamento.'])
  assert.deepEqual(empty.pending, [])
  assert.equal(needsCorrection(empty), false)
  const outcome = concludeGeneration(empty)
  const target = outcome.workflow.nodes.find(entry => entry.data.type === 'departamentos')
  assert.deepEqual(['name', 'departamento', 'id'].map(key => target.data.data[key] ?? ''), ['', '', ''])
  assert.deepEqual(summary(outcome.issues), ['warning/plataforma: Informe o ID do departamento.', 'warning/plataforma: Informe o nome do departamento.'])
  const text = exportFlow(outcome.workflow)
  assert.equal(exportFlow(importFlow(text)), text)

  const filled = concludeGeneration(evaluateRi(single('departamentos'), { now: NOW, prompt: 'Menu de atendimento' }))
  assert.equal(filled.workflow.nodes.find(entry => entry.data.type === 'departamentos').data.data.departamento, 'atendimento')

  const ri = flowOf([
    node('tecnico', 'departamentos', { departamento: 'suporte-tecnico', name: 'Suporte Técnico' }),
  ], [edge('inicio', '', 'tecnico')])
  assert.deepEqual(summary(evaluateRi(ri, { now: NOW, prompt: 'Atendimento da NetFibra', fill: false }).issues), [])
  assert.deepEqual(summary(evaluateRi(ri, { now: NOW, prompt: 'Atendimento da NetFibra' }).issues), [`warning/plataforma: ${CONFIRM_ID}`])

  for (const [type, guide] of Object.entries(COMPONENT_GUIDE)) {
    if (!guide.references?.length) continue
    const evaluation = evaluateRi(single(type), { now: NOW, prompt: 'Pedido sem dados', fill: false })
    const keys = new Set(guide.references.flatMap(reference => [reference.name, reference.id]).filter(Boolean))
    for (const issue of evaluation.issues.filter(entry => entry.scope === 'ia')) {
      assert.ok(!issue.message.startsWith('Informe o nome') && ![...keys].some(key => issue.message.includes(`(${key})`)), `${type}: ${issue.message}`)
    }
    const done = concludeGeneration(evaluation)
    const data = done.workflow.nodes.find(entry => entry.data.type === type).data.data
    for (const key of keys) assert.ok(!String(data[key] ?? '').trim(), `${type}.${key}`)
    assert.ok(!done.issues.some(issue => issue.message.startsWith('Confira:') || issue.message.startsWith('Preenchido com valor provisório')), type)
  }
})
