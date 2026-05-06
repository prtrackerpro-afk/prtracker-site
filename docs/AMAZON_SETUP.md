# Amazon SP-API — setup da integração

Documento operacional pra Felipe seguir uma vez. **Mais complexa que outros marketplaces** porque exige duas camadas de auth: LWA OAuth + AWS SigV4.

> **Pré-requisitos**:
> - Conta Amazon Seller Central BR PJ ativa (CNPJ 59.947.215/0001-67) — Madruguinha está cadastrando
> - Conta AWS (pode usar gmail PJ — `prtrackerpro@gmail.com`)
> - Plano Profissional Seller (R$ 19/mês)

---

## Arquitetura Amazon SP-API

```
Site /admin/amazon
   ↓ Conectar Amazon
Seller Central (consent screen)
   ↓ Authorized
Callback → exchange code → LWA refresh_token (∞)
   ↓
Pra cada chamada SP-API:
   ├─ Header: x-amz-access-token = LWA access (1h, refreshado auto)
   └─ Header: Authorization = AWS SigV4 (IAM credentials)
   ↓
https://sellingpartnerapi-na.amazon.com/...
```

**LWA + SigV4** = 2 mecanismos simultâneos. Sem os dois, SP-API rejeita.

---

## Stage atual deste scaffold

| Componente | Status |
|---|---|
| Migration `amazon_oauth_tokens` | ✅ Pronta (`0009_amazon_oauth.sql`) |
| LWA OAuth flow (connect/callback/refresh) | ✅ Implementado |
| Persistência de tokens no Supabase | ✅ Implementado |
| Admin UI com Connect button | ✅ Funcional |
| AWS SigV4 signing | ❌ TODO — ver passo 7 |
| SP-API client (audit-products) | ❌ Bloqueado pelo SigV4 |
| Webhook de pedidos | ❌ Fase 2 |

---

## 1. Criar conta Amazon Seller Central BR

1. Acessar https://venda.amazon.com.br/
2. Cadastro completo:
   - **Plano**: Profissional (R$ 19/mês — necessário pra catálogo grande)
   - **CNPJ**: 59.947.215/0001-67
   - **Razão Social**: PR TRACKER LTDA
   - **Email**: `contato@prtracker.com.br`
3. Verificar identidade (vídeo + documentos) — **leva 1-2 semanas**
4. Configurar conta bancária PJ (Itaú, Bradesco, BB — Amazon não aceita Inter/Nubank)
5. Configurar Tax Settings (CFOP, ICMS) — alinhar com contador
6. Aguardar aprovação total da conta

---

## 2. Criar app SP-API em Seller Central

> Só depois da conta aprovada.

1. Login Seller Central → Apps & Services → **Develop Apps**
2. **Add new app client** → nome `PR Tracker — Bling Sync`
3. Tipo: **Selling Partner API SDK**
4. **API Roles** (selecionar todos os necessários):
   - Product Listing
   - Inventory and Order Tracking
   - Pricing
   - Tax Invoicing (futuro)
5. **OAuth Login URI**: `https://prtracker.com.br/api/admin/amazon/connect`
6. **OAuth Redirect URI**: `https://prtracker.com.br/api/admin/amazon/callback`
7. Anotar:
   - **Application ID** (formato `amzn1.sp.solution.xxxxx`)
   - **LWA Client ID** (formato `amzn1.application-oa2-client.xxxxx`)
   - **LWA Client Secret** (string longa)

---

## 3. Adicionar env vars LWA no Vercel

| Variável | Valor |
|---|---|
| `AMAZON_SPAPI_APP_ID` | (Application ID do passo 2) |
| `AMAZON_LWA_CLIENT_ID` | (LWA Client ID) |
| `AMAZON_LWA_CLIENT_SECRET` | (LWA Client Secret) |
| `AMAZON_REDIRECT_URI` | `https://prtracker.com.br/api/admin/amazon/callback` |

**Redeploy** Vercel após adicionar.

---

## 4. Aplicar migration Supabase

```sql
-- Painel Supabase → SQL Editor
-- Cola conteúdo de supabase/migrations/0009_amazon_oauth.sql → Run
```

Confere `Table Editor` se `amazon_oauth_tokens` aparece.

---

## 5. Autorizar LWA (parcial)

Com env vars + migration aplicadas:

1. Acessar `/admin/amazon`
2. Clicar **"Conectar Amazon"**
3. Será redirecionado pra Seller Central → autorizar
4. Volta com `amazon=connected` na URL
5. Refresh token persiste no Supabase (refresh LWA não expira)

**Limitação**: LWA conecta, mas SP-API ainda não funciona. Falta SigV4 (passo 6-7).

---

## 6. Configurar AWS IAM (necessário pra SP-API)

Amazon SP-API exige cada call assinada com AWS SigV4. Pra isso:

1. Acessar https://console.aws.amazon.com/ → Sign up se ainda não tem
2. **IAM → Roles → Create role**:
   - Trusted entity: AWS account (this account)
   - Add permissions: criar policy custom com:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [{
         "Effect": "Allow",
         "Action": "execute-api:Invoke",
         "Resource": "arn:aws:execute-api:*:*:*"
       }]
     }
     ```
   - Role name: `PRTracker-SPAPI-Role`
3. Voltar pro **Develop Apps** no Seller Central → Edit app → **IAM ARN**: cola o ARN da role criada
4. **IAM → Users → Add user**:
   - Name: `prtracker-spapi-user`
   - Access type: Programmatic access
   - Attach policy: `AssumeRole-PRTracker-SPAPI-Role`
5. Anotar **AWS Access Key ID** + **AWS Secret Access Key**

---

## 7. Adicionar env vars AWS no Vercel + implementar SigV4

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1
AMAZON_SPAPI_ROLE_ARN=arn:aws:iam::XXXXXX:role/PRTracker-SPAPI-Role
```

