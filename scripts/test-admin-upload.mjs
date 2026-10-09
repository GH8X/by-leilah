#!/usr/bin/env node
/**
 * by Leïlah — DOM regression test for the ADMIN PRODUCT-IMAGE UPLOAD picker.
 * Loads admin.html (store.js + cloud.js + admin-app.js inlined) in jsdom with
 * an authenticated admin session and a stubbed Supabase REST + Storage layer.
 *
 * Covers the Android-Chrome fix:
 *   - trigger is a native <label for="m-img-file"> (no JS .click() dependency)
 *   - the file input stays a real interactive element (no display:none /
 *     pointer-events:none — only visually hidden via opacity/positioning)
 *   - files are snapshotted into an array BEFORE input.value is cleared
 *     (input.files is a live list; the old order silently killed uploads on
 *     Android Chrome: no preview, no progress, no error)
 *   - upload progress is shown immediately, per file
 *   - every selected image is uploaded sequentially via
 *     BL.cloud.admin.uploadProductImage() to product-images/ and the returned
 *     public URL is added to the form + preview rendered
 *   - selecting the SAME image again re-triggers the upload (input reset)
 *   - an upload failure surfaces the real error through the existing toast
 *   - reorder / main / remove controls still work (regression)
 *   - works for a NEW product (state.editingId null → temporary id) and for an
 *     existing product (editingId preserved)
 *
 *   node scripts/test-admin-upload.mjs   (or: npm run test:admin)
 * Skips gracefully when jsdom is not installed.
 */
let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.log("ℹ jsdom not installed — skipping admin upload DOM test (npm install to enable).");
  process.exit(0);
}
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
function t(name, cond) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; failures.push(name); console.log("  ✖", name); }
}

/* ---------- stubs ---------- */
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
  send(body) { this.body = body; } /* onload fired manually via respond() so tests can emit progress first */
  respond() { if (this.onload) this.onload(); }
}
FakeXHR.instances = [];
FakeXHR.nextStatus = 0;

function jwt(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return enc({ alg: "HS256", typ: "JWT" }) + "." + enc(claims) + "." + enc({});
}
function jsonRes(data, status = 200) {
  const hdrs = { "content-type": "application/json" };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => hdrs[n] || hdrs[n.toLowerCase()] || "" },
    json: () => Promise.resolve(data),
  };
}
function makeFetch(calls) {
  /* one published product so the existing-product (edit) branch can run */
  const products = [{
    id: "bl-x", slug: "nuit-test", name: "Nuit Test", description: "d", category: "pajamas",
    price: 15000, old_price: null, badge: null, active: true, colors: [], images: [],
    tone: "champagne", mono: "N", created_at: "2026-01-01T00:00:00Z",
  }];
  return async (url, init) => {
    const method = (init && init.method) || "GET";
    const u = String(url);
    calls.push({ url: u, method });
    if (u.includes("/auth/v1/token")) {
      return jsonRes({ access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "admin@byleilah.dz" }), refresh_token: "rt1", expires_in: 3600, user: { email: "admin@byleilah.dz" } });
    }
    if (u.includes("/auth/v1/logout")) return jsonRes(null, 204);
    if (u.includes("/rest/v1/rpc/bl_list_orders")) return jsonRes([]);
    if (u.includes("/rest/v1/product_sizes") || u.includes("/rest/v1/website_settings")) return jsonRes([]);
    if (u.includes("/rest/v1/products")) return jsonRes(products);
    return jsonRes({ message: "no route: " + u }, 404);
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- load the real admin page ---------- */
/* jsdom does not fetch external scripts, so each shared script is inlined in
 * place of its <script src> tag. The one `</script` literal (only inside a
 * comment) must be escaped or the HTML parser truncates the script element. */
const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
function inline(page, file) {
  const src = readFileSync(new URL("../" + file, import.meta.url), "utf8").replace(/<\/script/gi, "<\\/script");
  return page.replace('<script src="' + file + '"></script>', "<script>" + src + "</script>");
}
/* stub config instead of the real supabase-config.js so the storage public URL
 * is deterministic (the upload assertion checks it byte-for-byte) */
const stubbed = html.replace('<script src="supabase-config.js"></script>', '<script>window.BL_SUPABASE = { url: "https://x.supabase.co", anonKey: "publish-key" };</script>');
const inlined = inline(inline(inline(stubbed, "store.js"), "cloud.js"), "admin-app.js");

