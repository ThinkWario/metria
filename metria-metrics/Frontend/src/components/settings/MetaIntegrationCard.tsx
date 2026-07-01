"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, ChevronDown, ChevronUp, Unplug } from "lucide-react"
import { toast } from "sonner"
import { fetchAPI, updateIntegration } from "@/lib/api"
import { useQueryClient } from "@tanstack/react-query"
import { BASE_BACKEND_URL } from "@/lib/constants"

const FacebookIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
)

type MetaIntegration = {
    status?: string
    config?: {
        accessToken?: string
        adAccountId?: string
        adAccountsList?: string
        pixelId?: string
    }
    lastSync?: string | null
}

type Props = {
    integration: MetaIntegration | null
    token: string
    needsAdAccount?: boolean
}

export function MetaIntegrationCard({ integration, token, needsAdAccount: initialNeedsAdAccount }: Props) {
    const queryClient = useQueryClient()
    const isConnected = integration?.status === 'Connected'
    const hasAdAccount = !!integration?.config?.adAccountId

    const [showManual, setShowManual] = useState(false)
    const [showAdAccountPrompt, setShowAdAccountPrompt] = useState(initialNeedsAdAccount ?? false)
    const [adAccountId, setAdAccountId] = useState(integration?.config?.adAccountId ?? '')
    const [accessToken, setAccessToken] = useState('')
    const [manualAdAccountId, setManualAdAccountId] = useState('')
    const [savingAdAccount, setSavingAdAccount] = useState(false)
    const [savingManual, setSavingManual] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)
    const [pixelId, setPixelId] = useState(integration?.config?.pixelId ?? '')
    const [savingPixel, setSavingPixel] = useState(false)

    const handleDisconnect = async () => {
        if (!confirm('¿Desconectar Meta? Esto eliminará la integración y los canales de Instagram y Messenger.')) return
        setDisconnecting(true)
        try {
            await fetchAPI('/settings/integrations/meta', { method: 'DELETE' })
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
            toast.success('Meta desconectado correctamente')
        } catch (err: any) {
            toast.error(err.message ?? 'Error al desconectar')
        } finally {
            setDisconnecting(false)
        }
    }

    const adAccountsList: Array<{ id: string; name: string }> = (() => {
        try { return JSON.parse(integration?.config?.adAccountsList ?? '[]') }
        catch { return [] }
    })()

    const handleOAuth = () => {
        window.location.href = `${BASE_BACKEND_URL}/api/oauth/meta?token=${token}`
    }

    const handleSaveAdAccount = async () => {
        if (!adAccountId.trim()) {
            toast.error('Selecciona o ingresa el ID de la cuenta publicitaria')
            return
        }
        setSavingAdAccount(true)
        try {
            await updateIntegration({
                platform: 'meta',
                name: 'Meta Ads',
                type: 'REST API',
                config: { ...integration?.config, adAccountId: adAccountId.trim() }
            })
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
            toast.success('Cuenta publicitaria guardada')
            setShowAdAccountPrompt(false)
            fetchAPI('/meta/sync', { method: 'POST' }).catch(() => null)
        } catch (err: any) {
            toast.error(err.message ?? 'Error guardando la cuenta')
        } finally {
            setSavingAdAccount(false)
        }
    }

    const handleSaveManual = async () => {
        if (!accessToken.trim() || !manualAdAccountId.trim()) {
            toast.error('Completa el Access Token y el Ad Account ID')
            return
        }
        setSavingManual(true)
        try {
            await updateIntegration({
                platform: 'meta',
                name: 'Meta Ads',
                type: 'REST API',
                config: { accessToken: accessToken.trim(), adAccountId: manualAdAccountId.trim() }
            })
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
            toast.success('Integración Meta guardada')
            setShowManual(false)
            fetchAPI('/meta/sync', { method: 'POST' }).catch(() => null)
        } catch (err: any) {
            toast.error(err.message ?? 'Error guardando la configuración')
        } finally {
            setSavingManual(false)
        }
    }

    const handleSavePixel = async () => {
        setSavingPixel(true)
        try {
            await updateIntegration({
                platform: 'meta',
                name: 'Meta Ads',
                type: 'REST API',
                config: { ...integration?.config, pixelId: pixelId.trim() }
            })
            queryClient.invalidateQueries({ queryKey: ['settings', 'integrations'] })
            toast.success('Pixel de Meta guardado')
        } catch (err: any) {
            toast.error(err.message ?? 'Error guardando el Pixel')
        } finally {
            setSavingPixel(false)
        }
    }

    const connectionBadge = isConnected && hasAdAccount
        ? { label: 'Conectado', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
        : isConnected
            ? { label: 'Incompleto', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
            : { label: 'Desconectado', className: '' }

    return (
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2.5 text-base">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <FacebookIcon />
                        </div>
                        Meta — Facebook, Instagram &amp; Ads
                    </CardTitle>
                    <Badge variant="outline" className={connectionBadge.className}>
                        {connectionBadge.label}
                    </Badge>
                </div>
                <CardDescription>
                    Un solo login de Facebook conecta Meta Ads, Instagram y Messenger.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

                {/* Primary OAuth action */}
                {!isConnected ? (
                    <Button onClick={handleOAuth} className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white">
                        <FacebookIcon />
                        <span className="ml-2">Conectar con Facebook</span>
                    </Button>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Cuenta Facebook conectada
                        </div>
                        {integration?.lastSync && (
                            <span className="text-xs text-muted-foreground">
                                Sinc. {new Date(integration.lastSync).toLocaleDateString('es')}
                            </span>
                        )}
                    </div>
                )}

                {/* Ad account selection step */}
                {isConnected && (showAdAccountPrompt || !hasAdAccount) && (
                    <div className="space-y-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-xs font-medium text-amber-600">
                            {adAccountsList.length > 0
                                ? 'Selecciona tu cuenta publicitaria para activar la sincronización:'
                                : 'Ingresa el ID de tu cuenta publicitaria de Meta Ads:'}
                        </p>
                        {adAccountsList.length > 0 ? (
                            <div className="space-y-1.5">
                                {adAccountsList.map(acc => (
                                    <button
                                        key={acc.id}
                                        type="button"
                                        onClick={() => setAdAccountId(acc.id)}
                                        className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${adAccountId === acc.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:border-primary/50 text-muted-foreground'}`}
                                    >
                                        <span className="font-medium text-foreground">{acc.name}</span>
                                        <span className="ml-2 font-mono text-xs">({acc.id})</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <Input
                                value={adAccountId}
                                onChange={e => setAdAccountId(e.target.value)}
                                placeholder="ej: 123456789"
                            />
                        )}
                        <Button size="sm" onClick={handleSaveAdAccount} disabled={savingAdAccount} className="w-full">
                            {savingAdAccount ? 'Guardando...' : 'Confirmar cuenta publicitaria'}
                        </Button>
                    </div>
                )}

                {/* Connected summary */}
                {isConnected && hasAdAccount && !showAdAccountPrompt && (
                    <div className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                        <span className="text-muted-foreground">Ad Account ID</span>
                        <span className="font-mono font-medium">{integration?.config?.adAccountId}</span>
                    </div>
                )}

                {isConnected && (
                    <div className="space-y-1.5 pt-2 border-t border-border/50">
                        <Label htmlFor="meta-pixel-id" className="text-xs">Pixel ID (Conversions API)</Label>
                        <div className="flex gap-2">
                            <Input
                                id="meta-pixel-id"
                                value={pixelId}
                                onChange={e => setPixelId(e.target.value)}
                                placeholder="ej: 123456789012345"
                            />
                            <Button size="sm" onClick={handleSavePixel} disabled={savingPixel}>
                                {savingPixel ? 'Guardando...' : 'Guardar Pixel'}
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            El Pixel ID de Meta Ads. Una vez guardado, cada orden de Shopify enviará un evento de Compra automáticamente a Meta.
                        </p>
                    </div>
                )}

                {/* Manual config toggle */}
                <button
                    type="button"
                    onClick={() => setShowManual(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    {showManual ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {isConnected ? 'Reconfigurar manualmente' : 'Configuración manual (sin OAuth)'}
                </button>

                {showManual && (
                    <div className="space-y-3 pt-2 border-t border-border/50">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Access Token de larga duración</Label>
                            <Input
                                type="password"
                                value={accessToken}
                                onChange={e => setAccessToken(e.target.value)}
                                placeholder="EAAxxxxxx..."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Ad Account ID</Label>
                            <Input
                                value={manualAdAccountId}
                                onChange={e => setManualAdAccountId(e.target.value)}
                                placeholder="ej: 123456789 (sin prefijo act_)"
                            />
                        </div>
                        <Button size="sm" onClick={handleSaveManual} disabled={savingManual} className="w-full">
                            {savingManual ? 'Guardando...' : 'Guardar configuración manual'}
                        </Button>
                    </div>
                )}

                {/* Reconnect + Disconnect when already connected */}
                {isConnected && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleOAuth} className="flex-1 text-xs">
                            <FacebookIcon />
                            <span className="ml-1.5">Reconectar</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="flex-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                            <Unplug className="h-3.5 w-3.5 mr-1.5" />
                            {disconnecting ? 'Desconectando...' : 'Desconectar'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
