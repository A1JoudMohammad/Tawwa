begin;

alter table public.tawwa_occasions add column if not exists is_active boolean not null default true;

-- Only a database administrator can grant/revoke staff membership. There is
-- deliberately no self-registration or browser-accessible membership writer.
create table if not exists public.tawwa_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.tawwa_staff enable row level security;
revoke all on public.tawwa_staff from anon, authenticated;
grant select on public.tawwa_staff to authenticated;
create policy tawwa_staff_read_self on public.tawwa_staff
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.tawwa_is_staff()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.tawwa_staff where user_id = (select auth.uid()));
$$;
revoke all on function public.tawwa_is_staff() from public, anon;
grant execute on function public.tawwa_is_staff() to authenticated;

-- No public write privileges, including for ordinary signed-in customers.
grant select, insert, update on public.tawwa_products, public.tawwa_occasions to authenticated;
revoke delete, truncate, references, trigger on public.tawwa_products, public.tawwa_occasions from anon, authenticated;

drop policy if exists tawwa_available_occasions_read on public.tawwa_occasions;
create policy tawwa_available_occasions_read on public.tawwa_occasions
  for select to anon, authenticated using (is_active);
drop policy if exists tawwa_available_products_read on public.tawwa_products;
create policy tawwa_available_products_read on public.tawwa_products
  for select to anon, authenticated using (
    is_available and exists (
      select 1 from public.tawwa_occasions o where o.id = occasion_id and o.is_active
    )
  );

create policy tawwa_staff_products_read on public.tawwa_products
  for select to authenticated using ((select public.tawwa_is_staff()));
create policy tawwa_staff_products_insert on public.tawwa_products
  for insert to authenticated with check ((select public.tawwa_is_staff()));
create policy tawwa_staff_products_update on public.tawwa_products
  for update to authenticated using ((select public.tawwa_is_staff()))
  with check ((select public.tawwa_is_staff()));
create policy tawwa_staff_occasions_read on public.tawwa_occasions
  for select to authenticated using ((select public.tawwa_is_staff()));
create policy tawwa_staff_occasions_insert on public.tawwa_occasions
  for insert to authenticated with check ((select public.tawwa_is_staff()));
create policy tawwa_staff_occasions_update on public.tawwa_occasions
  for update to authenticated using ((select public.tawwa_is_staff()))
  with check ((select public.tawwa_is_staff()));

-- Apply the same validation to direct REST writes as to editor writes.
create or replace function public.tawwa_validate_catalog_write()
returns trigger language plpgsql set search_path = ''
as $$
declare
  record_json jsonb := to_jsonb(new);
  field text;
  text_fields text[];
begin
  if tg_op = 'UPDATE' and new.id <> old.id then
    raise exception 'Catalog IDs cannot be changed' using errcode = '23514';
  end if;
  if new.id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(new.id) > 80
     or new.display_order < 0 or new.display_order > 100000 then
    raise exception 'Invalid ID or display order' using errcode = '23514';
  end if;
  if tg_table_name = 'tawwa_products' then
    text_fields := array['name_en','name_ar','description_en','description_ar',
                         'ideal_for_en','ideal_for_ar','delivery_en','delivery_ar'];
    if new.price <= 0 or new.price > 1000000 or new.price <> round(new.price, 3)
       or new.price::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'Price must be positive KWD with at most three decimals' using errcode = '23514';
    end if;
    if new.age_group is not null and length(new.age_group) > 80 then
      raise exception 'Age group is too long' using errcode = '23514';
    end if;
    if jsonb_typeof(new.contents_en) <> 'array' or jsonb_typeof(new.contents_ar) <> 'array' then
      raise exception 'Contents must be arrays' using errcode = '23514';
    end if;
    if jsonb_array_length(new.contents_en) < 1 or jsonb_array_length(new.contents_en) > 50
       or jsonb_array_length(new.contents_en) <> jsonb_array_length(new.contents_ar) then
      raise exception 'Provide matching English and Arabic contents' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.contents_en || new.contents_ar) item
      where jsonb_typeof(item) <> 'string' or length(btrim(item #>> '{}')) = 0 or length(item #>> '{}') > 500
    ) then
      raise exception 'Contents items must be nonblank text' using errcode = '23514';
    end if;
    -- Lock the referenced occasion while validating it to avoid racing a
    -- concurrent disable. Disabling an occasion itself hides all its gifts.
    perform 1 from public.tawwa_occasions where id = new.occasion_id and (is_active or not new.is_available) for share;
    if not found then
      raise exception 'Choose an existing active occasion for an available product' using errcode = '23514';
    end if;
  else
    text_fields := array['name_en','name_ar'];
    if new.icon not in ('gift','heart','sparkles','sun','award','rings','moon') then
      raise exception 'Choose a supported occasion icon' using errcode = '23514';
    end if;
  end if;
  foreach field in array text_fields loop
    if record_json ->> field is null or length(btrim(record_json ->> field)) = 0
       or length(record_json ->> field) > (case
         when field like 'name_%' then 200
         when field like 'description_%' then 4000
         else 1000 end) then
      raise exception 'Required bilingual text is missing or too long: %', field using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.tawwa_validate_catalog_write() from public, anon, authenticated;
create trigger tawwa_products_validate_write before insert or update on public.tawwa_products
  for each row execute function public.tawwa_validate_catalog_write();
create trigger tawwa_occasions_validate_write before insert or update on public.tawwa_occasions
  for each row execute function public.tawwa_validate_catalog_write();

commit;
