import { supabase } from './supabase'
import { handleError, sanitizeInput } from '../utils'

class AuditService {
  async getAuditLogs(options = {}) {
    const {
      limit = 200,
      actions = null
    } = options

    try {
      let query = supabase
        .from('audit_logs')
        .select('id, action, details, actor_id, actor_email, actor_name, target_id, target_email, target_name, metadata, created_at, request_id')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (Array.isArray(actions) && actions.length) {
        query = query.in('action', actions.map((a) => sanitizeInput(a)))
      }

      const { data, error } = await query

      if (error) throw error

      const deduped = []
      const seen = new Set()
      for (const row of data || []) {
        const key = row.request_id ? `${row.request_id}-${row.action}` : `${row.id}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(row)
      }

      return { data: deduped, error: null }
    } catch (error) {
      return { data: [], error: handleError(error, 'getAuditLogs') }
    }
  }
}

export const auditService = new AuditService()
