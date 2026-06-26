'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { fetchAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Trophy, X, GripVertical,
  Flame, Thermometer, Snowflake, Phone, Calendar, Clock,
  Check, KanbanSquare, Pencil, BarChart2, Trash2, User,
  Settings, ChevronUp, ChevronDown, CreditCard
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { toast } from 'sonner'
import Link from 'next/link'
import { PaymentLinkModal } from '@/components/payments/PaymentLinkModal'

interface Stage { id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean }
interface Pipeline { id: string; name: string; isDefault: boolean; stages: Stage[]; _count: { deals: number } }
interface Deal {
  id: string; title: string; value: string; status: string
  probability?: number | null; expectedCloseAt?: string | null; createdAt: string
  assignedToUserId?: string | null
  contact: { id: string; name: string; phone?: string | null; leadTemperature?: string | null; leadScore?: number | null }
  stage: { id: string; name: string; color: string }
}
interface ContactSearch { id: string; name: string; phone?: string | null; email?: string | null }
interface WorkspaceUser { id: string; name: string | null; email: string }

// ── Analytics types ────────────────────────────────────────────────────────────
interface StageMetric {
  stageId: string
  stageName: string
  dealCount: number
  totalValue: number
  avgDaysInStage: number | null
}
interface AnalyticsData {
  totalDeals: number
  totalValue: number
  weightedValue: number
  wonValue: number
  lostCount: number
  stageMetrics: StageMetric[]
  lostReasons: Array<{ reason: string; count: number }>
}

interface RoiSummary {
  workspaceROAS: number
  totalRevenue30d: number
  totalAdSpend30d: number
  contactRevenues: Record<string, number>
  stageStats: Record<string, { dealCount: number; totalValue: number }>
}

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#a78bfa']

function formatCLPFull(v: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M CLP`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`
  return formatCLPFull(v)
}

function formatCLP(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n) || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) }
function TempIcon({ t }: { t?: string | null }) {
  if (t === 'HOT') return <Flame className="h-3 w-3 text-red-500" />
  if (t === 'WARM') return <Thermometer className="h-3 w-3 text-amber-500" />
  return <Snowflake className="h-3 w-3 text-sky-400" />
}

