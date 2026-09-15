const PRINT_FRAME_FALLBACK_CLEANUP_MS = 120000

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

const getCssVariable = (style, name, fallback) => {
  const value = String(style?.getPropertyValue?.(name) || '').trim()
  return value || fallback
}

const collectLoadedCssText = (sourceDocument) => {
  const chunks = []

  Array.from(sourceDocument?.styleSheets || []).forEach((styleSheet) => {
    try {
      const cssText = Array.from(styleSheet.cssRules || [])
        .map(rule => rule.cssText)
        .join('\n')

      if (cssText) chunks.push(cssText)
    } catch (_error) {
      // Hojas cross-origin (por ejemplo Google Fonts) no exponen cssRules.
      // Las etiquetas usan fuentes del sistema, por lo que omitirlas es seguro.
    }
  })

  return chunks.join('\n')
}

export const buildIsolatedLabelPrintCss = ({
  isThermal,
  thermalWidth = '100mm',
  thermalHeight = '50mm',
  a4Columns = 2
} = {}) => {
  const safeColumns = Number(a4Columns) === 3 ? 3 : 2
  const pageSize = isThermal
    ? `${thermalWidth} ${thermalHeight}`
    : 'A4 portrait'

  return `
    @page {
      size: ${pageSize};
      margin: 0;
    }

    html,
    body.labels-print-frame {
      margin: 0 !important;
      padding: 0 !important;
      width: ${isThermal ? thermalWidth : 'auto'} !important;
      min-width: 0 !important;
      max-width: ${isThermal ? thermalWidth : 'none'} !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      position: static !important;
      background: #fff !important;
      color: #000 !important;
    }

    body.labels-print-frame .labels-print-export-root,
    body.labels-print-frame .labels-print-surface,
    body.labels-print-frame .labels-print-surface * {
      visibility: visible !important;
      opacity: 1 !important;
    }

    body.labels-print-frame .labels-print-export-root {
      display: block !important;
      position: static !important;
      inset: auto !important;
      width: ${isThermal ? thermalWidth : 'auto'} !important;
      min-width: 0 !important;
      max-width: ${isThermal ? thermalWidth : 'none'} !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      contain: none !important;
      background: #fff !important;
    }

    body.labels-print-frame .labels-print-surface {
      box-sizing: border-box !important;
      border: 0 !important;
      border-radius: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    body.labels-print-frame .labels-print-a4 {
      display: grid !important;
      grid-template-columns: repeat(${safeColumns}, minmax(0, 1fr)) !important;
      gap: 6mm !important;
      padding: 8mm !important;
    }

    body.labels-print-frame .labels-print-a4 .sf-label-card {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    body.labels-print-frame .labels-print-thermal {
      display: block !important;
      width: ${thermalWidth} !important;
      min-width: ${thermalWidth} !important;
      max-width: ${thermalWidth} !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      break-inside: auto !important;
      page-break-inside: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    body.labels-print-frame .labels-print-thermal .thermal-label-page {
      display: block !important;
      box-sizing: border-box !important;
      width: ${thermalWidth} !important;
      min-width: ${thermalWidth} !important;
      max-width: ${thermalWidth} !important;
      height: ${thermalHeight} !important;
      min-height: ${thermalHeight} !important;
      max-height: ${thermalHeight} !important;
      break-before: auto !important;
      page-break-before: auto !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      break-after: page !important;
      page-break-after: always !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    body.labels-print-frame .labels-print-thermal .thermal-label-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }

    body.labels-print-frame .labels-print-thermal .sf-label-card {
      display: flex !important;
      box-sizing: border-box !important;
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      max-height: 100% !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      overflow: hidden !important;
      margin: 0 !important;
      border-radius: 0 !important;
      background: #fff !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body.labels-print-frame .labels-print-thermal .sf-label-fit-area {
      overflow: hidden !important;
    }
  `
}

const waitForFramePaint = (frameWindow) => new Promise((resolve) => {
  frameWindow.requestAnimationFrame(() => {
    frameWindow.requestAnimationFrame(resolve)
  })
})

const validateSourceSurface = (sourceSurface, expectedLabelCount) => {
  if (!sourceSurface) {
    throw new Error('label_print_source_missing')
  }

  const sourceCards = Array.from(
    sourceSurface.querySelectorAll('.sf-label-card')
  )

  if (sourceCards.length !== expectedLabelCount) {
    throw new Error('label_print_source_count_mismatch')
  }

  const labelTexts = sourceCards.map(card => normalizeText(card.textContent))
  if (labelTexts.some(text => !text)) {
    throw new Error('label_print_source_blank')
  }

  const isThermal = sourceSurface.classList.contains('labels-print-thermal')
  if (isThermal) {
    const thermalPages = sourceSurface.querySelectorAll('.thermal-label-page')
    if (thermalPages.length !== expectedLabelCount) {
      throw new Error('label_print_source_page_count_mismatch')
    }
  }

  return {
    sourceCards,
    labelTexts,
    isThermal
  }
}

