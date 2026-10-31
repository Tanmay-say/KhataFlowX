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
const actualFetch = globalThis.fetch;
afterEach(async () => {
  mocks.databaseRequest.mockReset();
  vi.unstubAllGlobals();
  if (server.listening) { server.close(); await once(server, "close"); }
});

function start() {
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    return `http://127.0.0.1:${address.port}`;
  });
}

it("transcribes an uploaded voice note and returns a transcript for user review", async () => {
  mocks.databaseRequest.mockResolvedValue("usage-1");
  const provider = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => Response.json({ transcript: "Ramesh ne atta liya", language_code: "hi-IN" }));
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith("http://127.0.0.1") ? actualFetch(input, init) : provider(input, init)));
  const base = await start();
  const form = new FormData();
  form.append("file", new Blob(["audio sample"], { type: "audio/webm" }), "voice.webm");
  const response = await fetch(`${base}/api/voice/transcribe`, { method: "POST", body: form });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "Ramesh ne atta liya", language: "hi-IN" });
  expect(provider).toHaveBeenCalledTimes(1);
  expect(String(provider.mock.calls[0][0])).toBe("https://api.sarvam.ai/speech-to-text");
  expect(mocks.databaseRequest).toHaveBeenCalledWith("rpc/rpc_claim_voice_call", expect.objectContaining({ body: expect.objectContaining({ p_kind: "stt" }) }));
});

it("returns TTS as playable audio and rejects long speech before provider use", async () => {
  mocks.databaseRequest.mockResolvedValue("usage-2");
  const audio = Buffer.from("mock mp3 bytes").toString("base64");
  const provider = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => Response.json({ audios: [audio] }));
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).startsWith("http://127.0.0.1") ? actualFetch(input, init) : provider(input, init)));
  const base = await start();
  const valid = await fetch(`${base}/api/voice/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Namaste", language: "hi" }) });
  expect(valid.status).toBe(200);
  expect(valid.headers.get("content-type")).toBe("audio/mpeg");
  expect(Buffer.from(await valid.arrayBuffer()).toString()).toBe("mock mp3 bytes");
  expect(provider).toHaveBeenCalledTimes(1);

  const tooLong = await fetch(`${base}/api/voice/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(301), language: "hi" }) });
  expect(tooLong.status).toBe(400);
  expect(provider).toHaveBeenCalledTimes(1);
});
