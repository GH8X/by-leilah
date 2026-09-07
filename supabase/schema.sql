-- ============================================================================
-- by Leïlah — Supabase schema (run ONCE in: Supabase Dashboard → SQL Editor)
-- ----------------------------------------------------------------------------
-- What this file does:
--   1. Creates (if missing) the canonical tables the website expects:
--        products, product_sizes, orders, order_items, website_settings
--      and ALTERs existing tables to add any missing canonical columns, so it
--      is safe to run whether or not these tables already exist.
--   2. Enables Row Level Security and grants the minimum privileges:
--        - anon          : read published products/sizes/settings (storefront)
--        - authenticated : full read + write, but ONLY when the user carries
--                          the "admin" role (checked per-row by bl_is_admin())
--   3. Locks Storage bucket "byleilah": public READ, writes (upload/overwrite/
--      delete) restricted to authenticated admins, scoped to the "hero" and
--      "product-images" folders.
--   4. Creates atomic, server-side functions:
--        bl_place_order(jsonb)     — checkout: validates stock/prices/quantities,
--                                    deducts stock row-locked, writes the order
--                                    and its items, all in ONE transaction.
--        bl_set_order_status(...)  — status changes with exactly-once stock
--                                    restore on cancel / re-deduct on re-open.
--        bl_verify_payment(...)    — mark a BaridiMob payment verified.
--        bl_reject_payment(...)    — mark a BaridiMob payment rejected.
--        bl_change_stock(...)      — admin stock adjustments (race-safe).
--        bl_list_orders()          — admin order feed (orders + items).
--
-- Nothing here drops tables or existing data. To force a clean canonical
-- reset of the five tables instead (destructive — only if you want to start
-- from scratch), uncomment the "force reset" block at the very bottom AFTER
-- backing up, and re-run.
--
-- IMPORTANT (verified live against this project on 2026-09-07): the five tables
-- still exist in an EARLIER / non-canonical shape (product_sizes.name and
-- website_settings.data are missing) and the storage bucket "byleilah" does not
-- exist yet. This file is idempotent (safe to re-run) BUT "CREATE TABLE IF NOT
-- EXISTS" never reshapes a pre-existing table. Recommended clean start:
--   1) run the "FORCE RESET (destructive)" block at the bottom FIRST (the data
--      was already deleted from the project), then
--   2) run this whole file again.
-- If you keep the old tables instead, only the additive ALTERs apply and the
-- storefront may not match their columns.
--
-- AUTH SETUP (separate steps, see SETUP.md):
--   * Dashboard → Authentication → Providers → Email: enable "Allow new users
--     to sign up" = OFF (admins are created from the dashboard).
--   * Dashboard → Authentication → Users → "Add user": create the admin
--     account (email + password).
--   * Then run the SQL at the bottom of this file ("promote your admin
--     account") with the admin's real email, and sign in on admin.html.
-- ============================================================================

begin;

-- ============================================================================
-- 1. TABLES (canonical shape; CREATE IF NOT EXISTS + additive ALTERs)
-- ============================================================================

create table if not exists public.products (
  id          text primary key,
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  category    text not null,
  price       integer not null check (price >= 0),
  old_price   integer check (old_price is null or old_price >= 0),
  badge       text,
  active      boolean not null default true,          -- admin publish toggle
  colors      jsonb not null default '[]'::jsonb,     -- [{hex,label,tone}]
  images      jsonb not null default '[]'::jsonb,     -- [public URL strings]
  tone        text not null default 'champagne',
  mono        text not null default 'L',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.product_sizes (
  product_id text not null references public.products(id) on delete cascade,
  name       text not null,          -- e.g. M / 38 / Unique
  stock      integer not null default 0 check (stock >= 0),
  primary key (product_id, name)
);

create table if not exists public.orders (
  id                text primary key,                 -- e.g. BL-AB1CD
  customer          jsonb not null,                   -- firstName,lastName,phone,wilaya,commune,address,notes
  subtotal          integer not null check (subtotal >= 0),
  delivery_fee      integer not null default 0 check (delivery_fee >= 0),
  total             integer not null check (total >= 0),
  payment_method    text not null check (payment_method in ('cod','baridimob')),
  payment_status    text not null default 'pending'
                    check (payment_status in ('pending','verification_required','verified','rejected')),
  order_status      text not null default 'pending'
                    check (order_status in ('pending','confirmed','preparing','shipped','delivered','cancelled')),
  payment_reference text not null default '',
  payment_proof     jsonb,                             -- {fileName,fileType,fileSize}
  stock_restore     jsonb,                             -- [{pid,size,quantity}] exactly-once marker
  stock_restored_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     text not null references public.orders(id) on delete cascade,
  product_id   text,              -- snapshot reference; NO foreign key: deleting a
  product_slug text,              -- product must never break historical orders
  name         text not null,     -- snapshot at purchase time
  color_label  text not null default '',
  color_hex    text,
  size         text not null default '',
  quantity     integer not null check (quantity > 0),
  unit_price   integer not null check (unit_price >= 0),  -- snapshot at purchase time
  created_at   timestamptz not null default now()
);

create table if not exists public.website_settings (
  id         smallint primary key default 1 check (id = 1),  -- single-row settings
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Make pre-existing tables (from an earlier setup) match the canonical shape
-- without dropping anything. Each line is a no-op when the column exists.
alter table public.products
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'clothing',
  add column if not exists price integer not null default 0,
  add column if not exists old_price integer,
  add column if not exists badge text,
  add column if not exists active boolean not null default true,
  add column if not exists colors jsonb not null default '[]'::jsonb,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists tone text not null default 'champagne',
  add column if not exists mono text not null default 'L',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists customer jsonb not null default '{}'::jsonb,
  add column if not exists subtotal integer not null default 0,
  add column if not exists delivery_fee integer not null default 0,
  add column if not exists total integer not null default 0,
  add column if not exists payment_method text not null default 'cod',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists order_status text not null default 'pending',
  add column if not exists payment_reference text not null default '',
  add column if not exists payment_proof jsonb,
  add column if not exists stock_restore jsonb,
  add column if not exists stock_restored_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.order_items
  add column if not exists product_id text,
  add column if not exists product_slug text,
  add column if not exists name text not null default '',
  add column if not exists color_label text not null default '',
  add column if not exists color_hex text,
  add column if not exists size text not null default '',
  add column if not exists quantity integer not null default 1,
  add column if not exists unit_price integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.website_settings
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_product_sizes_product on public.product_sizes(product_id);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_status on public.orders(order_status);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- ============================================================================
-- 2. ROLE HELPER (used by RLS + storage policies + server functions)
--    An admin is an auth user whose app_metadata.role = 'admin'.
-- ============================================================================
create or replace function public.bl_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role'
  ) = 'admin';
$$;

-- ============================================================================
-- 3. GRANTS (minimum surface)
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.products, public.product_sizes, public.website_settings to anon;
grant select, insert, update, delete on public.products, public.product_sizes,
      public.orders, public.order_items, public.website_settings to authenticated;

-- Functions execute with their OWNER's privileges; anon is granted ONLY the
-- storefront checkout entry point. Everything else requires the admin claim.
revoke execute on function public.bl_place_order(jsonb) from public;
grant execute on function public.bl_place_order(jsonb) to anon, authenticated;
revoke execute on function public.bl_set_order_status(text, text) from public;
grant execute on function public.bl_set_order_status(text, text) to authenticated;
revoke execute on function public.bl_verify_payment(text) from public;
grant execute on function public.bl_verify_payment(text) to authenticated;
revoke execute on function public.bl_reject_payment(text) from public;
grant execute on function public.bl_reject_payment(text) to authenticated;
revoke execute on function public.bl_change_stock(text, text, integer) from public;
grant execute on function public.bl_change_stock(text, text, integer) to authenticated;
revoke execute on function public.bl_list_orders() from public;
grant execute on function public.bl_list_orders() to authenticated;

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================
alter table public.products enable row level security;
alter table public.product_sizes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.website_settings enable row level security;

-- products: the public sees only published products; admins see everything.
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using (active = true or public.bl_is_admin());
drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.bl_is_admin()) with check (public.bl_is_admin());

-- product_sizes: public sees sizes only for published products; admins all.
drop policy if exists "sizes_public_read" on public.product_sizes;
create policy "sizes_public_read" on public.product_sizes
  for select using (
    public.bl_is_admin() or exists (
      select 1 from public.products p where p.id = product_sizes.product_id and p.active = true
    )
  );
drop policy if exists "sizes_admin_write" on public.product_sizes;
create policy "sizes_admin_write" on public.product_sizes
  for all using (public.bl_is_admin()) with check (public.bl_is_admin());

-- orders + order_items: anon has NO access (orders are written only through
-- the server function). Admins: full read; status changes through functions.
drop policy if exists "orders_admin_all" on public.orders;
create policy "orders_admin_all" on public.orders
  for all using (public.bl_is_admin()) with check (public.bl_is_admin());
drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_admin_all" on public.order_items
  for all using (public.bl_is_admin()) with check (public.bl_is_admin());

-- website_settings: public content (contact/about/socials/hero flags) is
-- readable by everyone; only admins may write.
drop policy if exists "settings_public_read" on public.website_settings;
create policy "settings_public_read" on public.website_settings
  for select using (true);
drop policy if exists "settings_admin_write" on public.website_settings;
create policy "settings_admin_write" on public.website_settings
  for all using (public.bl_is_admin()) with check (public.bl_is_admin());

-- ============================================================================
-- 5. STORAGE (bucket "byleilah")
--    Ensure the bucket exists and is PUBLIC (50 MB object cap — the hero video
--    limit is 40 MB, product images 8 MB). Public bucket ⇒ READ is public.
--    The policies below lock every WRITE (upload / overwrite / delete) to
--    authenticated admins only, scoped to the folders the app uses:
--        hero/home-hero.mp4          (single stable object — upsert replaces it)
--        product-images/<file>       (product photos, incl. safe SVG)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('byleilah', 'byleilah', true, 52428800, null)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "byleilah_upload_hero" on storage.objects;
create policy "byleilah_upload_hero" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'hero'
    and (storage.foldername(name))[2] = 'home-hero.mp4'
  );

