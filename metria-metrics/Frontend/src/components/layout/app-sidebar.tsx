"use client"

import { useState, useEffect } from "react"
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
    useSidebar,
} from "@/components/ui/sidebar"
import {
    BarChart3,
    Wallet,
    ShoppingBag,
    Megaphone,
    Package,
    Settings,
    ChevronUp,
    User2,
    LogOut,
    MousePointerClick,
    ShieldAlert,
    Smartphone,
    MessageSquare,
    Users
} from "lucide-react"
import { cn } from "../../lib/utils"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logout } from "@/app/login/actions"
import { stopImpersonating } from "@/lib/api"
import { toast } from "sonner"
import { useUserStore } from "@/store/useUserStore"
import { ProfileDialog } from "@/components/user/profile-dialog"
import { PreferencesDialog } from "@/components/user/preferences-dialog"

type MenuItem = {
    title: string
    icon: any
    url: string
    roles?: string[] // If not specified, available to all
}

const menuItems: MenuItem[] = [
    { title: "Centro de Control", icon: BarChart3, url: "/dashboard" },
    { title: "Inbox (Chats)", icon: MessageSquare, url: "/dashboard/inbox", roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "CRM", icon: Users, url: "/dashboard/crm", roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "Configuración IA", icon: Bot, url: "/dashboard/settings/ai-agent", roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "Canales de Mensajería", icon: MessageSquare, url: "/dashboard/settings/channels", roles: ["SUPER_ADMIN", "ADMIN"] },
    { title: "Finanzas E-commerce", icon: Wallet, url: "/dashboard/finances", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Canales de Venta", icon: ShoppingBag, url: "/dashboard/sales", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Marketing & Ads", icon: Megaphone, url: "/dashboard/marketing", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Google Ads (Beta)", icon: MousePointerClick, url: "/dashboard/google-ads", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "TikTok Ads", icon: Smartphone, url: "/dashboard/tiktok-ads", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
    { title: "Logística & Operaciones", icon: Package, url: "/dashboard/logistics" },
    { title: "Configuración Técnica", icon: Settings, url: "/dashboard/settings", roles: ["SUPER_ADMIN", "ADMIN", "VIEWER"] },
]

export function AppSidebar() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"
    const { fetchMe, getDisplayName, getInitials, user, isLoading: userLoading } = useUserStore()

    const [profileOpen, setProfileOpen] = useState(false)
    const [preferencesOpen, setPreferencesOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        fetchMe()
    }, [fetchMe])

    const userName = getDisplayName()
    const userEmail = user?.email || ""
    const userInitials = getInitials()
    const userRole = user?.role || null

    // Show all items while user profile is loading (user === null).
    // Only filter by role once we know the actual role.
    const filteredMenuItems = menuItems.filter(item => {
        if (!item.roles) return true;
        if (!userRole) return true;
        return item.roles.includes(userRole);
    });

    const handleStopImpersonating = async () => {
        try {
            const res = await stopImpersonating()
            localStorage.setItem('metria_token', res.token)
            toast.success("Volviendo a Centro de Control...")
            setTimeout(() => {
                window.location.href = '/admin/workspaces'
            }, 800)
        } catch (error) {
            toast.error("Error saliendo de impersonación")
        }
    }

    return (
        <>
            <Sidebar collapsible="icon" className="border-r border-border/80 bg-background/50 backdrop-blur-xl will-change-[width,backdrop-filter]">
                <SidebarHeader>
                    <div className={cn(
                        "flex h-16 items-center font-bold text-xl tracking-tighter text-foreground transition-[padding,gap] duration-300 ease-in-out",
                        isCollapsed ? "justify-center px-0 gap-0" : "justify-between px-4 gap-2"
                    )}>
                        <div className="flex items-center min-w-0 overflow-hidden">
                            {isCollapsed ? (
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0 animate-in fade-in zoom-in duration-300">
                                    M
                                </div>
                            ) : (
                                <div className="flex items-center animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-primary mr-1">Metria</span>Metrics
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
                                {filteredMenuItems.map((item) => (
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
                                                // Clear all session/local data
                                                Object.keys(localStorage).forEach(key => {
                                                    if (key.startsWith('metria_')) {
                                                        localStorage.removeItem(key);
                                                    }
                                                });
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

            {/* Dialogs rendered outside sidebar to avoid z-index issues */}
            <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
            <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </>
    )
}
