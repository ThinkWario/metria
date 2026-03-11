"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Activity, Unplug, ShieldCheck, Database, Key, Trash2, UserPlus, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useEffect } from "react"
import { getGlobalSettings, updateGlobalSettings, getIntegrations, updateIntegration, getSystemLogs, fetchAPI } from "@/lib/api"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"
import { useUserStore } from "@/store/useUserStore"

// Table structure for system event logs

const initialUsers = [
    { id: "u_1", name: "Alex Admin", email: "alex@metria.ai", role: "Admin", status: "Activo" },
    { id: "u_2", name: "Logística Equipo", email: "ops@metria.ai", role: "Operador de Logística", status: "Activo" },
    { id: "u_3", name: "Inversor / Socio", email: "socio@metria.ai", role: "Viewer", status: "Pendiente" },
]

export default function SettingsPage() {
    const { user } = useUserStore()
    const [connections, setConnections] = useState<Record<string, any>[]>([])
    const [users, setUsers] = useState(initialUsers)
    const [recentLogs, setRecentLogs] = useState<any[]>([])
    const [isLoadingLogs, setIsLoadingLogs] = useState(true)

    // Global Settings State
    const [timezone, setTimezone] = useState("santiago")
    const [currency, setCurrency] = useState("usd")
    const [strictAttribution, setStrictAttribution] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // API Token form state
    const [isApiDialogOpen, setIsApiDialogOpen] = useState(false)
    const [apiForm, setApiForm] = useState({ platform: "shopify", config: {} as Record<string, string> })

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const globalData = await getGlobalSettings()
                if (globalData) {
                    setTimezone(globalData.timezone)
                    setCurrency(globalData.currency)
                    setStrictAttribution(globalData.strictAttribution)
                }

                const integrationsData = await getIntegrations()

                // Always ensure all 4 platforms are displayed, merge with DB data
                const basePlatforms = [
                    { id: "shopify", platform: "shopify", name: "Shopify Store", status: "Disconnected", type: "Webhook", lastSync: null },
                    { id: "meta", platform: "meta", name: "Meta Ads API", status: "Disconnected", type: "REST API", lastSync: null },
                    { id: "dropi", platform: "dropi", name: "Dropi Logistics", status: "Disconnected", type: "REST API", lastSync: null },
                    { id: "google", platform: "google", name: "Google Ads API", status: "Disconnected", type: "REST API", lastSync: null },
                ]

                if (integrationsData && Array.isArray(integrationsData)) {
                    const merged = basePlatforms.map(bp => {
                        const dbMatch = integrationsData.find((db: any) => db.platform === bp.platform)
                        return dbMatch ? { ...bp, ...dbMatch } : bp
                    })
                    setConnections(merged)
                } else {
                    setConnections(basePlatforms)
                }
            } catch (err) {
                console.error("Failed to load settings from DB", err)
            }
        }

        const loadLogs = async () => {
            try {
                const logsData = await getSystemLogs()
                setRecentLogs(logsData)
            } catch (err) {
                console.error("Failed to load audit logs", err)
            } finally {
                setIsLoadingLogs(false)
            }
        }

        loadSettings()
        loadLogs()
    }, [])

    const handleSaveSettings = async () => {
        setIsSaving(true)
        try {
            await updateGlobalSettings({ timezone, currency, strictAttribution })
            toast.success("Preferencias Guardadas", {
                description: "Se han actualizado las configuraciones del Workspace correctamente."
            })
        } catch (_err) {
            toast.error("Error al guardar configuraciones globales")
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveTokens = async () => {
        setIsSaving(true)
        try {
            const platformNames: Record<string, string> = {
                shopify: "Shopify Store",
                meta: "Meta Ads",
                dropi: "Dropi Logistics",
                google: "Google Ads"
            }

            const updated = await updateIntegration({
                platform: apiForm.platform,
                name: platformNames[apiForm.platform] || apiForm.platform,
                type: "REST API",
                config: apiForm.config
            })

            // Update UI state directly
            setConnections(prev => prev.map(c =>
                c.platform === apiForm.platform ? { ...c, ...updated, status: updated.status || "Connected" } : c
            ))

            // Trigger global event so useWorkspaceConfig can refetch 
            window.dispatchEvent(new Event('integrations-updated'))

            toast.success("Tokens Guardados", {
                description: `Conexión con ${platformNames[apiForm.platform]} establecida. Descargando historial de datos...`
            })

            setIsApiDialogOpen(false)

            // Background Auto-sync
            const currentPlatform = apiForm.platform;
            setApiForm({ platform: "shopify", config: {} })

            if (currentPlatform === 'meta') {
                fetchAPI('/meta/sync', { method: 'POST' })
                    .then(() => toast.success("Sincronización Meta Completada", { description: "Tus campañas y métricas históricas ya están disponibles en el dashboard." }))
                    .catch(() => toast.warning("Sincronización Meta Retrasada", { description: "Los permisos de token podrían demorar en activarse." }))
            } else if (currentPlatform === 'shopify') {
                fetchAPI('/shopify/sync', { method: 'POST' })
                    .then(() => toast.success("Sincronización Shopify Completada", { description: "Tus órdenes y métricas de rentabilidad ya están calculadas." }))
                    .catch(() => toast.warning("Sincronización Shopify Lenta", { description: "El catálogo es muy grande, revisa en unos minutos." }))
            }

        } catch (err: any) {
            toast.error("Error", { description: err.message || "Ocurrió un error guardando las claves de integración" })
        } finally {
            setIsSaving(false)
        }
    }

    const handleRemoveUser = (id: string) => {
        setUsers(users.filter(u => u.id !== id))
        toast.info("Usuario Removido")
    }

    const [newUserOpen, setNewUserOpen] = useState(false)
    const [newUserForm, setNewUserForm] = useState({ name: "", email: "", role: "Viewer" })

    const handleAddUser = () => {
        if (!newUserForm.name || !newUserForm.email) {
            toast.error("Datos incompletos")
            return
        }
        setUsers([...users, {
            id: "u_" + Math.random(),
            name: newUserForm.name,
            email: newUserForm.email,
            role: newUserForm.role,
            status: "Pendiente"
        }])
        setNewUserOpen(false)
        setNewUserForm({ name: "", email: "", role: "Viewer" })
        toast.success("Invitación Enviada", { description: "Se ha despachado el correo de acceso." })
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Configuración Técnica</h1>
                <p className="text-muted-foreground">Gestión de conexiones API, logs de sistema y preferencias globales.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* API Hub */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Unplug className="h-5 w-5 text-primary" />
                            API Hub (Conexiones)
                        </CardTitle>
                        <CardDescription>Estado de integración con plataformas de terceros.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                        {connections.map((api) => (
                            <div key={api.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${api.status === 'Connected' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                        {api.status === 'Connected' ? <CheckCircle2 className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">{api.name}</div>
                                        <div className="text-[11px] text-muted-foreground">{api.type} • Sync: {api.lastSync ? new Date(api.lastSync).toLocaleString() : 'Nunca'}</div>
                                    </div>
                                </div>
                                <Badge className={getStatusColorClass(api.status)}>
                                    {mapStatus(api.status)}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                    <CardFooter>
                        <Dialog open={isApiDialogOpen} onOpenChange={(open) => {
                            setIsApiDialogOpen(open)
                            if (open) {
                                setApiForm({
                                    platform: "shopify",
                                    config: connections.find(c => c.platform === "shopify")?.config || {}
                                })
                            }
                        }}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full">
                                    <Key className="mr-2 h-4 w-4" />
                                    Actualizar Tokens de Acceso
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                    <DialogTitle>Editar Conexiones API</DialogTitle>
                                    <DialogDescription>
                                        Ingresa tus credenciales para enlazar Metria Metrics de forma segura.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Plataforma Origen</Label>
                                        <Select value={apiForm.platform} onValueChange={(v) => {
                                            setApiForm({
                                                platform: v,
                                                config: connections.find(c => c.platform === v)?.config || {}
                                            })
                                        }}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="shopify">Shopify (Admin API / Webhooks)</SelectItem>
                                                <SelectItem value="meta">Meta Ads (Graph API)</SelectItem>
                                                <SelectItem value="google">Google Ads API</SelectItem>
                                                <SelectItem value="dropi">Dropi Logistics</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {apiForm.platform === 'shopify' && (
                                        <>
                                            <div className="space-y-2">
                                                <Label>Shopify Domain</Label>
                                                <Input placeholder="tienda.myshopify.com" value={apiForm.config.domain || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, domain: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Admin API Access Token (shpat_...)</Label>
                                                <Input type="password" placeholder="shpat_..." value={apiForm.config.accessToken || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, accessToken: e.target.value } })} />
                                            </div>
                                        </>
                                    )}

                                    {apiForm.platform === 'meta' && (
                                        <>
                                            <div className="space-y-2">
                                                <Label>Ad Account ID (act_...)</Label>
                                                <Input placeholder="act_123456789" value={apiForm.config.adAccountId || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, adAccountId: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>System User Access Token</Label>
                                                <Input type="password" placeholder="EAAB..." value={apiForm.config.accessToken || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, accessToken: e.target.value } })} />
                                            </div>
                                        </>
                                    )}

                                    {apiForm.platform === 'google' && (
                                        <>
                                            <div className="space-y-2">
                                                <Label>Customer ID (123-456-7890)</Label>
                                                <Input placeholder="123-456-7890" value={apiForm.config.customerId || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, customerId: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Developer Token</Label>
                                                <Input type="password" placeholder="..." value={apiForm.config.developerToken || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, developerToken: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>OAuth Client ID</Label>
                                                <Input type="text" placeholder="Tu Client ID de Google Cloud..." value={apiForm.config.clientId || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, clientId: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>OAuth Client Secret</Label>
                                                <Input type="password" placeholder="Tu Client Secret..." value={apiForm.config.clientSecret || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, clientSecret: e.target.value } })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Refresh Token</Label>
                                                <Input type="password" placeholder="1//0g..." value={apiForm.config.refreshToken || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, refreshToken: e.target.value } })} />
                                            </div>
                                        </>
                                    )}

                                    {apiForm.platform === 'dropi' && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>API Key Dropi</Label>
                                                <Input type="password" placeholder="Key Dropi..." value={apiForm.config.apiKey || ''} onChange={(e) => setApiForm({ ...apiForm, config: { ...apiForm.config, apiKey: e.target.value } })} />
                                            </div>

                                            <div className="pt-2 border-t border-border/50">
                                                <Label className="text-primary font-medium">Webhook URL de Sincronización</Label>
                                                <p className="text-xs text-muted-foreground mt-1 mb-2">
                                                    Copia este enlace y configúralo en el panel de Dropi para recibir estados de paquetería automáticamente.
                                                </p>
                                                <div className="flex gap-2">
                                                    <code className="flex-1 p-2 rounded bg-muted text-[10px] break-all border border-border/50 select-all">
                                                        https://tu-dominio.com/api/dropi/webhooks/status?workspaceId={user?.workspaceId || ''}
                                                    </code>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-2">
                                                    (Reemplaza &quot;tu-dominio.com&quot; por el dominio real de tu API en producción)
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button type="button" onClick={handleSaveTokens} disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar y Probar Conexión"}</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardFooter>
                </Card>

                <div className="space-y-6 flex flex-col">
                    {/* Global Settings */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                                Preferencias de Entorno
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="timezone">Zona Horaria Oficial</Label>
                                <Select value={timezone} onValueChange={setTimezone}>
                                    <SelectTrigger id="timezone">
                                        <SelectValue placeholder="Seleccione zona horaria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="santiago">America/Santiago (GMT-3)</SelectItem>
                                        <SelectItem value="bogota">America/Bogota (GMT-5)</SelectItem>
                                        <SelectItem value="mexico">America/Mexico_City (GMT-6)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">Dicta el corte de día para cálculos de Profit y Meta Ads.</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="currency">Moneda Base</Label>
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger id="currency">
                                        <SelectValue placeholder="Seleccione moneda base" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="usd">USD ($)</SelectItem>
                                        <SelectItem value="clp">CLP ($)</SelectItem>
                                        <SelectItem value="cop">COP ($)</SelectItem>
                                        <SelectItem value="eur">EUR (€)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <div className="space-y-0.5">
                                    <Label>Modo Estricto de Atribución</Label>
                                    <p className="text-xs text-muted-foreground">Ignorar ventas sin UTM (Solo CBM directo).</p>
                                </div>
                                <Switch checked={strictAttribution} onCheckedChange={setStrictAttribution} />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" onClick={handleSaveSettings} disabled={isSaving}>
                                {isSaving ? "Guardando..." : "Guardar Entorno"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Users Management */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-muted-foreground" />
                                Usuarios y Permisos
                            </CardTitle>
                            <CardDescription>Invita y gestiona el acceso de tu equipo al dashboard.</CardDescription>
                        </div>
                        <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
                            <DialogTrigger asChild>
                                <Button variant="secondary" size="sm">Invitar Usuario</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Invitar al equipo</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Nombre</Label>
                                        <Input placeholder="Ej. Ana Operaciones" value={newUserForm.name} onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input type="email" placeholder="ana@metria.ai" value={newUserForm.email} onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rol</Label>
                                        <Select value={newUserForm.role} onValueChange={(v) => setNewUserForm({ ...newUserForm, role: v })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Admin">Admin (Completo)</SelectItem>
                                                <SelectItem value="Operador de Logística">Operador Logístico</SelectItem>
                                                <SelectItem value="Viewer">Viewer (Solo lectura)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleAddUser}>Enviar Invitación</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="w-[80px] text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                        <TableCell><Badge variant="outline">{mapStatus(u.role)}</Badge></TableCell>
                                        <TableCell>
                                            <Badge className={getStatusColorClass(u.status)}>
                                                {mapStatus(u.status)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleRemoveUser(u.id)} disabled={u.role === "Admin" && users.length === 1}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Webhook Logs */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-chart-2" />
                            System Event Logs
                        </CardTitle>
                        <CardDescription>Últimos eventos recibidos en tiempo real.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Event ID</TableHead>
                                    <TableHead>Origen</TableHead>
                                    <TableHead>Topic (Evento)</TableHead>
                                    <TableHead>Timestamp</TableHead>
                                    <TableHead className="text-right">Status HTTP</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingLogs ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse">Cargando logs...</TableCell>
                                    </TableRow>
                                ) : (
                                    [
                                        { name: "Shopify", source: "Shopify" },
                                        { name: "Meta Ads", source: "Meta" },
                                        { name: "Dropi", source: "Dropi" },
                                        { name: "Google Ads", source: "Google" },
                                    ].map((slot) => {
                                        const log = recentLogs.find(l => l.source === slot.source)
                                        return (
                                            <TableRow key={slot.name}>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {log ? `${log.id.substring(0, 8)}...` : "-"}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{slot.name}</Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-primary">
                                                    {log ? log.event : "-"}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {log ? new Date(log.createdAt).toLocaleString() : "-"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {log ? (
                                                        <span className={`text-xs font-mono font-medium px-2 py-1 rounded bg-background ${log.status.includes('200') || log.status.includes('OK') ? "text-emerald-500" : "text-destructive"}`}>
                                                            {log.status}
                                                        </span>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-muted text-muted-foreground font-medium">Inactivo</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
