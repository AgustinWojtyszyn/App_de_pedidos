import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Database, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'

const POLICY_VERSION = '2026-09-v1'
const STORAGE_PREFIX = 'servifood-order-privacy-consent'

const getStorageKey = (userId) => `${STORAGE_PREFIX}:${userId || 'anonymous'}`

const readStoredConsent = (userId) => {
  if (typeof window === 'undefined') return false

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) return false

    const parsed = JSON.parse(raw)
    return parsed?.version === POLICY_VERSION && Boolean(parsed?.acceptedAt)
  } catch {
    return false
  }
}

const persistConsent = (userId) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify({
        version: POLICY_VERSION,
        acceptedAt: new Date().toISOString()
      })
    )
  } catch {
    // El consentimiento sigue vigente durante esta sesión aunque localStorage no esté disponible.
  }
}

const policyItems = [
  {
    icon: UserRound,
    title: 'Datos que utilizamos',
    text: 'Nombre, correo electrónico, teléfono cuando se informa, empresa o sede, locación solicitante y demás datos necesarios para identificar y gestionar tu pedido.'
  },
  {
    icon: Database,
    title: 'Información del pedido',
    text: 'Menús seleccionados, cantidades, opciones alimentarias, comentarios, fecha de entrega y registros operativos vinculados al pedido.'
  },
  {
    icon: ShieldCheck,
    title: 'Para qué se utilizan',
    text: 'Para recibir, preparar, coordinar y entregar pedidos; brindar soporte; resolver incidencias; mantener trazabilidad, auditoría y reportes internos; y mejorar la operación del servicio.'
  },
  {
    icon: LockKeyhole,
    title: 'Acceso y conservación',
    text: 'La información puede ser consultada por personal autorizado de ServiFood y por proveedores tecnológicos necesarios para prestar el servicio. Se conserva durante el tiempo necesario para fines operativos, de seguridad, auditoría y obligaciones aplicables.'
  }
]

const OrderPrivacyConsentGate = ({ userId, children }) => {
  const initiallyAccepted = useMemo(() => readStoredConsent(userId), [userId])
  const [accepted, setAccepted] = useState(initiallyAccepted)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setAccepted(readStoredConsent(userId))
    setChecked(false)
  }, [userId])

  const handleAccept = () => {
    if (!checked) return
    persistConsent(userId)
    setAccepted(true)
  }

  if (accepted) return children

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-2xl"
      aria-labelledby="order-privacy-policy-title"
    >
      <div className="border-b border-blue-100 bg-linear-to-r from-blue-50 to-white px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
              Consentimiento requerido
            </p>
            <h2 id="order-privacy-policy-title" className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Política de privacidad y tratamiento de datos personales
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Para realizar un pedido necesitás conocer y aceptar cómo ServiFood utiliza la información necesaria para prestar el servicio.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <div className="grid gap-3 md:grid-cols-2">
          {policyItems.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          <p>
            <strong className="text-slate-950">Tus datos no se solicitan para fines ajenos al servicio de pedidos.</strong>{' '}
            Podés solicitar la revisión o actualización de tus datos a través de los canales habituales de ServiFood. Cuando corresponda, también podés solicitar su eliminación conforme a la normativa aplicable y a las obligaciones de conservación vigentes.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-300 bg-slate-50 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/60">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
          />
          <span className="text-sm font-semibold leading-6 text-slate-800 sm:text-base">
            Leí y acepto la Política de privacidad y tratamiento de datos personales de ServiFood, y autorizo el tratamiento de mis datos para gestionar y prestar el servicio de pedidos.
          </span>
        </label>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            Política {POLICY_VERSION} · La aceptación queda registrada únicamente en este navegador.
          </p>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-lg transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none sm:w-auto"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Aceptar y continuar
          </button>
        </div>
      </div>
    </section>
  )
}

export { POLICY_VERSION, getStorageKey, readStoredConsent }
export default OrderPrivacyConsentGate
