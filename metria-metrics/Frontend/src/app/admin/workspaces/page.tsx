"use client"

import { useEffect, useState } from "react"
import { getAdminWorkspaces, toggleWorkspaceStatus, getAdminUsers, resetUserPassword, impersonateWorkspace, createWorkspace } from "@/lib/api"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Building2, Power, PowerOff, KeyRound, UserCheck, ShieldAlert, Loader2, Plus, X, Search, Activity, DollarSign, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react"
import { mapStatus, getStatusColorClass } from "@/lib/status-mapper"
import { Badge } from "@/components/ui/badge"

export default function AdminWorkspacesPage() {
    const [workspaces, setWorkspaces] = useState<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL')
    const [searchTerm, setSearchTerm] = useState("")

    // Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [newWorkspaceName, setNewWorkspaceName] = useState("")
    const [newAdminEmail, setNewAdminEmail] = useState("")
    const [isCreating, setIsCreating] = useState(false)

    const loadData = async () => {
        try {
            const [wsData, usersData] = await Promise.all([
                getAdminWorkspaces(),
                getAdminUsers()
            ])
            setWorkspaces(wsData)
            setUsers(usersData)
        } catch (error) {
            toast.error("Error cargando workspaces")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    const filteredWorkspaces = workspaces.filter(ws => {
        const matchesTab = activeTab === 'ALL' || ws.status === activeTab
        const matchesSearch = ws.name.toLowerCase().includes(searchTerm.toLowerCase())
        return matchesTab && matchesSearch
    })

    const handleToggleStatus = async (id: string, currentStatus: string) => {
        try {
            await toggleWorkspaceStatus(id)
            toast.success(`Workspace ${currentStatus === 'ACTIVE' ? 'Suspendido' : 'Activado'} correctamente`)
            loadData()
        } catch (error) {
            toast.error("Error al cambiar estado")
        }
    }

    const handleResetPassword = async (userId: string, userEmail: string) => {
        toast("Seguridad", {
            description: `¿Confirmas resetear la contraseña de ${userEmail}?`,
            action: {
                label: "Confirmar",
                onClick: async () => {
                    try {
                        const res = await resetUserPassword(userId)
                        toast.success(`Clave temporal: ${res.temporaryPassword}`, {
                            description: "El usuario deberá cambiarla al autenticarse.",
                            duration: 15000
                        })
                        setUsers(users.map(u => u.id === userId ? { ...u, mustChangePassword: true } : u))
                    } catch (error) {
                        toast.error("Error reseteando clave")
                    }
                }
            }
        })
    }

    const handleImpersonate = async (targetWorkspaceId: string, workspaceName: string) => {
        toast("Modo Impersonación", {
            description: `¿Deseas acceder al dashboard como ${workspaceName}?`,
            action: {
                label: "Acceder",
                onClick: async () => {
                    try {
                        const res = await impersonateWorkspace(targetWorkspaceId)
                        localStorage.setItem('metria_token', res.token)
                        toast.success(`Accediendo al Workspace: ${res.workspaceName}`)
                        setTimeout(() => {
                            window.location.href = '/dashboard'
                        }, 800)
                    } catch (error) {
                        toast.error("Error en Impersonación")
                    }
                }
            }
        })
    }

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newWorkspaceName || !newAdminEmail) return

        setIsCreating(true)
        try {
            const res = await createWorkspace(newWorkspaceName, newAdminEmail)
            toast.success("Workspace Creado", {
                description: `Clave temporal Admin: ${res.tempPassword}`,
                duration: 15000,
            })
            setIsCreateModalOpen(false)
            setNewWorkspaceName("")
            setNewAdminEmail("")
            loadData()
        } catch (error) {
            toast.error("Error al crear el Workspace (Email repetido o error servidor)")
        } finally {
            setIsCreating(false)
        }
    }

    const IntegrationIndicator = ({ platform, integrations }: { platform: string, integrations: any[] }) => {
        const integration = integrations?.find(i => i.platform.toLowerCase() === platform.toLowerCase())
        const isLive = integration?.status === 'Active' || integration?.status === 'Connected'

        return (
            <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shadow-sm ${isLive
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : 'bg-muted/50 border-border text-muted-foreground opacity-60'
                    }`}
            >
                {isLive ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {mapStatus(platform)}
            </div>
        )
    }

    if (loading) return (
        <div className="flex flex-col h-[60vh] items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse text-sm font-medium">Sincronizando flota de Workspaces...</p>
        </div>
    )

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 relative pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                        <Activity className="w-10 h-10 text-primary" />
                        Command Center
                    </h1>
                    <p className="text-muted-foreground mt-2 text-base max-w-xl">
                        Monitoriza el rendimiento, gestiona integraciones y escala operaciones de todos tus clientes desde un solo lugar.
                    </p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-primary/30 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Expandir Flota
                </button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-card/40 backdrop-blur-xl border border-border/50 p-3 rounded-2xl shadow-xl">
                <div className="flex p-1 bg-muted/50 rounded-xl w-full md:w-auto">
                    {[
                        { id: 'ALL', label: 'Todos' },
                        { id: 'ACTIVE', label: 'Activos' },
                        { id: 'SUSPENDED', label: 'Suspendidos' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre de empresa o ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-background/50 border border-border/50 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium"
                    />
                </div>
            </div>

            {/* Workspaces List / Grid */}
            <div className="grid grid-cols-1 gap-6">
                {filteredWorkspaces.map((ws) => (
                    <div
                        key={ws.id}
                        className={`group p-8 rounded-[2rem] border transition-all duration-300 ${ws.status === 'ACTIVE'
                            ? 'border-border/50 bg-card/60 hover:shadow-2xl hover:shadow-primary/5'
                            : 'border-destructive/20 bg-destructive/5 grayscale-[0.8] opacity-80'
                            } backdrop-blur-md relative overflow-hidden`}
                    >
                        {/* Background Accent */}
                        <div className={`absolute top-0 right-0 w-64 h-64 blur-[100px] opacity-10 rounded-full transition-all group-hover:opacity-20 ${ws.status === 'ACTIVE' ? 'bg-primary' : 'bg-destructive'}`} />

                        <div className="flex flex-col lg:flex-row justify-between items-start gap-8 relative z-10">
                            {/* Company Info & Integrations */}
                            <div className="flex-1 space-y-4">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-2xl font-black text-foreground">{ws.name}</h3>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest border uppercase ${ws.status === 'ACTIVE'
                                            ? 'bg-primary/10 text-primary border-primary/30'
                                            : 'bg-destructive/10 text-destructive border-destructive/20'
                                            }`}>
                                            {mapStatus(ws.status)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1 font-mono tracking-tighter opacity-70">ID: {ws.id}</p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <IntegrationIndicator platform="Shopify" integrations={ws.integrations} />
                                    <IntegrationIndicator platform="Meta" integrations={ws.integrations} />
                                    <IntegrationIndicator platform="Dropi" integrations={ws.integrations} />
                                    <IntegrationIndicator platform="Google" integrations={ws.integrations} />
                                    <IntegrationIndicator platform="TikTok" integrations={ws.integrations} />
                                </div>

                                <div className="flex items-center gap-6 pt-2">
                                    <div className="flex items-center gap-2 group/stat">
                                        <div className="p-2 rounded-lg bg-muted group-hover/stat:bg-primary/10 transition-colors">
                                            <UserCheck className="w-4 h-4 text-muted-foreground group-hover/stat:text-primary" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold">{ws._count?.users || 0}</div>
                                            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Usuarios</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 group/stat">
                                        <div className="p-2 rounded-lg bg-muted group-hover/stat:bg-secondary/10 transition-colors">
                                            <Building2 className="w-4 h-4 text-muted-foreground group-hover/stat:text-secondary" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold">{ws._count?.orders || 0}</div>
                                            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Órdenes</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Metrics Section - Performance (7d) */}
                            <div className="grid grid-cols-2 gap-4 w-full lg:w-auto min-w-[320px]">
                                <div className="bg-background/40 border border-border/50 p-5 rounded-2xl shadow-sm backdrop-blur-sm group-hover:border-primary/20 transition-all">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                        <TrendingUp className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Revenue (7d)</span>
                                    </div>
                                    <div className="text-xl font-black text-foreground">
                                        ${Number(ws.metrics7d?.revenue || 0).toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-background/40 border border-border/50 p-5 rounded-2xl shadow-sm backdrop-blur-sm group-hover:border-emerald-500/20 transition-all">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                        <DollarSign className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Profit (7d)</span>
                                    </div>
                                    <div className={`text-xl font-black ${Number(ws.metrics7d?.profit) > 0 ? 'text-emerald-500' : 'text-foreground'}`}>
                                        ${Number(ws.metrics7d?.profit || 0).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-row lg:flex-col gap-3 w-full lg:w-auto">
                                <button
                                    onClick={() => handleToggleStatus(ws.id, ws.status)}
                                    className={`flex-1 lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${ws.status === 'ACTIVE'
                                        ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive text-white hover:border-transparent'
                                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500 text-white hover:border-transparent'
                                        }`}
                                >
                                    {ws.status === 'ACTIVE' ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                    {ws.status === 'ACTIVE' ? 'Suspender' : 'Activar'}
                                </button>

                                <button
                                    onClick={() => handleImpersonate(ws.id, ws.name)}
                                    className="flex-1 lg:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-foreground text-background hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
                                >
                                    <ShieldAlert className="w-4 h-4" />
                                    Impersonar
                                </button>
                            </div>
                        </div>

                        {/* Users Drawer-like section */}
                        <div className="mt-8 pt-8 border-t border-border/50">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground/80">Personal del Workspace</h4>
                                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-bold">Total: {users.filter(u => u.workspaceId === ws.id).length}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {users.filter(u => u.workspaceId === ws.id).map(user => (
                                    <div key={user.id} className="flex flex-col gap-3 p-4 rounded-2xl bg-background/30 border border-border/50 hover:bg-background/50 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-sm uppercase ring-2 ring-background ring-offset-2 ring-offset-border/20">
                                                {user.email.substring(0, 2)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold truncate">{user.email}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground">{mapStatus(user.role)}</span>
                                                    {user.mustChangePassword && <span className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Reset Reqd</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleResetPassword(user.id, user.email)}
                                            className="w-full px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-border/50 text-muted-foreground hover:bg-destructive hover:text-white hover:border-transparent transition-all flex items-center justify-center gap-2"
                                        >
                                            <KeyRound className="w-3.5 h-3.5" />
                                            Gestionar Clave
                                        </button>
                                    </div>
                                ))}
                                {users.filter(u => u.workspaceId === ws.id).length === 0 && (
                                    <p className="text-sm text-center py-4 text-muted-foreground italic col-span-full border border-dashed rounded-2xl opacity-50">
                                        Zona de cuarentena: Sin personal asignado.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredWorkspaces.length === 0 && !loading && (
                <div className="text-center py-32 border-2 border-dashed border-border/50 rounded-[3rem] text-muted-foreground bg-muted/20 animate-in fade-in zoom-in duration-500">
                    <Building2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-xl font-bold">No se encontraron unidades de negocio</p>
                    <p className="text-sm opacity-60">Ajusta los filtros o expande la flota añadiendo un nuevo workspace.</p>
                </div>
            )}

            {/* Create Workspace Modal Overlay */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-card w-full max-w-lg p-10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.2)] border border-border animate-in zoom-in-95 duration-500">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h2 className="text-3xl font-black text-foreground italic flex items-center gap-3">
                                    <Plus className="w-8 h-8 text-primary" />
                                    Nueva Unidad
                                </h2>
                                <p className="text-muted-foreground text-sm font-medium mt-1">Configura el acceso y branding inicial del cliente.</p>
                            </div>
                            <button onClick={() => setIsCreateModalOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateWorkspace} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Nombre Corporativo</label>
                                <input
                                    required
                                    type="text"
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    className="w-full bg-muted/50 border border-border/50 rounded-2xl px-6 py-4 text-foreground focus:outline-none focus:ring-4 focus:ring-primary/20 transition-all font-bold placeholder:text-muted-foreground/30"
                                    placeholder="Metria Corp S.A."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Email Maestro</label>
                                <input
                                    required
                                    type="email"
                                    value={newAdminEmail}
                                    onChange={(e) => setNewAdminEmail(e.target.value)}
                                    className="w-full bg-muted/50 border border-border/50 rounded-2xl px-6 py-4 text-foreground focus:outline-none focus:ring-4 focus:ring-primary/20 transition-all font-bold placeholder:text-muted-foreground/30"
                                    placeholder="admin@metriacorp.com"
                                />
                                <div className="flex items-start gap-2 p-4 bg-primary/5 rounded-2xl border border-primary/10 mt-2">
                                    <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-primary/80 leading-relaxed font-bold">
                                        PROTOCOL: SE GENERARÁ UNA CLAVE TEMPORAL MAESTRA. EL USUARIO DEBERÁ ACTUALIZARLA EN SU PRIMER DESPLIEGUE.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-8 flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 px-8 py-4 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground hover:bg-muted rounded-2xl transition-all"
                                >
                                    Abortar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="flex-[2] px-8 py-4 bg-foreground text-background text-xs font-black uppercase tracking-[0.2em] rounded-2xl hover:opacity-90 flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl shadow-foreground/20"
                                >
                                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                    Finalizar Misión
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
