import { Client, RemoteAuth, Message as WWebMessage, MessageAck } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { getIO } from '../socket';
import { prisma } from '../prisma';
import path from 'path';
import { PrismaWhatsAppStore } from './prismaSessionStore';

/**
 * WhatsAppSessionManager
 * Manages multiple WhatsApp sessions (one per workspace) using whatsapp-web.js.
 * Handles QR generation, authentication, and message bridging.
 */
const WATCHDOG_INTERVAL_MS = 60_000;
const GET_STATE_TIMEOUT_MS = 15_000;
/** Consecutive failed health checks before the session is recycled. */
const MAX_HEALTH_FAILURES = 3;
/**
 * getState() timeouts alone are weak evidence of a dead session — on a slow
 * or memory-pressured host they happen while the session is actually fine.
 * Recycle churn (destroy + fresh login every couple of minutes) is itself a
 * WhatsApp ban signal, so timeout-only streaks get more strikes.
 */
const MAX_TIMEOUT_ONLY_FAILURES = 5;
/**
 * Without this, whatsapp-web.js refreshes the QR (a pairing request to
 * WhatsApp's servers) every ~30s forever if nobody scans. An unattended
 * session doing that 24/7 from a server IP is a strong ban signal — cap it
 * and require the user to explicitly reconnect from the UI.
 */
const QR_MAX_RETRIES = 3;
/** Reason string whatsapp-web.js emits with 'disconnected' at the QR cap. */
const QR_EXHAUSTED_REASON = 'Max qrcode retries reached';
/** First re-init delay after a recycle; doubles per consecutive attempt. */
const REINIT_BACKOFF_BASE_MS = 60_000;
/** Consecutive recycles before backing off hard to the cooldown. */
const MAX_RECYCLE_ATTEMPTS = 5;
const RECYCLE_COOLDOWN_MS = 30 * 60_000;
/** Typing simulation: instant uniform replies read as a bot to WhatsApp. */
const TYPING_BASE_MS = 1_500;
const TYPING_PER_CHAR_MS = 40;
const TYPING_MAX_MS = 6_000;
const TYPING_JITTER_MAX_MS = 1_000;
/** Grace period for a session that is still initializing (QR scan, auth). */
const INIT_GRACE_MS = 10 * 60_000;
const DESTROY_TIMEOUT_MS = 30_000;
/**
 * How often RemoteAuth re-zips the local Chromium profile and backs it up to
 * Postgres. Local disk is ephemeral (container redeploys wipe it) — this is
 * what makes the session survive a redeploy without a new QR scan. Minimum
 * allowed by whatsapp-web.js is 60000ms; 5 minutes balances staleness against
 * writing a multi-MB blob to the DB too often.
 */
const REMOTE_BACKUP_INTERVAL_MS = 5 * 60_000;
/** Delay between launching each restored session's Chromium on server boot. */
const RESTORE_STAGGER_MS = 20_000;
/**
 * Pins the WhatsApp Web frontend build instead of always loading whatever is
 * currently live (see webVersionCache usage in initSession). Unset by
 * default — this is an experiment, not a default behavior change. Set via
 * env var so a different pinned version can be tried without a redeploy.
 */
const WEB_VERSION = process.env.WHATSAPP_WEB_VERSION;
/** Missed messages younger than this get an AI reply after a reconnect. */
const RECOVERY_WINDOW_S = 30 * 60
/**
 * whatsapp-web.js can report a session as usable before its injected page
 * helper (window.WWebJS, which sendMessage/getChats depend on) has finished
 * attaching after a RemoteAuth restore — operations fail transiently for a
 * couple of seconds until it does. Confirmed via a failed manual send right
 * after a session restore (sendMessage: "Cannot read properties of undefined
 * (reading 'getChat')") and a failed initial sync right after 'ready'
 * (getChats: opaque minified evaluate() error from the same unattached
 * helper). Same race, two call sites — retry both, bounded.
 */
const SEND_MESSAGE_RETRY_ATTEMPTS = 3
const SEND_MESSAGE_RETRY_DELAY_MS = 1500;
const GET_CHATS_RETRY_ATTEMPTS = 3;
const GET_CHATS_RETRY_DELAY_MS = 1500;
/**
 * WhatsApp rate-limits lid→phone lookups (confirmed by wwebjs maintainers:
 * github.com/pedroslopez/whatsapp-web.js/issues/3969#issuecomment-3564586446 —
 * repeated calls across ~30 lids started failing intermittently). Without
 * caching, resolvePhone() re-queries on every single inbound message from the
 * same contact, which is exactly the kind of hammering that trips it.
 */
