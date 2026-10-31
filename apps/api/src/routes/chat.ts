import { Router } from "express";
import { chatRequestSchema } from "@khataflow/shared/chat";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { databaseRequest, sendDatabaseError } from "../services/database.js";
import { loadChatContext } from "../services/ai/context.js";
import { parseCommandWithUsage } from "../services/ai/muse.js";

export const chatRouter = Router();
chatRouter.use("/api/chat", authenticate, requireBusiness);

chatRouter.get("/api/chat/history", async (req, res) => {
  const params = new URLSearchParams({ select: "id,role,content,created_at", business_id: `eq.${req.ctx!.businessId}`, user_id: `eq.${req.ctx!.userId}`, channel: "eq.web", order: "created_at.desc", limit: "50" });
  try {
    const rows = await databaseRequest<Record<string, unknown>[]>(`chat_messages?${params}`);
    res.setHeader("cache-control", "no-store");
    res.json(rows.reverse());
  } catch (error) { sendDatabaseError(error, res); }
});

type Client = { id: string; name: string; balance_paise: string };
type Item = { id: string; item_name: string; unit: string; quantity: string; price_per_unit_paise: string };
type StoredAction = Record<string, string | number | null | object>;

function normalize(value: string) { return value.toLocaleLowerCase("en-IN").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, ""); }
function matchNamed<T>(input: string | null, choices: T[], nameOf: (value: T) => string) {
  if (!input) return { kind: "missing" as const };
  const query = normalize(input);
  const exact = choices.filter((choice) => normalize(nameOf(choice)) === query);
  const matches = exact.length ? exact : choices.filter((choice) => normalize(nameOf(choice)).includes(query) || query.includes(normalize(nameOf(choice))));
  if (matches.length === 1) return { kind: "matched" as const, value: matches[0] };
  return { kind: matches.length ? "ambiguous" as const : "missing" as const };
}

