import { Link } from 'react-router-dom'
import { Building2, Clock, Edit, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react'

const DashboardHeader = ({
  user,
  countdownLabel,
  countdownValue,
  countdownTone,
  schedule,
  refreshing,
  onRefresh,
  headerOrder,
  headerStatus,
  headerSummary,
  canEditOrder,
  onEditOrder,
  onDeleteOrder,
  deleteActionLabel = 'Eliminar',
  onOpenChangeCompany,
  canOpenChangeCompany,
  changeCompanyHint,
  hideNewOrder = false,
  description = 'Aquí está el resumen de tus pedidos',
  emptyTitle = 'Sin pedido activo',
  emptyDescription = 'Creá tu pedido para hoy en segundos'
}) => {
  const allowEdit = headerOrder && canEditOrder ? canEditOrder(headerOrder) : false
  const scheduleRange = schedule?.scheduleRange || ''
  const scheduleStatus = schedule?.statusLabel || 'Validando horario'
  const countdownText = countdownLabel && countdownValue ? `${countdownLabel} ${countdownValue}` : ''

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/20 bg-blue-950/25 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-blue-100">
              Hola, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
            </p>
            <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">Panel Principal</h1>
            <p className="mt-1 text-sm font-semibold text-blue-100/90">{description}</p>
            <div
              className={`mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
                countdownTone === 'urgent'
                  ? 'border-red-300/60 bg-red-500/20 text-white'
                  : countdownTone === 'warn'
                    ? 'border-amber-300/60 bg-amber-400/20 text-white'
                    : 'border-white/20 bg-white/10 text-white'
              }`}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>{scheduleStatus}{scheduleRange ? `: ${scheduleRange}` : ''}</span>
              {countdownText && <span>• {countdownText}</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                refreshing
                  ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/60'
                  : 'border-white/30 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
            {!hideNewOrder && (
              <Link
                to="/order"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-2 text-sm font-black text-blue-800 shadow-sm transition-colors hover:bg-blue-50"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuevo pedido
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-white/30 bg-white/10 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">Estado del pedido</p>
            {headerOrder ? (
              <>
                <p className="text-xl sm:text-2xl font-black text-white">Pedido en curso</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-gray-900">
                    {headerStatus}
                  </span>
                  <span className="text-xs sm:text-sm text-white/90 font-semibold">
                    Pedido #{String(headerOrder.id).slice(-8)}
                  </span>
                </div>
                <p className="text-sm sm:text-base text-white font-semibold">
                  {headerSummary}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-white/90" />
                  <p className="text-3xl sm:text-4xl font-black text-white">{emptyTitle}</p>
                </div>
                <p className="text-base sm:text-lg text-white/90 font-semibold mt-3">
                  {emptyDescription}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!hideNewOrder && <button
              type="button"
              onClick={onOpenChangeCompany}
              disabled={!canOpenChangeCompany}
              title={changeCompanyHint || ''}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                canOpenChangeCompany
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'bg-slate-200/25 text-slate-200 border-slate-200/30 cursor-not-allowed'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Cambiar empresa
            </button>}
            {headerOrder && (
              <>
                <button
                  type="button"
                  onClick={() => headerOrder && onEditOrder && onEditOrder(headerOrder)}
                  disabled={!allowEdit}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                    allowEdit
                      ? 'bg-white text-gray-900 border-white hover:bg-white/90'
                      : 'bg-white/40 text-white/70 border-white/30 cursor-not-allowed'
                  }`}
                >
                  <Edit className="h-4 w-4" />
                  Editar pedido
                </button>
                <button
                  type="button"
                  onClick={() => headerOrder && onDeleteOrder && onDeleteOrder(headerOrder)}
                  disabled={!allowEdit}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                    allowEdit
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                      : 'bg-red-100/60 text-red-200 border-red-100/60 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteActionLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardHeader
