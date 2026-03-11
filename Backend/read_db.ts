import { prisma } from './src/lib/prisma';
async function main() {
    const integrations = await prisma.integration.findMany();
    console.log(JSON.stringify(integrations, null, 2));
}
main().finally(() => prisma.$disconnect());
