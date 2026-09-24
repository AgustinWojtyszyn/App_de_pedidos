import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw, Search, X } from 'lucide-react'
import { getCompanyConsumptionOrders } from '../services/consumptionReportService'
import { usersService } from '../services/users'
import {
  buildConsumptionReportModel,
  getConsumptionQuantity,
  getMonthDates,
  resolveConsumptionCompanySlug,
  resolveConsumptionLocationLabel,
  resolveConsumptionPersonName
} from '../utils/consumptionReportCalculations'
import { loadExcelJS } from '../utils/loadExcelJS'
import LoadingState from '../components/ui/LoadingState'

const pad = (value) => String(value).padStart(2, '0')
const currentDate = new Date()
const INITIAL_YEAR = currentDate.getFullYear()
const INITIAL_MONTH = currentDate.getMonth() + 1
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const formatDate = (date) => `${pad(Number(date.slice(8, 10)))}/${date.slice(5, 7)}`
const normalizeSearchText = (value = '') =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getCompanyLabel = (order = {}, slug = '') =>
  String(order.company_name || order.organization || slug || 'Empresa').trim() || 'Empresa'

const ConsumptionReportPage = () => {
  const [year, setYear] = useState(INITIAL_YEAR)
  const [month, setMonth] = useState(INITIAL_MONTH)
  const [orders, setOrders] = useState([])
  const [authorizedCompanies, setAuthorizedCompanies] = useState([])
  const [companyFilter, setCompanyFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const dates = useMemo(() => getMonthDates(year, month), [month, year])

  const loadReport = useCallback(async () => {
    const reportDates = getMonthDates(year, month)
    setLoading(true)
    setError('')

    const [result, accessResult] = await Promise.all([
      getCompanyConsumptionOrders({ startDate: reportDates[0], endDate: reportDates.at(-1) }),
      usersService.getAdminAccessContext()
    ])

    if (!accessResult?.error && Array.isArray(accessResult?.data?.consumption_report_companies)) {
      setAuthorizedCompanies(accessResult.data.consumption_report_companies)
    }

    if (result.error) {
      setOrders([])
      setError('No se pudo cargar el reporte de consumo.')
    } else {
      setOrders(result.data)
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => {
    // La ruta ya exige sesión. El RPC es la fuente de verdad de permisos:
    // así un refresh transitorio del contexto no hace desaparecer el reporte.
    loadReport()
  }, [loadReport])

  const companyOptions = useMemo(() => {
    const bySlug = new Map()

    authorizedCompanies.forEach((company) => {
      const slug = String(company?.slug || '').trim()
      if (!slug) return
      const name = String(company?.name || slug).trim() || slug
      bySlug.set(slug, name)
    })

    orders.forEach((order) => {
      const slug = resolveConsumptionCompanySlug(order)
      if (!slug) return
      if (!bySlug.has(slug)) bySlug.set(slug, getCompanyLabel(order, slug))
    })

    return [...bySlug.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [authorizedCompanies, orders])

  useEffect(() => {
    if (companyFilter !== 'all' && !companyOptions.some((company) => company.slug === companyFilter)) {
      setCompanyFilter('all')
      setLocationFilter('all')
    }
  }, [companyFilter, companyOptions])

  const locationOptions = useMemo(() => {
    if (companyFilter === 'all') return []
    const labels = orders
      .filter((order) => resolveConsumptionCompanySlug(order) === companyFilter)
      .map((order) => resolveConsumptionLocationLabel(order))
      .filter((label) => label && label !== 'Sin sede')
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b, 'es'))
  }, [companyFilter, orders])

  useEffect(() => {
    if (locationFilter !== 'all' && !locationOptions.includes(locationFilter)) {
      setLocationFilter('all')
    }
  }, [locationFilter, locationOptions])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchQuery)

    return orders.filter((order) => {
      const companySlug = resolveConsumptionCompanySlug(order)
      if (companyFilter !== 'all' && companySlug !== companyFilter) return false
      if (locationFilter !== 'all' && resolveConsumptionLocationLabel(order) !== locationFilter) return false

      if (normalizedSearch) {
        const searchableText = normalizeSearchText([
          resolveConsumptionPersonName(order),
          order?.customer_email,
          order?.user_email
        ].filter(Boolean).join(' '))
        if (!searchableText.includes(normalizedSearch)) return false
      }

      return true
    })
  }, [companyFilter, locationFilter, orders, searchQuery])

  const model = useMemo(
    () => buildConsumptionReportModel(filteredOrders, dates),
    [dates, filteredOrders]
  )

  const totalConsumption = useMemo(
    () => orders.reduce((sum, order) => sum + Math.max(0, getConsumptionQuantity(order)), 0),
    [orders]
  )

  const companyTotals = useMemo(() => {
    const totals = {}
    orders.forEach((order) => {
      const slug = resolveConsumptionCompanySlug(order)
      if (!slug) return
      totals[slug] = (totals[slug] || 0) + Math.max(0, getConsumptionQuantity(order))
    })
    return totals
  }, [orders])

  const activePeopleCount = useMemo(
    () => new Set(model.rows.map((row) => normalizeSearchText(row.name)).filter(Boolean)).size,
    [model.rows]
  )

  const activeCompany = useMemo(
    () => companyOptions.find((company) => company.slug === companyFilter) || null,
    [companyFilter, companyOptions]
  )

  const activeFilterLabel = useMemo(() => {
    if (companyFilter === 'all') return 'Todas las empresas autorizadas'
    const companyLabel = activeCompany?.name || companyFilter
    return locationFilter === 'all' ? companyLabel : `${companyLabel} · ${locationFilter}`
  }, [activeCompany, companyFilter, locationFilter])

  const applyQuickFilter = (company) => {
    setCompanyFilter(company)
    setLocationFilter('all')
    setSearchQuery('')
  }

  const exportExcel = async () => {
    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood'
    workbook.created = new Date()
    const worksheet = workbook.addWorksheet('Consumo mensual')
    const headers = ['Usuario', 'Lugar / Sede', ...model.dates.map(formatDate), 'Total mensual']
    worksheet.addRow(headers)
    model.rows.forEach((row) => worksheet.addRow([row.name, row.locationLabel, ...model.dates.map((date) => row.quantities[date]), row.monthlyTotal]))
    worksheet.addRow(['Total diario', '', ...model.dates.map((date) => model.dailyTotals[date]), model.grandTotal])
    worksheet.getColumn(1).width = 32
    worksheet.getColumn(2).width = 28
    model.dates.forEach((_, index) => { worksheet.getColumn(index + 3).width = 9 })
    worksheet.getColumn(headers.length).width = 16
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: worksheet.rowCount, column: headers.length }
    }
    worksheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
    worksheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: false
    }
    worksheet.properties.defaultRowHeight = 22

    const headerRowNumber = 1
    const totalRowNumber = worksheet.rowCount
    const totalColumnNumber = headers.length

    worksheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === headerRowNumber ? 26 : 22
      row.eachCell((cell, columnNumber) => {
        const isHeader = rowNumber === headerRowNumber
        const isTotalRow = rowNumber === totalRowNumber
        const isTotalColumn = columnNumber === totalColumnNumber
        const isNameColumn = columnNumber === 1 || columnNumber === 2

        cell.alignment = {
          vertical: 'middle',
          horizontal: isNameColumn ? 'left' : 'center'
        }
        cell.font = {
          color: { argb: isHeader ? 'FFFFFFFF' : 'FF0F172A' },
          bold: isHeader || isTotalRow || isTotalColumn,
          size: 11
        }
        cell.border = {
          top: { style: isTotalRow ? 'medium' : 'thin', color: { argb: isTotalRow ? 'FF94A3B8' : 'FFE2E8F0' } },
          left: { style: isTotalColumn ? 'medium' : 'thin', color: { argb: isTotalColumn ? 'FF94A3B8' : 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        }

        if (isHeader) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } }
        } else if (isTotalRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
        } else if (isTotalColumn) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const anchor = document.createElement('a')
    anchor.href = url
    const companySuffix = companyFilter === 'all' ? 'empresas_autorizadas' : companyFilter
    anchor.download = `consumo_${companySuffix}_${year}-${pad(month)}.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="space-y-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Consumo mensual</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Reporte de consumo por empresa</h1>
        </div>

        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/80 p-3 shadow-sm sm:p-4">
          <div className="mb-3">
            <p className="text-sm font-extrabold uppercase tracking-wide text-blue-900">Filtros del reporte</p>
            <p className="mt-0.5 text-xs font-medium text-blue-800">Solo aparecen empresas que tu usuario tiene autorizadas.</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-52 flex-1 text-sm font-bold text-slate-800 sm:max-w-64">
              Empresa
              <select value={companyFilter} onChange={(event) => { setCompanyFilter(event.target.value); setLocationFilter('all') }} className="mt-1 block min-h-11 w-full rounded-lg border-2 border-blue-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="all">Todas las autorizadas</option>
                {companyOptions.map((company) => <option key={company.slug} value={company.slug}>{company.name}</option>)}
              </select>
            </label>

            <label className="min-w-52 flex-1 text-sm font-bold text-slate-800 sm:max-w-72">
              Sede / lugar
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                disabled={companyFilter === 'all'}
                className="mt-1 block min-h-11 w-full rounded-lg border-2 border-blue-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="all">{companyFilter === 'all' ? 'Elegí una empresa' : 'Todas las sedes'}</option>
                {locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-800">
              Mes
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 shadow-sm">
                <option value={1}>Enero</option><option value={2}>Febrero</option><option value={3}>Marzo</option><option value={4}>Abril</option><option value={5}>Mayo</option><option value={6}>Junio</option><option value={7}>Julio</option><option value={8}>Agosto</option><option value={9}>Septiembre</option><option value={10}>Octubre</option><option value={11}>Noviembre</option><option value={12}>Diciembre</option>
              </select>
            </label>

            <label className="text-sm font-bold text-slate-800">
              Año
              <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value) || INITIAL_YEAR)} className="mt-1 block min-h-11 w-24 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 shadow-sm" />
            </label>

            <button type="button" onClick={exportExcel} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"><Download size={17} /> Exportar Excel</button>
            <button type="button" onClick={loadReport} disabled={loading} aria-label="Actualizar reporte" className="min-h-11 rounded-lg border border-slate-300 bg-white p-3 text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={17} /></button>
          </div>

          <label className="mt-3 block max-w-xl text-sm font-bold text-slate-800">
            Buscar usuario
            <div className="relative mt-1">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Nombre o email"
                className="block min-h-11 w-full rounded-lg border-2 border-blue-200 bg-white py-2.5 pl-10 pr-10 text-base font-semibold text-slate-950 shadow-sm placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  <X size={17} />
                </button>
              )}
            </div>
          </label>
        </div>
      </header>

      {!loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button type="button" onClick={() => applyQuickFilter('all')} aria-pressed={companyFilter === 'all'} className={`rounded-xl border bg-blue-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${companyFilter === 'all' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-200'}`}>
            <p className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Total mensual</p>
            <p className="mt-1 text-3xl font-black text-slate-950 tabular-nums">{totalConsumption}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Todas las empresas autorizadas</p>
          </button>
          {companyOptions.map((company) => (
            <button key={company.slug} type="button" onClick={() => applyQuickFilter(company.slug)} aria-pressed={companyFilter === company.slug} className={`rounded-xl border bg-slate-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${companyFilter === company.slug ? 'border-slate-500 ring-2 ring-slate-200' : 'border-slate-200'}`}>
              <p className="truncate text-xs font-extrabold uppercase tracking-wide text-slate-600">{company.name}</p>
              <p className="mt-1 text-3xl font-black text-slate-950 tabular-nums">{companyTotals[company.slug] || 0}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">consumos del mes · filtrar</p>
            </button>
          ))}
        </div>
      )}

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Vista actual</p>
            <p className="mt-0.5 font-extrabold text-slate-950">{activeFilterLabel} · {MONTH_LABELS[month - 1]} {year}</p>
            {searchQuery.trim() && <p className="mt-0.5 text-xs font-semibold text-blue-700">Búsqueda: “{searchQuery.trim()}”</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-slate-800 shadow-sm">{activePeopleCount} {activePeopleCount === 1 ? 'persona' : 'personas'}</span>
            <span className="rounded-full bg-blue-700 px-3 py-1.5 text-sm font-extrabold text-white shadow-sm">{model.grandTotal} {model.grandTotal === 1 ? 'consumo' : 'consumos'}</span>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState message="Cargando consumo..." /> : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-max border-separate border-spacing-0 text-sm text-slate-950">
            <thead className="sticky top-0 z-30 bg-slate-800 text-white"><tr><th className="sticky left-0 z-50 min-w-72 border-b border-r border-slate-600 bg-slate-800 px-5 py-4 text-left font-bold whitespace-nowrap">Usuario</th><th className="sticky left-72 z-40 min-w-64 border-b border-r border-slate-600 bg-slate-800 px-5 py-4 text-left font-bold whitespace-nowrap">Lugar / Sede</th>{model.dates.map((date) => <th key={date} className="min-w-20 border-b border-r border-slate-700 bg-slate-800 px-3 py-4 text-center font-semibold whitespace-nowrap">{formatDate(date)}</th>)}<th className="sticky right-0 z-50 min-w-36 border-b border-l border-slate-500 bg-slate-800 px-5 py-4 text-center font-bold whitespace-nowrap shadow-[-8px_0_14px_-14px_rgba(15,23,42,0.65)]">Total mensual</th></tr></thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.personKey} className="bg-white"><th className="sticky left-0 z-20 min-w-72 border-b border-r border-slate-200 bg-white px-5 py-3.5 text-left font-semibold text-slate-950 whitespace-nowrap shadow-[8px_0_14px_-16px_rgba(15,23,42,0.55)]">{row.name}</th><td className="sticky left-72 z-10 min-w-64 border-b border-r border-slate-200 bg-white px-5 py-3.5 text-left font-semibold text-slate-800 whitespace-nowrap">{row.locationLabel}</td>{model.dates.map((date) => <td key={date} className="min-w-20 border-b border-r border-slate-100 px-3 py-3.5 text-center text-slate-950 tabular-nums">{row.quantities[date] || ''}</td>)}<td className="sticky right-0 z-20 min-w-36 border-b border-l border-slate-300 bg-slate-50 px-5 py-3.5 text-center font-bold text-slate-950 tabular-nums shadow-[-8px_0_14px_-16px_rgba(15,23,42,0.55)]">{row.monthlyTotal}</td></tr>
              ))}
              <tr className="bg-blue-50 font-bold text-slate-950"><th className="sticky left-0 z-20 min-w-72 border-t-2 border-r border-slate-300 bg-blue-50 px-5 py-4 text-left whitespace-nowrap shadow-[8px_0_14px_-16px_rgba(15,23,42,0.55)]">Total diario</th><td className="sticky left-72 z-10 min-w-64 border-t-2 border-r border-slate-300 bg-blue-50 px-5 py-4 text-left whitespace-nowrap"></td>{model.dates.map((date) => <td key={date} className="min-w-20 border-t-2 border-r border-slate-200 px-3 py-4 text-center text-slate-950 tabular-nums">{model.dailyTotals[date]}</td>)}<td className="sticky right-0 z-20 min-w-36 border-l border-t-2 border-slate-400 bg-blue-100 px-5 py-4 text-center font-extrabold text-slate-950 tabular-nums shadow-[-8px_0_14px_-16px_rgba(15,23,42,0.55)]">{model.grandTotal}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default ConsumptionReportPage