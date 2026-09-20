const normalizeText = (value = '') => (value || '').toString().trim().toLowerCase()

const getSlotIndex = (item = {}) =>
  Number.isFinite(item?.slotIndex) ? item.slotIndex : (item?.isMainMenu === true ? 0 : null)

const isMainMenuOption = (item = {}) => getSlotIndex(item) === 0

const isOptionFive = (item = {}) => getSlotIndex(item) === 5

const isOptionSix = (item = {}) => getSlotIndex(item) === 6

const isCeliacOption = (text = '') => {
  const normalized = normalizeText(text)
  if (!normalized) return false
  return normalized.includes('celiac') || normalized.includes('celiaco') || normalized.includes('celíaco')
}

const getDishText = (item = {}) => normalizeText(item?.description || item?.name)

const isHyperproteicOption = (item = {}) => {
  const text = normalizeText(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`)
  return text.includes('hiperprote')
}

const isSaladOption = (item = {}) => {
  const dishText = getDishText(item)
  return (
    dishText.includes('ensalada') ||
    isOptionFive(item) ||
    isOptionSix(item) ||
    isCeliacOption(dishText)
  )
}

const canChooseCustomSide = (item = {}) => !isMainMenuOption(item) && !isSaladOption(item) && !isHyperproteicOption(item)

export {
  isMainMenuOption,
  isSaladOption,
  isHyperproteicOption,
  canChooseCustomSide
}
