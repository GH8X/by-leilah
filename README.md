# by Leïlah

Premium women's fashion & pajamas storefront for the Algerian market — feminine, editorial, and elegant. Built as a fast, fully client-side React application with a manual (no-API) payment flow suited to a first launch.

- **Languages:** Arabic (RTL), French, English — French is the default.
- **Currency & delivery:** Algerian Dinar (DZD), all 58 wilayas, cash on delivery + manual BaridiMob.
- **No backend required to run.** Orders, cart, and wishlist persist in the browser (`localStorage`). A demo admin console lets the shop owner verify BaridiMob proofs by hand.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Build tool | Vite 5 |
| UI | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS v3 (custom warm-neutral design tokens) |
| Animation | Framer Motion 11 (reduced-motion aware) |
| Routing | React Router v6 (route-based code splitting) |
| Icons | lucide-react |
| Type system | Cormorant Garamond (editorial serif) + Jost (utility sans) |

---

## Getting started

Requires **Node.js 18+** (Node 20 or 22 recommended) and npm.

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. Type-check + production build (outputs to dist/)
npm run build

# 4. Preview the production build locally
npm run preview
```

Additional scripts:

```bash
npm run typecheck   # tsc --noEmit only (no bundle)
```

> The production `build` script runs `tsc --noEmit` first, so a type error fails the build.

---

## Project structure

```
src/
  components/      UI: layout, home sections, product, shop, cart, checkout, ui primitives
  config/          store.ts — brand + BaridiMob display placeholders (EDIT BEFORE LAUNCH)
  context/         Cart, Wishlist, Language (i18n), Orders, UI — all React context providers
  data/            products, categories, wilayas (58), delivery fees, mock orders, lookbook
  hooks/           useLocalStorage, useMediaQuery, useScrolled
  i18n/            translations.ts — every UI string in ar / fr / en
  lib/             format (DZD, dates), motion presets, class helpers, shop filtering
  pages/           Home, Shop, category templates, Product, Bag, Checkout, OrderSuccess, Admin, 404
  types/           domain types (Product, Order, CartItem, …)
  App.tsx          route table (storefront under shared Layout; /admin standalone)
  main.tsx         provider tree + app mount
public/            favicon
```

Routes: `/`, `/shop`, `/pajamas`, `/clothing`, `/shoes`, `/handbags`, `/complete-looks`, `/product/:slug`, `/lookbook`, `/about`, `/wishlist`, `/bag`, `/checkout`, `/order-success`, `/admin`, and a catch-all 404.

---

## Payments — read this before going live

This first version uses **manual payment verification only**. There is intentionally **no BaridiMob API integration and no automatic payment processing** — that keeps sensitive credentials out of the frontend entirely.

How it works:

1. At checkout the customer picks **Cash on Delivery** or **BaridiMob**.
2. For BaridiMob, the app shows your transfer details and the customer uploads a proof screenshot. **Only the file's metadata (name, type, size) is stored — never the file bytes and never card/bank data.**
3. New BaridiMob orders start as **"Payment verification pending"** and are **never marked paid automatically**.
4. The shop owner opens **`/admin`**, reviews each proof by hand, and marks the payment **verified** or **rejected**. Verifying confirms the order.

### Go-live checklist

Replace the bracketed placeholders (they are deliberately fake) before launching:

- **`src/config/store.ts`** → `STORE` (legal name, phone, WhatsApp, email) and `BARIDIMOB` (`storeName`, `paymentInformation`, `accountInformation` / RIP, `qrCode`, `phone`).
- **`src/config/store.ts`** → `SOCIAL_LINKS` — swap each `url: '#'` for your real Instagram / TikTok / Facebook profile.
- **`src/data/deliveryFees.ts`** → set the real per-wilaya delivery fees and the free-delivery threshold.
- **Product catalogue & imagery** → `src/data/products.ts`. Products ship with deterministic editorial placeholder art; add real image paths to each product's `images` array when available.
- **Going persistent** → orders currently live in `localStorage`. To share orders across devices/admins, wire the Orders context to a backend (e.g. Supabase or Firebase). The `/admin` console and order model are structured to make that swap straightforward.

Security notes baked into this project: no secret keys or payment credentials in source, no invented APIs or URLs, and no sensitive payment data persisted client-side.

---

## Internationalization

All copy is read through `useT()` (UI strings) and `tt()` (localized data such as product descriptions). Switching to Arabic sets `dir="rtl"` on `<html>`; the layout uses logical CSS utilities throughout so it mirrors correctly. Add or edit strings in `src/i18n/translations.ts`.

---

## Deployment

`npm run build` produces a static `dist/` folder — deploy it to any static host (Vercel, Netlify, Cloudflare Pages, etc.). Because the app uses client-side routing, configure the host to **rewrite all paths to `/index.html`** (SPA fallback) so deep links like `/product/...` resolve.
