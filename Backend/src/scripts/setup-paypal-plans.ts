/**
 * Setup PayPal Billing Plans for Metria Metrics
 *
 * Run once to create Product + Billing Plans in PayPal Sandbox.
 * Usage: npx tsx src/scripts/setup-paypal-plans.ts
 *
 * Prerequisites: Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env
 */
import 'dotenv/config'

const PAYPAL_API_URL = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com'
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET

if (!CLIENT_ID || CLIENT_ID === '...' || !CLIENT_SECRET || CLIENT_SECRET === '...') {
    console.error('❌ Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env first.')
    console.error('   Get them from: https://developer.paypal.com/dashboard/applications/sandbox')
    process.exit(1)
}

async function getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const res = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })
    const data = await res.json()
    if (!data.access_token) {
        throw new Error(`OAuth failed: ${JSON.stringify(data)}`)
    }
    return data.access_token
}

async function createProduct(token: string): Promise<string> {
    const res = await fetch(`${PAYPAL_API_URL}/v1/catalogs/products`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `metria-product-${Date.now()}`
        },
        body: JSON.stringify({
            name: 'Metria Metrics',
            description: 'SaaS e-commerce analytics platform',
            type: 'SERVICE',
            category: 'SOFTWARE'
        })
    })
    const data = await res.json()
    if (!data.id) {
        throw new Error(`Product creation failed: ${JSON.stringify(data)}`)
    }
    console.log(`✅ Product created: ${data.id} (${data.name})`)
    return data.id
}

async function createBillingPlan(
    token: string,
    productId: string,
    name: string,
    price: string
): Promise<string> {
    const res = await fetch(`${PAYPAL_API_URL}/v1/billing/plans`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `metria-plan-${name.toLowerCase()}-${Date.now()}`
        },
        body: JSON.stringify({
            product_id: productId,
            name,
            description: `Metria Metrics - ${name} (Monthly)`,
            status: 'ACTIVE',
            billing_cycles: [
                {
                    frequency: {
                        interval_unit: 'MONTH',
                        interval_count: 1
                    },
                    tenure_type: 'REGULAR',
                    sequence: 1,
                    total_cycles: 0, // infinite
                    pricing_scheme: {
                        fixed_price: {
                            value: price,
                            currency_code: 'USD'
                        }
                    }
                }
            ],
            payment_preferences: {
                auto_bill_outstanding: true,
                setup_fee_failure_action: 'CANCEL',
                payment_failure_threshold: 3
            }
        })
    })
    const data = await res.json()
    if (!data.id) {
        throw new Error(`Plan creation failed: ${JSON.stringify(data)}`)
    }
    console.log(`✅ Plan created: ${data.id} — ${name} ($${price}/mo)`)
    return data.id
}

async function main() {
    console.log(`\n🔧 PayPal Setup — ${PAYPAL_API_URL}\n`)

    const token = await getAccessToken()
    console.log('✅ OAuth2 token obtained\n')

    const productId = await createProduct(token)
    const proPlanId = await createBillingPlan(token, productId, 'Professional', '29.00')
    const scalePlanId = await createBillingPlan(token, productId, 'Scale', '79.00')

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 Add these to your Backend/.env:\n')
    console.log(`PAYPAL_PLAN_PRO_ID="${proPlanId}"`)
    console.log(`PAYPAL_PLAN_SCALE_ID="${scalePlanId}"`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => {
    console.error('❌ Setup failed:', err.message)
    process.exit(1)
})
