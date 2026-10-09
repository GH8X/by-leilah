#!/usr/bin/env node
/**
 * by Leïlah — DOM regression test for the "Pantalons" category.
 * Loads the real shop.html (?cat=pantalons) and product.html (?p=…) pages in
 * jsdom with the store layer inlined (same approach as test-dom.mjs) and walks
 * the whole trousers path:
 *   - the category is in the desktop nav AND the mobile slide menu
 *   - the shop category pills expose it and it is the active filter
 *   - the category page lists ONLY trousers products, with a dedicated title
 *   - every card links to its real product page (slug URLs)
 *   - search + empty state behave inside the category
 *   - quick-add and the product page's add-to-bag persist size + colour + qty
 *   - trousers use numeric waist sizes (36…44), per-size stock is respected,
 *     and an out-of-stock trouser renders "Rupture" with the buy button off
 *   node scripts/test-category.mjs
 * Skips gracefully when jsdom is not installed (tests then run without it).
 */
let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.log("ℹ jsdom not installed — skipping category DOM test (npm install to enable).");
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
/* jsdom does not fetch external scripts: inline store.js in place of the tag
 * (escaping the one `</script` literal, which only appears inside a comment). */
const storeSrc = readFileSync(new URL("../store.js", import.meta.url), "utf8").replace(/<\/script/gi, "<\\/script");

