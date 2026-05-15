import { prisma } from '../lib/prisma'

export class AlertService {
    static async checkAndTriggerAlerts(workspaceId: string) {
        try {
            // 1. Get User Preferences with Webhook URL
            const preferences = await prisma.userPreference.findFirst({
                where: { user: { workspaceId } },
                include: { user: true }
            })

            if (!preferences || !preferences.webhookUrl) return

            // 2. Get Today's Metrics
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            
            const metric = await prisma.dailyMetric.findUnique({
                where: { workspaceId_date: { workspaceId, date: today } }
            })

            if (!metric) return

            const alerts: string[] = []

            // Check ROAS
            if (preferences.alertRoasLow && preferences.roasThreshold) {
                const adSpend = Number(metric.metaAdSpend) + Number(metric.googleAdSpend) + Number(metric.tiktokAdSpend || 0)
                const revenue = Number(metric.totalRevenue)
                const roas = adSpend > 0 ? revenue / adSpend : 0
                
                if (adSpend > 0 && roas < Number(preferences.roasThreshold)) {
                    alerts.push(`📉 *ROAS Bajo*: El ROAS actual es de ${roas.toFixed(2)}x (Umbral: ${Number(preferences.roasThreshold).toFixed(2)}x)`)
                }
            }

            // Check Delivery Rate (Mocking for now as we need real Dropi data aggregation)
            // In a real scenario, we would calculate this from shipments table for today/yesterday
            if (preferences.alertDeliveryLow && preferences.deliveryThreshold) {
                const shipments = await prisma.shipment.findMany({
                    where: { workspaceId, createdAt: { gte: today } }
                })
                
                if (shipments.length > 5) { // Only alert if we have enough sample size
                    const delivered = shipments.filter(s => s.status.toLowerCase().includes('entregado')).length
                    const rate = (delivered / shipments.length) * 100
                    if (rate < Number(preferences.deliveryThreshold)) {
                        alerts.push(`🚚 *Entrega Baja*: Tasa de entrega hoy es ${rate.toFixed(1)}% (Umbral: ${Number(preferences.deliveryThreshold)}%)`)
                    }
                }
            }

            // Check Margin
            if (preferences.alertMarginLow) {
                const revenue = Number(metric.totalRevenue)
                const netProfit = Number(metric.netProfit)
                const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0
                
                if (revenue > 100 && margin < 15) { // Threshold 15% fixed for now or could be added to prefs
                    alerts.push(`⚠️ *Margen Crítico*: El margen neto hoy es ${margin.toFixed(1)}% (Menor al 15% recomendado)`)
                }
            }

            if (alerts.length > 0) {
                await this.sendWebhook(preferences.webhookUrl, {
                    text: `🚀 *Metria Alerts - ${preferences.user.name || 'Workspace'}*\n\n${alerts.join('\n')}\n\n🔗 [Ver Dashboard](https://metria.metrics/dashboard)`,
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `🚀 *Metria Alerts - ${preferences.user.name || 'Workspace'}*`
                            }
                        },
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: alerts.join('\n')
                            }
                        },
                        {
                            type: "actions",
                            elements: [
                                {
                                    type: "button",
                                    text: {
                                        type: "plain_text",
                                        text: "Ir al Dashboard"
                                    },
                                    url: "https://metria.metrics/dashboard",
                                    style: "primary"
                                }
                            ]
                        }
                    ]
                })

                // Log the alert event
                await prisma.auditLog.create({
                    data: {
                        workspaceId,
                        source: 'SYSTEM',
                        event: 'ALERTS_TRIGGERED',
                        status: 'OK',
                        message: `Enviadas ${alerts.length} alertas al webhook.`
                    }
                })
            }

        } catch (error: any) {
            console.error('Error in AlertService:', error)
        }
    }

    private static async sendWebhook(url: string, payload: any) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        } catch (error: any) {
            console.error('Failed to send webhook:', error.message)
        }
    }
}
