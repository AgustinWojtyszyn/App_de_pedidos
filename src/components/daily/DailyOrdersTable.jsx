import { useState } from 'react'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import DailyOrderRow from './DailyOrderRow'
import { getStatusText } from '../../utils/daily/dailyOrderFormatters'

const PAGE_SIZE = 20

const DailyOrdersTable = ({
  sortedOrders,
  sortBy,
  selectedLocation,
  selectedStatus,
  onArchiveOrder,
  onDeleteExtraOrder,
  onViewOrder
}) => {
  const safeSortedOrders = (Array.isArray(sortedOrders) ? sortedOrders : []).filter(Boolean)
  const resultKey = safeSortedOrders
    .map((order, index) => order.id || `order-${index}`)
    .join('|')

  const [pagination, setPagination] = useState({ resultKey: '', page: 1 })
  const totalPages = Math.max(1, Math.ceil(safeSortedOrders.length / PAGE_SIZE))
  const requestedPage = pagination.resultKey === resultKey ? pagination.page : 1
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageOrders = safeSortedOrders.slice(pageStart, pageStart + PAGE_SIZE)
  const firstVisible = safeSortedOrders.length === 0 ? 0 : pageStart + 1
  const lastVisible = Math.min(pageStart + PAGE_SIZE, safeSortedOrders.length)

  const goToPage = (nextPage) => {
    const page = Math.min(Math.max(nextPage, 1), totalPages)
    setPagination({ resultKey, page })
  }

  return (
    <div className="daily-orders-list print-hide">
      <div className="daily-table-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-900">
              Pedidos del día ({safeSortedOrders.length})
            </h3>
            <p className="text-sm font-semibold text-slate-600">
              Orden: {
                sortBy === 'recent' ? 'Más recientes' :
                sortBy === 'location' ? 'Empresa' :
                sortBy === 'hour' ? 'Hora ascendente' :
                'Estado'
              }
            </p>
          </div>
        </div>
      </div>

      {safeSortedOrders.length === 0 ? (
        <div className="px-4 py-12 text-center sm:px-6 xl:px-7.5">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No hay pedidos que coincidan con los filtros
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {selectedLocation !== 'all' && `Ubicación: ${selectedLocation}`}
            {selectedLocation !== 'all' && selectedStatus !== 'all' && ' | '}
            {selectedStatus !== 'all' && `Estado: ${getStatusText(selectedStatus)}`}
          </p>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Intenta cambiar los filtros para ver más resultados
          </p>
        </div>
      ) : (
        <>
          <div className="daily-table-scroll">
            <table className="daily-data-table">
              <caption className="sr-only">Pedidos del día: clientes, menús, estados y acciones</caption>
              <thead>
                <tr className="daily-table-labels">
                  <th scope="col">Cliente</th>
                  <th scope="col">Ubicación / entrega</th>
                  <th scope="col">Items</th>
                  <th scope="col">Platillos</th>
                  <th scope="col">Bebida / opciones</th>
                  <th scope="col">Turno</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order, index) => (
                  <DailyOrderRow
                    key={order.id || `order-${pageStart + index}`}
                    order={order}
                    index={pageStart + index}
                    onArchiveOrder={onArchiveOrder}
                    onDeleteExtraOrder={onDeleteExtraOrder}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="daily-mobile-orders">
            {pageOrders.map((order, index) => (
              <DailyOrderRow
                key={order.id || `order-card-${pageStart + index}`}
                order={order}
                variant="card"
                onArchiveOrder={onArchiveOrder}
                onDeleteExtraOrder={onDeleteExtraOrder}
                onViewOrder={onViewOrder}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs font-bold text-slate-500">
                Mostrando {firstVisible}–{lastVisible} de {safeSortedOrders.length} pedidos filtrados
              </p>

              <nav
                aria-label="Paginación de pedidos"
                className="flex items-center justify-between gap-2 sm:justify-end"
              >
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Anterior
                </button>

                <span className="min-w-24 text-center text-xs font-black text-slate-600">
                  Página {currentPage} de {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DailyOrdersTable
