import { useCallback, useState } from 'react'
import { Printer, Tag, X } from 'lucide-react'
import { useAuthContext } from '../contexts/authContextValue'
import OrderLabelsFilters from './labels/OrderLabelsFilters'
import OrderLabelsPreview from './labels/OrderLabelsPreview'
import OrderLabelsResults from './labels/OrderLabelsResults'
import { useOrderLabels } from '../hooks/labels/useOrderLabels'
import './labels/order-labels.css'

// Regresión histórica: "Seleccionar todos visibles" ya no alcanza cuando hay más de una página.

const requestPrintSuccessConfirmation = (
  count,
  contextLabel = 'Lote de etiquetas'
) => new Promise((resolve) => {
  window.dispatchEvent(new CustomEvent('app-confirm', {
    detail: {
      title: 'Confirmar impresión de etiquetas',
      message: `${contextLabel}: se abrió el diálogo para ${count} etiqueta${count === 1 ? '' : 's'}.\nConfirmá únicamente si este lote salió completo y correctamente.`,
      confirmText: 'Confirmar lote correcto',
      cancelText: 'No marcar',
      tone: 'warning',
      resolve
    }
  }))
})

const nextAnimationFrame = () => new Promise((resolve) => {
  window.requestAnimationFrame(resolve)
})

const waitForPrintDocumentReady = async (expectedLabelCount) => {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const pendingFits = document.querySelectorAll(
      '.labels-preview-thermal [data-label-fit-fixed="true"][data-label-fit-ready="false"]'
    )

    const renderedLabels = document.querySelectorAll(
      '.labels-print-surface .sf-label-card'
    )

    if (
      pendingFits.length === 0 &&
      renderedLabels.length === expectedLabelCount
    ) {
      await nextAnimationFrame()
      await nextAnimationFrame()
      return
    }

    await nextAnimationFrame()
  }

  throw new Error('label_print_layout_not_ready')
}

const getUniqueOrdersForPrint = (orders = []) => {
  const seenIds = new Set()
  const safeOrders = []

  ;(Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderId = String(order?.id || '').trim()
    if (!orderId || seenIds.has(orderId)) return
    seenIds.add(orderId)
    safeOrders.push(order)
  })

  return safeOrders
}

const OrderLabelsPage = () => {
  const { isAdmin, isCompanyAdmin, adminCompanies } = useAuthContext()

  const [printFormat, setPrintFormat] = useState('a4')
  const [a4Columns, setA4Columns] = useState(2)
  const [thermalPreset, setThermalPreset] = useState('100x50')
  const [customThermalSize, setCustomThermalSize] = useState({
    width: 100,
    height: 50
  })

  const [printing, setPrinting] = useState(false)
  const [printSessionOrders, setPrintSessionOrders] = useState([])

  const labels = useOrderLabels({
    isAdmin,
    isCompanyAdmin,
    adminCompanies
  })

  const openPreview = useCallback((order = null) => {
    const sessionOrders = order?.id
      ? [order]
      : getUniqueOrdersForPrint(labels.selectedOrders)

    if (sessionOrders.length === 0) {
      labels.setPrintWarning(
        'Seleccioná al menos un pedido para imprimir etiquetas.'
      )
      return
    }

    setPrintSessionOrders(sessionOrders)
    labels.enterPreview(order)
  }, [labels])

  const closePreview = useCallback(() => {
    setPrintSessionOrders([])
    labels.cancelPreview()
  }, [labels])

  const registerPrintedOrders = useCallback(async (ordersToRegister = []) => {
    const safeOrders = getUniqueOrdersForPrint(ordersToRegister)
    if (safeOrders.length === 0) {
      return {
        tracked: false,
        error: new Error('empty_label_batch')
      }
    }

    const result = await labels.markPrinted(
      safeOrders.map(order => order.id)
    )

    return {
      tracked: !result?.error,
      error: result?.error || null
    }
  }, [labels])

  const printOrders = useCallback(async (
    ordersToPrint = [],
    {
      markAsPrinted = true,
      printedLabelCount = null,
      contextLabel = 'Lote de etiquetas'
    } = {}
  ) => {
    const safeOrders = getUniqueOrdersForPrint(ordersToPrint)

    if (safeOrders.length === 0) {
      labels.setPrintWarning(
        'No hay etiquetas válidas en este lote.'
      )
      return {
        printed: false,
        confirmed: false,
        tracked: false
      }
    }

    const expectedLabelCount = Number(printedLabelCount)
    if (
      Number.isFinite(expectedLabelCount) &&
      expectedLabelCount !== safeOrders.length
    ) {
      labels.setPrintWarning(
        'La cantidad preparada no coincide con el lote. La impresión fue bloqueada para evitar etiquetas faltantes o duplicadas.'
      )
      return {
        printed: false,
        confirmed: false,
        tracked: false
      }
    }

    setPrinting(true)
    labels.setPrintWarning('')

    try {
      await waitForPrintDocumentReady(safeOrders.length)
      window.print()
    } catch (_error) {
      labels.setPrintWarning(
        'El lote no terminó de prepararse de forma segura. No se envió nada a imprimir. Intentá nuevamente.'
      )
      return {
        printed: false,
        confirmed: false,
        tracked: false
      }
    } finally {
      setPrinting(false)
    }

    if (!markAsPrinted) {
      return {
        printed: true,
        confirmed: false,
        tracked: false,
        testPrint: true
      }
    }

    const confirmed = await requestPrintSuccessConfirmation(
      safeOrders.length,
      contextLabel
    )

    if (!confirmed) {
      labels.setPrintWarning(
        'El lote no se marcó como completado. Podés revisarlo y volver a imprimirlo si hace falta.'
      )
      return {
        printed: true,
        confirmed: false,
        tracked: false
      }
    }

    const trackingResult = await registerPrintedOrders(safeOrders)
    if (!trackingResult.tracked) {
      labels.setPrintWarning(
        'El lote salió, pero no se pudo guardar su estado. No lo vuelvas a imprimir: usá “Reintentar registrar lote”.'
      )
      return {
        printed: true,
        confirmed: true,
        tracked: false,
        error: trackingResult.error
      }
    }

    return {
      printed: true,
      confirmed: true,
      tracked: true
    }
  }, [labels, registerPrintedOrders])

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      {!labels.previewMode ? (
        <div className="space-y-5">
          <section className="rounded-xl border border-white/30 bg-white p-5 shadow-xl shadow-blue-950/10 print-hide md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                  <Tag className="h-6 w-6" />
                </div>

                <div>
                  <h1 className="text-2xl font-black text-slate-900 md:text-3xl">
                    Etiquetas
                  </h1>

                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Buscar/filtrar → seleccionar pedidos → elegir formato → revisar → imprimir.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900">
                {labels.selectedCount} etiqueta
                {labels.selectedCount === 1 ? '' : 's'} seleccionada
                {labels.selectedCount === 1 ? '' : 's'}
              </div>
            </div>
          </section>

          <OrderLabelsFilters
            filters={labels.filters}
            onFilterChange={labels.updateFilter}
            onClear={labels.clearFilters}
            companyOptions={labels.companyOptions}
            customerOptions={labels.customerOptions}
            accessLocations={labels.accessLocations}
          />

          {labels.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 print-hide">
              {labels.error}
            </div>
          )}

          {labels.printWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 print-hide">
              {labels.printWarning}
            </div>
          )}

          {labels.visibleOrders.length > 0 && (
            <section className="sticky top-3 z-20 rounded-xl border border-blue-200 bg-white p-3 shadow-xl shadow-blue-950/10 print-hide">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {labels.selectedCount > 0 ? (
                      <>
                        {labels.selectedOrders.slice(0, 5).map(order => (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => labels.removeSelected(order.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                            title="Quitar de la selección"
                          >
                            {order.customer_name ||
                              order.user_name ||
                              order.user_email ||
                              'Pedido'}
                            <X className="h-3 w-3" />
                          </button>
                        ))}

                        {labels.selectedCount > 5 && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                            +{labels.selectedCount - 5} más
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-bold text-slate-700">
                        Seleccioná uno, varios o todos los pedidos encontrados.
                      </span>
                    )}
                  </div>

                  {labels.selectedCount > 0 && (
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {labels.selectedCount} pedido
                      {labels.selectedCount === 1 ? '' : 's'} seleccionado
                      {labels.selectedCount === 1 ? '' : 's'} · 1 pedido = 1 etiqueta
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={
                      labels.allMatchingSelected
                        ? labels.unselectAllMatching
                        : labels.selectAllMatching
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    {labels.allMatchingSelected
                      ? `Quitar todos (${labels.totalCount})`
                      : `Seleccionar todos (${labels.totalCount})`}
                  </button>

                  {labels.selectedCount > 0 && (
                    <button
                      type="button"
                      onClick={labels.clearSelected}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                    >
                      Limpiar selección
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openPreview()}
                    disabled={labels.selectedCount === 0 || printing}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir seleccionados
                  </button>
                </div>
              </div>
            </section>
          )}

          <OrderLabelsResults
            orders={labels.visibleOrders}
            loading={labels.loading}
            selectedIds={labels.selectedIds}
            allMatchingSelected={labels.allMatchingSelected}
            totalCount={labels.totalCount}
            printState={labels.printState}
            printStateCounts={labels.printStateCounts}
            page={labels.page}
            maxPage={labels.maxPage}
            pageSize={labels.pageSize}
            onToggleOrder={labels.toggleOrder}
            onSelectAll={labels.selectAllMatching}
            onUnselectAll={labels.unselectAllMatching}
            onPrintOne={openPreview}
            onPrintStateChange={labels.updatePrintState}
            onPageChange={labels.setPage}
          />
        </div>
      ) : (
        <OrderLabelsPreview
          selectedOrders={printSessionOrders}
          printing={printing}
          printFormat={printFormat}
          setPrintFormat={setPrintFormat}
          a4Columns={a4Columns}
          setA4Columns={setA4Columns}
          thermalPreset={thermalPreset}
          setThermalPreset={setThermalPreset}
          customThermalSize={customThermalSize}
          setCustomThermalSize={setCustomThermalSize}
          onBack={closePreview}
          onCancel={closePreview}
          onPrint={printOrders}
          onRegisterPrinted={registerPrintedOrders}
        />
      )}
    </div>
  )
}

export default OrderLabelsPage
