import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const useSafeLayoutEffect = typeof window === 'undefined'
  ? useEffect
  : useLayoutEffect

const MIN_FIXED_PAGE_SCALE = 0.65

const formatDate = (value) => {
  const raw = String(value || '').slice(0, 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return 'Sin fecha'
  }

  const [year, month, day] = raw
    .split('-')
    .map(Number)

  return new Intl.DateTimeFormat(
    'es-AR',
    {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
        0,
        0
      )
    )
  )
}

const getLabelTextLength = (label = {}) => [
  label.customerName,
  label.companyLabel,
  label.deliveryLocation,
  label.itemsText,
  label.beverages?.join?.(', '),
  label.fruitDessertChoice
].join(' ').length

const getDensityClass = (label = {}) => {
  const textLength = getLabelTextLength(label)
  if (textLength > 360) return ' sf-label-card--very-dense'
  if (textLength > 220) return ' sf-label-card--dense'
  return ''
}

const OrderLabelCard = ({ label, fitToFixedPage = false }) => {
  const isEpseLabel = String(label?.company_slug || '').trim().toLowerCase() === 'epse'
  const densityClass = getDensityClass(label)
  const fitAreaRef = useRef(null)
  const contentRef = useRef(null)
  const [fitScale, setFitScale] = useState(1)
  const [fitReady, setFitReady] = useState(!fitToFixedPage)
  const [fitValid, setFitValid] = useState(true)

  useSafeLayoutEffect(() => {
    if (!fitToFixedPage) {
      setFitScale(1)
      setFitReady(true)
      setFitValid(true)
      return undefined
    }

    let cancelled = false
    let resizeObserver = null
    let firstFrame = null
    let fontFrame = null

    const measure = () => {
      if (cancelled) return

      const area = fitAreaRef.current
      const content = contentRef.current
      if (!area || !content || area.clientWidth <= 0 || area.clientHeight <= 0) {
        setFitReady(false)
        setFitValid(false)
        return
      }

      const previousTransform = content.style.transform
      const previousWidth = content.style.width
      content.style.transform = 'none'
      content.style.width = '100%'

      const naturalWidth = Math.max(content.scrollWidth, 1)
      const naturalHeight = Math.max(content.scrollHeight, 1)
      const widthScale = area.clientWidth / naturalWidth
      const heightScale = area.clientHeight / naturalHeight
      const measuredScale = Math.min(1, widthScale, heightScale)
      const safeScale = Math.min(1, measuredScale * 0.985)
      const valid = safeScale >= MIN_FIXED_PAGE_SCALE
      const appliedScale = Math.max(MIN_FIXED_PAGE_SCALE, safeScale)

      content.style.transform = previousTransform
      content.style.width = previousWidth

      setFitScale(previous => (
        Math.abs(previous - appliedScale) < 0.002
          ? previous
          : appliedScale
      ))
      setFitValid(valid)
      setFitReady(true)
    }

    setFitReady(false)
    setFitValid(true)
    firstFrame = window.requestAnimationFrame(measure)

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (cancelled) return
        fontFrame = window.requestAnimationFrame(measure)
      })
    }

    if (typeof ResizeObserver !== 'undefined' && fitAreaRef.current) {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(fitAreaRef.current)
    }

    return () => {
      cancelled = true
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame)
      if (fontFrame !== null) window.cancelAnimationFrame(fontFrame)
      resizeObserver?.disconnect()
    }
  }, [fitToFixedPage, label?.labelInstanceId])

  const contentStyle = fitToFixedPage
    ? {
        transform: `scale(${fitScale})`,
        transformOrigin: 'top left',
        width: `${100 / fitScale}%`
      }
    : undefined

  return (
    <article
      className={`sf-label-card${densityClass}`}
      data-label-fit-fixed={fitToFixedPage ? 'true' : 'false'}
      data-label-fit-ready={fitReady ? 'true' : 'false'}
      data-label-fit-valid={fitValid ? 'true' : 'false'}
      data-label-fit-scale={fitScale.toFixed(4)}
    >
      <div ref={fitAreaRef} className="sf-label-fit-area">
        <div
          ref={contentRef}
          className="sf-label-card-content"
          style={contentStyle}
        >
          <header className="sf-label-header">
            <div className="sf-label-customer">
              {label.customerName}
            </div>

            <div className="sf-label-code">
              {label.shortCode}
            </div>
          </header>

          <div className="sf-label-meta">
            <strong>
              {label.companyLabel}
            </strong>

            {!isEpseLabel &&
              label.deliveryLocation &&
              label.deliveryLocation !== label.companyLabel && (
                <span>
                  {label.deliveryLocation}
                </span>
              )}

            <span>
              {label.serviceLabel}
            </span>

            <span>
              {formatDate(label.delivery_date)}
            </span>

            {label.originLabel === 'Extra' && (
              <span>
                Extra
              </span>
            )}
          </div>

          <div className="sf-label-items">
            <strong>Pedido:</strong>{' '}
            {label.itemsText}
          </div>

          {label.beverages?.length > 0 && (
            <div className="sf-label-line">
              <strong>Bebida:</strong>{' '}
              {label.beverages.join(', ')}
            </div>
          )}

          {label.fruitDessertChoice && (
            <div className="sf-label-line">
              <strong>Fruta o postre:</strong>{' '}
              {label.fruitDessertChoice}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default OrderLabelCard
