"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CreditCard, Calendar, Zap, AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { fetchAPI } from "@/lib/api"
import { useUserStore } from "@/store/useUserStore"

export function BillingSection() {
    const { user } = useUserStore()
    const [billingInfo, setBillingInfo] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isCancelling, setIsCancelling] = useState(false)

    const fetchBilling = async () => {
        try {
            const data = await fetchAPI('/payments/billing-info')
            setBillingInfo(data)
        } catch (error) {
            console.error("Error fetching billing info:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchBilling()
    }, [])

    const handleCancel = async () => {
        if (!confirm("¿Estás seguro de que deseas cancelar tu suscripción automática? Mantendrás el acceso hasta el final del periodo pagado.")) {
            return
        }

        setIsCancelling(true)
        try {
            await fetchAPI('/payments/cancel-subscription', { method: 'POST' })
            toast.success("Suscripción cancelada", {
                description: "No se realizarán más cobros automáticos."
            })
            fetchBilling()
        } catch (error: any) {
            toast.error("Error al cancelar", { description: error.message })
        } finally {
            setIsCancelling(false)
        }
    }

    if (isLoading) {
        return (
            <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                <CardContent className="p-12 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        )
    }

    const isTrial = billingInfo?.subscriptionStatus === 'TRIAL'
    const isCancelled = billingInfo?.cancelAtPeriodEnd

    return (
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <CreditCard className="w-24 h-24 rotate-12" />
            </div>
            
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-emerald-500" />
                    Plan y Facturación
                </CardTitle>
                <CardDescription>Gestiona tu suscripción y métodos de pago.</CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Plan Actual</div>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-white">{billingInfo?.plan || 'STARTER'}</span>
                            <Badge variant={isTrial ? "secondary" : "default"} className={isTrial ? "bg-emerald-500/10 text-emerald-500 border-none" : ""}>
                                {isTrial ? 'PERIODO DE PRUEBA' : 'ACTIVO'}
                            </Badge>
                        </div>
                    </div>
                    
                    <div className="space-y-1 text-right">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Vence el</div>
                        <div className="flex items-center justify-end gap-2 text-white font-mono">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {billingInfo?.currentPeriodEnd || billingInfo?.trialEndsAt 
                                ? new Date(billingInfo.currentPeriodEnd || billingInfo.trialEndsAt).toLocaleDateString()
                                : 'No disponible'}
                        </div>
                    </div>
                </div>

                {isCancelled && (
                    <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div>
                            <p className="font-bold">Suscripción Cancelada</p>
                            <p className="opacity-80">Tu acceso premium terminará el {new Date(billingInfo.currentPeriodEnd).toLocaleDateString()}. No se realizarán más cobros.</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-border/50 bg-background/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Método de Pago</div>
                        <div className="flex items-center gap-2 text-sm">
                            <div className="w-8 h-5 bg-white/10 rounded flex items-center justify-center text-[8px] font-bold">
                                {billingInfo?.paymentProvider || 'GIFT'}
                            </div>
                            <span className="text-white">•••• •••• {billingInfo?.paymentProvider === 'PAYPAL' ? 'PayPal Checkout' : 'Pago Local'}</span>
                        </div>
                    </div>
                    
                    <div className="p-4 rounded-xl border border-border/50 bg-background/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Próxima Factura</div>
                        <div className="text-sm text-white">
                            {isCancelled ? '$0.00 (Cancelado)' : billingInfo?.plan === 'PRO' ? '$29.00 / mes' : billingInfo?.plan === 'SCALE' ? '$79.00 / mes' : '$0.00'}
                        </div>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="bg-white/5 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-4 p-6">
                <Button variant="outline" className="w-full sm:w-auto" asChild>
                    <a href="/onboarding/plans">Cambiar de Plan</a>
                </Button>
                
                {!isTrial && !isCancelled && (
                    <Button 
                        variant="ghost" 
                        className="w-full sm:w-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleCancel}
                        disabled={isCancelling}
                    >
                        {isCancelling ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            'Cancelar Suscripción Automática'
                        )}
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}
