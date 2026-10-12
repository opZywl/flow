const { test, expect } = require('@playwright/test')

const THEME_CLASS = /home-theme-(dark|light)/

function trackErrors(page) {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function open(page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

function nav(page) {
  return page.getByRole('navigation', { name: 'Principal' })
}

async function currentTheme(page) {
  await expect(page.locator('html')).toHaveClass(THEME_CLASS)
  const className = await page.locator('html').getAttribute('class')
  return className.match(THEME_CLASS)[1]
}

test('the home renders a single visible h1 without console errors', async ({ page }) => {
  const errors = trackErrors(page)
  await open(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page).toHaveTitle('WorkFlow')
  await page.mouse.wheel(0, 4000)
  await expect(page.locator('footer')).toBeVisible()
  expect(errors).toEqual([])
})

test('the Recursos and Como funciona anchors scroll to their sections', async ({ page }) => {
  await open(page)
  for (const [label, id] of [['Recursos', 'recursos'], ['Como funciona', 'como-funciona']]) {
    await nav(page).getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${id}$`))
    await expect(page.locator(`#${id}`)).toBeInViewport()
  }
})

test('the theme toggle switches the theme and the choice survives a reload', async ({ page }) => {
  await open(page)
  const initial = await currentTheme(page)
  const next = initial === 'dark' ? 'light' : 'dark'
  await nav(page).getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('html')).toHaveClass(new RegExp(`home-theme-${next}`))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(new RegExp(`home-theme-${next}`))
  await nav(page).getByRole('button', { name: 'Alternar tema' }).click()
  await expect(page.locator('html')).toHaveClass(new RegExp(`home-theme-${initial}`))
})

test('Abrir editor leads to the editor', async ({ page }) => {
  await open(page)
  await nav(page).getByRole('link', { name: 'Abrir editor' }).click()
  await expect(page).toHaveURL(/\/flow$/)
  await expect(page.getByLabel('Nome do fluxo')).toBeVisible()
})

test('every external link opens in a new tab with rel noreferrer', async ({ page }) => {
  await open(page)
  const links = page.locator('a[href^="http"]')
  const count = await links.count()
  expect(count).toBeGreaterThanOrEqual(7)
  for (let index = 0; index < count; index++) {
    const link = links.nth(index)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /\bnoreferrer\b/)
  }
  for (const href of ['https://github.com/opZywl/flow', 'https://github.com/opZywl', 'https://lucas-lima.xyz', 'https://discord.com/invite/3XRFGeqEYD', 'https://www.gnu.org/licenses/gpl-3.0.html']) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached()
  }
})

test('there is no horizontal scroll at 390px', async ({ page }) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  for (const theme of ['first', 'second']) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, theme).toBeLessThanOrEqual(0)
    await page.mouse.wheel(0, 6000)
    const scrolledX = await page.evaluate(() => window.scrollX)
    expect(scrolledX, theme).toBe(0)
    await nav(page).getByRole('button', { name: 'Alternar tema' }).click()
  }
  expect(errors).toEqual([])
})