Implementar `signRequest()` em `src/lib/amazon/api.ts`:

```ts
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

// 1. Assumir role com STS pra obter temporary credentials
// 2. Usar SignatureV4 com essas credentials pra assinar a request
// 3. Adicionar headers x-amz-access-token (LWA) + Authorization (SigV4)
```

Bibliotecas npm:
```bash
npm install @aws-sdk/signature-v4 @aws-sdk/client-sts @aws-crypto/sha256-js
```

OU usar wrapper completo:
```bash
npm install amazon-sp-api
```

> Implementação SigV4 não é trivial — recomendo usar `amazon-sp-api` (npm) ou `@sp-api-sdk` que abstraem signing. Felipe pode preferir contratar consultoria SP-API pra setup inicial.

---

## SKU mapping Amazon

Amazon usa `seller-sku` (nome do field interno SP-API: `sellerSku`). Cada listing precisa SKU canonical:

| Tipo | seller-sku |
|---|---|
| Camisetas | `TEE-MASC-{P,M,G,GG}`, `TEE-BABY-{P,M,G}` |
| Anilhas avulsas | `ANILHA-{25,20,15,10,5,2.5,1.25}` |
| Bundles Amazon (futuro) | `AMZ-BENCH-120`, `AMZ-DEAD-200`, etc |

---

## GTIN Exemption

Amazon exige GTIN/EAN/UPC pra criar ASIN novo. PR Tracker não tem (somos fabricante novo).

**Solução**: pedir GTIN Exemption uma vez por categoria:

1. Seller Central → Inventory → Add a product → "I'm adding a product not sold on Amazon"
2. Categoria → Apply for GTIN Exemption
3. Felipe envia:
   - Carta da empresa (PR TRACKER LTDA é fabricante exclusivo)
   - Foto do produto com logo PR Tracker visível
   - Foto da embalagem com marca PR Tracker
4. Amazon aprova em ~5 dias úteis (categoria por categoria)

Categorias relevantes:
- Sports & Outdoors
- Toys & Games (pra miniaturas, se Amazon classificar lá)
- Apparel (camisetas)

---

## Imagens Amazon

Mais rigorosa que outros marketplaces:

| Requisito | Valor |
|---|---|
| Primeira imagem (hero) | Fundo BRANCO PURO #FFFFFF |
| Sem | Texto, marca d'água, gráficos, props |
| Mínimo | 1000×1000px |
| Ideal | 2000×2000px |

**Imagens PR Tracker disponíveis**: `prtracker.com.br/images/products/{slug}/`. Algumas têm fundo branco já (hero), outras têm ambiente. Se Amazon rejeitar, **gerar versões fundo branco** ou pedir refoto.

---

## Frete Amazon

Opções:
- **FBM (Fulfillment by Merchant)**: Felipe envia direto. Recomendado pra começar.
- **FBA (Fulfillment by Amazon)**: Felipe envia stock pro CD Amazon. Custo alto, prazo melhor, ranking +.

**Recomendação inicial**: FBM. Migrar pra FBA quando vendas estabilizarem ≥30/mês.

---

## NF-e

Amazon não emite NF-e — vendedor responsável. Bling automatiza quando integração Amazon plugar (atualmente bloqueada por SigV4). Até lá: lançar manualmente no Bling igual TikTok/ML/Shopee.

---

## Comissões Amazon

| Categoria | Comissão |
|---|---|
| Sports & Outdoors | 15% |
| Toys & Games | 15% |
| Apparel | 17% |
| + plano Profissional | R$ 19/mês fixo |
| + frete (se FBA) | variável |

Total efetivo: ~17-19% por venda + R$ 19/mês.

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Connect falha "config_missing" | env vars Vercel não preenchidas | Passos 3 |
| Callback "state_mismatch" | Cookie HttpOnly bloqueado | Não usar modo privado |
| `failed` ao trocar code | LWA Client Secret errado | Reconferir env var |
| `amazon_fetch` returns 501 | SigV4 não implementado | Passos 6-7 |
| 403 Forbidden no SP-API | IAM role sem policy correta | Validar AmazonSPAPIAccess no IAM |
| 401 Unauthorized | LWA access expirou e refresh falhou | Reconectar via "Conectar Amazon" |

---

## Fora de escopo (fase 2)

- AWS SigV4 signing (passo 7) — bloqueador pra todas chamadas SP-API
- Endpoint `audit-products` (depende SigV4)
- Webhook `notifications/v1` pra sync automático de pedidos
- Bundles AMZ-* (peso fixo) similar a TT-*/ML-*/SP-*
- FBA (Fulfillment by Amazon) integrado
- Tax Invoicing API pra NF-e

---

## Resumo de complexidade

| Marketplace | Effort relativo |
|---|---|
| Mercado Livre | Baixo (Bearer simples) |
| Shopee | Médio (HMAC signature) |
| TikTok | Médio (HMAC signature) |
| **Amazon** | **Alto (LWA + AWS SigV4 + IAM + GTIN exemption)** |

Amazon vale a pena se Madruguinha estimar volume ≥10 vendas/mês. Senão, focar TikTok + ML + Shopee primeiro.
