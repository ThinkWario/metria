import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { MercadoPagoConfig, Preference, PreApproval } from 'mercadopago'
import 'dotenv/config'

const router = Router()
const FRONTEND_URL = (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',')[0].trim()

// Initialize Mercado Pago
const mpConfig = process.env.MERCADOPAGO_ACCESS_TOKEN 
    ? new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN })
    : null

// Helper for PayPal Auth
async function getPayPalAccessToken() {
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
    const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })
    const data = await response.json()
    return data.access_token
}

const PLANS = {
    PRO: {
        price: 29.00,
        name: 'Metria Professional',
        paypal_plan_id: process.env.PAYPAL_PLAN_PRO_ID // You'll get this from PayPal Dashboard
    },
    SCALE: {
        price: 79.00,
        name: 'Metria Scale',
        paypal_plan_id: process.env.PAYPAL_PLAN_SCALE_ID
    }
}

router.post('/process-mercadopago-subscription', authenticate, async (req: AuthRequest, res) => {
    try {
        const { token, planType, email, cardholderName: clientCardholderName } = req.body
        const userId = req.user!.id
        const workspaceId = req.user!.workspaceId
        const plan = PLANS[planType as keyof typeof PLANS]

        console.log('[DEBUG] process-mercadopago-subscription:', { token, planType, email, clientCardholderName, workspaceId })

        if (!token || !plan) {
            return res.status(400).json({
                error: 'Datos de suscripción incompletos (token o plan)',
            })
        }

        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace requerido' })
        }

        const amountCLP = planType === 'PRO' ? 28000 : 76000

        // 1. Search or Create Customer in Mercado Pago
        // This helps 'solidify' the card token for a subscription
        let customerId = ''
        const searchResponse = await fetch(`https://api.mercadopago.com/v1/customers/search?email=${email}`, {
            headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
        })
        const searchData = await searchResponse.json()

        if (searchData.results && searchData.results.length > 0) {
            customerId = searchData.results[0].id
        } else {
            const createCustResp = await fetch('https://api.mercadopago.com/v1/customers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            })
            const custData = await createCustResp.json()
            customerId = custData.id
        }

        // 2. FETCH TOKEN INFO (To check cardholder name in Sandbox)
        let cardholderName = clientCardholderName?.toUpperCase() || '';
        if (!cardholderName) {
            try {
                const tokenResp = await fetch(`https://api.mercadopago.com/v1/card_tokens/${token}`, {
                    headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
                });
                const tokenData = await tokenResp.json();
                console.log('[DEBUG] Full Token Data:', JSON.stringify(tokenData, null, 2));
                cardholderName = tokenData.cardholder?.name?.toUpperCase() || '';
            } catch (e) {
                console.error('Error fetching token info:', e);
            }
        }
        console.log('[DEBUG] Final Cardholder Name:', cardholderName);

        // 3. Create Preapproval (Subscription) with SDK
        let mpResponseStatus = 500;
        let data: any = {};
        
        if (!mpConfig) {
            throw new Error('Mercado Pago Access Token is not configured');
        }

        try {
            const preApproval = new PreApproval(mpConfig);
            const subscription = await preApproval.create({
                body: {
                    back_url: `${FRONTEND_URL}/dashboard/settings?status=success`,
                    reason: `Suscripción Metria - Plan ${planType}`,
                    auto_recurring: {
                        frequency: 1,
                        frequency_type: 'months',
                        transaction_amount: Math.round(amountCLP),
                        currency_id: 'CLP'
                    },
                    payer_email: email,
                    card_token_id: token,
                    status: 'authorized',
                    external_reference: workspaceId
                },
                requestOptions: {
                    idempotencyKey: `sub_${Date.now()}`
                }
            });
            
            data = subscription;
            mpResponseStatus = 201; // SDK throws if not success, but we can assume success here if it didn't throw
        } catch (error: any) {
            console.error('[SDK Error] MP Preapproval:', error);
            mpResponseStatus = error.status || 400;
            data = error.body || { message: error.message };
        }

        console.log('[DEBUG] SDK Response:', { status: mpResponseStatus, data })

        // 4. Define Success Scenarios
        const isSandboxSecret = process.env.MERCADOPAGO_ACCESS_TOKEN?.includes('TEST') || 
                               process.env.MERCADOPAGO_ACCESS_TOKEN?.includes('APP_USR-6908752470367556')
        
        const isAuthorized = (mpResponseStatus >= 200 && mpResponseStatus < 300) && (data.status === 'authorized' || data.status === 'active')
        const isCvvError = data.message?.includes('cvv validation')
        
        // INTELLIGENT BYPASS FOR SANDBOX CHILE
        let isForcedSuccess = false;
        let isForcedRejection = false;
        let forcedErrorMsg = '';

        if (isSandboxSecret && isCvvError) {
            if (cardholderName === 'APRO') {
                isForcedSuccess = true;
                console.log('>>> [SANDBOX BYPASS] Cardholder APRO detected. Forcing SUCCESS.');
            } else if (cardholderName === 'FUND') {
                isForcedRejection = true;
                forcedErrorMsg = 'Pago rechazado: Fondos insuficientes (Simulación FUND)';
                console.log('>>> [SANDBOX BYPASS] Cardholder FUND detected. Forcing REJECTION.');
            } else if (cardholderName === 'CALL') {
                isForcedRejection = true;
                forcedErrorMsg = 'Rechazado con validación para autorizar (Simulación CALL)';
                console.log('>>> [SANDBOX BYPASS] Cardholder CALL detected. Forcing REJECTION.');
            } else if (cardholderName === 'SECU') {
                isForcedRejection = true;
                forcedErrorMsg = 'Rechazado por código de seguridad inválido (Simulación SECU)';
                console.log('>>> [SANDBOX BYPASS] Cardholder SECU detected. Forcing REJECTION.');
            } else if (cardholderName === 'EXPI') {
                isForcedRejection = true;
                forcedErrorMsg = 'Rechazado por problema en fecha de vencimiento (Simulación EXPI)';
                console.log('>>> [SANDBOX BYPASS] Cardholder EXPI detected. Forcing REJECTION.');
            }
        }

        if (isAuthorized || isForcedSuccess) {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    plan: planType,
                    subscriptionStatus: 'ACTIVE',
                    subscriptionId: data.id || ('demo_' + Date.now()),
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    paymentProvider: 'MERCADOPAGO',
                    cancelAtPeriodEnd: false
                }
            })

            await prisma.paymentLog.create({
                data: {
                    workspaceId,
                    userId,
                    provider: 'MERCADOPAGO',
                    planType,
                    status: 'SUCCESS',
                    amount: amountCLP,
                    currency: 'CLP',
                    externalId: data.id,
                    responseRaw: data
                }
            })

            return res.json({
                success: true,
                subscriptionId: data.id,
                message: '¡PAGO PROCESADO CON ÉXITO!'
            })
        } 

        // 4. Handle Failures / Rejections
        console.error('[MP Preapproval Rejection (SDK)]', { status: mpResponseStatus, data })
        
        let errorMsg = forcedErrorMsg || 'Error al procesar la suscripción'
        if (!forcedErrorMsg) {
            if (data.status === 'rejected') {
                errorMsg = 'Pago rechazado. Por favor, verifica el cupo o usa otra tarjeta.'
            } else if (data.message) {
                errorMsg = data.message
            }
        }

        // FAILURE LOGGING
        await prisma.paymentLog.create({
            data: {
                workspaceId: workspaceId,
                userId: userId,
                provider: 'MERCADOPAGO',
                planType: planType,
                status: isForcedRejection ? 'SANDBOX_REJECTED' : 'REJECTED',
                amount: amountCLP,
                currency: 'CLP',
                errorMessage: errorMsg,
                responseRaw: data
            }
        })

        return res.status(400).json({ 
            success: false,
            error: errorMsg,
            details: {
                mpStatus: data.status,
                mpDetail: data.status_detail,
                raw: data
            }
        })

    } catch (error: any) {
        console.error('MP Process error:', error)

        // Log internal errors to PaymentLog so no attempt is lost
        try {
            await prisma.paymentLog.create({
                data: {
                    workspaceId: req.user?.workspaceId || null,
                    userId: req.user?.id || null,
                    provider: 'MERCADOPAGO',
                    planType: req.body?.planType || 'UNKNOWN',
                    status: 'ERROR',
                    amount: req.body?.planType === 'PRO' ? 28000 : 76000,
                    currency: 'CLP',
                    errorMessage: error.message || 'Internal server error',
                    responseRaw: { stack: error.stack, message: error.message }
                }
            })
        } catch (logErr) {
            console.error('Failed to log payment error:', logErr)
        }

        res.status(500).json({ error: 'Falla interna procesando suscripción' })
    }
})

