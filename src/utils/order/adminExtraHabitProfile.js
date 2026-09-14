const normalize = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const resolveCompany = (order = {}, companies = []) => {
  const directSlug = normalize(order.company_slug)
  if (directSlug && companies.some((company) => normalize(company?.slug) === directSlug)) {
    return companies.find((company) => normalize(company?.slug) === directSlug)?.slug || directSlug
  }

  const candidates = [order.company_name, order.organization]
    .map(normalize)
    .filter(Boolean)

  const match = companies.find((company) => {
    const companyValues = [company?.slug, company?.name]
      .map(normalize)
      .filter(Boolean)
    return companyValues.some((value) => candidates.includes(value))
  })

  return match?.slug || ''
}

const resolveLocation = (order = {}) =>
  String(order.location || order.delivery_location || order.requesting_location_code || '').trim()

const resolveService = (order = {}) =>
  normalize(order.service) === 'dinner' ? 'dinner' : 'lunch'

const getTimestamp = (order = {}) => {
  const value = order.delivery_date || order.created_at || order.updated_at || ''
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export const buildAdminExtraHabitProfile = (orders = [], companies = []) => {
  const companyList = Array.isArray(companies) ? companies : []
  const source = (Array.isArray(orders) ? orders : [])
    .filter((order) => normalize(order?.status) !== 'cancelled')
    .filter((order) => normalize(order?.order_origin) !== 'admin_extra')
    .map((order) => ({
      order,
      companySlug: resolveCompany(order, companyList),
      location: resolveLocation(order),
      service: resolveService(order),
      timestamp: getTimestamp(order)
    }))
    .filter((entry) => entry.companySlug && entry.location)

  if (!source.length) return null

  const buckets = new Map()
  source.forEach((entry) => {
    const key = [normalize(entry.companySlug), normalize(entry.location), entry.service].join('|')
    const current = buckets.get(key) || {
      companySlug: entry.companySlug,
      location: entry.location,
      service: entry.service,
      matches: 0,
      latestTimestamp: 0
    }
    current.matches += 1
    current.latestTimestamp = Math.max(current.latestTimestamp, entry.timestamp)
    buckets.set(key, current)
  })

  const ranked = [...buckets.values()].sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches
    return b.latestTimestamp - a.latestTimestamp
  })

  const best = ranked[0]
  const company = companyList.find((item) => normalize(item?.slug) === normalize(best.companySlug))

  return {
    ...best,
    companyName: company?.name || best.companySlug,
    ordersConsidered: source.length,
    confidence: best.matches / source.length
  }
}

export const findHabitLocationOption = (preferredLocation = '', locations = []) => {
  const preferred = normalize(preferredLocation)
  if (!preferred) return ''
  return (Array.isArray(locations) ? locations : []).find((location) => normalize(location) === preferred) || ''
}
