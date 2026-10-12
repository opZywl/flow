require('../../scripts/register-typescript.cjs')
const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
const { createEdge, newFlow, newNode, outputHandles, outputLabel } = require('../../lib/atendimento/format.ts')
const { START_TYPE, categories, componentCatalog } = require('../../lib/atendimento/catalog.ts')

const NODE_KEYS = ['id', 'type', 'position', 'data', 'measured', 'selected', 'dragging']
const START_KEYS = ['id', 'type', 'position', 'data', 'deletable', 'measured', 'selected', 'dragging']
const EDGE_KEYS = ['type', 'source', 'sourceHandle', 'target', 'id']
const DATA_KEYS = ['type', 'data', 'html']
const CREATED_AT = /"created_at": "[^"]*"/
const PALETTE = categories.flatMap(category => componentCatalog.filter(entry => entry.category === category.id && entry.nativeType !== START_TYPE))
const FILLED = {
  envio_pergunta: { template: 'Mensagem criada no editor' },
  envio_mensagem: { title: 'Escolha uma opção', 'text-1': 'Primeira opção' },
}

function sample() {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = 'Atendimento de teste'
  flow.nodes[0].position = { x: 30, y: 60 }
  const menu = newNode('envio_mensagem', { x: 350, y: 60 }, '2')
  Object.assign(menu.data.data, { title: 'Olá! Como podemos ajudar? 😊', 'text-1': 'Opção 1', 'opt-2': '2', 'text-2': 'Equipe A', 'description-2': 'Falar com a equipe' })
  menu.data.html = '<div onclick="window.__unsafeHtmlExecuted = true">Modelo preservado</div>'
  flow.nodes.push(menu, newNode('finalizar', { x: 680, y: 60 }, '3'), newNode('finalizar', { x: 680, y: 300 }, '4'))
  flow.edges = [createEdge([], '2', 'output-1', '4'), createEdge([], 'inicio', 'output-0', '2'), createEdge([], '2', 'output-0', '3')]
  flow.extra = { nullValue: null, value: false, literal: 'false' }
  return flow
}

function connectedStart(name) {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = name
  flow.nodes[0].position = { x: 30, y: 60 }
  const message = newNode('envio_pergunta', { x: 350, y: 60 }, '2')
  message.data.data.template = 'Mensagem inicial'
  flow.nodes.push(message, newNode('finalizar', { x: 680, y: 60 }, '3'))
  flow.edges = [createEdge([], 'inicio', 'output-0', '2'), createEdge([], '2', 'output-0', '3')]
  return flow
}

async function open(page) {
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
}

async function upload(page, flow) {
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'atendimento.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
}

async function exportedText(page) {
  const before = Date.now()
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click()
  const download = await waiting
  const text = fs.readFileSync(await download.path(), 'utf8')
  const json = JSON.parse(text)
  const stamp = Date.parse(json.created_at)
  expect(stamp).toBeGreaterThanOrEqual(before - 1000)
  expect(stamp).toBeLessThanOrEqual(Date.now() + 1000)
  expect(download.suggestedFilename()).toBe(`${json.name}-${json.created_at.slice(0, 10)}.json`)
  return text
}

async function exported(page) {
  return JSON.parse(await exportedText(page))
}

async function edgesFrom(page, source) {
  return page.evaluate(id => JSON.parse(localStorage.getItem('workflow')).edges.filter(edge => edge.source === id).map(edge => [edge.sourceHandle, edge.target, edge.id]).sort(), source)
}

const withoutStamp = flow => ({ ...flow, created_at: 'ignorado' })
const describedBy = async (page, field, message) => {
  const note = page.getByText(message, { exact: true })
  await expect(note).toBeVisible()
  const id = (await note.getAttribute('id')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(field).toHaveAttribute('aria-describedby', new RegExp(`(^| )${id}$`))
  return note
}
const contrastWithWhite = locator => locator.evaluate(element => {
  const [red, green, blue] = getComputedStyle(element).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number)
  const linear = [red, green, blue].map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05)
})
const withoutRuleIds = node => {
  const rules = node.data.data.timeRules
  if (!Array.isArray(rules)) return node
  for (const rule of rules) expect(rule.id).toMatch(/^rule-\d+$/)
  return { ...node, data: { ...node.data, data: { ...node.data.data, timeRules: rules.map(rule => ({ ...rule, id: 'regra' })) } } }
}

