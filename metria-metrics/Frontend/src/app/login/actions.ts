"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function login(formData: FormData) {
    const email = formData.get("email")
    const password = formData.get("password")

    // Hardcoded Admin Credential
    if (email === "admin@metria.ai" && password === "admin123") {
        // Set a session cookie
        const cookieStore = await cookies()
        cookieStore.set("metria_session", "authenticated", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: "/",
        })

        return { success: true }
    }

    return { success: false, error: "Credenciales inválidas. Usa admin@metria.ai / admin123" }
}

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.delete("metria_session")
    redirect("/login")
}
