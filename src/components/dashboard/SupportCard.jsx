import { MessageCircle, Phone } from 'lucide-react'

const SupportCard = () => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="rounded-full border border-emerald-200 bg-emerald-50 p-2">
        <MessageCircle className="h-6 w-6 text-emerald-700" />
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h3 className="text-base font-black text-gray-900">¿Necesitás ayuda?</h3>
        <p className="text-sm text-gray-600">Soporte por WhatsApp.</p>
        <a
          href="https://wa.me/2644405294?text=¡Hola!%20Necesito%20ayuda%20con%20ServiFood%20Catering"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors"
        >
          <Phone className="h-4 w-4" />
          Contactar por WhatsApp
        </a>
        
      </div>
    </div>
  </div>
)

export default SupportCard
