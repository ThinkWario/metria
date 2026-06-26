"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Activity, Unplug, ShieldCheck, Trash2, UserPlus, Palette } from "lucide-react"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getGlobalSettings, updateGlobalSettings, getIntegrations, updateIntegration, getSystemLogs, fetchAPI, getBranding, updateBranding } from "@/lib/api"
import { activatePayPalSubscription } from "@/app/onboarding/actions"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"
import { useUserStore } from "@/store/useUserStore"
import { BillingSection } from "@/components/settings/billing-section"
import { IntegrationHub } from "@/components/settings/integration-hub"
import { GoogleCalendarCard } from "./components/GoogleCalendarCard"

// Table structure for system event logs

const initialUsers = [
    { id: "u_1", name: "Alex Admin", email: "alex@metria.ai", role: "Admin", status: "Activo" },
    { id: "u_2", name: "Logística Equipo", email: "ops@metria.ai", role: "Operador de Logística", status: "Activo" },
    { id: "u_3", name: "Inversor / Socio", email: "socio@metria.ai", role: "Viewer", status: "Pendiente" },
]

import { Suspense } from "react"

function SettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { user } = useUserStore()
    const queryClient = useQueryClient()
    const [users, setUsers] = useState(initialUsers)
    const canEdit = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
    const [authToken, setAuthToken] = useState('')
    useEffect(() => { setAuthToken(localStorage.getItem('metria_token') || '') }, [])

    // Form state (local for edits, synced with query data)
    const [timezone, setTimezone] = useState("santiago")
    const [currency, setCurrency] = useState("usd")
    const [strictAttribution, setStrictAttribution] = useState(false)

    // Branding form state
    const [brandName, setBrandName] = useState("")
    const [primaryColor, setPrimaryColor] = useState("#7c3aed")
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const localBrandNameRef = useRef("")

    // API Token form state
    const [isApiDialogOpen, setIsApiDialogOpen] = useState(false)
    const [apiForm, setApiForm] = useState({ platform: "shopify", config: {} as Record<string, string> })

    // Queries
    const { data: globalSettings } = useQuery({
        queryKey: ['settings', 'global'],
        queryFn: getGlobalSettings
    })

    const { data: integrationsData = [] } = useQuery({
        queryKey: ['settings', 'integrations'],
        queryFn: getIntegrations
    })

    const { data: recentLogs = [], isLoading: isLoadingLogs } = useQuery({
        queryKey: ['settings', 'logs'],
        queryFn: getSystemLogs
    })

    const { data: brandingData } = useQuery({
        queryKey: ['settings', 'branding'],
        queryFn: getBranding
    })

    // Sync form state when data is available
    useEffect(() => {
        if (globalSettings) {
            setTimezone(globalSettings.timezone || "santiago")
            setCurrency(globalSettings.currency || "usd")
            setStrictAttribution(globalSettings.strictAttribution || false)
        }
    }, [globalSettings])

    useEffect(() => {
        if (brandingData) {
            const name = brandingData.brandName ?? ""
            setBrandName(name)
            localBrandNameRef.current = name
            setPrimaryColor(brandingData.primaryColor ?? "#7c3aed")
        }
    }, [brandingData])

    // Handle OAuth Callback Messages
    useEffect(() => {
        const success = searchParams.get('success')
        const error = searchParams.get('error')
        const platform = searchParams.get('platform')

        if (success === 'true') {
            toast.success(`¡Conexión Exitosa!`, {
                description: `Se ha enlazado correctamente con ${platform}.`
            })
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
        } else if (error) {
            toast.error("Fallo en la conexión", {
                description: decodeURIComponent(error)
            })
        }
    }, [searchParams, queryClient])

    useEffect(() => {
        if (user?.role === "OPERATOR") {
            router.push("/dashboard/logistics")
        }
    }, [user?.role, router])

    // Handle Payment Confirmation (Demo Mode + PayPal Return)
    useEffect(() => {
        const handlePaymentConfirmation = async () => {
            const status = searchParams.get('status')
            const demo = searchParams.get('demo')
            const plan = searchParams.get('plan')
            const paypalReturn = searchParams.get('paypal_return')
            const subscriptionId = searchParams.get('subscription_id')

            // PayPal return — activate subscription
            if (paypalReturn === 'true' && subscriptionId && plan) {
                toast.loading("Activando tu suscripción PayPal...", { id: 'paypal-activation' })
                const result = await activatePayPalSubscription(subscriptionId, plan)
                toast.dismiss('paypal-activation')

                if (result.success) {
                    toast.success("¡Suscripción PayPal Activada!", {
                        description: `Tu espacio ha sido actualizado al plan ${plan}.`
                    })
                    window.location.href = '/dashboard/settings'
                } else {
                    toast.error("Error al activar suscripción", {
                        description: result.error || "Intenta de nuevo o contacta soporte."
                    })
                }
                return
            }

            // Demo mode
            if (status === 'success' && demo === 'true' && plan) {
                try {
                    await fetchAPI('/payments/confirm-demo-payment', {
                        method: 'POST',
                        body: JSON.stringify({ planType: plan })
                    })
                    toast.success("¡Suscripción Demo Activada!", {
                        description: `Tu espacio ha sido actualizado al plan ${plan}.`
                    })
                    window.location.href = '/dashboard/settings'
                } catch (error) {
                    console.error("Error confirming demo payment:", error)
                }
            } else if (status === 'success') {
                toast.success("¡Pago Procesado!", {
                    description: "Tu suscripción se está activando. Esto puede tardar unos segundos."
                })
            }
        }

        handlePaymentConfirmation()
    }, [searchParams])

    const basePlatforms = [
        { id: "shopify", platform: "shopify", name: "Shopify Store", status: "Disconnected", type: "Webhook", lastSync: null },
        { id: "meta", platform: "meta", name: "Meta Ads API", status: "Disconnected", type: "REST API", lastSync: null },
        { id: "dropi", platform: "dropi", name: "Dropi Logistics", status: "Disconnected", type: "REST API", lastSync: null },
        { id: "google", platform: "google", name: "Google Ads API", status: "Disconnected", type: "REST API", lastSync: null },
        { id: "tiktok", platform: "tiktok", name: "TikTok Ads API", status: "Disconnected", type: "REST API", lastSync: null },
    ]

    const connections = basePlatforms.map(bp => {
        const dbMatch = Array.isArray(integrationsData) ? integrationsData.find((db: any) => db.platform === bp.platform) : null
        return dbMatch ? { ...bp, ...dbMatch } : bp
    })

    // Mutations
    const saveSettingsMutation = useMutation({
        mutationFn: updateGlobalSettings,
        onSuccess: () => {
            toast.success("Preferencias Guardadas")
            queryClient.invalidateQueries({ queryKey: ['settings', 'global'] })
        },
        onError: () => toast.error("Error al guardar configuraciones globales")
    })

    const saveBrandingMutation = useMutation({
        mutationFn: updateBranding,
        onSuccess: () => {
            toast.success("Marca Guardada")
            queryClient.invalidateQueries({ queryKey: ['settings', 'branding'] })
        },
        onError: (err: any) => toast.error("Error al guardar marca", { description: err.message })
    })

    const saveTokensMutation = useMutation({
        mutationFn: (payload: any) => updateIntegration(payload),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
            window.dispatchEvent(new Event('integrations-updated'))

            const platformNames: Record<string, string> = {
                shopify: "Shopify Store",
                meta: "Meta Ads",
                dropi: "Dropi Logistics",
                google: "Google Ads",
                tiktok: "TikTok Ads"
            }

            toast.success("Tokens Guardados", {
                description: `Conexión con ${platformNames[variables.platform] || variables.platform} establecida.`
            })

            setIsApiDialogOpen(false)

            // Auto-sync trigger
            if (variables.platform === 'meta') fetchAPI('/meta/sync', { method: 'POST' })
            else if (variables.platform === 'shopify') fetchAPI('/shopify/sync', { method: 'POST' })
            else if (variables.platform === 'tiktok') fetchAPI('/tiktok/sync', { method: 'POST' })
            else if (variables.platform === 'google') fetchAPI('/google/sync', { method: 'POST' })
        },
        onError: (err: any) => toast.error("Error", { description: err.message || "Ocurrió un error guardando las claves de integración" })
    })

    const handleSaveSettings = () => {
        saveSettingsMutation.mutate({ timezone, currency, strictAttribution })
    }

    const handleSaveBranding = () => {
        saveBrandingMutation.mutate({ primaryColor, brandName })
    }

    // Debounced color change — inject CSS var immediately, then auto-save after 800ms
    const handleColorChange = useCallback((value: string) => {
        setPrimaryColor(value)
        document.documentElement.style.setProperty('--color-primary-brand', value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(async () => {
            try {
                await updateBranding({ primaryColor: value, brandName: localBrandNameRef.current })
                queryClient.invalidateQueries({ queryKey: ['settings', 'branding'] })
                toast.success('Color guardado')
            } catch {
                toast.error('Error guardando color')
            }
        }, 800)
    }, [queryClient])

    const handleSaveTokens = async () => {
        const platformNames: Record<string, string> = {
            shopify: "Shopify Store",
            meta: "Meta Ads",
            dropi: "Dropi Logistics",
            google: "Google Ads",
            tiktok: "TikTok Ads"
        }

        saveTokensMutation.mutate({
            platform: apiForm.platform,
            name: platformNames[apiForm.platform] || apiForm.platform,
            type: "REST API",
            config: apiForm.config
        })
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

    if (user?.role === "OPERATOR") return null

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Configuración Técnica</h1>
                <p className="text-muted-foreground">Gestión de conexiones API, logs de sistema y preferencias globales.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Omni-OAuth Integration Hub */}
                <div className="md:col-span-2">
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Unplug className="h-5 w-5 text-primary" />
                                Centro de Integraciones (Omni-OAuth)
                            </CardTitle>
                            <CardDescription>Conecta tus fuentes de datos con un solo clic de forma segura.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <IntegrationHub integrations={integrationsData} token={authToken} />
                            <GoogleCalendarCard />
                        </CardContent>
                    </Card>
                </div>

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
                            {canEdit && (
                                <Button className="w-full" onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending}>
                                    {saveSettingsMutation.isPending ? "Guardando..." : "Guardar Entorno"}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    {/* Subscription & Billing */}
                    <BillingSection />
                </div>

                {/* Branding Card */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Palette className="h-5 w-5 text-muted-foreground" />
                            Marca (White-label)
                        </CardTitle>
                        <CardDescription>Personaliza el nombre y color de tu workspace.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {/* Brand Name */}
                        <div className="space-y-2">
                            <Label htmlFor="brandName">Nombre de marca</Label>
                            <Input
                                id="brandName"
                                placeholder={brandingData?.brandName ?? "Nombre del workspace"}
                                value={brandName}
                                onChange={(e) => {
                                    setBrandName(e.target.value)
                                    localBrandNameRef.current = e.target.value
                                }}
                                maxLength={60}
                                disabled={!canEdit}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Se muestra en el sidebar y notificaciones. Vacío = usa el nombre del workspace.
                            </p>
                        </div>

                        {/* Primary Color */}
                        <div className="space-y-2">
                            <Label htmlFor="primaryColor">Color primario</Label>
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-9 h-9 rounded-lg border border-border/60 shrink-0 shadow-inner"
                                    style={{ backgroundColor: primaryColor }}
                                />
                                <input
                                    type="color"
                                    id="primaryColorPicker"
                                    value={primaryColor}
                                    onChange={(e) => handleColorChange(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                                    title="Seleccionar color"
                                />
                                <Input
                                    id="primaryColor"
                                    value={primaryColor}
                                    onChange={(e) => {
                                        const val = e.target.value
                                        if (/^#[0-9a-fA-F]{0,6}$/.test(val)) handleColorChange(val)
                                    }}
                                    maxLength={7}
                                    className="font-mono text-sm w-28"
                                    disabled={!canEdit}
                                    placeholder="#7c3aed"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Color de acentos en el dashboard.</p>
                        </div>
                    </CardContent>
                    <CardFooter>
                        {canEdit && (
                            <Button
                                className="w-full"
                                onClick={handleSaveBranding}
                                disabled={saveBrandingMutation.isPending}
                            >
                                {saveBrandingMutation.isPending ? "Guardando..." : "Guardar cambios"}
                            </Button>
                        )}
                    </CardFooter>
                </Card>

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
                        {canEdit && (
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
                        )}
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead>Estado</TableHead>
                                    {canEdit && <TableHead className="w-[80px] text-right">Acción</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u: any) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                        <TableCell><Badge variant="outline">{mapStatus(u.role)}</Badge></TableCell>
                                        <TableCell>
                                            <Badge className={getStatusColorClass(u.status)}>
                                                {mapStatus(u.status)}
                                            </Badge>
                                        </TableCell>
                                        {canEdit && (
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveUser(u.id)} disabled={u.role === "Admin" && users.length === 1}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        )}
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
                                ) : recentLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">Sin eventos recientes registrados.</TableCell>
                                    </TableRow>
                                ) : (
                                    recentLogs.map((log: any) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-mono text-[10px] text-muted-foreground">
                                                {log.id.substring(0, 8)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">{log.source}</Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-primary max-w-[200px] truncate">
                                                {log.event}
                                            </TableCell>
                                            <TableCell className="text-[11px] text-muted-foreground">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${
                                                    log.status.startsWith('2') || log.status.toLowerCase().includes('ok')
                                                    ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                                                    : "text-destructive border-destructive/20 bg-destructive/5"
                                                }`}>
                                                    {log.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default function SettingsPageClient() {
    return (
        <Suspense fallback={<div className='p-8'>Cargando configuración...</div>}>
            <SettingsContent />
        </Suspense>
    )
}
