"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HeaderActions } from "@/components/layout/header-actions"
import { WorkspaceAvatar } from "@/components/layout/workspace-avatar"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { TrialBanner } from "@/components/layout/trial-banner"
import { useUserStore } from "@/store/useUserStore"
import { useEffect } from "react"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { fetchMe } = useUserStore()

    useEffect(() => {
        fetchMe()
    }, [fetchMe])

    return (
        <SidebarProvider>
            <div className="flex min-h-screen bg-background w-full">
                <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background">Saltar al contenido principal</a>
                <AppSidebar />
                <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                    <TrialBanner />
                    <header className="flex h-16 shrink-0 items-center justify-between border-b gap-2 px-6 backdrop-blur-md bg-background/60">
                        <SidebarTrigger />
                        <div className="flex items-center gap-4">
                            <HeaderActions />
                            <WorkspaceAvatar />
                        </div>
                    </header>
                    <main id="dashboard-content" className="flex-1 overflow-y-auto p-6 md:p-8 relative">
                        {/* Background glowing effects for premium feel */}
                        <div className="absolute top-0 left-0 w-full h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
                        <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-accent/5 blur-[100px] rounded-full pointer-events-none -z-10" />
                        <Breadcrumbs />
                        <ErrorBoundary>
                            {children}
                        </ErrorBoundary>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}
