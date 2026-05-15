"use client"

import React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { 
  Zap, 
  Trash2, 
  TrendingUp, 
  Fingerprint, 
  Layers, 
  AlertTriangle, 
  CheckCircle2,
  Info
} from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/formatting"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Search, Package, Plus, X, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"

interface AndromedaAd {
  id: string
  name: string
  entityId: string
  hookRate: number
  cpmr: number
  similarity: number
  roas: number
  frequency: number
  spend: number
  status: 'active' | 'paused'
}

import { useQuery } from "@tanstack/react-query"
import { fetchAPI } from "@/lib/api"
import { useDateRangeStore } from "@/store/useDateRangeStore"
import { format } from "date-fns"
import { Skeleton } from "@/components/ui/skeleton"

interface AndromedaAd {
  id: string
  name: string
  entityId: string
  hookRate: number
  cpmr: number
  similarity: number
  roas: number
  frequency: number
  spend: number
  status: 'active' | 'paused'
}

export function AndromedaOptimization() {
  const { date } = useDateRangeStore()
  const queryClient = useQueryClient()
  const [mappingAd, setMappingAd] = React.useState<AndromedaAd | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  
  const from = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
  const to = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
  const rangeParams = from && to ? `from=${from}&to=${to}` : ''

  const { data: ads = [], isLoading } = useQuery<AndromedaAd[]>({
    queryKey: ['meta', 'andromeda', { from, to }],
    queryFn: () => fetchAPI(`/meta/andromeda?${rangeParams}`).then(r => Array.isArray(r) ? r : [])
  })
  
  const getRecommendation = (ad: AndromedaAd) => {
    if (ad.similarity > 60) return { label: "PAUSAR", color: "bg-red-500/20 text-red-500 border-red-500/50", reason: "Redundancia Semántica (Similitud > 60%)" }
    // Hook Rate threshold for Scaling in Guide is generally >3% or similar
    if (ad.hookRate > 3.0 && ad.cpmr < 20) return { label: "ESCALAR", color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]", reason: "Alta Retención y Bajo Costo" }
    if (ad.frequency > 4.5) return { label: "PAUSAR", color: "bg-amber-500/20 text-amber-500 border-amber-500/50", reason: "Fatiga de Audiencia (Frecuencia Alta)" }
    return { label: "MANTENER", color: "bg-blue-500/20 text-blue-500 border-blue-500/50", reason: "Rendimiento Estable" }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    )
  }

  const diversityIndex = ads.length > 0 ? Math.min(100, (ads.filter(a => a.similarity < 40).length / ads.length) * 100) : 0
  const oxygenLevel = 100 - (ads.reduce((acc, a) => acc + a.similarity, 0) / (ads.length || 1))

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Bento Header */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/30 backdrop-blur-xl border-border/50 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Índice de Diversidad
              <Layers className="h-4 w-4 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{diversityIndex.toFixed(2)}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Salud del catálogo creativo global.</p>
            <Progress value={diversityIndex} className="h-1 mt-3 bg-blue-500/10" />
          </CardContent>
        </Card>

        <Card className="bg-card/30 backdrop-blur-xl border-border/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Oxígeno Creativo
              <Zap className="h-4 w-4 text-purple-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{oxygenLevel.toFixed(2)}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Espacio para nuevos clústeres semánticos.</p>
            <Progress value={oxygenLevel} className="h-1 mt-3 bg-purple-500/10" />
          </CardContent>
        </Card>

        <Card className="bg-card/30 backdrop-blur-xl border-border/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Escalamiento Activo
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {ads.filter(a => getRecommendation(a).label === 'ESCALAR').length} / {ads.length}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Activos listos para incremento de presupuesto.</p>
            <div className="flex gap-1 mt-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i <= 2 ? 'bg-emerald-500' : 'bg-emerald-500/10'}`} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analysis Table */}
      <Card className="bg-card/20 backdrop-blur-2xl border-border/40 shadow-2xl">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                Analizador de Señales Andromeda
              </CardTitle>
              <CardDescription className="text-xs">
                Protocolo de optimización basado en Recuperación (Retrieval-first Intelligence).
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit bg-primary/5 border-primary/20 text-[10px] uppercase tracking-widest font-bold">
              Lattice v2.6.8 Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="py-4 pl-6">Activo Creativo (Entity ID)</TableHead>
                <TableHead className="text-center">Hook Rate (1.5s)</TableHead>
                <TableHead className="text-center">CPMr</TableHead>
                <TableHead className="text-center">Similitud</TableHead>
                <TableHead className="text-center">ROAS</TableHead>
                <TableHead className="text-right pr-6">Recomendación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad, idx) => {
                const rec = getRecommendation(ad)
                return (
                  <motion.tr 
                    key={ad.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group border-border/40 hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div 
                          onClick={() => setMappingAd(ad)}
                          className="h-10 w-10 rounded-lg bg-gradient-to-br from-muted to-muted/50 border border-border/50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/10 transition-all group/huella"
                        >
                          <Fingerprint className="h-5 w-5 text-muted-foreground/50 group-hover/huella:text-purple-400 transition-colors" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm group-hover:text-primary transition-colors">{ad.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <code className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded italic">
                              {ad.entityId}
                            </code>
                            {ad.similarity > 70 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-[10px]">Branch-Cutting detectado: Activo duplicado detectado por VEO.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={`font-mono font-bold ${ad.hookRate > 3 ? 'text-emerald-400' : ad.hookRate < 1.5 ? 'text-red-400' : ''}`}>
                        {ad.hookRate.toFixed(2)}%
                      </div>
                      <div className="w-16 h-1 bg-muted/30 rounded-full mx-auto mt-1 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${ad.hookRate > 3 ? 'bg-emerald-500' : ad.hookRate < 1.5 ? 'bg-red-500' : 'bg-blue-500'}`} 
                          style={{ width: `${Math.min(ad.hookRate * 10, 100)}%` }} 
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={`font-mono ${ad.cpmr > 22 ? 'text-red-400' : 'text-foreground/80'}`}>
                        {formatCurrency(ad.cpmr)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={`text-xs font-bold ${ad.similarity > 60 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {ad.similarity.toFixed(2)}%
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {ad.roas.toFixed(1)}x
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className={`${rec.color} font-black tracking-tighter cursor-help`}>
                              {rec.label}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="bg-card border-border/50 text-[10px] max-w-[200px]">
                            <p className="font-bold underline mb-1">Razón lógica:</p>
                            <p>{rec.reason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </motion.tr>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Protocols and Education */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Protocolo de Escalamiento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] space-y-2 text-emerald-100/70">
            <p>• Incrementos del <span className="text-emerald-400 font-bold">20-30% semanal</span> si el CAC es estable.</p>
            <p>• Prohibido editar anuncios con &gt;14 días de rodaje; escala el concepto en nuevas campañas.</p>
            <p>• Mantener Advantage+ Shopping (ASC) con mínimo <span className="text-emerald-400 font-bold">$75 USD/día</span> para salir del aprendizaje.</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Diagnóstico de Pausa (Branch-Cutting)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] space-y-2 text-amber-100/70">
            <p>• <span className="text-amber-400 font-bold">Similarity &gt; 60%:</span> El sistema suprime la recuperación del anuncio por redundancia.</p>
            <p>• <span className="text-amber-400 font-bold">CPMr Spike:</span> Alerta temprana de fatiga. Rote el gancho creativo inmediatamente.</p>
            <p>• <span className="text-amber-400 font-bold">LPV Drop:</span> Problema de landing o mismatch entre oferta y clúster semántico.</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-center pt-2">
        <Info className="h-3 w-3" />
        Sincronizado con Nodo Lattice 7-Chile • Actualizado hace 4 min
      </div>

      {/* Mapping Modal */}
      <ProductMappingModal 
        ad={mappingAd} 
        onClose={() => setMappingAd(null)} 
      />
    </div>
  )
}

function ProductMappingModal({ ad, onClose }: { ad: AndromedaAd | null, onClose: () => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState("")
  
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['meta', 'products'],
    queryFn: () => fetchAPI('/meta/products'),
    enabled: !!ad
  })

  const { data: selectedSkus = [], isLoading: loadingMappings } = useQuery<string[]>({
    queryKey: ['meta', 'ad-mappings', ad?.id],
    queryFn: () => fetchAPI(`/meta/ad-mappings/${ad?.id}`),
    enabled: !!ad
  })

  const mapMutation = useMutation({
    mutationFn: (skus: string[]) => fetchAPI('/meta/ad-mappings', {
      method: 'POST',
      body: JSON.stringify({ adId: ad?.id, skus })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta', 'ad-mappings', ad?.id] })
      queryClient.invalidateQueries({ queryKey: ['meta', 'andromeda'] })
      toast.success("Vinculación actualizada")
    }
  })

  const toggleSku = (sku: string) => {
    const isSelected = selectedSkus.includes(sku)
    const nextSkus = isSelected 
      ? selectedSkus.filter(s => s !== sku)
      : [...selectedSkus, sku]
    mapMutation.mutate(nextSkus)
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10)

  return (
    <Dialog open={!!ad} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-card/90 backdrop-blur-2xl border-border/50 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-purple-400" />
            Vincular Activo Creativo
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Selecciona los productos que empuja este anuncio para calcular un ROAS determinístico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar producto o SKU..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted/30 border-border/50"
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredProducts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs italic">
                No se encontraron productos...
              </div>
            )}
            
            {filteredProducts.map(product => {
              const isActive = selectedSkus.includes(product.sku)
              return (
                <div 
                  key={product.sku}
                  onClick={() => toggleSku(product.sku)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                    isActive 
                      ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20' 
                      : 'bg-muted/20 border-border/50 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${
                      isActive ? 'bg-purple-500/20 border-purple-500/40 text-purple-400' : 'bg-muted border-border/50 text-muted-foreground'
                    }`}>
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold truncate max-w-[180px]">{product.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{product.sku}</div>
                    </div>
                  </div>
                  
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                    isActive ? 'bg-purple-500 text-white scale-110' : 'bg-muted/50 text-muted-foreground group-hover:bg-purple-500/20'
                  }`}>
                    {isActive ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <div className="text-[10px] text-muted-foreground">
            {selectedSkus.length} productos vinculados a este activo.
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
