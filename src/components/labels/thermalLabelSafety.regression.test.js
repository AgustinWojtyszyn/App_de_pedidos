import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const cardSource = readFileSync(
  new URL('./OrderLabelCard.jsx', import.meta.url),
  'utf8'
)

const pageSource = readFileSync(
  new URL('../OrderLabelsPage.jsx', import.meta.url),
  'utf8'
)

const previewSource = readFileSync(
  new URL('./OrderLabelsPreview.jsx', import.meta.url),
  'utf8'
)

const cssSource = readFileSync(
  new URL('./order-labels.css', import.meta.url),
  'utf8'
)

const printModuleSource = readFileSync(
  new URL('../../utils/labels/labelPrintFrame.js', import.meta.url),
  'utf8'
)

describe('thermal label print safety gates', () => {
  it('never shrinks fixed-page content below the readable safety threshold', () => {
    expect(cardSource).toContain('const MIN_FIXED_PAGE_SCALE = 0.65')
    expect(cardSource).toContain('safeScale >= MIN_FIXED_PAGE_SCALE')
    expect(cardSource).toContain('data-label-fit-valid')
    expect(cardSource).toContain('data-label-fit-ready')
  })

  it('blocks the print dialog when any thermal label cannot fit safely', () => {
    expect(pageSource).toContain('invalidFits')
    expect(pageSource).toContain('data-label-fit-valid="false"')
    expect(pageSource).toContain("throw new Error('label_print_content_too_dense')")
    expect(pageSource).toContain('La impresión fue bloqueada para evitar una etiqueta recortada o ilegible')
  })

  it('requires one physical thermal page for every expected label before printing', () => {
    expect(pageSource).toContain('thermalPages.length === expectedLabelCount')
    expect(previewSource).toContain('className="thermal-label-page"')
    expect(previewSource).toContain('@page { size: ${printPageSize}; margin: 0; }')
    expect(cssSource).toMatch(/#label-print-mount \.thermal-label-page\s*\{[\s\S]*?height: var\(--thermal-label-height, 50mm\) !important;/)
    expect(cssSource).toContain('break-after: page !important')
    expect(cssSource).toContain('page-break-after: always !important')
    expect(cssSource).toContain('#label-print-mount .thermal-label-page:last-child')
    expect(cssSource).toContain('page-break-after: auto !important')
  })

  it('prints from a direct body child instead of any iframe or offscreen document', () => {
    expect(pageSource).toContain('printLabelsDirectly')
    expect(printModuleSource).toContain("mount.id = PRINT_MOUNT_ID")
    expect(printModuleSource).toContain('document.body.appendChild(mount)')
    expect(printModuleSource).toContain("document.body.classList.add(PRINT_BODY_CLASS)")
    expect(printModuleSource).toContain('window.print()')
    expect(printModuleSource).not.toContain("createElement('iframe')")
    expect(printModuleSource).not.toContain('document.write')
    expect(printModuleSource).not.toContain('collectLoadedCssText')
    expect(printModuleSource).not.toContain('frameWindow')
  })

  it('removes the application from the print tree and keeps only the root print mount', () => {
    expect(cssSource).toContain('body.is-printing-labels > *:not(#label-print-mount)')
    expect(cssSource).toContain('#label-print-mount {')
    expect(cssSource).toContain('display: none;')
    expect(cssSource).toContain('display: block !important')
    expect(cssSource).not.toContain('body.labels-print-frame')
    expect(cssSource).not.toContain(':has(.labels-print-surface)')
    expect(cssSource).not.toContain('body *:not(:has(')
  })

  it('validates the cloned mount against the visible preview before printing', () => {
    expect(printModuleSource).toContain("source: 'source'")
    expect(printModuleSource).toContain("source: 'mount'")
    expect(printModuleSource).toContain('expectedTexts: labelTexts')
    expect(printModuleSource).toContain('label_print_${source}_count_mismatch')
    expect(printModuleSource).toContain('label_print_${source}_content_mismatch')
    expect(printModuleSource).toContain('label_print_${source}_page_count_mismatch')
  })

  it('cleans the temporary print mount after the native dialog closes', () => {
    expect(printModuleSource).toContain("window.addEventListener('afterprint', cleanup, { once: true })")
    expect(printModuleSource).toContain('cleanupDirectLabelPrint()')
    expect(printModuleSource).toContain('PRINT_MOUNT_FALLBACK_CLEANUP_MS')
  })

  it('keeps explicit printer setup guidance next to thermal batch printing', () => {
    expect(previewSource).toContain('Zebra GC420t')
    expect(previewSource).toContain('escala 100 %')
    expect(previewSource).toContain('sin márgenes')
  })
})
