"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAPI } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { formatCurrency, getCurrencySymbol } from "@/lib/formatting"
import { useSmartSkeleton } from "@/hooks/useSmartSkeleton"
import { TiltCard } from "@/components/ui/tilt-card"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign, AlertTriangle, TrendingDown, TrendingUp, Settings2, Edit2, Plus, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"

export default function FinancesPage() {
    const router = useRouter()
    const { user } = useUserStore()
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds } = useCampaignStore()
    const queryClient = useQueryClient()

    // Modals state
    const [isTaxModalOpen, setIsTaxModalOpen] = useState(false)
    const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false)
    const [isCustomFeeModalOpen, setIsCustomFeeModalOpen] = useState(false)
    const [isFixedCostModalOpen, setIsFixedCostModalOpen] = useState(false)
    
    // Form management for modals
    const [formGateway, setFormGateway] = useState({ gatewayPercent: '3.49', gatewayFixed: '0.30' })
    const [formTax, setFormTax] = useState({ taxRate: '19.00' })
    const [formCustomFee, setFormCustomFee] = useState({ name: '', type: 'percent', amount: '' })
    const [formFixedCost, setFormFixedCost] = useState({ name: '', category: 'Suscripción', amount: '' })

    const [editingCustomFee, setEditingCustomFee] = useState<any>(null)
    const [editingFixedCost, setEditingFixedCost] = useState<any>(null)

    // Confirm delete state
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'fee' | 'cost', id: string, label: string } | null>(null)

    const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const exclusions = disabledCampaignIds.length > 0 ? `&excludeCampaigns=${disabledCampaignIds.join(',')}` : ''
    const rangeParams = (fromStr && toStr ? `from=${fromStr}&to=${toStr}` : 'days=7') + exclusions

    // Queries
    const { data: financeSummary, isLoading: summaryLoading } = useQuery({
        queryKey: ['metrics', 'summary', { fromStr, toStr, exclusions }],
        queryFn: () => fetchAPI(`/metrics/summary?${rangeParams}`),
        refetchInterval: 60_000
    })

    const { data: financesData, isLoading: financesLoading } = useQuery({
        queryKey: ['metrics', 'finances'],
        queryFn: () => fetchAPI('/metrics/finances'),
        refetchInterval: 300_000
    })

    const { data: performanceRes = [], isLoading: perfLoading } = useQuery({
        queryKey: ['metrics', 'sku-performance', { fromStr, toStr, exclusions }],
        queryFn: () => fetchAPI(`/metrics/sku-performance?${rangeParams}`)
    })

    const fixedCosts = financesData?.fixedCosts || []
    const globalSettings = financesData?.settings || {
        taxRate: 0,
        gatewayPercent: 3.49,
        gatewayFixed: 0.30,
        customFees: [],
        currency: 'usd'
    }

    const lowMarginAlerts = Array.isArray(performanceRes)
        ? performanceRes.filter((p: any) => (p.marginRaw || 0) < 20).map((p: any) => ({ ...p, target: "20.0%" }))
        : []

    const isLoading = summaryLoading || financesLoading || perfLoading

    // Sync form state when financesData loads
    useEffect(() => {
        if (financesData?.settings) {
            setFormTax({ taxRate: Number(financesData.settings.taxRate || 19.00).toFixed(2) })
            setFormGateway({
                gatewayPercent: Number(financesData.settings.gatewayPercent || 3.49).toFixed(2),
                gatewayFixed: Number(financesData.settings.gatewayFixed || 0.30).toFixed(2),
            })
        }
    }, [financesData])

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
        }
    }, [user?.role, router])

    // Mutations
    const globalSettingsMutation = useMutation({
        mutationFn: (payload: any) => fetchAPI('/settings/global', {
            method: 'POST',
            body: JSON.stringify(payload)
        }),
        onSuccess: () => {
            toast.success('Parámetros actualizados')
            queryClient.invalidateQueries({ queryKey: ['metrics', 'finances'] })
            queryClient.invalidateQueries({ queryKey: ['metrics', 'summary'] })
        },
        onError: () => toast.error('Error al guardar los parámetros')
    })

    const fixedCostMutation = useMutation({
        mutationFn: (payload: any) => fetchAPI('/metrics/finances/fixed-costs', {
            method: 'POST',
            body: JSON.stringify(payload)
        }),
        onSuccess: (data: any) => {
            toast.success(editingFixedCost ? 'Costo actualizado' : 'Costo agregado')
            setIsFixedCostModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['metrics', 'finances'] })
            queryClient.invalidateQueries({ queryKey: ['metrics', 'summary'] })
        },
        onError: () => toast.error('Error al guardar costo fijo')
    })

    const deleteFixedCostMutation = useMutation({
        mutationFn: (id: string) => fetchAPI(`/metrics/finances/fixed-costs/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Costo fijo eliminado')
            queryClient.invalidateQueries({ queryKey: ['metrics', 'finances'] })
            queryClient.invalidateQueries({ queryKey: ['metrics', 'summary'] })
        },
        onError: () => toast.error('Error al eliminar costo fijo')
    })

    // Handlers
    const handleSaveTax = () => {
        globalSettingsMutation.mutate({ taxRate: parseFloat(formTax.taxRate) })
        setIsTaxModalOpen(false)
    }

    const handleSaveGateway = () => {
        globalSettingsMutation.mutate({
            gatewayPercent: parseFloat(formGateway.gatewayPercent),
            gatewayFixed: parseFloat(formGateway.gatewayFixed)
        })
        setIsGatewayModalOpen(false)
    }

    const openCustomFeeModal = (fee: any = null) => {
        setEditingCustomFee(fee)
        if (fee) {
            setFormCustomFee({ name: fee.name, type: fee.type, amount: fee.amount.toString() })
        } else {
            setFormCustomFee({ name: '', type: 'percent', amount: '' })
        }
        setIsCustomFeeModalOpen(true)
    }

    const handleSaveCustomFee = () => {
        if (!formCustomFee.name || !formCustomFee.amount) return toast.error('Rellena todos los campos')
        
        let newCustomFees = [...(globalSettings?.customFees || [])]
        
        if (editingCustomFee) {
            newCustomFees = newCustomFees.map(f => f.id === editingCustomFee.id ? { ...f, name: formCustomFee.name, type: formCustomFee.type, amount: parseFloat(formCustomFee.amount) } : f)
        } else {
            newCustomFees.push({ id: Math.random().toString(36).substring(7), name: formCustomFee.name, type: formCustomFee.type, amount: parseFloat(formCustomFee.amount) })
        }

        globalSettingsMutation.mutate({ customFees: newCustomFees })
        setIsCustomFeeModalOpen(false)
    }

    const handleDeleteCustomFee = (id: string, name: string) => {
        setDeleteConfirm({ type: 'fee', id, label: name })
    }

    const handleSaveFixedCost = () => {
        fixedCostMutation.mutate({
            id: editingFixedCost?.id,
            name: formFixedCost.name,
            category: formFixedCost.category,
            amount: parseFloat(formFixedCost.amount)
        })
    }

    const handleDeleteFixedCost = (id: string, name: string) => {
        setDeleteConfirm({ type: 'cost', id, label: name })
    }

    const execDelete = () => {
        if (!deleteConfirm) return
        if (deleteConfirm.type === 'fee') {
            const newCustomFees = globalSettings.customFees.filter((f: any) => f.id !== deleteConfirm.id)
            globalSettingsMutation.mutate({ customFees: newCustomFees })
        } else {
            deleteFixedCostMutation.mutate(deleteConfirm.id)
        }
        setDeleteConfirm(null)
    }

    const openFixedCostModal = (cost: any = null) => {
        if (cost) {
            setEditingFixedCost(cost)
            setFormFixedCost({ name: cost.name, category: cost.category, amount: cost.amount.toString() })
        } else {
            setEditingFixedCost(null)
            setFormFixedCost({ name: '', category: 'Suscripción', amount: '' })
        }
        setIsFixedCostModalOpen(true)
    }

    const { showSkeleton, fadeIn } = useSmartSkeleton(isLoading, 200)

    if (user?.role === "OPERATOR") return null
    if (!integrations.shopify) return <UnconfiguredState integration="Shopify & Meta Ads" />

    const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"

    if (showSkeleton) {
        return (
            <div className="space-y-6 animate-in fade-in-0 duration-300">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-9 w-56 rounded-lg" />
                    <Skeleton className="h-4 w-96 rounded-md" />
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/30 backdrop-blur-xl p-6">
                            <div className="flex justify-between items-center"><Skeleton className="h-4 w-28 rounded" /><Skeleton className="h-4 w-4 rounded-full" /></div>
                            <Skeleton className="h-8 w-32 rounded-md" />
                            <Skeleton className="h-3 w-20 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (isLoading) return null

    return (
        <div className="space-y-6" style={{ opacity: fadeIn ? 1 : 0, transition: 'opacity 350ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight">Finanzas E-commerce</h1>
                    <div className="flex items-center gap-3">
                        {disabledCampaignIds.length > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/80 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        )}
                    </div>
                </div>
                <p className="text-muted-foreground">Control avanzado de utilidad neta, costos fijos y salud del margen.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <TiltCard tiltIntensity="subtle">
                    <div className="flex flex-row items-center justify-between pb-0 px-6">
                        <span className="text-sm font-medium text-muted-foreground">Ingresos (Bruto)</span>
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="px-6 pb-2">
                        <div className="text-2xl font-bold tabular-nums">{financeSummary ? formatCurrency(financeSummary.totalRevenue) : "$0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">Shopify Sales TTV</p>
                    </div>
                </TiltCard>
                <TiltCard tiltIntensity="subtle">
                    <div className="flex flex-row items-center justify-between pb-0 px-6">
                        <span className="text-sm font-medium text-muted-foreground">Inversión Publicitaria</span>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="px-6 pb-2">
                        <div className="text-2xl font-bold tabular-nums">{financeSummary ? formatCurrency(-Math.abs(Number(financeSummary.metaAdSpend || 0) + Number(financeSummary.googleAdSpend || 0) + Number(financeSummary.tiktokAdSpend || 0))) : "$0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">Meta, Google & TikTok Ads</p>
                    </div>
                </TiltCard>
                <TiltCard tiltIntensity="subtle">
                    <div className="flex flex-row items-center justify-between pb-0 px-6">
                        <span className="text-sm font-medium text-muted-foreground">COGS & Envíos</span>
                        <Truck className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="px-6 pb-2">
                        <div className="text-2xl font-bold tabular-nums">{financeSummary ? formatCurrency(-Math.abs(Number(financeSummary.totalCogs || 0) + Number(financeSummary.totalShipping || 0))) : "$0"}</div>
                        <p className="text-xs text-muted-foreground mt-1">Dropi + Costo Prod.</p>
                    </div>
                </TiltCard>
                <TiltCard tiltIntensity="subtle" className="bg-primary/5 border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
                    <div className="flex flex-row items-center justify-between pb-0 px-6">
                        <span className="text-sm font-bold text-primary">Utilidad Neta (Profit)</span>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div className="px-6 pb-2">
                        <div className="text-2xl font-bold tabular-nums">
                            {financeSummary 
                                ? <span className={(Number(financeSummary.netProfit) >= 0) ? 'text-emerald-400' : 'text-rose-500'}>{formatCurrency(financeSummary.netProfit)}</span> 
                                : "$0"
                            }
                        </div>
                        <Badge variant="outline" className={`mt-1 bg-background shadow-sm ${financeSummary && Number(financeSummary.netProfit) >= 0 ? 'text-emerald-400 border-emerald-500/30' : 'text-rose-500 border-rose-500/30'}`}>
                            {financeSummary && Number(financeSummary.totalRevenue) > 0 ? ((Number(financeSummary.netProfit) / Number(financeSummary.totalRevenue)) * 100).toFixed(1) : "0"}% Margen Op.
                        </Badge>
                    </div>
                </TiltCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/80 flex flex-col p-0 overflow-hidden">
                    <CardHeader className="bg-destructive/5 border-b border-destructive/10 pt-6 pb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-destructive/10 rounded-lg">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-bold">Semáforo de Margen</CardTitle>
                                <CardDescription className="text-xs">SKUs con margen bajo umbral (&lt; 20%)</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="py-3 px-4">Producto</TableHead>
                                    <TableHead className="py-3 px-4">Precio / Costo</TableHead>
                                    <TableHead className="text-right py-3 px-4">Margen Real</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lowMarginAlerts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground h-32 border-dashed">
                                            Sin alertas de margen reciente.
                                        </TableCell>
                                    </TableRow>
                                ) : lowMarginAlerts.map((alert) => (
                                    <TableRow key={alert.sku} className="hover:bg-muted/50 transition-colors border-b border-border/60">
                                        <TableCell className="px-4 py-3">
                                            <div className="font-semibold text-sm truncate max-w-[180px]" title={alert.name}>{alert.name}</div>
                                            <div className="text-[10px] font-mono text-muted-foreground uppercase">{alert.sku}</div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3">
                                            <div className="text-sm font-medium">{formatCurrency(alert.price)}</div>
                                            <div className="text-[10px] text-muted-foreground font-medium">Costo: {formatCurrency(alert.cost)}</div>
                                        </TableCell>
                                        <TableCell className="text-right px-4 py-3">
                                            <Badge variant="destructive" className="font-mono text-[11px] px-2 py-0 h-6">
                                                <TrendingDown className="h-3 w-3 mr-1" />
                                                {alert.margin}
                                            </Badge>
                                            <div className="text-[10px] text-muted-foreground mt-1 font-medium">Objetivo: {alert.target}</div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="space-y-4 flex flex-col">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/80">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center justify-between text-base">
                                <div className="flex items-center">
                                    Costos Fijos Mensuales
                                    <Badge variant="outline" className="ml-2 bg-primary/10 text-primary border-primary/20 uppercase">
                                        {globalSettings?.currency || 'USD'}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-normal text-muted-foreground border border-border/80 px-2 py-1 rounded-md bg-background/50">
                                        Total: {formatCurrency(fixedCosts.reduce((sum: number, c: any) => sum + Number(c.amount), 0))}
                                    </span>
                                    {canEdit && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFixedCostModal()}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="[&_div[data-slot=table-container]]:overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Categoría</TableHead>
                                        <TableHead className="text-right">Monto</TableHead>
                                        {canEdit && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fixedCosts.map((cost: any) => (
                                        <TableRow key={cost.id}>
                                            <TableCell className="font-medium">{cost.name}</TableCell>
                                            <TableCell><Badge variant="secondary" className="font-normal">{cost.category}</Badge></TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(cost.amount)}</TableCell>
                                            {canEdit && (
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openFixedCostModal(cost)}>
                                                            <Edit2 className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteFixedCost(cost.id, cost.name)}>
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 backdrop-blur-xl border border-border/80">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center justify-between text-base">
                                <div className="flex items-center gap-2">
                                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                                    Tax & Fees
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-normal text-muted-foreground border border-border/50 px-2 py-1 rounded-md bg-background/50">
                                        Total: {formatCurrency(financeSummary?.totalTaxAndFees || 0)}
                                    </span>
                                    {canEdit && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCustomFeeModal()}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-sm">Comisión Pasarela</div>
                                        <div className="text-xs text-muted-foreground">MercadoPago / Stripe</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-1 bg-background/50">
                                            <span className="font-mono text-sm">{globalSettings?.gatewayPercent}% + {formatCurrency(globalSettings?.gatewayFixed)}</span>
                                        </div>
                                        {canEdit && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setIsGatewayModalOpen(true)}>
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-sm">Retención de Impuestos</div>
                                        <div className="text-xs text-muted-foreground">IVA o taxes locales por defecto</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-1 bg-background/50">
                                            <span className="font-mono text-sm">{globalSettings?.taxRate}%</span>
                                        </div>
                                        {canEdit && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setIsTaxModalOpen(true)}>
                                                <Edit2 className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {globalSettings?.customFees?.map((fee: any) => (
                                    <div key={fee.id} className="flex items-center justify-between">
                                        <div className="space-y-0.5 flex-1">
                                            <div className="font-medium text-sm">{fee.name}</div>
                                            <div className="text-xs text-muted-foreground">Personalizado</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 border border-border/80 rounded-md px-3 py-1 bg-background/50">
                                                <span className="font-mono text-sm">{fee.type === 'percent' ? `${fee.amount}%` : formatCurrency(fee.amount)}</span>
                                            </div>
                                            {canEdit && (
                                                <div className="flex gap-1 justify-end">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openCustomFeeModal(fee)}>
                                                        <Edit2 className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCustomFee(fee.id, fee.name)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Modals */}
            <Dialog open={isGatewayModalOpen} onOpenChange={setIsGatewayModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Comisión de Pasarela</DialogTitle>
                        <DialogDescription>
                            Configura la comisión porcentual y el valor fijo de tu pasarela principal.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Comisión (%)</Label>
                                <Input 
                                    type="number" 
                                    value={formGateway.gatewayPercent} 
                                    onChange={(e) => setFormGateway({...formGateway, gatewayPercent: e.target.value})} 
                                    placeholder="3.49" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Comisión (Fijo $)</Label>
                                <Input 
                                    type="number" 
                                    value={formGateway.gatewayFixed} 
                                    onChange={(e) => setFormGateway({...formGateway, gatewayFixed: e.target.value})} 
                                    placeholder="0.30" 
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsGatewayModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveGateway}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTaxModalOpen} onOpenChange={setIsTaxModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Retención de Impuestos</DialogTitle>
                        <DialogDescription>
                            Estos impuestos se descontarán del total del revenue para el cálculo de tu beneficio.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Retención de Impuestos (IVA/Taxes) %</Label>
                            <Input 
                                type="number" 
                                value={formTax.taxRate} 
                                onChange={(e) => setFormTax({...formTax, taxRate: e.target.value})} 
                                placeholder="19.00" 
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTaxModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveTax}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCustomFeeModalOpen} onOpenChange={setIsCustomFeeModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingCustomFee ? 'Editar Parámetro' : 'Nuevo Parámetro'}</DialogTitle>
                        <DialogDescription>
                            Añade costos tributarios extra que se calculen sobre cada venta.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nombre del parámetro</Label>
                            <Input 
                                value={formCustomFee.name} 
                                onChange={(e) => setFormCustomFee({...formCustomFee, name: e.target.value})} 
                                placeholder="Ej: Costo Logístico Variable" 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo de valor</Label>
                                <Select value={formCustomFee.type} onValueChange={(val) => setFormCustomFee({...formCustomFee, type: val})}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percent">Porcentaje (%)</SelectItem>
                                        <SelectItem value="fixed">Fijo ($)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor</Label>
                                <Input 
                                    type="number" 
                                    value={formCustomFee.amount} 
                                    onChange={(e) => setFormCustomFee({...formCustomFee, amount: e.target.value})} 
                                    placeholder="0" 
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCustomFeeModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveCustomFee}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isFixedCostModalOpen} onOpenChange={setIsFixedCostModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingFixedCost ? 'Editar Costo Fijo' : 'Nuevo Costo Fijo'}</DialogTitle>
                        <DialogDescription>
                            Estos costos se descontarán mensualmente de tu utilidad neta.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nombre del Costo</Label>
                            <Input 
                                value={formFixedCost.name} 
                                onChange={(e) => setFormFixedCost({...formFixedCost, name: e.target.value})} 
                                placeholder="Ej: Herramienta Email" 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Monto ($)</Label>
                                <Input 
                                    type="number" 
                                    value={formFixedCost.amount} 
                                    onChange={(e) => setFormFixedCost({...formFixedCost, amount: e.target.value})} 
                                    placeholder="25.00" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Categoría</Label>
                                <Input 
                                    value={formFixedCost.category} 
                                    onChange={(e) => setFormFixedCost({...formFixedCost, category: e.target.value})} 
                                    placeholder="Ej: Marketing" 
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFixedCostModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveFixedCost}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Destructive Confirm Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open: boolean) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Estás a punto de eliminar <strong>&ldquo;{deleteConfirm?.label}&rdquo;</strong>. Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={execDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
