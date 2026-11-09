# Storefront deployment on Vercel

The API and storefront are separate Vercel projects. Opening the API domain at
`/` displays `Cannot GET /` because the API does not host the storefront.
Do not change the working API project into a Vite project.

Import the same GitHub repository as a second project with these settings:

| Setting | Value |
| --- | --- |
| Project name | `tawwa` |
| Root directory | `artifacts/tawwa-gifts` |
| Framework preset | Vite |
| Build command | Use the value from `vercel.json` |
| Output directory | `dist/public` |
| Install command | `pnpm install --frozen-lockfile` |

Enable inclusion of source files outside the root directory so shared workspace
packages and assets are available. Remove conflicting dashboard build overrides.
The checked-in build command supplies `BASE_PATH=/` and `PORT=3000`; these are
build configuration values, not secrets.

The storefront configuration forwards `/api/*` to the existing API deployment,
`https://tawwa-api-server-17ej-ashen.vercel.app`, before the SPA page fallback.
If the API domain changes, update that destination. This same-origin routing is
also important for staff session cookies. The API endpoint `/api/healthz`
should return `{"status":"ok"}` through the storefront domain after deployment.

Keep Supabase database credentials and Stripe secret keys in the API project's
environment settings, never in frontend `VITE_*` variables or source control.
This routing configuration does not complete or enable Stripe checkout.

After deployment, use the new storefront project's domain to browse the shop.
Verify the home page, a direct visit to `/cart`, and `/api/healthz`.
