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
    MousePointerClick
} from "lucide-react"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logout } from "@/app/login/actions"
import { useUserStore } from "@/store/useUserStore"
import { ProfileDialog } from "@/components/user/profile-dialog"
import { PreferencesDialog } from "@/components/user/preferences-dialog"

const menuItems = [
    { title: "Centro de Control", icon: BarChart3, url: "/dashboard" },
    { title: "Finanzas E-commerce", icon: Wallet, url: "/dashboard/finances" },
    { title: "Canales de Venta", icon: ShoppingBag, url: "/dashboard/sales" },
    { title: "Marketing & Ads", icon: Megaphone, url: "/dashboard/marketing" },
    { title: "Google Ads (Beta)", icon: MousePointerClick, url: "/dashboard/google-ads" },
    { title: "Logística & Operaciones", icon: Package, url: "/dashboard/logistics" },
    { title: "Configuración Técnica", icon: Settings, url: "/dashboard/settings" },
]

export function AppSidebar() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"
    const { fetchMe, getDisplayName, getInitials, user } = useUserStore()

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

    return (
        <>
            <Sidebar collapsible="icon" className="border-r border-border/50 bg-background/50 backdrop-blur-xl">
                <SidebarHeader>
                    <div className={`flex h-16 items-center font-bold text-xl tracking-tighter text-foreground transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
                        {!isCollapsed && (
                            <div className="flex items-center">
                                <span className="text-primary mr-1">Metria</span>Metrics
                            </div>
                        )}
                        {isCollapsed && (
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                                M
                            </div>
                        )}
                        {!isCollapsed && <ModeToggle />}
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground">Módulos</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {menuItems.map((item) => (
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
                            {!mounted ? (
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
                                        className="w-[--radix-popper-anchor-width] min-w-56 rounded-lg bg-card/95 backdrop-blur-xl border-border/50 shadow-2xl"
                                        align="end"
                                        sideOffset={4}
                                    >
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
                                            onClick={async () => await logout()}
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
