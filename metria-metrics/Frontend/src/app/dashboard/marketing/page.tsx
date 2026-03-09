"use client"

import { useEffect, useState } from "react"
import { fetchAPI } from "@/lib/api"
import { useWorkspaceConfig } from "@/hooks/useWorkspaceConfig"
import { UnconfiguredState } from "@/components/ui/unconfigured-state"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import { Megaphone, Link2, MonitorPlay, RefreshCw } from "lucide-react"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"

const creativeData = [
    { name: "Video UGC 1", roas: 4.2 },
    { name: "Carrusel Estático", roas: 2.1 },
    { name: "Video Unboxing", roas: 3.8 },
    { name: "Imagen Beneficios", roas: 1.5 },
]

export default function MarketingPage() {
    const { integrations } = useWorkspaceConfig()
    const { date } = useDateRangeStore()
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [creatives, setCreatives] = useState<any[]>([])
    const [attribution, setAttribution] = useState({ attributed: 0, orphaned: 0, total: 0, lossRate: 0 })
    const [isLoading, setIsLoading] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)

    const loadData = async () => {
        try {
            setIsLoading(true)
            const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
            const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
            const rangeParams = fromStr && toStr ? `from=${fromStr}&to=${toStr}` : ''

            const [campsRes, crtsRes, attrRes] = await Promise.all([
                fetchAPI(`/meta/campaigns?${rangeParams}`),
                fetchAPI(`/meta/creatives?${rangeParams}`),
                fetchAPI(`/meta/attribution?${rangeParams}`)
            ])
            setCampaigns(Array.isArray(campsRes) ? campsRes : [])
            setCreatives(Array.isArray(crtsRes) ? crtsRes : [])
            if (attrRes && attrRes.attributed !== undefined) setAttribution(attrRes)
        } catch (error) {
            console.error("Failed to load marketing data", error)
            setCampaigns([])
            setCreatives([])
            setAttribution({ attributed: 0, orphaned: 0, total: 0, lossRate: 0 })
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [date])

    const handleSyncMeta = async () => {
        try {
            setIsSyncing(true)
            const result = await fetchAPI('/meta/sync', { method: 'POST' })
            if (result.error) {
                toast.error(`Error de Meta: ${result.error}`)
            } else {
                toast.success('Meta Ads sincronizado correctamente')
                await loadData() // Refetch campaigns
            }
        } catch (error: any) {
            console.error("Failed to sync meta", error)
            toast.error(error.message || 'Error al intentar sincronizar con Meta')
        } finally {
            setIsSyncing(false)
        }
    }

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground animate-pulse">Sincronizando con Meta Ads API...</div>
    }

    if (!integrations.meta) return <UnconfiguredState integration="Meta Ads" />

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        Marketing & Ads
                        <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-transparent">Meta API Live</Badge>
                    </h1>
                    <Button 
                        onClick={handleSyncMeta} 
                        disabled={isSyncing}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                        {isSyncing ? "Sincronizando..." : "Sincronizar Meta Ads"}
                    </Button>
                </div>
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
                                <TableHead className="text-right">Inversión</TableHead>
                                <TableHead className="text-right">CPA Meta</TableHead>
                                <TableHead className="text-right">ROAS</TableHead>
                                <TableHead className="text-right text-primary">CPA Shopify (CPP)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaigns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground h-24 border-dashed">
                                        No hay campañas sincronizadas. Conecta tu cuenta desde la sección Integraciones.
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
                                            <Badge className={getStatusColorClass(camp.status)}>
                                                {mapStatus(camp.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">${Number(camp.spend).toFixed(2)}</TableCell>
                                        <TableCell className="text-right text-muted-foreground">${Number(camp.cpa).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant={parseFloat(camp.roas) > 2 ? "default" : "destructive"}>{Number(camp.roas).toFixed(1)}x</Badge>
                                        </TableCell>
                                        {/* CPP = Cost Per Purchase Real sacado cruzando datos */}
                                        <TableCell className="text-right font-bold text-primary">${Number(camp.cpp || camp.cpa).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            )}
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
                    {attribution.total > 0 || attribution.attributed > 0 ? (
                        <>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50">
                                    <div>
                                        <div className="font-medium text-sm flex items-center gap-2">
                                            Órdenes Atribuidas (Directas UTM)
                                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">Muestra</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">Compras logradas por Meta Ads</div>
                                    </div>
                                    <div className="text-2xl font-bold text-primary">{attribution.attributed}</div>
                                </div>
                                <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 opacity-70">
                                    <div>
                                        <div className="font-medium text-sm flex items-center gap-2">
                                            Órdenes Huérfanas (Direct/None)
                                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">Muestra</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">Posibles compras afectadas por privacidad de iOS</div>
                                    </div>
                                    <div className="text-2xl font-bold">{attribution.orphaned}</div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <p className="text-xs text-muted-foreground bg-primary/10 text-primary px-3 py-2 rounded-md w-full">
                                    💡 La tasa de pérdida de atribución es del {attribution.lossRate}%. Utiliza el CPA Shopify (CPP) del dashboard superior para escalar con datos reales.
                                </p>
                            </CardFooter>
                        </>
                    ) : (
                        <CardContent className="h-[200px] flex items-center justify-center">
                            <div className="text-muted-foreground text-sm text-center px-6">
                                Aún no hay registros suficientes de órdenes o configuraciones de Meta para calcular el mapeo de atribución (CBM).
                            </div>
                        </CardContent>
                    )}
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
                        <div className="h-[250px] w-full min-h-[250px] flex items-center justify-center">
                            {creatives.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart layout="vertical" data={creatives} margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="currentColor" opacity={0.25} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "currentColor", opacity: 0.7 }} width={100} />
                                        <RechartsTooltip cursor={{ fill: "currentColor", opacity: 0.05 }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                                        <Bar dataKey="roas" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-muted-foreground text-sm text-center">
                                    No hay datos de creativos disponibles o falta el permiso `ads_read`. Analiza los permisos de Meta.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
