import { PrismaClient } from '@prisma/client';
import { invalidateWorkspaceCache } from './src/middleware/cache';

const prisma = new PrismaClient();

async function main() {
  const workspaces = await prisma.workspace.findMany();
  for (const w of workspaces) {
      console.log(`Clearing cache for Workspace: ${w.id} (${w.name})`);
      await invalidateWorkspaceCache(w.id);
  }
  
  // Also clear the 'public' cache just in case
  console.log(`Clearing cache for 'public'`);
  await invalidateWorkspaceCache('public');
  
  console.log('All caches cleared!');
}

main().finally(() => prisma.$disconnect());
