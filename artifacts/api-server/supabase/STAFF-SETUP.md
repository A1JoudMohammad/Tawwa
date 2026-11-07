# Staff catalog setup

The editor is at `/admin`. It works independently of the public catalog loading
screen and uses Supabase Auth email/password accounts. No service-role key is
used anywhere in the application.

## Connect and enable

1. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the API service using the
   workspace environment settings. The latter must be a modern
   `sb_publishable_` key, not an admin/service-role key.
2. On the **same Supabase project**, apply migrations in order from
   `supabase/migrations/` using Supabase's migration tooling or SQL editor.
   The staff migration is transactional and must run once. It adds staff
   membership, occasion status, database validation, and row-level security.
   Do not use the workspace Drizzle push command for these external tables.
3. In Supabase Authentication, create/invite the intended staff account with a
   confirmed email and password. Do not grant staff access to every registrant.
4. In the Supabase SQL editor, authorize that account using its Auth user UUID:

   ```sql
   insert into public.tawwa_staff (user_id) values ('<auth-user-uuid>')
   on conflict (user_id) do nothing;
   ```

5. Restart the API service after setting its configuration, then open `/admin`
   and sign in. No password or token belongs in source code or chat.

## Staff usage

- Products require English and Arabic names, descriptions, contents,
  recipient guidance, and delivery text.
- Contents use one line per item in each language; item counts must match.
- KWD prices must be positive, at most 1,000,000, and have at most three decimals.
- IDs are unique URL-safe slugs, fixed after creation.
- A product must reference an existing occasion. Available products require an
  active occasion.
- Disable rather than delete products and occasions. Disabling an occasion
  hides all its products; re-enabling it restores products that are themselves
  marked available. The editor still lists disabled records.
- Images are currently bundled by product ID; new products show a gift
  placeholder if no bundled image exists.
- Sessions expire after at most one hour. Sign in again to continue editing.
  Session tokens are stored only in HttpOnly, SameSite=Strict cookies, not
  browser storage or API response bodies.
- Saves refresh the editor and storefront cache in that browser. Other open
  storefront sessions refresh within 60 seconds or on returning to the page.

## Revoke access

```sql
delete from public.tawwa_staff where user_id = '<auth-user-uuid>';
```

Membership is rechecked on every staff API request and by database policies on
every write. Ordinary signed-in users cannot create, edit, disable, or delete
catalog records, and cannot grant themselves staff access.

The migration is kept in this branch rather than applied to a shared/live
Supabase database before merge. Applying it and granting the intended staff
account are explicit owner setup steps; the editor never silently substitutes
local catalog data when Supabase is missing.
