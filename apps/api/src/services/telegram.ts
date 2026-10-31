import { randomBytes, createHash } from "node:crypto";
import { Markup, Telegraf, type Context } from "telegraf";
import { env } from "../config/env.js";
import { databaseRequest } from "./database.js";
import { processChatText } from "../routes/chat.js";

type BotName = "admin" | "client";
type Session = { business_id: string; client_id: string | null; chat_id: string; state: Record<string, unknown> };
const bots = new Map<BotName, Telegraf>();
const botToken = (name: BotName) => name === "admin" ? env.TELEGRAM_ADMIN_BOT_TOKEN : env.TELEGRAM_CLIENT_BOT_TOKEN;
const cash = (amount: string) => { const value = BigInt(amount); return `₹${new Intl.NumberFormat("en-IN").format(value / 100n)}${value % 100n ? `.${String(value % 100n).padStart(2, "0")}` : ""}`; };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createTelegramLink(bot: BotName, businessId: string, createdBy: string, clientId?: string) {
  const username = bot === "admin" ? env.TELEGRAM_ADMIN_BOT_USERNAME : env.TELEGRAM_CLIENT_BOT_USERNAME;
  if (!username || !botToken(bot)) throw new Error("Telegram bot is not configured");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await databaseRequest("telegram_link_tokens", { method: "POST", body: { token_hash: sha(token), bot, business_id: businessId, client_id: clientId ?? null, created_by: createdBy, expires_at: expiresAt } });
  return { url: `https://t.me/${username}?start=${token}`, expiresAt };
}

