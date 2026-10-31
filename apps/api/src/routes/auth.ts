import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createBusinessSchema, emailOtpRequestSchema, emailOtpVerifySchema } from "@khataflow/shared/auth";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { databaseRequest } from "../services/database.js";
import { createPortalToken } from "../services/portalTokens.js";

export const authRouter = Router();
const clientProfileSchema = z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(300).optional().nullable() });

function supabaseConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase auth is not configured");
  return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
}

authRouter.post("/api/auth/otp", async (req, res) => {
  const input = emailOtpRequestSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const { url, key } = supabaseConfig();
    const result = await fetch(`${url}/auth/v1/otp`, {
      method: "POST", headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email: input.data.email, create_user: true }),
    });
    if (!result.ok) return res.status(result.status === 429 ? 429 : 502).json({ error: result.status === 429 ? "rate_limited" : "otp_unavailable" });
    res.status(202).json({ message: "If this email can sign in, a code was sent." });
  } catch {
    res.status(503).json({ error: "auth_unavailable" });
  }
});

authRouter.post("/api/auth/verify", async (req, res) => {
  const input = emailOtpVerifySchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const { url, key } = supabaseConfig();
    const result = await fetch(`${url}/auth/v1/verify`, {
      method: "POST", headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email: input.data.email, token: input.data.token, type: "email" }),
    });
    const body: unknown = await result.json();
    if (!result.ok) return res.status(401).json({ error: "invalid_or_expired_code" });
    res.json(body);
  } catch {
    res.status(503).json({ error: "auth_unavailable" });
  }
});

authRouter.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ userId: req.ctx!.userId, email: req.ctx!.email });
});

authRouter.post("/api/client/profile", authenticate, async (req, res) => {
  const input = clientProfileSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const [profile] = await databaseRequest<Record<string, unknown>[]>("client_profiles?on_conflict=user_id", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: { user_id: req.ctx!.userId, name: input.data.name, phone: input.data.phone ?? null, address: input.data.address ?? null, updated_at: new Date().toISOString() },
    });
    return res.status(200).json(profile ?? { name: input.data.name });
  } catch { return res.status(503).json({ error: "client_profile_unavailable" }); }
});

authRouter.post("/api/client-invitations/accept", authenticate, async (req, res) => {
  const input = z.object({ token: z.string().min(32).max(100).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_invitation" });
  try {
    const result = await databaseRequest("rpc/rpc_accept_client_invitation", { method: "POST", body: { p_token_hash: createHash("sha256").update(input.data.token).digest("hex"), p_user_id: req.ctx!.userId } });
    return res.json(result);
  } catch { return res.status(400).json({ error: "invitation_expired_or_used" }); }
});

authRouter.get("/api/client/shops", authenticate, async (req, res) => {
  const query = new URLSearchParams({ select: "business:businesses(id,name),client:clients(id,name,balance_paise,preferred_language)", user_id: `eq.${req.ctx!.userId}`, order: "created_at.desc" });
  try { res.setHeader("cache-control", "no-store"); return res.json(await databaseRequest(`client_business_links?${query}`)); }
  catch { return res.status(503).json({ error: "client_shops_unavailable" }); }
});

authRouter.post("/api/client/shops/:businessId/portal-link", authenticate, async (req, res) => {
  const businessId = Array.isArray(req.params.businessId) ? req.params.businessId[0] : req.params.businessId;
  if (!z.string().uuid().safeParse(businessId).success) return res.status(400).json({ error: "invalid_business" });
  const query = new URLSearchParams({ select: "client_id", user_id: `eq.${req.ctx!.userId}`, business_id: `eq.${businessId}`, limit: "1" });
  try {
    const [link] = await databaseRequest<{ client_id: string }[]>(`client_business_links?${query}`);
    if (!link) return res.status(404).json({ error: "shop_not_connected" });
    const { token, expiresAt } = createPortalToken(businessId, link.client_id);
    res.setHeader("cache-control", "no-store");
    return res.json({ url: new URL(`/pay/${token}`, env.APP_URL).toString(), expiresAt: new Date(expiresAt * 1000).toISOString() });
  } catch { return res.status(503).json({ error: "portal_link_unavailable" }); }
});

authRouter.get("/api/businesses", authenticate, async (req, res) => {
  try {
    const { url, key } = supabaseConfig();
    const memberships = new URL("/rest/v1/business_members", url);
    memberships.search = new URLSearchParams({ select: "role,business:businesses(id,name,settings)", user_id: `eq.${req.ctx!.userId}` }).toString();
    const result = await fetch(memberships, { headers: { apikey: key, authorization: req.header("authorization")! } });
    if (!result.ok) return res.status(result.status >= 500 ? 503 : 502).json({ error: "business_list_unavailable" });
    res.json(await result.json());
  } catch {
    res.status(503).json({ error: "business_list_unavailable" });
  }
});

authRouter.post("/api/businesses", authenticate, async (req, res) => {
  const input = createBusinessSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return res.status(503).json({ error: "onboarding_unavailable" });
  try {
    const result = await fetch(`${env.SUPABASE_URL}/rest/v1/businesses?select=id,name,settings`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ name: input.data.name, owner_user_id: req.ctx!.userId, settings: { language: input.data.language } }),
    });
    if (!result.ok) return res.status(502).json({ error: "business_creation_failed" });
    const rows = await result.json() as { id: string; name: string; settings: { language: string } }[];
    const business = rows[0];
    if (!business) return res.status(502).json({ error: "business_creation_failed" });
    res.status(201).json({ businessId: business.id, name: business.name, language: business.settings.language, role: "owner" });
  } catch {
    res.status(503).json({ error: "onboarding_unavailable" });
  }
});

authRouter.get("/api/businesses/current", authenticate, requireBusiness, (req, res) => {
  res.json({ businessId: req.ctx!.businessId, userId: req.ctx!.userId, role: req.ctx!.role });
});
