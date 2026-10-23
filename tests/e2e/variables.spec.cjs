require('../../scripts/register-typescript.cjs')
const { test, expect } = require('@playwright/test')
const { createEdge, newFlow, newNode } = require('../../lib/atendimento/format.ts')

const PLATFORM = ['#NAME', '@@@GREETING', '#DATE_BRAZIL', '#TIME_PM', '#DATE_TIME_BRAZIL', '#PROTOCOL']

function answerFlow() {
  const flow = newFlow(new Date('2026-01-15T12:00:00.000Z'))
  flow.name = 'Variáveis no painel'
  flow.nodes[0].position = { x: 30, y: 60 }
  const ask = newNode('envio_pergunta', { x: 350, y: 60 }, '2')
  ask.data.data.template = 'Qual é o seu CPF?'
  const wait = newNode('waitForAnswer', { x: 680, y: 60 }, '3')
  wait.data.data.customFields = 'cpf'
  const thanks = newNode('envio_pergunta', { x: 1010, y: 60 }, '4')
  thanks.data.data.template = 'Obrigado, .'
  const end = newNode('finalizar', { x: 1340, y: 60 }, '5')
  flow.nodes.push(ask, wait, thanks, end)
  const edges = []
  for (const [source, target] of [['inicio', '2'], ['2', '3'], ['3', '4'], ['4', '5']]) edges.push(createEdge(edges, source, 'output-0', target))
  flow.edges = edges
  return flow
}

async function openPanel(page, id) {
  await page.locator(`.react-flow__node[data-id="${id}"]`).click()
  const panel = page.getByLabel('Configuração do componente')
  await expect(panel).toBeVisible()
  return panel
}

test('the panel lists the platform variables and the ones created before the component, and a click inserts at the cursor', async ({ page }) => {
  const flow = answerFlow()
  await page.goto('/flow')
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
  await page.getByLabel('Importar arquivo JSON').setInputFiles({ name: 'variaveis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(flow)) })
  await expect(page.getByLabel('Nome do fluxo')).toHaveValue(flow.name)

  const first = await openPanel(page, '2')
  await expect(first.getByRole('list', { name: 'Sempre disponíveis' }).getByRole('button')).toHaveCount(PLATFORM.length)
  await expect(first.getByRole('list', { name: 'Criadas antes deste componente' })).toHaveCount(0)
  await expect(first.getByText('Nenhum componente antes deste cria variável.', { exact: true })).toBeVisible()

  const panel = await openPanel(page, '4')
  const always = panel.getByRole('list', { name: 'Sempre disponíveis' })
  await expect(always.getByRole('button')).toHaveCount(PLATFORM.length)
  for (const token of PLATFORM) await expect(always).toContainText(token)
  await expect(always).toContainText('Nome do contato')
  const created = panel.getByRole('list', { name: 'Criadas antes deste componente' })
  await expect(created.getByRole('button')).toHaveCount(1)
  await expect(created).toContainText('@@@cpf')
  await expect(created).toContainText('Aguardando Mensagem (ID 3)')

  const field = panel.locator('textarea').first()
  await field.click()
  await field.evaluate((element) => element.setSelectionRange(10, 10))
  await always.getByRole('button', { name: /^#NAME\b/ }).click()
  await expect(field).toHaveValue('Obrigado, #NAME.')
  await expect(field).toBeFocused()
  expect(await field.evaluate((element) => element.selectionStart)).toBe(15)

  await field.evaluate((element) => element.setSelectionRange(element.value.length, element.value.length))
  await created.getByRole('button', { name: /@@@cpf/ }).click()
  await expect(field).toHaveValue('Obrigado, #NAME.@@@cpf')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('workflow')).nodes.find((node) => node.id === '4').data.data.template)).toBe('Obrigado, #NAME.@@@cpf')
})