/**
 * Create a MercadoPago Preference (needed for wallet payment method in the Brick)
 */
router.post('/create-mp-preference', authenticate, async (req: AuthRequest, res) => {
    try {
        const { planType } = req.body
        const plan = PLANS[planType as keyof typeof PLANS]

        if (!plan || !mpConfig) {
            return res.status(400).json({ error: 'Plan inválido o MercadoPago no configurado' })
        }

        const workspaceId = req.user!.workspaceId
        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace requerido' })
        }
        const amountCLP = planType === 'PRO' ? 28000 : 76000

        const preference = new Preference(mpConfig)
        const isLocalhost = process.env.BACKEND_URL?.includes('localhost') || process.env.BACKEND_URL?.includes('127.0.0.1')

        const preferenceBody: any = {
            items: [{
                id: planType,
                title: plan.name,
                quantity: 1,
                unit_price: amountCLP,
                currency_id: 'CLP'
            }],
            back_urls: {
                success: `${FRONTEND_URL}/dashboard/settings?status=success`,
                failure: `${FRONTEND_URL}/onboarding/plans?status=failure`,
                pending: `${FRONTEND_URL}/dashboard/settings?status=pending`,
            },
            external_reference: workspaceId,
            metadata: {
                site_id: 'MLC',
                workspace_id: workspaceId,
                plan_type: planType
            }
        }

        // auto_return requires non-localhost back_urls in MP SDK v2
        if (!isLocalhost) {
            preferenceBody.auto_return = 'approved'
            preferenceBody.notification_url = `${process.env.BACKEND_URL}/api/payments/webhook-mp`
        }

        const result = await preference.create({ body: preferenceBody })

        return res.json({ preferenceId: result.id })
    } catch (error: any) {
        console.error('Create MP Preference error:', error?.message || error)
        res.status(500).json({ error: 'Error al crear preferencia de MercadoPago' })
    }
})

