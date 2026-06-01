"use client"

import { useRouter } from "next/navigation"
import { Settings2, Plug } from "lucide-react"

interface UnconfiguredStateProps {
    integration?: string
    description?: string
}

export function UnconfiguredState({
    integration,
    description,
}: UnconfiguredStateProps) {
    const router = useRouter()

    const title = integration
        ? `Conecta ${integration} para ver tus datos`
        : "Configura tu cuenta para ver datos reales"

    const detail = description
        ?? "Esta sección muestra datos reales de tus integraciones. Para comenzar, configura tus tokens de API en Configuración Técnica."

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Glow orb */}
            <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full" />
                <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-xl">
                    <Plug className="w-10 h-10 text-primary" strokeWidth={1.5} />
                </div>
            </div>

            {/* Text */}
            <div className="text-center max-w-md space-y-3">
                <h2 className="text-2xl font-black tracking-tight text-foreground">
                    {title}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                    {detail}
                </p>
            </div>

            {/* CTA */}
            <button
                onClick={() => router.push("/dashboard/settings?tab=integrations")}
                className="flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 hover:scale-[1.04] active:scale-[0.95] transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] text-sm"
            >
                <Settings2 className="w-4 h-4" />
                Ir a Configuración Técnica
            </button>

            <p className="text-xs text-muted-foreground/60">
                Una vez conectado, tus datos aparecerán aquí en tiempo real.
            </p>
        </div>
    )
}
