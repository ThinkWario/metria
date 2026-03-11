import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

    // 0.5. Create Super Admin User
    await prisma.user.upsert({
        where: { email: 'superadmin@metria.ai' },
        update: {},
        create: {
            email: 'superadmin@metria.ai',
            passwordHash: 'masterkey',
            name: 'Master Account',
            role: 'SUPER_ADMIN',
        }
    })

    // 1. Create Default Admin User linked to Workspace
    await prisma.user.upsert({
        where: { email: 'admin@metria.com' },
        update: { workspaceId: defaultWorkspace.id },
        create: {
            email: 'admin@metria.com',
            passwordHash: 'metria2025', // Mock clear text password
            name: 'Admin Dashboard',
            role: 'ADMIN',
            workspaceId: defaultWorkspace.id
        }
    })

    // 2. Create Products (SKUs)
    const products = [
        { sku: 'HOG-001-A', name: 'Limpiador Ultrasónico', cogs: 12.50, price: 29.90 },
        { sku: 'TEC-005', name: 'Auriculares Inalámbricos', cogs: 15.00, price: 45.00 },
        { sku: 'FIT-002-B', name: 'Bandas Elásticas Pro', cogs: 5.80, price: 15.00 }
    ]

    for (let p of products) {
        await prisma.product.upsert({
            where: { workspaceId_sku: { workspaceId: defaultWorkspace.id, sku: p.sku } },
            update: {},
            create: { ...p, workspaceId: defaultWorkspace.id }
        })
    }

    // 3. Create Fixed Costs
    const fixedCosts = [
        { name: "Shopify Plan", amount: 39.00, category: "Suscripción" },
        { name: "Dominio (Anual / 12)", amount: 1.50, category: "Infraestructura" },
        { name: "Herramienta Email", amount: 25.00, category: "Marketing" },
        { name: "Sueldo Asistente", amount: 400.00, category: "Nómina" },
    ]

    await prisma.fixedCost.deleteMany({ where: { workspaceId: defaultWorkspace.id } })
    for (let c of fixedCosts) {
        await prisma.fixedCost.create({ data: { ...c, workspaceId: defaultWorkspace.id } })
    }

    // Clear existing to avoid duplicates
    await prisma.shipment.deleteMany({ where: { workspaceId: defaultWorkspace.id } })
    await prisma.order.deleteMany({ where: { workspaceId: defaultWorkspace.id } })
    await prisma.dailyMetric.deleteMany({ where: { workspaceId: defaultWorkspace.id } })

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
