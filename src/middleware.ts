import { defineMiddleware } from "astro:middleware";
import { getAuthenticatedAdmin } from "./lib/admin/auth";

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
      return Response.redirect(new URL(`/admin/login?next=${next}`, url.origin), 302);
    }
    context.locals.admin = admin;
  }

  return next();
});
