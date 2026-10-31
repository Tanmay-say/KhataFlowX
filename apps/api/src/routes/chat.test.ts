import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn(), parseCommandWithUsage: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: { ctx?: unknown }, _res: unknown, next: () => void) => { req.ctx = { userId: "00000000-0000-4000-8000-000000000001" }; next(); },
  requireBusiness: (req: { ctx?: Record<string, unknown> }, _res: unknown, next: () => void) => { req.ctx = { ...req.ctx, businessId: "10000000-0000-4000-8000-000000000001", role: "owner" }; next(); },
}));
vi.mock("../services/database.js", () => ({
  databaseRequest: mocks.databaseRequest,
  sendDatabaseError: (_error: unknown, res: import("express").Response) => res.status(503).json({ error: "database_unavailable" }),
}));
vi.mock("../services/ai/context.js", () => ({ loadChatContext: async () => ({
  promptContext: "{}",
  clients: [{ id: "20000000-0000-4000-8000-000000000001", name: "Ramesh", balance_paise: "0" }],
  inventory: [{ id: "30000000-0000-4000-8000-000000000001", item_name: "atta", unit: "kg", quantity: "5", price_per_unit_paise: "4000" }],
}) }));
vi.mock("../services/ai/muse.js", () => ({ parseCommandWithUsage: mocks.parseCommandWithUsage }));

import app from "../app.js";

const server = createServer(app);
afterEach(async () => {
  mocks.databaseRequest.mockReset();
  mocks.parseCommandWithUsage.mockReset();
  if (server.listening) { server.close(); await once(server, "close"); }
});

it("stores a sale preview and executes only the stored action after confirmation", async () => {
  mocks.databaseRequest.mockImplementation((path: string) => {
    if (path === "rpc/rpc_claim_ai_call") return Promise.resolve("usage-1");
    if (path === "chat_messages?select=id") return Promise.resolve([{ id: "message-1" }]);
    if (path === "pending_actions?select=id") return Promise.resolve([{ id: "pending-1" }]);
    return Promise.resolve(undefined);
  });
  mocks.parseCommandWithUsage.mockResolvedValue({
    model: "muse-spark-1.3", inputTokens: 10, outputTokens: 5,
    value: { confidence: 0.98, requiresConfirmation: false, reply: "Sale added", summary: "Add sale", actions: [{ intent: "ADD_SALE", clientName: "Ramesh", items: [{ name: "atta", quantity: "2", unit: "kg" }], amountRupees: null, stockDelta: null, phone: null, dueDate: null }] },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  const base = `http://127.0.0.1:${address.port}/api/chat`;

  const preview = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Ramesh got 2 kg atta" }) });
  expect(preview.status).toBe(200);
  expect(await preview.json()).toMatchObject({ pendingActionId: "pending-1", requiresConfirmation: true });
  expect(mocks.databaseRequest).toHaveBeenCalledWith("pending_actions?select=id", expect.objectContaining({ body: expect.objectContaining({ actions: [{ intent: "ADD_SALE", clientId: "20000000-0000-4000-8000-000000000001", items: [{ name: "atta", unit: "kg", qty: "2", pricePaise: "4000" }], totalPaise: "8000", paidNowPaise: "0" }] }) }));
  expect(mocks.databaseRequest.mock.calls.some(([path]) => String(path).includes("rpc_record_sale"))).toBe(false);

  mocks.databaseRequest.mockResolvedValueOnce([{ status: "CONFIRMED", results: [{ saleEntryId: "entry-1" }] }]);
  const confirm = await fetch(`${base}/pending-1/confirm`, { method: "POST" });
  expect(confirm.status).toBe(400);
  const validConfirm = await fetch(`${base}/70000000-0000-4000-8000-000000000001/confirm`, { method: "POST" });
  expect(validConfirm.status).toBe(200);
  expect(mocks.databaseRequest).toHaveBeenCalledWith("rpc/rpc_confirm_pending_action", expect.objectContaining({ body: { p_business: "10000000-0000-4000-8000-000000000001", p_action: "70000000-0000-4000-8000-000000000001", p_actor: "00000000-0000-4000-8000-000000000001" } }));
});
