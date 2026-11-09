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

Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the API project's
environment settings for the desired environments. Use the publishable key
starting with `sb_publishable_`, not a service-role or secret key. Never commit
keys. Vercel supplies `VERCEL=1`; no custom `PORT` is needed for this API there.

After these files reach the GitHub branch connected to Vercel, redeploy. Check
`https://<your-api-domain>/api/healthz` for `{"status":"ok"}`.

This deploys the API only. A separately deployed storefront also needs its
`/api/*` requests routed to this API under the storefront's origin, particularly
for staff session cookies. Do not point that routing at a temporary development
preview. Page-refresh routing for the storefront is a separate configuration.
