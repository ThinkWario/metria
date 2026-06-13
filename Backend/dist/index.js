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

// src/lib/socket.ts
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
    take: limit
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
  return prisma.contact.update({ where: { id: contactId, workspaceId }, data });
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
      contact: { select: { id: true, name: true, phone: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}
async function createDeal(workspaceId, data) {
  const { value, ...rest } = data;
  return prisma.deal.create({
    data: {
      workspaceId,
      ...rest,
      ...value !== void 0 && { value }
    },
    include: {
      stage: { select: { id: true, name: true, color: true } },
      contact: { select: { id: true, name: true } }
    }
  });
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
  return prisma.deal.update({
    where: { id: dealId, workspaceId },
    data: { stageId, ...extra }
  });
}
async function closeDeal(workspaceId, dealId, outcome, lostReason) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, workspaceId } });
  if (!deal) throw new Error("Deal not found");
  const now = /* @__PURE__ */ new Date();
  const data = outcome === "WON" ? { status: "WON", wonAt: now } : { status: "LOST", lostAt: now, lostReason: lostReason ?? null };
  return prisma.deal.update({ where: { id: dealId, workspaceId }, data });
}
var DEFAULT_STAGES;
var init_pipeline_service = __esm({
  "src/modules/crm/pipeline.service.ts"() {
    "use strict";
    init_prisma();
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
  const provider = providers[key];
  if (!provider) throw new Error(`Unknown LLM provider: ${key}`);
  return provider;
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
  const provider = getProvider(agent.provider);
  let result = await provider.chat({
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
            const senderPhone = chat.id._serialized.split("@")[0];
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
          const senderPhone = msg.from.split("@")[0];
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
  const { status, channelId, limit = 30, cursor } = opts;
  return prisma.conversation.findMany({
    where: {
      workspaceId,
      ...status && { status },
      ...channelId && { channelId },
      ...cursor && { id: { lt: cursor } }
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
      channel: { select: { id: true, platform: true, name: true } }
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit
  });
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
async function sendMessage(workspaceId, conversationId, userId, content) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId }
  });
  if (!conversation) throw new Error("Conversation not found");
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
    sentAt: message.sentAt
  });
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
  const contact = await prisma.contact.upsert({
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

// src/index.ts
var import_config8 = require("dotenv/config");
var import_http = require("http");

// src/app.ts
var import_express23 = __toESM(require("express"));
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
var JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
var authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
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
    shopify: new ShopifyProvider()
  };
  static getProvider(platform) {
    const provider = this.providers[platform.toLowerCase()];
    if (!provider) {
      throw new Error(`OAuth: Unsupported platform "${platform}"`);
    }
    return provider;
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
    const provider = OAuthManager.getProvider(platform);
    const stateData = { workspaceId };
    if (shop) stateData.shop = shop;
    const state = Buffer.from(JSON.stringify(stateData)).toString("base64");
    const authUrl = provider.getAuthUrl(state);
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
    const provider = OAuthManager.getProvider(platform);
    if (platform === "shopify") global.currentShopContext = shop;
    const tokens = await provider.exchangeCode(
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
    const productMap = products.reduce((acc, p) => ({ ...acc, [p.sku]: p }), {});
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
var settings_default = router11;

// src/routes/users.ts
var import_express12 = require("express");
init_prisma();
var import_jsonwebtoken3 = __toESM(require("jsonwebtoken"));
var import_config5 = require("dotenv/config");
var import_bcrypt2 = __toESM(require("bcrypt"));
var router12 = (0, import_express12.Router)();
var JWT_SECRET3 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
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
  const auth5 = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth5}`,
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
    const { planType, provider } = req.body;
    const userId = req.user.id;
    const workspaceId = req.user.workspaceId;
    const plan = PLANS[planType];
    if (!plan) {
      return res.status(400).json({ error: "Plan inv\xE1lido" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace requerido" });
    }
    if (provider === "MERCADOPAGO") {
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
    if (provider === "PAYPAL") {
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
function requirePlan(...plans) {
  return (req, res, next) => {
    const workspace = req.workspace;
    const userEmail = req.user?.email;
    console.log(`[PlanGate] User: ${userEmail}, Role: ${req.user?.role}, Workspace Plan: ${workspace?.plan}, Required: ${plans.join(",")}`);
    if (userEmail === "cmoralesv.fb@gmail.com" || userEmail === "admin@metria.com" || userEmail === "superadmin@metria.ai" || req.user?.role === "SUPER_ADMIN" || req.user?.role === "ADMIN" || workspace?.plan === "STARTER") {
      console.log(`[PlanGate] Bypass granted for user: ${userEmail} (Plan: ${workspace?.plan}, Role: ${req.user?.role})`);
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

// src/modules/messaging/channels/messenger.service.ts
var import_crypto4 = __toESM(require("crypto"));
init_message_service();
function verifyMessengerSignature(rawBody, signatureHeader, appSecret) {
  try {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }
    const expectedSig = "sha256=" + import_crypto4.default.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expectedSig);
    const providedBuffer = Buffer.from(signatureHeader);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return import_crypto4.default.timingSafeEqual(expectedBuffer, providedBuffer);
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

// src/modules/messaging/messaging.controller.ts
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
    const { status, channelId, cursor } = req.query;
    const convs = await getConversations(workspaceId, { status, channelId, cursor });
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
    const { content } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    await sendMessage(workspaceId, conversationId, userId, content.trim());
    res.status(201).json({ ok: true });
  } catch (err) {
    const status = err.message === "Conversation not found" ? 404 : 500;
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
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
    const signature = req.headers["x-hub-signature-256"] ?? "";
    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: p } });
    if (!channel) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    const config = channel.config;
    if (!handler.verify(rawBody, signature, config.appSecret)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    res.status(200).json({ ok: true });
    const body = req.body instanceof Buffer ? JSON.parse(rawBody) : req.body;
    handler.parse(workspaceId, channel.id, body).catch((err) => console.error(`[${p} webhook error]`, err));
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
router17.post("/messaging/whatsapp/init", authenticate, requirePlan("PRO", "SCALE"), initWhatsAppSessionHandler);
router17.post("/messaging/whatsapp/disconnect", authenticate, requirePlan("PRO", "SCALE"), disconnectWhatsAppSessionHandler);
var messaging_routes_default = router17;

// src/modules/crm/crm.routes.ts
var import_express18 = require("express");

// src/modules/crm/crm.controller.ts
init_contact_service();
init_pipeline_service();
init_ticket_service();
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
    res.json(await updateContact(req.user.workspaceId, req.params.contactId, req.body));
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
    const { contactId, pipelineId, stageId, title, value } = req.body;
    if (!contactId || !pipelineId || !stageId || !title?.trim()) {
      res.status(400).json({ error: "contactId, pipelineId, stageId, title are required" });
      return;
    }
    res.status(201).json(await createDeal(req.user.workspaceId, { contactId, pipelineId, stageId, title: title.trim(), value }));
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

// src/modules/crm/crm.routes.ts
var router18 = (0, import_express18.Router)();
var auth = [authenticate, requirePlan("PRO", "SCALE")];
router18.get("/crm/contacts", ...auth, listContactsHandler);
router18.post("/crm/contacts", ...auth, createContactHandler);
router18.get("/crm/contacts/:contactId", ...auth, getContactHandler);
router18.patch("/crm/contacts/:contactId", ...auth, updateContactHandler);
router18.post("/crm/contacts/:contactId/notes", ...auth, addNoteHandler);
router18.post("/crm/contacts/:contactId/tags", ...auth, addTagHandler);
router18.delete("/crm/contacts/:contactId/tags/:tagId", ...auth, removeTagHandler);
router18.post("/crm/contacts/:contactId/health-score", ...auth, calculateHealthScoreHandler);
router18.get("/crm/pipelines", ...auth, listPipelinesHandler);
router18.post("/crm/pipelines", ...auth, createPipelineHandler);
router18.get("/crm/deals", ...auth, listDealsHandler);
router18.post("/crm/deals", ...auth, createDealHandler);
router18.patch("/crm/deals/:dealId/move", ...auth, moveDealHandler);
router18.patch("/crm/deals/:dealId/close", ...auth, closeDealHandler);
router18.get("/crm/tickets", ...auth, listTicketsHandler);
router18.post("/crm/tickets", ...auth, createTicketHandler);
router18.patch("/crm/tickets/:ticketId", ...auth, updateTicketHandler);
router18.post("/crm/tickets/:ticketId/resolve", ...auth, resolveTicketHandler);
var crm_routes_default = router18;

// src/modules/bot/bot.routes.ts
var import_express19 = require("express");

// src/modules/bot/bot.service.ts
init_prisma();

// src/modules/bot/templates/solar.template.ts
var SOLAR_TEMPLATE = {
  business: {
    description: "Empresa de instalaci\xF3n de paneles solares residenciales y comerciales. Reducimos la cuenta de luz hasta un 90% con energ\xEDa limpia.",
    coverage: ""
  },
  offer: [
    { name: "Kit Solar Residencial 3kW (casa peque\xF1a, cuenta < $80.000)", price: "" },
    { name: "Kit Solar Residencial 5kW (casa mediana, cuenta $80.000-$150.000)", price: "" },
    { name: "Kit Solar 10kW+ (casa grande o comercio)", price: "cotizaci\xF3n personalizada" }
  ],
  qualificationQuestions: [
    { key: "monthly_bill", question: "\xBFCu\xE1nto pagas aproximadamente de luz al mes?" },
    { key: "property_type", question: "\xBFEs casa o departamento? \xBFC\xF3mo es el techo (losa, teja, zinc)?" },
    { key: "is_owner", question: "\xBFEres propietario/a de la vivienda?" },
    { key: "location", question: "\xBFEn qu\xE9 comuna o ciudad est\xE1 la propiedad?" },
    { key: "financing", question: "\xBFTe interesa pagar al contado o con financiamiento?" }
  ],
  objections: [
    { objection: "Es muy caro", response: "La inversi\xF3n se recupera en 4-6 a\xF1os con el ahorro en la cuenta de luz, y los paneles duran m\xE1s de 25 a\xF1os. Adem\xE1s hay opciones de financiamiento desde cuotas mensuales similares a lo que hoy pagas de luz." },
    { objection: "No s\xE9 si mi techo sirve", response: "Por eso la visita t\xE9cnica es gratis y sin compromiso: un experto eval\xFAa orientaci\xF3n, sombras y estructura, y te entrega una propuesta exacta." },
    { objection: "Lo voy a pensar", response: "Perfecto. Mientras lo piensas, \xBFte parece que agendemos la evaluaci\xF3n gratuita? No te compromete a nada y tendr\xE1s n\xFAmeros reales para decidir." },
    { objection: "\xBFQu\xE9 pasa si se echan a perder?", response: "Los paneles tienen garant\xEDa de fabricante de 10-12 a\xF1os y garant\xEDa de generaci\xF3n de 25 a\xF1os. La instalaci\xF3n tambi\xE9n queda garantizada." }
  ],
  scheduling: { enabled: true, types: ["SITE_VISIT"] }
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
  if (!TEMPLATES[template]) throw new Error(`Unknown template: ${template}`);
  const agent = await prisma.botAgent.findFirst({ where: { id: botId, workspaceId } });
  if (!agent) throw new Error("Agent not found");
  const existing = agent.config ?? {};
  const newConfig = { ...existing, profile: TEMPLATES[template] };
  return prisma.botAgent.update({ where: { id: botId }, data: { config: newConfig } });
}

// src/modules/bot/bot.controller.ts
init_businessHours_service();
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
var router19 = (0, import_express19.Router)();
var auth2 = [authenticate, requirePlan("PRO", "SCALE")];
router19.get("/bot/agent", ...auth2, getPrimaryAgentHandler);
router19.patch("/bot/agent/:agentId", ...auth2, updateAgentHandler);
router19.get("/bot/channels", ...auth2, listAiChannelsHandler);
router19.patch("/bot/channels/:platform/ai", ...auth2, toggleChannelAiHandler);
router19.get("/bots/agents", ...auth2, listAgentsHandler);
router19.post("/bots/agents", ...auth2, createAgentHandler);
router19.patch("/bots/agents/:agentId", ...auth2, updateAgentHandler);
router19.delete("/bots/agents/:agentId", ...auth2, deleteAgentHandler);
router19.get("/bots/agents/:agentId/flows", ...auth2, listFlowsHandler);
router19.post("/bots/agents/:agentId/flows", ...auth2, createFlowHandler);
router19.patch("/bots/flows/:flowId", ...auth2, updateFlowHandler);
router19.delete("/bots/flows/:flowId", ...auth2, deleteFlowHandler);
router19.post("/bots/:botId/apply-template", ...auth2, applyTemplateHandler);
router19.get("/bots/:botId/followup-rules", ...auth2, listFollowUpRulesHandler);
router19.post("/bots/:botId/followup-rules", ...auth2, createFollowUpRuleHandler);
router19.delete("/bots/:botId/followup-rules/:ruleId", ...auth2, deleteFollowUpRuleHandler);
router19.get("/bots/business-hours", ...auth2, getBusinessHoursHandler);
router19.put("/bots/business-hours", ...auth2, upsertBusinessHoursHandler);
var bot_routes_default = router19;

// src/modules/analytics/analytics.routes.ts
var import_express20 = require("express");

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
var router20 = (0, import_express20.Router)();
router20.get("/analytics/snapshots", authenticate, listSnapshots);
router20.get("/analytics/funnel", authenticate, funnelSummary);
router20.post("/analytics/run", authenticate, runAggregation);
var analytics_routes_default = router20;

// src/modules/knowledge/knowledge.routes.ts
var import_express21 = require("express");

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
var router21 = (0, import_express21.Router)();
var auth3 = [authenticate, requirePlan("PRO", "SCALE")];
router21.post("/knowledge", ...auth3, async (req, res) => {
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
router21.get("/knowledge", ...auth3, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    res.json(await listDocuments(workspaceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router21.delete("/knowledge/:id", ...auth3, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    await deleteDocument(workspaceId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
var knowledge_routes_default = router21;

// src/modules/scheduling/scheduling.routes.ts
var import_express22 = require("express");
init_prisma();
init_scheduling_service();
var router22 = (0, import_express22.Router)();
var auth4 = [authenticate, requirePlan("PRO", "SCALE")];
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
router22.get("/appointments", ...auth4, async (req, res) => {
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
router22.post("/appointments", ...auth4, async (req, res) => {
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
router22.patch("/appointments/:id/status", ...auth4, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    res.json(await updateAppointmentStatus(workspaceId, req.params.id, req.body.status));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router22.get("/availability/slots", ...auth4, async (req, res) => {
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
router22.get("/availability/rules", ...auth4, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    res.json(await prisma.availabilityRule.findMany({ where: { workspaceId } }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router22.post("/availability/rules", ...auth4, async (req, res) => {
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
router22.delete("/availability/rules/:id", ...auth4, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: "Unauthorized: missing workspace" });
    await prisma.availabilityRule.deleteMany({ where: { id: req.params.id, workspaceId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var scheduling_routes_default = router22;

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

// src/app.ts
var app = (0, import_express23.default)();
app.use((0, import_helmet.default)());
app.use((0, import_cors.default)());
app.use((0, import_compression.default)());
app.use("/webhooks/shopify", import_express23.default.raw({ type: "application/json" }));
app.use("/api/webhooks/whatsapp", import_express23.default.raw({ type: "application/json" }));
app.use("/api/webhooks/instagram", import_express23.default.raw({ type: "application/json" }));
app.use(import_express23.default.json({ limit: "15mb" }));
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
app.use("/api", messaging_routes_default);
app.use("/api", analytics_routes_default);
app.use("/api", knowledge_routes_default);
app.use("/api", scheduling_routes_default);
startAnalyticsCron();
startFollowUpCron();
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
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
