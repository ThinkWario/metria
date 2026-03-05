"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Megaphone, Link2, MonitorPlay } from "lucide-react"

const campaignMetrics = [
    { id: "123456789", name: "Retargeting - DCO - Oferta Relámpago", status: "Active", spend: "$450.00", cpa: "$12.50", roas: "3.2x", cpp: "$9.00" },
    { id: "987654321", name: "Broad - Video UGC - Limpiador", status: "Active", spend: "$1,200.00", cpa: "$18.90", roas: "1.8x", cpp: "$14.50" },
    { id: "456123789", name: "Lookalike 1% - Compradores 30D", status: "Paused", spend: "$300.00", cpa: "$25.00", roas: "1.1x", cpp: "$21.00" },
]

const creativeData = [
    { name: "Video UGC 1", roas: 4.2 },
    { name: "Carrusel Estático", roas: 2.1 },
    { name: "Video Unboxing", roas: 3.8 },
    { name: "Imagen Beneficios", roas: 1.5 },
]

export default function MarketingPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    Marketing & Ads
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-transparent">Meta API Live</Badge>
                </h1>
                <p className="text-muted-foreground">Rendimiento de campañas, atribución real de Shopify y Testeo de Creativos.</p>
            </div>

            {/* Campaign Dashboard */}
            <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Megaphone className="h-5 w-5 text-chart-2" />
                        Dashboard de Campañas Meta
                    </CardTitle>
                    <CardDescription>Métricas sincronizadas diariamente (Timezone: America/Santiago).</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Campaña</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Spend</TableHead>
                                <TableHead className="text-right">CPA Meta</TableHead>
                                <TableHead className="text-right">ROAS</TableHead>
                                <TableHead className="text-right text-primary">CPA Shopify (CPP)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaignMetrics.map((camp) => (
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
                                    <TableCell className="text-right font-medium">{camp.spend}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">{camp.cpa}</TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant={parseFloat(camp.roas) > 2 ? "default" : "destructive"}>{camp.roas}</Badge>
                                    </TableCell>
                                    {/* CPP = Cost Per Purchase Real sacado cruzando datos */}
                                    <TableCell className="text-right font-bold text-primary">{camp.cpp}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Attribution Map */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-muted-foreground" />
                            Mapeo de Atribución (CBM)
                        </CardTitle>
                        <CardDescription>Cruce de parámetros UTM de Shopify vs IDs de Meta para evadir tracking loss de iOS.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50">
                            <div>
                                <div className="font-medium text-sm">Órdenes Atribuidas (Directas UTM)</div>
                                <div className="text-xs text-muted-foreground">Match 100% confiable</div>
                            </div>
                            <div className="text-2xl font-bold text-primary">245</div>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 opacity-70">
                            <div>
                                <div className="font-medium text-sm">Órdenes Huérfanas (Direct/None)</div>
                                <div className="text-xs text-muted-foreground">Posibles compras afectadas por privacidad</div>
                            </div>
                            <div className="text-2xl font-bold">89</div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary px-3 py-2 rounded-md w-full">
                            💡 La tasa de pérdida de atribución es del 26%. Utiliza el CPA Shopify (CPP) del dashboard superior para escalar con datos reales.
                        </p>
                    </CardFooter>
                </Card>

                {/* Creative Analysis Chart */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MonitorPlay className="h-5 w-5 text-chart-3" />
                            Análisis Creativo Top 4
                        </CardTitle>
                        <CardDescription>Rendimiento por ROAS de los mejores anuncios gráficos/video.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full min-h-[250px]">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart layout="vertical" data={creativeData} margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="currentColor" opacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.7 }} width={100} />
                                    <RechartsTooltip cursor={{ fill: "currentColor", opacity: 0.05 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                                    <Bar dataKey="roas" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
