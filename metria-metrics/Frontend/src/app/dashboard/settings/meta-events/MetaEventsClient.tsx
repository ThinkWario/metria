"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Activity } from "lucide-react"
import { fetchAPI } from "@/lib/api"

interface EventCounts {
    sent: number
    failed: number
    pending: number
    duplicatesBlocked: number
}

interface Summary {
    windowHours: number
    byEvent: Record<string, EventCounts>
    totals: EventCounts
    oldestPendingAgeSeconds: number
    queueBacklogAlert: boolean
    note: string
}

interface ConversionEventRow {
    id: string
    eventName: string
    eventId: string
    status: string
    metaHttpStatus: number | null
    metaEventsReceived: number | null
    metaFbtraceId: string | null
    lastErrorCode: string | null
    attemptCount: number
    createdAt: string
    sentAt: string | null
}

const STATUS_STYLES: Record<string, string> = {
    sent: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    retry: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    failed: 'bg-red-500/10 text-red-500 border-red-500/20',
}

export default function MetaEventsClient() {
    const [mounted, setMounted] = useState(false)
    const [summary, setSummary] = useState<Summary | null>(null)
    const [recent, setRecent] = useState<ConversionEventRow[] | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => setMounted(true), [])

    useEffect(() => {
        if (!mounted) return
        Promise.all([
            fetchAPI('/meta-events/summary').then(setSummary).catch(() => setSummary(null)),
            fetchAPI('/meta-events/recent').then(res => setRecent(res.events)).catch(() => setRecent(null)),
        ]).finally(() => setLoading(false))
    }, [mounted])

    if (!mounted || loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-40 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Eventos Meta (CAPI)</h1>
                <p className="text-muted-foreground">Cobertura de Contact, Lead, QualifiedLead, Schedule, TechnicalReviewCompleted y Purchase — últimas {summary?.windowHours ?? 24}h.</p>
            </div>

            {!summary ? (
                <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No se pudo cargar el resumen de eventos.
                    </CardContent>
                </Card>
            ) : (
                <>
                    {summary.queueBacklogAlert && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-amber-600">
                                Hay eventos pendientes hace más de 5 minutos (el más antiguo lleva {Math.floor(summary.oldestPendingAgeSeconds / 60)} min sin confirmarse). Revisa el cron de reintentos.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <StatCard label="Enviados" value={summary.totals.sent} color="text-emerald-500" />
                        <StatCard label="Fallidos" value={summary.totals.failed} color="text-red-500" />
                        <StatCard label="Pendientes" value={summary.totals.pending} color="text-amber-500" />
                        <StatCard label="Duplicados bloqueados" value={summary.totals.duplicatesBlocked} color="text-muted-foreground" />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Activity className="h-4 w-4 text-primary" />
                                Por tipo de evento
                            </CardTitle>
                            <CardDescription className="text-xs">{summary.note}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {Object.keys(summary.byEvent).length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Sin eventos en esta ventana.</p>
                            ) : (
                                <div className="space-y-2">
                                    {Object.entries(summary.byEvent).map(([eventName, counts]) => (
                                        <div key={eventName} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background/40">
                                            <span className="text-sm font-medium">{eventName}</span>
                                            <div className="flex gap-2">
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{counts.sent} enviados</Badge>
                                                {counts.failed > 0 && <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-500 border-red-500/20">{counts.failed} fallidos</Badge>}
                                                {counts.pending > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">{counts.pending} pendientes</Badge>}
                                                {counts.duplicatesBlocked > 0 && <Badge variant="outline" className="text-[10px]">{counts.duplicatesBlocked} duplicados</Badge>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Envíos recientes</CardTitle>
                            <CardDescription className="text-xs">Estado y respuesta de Meta para cada evento enviado (último primero).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!recent || recent.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Sin envíos registrados.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-muted-foreground border-b border-border/50">
                                                <th className="py-2 pr-3 font-medium">Evento</th>
                                                <th className="py-2 pr-3 font-medium">Estado</th>
                                                <th className="py-2 pr-3 font-medium">HTTP</th>
                                                <th className="py-2 pr-3 font-medium">fbtrace_id</th>
                                                <th className="py-2 pr-3 font-medium">Error</th>
                                                <th className="py-2 pr-3 font-medium">Intentos</th>
                                                <th className="py-2 pr-3 font-medium">Enviado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recent.map(ev => (
                                                <tr key={ev.id} className="border-b border-border/30 last:border-0">
                                                    <td className="py-2 pr-3 font-medium">{ev.eventName}</td>
                                                    <td className="py-2 pr-3">
                                                        <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[ev.status] ?? ''}`}>{ev.status}</Badge>
                                                    </td>
                                                    <td className="py-2 pr-3">{ev.metaHttpStatus ?? '—'}</td>
                                                    <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">{ev.metaFbtraceId ?? '—'}</td>
                                                    <td className="py-2 pr-3 text-red-500">{ev.lastErrorCode ?? '—'}</td>
                                                    <td className="py-2 pr-3">{ev.attemptCount}</td>
                                                    <td className="py-2 pr-3 text-muted-foreground">{ev.sentAt ? new Date(ev.sentAt).toLocaleString('es-CL') : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            <CardContent className="pt-6">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
        </Card>
    )
}
