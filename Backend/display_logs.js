const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.paymentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
        workspace: { select: { name: true } }
    }
  });
  
  console.log('=== ÚLTIMOS 3 INTENTOS DE PAGO ===');
  logs.forEach((log, i) => {
    console.log(`\nIntento #${i + 1}`);
    console.log(`Fecha: ${log.createdAt.toLocaleString()}`);
    console.log(`Estado DB: ${log.status}`);
    console.log(`Proveedor: ${log.provider}`);
    console.log(`Plan: ${log.planType}`);
    console.log(`Monto: ${log.amount} ${log.currency}`);
    console.log(`Error: ${log.errorMessage || 'Ninguno'}`);
    console.log(`Workspace: ${log.workspace?.name || 'Nuevo Usuario'}`);
  });
}

main().finally(() => prisma.$disconnect());
