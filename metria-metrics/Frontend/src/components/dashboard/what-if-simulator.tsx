"use client"

import { useState, useMemo } from "react"
import { 
    Sheet, 
    SheetContent, 
    SheetDescription, 
    SheetHeader, 
    SheetTitle, 
    SheetTrigger 
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Calculator, TrendingUp, TrendingDown, Info } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/formatting"
import { cn } from "@/lib/utils"

interface WhatIfSimulatorProps {
    baseRevenue: number
    baseCogs: number
    baseAdSpend: number
    baseShipping: number
    baseFixedCosts: number
}

export function WhatIfSimulator({ 
    baseRevenue, 
    baseCogs, 
    baseAdSpend, 
    baseShipping, 
    baseFixedCosts 
}: WhatIfSimulatorProps) {
    const [cogsPercentChange, setCogsPercentChange] = useState(0)
    const [pricePercentChange, setPricePercentChange] = useState(0)
    const [adSpendPercentChange, setAdSpendPercentChange] = useState(0)

    const simulation = useMemo(() => {
        const newRevenue = baseRevenue * (1 + pricePercentChange / 100)
        const newCogs = baseCogs * (1 + cogsPercentChange / 100)
        const newAdSpend = baseAdSpend * (1 + adSpendPercentChange / 100)
        
        const baseNetProfit = baseRevenue - baseCogs - baseAdSpend - baseShipping - baseFixedCosts
        const newNetProfit = newRevenue - newCogs - newAdSpend - baseShipping - baseFixedCosts
        
        const baseMargin = baseRevenue > 0 ? (baseNetProfit / baseRevenue) : 0
        const newMargin = newRevenue > 0 ? (newNetProfit / newRevenue) : 0
        
        const profitChange = newNetProfit - baseNetProfit
        const profitPercentChange = baseNetProfit !== 0 ? (profitChange / Math.abs(baseNetProfit)) * 100 : 0

        return {
            newRevenue,
            newNetProfit,
            newMargin,
            profitChange,
            profitPercentChange
        }
    }, [baseRevenue, baseCogs, baseAdSpend, baseShipping, baseFixedCosts, cogsPercentChange, pricePercentChange, adSpendPercentChange])

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all group">
                    <Calculator className="w-4 h-4 text-primary group-hover:rotate-12 transition-transform" />
                    <span>Simulador What-If</span>
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md bg-card/95 backdrop-blur-2xl border-l border-border/50 shadow-2xl overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-primary" />
                        Simulador de Escenarios
                    </SheetTitle>
                    <SheetDescription>
                        Ajusta las variables y observa el impacto proyectado en tu utilidad neta en tiempo real.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-8">
                    {/* --- Inputs Section --- */}
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm font-medium">Cambio en Precios (Revenue)</Label>
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded",
                                    pricePercentChange > 0 ? "bg-emerald-500/10 text-emerald-500" : 
                                    pricePercentChange < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                                )}>
                                    {pricePercentChange > 0 ? "+" : ""}{pricePercentChange}%
                                </span>
                            </div>
                            <Slider 
                                value={[pricePercentChange]} 
                                min={-30} 
                                max={50} 
                                step={1} 
                                onValueChange={(v: number[]) => setPricePercentChange(v[0])}
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm font-medium">Cambio en COGS (Costo Producto)</Label>
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded",
                                    cogsPercentChange > 0 ? "bg-destructive/10 text-destructive" : 
                                    cogsPercentChange < 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                                )}>
                                    {cogsPercentChange > 0 ? "+" : ""}{cogsPercentChange}%
                                </span>
                            </div>
                            <Slider 
                                value={[cogsPercentChange]} 
                                min={-50} 
                                max={100} 
                                step={5} 
                                onValueChange={(v: number[]) => setCogsPercentChange(v[0])}
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm font-medium">Cambio en Inversión (Ad Spend)</Label>
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded",
                                    adSpendPercentChange > 0 ? "bg-destructive/10 text-destructive" : 
                                    adSpendPercentChange < 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                                )}>
                                    {adSpendPercentChange > 0 ? "+" : ""}{adSpendPercentChange}%
                                </span>
                            </div>
                            <Slider 
                                value={[adSpendPercentChange]} 
                                min={-50} 
                                max={200} 
                                step={10} 
                                onValueChange={(v: number[]) => setAdSpendPercentChange(v[0])}
                            />
                        </div>
                    </div>

                    {/* --- Results Section --- */}
                    <div className="space-y-4 bg-primary/5 rounded-2xl p-6 border border-primary/10 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-primary/20 transition-all duration-700" />
                        
                        <div className="space-y-1 relative">
                            <p className="text-xs uppercase font-black tracking-widest text-muted-foreground/70">Utilidad Neta Proyectada</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
                                    {formatCurrency(simulation.newNetProfit)}
                                </span>
                                {simulation.profitChange !== 0 && (
                                    <span className={cn(
                                        "text-sm font-bold flex items-center gap-0.5",
                                        simulation.profitChange > 0 ? "text-emerald-500" : "text-destructive"
                                    )}>
                                        {simulation.profitChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        {formatPercent(Math.abs(simulation.profitPercentChange) / 100)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-primary/10 relative">
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Nuevo Revenue</p>
                                <p className="text-lg font-bold">{formatCurrency(simulation.newRevenue)}</p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Margen Neto</p>
                                <p className={cn(
                                    "text-lg font-bold",
                                    simulation.newMargin > 0.3 ? "text-emerald-500" : simulation.newMargin > 0.15 ? "text-amber-500" : "text-destructive"
                                )}>
                                    {formatPercent(simulation.newMargin)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-border/50 bg-muted/30 flex gap-3">
                        <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Esta es una simulación lineal estática. No asume cambios en el volumen de ventas debidos a las fluctuaciones de precio o inversión.
                        </p>
                    </div>

                    <Button className="w-full h-12 rounded-xl text-md font-bold" onClick={() => {
                        setCogsPercentChange(0)
                        setPricePercentChange(0)
                        setAdSpendPercentChange(0)
                    }}>
                        Resetear Valores
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
