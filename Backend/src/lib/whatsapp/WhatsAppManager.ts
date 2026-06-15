import { Client, LocalAuth, Message as WWebMessage } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { getIO } from '../socket';
import { prisma } from '../prisma';
import path from 'path';

/**
 * WhatsAppSessionManager
 * Manages multiple WhatsApp sessions (one per workspace) using whatsapp-web.js.
 * Handles QR generation, authentication, and message bridging.
 */
export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;
  private clients: Map<string, Client> = new Map();
  private readonly authPath = path.join(process.cwd(), '.wwebjs_auth');

  private constructor() {}

  public static getInstance(): WhatsAppSessionManager {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }
    return WhatsAppSessionManager.instance;
  }

  /**
   * Initializes a WhatsApp client for a specific workspace.
   */
  public async initSession(workspaceId: string): Promise<void> {
    if (this.clients.has(workspaceId)) {
      console.log(`[WhatsApp] Session already exists for workspace: ${workspaceId}`);
      return;
    }

    console.log(`[WhatsApp] Initializing session for workspace: ${workspaceId}`);
    
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: workspaceId,
        dataPath: this.authPath
      }),
      puppeteer: {
        headless: true,
        protocolTimeout: 120000,
        // In containers, point to system Chromium (e.g. /usr/bin/chromium)
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    const io = getIO();

    // Event: QR Code Received
    client.on('qr', async (qr) => {
      console.log(`[WhatsApp] QR received for workspace: ${workspaceId}`);
      try {
        const qrImage = await qrcode.toDataURL(qr);
        io.to(`workspace:${workspaceId}`).emit('whatsapp:qr', { qr: qrImage });
      } catch (err) {
        console.error(`[WhatsApp] Error generating QR for ${workspaceId}:`, err);
      }
    });

    // Event: Authenticated
    client.on('authenticated', () => {
      console.log(`[WhatsApp] Authenticated workspace: ${workspaceId}`);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:authenticated');
    });

    // Event: Ready
    client.on('ready', async () => {
      console.log(`[WhatsApp] Client is ready for workspace: ${workspaceId}`);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:ready');

      // Upsert channel row — native QR never creates it via API setup
      await prisma.channel.upsert({
        where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
        create: {
          workspaceId,
          platform: 'WHATSAPP',
          name: 'WhatsApp',
          status: 'CONNECTED',
          config: { isNative: true, isAiEnabled: true }
        },
        update: {
          status: 'CONNECTED',
          config: { isNative: true, isAiEnabled: true }
        }
      }).catch(err => console.error(`[WhatsApp] DB Upsert Error (${workspaceId}):`, err));

      // Initial Sync of recent chats
      this.syncChats(workspaceId).catch(err => 
        console.error(`[WhatsApp] Initial sync failed for ${workspaceId}:`, err)
      );
    });

    // Event: Incoming Message
    client.on('message', async (msg: WWebMessage) => {
      this.handleInboundMessage(workspaceId, msg);
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
      console.log(`[WhatsApp] Disconnected workspace ${workspaceId}:`, reason);
      this.clients.delete(workspaceId);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:disconnected', { reason });

      // updateMany is safe even if no row exists yet
      prisma.channel.updateMany({
        where: { workspaceId, platform: 'WHATSAPP' },
        data: { status: 'DISCONNECTED' }
      }).catch(err => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
    });

    client.initialize().catch(err => {
      console.error(`[WhatsApp] Initialization failed for ${workspaceId}:`, err);
      // Remove the dead client so the next init attempt can retry instead of
      // hitting the "session already exists" early-return forever
      this.clients.delete(workspaceId);
      client.destroy().catch(() => {});
      io.to(`workspace:${workspaceId}`).emit('whatsapp:error', { message: 'Initialization failed' });
    });

    this.clients.set(workspaceId, client);
  }

  /**
   * Fetches recent chats from the phone and creates them in Metria.
   */
  public async syncChats(workspaceId: string): Promise<void> {
    const client = this.clients.get(workspaceId);
    if (!client) return;

    console.log(`[WhatsApp] Syncing chats for ${workspaceId}...`);

    const channel = await prisma.channel.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
      select: { id: true }
    });
    if (!channel) {
      console.error(`[WhatsApp] Channel row missing for ${workspaceId} — skipping sync`);
      return;
    }

    const chats = await client.getChats();
    // Skip groups and WhatsApp internal addresses
    const recentChats = chats
      .filter(c => !c.isGroup && !c.id._serialized.includes('broadcast'))
      .slice(0, 20);

    const { processInboundMessage } = await import('../../modules/messaging/message.service');

    for (const chat of recentChats) {
      const lastMsg = await chat.fetchMessages({ limit: 1 });
      if (lastMsg.length > 0 && lastMsg[0].body) {
        // @lid IDs are WhatsApp internal — resolve to real phone via getContactById
        let senderPhone: string;
        const isLid = chat.id._serialized.endsWith('@lid');
        if (isLid) {
          try {
            const waContact = await client.getContactById(chat.id._serialized);
            senderPhone = waContact.number ? `+${waContact.number}` : chat.id._serialized;
          } catch {
            senderPhone = chat.id._serialized;
          }
        } else {
          senderPhone = chat.id._serialized.split('@')[0];
        }
        await processInboundMessage({
          workspaceId,
          channelId: channel.id,
          externalConversationId: chat.id._serialized,
          externalMessageId: lastMsg[0].id._serialized,
          senderExternalId: senderPhone,
          senderName: chat.name || 'WhatsApp User',
          content: lastMsg[0].body
        }).catch(() => {});
      }
    }
    console.log(`[WhatsApp] Sync complete for ${workspaceId}`);
  }

  /**
   * Sends a message through the native client.
   */
  public async sendMessage(workspaceId: string, to: string, content: string): Promise<void> {
    const client = this.clients.get(workspaceId);
    if (!client) throw new Error('WhatsApp session not active');
    await client.sendMessage(to, content);
  }

  /**
   * Bridges inbound messages to Metria's internal processing logic.
   */
  private async handleInboundMessage(workspaceId: string, msg: WWebMessage) {
    // Ignore WhatsApp internal broadcasts (status updates, etc.)
    if (msg.from === 'status@broadcast' || msg.from?.includes('broadcast')) return;
    // Ignore empty messages
    if (!msg.body) return;

    console.log(`[WhatsApp] New message from ${msg.from} in workspace ${workspaceId}`);

    try {
      const channel = await prisma.channel.findUnique({
        where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
        select: { id: true }
      });
      if (!channel) {
        console.error(`[WhatsApp] Channel row missing for ${workspaceId} — message dropped`);
        return;
      }

      const { processInboundMessage } = await import('../../modules/messaging/message.service');

      // @lid = WhatsApp internal linked-device ID, NOT a phone number.
      // Try getContact() to resolve the real phone; fall back to the raw ID.
      let senderPhone: string;
      const isLid = msg.from.endsWith('@lid');
      if (isLid) {
        try {
          const waContact = await msg.getContact();
          senderPhone = waContact.number ? `+${waContact.number}` : msg.from;
        } catch {
          senderPhone = msg.from;
        }
      } else {
        senderPhone = msg.from.split('@')[0];
      }

      await processInboundMessage({
        workspaceId,
        channelId: channel.id,
        externalConversationId: msg.from,
        externalMessageId: msg.id._serialized,
        senderExternalId: senderPhone,
        senderName: (msg as any)._data?.notifyName || msg.author || 'WhatsApp User',
        content: msg.body
      });
    } catch (err) {
      console.error(`[WhatsApp] Error processing inbound message for ${workspaceId}:`, err);
    }
  }

  /**
   * Disconnects and removes a session.
   */
  public async destroySession(workspaceId: string): Promise<void> {
    const client = this.clients.get(workspaceId);
    if (client) {
      await client.logout();
      await client.destroy();
      this.clients.delete(workspaceId);
    }
  }
}
