# Mercado Livre — setup da integração

Documento operacional pra Felipe seguir uma vez. Após setup, listings ML cadastradas, audit + correção via API ativada e (futuramente) sincronização de pedidos ML → Bling automática.

> **Pré-requisito**: conta Mercado Livre PJ ativa (CNPJ 59.947.215/0001-67) — se ainda não criou, fazer em https://www.mercadolivre.com.br/.

---

## 1. Aplicar migration no Supabase

A integração precisa de uma tabela nova: `ml_oauth_tokens` (guarda os tokens OAuth).

1. Abrir painel Supabase do projeto PR Tracker → **SQL Editor → New Query**
2. Colar o conteúdo de [supabase/migrations/0007_ml_oauth.sql](../supabase/migrations/0007_ml_oauth.sql)
3. Clicar **Run**
4. Confirmar no **Table Editor** que `ml_oauth_tokens` aparece

---

## 2. Cadastrar app no DevCenter Mercado Livre

1. Acessar https://developers.mercadolivre.com.br/devcenter
2. Logar com a conta vendedora (`@pr.tracker` ou similar — mesma conta que vai vender)
3. Clicar **"Criar aplicativo"**
4. Preencher:
   - **Nome**: `PR Tracker — Bling Sync`
   - **Descrição curta**: `Integração entre Mercado Livre e ERP Bling pra emissão automática de NF-e e auditoria de SKUs`
   - **URL de redirecionamento**: `https://prtracker.com.br/api/admin/ml/callback`
   - **Tópicos** (notification webhooks — opcional na fase 1, mas habilitar pra futuro):
     - `orders_v2` (pedidos)
     - `items` (alterações em produtos)
   - **Escopos** (todos):
     - `read` — leitura de produtos, pedidos, perfil
     - `write` — atualização de produtos (SKU, preço)
     - `offline_access` — refresh token (ESSENCIAL)
5. Salvar e **copiar Client ID + Client Secret** (vão aparecer apenas uma vez — guardar em local seguro)

> **Atenção**: ML aprova apps pequenos imediatamente. Não precisa esperar revisão como TikTok. Mas leia atentamente os termos — uso indevido pode bloquear.

---

## 3. Adicionar env vars no Vercel

No painel Vercel → projeto **Site** → **Settings → Environment Variables**, adicionar (em todos os ambientes — Production, Preview, Development):

| Variável | Valor |
|---|---|
| `ML_CLIENT_ID` | (do passo 2) |
| `ML_CLIENT_SECRET` | (do passo 2) |
| `ML_REDIRECT_URI` | `https://prtracker.com.br/api/admin/ml/callback` |

Após adicionar, fazer **Redeploy** do projeto (Vercel não puxa env vars automaticamente em runtime de deploys já feitos).

---

## 4. Autorizar a conexão (OAuth dance)

1. Logar no admin do site: https://prtracker.com.br/admin/login
2. Acessar https://prtracker.com.br/admin/ml
3. Clicar **"Conectar Mercado Livre"**
4. Será redirecionado pro ML — clicar **"Autorizar"**
5. Volta automaticamente pro `/admin/ml?ml=connected`
6. O badge superior agora mostra ✅ **Conectado** com nickname e seller_id

---

## 5. Validar com audit de SKUs

Após conectar, em `/admin/ml`:
1. Clicar **"Auditar items"**
2. Resultado mostra todos items ativos, classifica `seller_custom_field`:
   - **canonical**: bate com SKU canônica esperada (ex: `TEE-MASC-M`, `ANILHA-25`) — verde
   - **non-canonical**: SKU fora do padrão — amarelo
   - **no-sku**: variação sem `seller_custom_field` — vermelho (cria órfão no Bling)
   - **duplicate-sku**: SKU usada em múltiplos items — vermelho

> Se Felipe ainda não cadastrou items no ML, lista vem vazia. Isso é esperado.

---

## 6. Como funciona em produção (futuro)

```
Cliente compra no ML → ML processa pagamento
   ↓
ML dispara webhook → /api/admin/ml/webhook (a implementar)
   ↓
Sync pro Bling:
   ├── INSERT em bling_orders (status=pending)
   ├── getOrCreateContact (CPF) no Bling
   ├── Mapear ML.seller_custom_field → Bling SKU canonical
   ├── createSalesOrder no Bling
   └── UPDATE bling_orders (status=synced)
   ↓
Bling emite NF-e automaticamente
```

---

## SKU mapping

ML usa `seller_custom_field` como SKU do vendedor (equivalente ao `seller_sku` do TikTok ou `codigo` do Bling).

Pra cada item no ML, garantir que `seller_custom_field` bate com SKU Bling canonical:

| Tipo de item ML | seller_custom_field |
|---|---|
| Camiseta variação | `TEE-MASC-{P,M,G,GG}` ou `TEE-BABY-{P,M,G}` |
| Anilha avulsa (par) | `ANILHA-{25,20,15,10,5,2.5,1.25}` |
| Bundle ML específico (futuro) | `ML-BENCH-120`, `ML-DEAD-200`, etc |

> Bundles ML-only com peso fixo seguem mesma lógica do TT-* do TikTok. Cada peso = SKU separada porque ML não tem builder.

---

## Refresh automático de token

- Access token ML dura **6h**
- Refresh token dura **6 meses**
- ML **rotaciona o refresh token** a cada uso — `lib/ml/oauth.ts` persiste sempre o novo
- A cada chamada à API, se faltar < 10 min pro access token expirar, refresha antes
- Se o refresh token vencer (6 meses sem uso): badge mostra erro 401 → Felipe re-autoriza em 1 clique

---

## Categorias ML

Mercado Livre exige `category_id` ao criar item. Categorias relevantes (Brasil = MLB):

| Tipo PR Tracker | category_id sugerido |
|---|---|
| Miniaturas decorativas | `MLB1648` (Casa, Móveis e Decoração > Decoração > Miniaturas) ou `MLB1276` (Esportes) |
| Camisetas (Roupas) | `MLB1432` (Roupa Masculina) ou `MLB1430` (Roupa Feminina) |
| Anilhas | `MLB271695` (Esportes > Musculação > Anilhas) |

> Validar antes de cadastrar com `GET /sites/MLB/categories` (lista oficial).

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| `/admin/ml` mostra "Desconectado" mesmo após OAuth | Migration `0007` não rodada no Supabase | Rodar passo 1 |
| Callback falha com `state_mismatch` | Cookie HttpOnly bloqueado (Safari ITP, modo privado) | Tentar fora do modo privado |
| `failed` com `ML_CLIENT_ID...obrigatórios` | Env vars não chegaram em runtime | Redeploy no Vercel após adicionar |
| `failed` com 401 | Refresh token vencido (6 meses sem uso) | Reconectar via "Conectar ML" |
| Audit retorna vazio | Sem items ativos no seller ou sem permissão `read` | Validar escopos do app no DevCenter |

---

## Fora de escopo (fase 2)

Implementar quando Felipe começar a vender no ML:

- Webhook `/api/admin/ml/webhook` pra sync automático de pedidos
- Endpoint `PUT /api/admin/ml/repair-sku/{itemId}` pra renomear SKU em massa via API
- Bundles ML-* (peso fixo) similar a TT-* do TikTok
- Catalog Mercado Envios FULL ou FLEX
