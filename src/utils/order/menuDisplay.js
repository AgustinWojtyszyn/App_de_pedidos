const normalizeText = (value = '') => (value || '').toString().trim()
const normalizeSlotTitle = (value = '') => normalizeText(value).toLowerCase()
const HIDDEN_ORDER_MENU_SLOT_INDEX = 5
const HIDDEN_ORDER_MENU_COMPANY_SLUG = 'epse'
const IGARRETA_COMPANY_SLUG = 'igarreta'
const ISEMAR_COMPANY_SLUG = 'isemar'
const IGARRETA_ISEMAR_BIFE_DAY_SOURCE_SLOT_INDEX = 5
const IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX = 6
const IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX = 5
const IGARRETA_ISEMAR_CELIAC_DISH = 'Celíaco'
const IGARRETA_ISEMAR_SALAD_DISH = 'Ensalada del día'
const FIXED_BIFE_POLLO_SLOT_INDEX = 5
const FIXED_BIFE_POLLO_DISH = 'Bife de pollo'
const FIXED_BIFE_POLLO_COMPANY_SLUGS = new Set(['ccp', 'laja', 'padrebueno', 'losberros', 'genneia', 'greif', 'administracion_servifood'])
const DIETA_COMPANY_SLUGS = new Set(['placo', 'molinos'])
const SYNTHETIC_FALLBACK_MENU = new Map([
  [1, 'Delicioso plato principal'],
  [2, 'Otro plato delicioso'],
  [3, 'Plato especial del día'],
  [4, 'Plato vegetariano'],
  [5, 'Plato de la casa'],
  [6, 'Plato recomendado']
])

const getMenuLabelByIndex = (index = 0) => (index === 0 ? 'Menú principal' : `Opción ${index}`)

const getSlotIndexFromTitle = (title = '') => {
  const normalized = normalizeSlotTitle(title)
  if (!normalized) return null
  if (
    normalized.includes('menú principal') ||
    normalized.includes('menu principal') ||
    normalized.includes('plato principal')
  ) {
    return 0
  }
  const optionMatch = normalized.match(/opci[oó]n\s*0?([1-7])\b/)
  if (optionMatch) return Number(optionMatch[1])
  return null
}

const isSyntheticFallbackMenuItem = (item = {}) => {
  const id = Number(item?.id)
  if (!Number.isInteger(id) || !SYNTHETIC_FALLBACK_MENU.has(id)) return false
  return normalizeSlotTitle(item?.name) === `plato principal ${id}` &&
    normalizeSlotTitle(item?.description) === normalizeSlotTitle(SYNTHETIC_FALLBACK_MENU.get(id))
}

const hasSyntheticFallbackMenuSelection = (items = []) =>
  (items || []).some(isSyntheticFallbackMenuItem)

const getMenuDish = (item = {}, labelUsesTitle = false) => {
  const description = normalizeText(item.description)
  if (description) return description
  if (labelUsesTitle) return ''
  return normalizeText(item.name)
}

const getMenuDisplay = (item = {}, index = 0, companySlug = '') => {
  const title = normalizeText(item?.displayName || item?.name)
  const inferredSlot = getSlotIndexFromTitle(title)
  const slotIndex = Number.isFinite(item?.slotIndex)
    ? item.slotIndex
    : (Number.isFinite(inferredSlot) ? inferredSlot : index)
  const label = title || getMenuLabelByIndex(slotIndex)
  const dish = getMenuDish(item, Boolean(title))
  return getCompanyMenuDisplay({
    label,
    dish,
    slotIndex,
    isMainMenu: slotIndex === 0
  }, companySlug)
}

const withMenuSlotIndex = (items = []) => {
  return (items || []).map((item, index) => ({
    ...item,
    slotIndex: Number.isFinite(item?.slotIndex)
      ? item.slotIndex
      : (Number.isFinite(getSlotIndexFromTitle(item?.name)) ? getSlotIndexFromTitle(item?.name) : index)
  }))
}

const isMainMenuSlot = (item = {}) => (Number.isFinite(item?.slotIndex) ? item.slotIndex === 0 : item?.isMainMenu === true)

const isWeekdayDeliveryDate = (deliveryDate = '') => {
  const value = normalizeText(deliveryDate)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return true
  const day = date.getUTCDay()
  return day >= 1 && day <= 5
}