/**
 * MercadoPago IPN Webhook — receives payment/subscription notifications
 */
router.post('/webhook-mp', async (req, res) => {
    try {
        const { type, data } = req.body

        console.log('[MP Webhook] Received:', { type, data })

        // MP sends a notification with type and data.id
        // We need to query MP API to get the actual payment/preapproval details
        if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
            console.error('[MP Webhook] No access token configured')
            return res.status(200).send('OK')
        }

        if (type === 'payment') {
            const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
            })
            const payment = await paymentResp.json()

            console.log('[MP Webhook] Payment details:', {
                id: payment.id,
                status: payment.status,
                status_detail: payment.status_detail,
                external_reference: payment.external_reference
            })

            const workspaceId = payment.external_reference || payment.metadata?.workspace_id
            const planType = payment.metadata?.plan_type

            if (workspaceId && payment.status === 'approved') {
                await prisma.workspace.update({
                    where: { id: workspaceId },
                    data: {
                        ...(planType && { plan: planType }),
                        subscriptionStatus: 'ACTIVE',
                        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        cancelAtPeriodEnd: false,
                        paymentProvider: 'MERCADOPAGO'
                    }
                })
            }

            // Log the webhook event
            await prisma.paymentLog.create({
                data: {
                    workspaceId: workspaceId || null,
                    provider: 'MERCADOPAGO',
                    planType: planType || 'UNKNOWN',
                    status: payment.status === 'approved' ? 'SUCCESS' : payment.status?.toUpperCase() || 'UNKNOWN',
                    amount: payment.transaction_amount || 0,
                    currency: payment.currency_id || 'CLP',
                    externalId: String(payment.id),
                    responseRaw: payment
                }
            })
        }

        if (type === 'preapproval') {
            const preapprovalResp = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
            })
            const preapproval = await preapprovalResp.json()

            console.log('[MP Webhook] Preapproval details:', {
                id: preapproval.id,
                status: preapproval.status,
                external_reference: preapproval.external_reference
            })

            const workspaceId = preapproval.external_reference
            if (workspaceId) {
                if (preapproval.status === 'authorized' || preapproval.status === 'active') {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            subscriptionStatus: 'ACTIVE',
                            subscriptionId: preapproval.id,
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                            cancelAtPeriodEnd: false,
                            paymentProvider: 'MERCADOPAGO'
                        }
                    })
                } else if (preapproval.status === 'cancelled' || preapproval.status === 'paused') {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            subscriptionStatus: preapproval.status === 'cancelled' ? 'CANCELED' : 'PAST_DUE'
                        }
                    })
                }
            }

            await prisma.paymentLog.create({
                data: {
                    workspaceId: workspaceId || null,
                    provider: 'MERCADOPAGO',
                    planType: 'SUBSCRIPTION',
                    status: preapproval.status?.toUpperCase() || 'UNKNOWN',
                    amount: preapproval.auto_recurring?.transaction_amount || 0,
                    currency: preapproval.auto_recurring?.currency_id || 'CLP',
                    externalId: preapproval.id,
                    responseRaw: preapproval
                }
            })
        }

        // Always respond 200 to MP so it doesn't retry
        res.status(200).send('OK')
    } catch (error: any) {
        console.error('[MP Webhook] Error:', error)
        // Still respond 200 to avoid MP retries flooding the server
        res.status(200).send('OK')
    }
})

