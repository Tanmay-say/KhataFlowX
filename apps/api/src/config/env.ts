import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

export const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8001),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:8001"),
  CORS_ORIGINS: z.string().default("http://localhost:5173").transform((value) => value.split(",").map((origin) => origin.trim())),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  MODEL_API_KEY: z.string().optional(),
  MUSE_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MUSE_MODEL: z.string().default("muse-spark-1.3"),
  MUSE_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("minimal"),
  MUSE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  MUSE_FALLBACK_MODEL: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_API_URL: z.string().url().default("https://api.sarvam.ai"),
  SARVAM_STT_MODEL: z.string().default("saaras:v3"),
  SARVAM_STT_MODE: z.enum(["transcribe", "translate", "verbatim", "translit", "codemix"]).default("transcribe"),
  SARVAM_TTS_MODEL: z.string().default("bulbul:v3"),
  SARVAM_TTS_SPEAKER: z.string().default("shubh"),
  VOICE_MAX_SECONDS: z.coerce.number().int().min(1).max(30).default(30),
  TTS_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  PAYMENT_PROVIDER: z.enum(["mock", "paytm"]).default("mock"),
  ALLOW_MOCK: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PORTAL_SIGNING_SECRET: z.string().optional().transform((value) => value?.trim() || undefined).refine((value) => !value || value.length >= 16),
  PORTAL_LINK_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
}).parse(process.env);
