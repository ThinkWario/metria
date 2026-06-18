'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Users, UserCheck, TrendingUp, Search, Plus, Filter, MessageSquare, Ticket, DollarSign, MoreVertical, Trash2, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadQualificationBadge } from '@/components/crm/LeadQualificationBadge'
import { toast } from 'sonner'

const cleanPhone = (phone: string | null) => phone ? phone.split('@')[0] : null

const STATUS_CONFIG: Record<string, { label: string; color: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  LEAD:     { label: 'Lead',      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',     variant: 'secondary' },
  PROSPECT: { label: 'Prospecto', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', variant: 'secondary' },
  CUSTOMER: { label: 'Cliente',   color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', variant: 'secondary' },
  VIP:      { label: 'VIP',       color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',   variant: 'secondary' },
  CHURNED:  { label: 'Inactivo',  color: 'bg-slate-500/10 text-slate-500 border-slate-500/20',   variant: 'outline' },
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
  leadScore: number | null
  leadTemperature: string | null
  leadType: string | null
  _count: { conversations: number; deals: number; tickets: number }
}

export default function CrmContactsClient() {
  const [mounted, setMounted] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [temperatureFilter, setTemperatureFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  // Advanced filter panel
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // New contact dialog
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newContactForm, setNewContactForm] = useState({ name: '', email: '', phone: '', status: 'LEAD' })
  const [newContactSaving, setNewContactSaving] = useState(false)
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (temperatureFilter && temperatureFilter !== 'ALL') params.set('leadTemperature', temperatureFilter)
    if (typeFilter && typeFilter !== 'ALL') params.set('leadType', typeFilter)
    // Status filtering is multi-select and done client-side

    setLoading(true)
    fetchAPI(`/crm/contacts?${params}`)
      .then(data => setContacts(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, search, temperatureFilter, typeFilter])

  // Clear selection whenever the server list refreshes
  useEffect(() => { setSelectedIds(new Set()) }, [contacts])

  // Client-side status filter (multi-select)
  const displayedContacts = selectedStatuses.length === 0
    ? contacts
    : contacts.filter(c => selectedStatuses.includes(c.status))

  // Header checkbox state — based on visible rows only
  const visibleSelectedCount = displayedContacts.filter(c => selectedIds.has(c.id)).length
  const allChecked  = displayedContacts.length > 0 && visibleSelectedCount === displayedContacts.length
  const someChecked = visibleSelectedCount > 0 && visibleSelectedCount < displayedContacts.length

  // Indeterminate is a DOM property, not an HTML attribute — must be set via ref
  const headerCheckboxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someChecked
    }
  }, [someChecked])

  // Active filter badge count
  const activeFilterCount =
    selectedStatuses.length +
    (temperatureFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0)

  function clearFilters() {
    setSelectedStatuses([])
    setTemperatureFilter('ALL')
    setTypeFilter('ALL')
  }

  function toggleId(id: string, checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) next.add(id)
    else next.delete(id)
    setSelectedIds(next)
  }

  async function handleRowStatusChange(id: string, newStatus: string) {
    const prev = contacts
    setContacts(c => c.map(x => x.id === id ? { ...x, status: newStatus } : x))
    try {
      await fetchAPI('/crm/contacts/' + id, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      toast.success(`${STATUS_CONFIG[newStatus]?.label ?? 'Estado'} actualizado`)
    } catch (err: any) {
      setContacts(prev)
      toast.error(err.message || 'Error al actualizar estado')
    }
  }

  async function handleBulkStatusUpdate(status: string) {
    const ids = [...selectedIds]
    const prevContacts = contacts
    const prevSelected = new Set(selectedIds)
    // Optimistic update
    setContacts(c => c.map(x => ids.includes(x.id) ? { ...x, status } : x))
    setSelectedIds(new Set())
    try {
      await fetchAPI('/crm/contacts/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids, status }),
      })
      toast.success(`${ids.length} contacto${ids.length !== 1 ? 's' : ''} actualizado${ids.length !== 1 ? 's' : ''}`)
    } catch (err: any) {
      setContacts(prevContacts)
      setSelectedIds(prevSelected)
      toast.error(err.message || 'Error al actualizar contactos')
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds]
    const prevContacts = contacts
    // Optimistic removal
    setContacts(c => c.filter(x => !ids.includes(x.id)))
    setSelectedIds(new Set())
    setDeleteDialogOpen(false)
    try {
      await fetchAPI('/crm/contacts/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      toast.success(`${ids.length} contacto${ids.length !== 1 ? 's' : ''} eliminado${ids.length !== 1 ? 's' : ''}`)
    } catch (err: any) {
      setContacts(prevContacts)
      toast.error(err.message || 'Error al eliminar contactos')
    }
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault()
    if (!newContactForm.name.trim()) return
    setNewContactSaving(true)
    try {
      const created = await fetchAPI('/crm/contacts', {
        method: 'POST',
        body: JSON.stringify(newContactForm),
      })
      setContacts(prev => [created, ...prev])
      setNewContactOpen(false)
      setNewContactForm({ name: '', email: '', phone: '', status: 'LEAD' })
      toast.success('Contacto creado')
    } catch (err: any) {
      toast.error(err.message || 'Error al crear contacto')
    } finally {
      setNewContactSaving(false)
    }
  }

  if (!mounted) return (
    <div className="p-8 space-y-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  )

  const metrics = {
    total:       contacts.length,
    vips:        contacts.filter(c => c.status === 'VIP').length,
    avgLtv:      contacts.length ? contacts.reduce((acc, c) => acc + Number(c.ltv), 0) / contacts.length : 0,
    activeLeads: contacts.filter(c => c.status === 'LEAD' || c.status === 'PROSPECT').length,
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ── Header & Actions ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">CRM de Clientes</h1>
          <p className="text-muted-foreground">Gestiona tus contactos y maximiza su valor de vida (LTV).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="rounded-xl gap-2 shadow-lg shadow-primary/20" onClick={() => setNewContactOpen(true)}>
            <Plus className="w-4 h-4" /> Nuevo Contacto
          </Button>
        </div>
      </div>

      {/* ── New Contact Dialog ────────────────────────────────────── */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Contacto</DialogTitle>
            <DialogDescription>Completa los datos para agregar un contacto al CRM.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateContact} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nc-name">Nombre *</Label>
              <Input id="nc-name" required value={newContactForm.name} onChange={e => setNewContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-phone">WhatsApp / Teléfono</Label>
              <Input id="nc-phone" value={newContactForm.phone} onChange={e => setNewContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="+56912345678" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-email">Email</Label>
              <Input id="nc-email" type="email" value={newContactForm.email} onChange={e => setNewContactForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-status">Estado</Label>
              <Select value={newContactForm.status} onValueChange={v => setNewContactForm(f => ({ ...f, status: v }))}>
                <SelectTrigger id="nc-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEAD">Lead</SelectItem>
                  <SelectItem value="PROSPECT">Prospecto</SelectItem>
                  <SelectItem value="CUSTOMER">Cliente</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="CHURNED">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewContactOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={newContactSaving}>{newContactSaving ? 'Guardando...' : 'Crear Contacto'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation ──────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {selectedIds.size} contacto{selectedIds.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Los contactos seleccionados serán eliminados permanentemente del CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Metrics Bento Grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Contactos" value={metrics.total}       icon={Users}     color="text-blue-500" />
        <MetricCard title="Clientes VIP"    value={metrics.vips}        icon={UserCheck} color="text-amber-500" />
        <MetricCard title="LTV Promedio"    value={`$${metrics.avgLtv.toFixed(2)}`} icon={TrendingUp} color="text-emerald-500" />
        <MetricCard title="Leads Activos"   value={metrics.activeLeads} icon={Search}    color="text-purple-500" />
      </div>

      {/* ── Contacts Table Card ───────────────────────────────────── */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden shadow-xl">
        {/* ── Toolbar ─ search + filter toggle */}
        <CardHeader className="border-b border-border/40 bg-muted/20 p-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o WhatsApp..."
                className="pl-10 bg-background/50 border-border/40 rounded-xl"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="relative rounded-xl gap-2 border-border/40 bg-background/50"
              onClick={() => setFilterPanelOpen(p => !p)}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {/* ── Collapsible Filter Panel ── */}
          {filterPanelOpen && (
            <div className="border-t border-border/40 bg-background/30 px-6 py-5 space-y-5">
              <div className="flex flex-wrap items-start gap-10">

                {/* Status multi-select checkboxes */}
                <div className="space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Estado</p>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(key)}
                          onChange={(e) =>
                            setSelectedStatuses(prev =>
                              e.target.checked ? [...prev, key] : prev.filter(s => s !== key)
                            )
                          }
                          className="h-4 w-4 rounded border border-border cursor-pointer accent-primary"
                        />
                        <span className="text-sm font-medium text-foreground">{cfg.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Temperature */}
                <div className="space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Temperatura</p>
                  <Select value={temperatureFilter} onValueChange={setTemperatureFilter}>
                    <SelectTrigger className="w-[160px] bg-background/50 rounded-xl border-border/40">
                      <SelectValue placeholder="Temperatura" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas</SelectItem>
                      <SelectItem value="HOT">Caliente</SelectItem>
                      <SelectItem value="WARM">Tibio</SelectItem>
                      <SelectItem value="COLD">Frío</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Lead type */}
                <div className="space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Tipo de Lead</p>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[190px] bg-background/50 rounded-xl border-border/40">
                      <SelectValue placeholder="Tipo de lead" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos</SelectItem>
                      <SelectItem value="CURIOUS">Curioso</SelectItem>
                      <SelectItem value="QUOTING">Cotizando</SelectItem>
                      <SelectItem value="READY_TO_BUY">Listo para comprar</SelectItem>
                      <SelectItem value="POST_SALE">Postventa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : displayedContacts.length === 0 ? (
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
                    {/* Select-all checkbox */}
                    <th className="px-4 py-4 w-10">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(displayedContacts.map(c => c.id)))
                          else setSelectedIds(new Set())
                        }}
                        className="h-4 w-4 rounded border border-border cursor-pointer accent-primary"
                        aria-label="Seleccionar todos"
                      />
                    </th>
                    <th className="text-left px-6 py-4 font-black">Información de Contacto</th>
                    <th className="text-left px-6 py-4 font-black">Estado</th>
                    <th className="text-right px-6 py-4 font-black">LTV Total</th>
                    <th className="text-center px-6 py-4 font-black">Actividad</th>
                    <th className="text-right px-6 py-4 font-black">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {displayedContacts.map(contact => (
                    <tr
                      key={contact.id}
                      className="group hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/crm/contacts/${contact.id}`)}
                    >
                      {/* Per-row checkbox — stopPropagation so row click still navigates */}
                      <td className="px-4 py-4 w-10" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={(e) => toggleId(contact.id, e.target.checked)}
                          className="h-4 w-4 rounded border border-border cursor-pointer accent-primary"
                          aria-label={`Seleccionar ${contact.name}`}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-border/60 group-hover:scale-105 transition-transform">
                            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.email || contact.id}`} />
                            <AvatarFallback>{contact.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-bold text-foreground group-hover:text-primary transition-colors">{contact.name}</span>
                            <span className="text-xs text-muted-foreground">{contact.email || cleanPhone(contact.phone) || 'Sin datos'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          {contact.status && (
                            <Badge
                              variant={STATUS_CONFIG[contact.status]?.variant || 'outline'}
                              className={`w-fit rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_CONFIG[contact.status]?.color}`}
                            >
                              {STATUS_CONFIG[contact.status]?.label || contact.status}
                            </Badge>
                          )}
                          <LeadQualificationBadge
                            temperature={contact.leadTemperature}
                            type={contact.leadType}
                            score={contact.leadScore}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-foreground">${Number(contact.ltv).toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{contact.source}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-4">
                          <ActivityBadge icon={MessageSquare} count={contact._count?.conversations ?? 0} tooltip="Conversaciones" />
                          <ActivityBadge icon={Ticket}       count={contact._count?.tickets ?? 0}       tooltip="Tickets" />
                          <ActivityBadge icon={DollarSign}   count={contact._count?.deals ?? 0}         tooltip="Oportunidades" />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-xl h-8 w-8 hover:bg-primary/10"
                              onClick={e => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => handleRowStatusChange(contact.id, 'CUSTOMER')}>
                              Promover a Cliente
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleRowStatusChange(contact.id, 'VIP')}>
                              Marcar como VIP
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleRowStatusChange(contact.id, 'CHURNED')}>
                              Marcar Inactivo
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!cleanPhone(contact.phone)}
                              onSelect={() => {
                                const phone = (cleanPhone(contact.phone) ?? '').replace(/\D/g, '').replace(/@.*$/, '')
                                window.open('https://wa.me/' + phone, '_blank')
                              }}
                            >
                              Abrir WhatsApp
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Floating Bulk Action Bar ──────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="flex items-center gap-3 bg-background border border-border shadow-2xl shadow-black/20 rounded-2xl px-5 py-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm font-bold text-foreground whitespace-nowrap">
              {selectedIds.size} contacto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="h-5 w-px bg-border" />
            {/* Bulk status change */}
            <Select onValueChange={handleBulkStatusUpdate}>
              <SelectTrigger className="w-[160px] h-8 rounded-xl text-sm border-border/60">
                <SelectValue placeholder="Cambiar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEAD">Lead</SelectItem>
                <SelectItem value="PROSPECT">Prospecto</SelectItem>
                <SelectItem value="CUSTOMER">Cliente</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="CHURNED">Inactivo</SelectItem>
              </SelectContent>
            </Select>
            {/* Bulk delete */}
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl gap-1.5 h-8"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </Button>
            {/* Cancel selection */}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl gap-1.5 h-8 text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
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
