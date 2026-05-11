import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Settings2 } from 'lucide-react'
import { ChannelConfigForm } from './ChannelConfigForm'

interface ChannelCardProps {
    platform: 'whatsapp' | 'instagram' | 'telegram' | 'messenger'
    status: 'connected' | 'disconnected'
    config?: any
    onRefresh: () => void
}

export const ChannelCard = ({ platform, status, config, onRefresh }: ChannelCardProps) => {
    const [isConfigOpen, setIsConfigOpen] = useState(false)

    const platformNames = {
        whatsapp: 'WhatsApp',
        instagram: 'Instagram',
        telegram: 'Telegram',
        messenger: 'Messenger'
    }

    return (
        <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-md group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-bold">{platformNames[platform]}</CardTitle>
                    <CardDescription>Messaging channel integration</CardDescription>
                </div>
                <Badge variant={status === 'connected' ? 'default' : 'destructive'} className="px-2 py-0.5">
                    {status === 'connected' ? (
                        <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Connected
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Disconnected
                        </div>
                    )}
                </Badge>
            </CardHeader>
            <CardContent>
                {isConfigOpen ? (
                    <div className="py-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <ChannelConfigForm
                            platform={platform}
                            initialConfig={config}
                            onSaveSuccess={() => {
                                setIsConfigOpen(false)
                                onRefresh()
                            }}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        <div className="mb-4 rounded-full bg-muted p-3 group-hover:bg-primary/10 transition-colors">
                            <Settings2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            {status === 'connected'
                                ? 'Channel is active and receiving messages.'
                                : 'Configure this channel to start receiving messages.'}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsConfigOpen(true)}
                        >
                            Configure Channel
                        </Button>
                    </div>
                )}
            </CardContent>
            {isConfigOpen && (
                <CardFooter className="flex justify-end border-t bg-muted/50 py-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsConfigOpen(false)}
                    >
                        Cancel
                    </Button>
                </CardFooter>
            )}
        </Card>
    )
}
