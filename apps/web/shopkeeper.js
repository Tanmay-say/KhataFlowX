const app = document.querySelector("#app");
const apiBase = window.KHATAFLOW_API_URL || location.origin;
let accessToken = sessionStorage.getItem("khataflow-access-token");
let businessId = sessionStorage.getItem("khataflow-business-id");
let businessName = sessionStorage.getItem("khataflow-business-name") || "KhataFlow";
let businessChoices = [];
let language = ["en", "hi", "hinglish"].includes(localStorage.getItem("khataflow-language")) ? localStorage.getItem("khataflow-language") : "en";
const text = {
  en: { home: "Bolo, likho", clients: "Clients", ledger: "Ledger", stock: "Inventory", invoices: "Invoices", settings: "Settings", dues: "Total udhaar", welcome: "Your khata, ready when you are.", say: "Say it or write it here…", mic: "Hold to talk", add: "Add", search: "Search clients", name: "Name", phone: "Phone", address: "Address", save: "Save", qty: "Quantity", unit: "Unit", price: "Price per unit (₹)", threshold: "Low stock at", adjust: "Adjust stock", createClient: "New client", createItem: "Add item", createInvoice: "New invoice", noRows: "Nothing here yet. Add your first entry.", due: "Due", status: "Status", date: "Date", type: "Particulars", amount: "Amount", client: "Client", recent: "Recent entries", summary: "Aaj ka hisaab", signout: "Sign out", language: "Language", business: "Shop name", send: "Send", confirm: "Confirm", edit: "Edit", cancel: "Cancel", email: "Email address", sendCode: "Send code", otp: "Email code", verify: "Verify code", onboarding: "Set up your shop", createShop: "Create shop", accepted: "Saved", retry: "Try again", record: "Credit sale", pay: "Record payment", share: "Copy customer link", sale: "Sale", payment: "Payment", download: "PDF", paid: "Paid", paidNow: "Paid now (₹)", item: "Item name", amountRupees: "Amount (₹)", night: "Night book", telegram: "Connect Telegram", clientBot: "Connect customer bot", transcript: "Review the transcript, then send it.", emptyChat: "Ask about a balance, stock, or record a sale.", editDue: "Due date" },
  hi: { home: "बोलो, लिखो", clients: "ग्राहक", ledger: "खाता", stock: "सामान", invoices: "बिल", settings: "सेटिंग", dues: "कुल उधार", welcome: "आपका खाता, जब चाहें तैयार।", say: "यहाँ बोलें या लिखें…", mic: "बोलने के लिए दबाएँ", add: "जोड़ें", search: "ग्राहक खोजें", name: "नाम", phone: "फ़ोन", address: "पता", save: "सहेजें", qty: "मात्रा", unit: "इकाई", price: "भाव (₹)", threshold: "कम स्टॉक सीमा", adjust: "स्टॉक बदलें", createClient: "नया ग्राहक", createItem: "सामान जोड़ें", createInvoice: "नया बिल", noRows: "अभी कुछ नहीं। पहली एंट्री जोड़ें।", due: "बाकी", status: "स्थिति", date: "तारीख़", type: "विवरण", amount: "राशि", client: "ग्राहक", recent: "नई एंट्री", summary: "आज का हिसाब", signout: "साइन आउट", language: "भाषा", business: "दुकान का नाम", send: "भेजें", confirm: "पक्का करें", edit: "बदलें", cancel: "रद्द करें", email: "ईमेल पता", sendCode: "कोड भेजें", otp: "ईमेल कोड", verify: "कोड जाँचें", onboarding: "दुकान सेट करें", createShop: "दुकान बनाएँ", accepted: "सहेज लिया", retry: "फिर कोशिश करें", record: "उधार बिक्री", pay: "भुगतान दर्ज करें", share: "ग्राहक का लिंक कॉपी करें", sale: "बिक्री", payment: "भुगतान", download: "PDF", paid: "जमा", paidNow: "अभी जमा (₹)", item: "सामान का नाम", amountRupees: "राशि (₹)", night: "रात वाला खाता", telegram: "Telegram जोड़ें", clientBot: "ग्राहक bot जोड़ें", transcript: "भेजने से पहले आवाज़ का लिखा हुआ देखें।", emptyChat: "बाकी, स्टॉक पूछें या बिक्री लिखें।", editDue: "आख़िरी तारीख़" },
  hinglish: { home: "Bolo, likho", clients: "Customers", ledger: "Khata", stock: "Maal", invoices: "Bills", settings: "Settings", dues: "Total udhaar", welcome: "Aapka khata, jab chahein ready.", say: "Yahan bolein ya likhein…", mic: "Bolne ke liye hold karein", add: "Jodein", search: "Customer search karein", name: "Naam", phone: "Phone", address: "Address", save: "Save karein", qty: "Quantity", unit: "Unit", price: "Rate (₹)", threshold: "Low stock limit", adjust: "Stock badlein", createClient: "Naya customer", createItem: "Maal add karein", createInvoice: "Naya bill", noRows: "Abhi yahan kuch nahi. Pehli entry jodein.", due: "Baaki", status: "Status", date: "Date", type: "Details", amount: "Amount", client: "Customer", recent: "Recent entries", summary: "Aaj ka hisaab", signout: "Sign out", language: "Language", business: "Shop ka naam", send: "Bhej dein", confirm: "Confirm karein", edit: "Edit karein", cancel: "Cancel karein", email: "Email address", sendCode: "Code bhejein", otp: "Email code", verify: "Code verify karein", onboarding: "Shop set karein", createShop: "Shop banayein", accepted: "Save ho gaya", retry: "Dobara try karein", record: "Udhaar sale", pay: "Payment record karein", share: "Customer link copy karein", sale: "Sale", payment: "Payment", download: "PDF", paid: "Jama", paidNow: "Abhi jama (₹)", item: "Maal ka naam", amountRupees: "Amount (₹)", night: "Night book", telegram: "Telegram connect karein", clientBot: "Customer bot connect karein", transcript: "Bhejne se pehle transcript check karein.", emptyChat: "Balance ya stock poochhein, ya sale likhein.", editDue: "Due date" },
};
const t = (key) => text[language]?.[key] || text.en[key] || key;
Object.assign(text.en, { invite: "Invite customer account", acceptInvite: "Accept invitation", install: "Install app", myShops: "My connected shops", noShops: "No shops are connected yet. Open an invite link from a shopkeeper to connect." });
Object.assign(text.hi, { invite: "ग्राहक को आमंत्रित करें", acceptInvite: "निमंत्रण स्वीकार करें", install: "ऐप इंस्टॉल करें", myShops: "मेरी जुड़ी दुकानें", noShops: "अभी कोई दुकान नहीं जुड़ी है। जुड़ने के लिए दुकान से मिला आमंत्रण लिंक खोलें।" });
Object.assign(text.hinglish, { invite: "Customer account invite karein", acceptInvite: "Invite accept karein", install: "App install karein", myShops: "Meri connected shops", noShops: "Abhi koi shop connected nahi hai. Connect karne ke liye shopkeeper ka invite link open karein." });
const html = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = (paise) => { try { const value = BigInt(String(paise)); return `₹${new Intl.NumberFormat("en-IN").format(value / 100n)}${value % 100n ? `.${String(value % 100n).padStart(2, "0")}` : ""}`; } catch { return "₹0"; } };
const asPaise = (rupees) => { const found = String(rupees).trim().match(/^(\d{1,14})(?:\.(\d{1,2}))?$/); return found ? (BigInt(found[1]) * 100n + BigInt((found[2] || "").padEnd(2, "0") || "0")).toString() : null; };
const key = () => crypto.randomUUID();
const setLanguage = () => { const control = document.querySelector("#language"); if (control) control.value = language; };
document.querySelector("#language").addEventListener("change", (event) => { language = event.currentTarget.value; localStorage.setItem("khataflow-language", language); renderRoute().catch(showError); });

