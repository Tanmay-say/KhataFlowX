import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { authenticate, requireBusiness } from "../middleware/auth.js";
import { databaseRequest } from "../services/database.js";

export const voiceRouter = Router();
voiceRouter.use("/api/voice", authenticate, requireBusiness);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fieldSize: 64, fields: 1, parts: 2 } });
// shortcut: Sarvam enforces the 30-second limit; parse media duration if VOICE_MAX_SECONDS is lowered.

function uploadAudio(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    res.status(code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: code === "LIMIT_FILE_SIZE" ? "audio_too_large" : "invalid_audio_upload" });
  });
}

async function claimUsage(kind: "stt" | "tts", model: string, req: Request) {
  return databaseRequest<string | null>("rpc/rpc_claim_voice_call", {
    method: "POST", body: { p_business: req.ctx!.businessId, p_actor: req.ctx!.userId, p_kind: kind, p_model: model },
  });
}

async function finishUsage(id: string, inputUnits: number, started: number, ok: boolean) {
  await databaseRequest("rpc/rpc_finish_ai_call", {
    method: "POST", body: { p_id: id, p_input_units: inputUnits, p_output_units: 0, p_latency_ms: Date.now() - started, p_ok: ok },
  });
}

function providerUrl(path: string) { return new URL(path, env.SARVAM_API_URL); }

voiceRouter.post("/api/voice/transcribe", uploadAudio, async (req, res) => {
  const file = req.file;
  if (!file || !file.size) return res.status(400).json({ error: "audio_file_required" });
  if (!/^audio\/(webm|ogg|opus|wav|mpeg|mp3|mp4|aac|flac)$/.test(file.mimetype.split(";")[0].toLowerCase())) return res.status(415).json({ error: "unsupported_audio_type" });
  if (!env.SARVAM_API_KEY) return res.status(503).json({ error: "speech_service_unavailable" });
  const hint = typeof req.body?.languageCode === "string" && /^[a-z]{2}-[A-Z]{2}$/.test(req.body.languageCode) ? req.body.languageCode : undefined;
  let usageId: string | null;
  try { usageId = await claimUsage("stt", env.SARVAM_STT_MODEL, req); }
  catch { return res.status(503).json({ error: "speech_service_unavailable" }); }
  if (!usageId) return res.status(429).json({ error: "daily_voice_limit_reached" });
  const started = Date.now();
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname.split(/[\\/]/).pop()?.slice(0, 100) || "voice.webm");
    form.set("model", env.SARVAM_STT_MODEL);
    form.set("mode", env.SARVAM_STT_MODE);
    if (hint) form.set("language_code", hint);
    const response = await fetch(providerUrl("/speech-to-text"), { method: "POST", headers: { "api-subscription-key": env.SARVAM_API_KEY }, body: form, signal: AbortSignal.timeout(45000) });
    if (!response.ok) {
      await finishUsage(usageId, 0, started, false);
      return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? "speech_service_rate_limited" : "transcription_failed" });
    }
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("transcript" in result) || typeof result.transcript !== "string") {
      await finishUsage(usageId, 0, started, false);
      return res.status(502).json({ error: "transcription_failed" });
    }
    const transcript = result.transcript.trim().slice(0, 20000);
    const language = "language_code" in result && typeof result.language_code === "string" ? result.language_code : null;
    await finishUsage(usageId, transcript.length, started, true);
    res.json({ text: transcript, language });
  } catch {
    await finishUsage(usageId, 0, started, false).catch(() => undefined);
    res.status(502).json({ error: "transcription_failed" });
  }
});

const speakSchema = z.object({ text: z.string().trim().min(1).max(300), language: z.enum(["en", "hi", "hinglish"]) });
const languageCode = { en: "en-IN", hi: "hi-IN", hinglish: "hi-IN" } as const;

voiceRouter.post("/api/voice/speak", async (req, res) => {
  const input = speakSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "invalid_request" });
  if (!env.TTS_ENABLED) return res.status(503).json({ error: "speech_output_disabled" });
  if (!env.SARVAM_API_KEY) return res.status(503).json({ error: "speech_service_unavailable" });
  let usageId: string | null;
  try { usageId = await claimUsage("tts", env.SARVAM_TTS_MODEL, req); }
  catch { return res.status(503).json({ error: "speech_service_unavailable" }); }
  if (!usageId) return res.status(429).json({ error: "daily_voice_limit_reached" });
  const started = Date.now();
  try {
    const response = await fetch(providerUrl("/text-to-speech"), {
      method: "POST",
      headers: { "api-subscription-key": env.SARVAM_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text: input.data.text, language_code: languageCode[input.data.language], model: env.SARVAM_TTS_MODEL, speaker: env.SARVAM_TTS_SPEAKER, output_audio_codec: "mp3" }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      await finishUsage(usageId, input.data.text.length, started, false);
      return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? "speech_service_rate_limited" : "speech_generation_failed" });
    }
    const result: unknown = await response.json();
    const audio = typeof result === "object" && result !== null && "audios" in result && Array.isArray(result.audios) ? result.audios[0] : undefined;
    if (typeof audio !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) {
      await finishUsage(usageId, input.data.text.length, started, false);
      return res.status(502).json({ error: "speech_generation_failed" });
    }
    const bytes = Buffer.from(audio, "base64");
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      await finishUsage(usageId, input.data.text.length, started, false);
      return res.status(502).json({ error: "speech_generation_failed" });
    }
    await finishUsage(usageId, input.data.text.length, started, true);
    res.set({ "content-type": "audio/mpeg", "content-length": String(bytes.length), "cache-control": "no-store", "content-disposition": "inline; filename=khataflow-reply.mp3" });
    res.send(bytes);
  } catch {
    await finishUsage(usageId, input.data.text.length, started, false).catch(() => undefined);
    res.status(502).json({ error: "speech_generation_failed" });
  }
});
