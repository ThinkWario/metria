"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { login } from "./actions"

export default function LoginPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        const result = await login(formData)

        if (result?.success) {
            toast.success("Bienvenido a Metria Metrics")
            router.push("/dashboard")
        } else {
            setIsLoading(false)
            toast.error("Error de Autenticación", {
                description: result?.error || "Credenciales incorrectas"
            })
        }
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />

            <div className="z-10 w-full max-w-md px-4">
                <div className="flex flex-col items-center mb-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                        <BarChart3 className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tighter bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">Metria Metrics</h1>
                        <p className="text-muted-foreground mt-2">Cálculo de Utilidad Neta en Tiempo Real</p>
                    </div>
                </div>

                <Card className="border border-border/50 bg-card/40 backdrop-blur-2xl shadow-2xl">
                    <CardHeader>
                        <CardTitle>Iniciar Sesión</CardTitle>
                        <CardDescription>
                            Usa <strong className="text-primary">admin@metria.ai</strong> y clave <strong className="text-primary">admin123</strong>
                        </CardDescription>
                    </CardHeader>
                    <form action={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    placeholder="admin@metria.ai"
                                    className="bg-background/50 border-border/50 focus-visible:ring-primary backdrop-blur-md transition-all duration-300"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Contraseña</Label>
                                </div>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    className="bg-background/50 border-border/50 focus-visible:ring-primary backdrop-blur-md transition-all duration-300"
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-11 text-base font-medium transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Verificando...
                                    </>
                                ) : (
                                    "Ingresar al Dashboard"
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    )
}
