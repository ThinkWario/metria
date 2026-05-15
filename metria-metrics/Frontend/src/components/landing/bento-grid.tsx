"use client"

import { motion } from "framer-motion"
import { TrendingUp, Users, Target, Zap } from "lucide-react"

const cards = [
  {
    title: "Marketing & Ads Intelligence",
    description: "Atribución multi-canal exacta. Sincroniza Meta, Google y TikTok Ads para conocer el ROAS real por cada SKU sin duplicidad.",
    icon: TrendingUp,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    size: "col-span-1 md:col-span-2",
  },
  {
    title: "Andromeda AI",
    description: "Nuestra IA analiza tus márgenes en tiempo real y te alerta sobre campañas con ROAS bajo o productos sin stock.",
    icon: Zap,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    size: "col-span-1",
  },
  {
    title: "Logística & Envíos",
    description: "Integración profunda con Dropi y transportadoras. Seguimiento del estado de entrega y efectividad de logística.",
    icon: Users,
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    size: "col-span-1",
  },
  {
    title: "Profit Engine Core",
    description: "Olvídate de las hojas de Excel. Calculamos tu utilidad neta real descontando COGS, impuestos, envíos y ad spend automáticamente.",
    icon: Target,
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    size: "col-span-1 md:col-span-2",
  },
]

export function BentoGrid() {
  return (
    <section id="features" className="py-24 px-4 max-w-7xl mx-auto">
      <div className="mb-20 text-center">
        <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter">El Cerebro de tu <span className="text-primary">E-Commerce</span></h2>
        <p className="text-white/40 text-xl max-w-2xl mx-auto leading-relaxed font-medium">Combinamos ingeniería de datos de precisión con una interfaz diseñada para fundadores que escalan.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            whileHover={{ y: -8, transition: { duration: 0.2 } }}
            className={`glass-card p-10 rounded-[3rem] flex flex-col justify-between group transition-all hover:bg-white/[0.05] hover:border-white/20 border-white/5 ${card.size}`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 border transition-transform group-hover:scale-110 ${card.color}`}>
              <card.icon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-black mb-4 text-white group-hover:text-primary transition-colors tracking-tight">{card.title}</h3>
              <p className="text-white/40 text-lg leading-relaxed group-hover:text-white/70 transition-colors">
                {card.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
