/**
 * TikTok Shop Open Platform — Orders.
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/650b00ed1e0bf302bea9da7e
 *
 * Endpoint principal (versão 202309):
 *   POST /order/202309/orders/search   → lista paginada de pedidos
 *
 * Filtros aceitos no body:
 *   - create_time_ge / create_time_lt (UNIX seconds, INclusive / EXclusive)
 *   - order_status (string), buyer_user_id, etc.
 *
 * Paginação: cursor via `next_page_token` (query). page_size máx 100.
 *
 * Quantidades: TikTok devolve cada SKU comprado como UM `line_item` com seu
 * próprio `sale_price`. Pedidos com várias unidades do mesmo SKU geram
 * múltiplos line_items idênticos.
 */

import { tiktokFetch } from "./api";

export interface TikTokOrderLineItem {
  id: string;
  product_id?: string;
  product_name?: string;
  sku_id?: string;
  sku_name?: string;
  seller_sku?: string;
  /** Preço de venda como string decimal (ex: "119.90"). */
  sale_price?: string;
  original_price?: string;
  currency?: string;
}

/**
 * District info entry. TikTok devolve uma hierarquia geográfica do endereço.
 * Pra BR:
 *   L0 = Country  → address_name="Brasil", iso_code="BR"
 *   L1 = state    → address_name="RJ",     iso_code="RJ" (UF)
 *   L2 = municipality → address_name="Nova Iguaçu", (sem iso_code)
 */
export interface TikTokDistrictInfo {
  address_level?: "L0" | "L1" | "L2" | string;
  address_level_name?: string;
  address_name?: string;
  iso_code?: string;
}

export interface TikTokRecipientAddress {
  /** Nome completo concatenado. */
  name?: string;
  first_name?: string;
  last_name?: string;
  first_name_local_script?: string;
  last_name_local_script?: string;
  /** Concatenação de address_line1-4. */
  address_detail?: string;
  /** Bairro (em BR). */
  address_line1?: string;
  /** Rua / logradouro (em BR). */
  address_line2?: string;
  /** Número (em BR). */
  address_line3?: string;
  /** Complemento / apto (em BR). */
  address_line4?: string;
  /** "Brasil, RJ, Nova Iguaçu, ..." */
  full_address?: string;
  /** CEP — 8 dígitos, sem máscara em BR. */
  postal_code?: string;
  /** Mantido por retrocompat (era usado antes do BR; hoje vem em postal_code). */
  post_code?: string;
  /** ISO do país (BR). */
  region_code?: string;
  /** Telefone, frequentemente mascarado pela TikTok. */
  phone_number?: string;
  district_info?: TikTokDistrictInfo[];
  delivery_preferences?: { drop_off_location?: string };
}

export interface TikTokOrder {
  id: string;
  buyer_email?: string;
  buyer_message?: string;
  /** CPF do comprador — 11 dígitos sem máscara. Top-level em pedidos BR. */
  cpf?: string;
  /** Nome legal do CPF (validado pela Receita Federal via TikTok). */
  cpf_name?: string;
  /** Pode ser número (UNIX seconds) ou string ISO, dependendo da rota. */
  create_time?: number;
  update_time?: number;
  paid_time?: number;
  status?: string;
  /** "NEED_INVOICE" | "INVOICE_UPLOADED" — sinaliza se TikTok ainda espera upload de NF-e. */
  need_upload_invoice?: string;
  fulfillment_type?: string;
  payment?: {
    /** Total cobrado do cliente, como string decimal. */
    total_amount?: string;
    currency?: string;
    sub_total?: string;
    shipping_fee?: string;
    original_shipping_fee?: string;
    tax?: string;
    original_total_product_price?: string;
    platform_discount?: string;
    seller_discount?: string;
    payment_method_name?: string;
    payment_card_type?: string;
  };
  recipient_address?: TikTokRecipientAddress;
  line_items?: TikTokOrderLineItem[];
}

interface OrderSearchResponseData {
  next_page_token?: string;
  total_count?: number;
  orders?: TikTokOrder[];
}

interface OrderDetailResponseData {
  orders?: TikTokOrder[];
}

/**
 * Busca os detalhes COMPLETOS de 1+ pedidos. O endpoint de search retorna
 * subset — o endpoint de detail (GET /order/202309/orders?ids=...) é quem
 * devolve campos sensíveis (cpf, cpf_name, recipient_address.address_line*).
 *
 * Pra sync com Bling/NF-e SEMPRE use este, nunca o search isolado.
 */
export async function getOrderDetail(
  orderIds: string | string[],
): Promise<TikTokOrder[]> {
  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
  if (ids.length === 0) return [];
  const data = await tiktokFetch<OrderDetailResponseData>(
    "/order/202309/orders",
    { method: "GET", query: { ids: ids.join(",") } },
  );
  return data?.orders ?? [];
}

/**
 * Busca pedidos do TikTok Shop dentro de uma janela de tempo. Pagina até o
 * fim. Limite duro de safety em 5000 pedidos pra não rodar infinitamente.
 */
export async function searchOrders(opts: {
  createdAfter: Date;
  createdBefore?: Date;
  pageSize?: number;
}): Promise<TikTokOrder[]> {
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 50));
  const createTimeGe = Math.floor(opts.createdAfter.getTime() / 1000);
  const createTimeLt = opts.createdBefore
    ? Math.floor(opts.createdBefore.getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const all: TikTokOrder[] = [];
  let nextPageToken: string | undefined;
  let safety = 0;

  while (true) {
    safety++;
    if (safety > 200) {
      console.warn("[tiktok/orders] safety stop hit at 200 pages");
      break;
    }
    const query: Record<string, string | number> = {
      page_size: pageSize,
      sort_field: "create_time",
      sort_order: "DESC",
    };
    if (nextPageToken) query.page_token = nextPageToken;

    const data = await tiktokFetch<OrderSearchResponseData>(
      "/order/202309/orders/search",
      {
        method: "POST",
        query,
        body: {
          create_time_ge: createTimeGe,
          create_time_lt: createTimeLt,
        },
      },
    );

    const orders = data?.orders ?? [];
    all.push(...orders);

    if (!data?.next_page_token || orders.length === 0) break;
    nextPageToken = data.next_page_token;
    if (all.length > 5000) {
      console.warn("[tiktok/orders] safety stop hit at 5000 orders");
      break;
    }
  }

  return all;
}
