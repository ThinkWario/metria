"use client"

import { useState, useEffect } from "react"
import { Smartphone, Database, Brain, MessageSquare, ShieldCheck, Zap, Settings2, Sparkles, Eye, EyeOff, Layers, Copy, Check, ChevronDown, Sun, Home, ShoppingCart, Stethoscope, GraduationCap, UtensilsCrossed } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { toast } from "sonner"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAiAgent, updateAiAgent, getAiChannels, toggleChannelAi, previewAgentPrompt } from "@/lib/api"

const TONE_OPTIONS = [
    { value: "neutral",    label: "Neutral y Eficiente",           desc: "Directo, claro, sin relleno" },
    { value: "formal",     label: "Profesional y Ejecutivo",        desc: "Ideal para B2B y grandes cuentas" },
    { value: "friendly",   label: "Amigable y Cercano",             desc: "Cálido, empático, genera confianza" },
    { value: "aggressive", label: "Persuasivo (Enfocado en Venta)", desc: "Orientado al cierre, urgencia sutil" },
]

const PROVIDER_OPTIONS = [
    { value: "gemini", label: "Google Gemini 2.5 Flash", desc: "Rápido, eficiente, ideal para WhatsApp" },
    { value: "claude", label: "Anthropic Claude Sonnet", desc: "Mayor razonamiento (próximamente)" },
]

const INDUSTRY_TEMPLATES = [
    {
        icon: Sun,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
        name: "Solar / Energías Renovables",
        desc: "Calificación por consumo energético, financiamiento, ROI",
    },
    {
        icon: Home,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        name: "Inmobiliaria",
        desc: "Propiedades, zonas, tipos de operación (venta/arriendo)",
    },
    {
        icon: ShoppingCart,
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
        name: "E-commerce",
        desc: "Carritos abandonados, tracking de pedidos, devoluciones",
    },
    {
        icon: Stethoscope,
        color: "text-rose-500",
        bg: "bg-rose-500/10",
        name: "Salud / Clínica",
        desc: "Agendamiento de citas, especialidades, seguros",
    },
    {
        icon: GraduationCap,
        color: "text-violet-500",
        bg: "bg-violet-500/10",
        name: "Educación",
        desc: "Matrículas, programas, requisitos de admisión",
    },
    {
        icon: UtensilsCrossed,
        color: "text-orange-500",
        bg: "bg-orange-500/10",
        name: "Restaurante / Delivery",
        desc: "Menú, horarios, reservas, delivery",
    },
]

