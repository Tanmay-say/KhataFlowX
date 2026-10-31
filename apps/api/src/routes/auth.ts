import { Router } from "express";
import { createBusinessSchema, emailOtpRequestSchema, emailOtpVerifySchema } from "@khataflow/shared/auth";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";

export const authRouter = Router();

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
