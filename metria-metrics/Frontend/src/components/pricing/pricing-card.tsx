"use client"

import { motion } from "framer-motion"
import { Check, LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PricingCardProps {
    title: string
    price: string
    description: string
    features: string[]
    icon: LucideIcon
    recommended?: boolean
    delay?: number
    buttonText?: string
    onSelect?: () => void
    isLoading?: boolean
}

export function PricingCard({
    title,
    price,
    description,
    features,
    icon: Icon,
    recommended = false,
    delay = 0,
    buttonText = "Comenzar ahora",
    onSelect,
    isLoading = false
}: PricingCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay }}
            className={cn(
                "relative group flex flex-col p-8 rounded-[2.5rem] transition-all duration-500",
                "border border-white/5 bg-white/[0.02] backdrop-blur-3xl",
                recommended ? "ring-2 ring-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.1)]" : "hover:bg-white/[0.04] hover:border-white/10"
            )}
        >
            {recommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                    Recomendado
                </div>
            )}

            <div className="flex items-center gap-4 mb-6">
                <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border transition-transform duration-500 group-hover:scale-110",
                    recommended ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-white/5 border-white/10 text-white/70"
                )}>
                    <Icon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>

            <div className="mb-8">
                <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black tracking-tighter text-white">{price}</span>
                    {price !== "Gratis" && <span className="text-muted-foreground font-medium">/mes</span>}
                </div>
            </div>

            <div className="space-y-4 mb-10 flex-grow">
                {features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-3 group/item">
                        <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-300",
                            recommended ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 text-white/50 group-hover/item:text-white/80"
                        )}>
                            <Check className="w-3 h-3" />
                        </div>
                        <span className="text-sm text-white/70 group-hover/item:text-white transition-colors duration-300">{feature}</span>
                    </div>
                ))}
            </div>

            <Button
                onClick={onSelect}
                disabled={isLoading}
                className={cn(
                    "w-full h-14 rounded-2xl text-base font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]",
                    recommended 
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_10px_30px_rgba(16,185,129,0.3)]" 
                        : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                )}
            >
                {isLoading ? "Procesando..." : buttonText}
            </Button>

            {/* Subtle Gradient Glow */}
            <div className={cn(
                "absolute -inset-px rounded-[2.5rem] transition-opacity duration-500 pointer-events-none opacity-0 group-hover:opacity-100",
                recommended 
                    ? "bg-gradient-to-br from-emerald-500/10 to-transparent" 
                    : "bg-gradient-to-br from-white/5 to-transparent"
            )} />
        </motion.div>
    )
}
