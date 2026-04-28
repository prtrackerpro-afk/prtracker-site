/**
 * Extrai cookies de tracking (Meta Pixel + GA4) do header `cookie` da request.
 *
 * O `_fbp` é o browser-id persistente do Meta Pixel; `_fbc` carrega o `fbclid`
 * de quando o usuário caiu via clique em ad. Ambos vão raw no CAPI (não-hashed,
 * per spec da Meta).
 *
 * O `_ga` cookie tem formato `GA1.1.<RANDOM>.<TIMESTAMP>` — o GA4 client_id é
 * só `<RANDOM>.<TIMESTAMP>`, sem o prefixo de versão.
 */

export type TrackingCookies = {
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
};

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function extractGaClientId(gaCookie: string | undefined): string | undefined {
  if (!gaCookie) return undefined;
  // `GA1.1.123456789.1700000000` → `123456789.1700000000`
  const m = gaCookie.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return m?.[1];
}

export function extractTrackingCookies(
  cookieHeader: string | null,
): TrackingCookies {
  return {
    fbp: parseCookie(cookieHeader, "_fbp"),
    fbc: parseCookie(cookieHeader, "_fbc"),
    gaClientId: extractGaClientId(parseCookie(cookieHeader, "_ga")),
  };
}