function rupeesToPaise(value: string | null) {
  if (!value || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return paise <= 9223372036854775807n ? paise.toString() : null;
}

function quantity(value: string) {
  return /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(value) && Number(value) > 0;
}

function totalPaise(items: { qty: string; pricePaise: string }[]) {
  return items.reduce((sum, item) => {
    const [whole, fraction = ""] = item.qty.split(".");
    const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
    return sum + (milli * BigInt(item.pricePaise) + 500n) / 1000n;
  }, 0n).toString();
}

function formatPaise(value: string) {
  const amount = BigInt(value);
  return `₹${amount / 100n}.${(amount < 0n ? -amount : amount) % 100n < 10n ? "0" : ""}${(amount < 0n ? -amount : amount) % 100n}`;
}

async function saveMessage(businessId: string, userId: string, role: "user" | "assistant", content: string, parsed?: unknown, channel: "web" | "telegram" = "web") {
  const rows = await databaseRequest<{ id: string }[]>("chat_messages?select=id", {
    method: "POST", prefer: "return=representation",
    body: { business_id: businessId, user_id: userId, channel, role, content, ...(parsed ? { parsed } : {}) },
  });
  if (!rows[0]) throw new Error("Chat message could not be saved");
  return rows[0].id;
}

async function recordAiUsage(businessId: string, userId: string, work: () => Promise<{ value: unknown; model: string; inputTokens: number; outputTokens: number }>) {
  const usageId = await databaseRequest<string>("rpc/rpc_claim_ai_call", { method: "POST", body: { p_business: businessId, p_actor: userId, p_model: env.MUSE_MODEL } });
  if (!usageId) throw new Error("Daily AI limit reached");
  const started = Date.now();
  try {
    const result = await work();
    await databaseRequest("rpc/rpc_finish_ai_call", { method: "POST", body: { p_id: usageId, p_input_units: result.inputTokens, p_output_units: result.outputTokens, p_latency_ms: Date.now() - started, p_ok: true } });
    return result;
  } catch (error) {
    await databaseRequest("rpc/rpc_finish_ai_call", { method: "POST", body: { p_id: usageId, p_input_units: 0, p_output_units: 0, p_latency_ms: Date.now() - started, p_ok: false } }).catch(() => undefined);
    throw error;
  }
}

async function hydrate(command: Awaited<ReturnType<typeof parseCommandWithUsage>>["value"], clients: Client[], inventory: Item[]) {
  const actions: StoredAction[] = [];
  for (const action of command.actions) {
    if (action.intent === "ADD_CLIENT") {
      if (!action.clientName) return { error: "Please tell me the client's name." };
      actions.push({ intent: "ADD_CLIENT", name: action.clientName, phone: action.phone });
    } else if (action.intent === "ADD_SALE" || action.intent === "GENERATE_INVOICE") {
      const client = matchNamed(action.clientName, clients, (candidate) => candidate.name);
      if (client.kind !== "matched") return { error: client.kind === "ambiguous" ? "I found more than one matching client. Which one did you mean?" : "I could not match that client. Please choose the client name." };
      if (!action.items.length) return { error: "Please tell me which item and quantity." };
      const items: { name: string; unit: string; qty: string; pricePaise: string }[] = [];
      for (const line of action.items) {
        if (!quantity(line.quantity)) return { error: "Please clarify the item quantity." };
        const match = matchNamed(line.name, inventory, (candidate) => candidate.item_name);
        if (match.kind !== "matched") return { error: "I could not match one of those items. Please select it from inventory." };
        if (line.unit && normalize(line.unit) !== normalize(match.value.unit)) return { error: `The unit for ${match.value.item_name} is ${match.value.unit}. Please confirm the quantity.` };
        items.push({ name: match.value.item_name, unit: match.value.unit, qty: line.quantity, pricePaise: match.value.price_per_unit_paise });
      }
      if (action.intent === "ADD_SALE") {
        const total = totalPaise(items);
        if (BigInt(total) <= 0n || BigInt(total) > 9223372036854775807n) return { error: "The sale total is invalid. Please check the item prices." };
        actions.push({ intent: "ADD_SALE", clientId: client.value.id, items, totalPaise: total, paidNowPaise: "0" });
      } else {
        actions.push({ intent: "GENERATE_INVOICE", clientId: client.value.id, items, dueDate: action.dueDate });
      }
    } else if (action.intent === "MARK_PAID") {
      const client = matchNamed(action.clientName, clients, (candidate) => candidate.name);
      if (client.kind !== "matched") return { error: client.kind === "ambiguous" ? "I found more than one matching client. Which one did you mean?" : "I could not match that client. Please choose the client name." };
      const amountPaise = rupeesToPaise(action.amountRupees);
      if (!amountPaise || BigInt(amountPaise) === 0n) return { error: "Please provide the payment amount in rupees." };
      actions.push({ intent: "MARK_PAID", clientId: client.value.id, amountPaise });
    } else if (action.intent === "UPDATE_STOCK") {
      if (!action.items.length || !action.stockDelta || !/^-?(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(action.stockDelta) || Number(action.stockDelta) === 0) return { error: "Please clarify the stock item and quantity." };
      for (const line of action.items) {
        const match = matchNamed(line.name, inventory, (candidate) => candidate.item_name);
        if (match.kind !== "matched") return { error: "I could not match that inventory item. Please select it from inventory." };
        if (line.unit && normalize(line.unit) !== normalize(match.value.unit)) return { error: `The unit for ${match.value.item_name} is ${match.value.unit}. Please confirm the quantity.` };
        actions.push({ intent: "UPDATE_STOCK", itemName: match.value.item_name, unit: match.value.unit, delta: action.stockDelta });
      }
    } else if (action.intent === "SEND_REMINDER") {
      return { error: "Reminders are not available from chat yet. You can send one from the client page." };
    }
  }
  return { actions };
}

async function readAction(intent: string, clientName: string | null, itemName: string | null, clients: Client[], inventory: Item[], businessId: string) {
  if (intent === "QUERY_LEDGER") {
    const result = matchNamed(clientName, clients, (client) => client.name);
    if (result.kind !== "matched") return result.kind === "ambiguous" ? "I found more than one matching client. Which one did you mean?" : "I could not identify that client. Which client should I check?";
    return `${result.value.name} ka outstanding balance ${formatPaise(result.value.balance_paise)} hai.`;
  }
  if (intent === "QUERY_STOCK") {
    const result = matchNamed(itemName, inventory, (item) => item.item_name);
    if (result.kind !== "matched") return result.kind === "ambiguous" ? "I found more than one matching item. Which one did you mean?" : "I could not identify that inventory item.";
    return `${result.value.item_name}: ${result.value.quantity} ${result.value.unit} in stock.`;
  }
  if (intent === "GENERATE_REPORT") {
    const report = await databaseRequest<{ totalReceivablePaise: string; clientsWithBalance: number }>("rpc/rpc_ledger_summary", { method: "POST", body: { p_business: businessId } });
    return `Outstanding total ${formatPaise(report.totalReceivablePaise)} across ${report.clientsWithBalance} clients.`;
  }
  return null;
}

export async function processChatText(businessId: string, userId: string, inputText: string, channel: "web" | "telegram" = "web") {
  const input = chatRequestSchema.safeParse({ text: inputText });
  if (!input.success) throw new Error("invalid_request");
  const loaded = await loadChatContext(businessId, userId);
    const userMessageId = await saveMessage(businessId, userId, "user", input.data.text, undefined, channel);
    const result = await recordAiUsage(businessId, userId, () => parseCommandWithUsage(loaded.promptContext, input.data.text));
    const command = result.value as Awaited<ReturnType<typeof parseCommandWithUsage>>["value"];
    let message = command.reply;
    let pendingActionId: string | undefined;
    const writes = command.actions.filter((action) => ["ADD_SALE", "UPDATE_STOCK", "MARK_PAID", "GENERATE_INVOICE", "ADD_CLIENT", "SEND_REMINDER"].includes(action.intent));
    const reads = command.actions.filter((action) => ["QUERY_LEDGER", "QUERY_STOCK", "GENERATE_REPORT"].includes(action.intent));
    if (command.confidence < 0.75) message = "Could you clarify the client, item, or amount so I do not record the wrong information?";
    else if (writes.length) {
      const prepared = await hydrate({ ...command, actions: writes }, loaded.clients, loaded.inventory);
      if (prepared.error) message = prepared.error;
      else if (prepared.actions) {
        const rows = await databaseRequest<{ id: string }[]>("pending_actions?select=id", {
          method: "POST", prefer: "return=representation",
          body: { business_id: businessId, chat_message_id: userMessageId, actions: prepared.actions, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
        });
        const pending = rows[0];
        if (!pending) throw new Error("Pending action could not be saved");
        pendingActionId = pending.id;
        message = "Review these proposed changes and confirm to save them.";
      }
    }
    if (!writes.length && command.confidence >= 0.75 && reads.length) {
      const outputs = await Promise.all(reads.map((action) => readAction(action.intent, action.clientName, action.items[0]?.name ?? null, loaded.clients, loaded.inventory, businessId)));
      message = outputs.filter((output): output is string => output !== null).join("\n");
    }
    if (!writes.length && !reads.length && command.confidence >= 0.75) message = command.reply;
    await saveMessage(businessId, userId, "assistant", message, command, channel);
  return { message, requiresConfirmation: Boolean(pendingActionId), ...(pendingActionId ? { pendingActionId } : {}) };
}

chatRouter.post("/api/chat", async (req, res) => {
  const input = chatRequestSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  try { res.json(await processChatText(req.ctx!.businessId, req.ctx!.userId, input.data.text)); }
  catch (error) {
    if (error instanceof Error && error.message.includes("Daily AI limit reached")) return res.status(429).json({ error: "daily_ai_limit_reached" });
    if (error instanceof Error && error.message.includes("Meta Model API is not configured")) return res.status(503).json({ error: "ai_unavailable" });
    res.status(502).json({ error: "chat_unavailable", message: "Abhi samajh nahi paaya, dobara try karein." });
  }
});

chatRouter.post("/api/chat/:actionId/confirm", async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.actionId)) return res.status(400).json({ error: "invalid_action_id" });
  try {
    const results = await databaseRequest<unknown>("rpc/rpc_confirm_pending_action", { method: "POST", body: { p_business: req.ctx!.businessId, p_action: req.params.actionId, p_actor: req.ctx!.userId } });
    const status = typeof results === "object" && results !== null && "status" in results ? (results as { status: string }).status : "CONFIRMED";
    const message = status === "EXPIRED" ? "This confirmation expired. Please enter the request again." : "Confirmed. The requested change was saved.";
    await saveMessage(req.ctx!.businessId, req.ctx!.userId, "assistant", message);
    res.json({ status, results, message });
  } catch (error) { sendDatabaseError(error, res); }
});

chatRouter.post("/api/chat/:actionId/cancel", async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.actionId)) return res.status(400).json({ error: "invalid_action_id" });
  const params = new URLSearchParams({ id: `eq.${req.params.actionId}`, business_id: `eq.${req.ctx!.businessId}`, status: "eq.PENDING" });
  try {
    const rows = await databaseRequest<unknown[]>(`pending_actions?${params}`, { method: "PATCH", body: { status: "CANCELLED", updated_at: new Date().toISOString() }, prefer: "return=representation" });
    if (!rows.length) return res.status(404).json({ error: "pending_action_not_found" });
    res.json({ status: "CANCELLED" });
  } catch (error) { sendDatabaseError(error, res); }
});