const calls = [];
const errors = [];
const dom = new JSDOM(inlined, {
  runScripts: "dangerously",
  url: "http://localhost/admin.html",
  pretendToBeVisual: true,
  beforeParse(window) {
    /* Public cloud config as the build injects it (supabase-config.js). */
    window.BL_SUPABASE = { url: "https://x.supabase.co", anonKey: "publish-key" };
    window.fetch = makeFetch(calls);
    window.XMLHttpRequest = FakeXHR;
    /* Pre-seed an admin session so boot() unlocks the console immediately. */
    window.localStorage.setItem("bl.auth.v1", JSON.stringify({
      access_token: jwt({ app_metadata: { role: "admin" }, role: "authenticated", email: "admin@byleilah.dz" }),
      refresh_token: "rt1",
      expires_at: Date.now() + 3600 * 1000,
      user: { email: "admin@byleilah.dz" },
    }));
    window.console.error = (...a) => errors.push(a.join(" "));
    window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));
  },
});
await sleep(250); /* boot + unlock + refresh settle */

const doc = dom.window.document;

console.log("Admin product-image upload (mobile/Android fix):");
t("admin console unlocked (auth screen hidden)", doc.getElementById("auth-screen") ? doc.getElementById("auth-screen").hidden : false);
t("no uncaught page errors", errors.length === 0);

/* open the product editor (Produits & stock → Ajouter un produit) */
const navStock = doc.querySelector('[data-nav="stock"]');
t("stock section reachable", !!navStock);
if (navStock) {
  navStock.click();
  await sleep(20);
}
const addBtn = doc.querySelector('[data-act="addProduct"]');
t("'Ajouter un produit' opens the editor", !!addBtn);
if (addBtn) addBtn.click();
await sleep(20);

const modalRoot = doc.getElementById("modal-root");
const input = doc.getElementById("m-img-file");
const progressEl = doc.getElementById("m-img-progress");
t("modal opened with the file input", !!modalRoot && !modalRoot.hidden && !!input);

/* the editor's category dropdown is driven by BL.CATS: the new Pantalons
 * category must be selectable exactly like the existing ones */
const catSel = doc.getElementById("m-cat");
const catOpts = catSel ? Array.from(catSel.options) : [];
t("product form offers the Pantalons category", catOpts.some((o) => o.value === "pantalons" && o.textContent === "Pantalons"));
t("categories are ordered Pyjamas, Vêtements, Pantalons, Chaussures, Sacs", catOpts.map((o) => o.value).join(",") === "pajamas,clothing,pantalons,shoes,handbags");

/* requirement 3 + 4: native label trigger, input stays interactive */
const label = doc.querySelector('label[for="m-img-file"]');
t("trigger is a native <label for=\"m-img-file\">", !!label && label.getAttribute("data-add") === "imageUpload");
t("input is not display:none", !!input && input.style.display !== "none");
t("input has no pointer-events:none", !!input && input.style.pointerEvents !== "none");
t("input is visually hidden via opacity", !!input && input.style.opacity === "0");

/* Emulate the browser contract: input.files is a LIVE FileList — the app reads
 * it and then resets input.value, which empties it (that is exactly the Android
 * bug being regression-tested: the files must be snapshotted BEFORE the reset).
 * The delegated document-level fallback listener therefore sees an empty list
 * on the second call and must not double-upload. */
let pendingFiles = [];
Object.defineProperty(input, "files", {
  get() { const f = pendingFiles; pendingFiles = []; return f; },
  configurable: true,
});
function pick(files) {
  pendingFiles = files;
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}
function lastXhr() { return FakeXHR.instances[FakeXHR.instances.length - 1]; }
/* storage writes go to /storage/v1/object/<bucket>/<folder>/… (bucket "byleilah") */
function uploadCalls() { return FakeXHR.instances.filter((x) => x.url.indexOf("/storage/v1/object/byleilah/product-images/") !== -1); }
function respondAll() {
  uploadCalls().filter((x) => !x.responded).forEach((x) => { x.responded = true; x.respond(); });
}
function previewImgs() { return doc.querySelectorAll("#m-images img").length; }
function toastText() { return doc.getElementById("toast-text").textContent; }

