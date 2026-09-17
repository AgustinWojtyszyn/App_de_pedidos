import { MapPin, Utensils, Salad, GlassWater } from 'lucide-react'

const DailySummary = ({
  mode,
  stats,
  printStats,
  tomorrowLabel,
  operationalSummary,
  sortedOrdersLength,
  selectedLocation,
  locationCards
}) => {
  if (mode === 'print') {
    return (
      <div className="print-only mb-4">
        <h2 className="text-lg font-black mb-1">📋 Resumen estadístico para PDF</h2>
        <p className="text-[12px] text-gray-700 mb-2">Entrega: {tomorrowLabel}</p>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Pedidos por empresa</h3>
        <table className="print-table text-[11px] mb-2 print-block">
          <tbody>
            {Object.entries(stats.byLocation).map(([loc, count]) => (
              <tr key={loc}>
                <td>{loc || 'Sin ubicación'}</td>
                <td className="text-right">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Resumen por turno</h3>
        <table className="print-table text-[11px] mb-2 print-block">
          <thead>
            <tr>
              <th>Turno</th>
              <th>Pedidos</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Almuerzo</td>
              <td className="text-right">{printStats.turnCounts.lunch.orders}</td>
              <td className="text-right">{printStats.turnCounts.lunch.items}</td>
            </tr>
            <tr>
              <td>Cena</td>
              <td className="text-right">{printStats.turnCounts.dinner.orders}</td>
              <td className="text-right">{printStats.turnCounts.dinner.items}</td>
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td className="text-right"><strong>{printStats.turnCounts.lunch.orders + printStats.turnCounts.dinner.orders}</strong></td>
              <td className="text-right"><strong>{printStats.turnCounts.lunch.items + printStats.turnCounts.dinner.items}</strong></td>
            </tr>
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Empresas por turno</h3>
        <table className="print-table text-[11px] mb-2 print-block">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Almuerzo</th>
              <th>Cena</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(printStats.byLocationTurn).length === 0 ? (
              <tr><td colSpan={4}>Sin pedidos</td></tr>
            ) : (
              Object.entries(printStats.byLocationTurn).map(([loc, turns]) => (
                <tr key={loc}>
                  <td>{loc}</td>
                  <td className="text-right">{turns.lunch}</td>
                  <td className="text-right">{turns.dinner}</td>
                  <td className="text-right">{turns.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Menús (platillos)</h3>
        <table className="print-table text-[11px] mb-2 print-block">
          <tbody>
            {Object.entries(stats.byDish).map(([dish, count]) => (
              <tr key={dish}>
                <td>{dish || 'Sin nombre'}</td>
                <td className="text-right">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Opciones adicionales</h3>
        <table className="print-table text-[11px] mb-2 print-block">
          <tbody>
            {Object.keys(printStats.optionCounts).length === 0 ? (
              <tr><td colSpan={2}>Sin opciones</td></tr>
            ) : (
              Object.entries(printStats.optionCounts).map(([opt, count]) => (
                <tr key={opt}>
                  <td>{opt}</td>
                  <td className="text-right">{count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Guarniciones</h3>
        <table className="print-table text-[11px] print-block">
          <tbody>
            {Object.keys(printStats.sideCounts).length === 0 ? (
              <tr><td colSpan={2}>Sin guarniciones</td></tr>
            ) : (
              Object.entries(printStats.sideCounts).map(([side, count]) => (
                <tr key={side}>
                  <td>{side}</td>
                  <td className="text-right">{count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <section className="daily-analytics print-hide" aria-label="Resumen operativo">
        <div className="daily-section-heading">
          <div><p className="daily-section-kicker">Producción del día</p><h2>Qué sale de cocina</h2></div>
          <span className="daily-scope">{sortedOrdersLength} pedidos · filtros actuales</span>
        </div>
        <div className="daily-analytics-grid">
          {[
            { title: 'Platillos', Icon: Utensils, items: operationalSummary.dishes, empty: 'Sin platillos' },
            { title: 'Guarniciones', Icon: Salad, items: operationalSummary.sides, empty: 'Sin guarniciones' },
            { title: 'Bebidas', Icon: GlassWater, items: operationalSummary.beverages, empty: 'Sin bebidas' }
          ].map(section => {
            const { title, Icon, items, empty } = section
            const maxItems = 6
            const visibleItems = items.slice(0, maxItems)
            const remaining = Math.max(items.length - visibleItems.length, 0)
            const totalCount = items.reduce((sum, [, count]) => sum + Number(count || 0), 0)
            return (
              <div key={title} className="daily-analysis-column">
                <div className="daily-analysis-title"><h3><Icon size={17} />{title}</h3><span>{totalCount}<small> total</small></span></div>
                {visibleItems.length === 0 ? <p className="daily-empty-summary">{empty}</p> : (
                  <div className="daily-ranking">
                    {visibleItems.map(([label, count]) => (
                      <div key={label} className="daily-ranking-item">
                        <div><span>{label}</span><strong>{count}</strong></div>
                        <span className="daily-ranking-track" aria-hidden="true"><span style={{ width: `${totalCount > 0 ? Number(count) / totalCount * 100 : 0}%` }} /></span>
                      </div>
                    ))}
                    {remaining > 0 && <p className="daily-remaining">+{remaining} más</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {selectedLocation === 'all' && stats.pending > 0 && (
        <section className="daily-locations print-hide" aria-label="Resumen por ubicación">
          <div className="daily-section-heading">
            <div><p className="daily-section-kicker">Distribución</p><h2>Resumen por ubicación</h2></div>
            <span className="daily-scope">Solo ubicaciones con pedidos del día</span>
          </div>
          {locationCards.length === 0 ? <p className="daily-empty-summary">No hay pedidos para mostrar.</p> : (
            <div className="daily-location-grid">
              {locationCards.map(card => (
                <article key={card.location} className="daily-location">
                  <div className="daily-location-top">
                    <div><MapPin size={16} aria-hidden="true" /><h3>{card.location}</h3></div>
                    <div className="daily-location-count"><strong>{card.total}</strong><span>pedidos</span></div>
                  </div>
                  <div className="daily-location-details">
                    <p className="daily-section-kicker">Platillos principales</p>
                    {card.topDishes.length ? card.topDishes.map(([name, count]) => (
                      <div key={name} className="daily-location-line"><span>{name}</span><strong>{count}</strong></div>
                    )) : <p className="daily-empty-summary">Sin detalle de platillos</p>}
                    <p className="daily-section-kicker daily-side-label">Guarniciones</p>
                    {card.topSides.length ? card.topSides.map(([name, count]) => (
                      <div key={name} className="daily-location-line daily-location-side"><span>{name}</span><strong>{count}</strong></div>
                    )) : <p className="daily-empty-summary">Sin guarniciones</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

export default DailySummary
