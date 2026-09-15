import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Building2,
  Clock3,
  Percent,
  PlusCircle,
  RefreshCw
} from 'lucide-react'
import { db } from '../../supabaseClient'
import { auditService } from '../../services/audit'
import { formatISODateFromParts, getDatePartsInTimeZone, getTodayISOInTimeZone } from '../../utils/dateUtils'

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const getAuditOperationalDate = (createdAt) => {
  if (!createdAt) return ''
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatISODateFromParts(getDatePartsInTimeZone(parsed))
}

const getActiveCompanies = (companies = []) =>
  (Array.isArray(companies) ? companies : []).filter((company) => {
    const slug = normalizeText(company?.slug)
    if (!slug || slug === 'global') return false
    if (company?.is_active === false || company?.active === false) return false
    return normalizeText(company?.status) !== 'inactive'
  })

const resolveOrderCompanySlug = (order = {}, companies = []) => {
  const directSlug = normalizeText(order.company_slug)
  if (directSlug) return directSlug

  const candidateNames = [order.company_name, order.organization, order.location]
    .map(normalizeText)
    .filter(Boolean)

  if (!candidateNames.length) return ''

  const match = companies.find((company) => {
    const names = [company?.name, company?.slug]
      .map(normalizeText)
      .filter(Boolean)
    return names.some((name) => candidateNames.includes(name))
  })

  return normalizeText(match?.slug)
}

const AlertMetric = ({ icon, label, value, description, tone = 'slate' }) => {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    violet: 'border-violet-200 bg-violet-50 text-violet-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
    slate: 'border-slate-200 bg-slate-50 text-slate-950'
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-1 text-3xl font-black leading-none">{value}</p>
          <p className="mt-2 text-xs font-medium leading-5 opacity-80">{description}</p>
        </div>
        {createElement(icon, {
          className: 'h-5 w-5 shrink-0 opacity-70',
          'aria-hidden': true
        })}
      </div>
    </div>
  )
}

export default function AdminDailyAlerts({ companies = [] }) {
  const operationalDate = getTodayISOInTimeZone()
  const [orders, setOrders] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    setError('')

    const [ordersResult, auditResult] = await Promise.all([
      db.getDailyOrdersForAdmin({
        deliveryDate: operationalDate,
        statuses: ['pending', 'archived', 'post_report_extra']
      }),
      auditService.getAuditLogs({
        limit: 500,
        actions: ['order_item_discount_created', 'admin_order_cancelled'],
        force: true
      })
    ])

    const errors = [ordersResult?.error, auditResult?.error].filter(Boolean)
    if (errors.length) {
      setError('Algunas alertas no se pudieron actualizar. Podés reintentar sin salir del panel.')
    }

    setOrders(Array.isArray(ordersResult?.data) ? ordersResult.data : [])
    setAuditLogs(Array.isArray(auditResult?.data) ? auditResult.data : [])
    setLoading(false)
  }, [operationalDate])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const activeCompanies = useMemo(() => getActiveCompanies(companies), [companies])

  const todayAuditLogs = useMemo(
    () => auditLogs.filter((log) => getAuditOperationalDate(log?.created_at) === operationalDate),
    [auditLogs, operationalDate]
  )

  const lateExtras = useMemo(
    () => orders.filter((order) => normalizeText(order?.status) === 'post_report_extra').length,
    [orders]
  )

  const adminExtras = useMemo(
    () => orders.filter((order) => normalizeText(order?.order_origin) === 'admin_extra').length,
    [orders]
  )

  const discounts = useMemo(
    () => todayAuditLogs.filter((log) => log?.action === 'order_item_discount_created').length,
    [todayAuditLogs]
  )

  const cancellations = useMemo(
    () => todayAuditLogs.filter((log) => log?.action === 'admin_order_cancelled').length,
    [todayAuditLogs]
  )

  const companiesWithoutOrders = useMemo(() => {
    if (!activeCompanies.length) return []

    const orderedCompanySlugs = new Set(
      orders
        .map((order) => resolveOrderCompanySlug(order, activeCompanies))
        .filter(Boolean)
    )

    return activeCompanies.filter((company) => !orderedCompanySlugs.has(normalizeText(company.slug)))
  }, [activeCompanies, orders])

  const missingCompaniesPreview = companiesWithoutOrders
    .slice(0, 3)
    .map((company) => company.name || company.slug)
    .filter(Boolean)
    .join(', ')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 className="text-lg font-extrabold text-slate-950">Alertas operativas de hoy</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Resumen rápido del {operationalDate} para detectar movimientos que requieren revisión.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAlerts}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AlertMetric
          icon={Clock3}
          label="Extras post reporte"
          value={loading ? '—' : lateExtras}
          description="Pedidos incorporados después del reporte operativo."
          tone="amber"
        />
        <AlertMetric
          icon={PlusCircle}
          label="Extras administrativos"
          value={loading ? '—' : adminExtras}
          description="Pedidos creados desde herramientas administrativas."
          tone="blue"
        />
        <AlertMetric
          icon={Percent}
          label="Descuentos"
          value={loading ? '—' : discounts}
          description="Descuentos de ítems registrados hoy."
          tone="violet"
        />
        <AlertMetric
          icon={Ban}
          label="Bajas de pedidos"
          value={loading ? '—' : cancellations}
          description="Pedidos dados de baja por un administrador hoy."
          tone="rose"
        />
        <AlertMetric
          icon={Building2}
          label="Empresas sin pedidos"
          value={loading || !activeCompanies.length ? '—' : companiesWithoutOrders.length}
          description={
            activeCompanies.length === 0
              ? 'Se completa cuando termina de cargar el padrón de empresas.'
              : missingCompaniesPreview
                ? `${missingCompaniesPreview}${companiesWithoutOrders.length > 3 ? '…' : ''}`
                : 'Todas las empresas activas tienen pedidos registrados.'
          }
          tone="slate"
        />
      </div>
    </section>
  )
}