const HYPERPROTEIC_OPTION_STORAGE_NAME = 'Hiperproteica'
const HYPERPROTEIC_OPTION_SLOT_INDEX = 4
const HYPERPROTEIC_OPTION_ID = 'hyperproteic-option-4'

const isHyperproteicMenuItem = (item = {}) => {
  if (item?.isHyperproteicOption === true || item?.isSyntheticHyperproteicOption === true) return true
  const name = normalizeSlotTitle(item?.name)
  const displayName = normalizeSlotTitle(item?.displayName)
  const description = normalizeSlotTitle(item?.description)
  return name === 'hiperproteica' ||
    name === 'opción 4 - hiperproteica' ||
    name === 'opcion 4 - hiperproteica' ||
    displayName === 'opción 4 - hiperproteica' ||
    displayName === 'opcion 4 - hiperproteica' ||
    description === 'hiperproteica' ||
    description.startsWith('hiperproteica ·') ||
    description.startsWith('hiperproteica -')
}

const withoutHyperproteicOption4 = (items = []) => {
  const indexedItems = withMenuSlotIndex(items)
  const hadStoredHyperproteic = indexedItems.some(isHyperproteicMenuItem)
  const hasLegacyOption4 = indexedItems.some((item, index) =>
    !isHyperproteicMenuItem(item) &&
    getMenuSlotIndex(item, index) === HYPERPROTEIC_OPTION_SLOT_INDEX
  )
  const shouldRestoreShiftedTail = hadStoredHyperproteic && !hasLegacyOption4

  return indexedItems
    .filter((item) => !isHyperproteicMenuItem(item))
    .map((item, index) => {
      const slotIndex = getMenuSlotIndex(item, index)
      if (!shouldRestoreShiftedTail || !Number.isFinite(slotIndex) || slotIndex <= HYPERPROTEIC_OPTION_SLOT_INDEX) {
        return item
      }
      return setMenuItemSlot(item, slotIndex - 1)
    })
}

const withHyperproteicOption4 = (items = []) => {
  const indexedItems = withMenuSlotIndex(items)
  let hasHyperproteicOption = false
  const hasShiftedSalad = indexedItems.some((item, index) =>
    getMenuSlotIndex(item, index) === 6 &&
    /ensalada/i.test(normalizeText(`${item?.name || ''} ${item?.description || ''}`))
  )
  const hasShiftedCeliac = indexedItems.some((item, index) =>
    getMenuSlotIndex(item, index) === 7 &&
    /cel[ií]aco/i.test(normalizeText(`${item?.name || ''} ${item?.description || ''}`))
  )
  const hasAlreadyShiftedTail = hasShiftedSalad && hasShiftedCeliac

  const shiftedItems = indexedItems.map((item, index) => {
    if (isHyperproteicMenuItem(item)) {
      hasHyperproteicOption = true
      const rawDescription = normalizeText(item?.hyperproteicDescription ?? item?.description)
      const editableDescription = rawDescription
        .replace(/^hiperproteica\s*[·:-]\s*/i, '')
        .replace(/^hiperproteica$/i, '')
        .trim()
      return {
        ...item,
        id: item?.id || HYPERPROTEIC_OPTION_ID,
        name: 'Opción 4 - Hiperproteica',
        displayName: getMenuLabelByIndex(HYPERPROTEIC_OPTION_SLOT_INDEX),
        description: editableDescription
          ? `Hiperproteica · ${editableDescription}`
          : HYPERPROTEIC_OPTION_STORAGE_NAME,
        hyperproteicDescription: editableDescription,
        isHyperproteicOption: true,
        slotIndex: HYPERPROTEIC_OPTION_SLOT_INDEX
      }
    }

    const slotIndex = getMenuSlotIndex(item, index)
    if (!Number.isFinite(slotIndex) || slotIndex < HYPERPROTEIC_OPTION_SLOT_INDEX || slotIndex >= 7) return item
    if (hasAlreadyShiftedTail && slotIndex >= 5) return item

    const displaySlotIndex = slotIndex + 1
    const rawName = normalizeText(item?.name)
    const shiftedName = rawName
      ? rawName.replace(/opci[oó]n\s*0?[4-6]\b/i, getMenuLabelByIndex(displaySlotIndex))
      : getMenuLabelByIndex(displaySlotIndex)

    return {
      ...item,
      name: shiftedName,
      displayName: getMenuLabelByIndex(displaySlotIndex),
      slotIndex: displaySlotIndex
    }
  })

  if (!hasHyperproteicOption) {
    shiftedItems.push({
      id: HYPERPROTEIC_OPTION_ID,
      name: 'Opción 4 - Hiperproteica',
      displayName: getMenuLabelByIndex(HYPERPROTEIC_OPTION_SLOT_INDEX),
      description: HYPERPROTEIC_OPTION_STORAGE_NAME,
      hyperproteicDescription: '',
      isHyperproteicOption: true,
      slotIndex: HYPERPROTEIC_OPTION_SLOT_INDEX,
      isSyntheticHyperproteicOption: true
    })
  }

  return shiftedItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aSlot = getMenuSlotIndex(a.item, a.index)
      const bSlot = getMenuSlotIndex(b.item, b.index)
      if (Number.isFinite(aSlot) && Number.isFinite(bSlot) && aSlot !== bSlot) return aSlot - bSlot
      return a.index - b.index
    })
    .map(({ item }) => item)
}

