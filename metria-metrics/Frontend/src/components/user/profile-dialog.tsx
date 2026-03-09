"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useUserStore } from "@/store/useUserStore"
import { User2, Phone, Mail, Lock, Eye, EyeOff } from "lucide-react"

interface ProfileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
    const { user, updateProfile, changePassword, getInitials } = useUserStore()

    const [name, setName] = useState(user?.name || "")
    const [phone, setPhone] = useState(user?.phone || "")
    const [isSaving, setIsSaving] = useState(false)

    // Password change
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showCurrentPw, setShowCurrentPw] = useState(false)
    const [showNewPw, setShowNewPw] = useState(false)
    const [isChangingPw, setIsChangingPw] = useState(false)

    // Sync form when user data changes
    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen && user) {
            setName(user.name || "")
            setPhone(user.phone || "")
        }
        if (!isOpen) {
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        }
        onOpenChange(isOpen)
    }

    const handleSaveProfile = async () => {
        setIsSaving(true)
        try {
            await updateProfile({ name: name.trim(), phone: phone.trim() })
            toast.success("Perfil actualizado", { description: "Tus datos se han guardado correctamente." })
        } catch (err: any) {
            toast.error("Error al guardar", { description: err.message || "Intenta nuevamente." })
        } finally {
            setIsSaving(false)
        }
    }

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            toast.error("Las contraseñas no coinciden")
            return
        }
        if (newPassword.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres")
            return
        }
        setIsChangingPw(true)
        try {
            await changePassword(currentPassword, newPassword)
            toast.success("Contraseña actualizada", { description: "Tu contraseña ha sido cambiada exitosamente." })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch (err: any) {
            toast.error("Error al cambiar contraseña", { description: err.message || "Verifica tu contraseña actual." })
        } finally {
            setIsChangingPw(false)
        }
    }

    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[480px] bg-card/95 backdrop-blur-xl border-border/50">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                            {getInitials()}
                        </div>
                        Mi Perfil
                    </DialogTitle>
                    <DialogDescription>
                        Actualiza tu información personal y contraseña.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="profile-name" className="flex items-center gap-1.5">
                            <User2 className="h-3.5 w-3.5 text-muted-foreground" />
                            Nombre
                        </Label>
                        <Input
                            id="profile-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Tu nombre completo"
                        />
                    </div>

                    {/* Email (read-only) */}
                    <div className="space-y-2">
                        <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            Email
                        </Label>
                        <Input
                            id="profile-email"
                            value={user.email}
                            disabled
                            className="opacity-60"
                        />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            Teléfono
                        </Label>
                        <Input
                            id="profile-phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+56 9 1234 5678"
                        />
                    </div>

                    <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full">
                        {isSaving ? "Guardando..." : "Guardar Cambios"}
                    </Button>

                    <Separator />

                    {/* Change Password Section */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            Cambiar Contraseña
                        </h4>

                        <div className="space-y-2">
                            <Label htmlFor="current-pw">Contraseña actual</Label>
                            <div className="relative">
                                <Input
                                    id="current-pw"
                                    type={showCurrentPw ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="new-pw">Nueva contraseña</Label>
                            <div className="relative">
                                <Input
                                    id="new-pw"
                                    type={showNewPw ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPw(!showNewPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-pw">Confirmar nueva contraseña</Label>
                            <Input
                                id="confirm-pw"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repite la nueva contraseña"
                            />
                        </div>

                        <Button
                            variant="secondary"
                            onClick={handleChangePassword}
                            disabled={isChangingPw || !currentPassword || !newPassword}
                            className="w-full"
                        >
                            {isChangingPw ? "Cambiando..." : "Cambiar Contraseña"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
