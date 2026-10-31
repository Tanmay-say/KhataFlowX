import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { createPortalToken } from "../services/portalTokens.js";

const mocks = vi.hoisted(() => ({ databaseRequest: vi.fn() }));
vi.mock("../services/database.js", () => ({ databaseRequest: mocks.databaseRequest }));

import { portalRouter } from "./portal.js";
import express from "express";

const businessId = "10000000-0000-4000-8000-000000000001";
const clientId = "20000000-0000-4000-8000-000000000001";
const server = createServer(express().use(express.json()).use(portalRouter));

it("returns only the client account selected by a valid signed portal link", async () => {
  const { token } = createPortalToken(businessId, clientId);
  mocks.databaseRequest.mockResolvedValueOnce([{ id: clientId, name: "Amit Traders", balance_paise: "124000", preferred_language: "hi" }])
    .mockResolvedValueOnce([{ name: "Raju Kirana Store" }])
    .mockResolvedValueOnce([{ id: "invoice-1", number: "KF-2026-0001", total_paise: "124000", paid_paise: "0", status: "ISSUED" }]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/portal/${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ clientName: "Amit Traders", businessName: "Raju Kirana Store", balancePaise: "124000", invoices: [{ id: "invoice-1" }] });
  } finally { server.close(); await once(server, "close"); }
});

it("submits cash claims through the idempotent database RPC", async () => {
  const { token } = createPortalToken(businessId, clientId);
  mocks.databaseRequest.mockResolvedValueOnce({ confirmationId: "claim-1", status: "PENDING", amountPaise: "1200" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/portal/${token}/confirm-cash`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountPaise: "1200", idempotencyKey: "cash-claim-1234" }) });
    expect(response.status).toBe(201);
    expect((await response.json()).confirmationId).toBe("claim-1");
    expect(mocks.databaseRequest).toHaveBeenCalledWith("rpc/rpc_submit_payment_claim", { method: "POST", body: { p_business: businessId, p_client: clientId, p_amount_paise: "1200", p_note: null, p_idem: "cash-claim-1234" } });
  } finally { server.close(); await once(server, "close"); }
});
