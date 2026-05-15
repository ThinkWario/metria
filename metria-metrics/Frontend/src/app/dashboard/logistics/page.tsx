"use client"

import { useQuery } from "@tanstack/react-query"
import { fetchAPI } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { Package, Truck, CheckCircle2, XOctagon, Loader2, PieChartIcon } from "lucide-react"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"

export default function LogisticsPage() {
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()

    const from = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const to = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const rangeQuery = from && to ? `?from=${from}&to=${to}` : ''

    const { data: shipmentsRes, isLoading: shipmentsLoading } = useQuery({
        queryKey: ['dropi', 'shipments', { from, to }],
        queryFn: () => fetchAPI(`/dropi/shipments${rangeQuery}`),
        onError: () => toast.error('No se pudo cargar la información de logística.')
    } as any)

    const { data: summary, isLoading: summaryLoading } = useQuery({
        queryKey: ['dropi', 'summary', { from, to }],
        queryFn: () => fetchAPI(`/dropi/summary${rangeQuery}`)
    })

    const isLoading = shipmentsLoading || summaryLoading
    const shipments = Array.isArray((shipmentsRes as any)?.data) ? (shipmentsRes as any).data : []

    if (!integrations.dropi) return <UnconfiguredState integration="Dropi" />

    const pieData = summary?.breakdown ? [
        { name: "Entregado", value: summary.breakdown.delivered, color: "var(--color-emerald-500)" },
        { name: "En Tránsito", value: summary.breakdown.inTransit, color: "var(--color-blue-500)" },
        { name: "Devuelto", value: summary.breakdown.returned, color: "var(--color-destructive)" },
        { name: "Pendiente", value: summary.breakdown.pending, color: "var(--color-muted)" }
    ].filter(d => d.value > 0) : []

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    Logística & Operaciones
                    <Badge className="bg-slate-700 hover:bg-slate-800 text-white border-transparent">Dropi API Live</Badge>
                </h1>
                <p className="text-muted-foreground">Monitoreo de guías, efectividad de entrega y conciliación de recaudos Dropi.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de Entrega Global</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">{summary?.deliveryRate?.toFixed(1) ?? '—'}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Crítico para modelo Contra Entrega</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Devoluciones (Novedades)</CardTitle>
                        <XOctagon className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">{summary?.returnRate?.toFixed(1) ?? '—'}%</div>
                        <p className="text-xs text-muted-foreground mt-1">Órdenes que generan costo hundido</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Guías Activas</CardTitle>
                        <Truck className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{summary?.activeGuides ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">En tránsito + Pendientes</p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 backdrop-blur-xl border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold text-primary">Recaudado (A Conciliar)</CardTitle>
                        <Package className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${summary?.totalCollected?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '—'}</div>
                        <p className="text-xs text-muted-foreground mt-1">En billetera Dropi</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-1">
                    <CardHeader>
                        <CardTitle>Estado Actual</CardTitle>
                        <CardDescription>Distribución de envíos en el período seleccionado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center items-center h-[250px]">
                                <Loader2 className="animate-spin text-muted-foreground" />
                            </div>
                        ) : pieData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[250px] gap-2 text-muted-foreground">
                                <PieChartIcon className="h-8 w-8 opacity-30" />
                                <p className="text-sm">Sin datos de envíos.</p>
                            </div>
                        ) : (
                            <div className="h-[250px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value) => <span className="text-muted-foreground text-xs">{value}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-2">
                    <CardHeader>
                        <CardTitle>Seguimiento de Guías (Tiempo Real)</CardTitle>
                        <CardDescription>Últimas actualizaciones desde transportadoras.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center items-center h-32">
                                <Loader2 className="animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Guía Dropi</TableHead>
                                        <TableHead>Cliente / Destino</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Recaudo</TableHead>
                                        <TableHead className="text-right">Costo Flete</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shipments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground h-24 border-dashed">
                                                No hay guías registradas en el período seleccionado.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        shipments.map((ship: any) => (
                                            <TableRow key={ship.guideId || ship.guide}>
                                                <TableCell className="font-mono text-xs font-medium text-primary cursor-pointer hover:underline">{ship.guideId || ship.guide}</TableCell>
                                                <TableCell>
                                                    <div className="font-medium">{ship.clientName || ship.client}</div>
                                                    <div className="text-xs text-muted-foreground">{ship.city}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={getStatusColorClass(ship.status)}>{mapStatus(ship.status)}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {ship.collectedValue ? `$${Number(ship.collectedValue).toLocaleString('es-CL', { minimumFractionDigits: 0 })}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground text-xs">
                                                    {ship.shippingFee ? `$${Number(ship.shippingFee).toLocaleString('es-CL', { minimumFractionDigits: 0 })}` : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
