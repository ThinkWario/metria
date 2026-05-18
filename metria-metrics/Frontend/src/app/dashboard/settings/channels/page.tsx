'use client'

import React, { useState } from 'react'
import { ChannelsClient } from './ChannelsClient'
import { ChannelOnboarding } from './ChannelOnboarding'
import { Separator } from '@/components/ui/separator'

export default function ChannelsPage() {
    const [isOnboarding, setIsOnboarding] = useState(true)

    return (
        <div className="container mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Channel Settings</h1>
                <p className="text-muted-foreground">
                    Connect and configure your messaging platforms.
                </p>
            </div>
            <Separator />
            {isOnboarding ? (
                <ChannelOnboarding onComplete={() => setIsOnboarding(false)} />
            ) : (
                <ChannelsClient />
            )}
        </div>
    )
}
