import { CalendarDays, RefreshCw } from 'lucide-react'
import { addDaysToISO, getTodayISOInTimeZone, getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import DailyExportActions from './DailyExportActions'

const DailyHeader = ({
  stats,
  operationalSplit,
  activeLocationsCount,
  tomorrowLabel,
  operationalDate,
  onDeliveryDateChange,
  exportCompany,
  onExportCompanyChange,
  locations,
  exportableOrdersCount,
  onExportExcel,
  onGenerateNotaPedido,
  onShareWhatsApp,
  refreshing,
  onRefresh,
  onExportPdf,
  onArchiveAll,
  onAddExtraOrder,
  onAddLateExtraOrder,
  onDiscountOrders,
  sortedOrdersLength,
  pendingOrdersCount,
  isAdmin,
  dailyCloseStatus
}) => {
  const today = getTodayISOInTimeZone()
  const tomorrow = getTomorrowISOInTimeZone()
  const previousDay = addDaysToISO(operationalDate, -1)
  const nextDay = addDaysToISO(operationalDate, 1)
  const safeOperationalSplit = operationalSplit || {
    base: { units: Math.max(Number(stats?.total || 0) - Number(stats?.postReportExtra || 0), 0) },
    postReportExtras: { units: Number(stats?.postReportExtra || 0) },
    total: { units: Number(stats?.total || 0) }
  }

  const quickDates = [
    { label: 'Día anterior', value: previousDay },
    { label: 'Hoy', value: today },
    { label: 'Mañana', value: tomorrow },
    { label: 'Día siguiente', value: nextDay }
  ]

  return (
    <header className="daily-command print-hide">
      <div className="daily-command-top">
        <div>
          <p className="daily-eyebrow">ServiFood <span>/</span> Centro operativo</p>
          <h1>Pedidos diarios<span className="daily-title-dot">.</span></h1>
          <p className="daily-delivery-label">Entrega · {tomorrowLabel}</p>
        </div>
        <div className="daily-command-live">
          <span className={`daily-day-status daily-day-status--${dailyCloseStatus?.overallStatus?.tone || 'neutral'}`}>
            <span aria-hidden="true" /> Cierre: {dailyCloseStatus?.overallStatus?.label || 'Sin información'}
          </span>
          <span className="daily-update-label">Última actualización · {dailyCloseStatus?.lastUpdatedLabel || 'Sin actualización'}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing} className="daily-refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando...' : 'Actualizar datos'}
          </button>
        </div>
      </div>
      <div className="daily-datebar">
        <label htmlFor="daily-delivery-date"><CalendarDays size={16} /> Fecha de entrega</label>
        <input id="daily-delivery-date" type="date" value={operationalDate}
          onChange={(event) => onDeliveryDateChange(event.target.value)} />
        <div className="daily-quickdates">
          {quickDates.map(item => (
            <button key={item.label} type="button" onClick={() => onDeliveryDateChange(item.value)}
              disabled={item.value === operationalDate}>{item.label}</button>
          ))}
        </div>
      </div>
      <div className="daily-metrics">
        {[
          { label: 'Pedidos del cierre', value: safeOperationalSplit.base.units, kind: 'archived', detail: 'viandas del cierre anterior' },
          { label: 'Pedidos extra del día', value: safeOperationalSplit.postReportExtras.units, kind: 'extra', detail: 'viandas agregadas después' },
          { label: 'Total a preparar', value: safeOperationalSplit.total.units, kind: 'total', detail: 'viandas para cocina' },
          { label: 'Pendientes', value: stats.pending, kind: 'pending', detail: 'viandas por archivar' },
          { label: 'Ubicaciones activas', value: activeLocationsCount, kind: 'locations', detail: 'puntos de entrega' }
        ].map(metric => (
          <div key={metric.label} className={`daily-metric daily-metric--${metric.kind}`}>
            <p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.detail}</span>
          </div>
        ))}
      </div>
      <DailyExportActions
        exportCompany={exportCompany}
        onExportCompanyChange={onExportCompanyChange}
        locations={locations}
        exportableOrdersCount={exportableOrdersCount}
        onExportExcel={onExportExcel}
        onGenerateNotaPedido={onGenerateNotaPedido}
        onShareWhatsApp={onShareWhatsApp}
        onExportPdf={onExportPdf}
        onArchiveAll={onArchiveAll}
        onAddExtraOrder={onAddExtraOrder}
        onAddLateExtraOrder={onAddLateExtraOrder}
        onDiscountOrders={onDiscountOrders}
        sortedOrdersLength={sortedOrdersLength}
        pendingOrdersCount={pendingOrdersCount}
        isAdmin={isAdmin}
      />
    </header>
  )
}

export default DailyHeader
