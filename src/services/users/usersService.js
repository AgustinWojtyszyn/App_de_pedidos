import { updateUserRoleWithRpc } from './roleUpdates'

export const createUsersService = ({
  supabase,
  invalidateCache = () => {},
  logAudit = null
} = {}) => {
  if (!supabase) {
    throw new Error('createUsersService requires a supabase client')
  }

  const getAdminPeoplePage = async ({
    search = '',
    role = 'all',
    sort = 'name_asc',
    page = 1,
    pageSize = 40
  } = {}) => {
    const normalizedRole = ['all', 'admin', 'user'].includes(role) ? role : 'all'
    const normalizedSort = ['name_asc', 'name_desc', 'newest', 'oldest'].includes(sort) ? sort : 'name_asc'
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 40), 200)

    const { data, error } = await supabase.rpc('get_admin_people_page', {
      p_search: (search || '').toString().trim(),
      p_role: normalizedRole,
      p_sort: normalizedSort,
      p_page: normalizedPage,
      p_page_size: normalizedPageSize
    })

    return { data, error }
  }

  const getAdminPeopleUnified = async (_force = false) => {
    const pageSize = 200
    const firstResult = await getAdminPeoplePage({
      search: '',
      role: 'all',
      sort: 'name_asc',
      page: 1,
      pageSize
    })

    if (firstResult.error) return { data: null, error: firstResult.error }

    const firstItems = Array.isArray(firstResult.data?.items) ? firstResult.data.items : []
    const totalPages = Math.max(1, Number(firstResult.data?.total_pages) || 1)
    if (totalPages === 1) return { data: firstItems, error: null }

    const remainingResults = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => getAdminPeoplePage({
        search: '',
        role: 'all',
        sort: 'name_asc',
        page: index + 2,
        pageSize
      }))
    )

    const failedResult = remainingResults.find((result) => result?.error)
    if (failedResult?.error) return { data: null, error: failedResult.error }

    return {
      data: [
        ...firstItems,
        ...remainingResults.flatMap((result) => (
          Array.isArray(result?.data?.items) ? result.data.items : []
        ))
      ],
      error: null
    }
  }

  return {
    getUserCompanySwitchContext: async () => {
      const { data, error } = await supabase.rpc('get_user_company_switch_context')
      return { data, error }
    },

    changeActiveCompanyForToday: async ({ newCompanySlug, reason = null } = {}) => {
      invalidateCache()
      const { data, error } = await supabase.rpc('change_active_company_for_today', {
        p_new_company_slug: newCompanySlug,
        p_reason: reason
      })
      return { data, error }
    },

    getUserOrderLocations: async ({ companySlug = null } = {}) => {
      const normalizedSlug = (companySlug || '').toString().trim().toLowerCase()
      const { data, error } = await supabase.rpc('get_user_order_locations', {
        p_company_slug: normalizedSlug || null
      })
      if (error) {
        return { data: null, error }
      }
      const rows = Array.isArray(data) ? data : []
      return { data: rows, error }
    },

    getCompanyOrderLocations: async ({ companySlug = null } = {}) => {
      const normalizedSlug = (companySlug || '').toString().trim().toLowerCase()
      if (!normalizedSlug) return { data: [], error: null }
      const organizationCode = normalizedSlug.toUpperCase()
      const normalizeRows = (rows = []) => (Array.isArray(rows) ? rows : [])
        .map((row) => ({
          ...row,
          name: row.name || row.display_name,
          delivery_name: row.delivery_name || row.name || row.display_name
        }))
        .filter((row) => row.name)

      const rpcResult = await supabase.rpc('get_company_order_locations', {
        p_company_slug: normalizedSlug
      })
      if (!rpcResult.error) {
        return { data: normalizeRows(rpcResult.data), error: null }
      }

      const { data, error } = await supabase
        .from('order_locations')
        .select(`
          id,
          code,
          slug,
          display_name,
          default_delivery_location_id,
          organization:order_organizations!inner(code, active)
        `)
        .eq('active', true)
        .eq('organization.active', true)
        .eq('organization.code', organizationCode)
        .order('display_name', { ascending: true })

      if (error) return { data: null, error }

      const rows = Array.isArray(data) ? data : []
      const deliveryIds = [...new Set(rows
        .map((row) => row.default_delivery_location_id)
        .filter(Boolean))]
      let deliveryRowsById = new Map()

      if (deliveryIds.length > 0) {
        const { data: deliveryData, error: deliveryError } = await supabase
          .from('order_locations')
          .select('id, display_name, code, slug')
          .in('id', deliveryIds)

        if (deliveryError) return { data: null, error: deliveryError }
        deliveryRowsById = new Map((Array.isArray(deliveryData) ? deliveryData : []).map((row) => [row.id, row]))
      }

      return {
        data: rows
          .map((row) => {
            const deliveryRow = deliveryRowsById.get(row.default_delivery_location_id) || row
            return {
              id: row.id,
              code: row.code,
              slug: row.slug,
              name: row.display_name,
              delivery_name: deliveryRow?.display_name || row.display_name,
              delivery_code: deliveryRow?.code || row.code,
              delivery_slug: deliveryRow?.slug || row.slug
            }
          })
          .filter((row) => row.name),
        error: null
      }
    },

    // Usuarios compartidos: siempre leer desde Supabase. El parámetro force se
    // conserva por compatibilidad, pero ya no existe una respuesta local reutilizable.
    getUsers: async (_force = false) => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false })
      return { data, error }
    },

    // Toda lectura de personas pasa por la RPC con autorización server-side.
    // Se pagina internamente para mantener compatibilidad con consumidores legacy.
    getAdminPeopleUnified,
    getAdminPeoplePage,

    updateUserRole: async (userId, role) => {
      return updateUserRoleWithRpc({
        rpc: (name, args) => supabase.rpc(name, args),
        userId,
        role,
        invalidateCache: () => invalidateCache(),
        logAudit
      })
    },

    deleteUser: async (userId) => {
      if (!userId) {
        return { data: null, error: new Error('ID de usuario requerido') }
      }

      return {
        data: null,
        error: new Error('No existe un backend seguro para eliminar auth.users desde el Panel Admin. No se eliminó el usuario y todos sus pedidos históricos se conservan.')
      }
    },

    // Features/permisos del usuario: siempre frescos desde Supabase.
    getUserFeatures: async (userId = null) => {
      let query = supabase
        .from('user_features')
        .select('feature, enabled')
      if (userId) {
        query = query.eq('user_id', userId)
      }
      const { data, error } = await query
      return { data, error }
    }
  }
}
