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

const printFrameSource = readFileSync(
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
    expect(cssSource).toMatch(/body\.labels-print-frame \.labels-print-thermal \.thermal-label-page\s*\{[\s\S]*?height: var\(--thermal-label-height, 50mm\) !important;/)
    expect(cssSource).toContain('break-after: page !important')
    expect(cssSource).toContain('page-break-after: always !important')
    expect(cssSource).toContain('body.labels-print-frame .labels-print-thermal .thermal-label-page:last-child')
    expect(cssSource).toContain('page-break-after: auto !important')
  })

  it('isolates printing from the application layout instead of rewriting Layout ancestors', () => {
    expect(pageSource).toContain('printLabelsInIsolatedFrame')
    expect(printFrameSource).toContain("document.createElement('iframe')")
    expect(printFrameSource).toContain('<body class="labels-print-frame"></body>')
    expect(printFrameSource).toContain('sourceSurface.cloneNode(true)')
    expect(cssSource).toContain('body.labels-print-frame')
    expect(cssSource).not.toContain(':has(.labels-print-surface)')
    expect(cssSource).not.toContain('body *:not(:has(')
  })

  it('validates that the isolated native print snapshot is visible, complete and text-identical', () => {
    expect(printFrameSource).toContain('label_print_frame_count_mismatch')
    expect(printFrameSource).toContain('label_print_frame_content_mismatch')
    expect(printFrameSource).toContain('label_print_frame_page_count_mismatch')
    expect(printFrameSource).toContain('label_print_frame_blank')
    expect(printFrameSource).toContain("computedStyle.visibility === 'hidden'")
    expect(printFrameSource).toContain('rect.width <= 0')
    expect(printFrameSource).toContain('frameTexts.some')
  })

  it('forces the thermal print container to be fragmentable instead of flex/grid constrained', () => {
    expect(cssSource).toContain('body.labels-print-frame .labels-print-thermal {')
    expect(cssSource).toContain('display: block !important')
    expect(cssSource).toContain('break-inside: auto !important')
    expect(cssSource).toContain('page-break-inside: auto !important')
  })

  it('keeps explicit printer setup guidance next to thermal batch printing', () => {
    expect(previewSource).toContain('Zebra GC420t')
    expect(previewSource).toContain('escala 100 %')
    expect(previewSource).toContain('sin márgenes')
  })
})
