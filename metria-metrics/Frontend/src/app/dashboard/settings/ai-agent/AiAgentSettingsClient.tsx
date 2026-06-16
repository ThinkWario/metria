"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Bot, Sparkles, MessageSquare, ShieldCheck, Zap, Brain, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAiAgent, updateAiAgent, getAiChannels, toggleChannelAi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

export default function AiAgentSettingsPage() {
    const queryClient = useQueryClient()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])
    
    // Queries
    const { data: agent, isLoading: isLoadingAgent } = useQuery({
        queryKey: ['ai-agent'],
        queryFn: getAiAgent
    })

    const { data: channels = [], isLoading: isLoadingChannels } = useQuery({
        queryKey: ['ai-channels'],
        queryFn: getAiChannels
    })

    // Local state for forms
    const [name, setName] = useState("")
    const [promptBase, setPromptBase] = useState("")
    const [tone, setTone] = useState("neutral")
    const [provider, setProvider] = useState("gemini")

    useEffect(() => {
        if (agent) {
            setName(agent.name || "")
            setPromptBase(agent.promptBase || "")
            setTone(agent.tone || "neutral")
            setProvider(agent.provider || "gemini")
        }
    }, [agent])

    // Mutations
    const updateAgentMutation = useMutation({
        mutationFn: (data: any) => updateAiAgent(agent.id, data),
        onSuccess: () => {
            toast.success("Configuración del Agente guardada")
            queryClient.invalidateQueries({ queryKey: ['ai-agent'] })
        },
        onError: (err: any) => toast.error("Error al guardar", { description: err.message })
    })

    const toggleAiMutation = useMutation({
        mutationFn: ({ platform, enabled }: { platform: string, enabled: boolean }) =>
            toggleChannelAi(platform, enabled),
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
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-channels'] })
        }
    })

    const handleSaveAgent = () => {
        updateAgentMutation.mutate({ name, promptBase, tone, provider })
    }

    if (!mounted || isLoadingAgent || isLoadingChannels) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-96" />
                <div className="grid gap-6 md:grid-cols-2">
                    <Skeleton className="h-[400px]" />
                    <Skeleton className="h-[400px]" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Gestión de Agentes IA</h1>
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Alpha</Badge>
                </div>
                <p className="text-muted-foreground">Configura la personalidad y el alcance de tu asistente inteligente multicanal.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Personality & Logic */}
                <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-primary" />
                            Cerebro y Personalidad
                        </CardTitle>
                        <CardDescription>Define cómo debe comportarse tu IA con los clientes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="agent-name">Nombre del Asistente</Label>
                            <Input 
                                id="agent-name" 
                                placeholder="Ej. Metria Assistant" 
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
                                    <SelectItem value="neutral">Neutral y Eficiente</SelectItem>
                                    <SelectItem value="formal">Profesional y Ejecutivo</SelectItem>
                                    <SelectItem value="friendly">Amigable y Cercano</SelectItem>
                                    <SelectItem value="aggressive">Persuasivo (Enfocado en Venta)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="agent-prompt">Instrucciones Maestras (System Prompt)</Label>
                            <Textarea 
                                id="agent-prompt"
                                className="min-h-[150px] text-xs font-mono"
                                placeholder="Eres un asistente experto en... Tu objetivo es..."
                                value={promptBase}
                                onChange={(e) => setPromptBase(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground italic">
                                Tip: Describe claramente el objetivo del agente y qué debe hacer si no sabe una respuesta.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="agent-provider">Motor de Inteligencia</Label>
                            <Select value={provider} onValueChange={setProvider}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gemini">Google Gemini 1.5 Flash (Rápido)</SelectItem>
                                    <SelectItem value="claude">Anthropic Claude 3.5 Sonnet (Razonador)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleSaveAgent} disabled={updateAgentMutation.isPending}>
                            <Zap className="mr-2 h-4 w-4" />
                            {updateAgentMutation.isPending ? "Guardando..." : "Guardar Personalidad"}
                        </Button>
                    </CardFooter>
                </Card>

                <div className="space-y-6">
                    {/* Channel Toggles */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Canales de Aplicación
                            </CardTitle>
                            <CardDescription>Activa o desactiva la IA para cada red social conectada.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {channels.length === 0 ? (
                                <div className="text-center py-6 border border-dashed rounded-lg">
                                    <p className="text-sm text-muted-foreground">No hay canales de mensajería conectados.</p>
                                    <Button variant="link" className="text-xs" asChild>
                                        <a href="/dashboard/settings/channels">Conectar canales</a>
                                    </Button>
                                </div>
                            ) : (
                                channels.map((ch: any) => (
                                    <div key={ch.platform} className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-background/50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-full bg-primary/10 text-primary">
                                                <Smartphone className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">{ch.name}</div>
                                                <div className="text-[10px] text-muted-foreground uppercase">{ch.platform}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-muted-foreground mr-1">IA</span>
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

                    {/* Features / Capabilities */}
                    <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Capacidades (Tools)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-background/40 transition-colors">
                                <Settings2 className="h-4 w-4 text-emerald-500" />
                                <div className="text-xs">
                                    <span className="font-bold">Calificación de Leads:</span> La IA categoriza prospectos automáticamente.
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-background/40 transition-colors">
                                <Zap className="h-4 w-4 text-amber-500" />
                                <div className="text-xs">
                                    <span className="font-bold">Creación de Deals:</span> Genera oportunidades en tu pipeline de ventas.
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-background/40 transition-colors">
                                <Database className="h-4 w-4 text-blue-500" />
                                <div className="text-xs">
                                    <span className="font-bold">Acceso a Catálogo:</span> Consulta productos y precios en tiempo real.
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-background/40 transition-colors">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                <div className="text-xs">
                                    <span className="font-bold">Handoff Inteligente:</span> Deriva a humanos cuando el cliente lo solicita.
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

import { Smartphone, Database } from "lucide-react"
