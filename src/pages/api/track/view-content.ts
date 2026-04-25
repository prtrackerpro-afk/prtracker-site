/**
 * ViewContent beacon — fired client-side on product page load, then forwards
 * the event to Meta's Conversions API server-side. The same `eventId` is used
 * on both the client Pixel call and this CAPI call so Meta dedupes them.
 *
 * Bypasses ad blockers / iOS tracking restrictions for a chunk of traffic
 * the Pixel-only path misses, improving match rate at the top of funnel.
 */
import type { APIRoute } from "astro";
import { z } from "astro:content";
import { sendCapiViewContent } from "~/lib/tracking-server";

export const prerender = false;

const payloadSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  priceCents: z.number().int().min(0).max(10_000_00),
  category: z.string().max(60).optional(),
  eventId: z.string().min(1).max(100),
});

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export const POST: APIRoute = async ({ request }) => {
  let parsed;
  try {
    const json = await request.json();
    parsed = payloadSchema.parse(json);
  } catch {
    return new Response(null, { status: 204 });
  }

  const cookieHeader = request.headers.get("cookie");
  const fbp = parseCookie(cookieHeader, "_fbp");
  const fbc = parseCookie(cookieHeader, "_fbc");
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const clientIpAddress = xff.split(",")[0]?.trim() || undefined;
  const clientUserAgent = request.headers.get("user-agent") ?? undefined;
  const referer = request.headers.get("referer") ?? undefined;

  // Don't await — return 204 immediately so the page doesn't wait on us.
  void sendCapiViewContent({
    slug: parsed.slug,
    title: parsed.title,
    priceCents: parsed.priceCents,
    category: parsed.category,
    eventId: parsed.eventId,
    ctx: {
      fbp,
      fbc,
      clientIpAddress,
      clientUserAgent,
      eventSourceUrl: referer,
    },
  });

  return new Response(null, { status: 204 });
};