const validateFrameSurface = ({
  frameDocument,
  frameWindow,
  expectedLabelCount,
  expectedTexts,
  isThermal
}) => {
  const exportSurface = frameDocument.querySelector(
    '[data-print-export-surface="true"]'
  )

  if (!exportSurface) {
    throw new Error('label_print_frame_missing')
  }

  const frameCards = Array.from(
    exportSurface.querySelectorAll('.sf-label-card')
  )

  if (frameCards.length !== expectedLabelCount) {
    throw new Error('label_print_frame_count_mismatch')
  }

  const frameTexts = frameCards.map(card => normalizeText(card.textContent))
  const textMismatch = frameTexts.some(
    (text, index) => !text || text !== expectedTexts[index]
  )

  if (textMismatch) {
    throw new Error('label_print_frame_content_mismatch')
  }

  if (isThermal) {
    const thermalPages = exportSurface.querySelectorAll('.thermal-label-page')
    if (thermalPages.length !== expectedLabelCount) {
      throw new Error('label_print_frame_page_count_mismatch')
    }
  }

  const invisibleCard = frameCards.some((card) => {
    const computedStyle = frameWindow.getComputedStyle(card)
    const rect = card.getBoundingClientRect()
    const opacity = Number.parseFloat(computedStyle.opacity || '1')

    return (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      opacity === 0 ||
      rect.width <= 0 ||
      rect.height <= 0
    )
  })

  if (invisibleCard) {
    throw new Error('label_print_frame_blank')
  }
}

export const printLabelsInIsolatedFrame = async (expectedLabelCount) => {
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
  } = validateSourceSurface(sourceSurface, safeExpectedCount)

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

  const frame = document.createElement('iframe')
  frame.setAttribute('data-label-print-frame', 'true')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Documento aislado de impresión de etiquetas')
  frame.tabIndex = -1
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1200px',
    height: '800px',
    border: '0',
    pointerEvents: 'none',
    zIndex: '-1'
  })

  document.body.appendChild(frame)

  const frameDocument = frame.contentDocument
  const frameWindow = frame.contentWindow

  if (!frameDocument || !frameWindow) {
    frame.remove()
    throw new Error('label_print_frame_unavailable')
  }

  frameDocument.open()
  frameDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"></head><body class="labels-print-frame"></body></html>'
  )
  frameDocument.close()

  const base = frameDocument.createElement('base')
  base.href = document.baseURI
  frameDocument.head.appendChild(base)

  const sharedStyles = frameDocument.createElement('style')
  sharedStyles.setAttribute('data-label-print-shared-styles', 'true')
  sharedStyles.textContent = collectLoadedCssText(document)
  frameDocument.head.appendChild(sharedStyles)

  const criticalStyles = frameDocument.createElement('style')
  criticalStyles.setAttribute('data-label-print-critical-styles', 'true')
  criticalStyles.textContent = buildIsolatedLabelPrintCss({
    isThermal,
    thermalWidth,
    thermalHeight,
    a4Columns
  })
  frameDocument.head.appendChild(criticalStyles)

  const exportRoot = frameDocument.createElement('div')
  exportRoot.className = `labels-print-export-root ${
    isThermal ? 'labels-preview-thermal' : 'labels-preview-a4'
  }`
  exportRoot.style.setProperty('--thermal-label-width', thermalWidth)
  exportRoot.style.setProperty('--thermal-label-height', thermalHeight)
  exportRoot.style.setProperty('--label-a4-columns', String(a4Columns))

  const clonedSurface = sourceSurface.cloneNode(true)
  clonedSurface.setAttribute('data-print-export-surface', 'true')
  exportRoot.appendChild(clonedSurface)
  frameDocument.body.appendChild(exportRoot)

  if (frameDocument.fonts?.ready) {
    await frameDocument.fonts.ready
  }
  await waitForFramePaint(frameWindow)

  try {
    validateFrameSurface({
      frameDocument,
      frameWindow,
      expectedLabelCount: safeExpectedCount,
      expectedTexts: labelTexts,
      isThermal
    })
  } catch (error) {
    frame.remove()
    throw error
  }

  let cleanupTimer = null
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (cleanupTimer !== null) {
      window.clearTimeout(cleanupTimer)
    }
    frame.remove()
  }

  frameWindow.addEventListener('afterprint', cleanup, { once: true })
  cleanupTimer = window.setTimeout(
    cleanup,
    PRINT_FRAME_FALLBACK_CLEANUP_MS
  )

  try {
    frameWindow.focus()
    frameWindow.print()
  } catch (error) {
    cleanup()
    throw error
  }

  return {
    printed: true,
    labelCount: safeExpectedCount
  }
}
