"use client"

import { useEffect, useState } from "react"
import { getAdminSettings, updateAdminSetting } from "@/lib/api"
import { toast } from "sonner"
import { BadgeAlert, Save, Loader2 } from "lucide-react"

export default function AdminSettingsPage() {
    const [configs, setConfigs] = useState<{ [key: string]: string }>({})
    const [loading, setLoading] = useState(true)

    // Common system variables to display even if not yet saved in DB
    const expectedKeys = [
        { key: "INTERNAL_AI_KEY", label: "Token API n8n (Valentina IA)", default: "" },
        { key: "BETA_FEATURE_X", label: "Habilitar Función Experimental X", default: "false" }
    ]

    useEffect(() => {
        const loadConfigs = async () => {
            try {
                const data = await getAdminSettings()
                const formattedOptions: { [key: string]: string } = {}
                data.forEach((item: { key: string; value: string }) => {
                    formattedOptions[item.key] = item.value
                })
                setConfigs(formattedOptions)
            } catch (error) {
                toast.error("Error cargando variables del sistema")
            } finally {
                setLoading(false)
            }
        }
        loadConfigs()
    }, [])

    const handleSave = async (key: string, value: string) => {
        try {
            await updateAdminSetting(key, value)
            toast.success("Variable guardada correctamente")
            setConfigs(prev => ({ ...prev, [key]: value }))
        } catch (error) {
            toast.error("Error al guardar la variable")
        }
    }

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-destructive" /></div>

    return (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <BadgeAlert className="w-8 h-8 text-destructive" />
                    Configuraciones Globales (System Configs)
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">Gestiona variables de entorno a nivel de aplicación (Tokens maestros de terceros, IA Mestra, etc).</p>
            </div>

            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-xl text-destructive text-sm mb-6">
                <strong>Advertencia de Seguridad Máxima:</strong> Modificar estas claves afectará a <strong>todos los workspaces</strong> y conexiones de clientes.
            </div>

            <div className="grid grid-cols-1 gap-6 max-w-4xl">
                {expectedKeys.map(({ key, label }) => (
                    <div key={key} className="p-6 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md shadow-lg flex flex-col md:flex-row gap-4 items-start md:items-end justify-between transition-all hover:border-primary/50">
                        <div className="w-full">
                            <label className="text-sm font-bold text-foreground mb-1 block">{label}</label>
                            <span className="text-xs text-muted-foreground font-mono block mb-3">Key: {key}</span>
                            <input
                                type="text"
                                className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                                defaultValue={configs[key] || ""}
                                onBlur={(e) => {
                                    if (e.target.value !== configs[key]) {
                                        setConfigs(prev => ({ ...prev, [key]: e.target.value }))
                                    }
                                }}
                                placeholder="Ingresa el valor"
                            />
                        </div>
                        <button
                            onClick={() => handleSave(key, configs[key] || "")}
                            className="shrink-0 px-6 py-3 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2 w-full md:w-auto mt-2 md:mt-0"
                        >
                            <Save className="w-4 h-4" />
                            Guardar Variable
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
