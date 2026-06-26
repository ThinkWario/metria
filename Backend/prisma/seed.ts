import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

function daysAgo(n: number): Date {
    const d = new Date()
    d.setDate(d.getDate() - n)
    d.setHours(10, 0, 0, 0)
    return d
}

async function main() {
    console.log('Seeding database with mock data for Multi-Tenant Architecture...')

    // 0. Create Default Workspace
    const defaultWorkspace = await prisma.workspace.upsert({
        where: { id: 'workspace-default' },
        update: {},
        create: {
            id: 'workspace-default',
            name: 'Metria Demo Store'
        }
    })

    console.log('Created workspace:', defaultWorkspace.id)
    const wid = defaultWorkspace.id

    // 0.5. Create Super Admin User
    const superAdminPassword = await bcrypt.hash('masterkey', 10)
    await prisma.user.upsert({
        where: { email: 'superadmin@metria.ai' },
        update: {},
        create: {
            email: 'superadmin@metria.ai',
            passwordHash: superAdminPassword,
            name: 'Master Account',
            role: 'SUPER_ADMIN',
        }
    })

    // 1. Create Default Admin User linked to Workspace
    const adminPassword = await bcrypt.hash('metria2025', 10)
    await prisma.user.upsert({
        where: { email: 'admin@metria.com' },
        update: { workspaceId: wid },
        create: {
            email: 'admin@metria.com',
            passwordHash: adminPassword,
            name: 'Admin Dashboard',
            role: 'ADMIN',
            workspaceId: wid
        }
    })

    // 2. Create Products (SKUs)
    const products = [
        { sku: 'HOG-001-A', name: 'Limpiador Ultrasónico', cogs: 12.50, price: 29.90 },
        { sku: 'TEC-005', name: 'Auriculares Inalámbricos', cogs: 15.00, price: 45.00 },
        { sku: 'FIT-002-B', name: 'Bandas Elásticas Pro', cogs: 5.80, price: 15.00 }
    ]

    for (const p of products) {
        await prisma.product.upsert({
            where: { workspaceId_sku: { workspaceId: wid, sku: p.sku } },
            update: {},
            create: { ...p, workspaceId: wid }
        })
    }

    // 3. Create Fixed Costs
    const fixedCosts = [
        { name: "Shopify Plan", amount: 39.00, category: "Suscripción" },
        { name: "Dominio (Anual / 12)", amount: 1.50, category: "Infraestructura" },
        { name: "Herramienta Email", amount: 25.00, category: "Marketing" },
        { name: "Sueldo Asistente", amount: 400.00, category: "Nómina" },
    ]

    await prisma.fixedCost.deleteMany({ where: { workspaceId: wid } })
    for (const c of fixedCosts) {
        await prisma.fixedCost.create({ data: { ...c, workspaceId: wid } })
    }

    // Clear existing to avoid duplicates
    await prisma.appointment.deleteMany({ where: { workspaceId: wid } })
    await prisma.ticket.deleteMany({ where: { workspaceId: wid } })
    await prisma.deal.deleteMany({ where: { workspaceId: wid } })
    const existingPipelines = await prisma.pipeline.findMany({ where: { workspaceId: wid }, select: { id: true } })
    const pipelineIds = existingPipelines.map(p => p.id)
    if (pipelineIds.length > 0) {
        await prisma.pipelineStage.deleteMany({ where: { pipelineId: { in: pipelineIds } } })
    }
    await prisma.pipeline.deleteMany({ where: { workspaceId: wid } })
    await prisma.formSubmission.deleteMany({ where: { workspaceId: wid } })
    await prisma.form.deleteMany({ where: { workspaceId: wid } })
    await prisma.shipment.deleteMany({ where: { workspaceId: wid } })
    await prisma.order.deleteMany({ where: { workspaceId: wid } })
    await prisma.dailyMetric.deleteMany({ where: { workspaceId: wid } })
    await prisma.contact.deleteMany({ where: { workspaceId: wid } })

    // 4. CRM Contacts (with emails for revenue-summary linking)
    const contactsData = [
        { name: 'Ana García', email: 'ana.garcia@demo.cl', phone: '+56912345678', status: 'CUSTOMER', leadTemperature: 'HOT' },
        { name: 'Carlos Mendoza', email: 'carlos.m@demo.cl', phone: '+56987654321', status: 'LEAD', leadTemperature: 'WARM' },
        { name: 'María Torres', email: 'maria.torres@demo.cl', phone: '+56911111222', status: 'CUSTOMER', leadTemperature: 'HOT' },
        { name: 'Pedro Ramos', email: 'pedro.r@demo.cl', phone: '+56933334444', status: 'PROSPECT', leadTemperature: 'COLD' },
        { name: 'Sofía Herrera', email: 'sofia.h@demo.cl', phone: '+56955556666', status: 'LEAD', leadTemperature: 'WARM' },
    ]

    const contacts = await Promise.all(
        contactsData.map(c => prisma.contact.create({ data: { ...c, workspaceId: wid, source: 'MANUAL' } }))
    )

    // 5. Orders (linked by email to contacts for revenue-summary)
    const ordersData = [
        // Ana García - 4 orders
        { email: 'ana.garcia@demo.cl', total: 89.70, daysBack: 5 },
        { email: 'ana.garcia@demo.cl', total: 45.00, daysBack: 20 },
        { email: 'ana.garcia@demo.cl', total: 29.90, daysBack: 45 },
        { email: 'ana.garcia@demo.cl', total: 135.60, daysBack: 90 },
        // María Torres - 3 orders
        { email: 'maria.torres@demo.cl', total: 59.80, daysBack: 10 },
        { email: 'maria.torres@demo.cl', total: 45.00, daysBack: 25 },
        { email: 'maria.torres@demo.cl', total: 29.90, daysBack: 60 },
        // Carlos Mendoza - 1 order
        { email: 'carlos.m@demo.cl', total: 45.00, daysBack: 15 },
    ]

    let orderSeq = 1000
    for (const o of ordersData) {
        const orderDate = daysAgo(o.daysBack)
        const seq = orderSeq++
        await prisma.order.create({
            data: {
                workspaceId: wid,
                orderId: `DEMO-${seq}`,
                shopifyId: `demo_${seq}`,
                customerEmail: o.email,
                totalPrice: o.total,
                financialStatus: 'paid',
                fulfillmentStatus: 'fulfilled',
                lineItems: [],
                createdAt: orderDate,
            }
        })
    }

    // 6. DailyMetric — 35 days of data
    for (let i = 34; i >= 0; i--) {
        const date = daysAgo(i)
        date.setHours(0, 0, 0, 0)
        const revenue = 800 + Math.random() * 1200
        const metaSpend = 80 + Math.random() * 120
        const googleSpend = 40 + Math.random() * 60
        const tiktokSpend = 20 + Math.random() * 40
        const totalAd = metaSpend + googleSpend + tiktokSpend
        const cogs = revenue * 0.35
        const shipping = revenue * 0.05
        const netProfit = revenue - totalAd - cogs - shipping - 15.5 // 15.5 = daily fixed

        await prisma.dailyMetric.upsert({
            where: { workspaceId_date: { workspaceId: wid, date } },
            update: {},
            create: {
                workspaceId: wid,
                date,
                totalRevenue: Math.round(revenue * 100) / 100,
                metaAdSpend: Math.round(metaSpend * 100) / 100,
                googleAdSpend: Math.round(googleSpend * 100) / 100,
                tiktokAdSpend: Math.round(tiktokSpend * 100) / 100,
                totalShipping: Math.round(shipping * 100) / 100,
                totalCogs: Math.round(cogs * 100) / 100,
                netProfit: Math.round(netProfit * 100) / 100,
            }
        })
    }

    // 7. Pipeline + Stages + Deals
    const pipeline = await prisma.pipeline.create({
        data: { workspaceId: wid, name: 'Pipeline de Ventas', isDefault: true }
    })

    const stageNames = [
        { name: 'Prospecto', color: '#6366f1', order: 1 },
        { name: 'Calificado', color: '#f59e0b', order: 2 },
        { name: 'Propuesta', color: '#3b82f6', order: 3 },
        { name: 'Ganado', color: '#10b981', order: 4, isWon: true },
        { name: 'Perdido', color: '#ef4444', order: 5, isLost: true },
    ]

    const stages = await Promise.all(
        stageNames.map(s => prisma.pipelineStage.create({
            data: { pipelineId: pipeline.id, ...s }
        }))
    )

    const dealsData = [
        { contactIdx: 0, stageIdx: 2, title: 'Instalación Sistema Solar 6kW', value: 3200000, status: 'OPEN' },
        { contactIdx: 1, stageIdx: 1, title: 'Paneles 3kW Hogar', value: 1800000, status: 'OPEN' },
        { contactIdx: 2, stageIdx: 3, title: 'Sistema Completo 10kW', value: 5500000, status: 'WON' },
        { contactIdx: 3, stageIdx: 0, title: 'Cotización Sistema 4kW', value: 2400000, status: 'OPEN' },
        { contactIdx: 4, stageIdx: 4, title: 'Instalación Pequeña 2kW', value: 1200000, status: 'LOST', lostReason: 'Precio muy alto' },
    ]

    for (const d of dealsData) {
        await prisma.deal.create({
            data: {
                workspaceId: wid,
                pipelineId: pipeline.id,
                stageId: stages[d.stageIdx].id,
                contactId: contacts[d.contactIdx].id,
                title: d.title,
                value: d.value,
                currency: 'CLP',
                status: d.status,
                ...(d.status === 'WON' && { wonAt: daysAgo(5) }),
                ...(d.status === 'LOST' && { lostAt: daysAgo(10), lostReason: (d as any).lostReason }),
                probability: d.status === 'WON' ? 100 : d.status === 'LOST' ? 0 : 60,
            }
        })
    }

    // 8. Tickets
    const ticketsData = [
        { contactIdx: 0, title: 'Problema con inversión del sistema', status: 'OPEN', priority: 'HIGH' },
        { contactIdx: 2, title: 'Revisión técnica anual', status: 'IN_PROGRESS', priority: 'MEDIUM' },
        { contactIdx: 1, title: 'Consulta sobre garantía de paneles', status: 'RESOLVED', priority: 'LOW' },
    ]

    for (const t of ticketsData) {
        await prisma.ticket.create({
            data: {
                workspaceId: wid,
                contactId: contacts[t.contactIdx].id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                slaDeadline: t.status === 'OPEN' ? daysAgo(-2) : null,
            }
        })
    }

    // 9. Appointments
    const apptData = [
        { contactIdx: 0, type: 'SITE_VISIT', daysFromNow: 3, status: 'CONFIRMED', notes: 'Visita para instalación' },
        { contactIdx: 1, type: 'CALL', daysFromNow: 1, status: 'SCHEDULED', notes: 'Llamada de seguimiento' },
        { contactIdx: 3, type: 'SITE_VISIT', daysFromNow: 7, status: 'SCHEDULED', notes: 'Evaluación terreno' },
        { contactIdx: 2, type: 'CALL', daysFromNow: -5, status: 'COMPLETED', notes: 'Post-instalación' },
    ]

    for (const a of apptData) {
        const scheduledAt = daysAgo(-a.daysFromNow)
        scheduledAt.setHours(10 + Math.floor(Math.random() * 6), 0, 0, 0)
        await prisma.appointment.create({
            data: {
                workspaceId: wid,
                contactId: contacts[a.contactIdx].id,
                type: a.type,
                scheduledAt,
                durationMin: a.type === 'CALL' ? 30 : 60,
                status: a.status,
                notes: a.notes,
                createdBy: 'SEED',
            }
        })
    }

    // 10. Form + Submissions
    const form = await prisma.form.create({
        data: {
            workspaceId: wid,
            name: 'Solicitud de Cotización Solar',
            slug: `cotizacion-solar-${wid.slice(0, 8)}`,
            isActive: true,
            fields: [
                { id: 'f1', label: 'Nombre completo', type: 'text', required: true },
                { id: 'f2', label: 'Correo electrónico', type: 'email', required: true },
                { id: 'f3', label: 'Teléfono', type: 'tel', required: false },
                { id: 'f4', label: '¿Cuántos kW necesitas?', type: 'select', required: true, options: ['2kW', '4kW', '6kW', '10kW', 'No sé'] },
                { id: 'f5', label: 'Comentarios', type: 'textarea', required: false },
            ],
            submissionCount: 3,
        }
    })

    const submissionsData = [
        { name: 'Roberto Silva', email: 'roberto@gmail.com', kw: '6kW', comment: 'Tengo casa grande con piscina' },
        { name: 'Laura Pinto', email: 'laura.p@outlook.com', kw: '4kW', comment: '' },
        { name: 'Diego Morales', email: 'diego.m@gmail.com', kw: 'No sé', comment: 'Necesito asesoría primero' },
    ]

    for (let i = 0; i < submissionsData.length; i++) {
        const s = submissionsData[i]
        await prisma.formSubmission.create({
            data: {
                workspaceId: wid,
                formId: form.id,
                data: { f1: s.name, f2: s.email, f3: '', f4: s.kw, f5: s.comment },
                createdAt: daysAgo(i * 2 + 1),
            }
        })
    }

    console.log('Seed completed successfully.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
