"use client"

import { initMercadoPago, Payment } from '@mercadopago/sdk-react'
import { useEffect, useState } from 'react'
import { fetchAPI } from '@/lib/api'
import { useUserStore } from '@/store/useUserStore'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

initMercadoPago(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || '')

interface MercadoPagoBrickProps {
    planType: string
}

export function MercadoPagoBrick({ planType }: MercadoPagoBrickProps) {
    const router = useRouter()
    const { user } = useUserStore()
    const [preferenceId, setPreferenceId] = useState<string | null>(null)
    const [loadingPreference, setLoadingPreference] = useState(true)

    const amountCLP = planType === 'PRO' ? 28000 : 76000

    // Fetch preferenceId for wallet payment method
    useEffect(() => {
        let cancelled = false
        async function createPreference() {
            setLoadingPreference(true)
            try {
                const result = await fetchAPI('/payments/create-mp-preference', {
                    method: 'POST',
                    body: JSON.stringify({ planType })
                })
                if (!cancelled && result.preferenceId) {
                    setPreferenceId(result.preferenceId)
                }
            } catch (error) {
                console.error('Failed to create MP preference:', error)
            } finally {
                if (!cancelled) setLoadingPreference(false)
            }
        }
        createPreference()
        return () => { cancelled = true }
    }, [planType])

    const initialization: any = {
        amount: amountCLP,
        payer: {
            email: user?.email || '',
        },
        ...(preferenceId && { preferenceId })
    }

    const onSubmit = async (param: any, additionalData?: any) => {
        console.log("MP onSubmit raw param:", param)
        console.log("MP onSubmit additionalData:", additionalData)
        const formData = param.formData || param

        if (!formData || !formData.token) {
            console.error("No token found in MP formData", formData)
            toast.error("Error: Mercado Pago no generó un token válido.")
            return
        }

        console.log("Processing token:", formData.token)

        try {
            const body = {
                token: formData.token,
                planType: planType,
                email: formData.payer?.email || user?.email || 'test@example.com',
                cardholderName: additionalData?.cardholderName || formData.cardholderName || formData.payer?.firstName || ''
            }
            console.log("Sending to backend:", body)

            const result = await fetchAPI('/payments/process-mercadopago-subscription', {
                method: 'POST',
                body: JSON.stringify(body)
            })

            if (result.success) {
                if (result.token) {
                    localStorage.setItem('metria_token', result.token)
                }

                toast.success("¡Suscripción Activada!", {
                    description: result.message || "Tu cuenta ha sido actualizada satisfactoriamente."
                })

                setTimeout(() => {
                    const isSettings = window.location.pathname.includes('settings')
                    window.location.href = isSettings
                        ? "/dashboard/settings?status=success"
                        : "/dashboard"
                }, 1500)
            } else {
                console.error("Payment failure response:", result)
                toast.error("Pago no autorizado", {
                    description: result.error || "Verifica los datos de tu tarjeta y fondos disponibles."
                })
            }
        } catch (error: any) {
            console.error("MP Submission Error:", error)
            const errorMessage = error?.message || (typeof error === 'string' ? error : "Error crítico de conexión")
            toast.error(errorMessage)
        }
    }

    // Don't mount the Brick until preferenceId is ready — MP Brick only initializes once
    if (loadingPreference || !preferenceId) {
        return (
            <div className="w-full bg-white rounded-2xl p-8 flex items-center justify-center min-h-[200px]">
                {loadingPreference ? (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                ) : (
                    <div className="text-center text-gray-500 text-sm">
                        <p>No se pudo cargar MercadoPago.</p>
                        <button
                            onClick={() => { setLoadingPreference(true); setPreferenceId(null) }}
                            className="mt-2 text-blue-500 underline text-xs"
                        >
                            Reintentar
                        </button>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="w-full bg-white rounded-2xl p-2">
            <Payment
                key={preferenceId}
                initialization={initialization}
                onReady={() => console.log('Payment Brick ready')}
                onSubmit={onSubmit}
                customization={{
                    paymentMethods: {
                        creditCard: 'all',
                        debitCard: 'all',
                        mercadoPago: 'all',
                    },
                    visual: {
                        style: {
                            theme: 'default'
                        }
                    }
                }}
            />
        </div>
    )
}
