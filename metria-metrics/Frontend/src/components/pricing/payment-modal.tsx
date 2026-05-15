"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CreditCard, Loader2 } from "lucide-react"
import { useState } from "react"
import { createSubscription } from "@/app/onboarding/actions"
import { toast } from "sonner"
import { MercadoPagoBrick } from "./mercadopago-brick"

interface PaymentModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    planType: string | null
}

export function PaymentModal({ isOpen, onOpenChange, planType }: PaymentModalProps) {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [showMPBrick, setShowMPBrick] = useState(false)

    const handlePayment = async (provider: 'PAYPAL' | 'MERCADOPAGO') => {
        if (!planType) return
        
        if (provider === 'MERCADOPAGO') {
            setShowMPBrick(true)
            return
        }

        setIsLoading(provider)
        const result = await createSubscription(planType, provider)
        
        if (result.success && result.url) {
            window.location.href = result.url
        } else {
            toast.error(result.error || "Error al iniciar el pago")
            setIsLoading(null)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className={`${showMPBrick ? 'sm:max-w-[500px]' : 'sm:max-w-[400px]'} bg-[#0A0A0A] border border-white/10 text-white transition-all duration-300 max-h-[90vh] overflow-y-auto`}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tight">Selecciona Método de Pago</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Estás suscribiéndote al plan <span className="text-emerald-400 font-bold">{planType}</span>. El cobro será automático cada mes.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-6">
                    {showMPBrick ? (
                        <div className="space-y-4">
                            <MercadoPagoBrick planType={planType!} />
                            <Button variant="ghost" className="w-full text-xs" onClick={() => setShowMPBrick(false)}>
                                Volver a selección
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button 
                                onClick={() => handlePayment('PAYPAL')}
                                disabled={!!isLoading}
                                className="h-14 bg-[#0070BA] hover:bg-[#005ea6] text-white flex items-center justify-between px-6 rounded-2xl group transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    {isLoading === 'PAYPAL' ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <img src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_37x23.jpg" alt="PayPal" className="h-6 rounded" />
                                    )}
                                    <span className="font-bold">PayPal</span>
                                </div>
                                <span className="text-xs opacity-50 group-hover:opacity-100 transition-opacity whitespace-nowrap">Global / USD</span>
                            </Button>

                            <Button 
                                onClick={() => handlePayment('MERCADOPAGO')}
                                disabled={!!isLoading}
                                className="h-14 bg-[#009EE3] hover:bg-[#0089c7] text-white flex items-center justify-between px-6 rounded-2xl group transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    {isLoading === 'MERCADOPAGO' ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <CreditCard className="w-6 h-6" />
                                    )}
                                    <span className="font-bold">Mercado Pago</span>
                                </div>
                                <span className="text-xs opacity-50 group-hover:opacity-100 transition-opacity whitespace-nowrap">Latam / Chile</span>
                            </Button>
                        </>
                    )}
                </div>

                <p className="text-[10px] text-center text-muted-foreground">
                    Al continuar, aceptas que Metria Metrics realice cargos recurrentes a tu cuenta. Puedes cancelar en cualquier momento desde la configuración.
                </p>
            </DialogContent>
        </Dialog>
    )
}
