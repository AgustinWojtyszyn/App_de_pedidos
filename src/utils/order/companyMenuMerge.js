import { getMenuSlotIndex } from './menuDisplay'

const normalizeCompanySlug = (value = '') => (value || '').toString().trim().toLowerCase()

const normalizeText = (value = '') => (value || '').toString().trim()

const isEmptySlotOverride = (item = {}) => {
  const name = normalizeText(item?.name)
  const description = normalizeText(item?.description)
  if (description) return false
  return /^opci[oó]n\s*\d+$/i.test(name) || /^men[uú]\s+principal$/i.test(name)
}

const getMenuMergeKey = (item = {}) => {
  const slotIndex = getMenuSlotIndex(item)
  if (Number.isFinite(slotIndex)) return `slot:${slotIndex}`
  const name = (item?.name || '').toString().trim().toLowerCase()
  return name ? `name:${name}` : null
}

const mergeCompanyMenuItems = (globalItems = [], companyItems = []) => {
  const merged = []
  const indexByKey = new Map()

  ;(globalItems || []).forEach((item) => {
    const key = getMenuMergeKey(item)
    if (key) indexByKey.set(key, merged.length)
    merged.push(item)
  })

  ;(companyItems || []).forEach((item) => {
    const key = getMenuMergeKey(item)
    if (key && indexByKey.has(key)) {
      if (!isEmptySlotOverride(item)) {
        merged[indexByKey.get(key)] = item
      }
      return
    }
    if (isEmptySlotOverride(item)) return
    if (key) indexByKey.set(key, merged.length)
    merged.push(item)
  })

  return merged
}

export {
  getMenuMergeKey,
  isEmptySlotOverride,
  mergeCompanyMenuItems,
  normalizeCompanySlug
}