const getMenuSlotIndex = (item = {}, fallbackIndex = null) => {
  if (Number.isFinite(item?.slotIndex)) return item.slotIndex
  const inferred = getSlotIndexFromTitle(item?.name)
  if (Number.isFinite(inferred)) return inferred
  return Number.isFinite(fallbackIndex) ? fallbackIndex : null
}

const normalizeCompanySlug = (value = '') => {
  const raw = typeof value === 'object' && value !== null ? value.slug : value
  return (raw || '').toString().trim().toLowerCase()
}
const isIgarretaIsemarCompany = (companySlug = '') => {
  const slug = normalizeCompanySlug(companySlug)
  return slug === IGARRETA_COMPANY_SLUG || slug === ISEMAR_COMPANY_SLUG
}

const getConfiguredMenuItems = (companyOrSlug) =>
  (typeof companyOrSlug === 'object' && companyOrSlug !== null && Array.isArray(companyOrSlug.menuItems))
    ? companyOrSlug.menuItems
    : []

const getMenuItemKey = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  const text = normalizeSlotTitle(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`)
  if (slotIndex === 0) return 'menu_principal'
  if (/bife[^a-záéíóúñ]*.*lomo|lomo[^a-záéíóúñ]*.*bife/i.test(text)) return 'bife_lomo'
  if (/bife[^a-záéíóúñ]*.*pollo|pollo[^a-záéíóúñ]*.*bife/i.test(text)) return 'bife_pollo'
  if (/\bbife\b/i.test(text)) return 'bife_dia'
  if (text.includes('dieta')) return 'dieta'
  if (text.includes('celiac')) return 'celiacos'
  if (text.includes('guarnicion') || text.includes('guarnición')) return 'guarniciones'
  if (slotIndex >= 1 && slotIndex <= 7) return `opcion_${slotIndex}`
  return 'otros_menus'
}

const isMenuItemEnabledForCompany = (item = {}, companyOrSlug = '', fallbackIndex = null) => {
  const configuredItems = getConfiguredMenuItems(companyOrSlug)
  if (configuredItems.length === 0) return true

  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  const normalizedCompanySlug = normalizeCompanySlug(companyOrSlug)
  const fixedBifePolloSetting = FIXED_BIFE_POLLO_COMPANY_SLUGS.has(normalizedCompanySlug) &&
    slotIndex === FIXED_BIFE_POLLO_SLOT_INDEX
    ? configuredItems.find((entry) => entry?.key === 'bife_pollo' || entry?.menuItemKey === 'bife_pollo')
    : null

  if (fixedBifePolloSetting) return fixedBifePolloSetting.enabled !== false

  const key = getMenuItemKey(item, fallbackIndex)
  const configured = configuredItems.find((entry) => entry?.key === key || entry?.menuItemKey === key)
  return configured?.enabled !== false
}

const replaceDietaLabel = (value, companySlug) => {
  const text = normalizeText(value)
  if (!DIETA_COMPANY_SLUGS.has(normalizeCompanySlug(companySlug)) || !/bife\s+del\s+d[ií]a/i.test(text)) return value
  return 'Dieta'
}

const getCompanyMenuDisplay = (display, companySlug) => {
  const normalizedCompanySlug = normalizeCompanySlug(companySlug)
  if (FIXED_BIFE_POLLO_COMPANY_SLUGS.has(normalizedCompanySlug) && display?.slotIndex === FIXED_BIFE_POLLO_SLOT_INDEX) {
    return {
      ...display,
      label: getMenuLabelByIndex(FIXED_BIFE_POLLO_SLOT_INDEX),
      dish: FIXED_BIFE_POLLO_DISH
    }
  }
  if (isIgarretaIsemarCompany(companySlug) && display?.slotIndex === IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX) {
    const isBife = /bife\s+del\s+d[ií]a/i.test(normalizeText(display.dish))
    return {
      ...display,
      label: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX),
      dish: isBife ? IGARRETA_ISEMAR_SALAD_DISH : display.dish
    }
  }
  if (isIgarretaIsemarCompany(companySlug) && display?.slotIndex === IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX) {
    return {
      ...display,
      label: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
      dish: IGARRETA_ISEMAR_CELIAC_DISH
    }
  }
  if (!DIETA_COMPANY_SLUGS.has(normalizedCompanySlug)) return display
  return {
    ...display,
    label: replaceDietaLabel(display.label, companySlug),
    dish: replaceDietaLabel(display.dish, companySlug)
  }
}

const isHiddenOrderMenuSlot = (item = {}, companySlug = '') => {
  if (normalizeCompanySlug(companySlug) !== HIDDEN_ORDER_MENU_COMPANY_SLUG) return false
  const slotIndex = getMenuSlotIndex(item)
  return Number.isFinite(slotIndex) && slotIndex > 7
}

const isEmptyNumberedMenuItem = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  if (!Number.isFinite(slotIndex) || slotIndex <= HYPERPROTEIC_OPTION_SLOT_INDEX) return false
  const name = normalizeText(item?.name)
  const description = normalizeText(item?.description)
  return description === '' && /^opci[oó]n\s*0?\d+\s*$/i.test(name)
}

const setMenuItemSlot = (item = {}, slotIndex) => {
  const rawName = normalizeText(item?.name)
  return {
    ...item,
    name: rawName
      ? rawName.replace(/opci[oó]n\s*0?\d+\b/i, getMenuLabelByIndex(slotIndex))
      : getMenuLabelByIndex(slotIndex),
    displayName: getMenuLabelByIndex(slotIndex),
    slotIndex
  }
}

const isBifeMenuItem = (item = {}) =>
  /\bbife\b/i.test(normalizeText(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`))

