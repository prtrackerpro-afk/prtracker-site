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

export interface TikTokOrder {
  id: string;
  buyer_email?: string;
  buyer_message?: string;
  /** Pode ser número (UNIX seconds) ou string ISO, dependendo da rota. */
  create_time?: number;
  update_time?: number;
  status?: string;
  payment?: {
    /** Total cobrado do cliente, como string decimal. */
    total_amount?: string;
    currency?: string;
    sub_total?: string;
    shipping_fee?: string;
    tax?: string;
    original_total_product_price?: string;
  };
  recipient_address?: {
    name?: string;
    first_name_local?: string;
    last_name_local?: string;
    full_address?: string;
    phone_number?: string;
    post_code?: string;
    region_code?: string;
  };
  line_items?: TikTokOrderLineItem[];
}

interface OrderSearchResponseData {
  next_page_token?: string;
  total_count?: number;
  orders?: TikTokOrder[];
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
