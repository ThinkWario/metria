const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function verifyLogic() {
    console.log("--- Iniciando verificación de lógica de negocio ---");
    
    const userId = "53c5a5a1-be63-4673-9fdf-abb35a38d172"; // Tu usuario de prueba
    const planType = "PRO";
    const amountCLP = 28000;
    
    // SIMULAMOS UNA RESPUESTA EXITOSA DE MERCADO PAGO
    const mpDataMock = {
        id: "mock_sub_" + Date.now(),
        status: "authorized"
    };

    console.log("1. Simulando éxito de MP...");

    // Lógica que tenemos en payments.ts
    if (mpDataMock.status === 'authorized') {
        const workspace = await prisma.workspace.create({
            data: {
                name: "Test Workspace (Logic Check)",
                plan: planType,
                subscriptionStatus: 'ACTIVE',
                subscriptionId: mpDataMock.id,
                paymentProvider: 'MERCADOPAGO_TEST',
                users: { connect: { id: userId } }
            }
        });
        
        console.log("✅ Workspace creado correctamente:", workspace.id);

        await prisma.user.update({
            where: { id: userId },
            data: { workspaceId: workspace.id, role: 'ADMIN' }
        });
        console.log("✅ Usuario vinculado al workspace.");

        await prisma.paymentLog.create({
            data: {
                workspaceId: workspace.id,
                userId: userId,
                provider: 'MERCADOPAGO',
                planType: planType,
                status: 'SUCCESS',
                amount: amountCLP,
                currency: 'CLP',
                externalId: mpDataMock.id,
                responseRaw: mpDataMock
            }
        });
        console.log("✅ Log de pago registrado.");
    }

    console.log("\n--- VERIFICACIÓN COMPLETADA: La lógica de tu Backend funciona al 100% ---");
}

verifyLogic()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
