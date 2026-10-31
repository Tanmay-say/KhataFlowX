import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const output = resolve(root, "dist");
const apiUrl = process.env.KHATAFLOW_API_URL || process.env.API_URL;
if (!apiUrl) throw new Error("Set KHATAFLOW_API_URL before building the frontend.");
const apiOrigin = new URL(apiUrl).origin;
if (process.env.VERCEL && !apiOrigin.startsWith("https://")) throw new Error("Vercel frontend builds require an HTTPS API URL.");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["styles.css", "app.js", "shopkeeper.js", "manifest.webmanifest", "sw.js"]) {
  await cp(resolve(root, file), resolve(output, file));
}
await cp(resolve(root, "assets"), resolve(output, "assets"), { recursive: true });
const html = (await readFile(resolve(root, "index.html"), "utf8")).replace('"__API_URL__"', JSON.stringify(apiOrigin));
await writeFile(resolve(output, "index.html"), html);
