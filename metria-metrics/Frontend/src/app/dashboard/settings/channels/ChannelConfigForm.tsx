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
            toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} configuration saved`)
            if (onSaveSuccess) onSaveSuccess()
        } catch (error: any) {
            toast.error(error.message || 'Failed to save configuration')
        } finally {
            setLoading(false)
        }
    }

    const renderFields = () => {
        switch (platform) {
            case 'whatsapp':
                return (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="phoneNumber">Phone Number</Label>
                            <Input
                                id="phoneNumber"
                                name="phoneNumber"
                                value={config.phoneNumber || ''}
                                onChange={handleInputChange}
                                placeholder="e.g. +1234567890"
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
                                placeholder="Enter Meta App Secret"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Enter Webhook Verify Token"
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
                                placeholder="Enter Meta Access Token"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pageId">Page ID</Label>
                            <Input
                                id="pageId"
                                name="pageId"
                                value={config.pageId || ''}
                                onChange={handleInputChange}
                                placeholder="Enter Instagram Page ID"
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
                                placeholder="Enter Meta App Secret"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Enter Webhook Verify Token"
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
                                placeholder="Enter Telegram Bot Token"
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
                                placeholder="Enter Page Access Token"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="pageId">Page ID</Label>
                            <Input
                                id="pageId"
                                name="pageId"
                                value={config.pageId || ''}
                                onChange={handleInputChange}
                                placeholder="Enter Messenger Page ID"
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
                                placeholder="Enter Meta App Secret"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="verifyToken">Verify Token</Label>
                            <Input
                                id="verifyToken"
                                name="verifyToken"
                                value={config.verifyToken || ''}
                                onChange={handleInputChange}
                                placeholder="Enter Webhook Verify Token"
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
                {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
        </form>
    )
}
