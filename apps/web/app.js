const api = window.KHATAFLOW_API_URL || location.origin;
const token = decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) || "");
const app = document.querySelector("#app");
const offline = document.querySelector("#offline");
const idempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let data;
let language = "en";
let pendingInstall;
let currentPayment;
const copy = {
  en: { title: "Your khata with", balance: "Balance due · Baaki", trust: "A simple account, kept with care.", item: "Invoice / विवरण", paid: "Paid", due: "Due", pay: "Pay amount", placeholder: "Enter amount", cash: "I paid cash", test: "TEST MODE · No real money moves", mock: "Mock UPI payment", success: "Simulate success", failure: "Simulate failure", pending: "Pending, then success in 3 seconds", dueLabel: "Amount due", noInvoices: "No open invoices. Your account is up to date.", retry: "Try again", ready: "Choose a payment result below. This is a test payment.", paidMessage: "Payment recorded. Your balance is updated.", failedMessage: "Payment failed. Your balance has not changed.", cashMessage: "Cash payment sent to the shopkeeper for approval.", loading: "Loading your khata…", offline: "You are offline. Payment actions need a connection." },
  hi: { title: "आपका खाता", balance: "बाकी राशि · Balance due", trust: "आपका हिसाब, पूरी देखभाल के साथ।", item: "बिल / विवरण", paid: "जमा", due: "बाकी", pay: "राशि जमा करें", placeholder: "राशि लिखें", cash: "मैंने नकद दिया", test: "परीक्षण · असली पैसे नहीं कटेंगे", mock: "डेमो UPI भुगतान", success: "सफलता दिखाएँ", failure: "असफलता दिखाएँ", pending: "3 सेकंड बाद सफल दिखाएँ", dueLabel: "बाकी राशि", noInvoices: "कोई खुला बिल नहीं। आपका हिसाब पूरा है।", retry: "फिर कोशिश करें", ready: "नीचे भुगतान का नतीजा चुनें। यह परीक्षण है।", paidMessage: "भुगतान दर्ज हुआ। बाकी राशि अपडेट हो गई।", failedMessage: "भुगतान नहीं हुआ। बाकी राशि नहीं बदली।", cashMessage: "नकद भुगतान दुकानदार की मंज़ूरी के लिए भेजा गया।", loading: "खाता खुल रहा है…", offline: "आप ऑफलाइन हैं। भुगतान के लिए इंटरनेट चाहिए।" },
};
const t = (key) => copy[language][key];
const formatINR = (paise) => {
  try { const amount = BigInt(String(paise)); const rupees = new Intl.NumberFormat(language === "hi" ? "en-IN" : "en-IN").format(amount / 100n); return `₹${rupees}${amount % 100n ? `.${String(amount % 100n).padStart(2, "0")}` : ""}`; }
  catch { return "₹0"; }
};
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const parsePaise = (value) => {
  const match = String(value).trim().match(/^(\d{1,14})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return (BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0") || "0")).toString();
};
async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { ...(options.body ? { "content-type": "application/json" } : {}), "x-portal-token": token, ...options.headers } });
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : {};
  if (!response.ok) throw new Error(body.error || "network_error");
  return body;
}
function setStatus(message, kind = "") {
  const node = document.querySelector("#status");
  if (node) { node.textContent = message; node.dataset.kind = kind; }
}
function render() {
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];
  const rows = invoices.length ? invoices.map((invoice) => {
    const due = BigInt(invoice.total_paise || "0") - BigInt(invoice.paid_paise || "0");
    return `<div class="invoice"><div><span class="invoice-title">${escapeHTML(invoice.number)}</span><span class="invoice-meta">${escapeHTML(invoice.due_date || invoice.issued_at?.slice(0, 10) || "")}</span></div><span class="invoice-amount">${formatINR(due.toString())}</span><span class="invoice-status">${escapeHTML(invoice.status)}</span></div>`;
  }).join("") : `<p class="settle-note">${t("noInvoices")}</p>`;
  const balance = String(data.balancePaise ?? "0");
  app.innerHTML = `<section class="content">
    <div class="eyebrow">${escapeHTML(data.businessName)} · Khata</div>
    <h1>${t("title")} ${escapeHTML(data.businessName)}</h1>
    <p class="intro">${t("trust")}</p>
    <div class="account-head"><div><div class="due-label">${t("balance")}</div><p class="due-amount">${formatINR(balance)}</p></div><span class="stamp">${BigInt(balance || "0") === 0n ? t("paid") : "OPEN"}</span></div>
    <section class="ledger" aria-label="Invoices"><div class="ledger-head"><span>${t("item")}</span><span>${t("due")}</span><span>Status</span></div>${rows}</section>
    ${BigInt(balance || "0") > 0n ? `<section class="settle"><div><div class="eyebrow">${t("dueLabel")}</div><h2>${t("pay")}</h2><p class="settle-note">${escapeHTML(data.clientName)}</p><label class="amount-label" for="amount">${t("placeholder")} · ₹</label><div class="amount-wrap"><span>₹</span><input id="amount" type="text" inputmode="decimal" autocomplete="off" value="${escapeHTML((BigInt(balance) / 100n).toString())}" aria-describedby="status"></div><button class="pay-button" id="start-pay" type="button">${t("pay")} · ${formatINR(balance)}</button><button class="cash-button" id="cash" type="button">${t("cash")}</button><p class="test-note">${t("test")}</p><p id="status" class="status-message" role="status"></p></div><div id="mock-area"></div></section>` : `<p class="status-message" role="status">${t("noInvoices")}</p>`}
  </section>`;
  document.querySelector("#start-pay")?.addEventListener("click", beginPayment);
  document.querySelector("#cash")?.addEventListener("click", confirmCash);
}
async function load() {
  if (!token || token === "pay") throw new Error("invalid_or_expired_link");
  data = await request(`/api/portal/${encodeURIComponent(token)}`);
  render();
  const paymentId = new URLSearchParams(location.search).get("paymentId");
  if (paymentId) {
    currentPayment = paymentId;
    const payment = await request(`/api/payments/${encodeURIComponent(paymentId)}`);
    if (payment.status === "SUCCEEDED") setStatus(t("paidMessage"), "success");
    else if (payment.status === "FAILED") setStatus(t("failedMessage"), "error");
  }
}
async function beginPayment() {
  const button = document.querySelector("#start-pay");
  const amountPaise = parsePaise(document.querySelector("#amount")?.value || "");
  if (!amountPaise || BigInt(amountPaise) > BigInt(data.balancePaise)) return setStatus("Enter an amount up to the balance due.", "error");
  button.disabled = true;
  try {
    const payment = await request("/api/payments/intents", { method: "POST", body: JSON.stringify({ amountPaise, idempotencyKey: idempotencyKey() }) });
    currentPayment = payment.paymentId;
    history.replaceState(null, "", `/pay/${encodeURIComponent(token)}?paymentId=${encodeURIComponent(currentPayment)}`);
    setStatus(t("ready"));
    document.querySelector("#mock-area").innerHTML = `<div class="mock-box"><div class="mock-title"><span>${t("mock")}</span><span class="test-stamp">TEST</span></div><div class="mock-actions"><button type="button" data-outcome="success">${t("success")}</button><button class="failure" type="button" data-outcome="failure">${t("failure")}</button><button class="pending" type="button" id="pending">${t("pending")}</button></div></div>`;
    document.querySelectorAll("[data-outcome]").forEach((control) => control.addEventListener("click", () => completePayment(control.dataset.outcome)));
    document.querySelector("#pending").addEventListener("click", (event) => { event.currentTarget.disabled = true; setStatus("Payment pending…"); setTimeout(() => completePayment("success"), 3000); });
  } catch (error) { setStatus(error.message === "payment_provider_unavailable" ? "Payments are not available right now." : "Could not start payment. Please try again.", "error"); }
  finally { button.disabled = false; }
}
async function completePayment(outcome) {
  try {
    const payment = await request(`/api/payments/mock/${encodeURIComponent(currentPayment)}/complete`, { method: "POST", body: JSON.stringify({ outcome }) });
    setStatus(payment.status === "SUCCEEDED" ? t("paidMessage") : t("failedMessage"), payment.status === "SUCCEEDED" ? "success" : "error");
    if (payment.status === "SUCCEEDED") { data = await request(`/api/portal/${encodeURIComponent(token)}`); render(); setStatus(t("paidMessage"), "success"); }
  } catch { setStatus("Could not confirm payment. Refresh to check the latest status.", "error"); }
}
async function confirmCash() {
  const amountPaise = parsePaise(document.querySelector("#amount")?.value || "");
  if (!amountPaise || BigInt(amountPaise) > BigInt(data.balancePaise)) return setStatus("Enter an amount up to the balance due.", "error");
  const button = document.querySelector("#cash");
  button.disabled = true;
  try { await request(`/api/portal/${encodeURIComponent(token)}/confirm-cash`, { method: "POST", body: JSON.stringify({ amountPaise, idempotencyKey: idempotencyKey() }) }); setStatus(t("cashMessage"), "success"); }
  catch { setStatus("Could not send the cash confirmation. Please try again.", "error"); }
  finally { button.disabled = false; }
}
function showError() {
  app.innerHTML = `<section class="error-page"><div class="eyebrow">KhataFlow</div><h1>We couldn't open this khata.</h1><p class="intro">The link may have expired. Ask the shopkeeper to share a fresh one.</p><button class="retry" id="retry">${t("retry")}</button></section>`;
  document.querySelector("#retry").addEventListener("click", () => { app.innerHTML = `<div class="loading"><span></span><span></span><span></span></div>`; load().catch(showError); });
}
document.querySelector("#language").addEventListener("click", (event) => { language = language === "en" ? "hi" : "en"; document.documentElement.lang = language; event.currentTarget.textContent = language === "en" ? "हिन्दी" : "English"; if (data) render(); });
window.addEventListener("online", () => { offline.hidden = true; });
window.addEventListener("offline", () => { offline.textContent = t("offline"); offline.hidden = false; });
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); pendingInstall = event; document.querySelector("#install").hidden = false; });
document.querySelector("#install").addEventListener("click", async () => { if (pendingInstall) { await pendingInstall.prompt(); pendingInstall = undefined; } });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
load().catch(showError);
