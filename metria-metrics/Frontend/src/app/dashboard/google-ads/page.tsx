"use client"

import { useEffect, useState } from "react"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { MousePointerClick, Target, TrendingUp, Search, Loader2 } from "lucide-react"
import { fetchAPI } from "@/lib/api"
import { formatCurrency, formatNumber } from "@/lib/formatting"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"

const performanceData = [
    { date: "01 Mar", spend: 120, conversions: 15, cpa: 8 },
    { date: "02 Mar", spend: 135, conversions: 18, cpa: 7.5 },
    { date: "03 Mar", spend: 150, conversions: 14, cpa: 10.7 },
    { date: "04 Mar", spend: 140, conversions: 22, cpa: 6.3 },
    { date: "05 Mar", spend: 180, conversions: 28, cpa: 6.4 },
    { date: "06 Mar", spend: 210, conversions: 35, cpa: 6.0 },
]

export default function GoogleAdsPage() {
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!integrations.google) return
        const loadCampaigns = async () => {
            try {
                const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
                const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
                const rangeParams = fromStr && toStr ? `from=${fromStr}&to=${toStr}` : ''
                
                const data = await fetchAPI(`/google/campaigns?${rangeParams}`)
                setCampaigns(data || [])
            } catch (error) {
                console.error("Failed to load Google campaigns:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadCampaigns()
    }, [integrations.google, date])

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
                    <CardDescription>Estadísticas sincronizadas con Google Ads API (Timezone: America/Santiago).</CardDescription>
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
                            campaigns.map((camp) => (
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
                {/* Spend vs Conversions Chart */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-chart-1" />
                            Spend vs Conversiones (7D)
                        </CardTitle>
                        <CardDescription>Relación entre gasto diario y volumen de conversiones.</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                            <div>
                                <div className="font-medium text-sm">&quot;metria metrics software&quot;</div>
                                <div className="text-xs text-emerald-500 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" /> Brand Search
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-primary">12 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(2.10)}</div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                            <div>
                                <div className="font-medium text-sm">&quot;profit tracking e-commerce&quot;</div>
                                <div className="text-xs text-blue-500 flex items-center gap-1">
                                    <MousePointerClick className="h-3 w-3" /> Generic Search
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-primary">8 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(15.40)}</div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors opacity-70">
                            <div>
                                <div className="font-medium text-sm">&quot;shopify google ads integration&quot;</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Target className="h-3 w-3" /> Long tail
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold">3 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(8.90)}</div>
                            </div>
                        </div>
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
