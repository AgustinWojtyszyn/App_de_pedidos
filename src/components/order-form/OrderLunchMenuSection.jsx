import { CheckCircle, ChefHat, Sparkles } from 'lucide-react'
import { getMenuDisplay, isHyperproteicMenuItem } from '../../utils/order/menuDisplay'
import { isGreifRefrigerioMenuItem } from '../../utils/order/greifDefaultSnack'

const OrderLunchMenuSection = ({ items, selectedItems, onToggleItem, companySlug }) => {
  const orderableItems = items || []
  const hasSelectedRefrigerio = orderableItems.some((item) =>
    isGreifRefrigerioMenuItem(item) && selectedItems[item.id] === true
  )
  const hasSelectedMenu = orderableItems.some((item) =>
    !isGreifRefrigerioMenuItem(item) && selectedItems[item.id] === true
  )

  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-linear-to-r from-secondary-500 to-secondary-600 text-white p-3 rounded-xl">
          <ChefHat className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-boldd text-gray-900">Seleccioná tu Menú</h2>
          <p className="text-sm text-gray-600 font-semibold mt-1">
            Elegí uno o más platos disponibles
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {orderableItems.map((item, index) => {
          const isSelected = selectedItems[item.id] === true
          const isRefrigerio = isGreifRefrigerioMenuItem(item)
          const isHyperproteic = isHyperproteicMenuItem(item)
          const isDisabled = (hasSelectedRefrigerio && !isRefrigerio) || (hasSelectedMenu && isRefrigerio)
          const { label, dish } = getMenuDisplay(item, Number.isFinite(item?.slotIndex) ? item.slotIndex : index, companySlug)
          const hyperproteicDish = isHyperproteic
            ? dish.replace(/^hiperproteica\s*[·:\-]\s*/i, '').trim()
            : dish
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (isDisabled) return
                onToggleItem(item.id, !isSelected)
              }}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={`card relative overflow-hidden text-left border-2 rounded-2xl p-5
                        transition-all duration-300 flex flex-col justify-between min-h-65
                        focus:outline-none focus:ring-2 focus:ring-blue-400
                        ${isHyperproteic ? 'bg-linear-to-br from-amber-50 via-white to-orange-50 border-amber-300 shadow-lg ring-1 ring-amber-100' : 'bg-white'}
                        ${isDisabled ? 'cursor-not-allowed opacity-55 border-gray-200' : isHyperproteic ? 'cursor-pointer hover:border-orange-400 hover:shadow-2xl hover:-translate-y-0.5' : 'cursor-pointer hover:border-blue-400 hover:shadow-xl'}
                        ${isSelected ? (isHyperproteic ? 'border-orange-500 bg-orange-50/80 shadow-2xl ring-2 ring-orange-200' : 'border-blue-500 bg-blue-50/60 shadow-xl') : (!isHyperproteic ? 'border-gray-200' : '')}`}
            >
              <div>
                {isHyperproteic && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5" />
                      Nueva
                    </span>
                    <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange-700">
                      💪 Hiperproteica
                    </span>
                  </div>
                )}

                <h3 className={`${isHyperproteic ? 'text-3xl text-orange-950' : 'text-2xl text-gray-900'} font-extrabold mb-2 leading-tight`}>
                  {isHyperproteic ? `💪 ${label} · Hiperproteica` : label}
                </h3>

                {isHyperproteic && (
                  <p className="mb-3 text-sm font-bold text-orange-700">
                    ✨ Nueva alternativa hiperproteica
                  </p>
                )}

                {hyperproteicDish && (
                  <p className={`${isHyperproteic ? 'text-lg text-gray-900 font-semibold' : 'text-lg text-gray-800 font-medium'} leading-snug`}>
                    {hyperproteicDish}
                  </p>
                )}
              </div>

              <div className="flex justify-end mt-6 min-h-9">
                {isSelected && (
                  <span className="flex items-center gap-2 text-blue-600 font-bold text-lg">
                    <CheckCircle className="h-8 w-8" />
                    Seleccionado
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OrderLunchMenuSection
