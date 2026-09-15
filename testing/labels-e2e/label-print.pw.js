import { execFileSync } from 'node:child_process'
import { test, expect } from '@playwright/test'

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

const readPdfInfo = (pdfPath) => execFileSync(
  'pdfinfo',
  [pdfPath],
  { encoding: 'utf8' }
)

const readPdfPageCount = (pdfInfo, pdfPath) => {
  const match = pdfInfo.match(/^Pages:\s+(\d+)$/m)
  if (!match) {
    throw new Error(`No se pudo leer la cantidad de páginas de ${pdfPath}`)
  }
  return Number(match[1])
}

const readPdfPageSizePoints = (pdfInfo, pdfPath) => {
  const match = pdfInfo.match(/^Page size:\s+([0-9.]+) x ([0-9.]+) pts/m)
  if (!match) {
    throw new Error(`No se pudo leer el tamaño físico de página de ${pdfPath}`)
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  }
}

const readPdfPageText = (pdfPath, pageNumber) => execFileSync(
  'pdftotext',
  [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-layout',
    pdfPath,
    '-'
  ],
  { encoding: 'utf8' }
)

for (const expectedCount of [1, 2, 25]) {
  test(`${expectedCount} thermal labels become ${expectedCount} non-blank physical pages`, async ({ page }, testInfo) => {
    await page.goto(`/testing/labels-e2e/print-harness.html?count=${expectedCount}&width=100&height=50`)
    await page.waitForFunction(() => Boolean(window.__LABEL_PRINT_E2E__))

    await expect(page.locator('.labels-preview-root .sf-label-card')).toHaveCount(expectedCount)
    await expect(page.locator('.labels-preview-root .thermal-label-page')).toHaveCount(expectedCount)

    await page.evaluate(() => {
      window.__LABEL_PRINT_E2E__.prepare()
    })

    await expect(page.locator('body > #label-print-mount')).toHaveCount(1)
    await expect(page.locator('#label-print-mount .sf-label-card')).toHaveCount(expectedCount)
    await expect(page.locator('#label-print-mount .thermal-label-page')).toHaveCount(expectedCount)
    await expect(page.locator('iframe[data-label-print-frame]')).toHaveCount(0)

    const mountState = await page.evaluate(() => ({
      bodyClassActive: document.body.classList.contains('is-printing-labels'),
      directChild: document.getElementById('label-print-mount')?.parentElement === document.body,
      width: document.getElementById('label-print-mount')?.style.getPropertyValue('--thermal-label-width'),
      height: document.getElementById('label-print-mount')?.style.getPropertyValue('--thermal-label-height')
    }))

    expect(mountState).toEqual({
      bodyClassActive: true,
      directChild: true,
      width: '100mm',
      height: '50mm'
    })

    await page.emulateMedia({ media: 'print' })

    const printLayout = await page.evaluate(() => {
      const mount = document.getElementById('label-print-mount')
      const app = document.getElementById('app-shell')
      const pages = Array.from(mount.querySelectorAll('.thermal-label-page'))

      return {
        mountDisplay: getComputedStyle(mount).display,
        appDisplay: getComputedStyle(app).display,
        pageDisplays: pages.map(item => getComputedStyle(item).display),
        pageSizes: pages.map(item => {
          const rect = item.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height
          }
        })
      }
    })

    expect(printLayout.mountDisplay).toBe('block')
    expect(printLayout.appDisplay).toBe('none')
    expect(printLayout.pageDisplays.every(value => value === 'block')).toBe(true)
    expect(printLayout.pageSizes.every(size => size.width > 0 && size.height > 0)).toBe(true)

    const pdfPath = testInfo.outputPath(`thermal-${expectedCount}.pdf`)
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      scale: 1
    })

    const pdfInfo = readPdfInfo(pdfPath)
    expect(readPdfPageCount(pdfInfo, pdfPath)).toBe(expectedCount)

    const pageSize = readPdfPageSizePoints(pdfInfo, pdfPath)
    expect(pageSize.width).toBeGreaterThan(282)
    expect(pageSize.width).toBeLessThan(285)
    expect(pageSize.height).toBeGreaterThan(140)
    expect(pageSize.height).toBeLessThan(143)

    for (let pageNumber = 1; pageNumber <= expectedCount; pageNumber += 1) {
      const text = normalizeText(readPdfPageText(pdfPath, pageNumber))
      expect(text).not.toBe('')
      expect(text).toContain(`ETIQUETA ${pageNumber}`)
      expect(text).toContain(`MENÚ DE PRUEBA ${pageNumber}`)
    }

    await page.evaluate(() => {
      window.__LABEL_PRINT_E2E__.cleanup()
    })

    await expect(page.locator('#label-print-mount')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.classList.contains('is-printing-labels'))).toBe(false)
  })
}

test('printLabelsDirectly uses window.print and removes the top-level mount on afterprint', async ({ page }) => {
  await page.goto('/testing/labels-e2e/print-harness.html?count=2&width=100&height=50')
  await page.waitForFunction(() => Boolean(window.__LABEL_PRINT_E2E__))

  const result = await page.evaluate(async () => {
    let calls = 0
    const originalPrint = window.print

    window.print = () => {
      calls += 1
      window.dispatchEvent(new Event('afterprint'))
    }

    try {
      const printResult = await window.__LABEL_PRINT_E2E__.print()
      return {
        calls,
        printResult,
        mountExists: Boolean(document.getElementById('label-print-mount')),
        bodyClassActive: document.body.classList.contains('is-printing-labels'),
        iframeCount: document.querySelectorAll('iframe[data-label-print-frame]').length
      }
    } finally {
      window.print = originalPrint
    }
  })

  expect(result).toEqual({
    calls: 1,
    printResult: {
      printed: true,
      labelCount: 2
    },
    mountExists: false,
    bodyClassActive: false,
    iframeCount: 0
  })
})
