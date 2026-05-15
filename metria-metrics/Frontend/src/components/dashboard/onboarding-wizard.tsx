"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    ShoppingBag, 
    Settings, 
    Target, 
    LayoutDashboard, 
    CheckCircle2, 
    ArrowRight,
    ChevronRight,
    Loader2
} from "lucide-react"
import { useRouter } from "next/navigation"

const steps = [
    {
        id: "shopify",
        title: "Conecta Shopify",
        description: "Importa tus órdenes y ventas automáticamente.",
        icon: ShoppingBag,
        color: "text-emerald-500",
    },
    {
        id: "cogs",
        title: "Configura tus COGS",
        description: "Define tus costos de productos para calcular el margen.",
        icon: Settings,
        color: "text-blue-500",
    },
    {
        id: "ads",
        title: "Enlaza Publicidad",
        description: "Conecta Meta, Google o TikTok para ver tu ROAS.",
        icon: Target,
        color: "text-amber-500",
    },
    {
        id: "done",
        title: "¡Todo listo!",
        description: "Tu dashboard está listo para el despegue.",
        icon: LayoutDashboard,
        color: "text-primary",
    }
]

export function OnboardingWizard() {
    const [currentStep, setCurrentStep] = useState(0)
    const router = useRouter()

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1)
        } else {
            // Mark as completed or redirect
            router.push("/dashboard")
        }
    }

    const handleGoToSettings = () => {
        router.push("/dashboard/settings")
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md px-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-2xl"
            >
                <Card className="border-border/50 bg-card/60 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-muted">
                        <motion.div 
                            className="h-full bg-primary"
                            initial={{ width: "0%" }}
                            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                        />
                    </div>

                    <CardHeader className="pt-10">
                        <div className="flex justify-center mb-6">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentStep}
                                    initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                    exit={{ scale: 1.5, rotate: 20, opacity: 0 }}
                                    className={`p-4 rounded-2xl bg-white/5 border border-white/10 ${steps[currentStep].color}`}
                                >
                                    {BigIcon(steps[currentStep].icon)}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                        <CardTitle className="text-3xl text-center font-bold tracking-tight">
                            {steps[currentStep].title}
                        </CardTitle>
                        <CardDescription className="text-center text-lg max-w-sm mx-auto">
                            {steps[currentStep].description}
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pb-10 space-y-8">
                        {/* Summary of steps */}
                        <div className="flex justify-between items-center max-w-md mx-auto relative px-2">
                             {/* Connector lines */}
                            <div className="absolute top-5 left-10 right-10 h-[2px] bg-muted -z-0" />
                            
                            {steps.map((step, idx) => (
                                <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500
                                        ${idx <= currentStep ? 'bg-primary border-primary text-white scale-110' : 'bg-muted border-muted text-muted-foreground'}
                                    `}>
                                        {idx < currentStep ? <CheckCircle2 className="w-5 h-5" /> : <span>{idx + 1}</span>}
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${idx === currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
                                        {step.id}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4 justify-center">
                            {currentStep === steps.length - 1 ? (
                                <Button size="lg" className="h-12 px-8 text-base font-semibold group shadow-[0_0_30px_rgba(var(--primary),0.3)]" onClick={() => router.refresh()}>
                                    Empezar ahora
                                    <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
                                </Button>
                            ) : (
                                <>
                                    <Button size="lg" variant="outline" onClick={handleGoToSettings} className="h-12 px-6 border-border/50 hover:bg-white/5 transition-colors">
                                        Ir a Ajustes
                                    </Button>
                                    <Button size="lg" className="h-12 px-8 text-base font-semibold group" onClick={handleNext}>
                                        Siguiente Paso
                                        <ChevronRight className="ml-1 w-5 h-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}

function BigIcon(Icon: any) {
    return <Icon className="w-12 h-12" />
}
