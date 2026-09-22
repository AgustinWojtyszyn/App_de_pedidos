import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, ShieldCheck } from 'lucide-react'
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
      <div className="mx-auto max-w-7xl space-y-5 px-1 sm:px-2">
        <header className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-sm font-bold text-white shadow-md">
            <ShieldCheck className="h-4 w-4" />
            Elige tu empresa antes de crear el pedido
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow-xl sm:text-4xl">
            ¿Para qué empresa vas a pedir hoy?
          </h1>
          <p className="mx-auto max-w-2xl text-sm font-semibold leading-relaxed text-white/90 drop-shadow sm:text-base">
            Cada empresa puede tener preguntas y configuraciones propias. Elegí la correcta y continuá con su flujo.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orderedCompanies.map((company) => {
            const locationCount = Array.isArray(company.locations) ? company.locations.filter(Boolean).length : 0
            const locationSummary = company.requiresAuthorizedLocations
              ? `${locationCount} ubicación${locationCount === 1 ? '' : 'es'} disponible${locationCount === 1 ? '' : 's'}`
              : company.locations.join(' • ')

            return (
              <button
                key={company.slug}
                type="button"
                onClick={() => handleSelect(company.slug)}
                aria-label={`Continuar con ${company.name}`}
                className="relative group h-full min-h-[190px] overflow-hidden rounded-2xl border border-white/40 bg-white/95 p-0 text-left shadow-xl transition-all duration-200 hover:-translate-y-1 hover:border-white/70 hover:shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <div className={`absolute inset-0 bg-linear-to-br ${company.accent} opacity-[0.07] transition-opacity group-hover:opacity-[0.16]`} />
                <div className="relative z-10 flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <Building2 className="h-6 w-6 text-gray-800" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`inline-flex max-w-full rounded-full border border-white px-3 py-1.5 text-base font-black sm:text-lg ${company.badgeClass}`}>
                          <span className="truncate">{company.name}</span>
                        </p>
                        {company.slug === recommendedCompany && (
                          <span className="inline-flex shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-black text-white">
                            Última usada
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-bold text-gray-800">
                        {company.subtitle || 'Flujo dedicado'}
                      </p>
                    </div>
                  </div>

                  {(company.description || company.customHint) && (
                    <div className="space-y-1">
                      {company.description && (
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-800">
                          {company.description}
                        </p>
                      )}
                      {company.customHint && (
                        <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-600">
                          {company.customHint}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-200/80 pt-3">
                    <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-gray-600">
                      <span className="line-clamp-2">{locationSummary}</span>
                    </div>
                    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0b1f3a] px-3 py-1.5 text-sm font-black text-white shadow-sm transition-transform group-hover:translate-x-0.5">
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