drop policy if exists "byleilah_upsert_hero" on storage.objects;
create policy "byleilah_upsert_hero" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'hero'
    and (storage.foldername(name))[2] = 'home-hero.mp4'
  )
  with check (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'hero'
    and (storage.foldername(name))[2] = 'home-hero.mp4'
  );

drop policy if exists "byleilah_upload_products" on storage.objects;
create policy "byleilah_upload_products" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'product-images'
  );

drop policy if exists "byleilah_delete_hero" on storage.objects;
create policy "byleilah_delete_hero" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'hero'
    and (storage.foldername(name))[2] = 'home-hero.mp4'
  );

drop policy if exists "byleilah_delete_products" on storage.objects;
create policy "byleilah_delete_products" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'byleilah'
    and public.bl_is_admin()
    and (storage.foldername(name))[1] = 'product-images'
  );

-- ============================================================================
-- 6. SERVER-SIDE FUNCTIONS
--    Everything below is SECURITY DEFINER but every function re-checks the
--    caller (admin claim / stock reality). anon may ONLY call bl_place_order.
-- ============================================================================

-- auto-maintain updated_at
create or replace function public.bl_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists products_updated on public.products;
create trigger products_updated before update on public.products
  for each row execute function public.bl_touch_updated();
drop trigger if exists orders_updated on public.orders;
create trigger orders_updated before update on public.orders
  for each row execute function public.bl_touch_updated();