test('import and download preserve every field and render all edges without executing HTML', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await open(page)
  const flow = sample()
  await upload(page, flow)
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  expect(await page.evaluate(() => window.__unsafeHtmlExecuted)).toBeUndefined()
  expect(withoutStamp(await exported(page))).toEqual(withoutStamp(flow))
  expect(errors).toEqual([])
})

test('components created in the editor are exported exactly in the reference format', async ({ page }) => {
  await open(page)
  const library = page.getByLabel('Biblioteca de componentes')
  await library.getByRole('button', { name: 'Enviar Mensagem', exact: true }).click()
  await page.getByLabel('Mensagem', { exact: true }).fill('Olá, #NAME!')
  await library.getByRole('button', { name: 'Encerrar Conversa', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await page.locator('.react-flow__node[data-id="inicio"] .react-flow__handle.source').dragTo(page.locator('.react-flow__node[data-id="2"] .react-flow__handle.target'))
  await page.locator('.react-flow__node[data-id="2"] .react-flow__handle.source').dragTo(page.locator('.react-flow__node[data-id="3"] .react-flow__handle.target'))
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  const json = await exported(page)
  expect(Object.keys(json)).toEqual(['name', 'description', 'service_type', 'created_at', 'nodes', 'edges', 'viewport'])
  expect(json.service_type).toBe('chat')
  expect(json.nodes.map(node => node.id)).toEqual(['inicio', '2', '3'])
  for (const node of json.nodes) {
    expect(Object.keys(node)).toEqual(node.id === 'inicio' ? START_KEYS : NODE_KEYS)
    expect(node.type).toBe('custom')
    expect(node.selected).toBe(false)
    expect(node.dragging).toBe(false)
    expect(node.deletable).toBe(node.id === 'inicio' ? false : undefined)
  }
  expect(json.nodes[1].data).toMatchObject({ type: 'envio_pergunta', data: { envio_pergunta: '', template: 'Olá, #NAME!' } })
  expect(json.nodes[2].data.type).toBe('finalizar')
  expect(json.edges).toEqual([
    { type: 'deletable', source: 'inicio', sourceHandle: 'output-0', target: '2', id: 'xy-edge__iniciooutput-0-2' },
    { type: 'deletable', source: '2', sourceHandle: 'output-0', target: '3', id: 'xy-edge__2output-0-3' },
  ])
  for (const edge of json.edges) expect(Object.keys(edge)).toEqual(EDGE_KEYS)
})

test('two-way components show the output meaning proven by the reference', async ({ page }) => {
  await open(page)
  const library = page.getByLabel('Biblioteca de componentes')
  await library.getByRole('button', { name: 'Condições de Tempo', exact: true }).click()
  const time = page.locator('.react-flow__node[data-id="2"]')
  await expect(time.getByText('Fora do horário', { exact: true })).toBeVisible()
  await expect(time.getByText('Dentro do horário', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'APIs', exact: true }).click()
  await library.getByRole('button', { name: 'Consulta API', exact: true }).click()
  const api = page.locator('.react-flow__node[data-id="3"]')
  await expect(api.getByText('Falha', { exact: true })).toBeVisible()
  await expect(api.getByText('Sucesso', { exact: true })).toBeVisible()
})

test('editing a menu updates native fields and removing options preserves the correct destination', async ({ page }) => {
  await open(page)
  await upload(page, sample())
  await page.locator('.react-flow__node[data-id="2"]').click()
  await page.getByLabel('Título da opção 1').fill('Atendimento 😊')
  await page.getByRole('button', { name: 'Remover opção 1', exact: true }).click()
  await expect(page.getByLabel('Título da opção 1')).toHaveValue('Equipe A')
  await expect(page.getByLabel('Número da opção 1')).toHaveValue('1')
  await expect.poll(async () => page.evaluate(() => {
    const flow = JSON.parse(localStorage.getItem('workflow'))
    return flow.edges.find(edge => edge.source === '2' && edge.sourceHandle === 'output-0')
  })).toMatchObject({ target: '4', id: 'xy-edge__2output-0-4' })
  await page.getByRole('button', { name: 'Fluxo validado', exact: true }).click()
  await expect(page.getByLabel('Validação do fluxo')).toContainText('Componente sem conexões; ele não será executado.')
})

test('the library lists the 61 palette components in catalog order, all enabled', async ({ page }) => {
  expect(PALETTE).toHaveLength(61)
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const library = page.getByLabel('Biblioteca de componentes')
  const buttons = library.locator('section button')
  await expect(buttons).toHaveCount(PALETTE.length)
  const tiles = await buttons.evaluateAll(elements => elements.map(element => ({
    name: element.getAttribute('aria-label'),
    draggable: element.getAttribute('draggable'),
    describedBy: element.getAttribute('aria-describedby'),
    disabled: element.disabled,
  })))
  expect(tiles).toEqual(PALETTE.map(entry => ({ name: entry.label, draggable: 'true', describedBy: null, disabled: false })))
  const headings = await library.locator('section h3').allTextContents()
  expect(headings).toEqual(categories.filter(category => PALETTE.some(entry => entry.category === category.id)).map(category => category.label))
})

test('every palette component created in the editor exports the platform node shape, key order and defaults', async ({ page }) => {
  test.setTimeout(240000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await open(page)
  const base = connectedStart('Paleta completa')
  await upload(page, base)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const library = page.getByLabel('Biblioteca de componentes')
  const buttons = library.locator('section button')
  const panel = page.getByLabel('Configuração do componente')
  for (const [index, entry] of PALETTE.entries()) {
    await buttons.nth(index).click()
    await expect(panel).toContainText(`ID ${index + 4} · ${entry.nativeType}`)
    if (entry.nativeType === 'envio_pergunta') await page.getByLabel('Mensagem', { exact: true }).fill(FILLED.envio_pergunta.template)
    if (entry.nativeType === 'envio_mensagem') {
      await page.getByLabel('Mensagem do menu', { exact: true }).fill(FILLED.envio_mensagem.title)
      await page.getByLabel('Título da opção 1').fill(FILLED.envio_mensagem['text-1'])
    }
  }
  await expect(library.getByRole('status')).not.toContainText('Envie um JSON')
  await expect(page.locator('.react-flow__node')).toHaveCount(base.nodes.length + PALETTE.length)
  await expect(page.locator('.react-flow__edge')).toHaveCount(base.edges.length)
  await expect(page.getByRole('button', { name: 'Fluxo validado', exact: true })).toBeVisible()

  const text = await exportedText(page)
  const json = JSON.parse(text)
  expect(text).toBe(JSON.stringify(json, null, 2))
  expect(json.nodes.slice(0, base.nodes.length)).toEqual(base.nodes)
  expect(json.edges).toEqual(base.edges)
  const cards = new Map(await page.locator('.react-flow__node').evaluateAll(elements => elements.map(element => [element.getAttribute('data-id'), {
    text: element.textContent,
    targets: element.querySelectorAll('.react-flow__handle.target').length,
    outputs: Array.from(element.querySelectorAll('.react-flow__handle.source'), handle => [handle.getAttribute('data-handleid'), handle.parentElement.textContent.trim()]),
  }])))
  for (const [index, entry] of PALETTE.entries()) {
    const id = String(index + 4)
    const node = json.nodes[base.nodes.length + index]
    const expected = newNode(entry.nativeType, node.position, id)
    Object.assign(expected.data.data, FILLED[entry.nativeType] || {})
    expect(Object.keys(node), entry.label).toEqual(NODE_KEYS)
    expect(Object.keys(node.data), entry.label).toEqual(DATA_KEYS)
    expect(Object.keys(node.data.data), entry.label).toEqual(Object.keys(expected.data.data))
    expect(withoutRuleIds(node), entry.label).toEqual(withoutRuleIds(expected))
    const card = cards.get(id)
    expect(card.text, entry.label).toContain(entry.label)
    expect(card.targets, entry.label).toBe(entry.nativeType === 'note' ? 0 : 1)
    expect(card.outputs, entry.label).toEqual(outputHandles(node).map(handle => [handle, outputLabel(node, handle)]))
  }

  await upload(page, { ...json, name: 'Paleta reimportada' })
  const again = await exported(page)
  expect(withoutStamp({ ...again, name: json.name })).toEqual(withoutStamp(json))
  expect(errors).toEqual([])
})

test('notes never take part in connections', async ({ page }) => {
  await open(page)
  const flow = newFlow()
  flow.name = 'Fluxo com nota'
  flow.nodes[0].position = { x: 40, y: 80 }
  const memo = newNode('note', { x: 420, y: 40 }, '2')
  flow.nodes.push(memo, newNode('finalizar', { x: 420, y: 320 }, '3'))
  await upload(page, flow)
  const note = page.locator('.react-flow__node[data-id="2"]')
  await expect(note).toContainText('Clique para escrever')
  await expect(note.locator('.react-flow__handle')).toHaveCount(0)
  const source = page.locator('.react-flow__node[data-id="inicio"] .react-flow__handle.source')
  await source.dragTo(note)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await source.dragTo(page.locator('.react-flow__node[data-id="3"] .react-flow__handle.target'))
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Fluxo validado', exact: true }).click()
  await expect(page.getByLabel('Validação do fluxo')).toContainText('Estrutura, campos e conexões prontos para exportar')
  const json = await exported(page)
  expect(json.edges).toEqual([createEdge([], 'inicio', 'output-0', '3')])
  expect(json.nodes[1]).toEqual(memo)
})

test('removing a weighted path or adding an agent exit moves the connections with the outputs', async ({ page }) => {
  await open(page)
  const flow = newFlow()
  flow.name = 'Saídas dinâmicas'
  flow.nodes[0].position = { x: 20, y: 20 }
  const random = newNode('randomizer', { x: 20, y: 170 }, '2')
  random.data.data.paths = [{ label: 'Caminho A', weight: 40 }, { label: 'Caminho B', weight: 30 }, { label: 'Caminho C', weight: 30 }]
  const agent = newNode('aiAgentBlock', { x: 20, y: 520 }, '5')
  Object.assign(agent.data.data, { generative_ai: 'agente-1', generativeAiName: 'Agente de teste', exits: [{ name: 'Resolvido', when: 'Quando o pedido for resolvido', requireFields: false }] })
  flow.nodes.push(random, newNode('finalizar', { x: 380, y: 20 }, '3'), newNode('finalizar', { x: 380, y: 200 }, '4'), agent, newNode('finalizar', { x: 380, y: 420 }, '6'), newNode('finalizar', { x: 380, y: 620 }, '7'))
  for (const [source, handle, target] of [['inicio', 'output-0', '2'], ['2', 'output-0', '3'], ['2', 'output-1', '4'], ['2', 'output-2', '5'], ['5', 'output-0', '6'], ['5', 'output-1', '7']]) flow.edges.push(createEdge(flow.edges, source, handle, target))
  await upload(page, flow)
  await expect(page.getByRole('button', { name: 'Fluxo validado', exact: true })).toBeVisible()

  await page.locator('.react-flow__node[data-id="2"]').click()
  await page.getByRole('button', { name: 'Remover caminho 2', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="2"] .react-flow__handle.source')).toHaveCount(2)
  await expect.poll(() => edgesFrom(page, '2')).toEqual([['output-0', '3', 'xy-edge__2output-0-3'], ['output-1', '5', 'xy-edge__2output-1-5']])

  await page.locator('.react-flow__node[data-id="5"]').click()
  await page.getByRole('button', { name: 'Adicionar saída', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="5"] .react-flow__handle.source')).toHaveCount(3)
  await expect.poll(() => edgesFrom(page, '5')).toEqual([['output-0', '6', 'xy-edge__5output-0-6'], ['output-2', '7', 'xy-edge__5output-2-7']])
  const exitName = page.getByLabel('Nome da saída 2', { exact: true })
  await expect(exitName).toHaveAttribute('aria-invalid', 'true')
  await expect(await describedBy(page, exitName, 'Informe o nome da saída.')).toHaveClass(/text-flow-danger/)
  const exitWhen = page.getByLabel('Quando usar, saída 2', { exact: true })
  await expect(exitWhen).not.toHaveAttribute('aria-invalid')
  await expect(await describedBy(page, exitWhen, 'Descreva quando usar.')).toHaveClass(/text-flow-warning/)
  await expect(page.getByLabel('Nome da saída 1', { exact: true })).not.toHaveAttribute('aria-invalid')
  await page.getByRole('button', { name: '2 pendências', exact: true }).click()
  const issues = page.getByLabel('Validação do fluxo')
  await expect(issues).toContainText('Conecte a saída “Saída 2”.')
  await expect(issues).toContainText('Saída 2 do agente: informe o nome.')

  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect.poll(() => edgesFrom(page, '5')).toEqual([['output-0', '6', 'xy-edge__5output-0-6'], ['output-1', '7', 'xy-edge__5output-1-7']])
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect.poll(() => edgesFrom(page, '2')).toEqual([['output-0', '3', 'xy-edge__2output-0-3'], ['output-1', '4', 'xy-edge__2output-1-4'], ['output-2', '5', 'xy-edge__2output-2-5']])
})

test('all 61 palette entries are searchable and every one creates a component', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const library = page.getByLabel('Biblioteca de componentes')
  await expect(library.locator('section button')).toHaveCount(61)
  await page.getByLabel('Pesquisar componentes').fill('enviar imagem')
  await library.getByRole('button', { name: /Enviar Imagem/ }).click()
  await expect(library.getByRole('status')).not.toContainText('Envie um JSON')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByLabel('Pesquisar componentes').fill('enviar mensagem')
  await library.getByRole('button', { name: 'Enviar Mensagem', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await page.getByLabel('Mensagem', { exact: true }).fill('Mensagem criada no editor')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText('Fluxo salvo', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Mensagem criada no editor' })).toHaveCount(1)
})

test('malformed imports and unapplied JSON edits do not overwrite the flow', async ({ page }) => {
  await open(page)
  const flow = sample()
  await upload(page, flow)
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Não foi possível importar')).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Arquivo JSON inválido')
  await dialog.getByRole('button', { name: 'Entendi', exact: true }).click()
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)
  await page.locator('.react-flow__node[data-id="2"]').click()
  await page.getByText('Todos os dados do componente (JSON)', { exact: true }).click()
  await page.getByLabel('Dados do componente', { exact: true }).fill('{')
  await page.getByRole('button', { name: 'Aplicar JSON', exact: true }).click()
  await expect(page.getByText('JSON inválido. Confira aspas, vírgulas e chaves.')).toBeVisible()
  await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click()
  await expect(page.getByText('Aplique ou descarte as edições de JSON no painel antes de continuar.').first()).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  await page.getByRole('button', { name: 'Descartar edição', exact: true }).click()
  expect(withoutStamp(await exported(page))).toEqual(withoutStamp(flow))
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map(file => file.trim()).filter(Boolean)
for (const [index, file] of (referenceFiles.length ? referenceFiles : ['']).entries()) {
  test(`reference file ${index + 1}: every node and edge survives the browser round trip byte for byte`, async ({ page }) => {
    test.skip(!file, `Defina FLOW_REFERENCE com um ou mais arquivos JSON, separados por "${path.delimiter}".`)
    test.skip(!fs.existsSync(file), `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.`)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await open(page)
    const content = fs.readFileSync(file, 'utf8')
    const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    const reference = JSON.parse(raw)
    await page.getByLabel('Importar arquivo JSON').setInputFiles(file)
    await expect(page.getByLabel('Nome do fluxo')).toHaveValue(reference.name)
    await expect(page.locator('.react-flow__node')).toHaveCount(reference.nodes.length)
    await expect(page.locator('.react-flow__edge')).toHaveCount(reference.edges.length)
    await expect(page.getByRole('button', { name: 'Fluxo validado' })).toBeVisible()
    const text = await exportedText(page)
    expect(withoutStamp(JSON.parse(text))).toEqual(withoutStamp(reference))
    expect(text.replace(CREATED_AT, '')).toBe(raw.replace(CREATED_AT, ''))
    expect(errors).toEqual([])
  })
}

test('connections can be created, replaced, deleted and restored with undo', async ({ page }) => {
  await open(page)
  const flow = newFlow()
  flow.nodes[0].position = { x: 40, y: 80 }
  flow.nodes.push(newNode('finalizar', { x: 450, y: 80 }, '2'), newNode('finalizar', { x: 450, y: 320 }, '3'))
  await upload(page, flow)
  const source = page.locator('.react-flow__node[data-id="inicio"] .react-flow__handle.source')
  await source.dragTo(page.locator('.react-flow__node[data-id="2"] .react-flow__handle.target'))
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await source.dragTo(page.locator('.react-flow__node[data-id="3"] .react-flow__handle.target'))
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).edges.map(edge => edge.id))).toEqual(['xy-edge__iniciooutput-0-3'])
  await page.locator('.react-flow__edge').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await page.getByRole('button', { name: 'Refazer', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Remover conexão', exact: true })).toHaveCount(0)
  await page.locator('.react-flow__edge').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Remover conexão', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).edges)).toEqual([])
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).edges.map(edge => edge.id))).toEqual(['xy-edge__iniciooutput-0-3'])
})

test('the remove button on a component deletes it with its connections, respects pending JSON edits and undo restores it', async ({ page }) => {
  await open(page)
  await upload(page, sample())
  const nodes = page.locator('.react-flow__node')
  const menu = page.locator('.react-flow__node[data-id="2"]')
  await expect(page.getByRole('button', { name: 'Menu de Opções, ID 2', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Iniciar Fluxo, ID inicio', exact: true })).toHaveCount(1)
  await expect(nodes.locator('button, a, input, select, textarea, [tabindex]')).toHaveCount(0)
  const remove = page.getByRole('button', { name: 'Remover Menu de Opções, ID 2', exact: true })
  const id = menu.getByText('ID 2', { exact: true })
  await expect(remove).toHaveCount(0)
  await expect(id).toHaveCSS('opacity', '0')
  await menu.hover()
  await expect(remove).toBeVisible()
  await expect(remove).toHaveAttribute('title', 'Remover componente')
  await expect(id).toHaveCSS('opacity', '1')
  await expect(page.getByRole('button', { name: /^Remover Iniciar Fluxo/ })).toHaveCount(0)
  await page.locator('.react-flow__node[data-id="inicio"]').hover()
  await expect(remove).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remover Iniciar Fluxo/ })).toHaveCount(0)

  await page.locator('.react-flow__node[data-id="3"]').click()
  await page.getByText('Todos os dados do componente (JSON)', { exact: true }).click()
  await page.getByLabel('Dados do componente', { exact: true }).fill('{')
  await menu.hover()
  await remove.click()
  await expect(page.getByText('Aplique ou descarte as edições de JSON no painel antes de continuar.').first()).toBeVisible()
  await expect(nodes).toHaveCount(4)
  await page.getByRole('button', { name: 'Descartar edição', exact: true }).click()

  await menu.hover()
  await remove.click()
  await expect(nodes).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).nodes.map(node => node.id))).toEqual(['inicio', '3', '4'])
  await page.keyboard.press('Control+Z')
  await expect(nodes).toHaveCount(4)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
})