const LID_NEGATIVE_CACHE_TTL_MS = 15 * 60_000;
/**
 * getContactLidAndPhone() is a page.evaluate() call with no default timeout.
 * When the injected WWebJS helper is unattached (the same race that makes
 * getChats() fail right after a session restore — see SEND_MESSAGE_RETRY
 * above), this call can hang indefinitely instead of rejecting. Without a
 * bound, handleInboundMessage() never resolves for that message: it's never
 * persisted and never gets a bot reply, with no error logged either — the
 * bot silently stops responding to every @lid contact from that point on.
 */
const RESOLVE_PHONE_TIMEOUT_MS = 15_000;

interface LidCacheEntry {
  /** Resolved phone, or null if WhatsApp had nothing for us as of cachedAt. */
  phone: string | null;
  cachedAt: number;
}

interface HealthFailureState {
  count: number;
  /** True while every failure in the current streak was a getState timeout. */
  timeoutsOnly: boolean;
}

interface MessageAckUpdate {
  status: string;
  deliveredAt?: Date;
  readAt?: Date;
}

/** Maps a WhatsApp message_ack value to the Message row update it implies. */
function ackToMessageUpdate(ack: MessageAck): MessageAckUpdate | null {
  switch (ack) {
    case MessageAck.ACK_ERROR:
      return { status: 'FAILED' };
    case MessageAck.ACK_PENDING:
      return { status: 'PENDING' };
    case MessageAck.ACK_SERVER:
      return { status: 'SENT' };
    case MessageAck.ACK_DEVICE:
      return { status: 'DELIVERED', deliveredAt: new Date() };
    case MessageAck.ACK_READ:
    case MessageAck.ACK_PLAYED:
      return { status: 'READ', readAt: new Date() };
    default:
      return null;
  }
}

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;
  private clients: Map<string, Client> = new Map();
  private readonly authPath = path.join(process.cwd(), '.wwebjs_auth');
  private watchdogs: Map<string, NodeJS.Timeout> = new Map();
  private healthFailures: Map<string, HealthFailureState> = new Map();
  private readySessions: Set<string> = new Set();
  private initStartedAt: Map<string, number> = new Map();
  private recycling: Set<string> = new Set();
  private lidCache: Map<string, LidCacheEntry> = new Map();
  /** Consecutive recycles/failed inits since the last successful 'ready'. */
  private recycleAttempts: Map<string, number> = new Map();
  /** Earliest time the watchdog may re-initialize a vanished session. */
  private nextInitAllowedAt: Map<string, number> = new Map();

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
      authStrategy: new RemoteAuth({
        clientId: workspaceId,
        dataPath: this.authPath,
        store: new PrismaWhatsAppStore(workspaceId, this.authPath),
        backupSyncIntervalMs: REMOTE_BACKUP_INTERVAL_MS
      }),
      qrMaxRetries: QR_MAX_RETRIES,
      // Without webVersion pinned, webVersionCache does nothing — resolve()
      // is called with `undefined`, always misses, and falls through to
      // whatever WhatsApp Web build is live right now. That's the confirmed
      // cause of the getChats/getNumberId/sendSeen failures we've been
      // chasing: WhatsApp is actively A/B-testing new frontend builds, and
      // the live one right now doesn't match what this library's injected
      // helpers expect. strict:false means an unfetchable/missing pinned
      // version just falls back to today's (broken) behavior — this can't
      // make things worse than they already are.
      ...(WEB_VERSION
        ? {
            webVersion: WEB_VERSION,
            webVersionCache: {
              type: 'remote' as const,
              remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
              strict: false
            }
          }
        : {}),
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
      this.recycleAttempts.delete(workspaceId);
      this.nextInitAllowedAt.delete(workspaceId);
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

    // Event: outbound message ACK (real delivery/read confirmation, keyed by
    // the WhatsApp-assigned message id saved as Message.externalId on send).
    client.on('message_ack', async (msg, ack) => {
      try {
        const externalId = msg.id._serialized;
        const update = ackToMessageUpdate(ack);
        if (!update) return;

        // findFirst + update (not updateMany) so we can emit the row's own id —
        // the frontend keys its message list on id, not externalId.
        const existing = await prisma.message.findFirst({
          where: { workspaceId, externalId },
          select: { id: true }
        });
        if (!existing) return;

        await prisma.message.update({ where: { id: existing.id }, data: update });

        io.to(`workspace:${workspaceId}`).emit('message:status', {
          id: existing.id,
          status: update.status,
          deliveredAt: update.deliveredAt,
          readAt: update.readAt
        });
      } catch (err) {
        console.error(`[WhatsApp] Error handling message_ack for ${workspaceId}:`, err);
      }
    });

    client.on('change_state', (state) => {
      console.log(`[WhatsApp] State changed for ${workspaceId}: ${state}`);
    });

    client.on('auth_failure', (message) => {
      console.error(`[WhatsApp] Auth failure for ${workspaceId}: ${message}`);
      // The stored session is corrupt or rejected — restoring the same blob
      // in a loop hammers WhatsApp with failed logins. Stop, wipe it, and
      // require a fresh QR scan from the UI.
      this.stopWatchdog(workspaceId);
      this.clients.delete(workspaceId);
      this.readySessions.delete(workspaceId);
      client.destroy().catch(() => {});
      prisma.whatsAppSession.deleteMany({ where: { workspaceId } })
        .catch(err => console.error(`[WhatsApp] Failed to wipe stored session for ${workspaceId}:`, err));
      prisma.channel.updateMany({
        where: { workspaceId, platform: 'WHATSAPP' },
        data: { status: 'NEEDS_QR' }
      }).catch(err => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
      io.to(`workspace:${workspaceId}`).emit('whatsapp:auth_failure', { message });
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
      console.log(`[WhatsApp] Disconnected workspace ${workspaceId}:`, reason);
      this.clients.delete(workspaceId);
      this.readySessions.delete(workspaceId);
      io.to(`workspace:${workspaceId}`).emit('whatsapp:disconnected', { reason });

      // LOGOUT means the user unlinked the device — don't fight it. QR
      // exhaustion means nobody scanned after QR_MAX_RETRIES refreshes —
      // stop asking WhatsApp for pairing codes; the user must reconnect
      // explicitly from the UI. Any other reason is transient: the watchdog
      // stays armed and re-initializes (with backoff).
      const reasonStr = String(reason);
      const isQrExhausted = reasonStr === QR_EXHAUSTED_REASON;
      if (isQrExhausted || reasonStr.toUpperCase() === 'LOGOUT') {
        this.stopWatchdog(workspaceId);
      }

      // updateMany is safe even if no row exists yet
      prisma.channel.updateMany({
        where: { workspaceId, platform: 'WHATSAPP' },
        data: { status: isQrExhausted ? 'NEEDS_QR' : 'DISCONNECTED' }
      }).catch(err => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
    });

    client.initialize().catch(err => {
      console.error(`[WhatsApp] Initialization failed for ${workspaceId}:`, err);
      // Remove the dead client so the next init attempt can retry instead of
      // hitting the "session already exists" early-return forever
      this.clients.delete(workspaceId);
      client.destroy().catch(() => {});
      io.to(`workspace:${workspaceId}`).emit('whatsapp:error', { message: 'Initialization failed' });

      // Without this, a channel that was CONNECTED before a restart/crash
      // stays "Conectado" in the UI forever while init keeps failing in the
      // background — the only sign anything is wrong is a send erroring out
      // with "WhatsApp session not active". Mirrors the 'disconnected' handler.
      prisma.channel.updateMany({
        where: { workspaceId, platform: 'WHATSAPP' },
        data: { status: 'DISCONNECTED' }
      }).catch(dbErr => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, dbErr));

      // Back off before the watchdog retries — immediate re-init loops on a
      // persistent failure (e.g. Chromium crash) hammer WhatsApp with logins.
      this.scheduleReinitBackoff(workspaceId);
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
      // Session vanished (failed init, transient disconnect, recycle) —
      // self-heal, but only once the re-init backoff window has elapsed.
      if (Date.now() < (this.nextInitAllowedAt.get(workspaceId) ?? 0)) return;
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
    let timedOut = false;
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
      timedOut = (err as Error).message === 'getState timeout';
      console.warn(`[WhatsApp][watchdog] Health check failed for ${workspaceId}:`, (err as Error).message);
    }

    if (healthy) {
      this.healthFailures.delete(workspaceId);
      return;
    }

    const prev = this.healthFailures.get(workspaceId) ?? { count: 0, timeoutsOnly: true };
    const failures: HealthFailureState = {
      count: prev.count + 1,
      timeoutsOnly: prev.timeoutsOnly && timedOut
    };
    this.healthFailures.set(workspaceId, failures);
    const limit = failures.timeoutsOnly ? MAX_TIMEOUT_ONLY_FAILURES : MAX_HEALTH_FAILURES;
    if (failures.count >= limit) {
      await this.recycleSession(workspaceId);
    }
  }

  /** Delay before the watchdog may re-init after `attempts` consecutive recycles. */
  private reinitDelayMs(attempts: number): number {
    if (attempts >= MAX_RECYCLE_ATTEMPTS) return RECYCLE_COOLDOWN_MS;
    return REINIT_BACKOFF_BASE_MS * 2 ** (attempts - 1);
  }

  private scheduleReinitBackoff(workspaceId: string): void {
    const attempts = (this.recycleAttempts.get(workspaceId) ?? 0) + 1;
    this.recycleAttempts.set(workspaceId, attempts);
    const delay = this.reinitDelayMs(attempts);
    this.nextInitAllowedAt.set(workspaceId, Date.now() + delay);
    if (attempts === MAX_RECYCLE_ATTEMPTS) {
      console.error(
        `[WhatsApp] ${workspaceId} hit ${attempts} consecutive recycles — cooling down ${RECYCLE_COOLDOWN_MS / 60_000}min`
      );
      getIO().to(`workspace:${workspaceId}`).emit('whatsapp:recycle_limit', {
        cooldownMs: RECYCLE_COOLDOWN_MS
      });
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
    // Deferred re-init: an immediate fresh login after every recycle is
    // itself a ban signal. The watchdog re-initializes once the backoff
    // window elapses (checkHealth's no-client path).
    this.scheduleReinitBackoff(workspaceId);
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

    let chats: Awaited<ReturnType<typeof client.getChats>> | undefined;
    for (let attempt = 1; attempt <= GET_CHATS_RETRY_ATTEMPTS; attempt++) {
      try {
        chats = await client.getChats();
        break;
      } catch (err) {
        if (attempt === GET_CHATS_RETRY_ATTEMPTS) throw err;
        console.warn(`[WhatsApp] getChats race (attempt ${attempt}/${GET_CHATS_RETRY_ATTEMPTS}) for ${workspaceId}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, GET_CHATS_RETRY_DELAY_MS));
      }
    }
    // Skip groups and WhatsApp internal addresses
    const recentChats = chats!
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
   * RemoteAuth pulls each session's credentials from Postgres — we just need
   * to re-initialize each client so the in-memory Map is populated again.
   *
   * Staggered on purpose: each initSession() launches a full Chromium
   * instance, and kicking off several at the exact same moment on a shared
   * host (other services, other Chromiums) risks a memory spike that kills
   * the newly-spawned browser processes before they even get to report why.
   */
  public async autoRestoreSessions(): Promise<void> {
    console.log('[WhatsApp] Auto-restoring sessions...');
    try {
      // Only CONNECTED channels: restoring a dead/unlinked (DISCONNECTED or
      // NEEDS_QR) session re-enters the endless-QR loop on every boot.
      const channels = await prisma.channel.findMany({
        where: { platform: 'WHATSAPP', status: 'CONNECTED' },
        select: { workspaceId: true, config: true }
      });

      const nativeChannels = channels.filter(
        ch => (ch.config as any)?.isNative === true
      );

      if (nativeChannels.length === 0) {
        console.log('[WhatsApp] No native sessions to restore');
        return;
      }

      for (const ch of nativeChannels) {
        await this.initSession(ch.workspaceId).catch(err =>
          console.error(`[WhatsApp] Restore failed to start for ${ch.workspaceId}:`, err)
        );
        if (ch !== nativeChannels[nativeChannels.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, RESTORE_STAGGER_MS));
        }
      }
      console.log(`[WhatsApp] Restore initiated for ${nativeChannels.length} session(s)`);
    } catch (err) {
      console.error('[WhatsApp] Error during auto-restore:', err);
    }
  }

  /**
   * Sends a message through the native client.
   */
  public async sendMessage(workspaceId: string, to: string, content: string): Promise<string> {
    const client = this.clients.get(workspaceId);
    if (!client) throw new Error('WhatsApp session not active');

    // First-ever message to a number: WhatsApp doesn't expose the routing
    // info (lid) for a chat that's never existed on its side, so a raw
    // sendMessage(`${phone}@c.us`) can resolve "successfully" here while
    // never actually reaching the recipient. getNumberId() runs WhatsApp's
    // own registration query (the same one "New chat" does), which both
    // validates the number is real AND makes WhatsApp expose the chat that
    // sendMessage needs. Best-effort: if this fails, fall back to the raw
    // `to` id rather than blocking the send outright.
    let target = to;
    try {
      const numberId = await client.getNumberId(to);
      if (!numberId) throw new Error(`Number not registered on WhatsApp: ${to}`);
      target = numberId._serialized;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Number not registered')) throw err;
      console.warn(`[WhatsApp] getNumberId lookup failed for ${to}, sending to raw id:`, (err as Error).message);
    }

    await this.simulateTyping(client, target, content);

    for (let attempt = 1; attempt <= SEND_MESSAGE_RETRY_ATTEMPTS; attempt++) {
      try {
        // waitUntilMsgSent: resolve only once WhatsApp's servers have
        // accepted the message, not just on local injection — needed so the
        // returned id is safe to correlate with the message_ack event below.
        const sentMessage = await client.sendMessage(target, content, { waitUntilMsgSent: true });
        // whatsapp-web.js resolves undefined (not a throw) when its internal
        // getChat() comes back empty — the same unattached-helper race the
        // catch block below retries, just surfaced as a falsy return instead
        // of a rejection here. Treat it the same way: retry, then give up.
        if (!sentMessage) {
          if (attempt === SEND_MESSAGE_RETRY_ATTEMPTS) {
            throw new Error(`sendMessage returned no result for ${workspaceId} (chat not found)`);
          }
          console.warn(`[WhatsApp] sendMessage returned no result (attempt ${attempt}/${SEND_MESSAGE_RETRY_ATTEMPTS}) for ${workspaceId}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, SEND_MESSAGE_RETRY_DELAY_MS));
          continue;
        }
        return sentMessage.id._serialized;
      } catch (err) {
        const isInjectedHelperRace = err instanceof Error && /getChat/.test(err.message);
        if (!isInjectedHelperRace || attempt === SEND_MESSAGE_RETRY_ATTEMPTS) throw err;
        console.warn(`[WhatsApp] sendMessage race (attempt ${attempt}/${SEND_MESSAGE_RETRY_ATTEMPTS}) for ${workspaceId}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, SEND_MESSAGE_RETRY_DELAY_MS));
      }
    }
    // Unreachable: every loop iteration either returns or throws (the last
    // attempt always throws on failure) — this only satisfies TS control-flow analysis.
    throw new Error('sendMessage: exhausted retries without a return or throw');
  }

  /**
   * Shows "typing…" and waits a length-proportional, jittered delay before a
   * send. Replying instantly and uniformly to every message is one of the
   * behavioral signals WhatsApp's anti-automation uses — this softens it.
   * Best-effort: a failure here must never block the actual send.
   */
  private async simulateTyping(client: Client, to: string, content: string): Promise<void> {
    let chat: Awaited<ReturnType<Client['getChatById']>> | undefined;
    try {
      chat = await client.getChatById(to);
      await chat.sendStateTyping();
    } catch {
      chat = undefined;
    }
    const typingMs =
      Math.min(TYPING_BASE_MS + content.length * TYPING_PER_CHAR_MS, TYPING_MAX_MS) +
      Math.floor(Math.random() * TYPING_JITTER_MAX_MS);
    await new Promise(resolve => setTimeout(resolve, typingMs));
    if (chat) await chat.clearState().catch(() => {});
  }

  /**
   * Resolves the real phone number from a chat ID. For @lid contacts the
   * prefix is a lid pseudo-number, not the actual phone — we ask the WhatsApp
   * client via getContactLidAndPhone(), which actively queries WhatsApp
   * (not just a local cache read) to bridge lid → real phone.
   *
   * Cached per chatId to avoid re-querying on every single inbound message:
   * WhatsApp rate-limits this lookup (confirmed by wwebjs maintainers), so
   * hammering it on a contact's every message is itself a plausible cause of
   * failures, not just "WhatsApp won't reveal it". A resolved phone is cached
   * indefinitely (numbers don't change); a failed attempt is retried after
   * LID_NEGATIVE_CACHE_TTL_MS instead of on the very next message.
   */
  private async resolvePhone(workspaceId: string, chatId: string): Promise<string> {
    const fallback = chatId.split('@')[0];
    if (!chatId.endsWith('@lid')) return fallback;

    const cacheKey = `${workspaceId}:${chatId}`;
    const cached = this.lidCache.get(cacheKey);
    if (cached) {
      if (cached.phone) return cached.phone;
      if (Date.now() - cached.cachedAt < LID_NEGATIVE_CACHE_TTL_MS) return fallback;
      // Cooldown elapsed — fall through and try again.
    }

    const client = this.clients.get(workspaceId);
    if (!client) return fallback;

    try {
      const result = await Promise.race([
        client.getContactLidAndPhone([chatId]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getContactLidAndPhone timeout')), RESOLVE_PHONE_TIMEOUT_MS)
        )
      ]);
      const pn = result?.[0]?.pn;
      if (pn) {
        const resolved = pn.split('@')[0];
        this.lidCache.set(cacheKey, { phone: resolved, cachedAt: Date.now() });
        return resolved;
      }
      console.warn(`[WhatsApp] lid ${chatId} has no phone number available from WhatsApp yet — using lid as identifier`);
      this.lidCache.set(cacheKey, { phone: null, cachedAt: Date.now() });
    } catch (err) {
      console.error(`[WhatsApp] getContactLidAndPhone failed for ${chatId}:`, (err as Error).message);
      this.lidCache.set(cacheKey, { phone: null, cachedAt: Date.now() });
    }
    return fallback;
  }

  /**
   * Bridges inbound messages to Metria's internal processing logic.
   */
  private async handleInboundMessage(workspaceId: string, msg: WWebMessage) {
    // Ignore WhatsApp internal broadcasts (status updates, etc.)
    if (msg.from === 'status@broadcast' || msg.from?.includes('broadcast')) return;
    // Ignore echoes of messages sent by the connected device itself (prevents
    // outbound AI/agent replies from being re-ingested as inbound customer messages).
    if (msg.fromMe) return;

    const isVoiceNote = msg.type === 'audio' || msg.type === 'ptt';
    // Ignore empty messages — voice notes carry no body, so they're allowed through here.
    if (!msg.body && !isVoiceNote) return;

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

      // Mark read before the (potentially slow) transcription step, not after.
      const client = this.clients.get(workspaceId);
      if (client) client.sendSeen(msg.from).catch(() => {});

      let content = msg.body;
      if (isVoiceNote) {
        content = await this.transcribeVoiceNote(msg);
        if (!content) return; // download or transcription failed — already logged
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
        content,
        mediaType: isVoiceNote ? 'audio' : undefined
      });
    } catch (err) {
      console.error(`[WhatsApp] Error processing inbound message for ${workspaceId}:`, err);
    }
  }

  /**
   * Downloads a voice note and transcribes it with Gemini. whatsapp-web.js
   * voice messages carry no msg.body — without this, the empty-body guard
   * at the top of handleInboundMessage silently dropped every one.
   */
  private async transcribeVoiceNote(msg: WWebMessage): Promise<string> {
    let media;
    try {
      media = await msg.downloadMedia();
    } catch (err) {
      console.error(`[WhatsApp] Failed to download voice note from ${msg.from}:`, err);
      return '';
    }
    if (!media?.data) return '';

    const { transcribeAudio } = await import('../../modules/ai-agent/providers/gemini.provider');
    const transcript = await transcribeAudio(media.data, media.mimetype);
    if (!transcript) console.warn(`[WhatsApp] Empty transcription for voice note from ${msg.from}`);
    return transcript;
  }

  /**
   * Disconnects and removes a session.
   */
  public async destroySession(workspaceId: string): Promise<void> {
    this.stopWatchdog(workspaceId);
    this.readySessions.delete(workspaceId);
    this.initStartedAt.delete(workspaceId);
    this.recycleAttempts.delete(workspaceId);
    this.nextInitAllowedAt.delete(workspaceId);
    const client = this.clients.get(workspaceId);
    if (client) {
      await client.logout();
      await client.destroy();
      this.clients.delete(workspaceId);
    }
  }
}
