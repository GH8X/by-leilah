#!/usr/bin/env node
/**
 * by Leïlah — end-to-end test for the admin-driven "Coming Soon" category status.
 *
 * Part 1 (admin.html, real page in jsdom with an authenticated admin session):
 *   - Réglages renders one "Category Display Status" dropdown per category
 *   - each dropdown offers exactly Active / Bientôt (Coming Soon)
 *   - changing ONE category persists it locally, leaves the other categories
 *     untouched, and pushes the public settings (incl. catStatus) to
 *     Supabase website_settings
 * Part 2 (shop.html, real page in jsdom, using the settings the admin wrote):
 *   - the selected category shows the elegant Coming Soon section instead of
 *     the product grid, with the brand message and no "Aucun produit"
 *   - the category stays in the pills/navigation and keeps its page title
 *   - every other category (and the full shop) still lists its products
 *   - switching the status back to Active restores the listing
 * The "refresh" step is a fresh page load reading the persisted settings, which
 * is exactly what a browser reload does.
 *   node scripts/test-coming-soon.mjs   (or: npm run test:soon)
 * Skips gracefully when jsdom is not installed.
 */
let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.log("ℹ jsdom not installed — skipping Coming Soon test (npm install to enable).");
  process.exit(0);
}
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function t(name, cond) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; failures.push(name); console.log("  ✖", name); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- shared stubs ---------- */
class FakeXHR {
  constructor() { this.headers = {}; this.upload = {}; this.status = 200; this.responseText = "{}"; FakeXHR.instances.push(this); }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  send(body) { this.body = body; if (this.onload) this.onload(); }
}
FakeXHR.instances = [];
function jwt(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return enc({ alg: "HS256", typ: "JWT" }) + "." + enc(claims) + "." + enc({});
}
function jsonRes(data, status = 200) {
  const hdrs = { "content-type": "application/json" };
  return { ok: status >= 200 && status < 300, status, headers: { get: (n) => hdrs[n] || hdrs[n.toLowerCase()] || "" }, json: () => Promise.resolve(data) };
}
/* Supabase REST stub: records every call (url + parsed body) so the test can
 * assert what the admin console actually wrote to website_settings. */
function makeFetch(calls, products) {
  return async (url, init) => {
    const method = (init && init.method) || "GET";
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body });
    if (u.includes("/auth/v1/token")) {
      return jsonRes({ access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "admin@byleilah.dz" }), refresh_token: "rt1", expires_in: 3600, user: { email: "admin@byleilah.dz" } });
    }
    if (u.includes("/auth/v1/logout")) return jsonRes(null, 204);
    if (u.includes("/rest/v1/rpc/bl_list_orders")) return jsonRes([]);
    if (u.includes("/rest/v1/product_sizes")) return jsonRes([]);
    if (u.includes("/rest/v1/website_settings") && method === "GET") return jsonRes([]); /* empty → INSERT */
    if (u.includes("/rest/v1/website_settings")) return jsonRes(null, 201);
    if (u.includes("/rest/v1/products")) return jsonRes(products);
    return jsonRes({ message: "no route: " + u }, 404);
  };
}
const storeSrc = readFileSync(new URL("../store.js", import.meta.url), "utf8");
function inlineStore(page, file) {
  const src = file === "store.js"
    ? storeSrc
    : readFileSync(new URL("../" + file, import.meta.url), "utf8");
  return page.replace('<script src="' + file + '"></script>', "<script>" + src.replace(/<\/script/gi, "<\\/script") + "</script>");
}

/* ---------- page loaders ---------- */
async function loadShop(search, settings) {
  const page = inlineStore(readFileSync(new URL("../shop.html", import.meta.url), "utf8"), "store.js");
  const errors = [];
  const dom = new JSDOM(page, {
    runScripts: "dangerously",
    url: "http://localhost/shop.html" + (search || ""),
    pretendToBeVisual: true,
    beforeParse(window) {
      window.BL_SUPABASE = { url: "https://x.supabase.co", anonKey: "publish-key" };
      if (settings) window.localStorage.setItem("bl.settings.v1", JSON.stringify(settings));
      window.console.error = (...a) => errors.push(a.join(" "));
      window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));
    },
  });
  await sleep(120);
  return { dom, doc: dom.window.document, errors };
}

