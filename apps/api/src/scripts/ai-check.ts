import dotenv from "dotenv";
import { resolve } from "node:path";
import OpenAI from "openai";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
const { env } = await import("../config/env.js");
const key = process.env.MODEL_API_KEY;
if (!key) throw new Error("MODEL_API_KEY is not set");
const client = new OpenAI({ apiKey: key, baseURL: env.MUSE_BASE_URL, timeout: env.MUSE_TIMEOUT_MS, maxRetries: 0 });
const models = await client.models.list();
const enabled = models.data.some((model) => model.id === env.MUSE_MODEL);
process.stdout.write(`${JSON.stringify({ model: env.MUSE_MODEL, enabled })}\n`);
if (!enabled) process.exitCode = 1;
