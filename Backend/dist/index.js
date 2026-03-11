"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/index.ts
var import_config6 = require("dotenv/config");

// src/app.ts
var import_express12 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));
var import_compression = __toESM(require("compression"));

// src/routes/health.ts
var import_express = require("express");

// src/lib/prisma.ts
var import_client = require("@prisma/client");
var prismaClientSingleton = () => {
  return new import_client.PrismaClient();
};
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? prismaClientSingleton();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

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

// src/routes/health.ts
var router = (0, import_express.Router)();
router.get("/", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      db: "connected",
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
var import_config3 = require("dotenv/config");

// src/middleware/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var import_config2 = require("dotenv/config");
var JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
var authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

// src/routes/auth.ts
var router2 = (0, import_express2.Router)();
var JWT_SECRET2 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
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
    if (user.passwordHash !== password) {
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
      { id: user.id, email: user.email, role: user.role, workspaceId: user.workspaceId },
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
    const user = await prisma.user.findUnique({ where: { id: userReq.id } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPassword,
        mustChangePassword: false
      }
    });
    const token = import_jsonwebtoken2.default.sign(
      { id: user.id, email: user.email, role: user.role, workspaceId: user.workspaceId },
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
var auth_default = router2;

// src/routes/shopify.ts
var import_express3 = require("express");
var import_crypto = __toESM(require("crypto"));

// src/lib/logger.ts
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
    const newOrder = await prisma.order.upsert({
      where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
      update: {
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        updatedAt: new Date(order.updated_at)
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
        lineItems: order.line_items.map((item) => ({ title: item.title, sku: item.sku, quantity: item.quantity })),
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
    const orders = await prisma.order.findMany({
      where: { workspaceId },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" }
    });
    const total = await prisma.order.count({ where: { workspaceId } });
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
    const response = await fetch(`https://${domain}/admin/api/2024-01/orders.json?status=any&limit=250`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("Shopify Sync API Error:", response.status, errText);
      return res.status(response.status).json({ error: "Failed to fetch from Shopify API", details: errText });
    }
    const data = await response.json();
    const orders = data.orders || [];
    let processed = 0;
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
          financialStatus: order.financial_status,
          fulfillmentStatus: order.fulfillment_status,
          updatedAt: new Date(order.updated_at)
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
          lineItems: order.line_items.map((item) => ({ title: item.title, sku: item.sku, quantity: item.quantity, price: parseFloat(item.price || 0) })),
          createdAt: new Date(order.created_at)
        }
      });
      processed++;
    }
    for (const [dateStr, revenue] of Object.entries(dailyRevenues)) {
      const dateObj = new Date(dateStr);
      const existing = await prisma.dailyMetric.findUnique({
        where: { workspaceId_date: { workspaceId, date: dateObj } }
      });
      if (existing) {
        await prisma.dailyMetric.update({
          where: { id: existing.id },
          data: {
            totalRevenue: revenue,
            netProfit: Number(revenue) - Number(existing.metaAdSpend) - Number(existing.googleAdSpend) - Number(existing.totalShipping) - Number(existing.totalCogs)
          }
        });
      } else {
        await prisma.dailyMetric.create({
          data: {
            workspaceId,
            date: dateObj,
            totalRevenue: revenue,
            metaAdSpend: 0,
            googleAdSpend: 0,
            totalShipping: 0,
            totalCogs: 0,
            netProfit: revenue
          }
        });
      }
    }
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSync: /* @__PURE__ */ new Date(), status: "Connected" }
    });
    await createAuditLog({
      workspaceId,
      source: "Shopify",
      event: "Sync",
      status: "200 OK",
      message: `Sincronizadas ${processed} \xF3rdenes con \xE9xito.`
    });
    return res.status(200).json({ success: true, count: processed });
  } catch (error) {
    console.error("Shopify Sync Error:", error);
    return res.status(500).json({ error: "Internal server error while syncing Shopify" });
  }
});
var shopify_default = router3;

// src/routes/meta.ts
var import_express4 = require("express");

