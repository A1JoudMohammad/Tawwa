import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL RLS and triggers, isolated in memory. No production/dev
// connection, Supabase credentials, or network access is needed.
test("staff migration enforces read-only public access and validated staff writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
      create table public.tawwa_occasions (
        id text primary key, name_en text not null, name_ar text not null,
        icon text not null, display_order integer not null default 0,
        created_at timestamptz not null default now()
      );
      create table public.tawwa_products (
        id text primary key, occasion_id text not null references public.tawwa_occasions(id),
        age_group text, name_en text not null, name_ar text not null,
        description_en text not null, description_ar text not null,
        contents_en jsonb not null default '[]', contents_ar jsonb not null default '[]',
        price numeric not null check (price > 0),
        ideal_for_en text not null, ideal_for_ar text not null,
        delivery_en text not null, delivery_ar text not null,
        display_order integer not null default 0, is_available boolean not null default true,
        created_at timestamptz not null default now()
      );
      create table public.tawwa_governorates (id text primary key, name_en text not null, display_order integer not null default 0);
    `);
    await db.exec(await readFile("supabase/migrations/202611070001_catalog_read_access.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202611070002_catalog_staff.sql", "utf8"));
    await db.exec(`
      insert into public.tawwa_staff (user_id) values ('00000000-0000-0000-0000-000000000001');
      set role authenticated;
      select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
      insert into public.tawwa_occasions(id,name_en,name_ar,icon) values ('birthday','Birthday','عيد ميلاد','sparkles');
      insert into public.tawwa_products(
        id,occasion_id,name_en,name_ar,description_en,description_ar,
        contents_en,contents_ar,price,ideal_for_en,ideal_for_ar,delivery_en,delivery_ar
      ) values ('gift','birthday','Gift','هدية','Description','وصف',
        '["Card"]','["بطاقة"]',19.125,'Friend','صديق','Today','اليوم');
    `);
    assert.equal((await db.query("select * from public.tawwa_products")).rows.length, 1);
    for (const assignment of [
      "name_ar='   '", "description_en=''", "price=0", "price=1.2345",
      "price=1000001", "price='NaN'", "contents_en='[]'", "contents_ar='[\"a\", \"b\"]'",
      "contents_ar='[2]'", "occasion_id='missing'", "id='renamed'", "display_order=-1",
    ]) {
      await assert.rejects(db.exec(`update public.tawwa_products set ${assignment} where id='gift'`), undefined, assignment);
    }
    await assert.rejects(db.exec("update public.tawwa_occasions set name_ar=' ' where id='birthday'"));
    await assert.rejects(db.exec("delete from public.tawwa_products where id='gift'"), /permission denied/);

    // Ordinary authenticated accounts can read public products, but cannot
    // mutate them, create records, see membership, or promote themselves.
    await db.exec("select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false)");
    assert.equal((await db.query("select * from public.tawwa_staff")).rows.length, 0);
    assert.equal((await db.query("update public.tawwa_products set price=1 where id='gift' returning *")).rows.length, 0);
    await assert.rejects(db.exec("insert into public.tawwa_occasions(id,name_en,name_ar,icon) values ('bad','Bad','لا','gift')"), /row-level security/);
    await assert.rejects(db.exec("insert into public.tawwa_staff(user_id) values ('00000000-0000-0000-0000-000000000002')"), /permission denied/);

    await db.exec("set role anon");
    assert.equal((await db.query("select * from public.tawwa_products")).rows.length, 1);
    await assert.rejects(db.exec("update public.tawwa_products set price=1"), /permission denied/);
    await assert.rejects(db.exec("select * from public.tawwa_staff"), /permission denied/);

    // Disabled occasions hide all of their otherwise available products.
    await db.exec(`
      set role authenticated;
      select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
      update public.tawwa_occasions set is_active=false where id='birthday';
    `);
    assert.equal((await db.query("select * from public.tawwa_products")).rows.length, 1);
    await assert.rejects(db.exec("update public.tawwa_products set is_available=true where id='gift'"));
    await db.exec("set role anon");
    assert.equal((await db.query("select * from public.tawwa_products")).rows.length, 0);
    assert.equal((await db.query("select * from public.tawwa_occasions")).rows.length, 0);
    await db.exec(`
      set role authenticated;
      update public.tawwa_occasions set is_active=true where id='birthday';
      update public.tawwa_products set is_available=false where id='gift';
      set role anon;
    `);
    assert.equal((await db.query("select * from public.tawwa_products")).rows.length, 0);
    await db.exec(`
      set role authenticated;
      update public.tawwa_products set is_available=true, price=20.001 where id='gift';
      set role anon;
    `);
    assert.equal((await db.query("select price from public.tawwa_products")).rows[0].price, "20.001");

    // Revocation takes effect immediately even with an otherwise valid JWT.
    await db.exec(`
      reset role;
      delete from public.tawwa_staff where user_id='00000000-0000-0000-0000-000000000001';
      set role authenticated;
    `);
    assert.equal((await db.query("update public.tawwa_products set price=1 where id='gift' returning *")).rows.length, 0);
  } finally { await db.close(); }
});