async function loadPage(file, search) {
  const page = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const html = page.replace('<script src="store.js"></script>', "<script>" + storeSrc + "</script>");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/" + file + (search || ""),
    pretendToBeVisual: true,
    beforeParse(window) {
      window.BL_SUPABASE = { url: "https://xyzcompany.supabase.co", anonKey: "public-anon-key" };
      window.console.error = (...a) => errors.push(a.join(" "));
      window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));
    },
  });
  await sleep(120); /* the page engine boots on DOM-ready */
  return { dom, doc: dom.window.document, errors };
}
function readCart(dom) {
  const raw = dom.window.localStorage.getItem("bl.cart.v1");
  return raw ? JSON.parse(raw) : { items: [] };
}
function fireInput(dom, input, value) {
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

/* ======================================================================
 * 1. Shop page filtered on the new category (?cat=pantalons)
 * ====================================================================== */
console.log("Pantalons category page (shop.html?cat=pantalons):");
{
  const { dom, doc, errors } = await loadPage("shop.html", "?cat=pantalons");
  const BL = dom.window.BL;

  t("Pantalons link in the desktop nav", (() => {
    const a = doc.querySelector('nav.primary a[href="shop.html?cat=pantalons"]');
    return !!a && a.textContent.trim() === "Pantalons";
  })());
  t("Pantalons link in the mobile slide menu", (() => {
    const a = doc.querySelector('nav.menu-nav a[href="shop.html?cat=pantalons"]');
    return !!a && a.textContent.trim() === "Pantalons";
  })());

  const pills = Array.from(doc.querySelectorAll("#cat-pills a"));
  t("pills list the five categories in order", pills.map((a) => a.textContent.trim()).join(",") === "Tout,Pyjamas,Vêtements,Pantalons,Chaussures,Sacs");
  const active = doc.querySelector("#cat-pills a.cat-pill.on");
  t("Pantalons is the active pill on its page", !!active && active.getAttribute("href") === "shop.html?cat=pantalons");

  t("dedicated title «Pantalons»", doc.getElementById("shop-title").textContent === "Pantalons");
  t("dedicated subtitle", doc.getElementById("shop-sub").textContent === "Des coupes élégantes, du matin au soir.");

  const pants = BL.getProducts().filter((p) => p.cat === "pantalons");
  const cards = Array.from(doc.querySelectorAll("#shop-grid article.card"));
  t("grid lists every trouser and nothing else", cards.length === pants.length && cards.length >= 5);
  const names = cards.map((c) => c.querySelector("h3").textContent.trim());
  t("only trousers products are rendered", names.every((n) => pants.some((p) => p.name === n)));
  t("cards keep the existing card design (tagline = category label)", cards.every((c) => c.querySelector(".tagline").textContent.trim() === "Pantalons"));
  const hrefs = cards.map((c) => c.querySelector("a.frame").getAttribute("href"));
  t("cards link to the real product detail pages", hrefs.every((h) => /^product\.html\?p=/.test(h) && pants.some((p) => p.slug === decodeURIComponent(h.split("?p=")[1]))));
  t("count line matches the filtered list", doc.getElementById("shop-count").textContent === cards.length + " produits");

  /* search stays inside the category */
  fireInput(dom, doc.getElementById("shop-q"), "palazzo");
  await sleep(10);
  t("search matches a trouser by name", doc.querySelectorAll("#shop-grid article.card").length === 1);
  fireInput(dom, doc.getElementById("shop-q"), "nuit de soie");
  await sleep(10);
  t("a pyjama never appears on the trousers page (empty state instead)", doc.querySelectorAll("#shop-grid article.card").length === 0 && doc.getElementById("shop-empty").style.display === "");

  /* quick add (card shortcut) persists the numeric size + colour */
  fireInput(dom, doc.getElementById("shop-q"), "");
  await sleep(10);
  const quick = doc.querySelector("#shop-grid article.card button[data-act='quickAdd']");
  t("quick add offered on trousers cards", !!quick);
  if (quick) quick.click();
  await sleep(20);
  const cart = readCart(dom);
  t("quick add stores size + colour + qty", cart.items.length === 1 && cart.items[0].size === "36" && cart.items[0].qty === 1 && cart.items[0].colorLabel === "Nude");
  t("bag badge reflects the trouser line", parseInt(doc.querySelector(".bag-count").textContent, 10) === 1);

  t("no uncaught page errors on the category page", errors.length === 0);
  dom.window.close();
}

/* ======================================================================
 * 2. Product detail page of a trouser (?p=leila-tailleur)
 * ====================================================================== */
console.log("Trouser product detail page (product.html?p=leila-tailleur):");
{
  const { dom, doc, errors } = await loadPage("product.html", "?p=leila-tailleur");
  const BL = dom.window.BL;

  t("product rendered", doc.getElementById("p-name").textContent === "Leïla Tailleur");
  const crumb = doc.getElementById("crumb");
  t("breadcrumb shows Pantalons", /Pantalons/.test(crumb.textContent));
  t("breadcrumb links to the category page", !!crumb.querySelector('a[href="shop.html?cat=pantalons"]'));
  t("tagline is the category label", doc.getElementById("p-tagline").textContent === "Pantalons");
  t("price rendered from the catalogue", doc.getElementById("price-now").textContent === BL.money(12900));

  const sizes = Array.from(doc.querySelectorAll("#sizes .size-btn"));
  t("numeric waist sizes 36–44", sizes.map((b) => b.textContent.trim()).join(",") === "36,38,40,42,44");
  t("in-stock sizes are selectable / in-stock state shown", sizes.filter((b) => !b.disabled).length === 5 && doc.getElementById("stock-text").textContent === "En stock");

  doc.querySelector('#sizes .size-btn[data-size="42"]').click();
  await sleep(10);
  t("selected size reflected in the UI", doc.getElementById("size-label").textContent === "42");
  doc.getElementById("add").click();
  await sleep(20);
  const cart = readCart(dom);
  t("add to bag keeps the selected size + colour + qty", cart.items.length === 1 && cart.items[0].pid === "bl-038" && cart.items[0].size === "42" && cart.items[0].colorLabel === "Espresso" && cart.items[0].qty === 1);

  /* stock validation: the bag can never exceed the per-size stock */
  const max = BL.sizeStock(BL.getProduct("bl-038"), "42");
  doc.getElementById("q-plus").click(); /* qty 2 → 1 in the bag + 2 = the whole size stock */
  doc.getElementById("add").click();
  await sleep(20);
  let line2 = readCart(dom).items.filter((x) => x.size === "42")[0];
  t("repeat add fills up to the per-size stock", !!line2 && line2.qty === max);
  doc.getElementById("q-plus").click(); /* one more would over-order */
  doc.getElementById("add").click();
  await sleep(20);
  line2 = readCart(dom).items.filter((x) => x.size === "42")[0];
  t("over-ordering is refused (bag never exceeds the stock)", !!line2 && line2.qty === max && /stock/i.test(doc.getElementById("toast-text").textContent));

  t("no uncaught page errors on the product page", errors.length === 0);
  dom.window.close();
}

/* ======================================================================
 * 3. Out-of-stock trouser → Rupture path
 * ====================================================================== */
console.log("Out-of-stock trouser (product.html?p=nuit-blanche-satin):");
{
  const { dom, doc, errors } = await loadPage("product.html", "?p=nuit-blanche-satin");
  t("stock hint reports the trouser as unavailable", /indisponible/i.test(doc.getElementById("stock-text").textContent));
  const add = doc.getElementById("add");
  t("buy button disabled", add.disabled === true && /indisponible/i.test(doc.getElementById("add-label").textContent));
  const sizes = Array.from(doc.querySelectorAll("#sizes .size-btn"));
  t("every size is disabled", sizes.length > 0 && sizes.every((b) => b.disabled));
  add.click();
  await sleep(20);
  t("clicking the disabled button adds nothing to the bag", readCart(dom).items.length === 0);
  t("no uncaught page errors", errors.length === 0);
  dom.window.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