// src/middleware/cache.ts
var cacheMiddleware = (ttlSeconds) => {
  return async (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    const key = `cache:${req.originalUrl || req.url}`;
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
var CACHE_TTL = {
  MINUTE_1: 60,
  MINUTE_5: 300,
  HOUR_1: 3600,
  DAY_1: 86400
};

// src/routes/meta.ts
var router4 = (0, import_express4.Router)();
router4.post("/sync", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "META" } }
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
    const response = await fetch(`https://graph.facebook.com/v20.0/act_${adAccountId}/insights?level=campaign&time_preset=last_30d&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,action_values&access_token=${accessToken}`);
    if (!response.ok) {
      const errText = await response.text();
      console.error("Meta Sync API Error:", response.status, errText);
      return res.status(response.status).json({ error: "Failed to fetch from Meta Graph API", details: errText });
    }
    const data = await response.json();
    const insights = data.data || [];
    let processed = 0;
    const dailySpends = {};
    for (const row of insights) {
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const spend = parseFloat(row.spend || "0");
      dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend;
      const conversionsAction = row.actions?.find((a) => a.action_type === "purchase");
      const conversions = conversionsAction ? parseInt(conversionsAction.value) : 0;
      const conversionValueAction = row.action_values?.find((a) => a.action_type === "purchase");
      const conversionValue = conversionValueAction ? parseFloat(conversionValueAction.value) : 0;
      await prisma.adSpend.upsert({
        where: { workspaceId_platform_campaignId_date: { workspaceId, platform: "META", campaignId: row.campaign_id, date: new Date(dateStr) } },
        update: {
          campaignName: row.campaign_name,
          spend,
          impressions: parseInt(row.impressions || "0"),
          clicks: parseInt(row.clicks || "0"),
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
          clicks: parseInt(row.clicks || "0"),
          conversions,
          conversionValue,
          date: new Date(dateStr)
        }
      });
      processed++;
    }
    for (const [dateStr, spend] of Object.entries(dailySpends)) {
      const dateObj = new Date(dateStr);
      const existing = await prisma.dailyMetric.findUnique({ where: { workspaceId_date: { workspaceId, date: dateObj } } });
      if (existing) {
        await prisma.dailyMetric.update({
          where: { id: existing.id },
          data: {
            metaAdSpend: spend,
            netProfit: Number(existing.totalRevenue) - spend - Number(existing.googleAdSpend) - Number(existing.totalShipping) - Number(existing.totalCogs)
          }
        });
      } else {
        await prisma.dailyMetric.create({
          data: {
            workspaceId,
            date: dateObj,
            totalRevenue: 0,
            metaAdSpend: spend,
            googleAdSpend: 0,
            totalShipping: 0,
            totalCogs: 0,
            netProfit: -spend
          }
        });
      }
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
      message: `Sincronizadas ${processed} anal\xEDticas de campa\xF1as de Meta Ads.`
    });
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
    const campaigns = await prisma.adSpend.groupBy({
      by: ["campaignId", "campaignName"],
      where: { workspaceId, platform: "META" },
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
        // Mocked status as we don't store it yet
        spend,
        cpa: conversions > 0 ? spend / conversions : 0,
        roas: spend > 0 ? conversionValue / spend : 0,
        cpp: conversions > 0 ? spend / conversions : 0
        // Mocked CPP match
      };
    });
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router4.get("/creatives", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
  return res.status(200).json([
    { name: "Video UGC 1", roas: 4.2 },
    { name: "Carrusel Est\xE1tico", roas: 2.1 },
    { name: "Video Unboxing", roas: 3.8 },
    { name: "Imagen Beneficios", roas: 1.5 }
  ]);
});
var meta_default = router4;

