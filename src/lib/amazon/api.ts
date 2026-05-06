/**
 * Amazon SP-API HTTP client — STUB.
 *
 * ⚠️ INCOMPLETO ⚠️
 *
 * SP-API requer 2 mecanismos de auth simultâneos em CADA request:
 *
 * 1. **LWA access_token** — header `x-amz-access-token`. Já implementado
 *    em lib/amazon/oauth.ts (getValidAccess).
 *
 * 2. **AWS SigV4 signature** — header `Authorization` no formato
 *    `AWS4-HMAC-SHA256 Credential=ACCESS_KEY/DATE/REGION/SERVICE/aws4_request,
 *     SignedHeaders=..., Signature=...`. Requer:
 *      - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY de um IAM user/role
 *        com policy `AmazonSPAPIAccess` permitindo `execute-api:Invoke`
 *        no resource ARN da Selling Partner role
 *      - Region: `us-east-1` pra Brazil (NA endpoint)
 *      - Service: `execute-api`
 *
 * Implementação SigV4 não é trivial — recomendo usar AWS SDK v3:
 *   import { SignatureV4 } from "@aws-sdk/signature-v4";
 *   import { Sha256 } from "@aws-crypto/sha256-js";
 *
 * OU bibliotecas dedicadas:
 *   - amazon-sp-api (npm) — wrapper completo
 *   - @sp-api-sdk/auth — LWA + SigV4 separado
 *
 * TODO antes de chamar SP-API em produção:
 *   1. Felipe cria IAM role dedicada com policy AmazonSPAPIAccess
 *   2. Felipe gera AWS_ACCESS_KEY_ID + SECRET pra essa role
 *   3. Adiciona em env vars Vercel: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *      AWS_REGION (default "us-east-1")
 *   4. Implementar `signRequest()` aqui usando SignatureV4
 *   5. Aceitar que cada chamada SP-API tem 100-200ms de overhead de signing
 *
 * Doc detalhado: docs/AMAZON_SETUP.md (passos 5-7).
 */

import { getValidAccess } from "./oauth";

const SPAPI_HOST = "https://sellingpartnerapi-na.amazon.com";

export class AmazonApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "AmazonApiError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  accessToken?: string;
}

/**
 * Stub. Retorna erro explícito até SigV4 ser implementado.
 *
 * Uso futuro:
 *   const items = await amazonFetch<{ payload: { items: any[] } }>(
 *     "/listings/2021-08-01/items/A1234/SKU-XYZ",
 *     { query: { marketplaceIds: marketplaceId } }
 *   );
 */
export async function amazonFetch<T>(
  path: string,
  _options: FetchOptions = {},
): Promise<T> {
  // Garante que pelo menos OAuth LWA está OK — se não, erro claro
  await getValidAccess();
  throw new AmazonApiError(
    `Amazon SP-API client incomplete: SigV4 signing não implementado. ` +
      `Ver lib/amazon/api.ts e docs/AMAZON_SETUP.md (passos 5-7) pra completar. ` +
      `Path solicitado: ${path}`,
    501,
  );
  // Quando SigV4 estiver pronto:
  // const url = new URL(`${SPAPI_HOST}${path}`);
  // ... build canonical request, sign, fetch ...
  void SPAPI_HOST;
}

/**
 * Helper futuro: assina uma request HTTP com AWS SigV4.
 * Implementação esperada usa @aws-sdk/signature-v4.
 */
// export async function signRequest(req: Request): Promise<Request> { ... }
