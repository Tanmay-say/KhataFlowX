# KhataFlow PWA

This dependency-free, installable PWA contains the shopkeeper workspace and the signed customer portal/payment page. Styling follows the ruled-paper reference in `designs/Claude_Design_Prompt.md`. The app shell is cached for offline launch; authenticated data and payment responses are never cached.

Start the API with `corepack pnpm dev` and this app with `corepack pnpm web:dev`. Copy `apps/web/.env.example` to `apps/web/.env` and set `API_URL`; configure Supabase credentials in `apps/api/.env`. Run `corepack pnpm web:build` to create a static `dist` bundle with the configured API URL. The default payment flow is mock-only and clearly marked as a test. Routes: `/` for shopkeeper login/workspace, `/pay/<signed-token>` for a customer.

For Vercel, use this directory as the frontend project root and add `KHATAFLOW_API_URL` from `.env.vercel` to the Vercel project settings. Vercel does not automatically load this template file.

Languages: English, Hindi, Hinglish. Main flows include OTP login and shop setup, chat/text and voice input with transcript review, clients and ledgers, payment recording, stock, invoices/receipts, settings, customer link sharing, one-time customer account invitations, connected shops, PWA installation guidance, and Telegram connection links. See the root README's **Current handoff** for completed checks, setup limits, and remaining PRD items.
