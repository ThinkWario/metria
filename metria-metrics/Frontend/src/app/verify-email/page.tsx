"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { verifyEmail } from "./actions"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

function VerifyEmailContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const token = searchParams.get("token")
        if (!token) {
            setStatus("error")
            setError("Falta el token de verificación")
            return
        }

        verifyEmail(token).then((result) => {
            if (result.success) {
                localStorage.setItem("metria_token", result.token)
                localStorage.setItem("metria_user", JSON.stringify(result.user))
                setStatus("success")
                setTimeout(() => router.push("/dashboard"), 1500)
            } else {
                setStatus("error")
                setError(result.error === "invalid_or_expired_token" ? "Enlace inválido o expirado" : result.error ?? "Error desconocido")
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background">
            <div className="text-center space-y-4">
                {status === "verifying" && (
                    <>
                        <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
                        <p>Verificando tu correo...</p>
                    </>
                )}
                {status === "success" && (
                    <>
                        <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
                        <p>¡Correo verificado! Redirigiendo...</p>
                    </>
                )}
                {status === "error" && (
                    <>
                        <XCircle className="w-10 h-10 mx-auto text-destructive" />
                        <p>{error}</p>
                    </>
                )}
            </div>
        </main>
    )
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <VerifyEmailContent />
        </Suspense>
    )
}
