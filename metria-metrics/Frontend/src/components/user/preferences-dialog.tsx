"use client"

import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useUserStore } from "@/store/useUserStore"
import { useTheme } from "next-themes"
import { Palette, LayoutGrid, Calendar, Bell, ImagePlus, Trash2, Mail } from "lucide-react"

interface PreferencesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function PreferencesDialog({ open, onOpenChange }: PreferencesDialogProps) {
    const { user, preferences, updatePreferences, uploadLogo, deleteLogo } = useUserStore()
    const { setTheme } = useTheme()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isUploadingLogo, setIsUploadingLogo] = useState(false)

    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN"

    const handleThemeChange = async (value: string) => {
        setTheme(value)
        try {
            await updatePreferences({ theme: value })
        } catch {
            toast.error("Error al guardar tema")
        }
    }

    const handleToggle = async (key: string, value: boolean) => {
        try {
            await updatePreferences({ [key]: value })
            toast.success("Preferencia actualizada")
        } catch {
            toast.error("Error al guardar preferencia")
        }
    }

    const handleDateRangeChange = async (value: string) => {
        try {
            await updatePreferences({ defaultDateRange: value })
            toast.success("Rango por defecto actualizado")
        } catch {
            toast.error("Error al guardar preferencia")
        }
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 2 * 1024 * 1024) {
            toast.error("El archivo excede 2MB")
            return
        }

        if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
            toast.error("Solo se permiten PNG, JPG, SVG o WebP")
            return
        }

        setIsUploadingLogo(true)
        try {
            const reader = new FileReader()
            reader.onload = async () => {
                const base64 = reader.result as string
                await uploadLogo(base64)
                toast.success("Logo actualizado", { description: "El logo de tu workspace ha sido cambiado." })
                setIsUploadingLogo(false)
            }
            reader.onerror = () => {
                toast.error("Error al leer el archivo")
                setIsUploadingLogo(false)
            }
            reader.readAsDataURL(file)
        } catch {
            toast.error("Error al subir logo")
            setIsUploadingLogo(false)
        }
    }

    const handleDeleteLogo = async () => {
        try {
            await deleteLogo()
            toast.success("Logo eliminado")
        } catch {
            toast.error("Error al eliminar logo")
        }
    }

    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] bg-card/95 backdrop-blur-xl border-border/50 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Preferencias</DialogTitle>
                    <DialogDescription>
                        Personaliza tu experiencia en Metria Metrics. Estas opciones solo te afectan a ti.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* --- Appearance --- */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Palette className="h-3.5 w-3.5 text-primary" />
                            Apariencia
                        </h4>

                        <div className="space-y-2">
                            <Label>Tema</Label>
                            <Select value={preferences.theme} onValueChange={handleThemeChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="system">Sistema (automático)</SelectItem>
                                    <SelectItem value="light">Claro</SelectItem>
                                    <SelectItem value="dark">Oscuro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="flex items-center gap-1.5">
                                    <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                                    Vista Compacta
                                </Label>
                                <p className="text-[11px] text-muted-foreground">Reduce el espaciado entre tarjetas y widgets.</p>
                            </div>
                            <Switch
                                checked={preferences.compactMode}
                                onCheckedChange={(v) => handleToggle("compactMode", v)}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* --- Dashboard Defaults --- */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            Dashboard
                        </h4>

                        <div className="space-y-2">
                            <Label>Rango de fechas por defecto</Label>
                            <Select value={preferences.defaultDateRange} onValueChange={handleDateRangeChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">Hoy</SelectItem>
                                    <SelectItem value="7d">Últimos 7 días</SelectItem>
                                    <SelectItem value="30d">Últimos 30 días</SelectItem>
                                    <SelectItem value="mtd">Mes actual</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">El rango que se seleccionará automáticamente al abrir el dashboard.</p>
                        </div>
                    </div>

                    <Separator />

                    {/* --- Notifications --- */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5 text-primary" />
                            Notificaciones
                        </h4>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Alerta de margen bajo</Label>
                                <p className="text-[11px] text-muted-foreground">Aviso cuando un producto tiene margen inferior al 20%.</p>
                            </div>
                            <Switch
                                checked={preferences.alertMarginLow}
                                onCheckedChange={(v) => handleToggle("alertMarginLow", v)}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Alerta de quiebre de stock</Label>
                                <p className="text-[11px] text-muted-foreground">Notificación cuando un SKU tiene inventario crítico.</p>
                            </div>
                            <Switch
                                checked={preferences.alertStockout}
                                onCheckedChange={(v) => handleToggle("alertStockout", v)}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="flex items-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                    Resumen diario por email
                                </Label>
                                <p className="text-[11px] text-muted-foreground">Recibe un reporte con las métricas del día anterior.</p>
                            </div>
                            <Switch
                                checked={preferences.emailReports}
                                onCheckedChange={(v) => handleToggle("emailReports", v)}
                            />
                        </div>
                    </div>

                    {/* --- Workspace Logo (ADMIN only) --- */}
                    {isAdmin && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                                    <ImagePlus className="h-3.5 w-3.5 text-primary" />
                                    Logo del Workspace
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Sube el logo de tu empresa. Aparecerá en el header para todos los usuarios de este workspace.
                                </p>

                                {user.workspace?.logoUrl ? (
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-lg border border-border/50 bg-background/50 flex items-center justify-center overflow-hidden">
                                            <img
                                                src={user.workspace.logoUrl}
                                                alt="Logo workspace"
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploadingLogo}
                                            >
                                                {isUploadingLogo ? "Subiendo..." : "Cambiar"}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleDeleteLogo}
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        className="w-full h-20 border-dashed flex flex-col gap-1"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingLogo}
                                    >
                                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                            {isUploadingLogo ? "Subiendo..." : "Arrastra o selecciona una imagen (PNG, JPG, SVG — max 2MB)"}
                                        </span>
                                    </Button>
                                )}

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                    className="hidden"
                                    onChange={handleLogoUpload}
                                />
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
