"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Loader2, UserPlus, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { signup } from "./actions"
import Link from "next/link"

export default function SignupPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        const result = await signup(formData)

        if (result?.success) {
            localStorage.setItem("metria_token", result.token)
            localStorage.setItem("metria_user", JSON.stringify(result.user))
            toast.success("Cuenta creada correctamente", {
                description: "Bienvenido a Metria Metrics. Comencemos con tu configuración."
            })
            router.push("/dashboard") // Will trigger onboarding if no integrations exist
        } else {
            setIsLoading(false)
            toast.error("Error al registrarse", {
                description: result?.error || "Ocurrió un error inesperado"
            })
        }
    }

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[150px] rounded-full mix-blend-screen pointer-events-none" />

            <div className="z-10 w-full max-w-md px-4 py-12">
                <div className="flex flex-col items-center mb-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 backdrop-blur-md">
                        <UserPlus className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tighter bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">Unete a Metria</h1>
                        <p className="text-muted-foreground mt-2">Empieza a optimizar tu rentabilidad hoy mismo</p>
                    </div>
                </div>

                <Card className="border border-border/50 bg-card/40 backdrop-blur-2xl shadow-2xl">
                    <CardHeader>
                        <CardTitle>Crear tu cuenta</CardTitle>
                        <CardDescription>Completa los datos para configurar tu nuevo espacio de trabajo.</CardDescription>
                    </CardHeader>
                    <form action={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="workspaceName" className="flex items-center gap-2">
                                    <Building2 className="w-3.5 h-3.5" /> Nombre del Workspace
                                </Label>
                                <Input
                                    id="workspaceName"
                                    name="workspaceName"
                                    type="text"
                                    required
                                    placeholder="Mi Tienda E-commerce"
                                    className="bg-background/50 border-border/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Tu Nombre Completo</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    placeholder="Juan Pérez"
                                    className="bg-background/50 border-border/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    placeholder="juan@ejemplo.com"
                                    className="bg-background/50 border-border/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña (mín. 8 caracteres)</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    className="bg-background/50 border-border/50"
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col gap-4">
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-11 text-base font-medium transition-all hover:scale-[1.02]"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creando cuenta...
                                    </>
                                ) : (
                                    "Comenzar Gratis"
                                )}
                            </Button>
                            <p className="text-sm text-center text-muted-foreground">
                                ¿Ya tienes una cuenta?{" "}
                                <Link href="/login" className="text-primary hover:underline font-medium">
                                    Inicia sesión aquí
                                </Link>
                            </p>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </main>
    )
}