test('header search focuses the component in the visible canvas beside the configuration panel', async ({ page }) => {
  await open(page)
  await upload(page, sample())
  const search = page.getByLabel('Buscar componente no fluxo')
  await search.fill('3')
  await search.press('Enter')
  await expect(page.getByLabel('Configuração do componente')).toContainText('ID 3 · finalizar')
  await expect(page.locator('.react-flow__node[data-id="3"]')).toHaveClass(/selected/)
  await expect.poll(async () => {
    const canvas = await page.locator('.react-flow').boundingBox()
    const node = await page.locator('.react-flow__node[data-id="3"]').boundingBox()
    return Math.round(Math.abs(node.x + node.width / 2 - (canvas.x + canvas.width / 2)))
  }).toBeLessThan(8)
})

test('keyboard shortcuts keep working and Delete still removes components after Ctrl+K focuses the search', async ({ page }) => {
  await open(page)
  await upload(page, sample())
  await page.keyboard.press('Control+k')
  await expect(page.getByLabel('Buscar componente no fluxo')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[id^="react-flow__node-desc-"]')).toHaveText(/^Pressione Enter ou Espaço para selecionar o componente\./)
  await expect(page.locator('[id^="react-flow__edge-desc-"]')).toHaveText(/^Pressione Enter ou Espaço para selecionar a conexão\./)
  await page.locator('.react-flow__node[data-id="3"]').click()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[id^="react-flow__aria-live-"]')).toHaveText(/^Componente movido para a direita\. Nova posição: x -?\d+, y -?\d+\.$/)
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await expect(page.locator('.react-flow__edge')).toHaveCount(3)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Fluxo salvo', { exact: true })).toBeVisible()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).nodes.map(node => node.id))).toEqual(['inicio', '2', '4'])
})

test('a custom accent color is applied to the editor and survives a reload', async ({ page }) => {
  await open(page)
  const variable = name => () => page.evaluate(key => getComputedStyle(document.documentElement).getPropertyValue(key).trim(), name)
  const accent = variable('--flow-accent')
  const strong = variable('--flow-accent-strong')
  await expect.poll(strong).toBe('51 114 216')
  await page.getByRole('button', { name: 'Cores', exact: true }).click()
  await page.getByLabel('Código hexadecimal da cor').fill('#0f766e')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect.poll(accent).toBe('15 118 110')
  await expect.poll(strong).toBe('15 118 110')
  await page.reload()
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await expect.poll(accent).toBe('15 118 110')
  await page.getByRole('button', { name: 'Cores', exact: true }).click()
  await page.getByLabel('Código hexadecimal da cor').fill('#facc15')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect.poll(accent).toBe('250 204 21')
  await expect.poll(() => contrastWithWhite(page.getByRole('button', { name: 'Prévia', exact: true }))).toBeGreaterThanOrEqual(4.5)
})

test('components added by click always land inside the visible canvas', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const buttons = page.getByLabel('Biblioteca de componentes').locator('section button')
  const panel = page.getByLabel('Configuração do componente')
  const area = page.locator('.react-flow')
  for (let index = 0; index < 12; index++) {
    await buttons.nth(index).click()
    const id = String(index + 2)
    await expect(panel).toContainText(`ID ${id} ·`)
    await expect.poll(async () => {
      const canvas = await area.boundingBox()
      const node = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
      return node.x >= canvas.x && node.y >= canvas.y && node.x + node.width <= canvas.x + canvas.width && node.y + node.height <= canvas.y + canvas.height
    }, { message: `componente ${id}` }).toBe(true)
  }
})

