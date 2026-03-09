"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api'

export async function login(formData: FormData) {
    const email = formData.get("email")
    const password = formData.get("password")

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })

        const data = await response.json()

        if (!response.ok) {
            return { success: false, error: data.error || 'Credenciales inválidas' }
        }

        // Handle Force Password Change Flow
        if (data.requiresPasswordChange) {
            return { success: true, requiresPasswordChange: true, tempToken: data.token }
        }

        // Set a session cookie for Next.js middleware protection
        const cookieStore = await cookies()
        cookieStore.set("metria_session", "authenticated", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: "/",
        })

        return {
            success: true,
            token: data.token,
            user: data.user,
            workspace: data.workspace
        }

    } catch (error) {
        console.error("Login server error:", error)
        return { success: false, error: "Error de conexión con el servidor" }
    }
}

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.delete("metria_session")
    redirect("/login")
}
