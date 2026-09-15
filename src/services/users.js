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

// Permission checks are part of the login/navigation critical path. A brief
// network/PostgREST hiccup must not make an already-authorized user appear to
// lose the consumption report. Keep the last successful context per user and
// retry the canonical RPC before falling back to that context.
const ACCESS_RETRY_ATTEMPTS = 4
const ACCESS_RETRY_DELAY_MS = 450
const ACCESS_CACHE_TTL_MS = 30 * 60 * 1000
const accessContextCache = new Map()

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getAuthenticatedUserId = async () => {
  try {
    const { data } = await supabase.auth.getUser()
    return data?.user?.id || null
  } catch {
    return null
  }
}

const getCachedAccessContext = (userId) => {
  if (!userId) return null
  const cached = accessContextCache.get(userId)
  if (!cached) return null
  if (Date.now() - cached.savedAt > ACCESS_CACHE_TTL_MS) {
    accessContextCache.delete(userId)
    return null
  }
  return cached.data
}

const cacheAccessContext = (userId, data) => {
  if (!userId || !data) return
  accessContextCache.set(userId, { data, savedAt: Date.now() })
}

const getAdminAccessContext = async () => {
  const userId = await getAuthenticatedUserId()
  let lastError = null

  for (let attempt = 1; attempt <= ACCESS_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.getAdminAccessContext()
      if (!result?.error && result?.data) {
        cacheAccessContext(userId, result.data)
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

  const cached = getCachedAccessContext(userId)
  if (cached) {
    return {
      data: cached,
      error: null,
      fromCache: true,
      validationError: lastError
    }
  }

  return { data: null, error: lastError || new Error('No se pudo validar el acceso.'), fromCache: false }
}

export const usersService = {
  getUserById,
  getAdminAccessContext,
  updateUserRole: (...args) => db.updateUserRole(...args),
  deleteUser: (...args) => db.deleteUser(...args)
}

export default usersService
