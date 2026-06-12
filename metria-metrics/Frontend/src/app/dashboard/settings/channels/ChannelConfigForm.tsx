import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'

interface ChannelConfigFormProps {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger'
    initialConfig?: any
    onSaveSuccess?: () => void
}

export const ChannelConfigForm = ({ platform, initialConfig, onSaveSuccess }: ChannelConfigFormProps) => {
    const [config, setConfig] = useState<Record<string, any>>(initialConfig || {})
    const [loading, setLoading] = useState(false)

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setConfig(prev => ({ ...prev, [name]: value }))
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            await fetchAPI(`/messaging/channels/${platform}/config`, {
                method: 'POST',
                body: JSON.stringify(config),
            })
            toast.success(`Configuración de ${platform.charAt(0).toUpperCase() + platform.slice(1)} guardada`)
            if (onSaveSuccess) onSaveSuccess()
        } catch (error: any) {
            toast.error(error.message || 'No se pudo guardar la configuración')
        } finally {
            setLoading(false)
        }
    }

    const renderFields = () => {
        switch (platform) {
            case 'whatsapp':
                return (
                    <>
                        <p className="text-xs text-muted-foreground rounded-md bg-muted p-2">
                            Estos campos son solo para la API Cloud oficial de Meta. Si conectaste con código QR, no necesitas completarlos.
                        </p>
                        <div className="grid gap-2">
                            <Label htmlFor="phoneNumber">Número de teléfono</Label>
                            <Input
                                id="phoneNumber"
                                name="phoneNumber"
                                value={config.phoneNumber || ''}
                                onChange={handleInputChange}
                                placeholder="ej: +56912345678"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="appSecret">App Secret</Label>
                            <Input
                                id="appSecret"
                                name="appSecret"
                                type="password"
                                value={config.appSecret || ''}
                                onChange={handleInputChange}
                                placeholder="App Secret de Meta"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Token de verificación del webhook"
                            />
                        </div>
                    </>
                )
            case 'instagram':
                return (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="accessToken">Access Token</Label>
                            <Input
                                id="accessToken"
                                name="accessToken"
                                type="password"
                                value={config.accessToken || ''}
                                onChange={handleInputChange}
                                placeholder="Access Token de Meta"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pageId">Page ID</Label>
                            <Input
                                id="pageId"
                                name="pageId"
                                value={config.pageId || ''}
                                onChange={handleInputChange}
                                placeholder="ID de la página de Instagram"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="appSecret">App Secret</Label>
                            <Input
                                id="appSecret"
                                name="appSecret"
                                type="password"
                                value={config.appSecret || ''}
                                onChange={handleInputChange}
                                placeholder="App Secret de Meta"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Token de verificación del webhook"
                            />
                        </div>
                    </>
                )
            case 'telegram':
                return (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="botToken">Bot Token</Label>
                            <Input
                                id="botToken"
                                name="botToken"
                                type="password"
                                value={config.botToken || ''}
                                onChange={handleInputChange}
                                placeholder="Token del bot de Telegram"
                            />
                        </div>
                    </>
                )
            case 'messenger':
                return (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="pageAccessToken">Page Access Token</Label>
                            <Input
                                id="pageAccessToken"
                                name="pageAccessToken"
                                type="password"
                                value={config.pageAccessToken || ''}
                                onChange={handleInputChange}
                                placeholder="Page Access Token de Meta"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pageId">Page ID</Label>
                            <Input
                                id="pageId"
                                name="pageId"
                                value={config.pageId || ''}
                                onChange={handleInputChange}
                                placeholder="ID de la página de Messenger"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="appSecret">App Secret</Label>
                            <Input
                                id="appSecret"
                                name="appSecret"
                                type="password"
                                value={config.appSecret || ''}
                                onChange={handleInputChange}
                                placeholder="App Secret de Meta"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Token de verificación del webhook"
                            />
                        </div>
                    </>
                )
            default:
                return null
        }
    }

    return (
        <form onSubmit={handleSave} className="space-y-4">
            {renderFields()}
            <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Guardando...' : 'Guardar configuración'}
            </Button>
        </form>
    )
}
