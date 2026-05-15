"use client"

import { useUserStore } from "@/store/useUserStore"
import { motion, AnimatePresence } from "framer-motion"
import { Timer, Zap, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"

export function TrialBanner() {
    const { user } = useUserStore()
    const [timeLeft, setTimeLeft] = useState<string>("")

    useEffect(() => {
        if (user?.workspace?.trialEndsAt) {
            const endsAt = new Date(user.workspace.trialEndsAt).getTime()
            
            const updateTimer = () => {
                const now = new Date().getTime()
                const diff = endsAt - now
                
                if (diff <= 0) {
                    setTimeLeft("Expirado")
                    return
                }
                
                const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                
                if (days > 0) {
                    setTimeLeft(`${days}d ${hours}h`)
                } else {
                    setTimeLeft(`${hours}h ${minutes}m`)
                }
            }
            
            updateTimer()
            const interval = setInterval(updateTimer, 60000)
            return () => clearInterval(interval)
        }
    }, [user?.workspace?.trialEndsAt])

    if (!user?.workspace || user.workspace.subscriptionStatus !== 'TRIAL') return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-gradient-to-r from-emerald-600/20 to-blue-600/20 border-b border-emerald-500/20 px-6 py-2"
            >
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold">
                            <Zap className="w-4 h-4 animate-pulse" />
                            <span>PLAN STARTER (PRUEBA)</span>
                        </div>
                        <div className="h-4 w-px bg-white/10 hidden sm:block" />
                        <div className="flex items-center gap-2 text-muted-foreground hidden sm:flex">
                            <Timer className="w-4 h-4" />
                            <span>Tiempo restante: <span className="text-white font-mono">{timeLeft}</span></span>
                        </div>
                    </div>
                    
                    <Link 
                        href="/onboarding/plans" 
                        className="group flex items-center gap-1 text-xs font-bold text-white hover:text-emerald-400 transition-colors"
                    >
                        <span>MEJORAR PLAN</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
