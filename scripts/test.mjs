#!/usr/bin/env node
/**
 * by Leïlah — functional regression tests for the store/order engine (store.js).
 * Runs the data layer in a Node vm with an in-memory localStorage.
 *   node scripts/test.mjs      (or: npm test)
 * Covers the order↔stock integration and the regressions fixed in store.js:
 *   - cancel always sets the order status + persists the restore marker
 *     (no double stock restore after reload, no stuck "active" orders)
 *   - reactivation deducts exactly the quantities that were restored
 *   - order lines store per-unit price (display = price × quantity)
 *   - setCartQty removes lines clamped to zero stock
 *   - historical orders are never rewritten by product edits/deletes
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = process.cwd();
const src = readFileSync(new URL("../store.js", import.meta.url), "utf8");

let passed = 0, failed = 0;
const failures = [];
function t(name, cond) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; failures.push(name); console.log("  ✖", name); }
}

/* ---- harness ---------------------------------------------------------- */
function makeLS() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
/* Fake XMLHttpRequest so the cloud hero-video upload/remove paths can be
 * exercised in Node: captures the request and resolves onload synchronously. */
class FakeXHR {
  constructor() {
    this.headers = {};
    this.upload = {};
    this.status = FakeXHR.nextStatus || 200;
    this.responseText = "{}";
    FakeXHR.nextStatus = 0;
    FakeXHR.instances.push(this);
  }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  send(body) { this.body = body; if (this.onload) this.onload(); }
}
FakeXHR.instances = [];
FakeXHR.nextStatus = 0;

function loadBL(ls, winExtra) {
  const ctx = {
    window: Object.assign({ ADMIN_PIN_ENV: "" }, winExtra),
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console, URL: { createObjectURL: () => "blob:test" },
    XMLHttpRequest: FakeXHR,
    navigator: {}, document: { createElement: () => ({}) },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.BL;
}
/* read what is actually on "disk" (bypasses the in-memory dbCache) */
function persistedOrder(ls, id) {
  const raw = ls.getItem("bl.db.v1");
  const db = raw ? JSON.parse(raw) : null;
  return db && db.orders ? db.orders.find((x) => x.id === id) : null;
}
const orderArgs = {
  firstName: "Amina", lastName: "Test", phone: "0555123456",
  commune: "Hydra", address: "1 rue des tests", notes: "",
};
const orderOpts = { wilayaCode: 16, method: "cod" }; // wilaya 16 → fee 400 DA

/* ======================================================================
 * 1. Order → stock deduction + per-unit price snapshot (bug 2 regression)
 * ====================================================================== */
console.log("Order → stock integration:");
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-001"); // 24 units across XS..XL (5 sizes)
  const before = BL.totalStock(p);
  BL.addToCart(p, { size: "M", qty: 2, colorLabel: "Champagne" });
  const o = BL.createOrder(orderArgs, orderOpts);
  t("order created", o.ok);
  t("stock deducted by ordered qty", BL.totalStock(BL.getProduct("bl-001")) === before - 2);
  t("cart emptied after order", BL.cartView().length === 0);
  const line = o.order.items[0];
  t("line stores per-unit price", line.price === p.price);
  t("line stores unitPrice too", line.unitPrice === p.price);
  t("rendered total (price × quantity) is the real line total", line.price * line.quantity === p.price * 2);
  t("order subtotal matches items", o.order.subtotal === p.price * 2);
}

/* 2. Draining stock auto-flips to Out of Stock */
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-011"); // seed stock 0
  t("zero-stock product not available", BL.isAvail(p) === false);
  const p2 = BL.getProduct("bl-006"); // 6 units across 5 sizes [2,1,1,1,1]
  p2.sizes.forEach((sz) => BL.addToCart(p2, { size: sz.name, qty: sz.stock, colorLabel: "Champagne" }));
  const o = BL.createOrder(orderArgs, orderOpts);
  t("drain-order created", o.ok);
  t("product flipped to unavailable at zero", BL.getProduct("bl-006").available === false);
  t("adding to out-of-stock product blocked", BL.addToCart(BL.getProduct("bl-006"), { size: "M", qty: 1, colorLabel: "Champagne" }).ok === false);
}

/* 3. Over-ordering is impossible (add-time rejection + checkout clamp) */
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-001");
  const sStock = BL.sizeStock(p, "S"); // 5
  const r = BL.addToCart(p, { size: "S", qty: sStock + 1, colorLabel: "Champagne" });
  t("over-order rejected at add time", r.ok === false);
  // stock shrinks between add and checkout (e.g. another order took 3 units)
  BL.addToCart(p, { size: "S", qty: sStock, colorLabel: "Champagne" });
  BL.setStock(p.id, "S", -(sStock - 2)); // 5 → 2 left
  const o = BL.createOrder(orderArgs, orderOpts);
  t("checkout clamps to the available qty (never over-orders)", o.ok === true && o.order.items[0].quantity === 2);
  t("clamped qty deducted from stock, never negative", BL.sizeStock(p, "S") === 0);
}

