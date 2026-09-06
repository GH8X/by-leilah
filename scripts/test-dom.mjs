#!/usr/bin/env node
/**
 * by Leïlah — DOM smoke test for the home page (index.html).
 * Loads the real page in jsdom and asserts that the live, store-driven
 * catalogue replaces the legacy static cards (real product links, quick-add,
 * language toggle) and that no script throws.
 *   node scripts/test-dom.mjs
 * Skips gracefully when jsdom is not installed (tests then run without it).
 */
let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.log("ℹ jsdom not installed — skipping DOM smoke test (npm install to enable).");
  process.exit(0);
}
import { readFileSync } from "node:fs";

/* jsdom does not fetch external scripts, so the store layer (<script src=store.js>)
 * would never load and the page engine would bail on !window.BL. Inline the store
 * source in place of the external tag (escaping the one `</script` literal, which
 * only appears inside a comment) so the live catalogue path is what gets tested. */
const storeSrc = readFileSync(new URL("../store.js", import.meta.url), "utf8");
const inlined = storeSrc.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const html = page.replace('<script src="store.js"></script>', "<script>" + inlined + "</script>");

let passed = 0, failed = 0;
const failures = [];
function t(name, cond) {
  if (cond) { passed++; console.log("  ✔", name); }
  else { failed++; failures.push(name); console.log("  ✖", name); }
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  pretendToBeVisual: true,
  beforeParse(window) {
    /* jsdom does not implement media playback; stub it so the hero-video
     * path (load/play/pause) never emits "Not implemented" noise. */
    if (window.HTMLMediaElement) {
      window.HTMLMediaElement.prototype.load = function () {};
      window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      window.HTMLMediaElement.prototype.pause = function () {};
    }
    /* Public cloud config as the build injects it (supabase-config.js). */
    window.BL_SUPABASE = { url: "https://xyzcompany.supabase.co", anonKey: "public-anon-key" };
    window.console.error = (...a) => errors.push(a.join(" "));
    window.addEventListener("error", (e) => errors.push(String(e.message || e.error)));
  },
});
/* let the DOM-ready + post-DOM-ready task and any load work settle */
await new Promise((r) => setTimeout(r, 150));

const doc = dom.window.document;
const grid = doc.getElementById("featured-grid");
const strip = doc.getElementById("pajama-strip");
const look = doc.getElementById("look-list");

t("featured grid populated", grid && grid.querySelectorAll("article.card").length >= 1);
t("grid cards link to real product pages (no dead # hrefs)", !!grid && grid.querySelectorAll('a[href^="product.html?p="]').length >= 1 && grid.querySelectorAll('a[href="#"]').length === 0);
t("grid cards carry live catalogue data (data-go slugs)", !!grid && grid.querySelectorAll(".frame[data-go]").length >= 1);
t("grid shows live catalogue order (Douceur = 4th pajama, not static Étoile)", grid && /Douceur/.test(grid.textContent) && !/Étoile Coffret/.test(grid.textContent));
t("pajama strip populated with live cards", strip && strip.querySelectorAll("article.card").length >= 1);
t("'Complétez le look' list filled", look && look.children.length >= 1);

/* language toggle (legacy behavior preserved) */
const langBtns = doc.querySelectorAll(".lang button");
if (langBtns.length) {
  const en = Array.from(langBtns).find((b) => b.getAttribute("data-lang") === "en");
  en.click();
  t("language toggle switches document lang", doc.documentElement.getAttribute("lang") === "en");
  const ar = Array.from(langBtns).find((b) => b.getAttribute("data-lang") === "ar");
  ar.click();
  t("Arabic toggle sets RTL direction", doc.documentElement.getAttribute("dir") === "rtl");
  Array.from(langBtns).find((b) => b.getAttribute("data-lang") === "fr").click();
} else {
  console.log("  ℹ no language toggle on this page");
}

/* quick-add persists to the store cart */
const quick = grid && grid.querySelector("button[data-act='quickAdd']");
if (quick) {
  quick.click();
  await new Promise((r) => setTimeout(r, 30));
  const raw = dom.window.localStorage.getItem("bl.cart.v1");
  const cart = raw ? JSON.parse(raw) : { items: [] };
  t("quick-add writes to the shared cart store", cart.items && cart.items.length >= 1);
  const bagBadge = doc.querySelector(".bag-count");
  if (bagBadge) t("bag badge updated", parseInt(bagBadge.textContent, 10) >= 1);
} else {
  console.log("  ℹ no quick-add button rendered");
}

/* hero video wiring: the live engine must point the <video> at the PUBLIC
 * cloud URL derived from the injected Supabase config — never a blob:/localhost
 * URL — so every visitor (fresh browser, no storage, no admin session) loads
 * the same public asset. */
const heroVideo = doc.getElementById("hero-video");
t("hero video element present", !!heroVideo);
if (heroVideo) {
  const src = heroVideo.getAttribute("src") || "";
  t("hero video source is the public cloud URL", src === "https://xyzcompany.supabase.co/storage/v1/object/public/byleilah/hero/home-hero.mp4");
  t("hero video source is not blob:/localhost", src.indexOf("blob:") !== 0 && src.indexOf("localhost") === -1);
  t("hero video has autoplay/muted/playsinline/loop", heroVideo.hasAttribute("autoplay") && heroVideo.hasAttribute("muted") && heroVideo.hasAttribute("playsinline") && heroVideo.hasAttribute("loop"));
}

/* reveal fallback ran without throwing (legacy, no IntersectionObserver in jsdom) */
t("no uncaught page errors (console/error events)", errors.length === 0);

/* stop the 4s hero-video safety timer so the process exits cleanly */
dom.window.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (errors.length) console.log("Page errors:", errors.slice(0, 5).join(" | "));
if (failed) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
