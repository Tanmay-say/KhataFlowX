import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { databaseRequest } from "../services/database.js";
import { getPaymentProvider } from "../services/payments/index.js";
import { createPortalToken, verifyPortalToken } from "../services/portalTokens.js";
import { notifyTelegramPayment } from "../services/telegram.js";

export const paymentsRouter = Router();
type Scope = { businessId: string; clientId?: string; userId?: string; portal: boolean };
type PaymentRow = { id: string; business_id: string; client_id: string; invoice_id: string | null; amount_paise: string; method: string; status: string; provider: string; provider_ref: string | null; created_at: string };

function authOrPortal(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-portal-token")) return next();
  return authenticate(req, res, () => requireBusiness(req, res, next));
}
function requestScope(req: Request): Scope | null {
  const token = req.header("x-portal-token");
  if (token) {
    const portal = verifyPortalToken(token);
    return portal ? { businessId: portal.businessId, clientId: portal.clientId, portal: true } : null;
  }
  if (!req.ctx?.businessId) return null;
  return { businessId: req.ctx.businessId, userId: req.ctx.userId, portal: false };
}
const intentSchema = z.object({
  clientId: z.string().uuid().optional(), invoiceId: z.string().uuid().optional(),
  amountPaise: z.string().regex(/^[1-9]\d{0,17}$/).optional(), idempotencyKey: z.string().trim().min(8).max(128).regex(/^[\w.:/-]+$/),
});
const getClient = async (businessId: string, clientId: string) => {
  const query = new URLSearchParams({ select: "id,balance_paise", id: `eq.${clientId}`, business_id: `eq.${businessId}`, limit: "1" });
  const [client] = await databaseRequest<{ id: string; balance_paise: string }[]>(`clients?${query}`);
  return client;
};
async function loadPayment(scope: Scope, id: string) {
  const query = new URLSearchParams({ select: "id,business_id,client_id,invoice_id,amount_paise,method,status,provider,provider_ref,created_at", id: `eq.${id}`, business_id: `eq.${scope.businessId}`, ...(scope.clientId ? { client_id: `eq.${scope.clientId}` } : {}), limit: "1" });
  const [payment] = await databaseRequest<PaymentRow[]>(`payments?${query}`);
  return payment;
}
function result(payment: PaymentRow) {
  return { paymentId: payment.id, status: payment.status, amountPaise: payment.amount_paise, invoiceId: payment.invoice_id, createdAt: payment.created_at };
}

paymentsRouter.post("/api/payments/intents", authOrPortal, async (req, res) => {
  const scope = requestScope(req);
  const input = intentSchema.safeParse(req.body);
  if (!scope) return res.status(401).json({ error: "invalid_or_expired_link" });
  if (!input.success || (!scope.portal && !input.data.invoiceId && !input.data.clientId) || (scope.portal && input.data.clientId && input.data.clientId !== scope.clientId)) return res.status(400).json({ error: "invalid_request" });
  if (env.PAYMENT_PROVIDER !== "mock") return res.status(503).json({ error: "payment_provider_unavailable" });
  try {
    let clientId = scope.clientId ?? input.data.clientId;
    let invoice: { id: string; total_paise: string; paid_paise: string; status: string } | undefined;
    if (input.data.invoiceId) {
      const query = new URLSearchParams({ select: "id,client_id,total_paise,paid_paise,status", id: `eq.${input.data.invoiceId}`, business_id: `eq.${scope.businessId}`, ...(clientId ? { client_id: `eq.${clientId}` } : {}), limit: "1" });
      const [row] = await databaseRequest<(typeof invoice & { client_id: string })[]>(`invoices?${query}`);
      invoice = row;
      if (!invoice) return res.status(404).json({ error: "invoice_not_found" });
      if (clientId && row.client_id !== clientId) return res.status(404).json({ error: "invoice_not_found" });
      clientId = row.client_id;
    }
    if (!clientId) return res.status(400).json({ error: "client_id_required" });
    const client = await getClient(scope.businessId, clientId);
    if (!client) return res.status(404).json({ error: "client_not_found" });
    let available = BigInt(client.balance_paise);
    if (invoice) {
      if (!["ISSUED", "PARTIAL"].includes(invoice.status)) return res.status(409).json({ error: "invoice_not_payable" });
      const remaining = BigInt(invoice.total_paise) - BigInt(invoice.paid_paise);
      available = remaining < available ? remaining : available;
    }
    const amount = input.data.amountPaise ? BigInt(input.data.amountPaise) : available;
    if (amount <= 0n || amount > available) return res.status(400).json({ error: "invalid_payment_amount" });
    const existingQuery = new URLSearchParams({ select: "id,business_id,client_id,invoice_id,amount_paise,method,status,provider,provider_ref,created_at", business_id: `eq.${scope.businessId}`, idempotency_key: `eq.${input.data.idempotencyKey}`, limit: "1" });
    const [existing] = await databaseRequest<PaymentRow[]>(`payments?${existingQuery}`);
    if (existing) {
      if (existing.client_id !== clientId || existing.amount_paise !== amount.toString() || existing.invoice_id !== (invoice?.id ?? null)) return res.status(409).json({ error: "idempotency_key_conflict" });
      const { token } = createPortalToken(scope.businessId, clientId);
      return res.json({ ...result(existing), checkoutUrl: new URL(`/pay/${token}?paymentId=${existing.id}`, env.APP_URL).toString() });
    }
    const provider = getPaymentProvider();
    const paymentId = crypto.randomUUID();
    const { token } = createPortalToken(scope.businessId, clientId);
    const checkoutUrl = new URL(`/pay/${token}?paymentId=${paymentId}`, env.APP_URL).toString();
    const providerPayment = await provider.createPayment({ paymentId, amountPaise: amount.toString(), clientId, ...(invoice ? { invoiceId: invoice.id } : {}), returnUrl: checkoutUrl });
    const body = { id: paymentId, business_id: scope.businessId, client_id: clientId, invoice_id: invoice?.id ?? null, amount_paise: amount.toString(), method: "UPI_MOCK", provider: provider.name, provider_ref: providerPayment.providerRef, status: "PENDING", idempotency_key: input.data.idempotencyKey };
    const insertQuery = new URLSearchParams({ select: "id,business_id,client_id,invoice_id,amount_paise,method,status,provider,provider_ref,created_at", on_conflict: "business_id,idempotency_key" });
    const rows = await databaseRequest<PaymentRow[]>(`payments?${insertQuery}`, { method: "POST", body, prefer: "resolution=ignore-duplicates,return=representation" });
    let payment = rows[0];
    if (!payment) {
      const [winner] = await databaseRequest<PaymentRow[]>(`payments?${existingQuery}`);
      if (!winner || winner.client_id !== clientId || winner.amount_paise !== amount.toString() || winner.invoice_id !== (invoice?.id ?? null)) return res.status(409).json({ error: "idempotency_key_conflict" });
      payment = winner;
    }
    res.status(201).json({ ...result(payment), checkoutUrl, expiresAt: providerPayment.expiresAt });
  } catch { return res.status(503).json({ error: "payment_unavailable" }); }
});

