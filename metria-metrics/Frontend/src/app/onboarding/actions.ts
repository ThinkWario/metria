"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { API_BASE_URL } from "@/lib/constants"

export async function selectPlan(planType: string) {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("metria_session")?.value

    if (!sessionToken) {
        redirect("/login")
    }

    try {
        const response = await fetch(`${API_BASE_URL}/onboarding/select-plan`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ planType })
        })

        const data = await response.json()

        if (!response.ok) {
            return { success: false, error: data.error || 'Error al seleccionar el plan' }
        }

        // Update session cookie with the new token (which now contains workspaceId)
        cookieStore.set("metria_session", data.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: "/",
        })

        return { success: true, workspace: data.workspace, token: data.token }

    } catch (error) {
        console.error("Onboarding action error:", error)
        return { success: false, error: "Error de conexión con el servidor" }
    }
}

export async function createSubscription(planType: string, provider: 'PAYPAL' | 'MERCADOPAGO') {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("metria_session")?.value

    if (!sessionToken) redirect("/login")

    try {
        const response = await fetch(`${API_BASE_URL}/payments/create-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ planType, provider })
        })

        const data = await response.json()
        if (!response.ok) return { success: false, error: data.error }

        return { success: true, url: data.url }
    } catch (error) {
        return { success: false, error: "Error de red" }
    }
}

export async function activatePayPalSubscription(subscriptionId: string, planType: string) {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("metria_session")?.value

    if (!sessionToken) redirect("/login")

    try {
        const response = await fetch(`${API_BASE_URL}/payments/activate-paypal-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ subscriptionId, planType })
        })

        const data = await response.json()
        if (!response.ok) return { success: false, error: data.error }

        return { success: true }
    } catch (error) {
        return { success: false, error: "Error de red al activar suscripción PayPal" }
    }
}
