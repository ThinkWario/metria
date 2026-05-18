'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'
import { Loader2, RefreshCw } from 'lucide-react'

export const MetaAIOrchestrator = () => {
    const [loading, setLoading] = useState(false)
    const [settings, setSettings] = useState({
        products: true,
        faq: true,
        policies: false
    })

    const handleSync = async () => {
        setLoading(true)
        try {
            const entities = Object.entries(settings)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => key)
            
            await fetchAPI('/api/meta-ai/sync', {
                method: 'POST',
                body: JSON.stringify({ entities })
            })
            toast.success('Knowledge Base synced successfully to Meta AI!')
        } catch (error) {
            toast.error('Sync failed. Please check your credentials.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full bg-card/50 backdrop-blur-xl border-border/80 shadow-2xl">
            <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    Meta AI Orchestrator
                </CardTitle>
                <CardDescription>
                    Select which data sources should power your Meta Business AI.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(settings).map(([key, enabled]) => (
                        <div key={key} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                            <Label className="capitalize font-medium">{key}</Label>
                            <Switch 
                                checked={enabled} 
                                onCheckedChange={(val) => setSettings(prev => ({ ...prev, [key]: val }))}
                            />
                        </div>
                    ))}
                </div>
                
                <Button 
                    onClick={handleSync} 
                    disabled={loading}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all"
                >
                    {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync Knowledge Base
                </Button>
            </CardContent>
        </Card>
    )
}
