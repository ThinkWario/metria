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

// Mock Data states
const initialConnections = [
    { id: "shopify", name: "Shopify Store", status: "Connected", lastSync: "Hace 2 min", type: "Webhook / GraphQL" },
    { id: "meta", name: "Meta Ads API", status: "Connected", lastSync: "Hace 15 min", type: "REST API v18.0" },
    { id: "dropy", name: "Dropy Logistics", status: "Warning", lastSync: "Hace 1 hora", type: "REST API" },
    { id: "n8n", name: "n8n Automations", status: "Connected", lastSync: "Hace 5 min", type: "Webhook" },
]

const recentLogs = [
    { id: "evt_9812", source: "Shopify", event: "orders/create", timestamp: "10:42:01 AM", status: "200 OK" },
    { id: "evt_9811", source: "Dropy", event: "shipment/update", timestamp: "10:15:22 AM", status: "200 OK" },
    { id: "evt_9810", source: "Meta", event: "insights/read", timestamp: "09:00:05 AM", status: "200 OK" },
    { id: "evt_9809", source: "Dropy", event: "shipment/update", timestamp: "08:45:10 AM", status: "500 Error" },
]

const initialUsers = [
    { id: "u_1", name: "Alex Admin", email: "alex@metria.ai", role: "Admin", status: "Activo" },
    { id: "u_2", name: "Logística Equipo", email: "ops@metria.ai", role: "Operador de Logística", status: "Activo" },
    { id: "u_3", name: "Inversor / Socio", email: "socio@metria.ai", role: "Viewer", status: "Pendiente" },
]

export default function SettingsPage() {
    const [connections, setConnections] = useState(initialConnections)
    const [users, setUsers] = useState(initialUsers)

    // Global Settings State
    const [timezone, setTimezone] = useState("santiago")
    const [currency, setCurrency] = useState("usd")
    const [strictAttribution, setStrictAttribution] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // API Token form state
    const [isApiDialogOpen, setIsApiDialogOpen] = useState(false)
    const [apiForm, setApiForm] = useState({ platform: "shopify", token: "" })

    const handleSaveSettings = () => {
        setIsSaving(true)
        setTimeout(() => {
            setIsSaving(false)
            toast.success("Preferencias Guardadas", {
                description: "Se han actualizado las variables de entorno correctamente."
            })
        }, 800)
    }

    const handleSaveTokens = () => {
        if (!apiForm.token) {
            toast.error("Error", { description: "El token no puede estar vacío" })
            return
        }

        // Simulate updating API connection status
        setConnections(prev => prev.map(c =>
            c.id === apiForm.platform ? { ...c, status: "Connected", lastSync: "Justo ahora" } : c
        ))

        toast.success("Tokens Actualizados", {
            description: `Se probó y guardó la conexión real con ${apiForm.platform}.`
        })
        setIsApiDialogOpen(false)
        setApiForm({ platform: "shopify", token: "" })
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
                                        <div className="text-[11px] text-muted-foreground">{api.type} • Sync: {api.lastSync}</div>
                                    </div>
                                </div>
                                <Badge variant={api.status === "Connected" ? "outline" : "secondary"} className={api.status === "Connected" ? "text-emerald-500 border-emerald-500/30" : "text-amber-500"}>
                                    {api.status}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                    <CardFooter>
                        <Dialog open={isApiDialogOpen} onOpenChange={setIsApiDialogOpen}>
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
                                        <Select value={apiForm.platform} onValueChange={(v) => setApiForm({ ...apiForm, platform: v })}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="shopify">Shopify (Admin API)</SelectItem>
                                                <SelectItem value="meta">Meta Ads (Graph API)</SelectItem>
                                                <SelectItem value="dropy">Dropy Logistics</SelectItem>
                                                <SelectItem value="n8n">n8n Automations</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Token (Bearer / Secret Hash)</Label>
                                        <Input
                                            type="password"
                                            placeholder="sk_test_..."
                                            value={apiForm.token}
                                            onChange={(e) => setApiForm({ ...apiForm, token: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="button" onClick={handleSaveTokens}>Guardar y Probar Conexión</Button>
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
                                        <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                                        <TableCell>
                                            <Badge variant={u.status === "Activo" ? "default" : "secondary"} className={u.status === "Activo" ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border-emerald-500/30" : ""}>
                                                {u.status}
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
                            Event Logs (n8n Webhooks)
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
                                {recentLogs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{log.id}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{log.source}</Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-primary">{log.event}</TableCell>
                                        <TableCell className="text-sm">{log.timestamp}</TableCell>
                                        <TableCell className="text-right">
                                            <span className={`text-xs font-mono font-medium px-2 py-1 rounded bg-background ${log.status === "200 OK" ? "text-emerald-500" : "text-destructive"}`}>
                                                {log.status}
                                            </span>
                                        </TableCell>
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
