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
const WATCHDOG_INTERVAL_MS = 60_000;
const GET_STATE_TIMEOUT_MS = 15_000;
/** Consecutive failed health checks before the session is recycled. */
const MAX_HEALTH_FAILURES = 2;
/** Grace period for a session that is still initializing (QR scan, auth). */
const INIT_GRACE_MS = 10 * 60_000;
const DESTROY_TIMEOUT_MS = 30_000;
/** Missed messages younger than this get an AI reply after a reconnect. */
const RECOVERY_WINDOW_S = 30 * 60;

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;
  private clients: Map<string, Client> = new Map();
  private readonly authPath = path.join(process.cwd(), '.wwebjs_auth');
  private watchdogs: Map<string, NodeJS.Timeout> = new Map();
  private healthFailures: Map<string, number> = new Map();
  private readySessions: Set<string> = new Set();
  private initStartedAt: Map<string, number> = new Map();
  private recycling: Set<string> = new Set();

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
      this.readySessions.add(workspaceId);
      this.healthFailures.delete(workspaceId);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:ready');

      // Upsert channel row — native QR never creates it via API setup.
      // Merge into the existing config so reconnects preserve isAiEnabled
      // (and any other keys) instead of force-resetting them.
      try {
        const existing = await prisma.channel.findUnique({
          where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
          select: { config: true }
        });
        const currentConfig = (existing?.config as Record<string, unknown>) ?? {};
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
            config: { isAiEnabled: true, ...currentConfig, isNative: true }
          }
        });
      } catch (err) {
        console.error(`[WhatsApp] DB Upsert Error (${workspaceId}):`, err);
      }

      // Initial Sync of recent chats
      this.syncChats(workspaceId).catch(err =>
        console.error(`[WhatsApp] Initial sync failed for ${workspaceId}:`, err)
      );
    });

    // Event: Incoming Message
    client.on('message', async (msg: WWebMessage) => {
      this.handleInboundMessage(workspaceId, msg);
    });

    client.on('change_state', (state) => {
      console.log(`[WhatsApp] State changed for ${workspaceId}: ${state}`);
    });

    client.on('auth_failure', (message) => {
      console.error(`[WhatsApp] Auth failure for ${workspaceId}: ${message}`);
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
      console.log(`[WhatsApp] Disconnected workspace ${workspaceId}:`, reason);
      this.clients.delete(workspaceId);
      this.readySessions.delete(workspaceId);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:disconnected', { reason });

      // LOGOUT means the user unlinked the device — don't fight it. Any other
      // reason is transient: the watchdog stays armed and re-initializes.
      if (String(reason).toUpperCase() === 'LOGOUT') {
        this.stopWatchdog(workspaceId);
      }

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
    this.initStartedAt.set(workspaceId, Date.now());
    this.startWatchdog(workspaceId);
  }

  /**
   * Health watchdog. whatsapp-web.js sessions can go stale silently: the
   * underlying page loses its socket and stops emitting 'message' events
   * WITHOUT firing 'disconnected' — the bot looks "asleep" until something
   * pokes the page. The watchdog detects that state via getState() and
   * recycles the session (LocalAuth re-authenticates without a new QR).
   */
  private startWatchdog(workspaceId: string): void {
    if (this.watchdogs.has(workspaceId)) return;
    const interval = setInterval(() => {
      this.checkHealth(workspaceId).catch(err =>
        console.error(`[WhatsApp][watchdog] Unexpected error for ${workspaceId}:`, err)
      );
    }, WATCHDOG_INTERVAL_MS);
    this.watchdogs.set(workspaceId, interval);
  }

  private stopWatchdog(workspaceId: string): void {
    const interval = this.watchdogs.get(workspaceId);
    if (interval) clearInterval(interval);
    this.watchdogs.delete(workspaceId);
    this.healthFailures.delete(workspaceId);
  }

  private async checkHealth(workspaceId: string): Promise<void> {
    if (this.recycling.has(workspaceId)) return;

    const client = this.clients.get(workspaceId);
    if (!client) {
      // Session vanished (failed init, transient disconnect) — self-heal.
      console.warn(`[WhatsApp][watchdog] No client for ${workspaceId}, re-initializing...`);
      await this.initSession(workspaceId);
      return;
    }

    // Still initializing (QR scan, auth): give it a grace period, then assume
    // the initialize() call hung and recycle.
    if (!this.readySessions.has(workspaceId)) {
      const startedAt = this.initStartedAt.get(workspaceId) ?? Date.now();
      if (Date.now() - startedAt > INIT_GRACE_MS) {
        console.warn(`[WhatsApp][watchdog] Init stuck >${INIT_GRACE_MS / 60000}min for ${workspaceId}, recycling`);
        await this.recycleSession(workspaceId);
      }
      return;
    }

    let healthy = false;
    try {
      const state = await Promise.race([
        client.getState(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getState timeout')), GET_STATE_TIMEOUT_MS)
        )
      ]);
      healthy = state === 'CONNECTED';
      if (!healthy) console.warn(`[WhatsApp][watchdog] Unhealthy state "${state}" for ${workspaceId}`);
    } catch (err) {
      console.warn(`[WhatsApp][watchdog] Health check failed for ${workspaceId}:`, (err as Error).message);
    }

    if (healthy) {
      this.healthFailures.delete(workspaceId);
      return;
    }

    const failures = (this.healthFailures.get(workspaceId) ?? 0) + 1;
    this.healthFailures.set(workspaceId, failures);
    if (failures >= MAX_HEALTH_FAILURES) {
      await this.recycleSession(workspaceId);
    }
  }

  /** Destroys a stale client and re-initializes it in place. */
  private async recycleSession(workspaceId: string): Promise<void> {
    if (this.recycling.has(workspaceId)) return;
    this.recycling.add(workspaceId);
    console.warn(`[WhatsApp][watchdog] Recycling session for ${workspaceId}`);
    getIO().to(`workspace:${workspaceId}`).emit('whatsapp:reconnecting', {});

    const client = this.clients.get(workspaceId);
    this.clients.delete(workspaceId);
    this.readySessions.delete(workspaceId);
    this.healthFailures.delete(workspaceId);

    if (client) {
      try {
        // destroy() can hang with a wedged Chromium — don't block recovery on it.
        await Promise.race([
          client.destroy(),
          new Promise(resolve => setTimeout(resolve, DESTROY_TIMEOUT_MS))
        ]);
      } catch (err) {
        console.error(`[WhatsApp][watchdog] destroy() failed for ${workspaceId}:`, (err as Error).message);
      }
    }

    this.recycling.delete(workspaceId);
    await this.initSession(workspaceId);
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
    const nowSec = Math.floor(Date.now() / 1000);

    for (const chat of recentChats) {
      // Unread chats get their pending messages replayed; messages that arrived
      // while the session was down AND are recent get a bot reply (the message
      // dedup in processInboundMessage makes replays idempotent).
      const fetchLimit = chat.unreadCount > 0 ? Math.min(chat.unreadCount, 5) : 1;
      const messages = await chat.fetchMessages({ limit: fetchLimit });
      const senderPhone = await this.resolvePhone(workspaceId, chat.id._serialized);

      for (const msg of messages) {
        if (!msg.body || msg.fromMe) continue;
        const isRecentUnread =
          chat.unreadCount > 0 && nowSec - msg.timestamp < RECOVERY_WINDOW_S;
        await processInboundMessage({
          workspaceId,
          channelId: channel.id,
          externalConversationId: chat.id._serialized,
          externalMessageId: msg.id._serialized,
          senderExternalId: senderPhone,
          senderName: chat.name || 'WhatsApp User',
          content: msg.body,
          skipBotResponse: !isRecentUnread
        }).catch(() => {});
      }
    }
    console.log(`[WhatsApp] Sync complete for ${workspaceId}`);
  }

  /**
   * Restores all previously-connected native WhatsApp sessions on server start.
   * LocalAuth has the credentials stored in .wwebjs_auth/ — we just need to
   * re-initialize each client so the in-memory Map is populated again.
   */
  public async autoRestoreSessions(): Promise<void> {
    console.log('[WhatsApp] Auto-restoring sessions...');
    try {
      const channels = await prisma.channel.findMany({
        where: { platform: 'WHATSAPP', status: { in: ['CONNECTED', 'DISCONNECTED'] } },
        select: { workspaceId: true, config: true }
      });

      const nativeChannels = channels.filter(
        ch => (ch.config as any)?.isNative === true
      );

      if (nativeChannels.length === 0) {
        console.log('[WhatsApp] No native sessions to restore');
        return;
      }

      await Promise.allSettled(
        nativeChannels.map(ch => this.initSession(ch.workspaceId))
      );
      console.log(`[WhatsApp] Restore initiated for ${nativeChannels.length} session(s)`);
    } catch (err) {
      console.error('[WhatsApp] Error during auto-restore:', err);
    }
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
   * Resolves the real phone number from a chat ID. For @lid contacts the
   * prefix is a lid pseudo-number, not the actual phone — we ask the WhatsApp
   * client via getContactLidAndPhone() to get the real phone (pn).
   *
   * This can legitimately come back empty: internally it reads from
   * WhatsApp Web's own local contact cache (enforceLidAndPnRetrieval), which
   * only has the real number if WhatsApp has already revealed it to this
   * account (e.g. never happens for some click-to-chat/ad-originated or
   * privacy-mode contacts) — that is a platform-side limitation, not
   * necessarily a bug here. The two failure modes are logged separately so
   * a real API error is distinguishable from "WhatsApp just won't give it".
   * Every inbound message re-attempts this, so if WhatsApp ever reveals the
   * number later it self-heals via processInboundMessage's contact.update.
   */
  private async resolvePhone(workspaceId: string, chatId: string): Promise<string> {
    const fallback = chatId.split('@')[0];
    if (!chatId.endsWith('@lid')) return fallback;

    const client = this.clients.get(workspaceId);
    if (!client) return fallback;

    try {
      const result = await client.getContactLidAndPhone([chatId]);
      const pn = result?.[0]?.pn;
      if (pn) return pn.split('@')[0];
      console.warn(`[WhatsApp] lid ${chatId} has no phone number available from WhatsApp yet — using lid as identifier`);
    } catch (err) {
      console.error(`[WhatsApp] getContactLidAndPhone failed for ${chatId}:`, (err as Error).message);
    }
    return fallback;
  }

  /**
   * Bridges inbound messages to Metria's internal processing logic.
   */
  private async handleInboundMessage(workspaceId: string, msg: WWebMessage) {
    // Ignore WhatsApp internal broadcasts (status updates, etc.)
    if (msg.from === 'status@broadcast' || msg.from?.includes('broadcast')) return;
    // Ignore empty messages
    if (!msg.body) return;
    // Ignore echoes of messages sent by the connected device itself (prevents
    // outbound AI/agent replies from being re-ingested as inbound customer messages).
    if (msg.fromMe) return;

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

      const senderPhone = await this.resolvePhone(workspaceId, msg.from);

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
    this.stopWatchdog(workspaceId);
    this.readySessions.delete(workspaceId);
    this.initStartedAt.delete(workspaceId);
    const client = this.clients.get(workspaceId);
    if (client) {
      await client.logout();
      await client.destroy();
      this.clients.delete(workspaceId);
    }
  }
}
