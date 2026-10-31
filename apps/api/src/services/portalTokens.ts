import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type PortalScope = { businessId: string; clientId: string; expiresAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const signature = (payload: string) => {
  if (!env.PORTAL_SIGNING_SECRET) throw new Error("Portal links are not configured");
  return createHmac("sha256", env.PORTAL_SIGNING_SECRET).update(payload).digest("base64url");
};

export function createPortalToken(businessId: string, clientId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + env.PORTAL_LINK_TTL_HOURS * 3600;
  const payload = `${businessId}.${clientId}.${expiresAt}`;
  return { token: `${Buffer.from(payload).toString("base64url")}.${signature(payload)}`, expiresAt };
}

export function verifyPortalToken(token: string): PortalScope | null {
  try {
    const [encoded, supplied, extra] = token.split(".");
    if (!encoded || !supplied || extra) return null;
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const [businessId, clientId, expires] = payload.split(".");
    const expiresAt = Number(expires);
    if (!uuid.test(businessId ?? "") || !uuid.test(clientId ?? "") || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() / 1000) return null;
    return { businessId, clientId, expiresAt };
  } catch { return null; }
}
