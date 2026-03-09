"use client"

import { useState, FormEvent, useEffect } from "react"
import { useRouter } from "next/navigation"
import { forceChangePassword } from "@/lib/api"
import { toast } from "sonner"
import { LockKeyhole, Loader2, ArrowRight } from "lucide-react"

export default function ForcePasswordPage() {
    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [tempToken, setTempToken] = useState<string | null>(null)
    const router = useRouter()

    useEffect(() => {
        // Attempt to retrieve the temporary token stored during login
        const token = sessionStorage.getItem("metria_temp_token")
        if (!token) {
            toast.error("Sesión inválida o expirada.")
            router.push("/login")
        } else {
            setTempToken(token)
        }
    }, [router])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()

        if (password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres")
            return
        }

        if (password !== confirm) {
            toast.error("Las contraseñas no coinciden")
            return
        }

        if (!tempToken) return

        setLoading(true)
        try {
            const res = await forceChangePassword(password, tempToken)
            toast.success("Contraseña actualizada con éxito")

            // Clean temp token and store the permanent one
            sessionStorage.removeItem("metria_temp_token")
            localStorage.setItem("metria_token", res.token)

            // Redirect to standard dashboard
            router.push("/dashboard")
        } catch (error) {
            toast.error("Error al actualizar la contraseña")
        } finally {
            setLoading(false)
        }
    }

    if (!tempToken) return null

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="w-full max-w-md bg-card/60 backdrop-blur-xl border border-border/50 rounded-3xl p-8 shadow-2xl z-10 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 ring-4 ring-primary/5">
                        <LockKeyhole className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">Actualización Requerida</h1>
                    <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        Por motivos de seguridad, debes establecer una nueva contraseña privada antes de continuar a tu panel de control.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Nueva Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-background/50 border border-border/50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Confirmar Contraseña</label>
                        <input
                            type="password"
                            required
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full bg-background/50 border border-border/50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/50"
                            placeholder="Repite tu nueva contraseña"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl hover:bg-primary/90 transition-all focus:ring-4 focus:ring-primary/20 flex flex-row items-center justify-center gap-2 mt-6 group disabled:opacity-70"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Guardar y Continuar
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
