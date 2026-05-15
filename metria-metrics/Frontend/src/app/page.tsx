import { SmoothScroll } from "@/components/landing/smooth-scroll"
import { LandingNavbar } from "@/components/landing/navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { BentoGrid } from "@/components/landing/bento-grid"
import { DataOrbScene } from "@/components/landing/data-orb"
import { LogoCloud } from "@/components/landing/logo-cloud"
import { AIHeartbeat } from "@/components/landing/ai-heartbeat"
import { FeatureShowcase } from "@/components/landing/feature-showcase"
import { PricingSection } from "@/components/landing/pricing"
import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="relative bg-[#050505] text-white selection:bg-primary/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <SmoothScroll>
        <LandingNavbar />
        
        <div className="relative">
          <DataOrbScene />
          <HeroSection />
        </div>

        <LogoCloud />

        <section id="features">
          <BentoGrid />
        </section>

        <FeatureShowcase />

        <AIHeartbeat />

        <PricingSection />

        <section className="py-24 px-4 text-center">
          <div className="glass-card max-w-4xl mx-auto p-12 py-20 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter">¿Listo para el siguiente nivel?</h2>
            <p className="text-white/50 text-xl mb-10 max-w-xl mx-auto font-medium">
              Únete a las marcas líderes que ya están optimizando su rentabilidad con Metria Metrics.
            </p>
            <Link href="/login">
              <button className="px-10 py-5 bg-primary text-black font-black text-lg rounded-full hover:scale-105 transition-transform shadow-2xl shadow-primary/20 uppercase tracking-widest">
                Prueba Gratuita 7 Días
              </button>
            </Link>
          </div>
        </section>

        <footer className="py-12 border-t border-white/5 text-center text-white/20 text-sm font-mono uppercase tracking-[0.3em]">
          &copy; 2026 Metria Metrics. Crafted with Precision.
        </footer>
      </SmoothScroll>
    </main>
  )
}
