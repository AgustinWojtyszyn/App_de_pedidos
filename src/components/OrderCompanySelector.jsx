import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, MapPin, ShieldCheck } from 'lucide-react'
import RequireUser from './RequireUser'
import { getVisibleCompanyList } from '../constants/companyConfig'
import { useAuthContext } from '../contexts/authContextValue'
import { db } from '../supabaseClient'
import { normalizeCompanyAdminConfig } from '../services/companies/companyAdminService'

const EXCLUDED_SELECTOR_COMPANY_NAMES = new Set(['prueba123', 'todas las empresas'])

const normalizeSelectorCompanyName = (value) =>
  String(value || '').trim().toLocaleLowerCase('es')

const OrderCompanySelector = ({ user, loading }) => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthContext()
  const [activeCompanySlug, setActiveCompanySlug] = useState('')
  const [managedCompanies, setManagedCompanies] = useState([])

  const lastCompanySelected = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('lastCompanySelected') || ''
  }, [])

  const lastCompanyConfirmed = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('lastCompanyConfirmed') || ''
  }, [])
  const recommendedCompany = activeCompanySlug || lastCompanySelected || lastCompanyConfirmed

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data, error } = await db.getUserCompanySwitchContext()
      if (!mounted || error) return
      const slug = (data?.current_company_slug || '').toString().trim()
      if (slug) setActiveCompanySlug(slug)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadCatalog = async () => {
      const loader = isAdmin ? db.getCompanyAdminCatalog : db.getPublicCompanyCatalog
      if (!loader) return
      const { data, error } = await loader()
      if (!mounted || error || !Array.isArray(data) || data.length === 0) return
      setManagedCompanies(data.map(normalizeCompanyAdminConfig))
    }
    loadCatalog()
    return () => {
      mounted = false
    }
  }, [isAdmin])

  const orderedCompanies = useMemo(() => {
    const source = managedCompanies.length > 0
      ? managedCompanies.map((company) => ({
        ...company,
        adminOnly: company.visibility === 'admins',
        accent: company.active ? 'from-orange-500 to-orange-700' : 'from-gray-400 to-gray-600',
        badgeClass: company.visibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
        customHint: '',
        locations: company.locations.length > 0 ? company.locations.map((location) => location.name) : [company.name],
        requiresAuthorizedLocations: Boolean(company.settings?.requiresAuthorizedLocations)
      }))
      : getVisibleCompanyList({ includeAdminOnly: isAdmin })
    return source.filter((company) =>
      company.active !== false &&
      company.slug !== 'distro_cuyo' &&
      (isAdmin || !company.adminOnly) &&
      !EXCLUDED_SELECTOR_COMPANY_NAMES.has(normalizeSelectorCompanyName(company.name))
    ).sort((a, b) => {
      if (a.slug === recommendedCompany) return -1
      if (b.slug === recommendedCompany) return 1
      return 0
    })
  }, [isAdmin, managedCompanies, recommendedCompany])

  const handleSelect = (slug) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('lastCompanySelected', slug)
      }
    } catch (_err) {
      // no-op: fallback sin persistencia
    }
    navigate(`/order/${slug}`)
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div className="mx-auto max-w-7xl px-2 pb-4 sm:px-3">
        <header className="mb-4 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold text-white/95 backdrop-blur-sm">
            <ShieldCheck className="h-4 w-4" />
            Elegí tu empresa
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-lg sm:text-4xl">
            ¿Para qué empresa vas a pedir hoy?
          </h1>
          <p className="mx-auto mt-1 max-w-2xl text-sm font-semibold text-white/85 sm:text-[15px]">
            Seleccioná una empresa para continuar con su pedido.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orderedCompanies.map((company) => {
            const locationCount = Array.isArray(company.locations) ? company.locations.filter(Boolean).length : 0
            const locationSummary = company.requiresAuthorizedLocations
              ? `${locationCount} ubicación${locationCount === 1 ? '' : 'es'} disponible${locationCount === 1 ? '' : 's'}`
              : locationCount > 1
                ? `${locationCount} ubicaciones`
                : 'Acceso directo'

            return (
              <button
                key={company.slug}
                type="button"
                onClick={() => handleSelect(company.slug)}
                aria-label={`Continuar con ${company.name}`}
                className="group relative min-h-[158px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-0 text-left shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-blue-600 via-blue-500 to-orange-400" />

                <div className="flex h-full flex-col p-4 pt-5 sm:p-5 sm:pt-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 transition-colors group-hover:bg-blue-100">
                      <Building2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-black leading-tight text-slate-950 sm:text-xl">
                            {company.name}
                          </h2>
                          <p className="mt-0.5 text-xs font-bold text-slate-500">
                            {company.subtitle || 'Pedido empresarial'}
                          </p>
                        </div>

                        {company.slug === recommendedCompany && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            Última usada
                          </span>
                        )}
                      </div>

                      {company.description && (
                        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-slate-600">
                          {company.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{locationSummary}</span>
                    </div>

                    <div className="inline-flex shrink-0 items-center gap-1 text-sm font-black text-blue-700 transition-all group-hover:gap-2">
                      Continuar
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </RequireUser>
  )
}

export default OrderCompanySelector
