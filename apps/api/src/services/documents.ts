import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "regenerator-runtime/runtime.js";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { env } from "../config/env.js";
import { databaseRequest } from "./database.js";

type Row = Record<string, unknown>;
const fonts = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
const text = (value: unknown, max = 300) => typeof value === "string" ? value.slice(0, max) : "";
const paise = (value: unknown) => {
  try { const amount = BigInt(String(value)); return `₹${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`; }
  catch { return "₹0.00"; }
};

async function makePdf(title: string, number: string, date: string, businessName: string, client: Row, lines: Row[], total: unknown, paid: unknown, status: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, devanagari] = await Promise.all(["NotoSans.ttf", "NotoSansDevanagari.ttf"].map((name) => readFile(resolve(fonts, name))));
  const latin = await doc.embedFont(regular, { subset: true });
  const hindi = await doc.embedFont(devanagari, { subset: true });
  const pages: PDFPage[] = [];
  let page: PDFPage;
  let y = 792;
  const addPage = () => { page = doc.addPage([595, 842]); pages.push(page); y = 792; };
  const draw = (value: unknown, size = 11, bold = false) => {
    const line = text(value);
    if (y < 55) addPage();
    page.drawText(line, { x: 48, y, size, font: /[\u0900-\u097f]/.test(line) ? hindi : latin, color: rgb(0.12, 0.16, 0.22), maxWidth: 500 });
    y -= size + (bold ? 13 : 9);
  };
  addPage();
  draw(businessName || "KhataFlow", 20, true);
  draw(title, 16, true);
  draw(`No: ${number}     Date: ${date}`);
  draw(`Status: ${status}`);
  draw(`Client: ${text(client.name, 120)}`, 13);
  if (client.phone) draw(`Phone: ${text(client.phone, 40)}`);
  if (client.address) draw(`Address: ${text(client.address, 180)}`);
  y -= 8;
  if (lines.length) {
    draw("Item                         Qty / Unit               Rate                 Amount", 10, true);
    for (const item of lines.slice(0, 100)) {
      const qty = text(item.qty ?? item.quantity, 16);
      const unit = text(item.unit, 20);
      const rate = item.pricePaise ?? item.price_per_unit_paise;
      let amount = item.amountPaise;
      if (amount === undefined) {
        try { const [whole, fraction = ""] = qty.split("."); const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0")); amount = ((milli * BigInt(String(rate)) + 500n) / 1000n).toString(); }
        catch { amount = "0"; }
      }
      draw(`${text(item.name ?? item.item_name, 45)}     ${qty} ${unit}     ${paise(rate)}     ${paise(amount)}`, 10);
    }
  }
  y -= 8;
  draw(`Total: ${paise(total)}`, 13, true);
  draw(`Paid: ${paise(paid)}`);
  let balance = "0";
  try { balance = (BigInt(String(total)) - BigInt(String(paid))).toString(); } catch { /* zero balance fallback */ }
  draw(`Balance due: ${paise(balance)}`, 13, true);
  return Buffer.from(await doc.save());
}

async function uploadAndSign(bucket: "invoices" | "receipts", path: string, bytes?: Buffer) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Storage unavailable");
  const base = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const headers = { apikey: env.SUPABASE_SECRET_KEY, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
  if (bytes) {
    const uploaded = await fetch(`${base}/object/${bucket}/${encodedPath}`, { method: "POST", headers: { ...headers, "content-type": "application/pdf", "x-upsert": "true" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(15000) });
    if (!uploaded.ok) throw new Error("Storage upload failed");
  }
  const response = await fetch(`${base}/object/sign/${bucket}/${encodedPath}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Storage signing failed");
  const data = await response.json() as { signedURL?: unknown };
  if (typeof data.signedURL !== "string") throw new Error("Storage signing failed");
  const signed = new URL(data.signedURL.startsWith("http") ? data.signedURL : `${base}${data.signedURL.startsWith("/") ? "" : "/"}${data.signedURL}`);
  if (signed.origin !== new URL(env.SUPABASE_URL).origin) throw new Error("Storage signing failed");
  return signed.href;
}

async function getDocument<T extends Row>(table: string, id: string, businessId: string, columns: string) {
  const params = new URLSearchParams({ select: columns, id: `eq.${id}`, business_id: `eq.${businessId}`, limit: "1" });
  const [row] = await databaseRequest<T[]>(`${table}?${params}`);
  return row;
}

async function getClient(businessId: string, clientId: string) {
  const params = new URLSearchParams({ select: "name,phone,address", id: `eq.${clientId}`, business_id: `eq.${businessId}`, limit: "1" });
  const [row] = await databaseRequest<Row[]>(`clients?${params}`);
  return row;
}

async function getBusinessName(businessId: string) {
  const [row] = await databaseRequest<Row[]>(`businesses?${new URLSearchParams({ select: "name", id: `eq.${businessId}`, limit: "1" })}`);
  return text(row?.name, 120);
}

async function getOrCreate(bucket: "invoices" | "receipts", businessId: string, id: string, document: Row, client: Row, businessName: string, title: string, number: string, date: string, lines: Row[], total: unknown, paid: unknown, status: string) {
  let path = text(document.pdf_path, 240);
  const expectedPath = `${businessId}/${id}.pdf`;
  if (path && path !== expectedPath) throw new Error("Invalid document path");
  let bytes: Buffer | undefined;
  if (!path) {
    path = expectedPath;
    bytes = await makePdf(title, number, date, businessName, client, lines, total, paid, status);
    const signed = await uploadAndSign(bucket, path, bytes);
    const params = new URLSearchParams({ id: `eq.${id}`, business_id: `eq.${businessId}` });
    await databaseRequest(`${bucket}?${params}`, { method: "PATCH", body: { pdf_path: path } });
    return signed;
  }
  return uploadAndSign(bucket, path);
}

export async function invoicePdf(businessId: string, id: string) {
  const invoice = await getDocument<Row>("invoices", id, businessId, "id,business_id,client_id,number,items,total_paise,paid_paise,status,due_date,issued_at,created_at,pdf_path");
  if (!invoice) return null;
  const client = await getClient(businessId, text(invoice.client_id));
  if (!client) return null;
  const businessName = await getBusinessName(businessId);
  const date = text(invoice.issued_at || invoice.due_date || invoice.created_at || new Date().toISOString()).slice(0, 10);
  return getOrCreate("invoices", businessId, id, invoice, client, businessName, "INVOICE", text(invoice.number), date, Array.isArray(invoice.items) ? invoice.items as Row[] : [], invoice.total_paise, invoice.paid_paise, text(invoice.status));
}

export async function receiptPdf(businessId: string, id: string) {
  const receipt = await getDocument<Row>("receipts", id, businessId, "id,business_id,payment_id,number,pdf_path,issued_at");
  if (!receipt) return null;
  const payment = await getDocument<Row>("payments", text(receipt.payment_id), businessId, "id,business_id,client_id,invoice_id,amount_paise,method,paid_at");
  if (!payment) return null;
  const client = await getClient(businessId, text(payment.client_id));
  if (!client) return null;
  const businessName = await getBusinessName(businessId);
  const date = text(receipt.issued_at || payment.paid_at || new Date().toISOString()).slice(0, 10);
  return getOrCreate("receipts", businessId, id, receipt, client, businessName, "PAYMENT RECEIPT", text(receipt.number), date, [], payment.amount_paise, payment.amount_paise, `${text(payment.method)} payment`);
}