async function call(path, options = {}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(businessId && !path.startsWith("/api/businesses") ? { "x-business-id": businessId } : {}), ...options.headers };
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (response.status === 401 && accessToken) { sessionStorage.removeItem("khataflow-access-token"); location.href = "/login"; throw new Error("Session expired"); }
  if (response.status === 204) return null;
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  if (!response.ok) throw new Error(body?.message || body?.error || `Request failed (${response.status})`);
  return body;
}
function shell(page, content) {
  const nav = [["/", t("home")], ["/clients", t("clients")], ["/ledger", t("ledger")], ["/inventory", t("stock")], ["/invoices", t("invoices")], ["/settings", t("settings")]];
  app.innerHTML = `<div class="workbook"><header class="workbook-head"><a class="brand" href="/"><span class="brand-mark">K</span><span>KhataFlow</span></a>${businessChoices.length > 1 ? `<select class="business-switch" id="business-switch" aria-label="Switch shop">${businessChoices.map((entry) => `<option value="${entry.business.id}" ${entry.business.id === businessId ? "selected" : ""}>${html(entry.business.name)}</option>`).join("")}</select>` : `<div class="shop-name">${html(businessName)}</div>`}<button class="text-button" id="signout">${t("signout")}</button></header><nav class="workbook-nav" aria-label="Main navigation">${nav.map(([href, label]) => `<a href="${href}" class="${location.pathname === href || (href === "/clients" && location.pathname.startsWith("/clients/")) ? "active" : ""}">${html(label)}</a>`).join("")}</nav><main class="workspace" id="workspace"><div class="eyebrow">${html(businessName)} · ${html(page)}</div><div id="screen-content">${content}</div></main><footer class="workbook-foot"><span>KhataFlow · Digital khata</span><span>Amounts are stored in paise</span></footer></div>`;
  document.querySelector("#signout").addEventListener("click", () => { for (const item of ["khataflow-access-token", "khataflow-business-id", "khataflow-business-name"]) sessionStorage.removeItem(item); accessToken = null; businessId = null; location.href = "/login"; });
  document.querySelector("#business-switch")?.addEventListener("change", (event) => { const selected = businessChoices.find((entry) => entry.business.id === event.target.value); if (!selected) return; businessId = selected.business.id; businessName = selected.business.name; sessionStorage.setItem("khataflow-business-id", businessId); sessionStorage.setItem("khataflow-business-name", businessName); location.href = "/"; });
}
function pageError(message, retry) { app.innerHTML = `<section class="error-page"><div class="eyebrow">KhataFlow</div><h1>${html(message)}</h1><button class="retry" id="retry">${t("retry")}</button></section>`; document.querySelector("#retry").addEventListener("click", retry); }
function field(label, name, type = "text", attrs = "", required = true) { return `<label class="field"><span>${html(label)}</span><input name="${name}" type="${type}" ${attrs} ${required ? "required" : ""}></label>`; }
function loginPage() {
  const email = sessionStorage.getItem("khataflow-otp-email") || "";
  app.innerHTML = `<section class="login-sheet"><div class="eyebrow">KhataFlow · Shopkeeper</div><h1>${t("welcome")}</h1><p class="intro">Your shop book, ready when you are.</p><form id="otp-form">${field(t("email"), "email", "email", `value="${html(email)}" autocomplete="email"`)}<button>${t("sendCode")}</button></form><form id="verify-form" hidden>${field(t("otp"), "code", "text", 'inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="12"')}<button>${t("verify")}</button></form><p id="auth-status" role="status"></p></section>`;
  document.querySelector("#otp-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
    const emailValue = new FormData(event.currentTarget).get("email");
    try { await call("/api/auth/otp", { method: "POST", body: JSON.stringify({ email: emailValue }) }); sessionStorage.setItem("khataflow-otp-email", emailValue); document.querySelector("#verify-form").hidden = false; document.querySelector("#auth-status").textContent = "Check your email for a sign-in code."; }
    catch { document.querySelector("#auth-status").textContent = "Could not send the code. Check the email and try again."; }
    finally { button.disabled = false; }
  });
  document.querySelector("#verify-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
    try {
      const token = new FormData(event.currentTarget).get("code");
      const session = await call("/api/auth/verify", { method: "POST", body: JSON.stringify({ email: sessionStorage.getItem("khataflow-otp-email"), token }) });
      if (!session.access_token) throw new Error("No session returned");
      sessionStorage.setItem("khataflow-access-token", session.access_token); sessionStorage.removeItem("khataflow-otp-email"); accessToken = session.access_token;
      if (location.pathname.startsWith("/invite/")) return clientInvitePage();
      await loadBusinesses();
    } catch { document.querySelector("#auth-status").textContent = "That code could not be verified. Request a fresh one."; }
    finally { button.disabled = false; }
  });
}
async function loadBusinesses() {
  const list = await call("/api/businesses");
  if (!list.length) return onboardingPage();
  businessChoices = list;
  const chosen = list.find((entry) => entry.business?.id === businessId) || list[0];
  businessId = chosen.business.id; businessName = chosen.business.name;
  sessionStorage.setItem("khataflow-business-id", businessId); sessionStorage.setItem("khataflow-business-name", businessName);
  location.href = "/";
}
function onboardingPage() {
  app.innerHTML = `<section class="login-sheet"><div class="eyebrow">KhataFlow · ${t("onboarding")}</div><h1>${t("onboarding")}</h1><form id="business-form">${field(t("business"), "name")}<label class="field"><span>${t("language")}</span><select name="language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option></select></label><button>${t("createShop")}</button></form><p id="onboard-status" role="status"></p></section>`;
  document.querySelector("#business-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
    try { const business = await call("/api/businesses", { method: "POST", body: JSON.stringify(body) }); businessId = business.businessId; businessName = business.name; sessionStorage.setItem("khataflow-business-id", businessId); sessionStorage.setItem("khataflow-business-name", businessName); localStorage.setItem("khataflow-language", body.language); location.href = "/"; }
    catch { document.querySelector("#onboard-status").textContent = "Could not create the shop. Please try again."; }
  });
}
function clientInvitePage() {
  const token = decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1) || "");
  const content = {
    en: ["Connect to your shop", "Create your customer profile, then accept the shopkeeper’s invite. You can connect other shops to this account later."],
    hi: ["अपनी दुकान से जुड़ें", "अपनी ग्राहक प्रोफ़ाइल बनाएँ और दुकान का निमंत्रण स्वीकार करें। बाद में इसी खाते से दूसरी दुकानों से भी जुड़ सकते हैं।"],
    hinglish: ["Apni shop se connect karein", "Customer profile banayein aur shopkeeper ka invite accept karein. Baad mein isi account se aur shops bhi connect kar sakte hain."],
  }[language];
  app.innerHTML = `<section class="login-sheet"><div class="eyebrow">KhataFlow · Customer account</div><h1>${content[0]}</h1><p class="intro">${content[1]}</p><form id="client-profile-form">${field(t("name"), "name", "text", 'autocomplete="name"')}${field(t("phone"), "phone", "tel", 'autocomplete="tel"', false)}${field(t("address"), "address", "text", 'autocomplete="street-address"', false)}<button>${t("acceptInvite")}</button></form><p id="client-invite-status" role="status"></p></section>`;
  document.querySelector("#client-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
    const profile = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await call("/api/client/profile", { method: "POST", body: JSON.stringify(profile) });
      await call("/api/client-invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
      location.href = "/my-shops";
    } catch { document.querySelector("#client-invite-status").textContent = "This invite may have expired or already been used. Ask the shopkeeper for a new link."; }
    finally { button.disabled = false; }
  });
}
async function clientShopsPage() {
  const links = await call("/api/client/shops");
  const rows = links.map(({ business, client }) => `<article class="client-shop-row"><div><h2>${html(business.name)}</h2><p>${html(client.name)}</p><strong>${t("due")}: ${money(client.balance_paise)}</strong></div><button class="outline" data-business="${html(business.id)}">Open khata</button></article>`).join("");
  app.innerHTML = `<div class="workbook"><header class="workbook-head"><a class="brand" href="/my-shops"><span class="brand-mark">K</span><span>KhataFlow</span></a><button id="client-signout" class="outline">${t("signout")}</button></header><main class="workspace"><div class="eyebrow">KhataFlow · Customer</div><h1>${t("myShops")}</h1><section class="ruled-section">${rows || `<p class="empty-note">${t("noShops")}</p>`}</section><p id="client-shops-status" role="status"></p></main><footer class="workbook-foot">KhataFlow · Customer account</footer></div>`;
  document.querySelector("#client-signout").addEventListener("click", () => { for (const keyName of ["khataflow-access-token", "khataflow-business-id", "khataflow-business-name"]) sessionStorage.removeItem(keyName); location.href = "/login"; });
  document.querySelectorAll("[data-business]").forEach((button) => button.addEventListener("click", async () => {
    try { const result = await call(`/api/client/shops/${encodeURIComponent(button.dataset.business)}/portal-link`, { method: "POST", body: "{}" }); location.href = result.url; }
    catch { document.querySelector("#client-shops-status").textContent = "Could not open this shop's khata."; }
  }));
}
function rowsTable(headers, rows) {
  if (!rows.length) return `<p class="empty-note">${t("noRows")}</p>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((value) => `<th>${html(value)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
async function homePage() {
  const [summary, clients, activity, history] = await Promise.all([call("/api/ledger/summary"), call("/api/clients?limit=6"), call("/api/ledger/activity"), call("/api/chat/history")]);
  const totalDue = money(summary.totalReceivablePaise);
  shell(t("home"), `<section class="hero-ledger"><div><div class="eyebrow">${t("dues")}</div><div class="hero-number">${totalDue}</div><p class="muted">${summary.clientsWithBalance || 0} customers · ${t("welcome")}</p></div><a class="ink-link" href="/ledger">Open ledger →</a></section><div class="home-grid"><section class="ruled-section"><div class="section-heading"><h2>${t("recent")}</h2><a href="/ledger">All entries</a></div><div class="ledger-rows">${activity.slice(0, 8).map((row) => `<div class="ledger-row"><span>${new Date(row.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span>${html(row.note || row.type)}</span><span>${money(row.amount_paise)}</span><span class="stamp-small">${html(row.type)}</span></div>`).join("") || `<p class="empty-note">${t("noRows")}</p>`}</div><a class="ink-link" href="/clients">+ ${t("createClient")}</a></section><section class="ruled-section"><div class="section-heading"><h2>${t("clients")}</h2><a href="/clients">View all</a></div><div class="client-ledger-list">${clients.map((client) => `<a href="/clients/${client.id}" class="client-line"><span>${html(client.name)}</span><span class="amount-ink">${money(client.balance_paise)}</span></a>`).join("") || `<p>${t("noRows")}</p>`}</div></section></div><section class="chat-book"><div class="section-heading"><div><div class="eyebrow">${t("home")}</div><h2>${t("summary")}</h2></div><button class="talk-button" id="talk" type="button">● ${t("mic")}</button></div><div id="chat-log" class="chat-log">${history.map((entry) => `<div class="chat-line ${entry.role === "user" ? "from-user" : "from-munshi"}"><span>${entry.role === "user" ? "You" : "Munshi"}</span><p>${html(entry.content)}</p></div>`).join("") || `<p class="empty-note">${t("emptyChat")}</p>`}</div><div id="transcript-review"></div><form id="chat-form" class="chat-form"><textarea name="text" rows="2" maxlength="2000" placeholder="${t("say")}" required></textarea><button>${t("send")}</button></form><p class="status-message" id="chat-status" role="status"></p></section>`);
  document.querySelector("#chat-form").addEventListener("submit", async (event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("text"); await sendChat(value); });
  wireMic();
}
async function sendChat(value) {
  const status = document.querySelector("#chat-status"); const form = document.querySelector("#chat-form"); const button = form.querySelector("button"); button.disabled = true;
  try {
    const response = await call("/api/chat", { method: "POST", body: JSON.stringify({ text: value }) });
    document.querySelector("#chat-log").insertAdjacentHTML("beforeend", `<div class="chat-line from-user"><span>You</span><p>${html(value)}</p></div><div class="chat-line from-munshi"><span>Munshi</span><p>${html(response.message)}</p><button class="speak" type="button" aria-label="Read reply aloud">Read aloud</button></div>`);
    form.reset(); status.textContent = "";
    if (response.requiresConfirmation) {
      const actionId = response.pendingActionId;
      status.innerHTML = `<div class="action-preview"><strong>Review before saving</strong><p>${html(value)}</p><button data-confirm>${t("confirm")}</button><button class="outline" data-edit>${t("edit")}</button><button class="outline" data-cancel>${t("cancel")}</button></div>`;
      status.querySelector("[data-confirm]").addEventListener("click", async () => { const result = await call(`/api/chat/${actionId}/confirm`, { method: "POST", body: "{}" }); status.textContent = result.message; });
      status.querySelector("[data-cancel]").addEventListener("click", async () => { await call(`/api/chat/${actionId}/cancel`, { method: "POST", body: "{}" }); status.textContent = "Cancelled. Nothing was saved."; });
      status.querySelector("[data-edit]").addEventListener("click", async () => { await call(`/api/chat/${actionId}/cancel`, { method: "POST", body: "{}" }); form.elements.text.value = value; form.elements.text.focus(); status.textContent = "Edit your request, then send it again."; });
    }
    document.querySelector(".speak:last-child")?.addEventListener("click", async () => { try { const audio = await fetch(`${apiBase}/api/voice/speak`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "x-business-id": businessId, "content-type": "application/json" }, body: JSON.stringify({ text: response.message.slice(0, 300), language: language === "en" ? "en" : language === "hi" ? "hi" : "hinglish" }) }); if (!audio.ok) throw new Error("tts_failed"); new Audio(URL.createObjectURL(await audio.blob())).play(); } catch { status.textContent = "Spoken reply is unavailable."; } });
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
function wireMic() {
  const button = document.querySelector("#talk"); let recorder; let chunks = [];
  const stop = () => { if (recorder?.state === "recording") recorder.stop(); };
  button.addEventListener("pointerdown", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream); chunks = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 2 * 1024 * 1024) { document.querySelector("#chat-status").textContent = "Voice note is larger than 2 MB."; return; }
        const form = new FormData(); form.append("file", blob, "voice.webm");
        document.querySelector("#chat-status").textContent = "Transcribing…"; button.disabled = true;
        try {
          const response = await fetch(`${apiBase}/api/voice/transcribe`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "x-business-id": businessId }, body: form });
          const result = await response.json(); if (!response.ok) throw new Error(result.error);
          document.querySelector("#transcript-review").innerHTML = `<div class="action-preview"><label class="field">${t("transcript")}<textarea id="transcript" rows="2">${html(result.text)}</textarea></label><button id="use-transcript">${t("send")}</button></div>`;
          document.querySelector("#use-transcript").addEventListener("click", () => { document.querySelector("#chat-form").elements.text.value = document.querySelector("#transcript").value; document.querySelector("#chat-form").requestSubmit(); document.querySelector("#transcript-review").innerHTML = ""; });
          document.querySelector("#chat-status").textContent = "";
        } catch { document.querySelector("#chat-status").textContent = "Voice transcription failed. You can still type the request."; }
        finally { button.disabled = false; }
      };
      recorder.start(); button.classList.add("recording"); button.setPointerCapture?.(event.pointerId);
    } catch { document.querySelector("#chat-status").textContent = "Microphone permission is unavailable. Type your request instead."; }
  });
  button.addEventListener("pointerup", stop); button.addEventListener("pointercancel", stop); button.addEventListener("lostpointercapture", stop);
}
async function clientsPage() {
  const clients = await call("/api/clients?limit=100");
  shell(t("clients"), `<section class="ruled-section"><div class="section-heading"><h1>${t("clients")}</h1><button id="new-client">+ ${t("createClient")}</button></div><input class="search-input" id="client-search" placeholder="${t("search")}" aria-label="${t("search")}"><div id="client-list">${clientRows(clients)}</div><form id="client-form" class="inline-form" hidden>${field(t("name"), "name")}${field(t("phone"), "phone", "tel")}${field(t("address"), "address")}<label class="field"><span>${t("language")}</span><select name="preferredLanguage"><option value="en">English</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option></select></label><button>${t("save")}</button></form><p id="client-status" role="status"></p></section>`);
  document.querySelector("#new-client").addEventListener("click", () => { document.querySelector("#client-form").hidden = false; });
  document.querySelector("#client-search").addEventListener("input", async (event) => { const found = await call(`/api/clients?limit=100&search=${encodeURIComponent(event.target.value)}`); document.querySelector("#client-list").innerHTML = clientRows(found); });
  document.querySelector("#client-form").addEventListener("submit", async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await call("/api/clients", { method: "POST", body: JSON.stringify(body) }); await clientsPage(); } catch { document.querySelector("#client-status").textContent = "Could not save this client."; } });
}
function clientRows(clients) { return rowsTable([t("name"), t("due"), ""], clients.map((client) => `<tr><td><a href="/clients/${client.id}">${html(client.name)}</a></td><td class="amount-ink">${money(client.balance_paise)}</td><td>${html(client.preferred_language || "en")}</td></tr>`)); }
async function clientPage(id) {
  const [client, activity] = await Promise.all([call(`/api/clients/${encodeURIComponent(id)}`), call(`/api/ledger/activity?clientId=${encodeURIComponent(id)}`)]);
  shell(client.name, `<section class="hero-ledger"><div><div class="eyebrow">${t("due")}</div><div class="hero-number">${money(client.balance_paise)}</div><p>${html(client.phone || "")}</p></div><div><button id="share-link">${t("share")}</button><button class="outline" id="client-invite">${t("invite")}</button><button class="outline" id="client-telegram">${t("clientBot")}</button></div></section><div class="share-result" id="share-result"></div><section class="ruled-section"><h2>${t("ledger")}</h2>${rowsTable([t("date"), t("type"), t("amount")], activity.map((row) => `<tr><td>${new Date(row.created_at).toLocaleDateString("en-IN")}</td><td>${html(row.note || row.type)}</td><td class="amount-ink">${money(row.amount_paise)}</td></tr>`))}</section><form id="payment-form" class="inline-form"><h2>${t("pay")}</h2>${field(t("amountRupees"), "amount", "number", 'min="0.01" step="0.01"') }<label class="field"><span>Method</span><select name="method"><option value="CASH">Cash</option><option value="UPI_MOCK">Mock UPI</option><option value="OTHER">Other</option></select></label><button>${t("save")}</button><p id="payment-status" role="status"></p></form>`);
  document.querySelector("#share-link").addEventListener("click", async () => { try { const data = await call(`/api/clients/${id}/share-link`); showShareLink(data.url, "#share-result"); } catch { document.querySelector("#share-result").textContent = "Could not create the link."; } });
  document.querySelector("#client-invite").addEventListener("click", async () => { try { const data = await call(`/api/clients/${id}/invitations`, { method: "POST" }); showShareLink(data.url, "#share-result"); } catch { document.querySelector("#share-result").textContent = "Could not create a customer account invite."; } });
  document.querySelector("#client-telegram").addEventListener("click", async () => { const status = document.querySelector("#share-result"); try { const result = await call("/api/telegram/link", { method: "POST", body: JSON.stringify({ bot: "client", clientId: id }) }); status.innerHTML = `<a href="${html(result.url)}" target="_blank" rel="noreferrer">Open customer bot</a> · expires ${new Date(result.expiresAt).toLocaleString()}`; } catch { status.textContent = "Customer Telegram bot is not configured yet."; } });
  document.querySelector("#payment-form").addEventListener("submit", async (event) => { event.preventDefault(); const body = new FormData(event.currentTarget); const amountPaise = asPaise(body.get("amount")); if (!amountPaise) return; try { await call("/api/ledger/payments", { method: "POST", headers: { "idempotency-key": key() }, body: JSON.stringify({ clientId: id, amountPaise, method: body.get("method") }) }); await clientPage(id); } catch { document.querySelector("#payment-status").textContent = "Payment could not be recorded."; } });
}
function showShareLink(url, selector) {
  const status = document.querySelector(selector);
  status.innerHTML = `<label class="field"><span>Share this link</span><input readonly value="${html(url)}" aria-label="Customer invite link"></label><button class="outline" type="button" id="copy-customer-link">Copy link</button><p id="customer-link-message" role="status"></p>`;
  status.querySelector("#copy-customer-link").addEventListener("click", async () => {
    const input = status.querySelector("input");
    try { await navigator.clipboard.writeText(url); status.querySelector("#customer-link-message").textContent = "Copied. Send this link to your customer."; }
    catch { input.select(); status.querySelector("#customer-link-message").textContent = "Select and copy this link to send it to your customer."; }
  });
}
async function ledgerPage() {
  const [activity, clients] = await Promise.all([call("/api/ledger/activity"), call("/api/clients?limit=100")]);
  const byId = Object.fromEntries(clients.map((client) => [client.id, client.name]));
  shell(t("ledger"), `<section class="ruled-section"><div class="section-heading"><h1>${t("ledger")}</h1><span>${activity.length} entries</span></div>${rowsTable([t("date"), t("client"), t("type"), t("amount")], activity.map((row) => `<tr><td>${new Date(row.created_at).toLocaleDateString("en-IN")}</td><td><a href="/clients/${row.client_id}">${html(byId[row.client_id] || "")}</a></td><td>${html(row.note || row.type)}</td><td class="amount-ink">${money(row.amount_paise)}</td></tr>`))}</section>`);
}
async function inventoryPage() {
  const inventory = await call("/api/inventory");
  shell(t("stock"), `<section class="ruled-section"><div class="section-heading"><h1>${t("stock")}</h1><button id="new-item">+ ${t("createItem")}</button></div>${rowsTable([t("item"), t("qty"), t("price"), t("status")], inventory.map((item) => `<tr><td>${html(item.item_name)}</td><td>${html(item.quantity)} ${html(item.unit)}</td><td>${money(item.price_per_unit_paise)}</td><td>${Number(item.quantity) <= Number(item.low_stock_threshold) ? "LOW STOCK" : "IN STOCK"}</td></tr>`))}<form id="item-form" class="inline-form" hidden>${field(t("item"), "itemName")}${field(t("unit"), "unit")}${field(t("price"), "priceRupees", "number", 'min="0" step="0.01"')}${field(t("threshold"), "lowStockThreshold", "number", 'min="0" step="0.001"')}<button>${t("save")}</button></form><form id="adjust-form" class="inline-form"><h2>${t("adjust")}</h2>${field(t("item"), "itemName")}${field(t("qty"), "delta", "number", 'step="0.001"')}${field(t("unit"), "unit")}<button>${t("save")}</button><p id="stock-status" role="status"></p></form></section>`);
  document.querySelector("#new-item").addEventListener("click", () => { document.querySelector("#item-form").hidden = false; });
  document.querySelector("#item-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const price = asPaise(form.get("priceRupees")); try { await call("/api/inventory", { method: "POST", body: JSON.stringify({ itemName: form.get("itemName"), unit: form.get("unit"), pricePerUnitPaise: price || "0", lowStockThreshold: form.get("lowStockThreshold") || "0" }) }); await inventoryPage(); } catch { document.querySelector("#stock-status").textContent = "Could not add inventory item."; } });
  document.querySelector("#adjust-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await call("/api/inventory/adjust", { method: "POST", headers: { "idempotency-key": key() }, body: JSON.stringify({ itemName: form.get("itemName"), unit: form.get("unit"), delta: form.get("delta") }) }); await inventoryPage(); } catch { document.querySelector("#stock-status").textContent = "Stock update failed. Check item, unit, and quantity."; } });
}
async function invoicesPage() {
  const [invoices, clients, receipts] = await Promise.all([call("/api/invoices"), call("/api/clients?limit=100"), call("/api/receipts")]);
  const clientById = Object.fromEntries(clients.map((client) => [client.id, client.name]));
  shell(t("invoices"), `<section class="ruled-section"><div class="section-heading"><h1>${t("invoices")}</h1><button id="new-invoice">+ ${t("createInvoice")}</button></div>${rowsTable(["No.", t("client"), t("amount"), t("status"), ""], invoices.map((invoice) => `<tr><td>${html(invoice.number)}</td><td>${html(clientById[invoice.client_id] || "")}</td><td>${money(invoice.total_paise)}</td><td>${html(invoice.status)}</td><td><button class="outline" data-pdf="/api/invoices/${invoice.id}/pdf">${t("download")}</button></td></tr>`))}<form id="invoice-form" class="inline-form" hidden><h2>${t("createInvoice")}</h2><label class="field"><span>${t("client")}</span><select name="clientId" required>${clients.map((client) => `<option value="${client.id}">${html(client.name)}</option>`).join("")}</select></label>${field(t("item"), "itemName")}${field(t("qty"), "qty", "number", 'min="0.001" step="0.001"')}${field(t("unit"), "unit")}${field(t("price"), "priceRupees", "number", 'min="0" step="0.01"')}<label class="field"><span>${t("editDue")}</span><input name="dueDate" type="date"></label><button>${t("save")}</button><p id="invoice-status" role="status"></p></form></section><section class="ruled-section"><h2>Receipts</h2>${rowsTable(["Receipt", t("date"), t("status"), ""], receipts.map((receipt) => `<tr><td>${html(receipt.number)}</td><td>${new Date(receipt.issued_at).toLocaleDateString("en-IN")}</td><td>ISSUED</td><td><button class="outline" data-pdf="/api/receipts/${receipt.id}/pdf">${t("download")}</button></td></tr>`))}</section>`);
  document.querySelectorAll("[data-pdf]").forEach((button) => button.addEventListener("click", () => openPdf(button.dataset.pdf)));
  document.querySelector("#new-invoice").addEventListener("click", () => { document.querySelector("#invoice-form").hidden = false; });
  document.querySelector("#invoice-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const pricePaise = asPaise(form.get("priceRupees")); const dueDate = form.get("dueDate") || null; try { await call("/api/invoices", { method: "POST", headers: { "idempotency-key": key() }, body: JSON.stringify({ clientId: form.get("clientId"), dueDate, items: [{ name: form.get("itemName"), unit: form.get("unit"), qty: form.get("qty"), pricePaise: pricePaise || "0" }] }) }); await invoicesPage(); } catch { document.querySelector("#invoice-status").textContent = "Could not create the invoice."; } });
}
async function openPdf(path) {
  const tab = window.open("about:blank", "_blank");
  try {
    const response = await fetch(`${apiBase}${path}`, { headers: { authorization: `Bearer ${accessToken}`, "x-business-id": businessId } });
    if (!response.ok) throw new Error("pdf_unavailable");
    const url = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = url; else { const link = document.createElement("a"); link.href = url; link.download = "khataflow-document.pdf"; link.click(); }
  } catch { tab?.close(); pageError("PDF could not be opened.", () => renderRoute()); }
}
function settingsPage() {
  shell(t("settings"), `<section class="ruled-section"><h1>${t("settings")}</h1><p>${t("business")}: <strong>${html(businessName)}</strong></p><label class="field"><span>${t("language")}</span><select id="settings-language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option></select></label><button id="theme-toggle" class="outline">${t("night")}</button><section class="telegram-setup"><h2>${t("telegram")}</h2><p>Link either the shopkeeper bot or the customer bot. The link works for 15 minutes.</p><button id="telegram-link" class="outline">Create shopkeeper link</button><p id="telegram-status" role="status"></p></section><button id="logout-bottom" class="outline">${t("signout")}</button></section>`);
  const languageControl = document.querySelector("#settings-language"); languageControl.value = language; languageControl.addEventListener("change", () => { localStorage.setItem("khataflow-language", languageControl.value); language = languageControl.value; renderRoute(); });
  document.querySelector("#theme-toggle").addEventListener("click", () => { const night = document.documentElement.dataset.theme !== "dark"; document.documentElement.dataset.theme = night ? "dark" : "light"; localStorage.setItem("khataflow-theme", night ? "dark" : "light"); });
  document.documentElement.dataset.theme = localStorage.getItem("khataflow-theme") || "light";
  document.querySelector("#logout-bottom").addEventListener("click", () => { sessionStorage.clear(); location.href = "/login"; });
  document.querySelector("#telegram-link").addEventListener("click", async () => { const status = document.querySelector("#telegram-status"); try { const result = await call("/api/telegram/link", { method: "POST", body: JSON.stringify({ bot: "admin" }) }); status.innerHTML = `<a href="${html(result.url)}" target="_blank" rel="noreferrer">Open Telegram</a>`; } catch { status.textContent = "Telegram linking is not configured yet."; } });
}
function showError() { pageError("This page could not load.", () => renderRoute().catch(showError)); }
async function renderRoute() {
  setLanguage();
  const path = location.pathname;
  if (path.startsWith("/invite/")) return accessToken ? clientInvitePage() : loginPage();
  if (path === "/my-shops") return accessToken ? await clientShopsPage() : loginPage();
  if (!accessToken) return loginPage();
  if (!businessId) {
    try { return await loadBusinesses(); } catch { return loginPage(); }
  }
  try {
    if (path === "/login") return loginPage();
    if (path === "/onboarding") return onboardingPage();
    if (path === "/clients") return await clientsPage();
    if (path.startsWith("/clients/")) return await clientPage(path.split("/")[2]);
    if (path === "/ledger") return await ledgerPage();
    if (path === "/inventory") return await inventoryPage();
    if (path === "/invoices") return await invoicesPage();
    if (path === "/settings") return settingsPage();
    return await homePage();
  } catch { showError(); }
}

async function init() {
  if (location.pathname.startsWith("/invite/") || location.pathname === "/my-shops") return renderRoute();
  if (!accessToken) return renderRoute();
  try {
    businessChoices = await call("/api/businesses");
    if (!businessChoices.length) return onboardingPage();
    const selected = businessChoices.find((entry) => entry.business?.id === businessId) || businessChoices[0];
    businessId = selected.business.id; businessName = selected.business.name;
    sessionStorage.setItem("khataflow-business-id", businessId); sessionStorage.setItem("khataflow-business-name", businessName);
    return renderRoute();
  } catch { return loginPage(); }
}
init().catch(showError);
