"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ShoppingCart, RefreshCcw, HandCoins, UserCheck } from "lucide-react"

// Mock Shopify Data
const orders = [
    { id: "#1042", customer: "María Gómez", date: "Hoy, 10:42 AM", status: "Pagado", fulfillment: "Preparando", total: "$45.00" },
    { id: "#1041", customer: "Juan Pérez", date: "Hoy, 09:15 AM", status: "Pendiente", fulfillment: "No preparado", total: "$120.00" },
    { id: "#1040", customer: "Carla Ruiz", date: "Ayer, 04:30 PM", status: "Pagado", fulfillment: "Enviado", total: "$75.50" },
    { id: "#1039", customer: "Luis Díaz", date: "Ayer, 11:20 AM", status: "Reembolsado", fulfillment: "Devuelto", total: "$35.00" },
]

const skuPerformance = [
    { sku: "HOG-001-A", name: "Limpiador Ultrasónico", sales: 145, revenue: "$4,335.50", cogs: "$1,812.50", adspend: "$950.00", profit: "$1,573.00", margin: "36%" },
    { sku: "TEC-005", name: "Auriculares Inalámbricos", sales: 98, revenue: "$2,940.00", cogs: "$1,176.00", adspend: "$800.00", profit: "$964.00", margin: "32%" },
    { sku: "FIT-002-B", name: "Bandas Elásticas Pro", sales: 210, revenue: "$3,150.00", cogs: "$1,218.00", adspend: "$1,500.00", profit: "$432.00", margin: "13%" },
]

export default function SalesPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Canales de Venta</h1>
                <p className="text-muted-foreground">Listado de órdenes, análisis de SKU y métricas de retención de Shopify.</p>
            </div>

            <Tabs defaultValue="orders" className="space-y-4">
                <TabsList className="bg-card/50 backdrop-blur-md border border-border/50">
                    <TabsTrigger value="orders" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Órdenes
                    </TabsTrigger>
                    <TabsTrigger value="sku" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <HandCoins className="w-4 h-4 mr-2" />
                        Rendimiento SKU
                    </TabsTrigger>
                    <TabsTrigger value="customers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <UserCheck className="w-4 h-4 mr-2" />
                        Clientes (LTV)
                    </TabsTrigger>
                    <TabsTrigger value="returns" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                        <RefreshCcw className="w-4 h-4 mr-2" />
                        Retornos
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="space-y-4">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle>Últimas Órdenes Ingresadas</CardTitle>
                            <CardDescription>Sincronizadas en tiempo real vía Webhooks de Shopify.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[100px]">Orden</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Estado Pago</TableHead>
                                        <TableHead>Cumplimiento</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-medium text-primary hover:underline cursor-pointer">{order.id}</TableCell>
                                            <TableCell className="text-muted-foreground">{order.date}</TableCell>
                                            <TableCell>{order.customer}</TableCell>
                                            <TableCell>
                                                <Badge variant={order.status === "Pagado" ? "default" : order.status === "Reembolsado" ? "destructive" : "secondary"}
                                                    className={order.status === "Pagado" ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border-emerald-500/30" : ""}>
                                                    {order.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-muted-foreground">{order.fulfillment}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium">{order.total}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="sku" className="space-y-4">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle>Ranking de SKUs por Utilidad</CardTitle>
                            <CardDescription>Productos ordenados por el Profit Real generado luego de descontar su AdSpend asignado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>SKU / Producto</TableHead>
                                        <TableHead className="text-right">Ventas</TableHead>
                                        <TableHead className="text-right">Ingresos</TableHead>
                                        <TableHead className="text-right text-muted-foreground">COGS</TableHead>
                                        <TableHead className="text-right text-chart-2">- AdSpend</TableHead>
                                        <TableHead className="text-right text-primary">Profit Neto</TableHead>
                                        <TableHead className="text-right">Margen</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {skuPerformance.map((sku) => (
                                        <TableRow key={sku.sku}>
                                            <TableCell>
                                                <div className="font-medium">{sku.name}</div>
                                                <div className="text-xs text-muted-foreground font-mono">{sku.sku}</div>
                                            </TableCell>
                                            <TableCell className="text-right">{sku.sales}</TableCell>
                                            <TableCell className="text-right font-medium">{sku.revenue}</TableCell>
                                            <TableCell className="text-right text-muted-foreground">{sku.cogs}</TableCell>
                                            <TableCell className="text-right text-chart-2">{sku.adspend}</TableCell>
                                            <TableCell className="text-right font-bold text-primary bg-primary/5">{sku.profit}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={parseInt(sku.margin) > 20 ? "outline" : "destructive"}>
                                                    {sku.margin}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="customers">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-muted-foreground">Lifetime Value (LTV)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-primary">$185.50</div>
                                <p className="text-xs text-muted-foreground mt-1">Valor promedio generado por cliente en 12 meses.</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-muted-foreground">Tasa de Recompra</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">14.2%</div>
                                <p className="text-xs text-muted-foreground mt-1">Usuarios que compraron más de 1 vez.</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="returns">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle>Impacto de Reembolsos</CardTitle>
                            <CardDescription>Métricas vacías o en sincronización.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-32 flex items-center justify-center border border-dashed border-border/50 rounded-lg text-muted-foreground">
                            No hay reembolsos registrados recientemente.
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </div>
    )
}