async function loadAdmin(calls) {
  const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const stubbed = html.replace('<script src="supabase-config.js"></script>', '<script>window.BL_SUPABASE = { url: "https://x.supabase.co", anonKey: "publish-key" };</script>');
  const page = inlineStore(inlineStore(inlineStore(stubbed, "store.js"), "cloud.js"), "admin-app.js");
  const errors = [];
  const dom = new JSDOM(page, {
    runScripts: "dangerously",
    url: "http://localhost/admin.html",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.BL_SUPABASE = { url: "https://x.supabase.co", anonKey: "publish-key" };
      window.fetch = makeFetch(calls, [{
        id: "bl-x", slug: "nuit-test", name: "Nuit Test", description: "d", category: "pajamas",
        price: 15000, old_price: null, badge: null, active: true, colors: [], images: [],
        tone: "champagne", mono: "N", created_at: "2026-01-01T00:00:00Z",
      }]);
      window.XMLHttpRequest = FakeXHR;
      window.localStorage.setItem("bl.auth.v1", JSON.stringify({
        access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "admin@byleilah.dz" }),
        refresh_token: "rt1", expires_at: Date.now() + 3600 * 1000, user: { email: "admin@byleilah.dz" },
      }));
      window.console.error = (...a) => errors.push(a.join(" "));
      window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));
    },
  });
  await sleep(250);
  return { dom, doc: dom.window.document, errors };
}

/* ======================================================================
 * 1. Admin console: the per-category status control
 * ====================================================================== */
console.log("Admin — category display status:");
const calls = [];
const admin = await loadAdmin(calls);
const adoc = admin.doc;
t("admin console unlocked", adoc.getElementById("auth-screen") ? adoc.getElementById("auth-screen").hidden : false);

const navSettings = adoc.querySelector('[data-nav="settings"]');
t("Réglages section reachable", !!navSettings);
if (navSettings) { navSettings.click(); await sleep(30); }
const selects = Array.from(adoc.querySelectorAll('select[data-act="catStatus"]'));
t("one status dropdown per category", selects.length === 5 && selects.map((s) => s.getAttribute("data-cat")).join(",") === "pajamas,clothing,pantalons,shoes,handbags");
t("each dropdown offers Active + Bientôt (Coming Soon)", selects.every((s) => Array.from(s.options).map((o) => o.value).join(",") === "active,soon"));
t("labels are human readable", selects.every((s) => /Active/.test(s.options[0].textContent) && /Coming Soon/.test(s.options[1].textContent)));
t("every category starts Active", selects.every((s) => s.value === "active"));

const pantSel = selects.filter((s) => s.getAttribute("data-cat") === "pantalons")[0];
t("Pantalons dropdown present", !!pantSel);
pantSel.value = "soon";
pantSel.dispatchEvent(new admin.dom.window.Event("change", { bubbles: true }));
await sleep(60);

const stored = JSON.parse(adoc.defaultView.localStorage.getItem("bl.settings.v1"));
t("status saved for the selected category", !!stored.catStatus && stored.catStatus.pantalons === "soon");
t("no other category changed", Object.keys(stored.catStatus).length === 1 && stored.catStatus.pajamas === undefined);
const writeCall = calls.filter((c) => c.url.indexOf("/rest/v1/website_settings") !== -1 && c.method !== "GET").pop();
t("pushed to Supabase website_settings (same single settings row)", !!writeCall && !!writeCall.body && writeCall.body.data && writeCall.body.data.catStatus && writeCall.body.data.catStatus.pantalons === "soon");
t("public settings still carry the other keys", !!writeCall && !!writeCall.body.data.contact && !!writeCall.body.data.about);
t("no uncaught admin errors", admin.errors.length === 0);

/* ======================================================================
 * 2. Storefront: the Coming Soon page (fresh load = browser refresh)
 * ====================================================================== */
console.log("\nStorefront — Coming Soon category:");
const soonSettings = JSON.parse(adoc.defaultView.localStorage.getItem("bl.settings.v1"));
const soonPage = await loadShop("?cat=pantalons", soonSettings);
const sdoc = soonPage.doc;
const soonBox = sdoc.getElementById("shop-soon");

