"use client"

import { motion } from "framer-motion"
import { Brain, Sparkles, Zap, ShieldCheck } from "lucide-react"

const aiFeatures = [
  {
    title: "Escalado Predictivo",
    description: "Nuestra IA analiza tendencias históricas para sugerir incrementos de presupuesto en campañas ganadoras antes de que el ROAS caiga.",
    icon: Sparkles,
    delay: 0.1
  },
  {
    title: "Detección de Anomalías",
    description: "Alertas instantáneas si un producto deja de venderse o si el CPV de TikTok sube por encima del promedio histórico.",
    icon: ShieldCheck,
    delay: 0.2
  },
  {
    title: "Optimización de Inventario",
    description: "Predicciones de stock out basadas en velocidad de venta real y tiempos de reposición de proveedores.",
    icon: Brain,
    delay: 0.3
  }
]

export function AIHeartbeat() {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm font-medium mb-6"
          >
            <Zap className="w-4 h-4 fill-primary" />
            Metria AI Heartbeat v2.0
          </motion.div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-6 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            No solo medimos datos. <br />Los hacemos inteligentes.
          </h2>
          <p className="text-white/50 text-xl max-w-2xl mx-auto">
            Metria utiliza algoritmos avanzados para darte respuestas, no solo números. 
            Anticípate al mercado con insights en tiempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {aiFeatures.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: feature.delay }}
              className="glass-card p-8 rounded-[2.5rem] relative group overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-white">{feature.title}</h3>
              <p className="text-white/50 leading-relaxed italic">
                "{feature.description}"
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