const isEpseBifeTypeOption = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  return !isHyperproteicMenuItem(item) &&
    Number.isFinite(slotIndex) &&
    slotIndex >= HYPERPROTEIC_OPTION_SLOT_INDEX &&
    isBifeMenuItem(item)
}

const normalizeEpseMenuItems = (items = [], { includeHyperproteic = true } = {}) => {
  const lastHeadSlot = includeHyperproteic
    ? HYPERPROTEIC_OPTION_SLOT_INDEX
    : HYPERPROTEIC_OPTION_SLOT_INDEX - 1
  const nonEmptyItems = items
    .filter((item, index) => !isEmptyNumberedMenuItem(item, index))
    .filter((item, index) => !isEpseBifeTypeOption(item, index))
  const head = nonEmptyItems.filter((item, index) => getMenuSlotIndex(item, index) <= lastHeadSlot)
  const tail = nonEmptyItems.filter((item, index) => getMenuSlotIndex(item, index) > lastHeadSlot)

  const celiac = tail.find((item) =>
    /cel[ií]aco/i.test(normalizeText(`${item?.name || ''} ${item?.description || ''}`))
  )
  const salad = tail.find((item) =>
    /ensalada/i.test(normalizeText(`${item?.name || ''} ${item?.description || ''}`))
  )
  const regularTail = tail.filter((item) => item !== salad && item !== celiac)

  const normalizedTail = [
    ...regularTail,
    ...(salad ? [salad] : []),
    ...(celiac ? [celiac] : [])
  ]
    .slice(0, 3)
    .map((item, index) => setMenuItemSlot(item, lastHeadSlot + 1 + index))

  return [...head, ...normalizedTail]
}

const isHiddenIgarretaMenuSlot = (item = {}, fallbackIndex = null) =>
  getMenuSlotIndex(item, fallbackIndex) > IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX

const isIgarretaIsemarBifeDayMenuItem = (item = {}, fallbackIndex = null) =>
  getMenuSlotIndex(item, fallbackIndex) === IGARRETA_ISEMAR_BIFE_DAY_SOURCE_SLOT_INDEX

const isIgarretaIsemarCeliacMenuItem = (item = {}) =>
  /cel[ií]aco/i.test(normalizeText(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`))

const isIgarretaIsemarSaladMenuItem = (item = {}) =>
  /ensalada/i.test(normalizeText(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`))

