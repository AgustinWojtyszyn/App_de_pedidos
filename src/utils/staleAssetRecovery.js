const STALE_ASSET_RECOVERY_KEY = 'servifood_stale_asset_recovery_at'
const RECOVERY_COOLDOWN_MS = 15000

const toErrorText = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value.toLowerCase()
  return `${value?.name || ''} ${value?.message || ''} ${value?.stack || ''}`.toLowerCase()
}

export const isStaleAssetError = (error) => {
  const text = toErrorText(error)

  return text.includes('loading chunk') ||
    text.includes('chunkloaderror') ||
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed') ||
    text.includes('module script load') ||
    (text.includes('mime type') && text.includes('text/html'))
}

const recentlyRecovered = () => {
  try {
    const previous = Number(window.sessionStorage.getItem(STALE_ASSET_RECOVERY_KEY) || 0)
    return Number.isFinite(previous) && Date.now() - previous < RECOVERY_COOLDOWN_MS
  } catch {
    return false
  }
}

const markRecovery = () => {
  try {
    window.sessionStorage.setItem(STALE_ASSET_RECOVERY_KEY, String(Date.now()))
  } catch {
    // Session storage is optional for recovery.
  }
}

export const clearRuntimeAssetCaches = async () => {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    const keys = await window.caches.keys()
    await Promise.all(keys.map((key) => window.caches.delete(key)))
  }
}

export const recoverFromStaleAssetError = (error) => {
  if (typeof window === 'undefined' || !isStaleAssetError(error) || recentlyRecovered()) {
    return false
  }

  markRecovery()

  clearRuntimeAssetCaches()
    .catch((cacheError) => {
      console.error('[ServiFood] No se pudo limpiar la caché durante la recuperación de assets', cacheError)
    })
    .finally(() => {
      const url = new URL(window.location.href)
      url.searchParams.set('__sf_refresh', String(Date.now()))
      window.location.replace(url.toString())
    })

  return true
}
