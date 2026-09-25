import { Database, LockKeyhole, ShieldCheck, UserRound, UsersRound } from 'lucide-react'

const sections = [
  {
    icon: UserRound,
    title: 'Datos personales que podemos utilizar',
    text: 'Nombre y apellido, correo electrónico, teléfono cuando se informa, empresa, sede o locación y cualquier otro dato que resulte necesario para identificar al usuario y gestionar el servicio.'
  },
  {
    icon: Database,
    title: 'Datos vinculados a los pedidos',
    text: 'Selecciones de menú, cantidades, preferencias u opciones alimentarias informadas por el usuario, comentarios, fechas, lugares de entrega y registros operativos asociados al pedido.'
  },
  {
    icon: ShieldCheck,
    title: 'Finalidad del tratamiento',
    text: 'La información se utiliza para recibir, preparar, coordinar y entregar pedidos, brindar soporte, resolver incidencias, mantener trazabilidad y auditoría, elaborar reportes internos y mejorar la operación del servicio.'
  },
  {
    icon: UsersRound,
    title: 'Acceso y comunicación de datos',
    text: 'Los datos pueden ser consultados por personal autorizado de ServiFood y, cuando sea necesario para prestar el servicio, por proveedores tecnológicos u operativos que intervengan en el funcionamiento de la plataforma o en la gestión del pedido.'
  },
  {
    icon: LockKeyhole,
    title: 'Conservación y seguridad',
    text: 'La información se conserva durante el tiempo necesario para fines operativos, de seguridad, auditoría y cumplimiento de obligaciones aplicables. ServiFood procura limitar el acceso a las personas y sistemas que necesitan utilizarla para esas finalidades.'
  }
]

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="overflow-hidden rounded-2xl border border-blue-300/40 bg-linear-to-r from-blue-600 to-blue-800 px-5 py-5 text-white shadow-xl sm:px-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-100">
              ServiFood
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Política de privacidad y tratamiento de datos personales
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-blue-100 sm:text-base">
              Información sobre los datos que utiliza la plataforma de pedidos y las finalidades vinculadas a la prestación del servicio.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="space-y-3">
          <h2 className="text-xl font-black text-slate-950">Alcance</h2>
          <p className="text-sm leading-6 text-slate-700 sm:text-base">
            Esta política describe el tratamiento de información personal y operativa realizado a través de la aplicación de pedidos de ServiFood. Su objetivo es explicar de manera clara qué información puede utilizarse, para qué se utiliza y quiénes pueden acceder a ella cuando resulte necesario para prestar el servicio.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-xl border border-slate-300 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-200 bg-white text-blue-700">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-950">{title}</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
          <div>
            <h2 className="text-lg font-black text-slate-950">Derechos y consultas</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Los usuarios pueden solicitar la revisión o actualización de sus datos a través de los canales habituales de ServiFood. Cuando corresponda, también pueden solicitar su eliminación, sujeta a las necesidades operativas y a las obligaciones de conservación aplicables.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold leading-6 text-blue-950">
              Esta política puede actualizarse cuando cambien los procesos, funcionalidades o requerimientos aplicables. La versión publicada en esta sección es la que se encuentra vigente dentro de la aplicación.
            </p>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
            Versión 2026-09
          </p>
        </div>
      </section>
    </div>
  )
}
