"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAPI } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Megaphone, Link2, MonitorPlay, RefreshCw, Eye, EyeOff, LayoutDashboard, BrainCircuit } from "lucide-react"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatNumber } from "@/lib/formatting"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useSmartSkeleton } from "@/hooks/useSmartSkeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AndromedaOptimization } from "@/components/dashboard/AndromedaOptimization"

export default function MarketingPageClient() {
    const router = useRouter()
    const { user } = useUserStore()
    const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds, toggleCampaign } = useCampaignStore()
    const [hasMounted, setHasMounted] = useState(false)
    const queryClient = useQueryClient()

    useEffect(() => {
        setHasMounted(true)
        if (user?.role === "OPERATOR") router.push("/dashboard/logistics")
    }, [user?.role, router])

    const from = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const to = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const rangeParams = from && to ? `from=${from}&to=${to}` : 'days=7'
    const exclusions = disabledCampaignIds.length > 0 ? `&excludeCampaigns=${disabledCampaignIds.join(',')}` : ''

    const { data: campaigns = [], isLoading: campsLoading } = useQuery({
        queryKey: ['meta', 'campaigns', { from, to }],
        queryFn: () => fetchAPI(`/meta/campaigns?${rangeParams}`).then(r => Array.isArray(r) ? r : [])
    })

    const { data: creatives = [], isLoading: crtsLoading } = useQuery({
        queryKey: ['meta', 'creatives', { from, to }],
        queryFn: () => fetchAPI(`/meta/creatives?${rangeParams}`).then(r => Array.isArray(r) ? r : [])
    })

    const { data: attributionRaw = { attributed: 0, orphaned: 0, total: 0, lossRate: 0 }, isLoading: attrLoading } = useQuery({
        queryKey: ['meta', 'attribution', { from, to, exclusions }],
        queryFn: () => fetchAPI(`/meta/attribution?${rangeParams}${exclusions}`)
    })

    const isLoading = campsLoading || crtsLoading || attrLoading
    const { showSkeleton, fadeIn } = useSmartSkeleton(isLoading, 200)

    const visibleCampaigns = campaigns.filter((c: any) => !disabledCampaignIds.includes(c.id))
    const totalSpend = visibleCampaigns.reduce((sum: number, c: any) => sum + Number(c.spend), 0)
    const totalConversions = visibleCampaigns.reduce((sum: number, c: any) => sum + Number(c.conversions || 0), 0)

    const attributed = totalConversions
    const totalOrders = attributionRaw.total
    const orphaned = Math.max(0, totalOrders - attributed)
    const lossRate = totalOrders > 0 ? Math.round((orphaned / totalOrders) * 100) : 0

    const syncMetaMutation = useMutation({
        mutationFn: () => fetchAPI('/meta/sync', { method: 'POST' }),
        onSuccess: (result: any) => {
            if (result.error) {
                toast.error(`Error de Meta: ${result.error}`)
            } else {
                toast.success('Meta Ads sincronizado correctamente')
                queryClient.invalidateQueries({ queryKey: ['meta'] })
            }
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al intentar sincronizar con Meta')
        }
    })

    const handleSyncMeta = () => syncMetaMutation.mutate()

    if (showSkeleton) {
        return (
            <div className="space-y-6 animate-in fade-in-0 duration-300">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-9 w-52 rounded-lg" />
                    <Skeleton className="h-4 w-96 rounded-md" />
                </div>
                <div className="rounded-xl border border-border/80 bg-card/30 backdrop-blur-xl p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <Skeleton className="h-6 w-56 rounded" />
                        <Skeleton className="h-8 w-32 rounded-md" />
                    </div>
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                </div>
            </div>
        )
    }

    if (isLoading) return null
    if (user?.role === "OPERATOR") return null
    if (!integrations.meta) return <UnconfiguredState integration="Meta Ads" />

    return (
        <div className="space-y-6" style={{ opacity: fadeIn ? 1 : 0, transition: 'opacity 350ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        Marketing & Ads
                        <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-transparent">Meta API Live</Badge>
                    </h1>
                    <div className="flex items-center gap-3">
                        {hasMounted && disabledCampaignIds.length > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/80 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        )}
                        {canEdit && (
                            <Button onClick={handleSyncMeta} disabled={syncMetaMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all">
                                <RefreshCw className={`mr-2 h-4 w-4 ${syncMetaMutation.isPending ? "animate-spin" : ""}`} />
                                {syncMetaMutation.isPending ? "Sincronizando..." : "Sincronizar Meta Ads"}
                            </Button>
                        )}
                    </div>
                </div>
                <p className="text-muted-foreground">Rendimiento de campañas, atribución real de Shopify y Testeo de Creativos.</p>
            </div>

            <Tabs defaultValue="dashboard" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-6 bg-muted/50 backdrop-blur-md border border-border/50">
                    <TabsTrigger value="dashboard" className="flex items-center gap-2 data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/20 dark:data-[state=active]:bg-purple-500/20 dark:data-[state=active]:border-purple-500/30 dark:data-[state=active]:shadow-[0_0_15px_-5px_rgba(168,85,247,0.4)] transition-all duration-300">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                    </TabsTrigger>
                    <TabsTrigger value="optimization" className="flex items-center gap-2 data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/20 dark:data-[state=active]:bg-purple-500/20 dark:data-[state=active]:border-purple-500/30 dark:data-[state=active]:shadow-[0_0_15px_-5px_rgba(168,85,247,0.4)] transition-all duration-300">
                        <BrainCircuit className="h-4 w-4" />
                        Optimización Andromeda
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="space-y-6">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/80">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Megaphone className="h-5 w-5 text-chart-2" />
                                        Dashboard de Campañas Meta
                                    </CardTitle>
                                    <CardDescription>Métricas sincronizadas diariamente (Timezone: America/Santiago).</CardDescription>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground uppercase font-semibold">Inversión Filtrada</div>
                                    <div className="text-2xl font-bold text-primary">{formatCurrency(totalSpend)}</div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]"></TableHead>
                                        <TableHead>Campaña</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Inversión</TableHead>
                                        <TableHead className="text-right">CPA Meta</TableHead>
                                        <TableHead className="text-right">ROAS</TableHead>
                                        <TableHead className="text-right text-primary">CPA Shopify (CPP)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {campaigns.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground h-24 border-dashed">
                                                No hay campañas sincronizadas. Conecta tu cuenta desde la sección Integraciones.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        campaigns.map((camp: any) => {
                                            const isDisabled = hasMounted && disabledCampaignIds.includes(camp.id)
                                            return (
                                                <TableRow key={camp.id} className={isDisabled ? "opacity-50 grayscale bg-muted/20" : ""}>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleCampaign(camp.id)}>
                                                            {isDisabled ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{camp.name}</div>
                                                        <div className="text-xs text-muted-foreground font-mono">ID: {camp.id}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={getStatusColorClass(camp.status)}>{mapStatus(camp.status)}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">{formatCurrency(camp.spend)}</TableCell>
                                                    <TableCell className="text-right text-muted-foreground">{formatCurrency(camp.cpa)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant={parseFloat(camp.roas) > 2 ? "default" : "destructive"}>{formatNumber(camp.roas, 1)}x</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-primary">{formatCurrency(camp.cpp || camp.cpa)}</TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="bg-card/30 backdrop-blur-xl border border-border/80">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Link2 className="h-5 w-5 text-muted-foreground" />
                                    Mapeo de Atribución (CBM)
                                </CardTitle>
                                <CardDescription>Cruce de parámetros UTM de Shopify vs IDs de Meta para evadir tracking loss de iOS.</CardDescription>
                            </CardHeader>
                            {totalOrders > 0 || attributed > 0 ? (
                                <>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center justify-between p-3 border border-border/80 rounded-lg bg-background/50">
                                            <div>
                                                <div className="font-medium text-sm flex items-center gap-2">
                                                    Órdenes Atribuidas (Directas UTM)
                                                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">Muestra</Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground">Compras logradas por Meta Ads (Filtrado)</div>
                                            </div>
                                            <div className="text-2xl font-bold text-primary">{attributed}</div>
                                        </div>
                                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 opacity-70">
                                            <div>
                                                <div className="font-medium text-sm flex items-center gap-2">
                                                    Órdenes Huérfanas (Direct/None)
                                                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">Muestra</Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground">Posibles compras afectadas por privacidad de iOS</div>
                                            </div>
                                            <div className="text-2xl font-bold">{orphaned}</div>
                                        </div>
                                    </CardContent>
                                    <CardFooter>
                                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary px-3 py-2 rounded-md w-full">
                                            💡 Con el filtro actual, la tasa de pérdida es del {lossRate}%. El CPP filtrado es {formatCurrency(totalSpend / (attributed || 1))}.
                                        </p>
                                    </CardFooter>
                                </>
                            ) : (
                                <CardContent className="h-[200px] flex items-center justify-center">
                                    <div className="text-muted-foreground text-sm text-center px-6">
                                        Aún no hay registros suficientes de órdenes o configuraciones de Meta para calcular el mapeo de atribución (CBM).
                                    </div>
                                </CardContent>
                            )}
                        </Card>

                        <Card className="bg-card/30 backdrop-blur-xl border border-border/80">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MonitorPlay className="h-5 w-5 text-chart-3" />
                                    Análisis Creativo Top 4
                                </CardTitle>
                                <CardDescription>Rendimiento por ROAS de los mejores anuncios gráficos/video.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[250px] w-full min-h-[250px] flex items-center justify-center">
                                    {creatives.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={250}>
                                            <BarChart layout="vertical" data={creatives} margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="currentColor" opacity={0.4} />
                                                <XAxis type="number" hide />
                                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.8 }} width={100} />
                                                <RechartsTooltip cursor={{ fill: "currentColor", opacity: 0.05 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                                                <Bar dataKey="roas" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} barSize={24} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-muted-foreground text-sm text-center">
                                            No hay datos de creativos disponibles o falta el permiso `ads_read`. Analiza los permisos de Meta.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="optimization">
                    <AndromedaOptimization />
                </TabsContent>
            </Tabs>
        </div>
    )
}
