import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, ShieldCheck } from 'lucide-react'
import RequireUser from './RequireUser'
import OrderPrivacyConsentGate from './order-form/OrderPrivacyConsentGate'
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
      <OrderPrivacyConsentGate userId={user?.id}>
        <div className="mx-auto max-w-5xl space-y-5 px-2 pb-5 sm:px-3">
          <header className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-bold text-white shadow-md">
              <ShieldCheck className="h-4 w-4" />
              Elegí tu empresa
            </div>
            <h1 className="text-3xl font-black text-white drop-shadow-xl sm:text-4xl">
              ¿Para qué empresa vas a pedir hoy?
            </h1>
            <p className="mx-auto mt-1 max-w-2xl text-sm font-semibold text-white/90 sm:text-base">
              Seleccioná una empresa para continuar con su pedido.
            </p>
          </header>
  
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
                  className="relative group min-h-[210px] overflow-hidden rounded-3xl border-2 border-white/30 bg-white/95 p-2 text-left shadow-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60 sm:p-3"
                >
                  <div className={`absolute inset-0 bg-linear-to-br ${company.accent} opacity-10 transition-opacity group-hover:opacity-20`} />
  
                  <div className="relative z-10 flex h-full flex-col gap-4 p-5 sm:p-6">
                    <div className="flex items-center gap-4">
                      <div className="rounded-2xl border-2 border-gray-100 bg-white p-4 shadow-inner">
                        <Building2 className="h-8 w-8 text-gray-800" />
                      </div>
  
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`inline-flex max-w-full rounded-full border border-white px-4 py-2 text-lg font-black ${company.badgeClass}`}>
                            <span className="truncate">{company.name}</span>
                          </p>
                          {company.slug === recommendedCompany && (
                            <span className="inline-flex shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                              Última usada
                            </span>
                          )}
                        </div>
  
                        <p className="mt-1 text-base font-semibold text-gray-800">
                          {company.subtitle || 'Flujo dedicado'}
                        </p>
                      </div>
                    </div>
  
                    {company.description && (
                      <p className="line-clamp-2 text-base font-semibold leading-snug text-gray-800">
                        {company.description}
                      </p>
                    )}
  
                    <div className="mt-auto flex items-center justify-between gap-4 border-t border-slate-200/80 pt-3">
                      <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-gray-600">
                        <span className="line-clamp-2">{locationSummary}</span>
                      </div>
  
                      <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#0b1f3a] px-3.5 py-2 text-sm font-black text-white shadow-sm">
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
      </OrderPrivacyConsentGate>
    </RequireUser>
  )
}

export default OrderCompanySelector
