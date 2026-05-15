"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { CheckCircle2 } from "lucide-react"

const benefits = [
  "Precisión del 99.9% en Atribución de Ventas",
  "Cálculo de Utilidad Neta en Tiempo Real",
  "Integración Nativa con Shopify y Meta Ads",
  "Dashboard Personalizable de Alta Densidad"
]

export function FeatureShowcase() {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-transparent to-primary/5">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8">
              Tu centro de mando para <span className="text-primary italic">escalar</span>.
            </h2>
            <p className="text-white/50 text-xl mb-10 leading-relaxed">
              Olvida las hojas de cálculo infinitas. Metria consolida cada métrica vital de tu negocio en una sola pantalla de cristal, optimizada para la toma de decisiones rápidas.
            </p>
            
            <div className="space-y-4 mb-10">
              {benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <span className="text-lg font-medium text-white/80">{benefit}</span>
                </div>
              ))}
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-10 py-5 bg-white text-black font-bold text-lg rounded-full shadow-2xl shadow-white/10"
            >
              Ver Todas las Funciones
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
            whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="relative perspective-1000"
          >
            <div className="relative z-10 rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.2)]">
              <Image 
                src="/metria_dashboard_mockup_1773246181736.png" 
                alt="Metria Dashboard Mockup" 
                width={1200} 
                height={800}
                className="w-full h-auto"
              />
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 blur-[60px] rounded-full animate-pulse" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-cyan-500/10 blur-[80px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
