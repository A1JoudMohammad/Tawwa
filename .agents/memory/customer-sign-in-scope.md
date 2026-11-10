---
name: Customer sign-in scope
description: Customer email/password access is separate from catalog staff permissions.
---

Customer sign-in uses existing Supabase Auth accounts. Do not reuse staff authorization or grant staff access from a customer session; do not add public sign-up unless requested.

**Why:** The storefront customer login is distinct from the catalog editor's staff-only Supabase access, and the request was for existing email/password accounts.

**How to apply:** Keep customer session/UI behavior in the storefront auth flow. Continue enforcing staff membership and database RLS through the separate `/admin` flow.
