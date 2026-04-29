import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

const SUPABASE_URL = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_ANON_KEY missing — admin will not work until configured");
}

/**
 * Cookie-aware server client. Use in API routes and SSR pages where
 * we need the current user's session. RLS policies apply.
 */
export function getServerSupabase(opts: { headers: Headers; cookies: AstroCookies }) {
  return createServerClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    cookies: {
      getAll() {
        return parseCookieHeader(opts.headers.get("Cookie") ?? "").map(
          ({ name, value }) => ({ name, value: value ?? "" })
        );
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          opts.cookies.set(name, value, options);
        }
      },
    },
  });
}

/**
 * Service-role client (bypasses RLS). USE WITH CAUTION — only for:
 *   - cron ingestion (writes from internal jobs)
 *   - admin API endpoints that have validated the actor server-side
 * Never expose this to the browser. Never include in client-side code.
 */
let _adminClient: SupabaseClient | null = null;
export function getAdminSupabase(): SupabaseClient {
  if (!_adminClient) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
    }
    _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _adminClient;
}