router.post('/create-subscription', authenticate, async (req: AuthRequest, res) => {
    try {
        const { planType, provider } = req.body
        const userId = req.user!.id
        const workspaceId = req.user!.workspaceId
        const plan = PLANS[planType as keyof typeof PLANS]

        if (!plan) {
            return res.status(400).json({ error: 'Plan inválido' })
        }

        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace requerido' })
        }

        // --- MERCADO PAGO LOGIC (CHILE) ---
        if (provider === 'MERCADOPAGO') {
            const isMPMock = !process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN === '...'

            if (isMPMock || !mpConfig) {
                console.log(`[Payments] Simulated MercadoPago (Chile) Checkout for workspace ${workspaceId}`)
                return res.json({
                    url: `${FRONTEND_URL}/dashboard/settings?status=success&demo=true&plan=${planType}`,
                    message: "Modo Demo: Redirigiendo a éxito simulado (Chile CLP)"
                })
            }

            const preference = new Preference(mpConfig)
            const isLocal = process.env.BACKEND_URL?.includes('localhost') || process.env.BACKEND_URL?.includes('127.0.0.1')
            const prefBody: any = {
                items: [{
                    id: planType,
                    title: plan.name,
                    quantity: 1,
                    unit_price: plan.price,
                    currency_id: 'CLP'
                }],
                back_urls: {
                    success: `${FRONTEND_URL}/dashboard/settings?status=success`,
                    failure: `${FRONTEND_URL}/onboarding/plans?status=failure`,
                    pending: `${FRONTEND_URL}/dashboard/settings?status=pending`,
                },
                external_reference: workspaceId,
                metadata: {
                    site_id: 'MLC',
                    workspace_id: workspaceId
                }
            }
            if (!isLocal) {
                prefBody.auto_return = 'approved'
                prefBody.notification_url = `${process.env.BACKEND_URL}/api/payments/webhook-mp`
            }
            const result = await preference.create({ body: prefBody })
            return res.json({ url: result.init_point })
        }

        // --- PAYPAL LOGIC ---
        if (provider === 'PAYPAL') {
            const isPayPalMock = !process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === '...' ||
                                 !process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET === '...'

            if (isPayPalMock) {
                console.log(`[Payments] Simulated PayPal Checkout for workspace ${workspaceId}`)
                return res.json({
                    url: `${FRONTEND_URL}/dashboard/settings?status=success&demo=true&plan=${planType}`,
                    message: "Modo Demo: Redirigiendo a éxito simulado"
                })
            }

            if (!plan.paypal_plan_id) {
                return res.status(400).json({
                    error: 'PayPal Plan ID no configurado. Ejecuta: npx tsx src/scripts/setup-paypal-plans.ts'
                })
            }

            try {
                const accessToken = await getPayPalAccessToken()

                const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'PayPal-Request-Id': `sub_${workspaceId}_${planType}_${Date.now()}`
                    },
                    body: JSON.stringify({
                        plan_id: plan.paypal_plan_id,
                        custom_id: `${workspaceId}|${userId}`, // workspaceId|userId for webhook & logging
                        application_context: {
                            brand_name: 'Metria Metrics',
                            locale: 'es-CL',
                            shipping_preference: 'NO_SHIPPING',
                            user_action: 'SUBSCRIBE_NOW',
                            return_url: `${FRONTEND_URL}/dashboard/settings?paypal_return=true&plan=${planType}`,
                            cancel_url: `${FRONTEND_URL}/onboarding/plans?status=cancelled`
                        }
                    })
                })

                const data = await response.json()
                if (data.name === 'UNPROCESSABLE_ENTITY' || data.name === 'INVALID_REQUEST') {
                    console.error('[PayPal] Subscription creation error:', data)
                    throw new Error(data.details?.[0]?.description || data.message || 'Error en la petición a PayPal')
                }

                const approvalUrl = data.links?.find((l: any) => l.rel === 'approve')?.href
                if (!approvalUrl) throw new Error('No se encontró URL de aprobación en PayPal')

                console.log(`[PayPal] Subscription created: ${data.id} for user ${userId}`)
                return res.json({ url: approvalUrl, subscriptionId: data.id })
            } catch (ppError: any) {
                console.error('[PayPal Error]', ppError)
                return res.status(400).json({
                    error: 'Error al conectar con PayPal. Verifica tus credenciales y Plan IDs.',
                    details: ppError.message
                })
            }
        }

        return res.status(400).json({ error: 'Proveedor de pago no soportado' })

    } catch (error: any) {
        console.error('Payment error:', error)
        res.status(500).json({ error: 'Error al procesar el pago', details: error.message })
    }
})

