import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({
  authenticate: (req: { ctx?: unknown }, _res: unknown, next: () => void) => { req.ctx = { userId: "00000000-0000-4000-8000-000000000001" }; next(); },
  requireBusiness: (_req: unknown, _res: unknown, next: () => void) => next(),
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

it("creates a client profile for the signed-in account", async () => {
  mocks.databaseRequest.mockResolvedValueOnce([{ user_id: "00000000-0000-4000-8000-000000000001", name: "Asha" }]);
  const response = await fetch(`${await start()}/api/client/profile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Asha", phone: "123" }) });
  expect(response.status).toBe(200);
  expect(mocks.databaseRequest).toHaveBeenCalledWith("client_profiles?on_conflict=user_id", expect.objectContaining({ body: expect.objectContaining({ user_id: "00000000-0000-4000-8000-000000000001", name: "Asha" }) }));
});

it("accepts invitations using the authenticated user's id and token hash", async () => {
  const token = "A".repeat(43);
  mocks.databaseRequest.mockResolvedValueOnce({ businessId: "10000000-0000-4000-8000-000000000001" });
  const response = await fetch(`${await start()}/api/client-invitations/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  expect(response.status).toBe(200);
  expect(mocks.databaseRequest).toHaveBeenCalledWith("rpc/rpc_accept_client_invitation", { method: "POST", body: { p_token_hash: createHash("sha256").update(token).digest("hex"), p_user_id: "00000000-0000-4000-8000-000000000001" } });
});

it("only creates a shop portal link from the signed-in customer's business link", async () => {
  const businessId = "10000000-0000-4000-8000-000000000001";
  mocks.databaseRequest.mockResolvedValueOnce([{ client_id: "20000000-0000-4000-8000-000000000001" }]);
  const response = await fetch(`${await start()}/api/client/shops/${businessId}/portal-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(response.status).toBe(200);
  expect((await response.json()).url).toContain("/pay/");
  expect(mocks.databaseRequest).toHaveBeenCalledWith(expect.stringContaining("user_id=eq.00000000-0000-4000-8000-000000000001"));
});
