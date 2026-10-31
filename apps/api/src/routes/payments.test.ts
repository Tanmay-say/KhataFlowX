import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { createPortalToken } from "../services/portalTokens.js";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: { ctx?: unknown }, _res: unknown, next: () => void) => { req.ctx = { userId: "00000000-0000-4000-8000-000000000001" }; next(); },
  requireBusiness: (req: { ctx?: Record<string, unknown> }, _res: unknown, next: () => void) => { req.ctx = { ...req.ctx, businessId: "10000000-0000-4000-8000-000000000001", role: "owner" }; next(); },
}));
vi.mock("../services/database.js", () => ({ databaseRequest: mocks.databaseRequest }));
vi.mock("../services/telegram.js", () => ({ notifyTelegramPayment: vi.fn() }));

import app from "../app.js";

const businessId = "10000000-0000-4000-8000-000000000001";
const clientId = "20000000-0000-4000-8000-000000000001";
const server = createServer(app);
afterEach(async () => {
  mocks.databaseRequest.mockReset();
  if (server.listening) { server.close(); await once(server, "close"); }
});
async function start() {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  return `http://127.0.0.1:${address.port}`;
}

it("creates a portal payment intent using the server-verified outstanding balance", async () => {
  const { token } = createPortalToken(businessId, clientId);
  mocks.databaseRequest
    .mockResolvedValueOnce([{ id: clientId, balance_paise: "12500" }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: "payment-1", business_id: businessId, client_id: clientId, invoice_id: null, amount_paise: "12500", method: "UPI_MOCK", status: "PENDING", provider: "mock", provider_ref: "mock:payment-1", created_at: "2026-10-31T00:00:00Z" }]);
  const response = await fetch(`${await start()}/api/payments/intents`, { method: "POST", headers: { "content-type": "application/json", "x-portal-token": token }, body: JSON.stringify({ clientId, idempotencyKey: "payment-intent-12345" }) });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ paymentId: "payment-1", amountPaise: "12500", status: "PENDING" });
  expect(mocks.databaseRequest.mock.calls[2][1].body).toMatchObject({ amount_paise: "12500", business_id: businessId, client_id: clientId, status: "PENDING" });
});

it("settles mock payment through the atomic ledger RPC", async () => {
  const { token } = createPortalToken(businessId, clientId);
  mocks.databaseRequest
    .mockResolvedValueOnce([{ id: "payment-1", business_id: businessId, client_id: clientId, invoice_id: null, amount_paise: "5000", method: "UPI_MOCK", status: "PENDING", provider: "mock", provider_ref: "mock:payment-1", created_at: "2026-10-31T00:00:00Z" }])
    .mockResolvedValueOnce({ paymentId: "payment-1", balancePaise: "0" });
  const response = await fetch(`${await start()}/api/payments/mock/payment-1/complete`, { method: "POST", headers: { "content-type": "application/json", "x-portal-token": token }, body: JSON.stringify({ outcome: "success" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ paymentId: "payment-1", status: "SUCCEEDED" });
  expect(mocks.databaseRequest.mock.calls[1][0]).toBe("rpc/rpc_record_payment");
  expect(mocks.databaseRequest.mock.calls[1][1].body).toMatchObject({ p_business: businessId, p_client: clientId, p_payment_id: "payment-1", p_allow_advance: false });
});

it("rejects an amount above the verified balance without creating a payment", async () => {
  const { token } = createPortalToken(businessId, clientId);
  mocks.databaseRequest.mockResolvedValueOnce([{ id: clientId, balance_paise: "5000" }]);
  const response = await fetch(`${await start()}/api/payments/intents`, { method: "POST", headers: { "content-type": "application/json", "x-portal-token": token }, body: JSON.stringify({ amountPaise: "5001", idempotencyKey: "payment-intent-12345" }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_payment_amount" });
  expect(mocks.databaseRequest).toHaveBeenCalledTimes(1);
});

it("does not call settlement twice when a successful mock completion is replayed", async () => {
  const { token } = createPortalToken(businessId, clientId);
  const pending = { id: "payment-1", business_id: businessId, client_id: clientId, invoice_id: null, amount_paise: "5000", method: "UPI_MOCK", status: "PENDING", provider: "mock", provider_ref: "mock:payment-1", created_at: "2026-10-31T00:00:00Z" };
  const succeeded = { ...pending, status: "SUCCEEDED" };
  mocks.databaseRequest.mockResolvedValueOnce([pending]).mockResolvedValueOnce({ paymentId: "payment-1", balancePaise: "0" }).mockResolvedValueOnce([succeeded]);
  const endpoint = `${await start()}/api/payments/mock/payment-1/complete`;
  const options = { method: "POST", headers: { "content-type": "application/json", "x-portal-token": token }, body: JSON.stringify({ outcome: "success" }) };
  const first = await fetch(endpoint, options);
  const replay = await fetch(endpoint, options);
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect((await replay.json()).status).toBe("SUCCEEDED");
  expect(mocks.databaseRequest.mock.calls.filter(([path]) => path === "rpc/rpc_record_payment")).toHaveLength(1);
});
