import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: { ctx?: unknown }, _res: unknown, next: () => void) => { req.ctx = { userId: "00000000-0000-4000-8000-000000000001" }; next(); },
  requireBusiness: (req: { ctx?: Record<string, unknown> }, _res: unknown, next: () => void) => { req.ctx = { ...req.ctx, businessId: "10000000-0000-4000-8000-000000000001", role: "owner" }; next(); },
}));
vi.mock("../services/database.js", () => ({ databaseRequest: mocks.databaseRequest }));

import app from "../app.js";

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

it("creates a single-use admin bot deep link and stores only its hash", async () => {
  mocks.databaseRequest.mockResolvedValue(undefined);
  const response = await fetch(`${await start()}/api/telegram/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bot: "admin" }) });
  expect(response.status).toBe(201);
  const result = await response.json() as { url: string; expiresAt: string };
  const token = new URL(result.url).searchParams.get("start");
  if (!token) throw new Error("Expected a Telegram start token");
  expect(result.url).toContain("https://t.me/test_admin_bot");
  expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  expect(mocks.databaseRequest).toHaveBeenCalledWith("telegram_link_tokens", expect.objectContaining({ body: expect.objectContaining({ bot: "admin", created_by: "00000000-0000-4000-8000-000000000001", token_hash: createHash("sha256").update(token).digest("hex") }) }));
});

it("rejects webhook updates without Telegram's configured secret header", async () => {
  const response = await fetch(`${await start()}/api/telegram/admin/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ update_id: 1 }) });
  expect(response.status).toBe(401);
});