t("Coming Soon section displayed for the selected category", !!soonBox && soonBox.hidden === false);
t("stylish COMING SOON heading", !!soonBox && /coming\s*soon/i.test(soonBox.querySelector(".soon-title").textContent));
t("brand message shown", !!soonBox && soonBox.querySelector(".soon-msg").textContent === "Cette catégorie arrive bientôt. Restez connectés pour découvrir notre nouvelle collection.");
t("elegant silk visual rendered", !!soonBox && !!soonBox.querySelector(".soon-art .ph[data-painted]"));
t("CTA into the rest of the shop", !!soonBox && !!soonBox.querySelector('a.btn[href="shop.html"]'));
t("product grid hidden", sdoc.getElementById("shop-grid").style.display === "none" && sdoc.querySelectorAll("#shop-grid article.card").length === 0);
t("no « Aucun produit » empty state", sdoc.getElementById("shop-empty").style.display === "none");
t("no product count line", sdoc.getElementById("shop-count").style.display === "none");
t("category still in the pills + still active", (() => {
  const pill = sdoc.querySelector('#cat-pills a.cat-pill.on');
  return !!pill && pill.getAttribute("href") === "shop.html?cat=pantalons" && pill.textContent.trim() === "Pantalons";
})());
t("category still in the navigation", !!sdoc.querySelector('nav.primary a[href="shop.html?cat=pantalons"]') && !!sdoc.querySelector('nav.menu-nav a[href="shop.html?cat=pantalons"]'));
t("page keeps its category title (no error page)", sdoc.getElementById("shop-title").textContent === "Pantalons");
t("no uncaught storefront errors", soonPage.errors.length === 0);

/* a query can never produce the empty-product message in Coming Soon mode */
const qInput = sdoc.getElementById("shop-q");
qInput.value = "zzzz";
qInput.dispatchEvent(new soonPage.dom.window.Event("input", { bubbles: true }));
await sleep(20);
t("a search never reveals « Aucun produit » on a Coming Soon category", sdoc.getElementById("shop-empty").style.display === "none" && sdoc.querySelectorAll("#shop-grid article.card").length === 0);

/* ---- other categories keep working normally ---- */
console.log("\nStorefront — other categories unaffected:");
const pj = await loadShop("?cat=pajamas", soonSettings);
t("another category still lists its products", pj.doc.querySelectorAll("#shop-grid article.card").length > 0);
t("another category never shows Coming Soon", pj.doc.getElementById("shop-soon").hidden === true);
t("another category keeps its count line", pj.doc.getElementById("shop-count").style.display !== "none" && /\d+ produits?/.test(pj.doc.getElementById("shop-count").textContent));
const all = await loadShop("", soonSettings);
t("the full shop (all categories) still lists products", all.doc.querySelectorAll("#shop-grid article.card").length >= 6);
t("the full shop shows no Coming Soon block", all.doc.getElementById("shop-soon").hidden === true);

/* ---- switching back to Active restores the listing ---- */
console.log("\nStorefront — switching back to Active:");
const backSettings = JSON.parse(JSON.stringify(soonSettings));
backSettings.catStatus.pantalons = "active";
const back = await loadShop("?cat=pantalons", backSettings);
t("products reappear when the category is Active again", back.doc.querySelectorAll("#shop-grid article.card").length >= 5);
t("Coming Soon block hidden again", back.doc.getElementById("shop-soon").hidden === true);
t("count line visible again", back.doc.getElementById("shop-count").style.display !== "none");
t("no « Aucun produit » on the restored listing", back.doc.getElementById("shop-empty").style.display === "none");

/* and back to Coming Soon through the admin record (round-trip) */
const round2 = JSON.parse(JSON.stringify(backSettings));
round2.catStatus.pantalons = "soon";
const again = await loadShop("?cat=pantalons", round2);
t("status round-trips (Active → Coming Soon) through the persisted record", again.doc.getElementById("shop-soon").hidden === false && again.doc.querySelectorAll("#shop-grid article.card").length === 0);

for (const w of [admin.dom, soonPage.dom, pj.dom, all.dom, back.dom, again.dom]) w.window.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
