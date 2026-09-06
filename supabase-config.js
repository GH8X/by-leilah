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