async function getSession(bot: BotName, chatId: string) {
  const params = new URLSearchParams({ select: "business_id,client_id,chat_id,state", bot: `eq.${bot}`, chat_id: `eq.${chatId}`, limit: "1" });
  const [row] = await databaseRequest<Session[]>(`telegram_sessions?${params}`);
  return row;
}
function actor(session: Session) { const value = session.state?.linkedBy; if (typeof value !== "string") throw new Error("Shopkeeper identity missing"); return value; }
async function linked(ctx: Context, bot: BotName) {
  if (!ctx.chat) return null;
  const session = await getSession(bot, String(ctx.chat.id));
  if (!session) { await ctx.reply("Open your KhataFlow link and tap Start to connect this chat."); return null; }
  return session;
}
async function startLink(ctx: Context, bot: BotName, token?: string) {
  if (!token) return ctx.reply("To connect, open the one-time KhataFlow link shared by your shopkeeper.");
  if (!ctx.chat || !ctx.from) return;
  try {
    const result = await databaseRequest<{ businessId: string; clientId: string | null }>("rpc/rpc_consume_telegram_link", { method: "POST", body: { p_token_hash: sha(token), p_bot: bot, p_chat_id: String(ctx.chat.id), p_username: ctx.from.username ?? "" } });
    await ctx.reply(bot === "admin" ? "Shop linked. Send a message or use /help." : "Shop linked. Use /balance, /history, or /pay to view your khata.");
    return result;
  } catch { return ctx.reply("This link expired or was already used. Ask for a fresh one."); }
}
function actionKeyboard(actionId: string) {
  return Markup.inlineKeyboard([[Markup.button.callback("Confirm", `confirm:${actionId}`), Markup.button.callback("Edit / Cancel", `cancel:${actionId}`)]]);
}
function configureAdmin(bot: Telegraf) {
  bot.start((ctx) => startLink(ctx, "admin", ctx.startPayload));
  bot.command("link", (ctx) => ctx.reply("Open the one-time shopkeeper link from KhataFlow settings."));
  bot.help((ctx) => ctx.reply("/summary · /dues · /stock · /claims\nSend a message or voice note to use the Munshi."));
  bot.command("summary", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try {
      const summary = await databaseRequest<{ totalReceivablePaise: string; clientsWithBalance: number }>("rpc/rpc_ledger_summary", { method: "POST", body: { p_business: session.business_id } });
      await ctx.reply(`Aaj ka hisaab\nOutstanding: ${cash(summary.totalReceivablePaise)}\nCustomers with dues: ${summary.clientsWithBalance}`);
    } catch { await ctx.reply("Summary abhi load nahi ho paaya."); }
  });
  bot.command("dues", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try {
      const query = new URLSearchParams({ select: "name,balance_paise", business_id: `eq.${session.business_id}`, balance_paise: "gt.0", archived_at: "is.null", order: "balance_paise.desc", limit: "30" });
      const rows = await databaseRequest<{ name: string; balance_paise: string }[]>(`clients?${query}`);
      await ctx.reply(rows.length ? rows.map((row) => `${row.name} · ${cash(row.balance_paise)}`).join("\n") : "Kisi customer ka udhaar pending nahi hai.");
    } catch { await ctx.reply("Dues abhi load nahi ho paaye."); }
  });
  bot.command("stock", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try {
      const query = new URLSearchParams({ select: "item_name,quantity,unit,low_stock_threshold", business_id: `eq.${session.business_id}`, order: "item_name.asc", limit: "100" });
      const rows = await databaseRequest<{ item_name: string; quantity: string; unit: string; low_stock_threshold: string }[]>(`inventory?${query}`);
      const low = rows.filter((row) => Number(row.quantity) <= Number(row.low_stock_threshold));
      await ctx.reply(low.length ? `Low stock\n${low.map((row) => `${row.item_name} · ${row.quantity} ${row.unit}`).join("\n")}` : "Koi low-stock item nahi hai.");
    } catch { await ctx.reply("Stock abhi load nahi ho paaya."); }
  });
  bot.command("claims", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try {
      const query = new URLSearchParams({ select: "id,client_id,amount_paise,note,created_at", business_id: `eq.${session.business_id}`, status: "eq.PENDING", order: "created_at.asc", limit: "20" });
      const claims = await databaseRequest<{ id: string; client_id: string; amount_paise: string; note: string | null }[]>(`payment_confirmations?${query}`);
      for (const claim of claims) {
        const [client] = await databaseRequest<{ name: string }[]>(`clients?${new URLSearchParams({ select: "name", id: `eq.${claim.client_id}`, business_id: `eq.${session.business_id}`, limit: "1" })}`);
        await ctx.reply(`${client?.name ?? "Customer"} says cash paid: ${cash(claim.amount_paise)}${claim.note ? `\n${claim.note}` : ""}`, Markup.inlineKeyboard([[Markup.button.callback("Approve", `claim:yes:${claim.id}`), Markup.button.callback("Reject", `claim:no:${claim.id}`)]]));
      }
      if (!claims.length) await ctx.reply("No pending payment claims.");
    } catch { await ctx.reply("Payment claims abhi load nahi ho paaye."); }
  });
  bot.action(/^confirm:([0-9a-f-]{36})$/, async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try { await databaseRequest("rpc/rpc_confirm_pending_action", { method: "POST", body: { p_business: session.business_id, p_action: ctx.match[1], p_actor: actor(session) } }); await ctx.answerCbQuery("Saved"); await ctx.editMessageReplyMarkup(undefined); await ctx.reply("Confirmed. The change was saved to the khata."); }
    catch { await ctx.answerCbQuery("Could not confirm this action", { show_alert: true }); }
  });
  bot.action(/^cancel:([0-9a-f-]{36})$/, async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try { const query = new URLSearchParams({ id: `eq.${ctx.match[1]}`, business_id: `eq.${session.business_id}`, status: "eq.PENDING" }); await databaseRequest(`pending_actions?${query}`, { method: "PATCH", body: { status: "CANCELLED" } }); await ctx.answerCbQuery("Cancelled"); await ctx.editMessageReplyMarkup(undefined); }
    catch { await ctx.answerCbQuery("Could not cancel", { show_alert: true }); }
  });
  bot.action(/^claim:(yes|no):([0-9a-f-]{36})$/, async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    try { const approve = ctx.match[1] === "yes"; await databaseRequest("rpc/rpc_confirm_payment_claim", { method: "POST", body: { p_confirmation: ctx.match[2], p_approve: approve, p_actor: actor(session) } }); await ctx.answerCbQuery(approve ? "Payment approved" : "Claim rejected"); await ctx.editMessageReplyMarkup(undefined); }
    catch { await ctx.answerCbQuery("Could not update claim", { show_alert: true }); }
  });
  bot.command("confirmvoice", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    const transcript = session.state?.pendingTranscript;
    if (typeof transcript !== "string" || !transcript) return ctx.reply("Send a voice note first. I will show the transcript for review.");
    try { await databaseRequest(`telegram_sessions?${new URLSearchParams({ bot: "eq.admin", chat_id: `eq.${session.chat_id}` })}`, { method: "PATCH", body: { state: {} } }); const result = await processChatText(session.business_id, actor(session), transcript, "telegram"); await ctx.reply(result.message, result.pendingActionId ? actionKeyboard(result.pendingActionId) : undefined); }
    catch { await ctx.reply("I could not process that transcript. Please type it instead."); }
  });
  bot.command("editvoice", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    const revised = ctx.message.text.replace(/^\/editvoice(?:@\w+)?\s*/i, "").trim();
    if (!revised) return ctx.reply("Send /editvoice followed by the corrected words.");
    try { const result = await processChatText(session.business_id, actor(session), revised, "telegram"); await ctx.reply(result.message, result.pendingActionId ? actionKeyboard(result.pendingActionId) : undefined); }
    catch { await ctx.reply("I could not process that edit."); }
  });
  bot.on("voice", async (ctx) => {
    const session = await linked(ctx, "admin"); if (!session) return;
    const voice = ctx.message.voice;
    if (!voice || (voice.file_size ?? 0) > 2 * 1024 * 1024) return ctx.reply("Voice notes must be under 2 MB.");
    if (!env.SARVAM_API_KEY) return ctx.reply("Voice transcription is not configured yet. Type your request instead.");
    try {
      const fileUrl = await ctx.telegram.getFileLink(voice.file_id);
      const response = await fetch(fileUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("file_download_failed");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024) throw new Error("file_too_large");
      const form = new FormData(); form.append("file", new Blob([bytes], { type: "audio/ogg" }), "voice.ogg"); form.set("model", env.SARVAM_STT_MODEL); form.set("mode", env.SARVAM_STT_MODE);
      const transcribed = await fetch(new URL("/speech-to-text", env.SARVAM_API_URL), { method: "POST", headers: { "api-subscription-key": env.SARVAM_API_KEY }, body: form, signal: AbortSignal.timeout(45000) });
      const result = await transcribed.json() as { transcript?: unknown };
      if (!transcribed.ok || typeof result.transcript !== "string" || !result.transcript.trim()) throw new Error("transcription_failed");
      await databaseRequest(`telegram_sessions?${new URLSearchParams({ bot: "eq.admin", chat_id: `eq.${session.chat_id}` })}`, { method: "PATCH", body: { state: { pendingTranscript: result.transcript.slice(0, 2000) } } });
      await ctx.reply(`Transcript — review before it reaches the khata:\n“${result.transcript.slice(0, 1000)}”\n\nReply /confirmvoice to continue or /editvoice followed by the corrected words.`);
    } catch { await ctx.reply("I could not transcribe that note. Please type your request."); }
  });
  bot.on("text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const session = await linked(ctx, "admin"); if (!session) return;
    try { const result = await processChatText(session.business_id, actor(session), ctx.message.text, "telegram"); await ctx.reply(result.message, result.pendingActionId ? actionKeyboard(result.pendingActionId) : undefined); }
    catch { await ctx.reply("Abhi samajh nahi paaya. Thoda aur detail mein likhein."); }
  });
}

