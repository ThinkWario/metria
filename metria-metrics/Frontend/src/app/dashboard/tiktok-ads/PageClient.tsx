"use client"

import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts"
import { 
    Smartphone, 
    Target, 
    TrendingUp, 
    PlaySquare, 
    Loader2, 
    Eye, 
    EyeOff, 
    BarChart2, 
    Zap, 
    AlertCircle, 
    CheckCircle2, 
    Info, 
    ShieldCheck,
    ArrowUpRight,
    ArrowDownRight,
    MousePointer2,
    Video
} from "lucide-react"
import { fetchAPI } from "@/lib/api"
import { formatCurrency, formatNumber } from "@/lib/formatting"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

export default function TikTokAdsPageClient() {
    const router = useRouter()
    const { user } = useUserStore()
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds, toggleCampaign } = useCampaignStore()

    const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const rangeParams = fromStr && toStr ? `from=${fromStr}&to=${toStr}` : ''

    const { data: integrationsData = [] } = useQuery({
        queryKey: ['settings', 'integrations'],
        queryFn: () => fetchAPI('/settings/integrations'),
        enabled: !!user
    })

    const isEventsApiConfigured = integrationsData?.some((i: any) => 
        i.platform === 'tiktok' && 
        i.config?.pixelId && 
        i.config?.eventsToken
    )

    const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
        queryKey: ['tiktok', 'campaigns', { fromStr, toStr }],
        queryFn: () => fetchAPI(`/tiktok/campaigns?${rangeParams}`),
        enabled: !!integrations.tiktok
    })

    const { data: performanceRes = [], isLoading: perfLoading } = useQuery({
        queryKey: ['tiktok', 'performance', { fromStr, toStr }],
        queryFn: () => fetchAPI(`/tiktok/daily-performance?${rangeParams}`),
        enabled: !!integrations.tiktok
    })

    const performanceData = Array.isArray(performanceRes) ? performanceRes : []
    const isLoading = campaignsLoading || perfLoading

    // Calculate Global Metrics for the Audit
    const auditMetrics = useMemo(() => {
        if (campaigns.length === 0) return null
        
        const activeCampaigns = campaigns.filter((c: any) => !disabledCampaignIds.includes(c.id))
        const totals = activeCampaigns.reduce((acc: any, curr: any) => ({
            spend: acc.spend + curr.spend,
            impressions: acc.impressions + curr.impressions,
            clicks: acc.clicks + curr.clicks,
            conversions: acc.conversions + curr.conversions,
            p25: acc.p25 + (curr.p25 || 0),
            p50: acc.p50 + (curr.p50 || 0),
            p75: acc.p75 + (curr.p75 || 0),
            video6s: acc.video6s + (curr.video6s || 0)
        }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, p25: 0, p50: 0, p75: 0, video6s: 0 })

        const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
        const avgCvr = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0
        const hookRate = totals.impressions > 0 ? (totals.p25 / totals.impressions) * 100 : 0
        const retain50 = totals.p25 > 0 ? (totals.p50 / totals.p25) * 100 : 0
        const retain75 = totals.p50 > 0 ? (totals.p75 / totals.p50) * 100 : 0
        const engagedViewRate = totals.impressions > 0 ? (totals.video6s / totals.impressions) * 100 : 0

        // Identification of Problems
        const alerts = []
        if (avgCtr < 0.84) alerts.push({ type: 'error', msg: 'CTR bajo (< 0.84%). Tu gancho (hook) está fallando.', action: 'Modifica los primeros 3 segundos. Usa interrupciones de patrón visuales.' })
        if (retain50 < 30) alerts.push({ type: 'warning', msg: 'Alta caída al 50%. El desarrollo del video pierde impulso.', action: 'Corta secuencias lentas. Entrega el valor principal en los primeros 10s.' })
        if (engagedViewRate < 40) alerts.push({ type: 'info', msg: 'Vistas de 6s bajas (< 40%). Probabilidad de conversión reducida.', action: 'Mejora la retención temprana para que el algoritmo te favorezca.' })
        if (avgCvr < 1 && totals.clicks > 100) alerts.push({ type: 'error', msg: 'Alto engagement pero bajo CVR. Entretenimiento sin conversión.', action: 'Fortalece el CTA visual y verbalmente. Revisa la landing page.' })

        return { totals, avgCtr, avgCvr, hookRate, retain50, retain75, engagedViewRate, alerts }
    }, [campaigns, disabledCampaignIds])

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
        }
    }, [user?.role, router])

    if (user?.role === "OPERATOR") return null
    if (!integrations.tiktok) return <UnconfiguredState integration="TikTok Ads" />

    return (
        <div className="space-y-6 pb-10">
            {/* Header section */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            TikTok Ads Intelligence
                            <Badge className="bg-[#FE2C55] hover:bg-[#E0244D] text-white border-transparent">Algorithm v2026</Badge>
                        </h1>
                        <p className="text-muted-foreground">Optimización basada en retención, Engaged Views y Events API.</p>
                    </div>
                </div>
            </div>

            {/* Top Metrics Bento Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-card/40 backdrop-blur-md border border-border/50 overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Video className="h-4 w-4 text-[#FE2C55]" />
                            Engaged View Rate (6s)
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold">
                            {auditMetrics ? `${formatNumber(auditMetrics.engagedViewRate)}%` : '0%'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${ (auditMetrics?.engagedViewRate || 0) >= 40 ? 'bg-emerald-500' : 'bg-[#FE2C55]'}`} 
                                style={{ width: `${Math.min(auditMetrics?.engagedViewRate || 0, 100)}%` }}
                            />
                        </div>
                        <p className="text-[10px] mt-2 text-muted-foreground">Meta Algorítmica: &gt;40%</p>
                    </CardContent>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                        <TrendingUp size={100} />
                    </div>
                </Card>

                <Card className="bg-card/40 backdrop-blur-md border border-border/50 overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" />
                            Hook Rate (25%)
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold">
                            {auditMetrics ? `${formatNumber(auditMetrics.hookRate)}%` : '0%'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-amber-500 transition-all duration-1000" 
                                style={{ width: `${Math.min(auditMetrics?.hookRate || 0, 100)}%` }}
                            />
                        </div>
                        <p className="text-[10px] mt-2 text-muted-foreground">Efectividad de los primeros 3 segundos.</p>
                    </CardContent>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                        <Zap size={100} />
                    </div>
                </Card>

                <Card className="bg-card/40 backdrop-blur-md border border-border/50 overflow-hidden group">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <MousePointer2 className="h-4 w-4 text-blue-500" />
                            Click-Through Rate (CTR)
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold">
                            {auditMetrics ? `${formatNumber(auditMetrics.avgCtr)}%` : '0%'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${ (auditMetrics?.avgCtr || 0) >= 0.84 ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                style={{ width: `${Math.min((auditMetrics?.avgCtr || 0) * 50, 100)}%` }}
                            />
                        </div>
                        <p className="text-[10px] mt-2 text-muted-foreground">Promedio Industria: 0.84%</p>
                    </CardContent>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                        <MousePointer2 size={100} />
                    </div>
                </Card>

                <Card className="bg-card/40 backdrop-blur-md border border-border/50 overflow-hidden group relative">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            Events API Status
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            {isEventsApiConfigured ? 'Híbrido' : 'Píxel Only'}
                            <Badge 
                                variant="outline" 
                                className={`text-[10px] h-5 ${isEventsApiConfigured ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'}`}
                            >
                                {isEventsApiConfigured ? 'Active' : 'Missing'}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className={`flex items-center gap-1 text-[10px] font-medium ${isEventsApiConfigured ? 'text-emerald-500' : 'text-zinc-500'}`}>
                            {isEventsApiConfigured ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            Advanced Matching (SHA-256)
                        </div>
                        <p className="text-[10px] mt-2 text-muted-foreground">
                            {isEventsApiConfigured ? 'Mejora de ROAS reportada: +36%' : 'Sincroniza Events API para +36% ROAS.'}
                        </p>
                    </CardContent>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
                        <ShieldCheck size={100} />
                    </div>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Algorithmic Audit Section */}
                <Card className="md:col-span-2 bg-black text-white border-zinc-800 shadow-2xl">
                    <CardHeader className="border-b border-white/5 pb-4">
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Zap className="h-5 w-5 text-[#FE2C55] fill-[#FE2C55]" />
                            Auditoría Algorítmica TikTok
                        </CardTitle>
                        <CardDescription className="text-zinc-400">
                            Diagnóstico automático basado en el comportamiento de retención de tu audiencia.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {auditMetrics && auditMetrics.alerts.length > 0 ? (
                            <div className="space-y-4">
                                {auditMetrics.alerts.map((alert, i) => (
                                    <div key={i} className="flex gap-4 p-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors group">
                                        <div className="mt-1">
                                            {alert.type === 'error' ? <AlertCircle className="h-5 w-5 text-red-500" /> : 
                                             alert.type === 'warning' ? <AlertCircle className="h-5 w-5 text-amber-500" /> : 
                                             <Info className="h-5 w-5 text-blue-500" />}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <p className="font-semibold text-sm group-hover:text-[#FE2C55] transition-colors">{alert.msg}</p>
                                            <p className="text-xs text-zinc-400 leading-relaxed">
                                                <span className="text-[#FE2C55] font-bold">ACCIÓN:</span> {alert.action}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                                <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Creativos Saludables</h3>
                                    <p className="text-zinc-400 text-sm">Tu cuenta está operando dentro de los rangos óptimos del algoritmo de TikTok.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="bg-zinc-900/30 border-t border-white/5 py-4">
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                            <span className="flex items-center gap-1"><Info className="h-3 w-3" /> Ponderación Algorithm: 50% Tiempo Video | 35% Early Engagement</span>
                        </div>
                    </CardFooter>
                </Card>

                {/* Performance Trend Chart */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 shadow-xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-[#FE2C55]" />
                            Tendencia de Conversión
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
                        ) : performanceData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[240px] gap-2 text-muted-foreground opacity-50">
                                <BarChart2 size={40} />
                                <p className="text-xs">Sincroniza para ver tendencias</p>
                            </div>
                        ) : (
                        <div className="h-[240px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={performanceData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#FE2C55" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#FE2C55" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.05} />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide />
                                    <RechartsTooltip 
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: 'white', fontSize: '10px' }}
                                        itemStyle={{ color: '#FE2C55' }}
                                    />
                                    <Area type="monotone" dataKey="spend" stroke="#FE2C55" fillOpacity={1} fill="url(#colorSpend)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        )}
                        <div className="p-4 pt-0">
                           <p className="text-[10px] text-muted-foreground">Visualización agregada de costo publicitario diario.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Campaign Table */}
            <Card className="bg-card/20 backdrop-blur-2xl border border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart2 className="h-5 w-5 text-black dark:text-white" />
                            Rendimiento Detallado por Campaña
                        </CardTitle>
                        <CardDescription>Métricas de retención y funnel de video.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : (
                    <div className="rounded-md border border-border/40 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[40px]"></TableHead>
                                    <TableHead className="text-xs uppercase font-bold">Campaña</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold">Investido</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold">CTR</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold">Hook (25%)</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold">Ret. (50%)</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold">6s View</TableHead>
                                    <TableHead className="text-right text-xs uppercase font-bold text-black dark:text-white">ROAS</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {campaigns.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-20 text-muted-foreground grayscale opacity-50">
                                            <div className="flex flex-col items-center gap-2">
                                                <Smartphone size={40} />
                                                <p>No se encontraron datos de TikTok Ads.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                campaigns.map((camp: any) => {
                                    const ctr = (camp.clicks / camp.impressions) * 100
                                    const hook = (camp.p25 / camp.impressions) * 100
                                    const ret50 = (camp.p50 / camp.p25) * 100
                                    const evr = (camp.video6s / camp.impressions) * 100

                                    return (
                                        <TableRow key={camp.id} className={`${disabledCampaignIds.includes(camp.id) ? "opacity-40 grayscale" : "hover:bg-muted/30"} transition-all border-b border-border/40`}>
                                            <TableCell>
                                                <button
                                                    className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${disabledCampaignIds.includes(camp.id) ? 'bg-muted text-muted-foreground' : 'bg-[#FE2C55]/10 text-[#FE2C55]'}`}
                                                    onClick={() => toggleCampaign(camp.id)}
                                                >
                                                    {disabledCampaignIds.includes(camp.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm max-w-[200px] truncate">{camp.name}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono">#{camp.id.substring(camp.id.length - 8)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-medium">{formatCurrency(camp.spend)}</TableCell>
                                            <TableCell className="text-right">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${ctr >= 0.84 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {formatNumber(ctr)}%
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-bold">{formatNumber(hook)}%</span>
                                                    <div className="w-16 h-1 bg-muted rounded-full mt-1">
                                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(hook, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`text-xs ${ret50 >= 30 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {formatNumber(ret50)}%
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`text-xs font-mono ${evr >= 40 ? 'text-emerald-500' : 'text-[#FE2C55]'}`}>
                                                    {formatNumber(evr)}%
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                <div className="flex items-center justify-end gap-1">
                                                    {formatNumber(camp.roas)}x
                                                    {parseFloat(camp.roas) > 2 ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }))}
                            </TableBody>
                        </Table>
                    </div>
                    )}
                </CardContent>
            </Card>

            {/* Strategy / Learning Footnote */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-[#FE2C55]/5 to-transparent border border-[#FE2C55]/10 flex flex-col md:flex-row gap-6 items-start">
                <div className="p-3 rounded-full bg-[#FE2C55]/10 text-[#FE2C55]">
                    <ShieldCheck size={24} />
                </div>
                <div className="space-y-2">
                    <h4 className="font-bold">Estrategia 2026: Medición del Impacto Incremental</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-4xl">
                        TikTok es marketing de descubrimiento. El modelo de **Last-Click** subvalora TikTok en un 30-40%. 
                        Nuestra plataforma utiliza **Engaged View Attribution (1-7 días)** para capturar usuarios que vieron 
                        6s o más de tu anuncio y convirtieron días después sin hacer clic. Refresca creatividades cada 2-3 semanas 
                        para evitar la fatiga algorítmica.
                    </p>
                </div>
            </div>
        </div>
    )
}
