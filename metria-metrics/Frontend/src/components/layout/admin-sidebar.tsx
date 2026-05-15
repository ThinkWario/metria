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
    Building2,
    Settings2,
    Activity,
    ChevronUp,
    User2,
    LogOut,
    ShieldAlert
} from "lucide-react"
import { cn } from "../../lib/utils"
import Link from "next/link"
import { ModeToggle } from "@/components/mode-toggle"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logout } from "@/app/login/actions"

const adminMenuItems = [
    {
        title: "SaaS Overview",
        icon: Activity,
        url: "/admin",
    },
    {
        title: "Workspaces (Clientes)",
        icon: Building2,
        url: "/admin/workspaces",
    },
    {
        title: "System Configs",
        icon: Settings2,
        url: "/admin/settings",
    }
]

export function AdminSidebar() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"

    return (
        <Sidebar collapsible="icon" className="border-r border-border/50 bg-background/50 backdrop-blur-xl will-change-[width,backdrop-filter]">
            <SidebarHeader>
                <div className={cn(
                    "flex h-16 items-center font-bold text-xl tracking-tighter text-foreground transition-[padding,gap] duration-300 ease-in-out",
                    isCollapsed ? "justify-center px-0 gap-0" : "justify-between px-4 gap-2"
                )}>
                    <div className="flex items-center min-w-0 overflow-hidden">
                        {isCollapsed ? (
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 text-destructive shrink-0 animate-in fade-in zoom-in duration-300">
                                <ShieldAlert className="w-4 h-4" />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                <ShieldAlert className="w-5 h-5 text-destructive" />
                                <span><span className="text-primary mr-1">Metria</span>Admin</span>
                            </div>
                        )}
                    </div>
                    {!isCollapsed && (
                        <div className="animate-in fade-in zoom-in duration-300">
                            <ModeToggle />
                        </div>
                    )}
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel className="text-muted-foreground">Sistema Master</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {adminMenuItems.map((item) => (
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
                                    <Avatar className="h-8 w-8 rounded-lg border border-destructive/20">
                                        <AvatarImage src="" alt="Super Admin" />
                                        <AvatarFallback className="rounded-lg bg-destructive/20 text-destructive">SA</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold uppercase text-destructive">Super Admin</span>
                                        <span className="truncate text-xs text-muted-foreground">Admin Maestro</span>
                                    </div>
                                    <ChevronUp className="ml-auto size-4" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                side="top"
                                className="w-[--radix-popper-anchor-width] min-w-56 rounded-lg bg-card/95 backdrop-blur-xl border-destructive/20 shadow-2xl"
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenuItem className="gap-2 cursor-pointer focus:bg-primary/10 transition-colors">
                                    <User2 className="text-muted-foreground size-4" />
                                    <span>Mi Perfil (Admin)</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="gap-2 cursor-pointer focus:bg-destructive/20 text-destructive focus:text-destructive transition-colors mt-2 border-t border-border pt-2"
                                    onClick={async () => await logout()}
                                >
                                    <LogOut className="size-4" />
                                    <span>Cerrar Sesión</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
