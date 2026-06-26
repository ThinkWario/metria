"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, AlertCircle, ArrowRight, ExternalLink, Smartphone } from "lucide-react"
import { BASE_BACKEND_URL, API_BASE_URL } from "@/lib/constants"
import { toast } from "sonner"
import { WhatsAppQRDialog } from "../messaging/WhatsAppQRDialog"

interface PlatformCardProps {
    platform: string
    name: string
    description: string
    icon: React.ReactNode
    status: string
    type: string
    lastSync: string | null
    onConnect: (platform: string) => void
    colorClass: string
}

const PlatformCard = ({ platform, name, description, icon, status, type, lastSync, onConnect, colorClass }: PlatformCardProps) => {
    const isConnected = status === "Connected"

    return (
        <Card className="group bg-card/30 backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-primary/5">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div className={`p-2.5 rounded-xl ${colorClass} bg-opacity-10 text-opacity-100 mb-2 transition-transform group-hover:scale-110 duration-300`}>
                        {icon}
                    </div>
                    <Badge variant={isConnected ? "default" : "outline"} className={isConnected ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" : "bg-muted/50 text-muted-foreground"}>
                        {isConnected ? "Sincronizado" : "Desconectado"}
                    </Badge>
                </div>
                <CardTitle className="text-lg font-bold tracking-tight">{name}</CardTitle>
                <CardDescription className="text-xs line-clamp-1">{description}</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
                        <span>Método</span>
                        <span className="text-foreground/80">{type}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
                        <span>Última Sinc.</span>
                        <span className="text-foreground/80">{lastSync ? new Date(lastSync).toLocaleDateString() : 'Nunca'}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button 
                    variant={isConnected ? "outline" : "default"} 
                    className={`w-full group/btn relative overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] ${!isConnected ? "shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_35px_rgba(16,185,129,0.4)]" : ""}`}
                    onClick={() => onConnect(platform)}
                >
                    <span className="relative z-10 flex items-center gap-2">
                        {isConnected ? "Reconfigurar" : "Conectar Ahora"}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-1" />
                    </span>
                </Button>
            </CardFooter>
        </Card>
    )
}

export function IntegrationHub({ integrations, token }: { integrations: any[], token: string }) {
    const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false)
    const [whatsappQRDialogOpen, setWhatsappQRDialogOpen] = useState(false)
    const [shopifyDomain, setShopifyDomain] = useState("")

    const handleConnect = async (platform: string) => {
        if (platform === "shopify") {
            setShopifyDialogOpen(true)
            return
        }

        if (platform === "whatsapp-native") {
            setWhatsappQRDialogOpen(true)
            // Trigger backend initialization
            try {
                await fetch(`${API_BASE_URL}/messaging/whatsapp/init`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            } catch (err) {
                console.error("Failed to init WhatsApp", err)
            }
            return
        }

        const oauthUrl = `${BASE_BACKEND_URL}/api/oauth/${platform}?token=${token}`
        window.location.href = oauthUrl
    }

    const startShopifyAuth = () => {
        if (!shopifyDomain) {
            toast.error("Ingresa el dominio de tu tienda")
            return
        }
        const cleanDomain = shopifyDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
        const oauthUrl = `${BASE_BACKEND_URL}/api/oauth/shopify?shop=${cleanDomain}&token=${token}`
        window.location.href = oauthUrl
    }

    const platforms = [
        { 
            id: "whatsapp", 
            platform: "whatsapp-native", 
            name: "WhatsApp Native", 
            description: "Conexión directa vía código QR", 
            icon: <Smartphone className="h-5 w-5" />, 
            colorClass: "bg-emerald-500 text-emerald-500",
            type: "QR Scan"
        },
        {
            id: "google", 
            platform: "google", 
            name: "Google Ads", 
            description: "Search & Display Performance", 
            icon: <ExternalLink className="h-5 w-5" />, 
            colorClass: "bg-red-500 text-red-500",
            type: "OAuth 2.0"
        },
        { 
            id: "shopify", 
            platform: "shopify", 
            name: "Shopify Store", 
            description: "E-commerce Orders & Products", 
            icon: <ArrowRight className="h-5 w-5" />, 
            colorClass: "bg-emerald-500 text-emerald-500",
            type: "Direct Install"
        }
    ]

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {platforms.map((p) => {
                    const dbData = integrations.find(i => i.platform === p.platform || (p.platform === 'whatsapp-native' && i.platform === 'whatsapp')) || {}
                    return (
                        <PlatformCard 
                            key={p.id}
                            {...p}
                            status={dbData.status || "Disconnected"}
                            lastSync={dbData.lastSync}
                            onConnect={handleConnect}
                        />
                    )
                })}
            </div>

            <WhatsAppQRDialog open={whatsappQRDialogOpen} onOpenChange={setWhatsappQRDialogOpen} />

            <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
                <DialogContent className="sm:max-w-[400px] bg-card/90 backdrop-blur-2xl border-primary/20">
                    <DialogHeader>
                        <DialogTitle>Instalar App en Shopify</DialogTitle>
                        <DialogDescription>
                            Ingresa el dominio de tu tienda para iniciar la instalación segura.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="shop-domain">Dominio de la Tienda</Label>
                            <Input 
                                id="shop-domain" 
                                placeholder="tu-tienda.myshopify.com" 
                                value={shopifyDomain}
                                onChange={(e) => setShopifyDomain(e.target.value)}
                                className="bg-background/50"
                            />
                        </div>
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Serás redirigido al panel de administración de tu Shopify para aprobar los permisos de lectura de órdenes y productos.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShopifyDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={startShopifyAuth}>Continuar a Shopify</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