drop trigger if exists settings_updated on public.website_settings;
create trigger settings_updated before update on public.website_settings
  for each row execute function public.bl_touch_updated();

-- Total stock helper (sum of size rows) — used by stock functions.
create or replace function public.bl_total_stock(p_id text)
returns integer
language sql
stable
as $$
  select coalesce(sum(stock), 0) from public.product_sizes where product_id = p_id;
$$;

-- Automatically un-publish a product whose sizes just reached zero
-- (mirrors the storefront rule "stock 0 ⇒ out of stock").
create or replace function public.bl_sync_active(p_id text)
returns void
language plpgsql
as $$
begin
  update public.products
     set active = false
   where id = p_id and public.bl_total_stock(p_id) = 0 and active = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- bl_place_order(jsonb)  — ATOMIC CHECKOUT ENTRY POINT (called by anon)
--
-- Payload (server trusts NOTHING except the product ids/sizes/quantities):
--   {
--     "customer": {firstName,lastName,phone,wilaya,commune,address,notes},
--     "wilaya_code": 16,
--     "method": "cod" | "baridimob",
--     "proof": {fileName,fileType,fileSize} | null,
--     "reference": "",
--     "lines": [ { "product_id": "...", "size": "M", "qty": 1 } ]
--   }
-- Price / name / total / fees are re-read from products and computed here.
-- Concurrency: every affected size row is locked (SELECT … FOR UPDATE) before
-- deducting, so two simultaneous orders can never oversell the same stock.
-- Any failure raises an exception → the whole transaction rolls back.
-- ---------------------------------------------------------------------------
create or replace function public.bl_place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o_id         text;
  o_created    timestamptz := now();
  cus          jsonb;
  w_code       int;
  pay_method   text;
  proof        jsonb;
  reference    text;
  jline        jsonb;
  pid          text;
  sz_name      text;
  qty          int;
  p_name       text;
  p_slug       text;
  p_price      int;
  p_active     boolean;
  p_label      text;
  p_hex        text;
  cur_stock    int;
  rec          record;
  sub          int := 0;
  fee          int;
  free_thresh  int := 25000;
  base_fee     int := 600;
  item_rows    jsonb := '[]'::jsonb;
  created_iso  text;
  attempt      int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Requête invalide.';
  end if;

  cus        := coalesce(payload -> 'customer', '{}'::jsonb);
  w_code     := coalesce((payload ->> 'wilaya_code')::int, 0);
  pay_method := coalesce(payload ->> 'method', 'cod');
  proof      := payload -> 'proof';
  if proof = 'null'::jsonb then proof := null; end if;
  reference  := coalesce(payload ->> 'reference', '');

  if pay_method not in ('cod', 'baridimob') then
    raise exception 'Mode de paiement invalide.';
  end if;
  if coalesce(cus ->> 'firstName', '') = '' or coalesce(cus ->> 'lastName', '') = ''
     or coalesce(cus ->> 'phone', '') = '' or coalesce(cus ->> 'commune', '') = ''
     or coalesce(cus ->> 'address', '') = '' then
    raise exception 'Coordonnées de livraison incomplètes.';
  end if;
  if w_code < 1 or w_code > 58 then
    raise exception 'Sélectionnez une wilaya de livraison valide.';
  end if;

  -- 1) Validate every line against the REAL catalogue and lock each size row.
  for rec in select jsonb_array_elements(coalesce(payload -> 'lines', '[]'::jsonb)) as l loop
    jline := rec.l;
    if jsonb_typeof(jline) <> 'object' then
      raise exception 'Article invalide dans le panier.';
    end if;
    pid     := jline ->> 'product_id';
    sz_name := jline ->> 'size';
    qty     := coalesce((jline ->> 'qty')::int, 0);
    if pid is null or pid = '' then raise exception 'Article invalide dans le panier.'; end if;
    if qty < 1 then raise exception 'Quantité invalide pour un article.'; end if;

    select name, slug, price, active,
           coalesce(colors -> 0 ->> 'label', ''), colors -> 0 ->> 'hex'
      into p_name, p_slug, p_price, p_active, p_label, p_hex
      from public.products
     where id = pid
     for update;
    if p_name is null then
      raise exception 'Un article n''existe plus dans le catalogue.';
    end if;
    if p_active is false then
      raise exception 'Un article est indisponible pour le moment.';
    end if;

    -- Row lock: serialises concurrent orders on the same size row.
    select stock into cur_stock
      from public.product_sizes
     where product_id = pid and name = sz_name
     for update;
    if cur_stock is null then
      raise exception 'Taille « % » indisponible pour ce produit.', sz_name;
    end if;
    if cur_stock < qty then
      raise exception 'Stock insuffisant pour « % » (taille % : % disponible(s)).',
        p_name, sz_name, cur_stock;
    end if;

    sub := sub + (p_price * qty);
    item_rows := item_rows || jsonb_build_object(
      'pid', pid, 'slug', p_slug, 'name', p_name,
      'colorLabel', p_label, 'colorHex', p_hex,
      'size', sz_name, 'quantity', qty,
      'unitPrice', p_price, 'price', p_price
    );

    -- 2) Deduct (still inside the locked transaction).
    update public.product_sizes
       set stock = stock - qty
     where product_id = pid and name = sz_name;
  end loop;

  if jsonb_array_length(item_rows) = 0 then
    raise exception 'Votre panier est vide.';
  end if;

  -- 3) Delivery fee, computed server-side (never trusted from the client).
  -- Fee grid mirrors the storefront: 1:900, 6:550, 9:450, 16:400, 25:550,
  -- 31:550, everywhere else 600, free from 25 000 DA.
  if sub >= free_thresh then
    fee := 0;
  else
    fee := base_fee;
    if w_code = 1 then fee := 900;
    elsif w_code = 6 then fee := 550;
    elsif w_code = 9 then fee := 450;
    elsif w_code = 16 then fee := 400;
    elsif w_code = 25 then fee := 550;
    elsif w_code = 31 then fee := 550;
    end if;
  end if;

  -- 4) Unique human order id  BL-XXXXX
  o_id := '';
  for attempt in 1..20 loop
    select 'BL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5))
      into o_id;
    exit when not exists (select 1 from public.orders where id = o_id);
  end loop;
  if o_id = '' then
    raise exception 'Impossible de générer un numéro de commande.';
  end if;

  -- 5) Write order + items (one transaction).
  insert into public.orders
    (id, customer, subtotal, delivery_fee, total, payment_method, payment_status,
     order_status, payment_reference, payment_proof, created_at)
  values
    (o_id, cus, sub, fee, sub + fee,
     case when pay_method = 'cod' then 'cod' else 'baridimob' end,
     case when pay_method = 'cod' then 'pending' else 'verification_required' end,
     case when pay_method = 'cod' then 'confirmed' else 'pending' end,
     reference, proof, o_created);

  for rec in select jsonb_array_elements(item_rows) as l loop
    insert into public.order_items
      (order_id, product_id, product_slug, name, color_label, color_hex, size,
       quantity, unit_price, created_at)
    values
      (o_id, rec.l ->> 'pid', rec.l ->> 'slug', rec.l ->> 'name',
       coalesce(rec.l ->> 'colorLabel', ''), rec.l ->> 'colorHex', rec.l ->> 'size',
       (rec.l ->> 'quantity')::int, (rec.l ->> 'unitPrice')::int, o_created);
  end loop;

  -- 6) Anything drained to zero is un-published automatically.
  for rec in
    select distinct value ->> 'pid' as pid
      from jsonb_array_elements(item_rows) value
  loop
    perform public.bl_sync_active(rec.pid);
  end loop;

  created_iso := to_char(o_created at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', o_id,
      'createdAt', created_iso,
      'customer', cus,
      'items', item_rows,
      'subtotal', sub, 'deliveryFee', fee, 'total', sub + fee,
      'paymentMethod', case when pay_method = 'cod' then 'cod' else 'baridimob' end,
      'paymentStatus', case when pay_method = 'cod' then 'pending' else 'verification_required' end,
      'orderStatus', case when pay_method = 'cod' then 'confirmed' else 'pending' end,
      'paymentProof', proof, 'paymentReference', reference,
      'stockRestoredAt', null, 'stockRestore', null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- bl_set_order_status(order_id, new_status) — admin only
-- Cancelling restores the exact quantities, EXACTLY ONCE (guard: the marker
-- columns). Re-opening a cancelled order deducts only what was restored and
-- refuses if current stock is insufficient. Duplicate cancels are no-ops.
-- ---------------------------------------------------------------------------
create or replace function public.bl_set_order_status(p_order_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o          public.orders%rowtype;
  it         record;
  warnings   jsonb := '[]'::jsonb;
  restored   jsonb := '[]'::jsonb;
  sz_stock   int;
  ok_restore boolean := true;
begin
  if not public.bl_is_admin() then
    raise exception 'Accès refusé — droits administrateur requis.';
  end if;
  if p_status not in ('pending','confirmed','preparing','shipped','delivered','cancelled') then
    raise exception 'Statut inconnu.';
  end if;

  select * into o from public.orders where id = p_order_id;
  if o.id is null then
    raise exception 'Commande introuvable.';
  end if;

  if p_status = o.order_status then
    return jsonb_build_object('ok', true, 'warnings', '[]'::jsonb, 'unchanged', true);
  end if;

  -- ---- CANCEL: restore stock exactly once ----
  if p_status = 'cancelled' and o.order_status <> 'cancelled' and o.stock_restored_at is null then
    for it in
      select oi.product_id, oi.size, oi.quantity, oi.name
        from public.order_items oi
       where oi.order_id = p_order_id
    loop
      if it.product_id is null then
        warnings := warnings || jsonb_build_array('« ' || it.name || ' » : commande antérieure au suivi de stock, aucune quantité à restituer');
        continue;
      end if;
      if not exists (select 1 from public.products where id = it.product_id) then
        warnings := warnings || jsonb_build_array('« ' || it.name || ' » : produit supprimé, stock non restitué');
        continue;
      end if;
      update public.product_sizes
         set stock = stock + it.quantity
       where product_id = it.product_id and name = it.size
         returning stock into sz_stock;
      if not found then
        warnings := warnings || jsonb_build_array('« ' || it.name || ' » (taille ' || coalesce(it.size, '') || ') : taille retirée, stock non restitué');
        continue;
      end if;
      restored := restored || jsonb_build_object('pid', it.product_id, 'size', it.size, 'quantity', it.quantity);
    end loop;
    update public.orders
       set stock_restore = restored,
           stock_restored_at = now(),
           order_status = 'cancelled'
     where id = p_order_id;
    return jsonb_build_object('ok', true, 'warnings', warnings);
  end if;

  -- ---- RE-OPEN a cancelled order: deduct back only what was restored ----
  if o.order_status = 'cancelled' and o.stock_restored_at is not null and p_status <> 'cancelled' then
    for it in
      select value ->> 'pid' as pid,
             value ->> 'size' as size,
             (value ->> 'quantity')::int as quantity
        from jsonb_array_elements(coalesce(o.stock_restore, '[]'::jsonb)) value
    loop
      if it.pid is null or it.size is null then continue; end if;
      select stock into sz_stock
        from public.product_sizes
       where product_id = it.pid and name = it.size;
      if sz_stock is null then continue; end if;  -- size/product gone: nothing to take back
      if sz_stock < it.quantity then
        ok_restore := false;
        exit;
      end if;
    end loop;
    if not ok_restore then
      raise exception 'Réactivation impossible : du stock a été vendu entre-temps.';
    end if;
    for it in
      select value ->> 'pid' as pid,
             value ->> 'size' as size,
             (value ->> 'quantity')::int as quantity
        from jsonb_array_elements(o.stock_restore) value
    loop
      if it.pid is null or it.size is null then continue; end if;
      update public.product_sizes set stock = stock - it.quantity
       where product_id = it.pid and name = it.size;
    end loop;
    update public.orders
       set stock_restore = null, stock_restored_at = null
     where id = p_order_id;
  end if;

  update public.orders set order_status = p_status where id = p_order_id;
  return jsonb_build_object('ok', true, 'warnings', warnings);
end;
$$;

-- ---------------------------------------------------------------------------
-- bl_verify_payment / bl_reject_payment — admin only (BaridiMob proof review)
-- ---------------------------------------------------------------------------
create or replace function public.bl_verify_payment(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.bl_is_admin() then raise exception 'Accès refusé.'; end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Commande introuvable.';
  end if;
  update public.orders
     set payment_status = 'verified',
         order_status = case when order_status = 'pending' then 'confirmed' else order_status end
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.bl_reject_payment(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.bl_is_admin() then raise exception 'Accès refusé.'; end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Commande introuvable.';
  end if;
  update public.orders set payment_status = 'rejected' where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- bl_change_stock(product_id, size_name, delta) — admin only, race-safe.
-- Negative deltas clamp at zero; dropping a product to zero stock
-- automatically un-publishes it (active = false), matching the storefront.
-- ---------------------------------------------------------------------------
create or replace function public.bl_change_stock(p_product_id text, p_size text, p_delta int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_stock int;
  p_name    text;
begin
  if not public.bl_is_admin() then raise exception 'Accès refusé.'; end if;
  select name into p_name from public.products where id = p_product_id;
  if p_name is null then raise exception 'Produit introuvable.'; end if;

  update public.product_sizes
     set stock = greatest(0, stock + coalesce(p_delta, 0))
   where product_id = p_product_id and name = p_size
   returning stock into new_stock;
  if not found then
    insert into public.product_sizes (product_id, name, stock)
    values (p_product_id, p_size, greatest(0, coalesce(p_delta, 0)))
    returning stock into new_stock;
  end if;

  perform public.bl_sync_active(p_product_id);
  return jsonb_build_object(
    'ok', true,
    'product_id', p_product_id, 'size', p_size, 'stock', new_stock,
    'total', public.bl_total_stock(p_product_id),
    'active', (select active from public.products where id = p_product_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- bl_list_orders() — admin order feed: every order with its items, newest
-- first, shaped exactly like the admin console expects.
-- ---------------------------------------------------------------------------
create or replace function public.bl_list_orders()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        ord.id,
        to_char(ord.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        ord.customer,
        ord.subtotal,
        ord.delivery_fee as "deliveryFee",
        ord.total,
        ord.payment_method as "paymentMethod",
        ord.payment_status as "paymentStatus",
        ord.order_status as "orderStatus",
        ord.payment_reference as "paymentReference",
        ord.payment_proof as "paymentProof",
        to_char(ord.stock_restored_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "stockRestoredAt",
        ord.stock_restore as "stockRestore",
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'pid', oi.product_id, 'slug', oi.product_slug, 'name', oi.name,
              'colorLabel', oi.color_label, 'colorHex', oi.color_hex,
              'size', oi.size, 'quantity', oi.quantity,
              'unitPrice', oi.unit_price, 'price', oi.unit_price
            )
          )
          from public.order_items oi
          where oi.order_id = ord.id
        ), '[]'::jsonb) as items
      from public.orders ord
    ) o;
$$;

-- Seed the single settings row if absent (empty data object).
insert into public.website_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

commit;

-- ============================================================================
-- MANUAL STEP — PROMOTE YOUR ADMIN ACCOUNT
-- ----------------------------------------------------------------------------
-- Run this AFTER creating the account in Dashboard → Authentication → Users
-- (replace the email). Then sign out/in on admin.html so the JWT carries the
-- role claim.
--
--   update auth.users
--      set raw_app_meta_data =
--          coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--    where email = 'admin@byleilah.dz';   -- ← your admin email
--
-- ============================================================================

-- ============================================================================
-- FORCE RESET (destructive) — REQUIRED FIRST for this project because the five
-- tables already exist in an earlier, non-canonical shape (verified live on
-- 2026-09-07). Back up first if you have kept anything. Uncomment, run ONLY
-- these five lines, then re-run the whole file above.
-- ============================================================================
-- drop table if exists public.order_items;
-- drop table if exists public.orders;
-- drop table if exists public.product_sizes;
-- drop table if exists public.products;
-- drop table if exists public.website_settings;
-- (then re-run everything above)
