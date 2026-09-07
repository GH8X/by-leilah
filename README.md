# by Leïlah — Boutique en ligne

Premium women's fashion & pyjamas e-commerce site (by Leïlah, Algeria).
Pure static site (HTML + CSS + vanilla JS) with **no build step required to run**.
The persistent source of truth is **Supabase** (`cloud.js` + `store.js`): products,
per-size stock, orders, order statuses and website settings live in the cloud
(`products`, `product_sizes`, `orders`, `order_items`, `website_settings`), while the
browser `localStorage` mirror is only a fast cache/offline fallback. Setup = one
SQL file + one admin account — see **SETUP.md**.

## Pages

| Page             | File          | Description                                                    |
| ---------------- | ------------- | -------------------------------------------------------------- |
| Home             | `index.html`  | Hero (optional admin-managed video), dynamic catalogue         |
| Shop             | `shop.html`   | Catalogue listing — search + category filters                  |
| Product          | `product.html`| Product detail — images, sizes, stock-aware add-to-cart        |
| Bag              | `bag.html`    | Cart with live stock revalidation                              |
| Checkout         | `checkout.html`| Delivery (58 wilayas) + payment, creates the order            |
| Admin            | `admin.html`  | Dashboard, stock management, orders, home-hero video manager   |

Shared assets: `store.js` (data layer), `admin-app.js` (admin logic), `bl.css` (shop/bag styling),
`supabase-config.js` (public Supabase project URL + anon key — regenerated into `dist/` by the build).

## How the data layer works

`store.js` exposes a single `window.BL` API used by every page:

- **Products** — 33 seeded items (id, slug, name, category, price, old price, colors,
  sizes with per-size stock, images, description, availability). All mutation APIs
  (`upsertProduct`, `deleteProduct`, `setStock`, `setAvailable`) are admin-only.
- **Orders** — every order stores an immutable snapshot (product name, unit price,
  quantity, colour/size, customer, date, payment + order status) at creation time.
  Later price/name edits **never** rewrite history.
- **Stock ↔ orders** — `createOrder()` validates the whole cart against live stock
  (product available, size exists, requested quantity ≤ stock), then atomically
  deducts stock, auto-flips products to **Out of Stock** when a size hits 0, and
  empties the cart. Over-ordering is rejected on add-to-cart *and* at checkout.
- **Cancellations** — when an order is set to `cancelled`, its quantities are restored
  to the matching product/size (when the product or size still exists); reactivating a
  cancelled order re-deducts if enough stock remains. The order history itself never changes.
- **Cart** — persists per browser and is re-validated live on every page view.
- **Home-hero video** — uploaded from Admin → **Supabase Storage** (`byleilah` bucket,
  fixed object `hero/home-hero.mp4` → stable public HTTPS URL read by every visitor,
  no export/copy/redeploy needed). Only if no cloud storage is configured does the
  upload fall back to a browser-local blob so the admin can still preview locally;
  the silk-art hero remains the graceful fallback for everyone until a video is
  published. Type/size validation, preview, replace and remove are handled in the
  Admin panel only.

**Production architecture (cloud-first)**: every page loads `cloud.js`, which
synchronises the Supabase catalogue/settings into the local mirror before first paint
(`BL.whenReady`). Checkout calls the atomic server function `bl_place_order` — prices,
stock and totals are validated and applied inside one database transaction, so two
simultaneous customers can never oversell the same size. The Admin console writes
products/stock/orders/settings/hero-video straight to Supabase and only updates the
local mirror after the server confirms. If Supabase is unreachable or not configured,
the site degrades to its local demo data rather than showing fake successes.

## Admin access

Open `admin.html` — the console is protected by **Supabase Auth** (e-mail +
password). The old browser-only PIN gate is gone: an admin is a real Supabase user
whose account carries the `admin` role claim (`app_metadata.role = "admin"`), which
every RLS and storage policy checks server-side.

- Create the account in **Supabase → Authentication → Users** (sign-ups disabled),
  then promote it with the SQL shown in `supabase/schema.sql` / `SETUP.md`.
- After sign-in, the dashboard synchronises products, stock, orders and settings
  from Supabase; each save is written to the cloud before the UI confirms it.
- Use **Réglages → Migration** to import the starter catalogue/orders already
  present in your browser into an empty cloud (nothing is overwritten).

The Admin includes: dashboard statistics (products in/out of stock, orders by
status), full stock management (add/edit/delete/search/filter, per-size quantity
controls, availability, direct image upload), order lifecycle (verify payment,
confirm, ship, deliver, cancel with exactly-once stock restoration), website
settings (contact, about, socials — stored in `website_settings`), and the Home
Hero video manager (authenticated upload → fixed public object).

## Supabase public config

`supabase-config.js` ships the **project URL + anon (publishable) key** — public-by-design
values that are safe in client code and are what the hero video URL is derived from
(`<url>/storage/v1/object/public/byleilah/hero/home-hero.mp4`).

- The build (`node scripts/build.mjs`) regenerates `dist/supabase-config.js` from the
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars (`NEXT_PUBLIC_*` aliases accepted). If those
  are unset, it keeps the values checked into the source file — a production build never
  ships a blank config.
- Never put a service-role / secret key in this file or anywhere in the frontend.
- One-time setup: run `supabase/schema.sql` in the SQL editor (tables + RLS + admin
  role + storage policies + atomic order/stock functions) and follow `SETUP.md` to
  create/promote the admin account. Storage writes are scoped to authenticated
  admins (folders `hero/` and `product-images/`); public visitors only read.

## Run locally

```bash
# Option A — plain static files (no install required)
python3 -m http.server 5173     # then open http://localhost:5173

# Option B — with Vite
npm install / bun install
bun run dev                     # or: npm run dev
```

## Checks, tests & production build

```bash
node scripts/check.mjs     # syntax-checks every script + verifies page links
node scripts/test.mjs      # functional tests of the order/stock engine (npm test)
node scripts/test-cloud.mjs # cloud layer: auth session, catalog sync, RPC (npm run test:cloud)
node scripts/test-dom.mjs  # DOM smoke test of the home page (npm run test:dom)
node scripts/build.mjs     # copies the static site (HTML/JS/CSS) into dist/
bun run build              # same as above
```

`npm test` / `bun run test` runs the order↔stock regression suite in Node
(stock deduction, over-order protection, cancel/reactivate restore semantics,
per-unit order prices, history immutability).

Deploy anything inside `dist/` to any static host (Netlify, Vercel, GitHub Pages, …).

## Layout / design

Dark-ink editorial palette, silk-gradient artwork (deterministic placeholders painted
client-side), Cormorant Garamond + Jost, responsive grid. French is the default
language with EN/AR toggle on the home page; the storefront (shop/bag/product/checkout)
is French, consistent with the seed copy.
