import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Trash2, MessageSquareText, Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'

interface WhatsAppTemplate {
    id: string
    name: string
    language: string
    category: string
    bodyText: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED'
    rejectedReason?: string | null
    variables?: string[] | null
}

const STATUS_STYLES: Record<string, string> = {
    APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    REJECTED: 'bg-red-500/10 text-red-500 border-red-500/20',
    PAUSED: 'bg-muted/50 text-muted-foreground'
}

const CATEGORY_OPTIONS = [
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'UTILITY', label: 'Utilidad' },
    { value: 'AUTHENTICATION', label: 'Autenticación' }
]

const sanitizeName = (raw: string) => raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_')

export const WhatsAppTemplatesPanel = () => {
    const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
    const [openingTemplateId, setOpeningTemplateId] = useState<string | null>(null)
    const [technicalVisitTemplateId, setTechnicalVisitTemplateId] = useState<string | null>(null)
    const [visitConfirmationTemplateId, setVisitConfirmationTemplateId] = useState<string | null>(null)
    const [viewingTemplate, setViewingTemplate] = useState<WhatsAppTemplate | null>(null)
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [creating, setCreating] = useState(false)

    const [name, setName] = useState('')
    const [language, setLanguage] = useState('es')
    const [category, setCategory] = useState('MARKETING')
    const [bodyText, setBodyText] = useState('')
    const [catalog, setCatalog] = useState<{ key: string; label: string; example: string }[]>([])
    const [variableMap, setVariableMap] = useState<string[]>([])

    const detectedVariableCount = useMemo(() => {
        const indexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
        return indexes.length > 0 ? Math.max(...indexes) : 0
    }, [bodyText])

    const load = async () => {
        setLoading(true)
        try {
            const data = await fetchAPI('/messaging/whatsapp/templates')
            setTemplates(data.templates ?? [])
            setOpeningTemplateId(data.openingTemplateId ?? null)
            setTechnicalVisitTemplateId(data.technicalVisitTemplateId ?? null)
            setVisitConfirmationTemplateId(data.visitConfirmationTemplateId ?? null)
        } catch (err: any) {
            toast.error('No se pudieron cargar las plantillas', { description: err.message })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    useEffect(() => {
        fetchAPI('/messaging/whatsapp/templates/variable-catalog')
            .then(data => setCatalog(data.catalog ?? []))
            .catch(() => {})
    }, [])

    useEffect(() => {
        setVariableMap(prev => {
            if (prev.length === detectedVariableCount) return prev
            const next = prev.slice(0, detectedVariableCount)
            while (next.length < detectedVariableCount) next.push('')
            return next
        })
    }, [detectedVariableCount])

    const handleSync = async () => {
        setSyncing(true)
        try {
            const data = await fetchAPI('/messaging/whatsapp/templates/sync', { method: 'POST' })
            setTemplates(data.templates ?? [])
            toast.success('Estados sincronizados con Meta')
        } catch (err: any) {
            toast.error('Error al sincronizar', { description: err.message })
        } finally {
            setSyncing(false)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        const cleanName = sanitizeName(name)
        if (!cleanName || !bodyText.trim()) {
            toast.error('Nombre y texto de la plantilla son obligatorios')
            return
        }
        if (detectedVariableCount > 0 && variableMap.some(v => !v)) {
            toast.error('Selecciona una variable para cada {{n}} detectado en el texto')
            return
        }
        setCreating(true)
        try {
            const template = await fetchAPI('/messaging/whatsapp/templates', {
                method: 'POST',
                body: JSON.stringify({
                    name: cleanName,
                    language,
                    category,
                    bodyText,
                    variables: detectedVariableCount > 0 ? variableMap : undefined
                })
            })
            setTemplates(prev => [template, ...prev])
            setName(''); setBodyText(''); setVariableMap([])
            toast.success('Plantilla enviada a revisión de Meta', {
                description: 'El estado cambiará a Aprobada u Rechazada en minutos u horas — usa "Sincronizar" para actualizarlo.'
            })
        } catch (err: any) {
            toast.error('No se pudo crear la plantilla', { description: err.message })
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await fetchAPI(`/messaging/whatsapp/templates/${id}`, { method: 'DELETE' })
            setTemplates(prev => prev.filter(t => t.id !== id))
            if (openingTemplateId === id) setOpeningTemplateId(null)
            if (technicalVisitTemplateId === id) setTechnicalVisitTemplateId(null)
            if (visitConfirmationTemplateId === id) setVisitConfirmationTemplateId(null)
        } catch (err: any) {
            toast.error('No se pudo borrar la plantilla', { description: err.message })
        }
    }

    const handleSetOpening = async (id: string) => {
        try {
            const data = await fetchAPI(`/messaging/whatsapp/templates/${id}/opening`, { method: 'PATCH' })
            setOpeningTemplateId(data.openingTemplateId ?? id)
            toast.success('Plantilla asignada como saludo inicial para leads de Google Sheets')
        } catch (err: any) {
            toast.error('No se pudo asignar', { description: err.message })
        }
    }

    const handleSetTechnicalVisit = async (id: string) => {
        try {
            const data = await fetchAPI('/messaging/whatsapp/templates/role/technicalVisitTemplateId', {
                method: 'PATCH',
                body: JSON.stringify({ templateId: id })
            })
            setTechnicalVisitTemplateId(data.technicalVisitTemplateId ?? id)
            toast.success('Plantilla asignada para aviso de visita técnica')
        } catch (err: any) {
            toast.error('No se pudo asignar', { description: err.message })
        }
    }

    const handleSetVisitConfirmation = async (id: string) => {
        try {
            const data = await fetchAPI('/messaging/whatsapp/templates/role/visitConfirmationTemplateId', {
                method: 'PATCH',
                body: JSON.stringify({ templateId: id })
            })
            setVisitConfirmationTemplateId(data.visitConfirmationTemplateId ?? id)
            toast.success('Plantilla asignada para confirmación de visita')
        } catch (err: any) {
            toast.error('No se pudo asignar', { description: err.message })
        }
    }

    return (
        <>
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MessageSquareText className="h-4 w-4 text-primary" />
                            Plantillas de WhatsApp (HSM)
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                            Deben ser aprobadas por Meta antes de poder usarse. "Saludo inicial" se envía a leads nuevos de Google Sheets, y "Aviso visita técnica" al teléfono interno (notifyPhone) cuando se agenda una visita. La plantilla de derivación a ejecutivo comercial se asigna desde la página del bot.
                        </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleSync} disabled={syncing}>
                        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        Sincronizar
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <form onSubmit={handleCreate} className="space-y-3 p-3 rounded-lg border border-dashed border-border/50">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="tpl-name" className="text-xs">Nombre</Label>
                            <Input
                                id="tpl-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="saludo_inicial_leads"
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="tpl-lang" className="text-xs">Idioma</Label>
                            <Input
                                id="tpl-lang"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                placeholder="es"
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-xs">Categoría</Label>
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="tpl-body" className="text-xs">Texto (usa {'{{1}}'} para el nombre del lead)</Label>
                        <Textarea
                            id="tpl-body"
                            value={bodyText}
                            onChange={(e) => setBodyText(e.target.value)}
                            placeholder="Hola {{1}}, vimos tu interés y nos encantaría ayudarte 🙌"
                            className="text-xs min-h-[70px]"
                        />
                    </div>
                    {detectedVariableCount > 0 && (
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Variables detectadas</Label>
                            {Array.from({ length: detectedVariableCount }, (_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground shrink-0">{`{{${i + 1}}}`}</span>
                                    <Select
                                        value={variableMap[i] ?? ''}
                                        onValueChange={(v) => setVariableMap(prev => {
                                            const next = [...prev]
                                            next[i] = v
                                            return next
                                        })}
                                    >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elegir variable" /></SelectTrigger>
                                        <SelectContent>
                                            {catalog.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    )}
                    <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={creating}>
                        {creating ? 'Enviando a Meta...' : 'Crear y enviar a revisión'}
                    </Button>
                </form>

                {loading ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Cargando plantillas...</p>
                ) : templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Sin plantillas todavía.</p>
                ) : (
                    <div className="space-y-2">
                        {templates.map(t => (
                            <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/50 bg-background/40">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">{t.name}</span>
                                        <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${STATUS_STYLES[t.status] ?? ''}`}>{t.status}</Badge>
                                        {openingTemplateId === t.id && (
                                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">Saludo activo</Badge>
                                        )}
                                        {technicalVisitTemplateId === t.id && (
                                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">Aviso visita técnica</Badge>
                                        )}
                                        {visitConfirmationTemplateId === t.id && (
                                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">Confirmación de visita</Badge>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground truncate">{t.bodyText}</p>
                                    {t.status === 'REJECTED' && t.rejectedReason && (
                                        <p className="text-[10px] text-red-500 mt-0.5">Motivo: {t.rejectedReason}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {t.status === 'APPROVED' && openingTemplateId !== t.id && (
                                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleSetOpening(t.id)}>
                                            Usar como saludo
                                        </Button>
                                    )}
                                    {t.status === 'APPROVED' && technicalVisitTemplateId !== t.id && (
                                        <Button
                                            size="sm" variant="outline" className="h-7 text-[10px]"
                                            onClick={() => handleSetTechnicalVisit(t.id)}
                                        >
                                            Usar en aviso técnico
                                        </Button>
                                    )}
                                    {t.status === 'APPROVED' && visitConfirmationTemplateId !== t.id && (
                                        <Button
                                            size="sm" variant="outline" className="h-7 text-[10px]"
                                            onClick={() => handleSetVisitConfirmation(t.id)}
                                        >
                                            Usar en confirmación de visita
                                        </Button>
                                    )}
                                    <Button
                                        size="icon" variant="ghost" className="h-7 w-7"
                                        aria-label={`Ver plantilla ${t.name}`}
                                        onClick={() => setViewingTemplate(t)}
                                    >
                                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(t.id)}>
                                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
        <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{viewingTemplate?.name}</DialogTitle>
                    <DialogDescription>{viewingTemplate?.language} · {viewingTemplate?.category}</DialogDescription>
                </DialogHeader>
                <p className="text-sm whitespace-pre-wrap">{viewingTemplate?.bodyText}</p>
                {viewingTemplate?.variables && viewingTemplate.variables.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground">Variables</p>
                        {viewingTemplate.variables.map((key, i) => (
                            <p key={key} className="text-xs">
                                {`{{${i + 1}}}`} → {catalog.find(c => c.key === key)?.label ?? key}
                            </p>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
        </>
    )
}
