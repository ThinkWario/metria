"use server"

import { cookies } from "next/headers"
import { API_BASE_URL } from "@/lib/constants"

export async function signup(formData: FormData) {
    const workspaceName = formData.get("workspaceName")
    const name = formData.get("name")
    const email = formData.get("email")
    const password = formData.get("password")

    try {
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceName, name, email, password }),
        })

        const data = await res.json()

        if (!res.ok) {
            return { success: false, error: data.error || "Error al registrarse" }
        }

        // Set session cookie for middleware
        const cookieStore = await cookies()
        cookieStore.set("metria_session", data.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: "/",
        })

        return {
            success: true,
            token: data.token,
            user: data.user
        }
    } catch (error) {
        console.error("Signup action error:", error)
        return { success: false, error: "Error de conexión con el servidor (API: 4000)" }
    }
}
