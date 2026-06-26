"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getSocket } from "@/lib/socket"
import { Smartphone, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

interface WhatsAppQRDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function WhatsAppQRDialog({ open, onOpenChange }: WhatsAppQRDialogProps) {
    const [qr, setQr] = useState<string | null>(null)
    const [status, setStatus] = useState<"initializing" | "waiting" | "authenticated" | "ready" | "error">("initializing")
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!open) {
            setQr(null)
            setStatus("initializing")
            return
        }

        const socket = getSocket()
        if (!socket) return


        socket.on("whatsapp:qr", (data: { qr: string }) => {
            setQr(data.qr)
            setStatus("waiting")
        })

        socket.on("whatsapp:authenticated", () => {
            setStatus("authenticated")
            setQr(null)
        })

        socket.on("whatsapp:ready", () => {
            setStatus("ready")
            setTimeout(() => onOpenChange(false), 2000)
        })

        socket.on("whatsapp:error", (data: { message: string }) => {
            setStatus("error")
            setErrorMessage(data.message)
        })

        return () => {
            socket.off("whatsapp:qr")
            socket.off("whatsapp:authenticated")
            socket.off("whatsapp:ready")
            socket.off("whatsapp:error")
        }
    }, [open, onOpenChange])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px] bg-card/90 backdrop-blur-2xl border-primary/20 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                        <Smartphone className="h-6 w-6 text-emerald-500" />
                        Conectar WhatsApp
                    </DialogTitle>
                    <DialogDescription>
                        Escanea el código QR desde tu celular para vincular Metria con tu WhatsApp personal o Business.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-8 min-h-[300px]">
                    {status === "initializing" && (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
                            <Loader2 className="h-12 w-12 text-primary animate-spin" />
                            <p className="text-sm font-medium text-muted-foreground">Iniciando motor nativo...</p>
                        </div>
                    )}

                    {status === "waiting" && qr && (
                        <div className="relative group animate-in zoom-in-95 duration-300">
                            <div className="absolute -inset-4 bg-emerald-500/10 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition-opacity" />
                            <div className="relative bg-white p-4 rounded-2xl shadow-xl border-4 border-emerald-500/20">
                                <img src={qr} alt="WhatsApp QR Code" className="w-64 h-64" />
                            </div>
                            <p className="mt-6 text-center text-xs text-muted-foreground animate-pulse">
                                Abre WhatsApp {'>'} Dispositivos vinculados {'>'} Vincular dispositivo
                            </p>
                        </div>
                    )}

                    {(status === "authenticated" || status === "ready") && (
                        <div className="flex flex-col items-center gap-4 animate-in scale-in duration-500">
                            <div className="p-4 bg-emerald-500/20 rounded-full">
                                <CheckCircle2 className="h-16 w-12 text-emerald-500" />
                            </div>
                            <h3 className="text-lg font-bold text-emerald-500">¡Conexión Exitosa!</h3>
                            <p className="text-sm text-center text-muted-foreground">
                                Redirigiendo a la bandeja de entrada...
                            </p>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="flex flex-col items-center gap-4 text-center animate-in shake duration-500">
                            <AlertCircle className="h-12 w-12 text-destructive" />
                            <h3 className="font-bold text-destructive">Error de Conexión</h3>
                            <p className="text-xs text-muted-foreground max-w-[200px]">
                                {errorMessage || "No se pudo generar el código QR. Reintenta en unos momentos."}
                            </p>
                            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                                Reintentar
                            </Button>
                        </div>
                    )}
                </div>

                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 flex gap-3 items-start">
                    <AlertCircle className="h-4 w-4 text-emerald-500 mt-0.5" />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Este método utiliza una conexión cifrada punto a punto. Para mayor seguridad, evita enviar SPAM masivo.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
