import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  clientCreateSchema, clientUpdateSchema, inventoryCreateSchema, inventoryUpdateSchema,
  invoiceCreateSchema, paymentSchema, saleSchema, stockAdjustSchema,
} from "@khataflow/shared/auth";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { databaseRequest, sendDatabaseError } from "../services/database.js";
import { invoicePdf, receiptPdf } from "../services/documents.js";
import { createPortalToken } from "../services/portalTokens.js";

export const coreRouter = Router();
coreRouter.use("/api", authenticate, requireBusiness);
const business = (req: import("express").Request) => req.ctx!.businessId;
const actor = (req: import("express").Request) => req.ctx!.userId;
const idem = (req: import("express").Request) => {
  const value = req.header("idempotency-key")?.trim();
  return value && value.length <= 128 && /^[\w.:/-]{8,128}$/.test(value) ? value : null;
};
const columns = {
  clients: "id,name,phone,address,balance_paise,preferred_language,notification_prefs,created_at,updated_at",
  inventory: "id,item_name,quantity,unit,low_stock_threshold,price_per_unit_paise,created_at,updated_at",
  invoices: "id,client_id,number,items,total_paise,paid_paise,status,due_date,issued_at,created_at,updated_at",
};

coreRouter.get("/api/clients", async (req, res) => {
  const requested = typeof req.query.limit === "string" && /^\d+$/.test(req.query.limit) ? Number(req.query.limit) : 50;
  if (requested < 1) return res.status(400).json({ error: "invalid_limit" });
  const limit = Math.min(requested, 100);
  const params = new URLSearchParams({ select: columns.clients, business_id: `eq.${business(req)}`, archived_at: "is.null", order: "created_at.desc", limit: String(limit) });
  if (typeof req.query.search === "string" && req.query.search.length <= 80) params.set("name", `ilike.*${req.query.search.replace(/[\\%_]/g, "\\$&")}*`);
  try { res.json(await databaseRequest(`clients?${params}`)); } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/clients", async (req, res) => {
  const input = clientCreateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const [client] = await databaseRequest<Record<string, unknown>[]>("clients?select=" + columns.clients, {
      method: "POST", prefer: "return=representation", body: {
        business_id: business(req), name: input.data.name, phone: input.data.phone ?? null,
        address: input.data.address ?? null, preferred_language: input.data.preferredLanguage,
      },
    });
    res.status(201).json(client);
  } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/clients/:id", async (req, res) => {
  const params = new URLSearchParams({ select: columns.clients, business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, limit: "1" });
  try { const [client] = await databaseRequest<Record<string, unknown>[]>(`clients?${params}`); if (client) res.json(client); else res.status(404).json({ error: "not_found" }); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/clients/:id/share-link", async (req, res) => {
  const params = new URLSearchParams({ select: "id", business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, archived_at: "is.null", limit: "1" });
  try {
    const [client] = await databaseRequest<Record<string, unknown>[]>(`clients?${params}`);
    if (!client) return res.status(404).json({ error: "not_found" });
    const { token, expiresAt } = createPortalToken(business(req), req.params.id);
    res.setHeader("cache-control", "no-store");
    return res.json({ url: new URL(`/pay/${token}`, env.APP_URL).toString(), expiresAt: new Date(expiresAt * 1000).toISOString() });
  } catch { return res.status(503).json({ error: "portal_link_unavailable" }); }
});