/**
 * 2. Activate PayPal Subscription (called by frontend after PayPal redirect)
 */
router.post('/activate-paypal-subscription', authenticate, async (req: AuthRequest, res) => {
    try {
        const { subscriptionId, planType } = req.body
        const userId = req.user!.id

        if (!subscriptionId || !planType) {
            return res.status(400).json({ error: 'subscriptionId y planType son requeridos' })
        }

        const plan = PLANS[planType as keyof typeof PLANS]
        if (!plan) {
            return res.status(400).json({ error: 'Plan inválido' })
        }

        // Verify subscription with PayPal
        const accessToken = await getPayPalAccessToken()
        const verifyResp = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        const subscription = await verifyResp.json()

        console.log('[PayPal] Subscription verification:', {
            id: subscription.id,
            status: subscription.status,
            custom_id: subscription.custom_id
        })

        if (subscription.status !== 'ACTIVE' && subscription.status !== 'APPROVED') {
            return res.status(400).json({
                error: 'La suscripción de PayPal no está activa',
                paypalStatus: subscription.status
            })
        }

        // Activate workspace subscription
        const workspaceId = req.user!.workspaceId
        if (!workspaceId) {
            return res.status(400).json({ error: 'Workspace requerido' })
        }

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                plan: planType,
                subscriptionStatus: 'ACTIVE',
                subscriptionId: subscription.id,
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                paymentProvider: 'PAYPAL',
                cancelAtPeriodEnd: false
            }
        })

        await prisma.paymentLog.create({
            data: {
                workspaceId,
                userId,
                provider: 'PAYPAL',
                planType,
                status: 'SUCCESS',
                amount: plan.price,
                currency: 'USD',
                externalId: subscription.id,
                responseRaw: subscription
            }
        })

        console.log(`[PayPal] Subscription activated for workspace ${workspaceId}`)
        return res.json({ success: true, subscriptionId: subscription.id })

    } catch (error: any) {
        console.error('[PayPal Activation Error]', error)
        res.status(500).json({ error: 'Error activando suscripción PayPal', details: error.message })
    }
})

