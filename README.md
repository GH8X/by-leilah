# by Leïlah — Boutique en ligne

Premium women's fashion & pyjamas e-commerce site (by Leïlah, Algeria).
Pure static site (HTML + CSS + vanilla JS) with **no build step required to run** —
the catalogue, orders, cart and admin configuration persist in the visitor's browser
(`localStorage` + IndexedDB) through the shared data layer `store.js`.

## Pages

| Page             | File          | Description                                                    |
| ---------------- | ------------- | -------------------------------------------------------------- |
| Home             | `index.html`  | Hero (optional admin-managed video), dynamic catalogue         |
| Shop             | `shop.html`   | Catalogue listing — search + category filters                  |
| Product          | `product.html`| Product detail — images, sizes, stock-aware add-to-cart        |
| Bag              | `bag.html`    | Cart with live stock revalidation                              |
| Checkout         | `checkout.html`| Delivery (58 wilayas) + payment, creates the order            |
| Admin            | `admin.html`  | Dashboard, stock management, orders, home-hero video manager   |

Shared assets: `store.js` (data layer), `admin-app.js` (admin logic), `bl.css` (shop/bag styling).

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
- **Home-hero video** — uploaded from Admin, stored as a blob in IndexedDB + meta in
  `localStorage`, so it survives refreshes/restarts/logins; when no video is set the
  original silk-art hero shows. Type/size validation, preview, replace and remove are
  handled in the Admin panel only.

**Important**: this is a client-side store — data lives in the *admin's* browser
(`localStorage` keys `bl.db`, `bl.settings`, etc.). Deploy to a single always-on admin
device to manage stock, or point an admin at the same browser profile. There is no
server database in this static deployment.

## Admin access

Open `admin.html` and enter the PIN. **There is no hardcoded default code** — the
PIN comes from the `VITE_ADMIN_PIN` environment variable (also accepted: `ADMIN_PIN`):

- **With Vite** (`bun run dev` / `npm run dev`): Vite replaces `%VITE_ADMIN_PIN%`
  directly in `admin.html`, so define the var in your shell or in `.env.local`
  (e.g. `VITE_ADMIN_PIN=your-code`).
- **Static build** (`node scripts/build.mjs`): the build injects the value of
  `VITE_ADMIN_PIN`/`ADMIN_PIN` from the environment into `dist/admin.html`.
- **If the variable is unset**: the admin console generates a random 6-digit
  provisional code on first use and shows it on the login screen; it is stored
  per-browser and can be changed later in the dashboard "Admin" section. Setting
  `VITE_ADMIN_PIN` afterwards locks the console to that code (the "Admin" section
  then only shows a note — the code must be changed via the env var).

The Admin includes: dashboard statistics (products in/out of stock, orders by
status), full stock management (add/edit/delete/search/filter, per-size quantity
controls, availability), order lifecycle (verify payment, confirm, ship, deliver,
cancel with stock restoration), and the Home Hero video manager.

> Note: like everything else in this static deployment, the PIN check runs in the
> browser — it stops casual/accidental access, not a determined attacker. For
> real protection, put the admin panel behind server-side auth.

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
node scripts/check.mjs   # syntax-checks every script + verifies page links
node scripts/test.mjs    # functional tests of the order/stock engine (npm test)
node scripts/build.mjs   # copies the static site (HTML/JS/CSS) into dist/
bun run build            # same as above
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
