import { useEffect, useState } from 'react'
import { Loader2, Search, Sparkles, UserRound, X } from 'lucide-react'
import { db } from '../../supabaseClient'
import { buildAdminExtraHabitProfile } from '../../utils/order/adminExtraHabitProfile'

const ADMIN_EXTRA_HISTORY_LIMIT = 24

const normalizePerson = (item = {}) => {
  const userIds = Array.isArray(item.user_ids)
    ? item.user_ids.filter(Boolean)
    : [item.primary_user_id, item.user_id, item.id].filter(Boolean)
  const emails = Array.isArray(item.emails)
    ? item.emails.filter(Boolean)
    : [item.email].filter(Boolean)

  return {
    id: item.primary_user_id || item.user_id || userIds[0] || item.id || null,
    full_name: item.full_name || item.display_name || item.name || emails[0] || 'Sin nombre',
    email: item.email || emails[0] || '',
    user_ids: [...new Set(userIds)]
  }
}

const dedupeOrders = (results = []) => {
  const byId = new Map()
  results
    .flatMap((result) => Array.isArray(result?.data) ? result.data : [])
    .forEach((order) => {
      const key = order?.id || `${order?.delivery_date || ''}-${order?.created_at || ''}-${order?.company_slug || ''}`
      if (!byId.has(key)) byId.set(key, order)
    })
  return [...byId.values()]
}

export default function AdminExtraPersonAutocomplete({
  enabled = false,
  companyOptions = [],
  onSelect
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    if (!enabled || selectedPerson) {
      setResults([])
      return undefined
    }

    const query = search.trim()
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setSearching(true)
      const { data, error } = await db.getAdminPeoplePage({
        search: query,
        role: 'all',
        sort: 'name_asc',
        page: 1,
        pageSize: 8
      })
      if (cancelled) return

      if (error) {
        setResults([])
      } else {
        const items = Array.isArray(data?.items) ? data.items : []
        setResults(items.map(normalizePerson).filter((person) => person.id))
      }
      setSearching(false)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [enabled, search, selectedPerson])

  if (!enabled) return null

  const choosePerson = async (person) => {
    setSelectedPerson(person)
    setSearch(person.full_name || person.email || '')
    setResults([])
    setProfile(null)
    setLoadingProfile(true)

    const userIds = [...new Set([...(person.user_ids || []), person.id].filter(Boolean))].slice(0, 6)
    const historyResults = await Promise.all(
      userIds.map((userId) => db.getOrders(userId, { limit: ADMIN_EXTRA_HISTORY_LIMIT }))
    )
    const habit = buildAdminExtraHabitProfile(dedupeOrders(historyResults), companyOptions)

    setProfile(habit)
    setLoadingProfile(false)
    onSelect?.({ person, profile: habit })
  }

  const clearPerson = () => {
    setSelectedPerson(null)
    setProfile(null)
    setSearch('')
    setResults([])
    onSelect?.({ person: null, profile: null })
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-blue-600 p-2 text-white">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">Persona del pedido <span className="font-semibold text-slate-500">(opcional)</span></p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">
            Buscá a alguien que ya pidió antes y completamos empresa, sede y turno habituales. El menú no se copia.
          </p>
        </div>
      </div>

      {!selectedPerson ? (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre o correo"
            autoComplete="off"
            className="w-full rounded-lg border border-blue-200 bg-white py-2.5 pl-9 pr-10 text-sm font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600" aria-hidden="true" />}

          {results.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
              {results.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => choosePerson(person)}
                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="block text-sm font-bold text-slate-900">{person.full_name}</span>
                  {person.email && <span className="block text-xs font-semibold text-slate-500">{person.email}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">{selectedPerson.full_name}</p>
              {selectedPerson.email && <p className="text-xs font-semibold text-slate-500">{selectedPerson.email}</p>}
            </div>
            <button
              type="button"
              onClick={clearPerson}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Quitar persona"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loadingProfile && (
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando configuración habitual…
            </p>
          )}

          {!loadingProfile && profile && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Sugerencia habitual: <strong>{profile.companyName}</strong> · <strong>{profile.location}</strong> · <strong>{profile.service === 'dinner' ? 'Cena' : 'Almuerzo'}</strong>. Basado en {profile.matches} de {profile.ordersConsidered} pedidos anteriores.
              </span>
            </div>
          )}

          {!loadingProfile && !profile && (
            <p className="mt-2 text-xs font-semibold text-slate-500">No encontramos suficiente historial; podés completar los datos manualmente.</p>
          )}
        </div>
      )}
    </section>
  )
}
