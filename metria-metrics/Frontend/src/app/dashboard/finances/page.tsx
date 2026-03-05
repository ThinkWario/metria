"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DollarSign, AlertTriangle, TrendingDown, Settings2 } from "lucide-react"

const monthlyFixedCosts = [
    { id: 1, name: "Shopify Plan", amount: "$39.00", category: "Suscripción" },
    { id: 2, name: "Dominio (Anual / 12)", amount: "$1.50", category: "Infraestructura" },
    { id: 3, name: "Herramienta Email", amount: "$25.00", category: "Marketing" },
    { id: 4, name: "Sueldo Asistente", amount: "$400.00", category: "Nómina" },
]

const marginAlerts = [
    { sku: "HOG-001-A", name: "Limpiador Ultrasónico", margin: "18%", target: "25%", status: "critical", cost: "$12.50", price: "$29.90" },
    { sku: "FIT-002-B", name: "Bandas Elásticas Pro", margin: "15%", target: "30%", status: "critical", cost: "$5.80", price: "$15.00" },
]

export default function FinancesPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Finanzas E-commerce</h1>
                <p className="text-muted-foreground">Control avanzado de utilidad neta, costos fijos y salud del margen.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos (Bruto)</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$18,500.00</div>
                        <p className="text-xs text-muted-foreground mt-1">Shopify Sales TTV</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">- AdSpend</CardTitle>
                        <img src="/meta-logo.svg" alt="Meta" className="h-4 w-4 opacity-70 grayscale" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-chart-2">-$4,200.00</div>
                        <p className="text-xs text-muted-foreground mt-1">Meta Ads API</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">- COGS & Envíos</CardTitle>
                        <img src="/dropy-logo.svg" alt="Dropy" className="h-4 w-4 opacity-70 grayscale" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-chart-3">-$6,100.00</div>
                        <p className="text-xs text-muted-foreground mt-1">Dropy + Costo Prod.</p>
                    </CardContent>
                </Card>
                <Card className="bg-primary/5 backdrop-blur-xl border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-bold text-primary">Utilidad Neta (Profit)</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$8,200.00</div>
                        <Badge variant="outline" className="mt-1 bg-primary/10 text-primary border-primary/20">44.3% Margen Op.</Badge>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 flex flex-col">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    Semáforo de Margen
                                </CardTitle>
                                <CardDescription>SKUs con margen de contribución bajo umbral (&lt; 20%)</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Precio / Costo</TableHead>
                                    <TableHead className="text-right">Margen Real</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {marginAlerts.map((alert) => (
                                    <TableRow key={alert.sku}>
                                        <TableCell>
                                            <div className="font-medium">{alert.name}</div>
                                            <div className="text-xs text-muted-foreground">{alert.sku}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm font-medium">{alert.price}</div>
                                            <div className="text-xs text-muted-foreground">COGS: {alert.cost}</div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="destructive" className="font-mono">
                                                <TrendingDown className="h-3 w-3 mr-1" />
                                                {alert.margin}
                                            </Badge>
                                            <div className="text-xs text-muted-foreground mt-1">Objetivo: {alert.target}</div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <div className="space-y-4 flex flex-col">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center justify-between text-base">
                                Costos Fijos Mensuales
                                <span className="text-sm font-normal text-muted-foreground border border-border/50 px-2 py-1 rounded-md bg-background/50">Total: $465.50</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead>Categoría</TableHead>
                                        <TableHead className="text-right">Monto</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {monthlyFixedCosts.map((cost) => (
                                        <TableRow key={cost.id}>
                                            <TableCell className="font-medium">{cost.name}</TableCell>
                                            <TableCell><Badge variant="secondary" className="font-normal">{cost.category}</Badge></TableCell>
                                            <TableCell className="text-right font-mono">{cost.amount}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Settings2 className="h-4 w-4 text-muted-foreground" />
                                Tax & Fees
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-sm">Comisión Pasarela</div>
                                        <div className="text-xs text-muted-foreground">MercadoPago / Stripe</div>
                                    </div>
                                    <div className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-1 bg-background/50">
                                        <span className="font-mono text-sm">3.49% + $0.30</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium text-sm">Retención de Impuestos</div>
                                        <div className="text-xs text-muted-foreground">IVA o taxes locales por defecto</div>
                                    </div>
                                    <div className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-1 bg-background/50">
                                        <span className="font-mono text-sm">19.00%</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
