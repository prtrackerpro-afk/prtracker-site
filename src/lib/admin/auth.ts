import type { APIContext } from "astro";
import { getServerSupabase } from "../supabase/server";

const ADMIN_EMAILS_RAW =
  import.meta.env.ADMIN_EMAILS || process.env.ADMIN_EMAILS || "contato@prtracker.com.br";

export const ADMIN_EMAILS: string[] = ADMIN_EMAILS_RAW.split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function getAuthenticatedAdmin(
  context: Pick<APIContext, "request" | "cookies">
): Promise<{ email: string; userId: string } | null> {
  const supabase = getServerSupabase({
    headers: context.request.headers,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  if (!isAdminEmail(user.email)) return null;
  return { email: user.email, userId: user.id };
}
