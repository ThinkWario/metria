"use client"

import { motion } from "framer-motion"

const integrations = [
  "Shopify", "Meta Ads", "TikTok Ads", "Google Ads", "Klaviyo", "Gorgias", "Amazon", "Recharge"
]

export function LogoCloud() {
  return (
    <section id="integrations" className="py-20 border-y border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-4">
        <p className="text-center text-white/30 text-sm font-mono uppercase tracking-[0.3em] mb-12">
          Integración Nativa con el Ecosistema Core
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-10 opacity-40 hover:opacity-100 transition-opacity">
          {integrations.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="text-2xl md:text-3xl font-bold tracking-tighter text-white/50 hover:text-primary transition-colors cursor-default"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
