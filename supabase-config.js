/* by Leïlah — Supabase public configuration.
 *
 * These are PUBLIC-by-design values: the project URL and the publishable
 * (anon) key ship inside every client build and are safe to expose. They are
 * locked down by database RLS + Storage policies — one-time setup: run
 * supabase/schema.sql in Supabase → SQL Editor (see SETUP.md). Never put a
 * service-role or secret key in this file.
 *
 * scripts/build.mjs regenerates dist/supabase-config.js at build time from the
 * SUPABASE_URL / SUPABASE_ANON_KEY environment variables (NEXT_PUBLIC_* aliases
 * are also accepted). When those env vars are unset, the build falls back to
 * the values checked in here, so a production build never ships a blank
 * configuration.
 */
window.BL_SUPABASE = {
  url: "https://xuibqryilladcqvjlxcd.supabase.co",
  anonKey: "sb_publishable_sMOiiQSD9SvmF1vyKZxY6A_NK2MAIIU"
};
