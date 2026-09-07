#!/usr/bin/env node
/**
 * by Leïlah — cloud-layer unit tests (cloud.js on top of store.js)
 * Runs both files in a Node vm with a stubbed fetch/localStorage, so no real
 * network or Supabase project is needed:
 *   node scripts/test-cloud.mjs      (or: npm run test:cloud)
 * Covers:
 *   - public config detection (url + publishable key)
 *   - signIn → session persisted, admin role decoded from the JWT payload
 *   - anon catalog sync: rows hydrated (category/price/sizes), unpublished
 *     products excluded, website_settings merged into the local mirror
 *   - checkout RPC: correct argument wrapping ("payload") + order passthrough
 *   - admin product save: canonical row mapping + sizes replaced atomically
 *   - settings write is only attempted with an admin session
 *   - signOut clears the session
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = process.cwd();
const storeSrc = readFileSync(new URL("../store.js", import.meta.url), "utf8");
const cloudSrc = readFileSync(new URL("../cloud.js", import.meta.url), "utf8");

let passed = 0, failed = 0;
const failures = [];
function t(name, cond) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; failures.push(name); console.log("  ✖", name); }
}

/* ---------- helpers ---------- */
function makeLS() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
class FakeXHR {
  constructor() { this.headers = {}; this.upload = {}; }
  open() {} setRequestHeader(k, v) { this.headers[k] = v; } send() { if (this.onload) this.onload(); }
}
/* minimal JWT with the claims we need */
function jwt(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return enc({ alg: "HS256", typ: "JWT" }) + "." + enc(claims) + "." + enc({});
}
function jsonRes(data, status = 200, extra = {}) {
  const hdrs = Object.assign({}, extra, { "content-type": "application/json" });
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => hdrs[n] || hdrs[n.toLowerCase()] || "" },
    json: () => Promise.resolve(data),
  };
}

/* fetch stub: routes by url fragment */
function makeFetch(calls) {
  const cfg = { url: "https://x.supabase.co", anonKey: "publish-key" };
  const tables = {
    products: [
      { id: "bl-x", slug: "nuit-test", name: "Nuit Test", description: "d", category: "pajamas", price: 15000, old_price: null, badge: null, active: true, colors: [], images: [], tone: "champagne", mono: "N", created_at: "2026-01-01T00:00:00Z" },
      { id: "bl-draft", slug: "draft", name: "Draft Cache", description: "d", category: "clothing", price: 100, old_price: null, badge: null, active: false, colors: [], images: [], tone: "espresso", mono: "D", created_at: "2026-01-02T00:00:00Z" },
    ],
    sizes: [{ product_id: "bl-x", name: "M", stock: 2 }, { product_id: "bl-x", name: "S", stock: 1 }],
    settings: [{ id: 1, data: { contact: { title: "Contact cloud" }, about: { title: "À propos cloud" } } }],
  };
  let sizeSeq = 0;
  return async (url, init) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, body, headers: init ? init.headers : {} });
    const u = String(url);
    if (u.includes("/auth/v1/token")) {
      if (u.includes("grant_type=refresh_token")) {
        return jsonRes({ access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "a@b.c" }), refresh_token: "rt2", expires_in: 3600, user: { email: "a@b.c" } });
      }
      return jsonRes({ access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "a@b.c" }), refresh_token: "rt1", expires_in: 3600, user: { email: "a@b.c" } });
    }
    if (u.includes("/auth/v1/logout")) return jsonRes(null, 204);
    if (u.includes("/rest/v1/products") && method === "POST") return jsonRes([{ id: (body && body.id) || "new-id" }], 201);
    if (u.includes("/rest/v1/products") && method === "GET") return jsonRes(tables.products);
    if (u.includes("/rest/v1/products") && method === "DELETE") return jsonRes(null, 204);
    if (u.includes("/rest/v1/products") && method === "PATCH") return jsonRes(null, 204);
    if (u.includes("/rest/v1/product_sizes") && method === "DELETE") return jsonRes(null, 204);
    if (u.includes("/rest/v1/product_sizes") && method === "POST") return jsonRes([{ product_id: body.product_id }], 201);
    if (u.includes("/rest/v1/product_sizes") && method === "GET") return jsonRes(tables.sizes);
    if (u.includes("/rest/v1/website_settings") && method === "GET") return jsonRes(tables.settings);
    if (u.includes("/rest/v1/website_settings") && method === "PATCH") return jsonRes(null, 204);
    if (u.includes("/rest/v1/website_settings") && method === "POST") return jsonRes([{ id: 1 }], 201);
    if (u.includes("/rest/v1/rpc/bl_place_order")) {
      const lines = (body && body.payload && body.payload.lines) || [];
      return jsonRes({ ok: true, order: { id: "BL-AB12C", createdAt: "2026-01-03T00:00:00.000Z", customer: (body.payload && body.payload.customer) || {}, items: lines.map((l) => ({ pid: l.product_id, size: l.size, quantity: l.qty, name: "Nuit Test", unitPrice: 15000, price: 15000 })), subtotal: 15000, deliveryFee: 400, total: 15400, paymentMethod: "cod", paymentStatus: "pending", orderStatus: "confirmed", paymentProof: null, paymentReference: "" } });
    }
    return jsonRes({ message: "no route: " + u }, 404);
  };
}

