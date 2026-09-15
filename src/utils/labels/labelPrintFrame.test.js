import { describe, expect, it } from 'vitest'
import { buildIsolatedLabelPrintCss } from './labelPrintFrame'

describe('buildIsolatedLabelPrintCss', () => {
  it('builds exact one-page-per-label thermal CSS', () => {
    const css = buildIsolatedLabelPrintCss({
      isThermal: true,
      thermalWidth: '100mm',
      thermalHeight: '50mm',
      a4Columns: 2
    })

    expect(css).toContain('size: 100mm 50mm;')
    expect(css).toContain('width: 100mm !important;')
    expect(css).toContain('height: 50mm !important;')
    expect(css).toContain('break-after: page !important;')
    expect(css).toContain('page-break-after: always !important;')
    expect(css).toContain('.thermal-label-page:last-child')
    expect(css).toContain('page-break-after: auto !important;')
    expect(css).toContain('visibility: visible !important;')
    expect(css).toContain('opacity: 1 !important;')
  })

  it('keeps A4 printing isolated without thermal pagination rules changing the page size', () => {
    const css = buildIsolatedLabelPrintCss({
      isThermal: false,
      a4Columns: 3
    })

    expect(css).toContain('size: A4 portrait;')
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important;')
  })

  it('does not depend on :has selectors or the application layout tree', () => {
    const css = buildIsolatedLabelPrintCss({
      isThermal: true
    })

    expect(css).toContain('body.labels-print-frame')
    expect(css).not.toContain(':has(')
    expect(css).not.toContain('#root')
  })
})
