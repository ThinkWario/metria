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
import crmRoutes from './modules/crm/crm.routes'
import botRoutes from './modules/bot/bot.routes'
import analyticsRoutes from './modules/analytics/analytics.routes'
import knowledgeRoutes from './modules/knowledge/knowledge.routes'
import schedulingRoutes from './modules/scheduling/scheduling.routes'
import { startFollowUpCron } from './modules/ai-agent/followup.cron'
import { startAnalyticsCron } from './modules/analytics/analytics.cron'

const app = express()

// Security & Optimization Middleware
app.use(helmet())
app.use(cors())
app.use(compression())

// Raw body parser exclusively for Shopify webhooks (needed for HMAC sig)
app.use('/webhooks/shopify', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/whatsapp', express.raw({ type: 'application/json' }))
app.use('/api/webhooks/instagram', express.raw({ type: 'application/json' }))

// Standard JSON body parser for everything else (15mb for base64 PDF ingestion)
app.use(express.json({ limit: '15mb' }))

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
// app.use('/api/products', productsRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api/onboarding', onboardingRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api', botRoutes)
app.use('/api', crmRoutes)
app.use('/api', messagingRoutes)
app.use('/api', analyticsRoutes)
app.use('/api', knowledgeRoutes)
app.use('/api', schedulingRoutes)

// Start cron jobs
startAnalyticsCron()
startFollowUpCron()

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err)
    res.status(500).json({ error: 'Internal Server Error', message: err.message })
})

export default app