paymentsRouter.get("/api/payments/:id", authOrPortal, async (req, res) => {
  const scope = requestScope(req);
  if (!scope) return res.status(401).json({ error: "invalid_or_expired_link" });
  try {
    const payment = await loadPayment(scope, String(req.params.id));
    if (!payment) return res.status(404).json({ error: "not_found" });
    return res.json(result(payment));
  } catch { return res.status(503).json({ error: "payment_unavailable" }); }
});

paymentsRouter.post("/api/payments/mock/:id/complete", authOrPortal, async (req, res) => {
  const scope = requestScope(req);
  const input = z.object({ outcome: z.enum(["success", "failure"]) }).safeParse(req.body);
  if (!scope) return res.status(401).json({ error: "invalid_or_expired_link" });
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  if (env.PAYMENT_PROVIDER !== "mock" || (env.NODE_ENV === "production" && !env.ALLOW_MOCK)) return res.status(404).json({ error: "not_found" });
  try {
    const payment = await loadPayment(scope, String(req.params.id));
    if (!payment || payment.provider !== "mock") return res.status(404).json({ error: "not_found" });
    if (payment.status === "SUCCEEDED") return res.json(result(payment));
    if (payment.status !== "PENDING") return res.status(409).json({ error: "payment_not_pending" });
    if (input.data.outcome === "failure") {
      const query = new URLSearchParams({ select: "id", id: `eq.${payment.id}`, business_id: `eq.${payment.business_id}`, status: "eq.PENDING" });
      const changed = await databaseRequest<unknown[]>(`payments?${query}`, { method: "PATCH", body: { status: "FAILED", raw: { mockOutcome: "failure" } }, prefer: "return=representation" });
      if (changed.length) return res.json({ paymentId: payment.id, status: "FAILED", amountPaise: payment.amount_paise });
      const current = await loadPayment(scope, payment.id);
      return current ? res.json(result(current)) : res.status(404).json({ error: "not_found" });
    }
    const settled = await databaseRequest<{ paymentId: string; balancePaise: string }>("rpc/rpc_record_payment", {
      method: "POST", body: { p_business: payment.business_id, p_client: payment.client_id, p_amount_paise: payment.amount_paise, p_method: payment.method, p_idem: `payment-settle:${payment.id}`, p_payment_id: payment.id, p_actor: scope.userId ?? null, p_allow_advance: false },
    });
    await notifyTelegramPayment(payment.business_id, payment.client_id, payment.amount_paise);
    return res.json({ paymentId: payment.id, status: "SUCCEEDED", amountPaise: payment.amount_paise, balancePaise: settled.balancePaise });
  } catch { return res.status(503).json({ error: "payment_settlement_failed" }); }
});