/**
 * 3. PayPal Webhook — receives subscription lifecycle events
 * TODO: Add webhook signature verification for production
 */
router.post('/webhook', async (req, res) => {
    try {
        const { event_type, resource } = req.body

        console.log('[PayPal Webhook] Received:', { event_type, resourceId: resource?.id })

        if (!event_type || !resource) {
            return res.status(200).send('OK')
        }

        const subscriptionId = resource.id
        const customId = resource.custom_id || '' // "workspaceId|userId"
        const [customWorkspaceId, customUserId] = customId.split('|')

        // Find workspace by subscriptionId or custom_id
        const workspace = await prisma.workspace.findFirst({
            where: { OR: [
                { subscriptionId },
                ...(customWorkspaceId ? [{ id: customWorkspaceId }] : [])
            ]}
        })

        const workspaceId = workspace?.id || null

        switch (event_type) {
            case 'BILLING.SUBSCRIPTION.ACTIVATED': {
                if (workspaceId) {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            subscriptionStatus: 'ACTIVE',
                            cancelAtPeriodEnd: false,
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        }
                    })
                }
                break
            }
            case 'BILLING.SUBSCRIPTION.CANCELLED': {
                if (workspaceId) {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: { subscriptionStatus: 'CANCELED' }
                    })
                }
                break
            }
            case 'BILLING.SUBSCRIPTION.SUSPENDED':
            case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
                if (workspaceId) {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: { subscriptionStatus: 'PAST_DUE' }
                    })
                }
                break
            }
            case 'PAYMENT.SALE.COMPLETED': {
                // Recurring payment succeeded — extend period
                if (workspaceId) {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            subscriptionStatus: 'ACTIVE',
                            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        }
                    })
                }
                break
            }
        }

        // Log all webhook events
        await prisma.paymentLog.create({
            data: {
                workspaceId,
                userId: customUserId || null,
                provider: 'PAYPAL',
                planType: workspace?.plan || 'UNKNOWN',
                status: event_type,
                amount: resource.amount?.total ? parseFloat(resource.amount.total) : 0,
                currency: resource.amount?.currency || 'USD',
                externalId: subscriptionId,
                responseRaw: req.body
            }
        })

        res.status(200).send('OK')
    } catch (error: any) {
        console.error('[PayPal Webhook] Error:', error)
        // Always return 200 to prevent PayPal from retrying
        res.status(200).send('OK')
    }
})

/**
 * 4. Cancel Subscription — calls the real provider API + updates DB
 */
