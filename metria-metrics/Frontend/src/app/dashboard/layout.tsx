import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { HeaderActions } from "@/components/layout/header-actions"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SidebarProvider>
            <div className="flex min-h-screen bg-background w-full">
                <AppSidebar />
                <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                    <header className="flex h-16 shrink-0 items-center justify-between border-b gap-2 px-6 backdrop-blur-md bg-background/60">
                        <SidebarTrigger />
                        <div className="flex items-center gap-4">
                            <HeaderActions />
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium text-sm">
                                U
                            </div>
                        </div>
                    </header>
                    <main className="flex-1 overflow-y-auto p-6 md:p-8 relative">
                        {/* Background glowing effects for premium feel */}
                        <div className="absolute top-0 left-0 w-full h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
                        <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-accent/5 blur-[100px] rounded-full pointer-events-none -z-10" />
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}
