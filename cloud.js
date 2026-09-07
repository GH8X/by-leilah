/*
 * by Leïlah — Supabase client layer (load AFTER store.js on every page)
 * ---------------------------------------------------------------------
 * window.BL.cloud provides:
 *   - session management (Supabase Auth, email + password). The admin login
 *     screen uses signIn(); nothing is ever stored as a plaintext password —
 *     only the access/refresh tokens, kept in localStorage ("bl.auth.v1").
 *   - anon storefront sync: products + per-size stock + website settings,
 *     hydrating the synchronous BL mirror (applyCatalog / applyCloudSettings).
 *   - checkout through the ATOMIC server function bl_place_order (RPC). The
 *     server re-reads prices and stock, deducts with row locks and creates
 *     the order — the client never sends prices or totals.
 *   - admin operations (products, stock, orders, settings, hero video,
 *     product images) using the signed-in user's access token. Every write
 *     is enforced server-side by RLS + the "admin" role claim.
 *
 * Security notes:
 *   - Only the PUBLIC config (project URL + publishable/anon key) lives in
 *     the browser; it is in supabase-config.js / BL.supabaseCfg().
 *   - No service_role key anywhere in this file or any page.
 *   - Anonymous visitors can ONLY read published products/sizes/settings and
 *     call bl_place_order — every other table is write-locked to admins.
 */