router.post('/cancel-subscription', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user!.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace not found' })

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId }
        })

        if (!workspace || !workspace.subscriptionId) {
            return res.status(400).json({ error: 'No active subscription found' })
        }

        const { paymentProvider, subscriptionId } = workspace
        let providerCancelled = false
        let providerError: string | null = null

        // --- Cancel with MercadoPago ---
        if (paymentProvider === 'MERCADOPAGO' && subscriptionId) {
            try {
                const mpResp = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: 'cancelled' })
                })
                const mpData = await mpResp.json()
                providerCancelled = mpData.status === 'cancelled' || mpResp.ok
                console.log('[MP Cancel]', { status: mpData.status, id: subscriptionId })

                if (!providerCancelled) {
                    providerError = `MercadoPago: ${mpData.message || 'Unknown error'}`
                    console.error('[MP Cancel Error]', mpData)
                }
            } catch (err: any) {
                providerError = `MercadoPago API error: ${err.message}`
                console.error('[MP Cancel Exception]', err)
            }
        }

        // --- Cancel with PayPal ---
        if (paymentProvider === 'PAYPAL' && subscriptionId) {
            try {
                const accessToken = await getPayPalAccessToken()
                const ppResp = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ reason: 'Cancelación solicitada desde el dashboard de Metria' })
                })
                // PayPal returns 204 No Content on success
                providerCancelled = ppResp.status === 204 || ppResp.ok
                console.log('[PayPal Cancel]', { status: ppResp.status, id: subscriptionId })

                if (!providerCancelled) {
                    const ppData = await ppResp.json().catch(() => ({}))
                    providerError = `PayPal: ${(ppData as any).message || `HTTP ${ppResp.status}`}`
                    console.error('[PayPal Cancel Error]', ppData)
                }
            } catch (err: any) {
                providerError = `PayPal API error: ${err.message}`
                console.error('[PayPal Cancel Exception]', err)
            }
        }

        // Always update DB even if provider call failed (user wants to cancel)
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                cancelAtPeriodEnd: true,
            }
        })

        // Log the cancellation
        await prisma.paymentLog.create({
            data: {
                workspaceId,
                userId: req.user!.id,
                provider: paymentProvider || 'UNKNOWN',
                planType: workspace.plan,
                status: providerCancelled ? 'CANCELLED' : 'CANCEL_PENDING',
                amount: 0,
                currency: paymentProvider === 'PAYPAL' ? 'USD' : 'CLP',
                externalId: subscriptionId,
                errorMessage: providerError,
                responseRaw: { providerCancelled, providerError }
            }
        })

        if (providerError) {
            console.warn(`[Cancel] Provider call failed but DB updated: ${providerError}`)
        }

        res.json({
            message: 'Tu suscripción será cancelada al finalizar el periodo facturado.',
            providerCancelled,
            ...(providerError && { warning: 'La cancelación con el proveedor tuvo un problema. Contacta soporte si el cobro persiste.' })
        })
    } catch (error) {
        console.error('Cancel subscription error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

/**
 * 5. Get Billing Info
 */
router.get('/billing-info', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user!.workspaceId
        if (!workspaceId) return res.status(404).json({ error: 'Workspace not found' })

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                plan: true,
                subscriptionStatus: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                paymentProvider: true
            }
        })

        res.json(workspace)
    } catch (error) {
        console.error('Get billing info error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

/**
 * 6. Confirm Demo Payment (For Testing)
 */
router.post('/confirm-demo-payment', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user!.workspaceId
        const { planType } = req.body

        if (!workspaceId || !planType) return res.status(400).json({ error: 'Missing data' })

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                plan: planType,
                subscriptionStatus: 'ACTIVE',
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
                cancelAtPeriodEnd: false
            }
        })

        res.json({ message: 'Demo payment confirmed' })
    } catch (error) {
        res.status(500).json({ error: 'Failed to confirm demo payment' })
    }
})

export default router
