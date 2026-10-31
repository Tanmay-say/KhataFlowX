import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: { ctx?: unknown }, _res: unknown, next: () => void) => { req.ctx = { userId: "00000000-0000-4000-8000-000000000001" }; next(); },
  requireBusiness: (req: { ctx?: Record<string, unknown> }, _res: unknown, next: () => void) => { req.ctx = { ...req.ctx, businessId: "10000000-0000-4000-8000-000000000001", role: "owner" }; next(); },
}));
vi.mock("../services/database.js", () => ({
  databaseRequest: mocks.databaseRequest,
  sendDatabaseError: (_error: unknown, res: import("express").Response) => res.status(503).json({ error: "database_unavailable" }),
}));

import app from "../app.js";

const server = createServer(app);
afterEach(async () => {
  mocks.databaseRequest.mockReset();
  if (server.listening) { server.close(); await once(server, "close"); }
});

it("requires and forwards an idempotency key for ledger writes", async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  const endpoint = `http://127.0.0.1:${address.port}/api/ledger/sales`;
  const body = { clientId: "20000000-0000-4000-8000-000000000001", items: [{ name: "Dal", unit: "kg", qty: "1.250", pricePaise: "200" }] };

  const missing = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(missing.status).toBe(400);
  expect(mocks.databaseRequest).not.toHaveBeenCalled();

  mocks.databaseRequest.mockResolvedValue({ invoiceId: "invoice-1", balancePaise: "250" });
  for (let i = 0; i < 2; i++) {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "sale-12345678" }, body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ invoiceId: "invoice-1", balancePaise: "250" });
  }
  expect(mocks.databaseRequest).toHaveBeenCalledTimes(2);
  expect(mocks.databaseRequest.mock.calls[0][1].body).toMatchObject({ p_total_paise: "250", p_idem: "sale-12345678" });
});
