const { test } = require('node:test')
const assert = require('node:assert/strict')
const { exportFlow, importFlow, validateFlow } = require('../lib/atendimento/format.ts')
const { componentCatalog, getDefinition, NOTE_TYPE } = require('../lib/atendimento/catalog.ts')
const { evaluateRi, concludeGeneration, needsCorrection } = require('../lib/atendimento/ai/review.ts')
const { systemPrompt, componentBlock } = require('../lib/atendimento/ai/prompt.ts')
const { COMPONENT_GUIDE } = require('../lib/atendimento/ai/guide.ts')
const { mimeOf } = require('../lib/atendimento/ai/values.ts')

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

test('Agentes de IA without an agent becomes a platform data item, without a correction round', () => {
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
  assert.ok(protocol.includes('Use opt "URL" só quando o pedido informar a URL da API em url_api; sem ela, use "Automático".'), protocol)
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
