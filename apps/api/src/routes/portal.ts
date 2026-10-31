import { Router } from "express";
import { z } from "zod";
import { databaseRequest } from "../services/database.js";
import { verifyPortalToken } from "../services/portalTokens.js";

export const portalRouter = Router();
const claimSchema = z.object({ amountPaise: z.string().regex(/^[1-9]\d{0,17}$/), note: z.string().trim().max(200).optional(), idempotencyKey: z.string().trim().min(8).max(128).regex(/^[\w.:/-]+$/) });

portalRouter.get("/api/portal/:token", async (req, res) => {
  const scope = verifyPortalToken(req.params.token);
  if (!scope) return res.status(401).json({ error: "invalid_or_expired_link" });
  try {
    const clientParams = new URLSearchParams({ select: "id,name,balance_paise,preferred_language", id: `eq.${scope.clientId}`, business_id: `eq.${scope.businessId}`, limit: "1" });
    const [client] = await databaseRequest<Record<string, unknown>[]>(`clients?${clientParams}`);
    if (!client) return res.status(404).json({ error: "not_found" });
    const [business] = await databaseRequest<Record<string, unknown>[]>(`businesses?${new URLSearchParams({ select: "name", id: `eq.${scope.businessId}`, limit: "1" })}`);
    const invoiceParams = new URLSearchParams({ select: "id,number,total_paise,paid_paise,status,due_date,issued_at", business_id: `eq.${scope.businessId}`, client_id: `eq.${scope.clientId}`, status: "in.(ISSUED,PARTIAL,PAID)", order: "issued_at.desc", limit: "50" });
    const invoices = await databaseRequest<Record<string, unknown>[]>(`invoices?${invoiceParams}`);
    res.setHeader("cache-control", "no-store");
    return res.json({ businessName: business?.name ?? "KhataFlow", clientName: client.name, balancePaise: client.balance_paise, language: client.preferred_language, invoices });
  } catch { return res.status(503).json({ error: "portal_unavailable" }); }
});

portalRouter.post("/api/portal/:token/confirm-cash", async (req, res) => {
  const scope = verifyPortalToken(req.params.token);
  const input = claimSchema.safeParse(req.body);
  if (!scope) return res.status(401).json({ error: "invalid_or_expired_link" });
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const result = await databaseRequest<{ confirmationId: string; status: string }>("rpc/rpc_submit_payment_claim", {
      method: "POST", body: { p_business: scope.businessId, p_client: scope.clientId, p_amount_paise: input.data.amountPaise, p_note: input.data.note ?? null, p_idem: input.data.idempotencyKey },
    });
    res.status(201).json({ ...result, message: "Cash payment submitted for shopkeeper approval." });
  } catch { return res.status(503).json({ error: "portal_unavailable" }); }
});
