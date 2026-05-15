"use client"

import { PricingCard } from "@/components/pricing/pricing-card"
import { BarChart3, Rocket, Zap, Crown, LogOut } from "lucide-react"
import { motion } from "framer-motion"
import { useState } from "react"
import { selectPlan } from "@/app/onboarding/actions"
import { logout } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"
import { PaymentModal } from "@/components/pricing/payment-modal"

export default function OnboardingPlansPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <PlansContent />
        </Suspense>
    )
}

function PlansContent() {
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
    const [trialUsed, setTrialUsed] = useState<boolean>(false)
    const [isChecking, setIsChecking] = useState<boolean>(true)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<string | null>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const reason = searchParams.get('reason')

    useEffect(() => {
        const checkUserStatus = async () => {
            try {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api'}/users/me`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('metria_token') || ''}`
                    }
                })
                const data = await response.json()
                if (data.trialUsedAt) {
                    setTrialUsed(true)
                }
            } catch (error) {
                console.error("Error checking user status:", error)
            } finally {
                setIsChecking(false)
            }
        }
        checkUserStatus()
    }, [])

    const handleSelectPlan = async (planType: string) => {
        if (planType !== 'STARTER') {
            setSelectedPlanForPayment(planType)
            setIsPaymentModalOpen(true)
            return
        }

        setLoadingPlan(planType)
        const result = await selectPlan(planType)
        
        if (result.success) {
            if (result.token) {
                localStorage.setItem('metria_token', result.token)
            }
            toast.success("¡Plan seleccionado con éxito! Creando tu espacio...")
            router.push("/dashboard")
        } else {
            toast.error(result.error)
            setLoadingPlan(null)
        }
    }

    if (isChecking) {
        return (
            <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <main className="min-h-screen w-full bg-[#050505] relative overflow-hidden flex flex-col items-center justify-center py-20 px-4">
            {/* Background Ambience */}
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-500/10 blur-[180px] rounded-full mix-blend-screen pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-500/10 blur-[180px] rounded-full mix-blend-screen pointer-events-none" />
            
            {/* Top Navigation */}
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-50">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-8 h-8 text-emerald-500" />
                    <span className="text-xl font-black bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent tracking-tighter">
                        METRIA
                    </span>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={async () => {
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('metria_')) {
                                localStorage.removeItem(key)
                            }
                        })
                        await logout()
                    }}
                    className="text-muted-foreground hover:text-white hover:bg-white/5 gap-2"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar Sesión</span>
                </Button>
            </div>
            
            <div className="z-10 w-full max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6"
                    >
                        <Crown className="w-3 h-3" />
                        Elección de Plan
                    </motion.div>
                    
                    {reason === 'TRIAL_EXPIRED' && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl mb-12 max-w-2xl mx-auto backdrop-blur-md"
                        >
                            ¡Tu periodo de prueba ha terminado! Sigue escalando con uno de nuestros planes profesionales.
                        </motion.div>
                    )}
                    
                    <motion.h1 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6"
                    >
                        Desbloquea el poder de <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Metria</span>
                    </motion.h1>
                    
                    <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-xl text-muted-foreground max-w-2xl mx-auto"
                    >
                        Toma el control total de tu e-commerce con métricas en tiempo real.
                        Selecciona el plan que mejor se adapte a tu crecimiento.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
                    <PricingCard 
                        title="Starter"
                        price="Gratis"
                        description={trialUsed ? "Periodo de prueba ya utilizado." : "Ideal para curiosos y principiantes."}
                        icon={Zap}
                        delay={0.3}
                        onSelect={trialUsed ? undefined : () => handleSelectPlan('STARTER')}
                        isLoading={loadingPlan === 'STARTER'}
                        buttonText={trialUsed ? "Prueba Utilizada" : "Comenzar ahora"}
                        features={[
                            "7 días de prueba total",
                            "1 Tienda Shopify",
                            "Métricas básicas de ingresos",
                            "Dashboard en tiempo real",
                            "Soporte por email"
                        ]}
                    />
                    
                    <PricingCard 
                        title="Professional"
                        price="$29"
                        description="Para dueños de tiendas en crecimiento."
                        icon={Rocket}
                        recommended={true}
                        delay={0.4}
                        onSelect={() => handleSelectPlan('PRO')}
                        isLoading={loadingPlan === 'PRO'}
                        features={[
                            "Tiendas ilimitadas",
                            "Integración Meta & Google Ads",
                            "Cálculo de ROAS avanzado",
                            "Alertas de margen bajo",
                            "Reportes semanales automáticos",
                            "Soporte prioritario"
                        ]}
                    />
                    
                    <PricingCard 
                        title="Scale"
                        price="$79"
                        description="Para potencias del e-commerce."
                        icon={Crown}
                        delay={0.5}
                        buttonText="Contactar ventas"
                        onSelect={() => handleSelectPlan('SCALE')}
                        isLoading={loadingPlan === 'SCALE'}
                        features={[
                            "Todo lo de Professional",
                            "IA Valentina (Insights profundos)",
                            "Reportes PDF personalizados",
                            "Métricas de envío (Dropi/Logística)",
                            "Auditoría de rentabilidad mensual",
                            "Account Manager dedicado"
                        ]}
                    />
                </div>

                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.8 }}
                    className="mt-16 text-center"
                >
                    <p className="text-sm text-muted-foreground">
                        ¿Tienes dudas? <a href="#" className="text-emerald-400 hover:underline font-bold transition-all">Habla con un experto en métricas</a>
                    </p>
                </motion.div>
            </div>

            <PaymentModal 
                isOpen={isPaymentModalOpen} 
                onOpenChange={setIsPaymentModalOpen} 
                planType={selectedPlanForPayment} 
            />
        </main>
    )
}
