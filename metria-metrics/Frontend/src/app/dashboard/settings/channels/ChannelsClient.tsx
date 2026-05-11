'use client'

import React, { useEffect, useState } from 'react'
import { fetchAPI } from '@/lib/api'
import { ChannelCard } from './ChannelCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface ChannelStatus {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger'
    status: 'connected' | 'disconnected'
    config?: any
}

export const ChannelsClient = () => {
    const [channels, setChannels] = useState<ChannelStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)

    const fetchChannels = async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchAPI('/api/messaging/channels')
            setChannels(data)
        } catch (err: any) {
            setError(err.message || 'Failed to load channel statuses')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (mounted) {
            fetchChannels()
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
                    <Button
                        variant="outline"
                        className="ml-4 mt-2 h-8 px-3 text-xs"
                        onClick={fetchChannels}
                    >
                        Retry
                    </Button>
                </AlertDescription>
            </Alert>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(channels.length > 0 ? channels : [
                { platform: 'whatsapp', status: 'disconnected' },
                { platform: 'instagram', status: 'disconnected' },
                { platform: 'telegram', status: 'disconnected' },
                { platform: 'messenger', status: 'disconnected' },
            ]).map((channel) => (
                <ChannelCard
                    key={channel.platform}
                    platform={channel.platform as any}
                    status={channel.status as any}
                    config={channel.config}
                    onRefresh={fetchChannels}
                />
            ))}
        </div>
    )
}

// Helper component for the error state to avoid importing Button inside the logic if not needed
// but I'll just import it at the top.
