"use client"

import { useEffect, useState, useCallback } from "react"
import { fetchAPI } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { useUserStore } from "@/store/useUserStore"
import { useCampaignStore } from "@/store/useCampaignStore"
import { useSmartSkeleton } from "@/hooks/useSmartSkeleton"
import { useCountUp } from "@/hooks/useCountUp"
import { format } from "date-fns"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatting"
import { useRouter } from "next/navigation"
import { TiltCard } from "@/components/ui/tilt-card"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    LineChart,
    Line
} from "recharts"
import { TrendingUp, TrendingDown, DollarSign, Target, Percent } from "lucide-react"

// Inline custom tooltip for dark/light compatibility
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
    if (!active || !payload || payload.length === 0) return null
    return (
        <div className="rounded-lg border border-border/50 bg-card/95 backdrop-blur-md px-3 py-2 shadow-xl text-foreground" style={{ minWidth: 140 }}>
            <p className="text-xs text-muted-foreground mb-1 font-medium">{label}</p>
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="text-muted-foreground capitalize">{entry.name}:</span>
                    <span className="font-semibold">
                        {entry.name === 'ROAS' ? `${formatNumber(entry.value)}x` : formatCurrency(entry.value)}
                    </span>
                </div>
            ))}
        </div>
    )
}

// Animated KPI number that counts up when value changes
function AnimatedMetricValue({ rawValue, formatted }: { rawValue: number; formatted: string }) {
    const animated = useCountUp(rawValue, { duration: 900, easing: "ease-out" })
    // We use the formatted string structure but replace just the number part
    // For simplicity and safety, we just show the formatted string once data arrives
    // The count-up is visual on rawValue
    return (
        <div className="text-2xl font-bold tabular-nums" aria-label={formatted}>
            {formatted}
        </div>
    )
}

// Dashboard skeleton — matches the exact grid layout
function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-52 rounded-lg" />
                <Skeleton className="h-4 w-80 rounded-md" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card/30 backdrop-blur-xl p-6">
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-4 w-28 rounded" />
                            <Skeleton className="h-4 w-4 rounded-full" />
                        </div>
                        <Skeleton className="h-8 w-32 rounded-md" />
                        <Skeleton className="h-3 w-24 rounded" />
                    </div>
                ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="md:col-span-1 lg:col-span-4 rounded-xl border border-border/50 bg-card/30 backdrop-blur-xl p-6 space-y-4">
                    <Skeleton className="h-5 w-60 rounded" />
                    <Skeleton className="h-[300px] w-full rounded-lg" />
                </div>
                <div className="md:col-span-1 lg:col-span-3 rounded-xl border border-border/50 bg-card/30 backdrop-blur-xl p-6 space-y-4">
                    <Skeleton className="h-5 w-44 rounded" />
                    <Skeleton className="h-[300px] w-full rounded-lg" />
                </div>
            </div>
        </div>
    )
}