test('the panel shows blocking problems in red and warnings in yellow with the validator wording', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const library = page.getByLabel('Biblioteca de componentes')

  await library.getByRole('button', { name: 'Transferir para Ligação', exact: true }).click()
  const minutes = page.getByLabel('Validade do botão (minutos)', { exact: true })
  await minutes.fill('1,5')
  await expect(minutes).toHaveValue('1,5')
  await expect(minutes).not.toHaveAttribute('aria-invalid')
  await expect(await describedBy(page, minutes, 'A validade do botão deve ser um número inteiro de minutos.')).toHaveClass(/text-flow-warning/)
  await minutes.fill('15')
  await expect(minutes).toHaveValue('15')
  await expect(page.getByText('A validade do botão deve ser um número inteiro de minutos.', { exact: true })).toHaveCount(0)

  await library.getByRole('button', { name: 'Enviar Conversão', exact: true }).click()
  const amount = page.getByLabel('Valor da conversão', { exact: true })
  await amount.fill('-10')
  await expect(amount).toHaveValue('10')
  await expect(page.getByText('Informe o valor da conversão como número, por exemplo 99.90.', { exact: true })).toHaveCount(0)

  await library.getByRole('button', { name: 'Múltipla Condição', exact: true }).click()
  const variable = page.getByLabel('Variável da condição 1', { exact: true })
  await expect(variable).not.toHaveAttribute('aria-invalid')
  await expect(await describedBy(page, variable, 'Informe a variável.')).toHaveClass(/text-flow-warning/)

  const invalidUrl = 'Informe uma URL válida, iniciada por http:// ou https://.'
  await library.getByRole('button', { name: 'Consulta API', exact: true }).click()
  const address = page.getByLabel('URL da API', { exact: true })
  await expect(address).not.toHaveAttribute('aria-invalid')
  await expect(await describedBy(page, address, 'Informe a URL da API.')).toHaveClass(/text-flow-warning/)
  await address.fill('exemplo.com/api')
  await expect(address).toHaveAttribute('aria-invalid', 'true')
  await expect(address).toHaveClass(/border-flow-danger/)
  await expect(await describedBy(page, address, invalidUrl)).toHaveClass(/text-flow-danger/)
  await expect(page.getByText('Informe a URL da API.', { exact: true })).toHaveCount(0)
  await address.fill('https://exemplo.com/api')
  await expect(address).not.toHaveAttribute('aria-invalid')
  await expect(page.getByText(invalidUrl, { exact: true })).toHaveCount(0)

  await library.getByRole('button', { name: 'Enviar Mensagem', exact: true }).click()
  const template = page.getByLabel('Mensagem', { exact: true })
  await expect(template).toHaveAttribute('aria-invalid', 'true')
  await expect(await describedBy(page, template, 'Preencha a mensagem.')).toHaveClass(/text-flow-danger/)
  await template.fill('Mensagem criada no editor')
  await expect(template).not.toHaveAttribute('aria-invalid')
  await expect(page.getByText('Preencha a mensagem.', { exact: true })).toHaveCount(0)

  await library.getByRole('button', { name: 'DataStore Local', exact: true }).click()
  const store = page.getByLabel('Base de dados', { exact: true })
  await expect(store).not.toHaveAttribute('aria-invalid')
  await expect(store).toHaveClass(/border-flow-warning/)
  await expect(await describedBy(page, store, 'Escolha a base de dados.')).toHaveClass(/text-flow-warning/)

  await library.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).click()
  const confirmation = page.getByLabel('Mensagem de confirmação', { exact: true })
  await expect(confirmation).not.toHaveAttribute('aria-invalid')
  await expect(await describedBy(page, confirmation, 'Preencha a mensagem de confirmação.')).toHaveClass(/text-flow-warning/)

  const choice = 'Selecione ao menos um dado para pedir ao cliente.'
  await library.getByRole('button', { name: 'Dados do Cliente', exact: true }).click()
  await page.getByLabel('Pedir nome', { exact: true }).uncheck()
  for (const label of ['Pedir nome', 'Pedir e-mail', 'Pedir observações']) {
    const option = page.getByLabel(label, { exact: true })
    await expect(option).not.toHaveAttribute('aria-invalid')
    await expect(await describedBy(page, option, choice)).toHaveClass(/text-flow-warning/)
  }
  await page.getByLabel('Pedir e-mail', { exact: true }).check()
  await expect(page.getByText(choice, { exact: true })).toHaveCount(0)

  await library.getByRole('button', { name: 'Escolher Serviço', exact: true }).click()
  await page.getByRole('button', { name: 'Adicionar ID', exact: true }).click()
  const service = page.getByLabel('ID 1 de serviços oferecidos', { exact: true })
  await service.fill('servico-1')
  await service.fill('')
  await expect(service).toHaveClass(/border-flow-warning/)
  await expect(await describedBy(page, service, 'Cada item de Serviços oferecidos deve ser um ID em texto.')).toHaveClass(/text-flow-warning/)

  await library.getByRole('button', { name: 'Condições de Tempo', exact: true }).click()
  const monday = page.getByRole('button', { name: 'Segunda-feira', exact: true })
  await expect(monday).toHaveAttribute('aria-pressed', 'true')
  expect(await contrastWithWhite(monday)).toBeGreaterThanOrEqual(4.5)
  await page.getByText('Todos os dados do componente (JSON)', { exact: true }).click()
  await page.getByLabel('Dados do componente', { exact: true }).fill('{}')
  expect(await contrastWithWhite(page.getByRole('button', { name: 'Aplicar JSON', exact: true }))).toBeGreaterThanOrEqual(4.5)
  await page.getByRole('button', { name: 'Descartar edição', exact: true }).click()
})

