"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

const routeMap: Record<string, string> = {
    dashboard: "Centro de Control",
    finances: "Finanzas",
    sales: "Canales de Venta",
    marketing: "Marketing",
    "google-ads": "Google Ads",
    "tiktok-ads": "TikTok Ads",
    logistics: "Logística",
    settings: "Configuración",
    channels: "Canales",
    "ai-agent": "Configuración IA",
    inbox: "Inbox",
    crm: "CRM",
    contacts: "Contactos",
    pipelines: "Pipelines",
    tickets: "Tickets",
    appointments: "Citas",
    bots: "Bots",
    "messaging-analytics": "Analítica de Mensajería",
    admin: "Administración",
    workspaces: "Espacios de Trabajo"
}

// UUID pattern — dynamic segments like [contactId], [botId], etc.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Pages that own their full viewport — hide breadcrumbs
const FULLSCREEN_ROUTES = ['/dashboard/inbox']

export function Breadcrumbs() {
    const pathname = usePathname()

    if (FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))) return null

    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return null

    // Filter out raw UUIDs and build clean crumb list
    const crumbs = segments.reduce<{ label: string; url: string }[]>((acc, segment, index) => {
        if (UUID_RE.test(segment)) return acc  // skip UUID segments
        const url = `/${segments.slice(0, index + 1).join("/")}`
        const label = routeMap[segment] || segment
        acc.push({ label, url })
        return acc
    }, [])

    if (crumbs.length === 0) return null

    return (
        <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-4">
            <Link
                href="/dashboard"
                className="hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            >
                <Home className="w-4 h-4" />
            </Link>

            {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1
                return (
                    <div key={crumb.url} className="flex items-center space-x-1">
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                        <Link
                            href={crumb.url}
                            className={cn(
                                "capitalize hover:text-foreground transition-all px-1.5 py-0.5 rounded-md",
                                isLast ? "text-foreground font-semibold pointer-events-none" : "hover:bg-muted"
                            )}
                        >
                            {crumb.label}
                        </Link>
                    </div>
                )
            })}
        </nav>
    )
}
