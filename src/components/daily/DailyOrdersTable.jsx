import { Package } from 'lucide-react'
import DailyOrderRow from './DailyOrderRow'
import { getStatusText } from '../../utils/daily/dailyOrderFormatters'

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
                <th scope="col">
                  Cliente
                </th>
                <th scope="col">
                  Ubicación / entrega
                </th>
                <th scope="col">
                  Items
                </th>
                <th scope="col">
                  Platillos
                </th>
                <th scope="col">
                  Bebida / opciones
                </th>
                <th scope="col">
                  Turno
                </th>
                <th scope="col">
                  Hora
                </th>
                <th scope="col">
                  Estado
                </th>
                <th scope="col">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {safeSortedOrders.map((order, index) => (
                <DailyOrderRow
                  key={order.id || `order-${index}`}
                  order={order}
                  index={index}
                  onArchiveOrder={onArchiveOrder}
                  onDeleteExtraOrder={onDeleteExtraOrder}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="daily-mobile-orders">
          {safeSortedOrders.map((order, index) => (
            <DailyOrderRow
              key={order.id || `order-card-${index}`}
              order={order}
              variant="card"
              onArchiveOrder={onArchiveOrder}
              onDeleteExtraOrder={onDeleteExtraOrder}
              onViewOrder={onViewOrder}
            />
          ))}
        </div>
      </>
    )}
  </div>
  )
}

export default DailyOrdersTable
