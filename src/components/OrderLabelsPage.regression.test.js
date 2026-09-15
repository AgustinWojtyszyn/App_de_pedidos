import React from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import OrderLabelsPreview from './labels/OrderLabelsPreview'

const pageSource = readFileSync(
  new URL('./OrderLabelsPage.jsx', import.meta.url),
  'utf8'
)

const previewSource = readFileSync(
  new URL('./labels/OrderLabelsPreview.jsx', import.meta.url),
  'utf8'
)

const cardSource = readFileSync(
  new URL('./labels/OrderLabelCard.jsx', import.meta.url),
  'utf8'
)

const resultsSource = readFileSync(
  new URL('./labels/OrderLabelsResults.jsx', import.meta.url),
  'utf8'
)

const cssSource = readFileSync(
  new URL('./labels/order-labels.css', import.meta.url),
  'utf8'
)

const labelUtilsSource = readFileSync(
  new URL('../utils/labels/labelOrderUtils.js', import.meta.url),
  'utf8'
)

const batchUtilsSource = readFileSync(
  new URL('../utils/labels/labelPrintBatchUtils.js', import.meta.url),
  'utf8'
)

const orderLabelsHookSource = readFileSync(
  new URL('../hooks/labels/useOrderLabels.js', import.meta.url),
  'utf8'
)

const buildSampleOrder = (id) => ({
  id,
  customer_name: `Gabriel Mercado ${id}`,
  company_slug: 'genneia',
  company_name: 'Genneia',
  company: 'Genneia',
  location: 'Genneia',
  delivery_location: 'Genneia',
  delivery_date: '2026-08-05',
  service: 'lunch',
  status: 'pending',
  total_items: 1,
  items: [
    {
      name: 'Plato Principal',
      quantity: 1
    }
  ],
  custom_responses: [
    {
      title: 'Bebida',
      response: 'Coca cola'
    },
    {
      title: 'Fruta o postre',
      response: 'Fruta'
    }
  ]
})

const renderPreviewWithOrders = (
  orders,
  {
    printFormat = 'thermal',
    thermalPreset = 'custom',
    customThermalSize = {
      width: 64,
      height: 32
    },
    a4Columns = 2
  } = {}
) => renderToStaticMarkup(
  React.createElement(OrderLabelsPreview, {
    selectedOrders: orders,
    printing: false,
    printFormat,
    setPrintFormat: () => {},
    a4Columns,
    setA4Columns: () => {},
    thermalPreset,
    setThermalPreset: () => {},
    customThermalSize,
    setCustomThermalSize: () => {},
    onBack: () => {},
    onCancel: () => {},
    onPrint: async () => ({ confirmed: false, tracked: false }),
    onRegisterPrinted: async () => ({ tracked: true })
  })
)

const renderPreview = (count, options = {}) =>
  renderPreviewWithOrders(
    Array.from(
      { length: count },
      (_, index) => buildSampleOrder(`order-${index + 1}`)
    ),
    options
  )

const countLabelCards = (html) =>
  (html.match(/class="sf-label-card(?: [^"]+)?"/g) || []).length

const countThermalPages = (html) =>
  (html.match(/class="thermal-label-page"/g) || []).length

