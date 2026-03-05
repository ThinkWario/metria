"use client"

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
    LogOut
} from "lucide-react"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logout } from "@/app/login/actions"

const menuItems = [
    {
        title: "Centro de Control",
        icon: BarChart3,
        url: "/dashboard",
    },
    {
        title: "Finanzas E-commerce",
        icon: Wallet,
        url: "/dashboard/finances",
    },
    {
        title: "Canales de Venta",
        icon: ShoppingBag,
        url: "/dashboard/sales",
    },
    {
        title: "Marketing & Ads",
        icon: Megaphone,
        url: "/dashboard/marketing",
    },
    {
        title: "Logística & Operaciones",
        icon: Package,
        url: "/dashboard/logistics",
    },
    {
        title: "Configuración Técnica",
        icon: Settings,
        url: "/dashboard/settings",
    },
]

export function AppSidebar() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"

    return (
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
                    <SidebarGroupLabel className="text-muted-foreground">M&oacute;dulos</SidebarGroupLabel>
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                >
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src="" alt="Admin User" />
                                        <AvatarFallback className="rounded-lg bg-primary/20 text-primary">AD</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold uppercase">Admin User</span>
                                        <span className="truncate text-xs text-muted-foreground">admin@metria.cl</span>
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
                                <DropdownMenuItem className="gap-2 cursor-pointer focus:bg-primary/10 transition-colors">
                                    <User2 className="text-muted-foreground size-4" />
                                    <span>Mi Perfil</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 cursor-pointer focus:bg-primary/10 transition-colors">
                                    <Settings className="text-muted-foreground size-4" />
                                    <span>Preferencias</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="gap-2 cursor-pointer focus:bg-destructive/20 text-destructive focus:text-destructive transition-colors mt-2"
                                    onClick={async () => await logout()}
                                >
                                    <LogOut className="size-4" />
                                    <span>Cerrar Sesi&oacute;n</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
