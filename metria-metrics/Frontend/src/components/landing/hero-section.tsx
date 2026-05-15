"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 30, filter: "blur(10px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 1, ease: [0.23, 1, 0.32, 1] as any } },
  }

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-20 px-4 overflow-hidden">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="relative z-10 max-w-6xl w-full text-center"
      >
        <motion.div 
          variants={item} 
          className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/10 text-primary text-[10px] md:text-xs font-mono uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.1)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Inteligencia Artificial Aplicada a E-Commerce
        </motion.div>
        
        <motion.h1 
          variants={item}
          className="text-6xl md:text-[9.5rem] font-bold tracking-[ -0.04em] leading-[0.85] mb-6"
        >
          <span className="text-white drop-shadow-2xl">Domina tus</span><br />
          <span className="text-primary italic font-serif">métricas.</span>
        </motion.h1>
        
        <motion.h2 
          variants={item}
          className="text-3xl md:text-6xl font-medium tracking-tight mb-10 text-white/80 max-w-4xl mx-auto"
        >
          Multiplica tu rentabilidad neta con la única fuente de verdad real.
        </motion.h2>
        
        <motion.p 
          variants={item}
          className="max-w-2xl mx-auto text-lg md:text-2xl text-white/40 mb-14 leading-relaxed font-light"
        >
          Metria unifica Meta, TikTok, Google y Shopify en un panel de control de élite. 
          Deja de adivinar y empieza a escalar con precisión quirúrgica.
        </motion.p>
        
        <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link href="/login">
            <button className="px-12 py-5 bg-primary text-black font-extrabold text-lg rounded-full hover:scale-105 transition-all flex items-center gap-3 group shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)]">
              Empieza Gratis Ahora
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1.5 transition-transform" />
            </button>
          </Link>
          <Link href="#features">
            <button className="px-12 py-5 bg-white/5 border border-white/10 text-white font-bold text-lg rounded-full hover:bg-white/10 transition-all backdrop-blur-sm">
              Ver Demo Interactiva
            </button>
          </Link>
        </motion.div>

        {/* Stats strip */}
        <motion.div 
          variants={item}
          className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 border-t border-white/5 pt-12 max-w-4xl mx-auto"
        >
          <div>
            <div className="text-3xl font-bold text-white mb-1">99.9%</div>
            <div className="text-xs uppercase tracking-widest text-white/30">Precisión</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">$2B+</div>
            <div className="text-xs uppercase tracking-widest text-white/30">Ad Spend Medido</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">10ms</div>
            <div className="text-xs uppercase tracking-widest text-white/30">Latencia Sync</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">AI</div>
            <div className="text-xs uppercase tracking-widest text-white/30">Optimización</div>
          </div>
        </motion.div>
      </motion.div>

      {/* Decorative background elements improved */}
      <div className="absolute top-[15%] -left-[10%] w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full mix-blend-screen animate-pulse" />
      <div className="absolute bottom-[10%] -right-[10%] w-[500px] h-[500px] bg-cyan-500/10 blur-[150px] rounded-full mix-blend-screen animate-pulse" style={{ animationDelay: '3s' }} />
    </section>
  )
}
