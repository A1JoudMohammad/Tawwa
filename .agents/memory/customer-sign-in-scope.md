---
name: Customer sign-in scope
description: Customer email/password access is separate from catalog staff permissions.
---

Customer sign-in and public email/password sign-up use Supabase Auth. Do not reuse staff authorization or grant staff access from a customer session.

**Why:** The storefront customer auth is distinct from catalog staff access. The user explicitly requested public customer sign-up on November 10, 2026.

**How to apply:** Keep customer session/UI behavior in the storefront auth flow. Continue enforcing staff membership and database RLS through the separate `/admin` flow; customer registration must never grant staff privileges.
