/* by Leïlah — Supabase config (public-by-design values).
 *
 * scripts/build.mjs regenerates this file at build time from the
 * SUPABASE_URL / SUPABASE_ANON_KEY environment variables (NEXT_PUBLIC_*
 * aliases are also accepted). The anon key is a PUBLIC key — it is meant to
 * ship inside client code — and is locked down by RLS to the single hero-video
 * object. Never put a service-role or secret key here.
 */
window.BL_SUPABASE = {
  url: "",
  anonKey: ""
};

/* ============================================================
 * by Leïlah — public hero video wiring (shared)
 * ============================================================
 * Kept here on purpose so the homepage can resolve the public hero URL
 * even before admin-app.js (which owns the cloud upload/delete APIs) is
 * available. The Site header / slide menu expose the ☰ button; this file
 * just provides the public URL resolver + a one-shot activation helper.
 */
(function () {
  "use strict";

  var HERO_BUCKET = "byleilah";
  var HERO_PATH = "hero/home-hero.mp4";

  function supabaseCfg() {
    var built = (typeof window !== "undefined" && window.BL_SUPABASE) || {};
    var s = (window.BL && window.BL.settings ? window.BL.settings() : null) || {};
    var sSup = s.supabase || {};
    return {
      url: String(built.url || sSup.url || "").trim(),
      anonKey: String(built.anonKey || sSup.anonKey || "").trim()
    };
  }

  function isHttpUrl(u) {
    if (typeof u !== "string" || !u) return false;
    return /^https?:\/\//i.test(u);
  }

  function heroPublicUrl() {
    if (!window.BL || !window.BL.settings) return "";
    var override = (window.BL.settings().heroVideoUrl || "").trim();
    if (isHttpUrl(override)) return override;
    var cfg = supabaseCfg();
    if (cfg.url && isHttpUrl(cfg.url)) {
      return cfg.url.replace(/\/+$/, "") + "/storage/v1/object/public/" + HERO_BUCKET + "/" + HERO_PATH;
    }
    return "";
  }

  function heroActive() {
    if (!window.BL || !window.BL.heroLoadMeta) return false;
    var m = window.BL.heroLoadMeta();
    return !!(m && m.fileName);
  }

  /* One-shot: hydrate a <video id="hero-video"> that already exists in the
   * DOM. The caller is responsible for the surrounding markup (the hero
   * container, the silk fallback, the CSS). */
  function applyHeroVideo() {
    if (!window.BL) return;
    var vidEl = document.getElementById("hero-video");
    if (!vidEl) return;
    var publicSrc = heroPublicUrl();
    if (publicSrc) {
      vidEl.src = publicSrc;
      try { vidEl.load(); } catch (e) { /* ignore */ }
      return;
    }
    /* No public asset configured yet — leave whatever the admin uploaded in
     * IndexedDB (admin-only preview) if anything, otherwise the silk fallback
     * the page rendered stays visible. */
    if (!heroActive()) return;
    window.BL.heroGetBlob().then(function (blob) {
      if (!blob) return;
      try {
        vidEl.src = URL.createObjectURL(blob);
        vidEl.load();
      } catch (e) { /* ignore */ }
    }).catch(function () { /* ignore */ });
  }

  /* Wire the public URL getters into window.BL so existing callers keep working. */
  Object.defineProperty(window.BL || {}, "heroPublicUrl", {
    get: function () { return heroPublicUrl; }
  });
  Object.defineProperty(window.BL || {}, "heroActive", {
    get: function () { return heroActive; }
  });
  Object.defineProperty(window.BL || {}, "applyHeroVideo", {
    get: function () { return applyHeroVideo; }
  });
})();
