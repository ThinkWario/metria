const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.paymentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  logs.forEach(log => {
      console.log('-------------------');
      console.log('ID:', log.id);
      console.log('Status:', log.status);
      console.log('Error:', log.errorMessage);
      console.log('Cardholder (Raw):', log.responseRaw?.message);
      console.log('Date:', log.createdAt);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
