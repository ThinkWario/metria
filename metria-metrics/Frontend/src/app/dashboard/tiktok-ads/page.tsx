"use client"

import { useEffect, useState } from "react"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { Smartphone, Target, TrendingUp, PlaySquare, Loader2, Eye, EyeOff } from "lucide-react"
import { fetchAPI } from "@/lib/api"
import { formatCurrency, formatNumber } from "@/lib/formatting"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useUserStore } from "@/store/useUserStore"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

const performanceData = [
    { date: "01 Mar", spend: 80, conversions: 10, cpa: 8 },
    { date: "02 Mar", spend: 90, conversions: 12, cpa: 7.5 },
    { date: "03 Mar", spend: 110, conversions: 10, cpa: 11 },
    { date: "04 Mar", spend: 100, conversions: 15, cpa: 6.6 },
    { date: "05 Mar", spend: 130, conversions: 20, cpa: 6.5 },
    { date: "06 Mar", spend: 150, conversions: 25, cpa: 6.0 },
]

export default function TikTokAdsPage() {
    const router = useRouter()
    const { user } = useUserStore()
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds, toggleCampaign } = useCampaignStore()
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
            return
        }
        if (!integrations.tiktok) return
        const loadCampaigns = async () => {
            try {
                const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
                const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
                const rangeParams = fromStr && toStr ? `from=${fromStr}&to=${toStr}` : ''
                
                const data = await fetchAPI(`/tiktok/campaigns?${rangeParams}`)
                setCampaigns(data || [])
            } catch (error) {
                console.error("Failed to load TikTok campaigns:", error)
            } finally {
                setIsLoading(false)
            }
        }
        loadCampaigns()
    }, [integrations.tiktok, date, user?.role, router])

    if (user?.role === "OPERATOR") return null
    if (!integrations.tiktok) return <UnconfiguredState integration="TikTok Ads" />

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        TikTok Ads
                        <Badge className="bg-black hover:bg-zinc-800 text-white border-transparent">API Live</Badge>
                    </h1>
                    <div className="flex items-center gap-3">
                        {disabledCampaignIds.length > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        )}
                    </div>
                </div>
                <p className="text-muted-foreground">Rendimiento de campañas de video y Spark Ads consolidadas.</p>
            </div>

            {/* TikTok Campaigns Dashboard */}
            <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-black dark:text-white" />
                        Dashboard de Campañas TikTok
                    </CardTitle>
                    <CardDescription>Estadísticas sincronizadas con TikTok Ads API.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
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
                                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24 border-dashed">
                                        No se encontraron campañas. Sincroniza desde las integraciones.
                                    </TableCell>
                                </TableRow>
                            ) : (
                            campaigns.map((camp) => (
                                <TableRow key={camp.id} className={disabledCampaignIds.includes(camp.id) ? "opacity-50 grayscale bg-muted/20" : ""}>
                                    <TableCell className="w-[50px]">
                                        <button
                                            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"
                                            onClick={() => toggleCampaign(camp.id)}
                                        >
                                            {disabledCampaignIds.includes(camp.id) ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                                        </button>
                                    </TableCell>
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
                            <PlaySquare className="h-5 w-5 text-chart-4" />
                            Creative Insights
                        </CardTitle>
                        <CardDescription>Formatos de video de mayor rendimiento.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                            <div>
                                <div className="font-medium text-sm">&quot;UGC Testimonial 01&quot;</div>
                                <div className="text-xs text-emerald-500 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" /> Spark Ad
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-primary">25 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(2.10)}</div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                            <div>
                                <div className="font-medium text-sm">&quot;Demo Producto 03&quot;</div>
                                <div className="text-xs text-blue-500 flex items-center gap-1">
                                    <Smartphone className="h-3 w-3" /> In-Feed Video
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-primary">15 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(4.40)}</div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors opacity-70">
                            <div>
                                <div className="font-medium text-sm">&quot;Trend Audio Challenge&quot;</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Target className="h-3 w-3" /> Spark Ad
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold">5 Conv.</div>
                                <div className="text-xs text-muted-foreground">CPA: {formatCurrency(8.90)}</div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary px-3 py-2 rounded-md w-full">
                            💡 UGC está generando el mayor volumen de conversiones a bajo costo. Se recomienda escalar budget.
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