const isBifePolloMenuItem = (item = {}) =>
  /bife\s+de\s+pollo/i.test(normalizeText(`${item?.name || ''} ${item?.displayName || ''} ${item?.description || ''}`))

const isDuplicateFixedBifePollo = (item = {}, companySlug = '', fallbackIndex = null) =>
  FIXED_BIFE_POLLO_COMPANY_SLUGS.has(normalizeCompanySlug(companySlug)) &&
  getMenuSlotIndex(item, fallbackIndex) !== FIXED_BIFE_POLLO_SLOT_INDEX &&
  isBifePolloMenuItem(item)

const dedupeCompanyMenuSlots = (items = [], companySlug = '') => {
  const normalizedCompanySlug = normalizeCompanySlug(companySlug)
  const seenSlots = new Set()
  const ordered = []

  ;(items || []).forEach((item, index) => {
    const slotIndex = getMenuSlotIndex(item, index)
    if (!Number.isFinite(slotIndex)) {
      ordered.push(item)
      return
    }

    if (seenSlots.has(slotIndex)) return
    seenSlots.add(slotIndex)
    ordered.push(item)
  })

  if (!FIXED_BIFE_POLLO_COMPANY_SLUGS.has(normalizedCompanySlug)) return ordered

  return ordered.map((item, index) => {
    const slotIndex = getMenuSlotIndex(item, index)
    if (slotIndex !== FIXED_BIFE_POLLO_SLOT_INDEX) return item
    return {
      ...item,
      name: getMenuLabelByIndex(FIXED_BIFE_POLLO_SLOT_INDEX),
      displayName: getMenuLabelByIndex(FIXED_BIFE_POLLO_SLOT_INDEX),
      description: FIXED_BIFE_POLLO_DISH,
      slotIndex: FIXED_BIFE_POLLO_SLOT_INDEX
    }
  })
}

const withIgarretaIsemarMenuItem = (item = {}, fallbackIndex = null) => {
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)
  if (slotIndex !== IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX) return item
  return {
    ...item,
    name: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    displayName: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    description: IGARRETA_ISEMAR_CELIAC_DISH,
    slotIndex
  }
}

const withIgarretaIsemarMenuItems = (items = [], { includeHyperproteic = true } = {}) => {
  const indexedItems = withMenuSlotIndex(items)
  const mainMenu = indexedItems.find((item, index) => getMenuSlotIndex(item, index) === 0)
  const saladSource = indexedItems.find(isIgarretaIsemarSaladMenuItem) ||
    indexedItems.find((item, index) => getMenuSlotIndex(item, index) === IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX)
  const celiacSource = indexedItems.find(isIgarretaIsemarCeliacMenuItem)
  const hyperproteicSource = indexedItems.find(isHyperproteicMenuItem)
  const allowedOptions = indexedItems
    .filter((item, index) => {
      const slotIndex = getMenuSlotIndex(item, index)
      return slotIndex !== 0 &&
        item !== saladSource &&
        item !== celiacSource &&
        item !== hyperproteicSource &&
        !isIgarretaIsemarBifeDayMenuItem(item, index) &&
        !isIgarretaIsemarCeliacMenuItem(item)
    })
    .slice(0, 3)
    .map((item, index) => ({
      ...item,
      name: getMenuLabelByIndex(index + 1),
      displayName: getMenuLabelByIndex(index + 1),
      slotIndex: index + 1
    }))

  const hyperproteic = {
    ...(hyperproteicSource || {}),
    id: hyperproteicSource?.id || HYPERPROTEIC_OPTION_ID,
    name: getMenuLabelByIndex(HYPERPROTEIC_OPTION_SLOT_INDEX),
    displayName: getMenuLabelByIndex(HYPERPROTEIC_OPTION_SLOT_INDEX),
    description: hyperproteicSource?.description || HYPERPROTEIC_OPTION_STORAGE_NAME,
    slotIndex: HYPERPROTEIC_OPTION_SLOT_INDEX
  }
  const salad = {
    ...(saladSource || {}),
    id: saladSource?.id || 'igarreta-isemar-salad',
    name: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX),
    displayName: getMenuLabelByIndex(IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX),
    description: saladSource?.description || IGARRETA_ISEMAR_SALAD_DISH,
    slotIndex: IGARRETA_ISEMAR_SALAD_MENU_SLOT_INDEX
  }
  const celiac = {
    ...(celiacSource || {}),
    id: celiacSource?.id || `${saladSource?.id || 'igarreta-isemar'}-celiaco`,
    name: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    displayName: getMenuLabelByIndex(IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX),
    description: IGARRETA_ISEMAR_CELIAC_DISH,
    slotIndex: IGARRETA_ISEMAR_LAST_MENU_SLOT_INDEX
  }

  if (!includeHyperproteic) {
    return [
      ...(mainMenu ? [{ ...mainMenu, slotIndex: 0 }] : []),
      ...allowedOptions,
      setMenuItemSlot(salad, HYPERPROTEIC_OPTION_SLOT_INDEX),
      setMenuItemSlot(celiac, HYPERPROTEIC_OPTION_SLOT_INDEX + 1)
    ]
  }

  return [
    ...(mainMenu ? [{ ...mainMenu, slotIndex: 0 }] : []),
    ...allowedOptions,
    hyperproteic,
    salad,
    celiac
  ]
}