function configureClient(bot: Telegraf) {
  bot.start((ctx) => startLink(ctx, "client", ctx.startPayload));
  bot.command("link", (ctx) => ctx.reply("Use the one-time link shared by your shopkeeper, then tap Start."));
  bot.help((ctx) => ctx.reply("/balance · /history · /orders · /pay"));
  bot.command("balance", async (ctx) => {
    const session = await linked(ctx, "client"); if (!session?.client_id) return;
    try { const [client] = await databaseRequest<{ name: string; balance_paise: string }[]>(`clients?${new URLSearchParams({ select: "name,balance_paise", id: `eq.${session.client_id}`, business_id: `eq.${session.business_id}`, limit: "1" })}`); await ctx.reply(client ? `${client.name} · baaki ${cash(client.balance_paise)}` : "Khata not found."); }
    catch { await ctx.reply("Khata abhi load nahi ho paaya."); }
  });
  bot.command("history", async (ctx) => {
    const session = await linked(ctx, "client"); if (!session?.client_id) return;
    try { const query = new URLSearchParams({ select: "type,amount_paise,note,created_at", business_id: `eq.${session.business_id}`, client_id: `eq.${session.client_id}`, order: "created_at.desc", limit: "10" }); const entries = await databaseRequest<{ type: string; amount_paise: string; note: string | null; created_at: string }[]>(`ledger_entries?${query}`); await ctx.reply(entries.length ? entries.map((entry) => `${new Date(entry.created_at).toLocaleDateString("en-IN")} · ${entry.note || entry.type} · ${cash(entry.amount_paise)}`).join("\n") : "No entries yet."); }
    catch { await ctx.reply("History abhi load nahi ho paayi."); }
  });
  bot.command("orders", async (ctx) => {
    const session = await linked(ctx, "client"); if (!session?.client_id) return;
    try { const query = new URLSearchParams({ select: "id,status,items,created_at", business_id: `eq.${session.business_id}`, client_id: `eq.${session.client_id}`, order: "created_at.desc", limit: "10" }); const orders = await databaseRequest<{ status: string; created_at: string }[]>(`orders?${query}`); await ctx.reply(orders.length ? orders.map((order) => `${new Date(order.created_at).toLocaleDateString("en-IN")} · ${order.status}`).join("\n") : "No orders yet."); }
    catch { await ctx.reply("Orders abhi load nahi ho paaye."); }
  });
  bot.command("pay", async (ctx) => {
    const session = await linked(ctx, "client"); if (!session?.client_id) return;
    try {
      const [client] = await databaseRequest<{ name: string; balance_paise: string }[]>(`clients?${new URLSearchParams({ select: "name,balance_paise", id: `eq.${session.client_id}`, business_id: `eq.${session.business_id}`, limit: "1" })}`);
      if (!client || BigInt(client.balance_paise) <= 0n) return ctx.reply("Aapka khata clear hai.");
      const { token } = await import("./portalTokens.js").then(({ createPortalToken }) => createPortalToken(session.business_id, session.client_id!));
      const url = new URL(`/pay/${token}`, env.APP_URL).toString();
      await ctx.reply(`${client.name} · baaki ${cash(client.balance_paise)}`, Markup.inlineKeyboard([[Markup.button.url("Pay online · test", url)], [Markup.button.callback("I paid cash", "client:cash")]]));
    } catch { await ctx.reply("Pay link abhi nahi ban paaya."); }
  });
  bot.action("client:cash", async (ctx) => {
    const session = await linked(ctx, "client"); if (!session?.client_id) return;
    try {
      const [client] = await databaseRequest<{ balance_paise: string }[]>(`clients?${new URLSearchParams({ select: "balance_paise", id: `eq.${session.client_id}`, business_id: `eq.${session.business_id}`, limit: "1" })}`);
      if (!client || BigInt(client.balance_paise) <= 0n) return ctx.answerCbQuery("No balance due");
      await databaseRequest("rpc/rpc_submit_payment_claim", { method: "POST", body: { p_business: session.business_id, p_client: session.client_id, p_amount_paise: client.balance_paise, p_note: "Customer reports cash paid in Telegram", p_idem: `tg-cash:${randomBytes(18).toString("hex")}` } });
      await ctx.answerCbQuery("Sent for shopkeeper approval"); await ctx.reply("Cash payment sent to the shopkeeper for approval.");
    } catch { await ctx.answerCbQuery("Could not send the cash claim", { show_alert: true }); }
  });
}