/* ======================================================================
 * 4. Cancel → status set + restore persisted (bug 1 regression)
 * ====================================================================== */
console.log("Cancel / restore:");
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-001");
  BL.addToCart(p, { size: "M", qty: 3, colorLabel: "Champagne" });
  const o = BL.createOrder(orderArgs, orderOpts).order;
  const stockAfterOrder = BL.totalStock(BL.getProduct("bl-001"));
  const r = BL.setOrderStatus(o.id, "cancelled");
  t("cancel ok", r.ok === true);
  const ord = BL.findOrder(o.id);
  t("status is cancelled", ord.orderStatus === "cancelled");
  t("restore marker set in memory", ord.stockRestoredAt !== null);
  const persisted = persistedOrder(ls, o.id);
  t("status + marker written to disk (survives reload)", persisted && persisted.orderStatus === "cancelled" && !!persisted.stockRestoredAt);
  t("stock restored exactly once", BL.totalStock(BL.getProduct("bl-001")) === stockAfterOrder + 3);
}

/* 5. Cancel with a deleted line + reload: no double restore (bug 1) */
{
  const ls = makeLS(), BL = loadBL(ls);
  const pa = BL.getProduct("bl-001"), pb = BL.getProduct("bl-002");
  BL.addToCart(pa, { size: "S", qty: 1, colorLabel: "Champagne" });
  BL.addToCart(pb, { size: "M", qty: 2, colorLabel: "Noir" });
  const o = BL.createOrder(orderArgs, orderOpts).order;
  const pbAfter = BL.totalStock(pb);
  BL.deleteProduct("bl-001");
  const r = BL.setOrderStatus(o.id, "cancelled");
  t("cancel ok with warning", r.ok === true && Array.isArray(r.warnings) && r.warnings.length === 1);
  t("warning names the deleted product", /produit supprimé/.test(r.warnings[0]));
  t("status cancelled even with warnings", BL.findOrder(o.id).orderStatus === "cancelled");
  t("surviving line restored once", BL.totalStock(BL.getProduct("bl-002")) === pbAfter + 2);
  /* reload = fresh BL instance over the same localStorage */
  const BL2 = loadBL(ls);
  t("after reload order is still cancelled", BL2.findOrder(o.id).orderStatus === "cancelled");
  const r2 = BL2.setOrderStatus(o.id, "cancelled");
  t("second cancel is a no-op", r2.ok === true && BL2.findOrder(o.id).orderStatus === "cancelled");
  t("no double restore after reload", BL2.totalStock(BL2.getProduct("bl-002")) === pbAfter + 2);
}

/* 6. Reactivation after partial restore deducts only what was restored */
{
  const ls = makeLS(), BL = loadBL(ls);
  const pa = BL.getProduct("bl-001"), pb = BL.getProduct("bl-002");
  BL.addToCart(pa, { size: "S", qty: 1, colorLabel: "Champagne" });
  BL.addToCart(pb, { size: "M", qty: 1, colorLabel: "Noir" });
  const o = BL.createOrder(orderArgs, orderOpts).order;
  BL.deleteProduct("bl-001");
  BL.setOrderStatus(o.id, "cancelled");
  const afterCancel = BL.totalStock(BL.getProduct("bl-002"));
  const r = BL.setOrderStatus(o.id, "preparing"); // reactivate
  t("reactivation succeeds despite deleted line", r.ok === true);
  t("reactivation status applied", BL.findOrder(o.id).orderStatus === "preparing");
  t("reactivation deducted restored qty only", BL.totalStock(BL.getProduct("bl-002")) === afterCancel - 1);
  t("restore marker cleared", BL.findOrder(o.id).stockRestoredAt === null);
  BL.setOrderStatus(o.id, "cancelled");
  t("second cancel restores again (symmetric)", BL.totalStock(BL.getProduct("bl-002")) === afterCancel);
}

