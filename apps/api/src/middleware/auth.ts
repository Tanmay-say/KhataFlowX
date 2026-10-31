import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export type UserContext = { userId: string; email?: string };
export type BusinessContext = UserContext & { businessId: string; role: "owner" | "admin" | "staff" };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function config() {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase auth is not configured");
  return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.header("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const { url } = config();
    const jwksUrl = env.SUPABASE_JWKS_URL ?? `${url}/auth/v1/.well-known/jwks.json`;
    jwks ??= createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jwtVerify(token, jwks, { issuer: `${url}/auth/v1`, audience: "authenticated" });
    if (typeof payload.sub !== "string" || payload.role !== "authenticated") return res.status(401).json({ error: "unauthorized" });
    req.ctx = { userId: payload.sub, ...(typeof payload.email === "string" ? { email: payload.email } : {}) };
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

export async function requireBusiness(req: Request, res: Response, next: NextFunction) {
  if (!req.ctx) return res.status(401).json({ error: "unauthorized" });
  const businessId = req.header("x-business-id");
  if (!businessId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessId)) {
    return res.status(400).json({ error: "business_id_required" });
  }
  try {
    const { url, key } = config();
    const token = req.header("authorization")!.slice(7);
    const membershipUrl = new URL("/rest/v1/business_members", url);
    membershipUrl.search = new URLSearchParams({ select: "role", business_id: `eq.${businessId}`, user_id: `eq.${req.ctx.userId}`, limit: "1" }).toString();
    const response = await fetch(membershipUrl, { headers: { apikey: key, authorization: `Bearer ${token}` } });
    if (!response.ok) return res.status(response.status >= 500 ? 503 : 403).json({ error: "business_access_denied" });
    const rows: unknown = await response.json();
    const role = Array.isArray(rows) ? (rows[0] as { role?: unknown } | undefined)?.role : undefined;
    if (role !== "owner" && role !== "admin" && role !== "staff") return res.status(403).json({ error: "business_access_denied" });
    req.ctx = { ...req.ctx, businessId, role };
    next();
  } catch {
    res.status(503).json({ error: "business_access_unavailable" });
  }
}
