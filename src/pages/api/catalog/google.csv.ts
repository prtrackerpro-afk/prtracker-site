/**
 * Google Merchant Center feed (CSV).
 *
 * Endpoint público — registrar no Merchant Center como "feed agendado"
 * (Merchant Center → Products → Feeds → Adicionar feed → Agendamento).
 * Habilita Google Shopping orgânico, Performance Max com catálogo, e
 * Free Listings (Aba Compras).
 *
 * Spec oficial:
 * https://support.google.com/merchants/answer/7052112
 *
 * Atributos OBRIGATÓRIOS: id, title, description, link, image_link,
 *                          availability, price, condition
 * RECOMENDADOS: brand, gtin (não temos), mpn (não temos),
 *               identifier_exists (no, pq não tem GTIN)
 * ÚTEIS: google_product_category (taxonomia numérica), product_type,
 *        sale_price, additional_image_link, shipping (omitido — Felipe
 *        configura no painel via Melhor Envio rules)
 *
 * Sem GTIN/MPN (somos fabricante novo), `identifier_exists=no` é
 * mandatório pra Google aceitar a oferta.
 *
 * Pré-requisitos pra Felipe:
 *  1. Criar conta Merchant Center (merchants.google.com)
 *  2. Verificar e reivindicar prtracker.com.br via Search Console
 *  3. Adicionar feed agendado apontando pra https://prtracker.com.br/api/catalog/google.csv
 *  4. Frequência diária (Google atualiza 1× por dia por padrão)
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { centsToReaisString } from "~/lib/format";

export const prerender = false;

const SITE_URL = (
  import.meta.env.PUBLIC_SITE_URL ?? "https://prtracker.com.br"
).replace(/\/$/, "");

// Google Product Taxonomy (PT-BR não existe na taxonomia numérica — Google
// usa IDs universais. Lista oficial:
// https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt)
//
// Mapeamento por categoria do site:
//   pr-trackers (kits) → Sporting Goods > Exercise & Fitness > Weight Lifting > Weight Lifting Belts/Gloves... (4503 = Weight Lifting Equipment)
//   anilhas → mesmo 4503
//   camisetas → Apparel & Accessories > Clothing > Shirts & Tops (212)
const GOOGLE_CATEGORY_BY_CAT: Record<string, string> = {
  "pr-trackers": "4503",
  anilhas: "4503",
  camisetas: "212",
};

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  "pr-trackers": "Esportes > Musculação > Miniaturas Decorativas",
  anilhas: "Esportes > Musculação > Anilhas Decorativas",
  camisetas: "Vestuário > Camisetas > Treino",
};

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
    "link",
    "image_link",
    "additional_image_link",
    "availability",
    "price",
    "brand",
    "condition",
    "identifier_exists",
    "google_product_category",
    "product_type",
  ];

  const rows: string[] = [headers.join(",")];

  for (const p of products) {
    const data = p.data;

    // Description: Google aceita até 5000 char, mas curto convertendo
    // melhor. Usa shortDescription, fallback pro longDescriptionHtml strippado.
    const description = data.shortDescription || stripHtml(data.longDescriptionHtml);

    // Imagem: absoluta obrigatória. Google aceita até 10 additional_image_link
    // (Meta aceita 20). Truncar pra 10 pra ficar dentro do limite.
    const primaryImage = `${SITE_URL}${data.images[0].src}`;
    const additionalImages = data.images
      .slice(1, 11) // até 10 imagens adicionais
      .map((img) => `${SITE_URL}${img.src}`)
      .join(",");

    // Preço: "119.90 BRL" (sem vírgula como decimal — usa ponto).
    const priceStr = `${centsToReaisString(data.priceBase)} BRL`;

    const googleCategory = GOOGLE_CATEGORY_BY_CAT[data.category] ?? "";
    const productType = PRODUCT_TYPE_LABEL[data.category] ?? data.category;

    const row = [
      data.slug,                              // id
      data.title,                             // title
      description,                            // description
      `${SITE_URL}/product/${data.slug}`,     // link
      primaryImage,                           // image_link
      additionalImages,                       // additional_image_link
      "in_stock",                             // availability (Google usa underscore)
      priceStr,                               // price
      "PR Tracker",                           // brand
      "new",                                  // condition
      "no",                                   // identifier_exists (sem GTIN/MPN)
      googleCategory,                         // google_product_category
      productType,                            // product_type
    ].map(csvEscape).join(",");

    rows.push(row);
  }

  const csv = rows.join("\n") + "\n";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 1h cache no edge — Google busca diariamente, tolera cache curto.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
