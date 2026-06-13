import React, { useState } from 'react'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChannelConfigForm } from './ChannelConfigForm'

export const ChannelOnboarding = ({ onComplete }: { onComplete: () => void }) => {
    const [step, setStep] = useState(0)
    const channels = ['whatsapp', 'instagram', 'telegram', 'messenger']

    return (
        <Card className="max-w-3xl mx-auto mt-10 p-6 bg-card/50 backdrop-blur-xl border-border/80 shadow-2xl">
            <CardTitle className="text-2xl mb-4">Asistente de Configuración de Canales</CardTitle>
            <CardDescription className="mb-8">Conecta tus canales de negocio paso a paso.</CardDescription>

            <div className="space-y-6">
                <h3 className="text-lg font-semibold capitalize">Configurando: {channels[step]}</h3>
                <ChannelConfigForm
                    platform={channels[step] as any}
                    onSaveSuccess={() => {
                        if (step < channels.length - 1) setStep(step + 1)
                        else onComplete()
                    }}
                />

                <div className="flex justify-between mt-4">
                    <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Atrás</Button>
                    <Button onClick={() => step < channels.length - 1 ? setStep(step + 1) : onComplete()}>
                        {step === channels.length - 1 ? 'Finalizar' : 'Omitir y continuar'}
                    </Button>
                </div>
            </div>
        </Card>
    )
}
