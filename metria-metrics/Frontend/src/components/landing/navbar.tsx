"use client"

import { motion } from "framer-motion"
import Link from "next/link"

export function LandingNavbar() {
  return (
    <motion.nav 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center p-6 pointer-events-none"
    >
      <div className="glass-card px-8 py-4 rounded-full flex items-center gap-10 border-white/10 bg-black/40 backdrop-blur-xl pointer-events-auto shadow-2xl">
        <Link href="/" className="text-white font-black tracking-tighter text-2xl flex items-center gap-1 group">
          METRIA<span className="text-primary group-hover:animate-pulse">.</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-widest text-white/40">
          <Link href="#features" className="hover:text-primary transition-colors">Funciones</Link>
          <Link href="#integrations" className="hover:text-primary transition-colors">Integraciones</Link>
          <Link href="#pricing" className="hover:text-primary transition-colors">Precios</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden sm:block text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors">
            Login
          </Link>
          <Link href="/login">
            <button className="px-6 py-2.5 bg-primary text-black text-xs font-black rounded-full hover:scale-105 transition-all shadow-lg shadow-primary/20">
              PRUEBA GRATIS
            </button>
          </Link>
        </div>
      </div>
    </motion.nav>
  )
}
