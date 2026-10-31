import JSONbig from "json-bigint";
import { env } from "../config/env.js";

const parse = JSONbig({ storeAsString: true });
export function parseDatabaseJson(text: string): unknown {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      /(?:_paise|Paise)$/.test(key) && (typeof entry === "number" || typeof entry === "string") ? String(entry) : normalize(entry),
    ]));
  };
  return normalize(parse.parse(text));
}

export class DatabaseError extends Error {
  constructor(readonly status: number) { super("Database request failed"); }
}

export async function databaseRequest<T>(path: string, options: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new DatabaseError(503);
  const response = await fetch(new URL(`/rest/v1/${path}`, env.SUPABASE_URL), {
    method: options.method ?? "GET",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.prefer ? { prefer: options.prefer } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) throw new DatabaseError(response.status);
  const text = await response.text();
  return (text ? parseDatabaseJson(text) : undefined) as T;
}

export function sendDatabaseError(error: unknown, res: import("express").Response) {
  if (!(error instanceof DatabaseError)) return res.status(503).json({ error: "database_unavailable" });
  if (error.status === 404) return res.status(404).json({ error: "not_found" });
  if (error.status === 409) return res.status(409).json({ error: "conflict" });
  if (error.status === 400 || error.status === 422) return res.status(400).json({ error: "invalid_or_conflicting_data" });
  return res.status(503).json({ error: "database_unavailable" });
}
