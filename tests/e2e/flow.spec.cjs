require('../../scripts/register-typescript.cjs')
const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const { createEdge, newFlow, newNode } = require('../../lib/atendimento/format.ts')

const NODE_KEYS = ['id', 'type', 'position', 'data', 'measured', 'selected', 'dragging', 'deletable']
const EDGE_KEYS = ['type', 'source', 'sourceHandle', 'target', 'id']

function sample() {
  const flow = newFlow(new Date('2026-10-09T18:08:50.962Z'))
  flow.name = 'Atendimento de teste'
  flow.nodes[0].position = { x: 30, y: 60 }
  const menu = newNode('envio_mensagem', { x: 350, y: 60 }, '2')
  Object.assign(menu.data.data, { title: 'Olá! Como podemos ajudar? 😊', 'opt-2': '2', 'text-2': 'Suporte', 'description-2': 'Falar com suporte' })
  menu.data.html = '<div onclick="window.__unsafeHtmlExecuted = true">Modelo preservado</div>'
  flow.nodes.push(menu, newNode('finalizar', { x: 680, y: 60 }, '3'), newNode('finalizar', { x: 680, y: 300 }, '4'))
  flow.edges = [createEdge([], '2', 'output-1', '4'), createEdge([], 'inicio', 'output-0', '2'), createEdge([], '2', 'output-0', '3')]
  flow.extra = { nullValue: null, value: false, literal: 'false' }
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

async function exported(page) {
  const before = Date.now()
  const waiting = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click()
  const download = await waiting
  const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
  const stamp = Date.parse(json.created_at)
  expect(stamp).toBeGreaterThanOrEqual(before - 1000)
  expect(stamp).toBeLessThanOrEqual(Date.now() + 1000)
  expect(download.suggestedFilename()).toBe(`${json.name}-${json.created_at.slice(0, 10)}.json`)
  return json
}

const withoutStamp = flow => ({ ...flow, created_at: 'ignorado' })

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
    expect(Object.keys(node).sort()).toEqual([...NODE_KEYS].sort())
    expect(node.type).toBe('custom')
    expect(node.selected).toBe(false)
    expect(node.dragging).toBe(false)
    expect(node.deletable).toBe(node.id !== 'inicio')
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
  await expect(page.getByLabel('Título da opção 1')).toHaveValue('Suporte')
  await expect(page.getByLabel('Número da opção 1')).toHaveValue('1')
  await expect.poll(async () => page.evaluate(() => {
    const flow = JSON.parse(localStorage.getItem('workflow'))
    return flow.edges.find(edge => edge.source === '2' && edge.sourceHandle === 'output-0')
  })).toMatchObject({ target: '4', id: 'xy-edge__2output-0-4' })
  await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click()
  await expect(page.getByLabel('Validação do fluxo')).toContainText('desconectado')
})

test('all 61 palette entries are searchable; components without JSON data cannot create invalid nodes', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  const library = page.getByLabel('Biblioteca de componentes')
  await expect(library.locator('section button')).toHaveCount(61)
  await page.getByLabel('Pesquisar componentes').fill('enviar imagem')
  await library.getByRole('button', { name: /Enviar Imagem/ }).click()
  await expect(library.getByRole('status')).toContainText('Envie um JSON')
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

test('reference file: 49 nodes and 48 edges survive the browser round trip', async ({ page }) => {
  test.skip(!process.env.FLOW_REFERENCE, 'Defina FLOW_REFERENCE com o caminho do JSON de referência.')
  await open(page)
  const reference = JSON.parse(fs.readFileSync(process.env.FLOW_REFERENCE, 'utf8').replace(/^﻿/, ''))
  await page.getByLabel('Importar arquivo JSON').setInputFiles(process.env.FLOW_REFERENCE)
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(reference.name)
  await expect(page.locator('.react-flow__node')).toHaveCount(49)
  await expect(page.locator('.react-flow__edge')).toHaveCount(48)
  await expect(page.getByRole('button', { name: 'Fluxo validado' })).toBeVisible()
  const json = await exported(page)
  expect(withoutStamp(json)).toEqual(withoutStamp(reference))
})

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
  await expect(page.locator('.react-flow__node[data-id="inicio"]').getByRole('button', { name: 'Remover componente', exact: true })).toHaveCount(0)
  const menu = page.locator('.react-flow__node[data-id="2"]')
  const remove = menu.getByRole('button', { name: 'Remover componente', exact: true })
  const id = menu.getByText('ID 2', { exact: true })
  await expect(remove).toHaveCSS('opacity', '0')
  await expect(id).toHaveCSS('opacity', '0')
  await menu.hover()
  await expect(remove).toHaveCSS('opacity', '1')
  await expect(id).toHaveCSS('opacity', '1')

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
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--flow-accent').trim())
  await page.getByRole('button', { name: 'Cores', exact: true }).click()
  await page.getByLabel('Código hexadecimal da cor').fill('#0f766e')
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect.poll(accent).toBe('15 118 110')
  await page.reload()
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await expect.poll(accent).toBe('15 118 110')
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