describe('order labels print flow', () => {
  it('renders only the current deterministic batch, never the full huge selection', () => {
    expect(countLabelCards(renderPreview(0))).toBe(0)
    expect(countLabelCards(renderPreview(1))).toBe(1)
    expect(countLabelCards(renderPreview(50))).toBe(50)
    expect(countLabelCards(renderPreview(51))).toBe(50)
    expect(countLabelCards(renderPreview(123))).toBe(50)

    const html = renderPreview(123)
    expect(html).toContain('Lote 1 de 3')
    expect(html).toContain('data-print-label-count="50"')
  })

  it('creates one isolated thermal page per label in the current batch', () => {
    const html = renderPreview(25)

    expect(countLabelCards(html)).toBe(25)
    expect(countThermalPages(html)).toBe(25)
    expect(html).toContain('labels-print-thermal')
    expect(html).toContain('data-thermal-page-index="25"')
  })

  it('supports a custom 64 x 32 mm thermal page through dynamic @page', () => {
    const html = renderPreview(1, {
      printFormat: 'thermal',
      thermalPreset: 'custom',
      customThermalSize: {
        width: 64,
        height: 32
      }
    })

    expect(html).toContain(
      '@page { size: 64mm 32mm; margin: 0; }'
    )

    expect(html).toContain(
      '--thermal-label-width:64mm'
    )

    expect(html).toContain(
      '--thermal-label-height:32mm'
    )
  })

  it('locks thermal width and height at page, wrapper, and card level', () => {
    expect(cssSource).toContain('.thermal-label-page')
    expect(cssSource).toContain('height: var(--thermal-label-height, 50mm)')
    expect(cssSource).toContain('min-height: var(--thermal-label-height, 50mm)')
    expect(cssSource).toContain('max-height: var(--thermal-label-height, 50mm)')
    expect(cssSource).toContain(".sf-label-card[data-label-fit-fixed='true']")
    expect(cssSource).toContain('height: 100%')

    const thermalPrintBlock = cssSource.slice(
      cssSource.indexOf('.labels-print-thermal .thermal-label-page'),
      cssSource.indexOf('.labels-print-a4 .sf-label-card')
    )
    expect(thermalPrintBlock).not.toContain('height: auto')
    expect(thermalPrintBlock).not.toContain('max-height: none')
  })

  it('forces the page break on the fixed thermal page wrapper', () => {
    expect(cssSource).toContain(
      '.labels-print-thermal .thermal-label-page:not(:last-child)'
    )
    expect(cssSource).toContain('break-after: page !important')
    expect(cssSource).toContain('page-break-after: always !important')
  })

  it('fits long label content inside the fixed physical page instead of spilling into the next label', () => {
    expect(cardSource).toContain('fitToFixedPage')
    expect(cardSource).toContain('data-label-fit-ready')
    expect(cardSource).toContain('data-label-fit-scale')
    expect(cardSource).toContain('ResizeObserver')
    expect(cardSource).toContain('measuredScale * 0.985')
    expect(cssSource).toContain('overflow: hidden')

    const longOrder = {
      ...buildSampleOrder('long-order'),
      customer_name: 'Maria De Los Angeles Fernandez Rodriguez Del Departamento Comercial Central',
      company_name: 'Empresa Corporativa Internacional De Servicios Alimentarios Integrales',
      company: 'Empresa Corporativa Internacional De Servicios Alimentarios Integrales',
      delivery_location: 'Piso 23 Ala Norte Oficina Central Sala De Directorio',
      items: [
        {
          name: 'Milanesa napolitana con pure mixto y ensalada completa',
          quantity: 2
        },
        {
          name: 'Tarta integral de verduras con guarnicion especial',
          quantity: 1
        },
        {
          name: 'Wrap de pollo con vegetales asados y salsa adicional',
          quantity: 1
        }
      ]
    }

    const html = renderPreviewWithOrders([longOrder])
    expect(countLabelCards(html)).toBe(1)
    expect(html).toContain('sf-label-card--very-dense')
    expect(html).toContain('data-label-fit-fixed="true"')
  })

  it('blocks printing until layout, fonts, fit and label count are ready', () => {
    expect(pageSource).toContain('waitForPrintDocumentReady')
    expect(pageSource).toContain('document.fonts?.ready')
    expect(pageSource).toContain('data-label-fit-ready')
    expect(pageSource).toContain("'.labels-print-surface .sf-label-card'")
    expect(pageSource).toContain('renderedLabels.length === expectedLabelCount')
    expect(pageSource).toContain("throw new Error('label_print_layout_not_ready')")

    expect(
      pageSource.indexOf('await waitForPrintDocumentReady')
    ).toBeLessThan(
      pageSource.indexOf('window.print()')
    )
  })

  it('uses an immutable print-session snapshot so marking one batch cannot skip the next one', () => {
    expect(pageSource).toContain('printSessionOrders')
    expect(pageSource).toContain('setPrintSessionOrders(sessionOrders)')
    expect(pageSource).toContain('selectedOrders={printSessionOrders}')
    expect(previewSource).toContain('completedBatchIndex')
    expect(previewSource).toContain('batches[completedBatchIndex]')
  })

  it('prevents duplicate print jobs and supports a one-label untracked test print', () => {
    expect(previewSource).toContain('operationLockRef')
    expect(previewSource).toContain("setPrintScope('test')")
    expect(previewSource).toContain('currentBatch.slice(0, 1)')
    expect(previewSource).toContain('markAsPrinted: false')
    expect(previewSource).toContain('Imprimir 1 de prueba')
  })

  it('does not reprint a physically completed batch when tracking persistence fails', () => {
    expect(previewSource).toContain('pendingRegistrationBatch')
    expect(previewSource).toContain('Reintentar registrar lote')
    expect(previewSource).toContain('onRegisterPrinted(pendingRegistrationBatch)')
    expect(pageSource).toContain('No lo vuelvas a imprimir')
  })

  it('preserves selection, filters, print-state controls and modern tracking', () => {
    expect(pageSource).toContain('Seleccionar todos visibles')
    expect(pageSource).toContain('Limpiar selección')
    expect(pageSource).toContain('Imprimir seleccionados')
    expect(resultsSource).toContain('Falta imprimir')
    expect(resultsSource).toContain('Ya impreso')
    expect(resultsSource).toContain('Reimprimir')
    expect(orderLabelsHookSource).toContain('db.markOrderLabelsPrinted')
    expect(orderLabelsHookSource).toContain('label_printed_at')
    expect(orderLabelsHookSource).toContain('label_print_count')
  })

  it('preserves company-specific label rules while changing only print mechanics', () => {
    expect(labelUtilsSource).toContain('getAdminExtraOrderLabel')
    expect(labelUtilsSource).toContain("companySlug === 'epse' ? []")
    expect(labelUtilsSource).toContain('getOrderOriginLocation')
    expect(labelUtilsSource).toContain('getEpseLocationLabel')
    expect(labelUtilsSource).toContain('isIgarretaIsemarCompany')
    expect(cardSource).toContain("label.originLabel === 'Extra'")
    expect(cardSource).toContain('label.deliveryLocation')
  })

  it('keeps batch sizes explicit and finite', () => {
    expect(batchUtilsSource).toContain('Object.freeze([25, 50, 100])')
    expect(batchUtilsSource).toContain('DEFAULT_LABEL_PRINT_BATCH_SIZE = 50')
    expect(batchUtilsSource).toContain('seenIds.has(orderId)')
    expect(batchUtilsSource).toContain('printableOrders.slice(index, index + safeBatchSize)')
  })

  it('marks a batch printed only after explicit operator confirmation', () => {
    expect(pageSource).toContain('requestPrintSuccessConfirmation')
    expect(pageSource).toContain('const confirmed = await requestPrintSuccessConfirmation')
    expect(pageSource).toContain('if (!confirmed)')
    expect(pageSource).toContain('registerPrintedOrders(safeOrders)')

    expect(
      pageSource.indexOf('window.print()')
    ).toBeLessThan(
      pageSource.indexOf('const confirmed = await requestPrintSuccessConfirmation')
    )
  })
})
