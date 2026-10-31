# Prompt for the Claude Design session

> How to use: open a new Claude session (Design / artifacts enabled). Attach `KhataFlow_Pitch_Deck.pptx` (and screenshots of any apps you like). Paste everything below the line.

---

You are a senior product designer with a strong editorial and print sensibility, designing the web + mobile UI for **KhataFlow** — a voice-first, vernacular udhaar (credit) ledger for Indian kirana shopkeepers. I've attached our pitch deck; use it as the brand source.

## 1. Product in one paragraph
A shopkeeper talks or types in Hindi / English / Hinglish ("Ramesh ne 5 kilo aloo liya, 200 baaki hai"). KhataFlow records the sale, updates stock and the customer's balance, chases overdue dues with a payment link, and reconciles when the customer pays. Channels: this web app, Telegram bots, and a signed customer portal link. Users are kirana owners (often 35–60, phone-first, mixed English literacy, Devanagari comfortable) and their customers. They know **paper khata notebooks** intimately. They have never loved "software."

## 2. The deck's visual language (extract it, don't dilute it)
- Ruled **notebook-paper cream** backgrounds (≈ #F2ECDE) with faint blue ruling.
- **Deep navy ink** (≈ #0C2459 / #111F50 / #0D1F4D), secondary slate-blue (≈ #324780 / #3C507F), greys #545454 / #B2B2B2.
- Type: **Inter** (UI) with **Playfair Display** semi-bold as the editorial accent. Hand-written feel for ledger entries in the deck.
- Tone: warm, trustworthy, a little witty ("Udhaar chalta hai, par business dikhta nahi").
Treat this as a *digital khata*: the interface is a well-kept ledger book that happens to listen.

## 3. The #1 constraint: it must NOT look AI-generated
Avoid every one of these tells. Before you show me anything, self-audit against this list and fix violations silently:
- Purple/indigo→blue gradients, glassmorphism, glow, blurred blobs, mesh backgrounds.
- A grid of 4 equal rounded cards with a pastel icon-in-a-circle, big number, tiny delta arrow ("↑ 12%").
- Rounded-2xl everything, uniform soft shadows, uniform 16px padding, everything centered.
- Lucide/Heroicons on every label; emoji as icons; "✨" anywhere; sparkle AI iconography.
- Hero copy like "Welcome back 👋", "Supercharge your business", "Seamless", "Effortless", "Unlock".
- Default shadcn/Tailwind look (slate-900 text, zinc borders, blue-600 buttons, 8px radius).
- Lorem ipsum, "John Doe", "Acme", round fake numbers (1,000 / 5,000 / 10,000), US-style 1,234,567.
- Symmetric, evenly spaced, template-y dashboards with a left icon sidebar + top search bar.
- Chat UIs that look like ChatGPT (bubbles + sparkle avatar + "Ask anything…").

Do this instead:
- **Ledger rows are the primary UI**, not cards. Dense, tabular, ruled lines, a red **margin line** down the left like a notebook, entries written as `date · particulars · Dr/Cr · balance`. Use real accountant's-book conventions (Dr/Cr, "Jama / Naam" can appear as secondary labels in Hindi).
- **Ink & stamp motifs:** PAID / OVERDUE / PARTIAL as slightly rotated rubber-stamp marks (with subtle ink irregularity via SVG, not images). Dues in a **red-pen** colour, payments in ink-blue/green tick. Corrections shown as a struck-through line, like a real khata.
- **Asymmetric, typographic hierarchy:** big editorial numerals in Playfair for the one number that matters (total dues), small caps labels, generous margin notes. One hero focus per screen, not a dashboard of equals.
- **Numerals:** tabular, **Indian grouping** (₹1,23,456), paise-accurate, never "K/M" abbreviations.
- **Real content only**: Hinglish and Devanagari data — Raju Kirana Store, Amit Traders, Puja Store, Vijay General Stores, Sunil Supermarket, Mohan Traders; items atta, dal, chawal, doodh, sabun, tel; amounts like ₹1,240, ₹320, ₹85. Dates like "6 May". Realistic imbalances and messy edge cases (one client with 14-month-old due).
- **Voice is the hero input:** a large hold-to-talk control, a live waveform drawn like a pen trace, and the transcript appearing as if being written into the book — then an **action preview that looks like the ledger entry it will create** (not a generic modal). The assistant's name/avatar should not be a bot/sparkle; it's "the munshi" — a quiet voice with a pen mark.
- Distinct **icon set drawn for this product** (simple, slightly hand-cut, 1.75px strokes, ink-like terminals) — or no icon where a word works better. Hindi + English labels paired where helpful ("Udhaar · Dues").
- Restrained motion: pen-stroke underline draws, stamp lands with a 120 ms settle, page "turns" between ledger dates. No bouncy springs, no skeleton shimmer gradients (use ruled-line placeholders).
- Texture used sparingly: paper grain only on large surfaces and **never behind dense text**; keep contrast AA+.

## 4. Platform & accessibility
- **Mobile-first, 360 px baseline** (cheap Android, bright sun, one-handed). Desktop is the same book opened wider (two-page spread: client list left, ledger right), not a different product.
- Touch targets ≥ 48 px; body ≥ 16 px; Devanagari line-height ≥ 1.6; pair Inter with **Noto Sans Devanagari** (and Noto Serif Devanagari for editorial numerals/headings if Playfair lacks glyphs — Playfair has no Devanagari).
- Contrast AA minimum; never colour-only status (stamp text + colour + icon-free shape).
- Light theme is primary (paper). Provide a considered **dark "night-book" theme** (navy page, cream ink) — not an inverted grey.
- Works in low-bandwidth: no heavy images; paper texture ≤ 30 KB or CSS-only.

## 5. Screens to design (mobile + desktop for each)
1. **Login / onboarding** — email OTP, business name, language choice (हिन्दी / English / Hinglish), optional "connect Telegram" QR.
2. **Home = Chat ("Bolo, likho")** — voice-first command surface, recent entries stream, confirm-before-write preview card, spoken-reply button, transcript edit.
3. **Clients (Khata list)** — sorted by dues, aging colour on the ledger margin, search, "send reminder" per row.
4. **Client ledger (single khata page)** — running balance, entries, Pay-link / Remind / Invoice actions, partial-payment allocation visible.
5. **Inventory (Maal)** — low-stock flagged like a shopkeeper's pencil circle, quantity adjust with big steppers.
6. **Invoices & receipts** — list + the printable invoice/receipt designs themselves (A5, B/W-safe, Devanagari-safe).
7. **Customer portal** (opened from Telegram/link, no login) — "Your khata with ___", amount due, history, **Pay now**, "I paid cash".
8. **Pay page (mock)** — invoice summary, amount, clearly-labelled TEST simulate panel (Success / Failure / Pending), later hosts Paytm.
9. **Settings** — language, reminders cadence + quiet hours, Telegram linking, voice reply on/off.
10. **Telegram message formats** (not UI chrome): admin summary, reminder with pay button, payment-received confirmation — as text mockups so engineering matches tone.
11. **Weekly insight** card — "who to chase / what to restock / do this next" as a handwritten page-margin note.

For every screen include states: loading (ruled-line placeholder), empty (with the one next action), error (retry), offline, voice-recording, mic-permission-denied, long Hindi names, 0 / very large balances, and a partial-payment case.

## 6. How to work
1. First reply: **no pixels yet.** In ≤ 200 words, tell me your concept, the 3 most distinctive design decisions, and the 3 things you deliberately avoid. Ask at most 2 questions, only if essential.
2. Then build **one fully-realized direction** (don't give me three mediocre variants). Start with the design system, then Home/Chat and Client ledger (the two screens that carry the product), mobile first. Show them, wait for my feedback, then do the rest.
3. After each build pass, run the §3 audit and the §4 checklist, and fix before showing me.

## 7. Deliverables (engineering will implement these literally — be precise)
Provide as files I can download, in this structure:
```
design/
├─ tokens.json         # color (light+dark), type scale, spacing, radii, borders, shadows (few), motion durations/easings, z-index, breakpoints
├─ tokens.css          # same as CSS variables (:root + [data-theme=dark])
├─ tailwind.preset.js  # maps tokens into Tailwind theme (no default palette leakage)
├─ components.md       # each component: purpose, anatomy, states, variants, props, spacing in tokens, a11y notes
├─ screens/*.html      # static, responsive HTML/CSS per screen & state (self-contained, tokens.css linked)
├─ assets/             # SVG icons (named), stamp marks, paper texture, logo/wordmark
├─ copy.md             # all UI microcopy in English + Hindi + Hinglish, incl. errors, empty states, voice prompts, Telegram templates
└─ README.md           # design rationale (≤1 page) + do/don't list + how engineering should map shadcn primitives to these tokens
```
Rules for the handoff: no hard-coded colours/sizes outside tokens; every shadcn/Radix primitive we use (Button, Input, Dialog, Sheet, Tabs, Table, Toast, Select, Switch) must have an explicit restyle spec; list any font licences/CDN needs (Google Fonts only); no external image dependencies.

## 8. Fixed facts (do not change)
- Currency ₹, amounts stored in paise, Indian digit grouping, India timezone, dd MMM dates.
- Brand name **KhataFlow**; partners shown subtly in footer/marketing only: "Payments by Paytm", "Voice by Sarvam".
- No blockchain/wallet/crypto concepts anywhere in the UI.
- All writes require an explicit confirm step (Confirm / Edit / Cancel).
- Auth is email OTP; customers use a signed link, no login.