export default function AiAgentSettingsPage() {
    const queryClient = useQueryClient()
    const [mounted, setMounted] = useState(false)
    const [showPromptPreview, setShowPromptPreview] = useState(false)
    const [promptPreview, setPromptPreview] = useState<string | null>(null)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [copied, setCopied] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const { data: agent, isLoading: isLoadingAgent } = useQuery({ queryKey: ['ai-agent'], queryFn: getAiAgent })
    const { data: channels = [], isLoading: isLoadingChannels } = useQuery({ queryKey: ['ai-channels'], queryFn: getAiChannels })

    const [name, setName] = useState("")
    const [promptBase, setPromptBase] = useState("")
    const [tone, setTone] = useState("friendly")
    const [provider, setProvider] = useState("gemini")

    useEffect(() => {
        if (agent) {
            setName(agent.name || "")
            setPromptBase(agent.promptBase || "")
            setTone(agent.tone || "friendly")
            setProvider(agent.provider || "gemini")
        }
    }, [agent])

    const profile = (agent?.config as any)?.profile

    const updateAgentMutation = useMutation({
        mutationFn: (data: any) => updateAiAgent(agent.id, data),
        onSuccess: () => {
            toast.success("Configuración guardada")
            queryClient.invalidateQueries({ queryKey: ['ai-agent'] })
            setPromptPreview(null) // invalidate cached preview
        },
        onError: (err: any) => toast.error("Error al guardar", { description: err.message })
    })

    const toggleAiMutation = useMutation({
        mutationFn: ({ platform, enabled }: { platform: string, enabled: boolean }) => toggleChannelAi(platform, enabled),
        onMutate: async ({ platform, enabled }) => {
            await queryClient.cancelQueries({ queryKey: ['ai-channels'] })
            const previous = queryClient.getQueryData(['ai-channels'])
            queryClient.setQueryData(['ai-channels'], (old: any[]) =>
                old?.map(ch => ch.platform === platform ? { ...ch, isAiEnabled: enabled } : ch) ?? []
            )
            return { previous }
        },
        onSuccess: (_, variables) => {
            toast.success(`IA ${variables.enabled ? 'activada' : 'desactivada'} para ${variables.platform}`)
        },
        onError: (err: any, _, context: any) => {
            if (context?.previous) queryClient.setQueryData(['ai-channels'], context.previous)
            toast.error("Error al cambiar estado")
        },
        onSettled: () => { queryClient.invalidateQueries({ queryKey: ['ai-channels'] }) }
    })

    const handleSaveAgent = () => updateAgentMutation.mutate({ name, promptBase, tone, provider })

    const handlePreviewPrompt = async () => {
        if (promptPreview) { setShowPromptPreview(v => !v); return }
        setLoadingPreview(true)
        try {
            const { prompt } = await previewAgentPrompt()
            setPromptPreview(prompt)
            setShowPromptPreview(true)
        } catch (err: any) {
            toast.error("Error al cargar preview", { description: err.message })
        } finally {
            setLoadingPreview(false)
        }
    }

    const handleCopyPrompt = () => {
        if (!promptPreview) return
        navigator.clipboard.writeText(promptPreview)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleUseTemplate = (templateName: string) => {
        toast.success("Plantilla seleccionada", {
            description: "Completa los detalles en el asistente.",
            action: {
                label: "Abrir asistente",
                onClick: () => {
                    window.location.href = agent?.id ? `/dashboard/bots/${agent.id}/setup` : '/dashboard/bots'
                },
            },
        })
    }

    if (!mounted || isLoadingAgent || isLoadingChannels) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-96" />
                <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-[500px]" />
                    <Skeleton className="h-[500px]" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight">Configuración IA</h1>
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Alpha</Badge>
                </div>
                <p className="text-muted-foreground">Define la personalidad, contexto comercial y canales de tu asistente de ventas.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* ── Columna izquierda: Personalidad ── */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-primary" />
                            Personalidad del Agente
                        </CardTitle>
                        <CardDescription>Identidad, tono y motor de inteligencia.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="agent-name">Nombre del Asistente</Label>
                            <Input
                                id="agent-name"
                                placeholder="Ej. Valentina"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="agent-tone">Tono de Voz</Label>
                            <Select value={tone} onValueChange={setTone}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TONE_OPTIONS.map(t => (
                                        <SelectItem key={t.value} value={t.value}>
                                            <div>
                                                <div className="font-medium">{t.label}</div>
                                                <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="agent-prompt">Instrucciones Adicionales</Label>
                            <Textarea
                                id="agent-prompt"
                                className="min-h-[180px] text-xs font-mono"
                                placeholder={`Ej. para tu negocio:\n\nRepresentas a [Tu Empresa], especialista en [tu sector].\n\nARGUMENTO DE VALOR: Si el cliente duda por precio, destaca...\n\nCIERRE: Siempre propón el siguiente paso concreto.`}
                                value={promptBase}
                                onChange={(e) => setPromptBase(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground italic">
                                Estas instrucciones se agregan sobre el perfil comercial configurado en el Asistente. Úsalas para tácticas de cierre, argumentos de venta y restricciones específicas.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="agent-provider">Motor de Inteligencia</Label>
                            <Select value={provider} onValueChange={setProvider}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDER_OPTIONS.map(p => (
                                        <SelectItem key={p.value} value={p.value} disabled={p.value === 'claude'}>
                                            <div>
                                                <div className="font-medium">{p.label}</div>
                                                <div className="text-[10px] text-muted-foreground">{p.desc}</div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                        <Button className="flex-1" onClick={handleSaveAgent} disabled={updateAgentMutation.isPending}>
                            <Zap className="mr-2 h-4 w-4" />
                            {updateAgentMutation.isPending ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviewPrompt}
                            disabled={loadingPreview}
                            className="gap-1.5"
                        >
                            {showPromptPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            {loadingPreview ? "Cargando..." : "Preview"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* ── Columna derecha ── */}
                <div className="space-y-6">
                    {/* Perfil Comercial (wizard summary) */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Layers className="h-4 w-4 text-primary" />
                                    Perfil Comercial
                                </CardTitle>
                                <div className="flex gap-2">
                                    {!profile && (
                                        <Button size="sm" variant="default" className="h-7 text-xs gap-1" asChild>
                                            <a href={agent?.id ? `/dashboard/bots/${agent.id}/setup` : '/dashboard/bots'}>
                                                <Settings2 className="h-3 w-3" />
                                                Configurar perfil
                                            </a>
                                        </Button>
                                    )}
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                                        <a href={`/dashboard/bots/${agent?.id}/setup`}>Editar →</a>
                                    </Button>
                                </div>
                            </div>
                            <CardDescription className="text-xs">
                                Configurado desde el Asistente (negocio, oferta, preguntas de calificación).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {!profile ? (
                                <div className="text-center py-6 border border-dashed rounded-lg border-border/50">
                                    <p className="text-sm text-muted-foreground">Sin perfil configurado.</p>
                                    <p className="text-xs text-muted-foreground mt-1">Usa el Asistente para configurar negocio, oferta y preguntas.</p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-xs">
                                    {profile.business?.description && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Negocio</p>
                                            <p className="text-foreground/80 line-clamp-2">{profile.business.description}</p>
                                            {profile.business.coverage && (
                                                <p className="text-muted-foreground mt-0.5">📍 {profile.business.coverage}</p>
                                            )}
                                        </div>
                                    )}

                                    {profile.offer?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Oferta ({profile.offer.length} productos)</p>
                                            <div className="space-y-0.5">
                                                {profile.offer.slice(0, 3).map((o: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-start gap-2">
                                                        <span className="text-foreground/80 truncate flex-1">{o.name}</span>
                                                        {o.price && <span className="text-primary font-mono shrink-0">{o.price}</span>}
                                                    </div>
                                                ))}
                                                {profile.offer.length > 3 && (
                                                    <p className="text-muted-foreground">+{profile.offer.length - 3} más...</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {profile.qualificationQuestions?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                                                {profile.qualificationQuestions.length} Preguntas de calificación
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {profile.qualificationQuestions.map((q: any) => (
                                                    <Badge key={q.key} variant="secondary" className="text-[9px] h-4 px-1.5">{q.key}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {profile.objections?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">
                                                {profile.objections.length} Objeciones manejadas
                                            </p>
                                            <div className="space-y-0.5">
                                                {profile.objections.slice(0, 2).map((o: any, i: number) => (
                                                    <p key={i} className="text-muted-foreground truncate">• "{o.objection}"</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {profile.scheduling && (
                                        <div className="flex items-center gap-1.5 pt-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${profile.scheduling.enabled ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                                            <span className="text-muted-foreground">
                                                Agendamiento {profile.scheduling.enabled ? `activo (${profile.scheduling.types?.join(', ')})` : 'desactivado'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Canales */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MessageSquare className="h-4 w-4 text-primary" />
                                Canales de Aplicación
                            </CardTitle>
                            <CardDescription className="text-xs">Activa o desactiva la IA por canal.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {channels.length === 0 ? (
                                <div className="text-center py-4 border border-dashed rounded-lg">
                                    <p className="text-sm text-muted-foreground">No hay canales conectados.</p>
                                    <Button variant="link" className="text-xs" asChild>
                                        <a href="/dashboard/settings/channels">Conectar canales →</a>
                                    </Button>
                                </div>
                            ) : (
                                channels.map((ch: any) => (
                                    <div key={ch.platform} className="flex items-center justify-between p-2.5 border border-border/50 rounded-lg bg-background/50">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 rounded-full bg-primary/10 text-primary">
                                                <Smartphone className="h-3.5 w-3.5" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{ch.name}</div>
                                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{ch.platform}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-muted-foreground">IA</span>
                                            <Switch
                                                checked={ch.isAiEnabled}
                                                onCheckedChange={(checked) => toggleAiMutation.mutate({ platform: ch.platform, enabled: checked })}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Capacidades */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Herramientas Activas
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {[
                                { icon: Settings2, color: "text-emerald-500", label: "Calificación de Leads", desc: "Temperatura, tipo y score automático" },
                                { icon: Zap, color: "text-amber-500", label: "Creación de Deals", desc: "Oportunidades en pipeline de ventas" },
                                { icon: Database, color: "text-blue-500", label: "Acceso a Catálogo", desc: "Productos y precios en tiempo real" },
                                { icon: ShieldCheck, color: "text-primary", label: "Handoff a Humano", desc: "Deriva cuando el cliente lo solicita" },
                            ].map(({ icon: Icon, color, label, desc }) => (
                                <div key={label} className="flex items-center gap-2.5 p-2 rounded-md hover:bg-background/40 transition-colors">
                                    <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
                                    <div className="text-xs">
                                        <span className="font-bold">{label}:</span>{" "}
                                        <span className="text-muted-foreground">{desc}</span>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── Vista Previa del Prompt ── */}
            {showPromptPreview && promptPreview && (
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Eye className="h-4 w-4 text-primary" />
                                Vista Previa del System Prompt
                            </CardTitle>
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={handleCopyPrompt}>
                                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? "Copiado" : "Copiar"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPromptPreview(false)}>
                                    Cerrar
                                </Button>
                            </div>
                        </div>
                        <CardDescription className="text-xs">
                            Prompt compilado que recibe el modelo en cada conversación (sin historial de mensajes ni chunks de RAG).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs font-mono bg-background/60 border border-border/40 rounded-lg p-4 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                            {promptPreview}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {/* ── Plantillas de Industria ── */}
            <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CollapsibleTrigger asChild>
                        <CardHeader className="pb-3 cursor-pointer select-none hover:bg-background/20 rounded-t-xl transition-colors">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Layers className="h-4 w-4 text-primary" />
                                        Plantillas de industria
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${templatesOpen ? 'rotate-180' : ''}`}
                                        />
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        Puntos de partida para configurar el perfil comercial de tu asistente.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent className="pt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {INDUSTRY_TEMPLATES.map((tpl) => {
                                    const Icon = tpl.icon
                                    return (
                                        <div
                                            key={tpl.name}
                                            className="flex flex-col gap-3 p-4 rounded-xl border border-border/50 bg-background/40 hover:bg-background/60 transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`p-2 rounded-lg ${tpl.bg} shrink-0`}>
                                                    <Icon className={`h-4 w-4 ${tpl.color}`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold leading-tight">{tpl.name}</p>
                                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{tpl.desc}</p>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs w-full"
                                                onClick={() => handleUseTemplate(tpl.name)}
                                            >
                                                Usar como base
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    )
}
