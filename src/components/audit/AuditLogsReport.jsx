import { ClipboardList, RefreshCcw, Search, ShieldCheck } from 'lucide-react'
import excelLogo from '../../assets/logoexcel.png'
import { ACTION_FILTERS, AUDIT_EVENT_TYPE_LABELS } from '../../utils/auditLogs/auditLogConstants'

export default function AuditLogsReport({
  loading,
  error,
  missingTable,
  visibleLogs,
  dailySummary,
  exportRowsLength,
  onExportXlsx,
  onReload,
  truncate,
  formatDate,
  getTimeAgo,
  search,
  setSearch,
  activeFilters,
  toggleFilter,
  clearLogFilters,
  actorFilter,
  setActorFilter,
  actionFilter,
  setActionFilter,
  companyFilter,
  setCompanyFilter,
  eventTypeFilter,
  setEventTypeFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  actorOptions,
  actionOptions,
  companyOptions,
  eventTypeOptions,
  friendlyAction,
  formatTimestamp
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
        <header className="bg-white rounded-2xl shadow-xl border border-blue-100 p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-700 font-semibold">
                Auditoría
              </p>
              <h1 className="text-2xl font-extrabold text-gray-900">
                Reporte de acciones administrativas
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Seguimiento de permisos, menús y movimientos operativos de pedidos, extras, descuentos y bajas.
              </p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 min-w-60">
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por empresa, usuario, responsable o detalle"
                className="w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner bg-white/70"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ACTION_FILTERS.map((filter) => {
                const key = filter.actions.join(',')
                const active = activeFilters.includes(key)
                return (
                  <button
                    key={filter.id}
                    onClick={() => toggleFilter(filter.actions)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-base font-semibold border transition-all ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                    }`}
                  >
                    <ShieldCheck className="h-5 w-5" />
                    {filter.label}
                  </button>
                )
              })}
              <button
                onClick={clearLogFilters}
                className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Quitar filtros
              </button>
              <button
                onClick={onReload}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-base font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                <RefreshCcw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              <button
                onClick={onExportXlsx}
                className="inline-flex items-center gap-3 px-6 py-3 rounded-full text-base font-semibold border border-emerald-700 bg-emerald-600 text-white shadow-lg shadow-emerald-200/70 hover:bg-emerald-700 hover:shadow-emerald-300/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || exportRowsLength === 0}
              >
                <img src={excelLogo} alt="" className="h-5 w-5" aria-hidden="true" />
                Exportar Excel
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">Responsable: Todos</option>
              {actorOptions.map((actor) => (
                <option key={actor} value={actor}>{actor}</option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">Acción: Todas</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>{friendlyAction(action)}</option>
              ))}
            </select>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">Empresa: Todas</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            >
              <option value="all">Tipo: Todos</option>
              {eventTypeOptions.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {AUDIT_EVENT_TYPE_LABELS[eventType] || eventType}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Fecha desde"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Fecha hasta"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            />
          </div>
        </header>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="bg-white rounded-xl border border-blue-100 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">Última actualización de menú</p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {dailySummary.lastMenuUpdate?.createdAt ? formatDate(dailySummary.lastMenuUpdate.createdAt) : 'Sin eventos'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {dailySummary.lastMenuUpdate?.createdAt ? getTimeAgo(dailySummary.lastMenuUpdate.createdAt) : 'N/D'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-blue-100 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">Cambios hoy</p>
          <p className="mt-1 text-2xl font-black text-gray-900">{dailySummary.changesToday}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-100 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-600 font-semibold">Responsable principal hoy</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{dailySummary.topActor}</p>
          <p className="text-xs text-gray-600 mt-1">{dailySummary.topActorCount} evento(s)</p>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {loading
              ? 'Cargando eventos...'
              : `${visibleLogs.length} evento${visibleLogs.length === 1 ? '' : 's'} mostrado${visibleLogs.length === 1 ? '' : 's'}`}
          </p>
          {error && (
            <span className="text-sm text-red-600 font-semibold">
              {truncate(error, 160)}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Acción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Detalle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Usuario afectado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!loading && missingTable && (
                <tr>
                  <td className="px-4 py-6 text-left text-gray-700 text-sm space-y-2" colSpan={7}>
                    <p className="font-semibold text-red-700">La tabla <code>audit_logs</code> no existe en Supabase.</p>
                    <p className="text-gray-700">
                      Crea la tabla y vuelve a cargar la página. SQL sugerido:
                    </p>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
{`create extension if not exists "uuid-ossp";

create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  details text,
  actor_id uuid,
  actor_email text,
  actor_name text,
  target_id uuid,
  target_email text,
  target_name text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);`}
                    </pre>
                    <p className="text-gray-700">
                      Luego refresca este panel para ver los eventos.
                    </p>
                  </td>
                </tr>
              )}
              {!loading && !missingTable && visibleLogs.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500 text-sm" colSpan={7}>
                    No hay eventos que coincidan con los filtros actuales.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-gray-500 text-sm" colSpan={7}>
                    Cargando registros de auditoría...
                  </td>
                </tr>
              )}
              {!loading && visibleLogs.map((log) => (
                <tr key={log.id || `${log.action}-${log.createdAt}-${log.actor_email}`}>
                  <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">
                    {formatTimestamp(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <span>{friendlyAction(log.action)}</span>
                      {(log.repeatCount || 1) > 1 && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-bold">
                          x{log.repeatCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {AUDIT_EVENT_TYPE_LABELS[log.eventType] || log.eventType || 'Otro'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {log.company || 'Sin empresa'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {log.detail}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 whitespace-nowrap">
                    {log.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

