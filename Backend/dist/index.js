"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/prisma.ts
var import_client, prismaClientSingleton, globalForPrisma, prisma;
var init_prisma = __esm({
  "src/lib/prisma.ts"() {
    "use strict";
    import_client = require("@prisma/client");
    prismaClientSingleton = () => {
      return new import_client.PrismaClient();
    };
    globalForPrisma = globalThis;
    prisma = globalForPrisma.prisma ?? prismaClientSingleton();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  }
});

// src/lib/oauth/providers/google-calendar.ts
var GoogleCalendarProvider;
var init_google_calendar = __esm({
  "src/lib/oauth/providers/google-calendar.ts"() {
    "use strict";
    GoogleCalendarProvider = class {
      platform = "GOOGLE_CALENDAR";
      get clientId() {
        return process.env.GOOGLE_ADS_CLIENT_ID ?? "";
      }
      get clientSecret() {
        return process.env.GOOGLE_ADS_CLIENT_SECRET ?? "";
      }
      get redirectUri() {
        return `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/integrations/google-calendar/callback`;
      }
      getAuthUrl(state) {
        const params = new URLSearchParams({
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          response_type: "code",
          scope: [
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "email",
            "profile"
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
          state
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      }
      async exchangeCode(code, redirectUri) {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code"
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`[gcal] token exchange failed: ${err}`);
        }
        const data = await res.json();
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1e3)
        };
      }
      async refreshToken(refreshToken) {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: "refresh_token"
          })
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`[gcal] token refresh failed: ${err}`);
        }
        const data = await res.json();
        return {
          accessToken: data.access_token,
          refreshToken,
          expiresAt: new Date(Date.now() + data.expires_in * 1e3)
        };
      }
    };
  }
});

// src/lib/socket.ts
var socket_exports = {};
__export(socket_exports, {
  getIO: () => getIO,
  initSocket: () => initSocket
});
function initSocket(httpServer) {
  const origins = (process.env.FRONTEND_URL || "http://localhost:3000").split(",").map((o) => o.trim()).filter(Boolean);
  _io = new import_socket.Server(httpServer, {
    cors: {
      origin: origins,
      credentials: true
    }
  });
  return _io;
}
function getIO() {
  if (!_io) throw new Error("Socket.io not initialized \u2014 call initSocket first");
  return _io;
}
var import_socket, _io;
var init_socket = __esm({
  "src/lib/socket.ts"() {
    "use strict";
    import_socket = require("socket.io");
    _io = null;
  }
});

// src/modules/messaging/channels/whatsapp.service.ts
var whatsapp_service_exports = {};
__export(whatsapp_service_exports, {
  parseWhatsAppUpdate: () => parseWhatsAppUpdate,
  sendWhatsAppMessage: () => sendWhatsAppMessage,
  verifyWhatsAppSignature: () => verifyWhatsAppSignature
});
async function sendWhatsAppMessage(phoneNumberId, accessToken, to, text) {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${body}`);
  }
}
function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  try {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expectedSignature = "sha256=" + import_crypto2.default.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signatureHeader);
    return import_crypto2.default.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}
async function parseWhatsAppUpdate(workspaceId, channelId, body) {
  if (!body.entry) return;
  for (const entry of body.entry) {
    if (!entry.changes) continue;
    for (const change of entry.changes) {
      const value = change.value;
      if (!value || !value.messages || value.messages.length === 0) {
        continue;
      }
      const contactMap = /* @__PURE__ */ new Map();
      if (value.contacts) {
        for (const contact of value.contacts) {
          if (contact.wa_id) {
            contactMap.set(contact.wa_id, contact.profile?.name);
          }
        }
      }
      for (const msg of value.messages) {
        if (msg.type === "text" && msg.text?.body) {
          try {
            const metadata = msg.referral ? { campaign_id: msg.referral.ref } : {};
            await processInboundMessage({
              workspaceId,
              channelId,
              externalConversationId: msg.from,
              externalMessageId: msg.id,
              senderExternalId: msg.from,
              senderName: contactMap.get(msg.from),
              content: msg.text.body,
              mediaUrl: void 0,
              mediaType: void 0,
              metadata
            });
          } catch (err) {
            console.error(`[WhatsApp] Failed to process message ${msg.id}:`, err);
          }
        }
      }
    }
  }
}
var import_crypto2, WA_API_VERSION;
var init_whatsapp_service = __esm({
  "src/modules/messaging/channels/whatsapp.service.ts"() {
    "use strict";
    import_crypto2 = __toESM(require("crypto"));
    init_message_service();
    WA_API_VERSION = "v19.0";
  }
});

// src/modules/messaging/channels/instagram.service.ts
var instagram_service_exports = {};
__export(instagram_service_exports, {
  parseInstagramUpdate: () => parseInstagramUpdate,
  sendInstagramMessage: () => sendInstagramMessage,
  verifyInstagramSignature: () => verifyInstagramSignature
});
async function sendInstagramMessage(pageAccessToken, recipientId, text) {
  const normalizedId = recipientId.startsWith("ig_") ? recipientId.slice(3) : recipientId;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: normalizedId },
      message: { text }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram API error ${response.status}: ${body}`);
  }
}
function verifyInstagramSignature(rawBody, signatureHeader, appSecret) {
  try {
    if (!signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expectedSig = "sha256=" + import_crypto3.default.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expectedSig);
    const providedBuffer = Buffer.from(signatureHeader);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return import_crypto3.default.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}
async function parseInstagramUpdate(workspaceId, channelId, body) {
  const entries = body.entry || [];
  for (const entry of entries) {
    const events = entry.messaging || [];
    for (const event of events) {
      if (!event.message || event.message.is_echo === true) {
        continue;
      }
      try {
        await processInboundMessage({
          workspaceId,
          channelId,
          externalConversationId: event.sender.id,
          externalMessageId: event.message.mid,
          senderExternalId: `ig_${event.sender.id}`,
          senderName: void 0,
          content: event.message.text ?? "",
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          mediaType: event.message.attachments?.[0]?.type
        });
      } catch (error) {
        console.error(`[Instagram] Error processing inbound message in workspace ${workspaceId}:`, error);
      }
    }
  }
}
var import_crypto3, GRAPH_API_VERSION;
var init_instagram_service = __esm({
  "src/modules/messaging/channels/instagram.service.ts"() {
    "use strict";
    import_crypto3 = __toESM(require("crypto"));
    init_message_service();
    GRAPH_API_VERSION = "v19.0";
  }
});

// src/modules/crm/ticket.service.ts
async function listTickets(workspaceId, opts = {}) {
  const { status, priority, contactId, limit = 50, cursor } = opts;
  return prisma.ticket.findMany({
    where: {
      workspaceId,
      ...status && { status },
      ...priority && { priority },
      ...contactId && { contactId },
      ...cursor && { createdAt: { lt: new Date(cursor) } }
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: limit
  });
}
async function createTicket(workspaceId, data) {
  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  const priority = data.priority ?? "MEDIUM";
  const slaHours = SLA_HOURS[priority] ?? 24;
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1e3);
  return prisma.ticket.create({
    data: {
      workspaceId,
      contactId: data.contactId,
      title: data.title,
      priority,
      slaDeadline,
      ...data.description && { description: data.description },
      ...data.orderId && { orderId: data.orderId },
      ...data.conversationId && { conversationId: data.conversationId },
      ...data.assignedToUserId && { assignedToUserId: data.assignedToUserId }
    },
    include: { contact: { select: { id: true, name: true, phone: true } } }
  });
}
async function updateTicket(workspaceId, ticketId, data) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } });
  if (!ticket) throw new Error("Ticket not found");
  const updateData = {};
  if (data.status !== void 0) updateData.status = data.status;
  if (data.priority !== void 0) updateData.priority = data.priority;
  if ("assignedToUserId" in data) updateData.assignedToUserId = data.assignedToUserId;
  return prisma.ticket.update({ where: { id: ticketId, workspaceId }, data: updateData });
}
async function resolveTicket(workspaceId, ticketId) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } });
  if (!ticket) throw new Error("Ticket not found");
  return prisma.ticket.update({
    where: { id: ticketId, workspaceId },
    data: { status: "RESOLVED", resolvedAt: /* @__PURE__ */ new Date() }
  });
}
var SLA_HOURS;
var init_ticket_service = __esm({
  "src/modules/crm/ticket.service.ts"() {
    "use strict";
    init_prisma();
    SLA_HOURS = {
      URGENT: 1,
      HIGH: 4,
      MEDIUM: 24,
      LOW: 72
    };
  }
});

// src/modules/crm/contact.service.ts
async function createContact(workspaceId, data) {
  return prisma.contact.create({
    data: {
      workspaceId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      status: data.status || "LEAD",
      source: "MANUAL"
    },
    include: {
      tags: true,
      _count: { select: { conversations: true, deals: true, tickets: true } }
    }
  });
}
async function listContacts(workspaceId, opts = {}) {
  const { search, status, leadTemperature, leadType, limit = 50, cursor } = opts;
  const safeLimit = Math.min(limit, 200);
  return prisma.contact.findMany({
    where: {
      workspaceId,
      ...status && { status },
      ...leadTemperature && { leadTemperature },
      ...leadType && { leadType },
      ...search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } }
        ]
      },
      ...cursor && { createdAt: { lt: new Date(cursor) } }
    },
    include: {
      tags: true,
      _count: { select: { conversations: true, deals: true, tickets: true } }
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit
  });
}
async function getContact(workspaceId, contactId) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tags: true,
      contactNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      deals: {
        include: {
          stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
          pipeline: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "desc" }
      },
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
      conversations: {
        include: { channel: { select: { platform: true, name: true } } },
        orderBy: { lastMessageAt: "desc" },
        take: 10
      },
      healthScores: { orderBy: { calculatedAt: "desc" }, take: 1 }
    }
  });
  if (!contact) throw new Error("Contact not found");
  return contact;
}
async function updateContact(workspaceId, contactId, data) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  const { name, email, phone, status, temperature, contactType, ltv, shopifyCustomerId } = data;
  return prisma.contact.update({
    where: { id: contactId, workspaceId },
    data: {
      ...name !== void 0 && { name },
      ...email !== void 0 && { email: email || null },
      ...phone !== void 0 && { phone: phone || null },
      ...status !== void 0 && { status },
      ...temperature !== void 0 && { leadTemperature: temperature },
      ...contactType !== void 0 && { leadType: contactType },
      ...ltv !== void 0 && { ltv },
      ...shopifyCustomerId !== void 0 && { shopifyCustomerId }
    }
  });
}
async function addNote(workspaceId, contactId, userId, content) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  return prisma.contactNote.create({ data: { workspaceId, contactId, userId, content } });
}
async function addTag(workspaceId, contactId, name, color = "#6366f1") {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  return prisma.contactTag.upsert({
    where: { contactId_name: { contactId, name } },
    create: { workspaceId, contactId, name, color },
    update: { color }
  });
}
async function removeTag(workspaceId, contactId, tagId) {
  const tag = await prisma.contactTag.findFirst({ where: { id: tagId, contactId, workspaceId } });
  if (!tag) throw new Error("Tag not found");
  await prisma.contactTag.delete({ where: { id: tagId } });
}
async function updateQualification(workspaceId, contactId, input) {
  if (input.temperature && !TEMPERATURES.includes(input.temperature)) throw new Error(`Invalid temperature: ${input.temperature}`);
  if (input.type && !LEAD_TYPES.includes(input.type)) throw new Error(`Invalid lead type: ${input.type}`);
  if (input.score !== void 0 && (input.score < 0 || input.score > 100)) throw new Error("Score must be 0-100");
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  const mergedData = input.data ? { ...contact.qualificationData ?? {}, ...input.data } : void 0;
  return prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...input.temperature && { leadTemperature: input.temperature },
      ...input.type && { leadType: input.type },
      ...input.score !== void 0 && { leadScore: input.score },
      ...mergedData && { qualificationData: mergedData }
    }
  });
}
async function bulkUpdateContacts(workspaceId, ids, data) {
  let count = 0;
  if (data.status) {
    const result = await prisma.contact.updateMany({
      where: { id: { in: ids }, workspaceId },
      data: { status: data.status }
    });
    count = result.count;
  }
  if (data.tags) {
    for (const id of ids) {
      await prisma.contact.update({
        where: { id, workspaceId },
        data: {
          tags: {
            deleteMany: {},
            createMany: {
              data: data.tags.map((name) => ({ workspaceId, name })),
              skipDuplicates: true
            }
          }
        }
      });
    }
    if (!data.status) count = ids.length;
  }
  return count;
}
async function bulkDeleteContacts(workspaceId, ids) {
  const result = await prisma.contact.deleteMany({
    where: { id: { in: ids }, workspaceId }
  });
  return result.count;
}
async function calculateHealthScore(workspaceId, contactId) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      tickets: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
      conversations: { select: { lastMessageAt: true }, orderBy: { lastMessageAt: "desc" }, take: 1 }
    }
  });
  if (!contact) throw new Error("Contact not found");
  const ltvNum = Number(contact.ltv);
  const ltvScore = Math.min(100, ltvNum / 500 * 100);
  const openTickets = contact.tickets.length;
  const noComplaintScore = Math.max(0, 100 - openTickets * 25);
  const lastActive = contact.conversations[0]?.lastMessageAt;
  const daysSinceActive = lastActive ? (Date.now() - lastActive.getTime()) / (1e3 * 60 * 60 * 24) : 999;
  const activityScore = Math.max(0, 100 - daysSinceActive * 2);
  const score = Math.round(ltvScore * 0.4 + noComplaintScore * 0.3 + activityScore * 0.3);
  const factors = {
    ltvScore: Math.round(ltvScore),
    noComplaintScore,
    activityScore: Math.round(activityScore),
    openTickets
  };
  await prisma.contactHealthScore.create({ data: { contactId, score, factors } });
  await prisma.contact.update({ where: { id: contactId, workspaceId }, data: { healthScore: score } });
  return { score, factors };
}
var TEMPERATURES, LEAD_TYPES;
var init_contact_service = __esm({
  "src/modules/crm/contact.service.ts"() {
    "use strict";
    init_prisma();
    TEMPERATURES = ["COLD", "WARM", "HOT"];
    LEAD_TYPES = ["CURIOUS", "QUOTING", "READY_TO_BUY", "POST_SALE"];
  }
});

// src/modules/bot/businessHours.service.ts
async function getBusinessHours(workspaceId) {
  return prisma.businessHours.findUnique({ where: { workspaceId } });
}
async function upsertBusinessHours(workspaceId, data) {
  return prisma.businessHours.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data
  });
}
function isOutsideBusinessHours(bh) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const localDate = new Date((/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: bh.timezone }));
  const dayName = days[localDate.getDay()];
  const schedule = bh[dayName];
  if (!schedule || !schedule.enabled) return true;
  const hh = localDate.getHours().toString().padStart(2, "0");
  const mm = localDate.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hh}:${mm}`;
  return timeStr < schedule.open || timeStr >= schedule.close;
}
var init_businessHours_service = __esm({
  "src/modules/bot/businessHours.service.ts"() {
    "use strict";
    init_prisma();
  }
});

// src/modules/bot/flow.engine.ts
async function tryRunBotFlows(workspaceId, channelId, conversation, content) {
  if (!conversation.isHandledByBot) return;
  const flows = await prisma.botFlow.findMany({
    where: { workspaceId, isActive: true },
    include: { botAgent: { select: { isActive: true } } },
    orderBy: { priority: "asc" }
  });
  for (const flow of flows) {
    if (!flow.botAgent.isActive) continue;
    if (flow.channel !== "ALL" && flow.channel !== conversation.channel.platform) continue;
    const botConfig = flow.botAgent.config || {};
    if (botConfig.disabled) continue;
    if (!await matchesTrigger(flow, conversation, content)) continue;
    await executeActions(workspaceId, conversation, flow.actions, botConfig);
    return;
  }
}
async function matchesTrigger(flow, conversation, content) {
  switch (flow.triggerType) {
    case "FIRST_MESSAGE":
      return conversation.messageCount === 1;
    case "KEYWORD":
      if (!flow.triggerValue || !content) return false;
      return content.toLowerCase().includes(flow.triggerValue.toLowerCase());
    case "BUSINESS_HRS": {
      const bh = await prisma.businessHours.findUnique({ where: { workspaceId: flow.workspaceId } });
      if (!bh) return false;
      return isOutsideBusinessHours(bh);
    }
    default:
      return false;
  }
}
async function resolveVariables(conversation) {
  const contact = conversation.contactId ? await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } }) : null;
  const assignedUser = conversation.assignedToUserId ? await prisma.user.findUnique({ where: { id: conversation.assignedToUserId }, select: { name: true } }) : null;
  return {
    "{nombre}": contact?.name ?? "Cliente",
    "{agente_nombre}": assignedUser?.name ?? "nuestro equipo"
  };
}
function interpolate(template, vars) {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), template);
}
async function sendBotMessage(workspaceId, conversation, text) {
  const config = conversation.channel.config;
  switch (conversation.channel.platform) {
    case "WHATSAPP":
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conversation.externalId, text);
      break;
    case "INSTAGRAM":
      await sendInstagramMessage(config.pageAccessToken, conversation.externalId, text);
      break;
    case "TELEGRAM":
      await sendTelegramMessage(config.botToken, conversation.externalId, text);
      break;
  }
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      senderType: "BOT",
      content: text
    }
  });
}
async function executeActions(workspaceId, conversation, actions, botConfig) {
  const vars = await resolveVariables(conversation);
  for (const action of actions) {
    switch (action.type) {
      case "send_message": {
        if (!action.content) break;
        let text = interpolate(action.content, vars);
        if (botConfig.tone === "formal") {
          text = text.charAt(0).toUpperCase() + text.slice(1);
        }
        await sendBotMessage(workspaceId, conversation, text);
        break;
      }
      case "assign_agent": {
        if (!action.userId) break;
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { assignedToUserId: action.userId }
        });
        break;
      }
      case "create_ticket": {
        if (!conversation.contactId) break;
        await createTicket(workspaceId, {
          contactId: conversation.contactId,
          title: "Ticket creado por bot",
          priority: action.priority ?? "MEDIUM",
          conversationId: conversation.id
        });
        break;
      }
      case "wait_human": {
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { isHandledByBot: false }
        });
        break;
      }
      case "update_stage": {
        if (!conversation.contactId || !action.status) break;
        await updateContact(workspaceId, conversation.contactId, { status: action.status });
        break;
      }
      case "send_csat": {
        await sendBotMessage(workspaceId, conversation, "\xBFC\xF3mo calificar\xEDas nuestra atenci\xF3n? Responde del 1 al 5.");
        break;
      }
    }
  }
}
var init_flow_engine = __esm({
  "src/modules/bot/flow.engine.ts"() {
    "use strict";
    init_prisma();
    init_whatsapp_service();
    init_instagram_service();
    init_telegram_service();
    init_ticket_service();
    init_contact_service();
    init_businessHours_service();
  }
});

// src/modules/crm/contactEvents.service.ts
async function listContactEvents(workspaceId, contactId) {
  return prisma.contactEvent.findMany({
    where: { workspaceId, contactId },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}
async function createContactEvent(workspaceId, contactId, type, title, description, metadata) {
  return prisma.contactEvent.create({
    data: {
      workspaceId,
      contactId,
      type,
      title,
      description,
      metadata
    }
  });
}
var init_contactEvents_service = __esm({
  "src/modules/crm/contactEvents.service.ts"() {
    "use strict";
    init_prisma();
  }
});

// src/modules/crm/segments.service.ts
function buildSingleFilterClause(filter) {
  const { field, operator, value } = filter;
  switch (field) {
    case "leadScore": {
      const num = Number(value);
      if (isNaN(num)) return null;
      const opMap = { eq: "equals", gt: "gt", lt: "lt", gte: "gte", lte: "lte" };
      const prismaOp = opMap[operator];
      if (!prismaOp) return null;
      return { leadScore: { [prismaOp]: num } };
    }
    case "temperature": {
      if (operator === "eq") return { leadTemperature: String(value) };
      if (operator === "in" && Array.isArray(value)) return { leadTemperature: { in: value } };
      if (operator === "contains") return { leadTemperature: { contains: String(value), mode: "insensitive" } };
      return null;
    }
    case "contactType": {
      if (operator === "eq") return { leadType: String(value) };
      if (operator === "in" && Array.isArray(value)) return { leadType: { in: value } };
      if (operator === "contains") return { leadType: { contains: String(value), mode: "insensitive" } };
      return null;
    }
    case "channel": {
      if (operator === "eq") return { source: String(value) };
      if (operator === "in" && Array.isArray(value)) return { source: { in: value } };
      if (operator === "contains") return { source: { contains: String(value), mode: "insensitive" } };
      return null;
    }
    case "tags": {
      if (operator === "contains") {
        return { tags: { some: { name: { contains: String(value), mode: "insensitive" } } } };
      }
      if (operator === "in" && Array.isArray(value)) {
        return { tags: { some: { name: { in: value } } } };
      }
      if (operator === "eq") {
        return { tags: { some: { name: String(value) } } };
      }
      return null;
    }
    case "hasDeals": {
      if (operator === "is_true") return { deals: { some: {} } };
      if (operator === "is_false") return { deals: { none: {} } };
      return null;
    }
    case "isActive": {
      if (operator === "is_true") return { status: { not: "CHURNED" } };
      if (operator === "is_false") return { status: "CHURNED" };
      return null;
    }
    default:
      return null;
  }
}
function buildWhereFromFilters(workspaceId, filters) {
  const clauses = filters.filters.map(buildSingleFilterClause).filter((c) => c !== null);
  if (clauses.length === 0) {
    return { workspaceId };
  }
  if (filters.logic === "OR") {
    return { workspaceId, OR: clauses };
  }
  return { workspaceId, AND: clauses };
}
async function recalculateCount(workspaceId, segmentId, filters) {
  const where = buildWhereFromFilters(workspaceId, filters);
  const count = await prisma.contact.count({ where });
  await prisma.segment.update({
    where: { id: segmentId },
    data: { contactCount: count, lastCalculatedAt: /* @__PURE__ */ new Date() }
  });
  return count;
}
async function listSegments(workspaceId) {
  return prisma.segment.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" }
  });
}
async function getSegment(workspaceId, segmentId) {
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, workspaceId }
  });
  if (!segment) throw new Error("Segment not found");
  return segment;
}
async function createSegment(workspaceId, data) {
  const segment = await prisma.segment.create({
    data: {
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      filters: data.filters,
      contactCount: 0
    }
  });
  await recalculateCount(workspaceId, segment.id, data.filters);
  return prisma.segment.findFirst({ where: { id: segment.id } });
}
async function updateSegment(workspaceId, segmentId, data) {
  const existing = await getSegment(workspaceId, segmentId);
  const updated = await prisma.segment.update({
    where: { id: segmentId },
    data: {
      ...data.name !== void 0 && { name: data.name },
      ...data.description !== void 0 && { description: data.description },
      ...data.filters !== void 0 && { filters: data.filters }
    }
  });
  const activeFilters = data.filters ?? existing.filters;
  if (activeFilters) {
    await recalculateCount(workspaceId, segmentId, activeFilters);
  }
  return prisma.segment.findFirst({ where: { id: segmentId } });
}
async function deleteSegment(workspaceId, segmentId) {
  await getSegment(workspaceId, segmentId);
  return prisma.segment.delete({ where: { id: segmentId } });
}
async function getSegmentContacts(workspaceId, segmentId, page = 1, pageSize = 25) {
  const segment = await getSegment(workspaceId, segmentId);
  const filters = segment.filters;
  const where = buildWhereFromFilters(workspaceId, filters);
  const skip = (page - 1) * pageSize;
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        tags: true,
        _count: { select: { deals: true, conversations: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize
    }),
    prisma.contact.count({ where })
  ]);
  return {
    contacts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}
async function previewSegmentCount(workspaceId, filters) {
  const where = buildWhereFromFilters(workspaceId, filters);
  return prisma.contact.count({ where });
}
async function duplicateSegment(workspaceId, segmentId) {
  const original = await getSegment(workspaceId, segmentId);
  return prisma.segment.create({
    data: {
      workspaceId,
      name: `Copia de ${original.name}`,
      description: original.description,
      filters: original.filters,
      contactCount: 0
    }
  });
}
var init_segments_service = __esm({
  "src/modules/crm/segments.service.ts"() {
    "use strict";
    init_prisma();
  }
});

// src/modules/campaigns/drivers/log.driver.ts
function truncate(s, max = 80) {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}\u2026` : oneLine;
}
var logDriver;
var init_log_driver = __esm({
  "src/modules/campaigns/drivers/log.driver.ts"() {
    "use strict";
    logDriver = {
      name: "log",
      async sendEmail(to, subject, body) {
        console.log(`[campaigns:log] EMAIL \u2192 ${to} | subject="${subject}" | body="${truncate(body)}"`);
        return { ok: true, provider: "log" };
      },
      async sendSms(to, body) {
        console.log(`[campaigns:log] SMS \u2192 ${to} | body="${truncate(body)}"`);
        return { ok: true, provider: "log" };
      },
      async sendWhatsapp(to, body) {
        console.log(`[campaigns:log] WHATSAPP \u2192 ${to} | body="${truncate(body)}"`);
        return { ok: true, provider: "log" };
      }
    };
  }
});

// src/modules/campaigns/drivers/resend.driver.ts
function createResendDriver() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Metria <onboarding@resend.dev>";
  return {
    name: "resend",
    async sendEmail(to, subject, body) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            // Body may be plain text or HTML; Resend renders HTML.
            html: body,
            text: body
          })
        });
        if (!res.ok) {
          const detail = await safeText(res);
          return { ok: false, provider: "resend", error: `Resend ${res.status}: ${detail}` };
        }
        return { ok: true, provider: "resend" };
      } catch (err) {
        return { ok: false, provider: "resend", error: err?.message ?? "Resend request failed" };
      }
    },
    // Resend doesn't do SMS / WhatsApp — fall back to logging so the batch still runs.
    sendSms: logDriver.sendSms,
    sendWhatsapp: logDriver.sendWhatsapp
  };
}
async function safeText(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "unknown error";
  }
}
var init_resend_driver = __esm({
  "src/modules/campaigns/drivers/resend.driver.ts"() {
    "use strict";
    init_log_driver();
  }
});

// src/modules/campaigns/drivers/twilio.driver.ts
function createTwilioDriver() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  return {
    name: "twilio",
    // Twilio isn't an email provider — fall back to logging.
    sendEmail: logDriver.sendEmail,
    async sendSms(to, body) {
      try {
        const auth14 = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const form = new URLSearchParams({ To: to, From: from, Body: body });
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth14}`,
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: form.toString()
          }
        );
        if (!res.ok) {
          const detail = await safeText2(res);
          return { ok: false, provider: "twilio", error: `Twilio ${res.status}: ${detail}` };
        }
        return { ok: true, provider: "twilio" };
      } catch (err) {
        return { ok: false, provider: "twilio", error: err?.message ?? "Twilio request failed" };
      }
    },
    // TODO(whatsapp): Real bulk WhatsApp requires Meta-approved message
    // templates, opt-in, and a WhatsApp Business sender — it cannot be sent as
    // free-form bulk text. We intentionally log instead of delivering.
    sendWhatsapp: logDriver.sendWhatsapp
  };
}
async function safeText2(res) {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "unknown error";
  }
}
var init_twilio_driver = __esm({
  "src/modules/campaigns/drivers/twilio.driver.ts"() {
    "use strict";
    init_log_driver();
  }
});

// src/modules/campaigns/drivers/index.ts
function hasResendKeys() {
  return Boolean(process.env.RESEND_API_KEY);
}
function hasTwilioKeys() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
  );
}
function getDriver(channel) {
  switch (channel) {
    case "EMAIL":
      return hasResendKeys() ? createResendDriver() : logDriver;
    case "SMS":
      return hasTwilioKeys() ? createTwilioDriver() : logDriver;
    case "WHATSAPP":
      return logDriver;
    default:
      return logDriver;
  }
}
function isLiveChannel(channel) {
  if (channel === "EMAIL") return hasResendKeys();
  if (channel === "SMS") return hasTwilioKeys();
  return false;
}
function dispatch(driver, channel, to, subject, body) {
  if (channel === "EMAIL") return driver.sendEmail(to, subject, body);
  if (channel === "SMS") return driver.sendSms(to, body);
  return driver.sendWhatsapp(to, body);
}
var init_drivers = __esm({
  "src/modules/campaigns/drivers/index.ts"() {
    "use strict";
    init_log_driver();
    init_resend_driver();
    init_twilio_driver();
    init_log_driver();
  }
});

// src/modules/unsubscribe/unsubscribe.service.ts
function generateUnsubscribeToken(recipientId) {
  const hmac = import_crypto4.default.createHmac("sha256", process.env.JWT_SECRET);
  hmac.update(recipientId);
  const sig = hmac.digest("hex");
  return Buffer.from(`${recipientId}:${sig}`).toString("base64url");
}
function verifyUnsubscribeToken(token) {
  const decoded = Buffer.from(token, "base64url").toString("utf-8");
  const colonIdx = decoded.lastIndexOf(":");
  if (colonIdx < 0) throw new Error("Invalid token format");
  const recipientId = decoded.slice(0, colonIdx);
  const sig = decoded.slice(colonIdx + 1);
  const expected = import_crypto4.default.createHmac("sha256", process.env.JWT_SECRET).update(recipientId).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length || !import_crypto4.default.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Invalid token signature");
  }
  return recipientId;
}
async function processUnsubscribe(token) {
  const recipientId = verifyUnsubscribeToken(token);
  const recipient = await prisma.campaignRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    include: {
      contact: { select: { email: true } }
    }
  });
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: "UNSUBSCRIBED" }
  });
  const email = recipient.contact?.email;
  const workspaceId = recipient.workspaceId;
  if (email) {
    await prisma.suppression.upsert({
      where: {
        workspaceId_channel_value: {
          workspaceId,
          channel: "EMAIL",
          value: email
        }
      },
      create: {
        workspaceId,
        channel: "EMAIL",
        value: email,
        reason: "UNSUBSCRIBE"
      },
      update: {}
    });
  }
}
function renderUnsubscribePage(success, errorMessage) {
  if (success) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Desuscripci\xF3n exitosa</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 420px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">\u2705</div>
    <h1>Te has desuscrito</h1>
    <p>Tu direcci\xF3n ha sido eliminada de nuestra lista de correos. No recibir\xE1s m\xE1s mensajes de marketing.</p>
  </div>
</body>
</html>`;
  }
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Enlace inv\xE1lido</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 420px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">\u26A0\uFE0F</div>
    <h1>Enlace inv\xE1lido</h1>
    <p>${errorMessage ?? "El enlace de desuscripci\xF3n no es v\xE1lido o ya expir\xF3."}</p>
  </div>
</body>
</html>`;
}
var import_crypto4;
var init_unsubscribe_service = __esm({
  "src/modules/unsubscribe/unsubscribe.service.ts"() {
    "use strict";
    import_crypto4 = __toESM(require("crypto"));
    init_prisma();
  }
});

// src/modules/campaigns/campaigns.service.ts
var campaigns_service_exports = {};
__export(campaigns_service_exports, {
  createCampaign: () => createCampaign,
  deleteCampaign: () => deleteCampaign,
  duplicateCampaign: () => duplicateCampaign,
  getCampaign: () => getCampaign,
  getCampaignStats: () => getCampaignStats,
  listCampaigns: () => listCampaigns,
  previewAudience: () => previewAudience,
  scheduleCampaign: () => scheduleCampaign,
  sendCampaign: () => sendCampaign,
  sendToSingleContact: () => sendToSingleContact,
  testSendCampaign: () => testSendCampaign,
  updateCampaign: () => updateCampaign
});
function renderMergeTags(template, contact) {
  return template.replace(/\{\{\s*(name|phone|email)\s*\}\}/gi, (_match, key) => {
    const k = key.toLowerCase();
    if (k === "name") return contact.name ?? "";
    if (k === "phone") return contact.phone ?? "";
    if (k === "email") return contact.email ?? "";
    return _match;
  });
}
function recipientAddress(channel, contact) {
  return channel === "EMAIL" ? contact.email : contact.phone;
}
function suppressionChannel(channel) {
  return channel === "EMAIL" ? "EMAIL" : "SMS";
}
function injectTracking(html, recipientId) {
  const base = (process.env.API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
  let result = html.replace(
    /href="(https?:\/\/[^"]{1,2048})"/gi,
    (_match, url) => `href="${base}/t/c/${recipientId}?url=${encodeURIComponent(url)}"`
  );
  const pixel = `<img src="${base}/t/o/${recipientId}" width="1" height="1" style="display:none" alt="" />`;
  const token = generateUnsubscribeToken(recipientId);
  const unsubUrl = `${process.env.BACKEND_URL ?? "http://localhost:4000"}/unsubscribe/${token}`;
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center">Si no deseas recibir m\xE1s correos, <a href="${unsubUrl}" style="color:#888">haz clic aqu\xED para desuscribirte</a>.</div>`;
  if (result.includes("</body>")) {
    result = result.replace("</body>", `${pixel}${footer}</body>`);
  } else {
    result = result + pixel + footer;
  }
  return result;
}
async function listCampaigns(workspaceId) {
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } }
  });
  const sentCounts = await prisma.campaignRecipient.groupBy({
    by: ["campaignId"],
    where: { workspaceId, status: "SENT" },
    _count: { _all: true }
  });
  const sentByCampaign = new Map(sentCounts.map((s) => [s.campaignId, s._count._all]));
  return campaigns.map((c) => ({
    ...c,
    recipientCount: c._count.recipients,
    sentCount: sentByCampaign.get(c.id) ?? 0
  }));
}
async function getCampaign(workspaceId, campaignId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!campaign) throw new Error("Campaign not found");
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId, workspaceId },
    _count: { _all: true }
  });
  const recipientStats = {};
  let recipientCount = 0;
  for (const g of grouped) {
    recipientStats[g.status] = g._count._all;
    recipientCount += g._count._all;
  }
  const [openedCount, clickedCount] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, workspaceId, openedAt: { not: null } } }),
    prisma.campaignRecipient.count({ where: { campaignId, workspaceId, clickedAt: { not: null } } })
  ]);
  let segment = null;
  if (campaign.segmentId) {
    const s = await prisma.segment.findFirst({
      where: { id: campaign.segmentId, workspaceId },
      select: { id: true, name: true }
    });
    segment = s ?? null;
  }
  return { ...campaign, recipientStats, recipientCount, openedCount, clickedCount, segment };
}
async function createCampaign(workspaceId, input) {
  if (!input.name?.trim()) throw new Error("name is required");
  if (!VALID_CHANNELS.includes(input.channel)) throw new Error("invalid channel");
  if (!input.body?.trim()) throw new Error("body is required");
  return prisma.campaign.create({
    data: {
      workspaceId,
      name: input.name.trim(),
      channel: input.channel,
      subject: input.channel === "EMAIL" ? input.subject?.trim() || null : null,
      body: input.body,
      segmentId: input.segmentId || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: input.scheduledAt ? "SCHEDULED" : "DRAFT"
    }
  });
}
async function updateCampaign(workspaceId, campaignId, input) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!existing) throw new Error("Campaign not found");
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error("Only DRAFT or SCHEDULED campaigns can be edited");
  }
  if (input.channel !== void 0 && !VALID_CHANNELS.includes(input.channel)) {
    throw new Error("invalid channel");
  }
  const nextChannel = input.channel ?? existing.channel;
  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...input.name !== void 0 && { name: input.name.trim() },
      ...input.channel !== void 0 && { channel: input.channel },
      // Subject only meaningful for EMAIL; clear it otherwise.
      ...input.subject !== void 0 || input.channel !== void 0 ? { subject: nextChannel === "EMAIL" ? input.subject?.trim() || null : null } : {},
      ...input.body !== void 0 && { body: input.body },
      ...input.segmentId !== void 0 && { segmentId: input.segmentId || null },
      ...input.scheduledAt !== void 0 && {
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: input.scheduledAt ? "SCHEDULED" : "DRAFT"
      }
    }
  });
}
async function deleteCampaign(workspaceId, campaignId) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!existing) throw new Error("Campaign not found");
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error("Only DRAFT or SCHEDULED campaigns can be deleted");
  }
  return prisma.campaign.delete({ where: { id: campaignId } });
}
async function duplicateCampaign(workspaceId, campaignId) {
  const original = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
  if (!original) throw new Error("Campaign not found");
  return prisma.campaign.create({
    data: {
      workspaceId,
      name: `Copia de ${original.name}`,
      channel: original.channel,
      subject: original.subject,
      body: original.body,
      segmentId: original.segmentId,
      status: "DRAFT"
    }
  });
}
async function previewAudience(workspaceId, segmentId) {
  if (!segmentId) throw new Error("segmentId is required");
  const { total } = await getSegmentContacts(workspaceId, segmentId, 1, 1);
  return { count: total };
}
async function sendCampaign(workspaceId, campaignId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!DELETABLE_STATUSES.includes(campaign.status)) {
    throw new Error("Only DRAFT or SCHEDULED campaigns can be sent");
  }
  if (!campaign.segmentId) throw new Error("Campaign has no audience segment");
  if (!campaign.body?.trim()) throw new Error("Campaign has no message body");
  const channel = campaign.channel;
  const driver = getDriver(channel);
  const supChannel = suppressionChannel(channel);
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" }
  });
  const suppressions = await prisma.suppression.findMany({
    where: { workspaceId, channel: supChannel },
    select: { value: true }
  });
  const suppressed = new Set(suppressions.map((s) => s.value.toLowerCase()));
  const stats = { total: 0, sent: 0, failed: 0 };
  try {
    let page = 1;
    let totalPages = 1;
    do {
      const result = await getSegmentContacts(workspaceId, campaign.segmentId, page, SEND_PAGE_SIZE);
      totalPages = result.totalPages;
      for (const contact of result.contacts) {
        stats.total++;
        const address = recipientAddress(channel, contact);
        if (!address) {
          stats.failed++;
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: "FAILED",
              error: channel === "EMAIL" ? "Contacto sin email" : "Contacto sin tel\xE9fono"
            }
          });
          continue;
        }
        if (suppressed.has(address.toLowerCase())) {
          stats.failed++;
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: "UNSUBSCRIBED",
              error: "En lista de exclusi\xF3n"
            }
          });
          continue;
        }
        const renderedBody = renderMergeTags(campaign.body, contact);
        const subject = campaign.subject ? renderMergeTags(campaign.subject, contact) : "";
        const recipient = await prisma.campaignRecipient.create({
          data: {
            campaignId,
            workspaceId,
            contactId: contact.id,
            status: "PENDING"
          }
        });
        const body = channel === "EMAIL" ? injectTracking(renderedBody, recipient.id) : renderedBody;
        let result_;
        try {
          result_ = await dispatch(driver, channel, address, subject, body);
        } catch (err) {
          result_ = { ok: false, error: err?.message ?? "Error de env\xEDo" };
        }
        if (result_.ok) {
          stats.sent++;
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "SENT", sentAt: /* @__PURE__ */ new Date() }
          });
        } else {
          stats.failed++;
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: "FAILED", error: result_.error ?? "Error de env\xEDo" }
          });
        }
      }
      page++;
    } while (page <= totalPages);
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "SENT", sentAt: /* @__PURE__ */ new Date(), stats }
    });
    return { ...updated, stats };
  } catch (err) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "FAILED", stats }
    });
    throw new Error(err?.message ?? "Campaign send failed");
  }
}
async function sendToSingleContact(params) {
  const { campaignId, contactId, workspaceId } = params;
  const [campaign, contact] = await Promise.all([
    prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  ]);
  if (!campaign || !contact) return;
  const channel = campaign.channel;
  const address = recipientAddress(channel, contact);
  if (!address) return;
  const recipient = await prisma.campaignRecipient.create({
    data: { campaignId, workspaceId, contactId, status: "PENDING" }
  });
  const renderedBody = renderMergeTags(campaign.body, contact);
  const subject = campaign.subject ? renderMergeTags(campaign.subject, contact) : "";
  const body = channel === "EMAIL" ? injectTracking(renderedBody, recipient.id) : renderedBody;
  const driver = getDriver(channel);
  let result_;
  try {
    result_ = await dispatch(driver, channel, address, subject, body);
  } catch (err) {
    result_ = { ok: false, error: err?.message ?? "Error de env\xEDo" };
  }
  if (result_.ok) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "SENT", sentAt: /* @__PURE__ */ new Date() }
    });
  } else {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "FAILED", error: result_.error ?? "Error de env\xEDo" }
    });
  }
}
async function getCampaignStats(workspaceId, campaignId) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } });
  if (!campaign) throw new Error("Campaign not found");
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId, workspaceId },
    _count: { _all: true }
  });
  const counts = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sent = (counts["SENT"] ?? 0) + (counts["OPENED"] ?? 0) + (counts["CLICKED"] ?? 0);
  const opened = counts["OPENED"] ?? 0;
  const clicked = counts["CLICKED"] ?? 0;
  return {
    total,
    sent,
    failed: counts["FAILED"] ?? 0,
    opened,
    clicked,
    openRate: sent > 0 ? Number((opened / sent).toFixed(3)) : 0,
    clickRate: sent > 0 ? Number((clicked / sent).toFixed(3)) : 0
  };
}
async function scheduleCampaign(workspaceId, campaignId, scheduledAt) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!DELETABLE_STATUSES.includes(campaign.status)) {
    throw new Error("Only DRAFT or SCHEDULED campaigns can be scheduled");
  }
  const date = new Date(scheduledAt);
  if (isNaN(date.getTime())) throw new Error("Invalid scheduledAt date");
  if (date <= /* @__PURE__ */ new Date()) throw new Error("scheduledAt must be in the future");
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "SCHEDULED", scheduledAt: date }
  });
}
async function testSendCampaign(workspaceId, campaignId, email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address");
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId }
  });
  if (!campaign) throw new Error("Campaign not found");
  const testContact = { name: "Contacto de prueba", phone: "+56 9 0000 0000", email };
  const body = renderMergeTags(campaign.body, testContact);
  const subject = campaign.subject ? renderMergeTags(campaign.subject, testContact) : `[TEST] ${campaign.name}`;
  if (!isLiveChannel("EMAIL")) {
    console.log(`[TestSend] No email provider configured.`);
    console.log(`[TestSend] Campaign: "${campaign.name}"  To: ${email}`);
    console.log(`[TestSend] Subject: ${subject}`);
    console.log(`[TestSend] Body:
${body}`);
    return { sent: false, to: email, reason: "No email provider configured" };
  }
  const driver = getDriver("EMAIL");
  const result = await dispatch(driver, "EMAIL", email, subject, body);
  return { sent: result.ok, to: email, ...result.error ? { error: result.error } : {} };
}
var VALID_CHANNELS, DELETABLE_STATUSES, SEND_PAGE_SIZE;
var init_campaigns_service = __esm({
  "src/modules/campaigns/campaigns.service.ts"() {
    "use strict";
    init_prisma();
    init_segments_service();
    init_drivers();
    init_unsubscribe_service();
    VALID_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"];
    DELETABLE_STATUSES = ["DRAFT", "SCHEDULED"];
    SEND_PAGE_SIZE = 100;
  }
});

// src/modules/automation/executor.ts
function isSafeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const blocked = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/,
      /^0\./,
      /^metadata\.google\.internal$/,
      /^169\.254\.169\.254$/
    ];
    return !blocked.some((r) => r.test(hostname));
  } catch {
    return false;
  }
}
async function startRun(runId) {
  return resumeRun(runId);
}
async function resumeRun(runId) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true }
  });
  if (!run || run.status === "COMPLETED" || run.status === "FAILED") return;
  const nodes = Array.isArray(run.workflow.nodes) ? run.workflow.nodes : [];
  const log = Array.isArray(run.log) ? run.log : [];
  for (let i = run.cursor; i < nodes.length; i++) {
    const node = nodes[i];
    if (node?.type === "wait") {
      const cfg = node.config ?? {};
      const ms = ((Number(cfg.hours) || 0) * 60 + (Number(cfg.minutes) || 0)) * 6e4;
      const resumeAt = new Date(Date.now() + Math.max(ms, 6e4));
      log.push({ node: i, type: "wait", waitingUntil: resumeAt.toISOString() });
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "WAITING", cursor: i + 1, resumeAt, log }
      });
      return;
    }
    if (node?.type === "wait_for_reply") {
      const cfg = node.config ?? {};
      const timeoutHours = Math.max(Number(cfg.timeoutHours) || 24, 1);
      const resumeAt = new Date(Date.now() + timeoutHours * 36e5);
      const existingMeta = run.meta ?? {};
      log.push({ node: i, type: "wait_for_reply", timeoutAt: resumeAt.toISOString() });
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: "WAITING",
          cursor: i + 1,
          resumeAt,
          meta: { ...existingMeta, waitingForReply: true, waitingForContactId: run.contactId },
          log
        }
      });
      return;
    }
    try {
      const cont = await executeNode(run.workspaceId, run.contactId, node, run.context);
      log.push({ node: i, type: node?.type, ok: true, at: (/* @__PURE__ */ new Date()).toISOString() });
      if (node?.type === "branch" && cont === false) {
        log.push({ node: i, type: "branch", stopped: true });
        break;
      }
    } catch (err) {
      log.push({ node: i, type: node?.type, ok: false, error: String(err?.message ?? err) });
    }
  }
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", cursor: nodes.length, completedAt: /* @__PURE__ */ new Date(), log }
  });
}
async function executeNode(workspaceId, contactId, node, context) {
  const cfg = node?.config ?? {};
  switch (node?.type) {
    case "add_note":
      if (contactId) {
        await createContactEvent(workspaceId, contactId, "NOTE_ADDED", cfg.title ?? "Nota autom\xE1tica", cfg.text);
      }
      return;
    case "create_task":
      if (contactId) {
        await prisma.contactTask.create({
          data: {
            workspaceId,
            contactId,
            title: cfg.title ?? "Tarea autom\xE1tica",
            description: cfg.description ?? void 0,
            priority: cfg.priority ?? "MEDIUM",
            dueAt: cfg.dueInHours ? new Date(Date.now() + Number(cfg.dueInHours) * 36e5) : void 0
          }
        });
      }
      return;
    case "update_status":
      if (contactId && cfg.status) {
        await prisma.contact.update({ where: { id: contactId }, data: { status: cfg.status } });
      }
      return;
    case "add_tag":
      if (contactId && cfg.name) {
        await prisma.contactTag.upsert({
          where: { contactId_name: { contactId, name: cfg.name } },
          create: { workspaceId, contactId, name: cfg.name, color: cfg.color ?? "#6366f1" },
          update: { color: cfg.color ?? "#6366f1" }
        });
      }
      return;
    case "remove_tag":
      if (contactId && cfg.name) {
        await prisma.contactTag.deleteMany({ where: { workspaceId, contactId, name: cfg.name } });
      }
      return;
    case "move_deal":
      if (contactId && cfg.stageId) {
        const deal = await prisma.deal.findFirst({
          where: { workspaceId, contactId, status: "OPEN" },
          orderBy: { createdAt: "desc" }
        });
        if (deal) await prisma.deal.update({ where: { id: deal.id }, data: { stageId: cfg.stageId } });
      }
      return;
    case "send_campaign": {
      const campaignId = cfg.campaignId;
      if (!contactId || !campaignId) return;
      const { sendToSingleContact: sendToSingleContact2 } = await Promise.resolve().then(() => (init_campaigns_service(), campaigns_service_exports));
      await sendToSingleContact2({ campaignId, contactId, workspaceId });
      return;
    }
    case "webhook":
      if (cfg.url && httpFetch) {
        if (!isSafeUrl(cfg.url)) {
          console.warn(`[executor] Blocked unsafe webhook URL (SSRF guard): ${cfg.url} (workspace ${workspaceId})`);
          throw new Error("Webhook URL blocked: not a safe public HTTPS endpoint");
        }
        const res = await httpFetch(cfg.url, {
          method: cfg.method ?? "POST",
          headers: { "Content-Type": "application/json", ...cfg.headers ?? {} },
          body: JSON.stringify({ workspaceId, contactId, context }),
          signal: AbortSignal.timeout(1e4)
        });
        const declaredLen = Number(res.headers.get("content-length") ?? -1);
        if (declaredLen > 1e6) {
          await res.body?.cancel();
        } else {
          const MAX = 1e6;
          let consumed = 0;
          const reader = res.body?.getReader();
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              consumed += value?.byteLength ?? 0;
              if (consumed > MAX) {
                await reader.cancel();
                break;
              }
            }
          }
        }
      }
      return;
    case "branch": {
      if (!contactId) return false;
      const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
      return evalCondition(contact, cfg);
    }
    default:
      return;
  }
}
function evalCondition(contact, cfg) {
  if (!contact || !cfg.field) return true;
  const left = contact[cfg.field];
  const right = cfg.value;
  switch (cfg.op) {
    case "eq":
      return String(left) === String(right);
    case "neq":
      return String(left) !== String(right);
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "contains":
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "is_true":
      return left === true;
    case "is_false":
      return left === false || left == null;
    default:
      return true;
  }
}
var httpFetch;
var init_executor = __esm({
  "src/modules/automation/executor.ts"() {
    "use strict";
    init_prisma();
    init_contactEvents_service();
    httpFetch = globalThis.fetch;
  }
});

// src/modules/automation/dispatcher.ts
async function dispatchWorkflows(workspaceId, contactId, type, ctx) {
  if (type === "MESSAGE_RECEIVED" && contactId) {
    await resumeWaitingForReply(workspaceId, contactId);
  }
  const workflows = await prisma.workflow.findMany({
    where: { workspaceId, isActive: true, triggerType: type }
  });
  if (workflows.length === 0) return;
  for (const wf of workflows) {
    if (!matchesTriggerConfig(wf.triggerConfig, ctx)) continue;
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        workspaceId,
        contactId: contactId ?? void 0,
        status: "RUNNING",
        cursor: 0,
        context: ctx ?? {}
      }
    });
    await prisma.workflow.update({
      where: { id: wf.id },
      data: { runCount: { increment: 1 }, lastRunAt: /* @__PURE__ */ new Date() }
    });
    await startRun(run.id).catch((err) => console.error("[automation] run error:", err));
  }
}
async function resumeWaitingForReply(workspaceId, contactId) {
  const waitingRuns = await prisma.workflowRun.findMany({
    where: {
      workspaceId,
      status: "WAITING",
      meta: { path: ["waitingForContactId"], equals: contactId }
    }
  });
  for (const run of waitingRuns) {
    const existingMeta = run.meta ?? {};
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        resumeAt: null,
        meta: { ...existingMeta, waitingForReply: false, waitingForContactId: null }
      }
    });
    await resumeRun(run.id).catch((err) => console.error("[automation] resume-on-reply error:", err));
  }
}
function matchesTriggerConfig(triggerConfig, ctx) {
  if (!triggerConfig || typeof triggerConfig !== "object") return true;
  const meta = ctx?.metadata ?? {};
  return Object.entries(triggerConfig).every(([k, v]) => {
    if (v == null || v === "") return true;
    return String(meta[k]) === String(v);
  });
}
var init_dispatcher = __esm({
  "src/modules/automation/dispatcher.ts"() {
    "use strict";
    init_prisma();
    init_executor();
  }
});

// src/modules/automation/emit.ts
async function emitContactEvent(workspaceId, contactId, type, title, description, metadata) {
  let event = null;
  try {
    event = await createContactEvent(workspaceId, contactId, type, title, description, metadata);
  } catch (err) {
    console.error("[automation] no se pudo persistir el ContactEvent:", err);
  }
  dispatchWorkflows(workspaceId, contactId, type, { event, metadata }).catch(
    (err) => console.error("[automation] dispatch error:", err)
  );
  return event;
}
var init_emit = __esm({
  "src/modules/automation/emit.ts"() {
    "use strict";
    init_contactEvents_service();
    init_dispatcher();
  }
});

// src/modules/crm/pipeline.service.ts
async function listPipelines(workspaceId) {
  return prisma.pipeline.findMany({
    where: { workspaceId },
    include: {
      stages: { orderBy: { order: "asc" } },
      _count: { select: { deals: true } }
    },
    orderBy: { isDefault: "desc" }
  });
}
async function createPipeline(workspaceId, name) {
  const existing = await prisma.pipeline.findFirst({ where: { workspaceId } });
  const isDefault = !existing;
  return prisma.pipeline.create({
    data: {
      workspaceId,
      name,
      isDefault,
      stages: { create: DEFAULT_STAGES }
    },
    include: { stages: { orderBy: { order: "asc" } } }
  });
}
async function listDeals(workspaceId, pipelineId) {
  return prisma.deal.findMany({
    where: {
      workspaceId,
      ...pipelineId && { pipelineId }
    },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}
async function createDeal(workspaceId, data) {
  const { value, probability, expectedCloseAt, ...rest } = data;
  const deal = await prisma.deal.create({
    data: {
      workspaceId,
      ...rest,
      ...value !== void 0 && { value },
      ...probability != null && { probability },
      ...expectedCloseAt && { expectedCloseAt: new Date(expectedCloseAt) }
    },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    }
  });
  await emitContactEvent(
    workspaceId,
    deal.contactId,
    "DEAL_CREATED",
    `Deal creado: ${deal.title}`,
    void 0,
    { dealId: deal.id, stageId: deal.stageId, value: value ?? 0 }
  );
  return deal;
}
async function moveDeal(workspaceId, dealId, stageId) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } });
  if (!deal) throw new Error("Deal not found");
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId: deal.pipelineId }
  });
  if (!stage) throw new Error("Stage not found");
  const now = /* @__PURE__ */ new Date();
  const extra = {};
  if (stage.isWon) {
    extra.status = "WON";
    extra.wonAt = now;
  } else if (stage.isLost) {
    extra.status = "LOST";
    extra.lostAt = now;
  }
  const updated = await prisma.deal.update({
    where: { id: dealId, workspaceId },
    data: { stageId, ...extra }
  });
  const meta = { dealId, stageId, stageName: stage.name };
  await emitContactEvent(workspaceId, deal.contactId, "DEAL_STAGE_CHANGED", `Deal movido a ${stage.name}`, void 0, meta);
  if (stage.isWon) await emitContactEvent(workspaceId, deal.contactId, "DEAL_WON", `Deal ganado: ${deal.title}`, void 0, meta);
  else if (stage.isLost) await emitContactEvent(workspaceId, deal.contactId, "DEAL_LOST", `Deal perdido: ${deal.title}`, void 0, meta);
  return updated;
}
async function closeDeal(workspaceId, dealId, outcome, lostReason) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } });
  if (!deal) throw new Error("Deal not found");
  const now = /* @__PURE__ */ new Date();
  const data = outcome === "WON" ? { status: "WON", wonAt: now } : { status: "LOST", lostAt: now, lostReason: lostReason ?? null };
  const updated = await prisma.deal.update({ where: { id: dealId, workspaceId }, data });
  await emitContactEvent(
    workspaceId,
    deal.contactId,
    outcome === "WON" ? "DEAL_WON" : "DEAL_LOST",
    `Deal ${outcome === "WON" ? "ganado" : "perdido"}: ${deal.title}`,
    lostReason ?? void 0,
    { dealId }
  );
  return updated;
}
async function getPipelineAnalytics(workspaceId, pipelineId) {
  const [allDeals, stages, lostReasonsRaw] = await Promise.all([
    prisma.deal.findMany({
      where: { workspaceId, pipelineId },
      select: { value: true, probability: true, status: true }
    }),
    prisma.pipelineStage.findMany({
      where: { pipelineId },
      include: { deals: { where: { workspaceId } } },
      orderBy: { order: "asc" }
    }),
    prisma.deal.groupBy({
      by: ["lostReason"],
      where: { workspaceId, pipelineId, lostReason: { not: null } },
      _count: true
    })
  ]);
  const totalDeals = allDeals.length;
  const totalValue = allDeals.reduce((sum, d) => sum + Number(d.value), 0);
  const weightedValue = allDeals.reduce((sum, d) => {
    return sum + Number(d.value) * ((d.probability ?? 0) / 100);
  }, 0);
  const wonValue = allDeals.filter((d) => d.status === "WON").reduce((sum, d) => sum + Number(d.value), 0);
  const lostCount = allDeals.filter((d) => d.status === "LOST").length;
  const stageMetrics = stages.map((stage) => {
    const deals = stage.deals;
    const dealCount = deals.length;
    const totalStageValue = deals.reduce((sum, d) => sum + Number(d.value), 0);
    const avgDaysInStage = dealCount > 0 ? deals.reduce((sum, d) => {
      return sum + (d.updatedAt.getTime() - d.createdAt.getTime()) / (1e3 * 60 * 60 * 24);
    }, 0) / dealCount : null;
    return {
      stageId: stage.id,
      stageName: stage.name,
      dealCount,
      totalValue: totalStageValue,
      avgDaysInStage
    };
  });
  const lostReasons = lostReasonsRaw.map((r) => ({
    reason: r.lostReason,
    count: r._count
  }));
  return { totalDeals, totalValue, weightedValue, wonValue, lostCount, stageMetrics, lostReasons };
}
async function updateDeal(workspaceId, dealId, data) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } });
  if (!deal) throw new Error("Deal not found");
  const updateData = {};
  if (data.title !== void 0) updateData.title = data.title.trim();
  if (data.value !== void 0) updateData.value = data.value;
  if (data.probability !== void 0) updateData.probability = data.probability;
  if (data.expectedCloseAt !== void 0) {
    updateData.expectedCloseAt = data.expectedCloseAt ? new Date(data.expectedCloseAt) : null;
  }
  if (data.assignedToUserId !== void 0) updateData.assignedToUserId = data.assignedToUserId;
  return prisma.deal.update({
    where: { id: dealId },
    data: updateData,
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      contact: { select: { id: true, name: true, phone: true, leadTemperature: true, leadScore: true } }
    }
  });
}
async function deleteDeal(workspaceId, dealId) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } });
  if (!deal) throw new Error("Deal not found");
  await prisma.deal.delete({ where: { id: dealId } });
}
async function createStage(workspaceId, pipelineId, data) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) throw new Error("Pipeline not found");
  let order = data.order;
  if (order === void 0) {
    const maxStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { order: "desc" }
    });
    order = (maxStage?.order ?? 0) + 1;
  }
  return prisma.pipelineStage.create({
    data: { pipelineId, name: data.name, color: data.color ?? "#6366f1", order }
  });
}
async function updateStage(workspaceId, pipelineId, stageId, data) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) throw new Error("Pipeline not found");
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
  if (!stage) throw new Error("Stage not found");
  return prisma.pipelineStage.update({
    where: { id: stageId },
    data: {
      ...data.name !== void 0 && { name: data.name },
      ...data.color !== void 0 && { color: data.color }
    }
  });
}
async function deleteStage(workspaceId, pipelineId, stageId) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) throw new Error("Pipeline not found");
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
  if (!stage) throw new Error("Stage not found");
  const dealCount = await prisma.deal.count({ where: { stageId, workspaceId } });
  if (dealCount > 0) {
    const err = new Error("Mueve los deals primero");
    err.code = "STAGE_HAS_DEALS";
    throw err;
  }
  await prisma.pipelineStage.delete({ where: { id: stageId } });
  const remaining = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    orderBy: { order: "asc" }
  });
  if (remaining.length > 0) {
    await prisma.$transaction(
      remaining.map(
        (s, idx) => prisma.pipelineStage.update({ where: { id: s.id }, data: { order: idx + 1 } })
      )
    );
  }
}
async function reorderStages(workspaceId, pipelineId, orderedIds) {
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId } });
  if (!pipeline) throw new Error("Pipeline not found");
  await prisma.$transaction(
    orderedIds.map(
      (id, idx) => prisma.pipelineStage.update({ where: { id }, data: { order: idx + 1 } })
    )
  );
}
var DEFAULT_STAGES;
var init_pipeline_service = __esm({
  "src/modules/crm/pipeline.service.ts"() {
    "use strict";
    init_prisma();
    init_emit();
    DEFAULT_STAGES = [
      { name: "Lead", color: "#94a3b8", order: 1, isWon: false, isLost: false },
      { name: "Calificado", color: "#818cf8", order: 2, isWon: false, isLost: false },
      { name: "Propuesta", color: "#f59e0b", order: 3, isWon: false, isLost: false },
      { name: "Negociaci\xF3n", color: "#f97316", order: 4, isWon: false, isLost: false },
      { name: "Ganado", color: "#22c55e", order: 5, isWon: true, isLost: false },
      { name: "Perdido", color: "#ef4444", order: 6, isWon: false, isLost: true }
    ];
  }
});

// src/modules/ai-agent/providers/gemini.provider.ts
function wrapResult(chat, response) {
  const calls = response.functionCalls() || [];
  return {
    text: calls.length ? null : response.text(),
    toolCalls: calls.map((c) => ({ name: c.name, args: c.args })),
    async submitToolResults(results) {
      const parts = results.map((r) => ({ functionResponse: { name: r.name, response: r.response } }));
      const next = await chat.sendMessage(parts);
      return wrapResult(chat, next.response);
    }
  };
}
var import_generative_ai, genAI, CHAT_MODEL, EMBED_MODEL, geminiProvider;
var init_gemini_provider = __esm({
  "src/modules/ai-agent/providers/gemini.provider.ts"() {
    "use strict";
    import_generative_ai = require("@google/generative-ai");
    genAI = new import_generative_ai.GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
    CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
    EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
    geminiProvider = {
      async chat({ system, messages, tools }) {
        const model = genAI.getGenerativeModel({
          model: CHAT_MODEL,
          tools: [{ functionDeclarations: tools }]
        });
        const history = messages.slice(0, -1).map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }]
        }));
        const last = messages[messages.length - 1];
        const chat = model.startChat({
          history,
          systemInstruction: { role: "system", parts: [{ text: system }] }
        });
        const result = await chat.sendMessage(last?.content ?? "");
        return wrapResult(chat, result.response);
      },
      async embed(texts) {
        const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
        const res = await model.batchEmbedContents({
          requests: texts.map((t) => ({ content: { role: "user", parts: [{ text: t }] } }))
        });
        return res.embeddings.map((e) => e.values);
      }
    };
  }
});

// src/modules/ai-agent/providers/provider.factory.ts
function getProvider(name) {
  const key = name || "gemini";
  const provider3 = providers[key];
  if (!provider3) throw new Error(`Unknown LLM provider: ${key}`);
  return provider3;
}
var providers;
var init_provider_factory = __esm({
  "src/modules/ai-agent/providers/provider.factory.ts"() {
    "use strict";
    init_gemini_provider();
    providers = {
      gemini: geminiProvider
    };
  }
});

// src/modules/ai-agent/promptCompiler.ts
function compileSystemPrompt({ agent, profile, knowledgeChunks, contact, deal }) {
  const sections = [];
  sections.push(`Eres ${agent.name}, agente de ventas experto. Tono: ${agent.tone}.`);
  if (agent.promptBase) sections.push(`Instrucciones base: ${agent.promptBase}`);
  if (profile?.business?.description) {
    sections.push(`NEGOCIO:
${profile.business.description}${profile.business.coverage ? `
Cobertura: ${profile.business.coverage}` : ""}`);
  }
  if (profile?.offer?.length) {
    sections.push(`OFERTA (no inventes precios fuera de esta lista):
${profile.offer.map((o) => `- ${o.name}${o.price ? `: ${o.price}` : ""}`).join("\n")}`);
  }
  if (knowledgeChunks.length) {
    sections.push(`CONOCIMIENTO DEL NEGOCIO (usa esto para responder; si no est\xE1 aqu\xED ni en la oferta, no lo afirmes):
${knowledgeChunks.map((c) => `- ${c}`).join("\n")}`);
  }
  if (contact) {
    const qualified = contact.qualificationData ?? {};
    const pending = (profile?.qualificationQuestions ?? []).filter((q) => qualified[q.key] === void 0);
    sections.push(`LEAD ACTUAL:
Nombre: ${contact.name}
Status: ${contact.status}
Temperatura: ${contact.leadTemperature ?? "sin calificar"} | Tipo: ${contact.leadType ?? "sin calificar"} | Score: ${contact.leadScore ?? "-"}`);
    if (pending.length) {
      sections.push(`PREGUNTAS DE CALIFICACI\xD3N PENDIENTES (obt\xE9n estas respuestas de forma natural, m\xE1ximo una por mensaje, nunca como interrogatorio):
${pending.map((q) => `- [${q.key}] ${q.question}`).join("\n")}`);
    }
  }
  if (deal) {
    sections.push(`DEAL ACTIVO: "${deal.title}" en etapa "${deal.stage?.name ?? "inicial"}". Tu trabajo es empujarlo a la siguiente etapa.`);
  }
  if (profile?.objections?.length) {
    sections.push(`MANEJO DE OBJECIONES:
${profile.objections.map((o) => `- Si dice "${o.objection}" \u2192 responde en l\xEDnea con: ${o.response}`).join("\n")}`);
  }
  sections.push(`PLAYBOOK DE CIERRE (sigue las etapas en orden):
1. Saludo breve y c\xE1lido.
2. Descubrimiento: obt\xE9n las respuestas de calificaci\xF3n pendientes.
3. Presenta la soluci\xF3n adecuada de la OFERTA seg\xFAn sus respuestas.
4. Maneja objeciones con los argumentos dados.
5. Cierre: ${profile?.scheduling?.enabled ? "agenda una cita con schedule_appointment (ofrece horarios reales con get_available_slots)" : "crea o avanza el deal"} y confirma el siguiente paso.

REGLAS DURAS:
- Cada vez que obtengas una respuesta de calificaci\xF3n o detectes cambio de intenci\xF3n, llama update_qualification y tag_contact.
- No inventes precios, plazos ni garant\xEDas que no est\xE9n en OFERTA o CONOCIMIENTO.
- Si el cliente se molesta o pide un humano, usa handover_to_human.
- S\xE9 conciso: mensajes cortos estilo WhatsApp.${!profile ? "\n- Ayuda al cliente y trata de cerrar una venta." : ""}`);
  return sections.join("\n\n");
}
var init_promptCompiler = __esm({
  "src/modules/ai-agent/promptCompiler.ts"() {
    "use strict";
  }
});

// src/modules/knowledge/retrieval.service.ts
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
async function retrieveRelevantChunks(workspaceId, query, opts = {}) {
  const topK = opts.topK ?? 5;
  const minScore = opts.minScore ?? 0.5;
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { workspaceId, document: { status: "READY" } },
    select: { content: true, embedding: true }
  });
  if (chunks.length === 0) return [];
  const [queryEmbedding] = await getProvider().embed([query]);
  return chunks.map((c) => ({ content: c.content, score: cosineSimilarity(queryEmbedding, c.embedding) })).filter((c) => c.score >= minScore).sort((a, b) => b.score - a.score).slice(0, topK);
}
var init_retrieval_service = __esm({
  "src/modules/knowledge/retrieval.service.ts"() {
    "use strict";
    init_prisma();
    init_provider_factory();
  }
});

// src/modules/scheduling/scheduling.service.ts
async function getWorkspaceTimezone(workspaceId) {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } });
    return bh?.timezone || void 0;
  } catch {
    return void 0;
  }
}
function toWallClock(d, tz) {
  if (!tz) return d;
  return new Date(d.toLocaleString("en-US", { timeZone: tz }));
}
function parseHHmm(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function findRuleForTime(rules, day, minutes) {
  return rules.find((r) => {
    if (r.dayOfWeek !== day) return false;
    return minutes >= parseHHmm(r.startTime) && minutes + r.slotMinutes <= parseHHmm(r.endTime);
  });
}
async function getAvailableSlots(workspaceId, type, fromDate, daysAhead = 7) {
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: type } });
  if (rules.length === 0) return [];
  const tz = await getWorkspaceTimezone(workspaceId);
  const until = new Date(fromDate);
  until.setDate(until.getDate() + daysAhead);
  const existing = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      scheduledAt: { gte: fromDate, lt: until }
    },
    select: { scheduledAt: true, durationMin: true }
  });
  const busy = existing.map((a) => ({
    start: a.scheduledAt.getTime(),
    end: a.scheduledAt.getTime() + a.durationMin * 6e4
  }));
  const overlapsBusy = (start, end) => busy.some((b) => start < b.end && b.start < end);
  const slots = [];
  const now = /* @__PURE__ */ new Date();
  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + d);
    const dayWall = toWallClock(day, tz);
    const offset = day.getTime() - dayWall.getTime();
    for (const rule of rules.filter((r) => r.dayOfWeek === dayWall.getDay())) {
      const [sh, sm] = rule.startTime.split(":").map(Number);
      const [eh, em] = rule.endTime.split(":").map(Number);
      const cursorWall = new Date(dayWall);
      cursorWall.setHours(sh, sm, 0, 0);
      const endWall = new Date(dayWall);
      endWall.setHours(eh, em, 0, 0);
      let cursorMs = cursorWall.getTime() + offset;
      const endMs = endWall.getTime() + offset;
      const stepMs = rule.slotMinutes * 6e4;
      while (cursorMs + stepMs <= endMs) {
        if (cursorMs > now.getTime() && !overlapsBusy(cursorMs, cursorMs + stepMs)) {
          slots.push(new Date(cursorMs));
        }
        cursorMs += stepMs;
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}
async function scheduleAppointment(workspaceId, input) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } });
  if (!contact) throw new Error("Contact not found");
  const rules = await prisma.availabilityRule.findMany({ where: { workspaceId, apptType: input.type } });
  const tz = await getWorkspaceTimezone(workspaceId);
  const wall = toWallClock(input.scheduledAt, tz);
  const day = wall.getDay();
  const minutes = wall.getHours() * 60 + wall.getMinutes();
  const matchedRule = findRuleForTime(rules, day, minutes);
  if (!matchedRule) throw new Error("Requested time is outside availability");
  const dayStart = new Date(input.scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const sameDay = await prisma.appointment.findMany({
    where: { workspaceId, status: { in: ["SCHEDULED", "CONFIRMED"] }, scheduledAt: { gte: dayStart, lt: dayEnd } },
    select: { scheduledAt: true, durationMin: true }
  });
  const requested = input.scheduledAt.getTime();
  const duration = matchedRule.slotMinutes * 6e4;
  const collision = sameDay.some((a) => {
    const start = a.scheduledAt.getTime();
    return requested < start + a.durationMin * 6e4 && start < requested + duration;
  });
  if (collision) throw new Error("Slot already taken");
  return prisma.appointment.create({
    data: {
      workspaceId,
      contactId: contact.id,
      dealId: input.dealId ?? null,
      type: input.type,
      scheduledAt: input.scheduledAt,
      durationMin: duration / 6e4,
      createdBy: input.createdBy,
      notes: input.notes ?? null
    }
  });
}
async function listAppointments(workspaceId, from, to) {
  return prisma.appointment.findMany({
    where: { workspaceId, ...from || to ? { scheduledAt: { ...from && { gte: from }, ...to && { lt: to } } } : {} },
    include: { contact: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: "asc" }
  });
}
async function updateAppointmentStatus(workspaceId, id, status) {
  const valid = ["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
  if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`);
  const appt = await prisma.appointment.findFirst({ where: { id, workspaceId } });
  if (!appt) throw new Error("Appointment not found");
  return prisma.appointment.update({ where: { id: appt.id }, data: { status } });
}
var init_scheduling_service = __esm({
  "src/modules/scheduling/scheduling.service.ts"() {
    "use strict";
    init_prisma();
  }
});

// src/modules/ai-agent/ai.service.ts
async function processAiResponse(workspaceId, conversationId, userContent) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      // latest 10 messages (not the oldest 10) — reversed back to chronological below
      messages: { orderBy: { sentAt: "desc" }, take: 10 },
      channel: { select: { platform: true } }
    }
  });
  if (!conversation || !conversation.isHandledByBot) return null;
  const agent = await prisma.botAgent.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: "desc" }
  });
  if (!agent) return null;
  const profile = agent.config?.profile ?? null;
  const knowledge = await retrieveRelevantChunks(workspaceId, userContent).catch(() => []);
  const deal = conversation.contact ? await prisma.deal.findFirst({
    where: { contactId: conversation.contact.id, workspaceId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { stage: true }
  }) : null;
  const system = compileSystemPrompt({
    agent: { name: agent.name, tone: agent.tone, promptBase: agent.promptBase },
    profile,
    knowledgeChunks: knowledge.map((k) => k.content),
    contact: conversation.contact,
    deal
  });
  const history = [...conversation.messages].reverse().filter((m) => !m.isInternal).map((m) => ({ role: m.senderType === "CONTACT" ? "user" : "assistant", content: m.content }));
  const last = history[history.length - 1];
  if (last && last.role === "user" && last.content === userContent) history.pop();
  const provider3 = getProvider(agent.provider);
  let result = await provider3.chat({
    system,
    messages: [...history, { role: "user", content: userContent }],
    tools: toolDeclarations
  });
  let rounds = 0;
  let handoverCalled = false;
  while (result.toolCalls.length > 0 && rounds < 5) {
    const responses = [];
    for (const call of result.toolCalls) {
      if (call.name === "handover_to_human") handoverCalled = true;
      const toolResult = await handleToolCall(workspaceId, conversationId, call);
      responses.push({ name: call.name, response: toolResult });
    }
    result = await result.submitToolResults(responses);
    rounds++;
  }
  if (handoverCalled) return null;
  return result.text;
}
async function handleToolCall(workspaceId, conversationId, call) {
  const { name, args } = call;
  console.log(`[AI Agent] Tool call: ${name}`, args);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true }
  });
  const contactId = conv?.contactId ?? args.contactId;
  try {
    switch (name) {
      case "qualify_lead":
        await updateContact(workspaceId, contactId, { status: args.status });
        await logAiAction(workspaceId, conversationId, `Calific\xF3 al lead como ${args.status}`);
        return { success: true, message: `Status updated to ${args.status}` };
      case "create_deal":
        const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } });
        const stages = pipeline ? await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: "asc" } }) : [];
        const firstStage = stages[0];
        if (!firstStage) return { success: false, error: "No pipeline stages found" };
        await createDeal(workspaceId, {
          contactId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          title: args.title,
          value: args.value
        });
        await logAiAction(workspaceId, conversationId, `Cre\xF3 una oportunidad: ${args.title} ($${args.value})`);
        return { success: true, deal: args.title };
      case "move_deal":
        const deal = await prisma.deal.findFirst({
          where: { contactId, workspaceId, status: "OPEN" },
          orderBy: { createdAt: "desc" }
        });
        if (!deal) return { success: false, error: "No active deal found for this contact" };
        const stage = await prisma.pipelineStage.findFirst({
          where: { pipelineId: deal.pipelineId, name: { contains: args.stageName, mode: "insensitive" } }
        });
        if (!stage) return { success: false, error: `Stage "${args.stageName}" not found` };
        await prisma.deal.update({
          where: { id: deal.id },
          data: { stageId: stage.id }
        });
        await logAiAction(workspaceId, conversationId, `Movi\xF3 el deal a la etapa: ${stage.name}`);
        return { success: true, newStage: stage.name };
      case "handover_to_human":
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { isHandledByBot: false }
        });
        await logAiAction(workspaceId, conversationId, "Deriv\xF3 la conversaci\xF3n a un agente humano");
        return { success: true, message: "Handover complete" };
      case "search_catalog":
        const matches = await prisma.product.findMany({
          where: {
            workspaceId,
            OR: [
              { name: { contains: args.query, mode: "insensitive" } },
              { sku: { contains: args.query, mode: "insensitive" } }
            ]
          },
          take: 5
        });
        return { products: matches.map((p) => ({ name: p.name, price: p.price, sku: p.sku })) };
      case "update_qualification":
        await updateQualification(workspaceId, contactId, {
          temperature: args.temperature,
          type: args.type,
          score: args.score,
          data: args.data
        });
        await logAiAction(workspaceId, conversationId, `Calific\xF3 al lead: ${args.temperature ?? ""} ${args.type ?? ""} score=${args.score ?? "-"}`);
        return { success: true };
      case "tag_contact":
        await addTag(workspaceId, contactId, args.name, args.color ?? "#f59e0b");
        await logAiAction(workspaceId, conversationId, `Etiquet\xF3 al contacto: ${args.name}`);
        return { success: true };
      case "get_available_slots": {
        const slots = await getAvailableSlots(workspaceId, args.type ?? "SITE_VISIT", /* @__PURE__ */ new Date(), 14);
        return { slots: slots.slice(0, 6).map((s) => s.toISOString()) };
      }
      case "schedule_appointment": {
        const appt = await scheduleAppointment(workspaceId, {
          contactId,
          type: args.type ?? "SITE_VISIT",
          scheduledAt: new Date(args.isoDateTime),
          createdBy: "BOT"
        });
        await logAiAction(workspaceId, conversationId, `Agend\xF3 cita ${args.type} para ${args.isoDateTime}`);
        return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt };
      }
      default:
        return { error: "Unknown tool" };
    }
  } catch (err) {
    console.error(`[AI Agent] Tool error in ${name}:`, err);
    return { error: err.message };
  }
}
async function logAiAction(workspaceId, conversationId, content) {
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: "OUTBOUND",
      senderType: "SYSTEM",
      content,
      isInternal: true
    }
  });
}
var import_generative_ai2, toolDeclarations;
var init_ai_service = __esm({
  "src/modules/ai-agent/ai.service.ts"() {
    "use strict";
    import_generative_ai2 = require("@google/generative-ai");
    init_prisma();
    init_contact_service();
    init_pipeline_service();
    init_provider_factory();
    init_promptCompiler();
    init_retrieval_service();
    init_scheduling_service();
    toolDeclarations = [
      {
        name: "qualify_lead",
        description: "Updates the contact status (LEAD, PROSPECT, CUSTOMER). Use PROSPECT when the lead shows clear intent to buy or asks for a quote.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING, description: "The ID of the contact" },
            status: { type: import_generative_ai2.SchemaType.STRING, description: "The new status (LEAD, PROSPECT, CUSTOMER)" }
          },
          required: ["contactId", "status"]
        }
      },
      {
        name: "create_deal",
        description: "Creates a sales opportunity in the pipeline. Use when the lead is ready for a formal offer.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING, description: "The ID of the contact" },
            title: { type: import_generative_ai2.SchemaType.STRING, description: "Brief title for the deal" },
            value: { type: import_generative_ai2.SchemaType.NUMBER, description: "Estimated value of the deal" }
          },
          required: ["contactId", "title", "value"]
        }
      },
      {
        name: "move_deal",
        description: "Moves an active deal to a different stage in the pipeline. Use when a milestone is reached (e.g. quote sent, meeting scheduled).",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING, description: "The ID of the contact" },
            stageName: { type: import_generative_ai2.SchemaType.STRING, description: 'The name of the target stage (e.g. "Cotizaci\xF3n", "Cita")' }
          },
          required: ["contactId", "stageName"]
        }
      },
      {
        name: "handover_to_human",
        description: "Disables the AI agent for this conversation and notifies a human agent. Use when requested or for complex issues.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            conversationId: { type: import_generative_ai2.SchemaType.STRING, description: "The ID of the conversation" }
          },
          required: ["conversationId"]
        }
      },
      {
        name: "search_catalog",
        description: "Searches for products, prices and stock in the store catalog.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            query: { type: import_generative_ai2.SchemaType.STRING, description: "Search term for the product" }
          },
          required: ["query"]
        }
      },
      {
        name: "update_qualification",
        description: "Records lead qualification: temperature (COLD/WARM/HOT), type (CURIOUS/QUOTING/READY_TO_BUY/POST_SALE), score 0-100, and answers to qualification questions as data {key: answer}. Call whenever you learn a qualification answer or intent changes.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING },
            temperature: { type: import_generative_ai2.SchemaType.STRING, description: "COLD | WARM | HOT" },
            type: { type: import_generative_ai2.SchemaType.STRING, description: "CURIOUS | QUOTING | READY_TO_BUY | POST_SALE" },
            score: { type: import_generative_ai2.SchemaType.NUMBER, description: "0-100" },
            data: { type: import_generative_ai2.SchemaType.OBJECT, description: "Answers keyed by qualification question key" }
          },
          required: ["contactId"]
        }
      },
      {
        name: "tag_contact",
        description: 'Adds a tag to the contact for CRM segmentation (e.g. "lead-caliente", "financiamiento", "postventa").',
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING },
            name: { type: import_generative_ai2.SchemaType.STRING },
            color: { type: import_generative_ai2.SchemaType.STRING, description: "Optional hex color" }
          },
          required: ["contactId", "name"]
        }
      },
      {
        name: "get_available_slots",
        description: "Returns the next available appointment slots. Use BEFORE offering times to the customer.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: { type: { type: import_generative_ai2.SchemaType.STRING, description: "SITE_VISIT | CALL" } },
          required: ["type"]
        }
      },
      {
        name: "schedule_appointment",
        description: "Books an appointment at a confirmed time. Only use times returned by get_available_slots.",
        parameters: {
          type: import_generative_ai2.SchemaType.OBJECT,
          properties: {
            contactId: { type: import_generative_ai2.SchemaType.STRING },
            isoDateTime: { type: import_generative_ai2.SchemaType.STRING, description: "ISO 8601 datetime" },
            type: { type: import_generative_ai2.SchemaType.STRING, description: "SITE_VISIT | CALL" }
          },
          required: ["contactId", "isoDateTime", "type"]
        }
      }
    ];
  }
});

// src/lib/whatsapp/WhatsAppManager.ts
var WhatsAppManager_exports = {};
__export(WhatsAppManager_exports, {
  WhatsAppSessionManager: () => WhatsAppSessionManager
});
var import_whatsapp_web, import_qrcode, import_path, WhatsAppSessionManager;
var init_WhatsAppManager = __esm({
  "src/lib/whatsapp/WhatsAppManager.ts"() {
    "use strict";
    import_whatsapp_web = require("whatsapp-web.js");
    import_qrcode = __toESM(require("qrcode"));
    init_socket();
    init_prisma();
    import_path = __toESM(require("path"));
    WhatsAppSessionManager = class _WhatsAppSessionManager {
      static instance;
      clients = /* @__PURE__ */ new Map();
      authPath = import_path.default.join(process.cwd(), ".wwebjs_auth");
      constructor() {
      }
      static getInstance() {
        if (!_WhatsAppSessionManager.instance) {
          _WhatsAppSessionManager.instance = new _WhatsAppSessionManager();
        }
        return _WhatsAppSessionManager.instance;
      }
      /**
       * Initializes a WhatsApp client for a specific workspace.
       */
      async initSession(workspaceId) {
        if (this.clients.has(workspaceId)) {
          console.log(`[WhatsApp] Session already exists for workspace: ${workspaceId}`);
          return;
        }
        console.log(`[WhatsApp] Initializing session for workspace: ${workspaceId}`);
        const client = new import_whatsapp_web.Client({
          authStrategy: new import_whatsapp_web.LocalAuth({
            clientId: workspaceId,
            dataPath: this.authPath
          }),
          puppeteer: {
            headless: true,
            protocolTimeout: 12e4,
            // In containers, point to system Chromium (e.g. /usr/bin/chromium)
            ...process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {},
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-accelerated-2d-canvas",
              "--no-first-run",
              "--no-zygote",
              "--disable-gpu"
            ]
          }
        });
        const io = getIO();
        client.on("qr", async (qr) => {
          console.log(`[WhatsApp] QR received for workspace: ${workspaceId}`);
          try {
            const qrImage = await import_qrcode.default.toDataURL(qr);
            io.to(`workspace:${workspaceId}`).emit("whatsapp:qr", { qr: qrImage });
          } catch (err) {
            console.error(`[WhatsApp] Error generating QR for ${workspaceId}:`, err);
          }
        });
        client.on("authenticated", () => {
          console.log(`[WhatsApp] Authenticated workspace: ${workspaceId}`);
          io.to(`workspace:${workspaceId}`).emit("whatsapp:authenticated");
        });
        client.on("ready", async () => {
          console.log(`[WhatsApp] Client is ready for workspace: ${workspaceId}`);
          io.to(`workspace:${workspaceId}`).emit("whatsapp:ready");
          await prisma.channel.upsert({
            where: { workspaceId_platform: { workspaceId, platform: "WHATSAPP" } },
            create: {
              workspaceId,
              platform: "WHATSAPP",
              name: "WhatsApp",
              status: "CONNECTED",
              config: { isNative: true, isAiEnabled: true }
            },
            update: {
              status: "CONNECTED",
              config: { isNative: true, isAiEnabled: true }
            }
          }).catch((err) => console.error(`[WhatsApp] DB Upsert Error (${workspaceId}):`, err));
          this.syncChats(workspaceId).catch(
            (err) => console.error(`[WhatsApp] Initial sync failed for ${workspaceId}:`, err)
          );
        });
        client.on("message", async (msg) => {
          this.handleInboundMessage(workspaceId, msg);
        });
        client.on("disconnected", (reason) => {
          console.log(`[WhatsApp] Disconnected workspace ${workspaceId}:`, reason);
          this.clients.delete(workspaceId);
          io.to(`workspace:${workspaceId}`).emit("whatsapp:disconnected", { reason });
          prisma.channel.updateMany({
            where: { workspaceId, platform: "WHATSAPP" },
            data: { status: "DISCONNECTED" }
          }).catch((err) => console.error(`[WhatsApp] DB Update Error (${workspaceId}):`, err));
        });
        client.initialize().catch((err) => {
          console.error(`[WhatsApp] Initialization failed for ${workspaceId}:`, err);
          this.clients.delete(workspaceId);
          client.destroy().catch(() => {
          });
          io.to(`workspace:${workspaceId}`).emit("whatsapp:error", { message: "Initialization failed" });
        });
        this.clients.set(workspaceId, client);
      }
      /**
       * Fetches recent chats from the phone and creates them in Metria.
       */
      async syncChats(workspaceId) {
        const client = this.clients.get(workspaceId);
        if (!client) return;
        console.log(`[WhatsApp] Syncing chats for ${workspaceId}...`);
        const channel = await prisma.channel.findUnique({
          where: { workspaceId_platform: { workspaceId, platform: "WHATSAPP" } },
          select: { id: true }
        });
        if (!channel) {
          console.error(`[WhatsApp] Channel row missing for ${workspaceId} \u2014 skipping sync`);
          return;
        }
        const chats = await client.getChats();
        const recentChats = chats.filter((c) => !c.isGroup && !c.id._serialized.includes("broadcast")).slice(0, 20);
        const { processInboundMessage: processInboundMessage2 } = await Promise.resolve().then(() => (init_message_service(), message_service_exports));
        for (const chat of recentChats) {
          const lastMsg = await chat.fetchMessages({ limit: 1 });
          if (lastMsg.length > 0 && lastMsg[0].body) {
            let senderPhone;
            const isLid = chat.id._serialized.endsWith("@lid");
            if (isLid) {
              try {
                const waContact = await client.getContactById(chat.id._serialized);
                senderPhone = waContact.number ? `+${waContact.number}` : chat.id._serialized;
              } catch {
                senderPhone = chat.id._serialized;
              }
            } else {
              senderPhone = chat.id._serialized.split("@")[0];
            }
            await processInboundMessage2({
              workspaceId,
              channelId: channel.id,
              externalConversationId: chat.id._serialized,
              externalMessageId: lastMsg[0].id._serialized,
              senderExternalId: senderPhone,
              senderName: chat.name || "WhatsApp User",
              content: lastMsg[0].body
            }).catch(() => {
            });
          }
        }
        console.log(`[WhatsApp] Sync complete for ${workspaceId}`);
      }
      /**
       * Sends a message through the native client.
       */
      async sendMessage(workspaceId, to, content) {
        const client = this.clients.get(workspaceId);
        if (!client) throw new Error("WhatsApp session not active");
        await client.sendMessage(to, content);
      }
      /**
       * Bridges inbound messages to Metria's internal processing logic.
       */
      async handleInboundMessage(workspaceId, msg) {
        if (msg.from === "status@broadcast" || msg.from?.includes("broadcast")) return;
        if (!msg.body) return;
        console.log(`[WhatsApp] New message from ${msg.from} in workspace ${workspaceId}`);
        try {
          const channel = await prisma.channel.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: "WHATSAPP" } },
            select: { id: true }
          });
          if (!channel) {
            console.error(`[WhatsApp] Channel row missing for ${workspaceId} \u2014 message dropped`);
            return;
          }
          const { processInboundMessage: processInboundMessage2 } = await Promise.resolve().then(() => (init_message_service(), message_service_exports));
          let senderPhone;
          const isLid = msg.from.endsWith("@lid");
          if (isLid) {
            try {
              const waContact = await msg.getContact();
              senderPhone = waContact.number ? `+${waContact.number}` : msg.from;
            } catch {
              senderPhone = msg.from;
            }
          } else {
            senderPhone = msg.from.split("@")[0];
          }
          await processInboundMessage2({
            workspaceId,
            channelId: channel.id,
            externalConversationId: msg.from,
            externalMessageId: msg.id._serialized,
            senderExternalId: senderPhone,
            senderName: msg._data?.notifyName || msg.author || "WhatsApp User",
            content: msg.body
          });
        } catch (err) {
          console.error(`[WhatsApp] Error processing inbound message for ${workspaceId}:`, err);
        }
      }
      /**
       * Disconnects and removes a session.
       */
      async destroySession(workspaceId) {
        const client = this.clients.get(workspaceId);
        if (client) {
          await client.logout();
          await client.destroy();
          this.clients.delete(workspaceId);
        }
      }
    };
  }
});

// src/modules/messaging/inbox.service.ts
async function getConversations(workspaceId, opts) {
  const { status, channelId, search, limit = 30, cursor } = opts;
  const term = search?.trim();
  const rows = await prisma.conversation.findMany({
    where: {
      workspaceId,
      ...status && status !== "ALL" && { status },
      ...channelId && { channelId },
      ...cursor && { id: { lt: cursor } },
      ...term && {
        OR: [
          { contact: { name: { contains: term, mode: "insensitive" } } },
          { contact: { phone: { contains: term, mode: "insensitive" } } }
        ]
      }
    },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          status: true,
          phone: true,
          avatarUrl: true,
          email: true,
          ltv: true,
          source: true,
          leadScore: true,
          leadTemperature: true,
          leadType: true
        }
      },
      channel: { select: { id: true, platform: true, name: true } },
      _count: { select: { messages: { where: { readAt: null, direction: "INBOUND" } } } }
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit
  });
  const assigneeIds = [...new Set(rows.map((r) => r.assignedToUserId).filter(Boolean))];
  const assignees = assigneeIds.length ? await prisma.user.findMany({
    where: { id: { in: assigneeIds }, workspaceId },
    select: { id: true, name: true, email: true }
  }) : [];
  const assigneeById = new Map(assignees.map((u) => [u.id, u]));
  return rows.map((r) => {
    const assignee = r.assignedToUserId ? assigneeById.get(r.assignedToUserId) ?? null : null;
    return {
      ...r,
      unreadCount: r._count.messages,
      assignedToUser: assignee ? { id: assignee.id, name: assignee.name ?? assignee.email } : null,
      contact: r.contact ?? {
        id: "",
        name: r.externalId?.split("@")[0] ?? "Contacto",
        status: "LEAD",
        phone: r.externalId ?? "",
        avatarUrl: null,
        email: null,
        ltv: 0,
        source: "whatsapp",
        leadScore: null,
        leadTemperature: null,
        leadType: null
      }
    };
  });
}
async function changeConversationStatus(workspaceId, conversationId, status) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  });
  if (!existing) throw new Error("Conversation not found");
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      resolvedAt: status === "CLOSED" ? /* @__PURE__ */ new Date() : null
    },
    select: { id: true, status: true, resolvedAt: true, assignedToUserId: true }
  });
  getIO().to(`workspace:${workspaceId}`).emit("conversation:updated", {
    id: conversation.id,
    status: conversation.status,
    resolvedAt: conversation.resolvedAt,
    assignedToUserId: conversation.assignedToUserId
  });
  return conversation;
}
async function assignConversation(workspaceId, conversationId, userId) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  });
  if (!existing) throw new Error("Conversation not found");
  let assignee = null;
  if (userId) {
    assignee = await prisma.user.findFirst({
      where: { id: userId, workspaceId },
      select: { id: true, name: true, email: true }
    });
    if (!assignee) throw new Error("User does not belong to this workspace");
  }
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedToUserId: userId },
    select: { id: true, status: true, assignedToUserId: true }
  });
  const payload = {
    id: conversation.id,
    status: conversation.status,
    assignedToUserId: conversation.assignedToUserId,
    assignedToUser: assignee ? { id: assignee.id, name: assignee.name ?? assignee.email } : null
  };
  getIO().to(`workspace:${workspaceId}`).emit("conversation:updated", payload);
  return payload;
}
async function getMessages(workspaceId, conversationId, cursor) {
  return prisma.message.findMany({
    where: {
      workspaceId,
      conversationId,
      ...cursor && { id: { lt: cursor } }
    },
    orderBy: { sentAt: "asc" },
    take: 50
  });
}
async function sendMessage(workspaceId, conversationId, userId, content, isInternal = false) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId }
  });
  if (!conversation) throw new Error("Conversation not found");
  if (isInternal) {
    const note = await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: "OUTBOUND",
        senderType: "AGENT",
        senderId: userId,
        content,
        isInternal: true,
        status: "SENT"
      }
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: /* @__PURE__ */ new Date(), messageCount: { increment: 1 } }
    });
    getIO().to(`workspace:${workspaceId}`).emit("message:new", {
      id: note.id,
      conversationId: note.conversationId,
      direction: note.direction,
      senderType: note.senderType,
      content: note.content,
      isInternal: true,
      status: note.status,
      sentAt: note.sentAt
    });
    return;
  }
  const [channel, contact] = await Promise.all([
    prisma.channel.findUnique({ where: { id: conversation.channelId } }),
    prisma.contact.findUnique({ where: { id: conversation.contactId } })
  ]);
  if (!channel) throw new Error(`Channel not found: ${conversation.channelId}`);
  if (!contact) throw new Error(`Contact not found: ${conversation.contactId}`);
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: "OUTBOUND",
      senderType: "AGENT",
      senderId: userId,
      content,
      status: "PENDING"
    }
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: /* @__PURE__ */ new Date(), messageCount: { increment: 1 } }
  });
  if (!contact.phone) {
    throw new Error(`Contact ${contact.id} has no identifier \u2014 cannot send outbound message`);
  }
  if (!channel.config || typeof channel.config !== "object" || Array.isArray(channel.config)) {
    throw new Error(`Channel ${channel.id} has invalid config`);
  }
  const config = channel.config;
  try {
    switch (channel.platform) {
      case "WHATSAPP": {
        if (config.isNative) {
          const { WhatsAppSessionManager: WhatsAppSessionManager2 } = await Promise.resolve().then(() => (init_WhatsAppManager(), WhatsAppManager_exports));
          await WhatsAppSessionManager2.getInstance().sendMessage(workspaceId, contact.phone, content);
        } else {
          const { sendWhatsAppMessage: sendWhatsAppMessage2 } = await Promise.resolve().then(() => (init_whatsapp_service(), whatsapp_service_exports));
          await sendWhatsAppMessage2(config.phoneNumberId, config.accessToken, contact.phone, content);
        }
        break;
      }
      case "INSTAGRAM": {
        const { sendInstagramMessage: sendInstagramMessage2 } = await Promise.resolve().then(() => (init_instagram_service(), instagram_service_exports));
        await sendInstagramMessage2(config.pageAccessToken, contact.phone, content);
        break;
      }
      case "TELEGRAM": {
        const { sendTelegramMessage: sendTelegramMessage2 } = await Promise.resolve().then(() => (init_telegram_service(), telegram_service_exports));
        await sendTelegramMessage2(config.botToken, contact.phone, content);
        break;
      }
      default:
        throw new Error(`Unsupported platform for outbound: ${channel.platform}`);
    }
  } catch (dispatchError) {
    await prisma.message.update({ where: { id: message.id }, data: { status: "FAILED" } });
    throw dispatchError;
  }
  await prisma.message.update({ where: { id: message.id }, data: { status: "SENT" } });
  getIO().to(`workspace:${workspaceId}`).emit("message:new", {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    senderType: message.senderType,
    content: message.content,
    isInternal: false,
    status: "SENT",
    sentAt: message.sentAt
  });
}
async function markConversationAsRead(workspaceId, conversationId) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  });
  if (!existing) throw new Error("Conversation not found");
  const result = await prisma.message.updateMany({
    where: { conversationId, readAt: null, direction: "INBOUND" },
    data: { readAt: /* @__PURE__ */ new Date() }
  });
  return { marked: result.count };
}
async function markConversationAsUnread(workspaceId, conversationId) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true }
  });
  if (!existing) throw new Error("Conversation not found");
  const last = await prisma.message.findFirst({
    where: { conversationId, direction: "INBOUND" },
    orderBy: { sentAt: "desc" }
  });
  if (last) {
    await prisma.message.update({ where: { id: last.id }, data: { readAt: null } });
  }
}
async function trackAiMetric(workspaceId, channelId, metric) {
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.channelAnalyticSnapshot.upsert({
    where: {
      workspaceId_channelId_date: {
        workspaceId,
        channelId,
        date: today
      }
    },
    create: {
      workspaceId,
      channelId,
      date: today,
      [metric]: 1
    },
    update: {
      [metric]: { increment: 1 }
    }
  });
}
var init_inbox_service = __esm({
  "src/modules/messaging/inbox.service.ts"() {
    "use strict";
    init_prisma();
    init_socket();
  }
});

// src/modules/messaging/channels/messenger.service.ts
async function sendMessengerMessage(pageAccessToken, recipientId, text) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION2}/me/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Messenger API error ${response.status}: ${body}`);
  }
}
function verifyMessengerSignature(rawBody, signatureHeader, appSecret) {
  try {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expectedSig = "sha256=" + import_crypto5.default.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expectedSig);
    const providedBuffer = Buffer.from(signatureHeader);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return import_crypto5.default.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}
async function parseMessengerUpdate(workspaceId, channelId, body) {
  const entries = body.entry || [];
  for (const entry of entries) {
    const events = entry.messaging || [];
    for (const event of events) {
      if (!event.message || event.message.is_echo === true) {
        continue;
      }
      try {
        await processInboundMessage({
          workspaceId,
          channelId,
          externalConversationId: event.sender.id,
          externalMessageId: event.message.mid,
          senderExternalId: `msgr_${event.sender.id}`,
          senderName: void 0,
          content: event.message.text ?? "",
          mediaUrl: event.message.attachments?.[0]?.payload?.url,
          mediaType: event.message.attachments?.[0]?.type
        });
      } catch (error) {
        console.error(`[Messenger] Error processing inbound message in workspace ${workspaceId}:`, error);
      }
    }
  }
}
var import_crypto5, GRAPH_API_VERSION2;
var init_messenger_service = __esm({
  "src/modules/messaging/channels/messenger.service.ts"() {
    "use strict";
    import_crypto5 = __toESM(require("crypto"));
    init_message_service();
    GRAPH_API_VERSION2 = "v19.0";
  }
});

// src/modules/crm/lifecycle.service.ts
var LifecycleService;
var init_lifecycle_service = __esm({
  "src/modules/crm/lifecycle.service.ts"() {
    "use strict";
    init_prisma();
    init_socket();
    LifecycleService = class {
      /**
       * Processes a "Signal" (message, order, ad click) and updates the CRM status.
       */
      static async handleSignal(data) {
        const { workspaceId, contactId, platform, content } = data;
        const io = getIO();
        const buyKeywords = ["precio", "valor", "cuanto cuesta", "comprar", "stock", "disponible", "envio", "pago", "link"];
        const hasBuyIntent = content && buyKeywords.some((kw) => content.toLowerCase().includes(kw));
        if (hasBuyIntent) {
          console.log(`[Lifecycle] Buy intent detected for contact ${contactId} via ${platform}`);
          const existingDeal = await prisma.deal.findFirst({
            where: { contactId, status: "OPEN", workspaceId }
          });
          if (!existingDeal) {
            const pipeline = await prisma.pipeline.findFirst({
              where: { workspaceId, isDefault: true },
              include: { stages: { orderBy: { order: "asc" } } }
            });
            if (pipeline && pipeline.stages.length > 0) {
              const negotiationStage = pipeline.stages.find((s) => s.name.toLowerCase().includes("negociaci\xF3n")) || pipeline.stages[0];
              const newDeal = await prisma.deal.create({
                data: {
                  workspaceId,
                  contactId,
                  pipelineId: pipeline.id,
                  stageId: negotiationStage.id,
                  title: `Oportunidad: ${platform} Lead`,
                  status: "OPEN",
                  value: 0
                  // Initial value unknown
                }
              });
              console.log(`[Lifecycle] New deal created: ${newDeal.id}`);
              io.to(`workspace:${workspaceId}`).emit("crm:deal:new", {
                deal: newDeal,
                contactId
              });
              const conv = await prisma.conversation.findFirst({ where: { contactId, workspaceId } });
              if (conv) {
                await prisma.message.create({
                  data: {
                    workspaceId,
                    conversationId: conv.id,
                    direction: "OUTBOUND",
                    senderType: "SYSTEM",
                    content: "\xA1Intenci\xF3n de compra detectada! He creado un trato en el CRM autom\xE1ticamente.",
                    isInternal: true
                  }
                });
                io.to(`workspace:${workspaceId}:conv:${conv.id}`).emit("message:new", {
                  conversationId: conv.id,
                  content: "Intenci\xF3n de compra detectada",
                  senderType: "SYSTEM"
                });
              }
            }
          }
        }
      }
      /**
       * Updates contact status based on activity.
       */
      static async updateContactActivity(contactId, workspaceId) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { updatedAt: /* @__PURE__ */ new Date() }
        });
      }
    };
  }
});

// src/modules/ai-agent/followup.service.ts
var followup_service_exports = {};
__export(followup_service_exports, {
  cancelPendingFollowUps: () => cancelPendingFollowUps,
  processDueFollowUps: () => processDueFollowUps,
  scheduleNextFollowUp: () => scheduleNextFollowUp
});
async function scheduleNextFollowUp(workspaceId, conversationId, botAgentId) {
  const rules = await prisma.followUpRule.findMany({
    where: { workspaceId, botAgentId, isActive: true },
    orderBy: { order: "asc" }
  });
  if (rules.length === 0) return;
  const sentCount = await prisma.followUpJob.count({
    where: { conversationId, status: "SENT" }
  });
  const nextRule = rules[sentCount];
  if (!nextRule) return;
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: "PENDING" },
    data: { status: "CANCELLED" }
  });
  const scheduledAt = new Date(Date.now() + nextRule.delayHours * 36e5);
  await prisma.followUpJob.create({
    data: { workspaceId, conversationId, ruleId: nextRule.id, scheduledAt }
  });
}
async function cancelPendingFollowUps(conversationId) {
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: "PENDING" },
    data: { status: "CANCELLED" }
  });
}
async function processDueFollowUps() {
  const due = await prisma.followUpJob.findMany({
    where: { status: "PENDING", scheduledAt: { lte: /* @__PURE__ */ new Date() } },
    take: 50
  });
  for (const job of due) {
    const claimed = await prisma.followUpJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "SENT", sentAt: /* @__PURE__ */ new Date() }
    });
    if (claimed.count === 0) continue;
    try {
      try {
        const bh = await getBusinessHours(job.workspaceId);
        if (bh && isOutsideBusinessHours(bh)) {
          await prisma.followUpJob.updateMany({
            where: { id: job.id },
            data: { status: "PENDING", sentAt: null, scheduledAt: new Date(Date.now() + 2 * 36e5) }
          });
          continue;
        }
      } catch (bhErr) {
        console.error(`[FollowUp] Business-hours check failed for job ${job.id}, requeueing +30min:`, bhErr);
        await prisma.followUpJob.updateMany({
          where: { id: job.id },
          data: { status: "PENDING", sentAt: null, scheduledAt: new Date(Date.now() + 30 * 6e4) }
        });
        continue;
      }
      const conv = await prisma.conversation.findUnique({
        where: { id: job.conversationId },
        include: { channel: true }
      });
      if (!conv || conv.status !== "OPEN" || !conv.isHandledByBot) continue;
      const followUpInstruction = "SISTEMA: El cliente no ha respondido. Escribe UN mensaje breve y natural de seguimiento para retomar la conversaci\xF3n seg\xFAn el contexto e intentar avanzar al cierre. No repitas saludos completos ni seas invasivo.";
      const text = await processAiResponse(job.workspaceId, job.conversationId, followUpInstruction);
      if (!text) continue;
      await sendOutboundPlatformMessage(job.workspaceId, job.conversationId, text, "BOT");
      const botId = conv.assignedToBotId ?? (await prisma.botAgent.findFirst({
        where: { workspaceId: job.workspaceId, isActive: true },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      }))?.id;
      if (botId) {
        await scheduleNextFollowUp(job.workspaceId, job.conversationId, botId);
      }
    } catch (err) {
      console.error(`[FollowUp] Failed job ${job.id}:`, err);
    }
  }
}
var init_followup_service = __esm({
  "src/modules/ai-agent/followup.service.ts"() {
    "use strict";
    init_prisma();
    init_ai_service();
    init_message_service();
    init_businessHours_service();
  }
});

// src/modules/messaging/message.service.ts
var message_service_exports = {};
__export(message_service_exports, {
  processInboundMessage: () => processInboundMessage,
  sendOutboundPlatformMessage: () => sendOutboundPlatformMessage
});
async function sendPlatformMessage(platform, config, to, text, workspaceId) {
  switch (platform) {
    case "WHATSAPP":
      if (config?.isNative && workspaceId) {
        const { WhatsAppSessionManager: WhatsAppSessionManager2 } = await Promise.resolve().then(() => (init_WhatsAppManager(), WhatsAppManager_exports));
        await WhatsAppSessionManager2.getInstance().sendMessage(workspaceId, to, text);
      } else {
        await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, to, text);
      }
      break;
    case "INSTAGRAM":
      await sendInstagramMessage(config.pageAccessToken, to, text);
      break;
    case "MESSENGER":
      await sendMessengerMessage(config.pageAccessToken, to, text);
      break;
    case "TELEGRAM":
      await sendTelegramMessage(config.botToken, to, text);
      break;
  }
}
async function sendOutboundPlatformMessage(workspaceId, conversationId, text, senderType = "BOT") {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: { channel: true }
  });
  if (!conv) throw new Error("Conversation not found");
  await sendPlatformMessage(conv.channel.platform, conv.channel.config, conv.externalId, text, workspaceId);
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: "OUTBOUND", senderType, content: text, status: "SENT" }
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: /* @__PURE__ */ new Date() } });
  getIO().to(`workspace:${workspaceId}`).emit("message:new", {
    conversationId,
    direction: "OUTBOUND",
    senderType,
    content: text,
    sentAt: message.sentAt
  });
  return message;
}
async function processInboundMessage(data) {
  const {
    workspaceId,
    channelId,
    externalConversationId,
    externalMessageId,
    senderExternalId,
    senderName,
    content,
    mediaUrl,
    mediaType
  } = data;
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { platform: true, config: true }
  });
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  const source = PLATFORM_TO_SOURCE[channel.platform] ?? "MANUAL";
  const contact = data.contactId ? await prisma.contact.update({
    where: { id: data.contactId },
    data: { sourceCampaignId: data.metadata?.campaign_id || void 0 }
  }) : await prisma.contact.upsert({
    where: { workspaceId_phone: { workspaceId, phone: senderExternalId } },
    create: {
      workspaceId,
      name: senderName ?? senderExternalId,
      phone: senderExternalId,
      source,
      sourceCampaignId: data.metadata?.campaign_id || null,
      status: "LEAD"
    },
    update: {
      sourceCampaignId: data.metadata?.campaign_id || void 0
    }
  });
  let isNewConversation = false;
  let conversation = await prisma.conversation.findUnique({
    where: {
      workspaceId_channelId_externalId: {
        workspaceId,
        channelId,
        externalId: externalConversationId
      }
    },
    include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
  });
  if (!conversation) {
    isNewConversation = true;
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        channelId,
        contactId: contact.id,
        externalId: externalConversationId,
        status: "OPEN",
        isHandledByBot: true
        // Default to bot for new conversations
      },
      include: { contact: { select: { id: true, name: true, status: true, phone: true } } }
    });
  }
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      externalId: externalMessageId,
      direction: "INBOUND",
      senderType: "CONTACT",
      senderId: contact.id,
      content,
      mediaUrl,
      mediaType,
      status: "DELIVERED"
    }
  });
  try {
    const { cancelPendingFollowUps: cancelPendingFollowUps2 } = await Promise.resolve().then(() => (init_followup_service(), followup_service_exports));
    await cancelPendingFollowUps2(conversation.id);
  } catch (err) {
    console.error("[FollowUp] Failed to cancel pending follow-ups:", err);
  }
  LifecycleService.handleSignal({
    workspaceId,
    contactId: contact.id,
    platform: channel.platform,
    content,
    metadata: data.metadata
  }).catch((err) => console.error("[Lifecycle Signal Error]", err));
  const updatedConv = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: /* @__PURE__ */ new Date(), messageCount: { increment: 1 } },
    include: { channel: { select: { platform: true, config: true } } }
  });
  if (channel.config?.isAiEnabled && updatedConv.isHandledByBot) {
    try {
      const aiResponse = await processAiResponse(workspaceId, conversation.id, content);
      if (aiResponse) {
        await sendPlatformMessage(channel.platform, channel.config, conversation.externalId, aiResponse, workspaceId);
        const botMessage = await prisma.message.create({
          data: {
            workspaceId,
            conversationId: conversation.id,
            direction: "OUTBOUND",
            senderType: "BOT",
            content: aiResponse,
            status: "SENT"
          }
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: /* @__PURE__ */ new Date() }
        });
        const io2 = getIO();
        io2.to(`workspace:${workspaceId}`).emit("message:new", {
          id: botMessage.id,
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "BOT",
          content: aiResponse,
          sentAt: botMessage.sentAt
        });
        await trackAiMetric(workspaceId, channelId, "botHandledCount");
        try {
          const botId = updatedConv.assignedToBotId ?? (await prisma.botAgent.findFirst({
            where: { workspaceId, isActive: true },
            orderBy: { createdAt: "desc" },
            select: { id: true }
          }))?.id;
          if (botId) {
            const { scheduleNextFollowUp: scheduleNextFollowUp2 } = await Promise.resolve().then(() => (init_followup_service(), followup_service_exports));
            await scheduleNextFollowUp2(workspaceId, conversation.id, botId);
          }
        } catch (err) {
          console.error("[FollowUp] Failed to schedule follow-up:", err);
        }
      }
    } catch (err) {
      console.error("[AI Agent Error]", err);
    }
  } else {
    tryRunBotFlows(workspaceId, channelId, {
      ...updatedConv,
      contactId: contact.id
    }, content).catch((err) => console.error("[BotEngine]", err));
  }
  const io = getIO();
  const room = `workspace:${workspaceId}`;
  const messagePayload = {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    senderType: message.senderType,
    content: message.content,
    sentAt: message.sentAt
  };
  if (isNewConversation) {
    io.to(room).emit("conversation:new", {
      id: conversation.id,
      channelId: conversation.channelId,
      externalId: conversation.externalId,
      status: conversation.status,
      contact: conversation.contact,
      createdAt: conversation.createdAt
    });
  }
  io.to(room).emit("message:new", messagePayload);
  return {
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
    isNewConversation
  };
}
var PLATFORM_TO_SOURCE;
var init_message_service = __esm({
  "src/modules/messaging/message.service.ts"() {
    "use strict";
    init_prisma();
    init_socket();
    init_flow_engine();
    init_ai_service();
    init_inbox_service();
    init_whatsapp_service();
    init_instagram_service();
    init_messenger_service();
    init_telegram_service();
    init_lifecycle_service();
    PLATFORM_TO_SOURCE = {
      WHATSAPP: "WHATSAPP",
      INSTAGRAM: "INSTAGRAM",
      TELEGRAM: "TELEGRAM",
      TIKTOK: "TIKTOK",
      MESSENGER: "MESSENGER"
    };
  }
});

// src/modules/messaging/channels/telegram.service.ts
var telegram_service_exports = {};
__export(telegram_service_exports, {
  clearBotCache: () => clearBotCache,
  handleTelegramUpdate: () => handleTelegramUpdate,
  sendTelegramMessage: () => sendTelegramMessage
});
function getOrCreateBot(workspaceId, channelId, botToken) {
  const key = `${workspaceId}:${channelId}`;
  if (!botCache.has(key)) {
    if (botCache.size >= BOT_CACHE_MAX) {
      const oldestKey = botCache.keys().next().value;
      if (oldestKey) botCache.delete(oldestKey);
    }
    const bot = new import_telegraf.Telegraf(botToken);
    bot.on("text", async (ctx) => {
      const from = ctx.message.from;
      const chat = ctx.message.chat;
      await processInboundMessage({
        workspaceId,
        channelId,
        externalConversationId: String(chat.id),
        externalMessageId: String(ctx.message.message_id),
        // prefix distinguishes Telegram IDs from real phone numbers
        senderExternalId: `tg_${from.id}`,
        senderName: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || String(from.id),
        content: ctx.message.text
      });
    });
    bot.catch((err) => {
      console.error(`[Telegraf:${key}] unhandled error:`, err);
    });
    botCache.set(key, bot);
  }
  return botCache.get(key);
}
async function handleTelegramUpdate(workspaceId, channelId, botToken, update) {
  const bot = getOrCreateBot(workspaceId, channelId, botToken);
  await bot.handleUpdate(update);
}
function clearBotCache(key) {
  if (key) botCache.delete(key);
  else botCache.clear();
}
async function sendTelegramMessage(botToken, chatId, text) {
  const normalizedChatId = chatId.startsWith("tg_") ? chatId.slice(3) : chatId;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: normalizedChatId, text })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}
var import_telegraf, BOT_CACHE_MAX, botCache;
var init_telegram_service = __esm({
  "src/modules/messaging/channels/telegram.service.ts"() {
    "use strict";
    import_telegraf = require("telegraf");
    init_message_service();
    BOT_CACHE_MAX = 200;
    botCache = /* @__PURE__ */ new Map();
  }
});

// src/modules/scheduling/google-calendar.service.ts
var google_calendar_service_exports = {};
__export(google_calendar_service_exports, {
  cancelCalendarEvent: () => cancelCalendarEvent,
  createCalendarEvent: () => createCalendarEvent,
  getFreeBusy: () => getFreeBusy,
  listWorkspaceCalendars: () => listWorkspaceCalendars
});
async function getAccessToken(workspaceId) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalAccessToken: true,
      googleCalRefreshToken: true,
      googleCalTokenExpiry: true
    }
  });
  if (!ws?.googleCalRefreshToken) throw new Error("Google Calendar not connected");
  const expiry = ws.googleCalTokenExpiry ? new Date(ws.googleCalTokenExpiry) : null;
  const isExpired = !expiry || expiry <= new Date(Date.now() + 6e4);
  if (isExpired) {
    const tokens = await provider.refreshToken(ws.googleCalRefreshToken);
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        googleCalAccessToken: tokens.accessToken,
        googleCalTokenExpiry: tokens.expiresAt ?? null
      }
    });
    return tokens.accessToken;
  }
  return ws.googleCalAccessToken;
}
async function getFreeBusy(workspaceId, dateMin, dateMax) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalendarId: true }
  });
  const calId = ws?.googleCalendarId ?? "primary";
  const accessToken = await getAccessToken(workspaceId);
  const body = {
    timeMin: dateMin.toISOString(),
    timeMax: dateMax.toISOString(),
    items: [{ id: calId }]
  };
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    console.error("[gcal] freeBusy error", await res.text());
    return [];
  }
  const data = await res.json();
  return data.calendars[calId]?.busy ?? [];
}
async function createCalendarEvent(workspaceId, opts) {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarId: true }
    });
    const calId = ws?.googleCalendarId ?? "primary";
    const accessToken = await getAccessToken(workspaceId);
    const endAt = new Date(opts.startAt.getTime() + opts.durationMin * 6e4);
    const attendees = [];
    if (opts.bookerEmail) attendees.push({ email: opts.bookerEmail, displayName: opts.bookerName });
    if (opts.workspaceEmail) attendees.push({ email: opts.workspaceEmail });
    const event = {
      summary: opts.title,
      description: opts.notes ?? void 0,
      start: { dateTime: opts.startAt.toISOString() },
      end: { dateTime: endAt.toISOString() },
      attendees,
      reminders: { useDefault: true }
    };
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(event)
      }
    );
    if (!res.ok) {
      console.error("[gcal] createEvent error", await res.text());
      return null;
    }
    const data = await res.json();
    return data.id;
  } catch (err) {
    console.error("[gcal] createCalendarEvent failed (non-blocking):", err);
    return null;
  }
}
async function cancelCalendarEvent(workspaceId, googleEventId) {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarId: true }
    });
    const calId = ws?.googleCalendarId ?? "primary";
    const accessToken = await getAccessToken(workspaceId);
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${googleEventId}?sendUpdates=all`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
  } catch (err) {
    console.error("[gcal] cancelCalendarEvent failed (non-blocking):", err);
  }
}
async function listWorkspaceCalendars(workspaceId) {
  const accessToken = await getAccessToken(workspaceId);
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`[gcal] calendarList failed: ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary
  }));
}
var provider;
var init_google_calendar_service = __esm({
  "src/modules/scheduling/google-calendar.service.ts"() {
    "use strict";
    init_prisma();
    init_google_calendar();
    provider = new GoogleCalendarProvider();
  }
});

// src/index.ts
var import_config9 = require("dotenv/config");
var import_http = require("http");

// src/app.ts
var import_express42 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));
var import_compression = __toESM(require("compression"));

// src/routes/health.ts
var import_express = require("express");
init_prisma();

// src/lib/redis.ts
var import_ioredis = require("ioredis");
var import_config = require("dotenv/config");
var redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
var redis = new import_ioredis.Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2e3);
    return delay;
  }
});
redis.on("error", (err) => {
  console.error("Redis error:", err);
});
redis.on("connect", () => {
  console.log("Connected to Redis");
});

// src/lib/db-check.ts
init_prisma();
async function waitForDb(retries = 10, delay = 2e3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("[DB] Database connection established.");
      return true;
    } catch (err) {
      console.log(`[DB] Waiting for database... (${i + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error("[DB] Could not connect to database after several retries.");
  return false;
}
async function checkTablesExist() {
  try {
    await prisma.user.findFirst({ select: { id: true } });
    return true;
  } catch (err) {
    if (err.code === "P2021") {
      return false;
    }
    return false;
  }
}

// src/routes/health.ts
var router = (0, import_express.Router)();
router.get("/", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const tablesReady = await checkTablesExist();
    await redis.ping();
    res.status(tablesReady ? 200 : 206).json({
      status: tablesReady ? "ok" : "initializing",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      db: "connected",
      tables: tablesReady ? "ready" : "missing",
      redis: "connected",
      version: "1.0.0"
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message: "Service unavailable",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
var health_default = router;

// src/routes/auth.ts
var import_express2 = require("express");
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
init_prisma();
var import_config3 = require("dotenv/config");

// src/middleware/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var import_config2 = require("dotenv/config");
init_prisma();
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
var authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    req.user = decoded;
    if (req.user && req.user.workspaceId === void 0) req.user.workspaceId = null;
    if (req.user?.workspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.user.workspaceId }
      });
      if (workspace) {
        ;
        req.workspace = workspace;
        const isStarter = workspace.plan === "STARTER";
        if (!isStarter && workspace.subscriptionStatus === "TRIAL" && workspace.trialEndsAt && workspace.trialEndsAt < /* @__PURE__ */ new Date()) {
          await prisma.workspace.update({
            where: { id: workspace.id },
            data: { subscriptionStatus: "EXPIRED", status: "SUSPENDED" }
          });
          return res.status(403).json({ error: "Tu periodo de prueba ha expirado. Por favor, selecciona un plan de pago.", code: "TRIAL_EXPIRED" });
        }
        if (!isStarter && workspace.status === "SUSPENDED") {
          return res.status(403).json({ error: "Tu cuenta est\xE1 suspendida. Por favor, revisa tu suscripci\xF3n.", code: "SUBSCRIPTION_REQUIRED" });
        }
      }
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

// src/routes/auth.ts
var import_bcrypt = __toESM(require("bcrypt"));
var import_google_auth_library = require("google-auth-library");
var router2 = (0, import_express2.Router)();
var JWT_SECRET2 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
var googleClient = new import_google_auth_library.OAuth2Client(process.env.GOOGLE_ADS_CLIENT_ID);
router2.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true }
    });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!user.passwordHash) {
      return res.status(401).json({ error: "This account uses Google Login. Please sign in with Google." });
    }
    const isMatch = await import_bcrypt.default.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (user.mustChangePassword) {
      const tempToken = import_jsonwebtoken2.default.sign(
        { id: user.id, email: user.email, role: user.role, mustChangePassword: true, workspaceId: user.workspaceId },
        JWT_SECRET2,
        { expiresIn: "15m" }
      );
      return res.status(200).json({ requiresPasswordChange: true, token: tempToken });
    }
    if (user.role !== "SUPER_ADMIN" && user.workspace?.status === "SUSPENDED") {
      return res.status(403).json({ error: "Account suspended. Please contact support." });
    }
    const token = import_jsonwebtoken2.default.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspaceId,
        subscriptionStatus: user.workspace?.subscriptionStatus
      },
      JWT_SECRET2,
      { expiresIn: "7d" }
    );
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId
      },
      workspace: user.workspace ? { status: user.workspace.status } : void 0
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router2.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Credential token is required" });
    }
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_ADS_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ error: "Invalid google token" });
    }
    const { email, name, picture, sub: googleId } = payload;
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      },
      include: { workspace: true }
    });
    let onboardingRequired = false;
    if (!user) {
      console.log(`[GoogleAuth] Creating new user and workspace for ${email}`);
      const workspace = await prisma.workspace.create({
        data: {
          name: name ? `${name}'s Workspace` : "Mi Espacio",
          plan: "STARTER",
          subscriptionStatus: "INCOMPLETE"
        }
      });
      user = await prisma.user.create({
        data: {
          email,
          name,
          googleId,
          avatarUrl: picture,
          role: "ADMIN",
          workspaceId: workspace.id
        },
        include: { workspace: true }
      });
      onboardingRequired = true;
      console.log(`[GoogleAuth] New user created with workspace ${workspace.id}. onboardingRequired=${onboardingRequired}`);
    } else if (!user.googleId) {
      console.log(`[GoogleAuth] Linking Google account to existing user ${email}`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: picture || user.avatarUrl },
        include: { workspace: true }
      });
    }
    if (!user.workspaceId) {
      console.log(`[GoogleAuth] User ${email} has no workspace, creating one...`);
      const workspace = await prisma.workspace.create({
        data: {
          name: user.name ? `${user.name}'s Workspace` : "Mi Espacio",
          plan: "STARTER",
          subscriptionStatus: "INCOMPLETE"
        }
      });
      user = await prisma.user.update({
        where: { id: user.id },
        data: { workspaceId: workspace.id, role: "ADMIN" },
        include: { workspace: true }
      });
      onboardingRequired = true;
      console.log(`[GoogleAuth] Workspace ${workspace.id} created for existing user.`);
    }
    if (user.workspaceId && user.role !== "SUPER_ADMIN" && user.workspace?.status === "SUSPENDED") {
      return res.status(403).json({ error: "Account suspended. Please contact support." });
    }
    const token = import_jsonwebtoken2.default.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspaceId,
        subscriptionStatus: user.workspace?.subscriptionStatus
      },
      JWT_SECRET2,
      { expiresIn: "7d" }
    );
    res.status(200).json({
      token,
      onboardingRequired,
      trialUsed: !!user.trialUsedAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId,
        name: user.name,
        avatarUrl: user.avatarUrl
      },
      workspace: user.workspace ? { status: user.workspace.status } : void 0
    });
  } catch (error) {
    console.error("Google login error detail:", error.message || error);
    res.status(500).json({ error: "Failed to authenticate with Google", details: error.message });
  }
});
router2.post("/force-change-password", authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userReq = req.user;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!userReq.mustChangePassword) {
      return res.status(400).json({ error: "No password change required" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userReq.id },
      include: { workspace: true }
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    const hashed = await import_bcrypt.default.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashed,
        mustChangePassword: false
      }
    });
    const token = import_jsonwebtoken2.default.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspaceId,
        subscriptionStatus: user.workspace?.subscriptionStatus
      },
      JWT_SECRET2,
      { expiresIn: "7d" }
    );
    res.status(200).json({
      message: "Password updated successfully",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        workspaceId: user.workspaceId
      }
    });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router2.post("/register", async (req, res) => {
  try {
    const { workspaceName, name, email, password } = req.body;
    if (!workspaceName || !name || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son requeridos" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contrase\xF1a debe tener al menos 8 caracteres" });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Este email ya est\xE1 registrado" });
    }
    const workspace = await prisma.workspace.create({ data: { name: workspaceName } });
    const passwordHash = await import_bcrypt.default.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: "ADMIN", workspaceId: workspace.id }
    });
    const token = import_jsonwebtoken2.default.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: workspace.id,
        subscriptionStatus: workspace.subscriptionStatus
      },
      JWT_SECRET2,
      { expiresIn: "7d" }
    );
    return res.status(201).json({
      token,
      user: { id: user.id, email, role: "ADMIN", workspaceId: workspace.id }
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
var auth_default = router2;

// src/routes/shopify.ts
var import_express3 = require("express");
var import_crypto = __toESM(require("crypto"));
init_prisma();

// src/middleware/cache.ts
var cacheMiddleware = (ttlSeconds) => {
  return async (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    const workspaceId = req.user?.workspaceId || "public";
    const key = `cache:${workspaceId}:${req.originalUrl || req.url}`;
    try {
      const cachedData = await redis.get(key);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        redis.setex(key, ttlSeconds, JSON.stringify(body)).catch(console.error);
        return originalJson(body);
      };
      next();
    } catch (error) {
      console.error("Redis Cache Error:", error);
      next();
    }
  };
};
var invalidateWorkspaceCache = async (workspaceId) => {
  try {
    const pattern = `cache:${workspaceId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
};
var CACHE_TTL = {
  MINUTE_1: 60,
  MINUTE_5: 300,
  HOUR_1: 3600,
  DAY_1: 86400
};

// src/lib/logger.ts
init_prisma();
async function createAuditLog(data) {
  try {
    return await prisma.auditLog.create({
      data: {
        workspaceId: data.workspaceId,
        source: data.source,
        event: data.event,
        status: data.status,
        message: data.message,
        payload: data.payload
      }
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

// src/lib/dateUtils.ts
var TIMEZONE = process.env.TZ || "America/Santiago";
function getTodayStr() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(/* @__PURE__ */ new Date());
}
function getOffsetString(dateStr) {
  const targetDate = /* @__PURE__ */ new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
    hour12: false
  }).formatToParts(targetDate);
  let offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
  if (offset.startsWith("GMT")) {
    offset = offset.replace("GMT", "");
  }
  if (!offset) {
    return "Z";
  }
  const isNegative = offset.startsWith("-");
  const parts2 = offset.replace("-", "").replace("+", "").split(":");
  const hours = parts2[0].padStart(2, "0");
  const minutes = (parts2[1] || "0").padStart(2, "0");
  return `${isNegative ? "-" : "+"}${hours}:${minutes}`;
}
function getStartOfDay(dateStr) {
  const offset = getOffsetString(dateStr);
  return /* @__PURE__ */ new Date(`${dateStr}T00:00:00${offset}`);
}
function getEndOfDay(dateStr) {
  const offset = getOffsetString(dateStr);
  return /* @__PURE__ */ new Date(`${dateStr}T23:59:59.999${offset}`);
}

// src/lib/metrics.ts
init_prisma();
async function upsertDailyMetric(workspaceId, date, field, value, operation = "set") {
  const existing = await prisma.dailyMetric.findUnique({
    where: { workspaceId_date: { workspaceId, date } }
  });
  if (existing) {
    const current = {
      metaAdSpend: Number(existing.metaAdSpend),
      googleAdSpend: Number(existing.googleAdSpend),
      tiktokAdSpend: Number(existing.tiktokAdSpend || 0),
      totalRevenue: Number(existing.totalRevenue),
      totalShipping: Number(existing.totalShipping),
      totalCogs: Number(existing.totalCogs)
    };
    const updated = { ...current };
    updated[field] = operation === "increment" ? current[field] + value : value;
    const netProfit = updated.totalRevenue - updated.metaAdSpend - updated.googleAdSpend - updated.tiktokAdSpend - updated.totalShipping - updated.totalCogs;
    await prisma.dailyMetric.update({
      where: { id: existing.id },
      data: { [field]: updated[field], netProfit }
    });
  } else {
    const defaults = {
      metaAdSpend: 0,
      googleAdSpend: 0,
      tiktokAdSpend: 0,
      totalRevenue: 0,
      totalShipping: 0,
      totalCogs: 0
    };
    defaults[field] = value;
    const netProfit = defaults.totalRevenue - defaults.metaAdSpend - defaults.googleAdSpend - defaults.tiktokAdSpend - defaults.totalShipping - defaults.totalCogs;
    await prisma.dailyMetric.create({
      data: { workspaceId, date, ...defaults, netProfit }
    });
  }
}

// src/services/alertService.ts
init_prisma();
var AlertService = class {
  static async checkAndTriggerAlerts(workspaceId) {
    try {
      const preferences = await prisma.userPreference.findFirst({
        where: { user: { workspaceId } },
        include: { user: true }
      });
      if (!preferences || !preferences.webhookUrl) return;
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const metric = await prisma.dailyMetric.findUnique({
        where: { workspaceId_date: { workspaceId, date: today } }
      });
      if (!metric) return;
      const alerts = [];
      if (preferences.alertRoasLow && preferences.roasThreshold) {
        const adSpend = Number(metric.metaAdSpend) + Number(metric.googleAdSpend) + Number(metric.tiktokAdSpend || 0);
        const revenue = Number(metric.totalRevenue);
        const roas = adSpend > 0 ? revenue / adSpend : 0;
        if (adSpend > 0 && roas < Number(preferences.roasThreshold)) {
          alerts.push(`\u{1F4C9} *ROAS Bajo*: El ROAS actual es de ${roas.toFixed(2)}x (Umbral: ${Number(preferences.roasThreshold).toFixed(2)}x)`);
        }
      }
      if (preferences.alertDeliveryLow && preferences.deliveryThreshold) {
        const shipments = await prisma.shipment.findMany({
          where: { workspaceId, createdAt: { gte: today } }
        });
        if (shipments.length > 5) {
          const delivered = shipments.filter((s) => s.status.toLowerCase().includes("entregado")).length;
          const rate = delivered / shipments.length * 100;
          if (rate < Number(preferences.deliveryThreshold)) {
            alerts.push(`\u{1F69A} *Entrega Baja*: Tasa de entrega hoy es ${rate.toFixed(1)}% (Umbral: ${Number(preferences.deliveryThreshold)}%)`);
          }
        }
      }
      if (preferences.alertMarginLow) {
        const revenue = Number(metric.totalRevenue);
        const netProfit = Number(metric.netProfit);
        const margin = revenue > 0 ? netProfit / revenue * 100 : 0;
        if (revenue > 100 && margin < 15) {
          alerts.push(`\u26A0\uFE0F *Margen Cr\xEDtico*: El margen neto hoy es ${margin.toFixed(1)}% (Menor al 15% recomendado)`);
        }
      }
      if (alerts.length > 0) {
        await this.sendWebhook(preferences.webhookUrl, {
          text: `\u{1F680} *Metria Alerts - ${preferences.user.name || "Workspace"}*

${alerts.join("\n")}

\u{1F517} [Ver Dashboard](https://metria.metrics/dashboard)`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `\u{1F680} *Metria Alerts - ${preferences.user.name || "Workspace"}*`
              }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: alerts.join("\n")
              }
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Ir al Dashboard"
                  },
                  url: "https://metria.metrics/dashboard",
                  style: "primary"
                }
              ]
            }
          ]
        });
        await prisma.auditLog.create({
          data: {
            workspaceId,
            source: "SYSTEM",
            event: "ALERTS_TRIGGERED",
            status: "OK",
            message: `Enviadas ${alerts.length} alertas al webhook.`
          }
        });
      }
    } catch (error) {
      console.error("Error in AlertService:", error);
    }
  }
  static async sendWebhook(url, payload) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error("Failed to send webhook:", error.message);
    }
  }
};

// src/routes/shopify.ts
var import_config4 = require("dotenv/config");
var router3 = (0, import_express3.Router)();
var SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "";
var verifyShopifyWebhook = (req, res, next) => {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return res.status(401).send("No HMAC header");
  const data = req.body;
  const hash = import_crypto.default.createHmac("sha256", SHOPIFY_WEBHOOK_SECRET).update(data, "utf8").digest("base64");
  if (hash !== hmacHeader) {
    return res.status(401).send("Invalid HMAC");
  }
  try {
    req.body = JSON.parse(data.toString());
    next();
  } catch (e) {
    return res.status(400).send("Invalid JSON");
  }
};
router3.post("/webhooks/orders/create", verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return res.status(400).send("Missing workspaceId query param");
    await prisma.order.upsert({
      where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
      update: {
        totalPrice: parseFloat(order.total_price),
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        updatedAt: new Date(order.updated_at),
        lineItems: order.line_items.map((item) => {
          const price = parseFloat(item.price || 0);
          const qty = item.quantity || 1;
          const discount = parseFloat(item.total_discount || 0);
          const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
          return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
        })
      },
      create: {
        workspaceId,
        orderId: order.name,
        shopifyId: order.id.toString(),
        customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : "Unknown",
        customerEmail: order.email,
        totalPrice: parseFloat(order.total_price),
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        lineItems: order.line_items.map((item) => {
          const price = parseFloat(item.price || 0);
          const qty = item.quantity || 1;
          const discount = parseFloat(item.total_discount || 0);
          const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
          return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
        }),
        createdAt: new Date(order.created_at)
      }
    });
    return res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Shopify Create Order Error:", error);
    return res.status(500).send("Error processing webhook");
  }
});
router3.post("/webhooks/orders/updated", verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return res.status(400).send("Missing workspaceId query param");
    await prisma.order.updateMany({
      where: { workspaceId, shopifyId: order.id.toString() },
      data: {
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        updatedAt: new Date(order.updated_at)
      }
    });
    return res.status(200).send("Webhook processed");
  } catch (error) {
    console.error("Shopify Update Order Error:", error);
    return res.status(500).send("Error processing webhook");
  }
});
router3.get("/orders", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const { from, to } = req.query;
    let dateFilter = {};
    if (from && to) {
      dateFilter = {
        createdAt: {
          gte: getStartOfDay(from),
          lte: getEndOfDay(to)
        }
      };
    }
    const orders = await prisma.order.findMany({
      where: { workspaceId, ...dateFilter },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" }
    });
    const total = await prisma.order.count({ where: { workspaceId, ...dateFilter } });
    return res.status(200).json({
      data: orders,
      meta: { total, page, limit }
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router3.post("/sync", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "shopify" } }
    });
    if (!integration || !integration.config) {
      return res.status(400).json({ error: "Shopify integration not configured" });
    }
    const config = integration.config;
    const domain = config.domain?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const accessToken = config.accessToken;
    if (!domain || !accessToken) {
      return res.status(400).json({ error: "Missing domain or accessToken in Shopify config" });
    }
    const fetchAllFromShopify = async (resource, params = "") => {
      let allItems = [];
      let url = `https://${domain}/admin/api/2024-10/${resource}.json?limit=250${params}`;
      while (url) {
        const response = await fetch(url, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) {
          const errText = await response.text();
          console.error(`Shopify API Error (${resource}):`, response.status, errText);
          break;
        }
        const data = await response.json();
        const key = resource.includes("orders") ? "orders" : "products";
        allItems = [...allItems, ...data[key] || []];
        const linkHeader = response.headers.get("Link");
        url = null;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (match) url = match[1];
        }
      }
      return allItems;
    };
    const orders = await fetchAllFromShopify("orders", "&status=any");
    let processedOrders = 0;
    const dailyRevenues = {};
    for (const order of orders) {
      const validStatuses = ["paid", "partially_refunded", "pending", "authorized"];
      if (validStatuses.includes(order.financial_status)) {
        const dateStr = new Date(order.created_at).toISOString().split("T")[0];
        dailyRevenues[dateStr] = (dailyRevenues[dateStr] || 0) + parseFloat(order.total_price);
      }
      await prisma.order.upsert({
        where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
        update: {
          totalPrice: parseFloat(order.total_price),
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          updatedAt: new Date(order.updated_at),
          lineItems: order.line_items.map((item) => {
            const price = parseFloat(item.price || 0);
            const qty = item.quantity || 1;
            const discount = parseFloat(item.total_discount || 0);
            const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
            return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
          })
        },
        create: {
          workspaceId,
          orderId: order.name,
          shopifyId: order.id.toString(),
          customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : "Unknown",
          customerEmail: order.email,
          totalPrice: parseFloat(order.total_price),
          currency: order.currency,
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          lineItems: order.line_items.map((item) => {
            const price = parseFloat(item.price || 0);
            const qty = item.quantity || 1;
            const discount = parseFloat(item.total_discount || 0);
            const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
            return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
          }),
          createdAt: new Date(order.created_at)
        }
      });
      processedOrders++;
    }
    const shProducts = await fetchAllFromShopify("products");
    let processedProducts = 0;
    for (const sp of shProducts) {
      const variants = sp.variants || [];
      for (const v of variants) {
        await prisma.product.upsert({
          where: { workspaceId_sku: { workspaceId, sku: v.sku || `SP-${v.id}` } },
          update: {
            name: `${sp.title}${v.title !== "Default Title" ? ` - ${v.title}` : ""}`,
            price: v.price
          },
          create: {
            workspaceId,
            sku: v.sku || `SP-${v.id}`,
            name: `${sp.title}${v.title !== "Default Title" ? ` - ${v.title}` : ""}`,
            price: v.price,
            cogs: "0"
          }
        });
        processedProducts++;
      }
    }
    for (const [dateStr, revenue] of Object.entries(dailyRevenues)) {
      await upsertDailyMetric(workspaceId, new Date(dateStr), "totalRevenue", revenue);
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSync: /* @__PURE__ */ new Date(), status: "Connected" }
    });
    await invalidateWorkspaceCache(workspaceId);
    await createAuditLog({
      workspaceId,
      source: "Shopify",
      event: "Sync",
      status: "200 OK",
      message: `Sincronizaci\xF3n completa: ${processedOrders} \xF3rdenes y ${processedProducts} productos procesados.`
    });
    AlertService.checkAndTriggerAlerts(workspaceId).catch((err) => console.error("Alert trigger error:", err));
    return res.status(200).json({ success: true, orders: processedOrders, products: processedProducts });
  } catch (error) {
    console.error("Shopify Sync Error:", error);
    return res.status(500).json({ error: "Internal server error while syncing Shopify" });
  }
});
var shopify_default = router3;

// src/routes/meta.ts
var import_express4 = require("express");
init_prisma();
var import_date_fns = require("date-fns");
var router4 = (0, import_express4.Router)();
router4.post("/sync", authenticate, async (req, res) => {
  try {
    console.log("Triggering meta sync endpoint");
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "meta" } }
    });
    if (!integration || !integration.config) {
      return res.status(400).json({ error: "Meta Ads integration not configured" });
    }
    const config = integration.config;
    const accessToken = config.accessToken;
    const adAccountId = config.adAccountId;
    if (!accessToken || !adAccountId) {
      return res.status(400).json({ error: "Missing accessToken or adAccountId in Meta config" });
    }
    const formattedAdAccountId = adAccountId.replace(/^act_/, "");
    const allInsights = [];
    let nextUrl = `https://graph.facebook.com/v20.0/act_${formattedAdAccountId}/insights?level=campaign&time_preset=last_90d&time_increment=1&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values,date_start&limit=500&access_token=${accessToken}`;
    while (nextUrl) {
      const response = await fetch(nextUrl);
      if (!response.ok) {
        const errText = await response.text();
        console.error("Meta Sync API Error:", response.status, errText);
        let errMsg = "Failed to fetch from Meta Graph API";
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            errMsg = `Meta API Error: ${parsed.error.message}`;
          }
        } catch (e) {
        }
        if (allInsights.length > 0) {
          console.warn(`Meta pagination stopped after ${allInsights.length} rows. Continuing with partial data.`);
          break;
        }
        return res.status(response.status).json({ error: errMsg });
      }
      const data = await response.json();
      const pageInsights = data.data || [];
      allInsights.push(...pageInsights);
      nextUrl = data.paging?.next || null;
      console.log(`[Meta Sync] Fetched page with ${pageInsights.length} rows (total: ${allInsights.length})`);
    }
    let processed = 0;
    const dailySpends = {};
    for (const row of allInsights) {
      const dateStr = row.date_start;
      const spend = parseFloat(row.spend || "0");
      dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend;
      const conversionsAction = row.actions?.find((a) => a.action_type === "purchase");
      const conversions = conversionsAction ? parseInt(conversionsAction.value) : 0;
      const videoViewsAction = row.actions?.find((a) => a.action_type === "video_view");
      const videoViews = videoViewsAction ? parseInt(videoViewsAction.value) : 0;
      const conversionValueAction = row.action_values?.find((a) => a.action_type === "purchase");
      const conversionValue = conversionValueAction ? parseFloat(conversionValueAction.value) : 0;
      await prisma.adSpend.upsert({
        where: { workspaceId_platform_campaignId_date: { workspaceId, platform: "META", campaignId: row.campaign_id, date: new Date(dateStr) } },
        update: {
          campaignName: row.campaign_name,
          spend,
          impressions: parseInt(row.impressions || "0"),
          reach: parseInt(row.reach || "0"),
          clicks: parseInt(row.clicks || "0"),
          videoViews,
          conversions,
          conversionValue
        },
        create: {
          workspaceId,
          platform: "META",
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          spend,
          impressions: parseInt(row.impressions || "0"),
          reach: parseInt(row.reach || "0"),
          clicks: parseInt(row.clicks || "0"),
          videoViews,
          conversions,
          conversionValue,
          date: new Date(dateStr)
        }
      });
      processed++;
    }
    for (const [dateStr, spend] of Object.entries(dailySpends)) {
      await upsertDailyMetric(workspaceId, new Date(dateStr), "metaAdSpend", spend);
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSync: /* @__PURE__ */ new Date(), status: "Connected" }
    });
    await createAuditLog({
      workspaceId,
      source: "META",
      event: "Sync",
      status: "200 OK",
      message: `Sincronizadas ${processed} anal\xEDticas diarias de campa\xF1as de Meta Ads (v\xEDa date_start).`
    });
    await invalidateWorkspaceCache(workspaceId);
    AlertService.checkAndTriggerAlerts(workspaceId).catch((err) => console.error("Alert trigger error:", err));
    return res.status(200).json({ success: true, count: processed });
  } catch (error) {
    console.error("Meta Sync Error:", error);
    return res.status(500).json({ error: "Internal server error while syncing Meta Ads" });
  }
});
router4.get("/campaigns", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const dateFilter = from && to ? {
      date: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const campaigns = await prisma.adSpend.groupBy({
      by: ["campaignId", "campaignName"],
      where: {
        workspaceId,
        platform: "META",
        ...dateFilter
      },
      _sum: {
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        conversionValue: true
      }
    });
    const formatted = campaigns.map((c) => {
      const spend = Number(c._sum.spend || 0);
      const conversions = Number(c._sum.conversions || 0);
      const conversionValue = Number(c._sum.conversionValue || 0);
      return {
        id: c.campaignId,
        name: c.campaignName,
        status: "Active",
        // Mocked status
        spend,
        cpa: conversions > 0 ? spend / conversions : 0,
        roas: spend > 0 ? conversionValue / spend : 0,
        cpp: conversions > 0 ? spend / conversions : 0
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router4.get("/creatives", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "meta" } }
    });
    if (!integration || !integration.config) {
      return res.status(200).json([]);
    }
    const config = integration.config;
    const accessToken = config.accessToken;
    const adAccountId = config.adAccountId;
    if (!accessToken || !adAccountId) return res.status(200).json([]);
    const formattedAdAccountId = adAccountId.replace(/^act_/, "");
    let timeRangeParams = "time_preset=last_30d";
    if (from && to) {
      timeRangeParams = `time_range={'since':'${from}','until':'${to}'}`;
    }
    const response = await fetch(`https://graph.facebook.com/v20.0/act_${formattedAdAccountId}/insights?level=ad&${timeRangeParams}&fields=ad_name,spend,actions,action_values&limit=4&access_token=${accessToken}`);
    if (!response.ok) {
      console.error("Meta Creatives Fetch Error:", await response.text());
      return res.status(200).json([]);
    }
    const data = await response.json();
    const insights = data.data || [];
    const creatives = insights.map((row) => {
      const spend = parseFloat(row.spend || "0");
      const conversionValueAction = row.action_values?.find((a) => a.action_type === "purchase");
      const conversionValue = conversionValueAction ? parseFloat(conversionValueAction.value) : 0;
      return {
        name: row.ad_name || "Anuncio sin nombre",
        roas: spend > 0 ? Number((conversionValue / spend).toFixed(2)) : 0
      };
    });
    creatives.sort((a, b) => b.roas - a.roas);
    return res.status(200).json(creatives);
  } catch (error) {
    console.error("Creatives error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router4.get("/attribution", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, excludeCampaigns } = req.query;
    const excludedIds = excludeCampaigns ? excludeCampaigns.split(",") : [];
    const dateFilter = from && to ? {
      date: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const orderDateFilter = from && to ? {
      createdAt: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const metaSpends = await prisma.adSpend.aggregate({
      where: {
        workspaceId,
        platform: "META",
        campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0,
        ...dateFilter
      },
      _sum: { conversions: true }
    });
    const shopifyOrders = await prisma.order.count({
      where: {
        workspaceId,
        ...orderDateFilter
      }
    });
    const attributed = Number(metaSpends._sum.conversions || 0);
    const total = shopifyOrders;
    const orphaned = Math.max(0, total - attributed);
    const lossRate = total > 0 ? Math.round(orphaned / total * 100) : 0;
    return res.status(200).json({ attributed, orphaned, total, lossRate });
  } catch (error) {
    console.error("Attribution error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router4.get("/andromeda", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "meta" } }
    });
    if (!integration || !integration.config) return res.status(200).json([]);
    const config = integration.config;
    const accessToken = config.accessToken;
    const adAccountId = config.adAccountId;
    if (!accessToken || !adAccountId) return res.status(200).json([]);
    const formattedAdAccountId = adAccountId.replace(/^act_/, "");
    let timeRangeParams = "time_preset=last_7d";
    if (from && to) {
      timeRangeParams = `time_range={'since':'${from}','until':'${to}'}`;
    }
    const fields = "ad_id,ad_name,spend,impressions,reach,clicks,actions,action_values,frequency";
    const url = `https://graph.facebook.com/v20.0/act_${formattedAdAccountId}/insights?level=ad&${timeRangeParams}&fields=${fields}&limit=50&access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Meta Andromeda Fetch Error:", await response.text());
      return res.status(200).json([]);
    }
    const data = await response.json();
    const insights = data.data || [];
    const ads = await Promise.all(insights.map(async (row) => {
      const spend = parseFloat(row.spend || "0");
      const impressions = parseInt(row.impressions || "0");
      const reach = parseInt(row.reach || "0");
      const frequency = parseFloat(row.frequency || "1");
      const videoViewsAction = row.actions?.find((a) => a.action_type === "video_view");
      const videoViews = videoViewsAction ? parseInt(videoViewsAction.value) : 0;
      const purchaseValueAction = row.action_values?.find(
        (a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "omni_purchase"
      );
      const purchaseValue = purchaseValueAction ? parseFloat(purchaseValueAction.value) : 0;
      const customMappings = await prisma.adProductMapping.findMany({
        where: { workspaceId, adId: row.ad_id }
      });
      let finalRoas = spend > 0 ? Number((purchaseValue / spend).toFixed(2)) : 0;
      if (customMappings.length > 0) {
        const mappedSkus = customMappings.map((m) => m.sku);
        const startDate = from ? getStartOfDay(from) : (0, import_date_fns.subDays)(/* @__PURE__ */ new Date(), 7);
        const endDate = to ? getEndOfDay(to) : /* @__PURE__ */ new Date();
        const orders = await prisma.order.findMany({
          where: {
            workspaceId,
            financialStatus: { in: ["paid", "partially_refunded", "authorized"] },
            createdAt: { gte: startDate, lte: endDate }
          }
        });
        let mappedRevenue = 0;
        orders.forEach((order) => {
          const items = order.lineItems || [];
          items.forEach((item) => {
            if (mappedSkus.includes(item.sku)) {
              mappedRevenue += Number(item.price || 0) * (item.quantity || 1);
            }
          });
        });
        if (spend > 0) {
          finalRoas = Number((mappedRevenue / spend).toFixed(2));
        }
      }
      const hookRate = impressions > 0 ? videoViews / impressions * 100 : 0;
      const cpmr = reach > 0 ? spend / reach * 1e3 : 0;
      const similarity = Math.floor(Math.random() * 80);
      return {
        id: row.ad_id,
        name: row.ad_name,
        entityId: `VEO-${row.ad_id.substring(row.ad_id.length - 4)}-G`,
        hookRate: Number(hookRate.toFixed(2)),
        cpmr: Number(cpmr.toFixed(2)),
        similarity,
        roas: finalRoas,
        frequency: Number(frequency.toFixed(2)),
        spend,
        status: "active"
      };
    }));
    return res.status(200).json(ads);
  } catch (error) {
    console.error("Meta Andromeda error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router4.get("/products", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const products = await prisma.product.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" }
    });
    return res.status(200).json(products);
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});
router4.get("/ad-mappings/:adId", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { adId } = req.params;
    const mappings = await prisma.adProductMapping.findMany({
      where: { workspaceId, adId }
    });
    return res.status(200).json(mappings.map((m) => m.sku));
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch mappings" });
  }
});
router4.post("/ad-mappings", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { adId, skus } = req.body;
    await prisma.adProductMapping.deleteMany({
      where: { workspaceId, adId }
    });
    if (skus && skus.length > 0) {
      await prisma.adProductMapping.createMany({
        data: skus.map((sku) => ({
          workspaceId,
          adId,
          sku
        }))
      });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Failed to save mappings" });
  }
});
var meta_default = router4;

// src/routes/google.ts
var import_express5 = require("express");
init_prisma();
var router5 = (0, import_express5.Router)();
router5.post("/sync", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "google" } }
    });
    if (!integration || !integration.config) {
      return res.status(400).json({ error: "Google Ads integration not configured" });
    }
    const config = integration.config;
    const developerToken = config.developerToken?.trim();
    const rawCustomerId = config.customerId?.trim();
    let accessToken = (config.accessToken || config.refreshToken)?.trim();
    if (!developerToken || !rawCustomerId || !accessToken) {
      return res.status(400).json({ error: "Missing developerToken, customerId, or accessToken in Google config" });
    }
    const customerId = rawCustomerId.replace(/-/g, "");
    const managerId = (config.managerId || process.env.GOOGLE_ADS_MANAGER_ID || "")?.replace(/-/g, "");
    const clientId = config.clientId || process.env.GOOGLE_ADS_CLIENT_ID || "";
    const clientSecret = config.clientSecret || process.env.GOOGLE_ADS_CLIENT_SECRET || "";
    if (!accessToken.startsWith("ya29.")) {
      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "Missing OAuth Client ID or Client Secret to perform token exchange." });
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: accessToken,
          grant_type: "refresh_token"
        })
      });
      if (!tokenRes.ok) {
        console.error("Failed to get Google Ads access token:", await tokenRes.text());
        return res.status(401).json({ error: "Failed to authenticate Google Ads with the provided Refresh Token and Client Credentials." });
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          config: {
            ...config,
            accessToken,
            refreshToken: config.refreshToken || config.accessToken
          }
        }
      });
    }
    const query = `
            SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE segments.date DURING LAST_30_DAYS
        `;
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json"
    };
    if (managerId) headers["login-customer-id"] = managerId;
    const response = await fetch(`https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("Google Ads Sync API Error:", response.status, errText);
      return res.status(response.status).json({ error: "Failed to fetch from Google Ads API", details: errText });
    }
    const data = await response.json();
    const rows = data.results || [];
    let processed = 0;
    const dailySpends = {};
    for (const row of rows) {
      const dateStr = row.segments?.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const spendMicros = parseInt(row.metrics?.costMicros || "0");
      const spend = spendMicros / 1e6;
      dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend;
      await prisma.adSpend.upsert({
        where: { workspaceId_platform_campaignId_date: { workspaceId, platform: "GOOGLE", campaignId: row.campaign?.id?.toString() || "", date: new Date(dateStr) } },
        update: {
          campaignName: row.campaign?.name || "Unknown",
          spend,
          impressions: parseInt(row.metrics?.impressions || "0"),
          clicks: parseInt(row.metrics?.clicks || "0"),
          conversions: parseInt(row.metrics?.conversions || "0"),
          conversionValue: parseFloat(row.metrics?.conversionsValue || "0")
        },
        create: {
          workspaceId,
          platform: "GOOGLE",
          campaignId: row.campaign?.id?.toString() || "",
          campaignName: row.campaign?.name || "Unknown",
          spend,
          impressions: parseInt(row.metrics?.impressions || "0"),
          clicks: parseInt(row.metrics?.clicks || "0"),
          conversions: parseInt(row.metrics?.conversions || "0"),
          conversionValue: parseFloat(row.metrics?.conversionsValue || "0"),
          date: new Date(dateStr)
        }
      });
      processed++;
    }
    for (const [dateStr, spend] of Object.entries(dailySpends)) {
      await upsertDailyMetric(workspaceId, new Date(dateStr), "googleAdSpend", spend);
    }
    await invalidateWorkspaceCache(workspaceId);
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSync: /* @__PURE__ */ new Date(), status: "Connected" }
    });
    await createAuditLog({
      workspaceId,
      source: "GOOGLE",
      event: "Sync",
      status: "200 OK",
      message: `Sincronizadas ${processed} anal\xEDticas de campa\xF1as de Google Ads.`
    });
    return res.status(200).json({ success: true, count: processed });
  } catch (error) {
    console.error("Google Ads Sync Error:", error);
    return res.status(500).json({ error: "Internal server error while syncing Google Ads" });
  }
});
router5.get("/campaigns", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const dateFilter = from && to ? {
      date: {
        gte: new Date(from),
        lte: new Date(to)
      }
    } : {};
    const campaigns = await prisma.adSpend.groupBy({
      by: ["campaignId", "campaignName"],
      where: {
        workspaceId,
        platform: "GOOGLE",
        ...dateFilter
      },
      _sum: {
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        conversionValue: true
      }
    });
    const formatted = campaigns.map((c) => {
      const spend = Number(c._sum.spend || 0);
      const conversions = Number(c._sum.conversions || 0);
      const conversionValue = Number(c._sum.conversionValue || 0);
      return {
        id: c.campaignId,
        name: c.campaignName,
        status: "Active",
        spend,
        cpa: conversions > 0 ? spend / conversions : 0,
        roas: spend > 0 ? conversionValue / spend : 0
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router5.get("/daily-performance", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const dateFilter = from && to ? {
      date: {
        gte: new Date(from),
        lte: new Date(to)
      }
    } : {};
    const rows = await prisma.adSpend.groupBy({
      by: ["date"],
      where: { workspaceId, platform: "GOOGLE", ...dateFilter },
      _sum: { spend: true, conversions: true },
      orderBy: { date: "asc" }
    });
    const formatted = rows.map((r) => {
      const spend = Number(r._sum.spend || 0);
      const conversions = Number(r._sum.conversions || 0);
      return {
        date: new Date(r.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
        spend,
        conversions,
        cpa: conversions > 0 ? spend / conversions : 0
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router5.get("/search-terms", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const terms = [
      { query: "metria metrics software", category: "Brand Search", conversions: 12, cpa: 2.1, status: "trending" },
      { query: "profit tracking e-commerce", category: "Generic Search", conversions: 8, cpa: 15.4, status: "stable" },
      { query: "shopify google ads integration", category: "Long tail", conversions: 5, cpa: 8.9, status: "low" },
      { query: "automatic marketing reports", category: "Generic Search", conversions: 3, cpa: 12.5, status: "new" }
    ];
    return res.status(200).json(terms);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
var google_default = router5;

// src/routes/tiktok.ts
var import_express6 = require("express");
init_prisma();
var router6 = (0, import_express6.Router)();
router6.post("/sync", authenticate, async (req, res) => {
  try {
    console.log("Triggering tiktok sync endpoint");
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "tiktok" } }
    });
    if (!integration || !integration.config) {
      return res.status(400).json({ error: "TikTok Ads integration not configured" });
    }
    const config = integration.config;
    const accessToken = config.accessToken;
    const adAccountId = config.adAccountId;
    if (!accessToken || !adAccountId) {
      return res.status(400).json({ error: "Missing accessToken or adAccountId in TikTok config" });
    }
    const metrics = [
      "spend",
      "impressions",
      "clicks",
      "conversion",
      "total_purchase_value",
      "video_views_p25",
      "video_views_p50",
      "video_views_p75",
      "video_views_p100",
      "six_seconds_video_views",
      "reach",
      "frequency"
    ];
    const dimensions = ["stat_time_day", "campaign_id", "campaign_name"];
    const endDateObj = /* @__PURE__ */ new Date();
    const startDateObj = /* @__PURE__ */ new Date();
    startDateObj.setDate(startDateObj.getDate() - 30);
    const start_date = startDateObj.toISOString().split("T")[0];
    const end_date = endDateObj.toISOString().split("T")[0];
    const params = new URLSearchParams({
      advertiser_id: adAccountId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(dimensions),
      metrics: JSON.stringify(metrics),
      start_date,
      end_date,
      page_size: "1000"
    });
    const allInsights = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      params.set("page", page.toString());
      const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          "Access-Token": accessToken,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("TikTok Sync API HTTP Error:", response.status, errText);
        if (allInsights.length > 0) break;
        return res.status(response.status).json({ error: "Failed to fetch from TikTok API" });
      }
      const data = await response.json();
      if (data.code !== 0) {
        console.error("TikTok API Logic Error:", data);
        if (allInsights.length > 0) break;
        return res.status(400).json({ error: `TikTok API Error: ${data.message}` });
      }
      const pageInsights = data.data?.list || [];
      allInsights.push(...pageInsights);
      const totalPage = data.data?.page_info?.total_page || 1;
      if (page >= totalPage) {
        hasMore = false;
      } else {
        page++;
      }
    }
    let processed = 0;
    const dailySpends = {};
    for (const row of allInsights) {
      const dateStr = row.dimensions?.stat_time_day;
      if (!dateStr) continue;
      const metricsObj = row.metrics || {};
      const spend = parseFloat(metricsObj.spend || "0");
      dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend;
      const conversions = parseInt(metricsObj.conversion || "0");
      const conversionValue = parseFloat(metricsObj.total_purchase_value || "0");
      await prisma.adSpend.upsert({
        where: { workspaceId_platform_campaignId_date: { workspaceId, platform: "TIKTOK", campaignId: row.dimensions.campaign_id?.toString() || "", date: new Date(dateStr) } },
        update: {
          campaignName: row.dimensions.campaign_name || row.dimensions.campaign_id?.toString() || "TikTok Campaign",
          spend,
          impressions: parseInt(metricsObj.impressions || "0"),
          reach: parseInt(metricsObj.reach || "0"),
          clicks: parseInt(metricsObj.clicks || "0"),
          videoViews: parseInt(metricsObj.video_play || "0"),
          videoViewsP25: parseInt(metricsObj.video_views_p25 || "0"),
          videoViewsP50: parseInt(metricsObj.video_views_p50 || "0"),
          videoViewsP75: parseInt(metricsObj.video_views_p75 || "0"),
          videoViewsP100: parseInt(metricsObj.video_views_p100 || "0"),
          videoViews6s: parseInt(metricsObj.six_seconds_video_views || "0"),
          conversions,
          conversionValue
        },
        create: {
          workspaceId,
          platform: "TIKTOK",
          campaignId: row.dimensions.campaign_id?.toString() || "",
          campaignName: row.dimensions.campaign_name || row.dimensions.campaign_id?.toString() || "TikTok Campaign",
          spend,
          impressions: parseInt(metricsObj.impressions || "0"),
          reach: parseInt(metricsObj.reach || "0"),
          clicks: parseInt(metricsObj.clicks || "0"),
          videoViews: parseInt(metricsObj.video_play || "0"),
          videoViewsP25: parseInt(metricsObj.video_views_p25 || "0"),
          videoViewsP50: parseInt(metricsObj.video_views_p50 || "0"),
          videoViewsP75: parseInt(metricsObj.video_views_p75 || "0"),
          videoViewsP100: parseInt(metricsObj.video_views_p100 || "0"),
          videoViews6s: parseInt(metricsObj.six_seconds_video_views || "0"),
          conversions,
          conversionValue,
          date: new Date(dateStr)
        }
      });
      processed++;
    }
    for (const [dateStr, spend] of Object.entries(dailySpends)) {
      await upsertDailyMetric(workspaceId, new Date(dateStr), "tiktokAdSpend", spend);
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSync: /* @__PURE__ */ new Date(), status: "Connected" }
    });
    await createAuditLog({
      workspaceId,
      source: "TIKTOK",
      event: "Sync",
      status: "200 OK",
      message: `Sincronizadas ${processed} anal\xEDticas diarias de campa\xF1as de TikTok Ads.`
    });
    await invalidateWorkspaceCache(workspaceId);
    return res.status(200).json({ success: true, count: processed });
  } catch (error) {
    console.error("TikTok Sync Error:", error);
    return res.status(500).json({ error: "Internal server error while syncing TikTok Ads" });
  }
});
router6.get("/campaigns", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const dateFilter = from && to ? {
      date: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const campaigns = await prisma.adSpend.groupBy({
      by: ["campaignId", "campaignName"],
      where: {
        workspaceId,
        platform: "TIKTOK",
        ...dateFilter
      },
      _sum: {
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        conversionValue: true,
        videoViews: true,
        videoViews6s: true,
        videoViewsP25: true,
        videoViewsP50: true,
        videoViewsP75: true,
        videoViewsP100: true
      }
    });
    const formatted = campaigns.map((c) => {
      const spend = Number(c._sum.spend || 0);
      const conversions = Number(c._sum.conversions || 0);
      const conversionValue = Number(c._sum.conversionValue || 0);
      const impressions = Number(c._sum.impressions || 0);
      const video6s = Number(c._sum.videoViews6s || 0);
      const p25 = Number(c._sum.videoViewsP25 || 0);
      const p50 = Number(c._sum.videoViewsP50 || 0);
      const p75 = Number(c._sum.videoViewsP75 || 0);
      const p100 = Number(c._sum.videoViewsP100 || 0);
      return {
        id: c.campaignId,
        name: c.campaignName,
        status: "Active",
        spend,
        impressions,
        cpa: conversions > 0 ? spend / conversions : 0,
        roas: spend > 0 ? conversionValue / spend : 0,
        clicks: Number(c._sum.clicks || 0),
        conversions,
        video6s,
        p25,
        p50,
        p75,
        p100,
        hookRate: impressions > 0 ? p25 / impressions * 100 : 0,
        engagedViewRate: impressions > 0 ? video6s / impressions * 100 : 0
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router6.get("/daily-performance", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    const dateFilter = from && to ? {
      date: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const rows = await prisma.adSpend.groupBy({
      by: ["date"],
      where: { workspaceId, platform: "TIKTOK", ...dateFilter },
      _sum: { spend: true, conversions: true },
      orderBy: { date: "asc" }
    });
    const formatted = rows.map((r) => {
      const spend = Number(r._sum.spend || 0);
      const conversions = Number(r._sum.conversions || 0);
      return {
        date: new Date(r.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
        spend,
        conversions,
        cpa: conversions > 0 ? spend / conversions : 0
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router6.get("/creatives", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const creatives = [
      { name: "Video_Vertical_Hook_A", roas: 4.25, conversions: 45, spend: 120.5 },
      { name: "UGC_Testimonial_01", roas: 3.8, conversions: 32, spend: 85 },
      { name: "Product_Showcase_Tilt", roas: 2.15, conversions: 12, spend: 55.75 },
      { name: "Discount_Flash_Sale", roas: 5.1, conversions: 68, spend: 133.2 }
    ];
    creatives.sort((a, b) => b.roas - a.roas);
    return res.status(200).json(creatives);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
var tiktok_default = router6;

// src/routes/dropi.ts
var import_express7 = require("express");
init_prisma();
var router7 = (0, import_express7.Router)();
router7.post("/webhooks/status", async (req, res) => {
  try {
    const token = req.headers["x-dropi-token"];
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Missing workspaceId" });
    }
    const integration = await prisma.integration.findFirst({
      where: { workspaceId, platform: "Dropi" }
    });
    const config = integration?.config || {};
    const secret = config.webhookSecret || process.env.DROPI_WEBHOOK_SECRET;
    if (!token || token !== secret) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
    const { guideId, orderId, clientName, city, status, collectedValue, shippingFee } = req.body;
    if (!guideId) {
      return res.status(400).json({ error: "Missing guideId" });
    }
    await prisma.shipment.upsert({
      where: { workspaceId_guideId: { workspaceId, guideId } },
      update: {
        status,
        collectedValue: collectedValue ? parseFloat(collectedValue) : null,
        shippingFee: shippingFee ? parseFloat(shippingFee) : null
      },
      create: {
        workspaceId,
        guideId,
        orderId: orderId || null,
        clientName: clientName || "Unknown",
        city: city || "Unknown",
        status,
        collectedValue: collectedValue ? parseFloat(collectedValue) : null,
        shippingFee: shippingFee ? parseFloat(shippingFee) : null
      }
    });
    if (shippingFee) {
      const today = new Date((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
      await upsertDailyMetric(workspaceId, today, "totalShipping", parseFloat(shippingFee), "increment");
    }
    await invalidateWorkspaceCache(workspaceId);
    await createAuditLog({
      workspaceId,
      source: "Dropi",
      event: "Status Webhook",
      status: "200 OK",
      message: `Pedido #${orderId || "Desconocido"} actualizado a: ${status}`
    });
    return res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Dropi Webhook Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router7.get("/shipments", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const { from, to } = req.query;
    let dateFilter = {};
    if (from && to) {
      dateFilter = {
        createdAt: {
          gte: getStartOfDay(from),
          lte: getEndOfDay(to)
        }
      };
    }
    const shipments = await prisma.shipment.findMany({
      where: { workspaceId, ...dateFilter },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" }
    });
    const total = await prisma.shipment.count({ where: { workspaceId, ...dateFilter } });
    return res.status(200).json({
      data: shipments,
      meta: { total, page, limit }
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router7.get("/summary", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    let dateFilter = {};
    if (from && to) {
      dateFilter = {
        createdAt: {
          gte: getStartOfDay(from),
          lte: getEndOfDay(to)
        }
      };
    }
    const totalShipments = await prisma.shipment.count({ where: { workspaceId, ...dateFilter } });
    const delivered = await prisma.shipment.count({ where: { workspaceId, status: "Entregado", ...dateFilter } });
    const returned = await prisma.shipment.count({ where: { workspaceId, status: "Devuelto", ...dateFilter } });
    const inTransit = await prisma.shipment.count({ where: { workspaceId, status: "En Tr\xE1nsito", ...dateFilter } });
    const pending = await prisma.shipment.count({ where: { workspaceId, status: "Pendiente", ...dateFilter } });
    const collectedSumResult = await prisma.shipment.aggregate({
      _sum: { collectedValue: true },
      where: { workspaceId, status: "Entregado", ...dateFilter }
    });
    return res.status(200).json({
      deliveryRate: totalShipments > 0 ? delivered / totalShipments * 100 : 0,
      returnRate: totalShipments > 0 ? returned / totalShipments * 100 : 0,
      activeGuides: inTransit + pending,
      totalCollected: collectedSumResult._sum.collectedValue || 0,
      breakdown: {
        delivered,
        inTransit,
        returned,
        pending
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
var dropi_default = router7;

// src/routes/oauth.ts
var import_express8 = require("express");

// src/lib/oauth/providers/meta.ts
var MetaAdsProvider = class {
  platform = "META";
  clientId = process.env.META_APP_ID;
  clientSecret = process.env.META_APP_SECRET;
  apiVersion = "v19.0";
  baseUrl = "https://graph.facebook.com";
  /**
   * Generates the Meta Authorization URL.
   */
  getAuthUrl(state) {
    const scopes = [
      "ads_read",
      "ads_management",
      "business_management",
      "pages_read_engagement",
      "pages_show_list"
    ].join(",");
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${this.clientId}&state=${state}&scope=${scopes}&response_type=code`;
  }
  /**
   * Exchanges the authorization code for a short-lived token, 
   * then upgrades it to a long-lived token.
   */
  async exchangeCode(code, redirectUri) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Meta Ads OAuth: Missing META_APP_ID or META_APP_SECRET in environment");
    }
    const shortLivedUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      client_secret: this.clientSecret,
      code
    }).toString();
    const shortLivedResponse = await fetch(shortLivedUrl);
    if (!shortLivedResponse.ok) {
      const error = await shortLivedResponse.json();
      throw new Error(`Meta OAuth Error (Short-lived): ${JSON.stringify(error)}`);
    }
    const shortLivedData = await shortLivedResponse.json();
    const longLivedUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: shortLivedData.access_token
    }).toString();
    const longLivedResponse = await fetch(longLivedUrl);
    if (!longLivedResponse.ok) {
      const error = await longLivedResponse.json();
      throw new Error(`Meta OAuth Error (Long-lived): ${JSON.stringify(error)}`);
    }
    const longLivedData = await longLivedResponse.json();
    const expiresAt = longLivedData.expires_in ? new Date(Date.now() + longLivedData.expires_in * 1e3) : void 0;
    return {
      accessToken: longLivedData.access_token,
      expiresAt,
      providerData: {
        tokenType: "long-lived"
      }
    };
  }
  /**
   * Refreshes a token. Meta doesn't use refresh tokens in the traditional sense;
   * instead, long-lived tokens are replaced by new long-lived tokens or re-authenticated.
   */
  async refreshToken(refreshToken) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Meta Ads OAuth: Missing META_APP_ID or META_APP_SECRET in environment");
    }
    const refreshUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: refreshToken
    }).toString();
    const response = await fetch(refreshUrl);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta Token Refresh Error: ${JSON.stringify(error)}`);
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1e3) : void 0
    };
  }
};

// src/lib/oauth/providers/google.ts
var GoogleAdsProvider = class {
  platform = "GOOGLE";
  clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  tokenUrl = "https://oauth2.googleapis.com/token";
  /**
   * Generates the Google Authorization URL.
   */
  getAuthUrl(state) {
    const scopes = ["https://www.googleapis.com/auth/adwords"].join(" ");
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      scope: scopes,
      state,
      access_type: "offline",
      prompt: "consent"
      // Forces a fresh refresh token
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  /**
   * Exchanges the authorization code for tokens.
   */
  async exchangeCode(code, redirectUri) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Google Ads OAuth: Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in environment");
    }
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google OAuth Error: ${JSON.stringify(error)}`);
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1e3)
    };
  }
  /**
   * Refreshes the access token using the refresh token.
   */
  async refreshToken(refreshToken) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Google Ads OAuth: Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in environment");
    }
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Token Refresh Error: ${JSON.stringify(error)}`);
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken,
      // Google doesn't always rotate refresh tokens
      expiresAt: new Date(Date.now() + data.expires_in * 1e3)
    };
  }
};

// src/lib/oauth/manager.ts
init_google_calendar();

// src/lib/oauth/providers/shopify.ts
var ShopifyProvider = class {
  platform = "SHOPIFY";
  apiKey = process.env.SHOPIFY_API_KEY;
  apiSecret = process.env.SHOPIFY_API_SECRET;
  scopes = process.env.SHOPIFY_SCOPES || "read_orders,read_products,read_customers";
  /**
   * Generates the Shopify Installation URL.
   * Note: Shopify needs the shop domain. For the generic interface, 
   * we assume the 'state' parameter contains 'shop=domain.myshopify.com&workspaceId=...'.
   */
  getAuthUrl(state) {
    const params = new URLSearchParams(state);
    const shop = params.get("shop");
    if (!shop) {
      throw new Error("Shopify OAuth: Missing shop domain in state");
    }
    const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const authParams = new URLSearchParams({
      client_id: this.apiKey,
      scope: this.scopes,
      redirect_uri: process.env.SHOPIFY_REDIRECT_URI,
      state,
      "grant_options[]": "per-user"
      // Or remove for offline token
    });
    return `https://${cleanShop}/admin/oauth/authorize?${authParams.toString()}`;
  }
  /**
   * Exchanges the authorization code for a permanent access token.
   */
  async exchangeCode(code, redirectUri) {
    const shop = global.currentShopContext;
    if (!shop) {
      throw new Error("Shopify OAuth: Shop domain context lost during exchange");
    }
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify OAuth Error: ${error}`);
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      scope: data.scope,
      providerData: {
        shop
      }
    };
  }
  /**
   * Shopify offline tokens do not expire and don't need refreshing.
   */
  async refreshToken(refreshToken) {
    return {
      accessToken: refreshToken,
      providerData: { note: "Shopify offline tokens do not expire" }
    };
  }
};

// src/lib/oauth/manager.ts
var OAuthManager = class {
  static providers = {
    meta: new MetaAdsProvider(),
    google: new GoogleAdsProvider(),
    google_calendar: new GoogleCalendarProvider(),
    shopify: new ShopifyProvider()
  };
  static getProvider(platform) {
    const provider3 = this.providers[platform.toLowerCase()];
    if (!provider3) {
      throw new Error(`OAuth: Unsupported platform "${platform}"`);
    }
    return provider3;
  }
};

// src/routes/oauth.ts
init_prisma();
var router8 = (0, import_express8.Router)();
router8.get("/:platform", authenticate, async (req, res) => {
  try {
    const { platform } = req.params;
    const workspaceId = req.user?.workspaceId;
    const { shop } = req.query;
    if (!workspaceId) return res.status(400).json({ error: "Auth required" });
    const provider3 = OAuthManager.getProvider(platform);
    const stateData = { workspaceId };
    if (shop) stateData.shop = shop;
    const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
    const authUrl = provider3.getAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
router8.get("/:platform/callback", async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state" });
    }
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());
    const { workspaceId, shop } = stateData;
    if (!workspaceId) throw new Error("Invalid state: missing workspaceId");
    const provider3 = OAuthManager.getProvider(platform);
    if (platform === "shopify") global.currentShopContext = shop;
    const tokens = await provider3.exchangeCode(
      code,
      `${process.env.BACKEND_URL}/api/oauth/${platform}/callback`
    );
    const integrationName = platform.charAt(0).toUpperCase() + platform.slice(1);
    await prisma.integration.upsert({
      where: { workspaceId_platform: { workspaceId, platform: platform.toLowerCase() } },
      update: {
        status: "Connected",
        config: {
          ...tokens.providerData,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          lastSync: /* @__PURE__ */ new Date()
        }
      },
      create: {
        workspaceId,
        platform: platform.toLowerCase(),
        name: integrationName,
        type: "AD_ACCOUNT",
        status: "Connected",
        config: {
          ...tokens.providerData,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        }
      }
    });
    await createAuditLog({
      workspaceId,
      source: platform.toUpperCase(),
      event: "OAuth_Connect",
      status: "Success",
      message: `Account connected successfully via OAuth.`
    });
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?tab=integrations&success=true&platform=${platform}`);
  } catch (error) {
    console.error(`OAuth Callback Error (${req.params.platform}):`, error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?tab=integrations&error=${encodeURIComponent(error.message)}`);
  }
});
var oauth_default = router8;

// src/routes/metrics.ts
var import_express9 = require("express");
init_prisma();

// src/middleware/roleAuth.ts
var requireRole = (allowedRoles) => {
  return [
    authenticate,
    (req, res, next) => {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ error: "Unauthorized: Missing user role" });
      }
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Forbidden: Requires one of the following roles: ${allowedRoles.join(", ")}`
        });
      }
      next();
    }
  ];
};

// src/routes/metrics.ts
var import_date_fns2 = require("date-fns");
var router9 = (0, import_express9.Router)();
router9.use(requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]));
router9.get("/summary", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, compareFrom, compareTo, excludeCampaigns } = req.query;
    const excludedIds = excludeCampaigns ? excludeCampaigns.split(",") : [];
    let startZone, endZone;
    if (from && to) {
      startZone = getStartOfDay(from);
      endZone = getEndOfDay(to);
    } else {
      const todayStr = getTodayStr();
      startZone = getStartOfDay(todayStr);
      endZone = getEndOfDay(todayStr);
    }
    const fetchSummaryData = async (start, end) => {
      const [metrics, fixedCosts, settings, orders, filteredMetaSpend, filteredGoogleSpend, filteredTiktokSpend] = await Promise.all([
        prisma.dailyMetric.findMany({
          where: { workspaceId, date: { gte: start, lte: end } }
        }),
        prisma.fixedCost.findMany({
          where: { workspaceId, isActive: true }
        }),
        prisma.globalSetting.findUnique({
          where: { workspaceId }
        }),
        prisma.order.findMany({
          where: {
            workspaceId,
            financialStatus: { in: ["paid", "partially_refunded", "pending", "authorized"] },
            createdAt: { gte: start, lte: end }
          }
        }),
        prisma.adSpend.groupBy({
          by: ["date"],
          _sum: { spend: true },
          where: { workspaceId, platform: "META", date: { gte: start, lte: end }, campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0 }
        }),
        prisma.adSpend.groupBy({
          by: ["date"],
          _sum: { spend: true },
          where: { workspaceId, platform: "GOOGLE", date: { gte: start, lte: end }, campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0 }
        }),
        prisma.adSpend.groupBy({
          by: ["date"],
          _sum: { spend: true },
          where: { workspaceId, platform: "TIKTOK", date: { gte: start, lte: end }, campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0 }
        })
      ]);
      const totalFixedCosts = fixedCosts.reduce((sum, cost) => sum + Number(cost.amount), 0);
      const revenue = metrics.reduce((sum, m) => sum + Number(m.totalRevenue), 0);
      const orderCount = orders.length;
      const metaSpend = filteredMetaSpend.reduce((sum, s) => sum + Number(s._sum.spend || 0), 0);
      const googleSpend = filteredGoogleSpend.reduce((sum, s) => sum + Number(s._sum.spend || 0), 0);
      const tiktokSpend = filteredTiktokSpend.reduce((sum, s) => sum + Number(s._sum.spend || 0), 0);
      const totalAdSpend = metaSpend + googleSpend + tiktokSpend;
      let taxesAndFees = 0;
      if (settings) {
        const taxAmount = revenue * (Number(settings.taxRate || 0) / 100);
        const gatewayPercentAmount = revenue * (Number(settings.gatewayPercent || 0) / 100);
        const gatewayFixedAmount = orderCount * Number(settings.gatewayFixed || 0);
        let customFeesAmount = 0;
        const customFees = settings.customFees || [];
        customFees.forEach((fee) => {
          if (fee.type === "percent") customFeesAmount += revenue * (Number(fee.amount || 0) / 100);
          else customFeesAmount += orderCount * Number(fee.amount || 0);
        });
        taxesAndFees = taxAmount + gatewayPercentAmount + gatewayFixedAmount + customFeesAmount;
      }
      const totalShipping = metrics.reduce((sum, m) => sum + Number(m.totalShipping), 0);
      const totalCogs = metrics.reduce((sum, m) => sum + Number(m.totalCogs), 0);
      const netProfit = revenue - totalAdSpend - totalShipping - totalCogs - totalFixedCosts - taxesAndFees;
      return {
        totalRevenue: revenue,
        totalShipping,
        totalCogs,
        metaAdSpend: metaSpend,
        googleAdSpend: googleSpend,
        tiktokAdSpend: tiktokSpend,
        totalAdSpend,
        netProfit,
        totalFixedCosts,
        totalTaxAndFees: taxesAndFees
      };
    };
    const currentSummary = await fetchSummaryData(startZone, endZone);
    let prevStartZone, prevEndZone;
    if (compareFrom && compareTo) {
      prevStartZone = getStartOfDay(compareFrom);
      prevEndZone = getEndOfDay(compareTo);
    } else {
      const durationMs = endZone.getTime() - startZone.getTime();
      prevEndZone = (0, import_date_fns2.subDays)(startZone, 1);
      prevStartZone = new Date(prevEndZone.getTime() - durationMs);
    }
    const previousSummary = await fetchSummaryData(prevStartZone, prevEndZone);
    return res.status(200).json({
      ...currentSummary,
      previousPeriod: previousSummary
    });
  } catch (error) {
    console.error("Metrics Summary error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.get("/daily", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  return res.redirect(`/api/metrics/summary?from=${today}&to=${today}`);
});
router9.get("/range", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, days, excludeCampaigns } = req.query;
    const excludedIds = excludeCampaigns ? excludeCampaigns.split(",") : [];
    let startDate, endDate;
    if (from && to) {
      startDate = getStartOfDay(from);
      endDate = getEndOfDay(to);
    } else {
      const numDays = Number(days) || 7;
      const todayStr = getTodayStr();
      startDate = (0, import_date_fns2.subDays)(getStartOfDay(todayStr), numDays);
      endDate = getEndOfDay(todayStr);
    }
    const [metrics, filteredMetaAdSpend, filteredGoogleAdSpend, filteredTiktokAdSpend] = await Promise.all([
      prisma.dailyMetric.findMany({
        where: {
          workspaceId,
          date: { gte: startDate, lte: endDate }
        },
        orderBy: { date: "asc" }
      }),
      prisma.adSpend.groupBy({
        by: ["date"],
        _sum: { spend: true },
        where: {
          workspaceId,
          platform: "META",
          date: { gte: startDate, lte: endDate },
          campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0
        }
      }),
      // Filtered Google AdSpend
      prisma.adSpend.groupBy({
        by: ["date"],
        _sum: { spend: true },
        where: {
          workspaceId,
          platform: "GOOGLE",
          date: { gte: startDate, lte: endDate },
          campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0
        }
      }),
      prisma.adSpend.groupBy({
        by: ["date"],
        _sum: { spend: true },
        where: {
          workspaceId,
          platform: "TIKTOK",
          date: { gte: startDate, lte: endDate },
          campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0
        }
      })
    ]);
    const metaSpendMap = filteredMetaAdSpend.reduce((acc, s) => {
      const dateStr = s.date.toISOString().split("T")[0];
      acc[dateStr] = Number(s._sum.spend || 0);
      return acc;
    }, {});
    const googleSpendMap = filteredGoogleAdSpend.reduce((acc, s) => {
      const dateStr = s.date.toISOString().split("T")[0];
      acc[dateStr] = Number(s._sum.spend || 0);
      return acc;
    }, {});
    const tiktokSpendMap = filteredTiktokAdSpend.reduce((acc, s) => {
      const dateStr = s.date.toISOString().split("T")[0];
      acc[dateStr] = Number(s._sum.spend || 0);
      return acc;
    }, {});
    const metricsMap = metrics.reduce((acc, m) => {
      const dateStr = m.date.toISOString().split("T")[0];
      acc[dateStr] = m;
      return acc;
    }, {});
    const mappedMetrics = [];
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const m = metricsMap[dateStr];
      const metaSpend = metaSpendMap[dateStr] || 0;
      const googleSpend = googleSpendMap[dateStr] || 0;
      const tiktokSpend = tiktokSpendMap[dateStr] || 0;
      if (m) {
        const profit = Number(m.totalRevenue) - metaSpend - googleSpend - tiktokSpend - Number(m.totalShipping) - Number(m.totalCogs);
        mappedMetrics.push({
          ...m,
          totalRevenue: Number(m.totalRevenue),
          metaAdSpend: metaSpend,
          googleAdSpend: googleSpend,
          tiktokAdSpend: tiktokSpend,
          totalShipping: Number(m.totalShipping),
          totalCogs: Number(m.totalCogs),
          netProfit: profit
        });
      } else {
        mappedMetrics.push({
          id: `fake-${dateStr}`,
          workspaceId,
          date: currentDate.toISOString(),
          totalRevenue: 0,
          metaAdSpend: metaSpend,
          googleAdSpend: googleSpend,
          tiktokAdSpend: tiktokSpend,
          totalShipping: 0,
          totalCogs: 0,
          netProfit: -(metaSpend + googleSpend + tiktokSpend)
        });
      }
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1e3);
    }
    return res.status(200).json(mappedMetrics);
  } catch (error) {
    console.error("Metrics Range error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.get("/finances", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const costs = await prisma.fixedCost.findMany({
      where: { workspaceId, isActive: true }
    });
    const settings = await prisma.globalSetting.findUnique({
      where: { workspaceId }
    });
    return res.status(200).json({
      fixedCosts: costs,
      settings: settings || { taxRate: 0, gatewayPercent: 0, gatewayFixed: 0, currency: "usd", timezone: "santiago" },
      summary: {
        totalFixedCosts: costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
      }
    });
  } catch (error) {
    console.error("Metrics Finances error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.post("/finances/fixed-costs", requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { id, name, category, amount } = req.body;
    if (!name || isNaN(Number(amount))) return res.status(400).json({ error: "Invalid config" });
    const cost = id ? await prisma.fixedCost.update({
      where: { id },
      data: { name, category, amount: Number(amount) }
    }) : await prisma.fixedCost.create({
      data: { workspaceId, name, category, amount: Number(amount) }
    });
    await invalidateWorkspaceCache(workspaceId);
    return res.status(200).json(cost);
  } catch (error) {
    return res.status(500).json({ error: "Failed to save fixed cost", message: error.message });
  }
});
router9.delete("/finances/fixed-costs/:id", requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const id = req.params.id;
    await prisma.fixedCost.delete({ where: { id } });
    await invalidateWorkspaceCache(workspaceId);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete fixed cost", message: error.message });
  }
});
router9.get("/sku-performance", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, excludeCampaigns } = req.query;
    const excludedIds = excludeCampaigns ? excludeCampaigns.split(",") : [];
    let start, end;
    if (from && to) {
      start = getStartOfDay(from);
      end = getEndOfDay(to);
    } else {
      const todayStr = getTodayStr();
      end = getEndOfDay(todayStr);
      start = (0, import_date_fns2.subDays)(getStartOfDay(todayStr), 7);
    }
    const orders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["paid", "partially_refunded"] },
        createdAt: { gte: start, lte: end }
      }
    });
    const campaignSpend = await prisma.adSpend.groupBy({
      by: ["campaignName", "campaignId"],
      where: {
        workspaceId,
        date: { gte: start, lte: end },
        campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0
      },
      _sum: { spend: true }
    });
    const totalFilteredAdSpend = campaignSpend.reduce((sum, c) => sum + Number(c._sum.spend || 0), 0);
    const skuMap = {};
    orders.forEach((order) => {
      const items = order.lineItems;
      if (Array.isArray(items)) {
        let hasRealPrices = false;
        let totalItemsQty = 0;
        items.forEach((item) => {
          if (Number(item.price) > 0) hasRealPrices = true;
          totalItemsQty += item.quantity || 1;
        });
        const needsOrderFallback = !hasRealPrices && totalItemsQty > 0 && Number(order.totalPrice) > 0;
        const proratedPrice = needsOrderFallback ? Number(order.totalPrice) / totalItemsQty : 0;
        items.forEach((item) => {
          const sku = item.sku && item.sku !== "" ? item.sku : item.title || "Unknown";
          if (!skuMap[sku]) {
            skuMap[sku] = { name: item.title || sku, sales: 0, revenue: 0, orderFallbacks: 0 };
          }
          const qty = item.quantity || 1;
          skuMap[sku].sales += qty;
          const itemPrice = Number(item.price) || 0;
          if (itemPrice > 0) {
            skuMap[sku].revenue += itemPrice * qty;
          } else if (needsOrderFallback) {
            skuMap[sku].revenue += proratedPrice * qty;
            skuMap[sku].orderFallbacks += qty;
          }
        });
      }
    });
    const products = await prisma.product.findMany({
      where: { workspaceId }
    });
    const productMap = products.reduce((acc, p) => p.sku ? { ...acc, [p.sku]: p } : acc, {});
    let totalSalesRevenue = 0;
    Object.values(skuMap).forEach((s) => totalSalesRevenue += s.revenue);
    const attributedSpendMap = {};
    let unattributedSpend = 0;
    Object.keys(skuMap).forEach((sku) => {
      attributedSpendMap[sku] = 0;
    });
    campaignSpend.forEach((camp) => {
      const spendValue = Number(camp._sum.spend || 0);
      const campName = camp.campaignName.toLowerCase();
      let matched = false;
      for (const sku in skuMap) {
        const productName = skuMap[sku].name.toLowerCase();
        const skuUpper = sku.toLowerCase();
        if (campName.includes(skuUpper) || productName.length > 3 && campName.includes(productName)) {
          attributedSpendMap[sku] += spendValue;
          matched = true;
          break;
        }
      }
      if (!matched) {
        unattributedSpend += spendValue;
      }
    });
    const performance = Object.entries(skuMap).map(([sku, data]) => {
      const product = productMap[sku];
      if (data.revenue === 0 && data.sales > 0 && product && Number(product.price) > 0) {
        data.revenue = Number(product.price) * data.sales;
      }
      let cogs = product ? Number(product.cogs) * data.sales : 0;
      const shareOfUnattributed = totalSalesRevenue > 0 ? data.revenue / totalSalesRevenue * unattributedSpend : 0;
      const adspend = attributedSpendMap[sku] + shareOfUnattributed;
      const profit = data.revenue - cogs - adspend;
      const margin = data.revenue > 0 ? profit / data.revenue * 100 : data.sales > 0 ? -100 : 0;
      return {
        sku,
        name: data.name,
        sales: data.sales,
        revenue: data.revenue,
        cogs,
        adspend,
        profit,
        margin: `${margin.toFixed(1)}%`,
        marginRaw: margin,
        price: product ? Number(product.price) : data.sales > 0 ? data.revenue / data.sales : 0,
        cost: product ? Number(product.cogs) : 0
      };
    }).sort((a, b) => b.profit - a.profit);
    return res.status(200).json(performance);
  } catch (error) {
    console.error("Metrics SKU Performance error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.get("/customers-ltv", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    let dateFilter = {};
    if (from && to) {
      dateFilter = {
        createdAt: {
          gte: getStartOfDay(from),
          lte: getEndOfDay(to)
        }
      };
    }
    const orders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["paid", "partially_refunded"] },
        ...dateFilter
      }
    });
    if (orders.length === 0) {
      return res.status(200).json({ ltv: 0, repurchaseRate: 0, totalCustomers: 0 });
    }
    const customerMap = {};
    let totalRevenue = 0;
    orders.forEach((order) => {
      const email = order.customerEmail || `guest-${order.shopifyId || order.id}`;
      if (!customerMap[email]) {
        customerMap[email] = { totalSpent: 0, orderCount: 0 };
      }
      customerMap[email].orderCount += 1;
      const price = Number(order.totalPrice);
      customerMap[email].totalSpent += price;
      totalRevenue += price;
    });
    const totalCustomers = Object.keys(customerMap).length;
    const returningCustomers = Object.values(customerMap).filter((c) => c.orderCount > 1).length;
    const ltv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    const repurchaseRate = totalCustomers > 0 ? returningCustomers / totalCustomers * 100 : 0;
    return res.status(200).json({
      ltv: ltv.toFixed(2),
      repurchaseRate: repurchaseRate.toFixed(1),
      totalCustomers
    });
  } catch (error) {
    console.error("Metrics LTV error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.get("/returns", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    let dateFilter = {};
    if (from && to) {
      dateFilter = {
        createdAt: {
          gte: getStartOfDay(from),
          lte: getEndOfDay(to)
        }
      };
    }
    const refundedOrders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["refunded", "partially_refunded"] },
        ...dateFilter
      }
    });
    const totalRefunded = refundedOrders.reduce((sum, order) => sum + Number(order.totalPrice), 0);
    return res.status(200).json({
      count: refundedOrders.length,
      totalValue: totalRefunded.toFixed(2),
      orders: refundedOrders.map((o) => ({
        id: o.orderId,
        date: o.createdAt,
        customer: o.customerName,
        status: o.financialStatus,
        value: Number(o.totalPrice).toFixed(2)
      }))
    });
  } catch (error) {
    console.error("Metrics Returns error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router9.get("/attribution", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, excludeCampaigns } = req.query;
    const excludedIds = excludeCampaigns ? excludeCampaigns.split(",") : [];
    const dateFilter = from && to ? {
      date: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const orderDateFilter = from && to ? {
      createdAt: {
        gte: getStartOfDay(from),
        lte: getEndOfDay(to)
      }
    } : {};
    const [metaConversions, googleConversions, tiktokConversions, shopifyOrders] = await Promise.all([
      prisma.adSpend.aggregate({
        where: { workspaceId, platform: "META", campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0, ...dateFilter },
        _sum: { conversions: true }
      }),
      prisma.adSpend.aggregate({
        where: { workspaceId, platform: "GOOGLE", campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0, ...dateFilter },
        _sum: { conversions: true }
      }),
      prisma.adSpend.aggregate({
        where: { workspaceId, platform: "TIKTOK", campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : void 0, ...dateFilter },
        _sum: { conversions: true }
      }),
      prisma.order.count({
        where: {
          workspaceId,
          financialStatus: { in: ["paid", "partially_refunded", "pending", "authorized"] },
          ...orderDateFilter
        }
      })
    ]);
    const meta = Number(metaConversions._sum.conversions || 0);
    const google = Number(googleConversions._sum.conversions || 0);
    const tiktok = Number(tiktokConversions._sum.conversions || 0);
    const attributed = meta + google + tiktok;
    const total = shopifyOrders;
    const orphaned = Math.max(0, total - attributed);
    const lossRate = total > 0 ? Math.round(orphaned / total * 100) : 0;
    return res.status(200).json({
      attributed,
      orphaned,
      total,
      lossRate,
      breakdown: { meta, google, tiktok }
    });
  } catch (error) {
    console.error("Attribution error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
var metrics_default = router9;

// src/routes/valentina.ts
var import_express10 = require("express");
init_prisma();
var import_date_fns3 = require("date-fns");
var router10 = (0, import_express10.Router)();
var INTERNAL_AI_KEY = process.env.INTERNAL_AI_KEY || "valentina-secret-key-123";
var aiAuth = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (key !== INTERNAL_AI_KEY) {
    return res.status(401).json({ error: "Unauthorized AI Agent" });
  }
  next();
};
router10.get("/valentina-context", aiAuth, async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const today = /* @__PURE__ */ new Date();
    const start = (0, import_date_fns3.startOfDay)(today);
    const end = (0, import_date_fns3.endOfDay)(today);
    const orderId = req.query.orderId;
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { workspaceId_orderId: { workspaceId, orderId } },
        include: { shipments: true }
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      return res.status(200).json(order);
    }
    const metric = await prisma.dailyMetric.findFirst({
      where: { workspaceId, date: { gte: start, lte: end } }
    });
    const latestOrders = await prisma.order.findMany({
      where: { workspaceId },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { orderId: true, customerName: true, totalPrice: true, financialStatus: true }
    });
    return res.status(200).json({
      serverTime: (/* @__PURE__ */ new Date()).toISOString(),
      dailyMetrics: metric || null,
      latestOrders
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
var valentina_default = router10;

// src/routes/settings.ts
var import_express11 = require("express");
init_prisma();

// src/controllers/settingsController.ts
init_prisma();
var getGlobalSettings = async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    let settings = await prisma.globalSetting.findUnique({
      where: { workspaceId }
    });
    if (!settings) {
      settings = await prisma.globalSetting.create({
        data: { workspaceId }
      });
    }
    return res.status(200).json(settings);
  } catch (error) {
    console.error("getGlobalSettings Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
var updateGlobalSettings = async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { timezone, currency, strictAttribution, taxRate, gatewayPercent, gatewayFixed, customFees } = req.body;
    const settings = await prisma.globalSetting.upsert({
      where: { workspaceId },
      update: {
        timezone,
        currency,
        strictAttribution,
        taxRate,
        gatewayPercent,
        gatewayFixed,
        customFees
      },
      create: {
        workspaceId,
        timezone,
        currency,
        strictAttribution,
        taxRate: taxRate ?? 0,
        gatewayPercent: gatewayPercent ?? 0,
        gatewayFixed: gatewayFixed ?? 0,
        customFees: customFees ?? []
      }
    });
    return res.status(200).json(settings);
  } catch (error) {
    console.error("updateGlobalSettings Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
var getIntegrations = async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integrations = await prisma.integration.findMany({
      where: { workspaceId }
    });
    return res.status(200).json(integrations);
  } catch (error) {
    console.error("getIntegrations Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
var updateIntegration = async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { platform, name, type, config, status } = req.body;
    if (!platform || !name || !type || !config) {
      return res.status(400).json({ error: "Missing required configuration fields" });
    }
    if (platform === "shopify") {
      const domain = config.domain?.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const accessToken = config.accessToken;
      if (!domain || !accessToken) {
        return res.status(400).json({ error: "Missing domain or accessToken in Shopify config" });
      }
      try {
        const response = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) {
          return res.status(400).json({ error: "Invalid Shopify credentials. Connection test failed." });
        }
      } catch (e) {
        return res.status(400).json({ error: "Failed to connect to Shopify. Please check your domain." });
      }
    }
    if (platform === "tiktok") {
      const accessToken = config.accessToken?.trim();
      const adAccountId = config.adAccountId?.trim();
      if (!accessToken || !adAccountId) {
        return res.status(400).json({ error: "Missing Advertiser ID or Access Token in TikTok config" });
      }
      try {
        const params = new URLSearchParams({ advertiser_ids: JSON.stringify([adAccountId]) });
        const response = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?${params}`, {
          headers: { "Access-Token": accessToken }
        });
        const data = await response.json();
        if (data.code !== 0) {
          return res.status(400).json({ error: `TikTok connection failed: ${data.message || "Invalid credentials"}` });
        }
      } catch (e) {
        return res.status(400).json({ error: "Failed to connect to TikTok Ads API." });
      }
    }
    if (platform === "google") {
      const developerToken = config.developerToken?.trim();
      const rawCustomerId = config.customerId?.trim();
      const refreshToken = config.refreshToken?.trim();
      const clientId = config.clientId?.trim();
      const clientSecret = config.clientSecret?.trim();
      if (!developerToken || !rawCustomerId) {
        return res.status(400).json({ error: "Missing Customer ID or Developer Token in Google config" });
      }
      if (!refreshToken || !clientId || !clientSecret) {
        return res.status(400).json({ error: "Missing OAuth credentials (Client ID, Client Secret, Refresh Token) in Google config" });
      }
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
          })
        });
        if (!tokenRes.ok) {
          return res.status(400).json({ error: "Google OAuth credentials are invalid. Token exchange failed." });
        }
      } catch (e) {
        return res.status(400).json({ error: "Failed to connect to Google Ads API." });
      }
    }
    const integration = await prisma.integration.upsert({
      where: { workspaceId_platform: { workspaceId, platform } },
      update: {
        name,
        type,
        config,
        status: status || "Connected",
        lastSync: /* @__PURE__ */ new Date()
      },
      create: {
        workspaceId,
        platform,
        name,
        type,
        config,
        status: status || "Connected",
        lastSync: /* @__PURE__ */ new Date()
      }
    });
    await createAuditLog({
      workspaceId,
      source: platform.charAt(0).toUpperCase() + platform.slice(1),
      event: "Connection Updated",
      status: "200 OK",
      message: `Plataforma ${name} configurada correctamente.`
    });
    return res.status(200).json(integration);
  } catch (error) {
    console.error("updateIntegration Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// src/routes/settings.ts
var router11 = (0, import_express11.Router)();
router11.get("/global", requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]), getGlobalSettings);
router11.post("/global", requireRole(["SUPER_ADMIN", "ADMIN"]), updateGlobalSettings);
router11.get("/integrations", requireRole(["SUPER_ADMIN", "ADMIN", "VIEWER"]), getIntegrations);
router11.post("/integrations", requireRole(["SUPER_ADMIN", "ADMIN"]), updateIntegration);
router11.get("/logo", authenticate, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.user.workspaceId },
      select: { logoUrl: true }
    });
    res.json({ logoUrl: workspace?.logoUrl || null });
  } catch (error) {
    console.error("Get logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router11.post("/logo", requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    const { logoUrl } = req.body;
    if (!logoUrl || typeof logoUrl !== "string") {
      return res.status(400).json({ error: "logoUrl is required (base64 data URL)" });
    }
    if (logoUrl.length > 28e5) {
      return res.status(400).json({ error: "Logo file exceeds 2MB limit" });
    }
    const workspace = await prisma.workspace.update({
      where: { id: req.user.workspaceId },
      data: { logoUrl },
      select: { logoUrl: true }
    });
    res.json(workspace);
  } catch (error) {
    console.error("Upload logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router11.delete("/logo", requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    await prisma.workspace.update({
      where: { id: req.user.workspaceId },
      data: { logoUrl: null }
    });
    res.json({ message: "Logo removed successfully" });
  } catch (error) {
    console.error("Delete logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router11.get("/branding", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, logoUrl: true, primaryColor: true, brandName: true }
    });
    res.json(workspace ?? {});
  } catch (error) {
    console.error("Get branding error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router11.patch("/branding", requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { primaryColor, brandName } = req.body;
    const data = {};
    if (primaryColor !== void 0) {
      if (typeof primaryColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
        return res.status(400).json({ error: "primaryColor must be a valid hex color (#RRGGBB)" });
      }
      data.primaryColor = primaryColor;
    }
    if (brandName !== void 0) {
      if (typeof brandName !== "string" || brandName.length > 60) {
        return res.status(400).json({ error: "brandName must be a string under 60 chars" });
      }
      data.brandName = brandName.trim() || null;
    }
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
      select: { name: true, logoUrl: true, primaryColor: true, brandName: true }
    });
    res.json(updated);
  } catch (error) {
    console.error("Update branding error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var settings_default = router11;

// src/routes/users.ts
var import_express12 = require("express");
init_prisma();
var import_jsonwebtoken3 = __toESM(require("jsonwebtoken"));
var import_config5 = require("dotenv/config");
var import_bcrypt2 = __toESM(require("bcrypt"));
var router12 = (0, import_express12.Router)();
var JWT_SECRET3 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
router12.get("/", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    if (!workspaceId) return res.json([]);
    const users = await prisma.user.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true },
      orderBy: { name: "asc" }
    });
    res.json(users);
  } catch (error) {
    console.error("List workspace users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router12.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        workspace: true,
        preferences: true
      }
    });
    if (!user) {
      console.error("[/me] User not found in DB:", req.user.id);
      return res.status(404).json({ error: "User not found" });
    }
    const { passwordHash, ...safeUser } = user;
    res.json({
      ...safeUser,
      isImpersonating: !!req.user.isImpersonating
    });
  } catch (error) {
    console.error("Get profile detailed error:", {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    res.status(500).json({ error: "Internal server error", detail: error.message });
  }
});
router12.put("/me", authenticate, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...name !== void 0 && { name },
        ...phone !== void 0 && { phone }
      },
      select: { id: true, name: true, email: true, phone: true, role: true }
    });
    const newToken = import_jsonwebtoken3.default.sign(
      { id: updated.id, email: updated.email, name: updated.name, role: updated.role, workspaceId: req.user.workspaceId },
      JWT_SECRET3,
      { expiresIn: "7d" }
    );
    res.json({ user: updated, token: newToken });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router12.put("/me/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const isMatch = await import_bcrypt2.default.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const hashed = await import_bcrypt2.default.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed }
    });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router12.get("/me/preferences", authenticate, async (req, res) => {
  try {
    let prefs = await prisma.userPreference.findUnique({
      where: { userId: req.user.id }
    });
    if (!prefs) {
      prefs = await prisma.userPreference.create({
        data: { userId: req.user.id }
      });
    }
    res.json(prefs);
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router12.put("/me/preferences", authenticate, async (req, res) => {
  try {
    const { theme, compactMode, emailReports, alertMarginLow, alertStockout, defaultDateRange } = req.body;
    const prefs = await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      update: {
        ...theme !== void 0 && { theme },
        ...compactMode !== void 0 && { compactMode },
        ...emailReports !== void 0 && { emailReports },
        ...alertMarginLow !== void 0 && { alertMarginLow },
        ...alertStockout !== void 0 && { alertStockout },
        ...defaultDateRange !== void 0 && { defaultDateRange }
      },
      create: {
        userId: req.user.id,
        ...theme !== void 0 && { theme },
        ...compactMode !== void 0 && { compactMode },
        ...emailReports !== void 0 && { emailReports },
        ...alertMarginLow !== void 0 && { alertMarginLow },
        ...alertStockout !== void 0 && { alertStockout },
        ...defaultDateRange !== void 0 && { defaultDateRange }
      }
    });
    res.json(prefs);
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var users_default = router12;

// src/routes/admin.ts
var import_express13 = require("express");
init_prisma();
var import_jsonwebtoken4 = __toESM(require("jsonwebtoken"));

// src/middleware/adminAuth.ts
var requireSuperAdmin = [
  authenticate,
  (req, res, next) => {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Forbidden: Super Admin access required" });
    }
    next();
  }
];

// src/routes/admin.ts
var import_config6 = require("dotenv/config");
var import_bcrypt3 = __toESM(require("bcrypt"));
var router13 = (0, import_express13.Router)();
var JWT_SECRET4 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
router13.use(requireSuperAdmin);
router13.get("/workspaces", async (req, res) => {
  try {
    const sevenDaysAgo = /* @__PURE__ */ new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const workspaces = await prisma.workspace.findMany({
      include: {
        integrations: {
          select: { platform: true, status: true, lastSync: true }
        },
        dailyMetrics: {
          where: {
            date: { gte: sevenDaysAgo }
          },
          select: { totalRevenue: true, netProfit: true }
        },
        _count: {
          select: { users: true, orders: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const enriched = workspaces.map((ws) => {
      const metrics7d = ws.dailyMetrics.reduce((acc, m) => ({
        revenue: acc.revenue + Number(m.totalRevenue || 0),
        profit: acc.profit + Number(m.netProfit || 0)
      }), { revenue: 0, profit: 0 });
      return {
        ...ws,
        dailyMetrics: void 0,
        // remove raw array to keep payload lean
        metrics7d
      };
    });
    res.status(200).json(enriched);
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/workspaces", async (req, res) => {
  try {
    const { name, adminEmail } = req.body;
    if (!name || !adminEmail) {
      return res.status(400).json({ error: "Workspace name and admin email are required" });
    }
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      return res.status(400).json({ error: "A user with this email already exists" });
    }
    const tempPassword = "ChangeMe2026!";
    const hashedTempPassword = await import_bcrypt3.default.hash(tempPassword, 10);
    const workspace = await prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({
        data: { name }
      });
      await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash: hashedTempPassword,
          name: "Admin",
          role: "ADMIN",
          workspaceId: newWorkspace.id,
          mustChangePassword: true
        }
      });
      return newWorkspace;
    });
    res.status(201).json({
      message: "Workspace created successfully",
      workspace,
      adminEmail,
      tempPassword
    });
  } catch (error) {
    console.error("Error creating workspace:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/workspaces/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    const newStatus = workspace.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const updated = await prisma.workspace.update({
      where: { id },
      data: { status: newStatus }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error toggling workspace:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/workspaces/impersonate", async (req, res) => {
  try {
    const { targetWorkspaceId } = req.body;
    const userReq = req.user;
    if (!targetWorkspaceId) {
      return res.status(400).json({ error: "targetWorkspaceId is required" });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: targetWorkspaceId } });
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    const token = import_jsonwebtoken4.default.sign(
      {
        id: userReq.id,
        email: userReq.email,
        role: "SUPER_ADMIN",
        workspaceId: targetWorkspaceId,
        isImpersonating: true
      },
      JWT_SECRET4,
      { expiresIn: "1h" }
      // Short lived token for security
    );
    res.status(200).json({ token, workspaceName: workspace.name });
  } catch (error) {
    console.error("Error impersonating workspace:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/workspaces/impersonate/stop", async (req, res) => {
  try {
    const userReq = req.user;
    if (!userReq.isImpersonating) {
      return res.status(400).json({ error: "You are not currenty impersonating a workspace" });
    }
    const realUser = await prisma.user.findUnique({ where: { id: userReq.id } });
    if (!realUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const token = import_jsonwebtoken4.default.sign(
      {
        id: realUser.id,
        email: realUser.email,
        name: realUser.name,
        role: realUser.role,
        workspaceId: realUser.workspaceId
      },
      JWT_SECRET4,
      { expiresIn: "7d" }
    );
    res.status(200).json({ token });
  } catch (error) {
    console.error("Error stopping impersonation:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.get("/users", async (req, res) => {
  try {
    const { workspaceId } = req.query;
    const users = await prisma.user.findMany({
      where: workspaceId ? { workspaceId: String(workspaceId) } : void 0,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workspaceId: true,
        mustChangePassword: true,
        createdAt: true
      }
    });
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const genericPassword = "ChangeMe2026!";
    const hashedGenericPassword = await import_bcrypt3.default.hash(genericPassword, 10);
    const updated = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: hashedGenericPassword,
        mustChangePassword: true
      },
      select: { id: true, email: true, mustChangePassword: true }
    });
    res.status(200).json({
      message: "Password reset successfully. The user must change it on next login.",
      user: updated,
      temporaryPassword: genericPassword
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.get("/settings", async (req, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    res.status(200).json(configs);
  } catch (error) {
    console.error("Error fetching system configs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router13.post("/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || typeof value !== "string") {
      return res.status(400).json({ error: "Key and string value are required" });
    }
    const upserted = await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    res.status(200).json(upserted);
  } catch (error) {
    console.error("Error saving system config:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var admin_default = router13;

// src/routes/logs.ts
var import_express14 = require("express");
init_prisma();
var router14 = (0, import_express14.Router)();
router14.get("/", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId },
      take: 50,
      orderBy: { createdAt: "desc" }
    });
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var logs_default = router14;

// src/routes/onboarding.ts
var import_express15 = require("express");
init_prisma();
var import_jsonwebtoken5 = __toESM(require("jsonwebtoken"));
var router15 = (0, import_express15.Router)();
var JWT_SECRET5 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
router15.post("/select-plan", authenticate, async (req, res) => {
  try {
    const { planType, workspaceName } = req.body;
    const userId = req.user.id;
    if (!planType || !["STARTER", "PRO", "SCALE"].includes(planType)) {
      return res.status(400).json({ error: "Invalid plan type" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { workspace: true }
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (planType === "STARTER" && user.trialUsedAt) {
      return res.status(400).json({ error: "Ya has utilizado tu periodo de prueba gratuito." });
    }
    const trialDays = planType === "STARTER" ? 7 : 0;
    const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1e3) : null;
    const name = workspaceName || `${user.name || user.email.split("@")[0]}'s Workspace`;
    let workspace;
    if (user.workspaceId) {
      workspace = await prisma.workspace.update({
        where: { id: user.workspaceId },
        data: {
          name: workspaceName || void 0,
          // Only update if provided
          plan: planType,
          subscriptionStatus: planType === "STARTER" ? "TRIAL" : "ACTIVE",
          trialEndsAt
        }
      });
    } else {
      workspace = await prisma.workspace.create({
        data: {
          name,
          plan: planType,
          subscriptionStatus: planType === "STARTER" ? "TRIAL" : "ACTIVE",
          trialEndsAt,
          users: {
            connect: { id: user.id }
          }
        }
      });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: "ADMIN",
        workspaceId: workspace.id,
        trialUsedAt: planType === "STARTER" ? /* @__PURE__ */ new Date() : user.trialUsedAt
      }
    });
    const newToken = import_jsonwebtoken5.default.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: "ADMIN",
        workspaceId: workspace.id,
        subscriptionStatus: workspace.subscriptionStatus
      },
      JWT_SECRET5,
      { expiresIn: "7d" }
    );
    res.status(200).json({
      message: "Workspace created successfully",
      token: newToken,
      workspace
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var onboarding_default = router15;

// src/routes/payments.ts
var import_express16 = require("express");
init_prisma();
var import_mercadopago = require("mercadopago");
var import_config7 = require("dotenv/config");
var router16 = (0, import_express16.Router)();
var mpConfig = process.env.MERCADOPAGO_ACCESS_TOKEN ? new import_mercadopago.MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN }) : null;
async function getPayPalAccessToken() {
  const auth14 = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth14}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await response.json();
  return data.access_token;
}
var PLANS = {
  PRO: {
    price: 29,
    name: "Metria Professional",
    paypal_plan_id: process.env.PAYPAL_PLAN_PRO_ID
    // You'll get this from PayPal Dashboard
  },
  SCALE: {
    price: 79,
    name: "Metria Scale",
    paypal_plan_id: process.env.PAYPAL_PLAN_SCALE_ID
  }
};
router16.post("/process-mercadopago-subscription", authenticate, async (req, res) => {
  try {
    const { token, planType, email, cardholderName: clientCardholderName } = req.body;
    const userId = req.user.id;
    const workspaceId = req.user.workspaceId;
    const plan = PLANS[planType];
    console.log("[DEBUG] process-mercadopago-subscription:", { token, planType, email, clientCardholderName, workspaceId });
    if (!token || !plan) {
      return res.status(400).json({
        error: "Datos de suscripci\xF3n incompletos (token o plan)"
      });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace requerido" });
    }
    const amountCLP = planType === "PRO" ? 28e3 : 76e3;
    let customerId = "";
    const searchResponse = await fetch(`https://api.mercadopago.com/v1/customers/search?email=${email}`, {
      headers: { "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
    });
    const searchData = await searchResponse.json();
    if (searchData.results && searchData.results.length > 0) {
      customerId = searchData.results[0].id;
    } else {
      const createCustResp = await fetch("https://api.mercadopago.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });
      const custData = await createCustResp.json();
      customerId = custData.id;
    }
    let cardholderName = clientCardholderName?.toUpperCase() || "";
    if (!cardholderName) {
      try {
        const tokenResp = await fetch(`https://api.mercadopago.com/v1/card_tokens/${token}`, {
          headers: { "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
        });
        const tokenData = await tokenResp.json();
        console.log("[DEBUG] Full Token Data:", JSON.stringify(tokenData, null, 2));
        cardholderName = tokenData.cardholder?.name?.toUpperCase() || "";
      } catch (e) {
        console.error("Error fetching token info:", e);
      }
    }
    console.log("[DEBUG] Final Cardholder Name:", cardholderName);
    let mpResponseStatus = 500;
    let data = {};
    if (!mpConfig) {
      throw new Error("Mercado Pago Access Token is not configured");
    }
    try {
      const preApproval = new import_mercadopago.PreApproval(mpConfig);
      const subscription = await preApproval.create({
        body: {
          back_url: `${process.env.FRONTEND_URL}/dashboard/settings?status=success`,
          reason: `Suscripci\xF3n Metria - Plan ${planType}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: Math.round(amountCLP),
            currency_id: "CLP"
          },
          payer_email: email,
          card_token_id: token,
          status: "authorized",
          external_reference: workspaceId
        },
        requestOptions: {
          idempotencyKey: `sub_${Date.now()}`
        }
      });
      data = subscription;
      mpResponseStatus = 201;
    } catch (error) {
      console.error("[SDK Error] MP Preapproval:", error);
      mpResponseStatus = error.status || 400;
      data = error.body || { message: error.message };
    }
    console.log("[DEBUG] SDK Response:", { status: mpResponseStatus, data });
    const isSandboxSecret = process.env.MERCADOPAGO_ACCESS_TOKEN?.includes("TEST") || process.env.MERCADOPAGO_ACCESS_TOKEN?.includes("APP_USR-6908752470367556");
    const isAuthorized = mpResponseStatus >= 200 && mpResponseStatus < 300 && (data.status === "authorized" || data.status === "active");
    const isCvvError = data.message?.includes("cvv validation");
    let isForcedSuccess = false;
    let isForcedRejection = false;
    let forcedErrorMsg = "";
    if (isSandboxSecret && isCvvError) {
      if (cardholderName === "APRO") {
        isForcedSuccess = true;
        console.log(">>> [SANDBOX BYPASS] Cardholder APRO detected. Forcing SUCCESS.");
      } else if (cardholderName === "FUND") {
        isForcedRejection = true;
        forcedErrorMsg = "Pago rechazado: Fondos insuficientes (Simulaci\xF3n FUND)";
        console.log(">>> [SANDBOX BYPASS] Cardholder FUND detected. Forcing REJECTION.");
      } else if (cardholderName === "CALL") {
        isForcedRejection = true;
        forcedErrorMsg = "Rechazado con validaci\xF3n para autorizar (Simulaci\xF3n CALL)";
        console.log(">>> [SANDBOX BYPASS] Cardholder CALL detected. Forcing REJECTION.");
      } else if (cardholderName === "SECU") {
        isForcedRejection = true;
        forcedErrorMsg = "Rechazado por c\xF3digo de seguridad inv\xE1lido (Simulaci\xF3n SECU)";
        console.log(">>> [SANDBOX BYPASS] Cardholder SECU detected. Forcing REJECTION.");
      } else if (cardholderName === "EXPI") {
        isForcedRejection = true;
        forcedErrorMsg = "Rechazado por problema en fecha de vencimiento (Simulaci\xF3n EXPI)";
        console.log(">>> [SANDBOX BYPASS] Cardholder EXPI detected. Forcing REJECTION.");
      }
    }
    if (isAuthorized || isForcedSuccess) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          plan: planType,
          subscriptionStatus: "ACTIVE",
          subscriptionId: data.id || "demo_" + Date.now(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
          paymentProvider: "MERCADOPAGO",
          cancelAtPeriodEnd: false
        }
      });
      await prisma.paymentLog.create({
        data: {
          workspaceId,
          userId,
          provider: "MERCADOPAGO",
          planType,
          status: "SUCCESS",
          amount: amountCLP,
          currency: "CLP",
          externalId: data.id,
          responseRaw: data
        }
      });
      return res.json({
        success: true,
        subscriptionId: data.id,
        message: "\xA1PAGO PROCESADO CON \xC9XITO!"
      });
    }
    console.error("[MP Preapproval Rejection (SDK)]", { status: mpResponseStatus, data });
    let errorMsg = forcedErrorMsg || "Error al procesar la suscripci\xF3n";
    if (!forcedErrorMsg) {
      if (data.status === "rejected") {
        errorMsg = "Pago rechazado. Por favor, verifica el cupo o usa otra tarjeta.";
      } else if (data.message) {
        errorMsg = data.message;
      }
    }
    await prisma.paymentLog.create({
      data: {
        workspaceId,
        userId,
        provider: "MERCADOPAGO",
        planType,
        status: isForcedRejection ? "SANDBOX_REJECTED" : "REJECTED",
        amount: amountCLP,
        currency: "CLP",
        errorMessage: errorMsg,
        responseRaw: data
      }
    });
    return res.status(400).json({
      success: false,
      error: errorMsg,
      details: {
        mpStatus: data.status,
        mpDetail: data.status_detail,
        raw: data
      }
    });
  } catch (error) {
    console.error("MP Process error:", error);
    try {
      await prisma.paymentLog.create({
        data: {
          workspaceId: req.user?.workspaceId || null,
          userId: req.user?.id || null,
          provider: "MERCADOPAGO",
          planType: req.body?.planType || "UNKNOWN",
          status: "ERROR",
          amount: req.body?.planType === "PRO" ? 28e3 : 76e3,
          currency: "CLP",
          errorMessage: error.message || "Internal server error",
          responseRaw: { stack: error.stack, message: error.message }
        }
      });
    } catch (logErr) {
      console.error("Failed to log payment error:", logErr);
    }
    res.status(500).json({ error: "Falla interna procesando suscripci\xF3n" });
  }
});
router16.post("/create-mp-preference", authenticate, async (req, res) => {
  try {
    const { planType } = req.body;
    const plan = PLANS[planType];
    if (!plan || !mpConfig) {
      return res.status(400).json({ error: "Plan inv\xE1lido o MercadoPago no configurado" });
    }
    const workspaceId = req.user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace requerido" });
    }
    const amountCLP = planType === "PRO" ? 28e3 : 76e3;
    const preference = new import_mercadopago.Preference(mpConfig);
    const isLocalhost = process.env.BACKEND_URL?.includes("localhost") || process.env.BACKEND_URL?.includes("127.0.0.1");
    const preferenceBody = {
      items: [{
        id: planType,
        title: plan.name,
        quantity: 1,
        unit_price: amountCLP,
        currency_id: "CLP"
      }],
      back_urls: {
        success: `${process.env.FRONTEND_URL}/dashboard/settings?status=success`,
        failure: `${process.env.FRONTEND_URL}/onboarding/plans?status=failure`,
        pending: `${process.env.FRONTEND_URL}/dashboard/settings?status=pending`
      },
      external_reference: workspaceId,
      metadata: {
        site_id: "MLC",
        workspace_id: workspaceId,
        plan_type: planType
      }
    };
    if (!isLocalhost) {
      preferenceBody.auto_return = "approved";
      preferenceBody.notification_url = `${process.env.BACKEND_URL}/api/payments/webhook-mp`;
    }
    const result = await preference.create({ body: preferenceBody });
    return res.json({ preferenceId: result.id });
  } catch (error) {
    console.error("Create MP Preference error:", error?.message || error);
    res.status(500).json({ error: "Error al crear preferencia de MercadoPago" });
  }
});
router16.post("/webhook-mp", async (req, res) => {
  try {
    const { type, data } = req.body;
    console.log("[MP Webhook] Received:", { type, data });
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      console.error("[MP Webhook] No access token configured");
      return res.status(200).send("OK");
    }
    if (type === "payment") {
      const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
      });
      const payment = await paymentResp.json();
      console.log("[MP Webhook] Payment details:", {
        id: payment.id,
        status: payment.status,
        status_detail: payment.status_detail,
        external_reference: payment.external_reference
      });
      const workspaceId = payment.external_reference || payment.metadata?.workspace_id;
      const planType = payment.metadata?.plan_type;
      if (workspaceId && payment.status === "approved") {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            ...planType && { plan: planType },
            subscriptionStatus: "ACTIVE",
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
            cancelAtPeriodEnd: false,
            paymentProvider: "MERCADOPAGO"
          }
        });
      }
      await prisma.paymentLog.create({
        data: {
          workspaceId: workspaceId || null,
          provider: "MERCADOPAGO",
          planType: planType || "UNKNOWN",
          status: payment.status === "approved" ? "SUCCESS" : payment.status?.toUpperCase() || "UNKNOWN",
          amount: payment.transaction_amount || 0,
          currency: payment.currency_id || "CLP",
          externalId: String(payment.id),
          responseRaw: payment
        }
      });
    }
    if (type === "preapproval") {
      const preapprovalResp = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
        headers: { "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
      });
      const preapproval = await preapprovalResp.json();
      console.log("[MP Webhook] Preapproval details:", {
        id: preapproval.id,
        status: preapproval.status,
        external_reference: preapproval.external_reference
      });
      const workspaceId = preapproval.external_reference;
      if (workspaceId) {
        if (preapproval.status === "authorized" || preapproval.status === "active") {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              subscriptionStatus: "ACTIVE",
              subscriptionId: preapproval.id,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
              cancelAtPeriodEnd: false,
              paymentProvider: "MERCADOPAGO"
            }
          });
        } else if (preapproval.status === "cancelled" || preapproval.status === "paused") {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              subscriptionStatus: preapproval.status === "cancelled" ? "CANCELED" : "PAST_DUE"
            }
          });
        }
      }
      await prisma.paymentLog.create({
        data: {
          workspaceId: workspaceId || null,
          provider: "MERCADOPAGO",
          planType: "SUBSCRIPTION",
          status: preapproval.status?.toUpperCase() || "UNKNOWN",
          amount: preapproval.auto_recurring?.transaction_amount || 0,
          currency: preapproval.auto_recurring?.currency_id || "CLP",
          externalId: preapproval.id,
          responseRaw: preapproval
        }
      });
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("[MP Webhook] Error:", error);
    res.status(200).send("OK");
  }
});
router16.post("/create-subscription", authenticate, async (req, res) => {
  try {
    const { planType, provider: provider3 } = req.body;
    const userId = req.user.id;
    const workspaceId = req.user.workspaceId;
    const plan = PLANS[planType];
    if (!plan) {
      return res.status(400).json({ error: "Plan inv\xE1lido" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace requerido" });
    }
    if (provider3 === "MERCADOPAGO") {
      const isMPMock = !process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN === "...";
      if (isMPMock || !mpConfig) {
        console.log(`[Payments] Simulated MercadoPago (Chile) Checkout for workspace ${workspaceId}`);
        return res.json({
          url: `${process.env.FRONTEND_URL}/dashboard/settings?status=success&demo=true&plan=${planType}`,
          message: "Modo Demo: Redirigiendo a \xE9xito simulado (Chile CLP)"
        });
      }
      const preference = new import_mercadopago.Preference(mpConfig);
      const isLocal = process.env.BACKEND_URL?.includes("localhost") || process.env.BACKEND_URL?.includes("127.0.0.1");
      const prefBody = {
        items: [{
          id: planType,
          title: plan.name,
          quantity: 1,
          unit_price: plan.price,
          currency_id: "CLP"
        }],
        back_urls: {
          success: `${process.env.FRONTEND_URL}/dashboard/settings?status=success`,
          failure: `${process.env.FRONTEND_URL}/onboarding/plans?status=failure`,
          pending: `${process.env.FRONTEND_URL}/dashboard/settings?status=pending`
        },
        external_reference: workspaceId,
        metadata: {
          site_id: "MLC",
          workspace_id: workspaceId
        }
      };
      if (!isLocal) {
        prefBody.auto_return = "approved";
        prefBody.notification_url = `${process.env.BACKEND_URL}/api/payments/webhook-mp`;
      }
      const result = await preference.create({ body: prefBody });
      return res.json({ url: result.init_point });
    }
    if (provider3 === "PAYPAL") {
      const isPayPalMock = !process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === "..." || !process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET === "...";
      if (isPayPalMock) {
        console.log(`[Payments] Simulated PayPal Checkout for workspace ${workspaceId}`);
        return res.json({
          url: `${process.env.FRONTEND_URL}/dashboard/settings?status=success&demo=true&plan=${planType}`,
          message: "Modo Demo: Redirigiendo a \xE9xito simulado"
        });
      }
      if (!plan.paypal_plan_id) {
        return res.status(400).json({
          error: "PayPal Plan ID no configurado. Ejecuta: npx tsx src/scripts/setup-paypal-plans.ts"
        });
      }
      try {
        const accessToken = await getPayPalAccessToken();
        const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": `sub_${workspaceId}_${planType}_${Date.now()}`
          },
          body: JSON.stringify({
            plan_id: plan.paypal_plan_id,
            custom_id: `${workspaceId}|${userId}`,
            // workspaceId|userId for webhook & logging
            application_context: {
              brand_name: "Metria Metrics",
              locale: "es-CL",
              shipping_preference: "NO_SHIPPING",
              user_action: "SUBSCRIBE_NOW",
              return_url: `${process.env.FRONTEND_URL}/dashboard/settings?paypal_return=true&plan=${planType}`,
              cancel_url: `${process.env.FRONTEND_URL}/onboarding/plans?status=cancelled`
            }
          })
        });
        const data = await response.json();
        if (data.name === "UNPROCESSABLE_ENTITY" || data.name === "INVALID_REQUEST") {
          console.error("[PayPal] Subscription creation error:", data);
          throw new Error(data.details?.[0]?.description || data.message || "Error en la petici\xF3n a PayPal");
        }
        const approvalUrl = data.links?.find((l) => l.rel === "approve")?.href;
        if (!approvalUrl) throw new Error("No se encontr\xF3 URL de aprobaci\xF3n en PayPal");
        console.log(`[PayPal] Subscription created: ${data.id} for user ${userId}`);
        return res.json({ url: approvalUrl, subscriptionId: data.id });
      } catch (ppError) {
        console.error("[PayPal Error]", ppError);
        return res.status(400).json({
          error: "Error al conectar con PayPal. Verifica tus credenciales y Plan IDs.",
          details: ppError.message
        });
      }
    }
    return res.status(400).json({ error: "Proveedor de pago no soportado" });
  } catch (error) {
    console.error("Payment error:", error);
    res.status(500).json({ error: "Error al procesar el pago", details: error.message });
  }
});
router16.post("/activate-paypal-subscription", authenticate, async (req, res) => {
  try {
    const { subscriptionId, planType } = req.body;
    const userId = req.user.id;
    if (!subscriptionId || !planType) {
      return res.status(400).json({ error: "subscriptionId y planType son requeridos" });
    }
    const plan = PLANS[planType];
    if (!plan) {
      return res.status(400).json({ error: "Plan inv\xE1lido" });
    }
    const accessToken = await getPayPalAccessToken();
    const verifyResp = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const subscription = await verifyResp.json();
    console.log("[PayPal] Subscription verification:", {
      id: subscription.id,
      status: subscription.status,
      custom_id: subscription.custom_id
    });
    if (subscription.status !== "ACTIVE" && subscription.status !== "APPROVED") {
      return res.status(400).json({
        error: "La suscripci\xF3n de PayPal no est\xE1 activa",
        paypalStatus: subscription.status
      });
    }
    const workspaceId = req.user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace requerido" });
    }
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: planType,
        subscriptionStatus: "ACTIVE",
        subscriptionId: subscription.id,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
        paymentProvider: "PAYPAL",
        cancelAtPeriodEnd: false
      }
    });
    await prisma.paymentLog.create({
      data: {
        workspaceId,
        userId,
        provider: "PAYPAL",
        planType,
        status: "SUCCESS",
        amount: plan.price,
        currency: "USD",
        externalId: subscription.id,
        responseRaw: subscription
      }
    });
    console.log(`[PayPal] Subscription activated for workspace ${workspaceId}`);
    return res.json({ success: true, subscriptionId: subscription.id });
  } catch (error) {
    console.error("[PayPal Activation Error]", error);
    res.status(500).json({ error: "Error activando suscripci\xF3n PayPal", details: error.message });
  }
});
router16.post("/webhook", async (req, res) => {
  try {
    const { event_type, resource } = req.body;
    console.log("[PayPal Webhook] Received:", { event_type, resourceId: resource?.id });
    if (!event_type || !resource) {
      return res.status(200).send("OK");
    }
    const subscriptionId = resource.id;
    const customId = resource.custom_id || "";
    const [customWorkspaceId, customUserId] = customId.split("|");
    const workspace = await prisma.workspace.findFirst({
      where: { OR: [
        { subscriptionId },
        ...customWorkspaceId ? [{ id: customWorkspaceId }] : []
      ] }
    });
    const workspaceId = workspace?.id || null;
    switch (event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        if (workspaceId) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              subscriptionStatus: "ACTIVE",
              cancelAtPeriodEnd: false,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
            }
          });
        }
        break;
      }
      case "BILLING.SUBSCRIPTION.CANCELLED": {
        if (workspaceId) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: { subscriptionStatus: "CANCELED" }
          });
        }
        break;
      }
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        if (workspaceId) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: { subscriptionStatus: "PAST_DUE" }
          });
        }
        break;
      }
      case "PAYMENT.SALE.COMPLETED": {
        if (workspaceId) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              subscriptionStatus: "ACTIVE",
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3)
            }
          });
        }
        break;
      }
    }
    await prisma.paymentLog.create({
      data: {
        workspaceId,
        userId: customUserId || null,
        provider: "PAYPAL",
        planType: workspace?.plan || "UNKNOWN",
        status: event_type,
        amount: resource.amount?.total ? parseFloat(resource.amount.total) : 0,
        currency: resource.amount?.currency || "USD",
        externalId: subscriptionId,
        responseRaw: req.body
      }
    });
    res.status(200).send("OK");
  } catch (error) {
    console.error("[PayPal Webhook] Error:", error);
    res.status(200).send("OK");
  }
});
router16.post("/cancel-subscription", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace not found" });
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });
    if (!workspace || !workspace.subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }
    const { paymentProvider, subscriptionId } = workspace;
    let providerCancelled = false;
    let providerError = null;
    if (paymentProvider === "MERCADOPAGO" && subscriptionId) {
      try {
        const mpResp = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ status: "cancelled" })
        });
        const mpData = await mpResp.json();
        providerCancelled = mpData.status === "cancelled" || mpResp.ok;
        console.log("[MP Cancel]", { status: mpData.status, id: subscriptionId });
        if (!providerCancelled) {
          providerError = `MercadoPago: ${mpData.message || "Unknown error"}`;
          console.error("[MP Cancel Error]", mpData);
        }
      } catch (err) {
        providerError = `MercadoPago API error: ${err.message}`;
        console.error("[MP Cancel Exception]", err);
      }
    }
    if (paymentProvider === "PAYPAL" && subscriptionId) {
      try {
        const accessToken = await getPayPalAccessToken();
        const ppResp = await fetch(`${process.env.PAYPAL_API_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ reason: "Cancelaci\xF3n solicitada desde el dashboard de Metria" })
        });
        providerCancelled = ppResp.status === 204 || ppResp.ok;
        console.log("[PayPal Cancel]", { status: ppResp.status, id: subscriptionId });
        if (!providerCancelled) {
          const ppData = await ppResp.json().catch(() => ({}));
          providerError = `PayPal: ${ppData.message || `HTTP ${ppResp.status}`}`;
          console.error("[PayPal Cancel Error]", ppData);
        }
      } catch (err) {
        providerError = `PayPal API error: ${err.message}`;
        console.error("[PayPal Cancel Exception]", err);
      }
    }
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        cancelAtPeriodEnd: true
      }
    });
    await prisma.paymentLog.create({
      data: {
        workspaceId,
        userId: req.user.id,
        provider: paymentProvider || "UNKNOWN",
        planType: workspace.plan,
        status: providerCancelled ? "CANCELLED" : "CANCEL_PENDING",
        amount: 0,
        currency: paymentProvider === "PAYPAL" ? "USD" : "CLP",
        externalId: subscriptionId,
        errorMessage: providerError,
        responseRaw: { providerCancelled, providerError }
      }
    });
    if (providerError) {
      console.warn(`[Cancel] Provider call failed but DB updated: ${providerError}`);
    }
    res.json({
      message: "Tu suscripci\xF3n ser\xE1 cancelada al finalizar el periodo facturado.",
      providerCancelled,
      ...providerError && { warning: "La cancelaci\xF3n con el proveedor tuvo un problema. Contacta soporte si el cobro persiste." }
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router16.get("/billing-info", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    if (!workspaceId) return res.status(404).json({ error: "Workspace not found" });
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        paymentProvider: true
      }
    });
    res.json(workspace);
  } catch (error) {
    console.error("Get billing info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router16.post("/confirm-demo-payment", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { planType } = req.body;
    if (!workspaceId || !planType) return res.status(400).json({ error: "Missing data" });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: planType,
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
        // +30 days
        cancelAtPeriodEnd: false
      }
    });
    res.json({ message: "Demo payment confirmed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm demo payment" });
  }
});
var payments_default = router16;

// src/modules/messaging/messaging.routes.ts
var import_express17 = require("express");

// src/middleware/planGate.ts
var PLAN_GATE_ALLOWLIST = (process.env.PLAN_GATE_ALLOWLIST ?? "cmoralesv.fb@gmail.com,admin@metria.com,superadmin@metria.ai").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
function requirePlan(...plans) {
  return (req, res, next) => {
    const workspace = req.workspace;
    const userEmail = req.user?.email;
    if (userEmail && PLAN_GATE_ALLOWLIST.includes(String(userEmail).toLowerCase()) || req.user?.role === "SUPER_ADMIN" || req.user?.role === "ADMIN") {
      return next();
    }
    if (!workspace || !plans.includes(workspace.plan)) {
      res.status(403).json({
        code: "PLAN_UPGRADE_REQUIRED",
        requiredPlans: plans,
        error: "Your current plan does not support this feature. Please upgrade."
      });
      return;
    }
    next();
  };
}

// src/modules/messaging/messaging.controller.ts
init_prisma();
init_telegram_service();

// src/modules/messaging/channel.service.ts
init_prisma();
async function getChannels(workspaceId) {
  return prisma.channel.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
}
async function upsertChannelConfig(workspaceId, data) {
  return prisma.channel.upsert({
    where: {
      workspaceId_platform: {
        workspaceId,
        platform: data.platform
      }
    },
    update: {
      name: data.name,
      config: data.config,
      status: data.status || "CONNECTED"
    },
    create: {
      workspaceId,
      platform: data.platform,
      name: data.name,
      config: data.config,
      status: data.status || "CONNECTED"
    }
  });
}

// src/modules/messaging/messaging.controller.ts
init_inbox_service();
init_whatsapp_service();
init_instagram_service();
init_messenger_service();
init_WhatsAppManager();
async function telegramWebhook(req, res) {
  try {
    const { workspaceId } = req.params;
    const channel = await prisma.channel.findFirst({
      where: { workspaceId, platform: "TELEGRAM", status: "CONNECTED" }
    });
    if (!channel) {
      res.sendStatus(404);
      return;
    }
    const config = channel.config;
    await handleTelegramUpdate(workspaceId, channel.id, config.botToken, req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("[Telegram webhook error]", err);
    if (!res.headersSent) res.sendStatus(200);
  }
}
async function getConversationsHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { status, channelId, search, cursor } = req.query;
    const convs = await getConversations(workspaceId, { status, channelId, search, cursor });
    res.json(convs);
  } catch {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
}
async function getMessagesHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    const { cursor } = req.query;
    const msgs = await getMessages(workspaceId, conversationId, cursor);
    res.json(msgs);
  } catch {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
}
async function sendMessageHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { content, isInternal } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    await sendMessage(workspaceId, conversationId, userId, content.trim(), isInternal === true);
    res.status(201).json({ ok: true });
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
var VALID_STATUSES = ["OPEN", "PENDING", "CLOSED"];
async function changeStatusHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: "status must be one of OPEN, PENDING, CLOSED" });
      return;
    }
    const conversation = await changeConversationStatus(workspaceId, conversationId, status);
    res.json(conversation);
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
async function assignConversationHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    const { userId } = req.body;
    if (userId !== null && typeof userId !== "string") {
      res.status(400).json({ error: "userId must be a string or null" });
      return;
    }
    const conversation = await assignConversation(workspaceId, conversationId, userId);
    res.json(conversation);
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : err.message === "User does not belong to this workspace" ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}
async function getChannelsHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const channels = await getChannels(workspaceId);
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch channels" });
  }
}
async function upsertChannelConfigHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { platform } = req.params;
    const { name, config, status } = req.body;
    if (!platform || !name || !config) {
      res.status(400).json({ error: "platform, name and config are required" });
      return;
    }
    const channel = await upsertChannelConfig(workspaceId, {
      platform,
      name,
      config,
      status
    });
    res.status(200).json(channel);
  } catch (err) {
    res.status(500).json({ error: "Failed to upsert channel config" });
  }
}
async function handoverToHumanHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    await prisma.conversation.update({
      where: { id: conversationId, workspaceId },
      data: { isHandledByBot: false }
    });
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { channelId: true } });
    if (conv) {
      await trackAiMetric(workspaceId, conv.channelId, "humanHandoffCount");
    }
    await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        content: "El agente humano tom\xF3 el control de la conversaci\xF3n.",
        isInternal: true
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function handbackToBotHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    await prisma.conversation.update({
      where: { id: conversationId, workspaceId },
      data: { isHandledByBot: true }
    });
    await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        content: "La IA retom\xF3 el control de la conversaci\xF3n.",
        isInternal: true
      }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function markAsReadHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    const result = await markConversationAsRead(workspaceId, conversationId);
    res.json(result);
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
async function markAsUnreadHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { conversationId } = req.params;
    await markConversationAsUnread(workspaceId, conversationId);
    res.json({ ok: true });
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
async function initWhatsAppSessionHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const manager = WhatsAppSessionManager.getInstance();
    await manager.initSession(workspaceId);
    res.json({ ok: true, message: "WhatsApp session initialization started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function disconnectWhatsAppSessionHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const manager = WhatsAppSessionManager.getInstance();
    await manager.destroySession(workspaceId);
    res.json({ ok: true, message: "WhatsApp session disconnected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// src/modules/messaging/webhook.gateway.ts
init_prisma();
init_whatsapp_service();
init_instagram_service();
init_messenger_service();
var PLATFORM_MAP = {
  WHATSAPP: { verify: verifyWhatsAppSignature, parse: parseWhatsAppUpdate },
  INSTAGRAM: { verify: verifyInstagramSignature, parse: parseInstagramUpdate },
  MESSENGER: { verify: verifyMessengerSignature, parse: parseMessengerUpdate }
};
async function metaWebhookVerify(req, res) {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  const { workspaceId, platform } = req.params;
  const p = platform.toUpperCase();
  if (mode !== "subscribe" || !PLATFORM_MAP[p]) {
    res.status(400).send("Bad request");
    return;
  }
  const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: p, status: "CONNECTED" } });
  const config = channel?.config;
  if (!channel || token !== config?.verifyToken) {
    res.status(403).send("Forbidden");
    return;
  }
  res.status(200).send(challenge);
}
async function metaWebhook(req, res) {
  const { workspaceId, platform } = req.params;
  const p = platform.toUpperCase();
  const handler = PLATFORM_MAP[p];
  if (!handler) {
    res.status(404).send("Platform not supported");
    return;
  }
  try {
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error(`[webhook.gateway] Missing raw body for platform ${p}, workspaceId ${workspaceId}`);
      res.status(400).json({ error: "Missing raw body" });
      return;
    }
    const signature = req.headers["x-hub-signature-256"] ?? "";
    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: p, status: "CONNECTED" } });
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    const config = channel.config;
    if (!config.appSecret) {
      console.error(`[webhook.gateway] Missing appSecret for platform ${p}, workspaceId ${workspaceId}`);
      res.status(400).json({ error: "Webhook not configured" });
      return;
    }
    if (!handler.verify(rawBody, signature, config.appSecret)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    res.status(200).json({ ok: true });
    handler.parse(workspaceId, channel.id, req.body).catch((err) => console.error(`[${p} webhook error]`, err));
  } catch (err) {
    console.error(`[Meta webhook error for ${p}]`, err);
    if (!res.headersSent) res.status(500).json({ error: "Internal error" });
  }
}

// src/modules/messaging/messaging.routes.ts
var router17 = (0, import_express17.Router)();
router17.post("/webhooks/telegram/:workspaceId", telegramWebhook);
router17.get("/webhooks/meta/:platform/:workspaceId", metaWebhookVerify);
router17.post("/webhooks/meta/:platform/:workspaceId", metaWebhook);
router17.get("/messaging/channels", authenticate, requirePlan("PRO", "SCALE"), getChannelsHandler);
router17.post("/messaging/channels/:platform/config", authenticate, requirePlan("PRO", "SCALE"), upsertChannelConfigHandler);
router17.get("/messaging/conversations", authenticate, requirePlan("PRO", "SCALE"), getConversationsHandler);
router17.get("/messaging/conversations/:conversationId/messages", authenticate, requirePlan("PRO", "SCALE"), getMessagesHandler);
router17.post("/messaging/conversations/:conversationId/messages", authenticate, requirePlan("PRO", "SCALE"), sendMessageHandler);
router17.post("/messaging/conversations/:conversationId/handover", authenticate, requirePlan("PRO", "SCALE"), handoverToHumanHandler);
router17.post("/messaging/conversations/:conversationId/handback", authenticate, requirePlan("PRO", "SCALE"), handbackToBotHandler);
router17.patch("/messaging/conversations/:conversationId/status", authenticate, requirePlan("PRO", "SCALE"), changeStatusHandler);
router17.patch("/messaging/conversations/:conversationId/assign", authenticate, requirePlan("PRO", "SCALE"), assignConversationHandler);
router17.patch("/messaging/conversations/:conversationId/read", authenticate, requirePlan("PRO", "SCALE"), markAsReadHandler);
router17.patch("/messaging/conversations/:conversationId/unread", authenticate, requirePlan("PRO", "SCALE"), markAsUnreadHandler);
router17.post("/messaging/whatsapp/init", authenticate, requirePlan("PRO", "SCALE"), initWhatsAppSessionHandler);
router17.post("/messaging/whatsapp/disconnect", authenticate, requirePlan("PRO", "SCALE"), disconnectWhatsAppSessionHandler);
var messaging_routes_default = router17;

// src/modules/messaging/quickReplies.routes.ts
var import_express18 = require("express");

// src/modules/messaging/quickReplies.service.ts
init_prisma();
async function listQuickReplies(workspaceId) {
  return prisma.quickReply.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
}
async function createQuickReply(workspaceId, input) {
  return prisma.quickReply.create({
    data: {
      workspaceId,
      title: input.title,
      content: input.content,
      shortcut: input.shortcut?.trim() || null
    }
  });
}
async function updateQuickReply(workspaceId, id, input) {
  const existing = await prisma.quickReply.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Quick reply not found");
  return prisma.quickReply.update({
    where: { id },
    data: {
      ...input.title !== void 0 && { title: input.title },
      ...input.content !== void 0 && { content: input.content },
      ...input.shortcut !== void 0 && { shortcut: input.shortcut?.trim() || null }
    }
  });
}
async function deleteQuickReply(workspaceId, id) {
  const existing = await prisma.quickReply.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Quick reply not found");
  await prisma.quickReply.delete({ where: { id } });
}

// src/modules/messaging/quickReplies.routes.ts
var router18 = (0, import_express18.Router)();
var auth = [authenticate, requirePlan("PRO", "SCALE")];
router18.get("/messaging/quick-replies", ...auth, async (req, res) => {
  try {
    res.json(await listQuickReplies(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router18.post("/messaging/quick-replies", ...auth, async (req, res) => {
  try {
    const { title, content, shortcut } = req.body;
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: "title and content are required" });
      return;
    }
    const qr = await createQuickReply(req.user.workspaceId, { title: title.trim(), content, shortcut });
    res.status(201).json(qr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router18.patch("/messaging/quick-replies/:id", ...auth, async (req, res) => {
  try {
    res.json(await updateQuickReply(req.user.workspaceId, req.params.id, req.body));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router18.delete("/messaging/quick-replies/:id", ...auth, async (req, res) => {
  try {
    await deleteQuickReply(req.user.workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
var quickReplies_routes_default = router18;

// src/modules/crm/crm.routes.ts
var import_express19 = require("express");
init_prisma();

// src/modules/crm/crm.controller.ts
init_contact_service();
init_pipeline_service();
init_ticket_service();
init_prisma();
function notFoundStatus(msg) {
  return msg.toLowerCase().includes("not found") ? 404 : 500;
}
async function listContactsHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { search, status, leadTemperature, leadType, cursor, limit } = req.query;
    res.json(await listContacts(workspaceId, { search, status, leadTemperature, leadType, cursor, limit: limit ? parseInt(limit, 10) : void 0 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function getContactHandler(req, res) {
  try {
    res.json(await getContact(req.user.workspaceId, req.params.contactId));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function createContactHandler(req, res) {
  try {
    const { name, email, phone, status } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await createContact(req.user.workspaceId, { name, email, phone, status }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function updateContactHandler(req, res) {
  try {
    const { name, email, phone, status, temperature, contactType, ltv, shopifyCustomerId } = req.body;
    res.json(await updateContact(req.user.workspaceId, req.params.contactId, {
      name,
      email,
      phone,
      status,
      temperature,
      contactType,
      ltv,
      shopifyCustomerId
    }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function addNoteHandler(req, res) {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    res.status(201).json(await addNote(req.user.workspaceId, req.params.contactId, req.user.id, content.trim()));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function addTagHandler(req, res) {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await addTag(req.user.workspaceId, req.params.contactId, name.trim(), color));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function removeTagHandler(req, res) {
  try {
    await removeTag(req.user.workspaceId, req.params.contactId, req.params.tagId);
    res.status(204).send();
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function calculateHealthScoreHandler(req, res) {
  try {
    res.json(await calculateHealthScore(req.user.workspaceId, req.params.contactId));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function bulkUpdateContactsHandler(req, res) {
  try {
    const { ids, status, tags } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array is required" });
      return;
    }
    const updated = await bulkUpdateContacts(req.user.workspaceId, ids, { status, tags });
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function bulkDeleteContactsHandler(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids array is required" });
      return;
    }
    const deleted = await bulkDeleteContacts(req.user.workspaceId, ids);
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function listPipelinesHandler(req, res) {
  try {
    res.json(await listPipelines(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function createPipelineHandler(req, res) {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await createPipeline(req.user.workspaceId, name.trim()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function listDealsHandler(req, res) {
  try {
    const { pipelineId } = req.query;
    res.json(await listDeals(req.user.workspaceId, pipelineId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function createDealHandler(req, res) {
  try {
    const { contactId, pipelineId, stageId, title, value, probability, expectedCloseAt } = req.body;
    if (!contactId || !pipelineId || !stageId || !title?.trim()) {
      res.status(400).json({ error: "contactId, pipelineId, stageId, title are required" });
      return;
    }
    res.status(201).json(await createDeal(req.user.workspaceId, { contactId, pipelineId, stageId, title: title.trim(), value, probability, expectedCloseAt }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function moveDealHandler(req, res) {
  try {
    const { stageId } = req.body;
    if (!stageId) {
      res.status(400).json({ error: "stageId is required" });
      return;
    }
    res.json(await moveDeal(req.user.workspaceId, req.params.dealId, stageId));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function closeDealHandler(req, res) {
  try {
    const { outcome, lostReason } = req.body;
    if (outcome !== "WON" && outcome !== "LOST") {
      res.status(400).json({ error: "outcome must be WON or LOST" });
      return;
    }
    res.json(await closeDeal(req.user.workspaceId, req.params.dealId, outcome, lostReason));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function updateDealHandler(req, res) {
  try {
    const { title, value, probability, expectedCloseAt, assignedToUserId } = req.body;
    res.json(await updateDeal(req.user.workspaceId, req.params.dealId, { title, value, probability, expectedCloseAt, assignedToUserId }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function deleteDealHandler(req, res) {
  try {
    await deleteDeal(req.user.workspaceId, req.params.dealId);
    res.status(204).send();
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function getWorkspaceUsersHandler(req, res) {
  try {
    const users = await prisma.user.findMany({
      where: { workspaceId: req.user.workspaceId },
      select: { id: true, name: true, email: true }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function pipelineAnalyticsHandler(req, res) {
  try {
    res.json(await getPipelineAnalytics(req.user.workspaceId, req.params.pipelineId));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function createStageHandler(req, res) {
  try {
    const { name, color, order } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await createStage(req.user.workspaceId, req.params.pipelineId, { name: name.trim(), color, order }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function updateStageHandler(req, res) {
  try {
    const { name, color } = req.body;
    res.json(await updateStage(req.user.workspaceId, req.params.pipelineId, req.params.stageId, { name, color }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function deleteStageHandler(req, res) {
  try {
    await deleteStage(req.user.workspaceId, req.params.pipelineId, req.params.stageId);
    res.status(204).send();
  } catch (err) {
    if (err.code === "STAGE_HAS_DEALS") {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function reorderStagesHandler(req, res) {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({ error: "orderedIds array is required" });
      return;
    }
    await reorderStages(req.user.workspaceId, req.params.pipelineId, orderedIds);
    res.status(204).send();
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function listTicketsHandler(req, res) {
  try {
    const { status, priority, contactId, cursor, limit } = req.query;
    res.json(await listTickets(req.user.workspaceId, { status, priority, contactId, cursor, limit: limit ? parseInt(limit, 10) : void 0 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function createTicketHandler(req, res) {
  try {
    const { contactId, title, description, priority, orderId, conversationId, assignedToUserId } = req.body;
    if (!contactId || !title?.trim()) {
      res.status(400).json({ error: "contactId and title are required" });
      return;
    }
    res.status(201).json(await createTicket(req.user.workspaceId, { contactId, title: title.trim(), description, priority, orderId, conversationId, assignedToUserId }));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function updateTicketHandler(req, res) {
  try {
    res.json(await updateTicket(req.user.workspaceId, req.params.ticketId, req.body));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function resolveTicketHandler(req, res) {
  try {
    res.json(await resolveTicket(req.user.workspaceId, req.params.ticketId));
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}
async function listTasksHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const filter = req.query.filter ?? "all";
    const now = /* @__PURE__ */ new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1e3);
    const dateFilter = filter === "today" ? { dueAt: { gte: startOfToday, lt: startOfTomorrow } } : filter === "overdue" ? { dueAt: { lt: startOfToday } } : filter === "upcoming" ? { dueAt: { gte: startOfTomorrow } } : {};
    const tasks = await prisma.contactTask.findMany({
      where: {
        workspaceId,
        completedAt: null,
        ...dateFilter
      },
      include: {
        contact: { select: { id: true, name: true } }
      },
      orderBy: [
        { dueAt: { sort: "asc", nulls: "last" } },
        { priority: "desc" }
      ]
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function completeTaskHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { taskId } = req.params;
    const task = await prisma.contactTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const updated = await prisma.contactTask.update({
      where: { id: taskId },
      data: { completedAt: /* @__PURE__ */ new Date() },
      include: { contact: { select: { id: true, name: true } } }
    });
    res.json(updated);
  } catch (err) {
    res.status(notFoundStatus(err.message)).json({ error: err.message });
  }
}

// src/modules/crm/crm.routes.ts
var router19 = (0, import_express19.Router)();
var auth2 = [authenticate, requirePlan("PRO", "SCALE")];
router19.get("/crm/contacts", ...auth2, listContactsHandler);
router19.post("/crm/contacts", ...auth2, createContactHandler);
router19.post("/crm/contacts/bulk-update", ...auth2, bulkUpdateContactsHandler);
router19.post("/crm/contacts/bulk-delete", ...auth2, bulkDeleteContactsHandler);
router19.get("/crm/contacts/:contactId", ...auth2, getContactHandler);
router19.patch("/crm/contacts/:contactId", ...auth2, updateContactHandler);
router19.post("/crm/contacts/:contactId/notes", ...auth2, addNoteHandler);
router19.post("/crm/contacts/:contactId/tags", ...auth2, addTagHandler);
router19.delete("/crm/contacts/:contactId/tags/:tagId", ...auth2, removeTagHandler);
router19.post("/crm/contacts/:contactId/health-score", ...auth2, calculateHealthScoreHandler);
router19.get("/crm/pipelines", ...auth2, listPipelinesHandler);
router19.post("/crm/pipelines", ...auth2, createPipelineHandler);
router19.get("/crm/pipelines/:pipelineId/analytics", ...auth2, pipelineAnalyticsHandler);
router19.get("/crm/pipelines/:pipelineId/roi-summary", ...auth2, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { pipelineId } = req.params;
    const deals = await prisma.deal.findMany({
      where: { pipelineId, workspaceId },
      include: { contact: { select: { id: true, email: true } } }
    });
    const since = /* @__PURE__ */ new Date();
    since.setDate(since.getDate() - 30);
    const metrics = await prisma.dailyMetric.findMany({
      where: { workspaceId, date: { gte: since } },
      select: { totalRevenue: true, metaAdSpend: true, googleAdSpend: true }
    });
    const totalRevenue30d = metrics.reduce((s, m) => s + Number(m.totalRevenue), 0);
    const totalAdSpend30d = metrics.reduce((s, m) => s + Number(m.metaAdSpend) + Number(m.googleAdSpend), 0);
    const workspaceROAS = totalAdSpend30d > 0 ? totalRevenue30d / totalAdSpend30d : 0;
    const wonDeals = deals.filter((d) => d.status === "WON" && d.contact?.email);
    const emails = wonDeals.map((d) => d.contact?.email).filter(Boolean);
    const contactRevenues = {};
    if (emails.length > 0) {
      const allOrders = await prisma.order.findMany({
        where: { workspaceId, customerEmail: { in: emails } },
        select: { customerEmail: true, totalPrice: true }
      });
      const revenueByEmail = {};
      for (const order of allOrders) {
        if (!order.customerEmail) continue;
        revenueByEmail[order.customerEmail] = (revenueByEmail[order.customerEmail] ?? 0) + Number(order.totalPrice);
      }
      for (const deal of wonDeals) {
        const email = deal.contact?.email;
        if (email && revenueByEmail[email]) {
          contactRevenues[deal.contactId] = (contactRevenues[deal.contactId] ?? 0) + revenueByEmail[email];
        }
      }
    }
    const stageStats = {};
    for (const deal of deals) {
      if (!stageStats[deal.stageId]) stageStats[deal.stageId] = { dealCount: 0, totalValue: 0 };
      stageStats[deal.stageId].dealCount++;
      stageStats[deal.stageId].totalValue += Number(deal.value);
    }
    res.json({ workspaceROAS, totalRevenue30d, totalAdSpend30d, contactRevenues, stageStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router19.post("/crm/pipelines/:pipelineId/stages/reorder", ...auth2, reorderStagesHandler);
router19.post("/crm/pipelines/:pipelineId/stages", ...auth2, createStageHandler);
router19.patch("/crm/pipelines/:pipelineId/stages/:stageId", ...auth2, updateStageHandler);
router19.delete("/crm/pipelines/:pipelineId/stages/:stageId", ...auth2, deleteStageHandler);
router19.get("/crm/workspace/users", ...auth2, getWorkspaceUsersHandler);
router19.get("/crm/deals", ...auth2, listDealsHandler);
router19.post("/crm/deals", ...auth2, createDealHandler);
router19.patch("/crm/deals/:dealId/move", ...auth2, moveDealHandler);
router19.patch("/crm/deals/:dealId/close", ...auth2, closeDealHandler);
router19.patch("/crm/deals/:dealId", ...auth2, updateDealHandler);
router19.delete("/crm/deals/:dealId", ...auth2, deleteDealHandler);
router19.get("/crm/tickets", ...auth2, listTicketsHandler);
router19.post("/crm/tickets", ...auth2, createTicketHandler);
router19.patch("/crm/tickets/:ticketId", ...auth2, updateTicketHandler);
router19.post("/crm/tickets/:ticketId/resolve", ...auth2, resolveTicketHandler);
router19.get("/crm/tasks", ...auth2, listTasksHandler);
router19.patch("/crm/tasks/:taskId/complete", ...auth2, completeTaskHandler);
var crm_routes_default = router19;

// src/modules/crm/forecast.routes.ts
var import_express20 = require("express");

// src/modules/crm/forecast.service.ts
init_prisma();
async function getPipelineForecast(workspaceId) {
  const deals = await prisma.deal.findMany({
    where: { workspaceId, status: { not: "LOST" } },
    select: {
      id: true,
      title: true,
      value: true,
      probability: true,
      expectedCloseAt: true,
      status: true,
      stage: { select: { name: true } }
    }
  });
  const byStage = {};
  let totalValue = 0;
  let weightedValue = 0;
  for (const deal of deals) {
    const v = Number(deal.value ?? 0);
    const p = (deal.probability ?? 50) / 100;
    const stageName = deal.stage?.name ?? "Sin etapa";
    if (!byStage[stageName]) byStage[stageName] = { count: 0, totalValue: 0, weightedValue: 0 };
    byStage[stageName].count++;
    byStage[stageName].totalValue += v;
    byStage[stageName].weightedValue += v * p;
    totalValue += v;
    weightedValue += v * p;
  }
  const now = /* @__PURE__ */ new Date();
  const forecast3Months = [0, 1, 2].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const label = d.toLocaleString("es-CL", { month: "short", year: "2-digit" });
    const monthDeals = deals.filter((deal) => {
      if (!deal.expectedCloseAt) return false;
      const c = new Date(deal.expectedCloseAt);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    });
    const weighted = monthDeals.reduce(
      (acc, deal) => acc + Number(deal.value ?? 0) * ((deal.probability ?? 50) / 100),
      0
    );
    return { label, weighted, count: monthDeals.length };
  });
  const topDeals = [...deals].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)).slice(0, 5).map((d) => ({
    id: d.id,
    title: d.title,
    value: Number(d.value ?? 0),
    probability: d.probability ?? 50,
    status: d.status,
    stage: d.stage?.name ?? "Sin etapa"
  }));
  return {
    totalValue,
    weightedValue,
    totalDeals: deals.length,
    byStage,
    forecast3Months,
    topDeals
  };
}

// src/modules/crm/forecast.routes.ts
var router20 = (0, import_express20.Router)();
var auth3 = [authenticate, requirePlan("PRO", "SCALE")];
router20.get("/crm/pipeline/forecast", ...auth3, async (req, res) => {
  try {
    const data = await getPipelineForecast(req.user.workspaceId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var forecast_routes_default = router20;

// src/modules/crm/timeline.routes.ts
var import_express21 = require("express");
init_contactEvents_service();

// src/modules/crm/contactTasks.service.ts
init_prisma();
init_emit();
async function listTasks(workspaceId, contactId) {
  return prisma.contactTask.findMany({
    where: { workspaceId, contactId },
    orderBy: [
      { completedAt: "asc" },
      { dueAt: "asc" },
      { createdAt: "desc" }
    ]
  });
}
async function createTask(workspaceId, contactId, input) {
  const task = await prisma.contactTask.create({
    data: {
      workspaceId,
      contactId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : void 0,
      priority: input.priority ?? "MEDIUM"
    }
  });
  await emitContactEvent(workspaceId, contactId, "TASK_CREATED", `Tarea creada: ${task.title}`, void 0, { taskId: task.id });
  return task;
}
async function updateTask(workspaceId, taskId, input) {
  const existing = await prisma.contactTask.findFirst({
    where: { id: taskId, workspaceId }
  });
  if (!existing) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }
  const updated = await prisma.contactTask.update({
    where: { id: taskId },
    data: {
      ...input.title !== void 0 && { title: input.title },
      ...input.description !== void 0 && { description: input.description },
      ...input.priority !== void 0 && { priority: input.priority },
      ...input.dueAt !== void 0 && { dueAt: input.dueAt ? new Date(input.dueAt) : null },
      ...input.completedAt !== void 0 && { completedAt: input.completedAt ? new Date(input.completedAt) : null }
    }
  });
  if (input.completedAt && !existing.completedAt) {
    await emitContactEvent(workspaceId, existing.contactId, "TASK_COMPLETED", `Tarea completada: ${updated.title}`, void 0, { taskId });
  }
  return updated;
}
async function deleteTask(workspaceId, taskId) {
  const existing = await prisma.contactTask.findFirst({
    where: { id: taskId, workspaceId }
  });
  if (!existing) {
    throw Object.assign(new Error("Task not found"), { status: 404 });
  }
  return prisma.contactTask.delete({ where: { id: taskId } });
}

// src/modules/crm/timeline.routes.ts
var router21 = (0, import_express21.Router)();
var auth4 = [authenticate, requirePlan("PRO", "SCALE")];
router21.get("/crm/contacts/:contactId/events", ...auth4, async (req, res) => {
  try {
    const data = await listContactEvents(req.user.workspaceId, req.params.contactId);
    res.json(data);
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
router21.get("/crm/contacts/:contactId/tasks", ...auth4, async (req, res) => {
  try {
    res.json(await listTasks(req.user.workspaceId, req.params.contactId));
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
router21.post("/crm/contacts/:contactId/tasks", ...auth4, async (req, res) => {
  try {
    res.status(201).json(await createTask(req.user.workspaceId, req.params.contactId, req.body));
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
router21.patch("/crm/tasks/:taskId", ...auth4, async (req, res) => {
  try {
    res.json(await updateTask(req.user.workspaceId, req.params.taskId, req.body));
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
router21.delete("/crm/tasks/:taskId", ...auth4, async (req, res) => {
  try {
    await deleteTask(req.user.workspaceId, req.params.taskId);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
var timeline_routes_default = router21;

// src/modules/crm/segments.routes.ts
var import_express22 = require("express");
init_segments_service();
var router22 = (0, import_express22.Router)();
var auth5 = [authenticate, requirePlan("PRO", "SCALE")];
router22.get("/crm/segments", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await listSegments(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router22.post("/crm/segments/preview", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { filters } = req.body;
    if (!filters || !Array.isArray(filters.filters)) {
      res.status(400).json({ error: "filters is required" });
      return;
    }
    const count = await previewSegmentCount(workspaceId, filters);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router22.post("/crm/segments", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { name, description, filters } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!filters || !Array.isArray(filters.filters)) {
      res.status(400).json({ error: "filters is required" });
      return;
    }
    const segment = await createSegment(workspaceId, { name: name.trim(), description, filters });
    res.status(201).json(segment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router22.get("/crm/segments/:id", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await getSegment(workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router22.patch("/crm/segments/:id", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await updateSegment(workspaceId, req.params.id, req.body));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router22.delete("/crm/segments/:id", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    await deleteSegment(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router22.post("/crm/segments/:id/duplicate", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const duplicate = await duplicateSegment(workspaceId, req.params.id);
    res.status(201).json(duplicate);
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router22.get("/crm/segments/:id/contacts", ...auth5, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const page = parseInt(String(req.query.page ?? "1"), 10);
    const pageSize = Math.min(parseInt(String(req.query.pageSize ?? "25"), 10), 100);
    res.json(await getSegmentContacts(workspaceId, req.params.id, page, pageSize));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
var segments_routes_default = router22;

// src/modules/crm/forms.routes.ts
var import_express23 = require("express");

// src/modules/crm/forms.service.ts
init_prisma();
init_emit();
var FIELD_TYPES = ["text", "email", "tel", "textarea", "select"];
var CONDITION_OPS = ["eq", "neq", "contains"];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var PHONE_CHARS_RE = /^[\d\s+\-()]+$/;
var MAX_FIELDS = 40;
var MAX_LABEL = 120;
var MAX_OPTION = 80;
var MAX_OPTIONS = 30;
var MAX_VALUE = 5e3;
function slugify(input) {
  const base = String(input || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return base || "formulario";
}
async function uniqueSlug(base, ignoreId) {
  let slug = base;
  let n = 1;
  while (n < 1e3) {
    const existing = await prisma.form.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}
function normalizeFields(raw) {
  if (!Array.isArray(raw)) throw new Error("fields debe ser un arreglo");
  if (raw.length === 0) throw new Error("Agrega al menos un campo al formulario");
  if (raw.length > MAX_FIELDS) throw new Error(`Un formulario admite hasta ${MAX_FIELDS} campos`);
  const seenIds = /* @__PURE__ */ new Set();
  return raw.map((f, i) => {
    const position = i + 1;
    const id = String(f?.id ?? "").trim();
    if (!id) throw new Error(`El campo #${position} no tiene id`);
    if (seenIds.has(id)) throw new Error(`Hay campos con id duplicado: ${id}`);
    seenIds.add(id);
    const label = String(f?.label ?? "").trim().slice(0, MAX_LABEL);
    if (!label) throw new Error(`El campo #${position} necesita una etiqueta`);
    const type = String(f?.type ?? "");
    if (!FIELD_TYPES.includes(type)) {
      throw new Error(`Tipo de campo inv\xE1lido en "${label}": ${type}`);
    }
    const required = Boolean(f?.required);
    let options;
    if (type === "select") {
      const rawOpts = Array.isArray(f?.options) ? f.options : [];
      const cleanOpts = rawOpts.map((o) => String(o ?? "").trim().slice(0, MAX_OPTION)).filter((o) => o.length > 0).slice(0, MAX_OPTIONS);
      if (cleanOpts.length === 0) {
        throw new Error(`El campo de selecci\xF3n "${label}" necesita al menos una opci\xF3n`);
      }
      options = cleanOpts;
    }
    const conditions = normalizeConditions(f?.conditions, label, seenIds);
    return {
      id,
      label,
      type,
      required,
      ...options ? { options } : {},
      ...conditions.length ? { conditions } : {}
    };
  });
}
function normalizeConditions(raw, label, seenIds) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`Las condiciones de "${label}" deben ser un arreglo`);
  return raw.map((c) => {
    const fieldId = String(c?.fieldId ?? "").trim();
    if (!fieldId) throw new Error(`Una condici\xF3n de "${label}" no referencia ning\xFAn campo`);
    if (!seenIds.has(fieldId)) {
      throw new Error(`La condici\xF3n de "${label}" referencia un campo inv\xE1lido: ${fieldId}`);
    }
    const op = String(c?.op ?? "");
    if (!CONDITION_OPS.includes(op)) {
      throw new Error(`Operador de condici\xF3n inv\xE1lido en "${label}": ${op}`);
    }
    const value = String(c?.value ?? "").trim().slice(0, MAX_VALUE);
    return { fieldId, op, value };
  });
}
function isFieldVisible(field, values) {
  if (!field.conditions?.length) return true;
  return field.conditions.every((cond) => {
    const actual = (values[cond.fieldId] ?? "").toLowerCase();
    const expected = cond.value.toLowerCase();
    switch (cond.op) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "contains":
        return actual.includes(expected);
      default:
        return true;
    }
  });
}
function parseFields(stored) {
  if (!Array.isArray(stored)) return [];
  return stored;
}
function toPublicForm(form) {
  return {
    slug: form.slug,
    name: form.name,
    description: form.description,
    fields: parseFields(form.fields),
    submitButtonText: form.submitButtonText,
    successMessage: form.successMessage
  };
}
async function listForms(workspaceId) {
  return prisma.form.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
}
async function getForm(workspaceId, formId) {
  const form = await prisma.form.findFirst({ where: { id: formId, workspaceId } });
  if (!form) throw new Error("Form not found");
  return form;
}
async function createForm(workspaceId, input) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("El nombre es obligatorio");
  const fields = normalizeFields(input.fields);
  const slug = await uniqueSlug(slugify(name));
  return prisma.form.create({
    data: {
      workspaceId,
      name: name.slice(0, 120),
      description: input.description?.trim()?.slice(0, 500) || null,
      fields,
      slug,
      isActive: input.isActive ?? true,
      ...input.submitButtonText?.trim() ? { submitButtonText: input.submitButtonText.trim().slice(0, 60) } : {},
      ...input.successMessage?.trim() ? { successMessage: input.successMessage.trim().slice(0, 300) } : {}
    }
  });
}
async function updateForm(workspaceId, formId, input) {
  const existing = await getForm(workspaceId, formId);
  const data = {};
  if (input.name !== void 0) {
    const name = String(input.name).trim();
    if (!name) throw new Error("El nombre es obligatorio");
    data.name = name.slice(0, 120);
    if (name !== existing.name) {
      data.slug = await uniqueSlug(slugify(name), formId);
    }
  }
  if (input.description !== void 0) {
    data.description = input.description ? String(input.description).trim().slice(0, 500) : null;
  }
  if (input.fields !== void 0) {
    data.fields = normalizeFields(input.fields);
  }
  if (input.isActive !== void 0) {
    data.isActive = Boolean(input.isActive);
  }
  if (input.submitButtonText !== void 0) {
    const t = String(input.submitButtonText).trim();
    if (t) data.submitButtonText = t.slice(0, 60);
  }
  if (input.successMessage !== void 0) {
    const t = String(input.successMessage).trim();
    if (t) data.successMessage = t.slice(0, 300);
  }
  return prisma.form.update({ where: { id: formId }, data });
}
async function deleteForm(workspaceId, formId) {
  await getForm(workspaceId, formId);
  await prisma.form.delete({ where: { id: formId } });
}
async function duplicateForm(workspaceId, formId) {
  const original = await getForm(workspaceId, formId);
  const baseSlug = `${original.slug}-copia`;
  const slug = await uniqueSlug(baseSlug);
  return prisma.form.create({
    data: {
      workspaceId,
      name: `Copia de ${original.name}`,
      description: original.description,
      fields: original.fields,
      slug,
      isActive: false,
      submitButtonText: original.submitButtonText,
      successMessage: original.successMessage
    }
  });
}
async function getPublicForm(slug) {
  const cleaned = String(slug || "").toLowerCase().trim();
  if (!cleaned) throw new Error("Form not found");
  const form = await prisma.form.findUnique({ where: { slug: cleaned } });
  if (!form || !form.isActive) throw new Error("Form not found");
  return toPublicForm(form);
}
var FormValidationError = class extends Error {
  fieldErrors;
  constructor(message, fieldErrors = {}) {
    super(message);
    this.name = "FormValidationError";
    this.fieldErrors = fieldErrors;
  }
};
function validateSubmission(fields, data) {
  const cleaned = {};
  const errors = {};
  let firstEmail;
  let firstPhone;
  let name;
  const submittedValues = {};
  for (const field of fields) {
    const rv = data?.[field.id];
    submittedValues[field.id] = rv == null ? "" : String(rv).trim();
  }
  const visibleFields = fields.filter((f) => isFieldVisible(f, submittedValues));
  for (const field of visibleFields) {
    const rawVal = data?.[field.id];
    const value = rawVal == null ? "" : String(rawVal).trim().slice(0, MAX_VALUE);
    if (!value) {
      if (field.required) errors[field.id] = `${field.label} es obligatorio`;
      continue;
    }
    switch (field.type) {
      case "email":
        if (!EMAIL_RE.test(value)) {
          errors[field.id] = `${field.label} no es un correo v\xE1lido`;
          continue;
        }
        if (!firstEmail) firstEmail = value.toLowerCase();
        break;
      case "tel":
        if (!PHONE_CHARS_RE.test(value) || value.replace(/\D/g, "").length < 6) {
          errors[field.id] = `${field.label} no es un tel\xE9fono v\xE1lido`;
          continue;
        }
        if (!firstPhone) firstPhone = value;
        break;
      case "select":
        if (field.options && !field.options.includes(value)) {
          errors[field.id] = `Selecciona una opci\xF3n v\xE1lida en ${field.label}`;
          continue;
        }
        break;
      default:
        break;
    }
    cleaned[field.id] = value;
    if (!name && /nombre|name/i.test(field.label)) name = value;
  }
  if (Object.keys(errors).length > 0) {
    throw new FormValidationError("Revisa los campos marcados", errors);
  }
  return { cleaned, firstEmail, firstPhone, name };
}
async function submitForm(slug, data) {
  const cleaned = String(slug || "").toLowerCase().trim();
  if (!cleaned) throw new Error("Form not found");
  const form = await prisma.form.findUnique({ where: { slug: cleaned } });
  if (!form || !form.isActive) throw new Error("Form not found");
  const fields = parseFields(form.fields);
  const body = data && typeof data === "object" ? data : {};
  const { cleaned: cleanData, firstEmail, firstPhone, name } = validateSubmission(fields, body);
  const orClauses = [];
  if (firstEmail) orClauses.push({ email: firstEmail });
  if (firstPhone) orClauses.push({ phone: firstPhone });
  let contact = orClauses.length > 0 ? await prisma.contact.findFirst({
    where: { workspaceId: form.workspaceId, OR: orClauses }
  }) : null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId: form.workspaceId,
        name: (name || firstEmail || firstPhone || "Lead de formulario").slice(0, 120),
        email: firstEmail ?? null,
        phone: firstPhone ?? null,
        source: "FORM",
        status: "LEAD"
      }
    });
  }
  const submission = await prisma.formSubmission.create({
    data: {
      workspaceId: form.workspaceId,
      formId: form.id,
      contactId: contact.id,
      data: cleanData
    }
  });
  await prisma.form.update({
    where: { id: form.id },
    data: { submissionCount: { increment: 1 } }
  });
  await emitContactEvent(
    form.workspaceId,
    contact.id,
    "FORM_SUBMITTED",
    `Lead capturado: ${form.name}`,
    void 0,
    { formId: form.id, submissionId: submission.id }
  );
  return { ok: true };
}

// src/modules/crm/forms.routes.ts
init_prisma();
var router23 = (0, import_express23.Router)();
var auth6 = [authenticate, requirePlan("PRO", "SCALE")];
function statusFor(err) {
  return String(err?.message ?? "").toLowerCase().includes("not found") ? 404 : 400;
}
router23.get("/crm/forms", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await listForms(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router23.post("/crm/forms", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { name, description, fields, isActive, submitButtonText, successMessage } = req.body ?? {};
    const form = await createForm(workspaceId, {
      name,
      description,
      fields,
      isActive,
      submitButtonText,
      successMessage
    });
    res.status(201).json(form);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router23.get("/crm/forms/:id", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await getForm(workspaceId, req.params.id));
  } catch (err) {
    res.status(statusFor(err)).json({ error: err.message });
  }
});
router23.patch("/crm/forms/:id", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await updateForm(workspaceId, req.params.id, req.body ?? {}));
  } catch (err) {
    res.status(statusFor(err)).json({ error: err.message });
  }
});
router23.delete("/crm/forms/:id", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    await deleteForm(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(statusFor(err)).json({ error: err.message });
  }
});
router23.post("/crm/forms/:id/duplicate", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const duplicate = await duplicateForm(workspaceId, req.params.id);
    res.status(201).json(duplicate);
  } catch (err) {
    res.status(statusFor(err)).json({ error: err.message });
  }
});
router23.get("/crm/forms/:id/submissions", ...auth6, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const form = await prisma.form.findFirst({ where: { id: req.params.id, workspaceId }, select: { id: true } });
    if (!form) {
      res.status(404).json({ error: "Formulario no encontrado" });
      return;
    }
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: req.params.id, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var forms_routes_default = router23;

// src/modules/crm/public-forms.routes.ts
var import_express24 = require("express");

// src/lib/rateLimit.ts
var windows = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of windows) {
    if (hits.length === 0 || now - hits[hits.length - 1] > 36e5) {
      windows.delete(key);
    }
  }
}, 6e5).unref();
function simpleRateLimit(windowMs, max, message) {
  return (req, res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.status(429).json({ error: message ?? "Demasiadas solicitudes. Int\xE9ntalo en un momento." });
      return;
    }
    hits.push(now);
    windows.set(key, hits);
    next();
  };
}

// src/modules/crm/public-forms.routes.ts
var router24 = (0, import_express24.Router)();
router24.get("/forms/:slug", async (req, res) => {
  try {
    const form = await getPublicForm(req.params.slug);
    res.json(form);
  } catch (err) {
    const notFound2 = String(err?.message ?? "").toLowerCase().includes("not found");
    if (notFound2) {
      res.status(404).json({ error: "Formulario no encontrado" });
    } else {
      res.status(500).json({ error: "No se pudo cargar el formulario" });
    }
  }
});
router24.post("/forms/:slug/submit", simpleRateLimit(5 * 60 * 1e3, 5), async (req, res) => {
  try {
    const result = await submitForm(req.params.slug, req.body?.data ?? req.body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof FormValidationError) {
      res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      return;
    }
    const notFound2 = String(err?.message ?? "").toLowerCase().includes("not found");
    if (notFound2) {
      res.status(404).json({ error: "Formulario no encontrado" });
    } else {
      res.status(500).json({ error: "No se pudo enviar el formulario. Int\xE9ntalo de nuevo." });
    }
  }
});
var public_forms_routes_default = router24;

// src/modules/crm/contactValue.routes.ts
var import_express25 = require("express");

// src/modules/crm/contactValue.service.ts
init_prisma();
async function getContactValue(workspaceId, contactId) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, ltv: true, email: true }
  });
  if (!contact) throw new Error("Contact not found");
  const dealGroups = await prisma.deal.groupBy({
    by: ["status"],
    where: { workspaceId, contactId },
    _sum: { value: true },
    _count: { _all: true }
  });
  let wonDealsValue = 0;
  let wonDealsCount = 0;
  let openPipelineValue = 0;
  let openDealsCount = 0;
  let lostDealsCount = 0;
  for (const g of dealGroups) {
    const sum = Number(g._sum.value ?? 0);
    const count = g._count._all;
    if (g.status === "WON") {
      wonDealsValue += sum;
      wonDealsCount += count;
    } else if (g.status === "LOST") {
      lostDealsCount += count;
    } else {
      openPipelineValue += sum;
      openDealsCount += count;
    }
  }
  let ordersTotal;
  let ordersCount;
  if (contact.email) {
    const orderAgg = await prisma.order.aggregate({
      where: {
        workspaceId,
        customerEmail: { equals: contact.email, mode: "insensitive" },
        financialStatus: "paid"
      },
      _sum: { totalPrice: true },
      _count: { _all: true }
    });
    const count = orderAgg._count._all;
    if (count > 0) {
      ordersCount = count;
      ordersTotal = Number(orderAgg._sum.totalPrice ?? 0);
    }
  }
  const ltv = Number(contact.ltv ?? 0);
  const capturedValue = wonDealsValue + (ordersTotal ?? 0);
  return {
    ltv,
    wonDealsValue,
    wonDealsCount,
    openPipelineValue,
    openDealsCount,
    lostDealsCount,
    capturedValue,
    ...ordersCount !== void 0 && { ordersCount, ordersTotal }
  };
}
async function getRevenueSummary(workspaceId, contactId) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { email: true }
  });
  if (!contact) throw new Error("Contact not found");
  let totalRevenue = 0;
  let orderCount = 0;
  let avgOrderValue = 0;
  let lastPurchaseDate = null;
  if (contact.email) {
    const agg = await prisma.order.aggregate({
      where: {
        workspaceId,
        customerEmail: { equals: contact.email, mode: "insensitive" },
        financialStatus: "paid"
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
      _max: { createdAt: true }
    });
    orderCount = agg._count._all;
    totalRevenue = Number(agg._sum.totalPrice ?? 0);
    avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount * 100) / 100 : 0;
    lastPurchaseDate = agg._max.createdAt ? agg._max.createdAt.toISOString() : null;
  }
  const since30d = /* @__PURE__ */ new Date();
  since30d.setDate(since30d.getDate() - 30);
  const wsAgg = await prisma.dailyMetric.aggregate({
    where: { workspaceId, date: { gte: since30d } },
    _sum: {
      totalRevenue: true,
      netProfit: true,
      metaAdSpend: true,
      googleAdSpend: true,
      tiktokAdSpend: true
    }
  });
  const totalRevenue30d = Number(wsAgg._sum.totalRevenue ?? 0);
  const netProfit30d = Number(wsAgg._sum.netProfit ?? 0);
  const totalAdSpend30d = Number(wsAgg._sum.metaAdSpend ?? 0) + Number(wsAgg._sum.googleAdSpend ?? 0) + Number(wsAgg._sum.tiktokAdSpend ?? 0);
  const avgROAS = totalAdSpend30d > 0 ? Math.round(totalRevenue30d / totalAdSpend30d * 100) / 100 : null;
  return {
    contactRevenue: { totalRevenue, orderCount, avgOrderValue, lastPurchaseDate },
    workspaceContext: { avgROAS, totalAdSpend30d, totalRevenue30d, netProfit30d }
  };
}

// src/modules/crm/contactValue.routes.ts
var router25 = (0, import_express25.Router)();
var auth7 = [authenticate, requirePlan("PRO", "SCALE")];
router25.get("/crm/contacts/:contactId/value", ...auth7, async (req, res) => {
  try {
    const data = await getContactValue(req.user.workspaceId, req.params.contactId);
    res.json(data);
  } catch (e) {
    if (e.message === "Contact not found") return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});
router25.get("/crm/contacts/:contactId/revenue-summary", ...auth7, async (req, res) => {
  try {
    const data = await getRevenueSummary(req.user.workspaceId, req.params.contactId);
    res.json(data);
  } catch (e) {
    if (e.message === "Contact not found") return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});
var contactValue_routes_default = router25;

// src/modules/payments-crm/payment-links.routes.ts
var import_express26 = require("express");

// src/modules/payments-crm/payment-links.service.ts
init_prisma();
var import_mercadopago2 = require("mercadopago");
var import_config8 = require("dotenv/config");
var mpConfig2 = process.env.MERCADOPAGO_ACCESS_TOKEN ? new import_mercadopago2.MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN }) : null;
async function hydrateLinks(workspaceId, links) {
  const contactIds = [...new Set(links.map((l) => l.contactId).filter(Boolean))];
  const dealIds = [...new Set(links.map((l) => l.dealId).filter(Boolean))];
  const [contacts, deals] = await Promise.all([
    contactIds.length > 0 ? prisma.contact.findMany({
      where: { workspaceId, id: { in: contactIds } },
      select: { id: true, name: true }
    }) : [],
    dealIds.length > 0 ? prisma.deal.findMany({
      where: { workspaceId, id: { in: dealIds } },
      select: { id: true, title: true }
    }) : []
  ]);
  const nameById = new Map(contacts.map((c) => [c.id, c.name]));
  const titleById = new Map(deals.map((d) => [d.id, d.title]));
  return links.map((l) => ({
    ...l,
    contactName: l.contactId ? nameById.get(l.contactId) ?? null : null,
    dealTitle: l.dealId ? titleById.get(l.dealId) ?? null : null
  }));
}
async function createPaymentLink(workspaceId, input) {
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }
  const currency = (input.currency || "CLP").toUpperCase();
  const description = input.description?.trim() || null;
  let externalId = null;
  let url = null;
  let needsConfig = false;
  if (mpConfig2) {
    try {
      const preference = new import_mercadopago2.Preference(mpConfig2);
      const result = await preference.create({
        body: {
          items: [
            {
              id: "cobro",
              title: description || "Pago",
              quantity: 1,
              unit_price: amount,
              currency_id: currency
            }
          ],
          external_reference: workspaceId,
          metadata: {
            workspace_id: workspaceId,
            ...input.contactId ? { contact_id: input.contactId } : {},
            ...input.dealId ? { deal_id: input.dealId } : {},
            kind: "crm_payment_link"
          }
        }
      });
      externalId = result.id ?? null;
      url = result.init_point ?? null;
    } catch (err) {
      console.error("[PaymentLinks] MercadoPago preference error:", err?.message || err);
      needsConfig = true;
    }
  } else {
    needsConfig = true;
  }
  const link = await prisma.paymentLink.create({
    data: {
      workspaceId,
      contactId: input.contactId || null,
      dealId: input.dealId || null,
      amount,
      currency,
      description,
      provider: "MERCADOPAGO",
      externalId,
      url,
      status: "PENDING"
    }
  });
  const [hydrated] = await hydrateLinks(workspaceId, [link]);
  return { ...hydrated, needsConfig };
}
async function listPaymentLinks(workspaceId) {
  const links = await prisma.paymentLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
  return hydrateLinks(workspaceId, links);
}
async function getPaymentLink(workspaceId, id) {
  const link = await prisma.paymentLink.findFirst({
    where: { id, workspaceId }
  });
  if (!link) throw new Error("Payment link not found");
  const [hydrated] = await hydrateLinks(workspaceId, [link]);
  return hydrated;
}
var VALID_STATUSES2 = ["PENDING", "PAID", "EXPIRED", "CANCELLED"];
async function updatePaymentLinkStatus(workspaceId, id, status) {
  if (!VALID_STATUSES2.includes(status)) {
    throw new Error("Invalid status. Must be one of: " + VALID_STATUSES2.join(", "));
  }
  await getPaymentLink(workspaceId, id);
  const updated = await prisma.paymentLink.update({
    where: { id },
    data: {
      status,
      ...status === "PAID" ? { paidAt: /* @__PURE__ */ new Date() } : {}
    }
  });
  const [withName] = await attachContactNames(workspaceId, [updated]);
  return withName;
}
async function markPaidByExternalId(externalId) {
  const link = await prisma.paymentLink.findFirst({ where: { externalId } });
  if (!link) return null;
  if (link.status === "PAID") return link;
  return prisma.paymentLink.update({
    where: { id: link.id },
    data: { status: "PAID", paidAt: /* @__PURE__ */ new Date() }
  });
}

// src/modules/payments-crm/payment-links.routes.ts
var router26 = (0, import_express26.Router)();
var auth8 = [authenticate, requirePlan("PRO", "SCALE")];
router26.get("/crm/payment-links", ...auth8, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await listPaymentLinks(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router26.post("/crm/payment-links", ...auth8, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { contactId, dealId, amount, currency, description } = req.body;
    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    const link = await createPaymentLink(workspaceId, {
      contactId: contactId || null,
      dealId: dealId || null,
      amount: amountNum,
      currency,
      description
    });
    res.status(201).json(link);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router26.get("/crm/payment-links/:id", ...auth8, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await getPaymentLink(workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router26.patch("/crm/payment-links/:id", ...auth8, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    res.json(await updatePaymentLinkStatus(workspaceId, req.params.id, status));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const code = msg.includes("not found") ? 404 : msg.includes("invalid status") ? 400 : 500;
    res.status(code).json({ error: err.message });
  }
});
var payment_links_routes_default = router26;

// src/modules/payments-crm/payment-links.webhook.ts
var import_express27 = require("express");
var router27 = (0, import_express27.Router)();
router27.post("/payments/mercadopago/webhook", async (req, res) => {
  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      res.status(200).send("OK");
      return;
    }
    const { type, data, action } = req.body || {};
    const isPayment = type === "payment" || typeof action === "string" && action.startsWith("payment");
    if (isPayment && data?.id) {
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payment = await resp.json().catch(() => ({}));
      const isCrmLink = payment?.metadata?.kind === "crm_payment_link";
      if (payment?.status === "approved") {
        const externalId = payment?.preference_id || payment?.order?.id || payment?.additional_info?.preference_id || null;
        if (externalId) {
          await markPaidByExternalId(String(externalId));
        } else if (isCrmLink && payment?.metadata?.contact_id) {
          console.warn("[PaymentLinks Webhook] approved payment without preference_id", payment?.id);
        }
      }
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("[PaymentLinks Webhook] Error:", err?.message || err);
    res.status(200).send("OK");
  }
});
var payment_links_webhook_default = router27;

// src/modules/automation/automation.routes.ts
var import_express28 = require("express");

// src/modules/automation/automation.service.ts
init_prisma();
async function listWorkflows(workspaceId) {
  return prisma.workflow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
}
async function getWorkflow(workspaceId, id) {
  const wf = await prisma.workflow.findFirst({
    where: { id, workspaceId },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } }
  });
  if (!wf) throw new Error("Workflow not found");
  return wf;
}
async function createWorkflow(workspaceId, data) {
  return prisma.workflow.create({
    data: {
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig ?? void 0,
      nodes: data.nodes ?? [],
      isActive: data.isActive ?? true
    }
  });
}
async function updateWorkflow(workspaceId, id, data) {
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Workflow not found");
  return prisma.workflow.update({
    where: { id },
    data: {
      ...data.name !== void 0 && { name: data.name },
      ...data.description !== void 0 && { description: data.description },
      ...data.triggerType !== void 0 && { triggerType: data.triggerType },
      ...data.triggerConfig !== void 0 && { triggerConfig: data.triggerConfig ?? void 0 },
      ...data.nodes !== void 0 && { nodes: data.nodes },
      ...data.isActive !== void 0 && { isActive: data.isActive }
    }
  });
}
async function deleteWorkflow(workspaceId, id) {
  const existing = await prisma.workflow.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Workflow not found");
  await prisma.workflow.delete({ where: { id } });
}
async function listRuns(workspaceId, workflowId) {
  return prisma.workflowRun.findMany({
    where: { workspaceId, workflowId },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}
async function duplicateWorkflow(workspaceId, id) {
  const original = await prisma.workflow.findFirst({ where: { id, workspaceId } });
  if (!original) throw new Error("Workflow not found");
  return prisma.workflow.create({
    data: {
      workspaceId,
      name: `Copia de ${original.name}`,
      description: original.description,
      triggerType: original.triggerType,
      triggerConfig: original.triggerConfig ?? void 0,
      nodes: original.nodes ?? [],
      isActive: false
    }
  });
}

// src/modules/automation/automation.routes.ts
var router28 = (0, import_express28.Router)();
var auth9 = [authenticate, requirePlan("PRO", "SCALE")];
var TRIGGER_TYPES = [
  { value: "DEAL_CREATED", label: "Deal creado" },
  { value: "DEAL_STAGE_CHANGED", label: "Deal cambia de etapa" },
  { value: "DEAL_WON", label: "Deal ganado" },
  { value: "DEAL_LOST", label: "Deal perdido" },
  { value: "TASK_CREATED", label: "Tarea creada" },
  { value: "TASK_COMPLETED", label: "Tarea completada" },
  { value: "MESSAGE_RECEIVED", label: "Mensaje recibido" },
  { value: "STATUS_CHANGED", label: "Estado del contacto cambia" },
  { value: "AI_QUALIFICATION", label: "Calificaci\xF3n de IA" },
  { value: "NOTE_ADDED", label: "Nota agregada" },
  { value: "FORM_SUBMITTED", label: "Formulario enviado" },
  { value: "APPOINTMENT_BOOKED", label: "Cita agendada" }
];
var ACTION_TYPES = [
  { value: "add_note", label: "Agregar nota", fields: ["title", "text"] },
  { value: "create_task", label: "Crear tarea", fields: ["title", "priority", "dueInHours"] },
  { value: "update_status", label: "Cambiar estado del contacto", fields: ["status"] },
  { value: "add_tag", label: "Agregar etiqueta", fields: ["name", "color"] },
  { value: "remove_tag", label: "Quitar etiqueta", fields: ["name"] },
  { value: "move_deal", label: "Mover deal a etapa", fields: ["stageId"] },
  { value: "webhook", label: "Webhook (HTTP)", fields: ["url", "method"] },
  { value: "wait", label: "Esperar", fields: ["hours", "minutes"] },
  { value: "branch", label: "Condici\xF3n (filtro)", fields: ["field", "op", "value"] }
];
router28.get("/crm/workflows/catalog", ...auth9, (_req, res) => {
  res.json({ triggers: TRIGGER_TYPES, actions: ACTION_TYPES });
});
router28.get("/crm/workflows", ...auth9, async (req, res) => {
  try {
    res.json(await listWorkflows(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router28.post("/crm/workflows", ...auth9, async (req, res) => {
  try {
    const { name, description, triggerType, triggerConfig, nodes, isActive } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!triggerType) {
      res.status(400).json({ error: "triggerType is required" });
      return;
    }
    const wf = await createWorkflow(req.user.workspaceId, {
      name: name.trim(),
      description,
      triggerType,
      triggerConfig,
      nodes,
      isActive
    });
    res.status(201).json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var WORKFLOW_TEMPLATES = [
  {
    id: "reengagement-deal-lost",
    name: "Re-engagement: Deal Perdido",
    description: "Reactiva contactos cuyo deal se marc\xF3 como perdido. Env\xEDa 2 mensajes espaciados + cierra si no responde.",
    triggerType: "DEAL_LOST",
    nodes: [
      { type: "wait", config: { hours: 24 }, label: "Esperar 1 d\xEDa" },
      { type: "send_message", config: { channel: "WHATSAPP", content: "Hola {{name}}, s\xE9 que a\xFAn no fue el momento para avanzar. \xBFHay algo que podamos hacer diferente para ayudarte?" }, label: "Mensaje re-engagement 1" },
      { type: "wait_for_reply", config: { hours: 72 }, label: "Esperar respuesta (3 d\xEDas)" },
      { type: "branch", config: { field: "_reply_received", op: "eq", value: "false" }, label: "Si no respondi\xF3" },
      { type: "send_message", config: { channel: "WHATSAPP", content: "Entendemos {{name}}. Cuando est\xE9s listo, aqu\xED estaremos. \xA1\xC9xitos!" }, label: "Mensaje de cierre" }
    ]
  },
  {
    id: "welcome-new-contact",
    name: "Bienvenida: Nuevo Contacto",
    description: "Secuencia de bienvenida cuando se crea un contacto. Env\xEDa presentaci\xF3n + agenda cita.",
    triggerType: "DEAL_CREATED",
    nodes: [
      { type: "send_message", config: { channel: "WHATSAPP", content: "\xA1Hola {{name}}! Gracias por tu inter\xE9s. Soy de aqu\xED y me encantar\xEDa ayudarte. \xBFTienes 15 minutos esta semana?" }, label: "Mensaje de bienvenida" },
      { type: "wait", config: { hours: 48 }, label: "Esperar 2 d\xEDas" },
      { type: "send_message", config: { channel: "WHATSAPP", content: "{{name}}, \xBFpudiste revisar nuestra propuesta? Me gustar\xEDa agendar una llamada para responder tus dudas." }, label: "Follow-up bienvenida" }
    ]
  },
  {
    id: "post-sale-followup",
    name: "Post-Venta: Seguimiento",
    description: "Despu\xE9s de ganar un deal, mantener al cliente satisfecho y pedir referidos.",
    triggerType: "DEAL_WON",
    nodes: [
      { type: "wait", config: { hours: 72 }, label: "Esperar 3 d\xEDas post-venta" },
      { type: "send_message", config: { channel: "WHATSAPP", content: "\xA1Hola {{name}}! \xBFC\xF3mo va todo desde que iniciamos? Queremos asegurarnos de que est\xE9s 100% satisfecho." }, label: "Check-in satisfacci\xF3n" },
      { type: "wait_for_reply", config: { hours: 24 }, label: "Esperar respuesta" },
      { type: "send_message", config: { channel: "WHATSAPP", content: "{{name}}, si conoces alguien m\xE1s que pueda beneficiarse de nuestros servicios, \xA1te lo agradecemos enormemente!" }, label: "Pedir referido" }
    ]
  }
];
router28.get("/crm/workflows/templates", ...auth9, (_req, res) => {
  res.json(WORKFLOW_TEMPLATES);
});
router28.post("/crm/workflows/templates/:templateId/install", ...auth9, async (req, res) => {
  try {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === req.params.templateId);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    const wf = await createWorkflow(req.user.workspaceId, {
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      nodes: template.nodes,
      isActive: false
    });
    res.status(201).json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router28.get("/crm/workflows/:id", ...auth9, async (req, res) => {
  try {
    res.json(await getWorkflow(req.user.workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router28.patch("/crm/workflows/:id", ...auth9, async (req, res) => {
  try {
    res.json(await updateWorkflow(req.user.workspaceId, req.params.id, req.body));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router28.delete("/crm/workflows/:id", ...auth9, async (req, res) => {
  try {
    await deleteWorkflow(req.user.workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router28.post("/crm/workflows/:id/duplicate", ...auth9, async (req, res) => {
  try {
    res.status(201).json(await duplicateWorkflow(req.user.workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router28.get("/crm/workflows/:id/runs", ...auth9, async (req, res) => {
  try {
    res.json(await listRuns(req.user.workspaceId, req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var automation_routes_default = router28;

// src/modules/campaigns/campaigns.routes.ts
var import_express29 = require("express");
init_campaigns_service();
var router29 = (0, import_express29.Router)();
var auth10 = [authenticate, requirePlan("PRO", "SCALE")];
router29.get("/crm/campaigns", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await listCampaigns(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router29.post("/crm/campaigns/preview-audience", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { segmentId } = req.body;
    if (!segmentId) {
      res.status(400).json({ error: "segmentId is required" });
      return;
    }
    res.json(await previewAudience(workspaceId, segmentId));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router29.post("/crm/campaigns", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const campaign = await createCampaign(workspaceId, req.body);
    res.status(201).json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router29.get("/crm/campaigns/:id", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await getCampaign(workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
router29.patch("/crm/campaigns/:id", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await updateCampaign(workspaceId, req.params.id, req.body));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.delete("/crm/campaigns/:id", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    await deleteCampaign(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.post("/crm/campaigns/:id/duplicate", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.status(201).json(await duplicateCampaign(workspaceId, req.params.id));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.post("/crm/campaigns/:id/send", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await sendCampaign(workspaceId, req.params.id));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.post("/crm/campaigns/:id/schedule", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { scheduledAt } = req.body;
    if (!scheduledAt) {
      res.status(400).json({ error: "scheduledAt is required" });
      return;
    }
    res.json(await scheduleCampaign(workspaceId, req.params.id, scheduledAt));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.post("/crm/campaigns/:id/test", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    res.json(await testSendCampaign(workspaceId, req.params.id, email));
  } catch (err) {
    const msg = err.message.toLowerCase();
    const status = msg.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});
router29.get("/crm/campaigns/:id/stats", ...auth10, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    res.json(await getCampaignStats(workspaceId, req.params.id));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});
var campaigns_routes_default = router29;

// src/modules/bot/bot.routes.ts
var import_express30 = require("express");

// src/modules/bot/bot.service.ts
init_prisma();

// src/modules/bot/templates/solar.template.ts
var SOLAR_TEMPLATE = {
  agentName: "Valentina",
  tone: "friendly",
  provider: "gemini",
  promptBase: `Representas a DrillChile (ALPOL Hermanos SPA), empresa con +1.000 instalaciones solares certificadas en Chile.

ARGUMENTO ROI: Si el cliente duda por precio, calcula en voz alta: boleta mensual \xD7 12 \xD7 8 a\xF1os = lo que seguir\xE1 pagando a la el\xE9ctrica sin instalarse. Ej: $85.000 \xD7 96 = $8.160.000 perdidos, vs. inversi\xF3n \xFAnica de ~$5.500.000 con 25+ a\xF1os de energ\xEDa. Luego di: "La pregunta no es si puede pagarlo, sino si puede permitirse NO instalarlo".

FINANCIAMIENTO (solo propietarios): 10 a\xF1os al 6,66% anual en UF con 3 meses de gracia. Ej: sistema $5.500.000 \u2192 ~$68.000/mes. La cuota suele ser MENOR que la boleta actual. Para arrendatarios o empresas: solo contado o tarjeta.

BLOQUEADORES: Teja chilena \u2192 lista de espera (anota datos). Edificio sin autorizaci\xF3n del comit\xE9 HOA \u2192 no aplica a\xFAn (ofrece asesor\xEDa para obtenerla). Fuera de zona (RM / Valpara\xEDso / O'Higgins) \u2192 lista de espera.

PROCESO: Cotizaci\xF3n online 5 min \u2192 visita t\xE9cnica gratuita y sin compromiso \u2192 instalaci\xF3n 5\u201310 d\xEDas h\xE1biles. Toda la tramitaci\xF3n (TE4, Enel/CGE, permisos) la hace DrillChile.

CIERRE: Siempre prop\xF3n la visita t\xE9cnica gratuita como siguiente paso. Si dice "lo voy a pensar", di: "Perfecto. La visita no te compromete a nada y tendr\xE1s n\xFAmeros reales. \xBFQu\xE9 d\xEDa te acomoda esta semana?"`,
  profile: {
    business: {
      description: "DrillChile \u2014 Instalaci\xF3n de sistemas solares fotovoltaicos residenciales y comerciales en Chile. Reducimos la cuenta de luz hasta un 90% con energ\xEDa limpia, certificaci\xF3n TE4 incluida y +1.000 instalaciones realizadas.",
      coverage: "Regi\xF3n Metropolitana, Valpara\xEDso y O'Higgins. Fuera de estas zonas: lista de espera."
    },
    offer: [
      { name: "Kit Solar 6 paneles (~3,7 kWp) \u2014 cuentas ~$50.000/mes", price: "$3.200.000 + IVA (~$3.808.000 total)" },
      { name: "Kit Solar 10 paneles (~6,2 kWp) \u2014 cuentas ~$85.000/mes", price: "$5.500.000 + IVA (~$6.545.000 total)" },
      { name: "Kit Solar 18 paneles (~11 kWp) \u2014 cuentas ~$150.000/mes", price: "$9.500.000 + IVA (~$11.305.000 total)" },
      { name: "Kit Solar 36+ paneles (comercial / empresa)", price: "Cotizaci\xF3n personalizada \u2014 requiere visita t\xE9cnica" }
    ],
    qualificationQuestions: [
      { key: "monthly_bill", question: "\xBFCu\xE1nto pagas aproximadamente de luz al mes?" },
      { key: "roof_material", question: "\xBFDe qu\xE9 material es tu techo? (losa, zinc, teja cer\xE1mica, fibrocemento)" },
      { key: "property_type", question: "\xBFEs casa, departamento en edificio o empresa/local?" },
      { key: "is_owner", question: "\xBFEres propietario/a de la vivienda?" },
      { key: "location", question: "\xBFEn qu\xE9 comuna o ciudad est\xE1 la propiedad?" },
      { key: "timeline", question: "\xBFCu\xE1ndo te gustar\xEDa instalarlo? (lo antes posible / 3-6 meses / m\xE1s adelante)" },
      { key: "financing", question: "\xBFPreferir\xEDas pagar al contado o te interesa el financiamiento en cuotas?" }
    ],
    objections: [
      {
        objection: "Es muy caro",
        response: "Entiendo. Hagamos la cuenta: si pagas $85.000 al mes, en 8 a\xF1os habr\xE1s dado $8.160.000 a la el\xE9ctrica. El sistema cuesta ~$6.500.000 y dura 25+ a\xF1os. Adem\xE1s, con financiamiento la cuota mensual suele ser menor que tu boleta actual, as\xED que desde el primer mes ahorras."
      },
      {
        objection: "No s\xE9 si mi techo sirve",
        response: "Por eso la visita t\xE9cnica es gratis y sin compromiso: un experto eval\xFAa orientaci\xF3n, sombras y estructura directamente en tu casa, y te entrega una propuesta exacta. No tienes que decidir nada antes."
      },
      {
        objection: "Lo voy a pensar",
        response: "Perfecto. Mientras lo piensas, \xBFagendamos la evaluaci\xF3n gratuita? No te compromete a nada y tendr\xE1s los n\xFAmeros reales sobre tu casa para decidir con informaci\xF3n concreta. \xBFQu\xE9 d\xEDa te acomoda esta semana?"
      },
      {
        objection: "\xBFQu\xE9 pasa si se echan a perder?",
        response: "Los paneles tienen garant\xEDa de fabricante de 10\u201312 a\xF1os y garant\xEDa de generaci\xF3n por 25 a\xF1os. La instalaci\xF3n tambi\xE9n queda garantizada. Con +1.000 instalaciones, nuestro equipo conoce cada detalle."
      },
      {
        objection: "\xBFSeguir\xE9 pagando luz?",
        response: "Quedas conectado a la red (ley net metering). La energ\xEDa que produces de d\xEDa reduce tu boleta. Lo que sobra se inyecta a la red como cr\xE9dito. En meses de buen sol, muchos clientes pagan $0 o incluso reciben cr\xE9dito para los meses nublados."
      },
      {
        objection: "Soy arrendatario",
        response: "El financiamiento en cuotas aplica solo a propietarios, pero puedes pagar al contado o con tarjeta. Tambi\xE9n puedes hablar con tu arrendador: el sistema aumenta el valor de la propiedad y puede interesarle co-invertir."
      }
    ],
    scheduling: { enabled: true, types: ["SITE_VISIT"] }
  }
};

// src/modules/bot/bot.service.ts
async function listAgents(workspaceId) {
  return prisma.botAgent.findMany({
    where: { workspaceId },
    include: { _count: { select: { flows: true } } },
    orderBy: { createdAt: "desc" }
  });
}
async function createAgent(workspaceId, data) {
  return prisma.botAgent.create({ data: { workspaceId, ...data } });
}
async function updateAgent(workspaceId, agentId, data) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  return prisma.botAgent.update({ where: { id: agentId, workspaceId }, data });
}
async function deleteAgent(workspaceId, agentId) {
  const agent = await prisma.botAgent.findFirst({ where: { id: agentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  await prisma.botAgent.delete({ where: { id: agentId, workspaceId } });
}
async function listFlows(workspaceId, botAgentId) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  return prisma.botFlow.findMany({
    where: { botAgentId, workspaceId },
    orderBy: { priority: "asc" }
  });
}
async function createFlow(workspaceId, botAgentId, data) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  return prisma.botFlow.create({
    data: {
      workspaceId,
      botAgentId,
      name: data.name,
      triggerType: data.triggerType,
      triggerValue: data.triggerValue,
      channel: data.channel ?? "ALL",
      actions: data.actions,
      priority: data.priority ?? 100
    }
  });
}
async function updateFlow(workspaceId, flowId, data) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } });
  if (!flow) throw new Error("Flow not found");
  return prisma.botFlow.update({ where: { id: flowId, workspaceId }, data });
}
async function deleteFlow(workspaceId, flowId) {
  const flow = await prisma.botFlow.findFirst({ where: { id: flowId, workspaceId } });
  if (!flow) throw new Error("Flow not found");
  await prisma.botFlow.delete({ where: { id: flowId, workspaceId } });
}
async function listFollowUpRules(workspaceId, botAgentId) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  return prisma.followUpRule.findMany({
    where: { workspaceId, botAgentId },
    orderBy: { order: "asc" }
  });
}
async function createFollowUpRule(workspaceId, botAgentId, data) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  return prisma.followUpRule.create({
    data: {
      workspaceId,
      botAgentId,
      delayHours: data.delayHours,
      order: data.order ?? 0,
      isActive: data.isActive ?? true
    }
  });
}
async function deleteFollowUpRule(workspaceId, botAgentId, ruleId) {
  const agent = await prisma.botAgent.findFirst({ where: { id: botAgentId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  const rule = await prisma.followUpRule.findFirst({ where: { id: ruleId, workspaceId, botAgentId } });
  if (!rule) throw new Error("Rule not found");
  await prisma.followUpRule.delete({ where: { id: ruleId } });
}
async function getPrimaryAgent(workspaceId) {
  let agent = await prisma.botAgent.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
  if (!agent) {
    agent = await prisma.botAgent.create({
      data: { workspaceId, name: "Asistente Metria", tone: "neutral" }
    });
  }
  return agent;
}
async function toggleChannelAi(workspaceId, platform, isAiEnabled) {
  const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: platform.toUpperCase() } });
  if (!channel) throw new Error("Channel not found");
  const currentConfig = channel.config ?? {};
  return prisma.channel.update({
    where: { id: channel.id },
    data: { config: { ...currentConfig, isAiEnabled } }
  });
}
async function listChannelsWithAiStatus(workspaceId) {
  const channels = await prisma.channel.findMany({
    where: { workspaceId },
    select: { platform: true, name: true, status: true, config: true }
  });
  return channels.map((c) => ({
    ...c,
    isAiEnabled: c.config?.isAiEnabled ?? false
  }));
}
var TEMPLATES = {
  solar: SOLAR_TEMPLATE
};
async function applyTemplate(workspaceId, botId, template) {
  const tmpl = TEMPLATES[template];
  if (!tmpl) throw new Error(`Unknown template: ${template}`);
  const agent = await prisma.botAgent.findFirst({ where: { id: botId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  const existing = agent.config ?? {};
  const newConfig = { ...existing, profile: tmpl.profile };
  return prisma.botAgent.update({
    where: { id: botId },
    data: {
      config: newConfig,
      name: tmpl.agentName,
      tone: tmpl.tone,
      provider: tmpl.provider,
      promptBase: tmpl.promptBase
    }
  });
}

// src/modules/bot/bot.controller.ts
init_businessHours_service();
init_promptCompiler();
function notFound(msg) {
  return msg.toLowerCase().includes("not found") ? 404 : 500;
}
async function listAgentsHandler(req, res) {
  try {
    res.json(await listAgents(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function createAgentHandler(req, res) {
  try {
    const { name, description, avatarUrl } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await createAgent(req.user.workspaceId, { name: name.trim(), description, avatarUrl }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function updateAgentHandler(req, res) {
  try {
    res.json(await updateAgent(req.user.workspaceId, req.params.agentId, req.body));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function deleteAgentHandler(req, res) {
  try {
    await deleteAgent(req.user.workspaceId, req.params.agentId);
    res.json({ ok: true });
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function listFlowsHandler(req, res) {
  try {
    res.json(await listFlows(req.user.workspaceId, req.params.agentId));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function createFlowHandler(req, res) {
  try {
    const { name, triggerType, triggerValue, channel, actions, priority } = req.body;
    if (!name?.trim() || !triggerType) {
      res.status(400).json({ error: "name and triggerType are required" });
      return;
    }
    if (!Array.isArray(actions)) {
      res.status(400).json({ error: "actions must be an array" });
      return;
    }
    res.status(201).json(await createFlow(req.user.workspaceId, req.params.agentId, { name: name.trim(), triggerType, triggerValue, channel, actions, priority }));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function updateFlowHandler(req, res) {
  try {
    res.json(await updateFlow(req.user.workspaceId, req.params.flowId, req.body));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function deleteFlowHandler(req, res) {
  try {
    await deleteFlow(req.user.workspaceId, req.params.flowId);
    res.json({ ok: true });
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function listFollowUpRulesHandler(req, res) {
  try {
    res.json(await listFollowUpRules(req.user.workspaceId, req.params.botId));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function createFollowUpRuleHandler(req, res) {
  try {
    const { delayHours, order, isActive } = req.body;
    if (typeof delayHours !== "number" || delayHours <= 0) {
      res.status(400).json({ error: "delayHours must be a positive number" });
      return;
    }
    res.status(201).json(await createFollowUpRule(req.user.workspaceId, req.params.botId, { delayHours, order, isActive }));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function deleteFollowUpRuleHandler(req, res) {
  try {
    await deleteFollowUpRule(req.user.workspaceId, req.params.botId, req.params.ruleId);
    res.json({ ok: true });
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function getBusinessHoursHandler(req, res) {
  try {
    const result = await getBusinessHours(req.user.workspaceId);
    res.json(result ?? {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function upsertBusinessHoursHandler(req, res) {
  try {
    res.json(await upsertBusinessHours(req.user.workspaceId, req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function getPrimaryAgentHandler(req, res) {
  try {
    res.json(await getPrimaryAgent(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function previewPromptHandler(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const agent = await getPrimaryAgent(workspaceId);
    const profile = agent.config?.profile ?? null;
    const prompt = compileSystemPrompt({
      agent: { name: agent.name, tone: agent.tone, promptBase: agent.promptBase },
      profile,
      knowledgeChunks: [],
      contact: null,
      deal: null
    });
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function listAiChannelsHandler(req, res) {
  try {
    res.json(await listChannelsWithAiStatus(req.user.workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function toggleChannelAiHandler(req, res) {
  try {
    const { platform } = req.params;
    const { enabled } = req.body;
    res.json(await toggleChannelAi(req.user.workspaceId, platform, enabled));
  } catch (err) {
    res.status(notFound(err.message)).json({ error: err.message });
  }
}
async function applyTemplateHandler(req, res) {
  try {
    const { template } = req.body;
    if (!template) {
      res.status(400).json({ error: "template is required" });
      return;
    }
    res.json(await applyTemplate(req.user.workspaceId, req.params.botId, template));
  } catch (err) {
    const status = err.message.toLowerCase().includes("not found") ? 404 : err.message.startsWith("Unknown template") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}

// src/modules/bot/bot.routes.ts
var router30 = (0, import_express30.Router)();
var auth11 = [authenticate, requirePlan("PRO", "SCALE")];
router30.get("/bot/agent", ...auth11, getPrimaryAgentHandler);
router30.get("/bot/agent/preview-prompt", ...auth11, previewPromptHandler);
router30.patch("/bot/agent/:agentId", ...auth11, updateAgentHandler);
router30.get("/bot/channels", ...auth11, listAiChannelsHandler);
router30.patch("/bot/channels/:platform/ai", ...auth11, toggleChannelAiHandler);
router30.get("/bots/agents", ...auth11, listAgentsHandler);
router30.post("/bots/agents", ...auth11, createAgentHandler);
router30.patch("/bots/agents/:agentId", ...auth11, updateAgentHandler);
router30.delete("/bots/agents/:agentId", ...auth11, deleteAgentHandler);
router30.get("/bots/agents/:agentId/flows", ...auth11, listFlowsHandler);
router30.post("/bots/agents/:agentId/flows", ...auth11, createFlowHandler);
router30.patch("/bots/flows/:flowId", ...auth11, updateFlowHandler);
router30.delete("/bots/flows/:flowId", ...auth11, deleteFlowHandler);
router30.post("/bots/:botId/apply-template", ...auth11, applyTemplateHandler);
router30.get("/bots/:botId/followup-rules", ...auth11, listFollowUpRulesHandler);
router30.post("/bots/:botId/followup-rules", ...auth11, createFollowUpRuleHandler);
router30.delete("/bots/:botId/followup-rules/:ruleId", ...auth11, deleteFollowUpRuleHandler);
router30.get("/bots/business-hours", ...auth11, getBusinessHoursHandler);
router30.put("/bots/business-hours", ...auth11, upsertBusinessHoursHandler);
var bot_routes_default = router30;

// src/modules/analytics/analytics.routes.ts
var import_express31 = require("express");

// src/modules/analytics/roas.service.ts
init_prisma();

// src/modules/analytics/analytics.service.ts
init_prisma();
var import_client2 = require("@prisma/client");
async function aggregateChannelSnapshot(workspaceId, channelId, dateStr) {
  const start = /* @__PURE__ */ new Date(dateStr + "T00:00:00.000Z");
  const end = /* @__PURE__ */ new Date(dateStr + "T23:59:59.999Z");
  const [
    totalInbound,
    totalOutbound,
    newContacts,
    conversationsOpened,
    conversationsResolved,
    botHandledCount,
    botResolvedCount,
    humanHandoffCount,
    dealsCreated,
    dealsWon,
    dealsWonAgg,
    avgRows
  ] = await Promise.all([
    prisma.message.count({
      where: { conversation: { channelId }, direction: "INBOUND", sentAt: { gte: start, lte: end } }
    }),
    prisma.message.count({
      where: { conversation: { channelId }, direction: "OUTBOUND", sentAt: { gte: start, lte: end } }
    }),
    prisma.contact.count({
      where: { workspaceId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, status: "RESOLVED", updatedAt: { gte: start, lte: end } }
    }),
    prisma.message.count({
      where: { conversation: { channelId }, direction: "OUTBOUND", senderType: "BOT", sentAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, status: "RESOLVED", isHandledByBot: true, updatedAt: { gte: start, lte: end } }
    }),
    prisma.message.count({
      where: { conversation: { channelId }, direction: "OUTBOUND", senderType: "SYSTEM", content: { contains: "tom\xF3 el control" }, sentAt: { gte: start, lte: end } }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        createdAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        status: "WON",
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.aggregate({
      _sum: { value: true },
      where: {
        contact: { conversations: { some: { channelId } } },
        status: "WON",
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.$queryRaw(
      import_client2.Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (o.sent_at - i.sent_at)))::int AS avg_seconds
        FROM messages i
        JOIN conversations c ON c.id = i.conversation_id AND c.channel_id = ${channelId}
        JOIN LATERAL (
          SELECT sent_at FROM messages
          WHERE conversation_id = i.conversation_id AND direction = 'OUTBOUND' AND sent_at > i.sent_at
          ORDER BY sent_at ASC LIMIT 1
        ) o ON TRUE
        WHERE i.direction = 'INBOUND'
          AND i.sent_at >= ${start} AND i.sent_at <= ${end}
      `
    )
  ]);
  const avgFirstResponseSeconds = Number(avgRows[0]?.avg_seconds ?? 0);
  const dealsWonValue = Number(dealsWonAgg._sum.value ?? 0);
  return prisma.channelAnalyticSnapshot.upsert({
    where: { workspaceId_channelId_date: { workspaceId, channelId, date: start } },
    create: {
      workspaceId,
      channelId,
      date: start,
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      botHandledCount,
      botResolvedCount,
      humanHandoffCount,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue,
      csatAvg: null
    },
    update: {
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      botHandledCount,
      botResolvedCount,
      humanHandoffCount,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue
    }
  });
}
async function getSnapshots(workspaceId, days = 90, channelId) {
  const since = /* @__PURE__ */ new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  return prisma.channelAnalyticSnapshot.findMany({
    where: {
      workspaceId,
      ...channelId ? { channelId } : {},
      date: { gte: since }
    },
    include: { channel: { select: { id: true, name: true, platform: true } } },
    orderBy: { date: "desc" }
  });
}
async function getFunnelSummary(workspaceId, days = 90) {
  const since = /* @__PURE__ */ new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.channelAnalyticSnapshot.aggregate({
    _sum: {
      totalInbound: true,
      totalOutbound: true,
      newContacts: true,
      conversationsOpened: true,
      conversationsResolved: true,
      botHandledCount: true,
      botResolvedCount: true,
      humanHandoffCount: true,
      dealsCreated: true,
      dealsWon: true,
      dealsWonValue: true,
      avgFirstResponseSeconds: true
    },
    where: { workspaceId, date: { gte: since } }
  });
  const s = agg._sum;
  const opened = s.conversationsOpened ?? 0;
  const resolved = s.conversationsResolved ?? 0;
  return {
    totalInbound: s.totalInbound ?? 0,
    totalOutbound: s.totalOutbound ?? 0,
    newContacts: s.newContacts ?? 0,
    conversationsOpened: opened,
    conversationsResolved: resolved,
    botHandledCount: s.botHandledCount ?? 0,
    botResolvedCount: s.botResolvedCount ?? 0,
    humanHandoffCount: s.humanHandoffCount ?? 0,
    dealsCreated: s.dealsCreated ?? 0,
    dealsWon: s.dealsWon ?? 0,
    dealsWonValue: Number(s.dealsWonValue ?? 0),
    avgResolutionRate: opened > 0 ? Math.round(resolved / opened * 100) : 0,
    avgResponseSeconds: s.avgFirstResponseSeconds ?? 0
  };
}

// src/modules/analytics/analytics.controller.ts
async function listSnapshots(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const days = parseInt(req.query.days) || 30;
    const snapshots = await getSnapshots(workspaceId, days);
    res.json({ snapshots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function funnelSummary(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const days = parseInt(req.query.days) || 30;
    const summary = await getFunnelSummary(workspaceId, days);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
async function runAggregation(req, res) {
  try {
    const workspaceId = req.user.workspaceId;
    const { channelId, date } = req.body;
    if (!channelId || !date) {
      res.status(400).json({ error: "channelId and date are required" });
      return;
    }
    const result = await aggregateChannelSnapshot(workspaceId, channelId, date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// src/modules/analytics/analytics.routes.ts
var router31 = (0, import_express31.Router)();
router31.get("/analytics/snapshots", authenticate, listSnapshots);
router31.get("/analytics/funnel", authenticate, funnelSummary);
router31.post("/analytics/run", authenticate, runAggregation);
var analytics_routes_default = router31;

// src/modules/knowledge/knowledge.routes.ts
var import_express32 = require("express");

// src/modules/knowledge/knowledge.service.ts
init_prisma();

// src/modules/knowledge/chunker.ts
function chunkText(text, opts = {}) {
  const maxChars = opts.maxChars ?? 3200;
  const overlapChars = opts.overlapChars ?? 400;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const lastPeriod = clean.lastIndexOf(". ", end);
      if (lastPeriod > start + maxChars * 0.5) end = lastPeriod + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

// src/modules/knowledge/knowledge.service.ts
init_provider_factory();
async function ingestDocument(workspaceId, input) {
  const doc = await prisma.knowledgeDocument.create({
    data: {
      workspaceId,
      botAgentId: input.botAgentId ?? null,
      name: input.name,
      sourceType: input.sourceType,
      status: "PROCESSING"
    }
  });
  try {
    let text = input.content;
    if (input.sourceType === "PDF") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(Buffer.from(input.content, "base64")) });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy().catch(() => {
        });
      }
    }
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("Document has no extractable text");
    const embeddings = await getProvider().embed(chunks);
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content, i) => ({
        documentId: doc.id,
        workspaceId,
        content,
        embedding: embeddings[i],
        order: i
      }))
    });
    await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { status: "READY" } });
  } catch (err) {
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { status: "ERROR", error: err.message }
    });
  }
  return doc;
}
async function listDocuments(workspaceId) {
  return prisma.knowledgeDocument.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } }
  });
}
async function deleteDocument(workspaceId, documentId) {
  const doc = await prisma.knowledgeDocument.findFirst({ where: { id: documentId, workspaceId } });
  if (!doc) throw new Error("Document not found");
  return prisma.knowledgeDocument.delete({ where: { id: doc.id } });
}

// src/modules/knowledge/knowledge.routes.ts
var router32 = (0, import_express32.Router)();
var auth12 = [authenticate, requirePlan("PRO", "SCALE")];
router32.post("/knowledge", ...auth12, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const { name, sourceType, content, botAgentId } = req.body;
    if (!name || !sourceType || !content) return res.status(400).json({ error: "name, sourceType, content required" });
    const doc = await ingestDocument(workspaceId, { name, sourceType, content, botAgentId });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router32.get("/knowledge", ...auth12, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    res.json(await listDocuments(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router32.delete("/knowledge/:id", ...auth12, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    await deleteDocument(workspaceId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
var knowledge_routes_default = router32;

// src/modules/scheduling/scheduling.routes.ts
var import_express33 = require("express");
init_prisma();
init_scheduling_service();

// src/modules/scheduling/booking.service.ts
init_prisma();
init_scheduling_service();
init_google_calendar_service();
var PUBLIC_BOOKING_TYPE = "SITE_VISIT";
var DEFAULT_TIMEZONE = "America/Santiago";
function slugify2(input) {
  return String(input).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
async function getWorkspaceTimezone2(workspaceId) {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } });
    return bh?.timezone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
function formatHHmm(d, tz) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz
  }).format(d);
}
function formatDateKey(d, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz
  }).format(d);
}
function findWorkspaceBySlug(slug) {
  return prisma.workspace.findUnique({
    where: { bookingSlug: slug },
    select: {
      id: true,
      name: true,
      bookingTitle: true,
      bookingDurationMin: true,
      googleCalRefreshToken: true,
      googleCalEmail: true,
      googleCalendarId: true
    }
  });
}
async function getPublicSlotsForDate(workspaceId, dateStr) {
  const tz = await getWorkspaceTimezone2(workspaceId);
  const from = /* @__PURE__ */ new Date(`${dateStr}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const slots = await getAvailableSlots(workspaceId, PUBLIC_BOOKING_TYPE, from, 3);
  let daySlots = slots.filter((s) => formatDateKey(s, tz) === dateStr);
  const wsData = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { bookingDurationMin: true, googleCalRefreshToken: true }
  });
  if (wsData?.googleCalRefreshToken) {
    try {
      const durationMs = (wsData.bookingDurationMin ?? 30) * 6e4;
      const busyFrom = /* @__PURE__ */ new Date(`${dateStr}T00:00:00.000Z`);
      busyFrom.setUTCDate(busyFrom.getUTCDate() - 1);
      const busyTo = new Date(busyFrom);
      busyTo.setDate(busyTo.getDate() + 3);
      const busyRaw = await getFreeBusy(workspaceId, busyFrom, busyTo);
      if (busyRaw.length > 0) {
        const busyIntervals = busyRaw.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
        daySlots = daySlots.filter((slot) => {
          const slotEnd = new Date(slot.getTime() + durationMs);
          return !busyIntervals.some((b) => slot < b.end && slotEnd > b.start);
        });
      }
    } catch (err) {
      console.error("[booking] FreeBusy filter error (non-blocking):", err);
    }
  }
  const times = daySlots.map((s) => formatHHmm(s, tz));
  return Array.from(new Set(times)).sort();
}
async function wallClockToInstant(workspaceId, dateStr, timeStr) {
  const tz = await getWorkspaceTimezone2(workspaceId);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  const guess = new Date(asUtc);
  const tzWall = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const utcWall = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  return new Date(asUtc - offsetMs);
}

// src/modules/scheduling/scheduling.routes.ts
var router33 = (0, import_express33.Router)();
var auth13 = [authenticate, requirePlan("PRO", "SCALE")];
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
router33.get("/appointments", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const from = req.query.from ? new Date(String(req.query.from)) : void 0;
    const to = req.query.to ? new Date(String(req.query.to)) : void 0;
    res.json(await listAppointments(workspaceId, from, to));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.post("/appointments", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const { contactId, type, scheduledAt, dealId, notes } = req.body;
    const appt = await scheduleAppointment(workspaceId, {
      contactId,
      type,
      scheduledAt: new Date(scheduledAt),
      dealId,
      notes,
      createdBy: req.user?.id ?? "USER"
    });
    res.status(201).json(appt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router33.patch("/appointments/:id/status", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const updated = await updateAppointmentStatus(workspaceId, req.params.id, req.body.status);
    res.json(updated);
    if (req.body.status === "CANCELLED" && updated.googleEventId) {
      const { cancelCalendarEvent: cancelCalendarEvent2 } = await Promise.resolve().then(() => (init_google_calendar_service(), google_calendar_service_exports));
      cancelCalendarEvent2(workspaceId, updated.googleEventId).catch(
        (err) => console.error("[gcal] cancel event failed:", err)
      );
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router33.get("/availability/slots", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const type = String(req.query.type || "SITE_VISIT");
    const slots = await getAvailableSlots(workspaceId, type, /* @__PURE__ */ new Date(), 14);
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.get("/availability/rules", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    res.json(await prisma.availabilityRule.findMany({ where: { workspaceId } }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.post("/availability/rules", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const { dayOfWeek, startTime, endTime, slotMinutes, apptType } = req.body;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: "dayOfWeek must be an integer between 0 and 6" });
    }
    if (typeof startTime !== "string" || !TIME_RE.test(startTime) || typeof endTime !== "string" || !TIME_RE.test(endTime)) {
      return res.status(400).json({ error: "startTime and endTime must be in HH:mm format" });
    }
    res.status(201).json(await prisma.availabilityRule.create({
      data: { workspaceId, dayOfWeek, startTime, endTime, slotMinutes: slotMinutes ?? 60, apptType: apptType ?? "SITE_VISIT" }
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.delete("/availability/rules/:id", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    await prisma.availabilityRule.deleteMany({ where: { id: req.params.id, workspaceId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.get("/scheduling/booking-config", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
    });
    if (!ws) return res.status(404).json({ error: "Workspace not found" });
    res.json({
      bookingSlug: ws.bookingSlug,
      bookingTitle: ws.bookingTitle,
      bookingDurationMin: ws.bookingDurationMin
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router33.patch("/scheduling/booking-config", ...auth13, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    const { bookingSlug, bookingTitle, bookingDurationMin } = req.body ?? {};
    const data = {};
    if (bookingSlug !== void 0) {
      const slug = slugify2(String(bookingSlug));
      if (!slug) return res.status(400).json({ error: "El enlace no puede estar vac\xEDo" });
      data.bookingSlug = slug;
    }
    if (bookingTitle !== void 0) {
      data.bookingTitle = bookingTitle === null ? null : String(bookingTitle).trim().slice(0, 120);
    }
    if (bookingDurationMin !== void 0) {
      const dur = Number(bookingDurationMin);
      if (!Number.isFinite(dur) || dur < 5 || dur > 480) {
        return res.status(400).json({ error: "La duraci\xF3n debe estar entre 5 y 480 minutos" });
      }
      data.bookingDurationMin = Math.round(dur);
    }
    try {
      const ws = await prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: { bookingSlug: true, bookingTitle: true, bookingDurationMin: true }
      });
      res.json({
        bookingSlug: ws.bookingSlug,
        bookingTitle: ws.bookingTitle,
        bookingDurationMin: ws.bookingDurationMin
      });
    } catch (e) {
      if (e?.code === "P2002") return res.status(409).json({ error: "slug en uso" });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var scheduling_routes_default = router33;

// src/modules/scheduling/public-booking.routes.ts
var import_express34 = require("express");
init_prisma();
init_scheduling_service();
var router34 = (0, import_express34.Router)();
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE2 = /^([01]\d|2[0-3]):[0-5]\d$/;
var SLUG_RE = /^[a-z0-9-]{1,60}$/;
var EMAIL_RE2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanSlug(raw) {
  const slug = String(raw || "").toLowerCase().trim();
  return SLUG_RE.test(slug) ? slug : null;
}
router34.get("/booking/:slug", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    if (!slug) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    const ws = await findWorkspaceBySlug(slug);
    if (!ws) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    res.json({
      workspaceName: ws.name,
      bookingTitle: ws.bookingTitle || "Agenda una cita",
      bookingDurationMin: ws.bookingDurationMin
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo cargar la p\xE1gina de reservas" });
  }
});
router34.get("/booking/:slug/slots", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    if (!slug) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    const date = String(req.query.date || "");
    if (!DATE_RE.test(date)) return res.status(400).json({ error: "Fecha inv\xE1lida" });
    const ws = await findWorkspaceBySlug(slug);
    if (!ws) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    const slots = await getPublicSlotsForDate(ws.id, date);
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron cargar los horarios" });
  }
});
router34.post("/booking/:slug/book", simpleRateLimit(10 * 60 * 1e3, 10), async (req, res) => {
  let appt;
  let contact = null;
  let ws = null;
  let name = "";
  let phoneRaw = "";
  let email = null;
  try {
    const slug = cleanSlug(req.params.slug);
    if (!slug) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    ws = await findWorkspaceBySlug(slug);
    if (!ws) return res.status(404).json({ error: "Enlace no v\xE1lido" });
    const body = req.body ?? {};
    name = String(body.name || "").trim().slice(0, 120);
    phoneRaw = body.phone == null ? "" : String(body.phone).trim().slice(0, 40);
    const emailRaw = body.email == null ? "" : String(body.email).trim().toLowerCase().slice(0, 160);
    const date = String(body.date || "");
    const time = String(body.time || "");
    if (name.length < 2) return res.status(400).json({ error: "Ingresa tu nombre" });
    if (!phoneRaw || phoneRaw.replace(/\D/g, "").length < 6) {
      return res.status(400).json({ error: "Ingresa un tel\xE9fono v\xE1lido" });
    }
    if (emailRaw && !EMAIL_RE2.test(emailRaw)) {
      return res.status(400).json({ error: "El correo no es v\xE1lido" });
    }
    if (!DATE_RE.test(date)) return res.status(400).json({ error: "Fecha inv\xE1lida" });
    if (!TIME_RE2.test(time)) return res.status(400).json({ error: "Hora inv\xE1lida" });
    const available = await getPublicSlotsForDate(ws.id, date);
    if (!available.includes(time)) {
      return res.status(409).json({ error: "Ese horario ya no est\xE1 disponible. Elige otro." });
    }
    const scheduledAt = await wallClockToInstant(ws.id, date, time);
    email = emailRaw || null;
    contact = await prisma.contact.findFirst({
      where: {
        workspaceId: ws.id,
        OR: [
          { phone: phoneRaw },
          ...email ? [{ email }] : []
        ]
      }
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          workspaceId: ws.id,
          name,
          phone: phoneRaw,
          email,
          source: "BOOKING",
          status: "LEAD"
        }
      });
    }
    try {
      appt = await scheduleAppointment(ws.id, {
        contactId: contact.id,
        type: PUBLIC_BOOKING_TYPE,
        scheduledAt,
        createdBy: "PUBLIC_BOOKING"
      });
    } catch (e) {
      const msg = String(e?.message || "");
      if (/taken|availability/i.test(msg)) {
        return res.status(409).json({ error: "Ese horario ya no est\xE1 disponible. Elige otro." });
      }
      throw e;
    }
    res.status(201).json({ ok: true, appointmentId: appt.id });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: "No se pudo completar la reserva. Int\xE9ntalo de nuevo." });
    }
    return;
  }
  if (!appt || !contact || !ws) return;
  const bh = await prisma.businessHours.findUnique({
    where: { workspaceId: ws.id },
    select: { timezone: true }
  }).catch(() => null);
  const tz = bh?.timezone ?? "America/Santiago";
  if (ws.googleCalRefreshToken) {
    try {
      const { createCalendarEvent: createCalendarEvent2 } = await Promise.resolve().then(() => (init_google_calendar_service(), google_calendar_service_exports));
      const googleEventId = await createCalendarEvent2(ws.id, {
        title: ws.bookingTitle ?? "Cita agendada",
        startAt: appt.scheduledAt,
        durationMin: appt.durationMin,
        bookerName: name,
        bookerEmail: email,
        workspaceEmail: ws.googleCalEmail ?? null
      });
      if (googleEventId) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { googleEventId }
        });
      }
    } catch (gcalErr) {
      console.error("[booking] Google Calendar event creation failed:", gcalErr);
    }
  }
  try {
    const { getIO: getIO2 } = await Promise.resolve().then(() => (init_socket(), socket_exports));
    getIO2().to(`workspace:${ws.id}`).emit("appointment:created", {
      appointmentId: appt.id,
      contactId: contact.id,
      name,
      phone: phoneRaw,
      scheduledAt: appt.scheduledAt
    });
  } catch (_) {
  }
});
var public_booking_routes_default = router34;

// src/routes/composio.ts
var import_express35 = require("express");
init_prisma();

// src/lib/composio.ts
var import_core = require("@composio/core");
var _client = null;
function getClient() {
  if (!_client) {
    _client = new import_core.Composio({ apiKey: process.env.COMPOSIO_API_KEY ?? "" });
  }
  return _client;
}
async function initiateConnection(workspaceId, appName, callbackUrl) {
  const session = await getClient().create(workspaceId);
  const req = await session.authorize(appName.toLowerCase(), { callbackUrl });
  if (!req.redirectUrl) {
    throw new Error(`Composio no devolvi\xF3 una URL de redirecci\xF3n para "${appName}"`);
  }
  return { redirectUrl: req.redirectUrl };
}

// src/routes/composio.ts
var router35 = (0, import_express35.Router)();
var BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";
var FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",")[0].trim();
var VALID_TOOLKITS = {
  INSTAGRAM: "instagram",
  METAADS: "metaads",
  FACEBOOK: "facebook",
  MESSENGER: "facebook"
};
router35.post("/connect", authenticate, async (req, res) => {
  const { toolkit } = req.body;
  const workspaceId = req.user?.workspaceId;
  const toolkitKey = toolkit?.toUpperCase();
  if (!VALID_TOOLKITS[toolkitKey]) {
    res.status(400).json({ error: `toolkit must be one of: ${Object.keys(VALID_TOOLKITS).join(", ")}` });
    return;
  }
  if (!process.env.COMPOSIO_API_KEY) {
    res.status(503).json({ error: "COMPOSIO_API_KEY not configured on server" });
    return;
  }
  try {
    const callbackUrl = `${BACKEND_URL}/api/composio/callback?workspaceId=${workspaceId}&toolkit=${toolkitKey}`;
    const connectionRequest = await initiateConnection(workspaceId, VALID_TOOLKITS[toolkitKey], callbackUrl);
    res.json({ redirectUrl: connectionRequest.redirectUrl });
  } catch (err) {
    const msg = err?.message ?? (typeof err === "string" ? err : "Error al conectar con Composio");
    console.error("[Composio] connect error:", msg, err);
    res.status(500).json({ error: msg });
  }
});
router35.get("/callback", async (req, res) => {
  const { workspaceId, toolkit, status, connected_account_id } = req.query;
  if (status !== "success" || !connected_account_id || !workspaceId) {
    const msg = "Conexi\xF3n cancelada o fallida.";
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_error=${encodeURIComponent(msg)}`);
    return;
  }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      res.status(404).send("Workspace not found");
      return;
    }
    const existing = workspace.composioConnections ?? {};
    const updated = {
      ...existing,
      [toolkit]: {
        connectedAccountId: connected_account_id,
        connectedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { composioConnections: updated }
    });
    console.log(`[Composio] ${toolkit} connected for workspace ${workspaceId}`);
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_success=${toolkit}`);
  } catch (err) {
    console.error("[Composio] callback error:", err.message);
    res.redirect(`${FRONTEND_URL}/dashboard/settings/channels?composio_error=${encodeURIComponent(err.message)}`);
  }
});
router35.get("/status", authenticate, async (req, res) => {
  const workspaceId = req.user?.workspaceId;
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { composioConnections: true }
    });
    res.json(workspace?.composioConnections ?? {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router35.delete("/disconnect", authenticate, async (req, res) => {
  const { toolkit } = req.query;
  const workspaceId = req.user?.workspaceId;
  const toolkitKey = toolkit?.toUpperCase();
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const existing = workspace?.composioConnections ?? {};
    const { [toolkitKey]: _removed, ...rest } = existing;
    await prisma.workspace.update({ where: { id: workspaceId }, data: { composioConnections: rest } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var composio_default = router35;

// src/routes/integrations/google-calendar.routes.ts
var import_express36 = require("express");
init_prisma();
init_google_calendar();
init_google_calendar_service();
var router36 = (0, import_express36.Router)();
var provider2 = new GoogleCalendarProvider();
var REDIRECT_URI = () => `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/integrations/google-calendar/callback`;
var FRONTEND_URL2 = () => process.env.FRONTEND_URL ?? "http://localhost:3000";
router36.get("/auth", authenticate, (req, res) => {
  const workspaceId = req.user.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: "No workspace" });
  const url = provider2.getAuthUrl(workspaceId);
  res.json({ url });
});
router36.get("/callback", async (req, res) => {
  const { code, state: workspaceId, error } = req.query;
  if (error || !code || !workspaceId) {
    return res.redirect(`${FRONTEND_URL2()}/dashboard/settings?cal_error=1`);
  }
  try {
    const tokens = await provider2.exchangeCode(code, REDIRECT_URI());
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    const userInfo = await userRes.json();
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        googleCalAccessToken: tokens.accessToken,
        googleCalRefreshToken: tokens.refreshToken ?? null,
        googleCalEmail: userInfo.email ?? null,
        googleCalendarId: "primary",
        googleCalTokenExpiry: tokens.expiresAt ?? null
      }
    });
    res.redirect(`${FRONTEND_URL2()}/dashboard/settings?cal_connected=1`);
  } catch (err) {
    console.error("[gcal-oauth] callback error:", err);
    res.redirect(`${FRONTEND_URL2()}/dashboard/settings?cal_error=1`);
  }
});
router36.get("/status", authenticate, async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalEmail: true,
      googleCalendarId: true,
      googleCalRefreshToken: true
    }
  });
  res.json({
    connected: !!workspace?.googleCalRefreshToken,
    email: workspace?.googleCalEmail ?? null,
    calendarId: workspace?.googleCalendarId ?? null
  });
});
router36.get("/calendars", authenticate, async (req, res) => {
  const workspaceId = req.user.workspaceId;
  try {
    const calendars = await listWorkspaceCalendars(workspaceId);
    res.json({ calendars });
  } catch (err) {
    console.error("[gcal] listCalendars error:", err);
    res.status(502).json({ error: "Failed to fetch calendars from Google" });
  }
});
router36.patch("/calendar", authenticate, async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const { calendarId } = req.body;
  if (!calendarId) return res.status(400).json({ error: "calendarId required" });
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { googleCalendarId: calendarId }
  });
  res.json({ ok: true });
});
router36.delete("/", authenticate, async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalAccessToken: true }
  });
  if (ws?.googleCalAccessToken) {
    fetch(
      `https://oauth2.googleapis.com/revoke?token=${ws.googleCalAccessToken}`,
      { method: "POST" }
    ).catch(() => {
    });
  }
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      googleCalAccessToken: null,
      googleCalRefreshToken: null,
      googleCalEmail: null,
      googleCalendarId: null,
      googleCalTokenExpiry: null
    }
  });
  res.json({ ok: true });
});
var google_calendar_routes_default = router36;

// src/modules/products/products.routes.ts
var import_express37 = require("express");

// src/modules/products/products.service.ts
init_prisma();
async function listProducts(workspaceId, includeInactive = false) {
  return prisma.product.findMany({
    where: { workspaceId, ...!includeInactive && { isActive: true } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
  });
}
async function activateProduct(workspaceId, id) {
  const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Producto no encontrado");
  return prisma.product.update({ where: { id }, data: { isActive: true } });
}
async function createProduct(workspaceId, data) {
  if (!data.name?.trim()) throw new Error("El nombre es requerido");
  if (!data.price || data.price <= 0) throw new Error("El precio debe ser mayor a 0");
  return prisma.product.create({
    data: {
      workspaceId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      sku: data.sku?.trim() || null,
      price: data.price,
      currency: data.currency ?? "CLP",
      isActive: true
    }
  });
}
async function updateProduct(workspaceId, id, data) {
  const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Producto no encontrado");
  if (data.name !== void 0 && !data.name.trim()) throw new Error("El nombre no puede estar vac\xEDo");
  if (data.price !== void 0 && data.price <= 0) throw new Error("El precio debe ser mayor a 0");
  return prisma.product.update({
    where: { id },
    data: {
      ...data.name !== void 0 && { name: data.name.trim() },
      ...data.description !== void 0 && { description: data.description?.trim() || null },
      ...data.sku !== void 0 && { sku: data.sku?.trim() || null },
      ...data.price !== void 0 && { price: data.price },
      ...data.currency !== void 0 && { currency: data.currency }
    }
  });
}
async function deleteProduct(workspaceId, id) {
  const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new Error("Producto no encontrado");
  return prisma.product.update({ where: { id }, data: { isActive: false } });
}

// src/modules/products/products.routes.ts
var router37 = (0, import_express37.Router)();
router37.get("/products", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const includeInactive = req.query.includeInactive === "true";
    const products = await listProducts(workspaceId, includeInactive);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
router37.post("/products", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const product = await createProduct(workspaceId, req.body);
    res.status(201).json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(400).json({ error: message });
  }
});
router37.put("/products/:id", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const product = await updateProduct(workspaceId, req.params.id, req.body);
    res.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("no encontrado") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});
router37.delete("/products/:id", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    await deleteProduct(workspaceId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(404).json({ error: message });
  }
});
router37.patch("/products/:id/activate", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const product = await activateProduct(workspaceId, req.params.id);
    res.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(404).json({ error: message });
  }
});
var products_routes_default = router37;

// src/modules/payments/invoices.routes.ts
var import_express38 = require("express");

// src/modules/payments/invoices.service.ts
init_prisma();
async function createInvoice(workspaceId, data) {
  const lineItems = data.lineItems;
  if (!lineItems || lineItems.length === 0) {
    throw new Error("Al menos un producto requerido");
  }
  for (const li of lineItems) {
    if (!li.qty || li.qty <= 0 || !Number.isInteger(li.qty)) {
      throw new Error("qty debe ser entero positivo");
    }
    if (li.unitPrice != null && li.unitPrice < 0) {
      throw new Error("unitPrice debe ser >= 0");
    }
  }
  if (data.taxRate != null && (data.taxRate < 0 || data.taxRate > 1)) {
    throw new Error("taxRate debe estar entre 0 y 1");
  }
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId, workspaceId }
  });
  if (!contact) throw new Error("Contacto no encontrado");
  const productIds = data.lineItems.map((li) => li.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, workspaceId, isActive: true }
  });
  if (products.length !== productIds.length) {
    throw new Error("Uno o m\xE1s productos no encontrados o inactivos");
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  const enrichedLineItems = data.lineItems.map((li) => {
    const product = productMap.get(li.productId);
    const unitPrice = li.unitPrice !== void 0 ? li.unitPrice : Number(product.price);
    const subtotal2 = unitPrice * li.qty;
    return {
      productId: li.productId,
      productName: product.name,
      sku: product.sku ?? null,
      qty: li.qty,
      unitPrice,
      subtotal: subtotal2
    };
  });
  const subtotal = enrichedLineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const taxRate = data.taxRate ?? 0;
  const total = subtotal * (1 + taxRate);
  const invoice = await prisma.$transaction(async (tx) => {
    const lastInvoice = await tx.invoice.findFirst({
      where: { workspaceId },
      orderBy: { number: "desc" },
      select: { number: true }
    });
    const lastNum = lastInvoice ? parseInt(lastInvoice.number.replace(/\D/g, ""), 10) || 0 : 0;
    const nextNum = lastNum + 1;
    const number = `INV-${String(nextNum).padStart(4, "0")}`;
    return tx.invoice.create({
      data: {
        workspaceId,
        contactId: data.contactId,
        dealId: data.dealId ?? null,
        number,
        lineItems: enrichedLineItems,
        subtotal,
        taxRate,
        total,
        currency: data.currency ?? "CLP"
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } }
      }
    });
  });
  return invoice;
}
async function listInvoices(workspaceId) {
  return prisma.invoice.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, name: true, email: true } }
    }
  });
}

// src/modules/payments/invoices.routes.ts
var router38 = (0, import_express38.Router)();
router38.post("/invoices", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const invoice = await createInvoice(workspaceId, req.body);
    res.status(201).json(invoice);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("no encontrado") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});
router38.get("/invoices", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const invoices = await listInvoices(workspaceId);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
var invoices_routes_default = router38;

// src/modules/webhooks/email.webhook.routes.ts
var import_crypto6 = __toESM(require("crypto"));
var import_express39 = require("express");
init_prisma();

// src/modules/messaging/channels/email.inbound.service.ts
init_prisma();
init_message_service();
function parseSenderEmail(raw) {
  const match = /^(.+?)\s*<([^>]+)>/.exec(raw.trim());
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: raw.trim(), email: raw.trim() };
}
function isPostmark(payload) {
  return "TextBody" in payload;
}
function isResend(payload) {
  return "text" in payload && "from" in payload;
}
async function handleInboundEmail(workspaceId, payload) {
  let fromRaw;
  let messageId;
  let textBody;
  if (isPostmark(payload)) {
    fromRaw = String(payload["From"] ?? payload["from"] ?? "");
    messageId = String(payload["MessageID"] ?? payload["messageId"] ?? "");
    textBody = String(payload["TextBody"] ?? "");
  } else if (isResend(payload)) {
    fromRaw = String(payload["from"] ?? "");
    messageId = String(payload["email_id"] ?? payload["id"] ?? "");
    textBody = String(payload["text"] ?? "");
  } else {
    console.warn("[email.inbound] Unknown provider payload shape for workspace", workspaceId);
    return false;
  }
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: "EMAIL" },
    select: { id: true }
  });
  if (!channel) {
    return false;
  }
  const { email, name } = parseSenderEmail(fromRaw);
  const contact = await prisma.contact.upsert({
    where: { workspaceId_email: { workspaceId, email } },
    create: {
      workspaceId,
      name: name || email,
      email,
      source: "MANUAL",
      status: "LEAD"
    },
    update: {},
    select: { id: true }
  });
  await processInboundMessage({
    workspaceId,
    channelId: channel.id,
    externalConversationId: email,
    externalMessageId: messageId || email,
    senderExternalId: email,
    contactId: contact.id,
    senderName: name || email,
    content: textBody,
    mediaUrl: void 0,
    mediaType: void 0
  });
  return true;
}

// src/modules/webhooks/email.webhook.routes.ts
var emailWebhookRouter = (0, import_express39.Router)();
function secretMatches(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return import_crypto6.default.timingSafeEqual(a, b);
}
emailWebhookRouter.post("/email/inbound", async (req, res) => {
  const workspaceId = req.query["workspaceId"];
  if (!workspaceId) {
    return res.status(400).json({ error: "workspaceId query param is required" });
  }
  try {
    const channel = await prisma.channel.findFirst({
      where: { workspaceId, platform: "EMAIL" },
      select: { config: true }
    });
    const config = channel?.config && typeof channel.config === "object" ? channel.config : {};
    const expectedSecret = typeof config["webhookSecret"] === "string" ? config["webhookSecret"] : "";
    if (expectedSecret) {
      const provided = req.headers["x-webhook-secret"] ?? "";
      if (!secretMatches(provided, expectedSecret)) {
        return res.status(401).json({ error: "Invalid webhook secret" });
      }
    } else {
      console.warn(
        "[email.webhook] No webhookSecret configured for workspace",
        workspaceId,
        "\u2014 accepting unauthenticated inbound email"
      );
    }
    await handleInboundEmail(workspaceId, req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[email.webhook] Error processing inbound email:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// src/modules/webhooks/sms.webhook.routes.ts
var import_express40 = require("express");

// src/modules/messaging/channels/sms.inbound.service.ts
var import_crypto7 = __toESM(require("crypto"));
init_prisma();
init_message_service();
function validateTwilioSignature(authToken, signature, url, params) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k] ?? ""}`).join("");
  const expected = import_crypto7.default.createHmac("sha1", authToken).update(url + paramString).digest("base64");
  try {
    return import_crypto7.default.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
async function handleInboundSms(workspaceId, params, twilioSignature, requestUrl) {
  try {
    const channel = await prisma.channel.findFirst({
      where: { workspaceId, platform: "SMS" },
      select: { id: true, config: true }
    });
    if (!channel) {
      return "no_channel";
    }
    const config = channel.config && typeof channel.config === "object" ? channel.config : {};
    const authToken = config["authToken"] ?? config["auth_token"] ?? "";
    const isValid = validateTwilioSignature(authToken, twilioSignature, requestUrl, params);
    if (!isValid) {
      return "invalid_signature";
    }
    await processInboundMessage({
      workspaceId,
      channelId: channel.id,
      externalConversationId: params.From,
      externalMessageId: params.MessageSid,
      senderExternalId: params.From,
      senderName: params.From,
      content: params.Body,
      mediaUrl: void 0,
      mediaType: void 0
    });
    return "ok";
  } catch (err) {
    console.error("[sms.inbound] Error processing inbound SMS:", err);
    return "error";
  }
}

// src/modules/webhooks/sms.webhook.routes.ts
var smsWebhookRouter = (0, import_express40.Router)();
smsWebhookRouter.post(
  "/sms/inbound",
  (0, import_express40.urlencoded)({ extended: false }),
  async (req, res) => {
    const workspaceId = req.query["workspaceId"];
    if (!workspaceId) {
      return res.status(400).type("text/xml").send("<Response></Response>");
    }
    const twilioSignature = req.headers["x-twilio-signature"] ?? "";
    const params = req.body;
    const requestUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const result = await handleInboundSms(workspaceId, params, twilioSignature, requestUrl);
    if (result === "invalid_signature") {
      return res.status(403).type("text/xml").send("<Response></Response>");
    }
    return res.status(200).type("text/xml").send("<Response></Response>");
  }
);

// src/modules/unsubscribe/unsubscribe.routes.ts
var import_express41 = require("express");
init_unsubscribe_service();
var unsubscribeRouter = (0, import_express41.Router)();
unsubscribeRouter.get("/:token", async (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(400).send(renderUnsubscribePage(false, "Token no proporcionado."));
  }
  try {
    await processUnsubscribe(token);
    return res.status(200).send(renderUnsubscribePage(true));
  } catch (err) {
    if (err instanceof Error && (err.message === "Invalid token format" || err.message === "Invalid token signature")) {
      return res.status(400).send(renderUnsubscribePage(false));
    }
    if (err?.code === "P2025") {
      return res.status(400).send(renderUnsubscribePage(false));
    }
    console.error("[unsubscribe] Unexpected error:", err);
    return res.status(500).send(renderUnsubscribePage(false, "Error interno. Int\xE9ntalo m\xE1s tarde."));
  }
});

// src/modules/ai-agent/followup.cron.ts
var import_node_cron = __toESM(require("node-cron"));
init_followup_service();
function startFollowUpCron() {
  import_node_cron.default.schedule("*/15 * * * *", () => {
    processDueFollowUps().catch((err) => console.error("[Cron: FollowUp] Unhandled error:", err));
  });
  console.log("[FollowUpCron] Scheduled every 15 minutes");
}

// src/modules/analytics/analytics.cron.ts
var import_node_cron2 = __toESM(require("node-cron"));
init_prisma();
function yesterdayUTC() {
  const d = /* @__PURE__ */ new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
async function runDailyAggregation() {
  const exists = await checkTablesExist();
  if (!exists) {
    console.warn("[AnalyticsCron] Tables not found. Database might be syncing. Skipping aggregation.");
    return;
  }
  const dateStr = yesterdayUTC();
  console.log(`[AnalyticsCron] Running aggregation for ${dateStr}`);
  try {
    const channels = await prisma.channel.findMany({
      where: { status: { not: "DISCONNECTED" } },
      select: { id: true, workspaceId: true }
    });
    let ok = 0;
    let failed = 0;
    for (const ch of channels) {
      try {
        await aggregateChannelSnapshot(ch.workspaceId, ch.id, dateStr);
        ok++;
      } catch (err) {
        failed++;
        console.error(`[AnalyticsCron] Failed for channel ${ch.id}:`, err);
      }
    }
    console.log(`[AnalyticsCron] Done \u2014 ${ok} ok, ${failed} failed`);
  } catch (err) {
    console.error("[AnalyticsCron] Error fetching channels:", err.message);
  }
}
function startAnalyticsCron() {
  import_node_cron2.default.schedule("0 1 * * *", () => {
    runDailyAggregation().catch(
      (err) => console.error("[AnalyticsCron] Unhandled error:", err)
    );
  }, { timezone: "UTC" });
  console.log("[AnalyticsCron] Scheduled daily at 01:00 UTC");
}

// src/modules/automation/automation.cron.ts
var import_node_cron3 = __toESM(require("node-cron"));
init_prisma();
init_executor();
function startWorkflowCron() {
  import_node_cron3.default.schedule("* * * * *", async () => {
    try {
      const due = await prisma.workflowRun.findMany({
        where: { status: "WAITING", resumeAt: { lte: /* @__PURE__ */ new Date() } },
        select: { id: true },
        take: 100
      });
      for (const run of due) {
        await resumeRun(run.id).catch((err) => console.error("[Cron: Workflow] resume error:", err));
      }
    } catch (err) {
      console.error("[Cron: Workflow] Unhandled error:", err);
    }
  });
  console.log("[WorkflowCron] Scheduled every minute");
}

// src/modules/campaigns/campaigns.cron.ts
var import_node_cron4 = __toESM(require("node-cron"));
init_prisma();
init_campaigns_service();
function startCampaignsCron() {
  import_node_cron4.default.schedule("* * * * *", () => {
    prisma.campaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: /* @__PURE__ */ new Date() } },
      select: { id: true, workspaceId: true }
    }).then((due) => {
      for (const c of due) {
        sendCampaign(c.workspaceId, c.id).catch(
          (err) => console.error(`[Cron: Campaigns] Failed to send campaign ${c.id}:`, err)
        );
      }
    }).catch((err) => console.error("[Cron: Campaigns] Query error:", err));
  });
  console.log("[CampaignsCron] Scheduled every minute");
}

// src/app.ts
var app = (0, import_express42.default)();
app.use((0, import_helmet.default)());
var allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map((o) => o.trim()),
  ...process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",").map((o) => o.trim()) : []
].filter(Boolean);
app.use((0, import_cors.default)({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use((0, import_compression.default)());
app.use("/webhooks/shopify", import_express42.default.raw({ type: "application/json" }));
app.use("/api/webhooks/whatsapp", import_express42.default.raw({ type: "application/json" }));
app.use("/api/webhooks/instagram", import_express42.default.raw({ type: "application/json" }));
app.use(
  "/api/webhooks/meta",
  import_express42.default.raw({ type: "application/json" }),
  (req, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      ;
      req.rawBody = req.body;
      try {
        req.body = JSON.parse(req.body.toString());
      } catch {
        req.body = {};
      }
    }
    next();
  }
);
app.use(import_express42.default.json({ limit: "15mb" }));
app.use("/webhooks", emailWebhookRouter);
app.use("/webhooks", smsWebhookRouter);
app.use("/unsubscribe", unsubscribeRouter);
app.use("/health", health_default);
app.use("/api/auth", auth_default);
app.use("/api/shopify", shopify_default);
app.use("/api/meta", meta_default);
app.use("/api/google", google_default);
app.use("/api/tiktok", tiktok_default);
app.use("/api/dropi", dropi_default);
app.use("/api/metrics", metrics_default);
app.use("/api/oauth", oauth_default);
app.use("/api/ia", valentina_default);
app.use("/api/settings", settings_default);
app.use("/api/users", users_default);
app.use("/api/admin", admin_default);
app.use("/api/logs", logs_default);
app.use("/api/onboarding", onboarding_default);
app.use("/api/payments", payments_default);
app.use("/api", bot_routes_default);
app.use("/api", crm_routes_default);
app.use("/api", forecast_routes_default);
app.use("/api", timeline_routes_default);
app.use("/api", segments_routes_default);
app.use("/api", forms_routes_default);
app.use("/api", contactValue_routes_default);
app.use("/api", payment_links_routes_default);
app.use("/api", automation_routes_default);
app.use("/api", campaigns_routes_default);
app.use("/api", messaging_routes_default);
app.use("/api", quickReplies_routes_default);
app.use("/api", analytics_routes_default);
app.use("/api", knowledge_routes_default);
app.use("/api", scheduling_routes_default);
app.use("/api/public", public_booking_routes_default);
app.use("/api/public", public_forms_routes_default);
app.use("/api/public", payment_links_webhook_default);
app.use("/api/composio", composio_default);
app.use("/api/integrations/google-calendar", google_calendar_routes_default);
app.use("/api", products_routes_default);
app.use("/api", invoices_routes_default);
startAnalyticsCron();
startFollowUpCron();
startWorkflowCron();
startCampaignsCron();
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});
var app_default = app;

// src/index.ts
init_socket();

// src/modules/messaging/socket.handler.ts
var import_jsonwebtoken6 = __toESM(require("jsonwebtoken"));
init_prisma();
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("AUTH_REQUIRED"));
    try {
      const payload = import_jsonwebtoken6.default.verify(token, process.env.JWT_SECRET);
      const userId = payload.id ?? payload.userId;
      if (!userId) return next(new Error("INVALID_TOKEN"));
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, workspaceId: true }
      });
      if (!user?.workspaceId) return next(new Error("NO_WORKSPACE"));
      socket.userId = user.id;
      socket.workspaceId = user.workspaceId;
      next();
    } catch {
      next(new Error("INVALID_TOKEN"));
    }
  });
  io.on("connection", (socket) => {
    const { userId, workspaceId } = socket;
    socket.join(`workspace:${workspaceId}`);
    socket.on("conversation:join", (conversationId) => {
      if (typeof conversationId !== "string" || !UUID_REGEX.test(conversationId)) return;
      socket.join(`workspace:${workspaceId}:conv:${conversationId}`);
      io.to(`workspace:${workspaceId}`).emit("agent:viewing", { conversationId, userId });
    });
    socket.on("conversation:leave", (conversationId) => {
      if (typeof conversationId !== "string" || !UUID_REGEX.test(conversationId)) return;
      socket.leave(`workspace:${workspaceId}:conv:${conversationId}`);
    });
  });
}

// src/index.ts
console.log("DEBUG: DATABASE_URL =", process.env.DATABASE_URL);
if (!process.env.JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set");
  process.exit(1);
}
var PORT = process.env.PORT || 4e3;
async function startServer() {
  await waitForDb();
  const httpServer = (0, import_http.createServer)(app_default);
  const io = initSocket(httpServer);
  registerSocketHandlers(io);
  httpServer.listen(PORT, () => {
    console.log(`[Server] API running on http://127.0.0.1:${PORT}`);
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  });
}
startServer().catch((err) => {
  console.error("[FATAL] Failed to start server:", err);
  process.exit(1);
});
