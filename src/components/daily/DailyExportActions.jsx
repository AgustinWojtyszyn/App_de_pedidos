import { Archive as ArchiveIcon, FileText, Minus, Plus, Printer } from 'lucide-react'
import excelLogo from '../../assets/logoexcel.png'
import whatsappLogo from '../../assets/whatsapp.png'

const DailyExportActions = ({
  exportCompany,
  onExportCompanyChange,
  locations,
  exportableOrdersCount,
  excludePostReportExtrasFromExports = true,
  onExcludePostReportExtrasFromExportsChange,
  onExportExcel,
  onGenerateNotaPedido,
  onShareWhatsApp,
  onExportPdf,
  onArchiveAll,
  onAddExtraOrder,
  onAddLateExtraOrder,
  onDiscountOrders,
  sortedOrdersLength,
  pendingOrdersCount = 0,
  isAdmin
}) => (
  <div className="daily-actions">
    <section className="daily-operations" aria-label="Acciones operativas">
      <p className="daily-section-kicker">Operación</p>
        <div className="daily-action-buttons">
          {onAddExtraOrder && (
            <button
              type="button"
              onClick={onAddExtraOrder}
              className="daily-button daily-button--primary"
            >
              <Plus className="mr-2 h-4 w-4" />
              Pedido extra
            </button>
          )}

          {onAddLateExtraOrder && (
            <button
              type="button"
              onClick={onAddLateExtraOrder}
              className="daily-button daily-button--exception"
            >
              <Plus className="mr-2 h-4 w-4" />
              Fuera de término
            </button>
          )}

          {onDiscountOrders && (
            <button
              type="button"
              onClick={onDiscountOrders}
              className="daily-button daily-button--danger"
            >
              <Minus className="mr-2 h-4 w-4" />
              Descontar pedidos
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onArchiveAll}
              disabled={pendingOrdersCount === 0}
              className="daily-button daily-button--archive"
              title={pendingOrdersCount > 0 ? 'Archiva todos los pedidos pendientes al final del día' : 'No hay pedidos pendientes para archivar'}
            >
              <ArchiveIcon className="mr-2 h-4 w-4" />
              Archivar pendientes ({pendingOrdersCount})
            </button>
          )}
        </div>
    </section>

    <section className="daily-exports" aria-label="Exportar y compartir">
        <div className="daily-export-heading">
          <div>
            <p className="daily-section-kicker">
              Exportar y compartir
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Las salidas respetan la empresa seleccionada.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="daily-company">
              <label htmlFor="export-company" className="text-xs font-bold text-slate-600">
                Empresa
              </label>
              <select
                id="export-company"
                value={exportCompany}
                onChange={(e) => onExportCompanyChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Todas las empresas</option>
                {locations.map(loc => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={excludePostReportExtrasFromExports}
                onChange={(event) => onExcludePostReportExtrasFromExportsChange?.(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                Sin extras del día
                <small className="block font-semibold text-slate-500">Excel y nota de pedido</small>
              </span>
            </label>
          </div>
        </div>

        <div className="daily-action-buttons">
          <button
            type="button"
            onClick={onExportExcel}
            disabled={exportableOrdersCount === 0}
            className="daily-button daily-button--output"
          >
            <img src={excelLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
            Excel
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
              {exportableOrdersCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onGenerateNotaPedido}
            disabled={exportableOrdersCount === 0}
            className="daily-button daily-button--output"
          >
            <FileText className="mr-2 h-4 w-4" />
            Nota de pedido
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
              {exportableOrdersCount}
            </span>
          </button>

          <button
            type="button"
            onClick={onExportPdf}
            disabled={sortedOrdersLength === 0}
            className="daily-button daily-button--output"
          >
            <Printer className="mr-2 h-4 w-4" />
            PDF / Imprimir
          </button>

          <button
            type="button"
            onClick={onShareWhatsApp}
            disabled={sortedOrdersLength === 0}
            className="daily-button daily-button--output"
          >
            <img src={whatsappLogo} alt="" className="mr-2 h-5 w-5" aria-hidden="true" />
            WhatsApp
          </button>
        </div>
    </section>
  </div>
)

export default DailyExportActions