const withCompanyMenuDisplay = (item = {}, companySlug = '', fallbackIndex = null) => {
  const normalizedCompanySlug = normalizeCompanySlug(companySlug)
  const slotIndex = getMenuSlotIndex(item, fallbackIndex)

  if (FIXED_BIFE_POLLO_COMPANY_SLUGS.has(normalizedCompanySlug) && slotIndex === FIXED_BIFE_POLLO_SLOT_INDEX) {
    return {
      ...item,
      name: getMenuLabelByIndex(FIXED_BIFE_POLLO_SLOT_INDEX),
      displayName: getMenuLabelByIndex(FIXED_BIFE_POLLO_SLOT_INDEX),
      description: FIXED_BIFE_POLLO_DISH,
      slotIndex: FIXED_BIFE_POLLO_SLOT_INDEX
    }
  }
  if (isIgarretaIsemarCompany(companySlug)) return withIgarretaIsemarMenuItem(item, fallbackIndex)
  return item
}

const filterOrderableMenuItems = (items = [], companySlug = '', deliveryDate = '') => {
  const safeItems = (items || []).filter((item) => !isSyntheticFallbackMenuItem(item))
  if (safeItems.length === 0) return []

  const includeHyperproteic = isWeekdayDeliveryDate(deliveryDate)
  const menuWithHyperproteicOption = includeHyperproteic
    ? withHyperproteicOption4(safeItems)
    : withoutHyperproteicOption4(safeItems)
  const companyMenuItems = isIgarretaIsemarCompany(companySlug)
    ? withIgarretaIsemarMenuItems(menuWithHyperproteicOption, { includeHyperproteic })
    : normalizeCompanySlug(companySlug) === HIDDEN_ORDER_MENU_COMPANY_SLUG
      ? normalizeEpseMenuItems(menuWithHyperproteicOption, { includeHyperproteic })
      : menuWithHyperproteicOption

  const filteredCompanyMenuItems = companyMenuItems
    .filter((item, index) => {
      if (isDuplicateFixedBifePollo(item, companySlug, index)) return false
      if (isIgarretaIsemarCompany(companySlug)) return !isHiddenIgarretaMenuSlot(item, index) && isMenuItemEnabledForCompany(item, companySlug, index)
      return !isHiddenOrderMenuSlot(item, companySlug) && isMenuItemEnabledForCompany(item, companySlug, index)
    })

  return dedupeCompanyMenuSlots(filteredCompanyMenuItems, companySlug)
    .map((item, index) => withCompanyMenuDisplay(item, companySlug, index))
}

const hasHiddenOrderMenuSelection = (items = [], companySlug = '') =>
  (items || []).some((item) => isHiddenOrderMenuSlot(item, companySlug))

export {
  HIDDEN_ORDER_MENU_SLOT_INDEX,
  getMenuLabelByIndex,
  getMenuDish,
  getMenuDisplay,
  getMenuSlotIndex,
  getSlotIndexFromTitle,
  filterOrderableMenuItems,
  hasHiddenOrderMenuSelection,
  hasSyntheticFallbackMenuSelection,
  isSyntheticFallbackMenuItem,
  isHiddenOrderMenuSlot,
  isHyperproteicMenuItem,
  isWeekdayDeliveryDate,
  dedupeCompanyMenuSlots,
  withHyperproteicOption4,
  withMenuSlotIndex,
  isMainMenuSlot
}
