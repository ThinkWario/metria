"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
    BarChart3,
    Wallet,
    ShoppingBag,
    Megaphone,
    Package,
    Settings,
    ChevronUp,
    ChevronRight,
    User2,
    LogOut,
    MousePointerClick,
    ShieldAlert,
    Smartphone,
    MessageSquare,
    Users,
    Bot,
    CalendarDays,
    Filter,
    KanbanSquare,
    Zap,
    FileText,
    Send,
    CreditCard,
    CheckSquare,
} from "lucide-react"
import { cn } from "../../lib/utils"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logout } from "@/app/login/actions"
import { stopImpersonating, getBranding } from "@/lib/api"
import { toast } from "sonner"
import { useUserStore } from "@/store/useUserStore"
import { ProfileDialog } from "@/components/user/profile-dialog"
import { PreferencesDialog } from "@/components/user/preferences-dialog"
import type { LucideIcon } from "lucide-react"

type MenuItem = {
    title: string
    icon: LucideIcon
    url: string
    roles?: string[]
}

// ── CRM subcategories ──────────────────────────────────────────────────────────
const CRM_SUB_ITEMS: MenuItem[] = [
    { title: "Contactos",      icon: Users,        url: "/dashboard/crm" },
    { title: "Pipelines",      icon: KanbanSquare, url: "/dashboard/crm/pipelines" },
    { title: "Cobros",         icon: CreditCard,   url: "/dashboard/crm/payments" },
    { title: "Segmentos",      icon: Filter,       url: "/dashboard/crm/segments" },
    { title: "Formularios",    icon: FileText,     url: "/dashboard/crm/forms" },
    { title: "Campañas",       icon: Send,         url: "/dashboard/crm/campaigns" },
    { title: "Automatizaciones", icon: Zap,        url: "/dashboard/crm/automations" },
    { title: "Citas",          icon: CalendarDays, url: "/dashboard/crm/appointments" },
    { title: "Tareas",         icon: CheckSquare,  url: "/dashboard/tasks" },
]

const CRM_ROLES = ["SUPER_ADMIN", "ADMIN"]

// ── Non-CRM top items ──────────────────────────────────────────────────────────
const TOP_ITEMS: MenuItem[] = [
    { title: "Centro de Control",      icon: BarChart3,      url: "/dashboard" },
    { title: "Inbox (Chats)",          icon: MessageSquare,  url: "/dashboard/inbox", roles: ["SUPER_ADMIN", "ADMIN"] },
]

// ── Marketing subcategories ──────────────────────────────────────────────────────
const MARKETING_SUB_ITEMS: MenuItem[] = [
    { title: "Meta Ads",          icon: Megaphone,          url: "/dashboard/marketing" },
    { title: "Google Ads (Beta)", icon: MousePointerClick,  url: "/dashboard/google-ads" },
    { title: "TikTok Ads",        icon: Smartphone,         url: "/dashboard/tiktok-ads" },
]

const MARKETING_ROLES = ["SUPER_ADMIN", "ADMIN", "VIEWER"]

