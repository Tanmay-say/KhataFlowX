import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.env.WEB_PORT || 5173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const file = pathname.startsWith("/assets/") || ["/styles.css", "/app.js", "/manifest.webmanifest", "/sw.js"].includes(pathname)
      ? resolve(root, `.${pathname}`)
      : resolve(root, "index.html");
    if (!file.startsWith(resolve(root) + sep)) throw new Error("invalid_path");
    await stat(file);
    let content = await readFile(file);
    if (file.endsWith("index.html")) {
      const apiUrl = JSON.stringify(process.env.API_URL || "http://localhost:8001");
      content = Buffer.from(content.toString("utf8").replace('"__API_URL__"', apiUrl));
    }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("Not found");
  }
}).listen(port, "0.0.0.0", () => process.stdout.write(`KhataFlow web available on port ${port}\n`));
