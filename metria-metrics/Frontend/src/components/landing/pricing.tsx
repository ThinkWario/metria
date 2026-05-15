"use client"

import { motion } from "framer-motion"
import { Check, X } from "lucide-react"
import Link from "next/link"

const tiers = [
  {
    name: "Starter",
    price: "Gratis",
    description: "Ideal para curiosos y principiantes.",
    features: [
      "7 días de prueba total",
      "1 Tienda Shopify",
      "Métricas básicas de ingresos",
      "Dashboard en tiempo real",
      "Soporte por email"
    ],
    notIncluded: ["Integración Ads Avanzada", "AI Insights", "Métricas de Logística"],
    active: false,
    cta: "Comenzar gratis"
  },
  {
    name: "Professional",
    price: "$29",
    description: "Para dueños de tiendas en crecimiento.",
    features: [
      "Tiendas ilimitadas",
      "Integración Meta & Google Ads",
      "Cálculo de ROAS avanzado",
      "Alertas de margen bajo",
      "Reportes semanales automáticos",
      "Soporte prioritario"
    ],
    notIncluded: ["IA Valentina", "Métricas de Logística", "Auditoría Mensual"],
    active: true,
    cta: "Suscribirse ahora"
  },
  {
    name: "Scale",
    price: "$79",
    description: "Para potencias del e-commerce.",
    features: [
      "Todo lo de Professional",
      "IA Valentina (Insights profundos)",
      "Reportes PDF personalizados",
      "Métricas de envío (Dropi/Logística)",
      "Auditoría de rentabilidad mensual",
      "Account Manager dedicado"
    ],
    notIncluded: [],
    active: false,
    cta: "Contactar ventas"
  }
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-black mb-4 tracking-tighter">Planes Simples, <span className="text-primary italic">Resultados Reales</span>.</h2>
          <p className="text-white/50 text-xl font-medium">Sin cuotas escondidas. Transparencia total para escalar.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`glass-card p-10 rounded-[3rem] border relative flex flex-col ${tier.active ? 'border-primary shadow-[0_0_50px_rgba(16,185,129,0.15)] scale-105 z-10' : 'border-white/5'}`}
            >
              {tier.active && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
                  Más Popular
                </div>
              )}
              <div className="mb-8">
                <h3 className="text-2xl font-black text-white mb-2 tracking-tight">{tier.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black text-white">{tier.price}</span>
                  {tier.price !== "Gratis" && tier.price !== "Custom" && <span className="text-white/50 font-bold">/mes</span>}
                </div>
                <p className="mt-4 text-white/50 leading-relaxed font-medium">{tier.description}</p>
              </div>

              <div className="space-y-4 mb-10 flex-grow">
                {tier.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-white/80 font-medium">{f}</span>
                  </div>
                ))}
                {tier.notIncluded.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 opacity-20">
                    <X className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="text-white/80 line-through font-medium">{f}</span>
                  </div>
                ))}
              </div>

              <Link href="/login" className="w-full">
                <button className={`w-full py-5 rounded-full font-black text-sm uppercase tracking-widest transition-all ${tier.active ? 'bg-primary text-black hover:scale-[1.02] shadow-xl shadow-primary/20' : 'bg-white/5 text-white hover:bg-white/10'}`}>
                  {tier.cta}
                </button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
