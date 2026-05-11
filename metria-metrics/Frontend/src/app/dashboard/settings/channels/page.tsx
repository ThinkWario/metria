import React from 'react'
import { ChannelsClient } from './ChannelsClient'
import { Separator } from '@/components/ui/separator'

export const metadata = {
    title: 'Channel Settings | Metria Metrics',
    description: 'Configure your messaging channel integrations for the bot engine.',
}

export default function ChannelsPage() {
    return (
        <div className="container mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Channel Settings</h1>
                <p className="text-muted-foreground">
                    Connect and configure your messaging platforms to enable the bot engine and receive customer interactions.
                </p>
            </div>
            <Separator />
            <ChannelsClient />
        </div>
    )
}
