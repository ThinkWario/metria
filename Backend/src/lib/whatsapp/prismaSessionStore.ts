import { promises as fs } from 'fs';
import { prisma } from '../prisma';

/**
 * Implements whatsapp-web.js's RemoteAuth store contract on top of Postgres.
 * RemoteAuth zips the Chromium profile to a local file and calls save()/
 * extract() by convention (it does not pass the zip path to save() — the
 * store has to know it lives at `<dataPath>/<session>.zip`), so this must
 * be constructed with the same dataPath the client uses.
 */
export class PrismaWhatsAppStore {
  constructor(
    private readonly workspaceId: string,
    private readonly dataPath: string
  ) {}

  private zipPath(session: string): string {
    return `${this.dataPath}/${session}.zip`;
  }

  async sessionExists({ session }: { session: string }): Promise<boolean> {
    const row = await prisma.whatsAppSession.findUnique({ where: { session }, select: { id: true } });
    return !!row;
  }

  async save({ session }: { session: string }): Promise<void> {
    const data = await fs.readFile(this.zipPath(session));
    await prisma.whatsAppSession.upsert({
      where: { session },
      create: { workspaceId: this.workspaceId, session, data },
      update: { data }
    });
  }

  async extract({ session, path }: { session: string; path: string }): Promise<void> {
    const row = await prisma.whatsAppSession.findUnique({ where: { session }, select: { data: true } });
    if (!row) throw new Error(`No stored WhatsApp session found for ${session}`);
    await fs.writeFile(path, row.data);
  }

  async delete({ session }: { session: string }): Promise<void> {
    await prisma.whatsAppSession.deleteMany({ where: { session } });
  }
}
