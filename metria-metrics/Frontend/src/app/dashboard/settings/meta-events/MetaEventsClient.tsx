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

interface FunnelStage {
    eventName: string
    label: string
    contactCount: number
}

interface LostReason {
    reason: string
    count: number
}

interface Summary {
    windowHours: number
    byEvent: Record<string, EventCounts>
    totals: EventCounts
    errorRatePct: number
    eventsReceivedMismatchCount: number
    oldestPendingAgeSeconds: number
    queueBacklogAlert: boolean
    funnel: FunnelStage[]
    attribution: {
        contactsInWindow: number
        fbcOrFbpCoveragePct: number
        utmCoveragePct: number
    }
    lostReasons: LostReason[]
    avgFirstResponseSeconds: number | null
    alerts: {
        queueBacklog: boolean
        errorRateOver1pct: boolean
        eventsReceivedMismatch: boolean
        contactsMissingConsentOrSession: boolean
    }
    contactsMissingConsent: number
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
                    {summary.alerts.queueBacklog && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-amber-600">
                                Hay eventos pendientes hace más de 5 minutos (el más antiguo lleva {Math.floor(summary.oldestPendingAgeSeconds / 60)} min sin confirmarse). Revisa el cron de reintentos.
                            </p>
                        </div>
                    )}
                    {summary.alerts.errorRateOver1pct && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-red-600">
                                Tasa de error CAPI en {summary.errorRatePct}% (últimas {summary.windowHours}h), por sobre el umbral de 1%.
                            </p>
                        </div>
                    )}
                    {summary.alerts.eventsReceivedMismatch && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-amber-600">
                                {summary.eventsReceivedMismatchCount} evento(s) enviados con <code>events_received</code> distinto de 1 — Meta pudo no haber confirmado la recepción real.
                            </p>
                        </div>
                    )}
                    {summary.alerts.contactsMissingConsentOrSession && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-amber-600">
                                {summary.contactsMissingConsent} contacto(s) creado(s) sin <code>session_id</code> o sin consentimiento verificable.
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
                            <CardTitle className="text-base">Embudo de conversión</CardTitle>
                            <CardDescription className="text-xs">Contactos únicos que alcanzaron cada hito (histórico, vía CAPI confirmado).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap items-center gap-2">
                                {summary.funnel.map((stage, i) => (
                                    <div key={stage.eventName} className="flex items-center gap-2">
                                        <div className="text-center px-3 py-2 rounded-lg border border-border/50 bg-background/40 min-w-[90px]">
                                            <p className="text-lg font-bold">{stage.contactCount}</p>
                                            <p className="text-[10px] text-muted-foreground">{stage.label}</p>
                                        </div>
                                        {i < summary.funnel.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Primera respuesta IA</CardTitle>
                                <CardDescription className="text-xs">Promedio, conversaciones iniciadas en {summary.windowHours}h.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {summary.avgFirstResponseSeconds === null ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">Sin conversaciones con respuesta IA en el período.</p>
                                ) : (
                                    <p className="text-2xl font-bold">
                                        {summary.avgFirstResponseSeconds < 60
                                            ? `${summary.avgFirstResponseSeconds}s`
                                            : `${Math.round(summary.avgFirstResponseSeconds / 60)} min`}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Cobertura de atribución</CardTitle>
                                <CardDescription className="text-xs">Contactos creados en las últimas {summary.windowHours}h ({summary.attribution.contactsInWindow}).</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">fbc / fbp</span>
                                    <Badge variant="outline" className="text-[10px]">{summary.attribution.fbcOrFbpCoveragePct}%</Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">UTM</span>
                                    <Badge variant="outline" className="text-[10px]">{summary.attribution.utmCoveragePct}%</Badge>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Motivos de pérdida</CardTitle>
                                <CardDescription className="text-xs">Deals perdidos en Metria — últimos 30 días.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {summary.lostReasons.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">Sin deals perdidos en el período.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {summary.lostReasons.map(lr => (
                                            <div key={lr.reason} className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">{lr.reason}</span>
                                                <Badge variant="outline" className="text-[10px]">{lr.count}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
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
