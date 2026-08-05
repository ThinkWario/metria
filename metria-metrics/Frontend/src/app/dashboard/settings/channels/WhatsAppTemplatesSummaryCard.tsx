'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquareText, ArrowRight } from 'lucide-react'
import { fetchAPI } from '@/lib/api'

interface TemplateCounts {
    total: number
    approved: number
    pending: number
    rejected: number
}

type SummaryState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'loaded'; counts: TemplateCounts }

export const WhatsAppTemplatesSummaryCard = () => {
    const [state, setState] = useState<SummaryState>({ status: 'loading' })

    useEffect(() => {
        fetchAPI('/messaging/whatsapp/templates')
            .then(data => {
                const templates = data.templates ?? []
                setState({
                    status: 'loaded',
                    counts: {
                        total: templates.length,
                        approved: templates.filter((t: any) => t.status === 'APPROVED').length,
                        pending: templates.filter((t: any) => t.status === 'PENDING').length,
                        rejected: templates.filter((t: any) => t.status === 'REJECTED').length
                    }
                })
            })
            .catch(() => setState({ status: 'error' }))
    }, [])

    return (
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    Plantillas de WhatsApp (HSM)
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                    {state.status === 'loading' && 'Cargando...'}
                    {state.status === 'error' && 'No se pudieron cargar las plantillas'}
                    {state.status === 'loaded' &&
                        `${state.counts.total} plantilla(s) — ${state.counts.approved} aprobada(s), ${state.counts.pending} pendiente(s), ${state.counts.rejected} rechazada(s)`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild size="sm" variant="outline" className="gap-1.5 h-8 text-xs w-full">
                    <Link href="/dashboard/settings/channels/templates">
                        Gestionar plantillas
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}
