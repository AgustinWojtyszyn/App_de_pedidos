import { supabase } from './supabase'

const MAX_REPORT_ATTEMPTS = 4
const RETRY_DELAY_MS = 500
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransient = (error) => {
  if (!error) return false
  const status = Number(error.status || error.code)
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ').toLowerCase()
  return ['failed to fetch', 'network', 'timeout', 'timed out', 'connection', 'gateway'].some((part) => text.includes(part))
}

export const getCompanyConsumptionOrders = async ({ startDate, endDate }) => {
  let lastError = null
  let genericReturnedEmpty = false

  for (let attempt = 1; attempt <= MAX_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc('get_company_consumption_report', {
        p_month_start: startDate,
        p_month_end: endDate
      })
      if (!error) {
        const rows = Array.isArray(data) ? data : []
        if (rows.length > 0) return { data: rows, error: null }
        genericReturnedEmpty = true
        lastError = null
        break
      }
      lastError = error
      if (!isTransient(error)) break
    } catch (error) {
      lastError = error
      if (!isTransient(error)) break
    }
    if (attempt < MAX_REPORT_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt)
  }

  let legacyError = null
  for (let attempt = 1; attempt <= MAX_REPORT_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc('get_igarreta_isemar_consumption_report', {
        p_month_start: startDate,
        p_month_end: endDate
      })
      if (!error) return { data: Array.isArray(data) ? data : [], error: null }
      legacyError = error
      if (!isTransient(error)) break
    } catch (error) {
      legacyError = error
      if (!isTransient(error)) break
    }
    if (attempt < MAX_REPORT_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt)
  }

  if (genericReturnedEmpty) return { data: [], error: null }
  return { data: [], error: lastError || legacyError || new Error('No se pudo cargar el reporte de consumo.') }
}

export const getIgarretaIsemarConsumptionOrders = getCompanyConsumptionOrders
