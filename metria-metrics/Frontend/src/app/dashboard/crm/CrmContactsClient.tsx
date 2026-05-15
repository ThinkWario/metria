'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Users, UserCheck, TrendingUp, Search, Plus, Filter, MessageSquare, Ticket, DollarSign } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_CONFIG: Record<string, { label: string; color: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  LEAD: { label: 'Lead', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', variant: 'secondary' },
  PROSPECT: { label: 'Prospecto', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', variant: 'secondary' },
  CUSTOMER: { label: 'Cliente', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', variant: 'secondary' },
  VIP: { label: 'VIP', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', variant: 'secondary' },
  CHURNED: { label: 'Inactivo', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', variant: 'outline' }
}

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  ltv: string | number
  source: string
  avatarUrl: string | null
  _count: { conversations: number; deals: number; tickets: number }
}

export default function CrmContactsClient() {
  const [mounted, setMounted] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter)
    
    setLoading(true)
    fetchAPI(`/crm/contacts?${params}`)
      .then(r => r.json())
      .then(setContacts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, search, statusFilter])

  if (!mounted) return <div className="p-8 space-y-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>

  const metrics = {
    total: contacts.length,
    vips: contacts.filter(c => c.status === 'VIP').length,
    avgLtv: contacts.length ? contacts.reduce((acc, c) => acc + Number(c.ltv), 0) / contacts.length : 0,
    activeLeads: contacts.filter(c => c.status === 'LEAD' || c.status === 'PROSPECT').length
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">CRM de Clientes</h1>
          <p className="text-muted-foreground">Gestiona tus contactos y maximiza su valor de vida (LTV).</p>
        </div>
        <div className="flex items-center gap-2">
            <Button className="rounded-xl gap-2 shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" /> Nuevo Contacto
            </Button>
        </div>
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Contactos" value={metrics.total} icon={Users} color="text-blue-500" />
        <MetricCard title="Clientes VIP" value={metrics.vips} icon={UserCheck} color="text-amber-500" />
        <MetricCard title="LTV Promedio" value={`$${metrics.avgLtv.toFixed(2)}`} icon={TrendingUp} color="text-emerald-500" />
        <MetricCard title="Leads Activos" value={metrics.activeLeads} icon={Search} color="text-purple-500" />
      </div>

      {/* Filters & Table Card */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden shadow-xl">
        <CardHeader className="border-b border-border/40 bg-muted/20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nombre, email o WhatsApp..." 
                        className="pl-10 bg-background/50 border-border/40 rounded-xl"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Filter className="w-4 h-4" /> Filtrar:
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px] bg-background/50 rounded-xl border-border/40">
                            <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Todos los estados</SelectItem>
                            <SelectItem value="LEAD">Leads</SelectItem>
                            <SelectItem value="PROSPECT">Prospectos</SelectItem>
                            <SelectItem value="CUSTOMER">Clientes</SelectItem>
                            <SelectItem value="VIP">VIPs</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </CardHeader>
        <CardContent className="p-0">
            {loading ? (
                <div className="p-8 space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
            ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                        <Users className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">No se encontraron contactos</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto">Ajusta los filtros o crea un nuevo contacto manualmente.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/40 text-xs uppercase tracking-wider text-muted-foreground">
                                <th className="text-left px-6 py-4 font-black">Información de Contacto</th>
                                <th className="text-left px-6 py-4 font-black">Estado</th>
                                <th className="text-right px-6 py-4 font-black">LTV Total</th>
                                <th className="text-center px-6 py-4 font-black">Actividad</th>
                                <th className="text-right px-6 py-4 font-black">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {contacts.map(contact => (
                                <tr 
                                    key={contact.id} 
                                    className="group hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={() => router.push(`/dashboard/crm/contacts/${contact.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-10 w-10 border border-border/60 group-hover:scale-105 transition-transform">
                                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.email || contact.id}`} />
                                                <AvatarFallback>{contact.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground group-hover:text-primary transition-colors">{contact.name}</span>
                                                <span className="text-xs text-muted-foreground">{contact.email || contact.phone || 'Sin datos'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {contact.status && (
                                            <Badge 
                                                variant={STATUS_CONFIG[contact.status]?.variant || 'outline'}
                                                className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_CONFIG[contact.status]?.color}`}
                                            >
                                                {STATUS_CONFIG[contact.status]?.label || contact.status}
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="font-mono font-bold text-foreground">${Number(contact.ltv).toLocaleString()}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase">{contact.source}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-4">
                                            <ActivityBadge icon={MessageSquare} count={contact._count.conversations} tooltip="Conversaciones" />
                                            <ActivityBadge icon={Ticket} count={contact._count.tickets} tooltip="Tickets" />
                                            <ActivityBadge icon={DollarSign} count={contact._count.deals} tooltip="Oportunidades" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button variant="ghost" size="sm" className="rounded-xl hover:bg-primary/10">Ver Detalle</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
    return (
        <Card className="border-border/40 bg-card/30 backdrop-blur-md rounded-2xl hover:border-primary/40 transition-all hover:-translate-y-1">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={`p-2 rounded-xl bg-muted/50 ${color}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                </div>
                <div className="space-y-1">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
                    <p className="text-3xl font-black text-foreground tracking-tighter">{value}</p>
                </div>
            </CardContent>
        </Card>
    )
}

function ActivityBadge({ icon: Icon, count, tooltip }: { icon: any; count: number; tooltip: string }) {
    if (count === 0) return <div className="text-muted-foreground/30 opacity-40"><Icon className="w-4 h-4" /></div>
    return (
        <div className="flex items-center gap-1 text-muted-foreground group/item" title={tooltip}>
            <Icon className="w-4 h-4 group-hover/item:text-primary transition-colors" />
            <span className="text-xs font-bold">{count}</span>
        </div>
    )
}
