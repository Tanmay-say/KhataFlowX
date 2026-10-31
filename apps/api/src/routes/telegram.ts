import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { databaseRequest } from "../services/database.js";
import { createTelegramLink, telegramBot } from "../services/telegram.js";

export const telegramRouter = Router();
telegramRouter.post("/api/telegram/link", authenticate, requireBusiness, async (req, res) => {
  const input = z.object({ bot: z.enum(["admin", "client"]), clientId: z.string().uuid().optional() }).safeParse(req.body);
  if (!input.success || (input.data.bot === "admin" && input.data.clientId) || (input.data.bot === "client" && !input.data.clientId)) return res.status(400).json({ error: "invalid_request" });
  if (req.ctx!.role === "staff") return res.status(403).json({ error: "insufficient_role" });
  try {
    if (input.data.clientId) {
      const params = new URLSearchParams({ select: "id", id: `eq.${input.data.clientId}`, business_id: `eq.${req.ctx!.businessId}`, archived_at: "is.null", limit: "1" });
      const [client] = await databaseRequest<unknown[]>(`clients?${params}`);
      if (!client) return res.status(404).json({ error: "client_not_found" });
    }
    const link = await createTelegramLink(input.data.bot, req.ctx!.businessId, req.ctx!.userId, input.data.clientId);
    res.setHeader("cache-control", "no-store");
    res.status(201).json(link);
  } catch { res.status(503).json({ error: "telegram_not_configured" }); }
});

function secretMatches(expected: string, supplied: string | undefined) {
  if (!supplied) return false;
  const a = Buffer.from(createHash("sha256").update(expected).digest());
  const b = Buffer.from(createHash("sha256").update(supplied).digest());
  return timingSafeEqual(a, b);
}

telegramRouter.post("/api/telegram/:bot/webhook", async (req, res) => {
  if (env.TELEGRAM_MODE !== "webhook" || !env.TELEGRAM_WEBHOOK_SECRET || !secretMatches(env.TELEGRAM_WEBHOOK_SECRET, req.header("x-telegram-bot-api-secret-token"))) return res.status(401).json({ error: "unauthorized" });
  if (req.params.bot !== "admin" && req.params.bot !== "client") return res.status(404).json({ error: "not_found" });
  const bot = telegramBot(req.params.bot);
  if (!bot) return res.status(503).json({ error: "telegram_not_configured" });
  try { await bot.handleUpdate(req.body); return res.sendStatus(200); }
  catch { return res.status(503).json({ error: "telegram_update_failed" }); }
});
