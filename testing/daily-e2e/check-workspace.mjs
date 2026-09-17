const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import { readFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const baseURL = process.env.DAILY_UI_URL || 'http://127.0.0.1:4173'
const output = process.env.DAILY_UI_OUTPUT || '/tmp/servifood-daily-ui'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/*', async route => {
  const url = new URL(route.request().url())
  if (url.origin !== baseURL) return route.fulfill({ json: [] })
  if (url.pathname === '/daily-orders' && route.request().isNavigationRequest()) {
    const response = await route.fetch({ url: `${baseURL}/testing/daily-e2e/workspace-harness.html` })
    return route.fulfill({ response })
  }
  if (url.pathname === '/src/hooks/useDailyOrdersData.js') return route.fulfill({ contentType: 'application/javascript', body: await readFile(new URL('./data-fixture.js', import.meta.url), 'utf8') })
  const exports = {
    '/src/utils/daily/exportDailyOrdersExcel.js': 'exportDailyOrdersExcel',
    '/src/utils/daily/exportDailyOrderNotesExcel.js': 'exportDailyOrderNotesExcel',
    '/src/utils/daily/exportDailyOrdersPdf.js': 'exportDailyOrdersPdf',
    '/src/utils/daily/shareDailyOrdersWhatsApp.js': 'shareDailyOrdersWhatsApp'
  }
  if (exports[url.pathname] && !url.searchParams.has('ui-original')) return route.fulfill({ contentType: 'application/javascript', body: `export * from "${url.pathname}?ui-original"; export const ${exports[url.pathname]} = (...args) => window.__dailyActions.push({name:'${exports[url.pathname]}',args})` })
  return route.continue()
})
const go = async (query = '') => {
  await page.goto(`${baseURL}/daily-orders${query}`)
  await page.locator('.daily-workspace').waitFor()
}
const click = name => page.getByRole('button', { name, exact: true }).click()
try {
  await go()
  await page.locator('.daily-order-row').first().waitFor()
  for (const width of [1920, 1440, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}`)
    assert.equal(await page.locator('.daily-table-scroll').isVisible(), width >= 1024)
    assert.equal(await page.locator('.daily-mobile-orders').isVisible(), width < 1024)
    await page.screenshot({ path: `${output}/daily-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: `${output}/mobile-header.png` })
  await page.locator('.daily-order-card').first().screenshot({ path: `${output}/mobile-order.png` })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.daily-orders-list').screenshot({ path: `${output}/desktop-table.png` })
  await click('Día anterior')
  assert.equal(await page.locator('#daily-delivery-date').inputValue(), '2026-09-17')
  await click('Día siguiente')
  assert.equal(await page.locator('#daily-delivery-date').inputValue(), '2026-09-18')
  await click('Hoy')
  const today = await page.locator('#daily-delivery-date').inputValue()
  await click('Mañana')
  assert.notEqual(await page.locator('#daily-delivery-date').inputValue(), today)
  await page.locator('#daily-delivery-date').fill('2026-09-20')
  assert.equal(await page.locator('#daily-delivery-date').inputValue(), '2026-09-20')
  await page.locator('#filter-location').selectOption('Greif')
  assert.equal(await page.locator('.daily-order-row').count(), 4)
  await page.locator('#filter-status').selectOption('archived')
  assert.equal(await page.locator('.daily-order-row').count(), 1)
  await page.locator('#filter-dish').selectOption('Ensalada completa')
  assert.equal(await page.locator('.daily-order-row').count(), 0)
  await page.getByText('No hay pedidos que coincidan con los filtros').waitFor()
  await click('Día siguiente')
  for (const id of ['location', 'status', 'dish', 'side']) assert.equal(await page.locator(`#filter-${id}`).inputValue(), 'all')
  const side = await page.locator('#filter-side option').allTextContents()
  if (side.length > 1) await page.locator('#filter-side').selectOption({ index: 1 })
  await page.locator('#filter-sort').selectOption('location')
  await click('Actualizar datos')
  await click('Ver checklist')
  assert.equal(await page.locator('#daily-close-checklist').isVisible(), true)
  await click('Ocultar checklist')
  for (const name of ['Remitos', 'Buscar', 'Histórico de extras', 'Pedidos']) {
    const tab = page.getByRole('navigation', { name: 'Secciones de pedidos diarios' }).getByRole('button', {name, exact: true})
    await tab.click()
    assert.equal(await tab.getAttribute('aria-current'), 'page')
  }
  for (const name of ['Pedido extra', 'Fuera de término', 'Descontar pedidos']) {
    await click(name)
    await page.screenshot({ path: `${output}/dialog-${name.replaceAll(' ', '-')}.png` })
    const close = page.getByRole('button', { name: /cerrar/i })
    if (await close.count()) await close.last().click()
    else await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click()
  }
  await page.locator('#export-company').selectOption('Greif')
  for (const name of [/^Excel/, /^Nota de pedido/, 'PDF / Imprimir', 'WhatsApp']) await page.getByRole('button', {name}).click()
  await page.getByRole('button', {name: /Archivar pendientes/}).click()
  await page.locator('.daily-table-scroll').getByRole('button', {name: 'Archivar', exact: true}).first().click()
  await page.locator('.daily-table-scroll').getByRole('button', {name: 'Cancelar extra', exact: true}).click()
  const actions = await page.evaluate(() => window.__dailyActions)
  for (const name of ['archiveAll', 'archive', 'deleteExtra', 'refresh', 'exportDailyOrdersExcel', 'exportDailyOrderNotesExcel', 'exportDailyOrdersPdf', 'shareDailyOrdersWhatsApp']) assert.ok(actions.some(action => action.name === name), `${name} callback`)
  const exported = actions.find(action => action.name === 'exportDailyOrdersExcel').args[0]
  assert.equal(exported.exportCompany, 'Greif')
  assert.ok(exported.sortedOrders.every(order => order.location === 'Greif'))
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('.print-only').isVisible(), true)
  for (const element of await page.locator('.print-hide').all()) assert.equal(await element.isVisible(), false)
  await page.pdf({ path: `${output}/daily-print.pdf`, format: 'A4' })
  await page.emulateMedia({ media: 'screen' })
  assert.equal(await page.locator('.print-only').isVisible(), false)
  await go('?empty')
  assert.equal(await page.getByRole('button', {name: /^Excel/}).isDisabled(), true)
  await go('?limited')
  assert.equal(await page.getByRole('button', {name: 'Fuera de término', exact: true}).count(), 0)
  assert.equal(await page.getByRole('button', {name: 'Descontar pedidos', exact: true}).count(), 0)
  assert.equal(await page.getByRole('button', {name: /Archivar pendientes/}).count(), 0)
  await go('?error')
  await page.getByText('No se pudieron actualizar los pedidos.').waitFor()
  await page.goto(`${baseURL}/daily-orders?restricted`)
  await page.getByText('Acceso Restringido').waitFor()
  await page.goto(`${baseURL}/daily-orders?loading`)
  assert.equal(await page.locator('.daily-workspace').count(), 0)
  assert.deepEqual(errors, [])
  console.log(`Daily UI checks passed. Screenshots and print PDF: ${output}`)
} finally {
  await browser.close()
}
