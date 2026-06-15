'use client'

import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { ChannelCard } from './ChannelCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface ChannelStatus {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger'
    status: 'connected' | 'disconnected'
    config?: any
}

export const ChannelsClient = () => {
    const [channels, setChannels] = useState<ChannelStatus[]>([])
    const [composioStatus, setComposioStatus] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)
    const searchParams = useSearchParams()

    const PLATFORMS: ChannelStatus['platform'][] = ['whatsapp', 'instagram', 'telegram', 'messenger']

    const TOOLKIT_NAMES: Record<string, string> = {
        INSTAGRAM: 'Instagram',
        METAADS: 'Meta Ads',
        FACEBOOK: 'Facebook',
        MESSENGER: 'Messenger'
    }

    const fetchAll = async () => {
        setLoading(true)
        setError(null)
        try {
            const [data, composio] = await Promise.all([
                fetchAPI('/messaging/channels') as Promise<Array<{ platform: string; status: string; config?: any }>>,
                fetchAPI('/composio/status').catch(() => ({}))
            ])
            const channelMap = new Map(data.map(ch => [ch.platform.toLowerCase(), ch]))
            setChannels(
                PLATFORMS.map(p => ({
                    platform: p,
                    status: (channelMap.get(p)?.status ?? '').toLowerCase() === 'connected'
                        ? 'connected'
                        : 'disconnected',
                    config: channelMap.get(p)?.config,
                }))
            )
            setComposioStatus(composio ?? {})
        } catch (err: any) {
            setError(err.message || 'No se pudo cargar el estado de los canales')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        if (!mounted) return
        fetchAll()

        // Handle Composio OAuth callback results
        const success = searchParams.get('composio_success')
        const errMsg = searchParams.get('composio_error')
        if (success) {
            toast.success(`${TOOLKIT_NAMES[success] ?? success} conectado correctamente.`)
            window.history.replaceState({}, '', '/dashboard/settings/channels')
        } else if (errMsg) {
            toast.error(`Error al conectar: ${errMsg}`)
            window.history.replaceState({}, '', '/dashboard/settings/channels')
        }
    }, [mounted])

    if (!mounted) return null

    if (loading && channels.length === 0) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-64 w-full rounded-xl" />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <Alert variant="destructive" className="max-w-2xl mx-auto">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                    {error}
                    <Button variant="outline" className="ml-4 mt-2 h-8 px-3 text-xs" onClick={fetchAll}>
                        Reintentar
                    </Button>
                </AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {channels.map((channel) => (
                <ChannelCard
                    key={channel.platform}
                    platform={channel.platform}
                    status={channel.status}
                    config={channel.config}
                    composioStatus={composioStatus}
                    onRefresh={fetchAll}
                />
            ))}
        </div>
    )
}
