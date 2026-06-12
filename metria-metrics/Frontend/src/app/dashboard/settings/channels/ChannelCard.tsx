import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Settings2, QrCode } from 'lucide-react'
import { ChannelConfigForm } from './ChannelConfigForm'
import { WhatsAppQRDialog } from '@/components/messaging/WhatsAppQRDialog'
import { fetchAPI } from '@/lib/api'

interface ChannelCardProps {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger'
    status: 'connected' | 'disconnected'
    config?: any
    onRefresh: () => void
}

export const ChannelCard = ({ platform, status, config, onRefresh }: ChannelCardProps) => {
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    const [qrDialogOpen, setQrDialogOpen] = useState(false)

    const platformNames = {
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
        telegram: 'Telegram',
        messenger: 'Messenger'
    }

    const handleConnectQR = async () => {
        setQrDialogOpen(true)
        try {
            await fetchAPI('/messaging/whatsapp/init', { method: 'POST' })
        } catch (err) {
            console.error('No se pudo iniciar la sesión de WhatsApp', err)
        }
    }

    const handleQrDialogChange = (open: boolean) => {
        setQrDialogOpen(open)
        if (!open) onRefresh()
    }

    return (
        <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-md group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold">{platformNames[platform]}</CardTitle>
                    <CardDescription>Canal de mensajería</CardDescription>
                </div>
                <Badge variant={status === 'connected' ? 'default' : 'destructive'} className="px-2 py-0.5">
                    {status === 'connected' ? (
                        <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Conectado
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Desconectado
                        </div>
                    )}
                </Badge>
            </CardHeader>
            <CardContent>
                {isConfigOpen ? (
                    <div className="py-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <ChannelConfigForm
                            platform={platform}
                            initialConfig={config}
                            onSaveSuccess={() => {
                                setIsConfigOpen(false)
                                onRefresh()
                            }}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <div className="mb-4 rounded-full bg-muted p-3 group-hover:bg-primary/10 transition-colors">
                            {platform === 'whatsapp'
                                ? <QrCode className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                                : <Settings2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            {status === 'connected'
                                ? 'Canal activo y recibiendo mensajes.'
                                : platform === 'whatsapp'
                                    ? 'Escanea un código QR con tu teléfono para conectar tu WhatsApp en segundos.'
                                    : 'Configura este canal para empezar a recibir mensajes.'}
                        </p>
                        {platform === 'whatsapp' ? (
                            <div className="flex flex-col gap-2 w-full max-w-[240px]">
                                <Button size="sm" onClick={handleConnectQR}>
                                    <QrCode className="h-4 w-4 mr-2" />
                                    Conectar con QR
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-muted-foreground"
                                    onClick={() => setIsConfigOpen(true)}
                                >
                                    Configuración avanzada (API Cloud)
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsConfigOpen(true)}
                            >
                                Configurar canal
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
            {isConfigOpen && (
                <CardFooter className="flex justify-end border-t bg-muted/50 py-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsConfigOpen(false)}
                    >
                        Cancelar
                    </Button>
                </CardFooter>
            )}
            {platform === 'whatsapp' && (
                <WhatsAppQRDialog open={qrDialogOpen} onOpenChange={handleQrDialogChange} />
            )}
        </Card>
    )
}
