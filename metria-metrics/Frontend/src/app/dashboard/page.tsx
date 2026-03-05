"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

// Mock Data
const metrics = [
    {
        title: "Profit Neto Hoy",
        value: "$12,450",
        change: "+15%",
        trend: "up",
        icon: DollarSign,
    },
    {
        title: "ROAS General",
        value: "3.2x",
        change: "+0.5x",
        trend: "up",
        icon: Target,
    },
    {
        title: "Margen de Contribución",
        value: "22%",
        change: "-2%",
        trend: "down",
        icon: Percent,
    },
]

const chartData = [
    { name: "Lun", ventas: 4000, ads: 1200 },
    { name: "Mar", ventas: 3000, ads: 1398 },
    { name: "Mie", ventas: 2000, ads: 9800 },
    { name: "Jue", ventas: 2780, ads: 3908 },
    { name: "Vie", ventas: 1890, ads: 4800 },
    { name: "Sab", ventas: 2390, ads: 3800 },
    { name: "Dom", ventas: 3490, ads: 4300 },
]

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
                    <span className="font-semibold">${entry.value.toLocaleString()}</span>
                </div>
            ))}
        </div>
    )
}

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Centro de Control</h1>
                <p className="text-muted-foreground">Monitoreo en tiempo real de rentabilidad y operaciones.</p>
            </div>

            {/* KPI Cards Bento Grid */}
            <div className="grid gap-4 md:grid-cols-3">
                {metrics.map((metric) => (
                    <Card key={metric.title} className="bg-card/30 backdrop-blur-xl border border-border/50 shadow-sm hover:shadow-md transition-all">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {metric.title}
                            </CardTitle>
                            <metric.icon className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metric.value}</div>
                            <p className={`text-xs flex items-center mt-1 ${metric.trend === 'up' ? 'text-primary' : 'text-destructive'}`}>
                                {metric.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                {metric.change} respecto a ayer
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts Bento Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="md:col-span-1 lg:col-span-4 bg-card/30 backdrop-blur-xl border border-border/50 hidden md:block">
                    <CardHeader>
                        <CardTitle>Ventas vs. Inversión (Ads)</CardTitle>
                        <CardDescription>Rendimiento de los últimos 7 días</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px] w-full min-h-[300px]">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
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
                                        tickFormatter={(value) => `$${value}`}
                                    />
                                    <RechartsTooltip
                                        content={<CustomTooltip />}
                                        cursor={{ fill: "currentColor", opacity: 0.05 }}
                                    />
                                    <Bar dataKey="ventas" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="ads" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
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
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={{ fill: "currentColor", opacity: 0.6 }}
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Line
                                        type="monotone"
                                        dataKey="ventas"
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
