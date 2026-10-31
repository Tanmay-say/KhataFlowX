# KhataFlow customer web app

The first frontend slice is the signed customer khata and mock payment page at `/pay/:token`. It is a dependency-free, installable PWA that follows the supplied ruled-paper design. The service worker caches only the app shell; account and payment responses stay online and are never cached.

Run the API with `corepack pnpm dev` and the web app with `corepack pnpm web:dev`. The web server reads `API_URL` from the repository `.env` and defaults to `http://localhost:8001`. The mock checkout is explicitly labelled as a test and does not move real money.