// ── Analytics Panel ────────────────────────────────────────────────────────────
function AnalyticsPanel({ data, loading, error }: {
  data: AnalyticsData | null
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-destructive flex items-center gap-2">
        <X className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Total deals en pipeline</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{data.totalDeals}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="text-2xl font-bold tabular-nums mt-1 truncate">{formatCompact(data.totalValue)}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Valor ponderado
            <span
              title="valor × probabilidad promedio"
              className="cursor-help text-muted-foreground/60 text-[9px] border rounded-full w-3.5 h-3.5 inline-flex items-center justify-center shrink-0"
            >?</span>
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1 truncate">{formatCompact(data.weightedValue)}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Ganado este pipeline</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 truncate">{formatCompact(data.wonValue)}</p>
        </div>
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stage funnel – horizontal bar chart */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Embudo por etapa</p>
          {data.stageMetrics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos de etapas</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(120, data.stageMetrics.length * 36)}>
              <BarChart
                layout="vertical"
                data={data.stageMetrics}
                margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="stageGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <XAxis type="number" dataKey="dealCount" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="stageName" tick={{ fontSize: 11 }} width={90} />
                <RechartTooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: unknown, _name: unknown, props: { payload?: StageMetric }) => {
                    const count = value as number
                    const days = props.payload?.avgDaysInStage
                    return [
                      `${count} deal${count !== 1 ? 's' : ''}${days != null ? ` · ${days.toFixed(1)}d prom.` : ''}`,
                      'Etapa'
                    ]
                  }}
                />
                <Bar dataKey="dealCount" fill="url(#stageGrad)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lost reasons – pie chart */}
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Razones de pérdida</p>
          {data.lostReasons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground gap-1">
              <span className="text-2xl">🎉</span>
              Sin deals perdidos aún
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={150}>
                <PieChart>
                  <Pie
                    data={data.lostReasons}
                    dataKey="count"
                    nameKey="reason"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label={false}
                  >
                    {data.lostReasons.map((_entry, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartTooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: unknown, name: unknown) => {
                      const count = value as number
                      return [`${count} deal${count !== 1 ? 's' : ''}`, name as string]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 min-w-0">
                {data.lostReasons.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground">{r.reason}</span>
                    <span className="font-bold shrink-0 ml-auto">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 3 — Stage velocity table */}
      <div className="rounded-lg border bg-muted/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Etapa</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Deals</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Valor total</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Días promedio</th>
            </tr>
          </thead>
          <tbody>
            {data.stageMetrics.map((s, idx) => (
              <tr key={s.stageId} className={idx % 2 !== 0 ? 'bg-muted/20' : ''}>
                <td className="px-3 py-2 font-medium">{s.stageName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.dealCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCLPFull(s.totalValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {s.avgDaysInStage != null ? `${s.avgDaysInStage.toFixed(1)}d` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Stage Settings Panel ───────────────────────────────────────────────────────
function StageSettingsPanel({
  stages: externalStages, pipelineId, onRefresh
}: {
  stages: Stage[]
  pipelineId: string
  onRefresh: () => Promise<void>
}) {
  const [stages, setStages] = useState<Stage[]>(externalStages)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [adding, setAdding] = useState(false)
  const [stageErrors, setStageErrors] = useState<Record<string, string>>({})

  useEffect(() => { setStages(externalStages) }, [externalStages])

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      await fetchAPI(`/crm/pipelines/${pipelineId}/stages`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor })
      })
      setNewName('')
      setNewColor('#6366f1')
      await onRefresh()
      toast.success('Etapa creada')
    } catch (err: any) { toast.error(err.message) }
    finally { setAdding(false) }
  }

  async function handleUpdateName(stageId: string, name: string) {
    try {
      await fetchAPI(`/crm/pipelines/${pipelineId}/stages/${stageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      })
      await onRefresh()
    } catch (err: any) { toast.error(err.message) }
  }

  async function handleUpdateColor(stageId: string, color: string) {
    try {
      await fetchAPI(`/crm/pipelines/${pipelineId}/stages/${stageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ color })
      })
      await onRefresh()
    } catch (err: any) { toast.error(err.message) }
  }

  async function handleDelete(stageId: string) {
    setStageErrors(prev => { const next = { ...prev }; delete next[stageId]; return next })
    try {
      await fetchAPI(`/crm/pipelines/${pipelineId}/stages/${stageId}`, { method: 'DELETE' })
      await onRefresh()
      toast.success('Etapa eliminada')
    } catch (err: any) {
      if (err.message?.includes('Mueve los deals')) {
        setStageErrors(prev => ({ ...prev, [stageId]: 'Mueve los deals primero' }))
      } else {
        toast.error(err.message)
      }
    }
  }

  async function handleMove(stageId: string, direction: 'up' | 'down') {
    const idx = stages.findIndex(s => s.id === stageId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= stages.length) return
    const newStages = [...stages]
    ;[newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]]
    setStages(newStages) // optimistic
    try {
      await fetchAPI(`/crm/pipelines/${pipelineId}/stages/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedIds: newStages.map(s => s.id) })
      })
      await onRefresh()
    } catch (err: any) {
      setStages(externalStages) // rollback
      toast.error(err.message)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Etapas del pipeline</p>

      <div className="space-y-1.5">
        {stages.map((stage, idx) => (
          <div key={stage.id} className="space-y-0.5">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
              {/* Visual drag handle */}
              <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />

              {/* Color dot + picker */}
              <label className="shrink-0 cursor-pointer" title="Cambiar color">
                <div
                  className="w-3.5 h-3.5 rounded-full border border-border/50 shadow-sm"
                  style={{ backgroundColor: stage.color }}
                />
                <input
                  type="color"
                  value={stage.color}
                  className="sr-only"
                  onChange={e =>
                    setStages(prev =>
                      prev.map(s => s.id === stage.id ? { ...s, color: e.target.value } : s)
                    )
                  }
                  onBlur={e => handleUpdateColor(stage.id, e.target.value)}
                />
              </label>

              {/* Inline name input */}
              <input
                key={`${stage.id}-${stage.name}`}
                className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
                defaultValue={stage.name}
                onBlur={e => {
                  const val = e.target.value.trim()
                  if (val && val !== stage.name) handleUpdateName(stage.id, val)
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />

              {/* Won / Lost chips (read-only) */}
              {stage.isWon && (
                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">
                  Ganado
                </span>
              )}
              {stage.isLost && (
                <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full shrink-0">
                  Perdido
                </span>
              )}

              {/* Up / Down arrows */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleMove(stage.id, 'up')}
                  disabled={idx === 0}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover arriba"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleMove(stage.id, 'down')}
                  disabled={idx === stages.length - 1}
                  className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Mover abajo"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(stage.id)}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground/40 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                title="Eliminar etapa"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {stageErrors[stage.id] && (
              <p className="text-xs text-red-600 pl-10">{stageErrors[stage.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* New stage row */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <label className="shrink-0 cursor-pointer" title="Elegir color">
          <div
            className="w-3.5 h-3.5 rounded-full border border-border/50 shadow-sm"
            style={{ backgroundColor: newColor }}
          />
          <input
            type="color"
            value={newColor}
            className="sr-only"
            onChange={e => setNewColor(e.target.value)}
          />
        </label>
        <input
          className="flex-1 bg-transparent text-sm focus:outline-none min-w-0 placeholder:text-muted-foreground"
          placeholder="Nombre de nueva etapa..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="shrink-0 h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          {adding ? 'Agregando...' : 'Agregar'}
        </Button>
      </div>
    </div>
  )
}

// ── Lost Reason Dialog ─────────────────────────────────────────────────────────
const LOST_CHIPS = ['Precio', 'Eligió competencia', 'Sin presupuesto', 'No responde', 'Fuera de zona'] as const

function LostReasonDialog({
  open, onClose, onConfirm
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(reason)
      setReason('')
      onClose()
    } catch {
      // error already toasted by onConfirm
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) { setReason(''); onClose() } }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>¿Por qué se perdió este deal?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex flex-wrap gap-2">
            {LOST_CHIPS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setReason(prev => prev === c ? '' : c)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  reason === c
                    ? 'bg-red-100 border-red-300 text-red-700'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground border-transparent hover:border-muted-foreground/30'
                ].join(' ')}
              >
                {c}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Motivo adicional (opcional)..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { setReason(''); onClose() }}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Cerrando...' : 'Marcar como Perdido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Deal Card ──────────────────────────────────────────────────────────────────
function DealCard({
  deal, onWon, onLost, onEdit, onDelete, onAssign, onCobrar, workspaceUsers, contactRevenues = {}, overlay = false
}: {
  deal: Deal
  onWon: (id: string) => void
  onLost: (id: string) => void
  onEdit: (deal: Deal) => void
  onDelete: (id: string) => void
  onAssign: (dealId: string, userId: string | null) => void
  onCobrar: (deal: Deal) => void
  workspaceUsers: WorkspaceUser[]
  contactRevenues?: Record<string, number>
  overlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const prob = deal.probability ?? null
  const probBar = prob != null ? (prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-500' : 'bg-red-500') : null
  const days = daysAgo(deal.createdAt)
  const style = !overlay ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1, touchAction: 'none' } : {}
  const assignedUser = workspaceUsers.find(u => u.id === deal.assignedToUserId) ?? null

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await onDelete(deal.id)
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <div
      ref={!overlay ? setNodeRef : undefined}
      style={style}
      className={[
        'rounded-lg border bg-card text-card-foreground shadow-sm select-none transition-shadow',
        overlay ? 'rotate-1 shadow-2xl ring-2 ring-primary/30' : 'hover:shadow-md',
        deal.status !== 'OPEN' ? 'opacity-55' : '',
      ].join(' ')}
    >
      {/* Drag handle row */}
      <div
        className={['px-3 pt-2.5 flex items-start gap-1.5', !overlay ? 'cursor-grab active:cursor-grabbing' : ''].join(' ')}
        {...(!overlay ? listeners : {})}
        {...(!overlay ? attributes : {})}
      >
        {!overlay && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <TempIcon t={deal.contact.leadTemperature} />
            {deal.status === 'WON' && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 rounded-full">Ganado</span>}
            {deal.status === 'LOST' && <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 rounded-full">Perdido</span>}
          </div>
          <p className="text-sm font-semibold leading-snug line-clamp-2">{deal.title}</p>
        </div>
      </div>

      {/* Clickable body → opens edit modal */}
      <div
        className={!overlay ? 'cursor-pointer' : ''}
        onClick={!overlay ? (e) => { e.stopPropagation(); onEdit(deal) } : undefined}
      >
        {/* Contact */}
        <div className="px-3 pt-1 pb-0">
          <Link
            href={`/dashboard/crm/contacts/${deal.contact.id}`}
            className="text-xs text-primary hover:underline font-medium block truncate"
            onClick={e => e.stopPropagation()}
          >
            {deal.contact.name}
          </Link>
          {deal.contact.phone && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone className="h-2.5 w-2.5" />{deal.contact.phone.replace(/@.*$/, '')}
            </p>
          )}
        </div>

        {/* Value + probability */}
        <div className="px-3 pt-2">
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-bold tabular-nums">{formatCLP(deal.value)}</p>
            {!overlay && <Pencil className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
          </div>
          {!overlay && contactRevenues[deal.contact.id] > 0 && (
            <div className="mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                Revenue real: {formatCLPFull(contactRevenues[deal.contact.id])}
              </span>
            </div>
          )}
          {probBar && prob != null && (
            <div className="mt-1.5">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Prob.</span><span className="font-semibold">{prob}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${probBar}`} style={{ width: `${prob}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Assignee chip */}
        {!overlay && (
          <div className="px-3 pt-1.5" onClick={e => e.stopPropagation()}>
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Asignar vendedor"
                >
                  <User className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate max-w-[120px]">
                    {assignedUser ? (assignedUser.name ?? assignedUser.email) : 'Sin asignar'}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1" align="start">
                <button
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground"
                  onClick={() => { onAssign(deal.id, null); setAssignOpen(false) }}
                >
                  Sin asignar
                </button>
                {workspaceUsers.map(u => (
                  <button
                    key={u.id}
                    className={[
                      'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2',
                      deal.assignedToUserId === u.id ? 'font-semibold text-primary' : ''
                    ].join(' ')}
                    onClick={() => { onAssign(deal.id, u.id); setAssignOpen(false) }}
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold shrink-0">
                      {(u.name ?? u.email)[0].toUpperCase()}
                    </div>
                    <span className="truncate">{u.name ?? u.email}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pt-2 pb-2.5 flex items-center justify-between border-t mt-2">
        <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{days}d</span>
          {deal.expectedCloseAt && (
            <span className="flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(deal.expectedCloseAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
        {!overlay && (
          <div className="flex items-center gap-1">
            {deal.status === 'OPEN' && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onWon(deal.id) }}
                  className="h-5 w-5 rounded flex items-center justify-center hover:bg-emerald-100 text-muted-foreground hover:text-emerald-600 transition-colors"
                  title="Marcar ganado"
                >
                  <Trophy className="h-3 w-3" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onLost(deal.id) }}
                  className="h-5 w-5 rounded flex items-center justify-center hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                  title="Marcar perdido"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              onClick={e => { e.stopPropagation(); onCobrar(deal) }}
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-violet-100 text-muted-foreground hover:text-violet-600 transition-colors"
              title="Crear link de cobro"
            >
              <CreditCard className="h-3 w-3" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setDeleteOpen(true) }}
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-red-100 text-muted-foreground/40 hover:text-red-600 transition-colors"
              title="Eliminar deal"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>

    {/* Delete confirmation dialog — rendered outside the draggable div */}
    <AlertDialog open={deleteOpen} onOpenChange={v => { if (!deleting) setDeleteOpen(v) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este deal?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El deal <strong>{deal.title}</strong> será eliminado permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

// ── Stage Column ───────────────────────────────────────────────────────────────
function StageColumn({ stage, deals, onAdd, onWon, onLost, onEdit, onDelete, onAssign, onCobrar, workspaceUsers, contactRevenues }: {
  stage: Stage; deals: Deal[]
  onAdd: (stageId: string) => void
  onWon: (id: string) => void
  onLost: (id: string) => void
  onEdit: (deal: Deal) => void
  onDelete: (id: string) => void
  onAssign: (dealId: string, userId: string | null) => void
  onCobrar: (deal: Deal) => void
  workspaceUsers: WorkspaceUser[]
  contactRevenues: Record<string, number>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const total = deals.reduce((s, d) => s + parseFloat(d.value || '0'), 0)

  return (
    <div className="w-64 shrink-0 flex flex-col rounded-xl border bg-background/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b" style={{ borderBottomColor: stage.color, borderBottomWidth: 2 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
            <span className="text-sm font-semibold truncate">{stage.name}</span>
            <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-1.5 shrink-0">{deals.length}</span>
          </div>
          <button
            onClick={() => onAdd(stage.id)}
            className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="Agregar deal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs font-mono text-muted-foreground mt-1">{formatCLP(total)}</p>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 p-2 space-y-2 min-h-32 transition-colors',
          isOver ? 'bg-primary/5' : 'bg-muted/10'
        ].join(' ')}
      >
        {deals.map(deal => (
          <DealCard key={deal.id} deal={deal} onWon={onWon} onLost={onLost} onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onCobrar={onCobrar} workspaceUsers={workspaceUsers} contactRevenues={contactRevenues} />
        ))}
        {deals.length === 0 && (
          <button
            onClick={() => onAdd(stage.id)}
            className="w-full h-16 rounded-lg border border-dashed border-muted-foreground/25 flex items-center justify-center text-xs text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-3 w-3 mr-1" /> Nuevo deal
          </button>
        )}
      </div>
    </div>
  )
}

// ── Create / Edit Deal Modal ───────────────────────────────────────────────────
function CreateDealModal({
  open, onClose, stages, defaultStageId, pipelineId, onCreated,
  editDeal = null, onUpdated
}: {
  open: boolean; onClose: () => void; stages: Stage[]
  defaultStageId: string; pipelineId: string; onCreated: (deal: Deal) => void
  editDeal?: Deal | null; onUpdated?: (deal: Deal) => void
}) {
  const isEdit = editDeal != null
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [probability, setProbability] = useState('50')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [stageId, setStageId] = useState(defaultStageId)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactSearch[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSearch | null>(null)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Initialize fields when modal opens
  useEffect(() => {
    if (!open) return
    if (isEdit && editDeal) {
      setTitle(editDeal.title)
      setValue(editDeal.value || '')
      setProbability(editDeal.probability?.toString() ?? '50')
      setExpectedCloseAt(editDeal.expectedCloseAt ? editDeal.expectedCloseAt.substring(0, 10) : '')
    } else {
      setStageId(defaultStageId)
    }
  }, [open, editDeal, isEdit, defaultStageId])

  useEffect(() => {
    if (!open || isEdit) return
    clearTimeout(timerRef.current)
    if (!contactSearch.trim() || selectedContact) { setContactResults([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await fetchAPI(`/crm/contacts?search=${encodeURIComponent(contactSearch)}&limit=8`)
        setContactResults(Array.isArray(data) ? data : (data?.contacts ?? []))
      } catch { setContactResults([]) }
    }, 300)
  }, [contactSearch, selectedContact, open, isEdit])

  function reset() {
    setTitle(''); setValue(''); setProbability('50'); setExpectedCloseAt('')
    setSelectedContact(null); setContactSearch(''); setContactResults([])
  }

  async function handleSave() {
    if (isEdit && editDeal) {
      if (!title.trim()) return toast.error('El título es obligatorio')
      setSaving(true)
      try {
        const updated = await fetchAPI(`/crm/deals/${editDeal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title.trim(),
            value: parseFloat(value) || 0,
            probability: parseInt(probability) || null,
            expectedCloseAt: expectedCloseAt || null
          })
        })
        onUpdated?.(updated)
        toast.success('Deal actualizado')
        reset(); onClose()
      } catch (err: any) { toast.error(err.message) }
      finally { setSaving(false) }
      return
    }

    if (!title.trim() || !selectedContact) return toast.error('Título y contacto son obligatorios')
    setSaving(true)
    try {
      const deal = await fetchAPI('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), contactId: selectedContact.id,
          pipelineId, stageId,
          value: parseFloat(value) || 0,
          probability: parseInt(probability) || null,
          expectedCloseAt: expectedCloseAt || null
        })
      })
      onCreated(deal)
      toast.success('Deal creado')
      reset(); onClose()
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const prob = parseInt(probability) || 50
  const probColor = prob >= 70 ? 'text-emerald-600' : prob >= 40 ? 'text-amber-600' : 'text-red-600'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit
              ? <><Pencil className="h-4 w-4" /> Editar Deal</>
              : <><KanbanSquare className="h-4 w-4" /> Nuevo Deal</>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input placeholder="Ej. Instalación Solar 10 paneles" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              {selectedContact ? (
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold shrink-0">
                    {selectedContact.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedContact.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{selectedContact.phone?.replace(/@.*$/, '') ?? selectedContact.email}</p>
                  </div>
                  <button onClick={() => { setSelectedContact(null); setContactSearch('') }} className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Buscar por nombre o teléfono..."
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                  />
                  {contactResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {contactResults.map(c => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                          onMouseDown={e => { e.preventDefault(); setSelectedContact(c); setContactResults([]) }}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold shrink-0">
                            {c.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.phone?.replace(/@.*$/, '') ?? c.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (CLP)</Label>
              <Input type="number" placeholder="3500000" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cierre estimado</Label>
              <Input type="date" value={expectedCloseAt} onChange={e => setExpectedCloseAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label>Probabilidad de cierre</Label>
              <span className={`text-sm font-bold tabular-nums ${probColor}`}>{prob}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="5" value={probability}
              onChange={e => setProbability(e.target.value)}
              className="w-full accent-primary"
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || (!isEdit && !selectedContact)}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Stage ROI Panel ────────────────────────────────────────────────────────────
function StageRoiPanel({ roi, loading, stages }: {
  roi: RoiSummary | null
  loading: boolean
  stages: Stage[]
}) {
  if (loading) {
    return (
      <div className="mt-4 border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">ROI por etapa</h3>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      </div>
    )
  }

  // Degrade gracefully: if the roi-summary failed, don't render the panel.
  if (!roi) return null

  const rows = stages
    .map(stage => ({ stage, stat: roi.stageStats?.[stage.id] }))
    .filter((r): r is { stage: Stage; stat: { dealCount: number; totalValue: number } } =>
      r.stat != null && r.stat.dealCount > 0)

  if (rows.length === 0) return null

  const hasAdSpend = roi.totalAdSpend30d > 0

  return (
    <div className="mt-4 border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">ROI por etapa</h3>
        {hasAdSpend ? (
          <span
            className={`text-xs font-semibold ${roi.workspaceROAS > 1 ? 'text-green-500' : 'text-red-500'}`}
            title="ROAS del workspace (ingresos ÷ ad spend, últimos 30 días)"
          >
            ROAS {roi.workspaceROAS.toFixed(2)}x
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Sin datos de ad spend para calcular ROAS
          </span>
        )}
      </div>
      <div className="space-y-2">
        {rows.map(({ stage, stat }) => (
          <div key={stage.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="truncate">{stage.name}</span>
            </span>
            <div className="flex gap-4 shrink-0">
              <span>{stat.dealCount} deal{stat.dealCount !== 1 ? 's' : ''}</span>
              <span className="tabular-nums">{formatCLPFull(stat.totalValue)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PipelinesClient() {
  const [mounted, setMounted] = useState(false)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loadingPipelines, setLoadingPipelines] = useState(true)
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [creatingPipeline, setCreatingPipeline] = useState(false)
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const [createModal, setCreateModal] = useState<{ open: boolean; stageId: string }>({ open: false, stageId: '' })
  const [lostDialog, setLostDialog] = useState<{ open: boolean; dealId: string }>({ open: false, dealId: '' })
  const [editModal, setEditModal] = useState<{ open: boolean; deal: Deal | null }>({ open: false, deal: null })
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([])
  const [roiSummary, setRoiSummary] = useState<RoiSummary | null>(null)
  const [roiLoading, setRoiLoading] = useState(false)
  const contactRevenues = roiSummary?.contactRevenues ?? {}
  const [cobrarModal, setCobrarModal] = useState<{ open: boolean; deal: Deal | null }>({ open: false, deal: null })
  const [confirmWonDealId, setConfirmWonDealId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/crm/workspace/users')
      .then((data: WorkspaceUser[]) => setWorkspaceUsers(Array.isArray(data) ? data : []))
      .catch(() => setWorkspaceUsers([]))
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/crm/pipelines')
      .then((data: Pipeline[]) => {
        setPipelines(data)
        if (data.length > 0) setSelectedPipelineId(data[0].id)
      })
      .catch(console.error)
      .finally(() => setLoadingPipelines(false))
  }, [mounted])

  useEffect(() => {
    if (!mounted || !selectedPipelineId) return
    let cancelled = false
    setLoadingDeals(true)
    fetchAPI(`/crm/deals?pipelineId=${selectedPipelineId}`)
      .then(data => { if (!cancelled) setDeals(data) })
      .catch(err => { if (!cancelled) console.error(err) })
      .finally(() => { if (!cancelled) setLoadingDeals(false) })
    return () => { cancelled = true }
  }, [mounted, selectedPipelineId])

  useEffect(() => {
    if (!mounted || !selectedPipelineId || !showAnalytics) return
    let cancelled = false
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    fetchAPI(`/crm/pipelines/${selectedPipelineId}/analytics`)
      .then((data: AnalyticsData) => { if (!cancelled) setAnalytics(data) })
      .catch((err: Error) => { if (!cancelled) setAnalyticsError(err.message ?? 'Error al cargar analítica') })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false) })
    return () => { cancelled = true }
  }, [mounted, selectedPipelineId, showAnalytics])

  useEffect(() => {
    if (!mounted || !selectedPipelineId) return
    let cancelled = false
    setRoiLoading(true)
    fetchAPI(`/crm/pipelines/${selectedPipelineId}/roi-summary`)
      .then((data: RoiSummary) => {
        if (!cancelled) setRoiSummary(data)
      })
      .catch(() => { if (!cancelled) setRoiSummary(null) })
      .finally(() => { if (!cancelled) setRoiLoading(false) })
    return () => { cancelled = true }
  }, [mounted, selectedPipelineId])

  const handleDragStart = useCallback((event: any) => {
    setActiveDeal(deals.find(d => d.id === event.active.id) ?? null)
  }, [deals])

  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event
    setActiveDeal(null)
    if (!over || !active) return
    const deal = deals.find(d => d.id === active.id)
    if (!deal || deal.stage.id === over.id || deal.status !== 'OPEN') return
    const targetStage = pipelines.find(p => p.id === selectedPipelineId)?.stages.find(s => s.id === over.id)
    if (!targetStage) return
    const newStatus = targetStage.isWon ? 'WON' : targetStage.isLost ? 'LOST' : 'OPEN'
    // Optimistic
    setDeals(prev => prev.map(d => d.id === deal.id
      ? { ...d, stage: { id: targetStage.id, name: targetStage.name, color: targetStage.color }, status: newStatus }
      : d))
    try {
      await fetchAPI(`/crm/deals/${deal.id}/move`, { method: 'PATCH', body: JSON.stringify({ stageId: over.id }) })
      toast.success(newStatus === 'WON' ? `🏆 Ganado en ${targetStage.name}` : `Movido a ${targetStage.name}`)
    } catch {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: deal.stage, status: deal.status } : d))
      toast.error('Error al mover el deal')
    }
  }, [deals, pipelines, selectedPipelineId])

  const handleWon = useCallback((dealId: string) => {
    setConfirmWonDealId(dealId)
  }, [])

  const handleWonConfirm = useCallback(async () => {
    const dealId = confirmWonDealId
    if (!dealId) return
    setConfirmWonDealId(null)
    try {
      await fetchAPI(`/crm/deals/${dealId}/close`, { method: 'PATCH', body: JSON.stringify({ outcome: 'WON' }) })
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: 'WON' } : d))
      toast.success('🏆 ¡Deal ganado!')
    } catch (err: any) { toast.error(err.message) }
  }, [confirmWonDealId])

  const handleLostConfirm = useCallback(async (reason: string) => {
    const dealId = lostDialog.dealId
    // Optimistic update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: 'LOST' } : d))
    try {
      await fetchAPI(`/crm/deals/${dealId}/close`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome: 'LOST', lostReason: reason || undefined })
      })
      toast.success('Deal cerrado como perdido')
    } catch (err: any) {
      // Rollback optimistic update
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, status: 'OPEN' } : d))
      toast.error(err.message)
      throw err
    }
  }, [lostDialog.dealId])

  const handleEdit = useCallback((deal: Deal) => {
    setEditModal({ open: true, deal })
  }, [])

  const handleDelete = useCallback(async (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId))
    try {
      await fetchAPI(`/crm/deals/${dealId}`, { method: 'DELETE' })
      toast.success('Deal eliminado')
    } catch (err: any) {
      // Rollback: re-fetch deals so the removed deal reappears
      if (selectedPipelineId) {
        fetchAPI(`/crm/deals?pipelineId=${selectedPipelineId}`)
          .then(setDeals)
          .catch(console.error)
      }
      toast.error(err.message ?? 'Error al eliminar el deal')
      throw err
    }
  }, [selectedPipelineId])

  const handleAssign = useCallback(async (dealId: string, userId: string | null) => {
    const userName = userId ? (workspaceUsers.find(u => u.id === userId)?.name ?? workspaceUsers.find(u => u.id === userId)?.email ?? '') : null
    const prevDeals = deals
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, assignedToUserId: userId } : d))
    try {
      await fetchAPI(`/crm/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToUserId: userId })
      })
      toast.success(userName ? `Deal asignado a ${userName}` : 'Asignación removida')
    } catch (err: any) {
      setDeals(prevDeals)
      toast.error(err.message ?? 'Error al asignar el deal')
    }
  }, [workspaceUsers, deals])

  const handleCobrar = useCallback((deal: Deal) => {
    setCobrarModal({ open: true, deal })
  }, [])

  const refreshPipelines = useCallback(async () => {
    try {
      const data: Pipeline[] = await fetchAPI('/crm/pipelines')
      setPipelines(data)
    } catch (err: any) { toast.error(err.message ?? 'Error al refrescar pipeline') }
  }, [])

  async function handleCreatePipeline() {
    setCreatingPipeline(true)
    try {
      const created = await fetchAPI('/crm/pipelines', { method: 'POST', body: JSON.stringify({ name: 'Pipeline de Ventas' }) })
      setPipelines([created])
      setSelectedPipelineId(created.id)
    } catch (err: any) { toast.error(err.message) }
    finally { setCreatingPipeline(false) }
  }

  if (!mounted || loadingPipelines) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-14 rounded-t-xl" />
            <Skeleton className="h-32 rounded-b-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <KanbanSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold">Sin pipeline configurado</p>
          <p className="text-sm text-muted-foreground mt-1">Crea tu primer pipeline para gestionar oportunidades de venta.</p>
        </div>
        <Button onClick={handleCreatePipeline} disabled={creatingPipeline} size="lg" className="gap-2">
          <Plus className="w-4 h-4" />
          {creatingPipeline ? 'Creando...' : 'Crear Pipeline de Ventas'}
        </Button>
      </div>
    )
  }

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages ?? []
  const openDeals = deals.filter(d => d.status === 'OPEN')
  const wonDeals = deals.filter(d => d.status === 'WON')

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-background font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          value={selectedPipelineId ?? ''}
          onChange={e => setSelectedPipelineId(e.target.value)}
        >
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {loadingDeals && <span className="text-xs text-muted-foreground animate-pulse">Actualizando...</span>}

        <Button
          variant={showAnalytics ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setShowAnalytics(v => !v)}
        >
          <BarChart2 className="h-4 w-4" />
          Analítica
        </Button>

        <Button
          variant={showSettings ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setShowSettings(v => !v)}
          title="Configurar etapas"
        >
          <Settings className="h-4 w-4" />
          Configurar etapas
        </Button>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium">
            <div className="w-2 h-2 rounded-full bg-primary" />
            {openDeals.length} activos · {formatCLP(openDeals.reduce((s, d) => s + parseFloat(d.value||'0'), 0))}
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-emerald-500" />
            {wonDeals.length} ganados
          </span>
        </div>
      </div>

      {/* Analytics panel */}
      {showAnalytics && (
        <AnalyticsPanel data={analytics} loading={analyticsLoading} error={analyticsError} />
      )}

      {/* Stage settings panel */}
      {showSettings && selectedPipelineId && (
        <StageSettingsPanel
          stages={stages}
          pipelineId={selectedPipelineId}
          onRefresh={refreshPipelines}
        />
      )}

      {/* Kanban board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-6 items-start">
          {stages.map(stage => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={deals.filter(d => d.stage.id === stage.id)}
              onAdd={stageId => setCreateModal({ open: true, stageId })}
              onWon={handleWon}
              onLost={id => setLostDialog({ open: true, dealId: id })}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAssign={handleAssign}
              onCobrar={handleCobrar}
              workspaceUsers={workspaceUsers}
              contactRevenues={contactRevenues}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDeal && <DealCard deal={activeDeal} onWon={() => {}} onLost={() => {}} onEdit={() => {}} onDelete={() => Promise.resolve()} onAssign={() => {}} onCobrar={() => {}} workspaceUsers={[]} overlay />}
        </DragOverlay>
      </DndContext>

      {/* ROI por etapa */}
      <StageRoiPanel roi={roiSummary} loading={roiLoading} stages={stages} />

      {/* Create Deal Modal */}
      {selectedPipelineId && stages.length > 0 && (
        <CreateDealModal
          open={createModal.open}
          onClose={() => setCreateModal({ open: false, stageId: '' })}
          stages={stages}
          defaultStageId={createModal.stageId || stages[0].id}
          pipelineId={selectedPipelineId}
          onCreated={deal => setDeals(prev => [...prev, deal])}
        />
      )}

      {/* Edit Deal Modal */}
      {editModal.deal && stages.length > 0 && (
        <CreateDealModal
          open={editModal.open}
          onClose={() => setEditModal({ open: false, deal: null })}
          stages={stages}
          defaultStageId={editModal.deal.stage.id}
          pipelineId={selectedPipelineId ?? ''}
          onCreated={() => {}}
          editDeal={editModal.deal}
          onUpdated={updated => setDeals(prev => prev.map(d => d.id === updated.id ? updated : d))}
        />
      )}

      {/* Lost Reason Dialog */}
      <LostReasonDialog
        open={lostDialog.open}
        onClose={() => setLostDialog({ open: false, dealId: '' })}
        onConfirm={handleLostConfirm}
      />

      {/* Won confirmation dialog */}
      <AlertDialog open={confirmWonDealId != null} onOpenChange={v => { if (!v) setConfirmWonDealId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar este deal como ganado?</AlertDialogTitle>
            <AlertDialogDescription>
              El deal se cerrará como ganado y se contabilizará en las métricas del pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWonConfirm}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Marcar como Ganado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Link Modal */}
      {cobrarModal.deal && (
        <PaymentLinkModal
          open={cobrarModal.open}
          onClose={() => setCobrarModal({ open: false, deal: null })}
          deal={{
            id: cobrarModal.deal.id,
            value: parseFloat(cobrarModal.deal.value) || null,
            title: cobrarModal.deal.title,
            contactId: cobrarModal.deal.contact.id
          }}
          contactName={cobrarModal.deal.contact.name}
        />
      )}
    </div>
  )
}