/* ---------- 1. single JPG, new product (editingId null → temp id) ---------- */
const f1 = new dom.window.File(["jpgdata"], "photo.jpg", { type: "image/jpeg" });
pick([f1]);
await sleep(40);
t("upload started: PUT to product-images/", uploadCalls().length === 1);
t("progress shown immediately with the file name", !!progressEl && progressEl.style.display !== "none" && progressEl.textContent.indexOf("photo.jpg") !== -1);
if (uploadCalls().length === 1) {
  const x = uploadCalls()[0];
  t("upload goes to the product-images/ folder with a temp product id", x.url.indexOf("product-images/new-") !== -1);
  t("authenticated PUT (bearer + anon key)", x.method === "PUT" && !!x.headers.Authorization && x.headers.Authorization.indexOf("Bearer ") === 0 && !!x.headers.apikey);
  t("progress callback updates the %", (x.upload.onprogress && (x.upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 }), progressEl.textContent.indexOf("25%") !== -1)) || false);
  x.respond();
}
await sleep(20);
t("preview rendered after upload", previewImgs() === 1);
const firstImg = doc.querySelector("#m-images img");
const src = firstImg ? firstImg.getAttribute("src") : "(no img)";
if (!src || src.indexOf("https://x.supabase.co/storage/v1/object/public/byleilah/product-images/") !== 0) console.log("  ℹ actual src:", src);
t("preview uses the returned Supabase public URL (product-images/)", !!firstImg && src.indexOf("https://x.supabase.co/storage/v1/object/public/byleilah/product-images/") === 0);
t("progress hidden after success", !!progressEl && progressEl.style.display === "none");

/* ---------- 2. selecting the SAME image again re-uploads (input reset) ---------- */
pick([f1]);
await sleep(20);
if (uploadCalls().length === 2) {
  const x = uploadCalls()[1];
  t("same image re-select triggers a NEW upload (value reset)", x.url !== uploadCalls()[0].url);
  x.respond();
}
await sleep(20);
t("preview now shows 2 images", previewImgs() === 2);

/* ---------- 3. multiple files sequentially ---------- */
const f2 = new dom.window.File(["pngdata"], "photo2.png", { type: "image/png" });
const f3 = new dom.window.File(["svgdata"], "photo3.svg", { type: "image/svg+xml" });
const seen = uploadCalls().length;
pick([f2, f3]);
await sleep(20);
/* sequential chain: f2's PUT must resolve before f3's is created */
for (let i = 0; i < 4 && uploadCalls().length < seen + 2; i++) { respondAll(); await sleep(20); }
const created = uploadCalls().length;
t("multiple files: sequential uploads started", created === seen + 2);
respondAll();
await sleep(30);
t("multiple files: all previews rendered", previewImgs() === 4);
t("multiple files: main/reorder/remove controls still rendered", doc.querySelectorAll('#m-images [data-img]').length >= 12);

/* ---------- 4. reorder + remove still work ---------- */
const rmBtn = doc.querySelector('#m-images [data-img="rm"]');
if (rmBtn) rmBtn.click();
await sleep(10);
t("remove image works (preserves remaining set)", previewImgs() === 3);

/* ---------- 5. upload failure surfaces the real error ---------- */
FakeXHR.nextStatus = 403;
pick([f1]);
await sleep(20);
const failing = uploadCalls()[uploadCalls().length - 1];
failing.responded = true;
failing.respond();
await sleep(20);
const toast = doc.getElementById("toast");
t("failure shows the error toast (not silent)", !!toast && toast.classList.contains("err") && toastText().indexOf("Téléversement impossible") !== -1);
t("failed image is NOT added to the preview", previewImgs() === 3);

/* ---------- 6. existing product editing keeps editingId ---------- */
const editBtn = doc.querySelector('[data-act="editProduct"]');
if (editBtn) {
  const before = uploadCalls().length;
  editBtn.click();
  await sleep(20);
  const input2 = doc.getElementById("m-img-file");
  t("editing an existing product re-opens the editor with a fresh input", !!input2 && input2 !== input);
  let pending2 = [];
  Object.defineProperty(input2, "files", {
    get() { const f = pending2; pending2 = []; return f; },
    configurable: true,
  });
  const f4 = new dom.window.File(["webpdata"], "photo4.webp", { type: "image/webp" });
  pending2 = [f4];
  input2.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await sleep(20);
  const ups = uploadCalls().filter((x) => x.url.indexOf("/storage/v1/object/byleilah/product-images/") !== -1);
  const last = ups[ups.length - 1];
  t("existing-product upload uses the real product id (not new-)", !!last && last.url.indexOf("product-images/new-") === -1);
  if (last) last.respond();
  await sleep(20);
  t("existing-product upload previews too", doc.querySelectorAll("#m-images img").length === 1 && before < uploadCalls().length);
} else {
  console.log("  ℹ no editable product seeded — existing-product branch skipped");
}

/* no uncaught errors during the whole flow */
t("no uncaught page errors at the end", errors.length === 0);

dom.window.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) console.log("Page errors:", errors.slice(0, 5).join(" | "));
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }