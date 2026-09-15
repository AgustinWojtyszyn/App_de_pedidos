import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Printer, RotateCcw, X } from 'lucide-react'
import { buildLabelOrder } from '../../utils/labels/labelOrderUtils'
import {
  DEFAULT_LABEL_PRINT_BATCH_SIZE,
  LABEL_PRINT_BATCH_SIZE_OPTIONS,
  createLabelPrintBatches,
  normalizeLabelPrintBatchSize
} from '../../utils/labels/labelPrintBatchUtils'
import OrderLabelCard from './OrderLabelCard'

const THERMAL_LIMITS = {
  width: {
    min: 40,
    max: 150,
    fallback: 100
  },
  height: {
    min: 25,
    max: 100,
    fallback: 50
  }
}

const estimateA4Sheets = (count, columns) => {
  const perSheet = Number(columns) === 3 ? 12 : 8
  return Math.max(
    Math.ceil(count / perSheet),
    1
  )
}

const normalizeThermalMillimeters = (
  value,
  { min, max, fallback }
) => {
  const parsed = Number(
    String(value ?? '').replace(',', '.')
  )

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(
    Math.max(parsed, min),
    max
  )
}

const waitForNextPaint = () => new Promise((resolve) => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve)
  })
})

const OrderLabelsPreview = ({
  selectedOrders,
  printing = false,
  printFormat,
  setPrintFormat,
  a4Columns,
  setA4Columns,
  thermalPreset,
  setThermalPreset,
  customThermalSize,
  setCustomThermalSize,
  onBack,
  onCancel,
  onPrint,
  onRegisterPrinted
}) => {
  const [batchSize, setBatchSize] = useState(DEFAULT_LABEL_PRINT_BATCH_SIZE)
  const [completedBatchIndex, setCompletedBatchIndex] = useState(0)
  const [printScope, setPrintScope] = useState('batch')
  const [localBusy, setLocalBusy] = useState(false)
  const [pendingRegistrationBatch, setPendingRegistrationBatch] = useState(null)
  const operationLockRef = useRef(false)

  const batches = useMemo(
    () => createLabelPrintBatches(selectedOrders, batchSize),
    [batchSize, selectedOrders]
  )

  const sessionTotal = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.length, 0),
    [batches]
  )

  const completedCount = useMemo(
    () => batches
      .slice(0, completedBatchIndex)
      .reduce((sum, batch) => sum + batch.length, 0),
    [batches, completedBatchIndex]
  )

  const sessionComplete = sessionTotal > 0 && completedBatchIndex >= batches.length
  const currentBatch = sessionComplete
    ? []
    : (batches[completedBatchIndex] || [])
  const currentBatchNumber = batches.length === 0
    ? 0
    : Math.min(completedBatchIndex + 1, batches.length)
  const batchLocked = completedBatchIndex > 0 || Boolean(pendingRegistrationBatch)
  const displayOrders = printScope === 'test'
    ? currentBatch.slice(0, 1)
    : currentBatch

  // 1 pedido único = 1 etiqueta única dentro del lote actual.
  const labels = displayOrders
    .filter(order => order?.id)
    .map(order => ({
      ...buildLabelOrder(order),
      labelInstanceId: `${order.id}-0`
    }))

  const thermalSize =
    thermalPreset === 'custom'
      ? customThermalSize
      : {
          '100x50': {
            width: 100,
            height: 50
          },
          '80x50': {
            width: 80,
            height: 50
          }
        }[thermalPreset]

  const width = normalizeThermalMillimeters(
    thermalSize?.width,
    THERMAL_LIMITS.width
  )

  const height = normalizeThermalMillimeters(
    thermalSize?.height,
    THERMAL_LIMITS.height
  )

  const previewModeClass =
    printFormat === 'thermal'
      ? 'labels-preview-thermal'
      : 'labels-preview-a4'

  const printPageSize =
    printFormat === 'thermal'
      ? `${width}mm ${height}mm`
      : 'A4'

  const updateCustomThermalSize = (
    dimension,
    value
  ) => {
    const limits = THERMAL_LIMITS[dimension]

    const parsed = Number(
      String(value ?? '').replace(',', '.')
    )

    const nextValue =
      Number.isFinite(parsed) &&
      parsed > limits.max
        ? limits.max
        : value

    setCustomThermalSize(prev => ({
      ...prev,
      [dimension]: nextValue
    }))
  }

  const normalizeCustomThermalSize = (dimension) => {
    const limits = THERMAL_LIMITS[dimension]

    setCustomThermalSize(prev => ({
      ...prev,
      [dimension]: normalizeThermalMillimeters(
        prev?.[dimension],
        limits
      )
    }))
  }

  const runExclusive = async (operation) => {
    if (operationLockRef.current) return

    operationLockRef.current = true
    setLocalBusy(true)
    try {
      await operation()
    } finally {
      operationLockRef.current = false
      setLocalBusy(false)
    }
  }

  const handleBatchSizeChange = (value) => {
    if (batchLocked) return
    setBatchSize(normalizeLabelPrintBatchSize(value))
  }

  const handleTestPrint = () => runExclusive(async () => {
    const testOrder = currentBatch[0]
    if (!testOrder) return

    setPrintScope('test')
    await waitForNextPaint()
    await onPrint([testOrder], {
      markAsPrinted: false,
      printedLabelCount: 1,
      contextLabel: 'Prueba de impresión'
    })
    setPrintScope('batch')
    await waitForNextPaint()
  })

  const handlePrintCurrentBatch = () => runExclusive(async () => {
    if (currentBatch.length === 0 || pendingRegistrationBatch) return

    setPrintScope('batch')
    await waitForNextPaint()

    const result = await onPrint(currentBatch, {
      markAsPrinted: true,
      printedLabelCount: currentBatch.length,
      contextLabel: `Lote ${currentBatchNumber} de ${batches.length}`
    })

    if (result?.confirmed && result?.tracked) {
      setCompletedBatchIndex(index => index + 1)
      return
    }

    if (result?.confirmed && !result?.tracked) {
      setPendingRegistrationBatch(currentBatch)
    }
  })

  const handleRetryRegistration = () => runExclusive(async () => {
    if (!pendingRegistrationBatch?.length) return

    const result = await onRegisterPrinted(pendingRegistrationBatch)
    if (!result?.tracked) return

    setPendingRegistrationBatch(null)
    setCompletedBatchIndex(index => index + 1)
  })

  const busy = printing || localBusy

  return (
    <section
      className={`labels-preview-root ${previewModeClass}`}
      style={{
        '--label-a4-columns': a4Columns,
        '--thermal-label-width': `${width}mm`,
        '--thermal-label-height': `${height}mm`
      }}
    >
      <style media="print">
        {`@page { size: ${printPageSize}; margin: 0; }`}
      </style>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 print-hide">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Impresión por lotes
            </h2>

            <p className="text-sm font-semibold text-slate-500">
              {sessionTotal} etiqueta
              {sessionTotal === 1 ? '' : 's'} seleccionada
              {sessionTotal === 1 ? '' : 's'}
              {batches.length > 0 && (
                <>
                  {' · '}
                  Lote {currentBatchNumber} de {batches.length}
                  {' · '}
                  {completedCount}/{sessionTotal} completadas
                </>
              )}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5 xl:min-w-[920px]">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-slate-600">
                Formato
              </span>

              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                value={printFormat}
                disabled={batchLocked || busy}
                onChange={event =>
                  setPrintFormat(event.target.value)
                }
              >
                <option value="a4">
                  Hoja A4
                </option>

                <option value="thermal">
                  Etiqueta térmica
                </option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase text-slate-600">
                Por lote
              </span>

              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                value={batchSize}
                disabled={batchLocked || busy}
                onChange={event => handleBatchSizeChange(event.target.value)}
              >
                {LABEL_PRINT_BATCH_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>
                    {size} etiquetas
                  </option>
                ))}
              </select>
            </label>

            {printFormat === 'a4' ? (
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-600">
                  Densidad
                </span>

                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  value={a4Columns}
                  disabled={batchLocked || busy}
                  onChange={event =>
                    setA4Columns(
                      Number(event.target.value)
                    )
                  }
                >
                  <option value={2}>
                    2 columnas
                  </option>

                  <option value={3}>
                    3 columnas
                  </option>
                </select>
              </label>
            ) : (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Tamaño
                  </span>

                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    value={thermalPreset}
                    disabled={batchLocked || busy}
                    onChange={event =>
                      setThermalPreset(
                        event.target.value
                      )
                    }
                  >
                    <option value="100x50">
                      100 x 50 mm
                    </option>

                    <option value="80x50">
                      80 x 50 mm
                    </option>

                    <option value="custom">
                      Personalizado
                    </option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Ancho mm
                  </span>

                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    type="number"
                    min="40"
                    max="150"
                    step="1"
                    disabled={thermalPreset !== 'custom' || batchLocked || busy}
                    value={customThermalSize.width}
                    onChange={event =>
                      updateCustomThermalSize(
                        'width',
                        event.target.value
                      )
                    }
                    onBlur={() =>
                      normalizeCustomThermalSize(
                        'width'
                      )
                    }
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Alto mm
                  </span>

                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    type="number"
                    min="25"
                    max="100"
                    step="1"
                    disabled={thermalPreset !== 'custom' || batchLocked || busy}
                    value={customThermalSize.height}
                    onChange={event =>
                      updateCustomThermalSize(
                        'height',
                        event.target.value
                      )
                    }
                    onBlur={() =>
                      normalizeCustomThermalSize(
                        'height'
                      )
                    }
                  />
                </label>
              </>
            )}
          </div>
        </div>

        {sessionComplete ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 font-black">
              <CheckCircle2 className="h-5 w-5" />
              Todos los lotes fueron impresos y registrados.
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800"
            >
              Finalizar
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-950">
              Lote actual: <strong>{currentBatch.length}</strong> etiqueta
              {currentBatch.length === 1 ? '' : 's'}.
              {printFormat === 'thermal' && (
                <>
                  {' '}Cada una se genera como una página física independiente de <strong>{width} × {height} mm</strong>.
                </>
              )}
              {printFormat === 'a4' && (
                <>
                  {' '}Equivale a unas <strong>{estimateA4Sheets(currentBatch.length, a4Columns)}</strong> hojas A4.
                </>
              )}
            </div>

            {pendingRegistrationBatch ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950">
                <p>
                  Este lote ya salió físicamente. No lo vuelvas a imprimir: falta solamente guardar el estado de {pendingRegistrationBatch.length} etiquetas.
                </p>
                <button
                  type="button"
                  onClick={handleRetryRegistration}
                  disabled={busy}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-black text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reintentar registrar lote
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={busy || completedBatchIndex > 0}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a editar selección
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Cerrar
                </button>

                {printFormat === 'thermal' && (
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    disabled={currentBatch.length === 0 || busy}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-black text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir 1 de prueba
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintCurrentBatch}
                  disabled={currentBatch.length === 0 || busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  {busy
                    ? 'Preparando impresión...'
                    : `Imprimir lote ${currentBatchNumber} (${currentBatch.length})`}
                </button>
              </div>
            )}

            {printFormat === 'thermal' && (
              <p className="mt-3 text-xs font-bold text-slate-500 print-hide">
                Zebra GC420t: usar el mismo tamaño físico configurado arriba, escala 100 % y sin márgenes del controlador.
              </p>
            )}
          </>
        )}
      </div>

      {!sessionComplete && (
        <div
          className={`labels-print-surface ${
            printFormat === 'thermal'
              ? 'labels-print-thermal'
              : 'labels-print-a4'
          }`}
          data-print-label-count={labels.length}
          data-print-batch-number={currentBatchNumber}
          data-print-batch-total={batches.length}
        >
          {printFormat === 'thermal'
            ? labels.map((label, index) => (
                <div
                  key={label.labelInstanceId}
                  className="thermal-label-page"
                  data-thermal-page-index={index + 1}
                >
                  <OrderLabelCard
                    label={label}
                    fitToFixedPage
                  />
                </div>
              ))
            : labels.map(label => (
                <OrderLabelCard
                  key={label.labelInstanceId}
                  label={label}
                />
              ))}
        </div>
      )}
    </section>
  )
}

export default OrderLabelsPreview