(function () {
  "use strict";
  if (!window.BL) return;
  var BL = window.BL;

  var AUTH_KEY = "bl.auth.v1";
  var HERO_OBJECT = (BL.HERO_BUCKET || "byleilah") + "/" + (BL.HERO_PATH || "hero/home-hero.mp4");
  var IMG_FOLDER = "product-images";
  var CLOUD_KEYS = ["contact", "about", "newSection", "comingSoon", "socials", "theme"];

  function cfg() {
    var c = BL.supabaseCfg ? BL.supabaseCfg() : { url: "", anonKey: "" };
    return { url: String(c.url || "").replace(/\/+$/, ""), anonKey: String(c.anonKey || "").trim() };
  }
  function configured() { var c = cfg(); return !!(c.url && c.anonKey); }
  function publicBase(c) {
    return c.url + "/storage/v1/object/public/" + (BL.HERO_BUCKET || "byleilah");
  }

  /* ---------------- session ---------------- */
  function readSession() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      return s;
    } catch (e) { return null; }
  }
  function writeSession(s) {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function clearSession() {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ }
  }
  function session() { return readSession(); }
  function isAdmin() {
    var s = session();
    return !!(s && decodeRole(s.access_token) === "admin");
  }
  /* Decode the JWT payload (no signature check — display/gating only; the
   * real authority is RLS, which verifies the signature server-side). */
  function decodeRole(token) {
    try {
      var part = String(token).split(".")[1] || "";
      part = part.replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      var claims = JSON.parse(decodeURIComponent(escape(atob(part))));
      var r = claims && claims.app_metadata ? claims.app_metadata.role : null;
      return r || (claims ? claims.role : null) || null;
    } catch (e) { return null; }
  }
  function sessionEmail() {
    var s = session();
    return s && s.user && s.user.email ? s.user.email : (s && s.email ? s.email : "");
  }

  /* ---------------- low-level fetch ---------------- */
  function http(method, path, opts) {
    opts = opts || {};
    var c = cfg();
    var token = opts.token === undefined ? (session() || {}).access_token : opts.token;
    var headers = { apikey: c.anonKey, Authorization: "Bearer " + (token || c.anonKey) };
    if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; }
    if (opts.prefer) headers.Prefer = opts.prefer;
    var body = opts.json !== undefined ? JSON.stringify(opts.json) : undefined;
    var url = c.url + path + (opts.query || "");
    var ctrl = null;
    if (typeof AbortController !== "undefined" && opts.timeoutMs) {
      ctrl = new AbortController();
      setTimeout(function () { try { ctrl.abort(); } catch (e) { /* ignore */ } }, opts.timeoutMs);
    }
    return fetch(url, {
      method: method, headers: headers, body: body,
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      var ct = (res.headers.get("content-type") || "");
      var p = ct.indexOf("json") !== -1 ? res.json().catch(function () { return {}; }) : Promise.resolve(null);
      return p.then(function (data) {
        if (res.ok) return data;
        var msg = (data && (data.message || data.error_description || data.msg)) || res.statusText || ("Erreur " + res.status);
        if (res.status === 401 || res.status === 403) {
          var kind = /(invalid|expired|token|session)/i.test(msg) ? "session" : "denied";
          var err = new Error(kind === "session" ? "Session expirée — reconnectez-vous." : "Accès refusé par le serveur.");
          err.kind = kind; err.status = res.status; throw err;
        }
        var e = new Error(String(msg));
        e.status = res.status; e.data = data; throw e;
      });
    });
  }
  /* refresh an expiring/expired session */
  function ensureFreshSession() {
    var s = session();
    if (!s) return Promise.resolve(null);
    var now = Date.now();
    var exp = s.expires_at || (now + 3600 * 1000);
    if (exp > now + 60000 && s.access_token) return Promise.resolve(s);
    if (!s.refresh_token) { clearSession(); return Promise.reject(new Error("Session expirée — reconnectez-vous.")); }
    var c = cfg();
    return fetch(c.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.access_token) {
          clearSession();
          throw new Error("Session expirée — reconnectez-vous.");
        }
        var ns = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || s.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          user: data.user || s.user,
        };
        writeSession(ns);
        return ns;
      });
    });
  }
  function adminFetch(method, path, opts) {
    opts = opts || {};
    return ensureFreshSession().then(function (s) {
      /* Every non-GET admin call needs a live signed-in session: without one
       * nothing is sent to the database (RLS would refuse anyway). */
      if (!s && method !== "GET") {
        var e = new Error("Session requise — reconnectez-vous.");
        e.kind = "session";
        throw e;
      }
      return http(method, path, { json: opts.json, prefer: opts.prefer, token: s ? s.access_token : null, timeoutMs: opts.timeoutMs });
    });
  }
  /* HEAD a PostgREST table to learn its row count (count=exact header) */
  function tableCount(path) {
    var c = cfg();
    return fetch(c.url + path + "?select=id", {
      method: "HEAD",
      headers: { apikey: c.anonKey, Authorization: "Bearer " + c.anonKey, Range: "0-0", Prefer: "count=exact" },
    }).then(function (res) {
      var cr = res.headers.get("content-range") || "";
      var m = cr.match(/\/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    }).catch(function () { return -1; });
  }

  /* ---------------- auth ---------------- */
  function signIn(email, password) {
    var c = cfg();
    if (!c.url || !c.anonKey) return Promise.reject(new Error("Stockage cloud non configuré (Supabase)."));
    return fetch(c.url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: c.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(email || "").trim(), password: String(password || "") }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data && data.error_description) || (data && data.msg) || (data && data.message) || "Identifiants incorrects.";
          throw new Error(msg);
        }
        var s = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          user: data.user || null,
        };
        writeSession(s);
        return s;
      });
    });
  }
  function signOut() {
    var s = session();
    clearSession();
    if (!s || !s.access_token) return Promise.resolve(true);
    var c = cfg();
    return fetch(c.url + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: c.anonKey, Authorization: "Bearer " + s.access_token },
    }).catch(function () { return null; }).then(function () { return true; });
  }

  /* ---------------- storefront data (anon) ---------------- */
  var PROD_SELECT = "id,slug,name,description,category,price,old_price,badge,active,colors,images,tone,mono,created_at";

  var SIZE_RANK = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
  function sizeRank(name) {
    var n = String(name || "").trim();
    if (n === "") return 20;
    if (/^\d+$/.test(n)) return 10;
    return SIZE_RANK[n] !== undefined ? SIZE_RANK[n] : 15;
  }
  function sortSizes(list) {
    return (list || []).slice().sort(function (a, b) {
      var ra = sizeRank(a.name), rb = sizeRank(b.name);
      return ra !== rb ? ra - rb : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
  }
  function hydrate(rows, sizeMap, adminView) {
    var out = [];
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.id) continue;
      if (r.active === false && !adminView) continue;      /* unpublished → hidden from storefront */
      var sizes = sortSizes(sizeMap[r.id] || []);
      total = 0;
      for (var k = 0; k < sizes.length; k++) total += (sizes[k].stock || 0);
      var colors = Array.isArray(r.colors) ? r.colors : [];
      var images = Array.isArray(r.images) ? r.images : [];
      out.push({
        id: r.id, slug: r.slug || r.id, name: r.name,
        cat: r.category || "clothing",
        price: Math.round(Number(r.price) || 0),
        oldPrice: r.old_price == null ? null : Math.round(Number(r.old_price) || 0),
        badge: r.badge || null, desc: r.description || "",
        colors: colors, sizes: sizes, images: images,
        active: r.active !== false, available: r.active !== false && total > 0,
        tone: r.tone || (colors[0] && colors[0].tone) || "champagne",
        mono: r.mono || String(r.name || "L").charAt(0),
        createdAt: r.created_at || null,
        cloud: true,
      });
    }
    return out;
  }
  /* Public/anonymous sync: replace the mirror with the published catalogue. */
  function syncStorefront(opts) {
    opts = opts || {};
    var c = cfg();
    if (!configured()) return Promise.resolve({ ok: false, reason: "unconfigured" });
    var q = "?select=" + encodeURIComponent(PROD_SELECT) + "&order=created_at";
    return Promise.all([
      http("GET", "/rest/v1/products" + q, { token: null, timeoutMs: opts.timeoutMs || 8000 }),
      http("GET", "/rest/v1/product_sizes?select=product_id,name,stock", { token: null, timeoutMs: opts.timeoutMs || 8000 }),
      http("GET", "/rest/v1/website_settings?select=data&id=eq.1", { token: null, timeoutMs: opts.timeoutMs || 8000 }),
    ]).then(function (all) {
      var rows = all[0] || [];
      var sizeRows = all[1] || [];
      var sizeMap = {};
      for (var i = 0; i < sizeRows.length; i++) {
        var sr = sizeRows[i];
        if (!sr) continue;
        (sizeMap[sr.product_id] = sizeMap[sr.product_id] || []).push({ name: sr.name, stock: Math.max(0, Math.round(Number(sr.stock) || 0)) });
      }
      var products = hydrate(rows, sizeMap, false);
      BL.applyCatalog(products);
      var sett = all[2] && all[2].length && all[2][0].data ? all[2][0].data : null;
      if (sett) BL.applyCloudSettings(sett);
      return { ok: true, products: products.length };
    });
  }

  /* ---------------- checkout (anon → atomic server RPC) ---------------- */
  /* payload lines built from the cart: server reads the real price/stock. */
  function placeOrder(payload) {
    if (!configured()) return Promise.reject(new Error("Stockage cloud non configuré."));
    /* the RPC takes one jsonb argument named "payload" */
    return http("POST", "/rest/v1/rpc/bl_place_order", { json: { payload: payload }, token: null, timeoutMs: 20000 });
  }

  /* ---------------- admin ---------------- */
  function adminSaveProduct(p) {
    /* p is the LOCAL product object ({id,slug,name,cat,price,oldPrice,badge,
     * desc,colors,sizes:[{name,stock}],images,active,available,tone,mono}) */
    var row = {
      id: p.id, slug: p.slug, name: p.name, description: p.desc || "",
      category: p.cat || "clothing", price: Math.round(Number(p.price) || 0),
      old_price: p.oldPrice == null ? null : Math.round(Number(p.oldPrice) || 0),
      badge: p.badge || null, active: p.active !== false,
      colors: Array.isArray(p.colors) ? p.colors : [],
      images: Array.isArray(p.images) ? p.images : [],
      tone: p.tone || "champagne", mono: p.mono || String(p.name || "L").charAt(0),
    };
    var upsertQ = "?on_conflict=id&select=id";
    return adminFetch("POST", "/rest/v1/products" + upsertQ, {
      json: row,
      prefer: "resolution=merge-duplicates,return=representation",
    }).then(function (saved) {
      var pid = p.id;
      /* replace sizes wholesale */
      return adminFetch("DELETE", "/rest/v1/product_sizes?product_id=eq." + encodeURIComponent(pid), { prefer: "return=minimal" })
        .then(function () {
          var chain = Promise.resolve();
          var sizes = p.sizes || [];
          for (var i = 0; i < sizes.length; i++) {
            chain = chain.then(function (sz) {
              if (!sz || sz.name === "") return Promise.resolve();
              return adminFetch("POST", "/rest/v1/product_sizes?select=product_id", {
                json: { product_id: pid, name: sz.name, stock: Math.max(0, Math.round(Number(sz.stock) || 0)) },
                prefer: "resolution=ignore-duplicates,return=minimal",
              }).catch(function (e) { if (e.status === 409) return null; throw e; });
            }.bind(null, sizes[i]));
          }
          return chain;
        }).then(function () { return { id: pid }; });
    });
  }
  function adminDeleteProduct(id) {
    return adminFetch("DELETE", "/rest/v1/products?id=eq." + encodeURIComponent(id), { prefer: "return=minimal" });
  }
  function adminSetActive(id, active) {
    return adminFetch("PATCH", "/rest/v1/products?id=eq." + encodeURIComponent(id), {
      json: { active: !!active }, prefer: "return=minimal",
    });
  }
  function rpc(name, args) {
    return adminFetch("POST", "/rest/v1/rpc/" + name, { json: args, timeoutMs: 15000 });
  }
  function adminChangeStock(productId, sizeName, delta) {
    return rpc("bl_change_stock", { p_product_id: productId, p_size: sizeName, p_delta: Math.round(Number(delta) || 0) });
  }
  function adminSetOrderStatus(id, status) {
    return rpc("bl_set_order_status", { p_order_id: id, p_status: status });
  }
  function adminVerifyPayment(id) { return rpc("bl_verify_payment", { p_order_id: id }); }
  function adminRejectPayment(id) { return rpc("bl_reject_payment", { p_order_id: id }); }
  function adminListOrders() {
    return adminFetch("POST", "/rest/v1/rpc/bl_list_orders", { json: {}, timeoutMs: 15000 });
  }
  /* Full admin refresh: ALL products (+sizes) + orders + settings. */
  function adminRefresh() {
    var q = "?select=" + encodeURIComponent(PROD_SELECT) + "&order=created_at";
    return Promise.all([
      adminFetch("GET", "/rest/v1/products" + q, {}),
      adminFetch("GET", "/rest/v1/product_sizes?select=product_id,name,stock&order=product_id", {}),
      adminFetch("GET", "/rest/v1/website_settings?select=data&id=eq.1", {}),
      adminListOrders().catch(function () { return []; }),
    ]).then(function (all) {
      var sizeRows = all[1] || [];
      var sizeMap = {};
      for (var i = 0; i < sizeRows.length; i++) {
        var sr = sizeRows[i];
        (sizeMap[sr.product_id] = sizeMap[sr.product_id] || []).push({ name: sr.name, stock: Math.max(0, Math.round(Number(sr.stock) || 0)) });
      }
      BL.applyCatalog(hydrate(all[0] || [], sizeMap, true));
      var sett = all[2] && all[2].length && all[2][0].data ? all[2][0].data : null;
      if (sett) BL.applyCloudSettings(sett);
      var orders = normalizeOrders(all[3] || []);
      BL.applyOrders(orders);
      return { orders: orders.length, products: BL.getProducts().length };
    });
  }
  function normalizeOrders(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o || !o.id) continue;
      out.push({
        id: o.id, createdAt: o.createdAt || o.created_at || null,
        customer: o.customer && typeof o.customer === "object" ? o.customer : {},
        items: Array.isArray(o.items) ? o.items : [],
        subtotal: o.subtotal, deliveryFee: o.deliveryFee || 0, total: o.total,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus || "pending",
        orderStatus: o.orderStatus || "pending",
        paymentReference: o.paymentReference || "", paymentProof: o.paymentProof || null,
        stockRestoredAt: o.stockRestoredAt || null, stockRestore: o.stockRestore || null,
        cloud: true,
      });
    }
    return out;
  }
  function adminWriteSettings() {
    var s = BL.settings();
    var data = {};
    for (var i = 0; i < CLOUD_KEYS.length; i++) {
      var k = CLOUD_KEYS[i];
      if (s[k] !== undefined) data[k] = JSON.parse(JSON.stringify(s[k]));
    }
    return adminFetch("GET", "/rest/v1/website_settings?select=id&id=eq.1", {}).then(function (rows) {
      if (rows && rows.length) {
        return adminFetch("PATCH", "/rest/v1/website_settings?id=eq.1", { json: { data: data }, prefer: "return=minimal" });
      }
      return adminFetch("POST", "/rest/v1/website_settings", { json: { id: 1, data: data }, prefer: "return=minimal" });
    });
  }
  /* One-time import of the local browser mirror into an empty cloud. */
  function adminImportLocal() {
    var snap = BL.cloudExport ? BL.cloudExport() : { products: [], orders: [], settings: null };
    var report = [];
    return tableCount("/rest/v1/products").then(function (pCount) {
      return tableCount("/rest/v1/orders").then(function (oCount) {
        var seq = Promise.resolve();
        if (pCount === 0) {
          var products = snap.products || [];
          for (var i = 0; i < products.length; i++) {
            seq = seq.then(function (p) {
              return adminSaveProduct(p).then(function () { report.push("produit " + p.id); });
            }.bind(null, products[i]));
          }
        } else report.push("catalogue cloud déjà rempli — non écrasé");
        if (oCount === 0) {
          /* historical orders are imported as records (no re-deduction) */
          var orders = snap.orders || [];
          for (var j = 0; j < orders.length; j++) {
            seq = seq.then(function (o) { return importOrder(o).then(function () { report.push("commande " + o.id); }); }.bind(null, orders[j]));
          }
        } else report.push("commandes cloud déjà présentes — non écrasées");
        return seq.then(function () {
          return adminWriteSettings().catch(function () { /* settings best-effort */ });
        }).then(function () { return report; });
      });
    });
  }
  function importOrder(o) {
    var cus = o.customer || {};
    var method = o.paymentMethod === "cod" ? "cod" : "baridimob";
    var wCode = wilayaCodeFromName(cus.wilaya);
    var lines = (o.items || []).filter(function (it) { return !!it.pid; }).map(function (it) {
      return { product_id: it.pid, size: it.size || "", qty: Math.max(1, it.quantity || 1) };
    });
    var orderPayload = function () {
      return {
        customer: {
          firstName: cus.firstName || "", lastName: cus.lastName || "",
          phone: cus.phone || "", wilaya: cus.wilaya || "",
          commune: cus.commune || "", address: cus.address || "", notes: cus.notes || "",
        },
        wilaya_code: wCode || 16,
        method: method,
        reference: o.paymentReference || "",
        proof: o.paymentProof || null,
        lines: lines,
      };
    };
    if (!lines.length) return Promise.resolve(null);   /* nothing importable (all deleted) */
    return placeOrder(orderPayload()).then(function (res) {
      /* preserve the original history: creation date + order/payment status */
      var rec = res && res.ok && res.order ? res.order : null;
      if (!rec) return null;
      var patch = {
        created_at: o.createdAt ? new Date(o.createdAt).toISOString() : undefined,
        order_status: o.orderStatus || rec.orderStatus,
        payment_status: o.paymentStatus || rec.paymentStatus,
      };
      if (o.paymentReference) patch.payment_reference = o.paymentReference;
      if (o.paymentProof) patch.payment_proof = o.paymentProof;
      return adminFetch("PATCH", "/rest/v1/orders?id=eq." + encodeURIComponent(rec.id), {
        json: patch, prefer: "return=minimal",
      }).then(function () { return rec; });
    }).catch(function (e) {
      /* lines referencing deleted products cannot be re-ordered (the RPC
       * rejects the whole order): skip the historical records that only
       * reference products that no longer exist */
      var remaining = (o.items || []).filter(function (it) {
        return it.pid && BL.getProduct(it.pid);
      }).map(function (it) {
        return { product_id: it.pid, size: it.size || "", qty: Math.max(1, it.quantity || 1) };
      });
      if (!remaining.length) return null;
      lines = remaining;
      return placeOrder(orderPayload()).then(function (res) {
        var rec = res && res.ok && res.order ? res.order : null;
        return rec || null;
      }).catch(function () { return null; });
    });
  }
  function wilayaCodeFromName(name) {
    var list = BL.WILAYAS || [];
    var n = String(name || "").trim().toLowerCase();
    for (var i = 0; i < list.length; i++) if (String(list[i].name).toLowerCase() === n) return list[i].code;
    return 0;
  }

  /* ---------------- storage (authenticated admin) ---------------- */
  function storageXhr(method, objectPath, headers, body, onProgress) {
    var c = cfg();
    return ensureFreshSession().then(function (s) {
      if (!s) throw new Error("Session expirée — reconnectez-vous.");
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, c.url + "/storage/v1/object/" + objectPath);
        xhr.setRequestHeader("apikey", c.anonKey);
        xhr.setRequestHeader("Authorization", "Bearer " + s.access_token);
        var keys = Object.keys(headers || {});
        for (var i = 0; i < keys.length; i++) xhr.setRequestHeader(keys[i], headers[keys[i]]);
        if (onProgress && xhr.upload) {
          xhr.upload.onprogress = function (ev) {
            if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
          };
        }
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve(true);
          else {
            var msg = "Opération refusée (statut " + xhr.status + ")";
            try { var j = JSON.parse(xhr.responseText || "{}"); if (j && j.message) msg = j.message; } catch (e) { /* ignore */ }
            reject(new Error(msg));
          }
        };
        xhr.onerror = function () { reject(new Error("Erreur réseau pendant l'opération.")); };
        xhr.send(body);
      });
    });
  }
  function storageUpload(objectPath, body, headers, onProgress) {
    return storageXhr("PUT", objectPath, headers, body, onProgress).then(function () {
      return publicBase(cfg()) + "/" + objectPath;
    });
  }
  function storageDelete(objectPath) {
    return storageXhr("DELETE", objectPath, {}, null, null);
  }
  function adminUploadHero(file, onProgress) {
    return storageUpload(HERO_OBJECT, file, {
      "Content-Type": file.type || "video/mp4",
      "x-upsert": "true",
    }, onProgress);
  }
  function adminRemoveHero() {
    return storageDelete(HERO_OBJECT);
  }
  /* Product images: JPG/JPEG/PNG/WEBP/SVG, direct from the Admin panel.
   * SVG files are sanitised client-side (scripts / foreignObject / event
   * handlers / javascript: URLs removed) before they ever reach the bucket. */
  function sanitizeSvg(text) {
    return String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
      .replace(/\s(href|xlink:href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
  }
  function extFor(name) {
    var m = String(name || "").match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "";
  }
  function adminUploadProductImage(file, productId, index, onProgress) {
    if (!file) return Promise.reject(new Error("Aucun fichier."));
    var ext = extFor(file.name);
    var mimeOk = /image\/(jpeg|png|webp|svg\+xml)/i.test(file.type || "") || /\.(jpe?g|png|webp|svg)$/i.test(file.name || "");
    if (!mimeOk) return Promise.reject(new Error("Format non pris en charge : JPG, PNG, WEBP ou SVG uniquement."));
    if (file.size > 8 * 1048576) return Promise.reject(new Error("Image trop volumineuse (8 Mo max)."));
    var stamp = new Date().getTime().toString(36);
    var objectPath = IMG_FOLDER + "/" + (productId || "p") + "-" + index + "-" + stamp + "." + (ext || "jpg");
    var chain = Promise.resolve(file);
    if (ext === "svg") {
      chain = new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(new Blob([sanitizeSvg(String(r.result))], { type: "image/svg+xml" })); };
        r.onerror = function () { reject(new Error("Lecture du SVG impossible.")); };
        r.readAsText(file);
      });
    }
    return chain.then(function (body) {
      return storageUpload(objectPath, body, {
        "Content-Type": ext === "svg" ? "image/svg+xml" : (file.type || "image/jpeg"),
      }, onProgress);
    });
  }
  function adminRemoveProductImage(publicUrlOrPath) {
    var c = cfg();
    var base = publicBase(c) + "/";
    var p = String(publicUrlOrPath || "");
    var path = p.indexOf(base) === 0 ? p.slice(base.length) : p;
    path = path.split("?")[0];
    if (!path || path.indexOf(IMG_FOLDER + "/") !== 0) {
      /* legacy/remote image — nothing stored in our bucket to delete */
      return Promise.resolve(false);
    }
    return storageDelete(path).then(function () { return true; });
  }

  /* ---------------- boot hook for BL.whenReady ---------------- */
  var bootState = { ready: false, ok: false, error: null, started: false };
  function startBoot() {
    if (bootState.started) return;
    bootState.started = true;
    BL.setCloudReadyHook(function () { return bootPromise; });
    /* If the config is missing (offline dev) the local mirror stays. */
    bootPromise = (configured() ? syncStorefront({}) : Promise.resolve({ ok: false, reason: "unconfigured" }))
      .then(function (r) {
        bootState.ready = true; bootState.ok = !!(r && r.ok); return bootState;
      })
      .catch(function (e) {
        bootState.ready = true; bootState.ok = false; bootState.error = (e && e.message) || String(e);
        return bootState;
      });
  }
  var bootPromise = null;

  /* auto start once the DOM layer is present */
  try { startBoot(); } catch (e) { /* ignore */ }

  window.BL.cloud = {
    configured: configured,
    session: session,
    isAdmin: isAdmin,
    sessionEmail: sessionEmail,
    status: function () {
      return { configured: configured(), ready: bootState.ready, ok: bootState.ok, error: bootState.error };
    },
    signIn: signIn,
    signOut: signOut,
    syncStorefront: syncStorefront,
    placeOrder: placeOrder,
    admin: {
      refreshAll: adminRefresh,
      saveProduct: adminSaveProduct,
      deleteProduct: adminDeleteProduct,
      setActive: adminSetActive,
      changeStock: adminChangeStock,
      setOrderStatus: adminSetOrderStatus,
      verifyPayment: adminVerifyPayment,
      rejectPayment: adminRejectPayment,
      listOrders: adminListOrders,
      writeSettings: adminWriteSettings,
      importLocal: adminImportLocal,
      uploadHero: adminUploadHero,
      removeHero: adminRemoveHero,
      uploadProductImage: adminUploadProductImage,
      removeProductImage: adminRemoveProductImage,
    },
  };
})();