/* 7. Seed orders (no pid) cancel cleanly: status set, nothing restored */
{
  const ls = makeLS(), BL = loadBL(ls);
  const seed = BL.db().orders.find((x) => x.id === "BL-3XR9T");
  const stockBefore = BL.getProducts().reduce((a, p) => a + BL.totalStock(p), 0);
  const r = BL.setOrderStatus(seed.id, "cancelled");
  t("seed order cancel ok", r.ok === true);
  t("seed order status cancelled", BL.findOrder(seed.id).orderStatus === "cancelled");
  t("seed cancel warns about pre-stock-tracking order", r.warnings && /antérieure au suivi de stock/.test(r.warnings.join(" ")));
  const stockAfter = BL.getProducts().reduce((a, p) => a + BL.totalStock(p), 0);
  t("seed cancel restores nothing (stock never deducted)", stockAfter === stockBefore);
  t("no restore marker for seed order", BL.findOrder(seed.id).stockRestoredAt === null);
  const r2 = BL.setOrderStatus(seed.id, "delivered"); // reactivate
  t("seed reactivation works", r2.ok === true && BL.findOrder(seed.id).orderStatus === "delivered");
}

/* ======================================================================
 * 8. setCartQty never leaves a zero-quantity line (bug 3 regression)
 * ====================================================================== */
console.log("Cart clamps:");
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-006");
  BL.addToCart(p, { size: "XS", qty: 1, colorLabel: "Champagne" });
  BL.setStock(p.id, "XS", -10); // XS → 0
  BL.setCartQty("bl-006|Champagne|XS", 3); // bump while stock is 0
  t("zero-stock line removed from cart", BL.cartView().length === 0);
  // clamp qty > stock → capped, still present
  const p2 = BL.getProduct("bl-001");
  BL.addToCart(p2, { size: "S", qty: 1, colorLabel: "Champagne" });
  BL.setCartQty("bl-001|Champagne|S", 999);
  const view = BL.cartView();
  t("qty capped to stock", view.length === 1 && view[0].qty === BL.sizeStock(p2, "S"));
  BL.setCartQty("bl-001|Champagne|S", 0);
  t("dec to zero removes the line", BL.cartView().length === 0);
}

/* ======================================================================
 * 9. Historical orders immutable under product edits/deletes
 * ====================================================================== */
console.log("History immutability:");
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-001");
  BL.addToCart(p, { size: "M", qty: 1, colorLabel: "Champagne" });
  const o = BL.createOrder(orderArgs, orderOpts).order;
  BL.upsertProduct({ id: p.id, name: "Renamed Pyjama", cat: p.cat, price: 1, oldPrice: null, desc: "", colors: p.colors, sizes: p.sizes, images: p.images, available: true });
  const h = BL.findOrder(o.id);
  t("order item name unchanged after rename", h.items[0].name === "Satin Signature Pyjama");
  t("order item price unchanged after reprice", h.items[0].price === 12900);
  t("order total unchanged", h.total === 12900 + 400);
  const seed = BL.db().orders.find((x) => x.id === "BL-2FDP6");
  t("seed order untouched by product edits", seed.items[0].price === 13900 && seed.total === 24350);
}

/* ======================================================================
 * 10. Availability guard (admin cannot enable a zero-stock product)
 * ====================================================================== */
console.log("Availability guard:");
{
  const ls = makeLS(), BL = loadBL(ls);
  const p = BL.getProduct("bl-011"); // stock 0
  const r = BL.setAvailable(p.id, true);
  t("cannot set available with zero stock", r.ok === false);
  BL.setStock(p.id, "XS", 2);
  const r3 = BL.setAvailable(p.id, true);
  t("can set available after stock added", r3.ok === true);
  BL.setStock(p.id, "XS", -10);
  t("stock decrease clamps at zero", BL.sizeStock(p, "XS") === 0);
}

/* ======================================================================
 * 11. Settings persistence with env PIN (regression)
 * settings() returns a COPY when VITE_ADMIN_PIN is active, so admin
 * mutations must be passed explicitly to saveSettings or they are lost.
 * ====================================================================== */
