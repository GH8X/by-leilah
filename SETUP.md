# by Leïlah — Supabase production setup (manual steps)

The code is already wired. These are the **one-time manual steps** to make the
deployed site fully cloud-persistent. They require access to the Supabase
Dashboard — the app itself only ever uses the public (publishable) key.

Project used in this repository:
`https://xuibqryilladcqvjlxcd.supabase.co` — bucket `byleilah`.

---

## 1. Database + RLS + storage + server functions (5 minutes)

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the whole content of **`supabase/schema.sql`** (in this repository).
3. Run it. It is idempotent (safe to re-run) and creates/completes:
   - Tables: `products`, `product_sizes`, `orders`, `order_items`,
     `website_settings`
   - Row Level Security + minimum grants (`anon` read-only for the storefront)
   - Storage policies on bucket `byleilah` (public read; writes restricted to
     authenticated admins in `hero/` and `product-images/`)
   - Server functions: `bl_place_order` (atomic checkout), `bl_set_order_status`
     (cancel = exactly-once stock restore), `bl_verify_payment`,
     `bl_reject_payment`, `bl_change_stock`, `bl_list_orders`, role helper
     `bl_is_admin`

> The storefront loads products/sizes/settings **anonymously** and places
> orders through `bl_place_order` (RPC). Prices, stock and totals are always
> recomputed server-side — the browser never sends a price or a total.

## 2. Admin authentication (Supabase Auth) (5 minutes)

The old browser-only PIN gate has been replaced with Supabase Auth. Admins are
real users whose JWT carries `app_metadata.role = "admin"`.

1. **Dashboard → Authentication → Providers → Email**:
   - keep **“Allow new users to sign up” OFF** (accounts are created by you).
   - (Optional) confirm the confirmation-email settings you prefer.
2. **Dashboard → Authentication → Users → “Add user”**: create the admin
   account (email + password) for yourself.
3. Run the promotion SQL (SQL Editor) with your admin’s real email:

   ```sql
   update auth.users
      set raw_app_meta_data =
          coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
    where email = 'admin@byleilah.dz';   -- ← your admin email
   ```

4. Open `admin.html` → sign in with that email + password. (If you were already
   signed in, sign out once so the JWT carries the new role.)
5. If the store is empty, go to **Réglages → Migration → “Importer les données
   locales vers Supabase”**: it seeds the starter catalogue/orders into the
   cloud **only when the cloud is empty** (nothing is ever overwritten).

> Why `app_metadata.role`? Every table policy and storage policy checks
> `bl_is_admin()`, so a normal authenticated user — or an anonymous visitor —
> cannot write anything. There is no service-role key anywhere in the frontend.

## 3. Storage (already created)

Bucket **`byleilah`** is PUBLIC (read for every visitor). `schema.sql`
restricts every write to authenticated admins and to the app folders:
- `hero/home-hero.mp4` — the Home hero video (uploaded from
  Admin → **Vidéo d’accueil**; replacing it upserts the same object, so the
  public URL never changes):
  `https://xuibqryilladcqvjlxcd.supabase.co/storage/v1/object/public/byleilah/hero/home-hero.mp4`
- `product-images/…` — product photos uploaded directly from the product
  editor (JPG/JPEG/PNG/WEBP/SVG; SVG is sanitised client-side).

## 4. Website configuration

The public Supabase URL + publishable key are already in `supabase-config.js`
and are re-injected on every build (env vars `SUPABASE_URL` /
`SUPABASE_ANON_KEY` override them; the build refuses to ship a blank config).
No further frontend keys are needed.

## 5. What still needs you (optional)

- **Emails/SMS/WhatsApp order notifications** — not wired yet; a transactional
  email/SMS service can be added to `bl_place_order` via a Supabase webhook or
  an Edge Function.
- **Online payment** — the store ships with Cash-on-Delivery + BaridiMob
  (manual proof review in the Admin). An online PSP would be a separate
  integration.

## 6. Security checklist (what the app does)

- `anon`: SELECT only (published products, sizes, public settings) + execute
  `bl_place_order`. No INSERT/UPDATE/DELETE anywhere.
- `authenticated` non-admin: no table privileges beyond SELECT on the same
  public tables (no role claim → policies deny writes).
- Admins: identified by the signed JWT role claim; RLS + storage policies
  enforce it server-side.
- The hero object is replaced/removed only after the new upload succeeded.
- No `service_role`/secret anywhere in HTML/JS/CSS; only URL + publishable key.