export function telegramBot(name: BotName) {
  const existing = bots.get(name);
  if (existing) return existing;
  const token = botToken(name);
  if (!token) return undefined;
  const bot = new Telegraf(token, { handlerTimeout: 30_000 });
  if (name === "admin") configureAdmin(bot); else configureClient(bot);
  bots.set(name, bot);
  return bot;
}
export async function startTelegram() {
  if (env.TELEGRAM_MODE !== "polling") return;
  for (const name of ["admin", "client"] as const) {
    const bot = telegramBot(name);
    if (bot) await bot.launch();
  }
}

export async function notifyTelegramPayment(businessId: string, clientId: string, amountPaise: string) {
  try {
    const query = new URLSearchParams({ select: "bot,chat_id,client_id", business_id: `eq.${businessId}` });
    const sessions = await databaseRequest<{ bot: BotName; chat_id: string; client_id: string | null }[]>(`telegram_sessions?${query}`);
    await Promise.all(sessions.filter((session) => session.bot === "admin" || (session.bot === "client" && session.client_id === clientId)).map(async (session) => {
      const bot = telegramBot(session.bot);
      if (bot) await bot.telegram.sendMessage(session.chat_id, `${session.bot === "admin" ? "Payment received" : "Payment recorded"} · ${cash(amountPaise)}`);
    }));
  } catch { /* notifications do not undo a settled payment */ }
}