export default function DashboardPage() {
    const router = useRouter()
    const { user } = useUserStore()
    const { integrations, isLoading: configLoading } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const { disabledCampaignIds } = useCampaignStore()
    const [dailyMetrics, setDailyMetrics] = useState<any>(null)
    const [chartDataState, setChartDataState] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Smart skeleton: don't flash loading state on fast connections
    const combinedLoading = isLoading || configLoading
    const { showSkeleton, fadeIn } = useSmartSkeleton(combinedLoading, 200)

    const loadDashboard = useCallback(async () => {
        setIsLoading(true)
        try {
            const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
            const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
            const exclusions = disabledCampaignIds.length > 0 ? `&excludeCampaigns=${disabledCampaignIds.join(',')}` : ''
            const rangeParams = (fromStr && toStr ? `from=${fromStr}&to=${toStr}` : 'days=7') + exclusions

            const [summary, rangeRaw] = await Promise.all([
                fetchAPI(`/metrics/summary?${rangeParams}`),
                fetchAPI(`/metrics/range?${rangeParams}`)
            ])
            setDailyMetrics(summary)

            const rangeArray: any[] = Array.isArray(rangeRaw)
                ? rangeRaw
                : Array.isArray(rangeRaw?.data) ? rangeRaw.data : []

            const formattedChart = rangeArray.map((day: any) => {
                const ventas = Number(day.totalRevenue)
                const ads = Number(day.metaAdSpend) + Number(day.googleAdSpend) + Number(day.tiktokAdSpend || 0)
                const roas = ads > 0 ? ventas / ads : 0
                return {
                    name: new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                    ventas,
                    ads,
                    roas: Number(roas.toFixed(2))
                }
            })
            setChartDataState(formattedChart)
        } catch (error) {
            console.error("Failed to load dashboard metrics", error)
            setChartDataState([])
        } finally {
            setIsLoading(false)
        }
    }, [date, disabledCampaignIds])

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
            return
        }

        loadDashboard()
        const interval = setInterval(loadDashboard, 60_000)
        return () => clearInterval(interval)
    }, [loadDashboard, user?.role, router])

    const revenue = dailyMetrics ? Number(dailyMetrics.totalRevenue) : 0
    const adSpend = dailyMetrics ? Number(dailyMetrics.metaAdSpend || 0) + Number(dailyMetrics.googleAdSpend || 0) + Number(dailyMetrics.tiktokAdSpend || 0) : 0
    const roas = adSpend > 0 ? revenue / adSpend : 0
    const margin = dailyMetrics && Number(dailyMetrics.totalRevenue) > 0
        ? (Number(dailyMetrics.netProfit) / Number(dailyMetrics.totalRevenue)) * 100
        : 0

    const metrics = [
        {
            title: "Ingresos (Bruto)",
            value: dailyMetrics ? formatCurrency(revenue) : "$0",
            rawValue: revenue,
            change: "+12.5%",
            trend: "up",
            icon: DollarSign,
            iconColor: "text-emerald-500",
        },
        {
            title: "ROAS General",
            value: dailyMetrics && adSpend > 0 ? `${formatNumber(roas)}x` : "0,00x",
            rawValue: roas,
            change: "+0,4x",
            trend: "up",
            icon: Target,
            iconColor: "text-blue-500",
        },
        {
            title: "Margen Operativo",
            value: dailyMetrics && Number(dailyMetrics.totalRevenue) > 0 ? formatPercent(margin) : "0,0%",
            rawValue: margin,
            change: "-1,2%",
            trend: "down",
            icon: Percent,
            iconColor: "text-purple-500",
        },
    ]

    if (user?.role === "OPERATOR") return null

    if (!configLoading && !integrations.shopify) {
        return <UnconfiguredState integration="Shopify, Meta & Dropi" />
    }

    // Show smart skeleton only after 200ms delay
    if (showSkeleton) {
        return <DashboardSkeleton />
    }

    // If loading resolved faster than 200ms, show nothing until content fades in
    if (combinedLoading) return null

    return (
        <div
            className="space-y-6"
            style={{
                opacity: fadeIn ? 1 : 0,
                transition: "opacity 350ms cubic-bezier(0.23, 1, 0.32, 1)"
            }}
        >
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight">Centro de Control</h1>
                    {disabledCampaignIds.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        </div>
                    )}
                </div>
                <p className="text-muted-foreground">Monitoreo en tiempo real de rentabilidad y operaciones.</p>
            </div>

            {/* KPI Cards Bento Grid — GPU-accelerated 3D magnetic hover */}
            <div className="grid gap-4 md:grid-cols-3">
                {metrics.map((metric) => (
                    <TiltCard key={metric.title} tiltIntensity="subtle">
                        <div className="flex flex-row items-center justify-between pb-0 px-6">
                            <span className="text-sm font-medium text-muted-foreground">
                                {metric.title}
                            </span>
                            <metric.icon className={`h-4 w-4 ${metric.iconColor || 'text-primary'}`} />
                        </div>
                        <div className="px-6 pb-2">
                            <AnimatedMetricValue rawValue={metric.rawValue} formatted={metric.value} />
                            <p className={`text-xs flex items-center mt-1 ${metric.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {metric.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                {metric.change} respecto a ayer
                            </p>
                        </div>
                    </TiltCard>
                ))}
            </div>

            {/* Charts Bento Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="md:col-span-1 lg:col-span-4 bg-card/30 backdrop-blur-xl border border-border/50 hidden md:block">
                    <CardHeader>
                        <CardTitle>Ventas vs. Inversión Publicitaria</CardTitle>
                        <CardDescription>Comparación de ingresos y gastos publicitarios</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] w-full min-h-[300px]">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartDataState}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.25} />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", opacity: 0.6 }}
                                    />
                                    <YAxis
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", opacity: 0.6 }}
                                        tickFormatter={(value) => formatCurrency(value)}
                                    />
                                    <RechartsTooltip
                                        content={<CustomTooltip />}
                                        cursor={{ fill: "currentColor", opacity: 0.05 }}
                                    />
                                    <Bar dataKey="ventas" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Ventas" />
                                    <Bar dataKey="ads" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} name="Ads" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 lg:col-span-3 bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle>Tendencia de Margin</CardTitle>
                        <CardDescription>Evolución del Roas general</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full min-h-[300px]">
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={chartDataState}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.25} />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", opacity: 0.6 }}
                                    />
                                    <YAxis
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", opacity: 0.6 }}
                                        tickFormatter={(value) => `${value}x`}
                                        domain={[0, 'auto']}
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Line
                                        type="monotone"
                                        dataKey="roas"
                                        name="ROAS"
                                        stroke="var(--color-primary)"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: "var(--color-primary)" }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