console.log("Settings persistence (env PIN active):");
{
  const ls = makeLS();
  const ctx = {
    window: { ADMIN_PIN_ENV: "my-secret-pin" },
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console, URL: { createObjectURL: () => "blob:test" },
    navigator: {}, document: { createElement: () => ({}) },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const BL = ctx.window.BL;

  /* admin mutates theme + hero URL like the settings handlers do */
  const s = BL.settings();
  s.theme = { defaultTheme: "dark", allowSwitch: false };
  s.heroVideoUrl = "https://cdn.example.com/hero.mp4";
  s.contact = { title: "Test Contact" };
  BL.saveSettings(s);

  /* fresh load must see the persisted values */
  const ls2 = makeLS();
  const raw = ls.getItem("bl.settings.v1");
  ls2.setItem("bl.settings.v1", raw);
  const ctx2 = {
    window: { ADMIN_PIN_ENV: "my-secret-pin" },
    localStorage: ls2,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console, URL: { createObjectURL: () => "blob:test" },
    navigator: {}, document: { createElement: () => ({}) },
  };
  vm.createContext(ctx2);
  vm.runInContext(src, ctx2);
  const BL2 = ctx2.window.BL;
  t("theme persisted with env PIN", BL2.getThemeSettings().defaultTheme === "dark" && BL2.getThemeSettings().allowSwitch === false);
  t("hero URL persisted with env PIN", BL2.heroVideoUrl() === "https://cdn.example.com/hero.mp4");
  t("contact persisted with env PIN", BL2.getContact().title === "Test Contact");
  /* env PIN must NOT be written to localStorage */
  const stored = JSON.parse(ls.getItem("bl.settings.v1"));
  t("env PIN not persisted to storage", stored.pin !== "my-secret-pin" && stored.pin === undefined);

  /* hero video: public-URL resolution — never blob:/localhost, always derived
   * from the cloud storage config when nothing else is set */
  const BL3 = loadBL(makeLS());
  t("no public URL when nothing is configured", BL3.heroVideoUrl() === "");
  t("heroVideoUrl is never a blob:", BL3.heroVideoUrl().indexOf("blob:") !== 0);

  const ls4 = makeLS();
  ls4.setItem("bl.settings.v1", JSON.stringify({ heroVideoUrl: "hero-video.mp4" }));
  const BL4 = loadBL(ls4);
  t("legacy static-path default migrated away", BL4.heroVideoUrl() === "" && BL4.settings().heroVideoUrl === "");

  const DERIVED = "https://xyzcompany.supabase.co/storage/v1/object/public/byleilah/hero/home-hero.mp4";
  const ls5 = makeLS();
  ls5.setItem("bl.settings.v1", JSON.stringify({ heroVideoUrl: "", supabase: { url: "https://xyzcompany.supabase.co/", anonKey: "anon-123" } }));
  const BL5 = loadBL(ls5);
  t("derived public URL from supabase config", BL5.heroVideoUrl() === DERIVED);

  ls5.setItem("bl.settings.v1", JSON.stringify({ heroVideoUrl: "blob:fake", supabase: { url: "https://xyzcompany.supabase.co", anonKey: "anon-123" } }));
  t("blob: override rejected — derived URL used", loadBL(ls5).heroVideoUrl() === DERIVED);
  ls5.setItem("bl.settings.v1", JSON.stringify({ heroVideoUrl: "http://localhost:3000/v.mp4", supabase: { url: "https://xyzcompany.supabase.co", anonKey: "anon-123" } }));
  t("localhost override rejected — derived URL used", loadBL(ls5).heroVideoUrl() === DERIVED);

  const BL8 = loadBL(makeLS(), { BL_SUPABASE: { url: "https://built.supabase.co", anonKey: "built-key" } });
  t("build-injected config wins over settings", BL8.heroVideoUrl() === "https://built.supabase.co/storage/v1/object/public/byleilah/hero/home-hero.mp4");

  /* cloud upload: PUT to the fixed object path with upsert + auth headers */
  FakeXHR.instances.length = 0;
  const BL9 = loadBL(ls5);
  const pubUrl = await BL9.supabaseUploadHero({ type: "video/mp4", size: 100 }, () => {});
  const up = FakeXHR.instances[FakeXHR.instances.length - 1];
  t("upload PUTs to the fixed public object path", up && up.method === "PUT" && up.url === "https://xyzcompany.supabase.co/storage/v1/object/byleilah/hero/home-hero.mp4");
  t("upload sends upsert + bearer auth headers", up && up.headers["x-upsert"] === "true" && up.headers["Authorization"] === "Bearer anon-123" && up.headers["apikey"] === "anon-123");
  t("upload resolves to the stable public URL", pubUrl === DERIVED);

  /* failed upload rejects → never marked active */
  FakeXHR.nextStatus = 400;
  FakeXHR.instances.length = 0;
  let uploadRejected = false;
  try { await loadBL(ls5).supabaseUploadHero({ type: "video/mp4" }, () => {}); } catch (e) { uploadRejected = true; }
  t("failed upload rejects (never marked active)", uploadRejected);

  /* remove: DELETEs the cloud object */
  FakeXHR.instances.length = 0;
  await loadBL(ls5).supabaseRemoveHero();
  const del = FakeXHR.instances[FakeXHR.instances.length - 1];
  t("remove DELETEs the cloud object", del && del.method === "DELETE" && del.url === "https://xyzcompany.supabase.co/storage/v1/object/byleilah/hero/home-hero.mp4");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