// src/routes/google.ts
var import_express5 = require("express");
var router5 = (0, import_express5.Router)();
router5.post("/sync", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const integration = await prisma.integration.findUnique({
      where: { workspaceId_platform: { workspaceId, platform: "GOOGLE" } }
    });
    if (!integration || !integration.config) {
      return res.status(400).json({ error: "Google Ads integration not configured" });
    }
    const config = integration.config;
    const developerToken = config.developerToken;
    const customerId = config.customerId;
    const accessToken = config.accessToken;
    if (!developerToken || !customerId || !accessToken) {
      return res.status(400).json({ error: "Missing developerToken, customerId, or accessToken in Google config" });
    }
    const query = `
            SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE segments.date DURING LAST_30_DAYS
        `;
    const response = await fetch(`https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json"
      },
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
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
      const dateObj = new Date(dateStr);
      const existing = await prisma.dailyMetric.findUnique({ where: { workspaceId_date: { workspaceId, date: dateObj } } });
      if (existing) {
        await prisma.dailyMetric.update({
          where: { id: existing.id },
          data: {
            googleAdSpend: spend,
            netProfit: Number(existing.totalRevenue) - spend - Number(existing.metaAdSpend) - Number(existing.totalShipping) - Number(existing.totalCogs)
          }
        });
      } else {
        await prisma.dailyMetric.create({
          data: {
            workspaceId,
            date: dateObj,
            totalRevenue: 0,
            metaAdSpend: 0,
            googleAdSpend: spend,
            totalShipping: 0,
            totalCogs: 0,
            netProfit: -spend
          }
        });
      }
    }
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
    const campaigns = await prisma.adSpend.groupBy({
      by: ["campaignId", "campaignName"],
      where: { workspaceId, platform: "GOOGLE" },
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
var google_default = router5;

// src/routes/dropy.ts
var import_express6 = require("express");
var router6 = (0, import_express6.Router)();
router6.post("/webhooks/status", async (req, res) => {
  try {
    const { guideId, orderId, clientName, city, status, collectedValue, shippingFee } = req.body;
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!guideId) {
      return res.status(400).json({ error: "Missing guideId" });
    }
    if (!workspaceId) {
      return res.status(400).json({ error: "Missing workspaceId" });
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
      const dateObj = new Date((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
      const fee = parseFloat(shippingFee);
      const existing = await prisma.dailyMetric.findUnique({
        where: { workspaceId_date: { workspaceId, date: dateObj } }
      });
      if (existing) {
        await prisma.dailyMetric.update({
          where: { id: existing.id },
          data: {
            totalShipping: { increment: fee },
            netProfit: { decrement: fee }
          }
        });
      } else {
        await prisma.dailyMetric.create({
          data: {
            workspaceId,
            date: dateObj,
            totalRevenue: 0,
            metaAdSpend: 0,
            googleAdSpend: 0,
            totalShipping: fee,
            totalCogs: 0,
            netProfit: -fee
          }
        });
      }
    }
    await createAuditLog({
      workspaceId,
      source: "Dropy",
      event: "Status Webhook",
      status: "200 OK",
      message: `Pedido #${orderId || "Desconocido"} actualizado a: ${status}`
    });
    return res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Dropy Webhook Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