// ── Non-CRM bottom items ───────────────────────────────────────────────────────
const BOTTOM_ITEMS: MenuItem[] = [
    { title: "Agente IA",              icon: Bot,            url: "/dashboard/settings/ai-agent",  roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "Canales de Mensajería",  icon: MessageSquare,  url: "/dashboard/settings/channels",  roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "Finanzas E-commerce",    icon: Wallet,         url: "/dashboard/finances",            roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Canales de Venta",       icon: ShoppingBag,    url: "/dashboard/sales",               roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Logística & Operaciones",icon: Package,        url: "/dashboard/logistics" },
    { title: "Configuración Técnica",  icon: Settings,       url: "/dashboard/settings",            roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
]

function filterByRole(items: MenuItem[], role: string | null) {
    return items.filter(item => {
        if (!item.roles) return true
        if (!role) return true
        return item.roles.includes(role)
    })
}

export function AppSidebar() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"
    const pathname = usePathname()
    const { fetchMe, getDisplayName, getInitials, user, isLoading: userLoading } = useUserStore()

    const [profileOpen, setProfileOpen] = useState(false)
    const [preferencesOpen, setPreferencesOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    // Branding
    const [brandName, setBrandName] = useState<string | null>(null)
    const [logoUrl, setLogoUrl] = useState<string | null>(null)
    const [primaryColor, setPrimaryColor] = useState<string | null>(null)

    // CRM collapsible — auto-open when on any CRM route
    const isCrmRoute = pathname.startsWith("/dashboard/crm") || pathname === "/dashboard/tasks"
    const [crmOpen, setCrmOpen] = useState(isCrmRoute)

    useEffect(() => {
        if (isCrmRoute) setCrmOpen(true)
    }, [isCrmRoute])

    // Marketing collapsible — auto-open when on any marketing/ads route
    const isMarketingRoute = MARKETING_SUB_ITEMS.some(item => pathname === item.url || pathname.startsWith(item.url + "/"))
    const [marketingOpen, setMarketingOpen] = useState(isMarketingRoute)

    useEffect(() => {
        if (isMarketingRoute) setMarketingOpen(true)
    }, [isMarketingRoute])

    useEffect(() => {
        setMounted(true)
        fetchMe()
    }, [fetchMe])

    useEffect(() => {
        if (!mounted || !user) return
        getBranding()
            .then((data) => {
                if (data.brandName) setBrandName(data.brandName)
                if (data.logoUrl) setLogoUrl(data.logoUrl)
                if (data.primaryColor) setPrimaryColor(data.primaryColor)
            })
            .catch(() => {})
    }, [mounted, user])

    useEffect(() => {
        if (mounted && !user) {
            document.documentElement.style.removeProperty("--color-primary-brand")
            setBrandName(null)
            setLogoUrl(null)
            setPrimaryColor(null)
        }
    }, [mounted, user])

    useEffect(() => {
        if (primaryColor) {
            document.documentElement.style.setProperty("--color-primary-brand", primaryColor)
        }
    }, [primaryColor])

    const userName = getDisplayName()
    const userEmail = user?.email || ""
    const userInitials = getInitials()
    const userRole = user?.role || null

    const showCrm = !userRole || CRM_ROLES.includes(userRole)
    const showMarketing = !userRole || MARKETING_ROLES.includes(userRole)
    const filteredTop = filterByRole(TOP_ITEMS, userRole)
    const filteredBottom = filterByRole(BOTTOM_ITEMS, userRole)

    const handleStopImpersonating = async () => {
        try {
            const res = await stopImpersonating()
            localStorage.setItem("metria_token", res.token)
            toast.success("Volviendo a Centro de Control...")
            setTimeout(() => { window.location.href = "/admin/workspaces" }, 800)
        } catch {
            toast.error("Error saliendo de impersonación")
        }
    }

    function isSubActive(item: MenuItem) {
        if (item.url === "/dashboard/crm") return pathname === "/dashboard/crm"
        return pathname === item.url || pathname.startsWith(item.url + "/")
    }

    return (
        <>
            <Sidebar collapsible="icon" className="border-r border-border/80 bg-background/50 backdrop-blur-xl will-change-[width,backdrop-filter]">
                <SidebarHeader>
                    <div className={cn(
                        "flex h-16 items-center font-bold text-xl tracking-tighter text-foreground transition-[padding,gap] duration-300 ease-in-out",
                        isCollapsed ? "justify-center px-0 gap-0" : "justify-between px-4 gap-2"
                    )}>
                        <div className="flex items-center min-w-0 overflow-hidden gap-2">
                            {isCollapsed ? (
                                logoUrl ? (
                                    <img
                                        src={logoUrl}
                                        alt="logo"
                                        className="w-8 h-8 rounded-lg object-contain shrink-0 animate-in fade-in zoom-in duration-300"
                                        onError={() => setLogoUrl(null)}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0 animate-in fade-in zoom-in duration-300">
                                        {brandName ? brandName.charAt(0).toUpperCase() : "M"}
                                    </div>
                                )
                            ) : (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300 min-w-0">
                                    {logoUrl && (
                                        <img
                                            src={logoUrl}
                                            alt="logo"
                                            className="w-7 h-7 rounded-md object-contain shrink-0"
                                            onError={() => setLogoUrl(null)}
                                        />
                                    )}
                                    <span className="truncate">
                                        {brandName ? (
                                            <span className="text-primary">{brandName}</span>
                                        ) : (
                                            <><span className="text-primary mr-1">Metria</span>Metrics</>
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>
                        {!isCollapsed && (
                            <div className="animate-in fade-in zoom-in duration-300">
                                <ModeToggle />
                            </div>
                        )}
                    </div>
                    {!isCollapsed && user?.isImpersonating && (
                        <div className="mx-4 mt-2 mb-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-2 justify-center shadow-inner">
                            <ShieldAlert className="w-4 h-4 animate-pulse" />
                            <span className="text-[10px] uppercase font-black tracking-widest">Impersonando</span>
                        </div>
                    )}
                </SidebarHeader>

                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground">Módulos</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {/* Top items */}
                                {filteredTop.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton asChild tooltip={item.title} className="hover:bg-primary/10 transition-colors">
                                            <Link href={item.url} className="flex items-center gap-3">
                                                <item.icon className="w-4 h-4 shrink-0" />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}

                                {/* CRM collapsible group */}
                                {showCrm && (
                                    <SidebarMenuItem>
                                        {isCollapsed ? (
                                            /* Collapsed: simple link to CRM root */
                                            <SidebarMenuButton asChild tooltip="CRM" className="hover:bg-primary/10 transition-colors">
                                                <Link href="/dashboard/crm" className="flex items-center gap-3">
                                                    <Users className="w-4 h-4 shrink-0" />
                                                    <span>CRM</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        ) : (
                                            <Collapsible open={crmOpen} onOpenChange={setCrmOpen}>
                                                <CollapsibleTrigger asChild>
                                                    <SidebarMenuButton
                                                        tooltip="CRM"
                                                        className={cn(
                                                            "hover:bg-primary/10 transition-colors w-full",
                                                            isCrmRoute && "bg-primary/5 text-primary font-medium"
                                                        )}
                                                    >
                                                        <Users className="w-4 h-4 shrink-0" />
                                                        <span>CRM</span>
                                                        <ChevronRight className={cn(
                                                            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                                            crmOpen && "rotate-90"
                                                        )} />
                                                    </SidebarMenuButton>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <SidebarMenuSub>
                                                        {CRM_SUB_ITEMS.map((item) => (
                                                            <SidebarMenuSubItem key={item.title}>
                                                                <SidebarMenuSubButton
                                                                    asChild
                                                                    isActive={isSubActive(item)}
                                                                >
                                                                    <Link href={item.url} className="flex items-center gap-2">
                                                                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                                                                        <span>{item.title}</span>
                                                                    </Link>
                                                                </SidebarMenuSubButton>
                                                            </SidebarMenuSubItem>
                                                        ))}
                                                    </SidebarMenuSub>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )}
                                    </SidebarMenuItem>
                                )}

                                {/* Marketing collapsible group */}
                                {showMarketing && (
                                    <SidebarMenuItem>
                                        {isCollapsed ? (
                                            /* Collapsed: simple link to Marketing root */
                                            <SidebarMenuButton asChild tooltip="Marketing" className="hover:bg-primary/10 transition-colors">
                                                <Link href="/dashboard/marketing" className="flex items-center gap-3">
                                                    <Megaphone className="w-4 h-4 shrink-0" />
                                                    <span>Marketing</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        ) : (
                                            <Collapsible open={marketingOpen} onOpenChange={setMarketingOpen}>
                                                <CollapsibleTrigger asChild>
                                                    <SidebarMenuButton
                                                        tooltip="Marketing"
                                                        className={cn(
                                                            "hover:bg-primary/10 transition-colors w-full",
                                                            isMarketingRoute && "bg-primary/5 text-primary font-medium"
                                                        )}
                                                    >
                                                        <Megaphone className="w-4 h-4 shrink-0" />
                                                        <span>Marketing</span>
                                                        <ChevronRight className={cn(
                                                            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                                            marketingOpen && "rotate-90"
                                                        )} />
                                                    </SidebarMenuButton>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <SidebarMenuSub>
                                                        {MARKETING_SUB_ITEMS.map((item) => (
                                                            <SidebarMenuSubItem key={item.title}>
                                                                <SidebarMenuSubButton
                                                                    asChild
                                                                    isActive={isSubActive(item)}
                                                                >
                                                                    <Link href={item.url} className="flex items-center gap-2">
                                                                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                                                                        <span>{item.title}</span>
                                                                    </Link>
                                                                </SidebarMenuSubButton>
                                                            </SidebarMenuSubItem>
                                                        ))}
                                                    </SidebarMenuSub>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )}
                                    </SidebarMenuItem>
                                )}

                                {/* Bottom items */}
                                {filteredBottom.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton asChild tooltip={item.title} className="hover:bg-primary/10 transition-colors">
                                            <Link href={item.url} className="flex items-center gap-3">
                                                <item.icon className="w-4 h-4 shrink-0" />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            {(!mounted || (!user && userLoading)) ? (
                                <div className="h-12 w-full flex items-center px-4 gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-primary/20 animate-pulse" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                                        <div className="h-2 w-32 bg-muted animate-pulse rounded" />
                                    </div>
                                </div>
                            ) : (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                                            <Avatar className="h-8 w-8 rounded-lg">
                                                <AvatarImage src="" alt={userName} />
                                                <AvatarFallback className="rounded-lg bg-primary/20 text-primary">{userInitials}</AvatarFallback>
                                            </Avatar>
                                            <div className="grid flex-1 text-left text-sm leading-tight">
                                                <span className="truncate font-semibold">{userName}</span>
                                                <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                                            </div>
                                            <ChevronUp className="ml-auto size-4" />
                                        </SidebarMenuButton>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        side="top"
                                        className="w-[--radix-popper-anchor-width] min-w-56 rounded-lg bg-card/95 backdrop-blur-xl border-border/80 shadow-2xl"
                                        align="end"
                                        sideOffset={4}
                                    >
                                        {user?.isImpersonating && (
                                            <>
                                                <DropdownMenuItem
                                                    className="gap-2 cursor-pointer focus:bg-amber-500/20 text-amber-500 focus:text-amber-500 transition-colors font-black uppercase tracking-widest text-[10px]"
                                                    onClick={handleStopImpersonating}
                                                >
                                                    <ShieldAlert className="size-4" />
                                                    <span>Salir Impersonación</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        <DropdownMenuItem
                                            className="gap-2 cursor-pointer focus:bg-primary/10 transition-colors"
                                            onClick={() => setProfileOpen(true)}
                                        >
                                            <User2 className="text-muted-foreground size-4" />
                                            <span>Mi Perfil</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="gap-2 cursor-pointer focus:bg-primary/10 transition-colors"
                                            onClick={() => setPreferencesOpen(true)}
                                        >
                                            <Settings className="text-muted-foreground size-4" />
                                            <span>Preferencias</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="gap-2 cursor-pointer focus:bg-destructive/20 text-destructive focus:text-destructive transition-colors mt-2"
                                            onClick={async () => {
                                                Object.keys(localStorage).forEach(key => {
                                                    if (key.startsWith("metria_")) localStorage.removeItem(key)
                                                })
                                                toast.success("Sesión cerrada", { duration: 1500 })
                                                await logout()
                                            }}
                                        >
                                            <LogOut className="size-4" />
                                            <span>Cerrar Sesión</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
            <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </>
    )
}
