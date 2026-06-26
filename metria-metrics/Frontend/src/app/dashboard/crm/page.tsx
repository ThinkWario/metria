import type { Metadata } from 'next'
import Link from 'next/link'
import {
  KanbanSquare, CreditCard, Filter, FileText,
  Send, Zap, CalendarDays, CheckSquare
} from 'lucide-react'
import CrmContactsClient from './CrmContactsClient'

export const metadata: Metadata = {
  title: 'CRM — Contactos | Metria',
  description: 'Gestión de contactos, deals y tickets'
}

const CRM_SECTIONS = [
  { title: 'Pipelines',       desc: 'Deals y oportunidades',    icon: KanbanSquare, url: '/dashboard/crm/pipelines',    color: 'text-violet-500',  bg: 'bg-violet-500/10' },
  { title: 'Cobros',          desc: 'Links de pago por deal',   icon: CreditCard,   url: '/dashboard/crm/payments',     color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { title: 'Segmentos',       desc: 'Grupos de contactos',      icon: Filter,       url: '/dashboard/crm/segments',     color: 'text-blue-500',    bg: 'bg-blue-500/10' },
  { title: 'Formularios',     desc: 'Captura de leads',         icon: FileText,     url: '/dashboard/crm/forms',        color: 'text-amber-500',   bg: 'bg-amber-500/10' },
  { title: 'Campañas',        desc: 'Mensajería masiva',        icon: Send,         url: '/dashboard/crm/campaigns',    color: 'text-rose-500',    bg: 'bg-rose-500/10' },
  { title: 'Automatizaciones',desc: 'Flujos automáticos',       icon: Zap,          url: '/dashboard/crm/automations',  color: 'text-cyan-500',    bg: 'bg-cyan-500/10' },
  { title: 'Citas',           desc: 'Agenda y reservas',        icon: CalendarDays, url: '/dashboard/crm/appointments', color: 'text-indigo-500',  bg: 'bg-indigo-500/10' },
  { title: 'Tareas',          desc: 'Seguimiento de acciones',  icon: CheckSquare,  url: '/dashboard/tasks',            color: 'text-orange-500',  bg: 'bg-orange-500/10' },
]

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <p className="text-sm text-muted-foreground mt-1">Clientes, leads y prospectos de tu workspace</p>
      </div>

      {/* CRM subcategory quick-nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CRM_SECTIONS.map((s) => (
          <Link
            key={s.url}
            href={s.url}
            className="group flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 hover:bg-card hover:border-border/80 hover:shadow-sm transition-all"
          >
            <div className={`rounded-lg p-2 ${s.bg} shrink-0`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none truncate">{s.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <CrmContactsClient />
    </div>
  )
}
