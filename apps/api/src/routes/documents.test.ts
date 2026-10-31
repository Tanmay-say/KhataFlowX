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
const actualFetch = globalThis.fetch;
afterEach(async () => {
  mocks.databaseRequest.mockReset();
  vi.unstubAllGlobals();
  if (server.listening) { server.close(); await once(server, "close"); }
});

it("generates a private invoice PDF with Hindi text and redirects to a signed URL", async () => {
  mocks.databaseRequest
    .mockResolvedValueOnce([{ id: "invoice-1", business_id: "10000000-0000-4000-8000-000000000001", client_id: "client-1", number: "KF-2026-0001", items: [{ name: "चावल", qty: "2", unit: "kg", pricePaise: "10000" }], total_paise: "20000", paid_paise: "0", status: "DRAFT", created_at: "2026-10-31T00:00:00Z" }])
    .mockResolvedValueOnce([{ name: "रामेश", phone: "9999999999", address: "दिल्ली" }])
    .mockResolvedValueOnce([{ name: "दुकान" }])
    .mockResolvedValueOnce([]);
  const provider = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/object/sign/")
    ? Response.json({ signedURL: "/object/sign/invoices/10000000-0000-4000-8000-000000000001/invoice-1.pdf?token=test" })
    : new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith("http://127.0.0.1") ? actualFetch(input, init) : provider(input)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/invoices/invoice-1/pdf`, { redirect: "manual" });
  const responseBody = await response.text();
  expect(response.status, responseBody).toBe(302);
  expect(response.headers.get("location")).toContain("/storage/v1/object/sign/invoices/");
  expect(provider).toHaveBeenCalledTimes(2);
  const upload = provider.mock.calls[0][0] as RequestInfo | URL;
  expect(String(upload)).toContain("/storage/v1/object/invoices/");
  expect(mocks.databaseRequest.mock.calls[3][1]).toMatchObject({ method: "PATCH", body: { pdf_path: "10000000-0000-4000-8000-000000000001/invoice-1.pdf" } });
});
