/*
 * by Leïlah — shared store layer (storefront + admin)
 * ---------------------------------------------------
 * Single source of truth for the site. Every page loads this file
 * (`<script src="store.js"></script>`) and talks through window.BL.
 *
 * Persistence follows the existing architecture: the browser.
 *  - Catalogue / orders / settings  -> localStorage (key bl.db.v1 …)
 *  - Home-hero video                -> IndexedDB (blob survives refreshes)
 * Historical orders are stored as immutable snapshots: editing or deleting
 * a product, or changing a price, never rewrites an existing order.
 */
(function () {
  "use strict";

  /* ============================================================
   * 1. Keys
   * ============================================================ */
  var LS = { DB: "bl.db.v1", CART: "bl.cart.v1", SETTINGS: "bl.settings.v1", WISH: "bl.wish.v1" };
  var IDB_NAME = "bl-media", IDB_STORE = "hero", IDB_KEY = "video";

  /* ============================================================
   * 2. Brand constants
   * ============================================================ */
  var STORE = {
    name: "by Leïlah",
    legalName: "[STORE NAME]",
    phone: "[STORE PHONE NUMBER]",
    email: "[STORE EMAIL]",
    city: "Alger",
    country: "Algérie",
  };
  var BARIDIMOB = {
    storeName: "[STORE NAME]",
    paymentInformation: "[BARIDIMOB PAYMENT INFORMATION]",
    accountInformation: "[PAYMENT ACCOUNT INFORMATION]",
    phone: "[STORE PHONE NUMBER]",
  };
  var DEFAULT_HOME_FEE = 600;
  var FREE_DELIVERY_THRESHOLD = 25000;
  var FEE_OVERRIDES = { 16: 400, 9: 450, 25: 550, 31: 550, 6: 550, 1: 900 };

  /* ============================================================
   * 3. Categories, delivery zones
   * ============================================================ */
  var CATS = [
    { key: "pajamas", label: "Pyjamas" },
    { key: "clothing", label: "Vêtements" },
    { key: "shoes", label: "Chaussures" },
    { key: "handbags", label: "Sacs" },
  ];
  function catLabel(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i].label;
    return key;
  }

  var WILAYAS = [
    { code: 1, name: "Adrar" }, { code: 2, name: "Chlef" }, { code: 3, name: "Laghouat" },
    { code: 4, name: "Oum El Bouaghi" }, { code: 5, name: "Batna" }, { code: 6, name: "Béjaïa" },
    { code: 7, name: "Biskra" }, { code: 8, name: "Béchar" }, { code: 9, name: "Blida" },
    { code: 10, name: "Bouira" }, { code: 11, name: "Tamanrasset" }, { code: 12, name: "Tébessa" },
    { code: 13, name: "Tlemcen" }, { code: 14, name: "Tiaret" }, { code: 15, name: "Tizi Ouzou" },
    { code: 16, name: "Alger" }, { code: 17, name: "Djelfa" }, { code: 18, name: "Jijel" },
    { code: 19, name: "Sétif" }, { code: 20, name: "Saïda" }, { code: 21, name: "Skikda" },
    { code: 22, name: "Sidi Bel Abbès" }, { code: 23, name: "Annaba" }, { code: 24, name: "Guelma" },
    { code: 25, name: "Constantine" }, { code: 26, name: "Médéa" }, { code: 27, name: "Mostaganem" },
    { code: 28, name: "M'Sila" }, { code: 29, name: "Mascara" }, { code: 30, name: "Ouargla" },
    { code: 31, name: "Oran" }, { code: 32, name: "El Bayadh" }, { code: 33, name: "Illizi" },
    { code: 34, name: "Bordj Bou Arréridj" }, { code: 35, name: "Boumerdès" }, { code: 36, name: "El Tarf" },
    { code: 37, name: "Tindouf" }, { code: 38, name: "Tissemsilt" }, { code: 39, name: "El Oued" },
    { code: 40, name: "Khenchela" }, { code: 41, name: "Souk Ahras" }, { code: 42, name: "Tipaza" },
    { code: 43, name: "Mila" }, { code: 44, name: "Aïn Defla" }, { code: 45, name: "Naâma" },
    { code: 46, name: "Aïn Témouchent" }, { code: 47, name: "Ghardaïa" }, { code: 48, name: "Relizane" },
    { code: 49, name: "Timimoun" }, { code: 50, name: "Bordj Badji Mokhtar" }, { code: 51, name: "Ouled Djellal" },
    { code: 52, name: "Béni Abbès" }, { code: 53, name: "In Salah" }, { code: 54, name: "In Guezzam" },
    { code: 55, name: "Touggourt" }, { code: 56, name: "Djanet" }, { code: 57, name: "El M'Ghair" },
    { code: 58, name: "El Meniaa" },
  ];
  var COMMUNES = {
    16: ["Alger-Centre", "Bab El Oued", "Hydra", "Kouba", "El Biar", "Hussein Dey", "Bir Mourad Raïs"],
    31: ["Oran", "Bir El Djir", "Es Sénia", "Bethioua", "Aïn El Turck", "Arzew"],
  };
  function wilayaName(code) {
    for (var i = 0; i < WILAYAS.length; i++) if (WILAYAS[i].code === code) return WILAYAS[i].name;
    return "";
  }
  function feeFor(code, subtotal) {
    if (!code) return { fee: 0, free: false, none: true };
    if (subtotal >= FREE_DELIVERY_THRESHOLD) return { fee: 0, free: true, none: false };
    var f = FEE_OVERRIDES[code] !== undefined ? FEE_OVERRIDES[code] : DEFAULT_HOME_FEE;
    return { fee: f, free: false, none: false };
  }

  /* ============================================================
   * 4. Silk placeholder renderer (shared, deterministic)
   * ============================================================ */
  var TONES = {
    champagne: { from: "#F3E7D2", to: "#E3CDA9", sheen: "#FBF3E4", ink: "#7A6142" },
    taupe: { from: "#E6DCCB", to: "#C3B196", sheen: "#F2EADC", ink: "#6E5C43" },
    espresso: { from: "#6B5847", to: "#3E3125", sheen: "#8A745C", ink: "#EADDCB" },
    rose: { from: "#EAD3CC", to: "#CE9F94", sheen: "#F6E5DF", ink: "#7C4F45" },
    nude: { from: "#EEDDCC", to: "#DBC1A9", sheen: "#F7ECDF", ink: "#7A6047" },
    sage: { from: "#DDE0D0", to: "#AEB598", sheen: "#EDEEE3", ink: "#575F44" },
    midnight: { from: "#3A4254", to: "#242A38", sheen: "#4E576B", ink: "#D5DAE6" },
    camel: { from: "#E4C9A6", to: "#C0925F", sheen: "#F1DEC4", ink: "#6E4E2C" },
    pearl: { from: "#F4EFE7", to: "#E2D8C9", sheen: "#FCF8F1", ink: "#7C6E5A" },
    blush: { from: "#F1DAD3", to: "#DCB4AB", sheen: "#FAEBE6", ink: "#82584D" },
    sand: { from: "#EADCC4", to: "#CBB48F", sheen: "#F5ECDA", ink: "#6F5A3C" },
    ivory: { from: "#F7F1E7", to: "#E8DECC", sheen: "#FDFAF3", ink: "#7C6E58" },
    mocha: { from: "#B49A7C", to: "#7E6549", sheen: "#C9B296", ink: "#EADCC9" },
  };
  function toneExists(name) { return !!TONES[name]; }
  function hash01(seed, salt) {
    var h = (2166136261 ^ salt) >>> 0;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
  var uid = 0;
  function silkSVG(seed, toneName, mono) {
    var tone = TONES[toneName] || TONES.champagne;
    var angle = 18 + Math.round(hash01(seed, 1) * 30);
    var foldX = 20 + Math.round(hash01(seed, 2) * 60);
    var sheenX = 25 + Math.round(hash01(seed, 3) * 50);
    var sheenY = 15 + Math.round(hash01(seed, 4) * 40);
    var initial = (mono || (seed || "L").charAt(0) || "L").toUpperCase();
    var id = ++uid, bg = "bgq" + id, sh = "shq" + id, fo = "foq" + id, gr = "grq" + id;
    return '<svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      "<defs>" +
      '<linearGradient id="' + bg + '" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="' + tone.from + '"/><stop offset="1" stop-color="' + tone.to + '"/></linearGradient>' +
      '<radialGradient id="' + sh + '" cx="' + sheenX + '%" cy="' + sheenY + '%" r="65%"><stop offset="0" stop-color="' + tone.sheen + '" stop-opacity="0.75"/><stop offset="0.55" stop-color="' + tone.sheen + '" stop-opacity="0.12"/><stop offset="1" stop-color="' + tone.sheen + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + fo + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient>' +
      '<filter id="' + gr + '"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>' +
      "</defs>" +
      '<rect width="400" height="500" fill="url(#' + bg + ')"/>' +
      '<g transform="rotate(' + angle + ' 200 250)" style="mix-blend-mode:soft-light">' +
      '<rect x="' + (foldX - 70) + '" y="-60" width="70" height="620" fill="url(#' + fo + ')"/>' +
      '<rect x="' + (foldX + 30) + '" y="-60" width="90" height="620" fill="url(#' + fo + ')"/>' +
      '<rect x="' + (foldX + 150) + '" y="-60" width="60" height="620" fill="url(#' + fo + ')"/>' +
      "</g>" +
      '<rect width="400" height="500" fill="url(#' + sh + ')"/>' +
      '<text x="200" y="270" text-anchor="middle" font-family="\'Cormorant Garamond\',Georgia,serif" font-size="150" font-weight="500" fill="' + tone.ink + '" fill-opacity="0.16">' + initial + "</text>" +
      '<rect width="400" height="500" filter="url(#' + gr + ')" opacity="0.5"/>' +
      "</svg>";
  }
  function paintPH(root) {
    var nodes = (root || document).querySelectorAll("[data-ph]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-painted")) continue;
      try {
        el.innerHTML = silkSVG(el.getAttribute("data-seed") || "seed", el.getAttribute("data-tone") || "champagne", el.getAttribute("data-mono"));
        el.setAttribute("data-painted", "1");
      } catch (e) { /* ignore */ }
    }
  }

  /* ============================================================
   * 5. Seed catalogue (33 products — same ids/prices as before)
   * ============================================================ */
  var COLORS = {
    champagne: { hex: "#E7D3B8", label: "Champagne", tone: "champagne" },
    noir: { hex: "#1B1712", label: "Noir", tone: "espresso" },
    rose: { hex: "#C79A90", label: "Rose poudré", tone: "rose" },
    midnight: { hex: "#2A3140", label: "Midnight", tone: "midnight" },
    ivoire: { hex: "#F1E7D8", label: "Ivoire", tone: "ivory" },
    sauge: { hex: "#A7AD96", label: "Sauge", tone: "sage" },
    blush: { hex: "#E6C9C2", label: "Blush", tone: "blush" },
    taupe: { hex: "#B9A88F", label: "Taupe", tone: "taupe" },
    camel: { hex: "#C0925F", label: "Camel", tone: "camel" },
    nude: { hex: "#DBC1A9", label: "Nude", tone: "nude" },
    espresso: { hex: "#4C3E32", label: "Espresso", tone: "espresso" },
    perle: { hex: "#E9E1D3", label: "Perle", tone: "pearl" },
    sable: { hex: "#D8C29A", label: "Sable", tone: "sand" },
    mocha: { hex: "#8B7358", label: "Mocha", tone: "mocha" },
  };
  function colorsFrom(keys) {
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var c = COLORS[keys[i]];
      if (c) out.push({ hex: c.hex, label: c.label, tone: c.tone });
    }
    return out;
  }
  function sizeNamesFor(cat) {
    if (cat === "shoes") return ["36", "37", "38", "39", "40", "41"];
    if (cat === "handbags") return ["Unique"];
    return ["XS", "S", "M", "L", "XL"];
  }
  function splitStock(total, n) {
    if (n <= 0) return [];
    if (total <= 0) { var z = []; for (var k = 0; k < n; k++) z.push(0); return z; }
    var base = Math.floor(total / n), rem = total % n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }
  function sizesFrom(cat, total) {
    var names = sizeNamesFor(cat);
    var counts = splitStock(total, names.length);
    var out = [];
    for (var i = 0; i < names.length; i++) out.push({ name: names[i], stock: counts[i] });
    return out;
  }

  /* Compact seed table — id, slug, name, cat, price, stock, badge, colors, description */
  var RAW = [
    ["bl-001", "satin-signature-pajama", "Satin Signature Pyjama", "pajamas", 12900, 24, "Best-seller", ["champagne", "noir", "rose"], "Ensemble pyjama en satin de soie, coupe fluide et col à passepoil contrasté. La première signature by Leïlah."],
    ["bl-002", "nuit-de-soie-long-set", "Nuit de Soie", "pajamas", 14900, 12, "Nouveau", ["midnight", "noir", "champagne"], "Ensemble long en soie teinte nuit — manches longues, pantalon droit, somnolence élégante."],
    ["bl-003", "aube-cotton-pajama", "Aube Coton", "pajamas", 8900, 30, null, ["ivoire", "sauge", "blush"], "Pyjama en coton peigné doux, ton ivoire — la douceur des premiers matins."],
    ["bl-004", "douceur-short-set", "Douceur", "pajamas", 9900, 18, null, ["rose", "champagne", "ivoire"], "Short-set en satin léger, taille élastiquée et finitions ton sur ton."],
    ["bl-005", "caline-lounge-set", "Câline", "pajamas", 10900, 20, null, ["taupe", "sauge", "ivoire"], "Ensemble lounge en maille douce — parfait pour les après-midis lents."],
    ["bl-006", "reverie-silk-robe", "Rêverie", "pajamas", 13900, 6, null, ["champagne", "rose"], "Robe de chambre en soie, coupe vaporeuse et ceinture nouée — une échappée de douceur."],
    ["bl-007", "brise-modal-short-set", "Brise", "pajamas", 7900, 15, null, ["sauge", "ivoire", "blush"], "Short-set en modal respirant, teintes pastel — fraîcheur légère pour l'été."],
    ["bl-008", "etoile-gift-set", "Étoile Coffret", "pajamas", 16900, 10, "Best-seller", ["champagne", "rose"], "Coffret cadeau signature : pyjama, masque de soie et pochon brodé."],
    ["bl-009", "velours-lounge-pants", "Velours", "pajamas", 6900, 26, null, ["mocha", "noir", "espresso"], "Pantalon lounge en velours côtelé, coupe droite et taille souple."],
    ["bl-010", "songe-satin-camisole", "Songe", "pajamas", 5900, 28, null, ["champagne", "noir", "blush"], "Caraco en satin à fines bretelles — l'essentiel glissé sous un kimono."],
    ["bl-011", "lune-long-pajama", "Lune", "pajamas", 10900, 0, null, ["midnight", "noir"], "Ensemble long bicolore en satin — édition lune, bientôt de retour."],
    ["bl-012", "maison-slip-dress", "Maison Slip Dress", "clothing", 13900, 14, null, ["espresso", "noir", "perle"], "Robe slip en satin, coupe droite et décolleté fin — du soir au réveil."],
    ["bl-013", "colette-knit-top", "Colette", "clothing", 6900, 25, null, ["ivoire", "nude", "noir"], "Top maille cintré à fines côtes — la base élégante de toutes vos silhouettes."],
    ["bl-014", "azur-midi-skirt", "Azur", "clothing", 9900, 16, null, ["sable", "espresso", "ivoire"], "Jupe midi fluide, plis souples et taille haute — une ligne épurée."],
    ["bl-015", "lija-wide-trousers", "Lija", "clothing", 11900, 18, null, ["nude", "taupe", "noir"], "Pantalon large à plis, tombé impeccable — l'aisance d'un tailleur moderne."],
    ["bl-016", "duo-tailored-set", "Duo", "clothing", 18900, 7, null, ["espresso", "champagne"], "Ensemble tailleur deux pièces — veste souple et pantalon assorti."],
    ["bl-017", "rosee-wrap-dress", "Rosée", "clothing", 15900, 11, "Nouveau", ["rose", "blush", "ivoire"], "Robe portefeuille en satin rosé, taille nouée et mouvement léger."],
    ["bl-018", "brume-silk-blouse", "Brume", "clothing", 8900, 20, null, ["perle", "champagne", "noir"], "Chemisier en soie, manches bouffantes et col lavallière discret."],
    ["bl-019", "sillage-pleated-skirt", "Sillage", "clothing", 10900, 13, null, ["mocha", "sable", "perle"], "Jupe plissée midi, ceinture fine — le mouvement au bout des pas."],
    ["bl-020", "ligne-cropped-pants", "Ligne", "clothing", 9900, 22, null, ["noir", "espresso", "ivoire"], "Pantalon cropped droit, pinces avant — une coupe nette, un geste libre."],
    ["bl-021", "naila-leather-sandals", "Naïla", "shoes", 11900, 15, null, ["camel", "noir", "nude"], "Sandales en cuir à fines lanières, talon plat — l'été dans chaque pas."],
    ["bl-022", "alto-heeled-mule", "Alto", "shoes", 13900, 10, null, ["espresso", "camel", "noir"], "Mule à talon sculpté en cuir — la silhouette dressée avec grâce."],
    ["bl-023", "petale-ballet-flat", "Pétale", "shoes", 9900, 20, "Best-seller", ["rose", "ivoire", "noir"], "Ballerine souple à bout rond — le classique devenu signature."],
    ["bl-024", "course-minimal-sneaker", "Course", "shoes", 12900, 18, null, ["ivoire", "sauge", "noir"], "Sneaker minimale en cuir blanc cassé — la course douce du quotidien."],
    ["bl-025", "rive-strappy-heel", "Rive", "shoes", 14900, 6, null, ["noir", "sable"], "Sandale à talon fin et brides croisées — une rive élégante après le coucher du soleil."],
    ["bl-026", "sable-slide-sandal", "Sable", "shoes", 8900, 14, null, ["sable", "taupe", "espresso"], "Mule plate en cuir sable, semelle légère — l'essentiel d'été."],
    ["bl-027", "leila-structured-tote", "Leïla Tote", "handbags", 19900, 12, "Best-seller", ["camel", "espresso", "noir"], "Tote structuré en cuir grainé — le compagnon des journées complètes."],
    ["bl-028", "ondine-shoulder-bag", "Ondine", "handbags", 16900, 9, null, ["taupe", "mocha", "ivoire"], "Sac épaule souple à rabat, bandoulière réglable — une ondulation discrète."],
    ["bl-029", "mina-mini-bag", "Mina", "handbags", 12900, 15, null, ["noir", "perle", "camel"], "Mini sac à bandoulière — l'essentiel, en plus petit."],
    ["bl-030", "soiree-clutch", "Soirée", "handbags", 9900, 8, null, ["champagne", "noir", "rose"], "Pochette du soir en satin — l'éclat d'une nuit qui commence."],
    ["bl-031", "jour-everyday-tote", "Jour", "handbags", 14900, 11, null, ["sable", "taupe", "espresso"], "Tote en cuir souple, poche intérieure zippée — pensé pour toutes vos journées."],
    ["bl-032", "ecru-crescent-bag", "Écru", "handbags", 15900, 10, null, ["nude", "ivoire", "mocha"], "Sac croissant en cuir écru — une courbe douce sous le bras."],
    ["bl-033", "nomade-bucket-bag", "Nomade", "handbags", 13900, 13, null, ["mocha", "camel", "noir"], "Sac seau à cordon — l'appel du large, sans quitter la ville."],
  ];

  function buildSeedProducts() {
    var out = [];
    for (var i = 0; i < RAW.length; i++) {
      var r = RAW[i];
      var tone = (r[7][0] && COLORS[r[7][0]]) ? COLORS[r[7][0]].tone : "champagne";
      out.push({
        id: r[0], slug: r[1], name: r[2], cat: r[3], price: r[4], oldPrice: null,
        stock: r[5], badge: r[6] || null, colors: colorsFrom(r[7]), desc: r[8],
        sizes: sizesFrom(r[3], r[5]), images: [], available: r[5] > 0,
        tone: tone, mono: r[2].charAt(0),
      });
    }
    return out;
  }

  /* ============================================================
   * 6. Seed orders — immutable history (kept exactly as created)
   * ============================================================ */
  function seedOrders() {
    return [
      { id: "BL-7QK2M", createdAt: "2026-08-23T09:14:00.000Z",
        customer: { firstName: "Amel", lastName: "Benali", phone: "0555 21 34 08", wilaya: "Alger", commune: "Hydra", notes: "Livraison en après-midi de préférence." },
        items: [{ name: "Rêverie", colorLabel: "Champagne", size: "M", quantity: 1, price: 16900 }, { name: "Pétale", colorLabel: "Rose poudré", size: "38", quantity: 1, price: 9900 }],
        subtotal: 26800, deliveryFee: 0, total: 26800, paymentMethod: "baridimob", paymentStatus: "verification_required", orderStatus: "pending",
        paymentProof: { fileName: "baridimob-recu.jpg", fileSize: 842113 }, paymentReference: "BM-88213409", stockRestoredAt: null },
      { id: "BL-3XR9T", createdAt: "2026-08-22T17:42:00.000Z",
        customer: { firstName: "Lina", lastName: "Haddad", phone: "0661 90 12 77", wilaya: "Oran", commune: "Bir El Djir", notes: "" },
        items: [{ name: "Maison Slip Dress", colorLabel: "Espresso", size: "S", quantity: 1, price: 14900 }],
        subtotal: 14900, deliveryFee: 550, total: 15450, paymentMethod: "cod", paymentStatus: "pending", orderStatus: "confirmed",
        paymentProof: null, paymentReference: "", stockRestoredAt: null },
      { id: "BL-5MB1D", createdAt: "2026-08-21T11:05:00.000Z",
        customer: { firstName: "Sara", lastName: "Cherif", phone: "0770 45 66 21", wilaya: "Constantine", commune: "El Khroub", notes: "" },
        items: [{ name: "Leïla Tote", colorLabel: "Camel", size: "Unique", quantity: 1, price: 19900 }, { name: "Colette", colorLabel: "Ivoire", size: "M", quantity: 2, price: 7900 }],
        subtotal: 35700, deliveryFee: 0, total: 35700, paymentMethod: "baridimob", paymentStatus: "verified", orderStatus: "preparing",
        paymentProof: { fileName: "capture-paiement.png", fileSize: 512900 }, paymentReference: "BM-77120945", stockRestoredAt: null },
      { id: "BL-9WHK4", createdAt: "2026-08-19T15:20:00.000Z",
        customer: { firstName: "Yasmine", lastName: "Meziane", phone: "0540 33 89 14", wilaya: "Blida", commune: "Boufarik", notes: "" },
        items: [{ name: "Naïla", colorLabel: "Noir", size: "39", quantity: 1, price: 11900 }],
        subtotal: 11900, deliveryFee: 450, total: 12350, paymentMethod: "cod", paymentStatus: "pending", orderStatus: "shipped",
        paymentProof: null, paymentReference: "", stockRestoredAt: null },
      { id: "BL-2FDP6", createdAt: "2026-08-16T08:48:00.000Z",
        customer: { firstName: "Nour", lastName: "Belkacem", phone: "0559 74 20 03", wilaya: "Béjaïa", commune: "Akbou", notes: "" },
        items: [{ name: "Rêverie", colorLabel: "Rose poudré", size: "L", quantity: 1, price: 13900 }, { name: "Soirée", colorLabel: "Champagne", size: "Unique", quantity: 1, price: 9900 }],
        subtotal: 23800, deliveryFee: 550, total: 24350, paymentMethod: "baridimob", paymentStatus: "verified", orderStatus: "delivered",
        paymentProof: { fileName: "virement.pdf", fileSize: 224100 }, paymentReference: "BM-55901238", stockRestoredAt: null },
    ];
  }

  /* ============================================================
   * 7. Local persistence helpers
   * ============================================================ */
  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var dbCache = null;
  function db() {
    if (dbCache) return dbCache;
    var data = readLS(LS.DB, null);
    if (!data || !data.products || !data.orders || !data.seeded) {
      data = {
        seeded: true, updatedAt: new Date().toISOString(),
        products: buildSeedProducts(), orders: seedOrders(), seq: 100,
      };
      writeLS(LS.DB, data);
    }
    dbCache = data;
    return data;
  }
  function saveDB() {
    db().updatedAt = new Date().toISOString();
    var ok = writeLS(LS.DB, db());
    return ok;
  }
  /* ---------- admin PIN ----------
   * Priority: env var VITE_ADMIN_PIN (injected into the page at build/dev time,
   * visible in window.ADMIN_PIN_ENV) → locally stored code → generated code.
   * There is intentionally NO hardcoded default anymore.
   */
  var PIN_PLACEHOLDER = "%VITE_ADMIN_PIN%";
  function envAdminPin() {
    var v = (typeof window !== "undefined" && window.ADMIN_PIN_ENV) || null;
    return v && v !== PIN_PLACEHOLDER && String(v).trim() ? String(v).trim() : null;
  }
  function makePin() {
    var n = "";
    for (var i = 0; i < 6; i++) n += Math.floor(Math.random() * 10);
    return n;
  }
  /* Ensures a usable admin code exists and reports how it is sourced. */
  function adminPinInfo() {
    var env = envAdminPin();
    if (env) return { env: true, generated: false, pin: env };
    var s = settings();
    if (!s.pin) {
      s.pin = makePin();
      s.pinGenerated = true;
      saveSettings(s);
    }
    return { env: false, generated: !!s.pinGenerated, pin: s.pin };
  }
  var settingsCache = null;
  function settings() {
    var s = readLS(LS.SETTINGS, null);
    if (!s || typeof s !== "object") {
      s = { lang: "fr", hero: { fileName: null, fileType: null, fileSize: null, updatedAt: null },
        /* Active public video URL. Normally left empty: the resolved public URL
         * is derived from the Supabase storage config (fixed object path), so
         * every visitor loads the same cloud video. May hold a custom public
         * HTTPS URL (e.g. another CDN) set in Admin → Réglages. */
        heroVideoUrl: "",
        supabase: { url: "", anonKey: "" },
        theme: { defaultTheme: "light", allowSwitch: true },
        contact: { title: "Contactez-nous", description: "N'hésitez pas à nous contacter pour toute question.",
          phone: "", whatsapp: "", email: "",
          instagram: "https://www.instagram.com/byleilah.off",
          tiktok: "https://www.tiktok.com/@byleilah0",
          socials: [
            { name: "Instagram", url: "https://www.instagram.com/byleilah.off", icon: "instagram" },
            { name: "TikTok", url: "https://www.tiktok.com/@byleilah0", icon: "tiktok" }
          ],
          additional: ""
        },
        about: { title: "À propos de by Leïlah", description: "Notre histoire",
          content: "by Leïlah est une marque de mode féminine née en Algérie. Nous créons des pyjamas en soie, des vêtements du quotidien et des silhouettes composées, pensés pour vos moments les plus doux. Chaque pièce est conçue avec soin, alliant élégance et confort.",
          images: [], additional: ""
        },
        newSection: { title: "Nouveautés", description: "Découvrez nos dernières pièces",
          productIds: [], additional: ""
        },
        comingSoon: { title: "Bientôt disponible", description: "Restez à l'écoute pour nos prochaines collections",
          items: [], additional: ""
        },
        socials: [
          { name: "Instagram", url: "https://www.instagram.com/byleilah.off", icon: "instagram" },
          { name: "TikTok", url: "https://www.tiktok.com/@byleilah0", icon: "tiktok" }
        ]
      };
      writeLS(LS.SETTINGS, s);
    }
    if (!s.hero) s.hero = { fileName: null, fileType: null, fileSize: null, updatedAt: null };
    /* Only backfill when the key is missing entirely — an explicit "" means
     * the admin removed the video and the silk fallback should stay.
     * Legacy migration: the old default was a static file the admin had to
     * export + redeploy; that workflow was removed, so migrate it to "" and
     * derive the URL from the cloud storage config instead. */
    if (s.heroVideoUrl === undefined || s.heroVideoUrl === "hero-video.mp4") s.heroVideoUrl = "";
    if (!s.supabase) s.supabase = { url: "", anonKey: "" };
    if (!s.theme) s.theme = { defaultTheme: "light", allowSwitch: true };
    if (!s.contact) s.contact = { title: "Contactez-nous", description: "", phone: "", whatsapp: "", email: "",
      instagram: "https://www.instagram.com/byleilah.off", tiktok: "https://www.tiktok.com/@byleilah0",
      socials: [
        { name: "Instagram", url: "https://www.instagram.com/byleilah.off", icon: "instagram" },
        { name: "TikTok", url: "https://www.tiktok.com/@byleilah0", icon: "tiktok" }
      ], additional: "" };
    if (!s.about) s.about = { title: "À propos de by Leïlah", description: "Notre histoire",
      content: "by Leïlah est une marque de mode féminine née en Algérie.", images: [], additional: "" };
    if (!s.newSection) s.newSection = { title: "Nouveautés", description: "Découvrez nos dernières pièces", productIds: [], additional: "" };
    if (!s.comingSoon) s.comingSoon = { title: "Bientôt disponible", description: "", items: [], additional: "" };
    if (!s.socials) s.socials = [
      { name: "Instagram", url: "https://www.instagram.com/byleilah.off", icon: "instagram" },
      { name: "TikTok", url: "https://www.tiktok.com/@byleilah0", icon: "tiktok" }
    ];
    settingsCache = s;
    /* The env var always wins at read time — returned on a copy so it is never
     * persisted as the stored pin (removing the var later restores the local code). */
    var env = envAdminPin();
    if (env) return Object.assign({}, s, { pin: env });
    return s;
  }
  function saveSettings(obj) {
    /* Prefer the caller's mutated object. settings() may return a shallow copy
     * (when VITE_ADMIN_PIN is active), so mutations on it would otherwise be
     * lost. Never persist the injected env pin: strip it when it matches. */
    var env = envAdminPin();
    var target = obj || settingsCache || settings();
    if (env && target && target.pin === env) {
      target = Object.assign({}, target);
      delete target.pin;
    }
    return writeLS(LS.SETTINGS, target);
  }

  function cartRaw() { return readLS(LS.CART, { items: [] }); }
  function saveCart(items) { writeLS(LS.CART, { items: items }); }
  function wishRaw() { return readLS(LS.WISH, []); }
  function saveWish(list) { writeLS(LS.WISH, list); }

  /* ============================================================
   * 8. Products — accessors + availability
   * ============================================================ */
  function getProducts() { return db().products; }
  function getProduct(idOrSlug) {
    var list = getProducts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === idOrSlug || list[i].slug === idOrSlug) return list[i];
    }
    return null;
  }
  function totalStock(p) {
    if (!p || !p.sizes) return 0;
    var s = 0;
    for (var i = 0; i < p.sizes.length; i++) s += (p.sizes[i].stock || 0);
    return s;
  }
  function sizeStock(p, sizeName) {
    if (!p || !p.sizes) return 0;
    for (var i = 0; i < p.sizes.length; i++) if (p.sizes[i].name === sizeName) return p.sizes[i].stock || 0;
    return 0;
  }
  function hasSize(p, sizeName) {
    if (!p || !p.sizes) return false;
    for (var i = 0; i < p.sizes.length; i++) if (p.sizes[i].name === sizeName) return true;
    return false;
  }
  function findSize(p, sizeName) {
    if (!p || !p.sizes) return null;
    for (var i = 0; i < p.sizes.length; i++) if (p.sizes[i].name === sizeName) return p.sizes[i];
    return null;
  }
  /* A product is available when enabled AND at least one unit exists. */
  function isAvail(p) { return !!(p && p.available !== false && totalStock(p) > 0); }
  function availLabel(p) {
    if (!p) return "—";
    if (totalStock(p) === 0) return "Rupture";
    return p.available === false ? "Indisponible" : "Disponible";
  }
  /* Any stock mutation that empties a product flips it to Out of Stock. */
  function syncAvailability() {
    var list = getProducts(), changed = false;
    for (var i = 0; i < list.length; i++) {
      if (totalStock(list[i]) === 0 && list[i].available !== false) { list[i].available = false; changed = true; }
    }
    if (changed) saveDB();
    return changed;
  }

  /* ============================================================
   * 9. Cart
   * ============================================================ */
  function cartCount() {
    var items = cartRaw().items || [];
    return items.reduce(function (s, it) { return s + (it.qty || 0); }, 0);
  }
  function keyFor(pid, colorLabel, size) { return pid + "|" + (colorLabel || "") + "|" + (size || ""); }

  /*
   * Enriched view of the cart used by bag/checkout.
   * live fields: product, unitPrice, stockAvail, ok, reason
   */
  function cartView() {
    var raw = (cartRaw().items || []).slice();
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var it = raw[i];
      var p = getProduct(it.pid);
      var stock = p ? sizeStock(p, it.size) : 0;
      var ok = true, reason = "";
      if (!p) { ok = false; reason = "Article indisponible"; }
      else if (!hasSize(p, it.size)) { ok = false; reason = "Taille retirée du catalogue"; }
      else if (p.available === false && stock <= 0) { ok = false; reason = "Rupture de stock"; }
      else if (stock <= 0) { ok = false; reason = "Rupture de stock pour cette taille"; }
      else if (it.qty > stock) { it = { pid: it.pid, slug: it.slug, name: it.name, colorHex: it.colorHex, colorLabel: it.colorLabel, size: it.size, qty: stock, tone: it.tone }; reason = "Quantité ramenée au stock disponible"; }
      out.push({
        key: keyFor(it.pid, it.colorLabel, it.size), pid: it.pid, slug: it.slug, name: it.name,
        colorHex: it.colorHex || null, colorLabel: it.colorLabel || "", size: it.size, qty: it.qty,
        tone: it.tone || "champagne", product: p, unitPrice: p ? p.price : 0,
        stockAvail: stock, ok: ok, reason: reason,
      });
    }
    return out;
  }
  function cartTotals(view) {
    var subtotal = 0;
    for (var i = 0; i < view.length; i++) if (view[i].ok) subtotal += view[i].unitPrice * view[i].qty;
    return subtotal;
  }
  function addToCart(product, opts) {
    var colorLabel = (opts && opts.colorLabel) || (product.colors && product.colors[0] && product.colors[0].label) || "";
    var colorHex = null, tone = product.tone || "champagne";
    if (product.colors && product.colors.length) {
      for (var i = 0; i < product.colors.length; i++) {
        if (product.colors[i].label === colorLabel) { colorHex = product.colors[i].hex; tone = product.colors[i].tone; }
      }
    }
    var size = (opts && opts.size) || "";
    var qty = Math.max(1, parseInt((opts && opts.qty) || 1, 10) || 1);
    if (!product) return { ok: false, msg: "Produit introuvable." };
    if (!hasSize(product, size)) return { ok: false, msg: "Choisissez une taille." };
    var stock = sizeStock(product, size);
    if (stock <= 0) return { ok: false, msg: "Cette taille est épuisée." };
    if (product.available === false) return { ok: false, msg: "Ce produit est indisponible pour le moment." };
    var items = (cartRaw().items || []).slice();
    var key = keyFor(product.id, colorLabel, size);
    var existing = null;
    for (var j = 0; j < items.length; j++) if (keyFor(items[j].pid, items[j].colorLabel, items[j].size) === key) existing = items[j];
    var wanted = (existing ? existing.qty : 0) + qty;
    if (wanted > stock) {
      var left = stock - (existing ? existing.qty : 0);
      return { ok: false, msg: left <= 0 ? "Déjà tout le stock disponible dans votre panier." : "Seulement " + left + " disponible(s) pour cette taille." };
    }
    if (existing) existing.qty = wanted;
    else items.push({ pid: product.id, slug: product.slug, name: product.name, colorHex: colorHex, colorLabel: colorLabel, size: size, qty: qty, tone: tone });
    saveCart(items);
    return { ok: true, msg: "Ajouté au panier", count: cartCount() };
  }
  function setCartQty(key, qty) {
    var items = (cartRaw().items || []).slice();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (keyFor(it.pid, it.colorLabel, it.size) !== key) continue;
      var p = getProduct(it.pid);
      var stock = p ? sizeStock(p, it.size) : 0;
      var v = parseInt(qty, 10) || 0;
      /* v <= 0 → remove; stock exhausted/removed → remove too (a clamped-to-zero
       * line would otherwise linger forever in the cart) */
      if (v <= 0 || stock <= 0) { items.splice(i, 1); }
      else { it.qty = Math.min(v, stock); }
      saveCart(items);
      return { ok: true, count: cartCount() };
    }
    return { ok: false };
  }
  function removeCartKey(key) {
    var items = (cartRaw().items || []).slice();
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (keyFor(it.pid, it.colorLabel, it.size) === key) items.splice(i, 1);
    }
    saveCart(items);
    return cartCount();
  }
  function clearCart() { saveCart([]); }

  /* ============================================================
   * 10. Orders — creation (with stock check/deduct) + lifecycle
   * ============================================================ */
  function newOrderId() {
    var chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789", id = "BL-";
    for (var i = 0; i < 5; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  }

  /*
   * Validate the whole cart against the live catalogue, then, on success,
   * create the order (historical snapshot), deduct stock, auto flip to
   * Out of Stock anything emptied, and empty the cart.
   */
  function createOrder(customer, opts) {
    opts = opts || {};
    var view = cartView();
    if (!view.length) return { ok: false, error: "Votre panier est vide." };
    var blocked = [];
    for (var i = 0; i < view.length; i++) {
      var v = view[i];
      if (!v.ok) blocked.push(v.name + " (" + v.size + ") : " + v.reason);
      else if (!v.product || v.product.available === false) blocked.push(v.name + " : produit indisponible");
      else if (v.stockAvail < v.qty) blocked.push(v.name + " (" + v.size + ") : seulement " + v.stockAvail + " disponible(s)");
    }
    if (blocked.length) return { ok: false, error: blocked.join(" · ") };

    var code = parseInt(opts.wilayaCode, 10) || 0;
    var subtotal = cartTotals(view);
    var fee = feeFor(code, subtotal);
    if (fee.none) return { ok: false, error: "Sélectionnez une wilaya de livraison." };
    var total = subtotal + (fee.free ? 0 : fee.fee);

    var items = [];
    for (var j = 0; j < view.length; j++) {
      var it = view[j];
      /* price is the PER-UNIT price — matching the seed orders — so line totals
       * are always rendered as price × quantity everywhere (checkout success
       * screen and the admin order view). Storing the line total here made
       * quantity ≥ 2 orders display twice their real amount. */
      items.push({
        pid: it.pid, slug: it.slug, name: it.name, colorLabel: it.colorLabel, colorHex: it.colorHex,
        size: it.size, quantity: it.qty, unitPrice: it.unitPrice, price: it.unitPrice,
      });
    }
    var order = {
      id: newOrderId(),
      createdAt: new Date().toISOString(),
      customer: {
        firstName: (customer.firstName || "").trim(), lastName: (customer.lastName || "").trim(),
        phone: (customer.phone || "").trim(), wilaya: wilayaName(code), commune: (customer.commune || "").trim(),
        address: (customer.address || "").trim(), notes: (customer.notes || "").trim(),
      },
      items: items, subtotal: subtotal, deliveryFee: fee.free ? 0 : fee.fee, total: total,
      paymentMethod: opts.method === "cod" ? "cod" : "baridimob",
      paymentStatus: opts.method === "cod" ? "pending" : "verification_required",
      orderStatus: opts.method === "cod" ? "confirmed" : "pending",
      paymentProof: opts.proof || null, paymentReference: (opts.reference || "").trim(),
      stockRestoredAt: null,
    };

    /* atomic pre-check, then deduct stock (sizes only) */
    for (var k = 0; k < view.length; k++) {
      var line = view[k];
      var p = getProduct(line.pid);
      if (!p) return { ok: false, error: line.name + " n’existe plus dans le catalogue." };
      var sz = findSize(p, line.size);
      if (!sz) return { ok: false, error: "Taille “" + line.size + "” retirée pour " + line.name + "." };
      if ((sz.stock || 0) < line.qty) return { ok: false, error: line.name + " (" + line.size + ") : stock insuffisant." };
    }
    for (var d = 0; d < view.length; d++) {
      var dl = view[d];
      var dp = getProduct(dl.pid);
      findSize(dp, dl.size).stock = Math.max(0, findSize(dp, dl.size).stock - dl.qty);
    }
    db().orders.unshift(order);
    syncAvailability();
    saveDB();
    clearCart();
    return { ok: true, order: order };
  }

  function findOrder(id) {
    var list = db().orders || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Restore the stock for an order. Only lines that resolve to a live product
   * size are restored; unresolvable lines produce warnings (history stays
   * intact). Returns { restored, warnings } — restored lists exactly which
   * quantities were given back, so a later reactivation can deduct them back. */
  function restoreStockForOrder(o) {
    var restored = [], warnings = [];
    if (!o || !o.items) return { restored: restored, warnings: warnings };
    for (var i = 0; i < o.items.length; i++) {
      var it = o.items[i];
      if (!it.pid) {
        warnings.push(it.name + " : commande antérieure au suivi de stock, aucune quantité à restituer");
        continue;
      }
      var p = getProduct(it.pid);
      if (!p) { warnings.push(it.name + " : produit supprimé, stock non restitué"); continue; }
      var sz = findSize(p, it.size);
      if (!sz) { warnings.push(it.name + " (" + it.size + ") : taille retirée, stock non restitué"); continue; }
      sz.stock = (sz.stock || 0) + it.quantity;
      restored.push({ pid: it.pid, size: it.size, quantity: it.quantity });
    }
    return { restored: restored, warnings: warnings };
  }
  /* Symmetric re-deduction when a cancelled order is reactivated. Deducts only
   * the quantities that were actually restored (o.stockRestore) and never
   * blocks on products/sizes that have since disappeared — there is nothing to
   * take back from them. Only insufficient current stock blocks reactivation. */
  function deductStockForOrder(o) {
    var problems = [];
    var restored = (o && o.stockRestore) || [];
    for (var i = 0; i < restored.length; i++) {
      var e = restored[i];
      var p = getProduct(e.pid);
      if (!p) continue;
      var sz = findSize(p, e.size);
      if (!sz) continue;
      if ((sz.stock || 0) < e.quantity) {
        problems.push((p.name || e.pid) + " (" + e.size + ") : stock insuffisant pour réactiver");
      }
    }
    if (problems.length) return problems;
    for (var j = 0; j < restored.length; j++) {
      var re = restored[j];
      var prod = getProduct(re.pid);
      if (!prod) continue;
      var s = findSize(prod, re.size);
      if (!s) continue;
      s.stock = (s.stock || 0) - re.quantity;
    }
    return [];
  }

  var ORDER_STATUSES = ["pending", "confirmed", "preparing", "shipped", "delivered", "cancelled"];
  var STATUS_FR = {
    pending: "En attente", confirmed: "Confirmée", preparing: "En préparation",
    shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée",
  };
  var PAYMENT_FR = {
    pending: "En attente", verification_required: "Vérification requise",
    verified: "Vérifié", rejected: "Refusé",
  };

  function setOrderStatus(id, next) {
    var o = findOrder(id);
    if (!o) return { ok: false, error: "Commande introuvable." };
    var cur = o.orderStatus;
    if (next === cur) return { ok: true };
    if (ORDER_STATUSES.indexOf(next) === -1) return { ok: false, error: "Statut inconnu." };

    var warnings = [];
    if (next === "cancelled") {
      /* Restore stock exactly once, persist the restore marker, and ALWAYS set
       * the status — even when some lines could not be restored. Previously the
       * early return skipped the status change and the save, so the order stayed
       * active and a later retry could restore the same stock twice. */
      if (cur !== "cancelled" && !o.stockRestoredAt) {
        var res = restoreStockForOrder(o);
        warnings = res.warnings;
        if (res.restored.length) {
          o.stockRestoredAt = new Date().toISOString();
          o.stockRestore = res.restored;
        }
      }
    } else if (cur === "cancelled" && o.stockRestoredAt) {
      var problems = deductStockForOrder(o);
      if (problems.length) return { ok: false, error: "Réactivation impossible : " + problems.join(" · ") };
      o.stockRestoredAt = null;
      o.stockRestore = null;
    }
    o.orderStatus = next;
    saveDB();
    return warnings.length ? { ok: true, warnings: warnings } : { ok: true };
  }
  function verifyPayment(id) {
    var o = findOrder(id);
    if (!o) return { ok: false, error: "Commande introuvable." };
    o.paymentStatus = "verified";
    if (o.orderStatus === "pending") o.orderStatus = "confirmed";
    saveDB();
    return { ok: true };
  }
  function rejectPayment(id) {
    var o = findOrder(id);
    if (!o) return { ok: false, error: "Commande introuvable." };
    o.paymentStatus = "rejected";
    saveDB();
    return { ok: true };
  }

  /* ============================================================
   * 11. Product mutations (admin)
   * ============================================================ */
  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "produit";
  }
  function upsertProduct(form) {
    var list = getProducts();
    var existing = form.id ? getProduct(form.id) : null;
    var p = existing || {
      id: "bl-" + String(100 + list.length + 1),
      slug: slugify(form.name), createdAt: new Date().toISOString(),
      images: [], tone: "champagne", mono: (form.name || "P").charAt(0),
    };
    /* ensure unique slug */
    p.slug = slugify(form.name);
    var take = p.slug;
    for (var i = 0, dup = 0; i < list.length; i++) {
      if (list[i].id !== p.id && list[i].slug === take) { dup++; take = p.slug + "-" + dup; i = -1; }
    }
    p.slug = take;
    p.name = form.name;
    p.cat = form.cat;
    p.price = Math.max(0, Math.round(parseFloat(form.price) || 0));
    p.oldPrice = form.oldPrice === "" || form.oldPrice == null ? null : Math.max(0, Math.round(parseFloat(form.oldPrice) || 0));
    p.desc = form.desc || "";
    p.colors = form.colors || [];
    p.sizes = form.sizes || [];
    p.images = form.images || [];
    p.available = form.available !== false && totalStock(p) > 0;
    p.tone = (p.colors[0] && p.colors[0].tone) || "champagne";
    p.mono = (p.name || "P").charAt(0);
    if (!existing) list.push(p);
    saveDB();
    return p;
  }
  function deleteProduct(id) {
    var list = getProducts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); saveDB(); return { ok: true }; }
    }
    return { ok: false, error: "Produit introuvable." };
  }
  function setStock(id, sizeName, delta) {
    var p = getProduct(id);
    if (!p) return { ok: false, error: "Produit introuvable." };
    var sz = findSize(p, sizeName);
    if (!sz) return { ok: false, error: "Taille introuvable." };
    sz.stock = Math.max(0, (sz.stock || 0) + delta);
    syncAvailability();
    saveDB();
    return { ok: true, stock: totalStock(p), available: p.available !== false };
  }
  function setAvailable(id, flag) {
    var p = getProduct(id);
    if (!p) return { ok: false, error: "Produit introuvable." };
    if (flag && totalStock(p) === 0) return { ok: false, error: "Impossible : le stock total est à zéro. Ajoutez du stock d’abord." };
    p.available = !!flag;
    saveDB();
    return { ok: true };
  }
  function resetDemoData() {
    dbCache = null;
    clearCart();
    try { localStorage.removeItem(LS.DB); localStorage.removeItem(LS.CART); } catch (e) { /* ignore */ }
    db();
    return true;
  }

  /* ============================================================
   * 12. Home-hero video — IndexedDB (persists across sessions)
   * ============================================================ */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error("IndexedDB indisponible")); };
      } catch (e) { reject(e); }
    });
  }
  function heroSaveMeta(meta) {
    var s = settings();
    s.hero = { fileName: meta.fileName, fileType: meta.fileType, fileSize: meta.fileSize, updatedAt: new Date().toISOString() };
    saveSettings(s);
  }
  function heroLoadMeta() { return settings().hero; }
  function heroStore(blob) {
    return idbOpen().then(function (dbconn) {
      return new Promise(function (resolve, reject) {
        var tx = dbconn.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(blob, IDB_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error("Enregistrement impossible")); };
        tx.onabort = function () { reject(new Error("Enregistrement annulé")); };
      });
    });
  }
  function heroGetBlob() {
    return idbOpen().then(function (dbconn) {
      return new Promise(function (resolve, reject) {
        var tx = dbconn.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error("Lecture impossible")); };
      });
    });
  }
  function heroRemove() {
    return idbOpen().then(function (dbconn) {
      return new Promise(function (resolve, reject) {
        var tx = dbconn.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error("Suppression impossible")); };
      });
    });
  }
  function heroActive() {
    var m = heroLoadMeta();
    return !!(m && m.fileName);
  }

  /* ============================================================
   * 12b. Public hero video — Supabase Storage
   * ============================================================
   * The hero video is a PUBLIC asset: it lives in a Supabase Storage bucket at
   * a FIXED object path, so the public URL never changes. Replacing the video =
   * overwriting that one object (upsert) — every visitor instantly gets the new
   * video; no export, no redeploy, no browser storage involved.
   * The anon key is public by design (it ships inside the site itself) and is
   * restricted by RLS to this single object; visitors only READ the resulting
   * public HTTPS URL. */
  var HERO_BUCKET = "byleilah";
  var HERO_PATH = "hero/home-hero.mp4";

  function isPublicUrl(u) {
    if (typeof u !== "string" || !u) return false;
    if (u.indexOf("blob:") === 0 || u.indexOf("file:") === 0) return false;
    if (!/^https?:\/\//i.test(u)) return false;
    var host = String(u.split("/")[2] || "").toLowerCase();
    if (!host) return false;
    if (host.indexOf("[::1]") === 0) return false;
    /* strip any port before host checks */
    var h = host.split(":")[0];
    if (h === "localhost" || h.slice(-10) === ".localhost") return false;
    if (/^(127\.|10\.|0\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;
  }

  function supabaseCfg() {
    /* Build-injected config (supabase-config.js, generated from env vars at
     * build time) wins; the admin-pasted copy in settings is the fallback for
     * local testing. Both values are public by design. */
    var built = (typeof window !== "undefined" && window.BL_SUPABASE) || {};
    var s = settings().supabase || {};
    return { url: String(built.url || s.url || "").trim(), anonKey: String(built.anonKey || s.anonKey || "").trim() };
  }

  function heroPublicUrl() {
    /* 1) explicit public HTTPS override (custom CDN…), 2) derived cloud URL,
     * 3) none → the silk fallback stays. Never a blob:/localhost/file: URL. */
    var override = settings().heroVideoUrl || "";
    if (isPublicUrl(override)) return override;
    var cfg = supabaseCfg();
    if (cfg.url && /^https?:\/\//i.test(cfg.url)) {
      return cfg.url.replace(/\/+$/, "") + "/storage/v1/object/public/" + HERO_BUCKET + "/" + HERO_PATH;
    }
    return "";
  }

  function supabaseUploadHero(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var cfg = supabaseCfg();
      if (!cfg.url || !cfg.anonKey) { reject(new Error("Stockage cloud non configuré (Supabase).")); return; }
      var xhr = new XMLHttpRequest();
      xhr.open("PUT", cfg.url.replace(/\/+$/, "") + "/storage/v1/object/" + HERO_BUCKET + "/" + HERO_PATH);
      xhr.setRequestHeader("apikey", cfg.anonKey);
      xhr.setRequestHeader("Authorization", "Bearer " + cfg.anonKey);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(heroPublicUrl()); return; }
        var msg = "Téléversement refusé (statut " + xhr.status + ")";
        try { var j = JSON.parse(xhr.responseText || "{}"); if (j && j.message) msg = j.message; } catch (e) { /* ignore */ }
        reject(new Error(msg));
      };
      xhr.onerror = function () { reject(new Error("Erreur réseau pendant le téléversement.")); };
      xhr.send(file);
    });
  }

  function supabaseRemoveHero() {
    return new Promise(function (resolve, reject) {
      var cfg = supabaseCfg();
      if (!cfg.url || !cfg.anonKey) { resolve(false); return; }
      var xhr = new XMLHttpRequest();
      xhr.open("DELETE", cfg.url.replace(/\/+$/, "") + "/storage/v1/object/" + HERO_BUCKET + "/" + HERO_PATH);
      xhr.setRequestHeader("apikey", cfg.anonKey);
      xhr.setRequestHeader("Authorization", "Bearer " + cfg.anonKey);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
        reject(new Error("Suppression cloud refusée (statut " + xhr.status + ")."));
      };
      xhr.onerror = function () { reject(new Error("Erreur réseau pendant la suppression.")); };
      xhr.send();
    });
  }

  /* ============================================================
   * 13. Formatting / small utils
   * ============================================================ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function grp(n) { return Math.round(n || 0).toLocaleString("en-US"); }
  function money(n) { return grp(n) + " DA"; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }
    catch (e) { return iso; }
  }
  function humanSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function toast(msg) {
    var el = document.querySelector(".toast");
    var text;
    if (el) {
      text = el.querySelector("#toast-text") || el.querySelector("span:last-child") || el;
      text.textContent = msg;
      el.classList.add("show");
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
    }
  }
  function refreshBagBadges(root) {
    var count = cartCount();
    var nodes = (root || document).querySelectorAll(".bag-count");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = count;
      nodes[i].style.display = count > 0 ? "" : "none";
    }
  }
  function cardMediaHTML(p, opts) {
    opts = opts || {};
    var idx = opts.index || 0;
    var url = p.images && p.images.length ? p.images[Math.min(idx, p.images.length - 1)] : null;
    var tone = (p.colors && p.colors[0] && p.colors[0].tone) || p.tone || "champagne";
    if (url) {
      return '<div class="ph" style="background:#EDE3D2"><img src="' + esc(url) + '" alt="' + esc(p.name) + '" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" /></div>';
    }
    return '<div class="ph t-' + tone + '" data-ph data-seed="' + esc(p.slug + "-" + (opts.varSeed || "")) + '" data-tone="' + tone + '" data-mono="' + esc(p.mono || p.name.charAt(0)) + '"></div>';
  }
  function swatchesHTML(colors, max) {
    max = max || 4;
    var list = colors || [];
    var h = '<div class="swatches">';
    var n = Math.min(list.length, max);
    for (var i = 0; i < n; i++) h += '<span class="sw" style="background:' + esc(list[i].hex) + '" title="' + esc(list[i].label) + '"></span>';
    if (list.length > max) h += '<span class="sw-more">+' + (list.length - max) + '</span>';
    return h + "</div>";
  }
  function productHref(p) { return "product.html?p=" + encodeURIComponent(p.slug); }

  /* ============================================================
   * 13b. Cloud-sync hooks (consumed by cloud.js — additive only)
   * ------------------------------------------------------------
   * The synchronous BL.* mirror stays the UI source. cloud.js replaces the
   * mirror with Supabase data (applyCatalog / applyCloudSettings /
   * applyOrders) and pages defer their first render until the initial sync
   * settles through BL.whenReady(init). When cloud.js is absent (offline
   * dev, tests) whenReady() resolves immediately on the local mirror.
   * ============================================================ */
  var cloudReadyHook = null;
  function setCloudReadyHook(fn) { cloudReadyHook = (typeof fn === "function") ? fn : null; }
  function whenReady(fn) {
    function run() {
      var gate = cloudReadyHook ? cloudReadyHook() : null;
      Promise.resolve(gate).then(function () {
        try { fn(); } catch (e) { /* never break the page */ }
      });
    }
    try {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { run(); });
      else run();
    } catch (e) { run(); }
  }
  /* Replace the product mirror with cloud rows (already hydrated to the
   * local product shape by cloud.js). Keeps localStorage in sync too. */
  function applyCatalog(products) {
    var d = db();
    d.products = Array.isArray(products) ? products.slice() : [];
    return saveDB();
  }
  /* Merge cloud website_settings into the local settings object. Only the
   * cloud-managed public keys are applied — local config keys (heroVideoUrl,
   * supabase, pin) are never overwritten by the cloud. */
  function applyCloudSettings(cloudData) {
    if (!cloudData || typeof cloudData !== "object") return false;
    var s = settings();
    var keys = ["contact", "about", "newSection", "comingSoon", "socials", "theme"];
    for (var i = 0; i < keys.length; i++) {
      if (cloudData[keys[i]] !== undefined) s[keys[i]] = cloudData[keys[i]];
    }
    return saveSettings(s);
  }
  /* Replace the orders mirror (admin feed from bl_list_orders). */
  function applyOrders(list) {
    var d = db();
    d.orders = Array.isArray(list) ? list.slice() : [];
    return saveDB();
  }
  /* Deep snapshot of the current LOCAL mirror — offered once by the admin
   * console to import the pre-existing browser data into an empty cloud. */
  function cloudExport() {
    var d = db();
    return JSON.parse(JSON.stringify({
      products: d.products || [],
      orders: d.orders || [],
      settings: readLS(LS.SETTINGS, null),
    }));
  }
  /* ============================================================
   * 14. Export
   * ============================================================ */
  /* ============================================================
   * 15. Theme helpers
   * ============================================================ */
  function getTheme() {
    try { var t = localStorage.getItem('bl.theme'); if (t === 'dark' || t === 'light') return t; } catch(e){}
    var s = settings().theme || {};
    return s.defaultTheme === 'dark' ? 'dark' : 'light';
  }
  function setTheme(mode) {
    try { localStorage.setItem('bl.theme', mode); } catch(e){}
  }
  function applyTheme() {
    var mode = getTheme();
    document.documentElement.setAttribute('data-theme', mode);
  }

  window.BL = {
    LS: LS,
    STORE: STORE, BARIDIMOB: BARIDIMOB,
    DEFAULT_HOME_FEE: DEFAULT_HOME_FEE, FREE_DELIVERY_THRESHOLD: FREE_DELIVERY_THRESHOLD,
    CATS: CATS, catLabel: catLabel,
    WILAYAS: WILAYAS, COMMUNES: COMMUNES, wilayaName: wilayaName, feeFor: feeFor,
    TONES: TONES, toneExists: toneExists, silkSVG: silkSVG, paintPH: paintPH,
    settings: settings, saveSettings: saveSettings,
    envAdminPin: envAdminPin, adminPinInfo: adminPinInfo,
    db: db, saveDB: saveDB,
    getProducts: getProducts, getProduct: getProduct,
    totalStock: totalStock, sizeStock: sizeStock, hasSize: hasSize, findSize: findSize,
    isAvail: isAvail, availLabel: availLabel, syncAvailability: syncAvailability,
    cartCount: cartCount, cartView: cartView, cartTotals: cartTotals,
    addToCart: addToCart, setCartQty: setCartQty, removeCartKey: removeCartKey, clearCart: clearCart,
    wishRaw: wishRaw, saveWish: saveWish,
    createOrder: createOrder, findOrder: findOrder,
    ORDER_STATUSES: ORDER_STATUSES, STATUS_FR: STATUS_FR, PAYMENT_FR: PAYMENT_FR,
    setOrderStatus: setOrderStatus, verifyPayment: verifyPayment, rejectPayment: rejectPayment,
    slugify: slugify, upsertProduct: upsertProduct, deleteProduct: deleteProduct,
    setStock: setStock, setAvailable: setAvailable, resetDemoData: resetDemoData,
    heroActive: heroActive, heroLoadMeta: heroLoadMeta, heroSaveMeta: heroSaveMeta,
    heroStore: heroStore, heroGetBlob: heroGetBlob, heroRemove: heroRemove,
    heroVideoUrl: heroPublicUrl, isPublicUrl: isPublicUrl,
    supabaseCfg: supabaseCfg, supabaseUploadHero: supabaseUploadHero, supabaseRemoveHero: supabaseRemoveHero,
    HERO_BUCKET: HERO_BUCKET, HERO_PATH: HERO_PATH,
    getThemeSettings: function(){return settings().theme||{defaultTheme:"light",allowSwitch:true}},
    getContact: function(){return settings().contact},
    getAbout: function(){return settings().about},
    getNewSection: function(){return settings().newSection},
    getComingSoon: function(){return settings().comingSoon},
    getTheme: getTheme, setTheme: setTheme, applyTheme: applyTheme,
    getSocials: function(){return settings().socials||[]},
    esc: esc, money: money, fmtDate: fmtDate, humanSize: humanSize,
    toast: toast, refreshBagBadges: refreshBagBadges,
    cardMediaHTML: cardMediaHTML, swatchesHTML: swatchesHTML, productHref: productHref,
    /* cloud-sync hooks (cloud.js) */
    setCloudReadyHook: setCloudReadyHook, whenReady: whenReady,
    applyCatalog: applyCatalog, applyCloudSettings: applyCloudSettings,
    applyOrders: applyOrders, cloudExport: cloudExport,
  };
})();
