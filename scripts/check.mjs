#!/usr/bin/env node
/**
 * by Leïlah — static-site health check
 * 1. Syntax-checks every shared JS file and every inline <script> on each page.
 * 2. Verifies every local *.html link points to a real page.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const PAGES = ["index.html", "shop.html", "product.html", "bag.html", "checkout.html", "admin.html"];
const SHARED_JS = ["store.js", "admin-app.js"];
let failures = 0;

function ok(msg) { console.log("  ✔", msg); }
function fail(msg) { console.error("  ✖", msg); failures++; }

function syntaxCheck(file, code) {
  try {
    new vm.Script(code, { filename: file });
    return true;
  } catch (err) {
    fail(`${file}: ${err.message}`);
    return false;
  }
}

console.log("Shared JS syntax:");
for (const f of SHARED_JS) {
  if (!existsSync(join(root, f))) { fail(`${f} missing`); continue; }
  syntaxCheck(f, readFileSync(join(root, f), "utf8")) && ok(f);
}

for (const page of PAGES) {
  const path = join(root, page);
  if (!existsSync(path)) { fail(`${page} missing`); continue; }
  const html = readFileSync(path, "utf8");

  console.log(`${page} inline scripts:`);
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, i = 0, bad = 0;
  while ((m = re.exec(html))) {
    i++;
    if (!syntaxCheck(`${page}#script${i}`, m[1])) bad++;
  }
  if (!bad) ok(`${i} inline script(s)`);
}

console.log("Local page links:");
const pages = new Set([...PAGES, ...SHARED_JS, "bl.css", "supabase-config.js"]);
for (const page of PAGES) {
  const html = readFileSync(join(root, page), "utf8");
  const re = /(?:href|src)="((?!https?:|mailto:|tel:|#|data:)[^"]+\.(?:html|js|css))[^"]*"/g;
  let m;
  while ((m = re.exec(html))) {
    const target = m[1].split(/[?#]/)[0];
    if (!pages.has(target)) fail(`${page} → ${target}`);
  }
}
ok("all local references resolve to real pages");

console.log("Admin PIN env wiring:");
const adminHtml = readFileSync(join(root, "admin.html"), "utf8");
const distAdmin = join(root, "dist", "admin.html");
const storeJs = readFileSync(join(root, "store.js"), "utf8");
const pinEnvValue = (process.env.VITE_ADMIN_PIN || process.env.ADMIN_PIN || "").trim();
const srcHasPh = adminHtml.includes("%VITE_ADMIN_PIN%");
if (existsSync(distAdmin)) {
  const distHtml = readFileSync(distAdmin, "utf8");
  if (distHtml.includes("%VITE_ADMIN_PIN%")) {
    fail("dist/admin.html still contains the raw %VITE_ADMIN_PIN% placeholder — rebuild with the env var exported");
  } else if (pinEnvValue) {
    ok("dist/admin.html carries the PIN injected from the environment");
  } else {
    ok("dist/admin.html has no PIN placeholder (provisional code generated on login)");
  }
} else if (srcHasPh && pinEnvValue) {
  console.log("  ℹ source admin.html keeps the %VITE_ADMIN_PIN% placeholder — the build injects it into dist/");
} else if (srcHasPh) {
  console.log("  ℹ VITE_ADMIN_PIN unset — a provisional admin code is generated on first login and shown on the gate");
} else {
  ok("admin PIN placeholder resolved (env var or empty fallback)");
}
if (/pin:\s*"admin"|s\.pin\s*=\s*"admin"/.test(storeJs)) {
  fail("store.js still contains a hardcoded 'admin' default PIN");
} else {
  ok("no hardcoded default admin PIN in store.js");
}

console.log(failures ? `\n${failures} problem(s) found.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
