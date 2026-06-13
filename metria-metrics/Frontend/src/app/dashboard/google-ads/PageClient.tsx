"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { MousePointerClick, Target, TrendingUp, Search, Loader2, BarChart2 } from "lucide-react"
import { fetchAPI } from "@/lib/api"
import { formatCurrency, formatNumber } from "@/lib/formatting"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

export default function GoogleAdsPageClient() {
    const router = useRouter()
    const { user } = useUserStore()
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()

    const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const rangeParams = fromStr && toStr ? `from=${fromStr}&to=${toStr}` : ''

    const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
        queryKey: ['google', 'campaigns', { fromStr, toStr }],
        queryFn: () => fetchAPI(`/google/campaigns?${rangeParams}`),
        enabled: !!integrations.google
    })

    const { data: performanceRes = [], isLoading: perfLoading } = useQuery({
        queryKey: ['google', 'performance', { fromStr, toStr }],
        queryFn: () => fetchAPI(`/google/daily-performance?${rangeParams}`),
        enabled: !!integrations.google
    })

    const { data: searchTerms = [], isLoading: termsLoading } = useQuery({
        queryKey: ['google', 'search-terms', { fromStr, toStr }],
        queryFn: () => fetchAPI(`/google/search-terms?${rangeParams}`),
        enabled: !!integrations.google
    })

    const performanceData = Array.isArray(performanceRes) ? performanceRes : []
    const isLoading = campaignsLoading || perfLoading || termsLoading

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
        }
    }, [user?.role, router])

    if (user?.role === "OPERATOR") return null
    if (!integrations.google) return <UnconfiguredState integration="Google Ads" />

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    Google Ads
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-transparent">API Live</Badge>
                </h1>
                <p className="text-muted-foreground">Rendimiento de campañas Search, PMax y YouTube con métricas consolidadas.</p>
            </div>

            {/* Google Campaigns Dashboard */}
            <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-amber-500" />
                        Dashboard de Campañas Google
                    </CardTitle>
                    <CardDescription>Estadísticas sincronizadas con Google Ads API.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Campaña</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Spend</TableHead>
                                <TableHead className="text-right">CPA</TableHead>
                                <TableHead className="text-right text-primary">ROAS</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaigns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground h-24 border-dashed">
                                        No se encontraron campañas. Sincroniza desde las integraciones.
                                    </TableCell>
                                </TableRow>
                            ) : (
                            campaigns.map((camp: any) => (
                                <TableRow key={camp.id}>
                                    <TableCell>
                                        <div className="font-medium">{camp.name}</div>
                                        <div className="text-xs text-muted-foreground font-mono">ID: {camp.id}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={camp.status === "Active" ? "outline" : "secondary"} className={camp.status === "Active" ? "text-emerald-500 border-emerald-500/30" : ""}>
                                            {camp.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(camp.spend)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{formatCurrency(camp.cpa)}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={parseFloat(camp.roas) > 2 ? "default" : "destructive"}>{formatNumber(camp.roas)}x</Badge>
                                    </TableCell>
                                </TableRow>
                            )))}
                        </TableBody>
                    </Table>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Spend vs Conversions Chart — datos reales del período seleccionado */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-chart-1" />
                            Spend vs Conversiones
                        </CardTitle>
                        <CardDescription>Gasto diario y volumen de conversiones en el período seleccionado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                        ) : performanceData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[250px] gap-2 text-muted-foreground">
                                <BarChart2 className="h-8 w-8 opacity-30" />
                                <p className="text-sm">Sin datos para el período seleccionado.</p>
                                <p className="text-xs">Sincroniza Google Ads desde las integraciones.</p>
                            </div>
                        ) : (
                        <div className="h-[250px] w-full min-h-[250px]">
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={performanceData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.25} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.7 }} />
                                    <YAxis yAxisId="left" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.7 }} />
                                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.7 }} />
                                    <RechartsTooltip cursor={{ stroke: "currentColor", opacity: 0.1 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                    <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend ($)" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="conversions" name="Conversiones" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        )}
                    </CardContent>
                </Card>

                {/* Search Term Insights */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-chart-4" />
                            Search Term Insights
                        </CardTitle>
                        <CardDescription>Términos de búsqueda de mayor rendimiento (PMax & Search).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {searchTerms.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-50">
                                <Search className="h-8 w-8 mb-2" />
                                <p className="text-sm">Sin insights disponibles.</p>
                            </div>
                        ) : (
                            searchTerms.map((term: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                                    <div>
                                        <div className="font-medium text-sm">&quot;{term.query}&quot;</div>
                                        <div className={`text-xs flex items-center gap-1 ${term.category === 'Brand Search' ? 'text-emerald-500' : 'text-blue-500'}`}>
                                            {term.category === 'Brand Search' ? <TrendingUp className="h-3 w-3" /> : <MousePointerClick className="h-3 w-3" />}
                                            {term.category}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-primary">{term.conversions} Conv.</div>
                                        <div className="text-xs text-muted-foreground">CPA: {formatCurrency(term.cpa)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary px-3 py-2 rounded-md w-full">
                            💡 PMax está generando el 60% de las conversiones non-brand. Se recomienda escalar budget.
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
