import { db, supabase } from '../supabaseClient'

// Compatibility facade for legacy imports.
// Business operations live in createUsersService and are exposed through db.
const getUserById = async (userId) => {
  if (!userId) {
    return { data: null, error: new Error('ID de usuario requerido') }
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, created_at, email_confirmed_at')
    .eq('id', userId)
    .maybeSingle()

  if (error?.code === 'PGRST116' || error?.status === 406) {
    return { data: null, error: null }
  }

  return { data: data || null, error: error || null }
}

// Permission checks are part of the login/navigation critical path.
// Always validate against the canonical RPC so concurrent admins cannot diverge
// because one browser kept an older permission snapshot. Retries only smooth
// transient network/PostgREST failures; stale local/session fallbacks are not used.
const ACCESS_RETRY_ATTEMPTS = 4
const ACCESS_RETRY_DELAY_MS = 450

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getAdminAccessContext = async () => {
  let lastError = null

  for (let attempt = 1; attempt <= ACCESS_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.getAdminAccessContext()
      if (!result?.error && result?.data) {
        return { ...result, fromCache: false }
      }
      lastError = result?.error || new Error('No se pudo validar el acceso.')
    } catch (error) {
      lastError = error
    }

    if (attempt < ACCESS_RETRY_ATTEMPTS) {
      await wait(ACCESS_RETRY_DELAY_MS * attempt)
    }
  }

  return {
    data: null,
    error: lastError || new Error('No se pudo validar el acceso.'),
    fromCache: false
  }
}

export const usersService = {
  getUserById,
  getAdminAccessContext,
  updateUserRole: (...args) => db.updateUserRole(...args),
  deleteUser: (...args) => db.deleteUser(...args)
}

export default usersService
