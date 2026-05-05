import { defineMiddleware } from "astro:middleware";
import { getAuthenticatedAdmin } from "./lib/admin/auth";
import { getAuthenticatedAthlete } from "./lib/pr/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  const isAdminRoute =
    pathname.startsWith("/admin") &&
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
  // /pr/login, /pr/auth/* (callback flow), and /pr/box/* (read-only boxes).
  // Card image endpoint is also public so it can be embedded anywhere.
  const isPrAppRoute =
    pathname.startsWith("/pr") &&
    !pathname.startsWith("/pr/login") &&
    !pathname.startsWith("/pr/auth/") &&
    !pathname.startsWith("/pr/box/");

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
  }

  return next();
});
