/*
 * by Leïlah — Administration console
 * -----------------------------------
 * Runs on top of the shared store layer (window.BL, store.js).
 * Sections: dashboard, orders, payments, stock, video, customers, settings.
 */
(function () {
  "use strict";
  var BL = window.BL;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Supabase Auth gate ----------
   * The Admin console requires a Supabase Auth session whose user carries the
   * "admin" role claim; RLS enforces it server-side on every table & bucket.
   * No browser-only PIN is used for security anymore. */
  function envPin() {
    return BL.envAdminPin();
  }
  function cloudAuthed() {
    return !!(window.BL.cloud && BL.cloud.isAdmin && BL.cloud.isAdmin());
  }
  function cloudReady() {
    return !!(window.BL.cloud && BL.cloud.configured && BL.cloud.configured());
  }
  /* Every local settings save is ALSO pushed to Supabase (website_settings)
   * when an admin session is active — no silent local-only saves. */
  (function patchSettingsSave() {
    var orig = BL.saveSettings;
    BL.saveSettings = function (obj) {
      var ok = orig(obj);
      try {
        if (ok && cloudAuthed() && window.BL.cloud && BL.cloud.admin && BL.cloud.admin.writeSettings) {
          BL.cloud.admin.writeSettings().catch(function (err) {
            toast("Réglages non synchronisés vers Supabase : " + ((err && err.message) || "erreur"), "err");
          });
        }
      } catch (e) { /* keep local behaviour */ }
      return ok;
    };
  })();

  /* ---------- icons (lucide-style path data) ---------- */
  var P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
    package: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>',
    boxes: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19V13.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    upload: '<path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    play: '<path d="m6 4 14 8-14 8Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    arrow: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>'
  };
  function ico(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || "") + "</svg>";
  }

  /* ---------- copy ---------- */
  var T = {
    "admin.dashboard": "Tableau de bord", "admin.orders": "Commandes", "admin.payments": "Vérification des paiements",
    "admin.stock": "Stock", "admin.video": "Vidéo d’accueil", "admin.customers": "Clientes", "admin.settings": "Réglages",
    "admin.revenue": "Chiffre d’affaires", "admin.ordersCount": "Commandes", "admin.pendingPayments": "Paiements à vérifier",
    "admin.avgOrder": "Panier moyen", "admin.recentOrders": "Commandes récentes", "admin.markVerified": "Marquer comme vérifié",
    "admin.markRejected": "Refuser", "admin.changeStatus": "Changer le statut", "admin.deliveryFees": "Frais de livraison",
    "admin.customer": "Cliente", "admin.total": "Total", "admin.proof": "Preuve", "admin.reference": "Référence",
    "admin.noProof": "Aucune preuve", "admin.stock": "Stock", "admin.price": "Prix", "admin.product": "Produit",
    "admin.category": "Catégorie", "admin.all": "Tous", "admin.search": "Rechercher", "admin.backToStore": "Retour à la boutique",
    "admin.lowStock": "Stock faible", "admin.verifyIntro": "Vérifiez manuellement chaque preuve BaridiMob avant de valider la commande.",
    "admin.noPending": "Aucun paiement en attente de vérification.",
    "payment.cod": "Paiement à la livraison", "payment.baridimob": "BaridiMob",
    "paymentStatus.pending": "En attente", "paymentStatus.verification_required": "Vérification requise",
    "paymentStatus.verified": "Vérifié", "paymentStatus.rejected": "Refusé",
    "status.pending": "En attente", "status.confirmed": "Confirmée", "status.preparing": "En préparation",
    "status.shipped": "Expédiée", "status.delivered": "Livrée", "status.cancelled": "Annulée",
    "order.subtotal": "Sous-total", "order.delivery": "Livraison", "order.total": "Total", "common.free": "Offerte",
    "checkout.phone": "Téléphone", "checkout.wilaya": "Wilaya", "checkout.homeDelivery": "Livraison à domicile",
    "footer.contact": "Contact", "proof.title": "Preuve de paiement", "shop.empty": "Aucun résultat",
    "baridi.storeName": "Nom du magasin", "baridi.paymentInfo": "Informations de paiement", "baridi.account": "Compte / RIP",
    "baridi.phone": "Téléphone", "cta.freeShippingReached": "Livraison offerte à partir de", "nav.pajamas": "Pyjamas",
    "nav.clothing": "Vêtements", "nav.shoes": "Chaussures", "nav.handbags": "Sacs"
  };
  function t(k) { return T[k] !== undefined ? T[k] : k; }

  /* ---------- small ui helpers ---------- */
  var ORDER_STATUSES = BL.ORDER_STATUSES;
  function esc(s) { return BL.esc(s); }
  function money(n) { return BL.money(n); }
  function fmtDate(iso) { return BL.fmtDate(iso); }
  function pill(label, tone) { return '<span class="pill pill-' + tone + '">' + esc(label) + "</span>"; }
  function payTone(s) {
    return s === "verified" ? "positive" : s === "rejected" ? "negative" : s === "verification_required" ? "warn" : "neutral";
  }
  function toast(msg, type) {
    var el = $("toast"), tx = $("toast-text");
    if (!el) return;
    tx.textContent = msg;
    el.classList.remove("show", "err", "ok");
    if (type === "err") el.classList.add("err");
    else if (type === "ok") el.classList.add("ok");
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("show"); }, 3000);
  }
  function openModal(html, small) {
    var root = $("modal-root");
    root.innerHTML = '<div class="modal' + (small ? " sm" : "") + '">' + html + "</div>";
    root.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("modal-root").hidden = true;
    $("modal-root").innerHTML = "";
    document.body.style.overflow = "";
  }
  function modalHead(title, sub) {
    return '<div class="modal-head"><div><h3>' + esc(title) + "</h3>" + (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") +
      "</div><button class=\"modal-x\" data-mact=\"close\" aria-label=\"Fermer\">" + ico("x") + "</button></div>";
  }
  function modalFoot(buttons) {
    return '<div class="modal-foot">' + buttons + "</div>";
  }
  function btnX(label, mact, cls) {
    return '<button class="btn-x' + (cls ? " " + cls : "") + '" data-mact="' + mact + '">' + label + "</button>";
  }

  /* ---------- state ---------- */
  var state = {
    section: "dashboard", expanded: null,
    q: "", cat: "all", avail: "all",
    pendingDelete: null, adjust: null, confirmCb: null,
    video: { pendingFile: null, pendingUrl: null, savedUrl: null, saving: false, pct: 0 },
  };

  /* ---------- dashboard ---------- */
  function stats() {
    var prods = BL.getProducts(), orders = BL.db().orders || [];
    var totalStock = BL.totalStock;
    var inStock = 0, out = 0, low = 0;
    prods.forEach(function (p) {
      var s = totalStock(p);
      if (s > 0 && p.available !== false) inStock++; else out++;
      if (s > 0 && s <= 4) low++;
    });
    var pending = 0, delivered = 0, revenue = 0, live = 0;
    orders.forEach(function (o) {
      if (o.orderStatus === "cancelled") return;
      if (o.orderStatus === "delivered") delivered++;
      if (o.orderStatus === "pending" || o.paymentStatus === "verification_required") pending++;
      revenue += o.total; live++;
    });
    return {
      products: prods.length, inStock: inStock, out: out, low: low,
      orders: orders.length, pending: pending, delivered: delivered,
      revenue: revenue, avg: live ? Math.round(revenue / live) : 0,
      pendingPay: orders.filter(function (o) { return o.paymentStatus === "verification_required"; }).length,
    };
  }

  function sortedOrders() {
    return (BL.db().orders || []).slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    });
  }

  /* ---------- order rows ---------- */
  function orderRow(o, showActions) {
    var open = state.expanded === o.id;
    var h = '<div class="order-row" data-row="' + esc(o.id) + '">';
    h += '<div class="order-head" data-act="toggle" data-id="' + esc(o.id) + '" role="button" tabindex="0">';
    h += '<span class="o-id" dir="ltr">' + esc(o.id) + "</span>";
    h += '<span class="o-cust"><span class="nm">' + esc(o.customer.firstName + " " + o.customer.lastName) + "</span>" +
      '<span class="mt">' + esc(o.customer.commune + ", " + o.customer.wilaya) + " · " + esc(fmtDate(o.createdAt)) + "</span></span>";
    h += '<span class="o-total">' + esc(money(o.total)) + "</span>";
    h += '<span class="o-tags">' +
      pill(o.paymentMethod === "cod" ? t("payment.cod") : t("payment.baridimob"), "neutral") +
      pill(t("paymentStatus." + o.paymentStatus), payTone(o.paymentStatus)) +
      "</span>";
    h += '<span class="chev' + (open ? " open" : "") + '">' + ico("chevron") + "</span>";
    h += "</div>";
    if (open) {
      h += '<div class="order-body">';
      h += '<ul class="o-items">';
      (o.items || []).forEach(function (it) {
        h += "<li><span><span class=\"it-name\">" + esc(it.name) + "</span> <span class=\"it-meta\">· " + esc(it.colorLabel || "") + " · " + esc(it.size) + " · ×" + it.quantity + "</span></span>" +
          '<span class="it-price">' + esc(money(it.price * it.quantity)) + "</span></li>";
      });
      h += "</ul>";
      h += '<div class="o-tot">' +
        "<span>" + t("order.subtotal") + ": <b>" + esc(money(o.subtotal)) + "</b></span>" +
        "<span>" + t("order.delivery") + ": <b>" + (o.deliveryFee === 0 ? t("common.free") : esc(money(o.deliveryFee))) + "</b></span>" +
        "<span>" + t("order.total") + ": <b>" + esc(money(o.total)) + "</b></span></div>";
      if (o.customer.notes) h += '<p class="o-note">“' + esc(o.customer.notes) + "”</p>";
      if (o.stockRestoredAt) {
        h += '<p class="o-note" style="color:#7C9A6B">Stock restitué au catalogue le ' + esc(fmtDate(o.stockRestoredAt)) + ' (l’historique de la commande est conservé).</p>';
      }
      if (o.paymentMethod === "baridimob") {
        h += '<div class="o-proof"><p class="plab">' + t("admin.proof") + "</p>";
        if (o.paymentProof) {
          h += '<p class="pfile">' + ico("file") + '<span class="fn" dir="ltr">' + esc(o.paymentProof.fileName) + "</span>" +
            '<span class="sz">(' + Math.round(o.paymentProof.fileSize / 1024) + " KB)</span></p>";
        } else {
          h += '<p class="pfile" style="color:var(--mocha)">' + t("admin.noProof") + "</p>";
        }
        if (o.paymentReference) h += '<p class="pref">' + t("admin.reference") + ': <b dir="ltr">' + esc(o.paymentReference) + "</b></p>";
        h += "</div>";
      }
      h += '<div class="o-actions"><label>' + t("admin.changeStatus") + "<select class=\"sel\" data-act=\"status\" data-id=\"" + esc(o.id) + "\">" +
        ORDER_STATUSES.map(function (s) { return '<option value="' + s + '"' + (o.orderStatus === s ? " selected" : "") + ">" + t("status." + s) + "</option>"; }).join("") +
        "</select></label>";
      if (showActions && o.paymentMethod === "baridimob") {
        h += '<span class="act-grp">' +
          '<button class="btn-verify" data-act="verify" data-id="' + esc(o.id) + '"' + (o.paymentStatus === "verified" ? " disabled" : "") + ">" + ico("check") + t("admin.markVerified") + "</button>" +
          '<button class="btn-reject" data-act="reject" data-id="' + esc(o.id) + '"' + (o.paymentStatus === "rejected" ? " disabled" : "") + ">" + ico("x") + t("admin.markRejected") + "</button></span>";
      }
      if (o.orderStatus !== "cancelled") {
        h += '<button class="btn-x ghost sm" data-act="cancel" data-id="' + esc(o.id) + '">' + ico("x") + "Annuler la commande</button>";
      }
      h += "</div></div>";
    }
    h += "</div>";
    return h;
  }

  /* ---------- section renderers ---------- */
  function renderDashboard() {
    var s = stats();
    var cards = [
      { label: "Produits", value: BL.esc(s.products), icon: "package" },
      { label: "En stock", value: BL.esc(s.inStock), icon: "check" },
      { label: "En rupture", value: BL.esc(s.out), icon: "alert" },
      { label: "Stock faible", value: BL.esc(s.low), icon: "boxes" },
      { label: "Commandes", value: BL.esc(s.orders), icon: "bag" },
      { label: "En attente", value: BL.esc(s.pending), icon: "clock" },
      { label: "Livrées", value: BL.esc(s.delivered), icon: "shield" },
      { label: "Chiffre d’affaires", value: esc(money(s.revenue)), icon: "trending" },
    ];
    var h = '<div class="stat-grid six">';
    cards.forEach(function (c) {
      h += '<div class="stat-card">' + ico(c.icon) + '<div class="stat-val serif">' + c.value + "</div><div class=\"stat-lbl\">" + c.label + "</div></div>";
    });
    h += "</div>";
    h += '<h2 class="sec-title">' + t("admin.recentOrders") + "</h2>";
    var recent = sortedOrders().slice(0, 5);
    h += '<div class="o-list">' + (recent.length ? recent.map(function (o) { return orderRow(o, true); }).join("") : '<div class="empty">' + ico("bag") + "<p>Aucune commande pour le moment.</p></div>") + "</div>";
    var srcNote = cloudAuthed()
      ? 'Source de vérité : <b>Supabase</b> — produits, stock et commandes synchronisés depuis le cloud (les statuts modifiés ici sont enregistrés côté serveur).'
      : (cloudReady()
        ? 'Stockage Supabase connecté — <b>connectez-vous</b> (compte admin) pour gérer les données en ligne.'
        : 'Démonstration locale (Supabase non configuré) — les données restent dans ce navigateur et ne sont pas persistées en ligne.');
    h += '<p class="mock-note">' + srcNote + '</p>';
    return h;
  }

  function filteredOrders() {
    var q = (state.oq || "").trim().toLowerCase();
    return sortedOrders().filter(function (o) {
      if (state.oStatus && state.oStatus !== "all" && o.orderStatus !== state.oStatus) return false;
      if (!q) return true;
      var hay = (o.id + " " + o.customer.firstName + " " + o.customer.lastName + " " + o.customer.phone + " " + o.customer.wilaya + " " + o.customer.commune).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  function renderOrders() {
    var cur = state.oStatus || "all";
    var h = '<div class="o-toolbar">';
    h += '<div class="search-wrap">' + ico("search") + '<input id="oq" type="text" placeholder="' + t("admin.search") + '…" value="' + esc(state.oq || "") + '" /></div>';
    h += '<select class="select-sm" id="ofilter"><option value="all"' + (cur === "all" ? " selected" : "") + ">" + t("admin.all") + "</option>" +
      ORDER_STATUSES.map(function (s) { return '<option value="' + s + '"' + (cur === s ? " selected" : "") + ">" + t("status." + s) + "</option>"; }).join("") + "</select>";
    h += "</div>";
    var list = filteredOrders();
    h += '<div class="o-list">' + (list.length ? list.map(function (o) { return orderRow(o, true); }).join("") : '<div class="empty">' + ico("search") + "<p>Aucune commande ne correspond.</p></div>") + "</div>";
    return h;
  }

  function renderPayments() {
    var list = sortedOrders().filter(function (o) { return o.paymentStatus === "verification_required"; });
    var h = '<p class="intro">' + t("admin.verifyIntro") + "</p>";
    if (list.length) h += '<div class="o-list">' + list.map(function (o) { return orderRow(o, true); }).join("") + "</div>";
    else h += '<div class="empty">' + ico("shield") + "<p>" + t("admin.noPending") + "</p></div>";
    return h;
  }

  /* ---------- stock management ---------- */
  function filteredProducts() {
    var q = state.q.trim().toLowerCase();
    return BL.getProducts().filter(function (p) {
      if (state.cat !== "all" && p.cat !== state.cat) return false;
      var s = BL.totalStock(p);
      var ok = p.available !== false && s > 0;
      if (state.avail === "ok" && !ok) return false;
      if (state.avail === "out" && ok) return false;
      if (!q) return true;
      var hay = (p.name + " " + p.slug + " " + p.id + " " + BL.catLabel(p.cat)).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  function availPill(p) {
    var s = BL.totalStock(p);
    if (s === 0) return pill("Rupture", "negative");
    if (p.available === false) return pill("Indisponible", "warn");
    return pill("Disponible", "positive");
  }
  function productRow(p) {
    var chips = (p.sizes || []).map(function (sz) {
      return '<span class="stk-chip' + (sz.stock <= 0 ? " zero" : "") + '">' + esc(sz.name) + " <b>" + sz.stock + "</b></span>";
    }).join("");
    var price = '<span class="price-num">' + esc(money(p.price)) + (p.oldPrice ? '<span class="old-price">' + esc(money(p.oldPrice)) + "</span>" : "") + "</span>";
    return '<tr>' +
      '<td><div class="prod-cell"><span class="p-thumb">' + BL.cardMediaHTML(p, { index: 0 }) + "</span>" +
      '<span class="meta"><span class="p-name">' + esc(p.name) + "</span><span class=\"p-slug\" dir=\"ltr\">" + esc(p.slug) + "</span></span></div></td>" +
      '<td style="color:var(--mocha)">' + esc(BL.catLabel(p.cat)) + "</td>" +
      "<td>" + price + "</td>" +
      '<td><span class="stk-total">' + BL.totalStock(p) + "</span> unité(s)" + (chips ? '<span class="stk-chips">' + chips + "</span>" : "") + "</td>" +
      "<td>" + availPill(p) + "</td>" +
      '<td><div class="row-actions">' +
      '<button class="btn-x ghost sm" data-act="stkUp" data-id="' + esc(p.id) + '" title="Augmenter le stock">' + ico("plus") + "Stock</button>" +
      '<button class="btn-x ghost sm" data-act="stkDown" data-id="' + esc(p.id) + '" title="Diminuer le stock">' + ico("minus") + "Stock</button>" +
      '<button class="btn-x ghost sm" data-act="editProduct" data-id="' + esc(p.id) + '">' + ico("edit") + "Modifier</button>" +
      '<button class="btn-x danger sm" data-act="delProduct" data-id="' + esc(p.id) + '">' + ico("trash") + "Supprimer</button>" +
      "</div></td></tr>";
  }
  function renderStock() {
    var h = '<div class="toolbar">';
    h += '<button class="btn-x" data-act="addProduct">' + ico("plus") + "Ajouter un produit</button>";
    h += '<div class="search-wrap">' + ico("search") + '<input id="sq" type="text" placeholder="Rechercher un produit…" value="' + esc(state.q) + '" /></div>';
    h += '<select class="select-sm" id="scat"><option value="all"' + (state.cat === "all" ? " selected" : "") + ">" + t("admin.all") + "</option>" +
      BL.CATS.map(function (c) { return '<option value="' + c.key + '"' + (state.cat === c.key ? " selected" : "") + ">" + c.label + "</option>"; }).join("") + "</select>";
    h += '<select class="select-sm" id="savail"><option value="all"' + (state.avail === "all" ? " selected" : "") + ">Toutes les disponibilités</option>" +
      '<option value="ok"' + (state.avail === "ok" ? " selected" : "") + ">Disponibles</option>" +
      '<option value="out"' + (state.avail === "out" ? " selected" : "") + ">En rupture / indisponibles</option></select>";
    h += '<span class="spacer"></span><span style="font-size:12px;color:var(--mocha)">' + BL.getProducts().length + " produits</span></div>";
    var list = filteredProducts();
    if (!list.length) {
      h += '<div class="empty">' + ico("package") + "<p>Aucun produit ne correspond à ces critères.</p></div>";
    } else {
      h += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        "<th>" + t("admin.product") + "</th><th>" + t("admin.category") + "</th><th>Prix</th><th>Quantité</th><th>Disponibilité</th><th class=\"end\">Actions</th>" +
        "</tr></thead><tbody>";
      h += list.map(productRow).join("");
      h += "</tbody></table></div>";
    }
    h += '<p class="mock-note">Le stock est suivi par taille (variante). Quand une commande est confirmée, la quantité est déduite automatiquement ; à zéro, le produit passe en « Rupture ». Annuler une commande restitue le stock. L’historique des commandes n’est jamais modifié.</p>';
    return h;
  }

  /* ---------- video manager ---------- */
  function renderVideo() {
    var meta = BL.heroLoadMeta();
    var active = BL.heroActive();
    var v = state.video;
    var connected = cloudReady();
    var authed = cloudAuthed();
    var pubUrl = BL.heroVideoUrl ? BL.heroVideoUrl() : "";
    var h = '<div class="sect">';
    h += '<div class="video-box"><h3>Vidéo de fond — page d’accueil</h3>';
    h += '<div class="video-meta"><span>' + (authed
      ? '✅ Connecté — la publication remplace hero/home-hero.mp4 et est immédiatement visible par tous les visiteurs'
      : (connected
        ? '⚠️ Connexion administrateur requise pour publier la vidéo (Supabase Auth).'
        : '⚠️ Stockage cloud non configuré — publication indisponible.')) + '</span></div>';
    if (pubUrl) {
      h += '<div class="video-meta"><span>URL publique : <b>' + esc(pubUrl) + '</b></span><span>' + (pubUrl.indexOf('blob:') === 0 || pubUrl.indexOf('localhost') !== -1 ? '⚠️ URL non publique' : '✅ Visible par tous les visiteurs') + '</span></div>';
    }
    if (active) {
      h += '<div class="video-meta"><span>Dernière publication : <b>' + esc(meta.fileName) + '</b> (' + BL.humanSize(meta.fileSize) + ')</span><span>le ' + esc(BL.fmtDate(meta.updatedAt)) + '</span></div>';
    } else {
      h += '<div class="video-meta"><span>Aucune vidéo publiée — l’accueil utilise son fond par défaut (image soie).</span></div>';
    }
    var src = v.pendingUrl || v.savedUrl;
    h += '<div class="video-player">';
    if (src) h += '<video controls muted playsinline loop src="' + src + '"></video>';
    else h += '<div class="video-empty">' + (active ? 'Chargement de l’aperçu…' : 'Aucune vidéo définie') + '</div>';
    h += '</div>';
    if (v.pendingFile) {
      h += '<div class="video-meta" style="margin-top:10px"><span>Sélection : <b>' + esc(v.pendingFile.name) + '</b> (' + BL.humanSize(v.pendingFile.size) + ')</span></div>';
    }
    h += '<div class="video-actions">';
    h += '<input type="file" id="vfile" accept="video/mp4,video/webm,video/quicktime,video/ogg" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" />';
    h += '<button class="btn-x" data-act="pickVideo">' + ico('upload') + (active ? 'Remplacer la vidéo' : 'Choisir une vidéo') + '</button>';
    if (v.pendingFile) {
      h += '<button class="btn-x ghost" data-act="saveVideo">' + ico('check') + (authed ? 'Publier la vidéo' : 'Enregistrer (aperçu local)') + '</button>';
      h += '<button class="btn-x ghost" data-act="exportVideo">' + ico('download') + 'Télécharger une copie (.mp4)</button>';
      h += '<button class="btn-x ghost" data-act="cancelVideo">' + ico('x') + 'Annuler la sélection</button>';
    }
    if (active && !v.pendingFile) {
      h += '<button class="btn-x danger" data-act="removeVideo">' + ico('trash') + 'Retirer la vidéo</button>';
    }
    h += '</div>';
    h += '<div class="progress' + (v.saving ? ' show' : '') + '"><div class="bar"><div class="fill" style="width:' + v.pct + '%"></div></div><span class="pct">' + Math.round(v.pct) + '%</span></div>';
    h += '<p class="video-note"><b>Comment ça marche :</b> « Publier la vidéo » téléverse le fichier vers le stockage cloud (Supabase) à une adresse fixe, puis l’URL publique est utilisée automatiquement par la page d’accueil — visible immédiatement par tous les visiteurs, sur tous les appareils. Remplacer une vidéo écrase le même objet : l’URL publique ne change jamais. Aucun export, copie de fichier ni redéploiement nécessaire. Formats : MP4 (recommandé), WebM · 40 Mo max. Le bouton « Télécharger une copie » n’est qu’une sauvegarde locale facultative.</p>';
    h += '</div>';
    h += '</div>';
    return h;
  }
  /* ---------- customers ---------- */
  function renderCustomers() {
    var map = {}, order = [];
    sortedOrders().forEach(function (o) {
      var k = o.customer.phone;
      if (map[k]) { map[k].count++; map[k].total += o.total; }
      else {
        map[k] = { name: o.customer.firstName + " " + o.customer.lastName, phone: o.customer.phone, wilaya: o.customer.wilaya, count: 1, total: o.total };
        order.push(k);
      }
    });
    order.sort(function (a, b) { return map[b].total - map[a].total; });
    var h = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      "<th>" + t("admin.customer") + "</th><th>" + t("checkout.phone") + "</th><th>" + t("checkout.wilaya") + "</th><th>" + t("admin.orders") + "</th><th class=\"end\">" + t("admin.total") + "</th>" +
      "</tr></thead><tbody>";
    if (!order.length) h += '<tr><td colspan="5" style="color:var(--mocha)">Aucune cliente pour le moment.</td></tr>';
    order.forEach(function (k) {
      var c = map[k];
      h += "<tr><td style=\"color:var(--ink)\">" + esc(c.name) + "</td><td style=\"color:var(--mocha)\" dir=\"ltr\">" + esc(c.phone) + "</td>" +
        "<td style=\"color:var(--mocha)\">" + esc(c.wilaya) + "</td><td style=\"color:var(--mocha)\">" + c.count + "</td>" +
        '<td class="end" style="color:var(--ink)">' + esc(money(c.total)) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    return h;
  }

  /* ---------- settings ---------- */
  function setRow(label, value) {
    return '<div class="set-row"><dt>' + esc(label) + "</dt><dd dir=\"ltr\">" + esc(value) + "</dd></div>";
  }
  function renderSettings() {
    var st = BL.STORE, bd = BL.BARIDIMOB;
    var s = BL.settings();
    var th = s.theme || { defaultTheme: "light", allowSwitch: true };
    var ct = s.contact || {};
    var ab = s.about || {};
    var ns = s.newSection || {};
    var cs = s.comingSoon || {};
    var socials = s.socials || [];
    var hvUrl = s.heroVideoUrl || "";
    var h = '<div class="settings">';
    /* Store Info */
    h += '<section class="set-block"><h2>' + esc(st.name) + '</h2><dl>' +
      setRow('Nom légal', st.legalName) + setRow(t('checkout.phone'), st.phone) + setRow('Email', st.email) +
      setRow(t('footer.contact'), st.city + ', ' + st.country) + '</dl></section>';
    /* BaridiMouB */
    h += '<section class="set-block"><h2>' + t('payment.baridimob') + '</h2><dl>' +
      setRow(t('baridi.storeName'), bd.storeName) + setRow(t('baridi.paymentInfo'), bd.paymentInformation) +
      setRow(t('baridi.account'), bd.accountInformation) + setRow(t('baridi.phone'), bd.phone) + '</dl></section>';
    /* Delivery Fees */
    h += '<section class="set-block"><h2>' + t('admin.deliveryFees') + '</h2><dl>' +
      setRow('Frais par défaut', money(BL.DEFAULT_HOME_FEE)) +
      setRow(t('cta.freeShippingReached'), money(BL.FREE_DELIVERY_THRESHOLD)) + '</dl></section>';
    /* Theme Settings */
    h += '<section class="set-block"><h2>Paramètres du thème</h2>';
    h += '<div class="f-grid two" style="margin-top:12px">';
    h += '<div class="fld"><span class="lbl">Thème par défaut</span>';
    h += '<label style="display:flex;gap:12px;margin-top:6px;font-size:13px"><input type="radio" name="defTheme" value="light"' + (th.defaultTheme !== 'dark' ? ' checked' : '') + ' /> ☀️ Clair</label>';
    h += '<label style="display:flex;gap:12px;margin-top:4px;font-size:13px"><input type="radio" name="defTheme" value="dark"' + (th.defaultTheme === 'dark' ? ' checked' : '') + ' /> 🌙 Sombre</label></div>';
    h += '<div class="fld"><span class="lbl">Allow Theme Switch</span>';
    h += '<label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px"><input type="checkbox" id="allowSwitch"' + (th.allowSwitch !== false ? ' checked' : '') + ' /> Activer le bouton de thème pour les visiteurs</label>';
    h += '<button class="btn-x" data-act="saveTheme" style="margin-top:12px">Enregistrer le thème</button></div></div></section>';
    /* Supabase Storage — hero video */
    var sb = s.supabase || {};
    var sbOk = !!(sb.url && sb.anonKey);
    h += '<section class="set-block"><h2>Stockage vidéo — Supabase</h2>';
    h += '<p class="video-note">' + (sbOk
      ? '✅ Connecté — les vidéos publiées sont immédiatement visibles par tous les visiteurs.'
      : '⚠️ Non configuré. Créez un projet Supabase (gratuit), exécutez le SQL ci-dessous une fois dans Supabase → SQL Editor, puis collez l’URL du projet et la clé « anon » (publique par conception).') + '</p>';
    h += '<div class="f-grid two" style="margin-top:12px">';
    h += '<div class="fld"><span class="lbl">URL du projet Supabase</span>';
    h += '<input class="inp" id="sb-url" type="text" value="' + esc(sb.url || '') + '" placeholder="https://xxxx.supabase.co" /></div>';
    h += '<div class="fld"><span class="lbl">Clé anon (publique)</span>';
    h += '<input class="inp" id="sb-key" type="text" value="' + esc(sb.anonKey || '') + '" placeholder="eyJhbGciOi…" /></div>';
    h += '</div>';
    h += '<button class="btn-x" data-act="saveSupabase" style="margin-top:12px">Enregistrer le stockage</button>';
    h += '<p class="video-note">Schéma Supabase : exécutez une fois <b>supabase/schema.sql</b> (Supabase → SQL Editor). Il crée/complète les tables (products, product_sizes, orders, order_items, website_settings), active la RLS, définit le rôle admin et verrouille le bucket « byleilah » : lecture publique, écritures réservées au compte administrateur.</p>';
    h += '<p class="video-note">✅ Depuis cette version, la publication vidéo passe par un vrai compte administrateur (Supabase Auth). Le panneau ne peut plus être utilisé avec un simple code local ; sans connexion, aucune écriture n’est envoyée au cloud.</p>';
    h += '<p class="video-note">Astuce : définissez SUPABASE_URL et SUPABASE_ANON_KEY dans les variables d’environnement du déploiement — le build les injecte automatiquement dans supabase-config.js et aucun réglage manuel n’est nécessaire.</p>';
    h += '</section>';
    /* Hero Video URL (optional override) */
    h += '<section class="set-block"><h2>Vidéo d\'accueil — URL publique (optionnelle)</h2>';
    if (hvUrl) { h += '<div class="video-meta"><span>URL active : <b>' + esc(hvUrl) + '</b></span></div>'; }
    h += '<div class="f-grid two" style="margin-top:12px">';
    h += '<div class="fld"><span class="lbl">URL HTTPS personnalisée (CDN…)</span>';
    h += '<input class="inp" id="heroVideoUrl" type="text" value="' + esc(hvUrl) + '" placeholder="https://…" /></div>';
    h += '<div class="fld"><span class="lbl">&nbsp;</span>';
    h += '<button class="btn-x" data-act="saveHeroUrl">Enregistrer l\'URL</button></div></div>';
    h += '<p class="video-note">Laissez vide pour utiliser automatiquement l’URL cloud générée à la publication de la vidéo (recommandé). Une URL HTTPS valide saisie ici remplace ce comportement.</p></section>';
    /* Contact Us */
    h += '<section class="set-block"><h2>Contactez-nous</h2><div class="f-grid">';
    h += '<div class="fld"><span class="lbl">Titre</span><input class="inp" id="ct-title" type="text" value="' + esc(ct.title || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Description</span><input class="inp" id="ct-desc" type="text" value="' + esc(ct.description || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Téléphone</span><input class="inp" id="ct-phone" type="text" value="' + esc(ct.phone || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">WhatsApp</span><input class="inp" id="ct-whatsapp" type="text" value="' + esc(ct.whatsapp || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Email</span><input class="inp" id="ct-email" type="text" value="' + esc(ct.email || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Instagram</span><input class="inp" id="ct-instagram" type="text" value="' + esc(ct.instagram || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">TikTok</span><input class="inp" id="ct-tiktok" type="text" value="' + esc(ct.tiktok || '') + '" /></div>';
    h += '<div class="fld full"><span class="lbl">Informations supplémentaires</span><textarea class="inp" id="ct-additional" rows="3">' + esc(ct.additional || '') + '</textarea></div>';
    h += '</div><button class="btn-x" data-act="saveContact" style="margin-top:12px">Enregistrer Contact</button></section>';
    /* About Us */
    h += '<section class="set-block"><h2>À propos</h2><div class="f-grid">';
    h += '<div class="fld"><span class="lbl">Titre</span><input class="inp" id="ab-title" type="text" value="' + esc(ab.title || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Description</span><input class="inp" id="ab-desc" type="text" value="' + esc(ab.description || '') + '" /></div>';
    h += '<div class="fld full"><span class="lbl">Contenu principal</span><textarea class="inp" id="ab-content" rows="5">' + esc(ab.content || '') + '</textarea></div>';
    h += '<div class="fld full"><span class="lbl">Informations supplémentaires</span><textarea class="inp" id="ab-additional" rows="3">' + esc(ab.additional || '') + '</textarea></div>';
    h += '</div><button class="btn-x" data-act="saveAbout" style="margin-top:12px">Enregistrer À propos</button></section>';
    /* New Section */
    h += '<section class="set-block"><h2>Section Nouveautés</h2><div class="f-grid">';
    h += '<div class="fld"><span class="lbl">Titre</span><input class="inp" id="ns-title" type="text" value="' + esc(ns.title || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Description</span><input class="inp" id="ns-desc" type="text" value="' + esc(ns.description || '') + '" /></div>';
    h += '<div class="fld full"><span class="lbl">Informations supplémentaires</span><textarea class="inp" id="ns-additional" rows="2">' + esc(ns.additional || '') + '</textarea></div>';
    h += '</div><button class="btn-x" data-act="saveNewSection" style="margin-top:12px">Enregistrer Nouveautés</button></section>';
    /* Coming Soon */
    h += '<section class="set-block"><h2>Bientôt disponible</h2><div class="f-grid">';
    h += '<div class="fld"><span class="lbl">Titre</span><input class="inp" id="cs-title" type="text" value="' + esc(cs.title || '') + '" /></div>';
    h += '<div class="fld"><span class="lbl">Description</span><input class="inp" id="cs-desc" type="text" value="' + esc(cs.description || '') + '" /></div>';
    h += '<div class="fld full"><span class="lbl">Éléments (un par ligne, format: nom | description)</span><textarea class="inp" id="cs-items" rows="4">' + (cs.items || []).map(function(it){return it.name + ' | ' + (it.description||'')}).join('\n') + '</textarea></div>';
    h += '<div class="fld full"><span class="lbl">Informations supplémentaires</span><textarea class="inp" id="cs-additional" rows="2">' + esc(cs.additional || '') + '</textarea></div>';
    h += '</div><button class="btn-x" data-act="saveComingSoon" style="margin-top:12px">Enregistrer Bientôt</button></section>';
    /* Social Media */
    h += '<section class="set-block"><h2>Réseaux sociaux</h2><div id="socials-list">';
    for (var i = 0; i < socials.length; i++) {
      h += '<div class="f-grid" style="margin-bottom:8px;align-items:end">';
      h += '<div class="fld"><span class="lbl">Nom</span><input class="inp social-name" data-idx="' + i + '" type="text" value="' + esc(socials[i].name) + '" /></div>';
      h += '<div class="fld"><span class="lbl">URL</span><input class="inp social-url" data-idx="' + i + '" type="text" value="' + esc(socials[i].url) + '" /></div>';
      h += '<div class="fld"><span class="lbl">&nbsp;</span><button class="btn-x danger social-del" data-idx="' + i + '">Supprimer</button></div>';
      h += '</div>';
    }
    h += '</div>';
    h += '<button class="btn-x" data-act="addSocial" style="margin-top:8px">+ Ajouter un réseau</button> ';
    h += '<button class="btn-x" data-act="saveSocials" style="margin-top:8px">Enregistrer les réseaux</button></section>';
    /* Admin session */
    var acct = window.BL.cloud && BL.cloud.sessionEmail ? BL.cloud.sessionEmail() : "";
    h += '<section class="set-block"><h2>Compte administrateur</h2>';
    h += cloudAuthed()
      ? '<p class="video-note">✅ Connecté : <b>' + esc(acct) + '</b> — rôle admin vérifié par Supabase. Les modifications de cette page sont enregistrées dans le cloud (bouton « Déconnexion » en haut à droite).</p>'
      : '<p class="video-note">Connexion requise : e-mail + mot de passe Supabase (compte créé dans Supabase → Authentication → Users puis promu admin — voir SETUP.md).</p>';
    h += '<div style="margin-top:12px"><button class="btn-x" data-act="refreshCloud">Actualiser les données (Supabase)</button></div>';
    h += '</section>';
    /* Reset */
    h += '<section class="set-block"><h2>Migration — importer les données locales</h2>';
    h += '<p class="video-note">Importe en une seule fois le catalogue, les commandes et les réglages déjà présents dans CE navigateur vers Supabase — uniquement si le cloud est vide, rien n’est écrasé. Idéal après la première exécution du schéma.</p>';
    h += '<div style="margin-top:12px"><button class="btn-x" data-act="importLocal">Importer les données locales vers Supabase</button></div>';
    h += '</section>';
    h += '<section class="set-block"><h2>Cache local</h2>';
    h += '<p class="video-note">Réinitialise uniquement le cache de CE navigateur (produits, commandes, panier). Les données Supabase sont conservées.</p>';
    h += '<div style="margin-top:12px"><button class="btn-x danger" data-act="resetData">Réinitialiser le cache local</button></div></section>';
    h += '</div>';
    return h;
  }


  /* ---------- sections registry ---------- */
  var SECTIONS = {
    dashboard: renderDashboard, orders: renderOrders, payments: renderPayments,
    stock: renderStock, video: renderVideo, customers: renderCustomers, settings: renderSettings,
  };
  var NAV = [
    { key: "dashboard", icon: "dashboard" },
    { key: "orders", icon: "bag" },
    { key: "payments", icon: "shield" },
    { key: "stock", icon: "boxes" },
    { key: "video", icon: "video" },
    { key: "customers", icon: "users" },
    { key: "settings", icon: "settings" },
  ];
  function renderNav() {
    var s = stats();
    $("nav").innerHTML = NAV.map(function (item) {
      var active = state.section === item.key;
      var badge = (item.key === "payments" && s.pendingPay > 0) ? '<span class="nav-badge">' + s.pendingPay + "</span>" : "";
      var label = item.key === "stock" ? "Produits & stock" : t("admin." + item.key);
      return '<li><button class="nav-item' + (active ? " active" : "") + '" data-nav="' + item.key + '">' + ico(item.icon) + label + badge + "</button></li>";
    }).join("");
  }

  function paint() {
    renderNav();
    $("content").innerHTML = SECTIONS[state.section]();
    bindSection();
    BL.paintPH($("content"));
    BL.refreshBagBadges(document);
  }
  function repaint() { paint(); }

  function bindSection() {
    if (state.section === "stock") {
      var sq = $("sq");
      if (sq) sq.addEventListener("input", function () { state.q = sq.value; reListStock(); });
      var sc = $("scat");
      if (sc) sc.addEventListener("change", function () { state.cat = sc.value; reListStock(); });
      var sa = $("savail");
      if (sa) sa.addEventListener("change", function () { state.avail = sa.value; reListStock(); });
    }
    if (state.section === "orders") {
      var oq = $("oq");
      if (oq) oq.addEventListener("input", function () { state.oq = oq.value; repaint(); });
      var of = $("ofilter");
      if (of) of.addEventListener("change", function () { state.oStatus = of.value; repaint(); });
    }
    if (state.section === "video") {
      var vf = $("vfile");
      if (vf) vf.addEventListener("change", onVideoFile);
      var v = state.video;
      var el = document.querySelector("#content .video-player video");
      if (el && v.pendingUrl) { el.src = v.pendingUrl; return; }
      if (BL.heroActive()) {
        if (v.savedUrl) { if (el) el.src = v.savedUrl; }
        else {
          BL.heroGetBlob().then(function (blob) {
            if (!blob || state.section !== "video") return;
            var meta = BL.heroLoadMeta();
            if (!meta || !meta.fileName) return;
            v.savedUrl = URL.createObjectURL(blob);
            var vp = document.querySelector("#content .video-player video");
            if (vp) vp.src = v.savedUrl;
          }).catch(function () { /* preview unavailable */ });
        }
      }
    }
  }
  function reListStock() {
    /* re-render only the table region for responsiveness */
    $("content").innerHTML = SECTIONS.stock();
    bindSection();
    BL.paintPH($("content"));
  }

  /* ---------- modal builders ---------- */
  function close() { closeModal(); }

  function confirmModal(title, html, okLabel, danger, cb) {
    state.confirmCb = cb;
    openModal(
      modalHead(title, null) +
      '<div class="modal-body">' + html + "</div>" +
      modalFoot('<button class="btn-x ghost" data-mact="close">Annuler</button>' +
        '<button class="btn-x' + (danger ? " danger" : "") + '" data-mact="confirmOk">' + esc(okLabel) + "</button>"),
      true
    );
  }

  function sizeRowsHTML() { return '<div class="row-ed" style="grid-template-columns:1fr 1fr auto"><input class="mini-inp size-name" placeholder="Taille (ex. M / 38 / Unique)" /><input class="mini-inp size-stock" type="number" min="0" placeholder="Stock" /><button type="button" class="del" data-del="size" aria-label="Retirer">' + ico("x") + "</button></div>"; }
  function colorRowHTML() { return '<div class="row-ed" style="grid-template-columns:auto 1fr auto"><div class="color-pair"><input type="color" value="#E7D3B8" /><input class="mini-inp color-label" placeholder="Nom (ex. Champagne)" /></div><button type="button" class="del" data-del="color" aria-label="Retirer">' + ico("x") + "</button></div>"; }

  function productForm(p) {
    var colors = (p && p.colors && p.colors.length) ? p.colors : [{ hex: "#E7D3B8", label: "Champagne" }];
    var sizes = (p && p.sizes && p.sizes.length) ? p.sizes : [{ name: "M", stock: 0 }];
    var colorsHTML = colors.map(function (c) {
      return '<div class="row-ed" style="grid-template-columns:auto 1fr auto"><div class="color-pair"><input type="color" value="' + esc(c.hex) + '" /><input class="mini-inp color-label" placeholder="Nom (ex. Champagne)" value="' + esc(c.label) + '" /></div><button type="button" class="del" data-del="color" aria-label="Retirer">' + ico("x") + "</button></div>";
    }).join("");
    var sizesHTML = sizes.map(function (sz) {
      return '<div class="row-ed" style="grid-template-columns:1fr 1fr auto"><input class="mini-inp size-name" placeholder="Taille (ex. M / 38 / Unique)" value="' + esc(sz.name) + '" /><input class="mini-inp size-stock" type="number" min="0" value="' + esc(sz.stock) + '" /><button type="button" class="del" data-del="size" aria-label="Retirer">' + ico("x") + "</button></div>";
    }).join("");
    return modalHead(p ? p.name : "Nouveau produit", p ? "Modifiez les informations puis enregistrez." : "Complétez les informations puis enregistrez.") +
      '<div class="modal-body">' +
      '<div class="modal-err" id="m-err"></div>' +
      '<div class="f-grid two">' +
      '<div class="fld col2"><span class="lbl">Nom du produit</span><input class="inp" id="m-name" value="' + esc(p ? p.name : "") + '" placeholder="Ex. Satin Signature Pyjama" /></div>' +
      '<div class="fld"><span class="lbl">Catégorie</span><select class="inp" id="m-cat">' + BL.CATS.map(function (c) { return '<option value="' + c.key + '"' + (p && p.cat === c.key ? " selected" : "") + ">" + c.label + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld"><span class="lbl">Disponible à la vente</span><div class="chk-row"><input type="checkbox" id="m-avail" ' + ((!p || p.available !== false) ? "checked" : "") + ' /><div><div class="tt">Produit actif</div><div class="dd">Passe automatiquement en rupture si le stock atteint zéro.</div></div></div></div>' +
      '<div class="fld"><span class="lbl">Prix (DA)</span><input class="inp" id="m-price" type="number" min="0" value="' + (p ? p.price : "") + '" /></div>' +
      '<div class="fld"><span class="lbl">Ancien prix (DA) — barre l’ancien prix</span><input class="inp" id="m-old" type="number" min="0" value="' + (p && p.oldPrice ? p.oldPrice : "") + '" placeholder="Facultatif" /></div>' +
      '<div class="fld col2"><span class="lbl">Description</span><textarea class="inp" id="m-desc" placeholder="Courte description affichée sur la fiche produit">' + esc(p ? p.desc || "" : "") + "</textarea></div>" +
      "</div>" +
      '<div class="fld"><span class="lbl">Couleurs / variantes visuelles</span><div class="list-ed" id="m-colors">' + colorsHTML + "</div>" +
      '<button type="button" class="add-line" data-add="color">' + ico("plus") + "Ajouter une couleur</button></div>" +
      '<div class="fld"><span class="lbl">Tailles & stock (une ligne par variante)</span><div class="list-ed" id="m-sizes">' + sizesHTML + "</div>" +
      '<button type="button" class="add-line" data-add="size">' + ico("plus") + "Ajouter une taille</button>" +
      '<span class="hint">Le stock total (somme des tailles) est déduit à chaque commande confirmée.</span></div>' +
      '<div class="fld"><span class="lbl">Images du produit (téléversement direct)</span><div class="img-grid" id="m-images" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px"></div>' +
      '<div class="hint" id="m-img-progress" style="display:none;margin:6px 0 0"></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<button type="button" class="add-line" data-add="imageUpload" style="margin:0">' + ico("upload") + "Téléverser des images</button>" +
      '<span class="hint">JPG · JPEG · PNG · WEBP · SVG — 8 Mo max par image. La première image est la principale (réordonnez avec les flèches).</span>' +
      "</div>" +
      '<input type="file" id="m-img-file" accept="image/jpeg,image/png,image/webp,image/svg+xml" multiple style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" />' +
      "</div>" +
      "</div>" +
      modalFoot('<button class="btn-x ghost" data-mact="close">Annuler</button>' +
        '<button class="btn-x" data-mact="saveProduct">' + (p ? "Enregistrer" : "Créer le produit") + "</button>");
  }
  function openProductEditor(id) {
    var p = id ? BL.getProduct(id) : null;
    state.editingId = id || null;
    state.formImages = (p && p.images && p.images.length) ? p.images.slice() : [];
    openModal(productForm(p));
    renderImageEditor();
  }
  var IMG_BTN = "font-size:12px;width:22px;height:22px;line-height:1;border:0;border-radius:4px;background:rgba(255,255,255,.92);color:#3b2f24;cursor:pointer;margin:0 1px";
  function renderImageEditor() {
    var box = document.getElementById("m-images");
    if (!box) return;
    var arr = state.formImages || [];
    box.innerHTML = arr.map(function (u, i) {
      var isMain = i === 0;
      return '<div style="position:relative;width:88px" data-imgcell="' + i + '">' +
        '<div style="width:88px;height:88px;border-radius:6px;overflow:hidden;border:1px solid rgba(33,27,21,.14);background:#f0e8da"><img src="' + esc(u) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'" /></div>' +
        (isMain ? '<span style="position:absolute;top:4px;left:4px;background:rgba(20,15,10,.65);color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;letter-spacing:.04em">Principale</span>' : "") +
        '<div style="position:absolute;inset:auto 0 0 0;display:flex;justify-content:center;gap:2px;padding:4px;background:linear-gradient(transparent,rgba(20,15,10,.55));border-radius:0 0 6px 6px">' +
        '<button type="button" data-img="main" data-idx="' + i + '" title="Image principale" style="' + IMG_BTN + '">★</button>' +
        '<button type="button" data-img="left" data-idx="' + i + '" title="Déplacer à gauche" style="' + IMG_BTN + '">‹</button>' +
        '<button type="button" data-img="right" data-idx="' + i + '" title="Déplacer à droite" style="' + IMG_BTN + '">›</button>' +
        '<button type="button" data-img="rm" data-idx="' + i + '" title="Retirer" style="' + IMG_BTN + '">✕</button>' +
        "</div></div>";
    }).join("");
    if (!arr.length) box.innerHTML = '<span class="hint">Aucune image — un visuel « soie » généré est utilisé tant que vous n’en ajoutez pas.</span>';
  }
  function handleImageFiles(input) {
    var files = input ? input.files : null;
    if (input) input.value = "";
    if (!files || !files.length) return;
    if (!cloudAuthed()) { toast("Connectez-vous avec le compte admin pour téléverser des images.", "err"); return; }
    if (!state.formImages) state.formImages = [];
    var pid = state.editingId || ("new-" + new Date().getTime().toString(36));
    var progressEl = document.getElementById("m-img-progress");
    var done = 0;
    var arr = Array.prototype.slice.call(files);
    toast("Téléversement des images…");
    var chain = Promise.resolve();
    arr.forEach(function (f) {
      chain = chain.then(function () {
        return BL.cloud.admin.uploadProductImage(f, pid, state.formImages.length + done, function (pct) {
          if (progressEl) { progressEl.style.display = ""; progressEl.textContent = "Téléversement : " + pct + "% — ne fermez pas la fenêtre."; }
        }).then(function (url) {
          done++;
          state.formImages.push(url);
          if (progressEl) progressEl.style.display = "none";
          renderImageEditor();
        });
      });
    });
    chain.then(function () {
      renderImageEditor();
      toast(arr.length > 1 ? "Images téléversées — enregistrez le produit pour appliquer." : "Image téléversée — enregistrez le produit pour appliquer.", "ok");
    }).catch(function (err) {
      if (progressEl) progressEl.style.display = "none";
      toast("Téléversement impossible : " + ((err && err.message) || "erreur"), "err");
    });
  }

  function adjustForm(p, direction) {
    var html = modalHead(direction === "up" ? "Augmenter le stock — " + p.name : "Diminuer le stock — " + p.name, "Le stock est suivi par taille.") +
      '<div class="modal-body">' +
      '<div class="modal-err" id="m-err"></div>' +
      '<div class="f-grid">' +
      '<div class="fld"><span class="lbl">Action</span><select class="inp" id="m-mode">' +
      '<option value="addAll"' + (direction === "up" ? " selected" : "") + ">Ajouter la quantité à toutes les tailles</option>" +
      '<option value="addOne"' + (direction === "up" ? "" : " selected") + ">Ajouter à une taille précise</option>" +
      '<option value="subOne"' + (direction === "down" ? " selected" : "") + ">Retirer d’une taille précise</option>" +
      '<option value="setOne">Fixer le stock d’une taille</option>' +
      "</select></div>" +
      '<div class="fld"><span class="lbl">Quantité (ou nouveau stock pour « Fixer »)</span><input class="inp" id="m-qty" type="number" min="0" value="1" /></div>' +
      '<div class="fld" id="m-size-fld"><span class="lbl">Taille concernée</span><select class="inp" id="m-size">' +
      p.sizes.map(function (sz) { return '<option value="' + esc(sz.name) + '">' + esc(sz.name) + " (actuellement " + sz.stock + ")</option>"; }).join("") +
      "</select></div>" +
      "</div>" +
      '<p class="modal-ok" id="m-preview"></p>' +
      "</div>" +
      modalFoot('<button class="btn-x ghost" data-mact="close">Annuler</button><button class="btn-x" data-mact="applyStock">Appliquer</button>');
    return html;
  }
  function openAdjust(id, direction) {
    var p = BL.getProduct(id);
    if (!p) return;
    state.adjust = { id: id, direction: direction, mode: direction === "up" ? "addAll" : direction === "down" ? "subOne" : "addAll" };
    openModal(adjustForm(p, direction));
    syncAdjustUI();
  }
  function syncAdjustUI() {
    var p = state.adjust && BL.getProduct(state.adjust.id);
    if (!p) return;
    var mode = $("m-mode") ? $("m-mode").value : "addAll";
    var szFld = $("m-size-fld");
    if (szFld) szFld.style.display = (mode === "addAll") ? "none" : "";
    var pv = $("m-preview");
    if (!pv) return;
    var qty = Math.max(0, parseInt(($("m-qty") ? $("m-qty").value : "1"), 10) || 0);
    var total = BL.totalStock(p);
    var after = total;
    if (mode === "addAll") after = total + qty * p.sizes.length;
    else if (mode === "addOne") after = total + qty;
    else if (mode === "subOne") after = Math.max(0, total - qty);
    else if (mode === "setOne") {
      var sz = BL.findSize(p, $("m-size").value);
      after = total - (sz ? sz.stock : 0) + qty;
    }
    pv.textContent = "Total actuel : " + total + " → total après : " + after + " unité(s).";
  }

  /* ---------- product actions ---------- */
  function applyAdjust() {
    var adj = state.adjust;
    if (!adj) return;
    var p = BL.getProduct(adj.id);
    if (!p) return;
    var mode = $("m-mode").value;
    var qty = Math.max(0, parseInt($("m-qty").value, 10) || 0);
    if (qty === 0 && mode !== "setOne") { toast("Saisissez une quantité.", "err"); return; }
    function byName(name) {
      for (var i = 0; i < p.sizes.length; i++) if (p.sizes[i].name === name) return p.sizes[i];
      return null;
    }
    var deltas = [];   /* {size, delta} */
    if (mode === "addAll") { p.sizes.forEach(function (sz) { deltas.push({ size: sz.name, delta: qty }); }); }
    else if (mode === "addOne") {
      var a1 = byName($("m-size").value);
      if (!a1) { toast("Taille introuvable.", "err"); return; }
      deltas.push({ size: a1.name, delta: qty });
    } else if (mode === "subOne") {
      var a2 = byName($("m-size").value);
      if (!a2) { toast("Taille introuvable.", "err"); return; }
      if (a2.stock < qty) { toast("Impossible : seulement " + a2.stock + " en stock pour cette taille.", "err"); return; }
      deltas.push({ size: a2.name, delta: -qty });
    } else if (mode === "setOne") {
      var a3 = byName($("m-size").value);
      if (!a3) { toast("Taille introuvable.", "err"); return; }
      deltas.push({ size: a3.name, delta: qty - a3.stock });
    }
    if (cloudAuthed()) {
      var chain = Promise.resolve();
      deltas.forEach(function (d) {
        chain = chain.then(function () { return BL.cloud.admin.changeStock(p.id, d.size, d.delta); });
      });
      chain.then(function () { return refreshAdminData(true); }).then(function () {
        closeModal();
        toast("Stock ajusté dans Supabase.", "ok");
        repaint();
      }).catch(function (err) {
        closeModal();
        toast("Ajustement Supabase impossible : " + ((err && err.message) || "erreur") + " — stock non modifié.", "err");
        refreshAdminData(true).then(repaint, repaint);
      });
      return;
    }
    deltas.forEach(function (d) {
      var sz = byName(d.size);
      if (sz) sz.stock = Math.max(0, sz.stock + d.delta);
    });
    BL.saveDB();
    var emptied = BL.syncAvailability();
    closeModal();
    toast((emptied ? "Stock ajusté — un produit est passé en rupture. " : "Stock ajusté. ") + "Nouveau total : " + BL.totalStock(p) + " unité(s).", "ok");
    repaint();
  }

  function saveProductFromModal() {
    var errEl = $("m-err");
    function fail(m) { if (errEl) errEl.textContent = m; return; }
    var name = ($("m-name").value || "").trim();
    var cat = $("m-cat").value;
    var price = parseFloat($("m-price").value);
    var oldV = ($("m-old").value || "").trim();
    var desc = $("m-desc").value.trim();
    if (!name) return fail("Le nom du produit est requis.");
    if (!BL.CATS.some(function (c) { return c.key === cat; })) return fail("Catégorie invalide.");
    if (!isFinite(price) || price < 0) return fail("Prix invalide.");
    if (oldV !== "" && (!isFinite(parseFloat(oldV)) || parseFloat(oldV) < 0)) return fail("Ancien prix invalide.");

    var colorRows = Array.prototype.slice.call(document.querySelectorAll("#m-colors .row-ed"));
    var colors = [];
    colorRows.forEach(function (row) {
      var hex = row.querySelector('input[type="color"]').value;
      var label = (row.querySelector(".color-label").value || "").trim();
      if (!label && hex) label = "Couleur";
      if (hex) colors.push({ hex: hex, label: label, tone: toneForHex(hex) });
    });
    var sizeRows = Array.prototype.slice.call(document.querySelectorAll("#m-sizes .row-ed"));
    var sizes = [], seen = {};
    for (var i = 0; i < sizeRows.length; i++) {
      var n = (sizeRows[i].querySelector(".size-name").value || "").trim();
      var s = parseInt(sizeRows[i].querySelector(".size-stock").value, 10);
      if (!isFinite(s) || s < 0) s = 0;
      if (!n) continue;
      if (seen[n]) return fail("Taille « " + n + " » présente plusieurs fois.");
      seen[n] = true;
      sizes.push({ name: n, stock: s });
    }
    if (!sizes.length) return fail("Ajoutez au moins une taille.");
    var avail = $("m-avail").checked;
    var images = (state.formImages || []).slice();
    var existing = state.editingId ? BL.getProduct(state.editingId) : null;
    var form = { id: existing ? existing.id : null, name: name, cat: cat, price: price, oldPrice: oldV === "" ? null : oldV, desc: desc, colors: colors, sizes: sizes, images: images, available: avail };
    if (!cloudAuthed()) {
      var pLocal = BL.upsertProduct(form);
      closeModal();
      toast((existing ? "Produit mis à jour : " : "Produit créé : ") + pLocal.name + ".", "ok");
      repaint();
      return;
    }
    /* Cloud path: save to Supabase FIRST — the mirror only changes on success
     * (the UI never claims a product was saved when the database refused). */
    var oldCopy = existing ? JSON.parse(JSON.stringify(existing)) : null;
    var candidate = BL.upsertProduct(form);
    BL.cloud.admin.saveProduct(candidate).then(function () {
      return refreshAdminData(true);
    }).then(function () {
      closeModal();
      toast((existing ? "Produit mis à jour : " : "Produit créé : ") + candidate.name + ".", "ok");
      repaint();
    }).catch(function (err) {
      try {
        var list = BL.getProducts();
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].id === candidate.id) { idx = i; break; }
        if (oldCopy) { if (idx > -1) list[idx] = oldCopy; }
        else if (idx > -1) list.splice(idx, 1);
        BL.saveDB();
      } catch (e2) { /* mirror left best-effort */ }
      closeModal();
      toast("Enregistrement Supabase impossible : " + ((err && err.message) || "erreur") + " — le produit n'a pas été modifié.", "err");
      repaint();
    });
  }

  function toneForHex(hex) {
    var map = [
      ["#C79A90", "rose"], ["#E6C9C2", "blush"], ["#E7D3B8", "champagne"], ["#F1E7D8", "ivory"],
      ["#DBC1A9", "nude"], ["#B9A88F", "taupe"], ["#A7AD96", "sage"], ["#2A3140", "midnight"],
      ["#C0925F", "camel"], ["#8B7358", "mocha"], ["#D8C29A", "sand"], ["#F4EFE7", "pearl"]
    ];
    var low = (hex || "").toLowerCase();
    for (var i = 0; i < map.length; i++) if (low.indexOf(map[i][0]) !== -1 || map[i][0].indexOf(low) !== -1) return map[i][1];
    return "espresso";
  }

  function confirmDelete(id) {
    var p = BL.getProduct(id);
    if (!p) return;
    confirmModal("Supprimer « " + p.name + " »", "<p style=\"font-size:13px;color:var(--espresso);line-height:1.7\">Le produit et son stock seront retirés du catalogue. Les commandes déjà passées restent intactes (elles conservent leur propre historique).</p>", "Supprimer", true, function () {
      var r = BL.deleteProduct(id);
      if (r.ok) toast("Produit supprimé.", "ok");
      else toast(r.error || "Suppression impossible.", "err");
      repaint();
    });
  }

  /* ---------- video actions ---------- */
  function onVideoFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    if (f.type && f.type.indexOf("video/") !== 0) { toast("Format non pris en charge : choisissez une vidéo (MP4, WebM, MOV…).", "err"); return; }
    if (f.size > 40 * 1048576) { toast("Fichier trop volumineux (40 Mo maximum).", "err"); return; }
    if (state.video.pendingUrl) URL.revokeObjectURL(state.video.pendingUrl);
    state.video.pendingFile = f;
    state.video.pendingUrl = URL.createObjectURL(f);
    state.video.pct = 0;
    paint();
  }
  function saveVideo() {
    var f = state.video.pendingFile;
    if (!f) return;
    state.video.saving = true;
    state.video.pct = 0;
    paint();
    if (cloudAuthed()) {
      /* Cloud path: authenticated upload to Supabase (upsert the SAME object →
       * stable public URL). Only on success is the video marked as published. */
      BL.cloud.admin.uploadHero(f, function (pct) {
        state.video.pct = pct;
        var fill = document.querySelector('#content .progress .fill');
        var pctEl = document.querySelector('#content .progress .pct');
        if (fill) fill.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
      }).then(function () {
        BL.heroSaveMeta({ fileName: f.name, fileType: f.type || 'video/mp4', fileSize: f.size });
        state.video.saving = false;
        state.video.pendingFile = null;
        if (state.video.pendingUrl) { URL.revokeObjectURL(state.video.pendingUrl); state.video.pendingUrl = null; }
        /* Keep the override empty so the automatic cloud URL applies. */
        var s = BL.settings();
        s.heroVideoUrl = '';
        BL.saveSettings(s);
        toast('Vidéo publiée ✔ Visible immédiatement par tous les visiteurs.', 'ok');
        paint();
      }).catch(function (err) {
        state.video.saving = false;
        toast('Téléversement impossible : ' + (err && err.message ? err.message : 'erreur') + ' — aucune modification n’a été appliquée.', 'err');
        paint();
      });
      return;
    }
    /* Fallback without cloud config: browser-local only (admin preview). */
    var reader = new FileReader();
    reader.onprogress = function (ev) {
      if (ev.lengthComputable) { state.video.pct = Math.round((ev.loaded / ev.total) * 100); }
      var fill = document.querySelector('#content .progress .fill');
      var pct = document.querySelector('#content .progress .pct');
      if (fill) fill.style.width = state.video.pct + '%';
      if (pct) pct.textContent = state.video.pct + '%';
    };
    reader.onload = function () {
      var blob = new Blob([reader.result], { type: f.type || 'video/mp4' });
      BL.heroStore(blob).then(function () {
        BL.heroSaveMeta({ fileName: f.name, fileType: f.type || 'video/mp4', fileSize: f.size });
        state.video.saving = false;
        state.video.pendingFile = null;
        if (state.video.pendingUrl) { URL.revokeObjectURL(state.video.pendingUrl); state.video.pendingUrl = null; }
        toast('Vidéo enregistrée localement (aperçu admin uniquement). Configurez le stockage cloud pour la rendre publique.', 'ok');
        paint();
      }).catch(function (err) {
        state.video.saving = false;
        toast('Enregistrement impossible : ' + (err && err.message ? err.message : 'stockage du navigateur indisponible'), 'err');
        paint();
      });
    };
    reader.onerror = function () {
      state.video.saving = false;
      toast('Lecture du fichier impossible.', 'err');
      paint();
    };
    reader.readAsArrayBuffer(f);
  }
  function loadSavedVideoPreview() {
    var v = state.video;
    if (v.savedUrl) return;
    BL.heroGetBlob().then(function (blob) {
      if (!blob) return;
      var meta = BL.heroLoadMeta();
      if (!meta || !meta.fileName) return;
      v.savedUrl = URL.createObjectURL(blob);
      var el = document.querySelector("#content .video-player video");
      if (el) el.src = v.savedUrl;
    }).catch(function () { /* preview unavailable */ });
  }
  function removeVideo() {
    confirmModal('Retirer la vidéo d’accueil ?', '<p style="font-size:13px;color:var(--espresso);line-height:1.7">La vidéo sera supprimée du stockage cloud et la page d’accueil retrouvera son fond par défaut (image soie). Vous pourrez publier une nouvelle vidéo à tout moment.</p>', 'Retirer la vidéo', true, function () {
      /* Delete the cloud object first (admin session) — then clear the local
       * reference. An absent object counts as already removed. */
      var step = cloudAuthed()
        ? BL.cloud.admin.removeHero().catch(function (err) {
            if (err && /not found/i.test(err.message || "")) return true;
            throw err;
          })
        : Promise.resolve(true);
      step.then(function () {
        return BL.heroRemove().catch(function () { return true; });
      }).then(function () {
        var s = BL.settings();
        s.hero = { fileName: null, fileType: null, fileSize: null, updatedAt: null };
        s.heroVideoUrl = '';
        BL.saveSettings(s);
        if (state.video.savedUrl) { URL.revokeObjectURL(state.video.savedUrl); state.video.savedUrl = null; }
        toast('Vidéo retirée. Fond par défaut réactivé.', 'ok');
        paint();
      }).catch(function (err) {
        toast('Suppression impossible : ' + ((err && err.message) || 'erreur') + ' — la vidéo reste active.', 'err');
      });
    });
  }
  /* ---------- global events ---------- */
  function onClick(ev) {
    var el = ev.target.closest ? ev.target.closest("[data-nav]") : null;
    if (el) { state.section = el.getAttribute("data-nav"); state.expanded = null; paint(); return; }

    var act = ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (act) {
      var type = act.getAttribute("data-act"), id = act.getAttribute("data-id");
      if (type === "toggle") { state.expanded = (state.expanded === id) ? null : id; repaint(); return; }
      if (type === "verify") {
        if (!cloudAuthed()) { var rv = BL.verifyPayment(id); toast(rv.ok ? "Paiement vérifié — commande confirmée." : rv.error, rv.ok ? "ok" : "err"); repaint(); return; }
        BL.cloud.admin.verifyPayment(id).then(function () { return refreshAdminData(true); }).then(function () {
          toast("Paiement vérifié — commande confirmée.", "ok"); repaint();
        }).catch(function (err) {
          toast("Vérification Supabase impossible : " + ((err && err.message) || "erreur"), "err");
        });
        return;
      }
      if (type === "reject") {
        if (!cloudAuthed()) { BL.rejectPayment(id); toast("Paiement refusé.", "ok"); repaint(); return; }
        BL.cloud.admin.rejectPayment(id).then(function () { return refreshAdminData(true); }).then(function () {
          toast("Paiement refusé.", "ok"); repaint();
        }).catch(function (err) {
          toast("Refus Supabase impossible : " + ((err && err.message) || "erreur"), "err");
        });
        return;
      }
      if (type === "cancel") { confirmCancelOrder(id); return; }
      if (type === "status") { /* handled on change */ return; }
      if (type === "addProduct") { state.editingId = null; openProductEditor(null); return; }
      if (type === "editProduct") { state.editingId = id; openProductEditor(id); return; }
      if (type === "delProduct") { confirmDelete(id); return; }
      if (type === "stkUp") { openAdjust(id, "up"); return; }
      if (type === "stkDown") { openAdjust(id, "down"); return; }
      if (type === "pickVideo") {
        var vf = $("vfile");
        if (vf) vf.click();
        return;
      }
      if (type === "exportVideo") {
        var blob = null;
        var name = "hero-video.mp4";
        if (state.video.pendingFile) {
          blob = new Blob([state.video.pendingFile], { type: state.video.pendingFile.type || "video/mp4" });
        } else {
          BL.heroGetBlob().then(function (b) {
            if (!b) { toast("Aucune vidéo à exporter.", "err"); return; }
            doDownload(b, name);
          }).catch(function () { toast("Lecture de la vidéo impossible.", "err"); });
          return;
        }
        if (blob) doDownload(blob, name);
        return;
      }
      function doDownload(blob, name) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        toast("Copie de sauvegarde « " + name + " » téléchargée — la vidéo publiée reste gérée depuis cet écran.", "ok");
      }
      if (type === "saveVideo") { saveVideo(); return; }
      if (type === "cancelVideo") {
        if (state.video.pendingUrl) URL.revokeObjectURL(state.video.pendingUrl);
        state.video.pendingFile = null; state.video.pendingUrl = null; state.video.pct = 0;
        paint(); return;
      }
      if (type === "removeVideo") { removeVideo(); return; }
      if (type === "resetData") {
        confirmModal("Réinitialiser les données de démonstration ?", "<p style=\"font-size:13px;color:var(--espresso);line-height:1.7\">Produits, stock, commandes et panier de ce navigateur reviendront à leur état initial de démonstration.</p>", "Réinitialiser", true, function () {
          BL.resetDemoData();
          toast("Données réinitialisées.", "ok");
          repaint();
        });
        return;
      }
      if (type === "saveTheme") {
        var defT = document.querySelector('input[name="defTheme"]:checked');
        var aSw = document.getElementById("allowSwitch");
        var s = BL.settings();
        s.theme = { defaultTheme: defT ? defT.value : "light", allowSwitch: aSw ? aSw.checked : true };
        BL.saveSettings(s);
        toast("Paramètres de thème enregistrés.", "ok");
        return;
      }
      if (type === "saveHeroUrl") {
        var url = ($("heroVideoUrl").value || "").trim();
        var s = BL.settings();
        s.heroVideoUrl = url;
        BL.saveSettings(s);
        toast(url ? "URL de vidéo enregistrée : " + url : "URL effacée — fond par défaut réactivé.", "ok");
        return;
      }
      if (type === "saveSupabase") {
        var s = BL.settings();
        s.supabase = {
          url: ($("sb-url").value || "").trim(),
          anonKey: ($("sb-key").value || "").trim()
        };
        BL.saveSettings(s);
        toast(s.supabase.url ? "Stockage cloud enregistré. Vous pouvez maintenant publier la vidéo." : "Configuration du stockage effacée.", "ok");
        return;
      }
      if (type === "saveContact") {
        var s = BL.settings();
        s.contact = {
          title: $("ct-title").value || "",
          description: $("ct-desc").value || "",
          phone: $("ct-phone").value || "",
          whatsapp: $("ct-whatsapp").value || "",
          email: $("ct-email").value || "",
          instagram: $("ct-instagram").value || "",
          tiktok: $("ct-tiktok").value || "",
          additional: $("ct-additional").value || "",
          socials: s.contact ? s.contact.socials : []
        };
        BL.saveSettings(s);
        toast("Contact enregistré.", "ok");
        return;
      }
      if (type === "saveAbout") {
        var s = BL.settings();
        s.about = {
          title: $("ab-title").value || "",
          description: $("ab-desc").value || "",
          content: $("ab-content").value || "",
          additional: $("ab-additional").value || "",
          images: s.about ? s.about.images : []
        };
        BL.saveSettings(s);
        toast("À propos enregistré.", "ok");
        return;
      }
      if (type === "saveNewSection") {
        var s = BL.settings();
        s.newSection = {
          title: $("ns-title").value || "",
          description: $("ns-desc").value || "",
          additional: $("ns-additional").value || "",
          productIds: s.newSection ? s.newSection.productIds : []
        };
        BL.saveSettings(s);
        toast("Nouveautés enregistrées.", "ok");
        return;
      }
      if (type === "saveComingSoon") {
        var raw = ($("cs-items").value || "").trim();
        var items = raw ? raw.split("\n").filter(function(l){return l.trim()}).map(function(l){
          var parts = l.split("|");
          return { name: (parts[0]||"").trim(), description: (parts[1]||"").trim() };
        }) : [];
        var s = BL.settings();
        s.comingSoon = {
          title: $("cs-title").value || "",
          description: $("cs-desc").value || "",
          additional: $("cs-additional").value || "",
          items: items
        };
        BL.saveSettings(s);
        toast("Bientôt disponible enregistré.", "ok");
        return;
      }
      if (type === "addSocial") {
        var s = BL.settings();
        if (!s.socials) s.socials = [];
        s.socials.push({ name: "", url: "", icon: "" });
        BL.saveSettings(s);
        paint();
        return;
      }
      if (type === "saveSocials") {
        var s = BL.settings();
        var names = document.querySelectorAll(".social-name");
        var urls = document.querySelectorAll(".social-url");
        var newsocials = [];
        for (var i = 0; i < names.length; i++) {
          var n = names[i].value || "";
          var u = urls[i] ? urls[i].value : "";
          if (n || u) newsocials.push({ name: n, url: u, icon: n.toLowerCase() });
        }
        s.socials = newsocials;
        BL.saveSettings(s);
        toast("Réseaux sociaux enregistrés.", "ok");
        return;
      }
      if (type === "socialDel") {
        var idx = parseInt(act.getAttribute("data-idx"), 10);
        var s = BL.settings();
        if (s.socials && s.socials[idx]) { s.socials.splice(idx, 1); BL.saveSettings(s); paint(); }
        return;
      }
            if (type === "savePin") {
        var pin = ($("set-pin").value || "").trim();
        if (pin.length < 4) { toast("Le code doit contenir au moins 4 caractères.", "err"); return; }
        var s = BL.settings();
        s.pin = pin;
        BL.saveSettings(s);
        $("set-pin").value = "";
        toast("Code d’accès mis à jour.", "ok");
        return;
      }
    }

    /* social delete buttons */
    var socDel = ev.target.closest ? ev.target.closest(".social-del") : null;
    if (socDel) {
      var idx = parseInt(socDel.getAttribute("data-idx"), 10);
      var s = BL.settings();
      if (s.socials && s.socials[idx]) { s.socials.splice(idx, 1); BL.saveSettings(s); paint(); }
      return;
    }

    /* modal actions */
    var m = ev.target.closest ? ev.target.closest("[data-mact]") : null;
    if (m) {
      var mt = m.getAttribute("data-mact");
      if (mt === "close") { closeModal(); return; }
      if (mt === "confirmOk") {
        var cb = state.confirmCb;
        state.confirmCb = null;
        closeModal();
        if (cb) cb();
        return;
      }
      if (mt === "saveProduct") { saveProductFromModal(); return; }
      if (mt === "applyStock") { applyAdjust(); return; }
    }

    /* dynamic rows add/remove inside modals */
    var addBtn = ev.target.closest ? ev.target.closest("[data-add]") : null;
    if (addBtn) {
      var kind = addBtn.getAttribute("data-add");
      if (kind === "size") { var ls = $("m-sizes"); if (ls) ls.insertAdjacentHTML("beforeend", sizeRowsHTML()); }
      else if (kind === "color") { var lc = $("m-colors"); if (lc) lc.insertAdjacentHTML("beforeend", colorRowHTML()); }
      return;
    }
    var delBtn = ev.target.closest ? ev.target.closest("[data-del]") : null;
    if (delBtn && delBtn.closest("#modal-root")) {
      delBtn.closest(".row-ed").remove();
      return;
    }
  }
  function confirmCancelOrder(id) {
    var o = BL.findOrder(id);
    if (!o) return;
    confirmModal("Annuler la commande " + o.id + " ?", "<p style=\"font-size:13px;color:var(--espresso);line-height:1.7\">Le stock des articles sera restitué au catalogue (si les produits existent toujours). La commande reste dans l’historique, marquée « Annulée ». L’annulation est appliquée exactement une fois.</p>", "Annuler la commande", true, function () {
      if (!cloudAuthed()) {
        var r0 = BL.setOrderStatus(id, "cancelled");
        if (r0.ok) toast(r0.warnings && r0.warnings.length ? "Commande annulée — " + r0.warnings.join(" · ") : "Commande annulée — stock restitué.", r0.warnings && r0.warnings.length ? "err" : "ok");
        else toast(r0.error || "Impossible d’annuler.", "err");
        repaint();
        return;
      }
      BL.cloud.admin.setOrderStatus(id, "cancelled").then(function (res) {
        return refreshAdminData(true).then(function () { return res; });
      }).then(function (res) {
        var w = (res && res.warnings) || [];
        toast(w.length ? "Commande annulée — " + w.join(" · ") : "Commande annulée — stock restitué.", w.length ? "err" : "ok");
        repaint();
      }).catch(function (err) {
        toast("Annulation Supabase impossible : " + ((err && err.message) || "erreur"), "err");
        repaint();
      });
    });
  }

  function onChange(ev) {
    var act = ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!act) return;
    var type = act.getAttribute("data-act");
    var id = act.getAttribute("data-id");
    if (type === "status") {
      var o = BL.findOrder(id);
      if (!o) return;
      var next = act.value;
      if (next === "cancelled") { confirmCancelOrder(id); act.value = o.orderStatus; return; }
      if (!cloudAuthed()) {
        var r = BL.setOrderStatus(id, next);
        if (!r.ok) { toast(r.error || "Changement impossible.", "err"); act.value = o.orderStatus; return; }
        toast("Statut : " + BL.STATUS_FR[next] + ".", "ok");
        repaint();
        return;
      }
      BL.cloud.admin.setOrderStatus(id, next).then(function (res) {
        return refreshAdminData(true).then(function () { return res; });
      }).then(function (res) {
        var w = (res && res.warnings) || [];
        toast((w.length ? "Statut : " + BL.STATUS_FR[next] + " (" + w.join(" · ") + ")." : "Statut : " + BL.STATUS_FR[next] + "."), w.length ? "err" : "ok");
        repaint();
      }).catch(function (err) {
        toast("Changement Supabase impossible : " + ((err && err.message) || "erreur"), "err");
        act.value = o.orderStatus;
      });
    }
  }
  function onInput(ev) {
    if (ev.target.id === "m-qty" || ev.target.id === "m-mode" || ev.target.id === "m-size") {
      syncAdjustUI();
    }
  }

  /* ---------- chrome + auth ---------- */
  function initChrome() {
    var msgs = ["Livraison dans les 58 wilayas", "Paiement à la livraison ou BaridiMob", "Retours offerts sous 14 jours"];
    var one = msgs.map(function (m) { return "<span>" + m + "</span>"; }).join("");
    $("marq").innerHTML = one + one;
    document.querySelectorAll("[data-ic]").forEach(function (el) {
      var name = el.getAttribute("data-ic");
      if (!name) return;
      var slot = el.querySelector("[data-slot]");
      if (slot) slot.innerHTML = ico(name);
      else if (el.classList.contains("icon-btn")) el.innerHTML = ico(name);
      else el.insertAdjacentHTML("afterbegin", ico(name));
    });
  }

  function refreshAdminData(silent) {
    if (!cloudAuthed()) return Promise.resolve(false);
    return BL.cloud.admin.refreshAll().then(function () {
      if (!silent) toast("Données synchronisées depuis Supabase.", "ok");
      return true;
    }).catch(function (err) {
      /* schema/RLS not applied yet, or network: keep the local mirror visible */
      if (!silent) toast("Supabase inaccessible : " + ((err && err.message) || "vérifiez le schéma (SETUP.md).") + " — affichage local.", "err");
      return false;
    });
  }
  function boot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
      return;
    }
    BL.db();
    initChrome();
    if (cloudAuthed()) { unlock(); return; }
    var scr = $("auth-screen");
    if (scr) scr.hidden = false;
    var em = $("auth-email");
    if (em) em.focus();
    var hint = $("auth-hint");
    if (hint && !cloudReady()) hint.textContent = "Stockage Supabase non configuré — la connexion n’est pas possible tant que SUPABASE_URL / SUPABASE_ANON_KEY (ou supabase-config.js) ne sont pas définis.";
  }
  function unlock() {
    try { sessionStorage.setItem("bl.admin.ok", "1"); } catch (e) { /* ignore */ }
    var scr = $("auth-screen");
    if (scr) scr.hidden = true;
    paint();
    /* replace the local cache with the real cloud state, then repaint */
    refreshAdminData(true).then(function () { repaint(); }, function () { repaint(); });
  }
  function authSubmit() {
    var email = $("auth-email") ? $("auth-email").value.trim() : "";
    var pass = $("auth-password") ? $("auth-password").value : "";
    var err = $("auth-err");
    var btn = $("auth-submit");
    if (!email || !pass) { if (err) err.textContent = "Saisissez votre e-mail et votre mot de passe."; return; }
    if (!cloudReady()) { if (err) err.textContent = "Stockage cloud non configuré — connexion impossible."; return; }
    if (btn) { btn.disabled = true; btn.textContent = "Connexion…"; }
    if (err) err.textContent = "";
    BL.cloud.signIn(email, pass).then(function () {
      if (!cloudAuthed()) {
        if (err) err.textContent = "Ce compte n’a pas le rôle administrateur. Créez/promouvez le compte via le SQL de promotion (voir SETUP.md), puis reconnectez-vous.";
        return BL.cloud.signOut().then(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
          if (email) { var em2 = $("auth-email"); if (em2) em2.value = ""; }
        });
      }
      if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
      unlock();
    }).catch(function (e2) {
      if (err) err.textContent = (e2 && e2.message) || "Connexion impossible.";
      if (btn) { btn.disabled = false; btn.textContent = "Se connecter"; }
    });
  }
  function logout() {
    var done = function () {
      try { sessionStorage.removeItem("bl.admin.ok"); } catch (e) { /* ignore */ }
      window.location.reload();
    };
    if (window.BL.cloud && BL.cloud.signOut) BL.cloud.signOut().then(done, done);
    else done();
  }
  function importLocalData() {
    if (!cloudAuthed()) { toast("Connectez-vous avec le compte admin d’abord.", "err"); return; }
    confirmModal("Importer les données locales vers Supabase ?", "<p style=\"font-size:13px;color:var(--espresso);line-height:1.7\">Le catalogue, les commandes et les réglages stockés dans CE navigateur seront importés vers Supabase — uniquement si le cloud est vide. Aucune donnée cloud n’est écrasée.</p>", "Importer", false, function () {
      toast("Import en cours…", "ok");
      BL.cloud.admin.importLocal().then(function (rep) {
        return refreshAdminData(true).then(function () { return rep; });
      }).then(function (rep) {
        var msgs = (rep || []).join(" · ");
        toast(msgs ? "Import terminé : " + msgs : "Import terminé (rien à importer).", "ok");
        repaint();
      }).catch(function (err) {
        toast("Import impossible : " + ((err && err.message) || "erreur"), "err");
        repaint();
      });
    });
  }

  document.addEventListener("click", function (ev) {
    if (ev.target.closest && ev.target.closest("#pin-form")) return;
    if (ev.target.id === "pin-form" || (ev.target.closest && ev.target.closest("#pin-form"))) return;
  });
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);

  var af = document.getElementById("auth-form");
  if (af) af.addEventListener("submit", function (ev) { ev.preventDefault(); authSubmit(); });
  var lb = document.getElementById("logout-btn");
  if (lb) lb.addEventListener("click", logout);

  /* product-image editor + extra cloud actions (kept out of the big handler) */
  document.addEventListener("click", function (ev) {
    if (!ev.target || !ev.target.closest) return;
    var t = ev.target;
    var ib = t.closest("[data-img]");
    if (ib && ib.closest("#modal-root")) {
      var idx = parseInt(ib.getAttribute("data-idx"), 10);
      var img = ib.getAttribute("data-img");
      var arr = state.formImages || [];
      if (img === "rm") { arr.splice(idx, 1); }
      else if (img === "main") { if (idx > 0) { var u0 = arr.splice(idx, 1)[0]; arr.unshift(u0); } }
      else if (img === "left") { if (idx > 0) { var t0 = arr[idx]; arr[idx] = arr[idx - 1]; arr[idx - 1] = t0; } }
      else if (img === "right") { if (idx < arr.length - 1) { var t1 = arr[idx]; arr[idx] = arr[idx + 1]; arr[idx + 1] = t1; } }
      renderImageEditor();
      return;
    }
    if (t.closest('[data-add="imageUpload"]')) {
      var fi = document.getElementById("m-img-file");
      if (fi) fi.click();
      return;
    }
    var ax = t.closest("[data-act]");
    if (ax) {
      var tx = ax.getAttribute("data-act");
      if (tx === "importLocal") { importLocalData(); return; }
      if (tx === "refreshCloud") { refreshAdminData(false).then(repaint, repaint); return; }
    }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.id === "m-img-file") handleImageFiles(ev.target);
  });

  boot();
})();
