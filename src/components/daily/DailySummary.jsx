import { useState } from 'react'
import { ChevronDown, ChevronUp, GlassWater, MapPin, Salad, Utensils } from 'lucide-react'

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
  const safeLocationCards = Array.isArray(locationCards) ? locationCards.filter(Boolean) : []
  const locationKey = safeLocationCards
    .map(card => `${card.location || 'Sin ubicación'}:${card.total || 0}`)
    .join('|')
  const [locationDisclosure, setLocationDisclosure] = useState({ key: '', expanded: [] })
  const expandedLocations = locationDisclosure.key === locationKey
    ? locationDisclosure.expanded
    : []
  const allLocationsExpanded = safeLocationCards.length > 0 && safeLocationCards.every(card => expandedLocations.includes(card.location || 'Sin ubicación'))

  const toggleLocation = (location) => {
    setLocationDisclosure(current => {
      const expanded = current.key === locationKey ? current.expanded : []
      return {
        key: locationKey,
        expanded: expanded.includes(location)
          ? expanded.filter(item => item !== location)
          : [...expanded, location]
      }
    })
  }

  const toggleAllLocations = () => {
    setLocationDisclosure({
      key: locationKey,
      expanded: allLocationsExpanded ? [] : safeLocationCards.map(card => card.location || 'Sin ubicación')
    })
  }

  if (mode === 'print') {
    return (
      <div className="print-only mb-4">
        <h2 className="text-lg font-black mb-1">📋 Resumen estadístico para PDF</h2>
        <p className="text-[12px] text-gray-700 mb-2">Entrega: {tomorrowLabel}</p>

        <h3 className="text-sm font-bold text-gray-900 mb-1">Viandas por empresa</h3>
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
          <span className="daily-scope">{sortedOrdersLength} viandas · filtros actuales</span>
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
            <div>
              <p className="daily-section-kicker">Distribución</p>
              <h2>Resumen por ubicación</h2>
            </div>
            {safeLocationCards.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="daily-scope">{safeLocationCards.length} ubicaciones · detalle replegado</span>
                <button
                  type="button"
                  onClick={toggleAllLocations}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                >
                  {allLocationsExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  {allLocationsExpanded ? 'Contraer todas' : 'Expandir todas'}
                </button>
              </div>
            )}
          </div>

          {safeLocationCards.length === 0 ? <p className="daily-empty-summary">No hay pedidos para mostrar.</p> : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {safeLocationCards.map((card, index) => {
                const location = card.location || 'Sin ubicación'
                const topDishes = Array.isArray(card.topDishes) ? card.topDishes : []
                const topSides = Array.isArray(card.topSides) ? card.topSides : []
                const expanded = expandedLocations.includes(location)
                const previewDishes = topDishes.slice(0, 2)
                const detailId = `daily-location-detail-${index}`

                return (
                  <article
                    key={`${location}-${index}`}
                    className={`overflow-hidden rounded-lg border bg-white transition ${expanded ? 'border-indigo-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleLocation(location)}
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <MapPin size={15} aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-slate-900">{location}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {previewDishes.length
                            ? previewDishes.map(([name, count]) => `${name} · ${count}`).join('  ·  ')
                            : 'Sin detalle de platillos'}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-right">
                          <strong className="block text-xl font-black leading-none text-indigo-900">{card.total || 0}</strong>
                          <span className="text-[9px] font-medium text-slate-500">viandas</span>
                        </span>
                        <span className="text-slate-400">
                          {expanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
                        </span>
                      </span>
                    </button>

                    {expanded && (
                      <div id={detailId} className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                          <div className="min-w-0">
                            <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Platillos principales</p>
                            {topDishes.length ? topDishes.map(([name, count]) => (
                              <div key={name} className="flex items-start justify-between gap-3 py-1 text-xs text-slate-700">
                                <span className="min-w-0 flex-1">{name}</span>
                                <strong className="shrink-0 tabular-nums text-slate-900">{count}</strong>
                              </div>
                            )) : <p className="text-xs text-slate-500">Sin detalle de platillos</p>}
                          </div>

                          <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-4 lg:border-l-0 lg:pl-0 2xl:border-l 2xl:pl-4">
                            <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Guarniciones</p>
                            {topSides.length ? topSides.map(([name, count]) => (
                              <div key={name} className="flex items-start justify-between gap-3 py-1 text-xs text-slate-600">
                                <span className="min-w-0 flex-1">{name}</span>
                                <strong className="shrink-0 tabular-nums text-slate-800">{count}</strong>
                              </div>
                            )) : <p className="text-xs text-slate-500">Sin guarniciones</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}

export default DailySummary
