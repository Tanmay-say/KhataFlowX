import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import app from "../app.js";

const server = createServer(app);

afterEach(async () => {
  if (server.listening) {
    server.close();
    await once(server, "close");
  }
});

it("rejects malformed OTP and business requests before calling Supabase", async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");

  const otp = await fetch(`http://127.0.0.1:${address.port}/api/auth/otp`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bad" }),
  });
  const business = await fetch(`http://127.0.0.1:${address.port}/api/businesses`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Shop" }),
  });
  expect(otp.status).toBe(400);
  expect(business.status).toBe(401);
});
