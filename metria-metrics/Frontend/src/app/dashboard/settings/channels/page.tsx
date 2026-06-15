import type { Metadata } from 'next'
import React, { Suspense } from 'react'
import { ChannelsClient } from './ChannelsClient'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = {
    title: 'Canales de Mensajería | Metria',
    description: 'Conecta WhatsApp, Instagram, Telegram y más canales de mensajería'
}

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
            <Suspense fallback={
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
                </div>
            }>
                <ChannelsClient />
            </Suspense>
        </div>
    )
}
