"use server"

import { cookies } from "next/headers"
import { API_BASE_URL } from "@/lib/constants"

export async function verifyEmail(token: string) {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (!res.ok) {
            return { success: false, error: data.error || "Error al verificar el correo" }
        }

        const cookieStore = await cookies()
        cookieStore.set("metria_session", data.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
        })

        return { success: true, token: data.token, user: data.user }
    } catch (error) {
        console.error("Verify email action error:", error)
        return { success: false, error: "Error de conexión con el servidor" }
    }
}