function loadCloud(calls) {
  const ls = makeLS();
  const ctx = {
    window: { BL_SUPABASE: { url: "https://x.supabase.co", anonKey: "publish-key" } },
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console, XMLHttpRequest: FakeXHR,
    navigator: {}, document: { createElement: () => ({}) },
    fetch: makeFetch(calls),
    URL: { createObjectURL: () => "blob:x" },
    Blob: globalThis.Blob, FileReader: class {},
    setTimeout, atob: (s) => Buffer.from(s, "base64").toString("binary"),
    escape: (s) => unescape(s), unescape: globalThis.unescape,
  };
  ctx.window.localStorage = ls;
  vm.createContext(ctx);
  vm.runInContext(storeSrc, ctx);
  vm.runInContext(cloudSrc, ctx);
  return { BL: ctx.window.BL, ls };
}

console.log("Supabase client (cloud.js):");
{
  const calls = [];
  const { BL } = loadCloud(calls);
  t("configured() true with url + key", BL.cloud.configured() === true);
  t("no session before sign-in", BL.cloud.session() === null);
  t("isAdmin() false before sign-in", BL.cloud.isAdmin() === false);
}

/* auth + role */
{
  const calls = [];
  const { BL } = loadCloud(calls);
  await BL.cloud.signIn("admin@byleilah.dz", "secret");
  t("signIn persists a session", !!BL.cloud.session());
  const st = BL.cloud.status();
  t("role claim decoded from JWT → admin", BL.cloud.isAdmin() === true);
  t("auth POST targets the token endpoint", calls.some((c) => c.url.includes("/auth/v1/token") && c.method === "POST"));
  const authCall = calls.find((c) => c.url.includes("/auth/v1/token"));
  t("password never stored in localStorage (only tokens)", !(BL.cloud.session().password) && JSON.stringify(BL.cloud.session()).indexOf("secret") === -1);
  await BL.cloud.signOut();
  t("signOut clears the session", BL.cloud.session() === null);
}

/* anon catalog sync hydrates the mirror */
{
  const calls = [];
  const { BL } = loadCloud(calls);
  const r = await BL.cloud.syncStorefront({});
  t("catalog sync ok", r && r.ok === true);
  const prods = BL.getProducts();
  t("only published products reach the mirror (draft excluded)", prods.length === 1 && prods[0].id === "bl-x");
  t("row hydrated to local shape (cat/price/desc)", prods[0].cat === "pajamas" && prods[0].price === 15000 && prods[0].desc === "d");
  t("sizes joined from product_sizes", prods[0].sizes.length === 2 && BL.sizeStock(prods[0], "M") === 2);
  t("available derived from active + stock", prods[0].available === true);
  const st = BL.cloud.status();
  t("boot status ready after sync", st.ready === true && st.ok === true);
  t("cloud settings merged into mirror", BL.getContact().title === "Contact cloud" && BL.getAbout().title === "À propos cloud");
}

/* checkout RPC */
{
  const calls = [];
  const { BL } = loadCloud(calls);
  const order = await BL.cloud.placeOrder({
    customer: { firstName: "A", lastName: "B", phone: "0555000000", commune: "Hydra", address: "1 rue" },
    wilaya_code: 16, method: "cod", proof: null, reference: "",
    lines: [{ product_id: "bl-x", size: "M", qty: 1 }],
  });
  t("placeOrder returns the server order", order && order.ok === true && order.order && order.order.id === "BL-AB12C");
  const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/bl_place_order"));
  t("RPC body wraps the payload in the jsonb argument", !!(rpc && rpc.body && rpc.body.payload && Array.isArray(rpc.body.payload.lines) && rpc.body.payload.lines[0].product_id === "bl-x"));
  t("client price is NOT sent (server prices it)", !("price" in (rpc.body.payload.lines[0])));
  t("checkout runs anonymously (anon key, no user token)", !!(rpc.headers && String(rpc.headers.Authorization).indexOf("publish-key") !== -1));
}

/* admin product save */
{
  const calls = [];
  const { BL } = loadCloud(calls);
  await BL.cloud.signIn("admin@byleilah.dz", "secret");
  const p = { id: "bl-y", slug: "nouveau-produit", name: "Nouveau Produit", cat: "pajamas", price: 9900, oldPrice: null, badge: null, desc: "d", colors: [{ hex: "#fff", label: "Blanc", tone: "ivory" }], sizes: [{ name: "M", stock: 3 }], images: [], available: true, tone: "ivory", mono: "N" };
  await BL.cloud.admin.saveProduct(p);
  const posts = calls.filter((c) => c.url.includes("/rest/v1/products") && c.method === "POST");
  const sizeposts = calls.filter((c) => c.url.includes("/rest/v1/product_sizes") && c.method === "POST");
  const sizedels = calls.filter((c) => c.url.includes("/rest/v1/product_sizes") && c.method === "DELETE");
  t("product upserted via POST on_conflict=id", posts.length >= 1 && posts[0].body.id === "bl-y");
  t("canonical row mapping (category/old_price/colors)", posts[0].body.category === "pajamas" && posts[0].body.old_price === null && posts[0].body.colors.length === 1 && posts[0].body.active === true);
  t("sizes replaced: delete old rows then insert new", sizedels.length === 1 && sizeposts.length === 1 && sizeposts[0].body.product_id === "bl-y" && sizeposts[0].body.stock === 3);
}

/* settings write requires an admin session (anonymous storefront never writes) */
{
  const calls = [];
  const { BL } = loadCloud(calls);
  await BL.cloud.admin.writeSettings().catch(() => {});
  const patches = calls.filter((c) => c.url.includes("/rest/v1/website_settings") && (c.method === "PATCH" || c.method === "POST"));
  t("anonymous settings write is refused by the session guard (no request)", patches.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
