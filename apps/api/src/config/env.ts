import "dotenv/config";
import { z } from "zod";

export const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8001),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:8001"),
  CORS_ORIGINS: z.string().default("http://localhost:5173").transform((value) => value.split(",").map((origin) => origin.trim())),
}).parse(process.env);
