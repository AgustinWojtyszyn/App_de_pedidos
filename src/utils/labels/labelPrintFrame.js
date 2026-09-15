const PRINT_MOUNT_ID = 'label-print-mount'
const PRINT_BODY_CLASS = 'is-printing-labels'
const PRINT_MOUNT_FALLBACK_CLEANUP_MS = 120000

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

const getCssVariable = (style, name, fallback) => {
  const value = String(style?.getPropertyValue?.(name) || '').trim()
  return value || fallback
}

const waitForNextPaint = () => new Promise((resolve) => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve)
  })
})

const getLabelTexts = (surface) => Array.from(
  surface.querySelectorAll('.sf-label-card')
).map(card => normalizeText(card.textContent))

const validateSurface = (
  surface,
  expectedLabelCount,
  {
    expectedTexts = null,
    source = 'source'
  } = {}
) => {
  if (!surface) {
    throw new Error(`label_print_${source}_missing`)
  }

  const cards = Array.from(
    surface.querySelectorAll('.sf-label-card')
  )

  if (cards.length !== expectedLabelCount) {
    throw new Error(`label_print_${source}_count_mismatch`)
  }

  const labelTexts = cards.map(card => normalizeText(card.textContent))
  if (labelTexts.some(text => !text)) {
    throw new Error(`label_print_${source}_blank`)
  }

  if (
    Array.isArray(expectedTexts) &&
    labelTexts.some((text, index) => text !== expectedTexts[index])
  ) {
    throw new Error(`label_print_${source}_content_mismatch`)
  }

  const isThermal = surface.classList.contains('labels-print-thermal')
  if (isThermal) {
    const thermalPages = surface.querySelectorAll('.thermal-label-page')
    if (thermalPages.length !== expectedLabelCount) {
      throw new Error(`label_print_${source}_page_count_mismatch`)
    }
  }

  return {
    cards,
    labelTexts,
    isThermal
  }
}

const removeExistingPrintMount = () => {
  const existingMount = document.getElementById(PRINT_MOUNT_ID)
  if (existingMount) existingMount.remove()
  document.body.classList.remove(PRINT_BODY_CLASS)
}

export const cleanupDirectLabelPrint = () => {
  removeExistingPrintMount()
}

export const prepareDirectLabelPrint = (expectedLabelCount) => {
  const safeExpectedCount = Number(expectedLabelCount)
  if (!Number.isInteger(safeExpectedCount) || safeExpectedCount < 1) {
    throw new Error('label_print_invalid_expected_count')
  }

  const sourceSurface = document.querySelector(
    '.labels-preview-root .labels-print-surface'
  )

  const {
    labelTexts,
    isThermal
  } = validateSurface(
    sourceSurface,
    safeExpectedCount,
    { source: 'source' }
  )

  const previewRoot = sourceSurface.closest('.labels-preview-root')
  if (!previewRoot) {
    throw new Error('label_print_preview_root_missing')
  }

  const previewStyle = window.getComputedStyle(previewRoot)
  const thermalWidth = getCssVariable(
    previewStyle,
    '--thermal-label-width',
    '100mm'
  )
  const thermalHeight = getCssVariable(
    previewStyle,
    '--thermal-label-height',
    '50mm'
  )
  const a4Columns = getCssVariable(
    previewStyle,
    '--label-a4-columns',
    '2'
  )

  removeExistingPrintMount()

  const mount = document.createElement('div')
  mount.id = PRINT_MOUNT_ID
  mount.className = isThermal
    ? 'label-print-mount label-print-mount--thermal'
    : 'label-print-mount label-print-mount--a4'
  mount.setAttribute('data-print-label-count', String(safeExpectedCount))
  mount.style.setProperty('--thermal-label-width', thermalWidth)
  mount.style.setProperty('--thermal-label-height', thermalHeight)
  mount.style.setProperty('--label-a4-columns', String(a4Columns))

  const clonedSurface = sourceSurface.cloneNode(true)
  clonedSurface.setAttribute('data-print-export-surface', 'true')
  mount.appendChild(clonedSurface)

  document.body.appendChild(mount)
  document.body.classList.add(PRINT_BODY_CLASS)

  try {
    validateSurface(
      clonedSurface,
      safeExpectedCount,
      {
        expectedTexts: labelTexts,
        source: 'mount'
      }
    )
  } catch (error) {
    cleanupDirectLabelPrint()
    throw error
  }

  return {
    mount,
    clonedSurface,
    isThermal,
    labelTexts,
    labelCount: safeExpectedCount,
    thermalWidth,
    thermalHeight,
    a4Columns
  }
}

export const printLabelsDirectly = async (expectedLabelCount) => {
  const prepared = prepareDirectLabelPrint(expectedLabelCount)

  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await waitForNextPaint()

  let cleanupTimer = null
  let cleaned = false

  const cleanup = () => {
    if (cleaned) return
    cleaned = true

    if (cleanupTimer !== null) {
      window.clearTimeout(cleanupTimer)
    }

    cleanupDirectLabelPrint()
  }

  window.addEventListener('afterprint', cleanup, { once: true })
  cleanupTimer = window.setTimeout(
    cleanup,
    PRINT_MOUNT_FALLBACK_CLEANUP_MS
  )

  try {
    window.print()
  } catch (error) {
    window.removeEventListener('afterprint', cleanup)
    cleanup()
    throw error
  }

  return {
    printed: true,
    labelCount: prepared.labelCount
  }
}

export const getDirectLabelPrintState = () => ({
  mounted: Boolean(document.getElementById(PRINT_MOUNT_ID)),
  bodyClassActive: document.body.classList.contains(PRINT_BODY_CLASS),
  labelTexts: document.getElementById(PRINT_MOUNT_ID)
    ? getLabelTexts(document.getElementById(PRINT_MOUNT_ID))
    : []
})
