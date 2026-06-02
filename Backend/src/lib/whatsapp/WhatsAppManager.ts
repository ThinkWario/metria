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
    client.on('ready', () => {
      console.log(`[WhatsApp] Client is ready for workspace: ${workspaceId}`);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:ready');
      
      // Update channel status in DB
      prisma.channel.update({
        where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
        data: { status: 'CONNECTED', updatedAt: new Date() }
      }).catch(err => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
    });

    // Event: Incoming Message
    client.on('message', async (msg: WWebMessage) => {
      console.log(`[WhatsApp] New message from ${msg.from} in workspace ${workspaceId}`);
      // Bridge to the messaging service logic
      this.handleInboundMessage(workspaceId, msg);
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
      console.log(`[WhatsApp] Disconnected workspace ${workspaceId}:`, reason);
      this.clients.delete(workspaceId);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:disconnected', { reason });
      
      prisma.channel.update({
        where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
        data: { status: 'DISCONNECTED', updatedAt: new Date() }
      }).catch(err => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
    });

    client.initialize().catch(err => {
      console.error(`[WhatsApp] Initialization failed for ${workspaceId}:`, err);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:error', { message: 'Initialization failed' });
    });

    this.clients.set(workspaceId, client);
  }

  /**
   * Bridges inbound messages to Metria's internal processing logic.
   */
  private async handleInboundMessage(workspaceId: string, msg: WWebMessage) {
    try {
      // Import dynamically to avoid circular dependencies if any
      const { processInboundMessage } = await import('../../modules/messaging/message.service');
      
      await processInboundMessage({
        workspaceId,
        platform: 'WHATSAPP',
        externalId: msg.from,
        content: msg.body,
        fromName: msg.author || 'WhatsApp User',
        timestamp: new Date()
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
