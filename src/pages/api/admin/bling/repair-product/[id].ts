/**
 * POST /api/admin/bling/repair-product/{id}
 *
 * Anexa uma imagem externa a um produto Bling existente. Bling baixa a
 * imagem da URL fornecida e armazena. Action: PUT /produtos/{id} com
 * `midia.imagens.externas`.
 *
 * Body JSON:
 *   { imageUrl: "https://prtracker.com.br/images/products/.../hero.jpg" }
 *
 * Resposta: produto atualizado.
 *
 * Auth: admin middleware. Bling deve estar conectado.
 */

import type { APIRoute } from "astro";
import { updateProduct, getProduct } from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";

export const prerender = false;

const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://prtracker.com.br"
).replace(/\/$/, "");

// Whitelist defensiva: só permitimos imageUrl que aponte pro próprio site
// (evita usar este endpoint pra upload de URLs arbitrárias).
function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const allowedHost = new URL(SITE_URL).host;
    if (u.host !== allowedHost) return false;
    if (!u.pathname.startsWith("/images/")) return false;
    if (!/\.(jpg|jpeg|png|webp|avif)$/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "bling not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const idParam = params.id;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return new Response(
      JSON.stringify({ error: "id inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { imageUrl?: unknown } = {};
  try {
    body = (await request.json()) as { imageUrl?: unknown };
  } catch {
    return new Response(
      JSON.stringify({ error: "body JSON inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  if (!imageUrl) {
    return new Response(
      JSON.stringify({ error: "imageUrl é obrigatório" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!isAllowedImageUrl(imageUrl)) {
    return new Response(
      JSON.stringify({
        error: "imageUrl deve apontar pra " + SITE_URL + "/images/...",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Lê o produto atual primeiro pra preservar imagens existentes.
    const current = await getProduct(id);
    if (!current) {
      return new Response(
        JSON.stringify({ error: `produto ${id} não encontrado no Bling` }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const existingExternal = (current.midia?.imagens?.externas ?? [])
      .map((img) => img.link)
      .filter((l): l is string => typeof l === "string" && l.length > 0);

    // Não duplica se já estiver lá.
    const merged = existingExternal.includes(imageUrl)
      ? existingExternal
      : [...existingExternal, imageUrl];

    const updated = await updateProduct(id, {
      imagensExternas: merged,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        id,
        codigo: updated.codigo,
        nome: updated.nome,
        imageCount: merged.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[repair-product]", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};
