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
    admin: "Administración",
    workspaces: "Espacios de Trabajo"
}

export function Breadcrumbs() {
    const pathname = usePathname()
    const segments = pathname.split("/").filter(Boolean)

    if (segments.length === 0) return null

    return (
        <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-4">
            <Link 
                href="/dashboard"
                className="hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            >
                <Home className="w-4 h-4" />
            </Link>
            
            {segments.map((segment, index) => {
                const url = `/${segments.slice(0, index + 1).join("/")}`
                const isLast = index === segments.length - 1
                const label = routeMap[segment] || segment

                return (
                    <div key={url} className="flex items-center space-x-1">
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                        <Link
                            href={url}
                            className={cn(
                                "capitalize hover:text-foreground transition-all px-1.5 py-0.5 rounded-md",
                                isLast ? "text-foreground font-semibold pointer-events-none" : "hover:bg-muted"
                            )}
                        >
                            {label}
                        </Link>
                    </div>
                )
            })}
        </nav>
    )
}