test('local preview follows the chosen branch even after panning triggers an autosave', async ({ page }) => {
  await open(page)
  const flow = sample()
  for (const [id, text] of [['3', 'Caminho A'], ['4', 'Caminho B']]) {
    const node = flow.nodes.find(entry => entry.id === id)
    node.data = newNode('envio_pergunta', node.position, id).data
    node.data.data.template = text
    const end = newNode('finalizar', { x: 1000, y: node.position.y }, String(Number(id) + 2))
    flow.nodes.push(end)
    flow.edges.push(createEdge(flow.edges, id, 'output-0', end.id))
  }
  await upload(page, flow)
  await page.getByRole('button', { name: 'Prévia', exact: true }).click()
  const chat = page.getByRole('log', { name: 'Prévia do atendimento' })
  const input = page.getByPlaceholder('Digite sua mensagem...')
  await input.fill('Olá')
  await input.press('Enter')
  await expect(chat.getByText('1. Opção 1', { exact: false })).toBeVisible()
  const pane = page.locator('.react-flow__pane')
  const box = await pane.boundingBox()
  await page.mouse.move(box.x + 40, box.y + box.height - 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + box.height - 80, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('executedFlow'))).toBe('true')
  await input.fill('2')
  await input.press('Enter')
  await expect(chat.getByText('Caminho B', { exact: true })).toBeVisible()
  await expect(chat.getByText('Conversa finalizada.', { exact: true })).toBeVisible()
})

test('design system selects open, list the options and keep the choice in the panel and in the AI dialog', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  await page.getByLabel('Biblioteca de componentes').getByRole('button', { name: 'Solicitar Dados', exact: true }).click()
  const panel = page.getByLabel('Configuração do componente')
  const channel = panel.getByRole('combobox', { name: 'Tipo de dado' })
  await channel.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(4)
  await page.getByRole('option', { name: 'CPF', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(channel).toHaveText(/^CPF$/)
  await channel.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)

  await page.getByRole('button', { name: 'Gerar com IA' }).first().click()
  const dialog = page.getByRole('dialog')
  const size = dialog.getByRole('combobox', { name: 'Tamanho do fluxo' })
  await size.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: /^Grande/ }).click()
  await expect(size).toHaveText(/^Grande/)
  await expect(dialog).toBeVisible()
})
