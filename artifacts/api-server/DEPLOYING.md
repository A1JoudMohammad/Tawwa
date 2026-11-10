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
- `STRIPE_SECRET_KEY` (your Stripe **test** secret key, `sk_test_...`)
- `TAWWA_DELIVERY_FEE_KWD` = `0.500`
- `TAWWA_STOREFRONT_URL` = `https://tawwa-xvnv.vercel.app`
- `TAWWA_API_URL` = `https://tawwa-api-server-17ej-ashen.vercel.app`
- `TAWWA_STRIPE_CATALOG_READY` = `true` only after the Stripe test catalog
  script completes successfully.

Keep the database URI and Stripe secret in Vercel's encrypted environment
settings, not in code, GitHub, or chat. The publishable Stripe key is not needed
for this hosted Stripe Checkout flow. No card details are handled by Tawwa.
Vercel supplies `VERCEL=1`; no custom `PORT` is needed.

Before enabling checkout, run `pnpm --filter @workspace/scripts run seed:stripe-test`
in the Replit workspace. It creates any missing Stripe products and real Prices
from the current Supabase catalog, and fails safely if your Stripe test account
does not support KWD. Only after the script succeeds, set
`TAWWA_STRIPE_CATALOG_READY=true` in Vercel and redeploy.

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
