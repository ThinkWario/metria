import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Shopify Database Heal...');
    
    // Get the workspace integration
    const integration = await prisma.integration.findFirst({
        where: { platform: 'shopify' }
    });

    if (!integration || !integration.config) {
        throw new Error('No Shopify integration found');
    }

    const workspaceId = integration.workspaceId;
    const config = integration.config as Record<string, string>;
    const domain = config.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const accessToken = config.accessToken;

    if (!domain || !accessToken) {
        throw new Error('Missing domain or accessToken in Shopify config');
    }

    console.log(`Fetching orders from Shopify for domain: ${domain}...`);

    // Fetch pagination for up to 500 orders to be safe
    let url = `https://${domain}/admin/api/2024-01/orders.json?status=any&limit=250`;
    let hasNextPage = true;
    let processed = 0;

    while (hasNextPage && url) {
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Shopify Sync API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const orders = data.orders || [];

        for (const order of orders) {
            const mappedLineItems = order.line_items.map((item: any) => {
                const price = parseFloat(item.price || 0);
                const qty = item.quantity || 1;
                const discount = parseFloat(item.total_discount || 0);
                const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
                return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
            });

            // Update only lineItems for existing orders, or upsert
            await prisma.order.upsert({
                where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
                update: {
                    lineItems: mappedLineItems
                },
                create: {
                    workspaceId,
                    orderId: order.name,
                    shopifyId: order.id.toString(),
                    customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Unknown',
                    customerEmail: order.email,
                    totalPrice: parseFloat(order.total_price),
                    currency: order.currency,
                    financialStatus: order.financial_status,
                    fulfillmentStatus: order.fulfillment_status,
                    lineItems: mappedLineItems,
                    createdAt: new Date(order.created_at)
                }
            });
            processed++;
        }

        const linkHeader = response.headers.get('link');
        if (linkHeader) {
            const nextLink = linkHeader.split(',').find(s => s.includes('rel="next"'));
            if (nextLink) {
                const match = nextLink.match(/<([^>]+)>/);
                url = match ? match[1] : '';
            } else {
                hasNextPage = false;
            }
        } else {
            hasNextPage = false;
        }
    }

    console.log(`Done! Successfully synced lineItems with correct price logic for ${processed} orders.`);
    
    // Let's verify DEA0078
    const dbCheck = await prisma.order.findFirst({
        where: { orderId: '#1199', workspaceId }
    });
    
    if (dbCheck) {
        console.log('\nVerification of Order #1199 (DEA0078):');
        const items = dbCheck.lineItems as any[];
        const targetItem = items.find(i => i.sku === 'DEA0078');
        console.log(JSON.stringify(targetItem, null, 2));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
