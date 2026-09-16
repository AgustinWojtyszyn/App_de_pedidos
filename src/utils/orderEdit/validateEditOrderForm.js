import { hasHiddenOrderMenuSelection, hasSyntheticFallbackMenuSelection } from '../order/menuDisplay'
import { isBeverageOrDessertOption } from '../order/orderBusinessRules'
import { resolveEditOrderCompany } from './editOrderCompany'

const hasValidResponse = (value) => {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.some(hasValidResponse)
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object') return Object.values(value).some(hasValidResponse)
  return Boolean(value)
}

export const validateEditOrderForm = ({
  user,
  formData,
  selectedItemsList,
  service,
  customOptions,
  customResponses,
  originalOrder
}) => {
  if (!user?.id) {
    return { ok: false, error: 'No se pudo validar el usuario. Intenta nuevamente.' }
  }

  if (!formData?.location) {
    return { ok: false, error: 'Por favor selecciona un lugar de trabajo' }
  }

  const originalCompany = resolveEditOrderCompany(originalOrder)
  const selectedLocationCompany = resolveEditOrderCompany({}, formData.location)
  if (
    originalCompany?.slug &&
    selectedLocationCompany?.slug &&
    originalCompany.slug !== selectedLocationCompany.slug
  ) {
    return {
      ok: false,
      error: 'La sede seleccionada no pertenece a la empresa original del pedido.'
    }
  }

  const normalizedService = (service || 'lunch').toLowerCase()
  const dinnerOverrideChoice = customResponses?.['dinner-special']
  const hasDinnerOverrideChoice = hasValidResponse(dinnerOverrideChoice)

  const originalItems = Array.isArray(originalOrder?.items) ? originalOrder.items : []
  const preservesHiddenHistoricalItem = selectedItemsList?.length === 0 && hasHiddenOrderMenuSelection(originalItems)

  if (hasSyntheticFallbackMenuSelection(selectedItemsList)) {
    return { ok: false, error: 'El menú quedó desactualizado o no está disponible. Recargá la página e intentá nuevamente.' }
  }

  if (!selectedItemsList || selectedItemsList.length === 0) {
    const hasValidEmptyItemCase = preservesHiddenHistoricalItem || (
      normalizedService === 'dinner' && hasDinnerOverrideChoice
    )
    if (!hasValidEmptyItemCase) {
      if (normalizedService === 'dinner') {
        return { ok: false, error: 'Selecciona al menos un plato para cena o una opción de cena.' }
      }
      return { ok: false, error: 'Por favor selecciona al menos un plato del menú' }
    }
  }

  if ((normalizedService === 'lunch' || normalizedService === 'dinner') && (selectedItemsList || []).length > 1) {
    return { ok: false, error: 'Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.' }
  }

  if ((selectedItemsList || []).length > 0 && hasHiddenOrderMenuSelection(selectedItemsList)) {
    return { ok: false, error: 'Esa opción de menú no está disponible para pedidos.' }
  }

  const missingRequiredOptions = (customOptions || [])
    .filter((opt) => {
      if (!opt?.active || !opt?.required) return false
      if (
        normalizedService === 'dinner' &&
        hasDinnerOverrideChoice &&
        opt?.id !== 'dinner-special' &&
        !isBeverageOrDessertOption(opt)
      ) {
        return false
      }
      return !hasValidResponse(customResponses?.[opt.id])
    })
    .map(opt => opt.title)

  if (missingRequiredOptions.length > 0) {
    return { ok: false, error: `Por favor completa: ${missingRequiredOptions.join(', ')}` }
  }

  return { ok: true, error: null }
}
