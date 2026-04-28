/**
 * Meta Commerce Catalog feed (CSV).
 *
 * Endpoint público — pode ser registrado no Meta Commerce Manager como
 * "agendamento de feed" pra atualização automática (Meta busca a URL
 * periodicamente). Habilita Advantage+ Shopping Campaigns (DPA) e
 * Catalog Ads dinâmicos pra retargeting (visitantes ↔ produto visto).
 *
 * Formato segue spec oficial:
 * https://www.facebook.com/business/help/120325381656392
 *
 * Colunas obrigatórias: id, title, description, availability, condition,
 *                       price, link, image_link, brand
 * Colunas opcionais úteis: product_type, additional_image_link,
 *                          google_product_category
 *
 * Mantemos slugs como `id` — coincidem com `content_ids` enviados nos
 * eventos Pixel/CAPI. Crítico pra dedup do DPA: o sistema só consegue
 * renderizar o anúncio dinâmico se o produto que o usuário viu existe
 * no catálogo com o mesmo ID.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { centsToReaisString } from "~/lib/format";

export const prerender = false;

const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://prtracker.com.br"
).replace(/\/$/, "");

const CATEGORY_LABEL: Record<string, string> = {
  "pr-trackers": "PR Trackers",
  anilhas: "Anilhas",
  camisetas: "Camisetas",
};

// Meta Commerce CSV: campos com vírgula/quebra/aspas precisam ser
// double-quoted, e aspas internas viram "" (CSV padrão RFC 4180).
function csvEscape(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const GET: APIRoute = async () => {
  const products = await getCollection("products");

  const headers = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
    "product_type",
    "additional_image_link",
  ];

  const rows: string[] = [headers.join(",")];

  for (const p of products) {
    const data = p.data;
    const productType = CATEGORY_LABEL[data.category] ?? data.category;
    // Description: usa shortDescription (já é texto limpo, ~150ch) — Meta
    // limita a 9999ch mas curtas convertem melhor em DPA.
    const description = data.shortDescription || stripHtml(data.longDescriptionHtml);

    // Imagem principal: Meta exige absoluta. additional_image_link aceita
    // até 20 URLs separadas por vírgula (no caso de campos com vírgula
    // o csv_escape envolve em aspas).
    const primaryImage = `${SITE_URL}${data.images[0].src}`;
    const additionalImages = data.images
      .slice(1)
      .map((img) => `${SITE_URL}${img.src}`)
      .join(",");

    // Preço: Meta espera formato "119.90 BRL" (sem vírgula como decimal).
    const priceStr = `${centsToReaisString(data.priceBase)} BRL`;

    const row = [
      data.slug,
      data.title,
      description,
      "in stock",
      "new",
      priceStr,
      `${SITE_URL}/product/${data.slug}`,
      primaryImage,
      "PR Tracker",
      productType,
      additionalImages,
    ].map(csvEscape).join(",");

    rows.push(row);
  }

  const csv = rows.join("\n") + "\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 1h cache no edge — Meta busca uma vez por hora no máximo, isso
      // limita o load. Se editarmos catálogo, max-age curto evita cache stale.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
