"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { login, googleLogin } from "./actions"
import { GoogleLogin } from "@react-oauth/google"
import { motion } from "framer-motion"

export default function LoginPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    async function handleGoogleSuccess(credential: string) {
        setIsLoading(true)
        const result = await googleLogin(credential)

        if (result?.success) {
            localStorage.setItem("metria_token", result.token)
            
            if (result.onboardingRequired) {
                toast.success("¡Bienvenido a Metria! Vamos a configurar tu cuenta.")
                router.push("/onboarding/plans")
                return
            }

            toast.success(`Bienvenido, ${result.user?.name || result.user?.email}`)
            router.push("/dashboard")
        } else {
            setIsLoading(false)
            toast.error("Error de Autenticación", {
                description: result?.error || "No se pudo iniciar sesión con Google"
            })
        }
    }

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        const result = await login(formData)

        if (result?.success) {
            if (result.requiresPasswordChange) {
                // Store temp token for the force-password page
                sessionStorage.setItem("metria_temp_token", result.tempToken)
                router.push("/force-password")
                return
            }

            // Standard success
            localStorage.setItem("metria_token", result.token)

            if (result.user?.role === "SUPER_ADMIN") {
                toast.success("Bienvenido Super Admin")
                router.push("/admin")
            } else {
                toast.success("Bienvenido a Metria Metrics")
                router.push("/dashboard")
            }
        } else {
            setIsLoading(false)
            toast.error("Error de Autenticación", {
                description: result?.error || "Credenciales incorrectas"
            })
        }
    }

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden" aria-labelledby="login-heading">
            <a href="#login-form" className="sr-only focus:not-sr-only">Saltar al formulario de inicio de sesión</a>
            {/* Background Ambience */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="z-10 w-full max-w-5xl px-4 flex flex-col md:flex-row items-center justify-center gap-8"
            >
                {/* Main Login Card */}
                <Card className="w-full max-w-md border border-border/50 bg-card/40 backdrop-blur-2xl shadow-2xl overflow-hidden order-1 md:order-none">
                    <CardHeader>
                        <CardTitle className="text-2xl pt-2">Iniciar Sesión</CardTitle>
                        <CardDescription>
                            Introduce tus credenciales para acceder a tu panel.
                        </CardDescription>
                    </CardHeader>
                    <form id="login-form" action={handleSubmit} aria-label="Formulario de inicio de sesión">
                        <CardContent className="space-y-0 flex flex-col gap-0 pb-8">
                            <div className="mb-5">
                                <Label htmlFor="email" className="block mb-2 text-sm font-medium">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    placeholder="admin@metria.com"
                                    className="bg-background/50 border-border/50 h-11 focus-visible:ring-primary backdrop-blur-md transition-all duration-300"
                                />
                            </div>
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <Label htmlFor="password">Contraseña</Label>
                                </div>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    className="bg-background/50 border-border/50 h-11 focus-visible:ring-primary backdrop-blur-md transition-all duration-300"
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-11 text-base font-bold transition-all hover:scale-[1.04] active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_35px_rgba(16,185,129,0.5)] bg-emerald-500 hover:bg-emerald-600 text-white"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Verificando...
                                    </>
                                ) : (
                                    "Ingresar al Dashboard"
                                )}
                            </Button>

                            {/* Divider with perfect symmetry */}
                            <div className="relative my-8">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border/20"></span>
                                </div>
                                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.2em]">
                                    <span className="bg-[#0b0b0b] px-3 text-muted-foreground/50 backdrop-blur-xl">O CONTINÚA CON</span>
                                </div>
                            </div>

                            <div className="flex justify-center w-full mb-8">
                                <div className="w-[282px] min-h-[40px] flex items-center justify-center overflow-hidden rounded-md border border-neutral-900 bg-white shadow-sm hover:border-black transition-all duration-200">
                                    <GoogleLogin
                                        onSuccess={(res) => res.credential && handleGoogleSuccess(res.credential)}
                                        onError={() => toast.error("Error al conectar con Google")}
                                        theme="outline"
                                        shape="rectangular"
                                        width="280px"
                                        text="continue_with"
                                    />
                                </div>
                            </div>

                            <p className="text-sm text-center text-muted-foreground">
                                ¿No tienes una cuenta?{" "}
                                <a href="/signup" className="text-primary hover:underline font-medium">
                                    Regístrate aquí
                                </a>
                            </p>
                        </CardContent>
                        <CardFooter className="hidden" />
                    </form>
                </Card>

                {/* Helper / Demo Credentials Card */}
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="w-full max-w-[320px] flex flex-col gap-4"
                >
                    <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                <BarChart3 className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="font-bold text-sm tracking-tight text-foreground/80">Acceso Rápido (Demo)</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors group">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Administrador</p>
                                <div className="flex flex-col text-xs leading-relaxed">
                                    <span className="text-foreground/70 font-medium">admin@metria.com</span>
                                    <span className="text-primary/60 font-mono">metria2025</span>
                                </div>
                            </div>

                            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors group">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-emerald-400 transition-colors">Super Admin</p>
                                <div className="flex flex-col text-xs leading-relaxed">
                                    <span className="text-foreground/70 font-medium">superadmin@metria.ai</span>
                                    <span className="text-emerald-400/60 font-mono">masterkey</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/5">
                            <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                                Usa estas credenciales para explorar todas las funcionalidades de Metria Metrics.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </main>
    )
}
