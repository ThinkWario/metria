import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HeaderActions } from "@/components/layout/header-actions"
import { ShieldAlert } from "lucide-react"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SidebarProvider>
            <div className="flex min-h-screen bg-background w-full">
                <AdminSidebar />
                <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                    <header className="flex h-16 shrink-0 items-center justify-between border-b border-destructive/20 gap-2 px-6 backdrop-blur-md bg-destructive/5">
                        <div className="flex items-center gap-4">
                            <SidebarTrigger />
                            <div className="hidden md:flex items-center gap-2 text-sm text-destructive font-medium px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                                <ShieldAlert className="w-4 h-4" />
                                ZONA DE ADMINISTRACIÓN (SUPER ADMIN)
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <HeaderActions />
                            <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center text-destructive font-bold text-sm border border-destructive/30">
                                SA
                            </div>
                        </div>
                    </header>
                    <main id="admin-content" className="flex-1 overflow-y-auto p-6 md:p-8 relative">
                        {/* Background glowing effects for premium admin feel */}
                        <div className="absolute top-0 left-0 w-full h-[500px] bg-destructive/5 blur-[120px] rounded-full pointer-events-none -z-10" />
                        <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-primary/5 blur-[100px] rounded-full pointer-events-none -z-10" />
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}