router6.get("/shipments", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const limit = Number(req.query.limit) || 50;
    const page = Number(req.query.page) || 1;
    const shipments = await prisma.shipment.findMany({
      where: { workspaceId },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" }
    });
    const total = await prisma.shipment.count({ where: { workspaceId } });
    return res.status(200).json({
      data: shipments,
      meta: { total, page, limit }
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
router6.get("/summary", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const totalShipments = await prisma.shipment.count({ where: { workspaceId } });
    const delivered = await prisma.shipment.count({ where: { workspaceId, status: "Entregado" } });
    const returned = await prisma.shipment.count({ where: { workspaceId, status: "Devuelto" } });
    const inTransit = await prisma.shipment.count({ where: { workspaceId, status: "En Tr\xE1nsito" } });
    const pending = await prisma.shipment.count({ where: { workspaceId, status: "Pendiente" } });
    const collectedSumResult = await prisma.shipment.aggregate({
      _sum: { collectedValue: true },
      where: { workspaceId, status: "Entregado" }
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
var dropy_default = router6;

// src/routes/metrics.ts
var import_express7 = require("express");
var import_date_fns = require("date-fns");
var router7 = (0, import_express7.Router)();
router7.get("/summary", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    let start, end;
    if (from && to) {
      start = (0, import_date_fns.startOfDay)(new Date(from));
      end = (0, import_date_fns.endOfDay)(new Date(to));
    } else {
      start = (0, import_date_fns.startOfDay)(/* @__PURE__ */ new Date());
      end = (0, import_date_fns.endOfDay)(/* @__PURE__ */ new Date());
    }
    const metrics = await prisma.dailyMetric.findMany({
      where: {
        workspaceId,
        date: {
          gte: start,
          lte: end
        }
      }
    });
    const summary = metrics.reduce((acc, m) => ({
      totalRevenue: acc.totalRevenue + Number(m.totalRevenue),
      metaAdSpend: acc.metaAdSpend + Number(m.metaAdSpend),
      googleAdSpend: acc.googleAdSpend + Number(m.googleAdSpend),
      totalShipping: acc.totalShipping + Number(m.totalShipping),
      totalCogs: acc.totalCogs + Number(m.totalCogs),
      netProfit: acc.netProfit + Number(m.netProfit)
    }), {
      totalRevenue: 0,
      metaAdSpend: 0,
      googleAdSpend: 0,
      totalShipping: 0,
      totalCogs: 0,
      netProfit: 0
    });
    return res.status(200).json(summary);
  } catch (error) {
    console.error("Metrics Summary error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router7.get("/daily", authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req, res) => {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  return res.redirect(`/api/metrics/summary?from=${today}&to=${today}`);
});
router7.get("/range", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to, days } = req.query;
    let startDate, endDate;
    if (from && to) {
      startDate = (0, import_date_fns.startOfDay)(new Date(from));
      endDate = (0, import_date_fns.endOfDay)(new Date(to));
    } else {
      const numDays = Number(days) || 7;
      startDate = (0, import_date_fns.subDays)(/* @__PURE__ */ new Date(), numDays);
      endDate = (0, import_date_fns.endOfDay)(/* @__PURE__ */ new Date());
    }
    const metrics = await prisma.dailyMetric.findMany({
      where: {
        workspaceId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: "asc" }
    });
    const mappedMetrics = metrics.map((m) => ({
      ...m,
      totalRevenue: Number(m.totalRevenue),
      metaAdSpend: Number(m.metaAdSpend),
      googleAdSpend: Number(m.googleAdSpend),
      totalShipping: Number(m.totalShipping),
      totalCogs: Number(m.totalCogs),
      netProfit: Number(m.netProfit)
    }));
    return res.status(200).json(mappedMetrics);
  } catch (error) {
    console.error("Metrics Range error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router7.get("/finances", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const costs = await prisma.fixedCost.findMany({
      where: { workspaceId, isActive: true }
    });
    return res.status(200).json({
      fixedCosts: costs,
      summary: {
        totalFixedCosts: costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
      }
    });
  } catch (error) {
    console.error("Metrics Finances error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router7.get("/sku-performance", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { from, to } = req.query;
    let start, end;
    if (from && to) {
      start = (0, import_date_fns.startOfDay)(new Date(from));
      end = (0, import_date_fns.endOfDay)(new Date(to));
    } else {
      end = (0, import_date_fns.endOfDay)(/* @__PURE__ */ new Date());
      start = (0, import_date_fns.startOfDay)((0, import_date_fns.subDays)(end, 7));
    }
    const orders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["paid", "partially_refunded"] },
        createdAt: {
          gte: start,
          lte: end
        }
      }
    });
    const skuMap = {};
    orders.forEach((order) => {
      const items = order.lineItems;
      if (Array.isArray(items)) {
        items.forEach((item) => {
          const sku = item.sku || "Unknown";
          if (!skuMap[sku]) {
            skuMap[sku] = { name: item.title || sku, sales: 0, revenue: 0 };
          }
          skuMap[sku].sales += item.quantity || 1;
          skuMap[sku].revenue += (Number(item.price) || 0) * (item.quantity || 1);
        });
      }
    });
    const products = await prisma.product.findMany({
      where: { workspaceId }
    });
    const productMap = products.reduce((acc, p) => ({ ...acc, [p.sku]: p }), {});
    const performance = Object.entries(skuMap).map(([sku, data]) => {
      const product = productMap[sku];
      let cogs = 0;
      if (product) {
        cogs = Number(product.cogs) * data.sales;
      } else {
        cogs = data.revenue * 0.4;
      }
      const adspend = data.revenue * 0.15;
      const profit = data.revenue - cogs - adspend;
      const margin = data.revenue > 0 ? profit / data.revenue * 100 : data.sales > 0 ? -100 : 0;
      return {
        sku,
        name: data.name,
        sales: data.sales,
        revenue: `$${data.revenue.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        cogs: `$${cogs.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        adspend: `$${adspend.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        profit: `$${profit.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        margin: `${margin.toFixed(1)}%`,
        marginRaw: margin,
        price: `$${(product ? Number(product.price) : data.revenue / data.sales).toFixed(2)}`,
        cost: `$${(product ? Number(product.cogs) : data.revenue * 0.4 / data.sales).toFixed(2)}`
      };
    }).sort((a, b) => parseFloat(b.profit.replace("$", "").replace(",", "")) - parseFloat(a.profit.replace("$", "").replace(",", "")));
    return res.status(200).json(performance);
  } catch (error) {
    console.error("Metrics SKU Performance error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
});
router7.get("/customers-ltv", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const orders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["paid", "partially_refunded"] }
      }
    });
    if (orders.length === 0) {
      return res.status(200).json({ ltv: 0, repurchaseRate: 0, totalCustomers: 0 });
    }
    const customerMap = {};
    let totalRevenue = 0;
    orders.forEach((order) => {
      const email = order.customerEmail || "unknown@example.com";
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
router7.get("/returns", authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const refundedOrders = await prisma.order.findMany({
      where: {
        workspaceId,
        financialStatus: { in: ["refunded", "partially_refunded"] }
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
var metrics_default = router7;

// src/routes/valentina.ts
var import_express8 = require("express");
var import_date_fns2 = require("date-fns");
var router8 = (0, import_express8.Router)();
var INTERNAL_AI_KEY = process.env.INTERNAL_AI_KEY || "valentina-secret-key-123";
var aiAuth = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (key !== INTERNAL_AI_KEY) {
    return res.status(401).json({ error: "Unauthorized AI Agent" });
  }
  next();
};
router8.get("/valentina-context", aiAuth, async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const today = /* @__PURE__ */ new Date();
    const start = (0, import_date_fns2.startOfDay)(today);
    const end = (0, import_date_fns2.endOfDay)(today);
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
var valentina_default = router8;

// src/routes/settings.ts
var import_express9 = require("express");

// src/controllers/settingsController.ts
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
    const { timezone, currency, strictAttribution } = req.body;
    const settings = await prisma.globalSetting.upsert({
      where: { workspaceId },
      update: {
        timezone,
        currency,
        strictAttribution
      },
      create: {
        workspaceId,
        timezone,
        currency,
        strictAttribution
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
var router9 = (0, import_express9.Router)();
router9.get("/global", authenticate, getGlobalSettings);
router9.post("/global", authenticate, updateGlobalSettings);
router9.get("/integrations", authenticate, getIntegrations);
router9.post("/integrations", authenticate, updateIntegration);
var settings_default = router9;

// src/routes/admin.ts
var import_express10 = require("express");
var import_jsonwebtoken3 = __toESM(require("jsonwebtoken"));

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
var import_config5 = require("dotenv/config");
var router10 = (0, import_express10.Router)();
var JWT_SECRET3 = process.env.JWT_SECRET || "super-secret-key-change-in-prod";
router10.use(requireSuperAdmin);
router10.get("/workspaces", async (req, res) => {
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
router10.post("/workspaces", async (req, res) => {
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
    const workspace = await prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({
        data: { name }
      });
      await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash: tempPassword,
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
router10.post("/workspaces/:id/toggle", async (req, res) => {
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
router10.post("/workspaces/impersonate", async (req, res) => {
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
    const token = import_jsonwebtoken3.default.sign(
      {
        id: userReq.id,
        email: userReq.email,
        role: "SUPER_ADMIN",
        workspaceId: targetWorkspaceId,
        isImpersonating: true
      },
      JWT_SECRET3,
      { expiresIn: "1h" }
      // Short lived token for security
    );
    res.status(200).json({ token, workspaceName: workspace.name });
  } catch (error) {
    console.error("Error impersonating workspace:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router10.get("/users", async (req, res) => {
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
router10.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const genericPassword = "ChangeMe2026!";
    const updated = await prisma.user.update({
      where: { id },
      data: {
        passwordHash: genericPassword,
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
router10.get("/settings", async (req, res) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    res.status(200).json(configs);
  } catch (error) {
    console.error("Error fetching system configs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router10.post("/settings", async (req, res) => {
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
var admin_default = router10;

// src/routes/logs.ts
var import_express11 = require("express");
var router11 = (0, import_express11.Router)();
router11.get("/", authenticate, async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId },
      distinct: ["source"],
      orderBy: [
        { source: "asc" },
        { createdAt: "desc" }
      ]
    });
    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
var logs_default = router11;

// src/app.ts
var app = (0, import_express12.default)();
app.use((0, import_helmet.default)());
app.use((0, import_cors.default)());
app.use((0, import_compression.default)());
app.use("/webhooks/shopify", import_express12.default.raw({ type: "application/json" }));
app.use(import_express12.default.json());
app.use("/health", health_default);
app.use("/api/auth", auth_default);
app.use("/api/shopify", shopify_default);
app.use("/api/meta", meta_default);
app.use("/api/google", google_default);
app.use("/api/dropy", dropy_default);
app.use("/api/metrics", metrics_default);
app.use("/api/ia", valentina_default);
app.use("/api/settings", settings_default);
app.use("/api/admin", admin_default);
app.use("/api/logs", logs_default);
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});
var app_default = app;

// src/index.ts
var PORT = process.env.PORT || 4e3;
var server = app_default.listen(PORT, () => {
  console.log(`[Server] API running on http://127.0.0.1:${PORT}`);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
