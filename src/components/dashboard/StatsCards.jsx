import { CheckCircle, Clock, ShoppingBag } from 'lucide-react'

const Stat = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-center gap-3 px-3 py-2 sm:px-4">
    <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-black leading-none text-slate-900">{value}</p>
    </div>
  </div>
)

const StatsCards = ({ stats }) => (
  <div className="grid grid-cols-1 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
    <Stat icon={ShoppingBag} label="Pedidos hoy" value={stats.total} />
    <Stat icon={Clock} label="Pendientes" value={stats.pending} />
    <Stat icon={CheckCircle} label="Archivados" value={stats.archived} />
  </div>
)

export default StatsCards
