import { defineMiddleware } from "astro:middleware";
import { getAuthenticatedAdmin } from "./lib/admin/auth";
import { getAuthenticatedAthlete } from "./lib/pr/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const isAdminRoute =
    (pathname === "/admin" || pathname.startsWith("/admin/")) &&
    pathname !== "/admin/login" &&
    !pathname.startsWith("/admin/api/");

  const isAdminApi =
    pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/logout");

  if (isAdminRoute || isAdminApi) {
    const admin = await getAuthenticatedAdmin(context);
    if (!admin) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const next = encodeURIComponent(pathname + url.search);
      return context.redirect(`/admin/login?next=${next}`, 302);
    }
    context.locals.admin = admin;
  }

  // PR Tracker app — athlete-facing, any signed-in Supabase user. Public:
  // /pr/login, /pr/auth/* (callback flow), and the box leaderboard root
  // (/pr/box/{slug} only — sub-routes like /pr/box/{slug}/admin require
  // owner auth). Card image endpoint is also public so it can be embedded
  // anywhere.
  // BUG fix: `pathname.startsWith("/pr")` casava com `/product/*` (porque
  // "product" começa com "pr") — fazia o middleware tentar autenticar via
  // Supabase ao prerenderizar páginas de produto, quebrando o build em
  // ambientes sem env vars Supabase.
  const isPublicBoxLeaderboard =
    /^\/pr\/box\/[^/]+\/?$/.test(pathname);

  const isPrAppRoute =
    (pathname === "/pr" || pathname.startsWith("/pr/")) &&
    !pathname.startsWith("/pr/login") &&
    !pathname.startsWith("/pr/auth/") &&
    !isPublicBoxLeaderboard;

  const isPrAppApi =
    pathname.startsWith("/api/pr/") &&
    !pathname.startsWith("/api/pr/auth/") &&
    !pathname.startsWith("/api/pr/card/");

  if (isPrAppRoute || isPrAppApi) {
    const athlete = await getAuthenticatedAthlete(context);
    if (!athlete) {
      if (isPrAppApi) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const nextParam = encodeURIComponent(pathname + url.search);
      return context.redirect(`/pr/login?next=${nextParam}`, 302);
    }
    context.locals.athlete = athlete;

    // Onboarding gate: every authenticated /pr/* page (except onboarding
    // itself, the profile API, and auth endpoints) requires display_name.
    // Without it the share card and leaderboards show "Atleta" placeholder.
    const isOnboardingException =
      pathname === "/pr/onboarding" ||
      pathname.startsWith("/api/pr/profile") ||
      pathname.startsWith("/api/pr/auth/");
    if (!athlete.displayName && isPrAppRoute && !isOnboardingException) {
      const nextParam = encodeURIComponent(pathname + url.search);
      return context.redirect(`/pr/onboarding?next=${nextParam}`, 302);
    }
  }

  return next();
});
