import type { APIContext } from "astro";
import { getServerSupabase } from "../supabase/server";

export interface Athlete {
  userId: string;
  email: string;
  displayName: string | null;
  primaryBoxId: string | null;
}

/**
 * Returns the currently authenticated athlete (any signed-in Supabase user
 * — there's no allowlist, unlike admin auth). `displayName` may be null
 * if the athlete hasn't completed onboarding yet.
 */
export async function getAuthenticatedAthlete(
  context: Pick<APIContext, "request" | "cookies">
): Promise<Athlete | null> {
  const supabase = getServerSupabase({
    headers: context.request.headers,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  // Profile may not exist yet on first login; that's fine.
  const { data: profile } = await supabase
    .from("pr_athletes")
    .select("display_name, primary_box_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email,
    displayName: profile?.display_name ?? null,
    primaryBoxId: profile?.primary_box_id ?? null,
  };
}
