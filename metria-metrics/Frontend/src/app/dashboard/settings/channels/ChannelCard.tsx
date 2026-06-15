import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Settings2, QrCode, Unplug, TrendingUp } from 'lucide-react'
import { ChannelConfigForm } from './ChannelConfigForm'
import { WhatsAppQRDialog } from '@/components/messaging/WhatsAppQRDialog'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'

const COMPOSIO_TOOLKITS: Partial<Record<string, string>> = {
    instagram: 'INSTAGRAM',
    messenger: 'MESSENGER',
    metaads: 'METAADS',
}

interface ChannelCardProps {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'metaads'
    status: 'connected' | 'disconnected'
    config?: any
    composioStatus?: Record<string, { connectedAccountId: string; connectedAt: string }>
    onRefresh: () => void
}

export const ChannelCard = ({ platform, status, config, composioStatus, onRefresh }: ChannelCardProps) => {
    const [isConfigOpen, setIsConfigOpen] = useState(false)
    const [qrDialogOpen, setQrDialogOpen] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)

    const composioToolkit = COMPOSIO_TOOLKITS[platform]
    const composioEntry = composioToolkit ? composioStatus?.[composioToolkit] : undefined
    const composioConnected = !!composioEntry

    const handleComposioConnect = async () => {
        if (!composioToolkit) return
        try {
            const { redirectUrl } = await fetchAPI('/composio/connect', {
                method: 'POST',
                body: JSON.stringify({ toolkit: composioToolkit })
            })
            if (!redirectUrl) throw new Error('No se recibió URL de redirección')
            window.location.href = redirectUrl
        } catch (err: any) {
            console.error('[Composio] connect error:', err.message)
            toast.error(`Error al conectar: ${err.message ?? 'Intenta de nuevo'}`)
        }
    }

    const handleComposioDisconnect = async () => {
        if (!composioToolkit) return
        setDisconnecting(true)
        try {
            await fetchAPI(`/composio/disconnect?toolkit=${composioToolkit}`, { method: 'DELETE' })
            onRefresh()
        } finally {
            setDisconnecting(false)
        }
    }

    const platformNames = {
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
        telegram: 'Telegram',
        messenger: 'Messenger',
        metaads: 'Meta Ads'
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
                {isConfigOpen && platform !== 'metaads' ? (
                    <div className="py-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <ChannelConfigForm
                            platform={platform as 'whatsapp' | 'instagram' | 'telegram' | 'messenger'}
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
                                : platform === 'metaads'
                                    ? <TrendingUp className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                                    : <Settings2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            {status === 'connected'
                                ? platform === 'metaads'
                                    ? 'Cuenta Meta Ads conectada. Metria puede leer tus campañas y métricas.'
                                    : 'Canal activo y recibiendo mensajes.'
                                : platform === 'whatsapp'
                                    ? 'Escanea un código QR con tu teléfono para conectar tu WhatsApp en segundos.'
                                    : platform === 'metaads'
                                        ? 'Conecta tu cuenta de Meta Ads para sincronizar campañas, ROAS y costos automáticamente.'
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
                        ) : composioToolkit ? (
                            <div className="flex flex-col gap-2 w-full max-w-[240px]">
                                {composioConnected ? (
                                    <>
                                        <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Cuenta Meta conectada
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Conectado el {new Date(composioEntry!.connectedAt).toLocaleDateString('es')}
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                            onClick={handleComposioDisconnect}
                                            disabled={disconnecting}
                                        >
                                            <Unplug className="h-3.5 w-3.5 mr-1.5" />
                                            {disconnecting ? 'Desconectando...' : 'Desconectar'}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button size="sm" onClick={handleComposioConnect}>
                                            <Settings2 className="h-4 w-4 mr-2" />
                                            {platform === 'metaads' ? 'Conectar Meta Ads' : 'Conectar con Meta'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs text-muted-foreground"
                                            onClick={() => setIsConfigOpen(true)}
                                        >
                                            Configurar manualmente
                                        </Button>
                                    </>
                                )}
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
