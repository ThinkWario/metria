"use client"

import { useQuery } from "@tanstack/react-query"
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
import { useEffect } from "react"
import { TiltCard } from "@/components/ui/tilt-card"
import { OnboardingWizard } from "@/components/dashboard/onboarding-wizard"
import { WhatIfSimulator } from "@/components/dashboard/what-if-simulator"

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

function AnimatedMetricValue({ rawValue, formatted }: { rawValue: number; formatted: string }) {
    useCountUp(rawValue, { duration: 900, easing: "ease-out" })
    return (
        <div className="text-2xl font-bold tabular-nums" aria-label={formatted}>
            {formatted}
        </div>
    )
}

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

    useEffect(() => {
        if (user?.role === "OPERATOR") router.push("/dashboard/logistics")
    }, [user?.role, router])

    const from = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
    const to = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
    const exclusions = disabledCampaignIds.length > 0 ? `&excludeCampaigns=${disabledCampaignIds.join(',')}` : ''
    const rangeParams = (from && to ? `from=${from}&to=${to}` : 'days=7') + exclusions

    const { data: dailyMetrics, isLoading: summaryLoading } = useQuery({
        queryKey: ['metrics', 'summary', { from, to, exclusions }],
        queryFn: () => fetchAPI(`/metrics/summary?${rangeParams}`),
        refetchInterval: 60_000,
        enabled: !configLoading
    })

    const { data: chartDataState = [], isLoading: rangeLoading } = useQuery({
        queryKey: ['metrics', 'range', { from, to }],
        queryFn: () => fetchAPI(`/metrics/range?${rangeParams}`),
        refetchInterval: 60_000,
        enabled: !configLoading,
        select: (raw: any) => {
            const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []
            return arr.map((day: any) => {
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
        }
    })

    const isLoading = summaryLoading || rangeLoading || configLoading
    const { showSkeleton, fadeIn } = useSmartSkeleton(isLoading, 200)

    const revenue = dailyMetrics ? Number(dailyMetrics.totalRevenue) : 0
    const adSpend = dailyMetrics ? Number(dailyMetrics.metaAdSpend || 0) + Number(dailyMetrics.googleAdSpend || 0) + Number(dailyMetrics.tiktokAdSpend || 0) : 0
    const roas = adSpend > 0 ? revenue / adSpend : 0
    const margin = dailyMetrics && Number(dailyMetrics.totalRevenue) > 0
        ? (Number(dailyMetrics.netProfit) / Number(dailyMetrics.totalRevenue)) * 100
        : 0

    const prev = dailyMetrics?.previousPeriod
    const prevRevenue = prev ? Number(prev.totalRevenue) : 0
    const prevAdSpend = prev ? Number(prev.metaAdSpend || 0) + Number(prev.googleAdSpend || 0) + Number(prev.tiktokAdSpend || 0) : 0
    const prevRoas = prevAdSpend > 0 ? prevRevenue / prevAdSpend : 0
    const prevMargin = prev && prevRevenue > 0 ? (Number(prev.netProfit) / prevRevenue) * 100 : 0

    const calcPctChange = (current: number, previous: number): { label: string; trend: "up" | "down" | "neutral" } => {
        if (!prev || previous === 0) return { label: "—", trend: "neutral" }
        const pct = ((current - previous) / Math.abs(previous)) * 100
        return { label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, trend: pct >= 0 ? "up" : "down" }
    }

    const revenueChange = calcPctChange(revenue, prevRevenue)
    const roasChange = (() => {
        if (!prev || prevRoas === 0) return { label: "—", trend: "neutral" as const }
        const diff = roas - prevRoas
        return { label: `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}x`, trend: diff >= 0 ? "up" as const : "down" as const }
    })()
    const marginChange = calcPctChange(margin, prevMargin)

    const metrics = [
        {
            title: "Ingresos (Bruto)",
            value: dailyMetrics ? formatCurrency(revenue) : "$0",
            rawValue: revenue,
            change: revenueChange.label,
            trend: revenueChange.trend,
            icon: DollarSign,
            iconColor: "text-emerald-500",
        },
        {
            title: "ROAS General",
            value: dailyMetrics && adSpend > 0 ? `${formatNumber(roas)}x` : "0,00x",
            rawValue: roas,
            change: roasChange.label,
            trend: roasChange.trend,
            icon: Target,
            iconColor: "text-blue-500",
        },
        {
            title: "Margen Operativo",
            value: dailyMetrics && Number(dailyMetrics.totalRevenue) > 0 ? formatPercent(margin) : "0,0%",
            rawValue: margin,
            change: marginChange.label,
            trend: marginChange.trend,
            icon: Percent,
            iconColor: "text-purple-500",
        },
    ]

    if (user?.role === "OPERATOR") return null

    if (!configLoading && !integrations.shopify) {
        return <UnconfiguredState integration="Shopify, Meta & Dropi" />
    }

    if (showSkeleton) return <DashboardSkeleton />
    if (isLoading) return null

    const isNewUser = !configLoading && !integrations.shopify && !integrations.meta && !integrations.google && !integrations.tiktok

    return (
        <div className="relative">
            {isNewUser && <OnboardingWizard />}
            <div 
                className={`space-y-6 transition-all duration-700 ${isNewUser ? 'blur-md pointer-events-none opacity-50' : 'opacity-100'}`}
                style={{ opacity: fadeIn ? 1 : 0, transition: "opacity 350ms cubic-bezier(0.23, 1, 0.32, 1)" }}
            >
            <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight">Centro de Control</h1>
                    <div className="flex items-center gap-3">
                        {dailyMetrics && (
                            <WhatIfSimulator 
                                baseRevenue={revenue}
                                baseCogs={Number(dailyMetrics.totalCogs || 0)}
                                baseAdSpend={adSpend}
                                baseShipping={Number(dailyMetrics.totalShipping || 0)}
                                baseFixedCosts={Number(dailyMetrics.totalFixedCosts || 0)}
                            />
                        )}
                        {disabledCampaignIds.length > 0 && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 animate-pulse">
                                {disabledCampaignIds.length} campañas filtradas
                            </Badge>
                        )}
                    </div>
                </div>
                <p className="text-muted-foreground">Monitoreo en tiempo real de rentabilidad y operaciones.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {metrics.map((metric) => (
                    <TiltCard key={metric.title} tiltIntensity="subtle">
                        <div className="flex flex-row items-center justify-between pb-0 px-6">
                            <span className="text-sm font-medium text-muted-foreground">{metric.title}</span>
                            <metric.icon className={`h-4 w-4 ${metric.iconColor || 'text-primary'}`} />
                        </div>
                        <div className="px-6 pb-2">
                            <AnimatedMetricValue rawValue={metric.rawValue} formatted={metric.value} />
                            <p className={`text-xs flex items-center mt-1 ${metric.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {metric.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                {metric.change} respecto al {date?.from && date?.to && format(date.from, 'yyyy-MM-dd') === format(date.to, 'yyyy-MM-dd') ? 'ayer' : 'período anterior'}
                            </p>
                        </div>
                    </TiltCard>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="md:col-span-1 lg:col-span-4 bg-card/30 backdrop-blur-xl border border-border/80">
                    <CardHeader>
                        <CardTitle>Ventas vs. Inversión Publicitaria</CardTitle>
                        <CardDescription>Comparación de ingresos y gastos publicitarios</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] w-full min-h-[300px]">
                            {chartDataState.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                    Sin datos para el período seleccionado
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={chartDataState}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.4} />
                                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "currentColor", opacity: 0.8 }} />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "currentColor", opacity: 0.8 }} tickFormatter={(value) => formatCurrency(value)} />
                                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
                                        <Bar dataKey="ventas" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Ventas" />
                                        <Bar dataKey="ads" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} name="Ads" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 lg:col-span-3 bg-card/30 backdrop-blur-xl border border-border/80">
                    <CardHeader>
                        <CardTitle>Tendencia de ROAS</CardTitle>
                        <CardDescription>Evolución del ROAS general (Ventas / Ads)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full min-h-[300px]">
                            {chartDataState.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                    Sin datos para el período seleccionado
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartDataState}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.4} />
                                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "currentColor", opacity: 0.8 }} />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "currentColor", opacity: 0.8 }} tickFormatter={(value) => `${value}x`} domain={[0, 'auto']} />
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="roas" name="ROAS" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-primary)" }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
        </div>
    )
}