coreRouter.post("/api/clients/:id/invitations", async (req, res) => {
  if (req.ctx!.role === "staff") return res.status(403).json({ error: "insufficient_role" });
  const params = new URLSearchParams({ select: "id", business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, archived_at: "is.null", limit: "1" });
  try {
    const [client] = await databaseRequest<Record<string, unknown>[]>(`clients?${params}`);
    if (!client) return res.status(404).json({ error: "not_found" });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    await databaseRequest("client_invitations", { method: "POST", body: { business_id: business(req), client_id: req.params.id, invited_by: actor(req), token_hash: createHash("sha256").update(token).digest("hex"), expires_at: expiresAt } });
    res.setHeader("cache-control", "no-store");
    return res.status(201).json({ url: new URL(`/invite/${token}`, env.APP_URL).toString(), expiresAt });
  } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.patch("/api/clients/:id", async (req, res) => {
  const input = clientUpdateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  const patch = Object.fromEntries(Object.entries({ name: input.data.name, phone: input.data.phone, address: input.data.address, preferred_language: input.data.preferredLanguage }).filter(([, value]) => value !== undefined));
  const params = new URLSearchParams({ select: columns.clients, business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, archived_at: "is.null" });
  try { const [client] = await databaseRequest<Record<string, unknown>[]>(`clients?${params}`, { method: "PATCH", body: patch, prefer: "return=representation" }); if (client) res.json(client); else res.status(404).json({ error: "not_found" }); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.delete("/api/clients/:id", async (req, res) => {
  const params = new URLSearchParams({ business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, archived_at: "is.null" });
  try { const rows = await databaseRequest<unknown[]>(`clients?${params}`, { method: "PATCH", body: { archived_at: new Date().toISOString() }, prefer: "return=representation" }); if (rows.length) res.status(204).end(); else res.status(404).json({ error: "not_found" }); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/inventory", async (req, res) => {
  const params = new URLSearchParams({ select: columns.inventory, business_id: `eq.${business(req)}`, order: "item_name.asc", limit: "100" });
  try { res.json(await databaseRequest(`inventory?${params}`)); } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/inventory", async (req, res) => {
  const input = inventoryCreateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try {
    const [item] = await databaseRequest<Record<string, unknown>[]>("inventory?select=" + columns.inventory, {
      method: "POST", prefer: "return=representation", body: {
        business_id: business(req), item_name: input.data.itemName, unit: input.data.unit,
        low_stock_threshold: input.data.lowStockThreshold, price_per_unit_paise: input.data.pricePerUnitPaise,
      },
    });
    res.status(201).json(item);
  } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.patch("/api/inventory/:id", async (req, res) => {
  const input = inventoryUpdateSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  const patch = Object.fromEntries(Object.entries({ item_name: input.data.itemName, unit: input.data.unit, low_stock_threshold: input.data.lowStockThreshold, price_per_unit_paise: input.data.pricePerUnitPaise }).filter(([, value]) => value !== undefined));
  const params = new URLSearchParams({ select: columns.inventory, business_id: `eq.${business(req)}`, id: `eq.${req.params.id}` });
  try { const [item] = await databaseRequest<Record<string, unknown>[]>(`inventory?${params}`, { method: "PATCH", body: { ...patch, updated_at: new Date().toISOString() }, prefer: "return=representation" }); if (item) res.json(item); else res.status(404).json({ error: "not_found" }); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.delete("/api/inventory/:id", async (req, res) => {
  const params = new URLSearchParams({ select: "id,quantity", business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, limit: "1" });
  try {
    const [item] = await databaseRequest<{ id: string; quantity: string }[]>(`inventory?${params}`);
    if (!item) return res.status(404).json({ error: "not_found" });
    if (Number(item.quantity) !== 0) return res.status(409).json({ error: "stock_must_be_zero" });
    const removal = new URLSearchParams({ business_id: `eq.${business(req)}`, id: `eq.${item.id}` });
    await databaseRequest(`inventory?${removal}`, { method: "DELETE" });
    res.status(204).end();
  } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/inventory/adjust", async (req, res) => {
  const input = stockAdjustSchema.safeParse(req.body);
  const key = idem(req);
  if (!input.success || !key) return res.status(400).json({ error: "invalid_request_or_idempotency_key" });
  try { res.json(await databaseRequest("rpc/rpc_adjust_stock", { method: "POST", body: { p_business: business(req), p_item: input.data.itemName, p_delta: input.data.delta, p_unit: input.data.unit, p_idem: key, p_actor: actor(req) } })); }
  catch (error) { sendDatabaseError(error, res); }
});

function totalPaise(items: { qty: string; pricePaise: string }[]) {
  return items.reduce((sum, item) => {
    const [whole, fraction = ""] = item.qty.split(".");
    const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
    return sum + (milli * BigInt(item.pricePaise) + 500n) / 1000n;
  }, 0n).toString();
}

coreRouter.post("/api/ledger/sales", async (req, res) => {
  const input = saleSchema.safeParse(req.body);
  const key = idem(req);
  if (!input.success || !key) return res.status(400).json({ error: "invalid_request_or_idempotency_key" });
  const total = totalPaise(input.data.items);
  if (BigInt(total) <= 0n || BigInt(total) > 9223372036854775807n || BigInt(input.data.paidNowPaise) > BigInt(total)) return res.status(400).json({ error: "invalid_sale_amount" });
  const items = input.data.items.map((item) => ({ ...item, pricePaise: item.pricePaise }));
  try { res.status(201).json(await databaseRequest("rpc/rpc_record_sale", { method: "POST", body: { p_business: business(req), p_client: input.data.clientId, p_items: items, p_total_paise: total, p_paid_now_paise: input.data.paidNowPaise, p_idem: key, p_source: "web", p_actor: actor(req) } })); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/ledger/payments", async (req, res) => {
  const input = paymentSchema.safeParse(req.body);
  const key = idem(req);
  if (!input.success || !key) return res.status(400).json({ error: "invalid_request_or_idempotency_key" });
  try { res.status(201).json(await databaseRequest("rpc/rpc_record_payment", { method: "POST", body: { p_business: business(req), p_client: input.data.clientId, p_amount_paise: input.data.amountPaise, p_method: input.data.method, p_idem: key, p_payment_id: null, p_actor: actor(req), p_allow_advance: false } })); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/ledger/activity", async (req, res) => {
  const params = new URLSearchParams({ select: "id,client_id,type,amount_paise,items,invoice_id,payment_id,source,note,created_at", business_id: `eq.${business(req)}`, order: "created_at.desc", limit: "100" });
  if (typeof req.query.clientId === "string") params.set("client_id", `eq.${req.query.clientId}`);
  try { res.json(await databaseRequest(`ledger_entries?${params}`)); } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/ledger/summary", async (req, res) => {
  try { res.json(await databaseRequest("rpc/rpc_ledger_summary", { method: "POST", body: { p_business: business(req) } })); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/invoices", async (req, res) => {
  const params = new URLSearchParams({ select: columns.invoices, business_id: `eq.${business(req)}`, order: "created_at.desc", limit: "100" });
  if (typeof req.query.clientId === "string") params.set("client_id", `eq.${req.query.clientId}`);
  try { res.json(await databaseRequest(`invoices?${params}`)); } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/invoices/:id", async (req, res) => {
  const params = new URLSearchParams({ select: columns.invoices, business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, limit: "1" });
  try { const [invoice] = await databaseRequest<Record<string, unknown>[]>(`invoices?${params}`); if (invoice) res.json(invoice); else res.status(404).json({ error: "not_found" }); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.patch("/api/invoices/:id", async (req, res) => {
  const input = invoiceCreateSchema.pick({ dueDate: true }).safeParse(req.body);
  if (!input.success || !Object.hasOwn(req.body, "dueDate")) return res.status(400).json({ error: "invalid_request" });
  const params = new URLSearchParams({ select: columns.invoices, business_id: `eq.${business(req)}`, id: `eq.${req.params.id}`, status: "eq.DRAFT" });
  try {
    const [invoice] = await databaseRequest<Record<string, unknown>[]>(`invoices?${params}`, { method: "PATCH", body: { due_date: input.data.dueDate ?? null, updated_at: new Date().toISOString() }, prefer: "return=representation" });
    if (invoice) res.json(invoice); else res.status(404).json({ error: "draft_invoice_not_found" });
  } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/invoices/:id/void", async (req, res) => {
  const key = idem(req);
  if (!key) return res.status(400).json({ error: "idempotency_key_required" });
  try { res.json(await databaseRequest("rpc/rpc_void_invoice", { method: "POST", body: { p_business: business(req), p_invoice: req.params.id, p_idem: key, p_actor: actor(req) } })); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.post("/api/invoices", async (req, res) => {
  const input = invoiceCreateSchema.safeParse(req.body);
  const key = idem(req);
  if (!input.success || !key) return res.status(400).json({ error: "invalid_request_or_idempotency_key" });
  const total = BigInt(totalPaise(input.data.items));
  if (total <= 0n || total > 9223372036854775807n) return res.status(400).json({ error: "invalid_invoice_total" });
  try { res.status(201).json(await databaseRequest("rpc/rpc_create_invoice", { method: "POST", body: { p_business: business(req), p_client: input.data.clientId, p_items: input.data.items, p_due_date: input.data.dueDate ?? null, p_idem: key, p_actor: actor(req) } })); }
  catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/invoices/:id/pdf", async (req, res) => {
  try {
    const url = await invoicePdf(business(req), req.params.id);
    if (url) { res.setHeader("cache-control", "no-store"); return res.redirect(302, url); }
    return res.status(404).json({ error: "not_found" });
  } catch { return res.status(503).json({ error: "document_unavailable" }); }
});

coreRouter.get("/api/receipts", async (req, res) => {
  const params = new URLSearchParams({ select: "id,payment_id,number,issued_at,created_at,pdf_path", business_id: `eq.${business(req)}`, order: "issued_at.desc", limit: "100" });
  try { res.json(await databaseRequest(`receipts?${params}`)); } catch (error) { sendDatabaseError(error, res); }
});

coreRouter.get("/api/receipts/:id/pdf", async (req, res) => {
  try {
    const url = await receiptPdf(business(req), req.params.id);
    if (url) { res.setHeader("cache-control", "no-store"); return res.redirect(302, url); }
    return res.status(404).json({ error: "not_found" });
  } catch { return res.status(503).json({ error: "document_unavailable" }); }
});
