# API deployment on Vercel

Import this API separately from the Vite storefront:

| Setting | Value |
| --- | --- |
| Root directory | `artifacts/api-server` |
| Framework preset | Express |
| Build command | `pnpm run build` |
| Output directory | `dist` |
| Install command | `pnpm install --frozen-lockfile` |

Enable inclusion of source files outside the root directory for shared workspace
packages. The API's `vercel.json` supplies the framework and build settings.
Remove any dashboard overrides that point to `dist/public`, which belongs to
the storefront, not this server.

Set these variables on the API project for **Preview and Production**:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the public catalog connection;
  use the `sb_publishable_` key, never a service-role key)
- `SUPABASE_DATABASE_URL` (the full Supabase session-pooler PostgreSQL URI)
- `SESSION_SECRET` (a shared random secret of at least 32 characters; keep it
  identical across API instances)
- `STRIPE_SECRET_KEY` (your Stripe **test** secret key, `sk_test_...`)
- `TAWWA_STRIPE_CURRENCY` = `usd`
- `TAWWA_KWD_TO_USD_RATE` = `3.221725`
- `TAWWA_KWD_TO_USD_RATE_DATE` = `2026-11-11`
- `TAWWA_DELIVERY_FEE_KWD` = `0.500`
- `TAWWA_STOREFRONT_URL` = `https://tawwa-xvnv.vercel.app`
- `TAWWA_API_URL` = `https://tawwa-api-server-17ej-ashen.vercel.app`
- `TAWWA_STRIPE_CATALOG_READY` = `true` only after the Stripe test catalog
  script completes successfully.

Keep the database URI and Stripe secret in Vercel's encrypted environment
settings, not in code, GitHub, or chat. Replit secrets do not configure this
separate Vercel API project. The publishable Stripe key is not needed for this
hosted Stripe Checkout flow. No card details are handled by Tawwa.
Vercel supplies `VERCEL=1`; no custom `PORT` is needed.

Before deploying the checkout rate limit, apply
`supabase/migrations/202611100002_checkout_rate_limits.sql` to the shared
Supabase database after this change is merged. Run the migration as the database
owner, for example in the Supabase SQL Editor; do not apply it from an
unmerged workspace branch. Checkout requires this migration and the shared
`SESSION_SECRET` to be present on every API instance.

Before enabling checkout, run `pnpm --filter @workspace/scripts run seed:stripe-test`
in a workspace with the same Stripe test account and Supabase catalog. It creates
any missing USD Stripe Prices from the KWD catalog using the fixed rate above;
the checkout shows both the KWD total and converted USD amount. If the rate
changes, reseed the catalog and update the API project's rate variables together.
Only after the script succeeds, set `TAWWA_STRIPE_CATALOG_READY=true` in Vercel
and redeploy the API.

The first checkout initializes Stripe's managed webhook and synced Stripe schema
in Supabase. The route is `/api/stripe/webhook`; its signing secret is managed by
`stripe-replit-sync` in the protected `stripe` schema.

After setting the variables, redeploy. Check
`https://tawwa-api-server-17ej-ashen.vercel.app/api/healthz` for `{"status":"ok"}`.

This deploys the API only. A separately deployed storefront also needs its
`/api/*` requests routed to this API under the storefront's origin, particularly
for staff session cookies. Do not point that routing at a temporary development
preview. The storefront's `artifacts/tawwa-gifts/vercel.json` supplies this routing
and its page-refresh fallback. See `artifacts/tawwa-gifts/DEPLOYING.md` for the
second project's settings. Opening the API domain at `/` is not a storefront
check; use `/api/healthz` to check the API.
