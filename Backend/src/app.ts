import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'

// Import Routes
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'
import shopifyRoutes from './routes/shopify'
import metaRoutes from './routes/meta'
import googleRoutes from './routes/google'
import tiktokRoutes from './routes/tiktok'
import dropiRoutes from './routes/dropi'
import oauthRoutes from './routes/oauth'
import metricsRoutes from './routes/metrics'
import valentinaRoutes from './routes/valentina'
import settingsRoutes from './routes/settings'
import usersRoutes from './routes/users'
import adminRoutes from './routes/admin'
// import productsRoutes from './routes/products'
import logsRoutes from './routes/logs'
import onboardingRoutes from './routes/onboarding'
import paymentsRoutes from './routes/payments'
import messagingRoutes from './modules/messaging/messaging.routes'
import quickRepliesRoutes from './modules/messaging/quickReplies.routes'
import crmRoutes from './modules/crm/crm.routes'
import forecastRoutes from './modules/crm/forecast.routes'
import timelineRoutes from './modules/crm/timeline.routes'
import segmentsRoutes from './modules/crm/segments.routes'
import formsRoutes from './modules/crm/forms.routes'
import publicFormsRoutes from './modules/crm/public-forms.routes'
import contactValueRoutes from './modules/crm/contactValue.routes'
import paymentLinksRoutes from './modules/payments-crm/payment-links.routes'
import paymentLinksWebhook from './modules/payments-crm/payment-links.webhook'
import automationRoutes from './modules/automation/automation.routes'
import campaignsRoutes from './modules/campaigns/campaigns.routes'
import botRoutes from './modules/bot/bot.routes'
import analyticsRoutes from './modules/analytics/analytics.routes'
import knowledgeRoutes from './modules/knowledge/knowledge.routes'
import schedulingRoutes from './modules/scheduling/scheduling.routes'
import publicBookingRoutes from './modules/scheduling/public-booking.routes'
import composioRoutes from './routes/composio'
import googleCalendarRoutes from './routes/integrations/google-calendar.routes'
import productsRoutes from './modules/products/products.routes'
import invoicesRoutes from './modules/payments/invoices.routes'
import { emailWebhookRouter } from './modules/webhooks/email.webhook.routes'
import { smsWebhookRouter } from './modules/webhooks/sms.webhook.routes'
import { unsubscribeRouter } from './modules/unsubscribe/unsubscribe.routes'
import { startFollowUpCron } from './modules/ai-agent/followup.cron'
import { startAnalyticsCron } from './modules/analytics/analytics.cron'
import { startWorkflowCron } from './modules/automation/automation.cron'
import { startCampaignsCron } from './modules/campaigns/campaigns.cron'

const app = express()

// Security & Optimization Middleware
app.use(helmet())

const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(o => o.trim()) : []),
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))

app.use(compression())

// Raw body parser exclusively for Shopify webhooks (needed for HMAC sig)
app.use('/webhooks/shopify', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/instagram', express.raw({ type: 'application/json' }))

// Raw body for Meta webhooks (HMAC must be computed over the exact bytes received).
// Capture rawBody, then parse to an object so downstream code keeps working.
app.use(
  '/api/webhooks/meta',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      ;(req as any).rawBody = req.body
      try {
        req.body = JSON.parse(req.body.toString())
      } catch {
        req.body = {}
      }
    }
    next()
  }
)

// Standard JSON body parser for everything else (15mb for base64 PDF ingestion)
app.use(express.json({ limit: '15mb' }))

// Webhook routes (no auth — validated per-provider)
app.use('/webhooks', emailWebhookRouter)
app.use('/webhooks', smsWebhookRouter)

// Unsubscribe route (no auth — HMAC-signed token)
app.use('/unsubscribe', unsubscribeRouter)

// Register API Routes
app.use('/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/shopify', shopifyRoutes) // Includes /webhooks/shopify internally
app.use('/api/meta', metaRoutes)
app.use('/api/google', googleRoutes)
app.use('/api/tiktok', tiktokRoutes)
app.use('/api/dropi', dropiRoutes) // Includes /webhooks/status
app.use('/api/metrics', metricsRoutes)
app.use('/api/oauth', oauthRoutes)
app.use('/api/ia', valentinaRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)
// app.use('/api/products', productsRoutes) // old stub
app.use('/api/logs', logsRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api', botRoutes)
app.use('/api', crmRoutes)
app.use('/api', forecastRoutes)
app.use('/api', timelineRoutes)
app.use('/api', segmentsRoutes)
app.use('/api', formsRoutes)
app.use('/api', contactValueRoutes)
app.use('/api', paymentLinksRoutes)
app.use('/api', automationRoutes)
app.use('/api', campaignsRoutes)
app.use('/api', messagingRoutes)
app.use('/api', quickRepliesRoutes)
app.use('/api', analyticsRoutes)
app.use('/api', knowledgeRoutes)
app.use('/api', schedulingRoutes)
app.use('/api/public', publicBookingRoutes)
app.use('/api/public', publicFormsRoutes)
app.use('/api/public', paymentLinksWebhook)
app.use('/api/composio', composioRoutes)
app.use('/api/integrations/google-calendar', googleCalendarRoutes)
app.use('/api', productsRoutes)
app.use('/api', invoicesRoutes)

// Start cron jobs
startAnalyticsCron()
startFollowUpCron()
startWorkflowCron()
startCampaignsCron()

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err)
    res.status(500).json({ error: 'Internal Server Error', message: err.message })
})

export default app
