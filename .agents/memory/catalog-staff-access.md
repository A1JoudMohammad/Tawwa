---
name: Catalog staff access
description: Why staff authentication and permissions stay in Supabase and how shared-database changes are handled.
---

Keep catalog staff authorization in Supabase Auth and database row-level
security, using each staff member's identity rather than a service-role key.
Do not add a parallel identity provider just for the catalog editor.

**Why:** The existing catalog lives in an external Supabase project. Sharing
identity with its permission checks protects direct REST access as well as
the Express API, without introducing a privileged server writer.

**How to apply:** Any future staff surface must enforce database authorization,
not just hide UI controls. Never infer staff membership from signup or
user-editable profile metadata.

Keep migrations for the shared Supabase project merge-gated. The external
database is not an isolated fork of the code workspace.

**Why:** Applying a migration from a task branch would affect the shared
catalog before the task is merged.

**How to apply:** Verify new migrations against an isolated PostgreSQL test
instance. Provide owner setup instructions for external migrations and account
authorization; don't silently run workspace Drizzle pushes against Supabase.
