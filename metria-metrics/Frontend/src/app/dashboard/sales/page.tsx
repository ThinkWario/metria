"use client"

import { useEffect, useState, useCallback } from "react"
import { fetchAPI, syncShopifyOrders, getCustomersLtv, getReturns } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/formatting"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ShoppingCart, RefreshCcw, HandCoins, UserCheck, Loader2, ChevronLeft, ChevronRight, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { toast } from "sonner"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"

// No mocks down here anymore

export default function SalesPage() {
    const router = useRouter()
    const { user } = useUserStore()
    const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds } = useCampaignStore()
    const [orders, setOrders] = useState<any[]>([])
    const [skuPerformance, setSkuPerformance] = useState<any[]>([])
    const [topSoldPerformance, setTopSoldPerformance] = useState<any[]>([])
    const [customersLtv, setCustomersLtv] = useState<any>({ ltv: 0, repurchaseRate: 0, totalCustomers: 0 })
    const [returnsData, setReturnsData] = useState<any>({ count: 0, totalValue: 0, orders: [] })
    const [isSyncing, setIsSyncing] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    // Pagination
    const [page, setPage] = useState(1)
    const [totalOrders, setTotalOrders] = useState(0)
    const PAGE_SIZE = 20

    const loadData = useCallback(async () => {
        setIsLoading(true)
        try {
            const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
            const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
            const exclusions = disabledCampaignIds.length > 0 ? `&excludeCampaigns=${disabledCampaignIds.join(',')}` : ''
            const rangeParams = (fromStr && toStr ? `from=${fromStr}&to=${toStr}` : 'days=30') + exclusions
            const topProductsRangeParams = 'days=7' + exclusions

            const [ordersRes, skuRes, ltvRes, returnsRes, topSoldRes] = await Promise.all([
                fetchAPI(`/shopify/orders?limit=${PAGE_SIZE}&page=${page}${fromStr && toStr ? `&from=${fromStr}&to=${toStr}` : ''}`),
                fetchAPI(`/metrics/sku-performance?${rangeParams}`),
                getCustomersLtv(fromStr, toStr),
                getReturns(fromStr, toStr),
                fetchAPI(`/metrics/sku-performance?${topProductsRangeParams}`)
            ])
            if (ordersRes.data) setOrders(ordersRes.data)
            if (ordersRes.meta?.total !== undefined) setTotalOrders(ordersRes.meta.total)
            if (skuRes) setSkuPerformance(skuRes)
            if (ltvRes) setCustomersLtv(ltvRes)
            if (returnsRes) setReturnsData(returnsRes)
            if (topSoldRes) setTopSoldPerformance(topSoldRes)
        } catch (e) {
            console.error('Failed to load sales data', e)
        } finally {
            setIsLoading(false)
        }
    }, [date, page, disabledCampaignIds])

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
            return
        }
        loadData()
    }, [loadData, user?.role, router])

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncShopifyOrders()
            toast.success("Sincronización Exitosa", {
                description: `Se han importado ${res.count} órdenes desde Shopify.`,
            })
            await loadData() // Refresh table
        } catch (e: any) {
            console.error("Sync error:", e)
            toast.error("Error de Sincronización", {
                description: e.message || "No se pudo sincronizar con Shopify. Revisa tus accesos.",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const topProducts = [...topSoldPerformance]
        .sort((a, b) => Number(b.sales) - Number(a.sales))
        .slice(0, 5)

    if (user?.role === "OPERATOR") return null
    if (!integrations.shopify) return <UnconfiguredState integration="Shopify" />

    return (
        <div className="space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            Canales de Venta
                            <Badge className="bg-[#96bf48] hover:bg-[#86ab40] text-white border-transparent">Shopify API Live</Badge>
                        </h1>
                        {disabledCampaignIds.length > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">Listado de órdenes, análisis de SKU y métricas de retención de Shopify.</p>
                </div>
                {canEdit && (
                    <Button onClick={handleSync} disabled={isSyncing} className="w-full sm:w-auto">
                        {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                        {isSyncing ? "Sincronizando Shopify..." : "Sincronizar Datos"}
                    </Button>
                )}
            </div>

            <Tabs defaultValue="orders" className="space-y-4">
                <TabsList className="bg-card/50 backdrop-blur-md border border-border/50">
                    <TabsTrigger value="orders" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <ShoppingCart className="w-4 h-4 mr-2 text-blue-500" />
                        Órdenes
                    </TabsTrigger>
                    <TabsTrigger value="top-products" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <Trophy className="w-4 h-4 mr-2 text-yellow-500" />
                        Los más vendidos
                    </TabsTrigger>
                    <TabsTrigger value="sku" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <HandCoins className="w-4 h-4 mr-2 text-emerald-500" />
                        Rendimiento SKU
                    </TabsTrigger>
                    <TabsTrigger value="customers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <UserCheck className="w-4 h-4 mr-2 text-purple-500" />
                        Clientes (LTV)
                    </TabsTrigger>
                    <TabsTrigger value="returns" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <RefreshCcw className="w-4 h-4 mr-2 text-rose-500" />
                        Reembolsos
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="space-y-4">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle>Últimas Órdenes Ingresadas</CardTitle>
                            <CardDescription>Sincronizadas en tiempo real vía Webhooks de Shopify.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-3 py-2">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Skeleton key={i} className="h-10 w-full rounded-md" />
                                    ))}
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">Orden</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Estado Pago</TableHead>
                                            <TableHead>Cumplimiento</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground border-dashed">
                                                    No hay órdenes. Sincroniza con Shopify usando el botón superior.
                                                </TableCell>
                                            </TableRow>
                                        ) : orders.map((order) => (
                                            <TableRow key={order.id || order.orderId}>
                                                <TableCell className="font-medium text-primary hover:underline cursor-pointer">
                                                    <div className="flex items-center gap-2">
                                                        {order.orderId || order.id}
                                                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/20">Shopify</Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{order.date || new Date(order.createdAt).toLocaleDateString('es-ES')}</TableCell>
                                                <TableCell>{order.customer || order.customerName}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        className={getStatusColorClass(order.status || order.financialStatus)}
                                                    >
                                                        {mapStatus(order.status || order.financialStatus)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        {mapStatus(order.fulfillment || order.fulfillmentStatus)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-medium">{formatCurrency(order.total || order.totalPrice)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                            {/* Pagination controls */}
                            {!isLoading && totalOrders > PAGE_SIZE && (
                                <div className="flex items-center justify-between pt-4 border-t border-border/40">
                                    <span className="text-xs text-muted-foreground">
                                        Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalOrders)} de {totalOrders} órdenes
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium">Pág. {page}</span>
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= totalOrders}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="top-products" className="space-y-6 pt-2">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight">Los más vendidos</h2>
                            <p className="text-sm text-muted-foreground">Top 5 productos estrella basados en volumen de ventas bruto.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* CHART BENTO BOX */}
                        <Card className="lg:col-span-2 bg-card/40 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden">
                            <CardHeader className="border-b border-border/30 bg-muted/10 pb-4">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Trophy className="h-5 w-5 text-yellow-500 drop-shadow-sm" />
                                    Distribución de Ventas (Unidades)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6 relative">
                                <div className="h-[320px] w-full">
                                    {isLoading ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary/50 mb-4" />
                                            <span className="text-sm text-muted-foreground">Cargando métricas...</span>
                                        </div>
                                    ) : topProducts.length === 0 ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-border/50 rounded-xl bg-muted/20 text-muted-foreground">
                                            <HandCoins className="h-10 w-10 mb-3 opacity-40" />
                                            <p className="text-sm font-medium">No hay datos suficientes</p>
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={topProducts} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.25} />
                                                <XAxis
                                                    dataKey="name"
                                                    stroke="currentColor"
                                                    className="text-muted-foreground text-[11px] font-medium"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    interval={0}
                                                    tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 15)}...` : value}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    stroke="currentColor"
                                                    className="text-muted-foreground text-[11px] font-medium"
                                                    tickLine={false}
                                                    axisLine={false}
                                                    tickFormatter={(value) => `${value} u.`}
                                                />
                                                <Tooltip
                                                    cursor={{ fill: 'transparent' }} // Fixes the gray background filling the bar
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="rounded-xl border border-border/50 bg-background/95 backdrop-blur-md p-4 shadow-xl">
                                                                    <div className="font-semibold text-foreground text-sm mb-1">{data.name}</div>
                                                                    <div className="text-[10px] font-mono text-muted-foreground mb-3 bg-muted px-2 py-0.5 rounded-md inline-block">{data.sku}</div>
                                                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Volumen</span>
                                                                            <span className="font-semibold text-primary">{data.sales} uds.</span>
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ingresos</span>
                                                                            <span className="font-semibold text-foreground">{formatCurrency(data.revenue)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar
                                                    dataKey="sales"
                                                    radius={[6, 6, 0, 0]}
                                                    maxBarSize={60}
                                                    animationDuration={1500}
                                                >
                                                    {topProducts.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={`var(--chart-${(index % 5) + 1})`}
                                                            className="hover:opacity-80 transition-opacity duration-300 cursor-pointer"
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* LIST BENTO BOX */}
                        <Card className="bg-gradient-to-br from-card/60 to-muted/20 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden flex flex-col">
                            <CardHeader className="border-b border-border/30 bg-muted/10 pb-4">
                                <CardTitle className="text-base flex items-center justify-between">
                                    <span>Ranking de Ingresos</span>
                                    <Badge variant="secondary" className="text-[10px] font-medium">Top 5</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 overflow-auto">
                                {topProducts.length === 0 && !isLoading && (
                                    <div className="flex items-center justify-center h-full text-muted-foreground py-10">
                                        Sin datos
                                    </div>
                                )}
                                <div className="divide-y divide-border/30">
                                    {topProducts.map((product, index) => (
                                        <div key={product.sku} className="p-4 hover:bg-muted/30 transition-colors flex items-center gap-4 group">
                                            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm shrink-0 shadow-sm ${index === 0 ? 'bg-yellow-500/20 text-yellow-600 border border-yellow-500/30' :
                                                index === 1 ? 'bg-slate-300/20 text-slate-500 border border-slate-300/30' :
                                                    index === 2 ? 'bg-amber-700/20 text-amber-700/80 border border-amber-700/30' :
                                                        'bg-secondary text-secondary-foreground'
                                                }`}>
                                                {index + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-mono truncate">{product.sku}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-foreground">{formatCurrency(product.revenue)}</p>
                                                <p className="text-[11px] font-medium text-chart-2">{product.sales} uds.</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="sku" className="space-y-4">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle>Ranking de SKUs por Utilidad</CardTitle>
                            <CardDescription>Productos ordenados por el Profit Real generado luego de descontar su AdSpend asignado.</CardDescription>
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="max-w-[200px]">SKU / Producto</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Ventas</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Ingresos</TableHead>
                                        <TableHead className="text-right whitespace-nowrap text-muted-foreground">COGS</TableHead>
                                        <TableHead className="text-right whitespace-nowrap text-chart-2">- Inv. Pub.</TableHead>
                                        <TableHead className="text-right whitespace-nowrap text-primary">Profit Neto</TableHead>
                                        <TableHead className="text-right">Margen</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {skuPerformance.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground h-24 border-dashed">
                                                Sin datos de rendimiento de SKU. Sincroniza órdenes para poblar.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        skuPerformance.map((sku) => (
                                            <TableRow key={sku.sku}>
                                                <TableCell className="max-w-[200px]">
                                                    <div className="font-medium flex items-center gap-2">
                                                        <span className="truncate" title={sku.name}>{sku.name}</span>
                                                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/20">Shopify</Badge>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground font-mono truncate">{sku.sku}</div>
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">{sku.sales}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap font-medium">{formatCurrency(sku.revenue)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap text-muted-foreground">{formatCurrency(sku.cogs)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap text-chart-2">{formatCurrency(sku.adspend)}</TableCell>
                                                <TableCell className="text-right whitespace-nowrap font-bold text-primary bg-primary/5">{formatCurrency(sku.profit)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge
                                                        variant={
                                                            sku.marginRaw === 0 ? "outline" :
                                                                sku.marginRaw < 0 ? "destructive" :
                                                                    sku.marginRaw < 20 ? "secondary" :
                                                                        "outline"
                                                        }
                                                        className={
                                                            sku.marginRaw === 0 ? "bg-muted text-muted-foreground border-border" : // Neutral styling for 0 (gift/promo)
                                                                sku.marginRaw >= 20 ? "bg-[#96bf48]/10 text-[#96bf48] border-[#96bf48]/20" :
                                                                    sku.marginRaw > 0 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" : ""
                                                        }
                                                    >
                                                        {sku.cost === 0 && (
                                                            <span title="Costo no configurado para este producto (COGS en $0). El margen es irreal." className="mr-1 cursor-help">⚠️</span>
                                                        )}
                                                        {sku.margin}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="customers">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-muted-foreground">Lifetime Value (LTV)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-primary">{formatCurrency(customersLtv.ltv)}</div>
                                <p className="text-xs text-muted-foreground mt-1">Gasto promedio histórico por cliente.</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-muted-foreground">Tasa de Recompra</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-primary">{customersLtv.repurchaseRate}%</div>
                                <p className="text-xs text-muted-foreground mt-1">Basado en {customersLtv.totalCustomers} clientes únicos.</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="returns">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <div className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Impacto de Reembolsos</CardTitle>
                                    <CardDescription>Monto total de dinero devuelto en órdenes de Shopify.</CardDescription>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-destructive">{formatCurrency(returnsData.totalValue)}</div>
                                    <p className="text-xs text-muted-foreground">{returnsData.count} órdenes afectadas</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {returnsData.orders && returnsData.orders.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Orden</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead className="text-right">Monto Devuelto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {returnsData.orders.map((order: any) => (
                                            <TableRow key={order.id}>
                                                <TableCell className="font-medium text-destructive">{order.id}</TableCell>
                                                <TableCell>{new Date(order.date).toLocaleDateString('es-ES')}</TableCell>
                                                <TableCell>{order.customer}</TableCell>
                                                <TableCell className="text-right font-medium text-destructive">-{formatCurrency(order.value)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="h-32 flex items-center justify-center border border-dashed border-border/50 rounded-lg text-muted-foreground">
                                    No hay reembolsos registrados.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </div >
    )
}
