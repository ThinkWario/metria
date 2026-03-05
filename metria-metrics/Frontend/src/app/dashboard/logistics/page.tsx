"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts"
import { Package, Truck, CheckCircle2, XOctagon } from "lucide-react"

const deliveryData = [
    { name: "Entregado", value: 65, color: "var(--color-emerald-500)" },
    { name: "En Tránsito", value: 20, color: "var(--color-blue-500)" },
    { name: "Devuelto", value: 10, color: "var(--color-destructive)" },
    { name: "Pendiente", value: 5, color: "var(--color-muted)" }
]

const recentShipments = [
    { guide: "DRP-9812", client: "Ana Martínez", city: "Bogotá", status: "Entregado", value: "$45.00", fee: "$4.50" },
    { guide: "DRP-9813", client: "Carlos Gómez", city: "Medellín", status: "En Tránsito", value: "$120.00", fee: "Pendiente" },
    { guide: "DRP-9814", client: "Lucía Fernández", city: "Cali", status: "Devuelto", value: "$35.00", fee: "$3.50" },
    { guide: "DRP-9815", client: "Pedro Sánchez", city: "Cartagena", status: "Pendiente", value: "$85.00", fee: "Pendiente" }
]

export default function LogisticsPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    Logística & Operaciones
                    <Badge className="bg-slate-700 hover:bg-slate-800 text-white border-transparent">Dropy API Live</Badge>
                </h1>
                <p className="text-muted-foreground">Monitoreo de guías, efectividad de entrega y conciliación de recaudos Dropy.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de Entrega Global</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">65.0%</div>
                        <p className="text-xs text-muted-foreground mt-1">Crítico para modelo Contra Entrega</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Devoluciones (Novedades)</CardTitle>
                        <XOctagon className="h-4 w-4 text-destructive" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">10.0%</div>
                        <p className="text-xs text-muted-foreground mt-1">Órdenes que generan costo hundido</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Guías Activas</CardTitle>
                        <Truck className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">25</div>
                        <p className="text-xs text-muted-foreground mt-1">En tránsito + Pendientes</p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 backdrop-blur-xl border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold text-primary">Recaudado (A Conciliar)</CardTitle>
                        <Package className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$1,450.00</div>
                        <p className="text-xs text-muted-foreground mt-1">En billetera Dropy</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {/* Delivery Chart */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-1">
                    <CardHeader>
                        <CardTitle>Estado Actual</CardTitle>
                        <CardDescription>Distribución de los últimos 100 envíos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={deliveryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {deliveryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value) => <span className="text-muted-foreground text-xs">{value}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Guides Table */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-2">
                    <CardHeader>
                        <CardTitle>Seguimiento de Guías (Tiempo Real)</CardTitle>
                        <CardDescription>Últimas actualizaciones desde transportadoras.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Guía Dropy</TableHead>
                                    <TableHead>Cliente / Destino</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Recaudo</TableHead>
                                    <TableHead className="text-right">Costo Flete</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentShipments.map((ship) => (
                                    <TableRow key={ship.guide}>
                                        <TableCell className="font-mono text-xs font-medium text-primary cursor-pointer hover:underline">{ship.guide}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{ship.client}</div>
                                            <div className="text-xs text-muted-foreground">{ship.city}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={ship.status === "Entregado" ? "default" : ship.status === "Devuelto" ? "destructive" : ship.status === "En Tránsito" ? "secondary" : "outline"}
                                                className={ship.status === "Entregado" ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" : ship.status === "En Tránsito" ? "bg-blue-500/20 text-blue-500 border-blue-500/30" : ""}>
                                                {ship.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{ship.value}</TableCell>
                                        <TableCell className="text-right text-muted-foreground text-xs">{ship.fee}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
