'use client'

import React from 'react'
import { ChannelsClient } from './ChannelsClient'
import { Separator } from '@/components/ui/separator'

export default function ChannelsPage() {
    return (
        <div className="container mx-auto py-8 px-4 space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Canales</h1>
                <p className="text-muted-foreground">
                    Conecta tus canales de mensajería. WhatsApp se conecta en segundos escaneando un código QR.
                </p>
            </div>
            <Separator />
            <ChannelsClient />
        </div>
    )
}
