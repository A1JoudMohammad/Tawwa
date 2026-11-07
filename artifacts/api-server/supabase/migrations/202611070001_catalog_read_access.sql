-- Only the public catalog is readable. No customer or order data is involved.
alter table public.tawwa_occasions enable row level security;
alter table public.tawwa_products enable row level security;
alter table public.tawwa_governorates enable row level security;

revoke all on public.tawwa_occasions, public.tawwa_products, public.tawwa_governorates from anon, authenticated;
grant select on public.tawwa_occasions, public.tawwa_products, public.tawwa_governorates to anon, authenticated;

create policy tawwa_available_products_read
  on public.tawwa_products for select to anon, authenticated
  using (is_available = true);
create policy tawwa_available_occasions_read
  on public.tawwa_occasions for select to anon, authenticated
  using (exists (
    select 1 from public.tawwa_products
    where occasion_id = tawwa_occasions.id and is_available = true
  ));
create policy tawwa_governorates_read
  on public.tawwa_governorates for select to anon, authenticated
  using (true);
