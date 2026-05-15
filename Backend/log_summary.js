const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.paymentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  console.log(logs.map(l => ({
    id: l.id,
    status: l.status,
    error: l.errorMessage,
    time: l.createdAt
  })));
}

main().finally(() => prisma.$disconnect());
