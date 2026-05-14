# Shopee — setup da integração

Documento operacional pra Felipe seguir uma vez. Após setup, listings Shopee cadastradas, audit + correção via API ativada e (futuramente) sincronização de pedidos Shopee → Bling automática.

> **Pré-requisito**: conta vendedor Shopee Brasil PJ ativa (CNPJ 59.947.215/0001-67) — Madruguinha está cadastrando agora.

---

## 1. Aplicar migration no Supabase

A integração precisa de uma tabela nova: `shopee_oauth_tokens`.

1. Painel Supabase → **SQL Editor → New Query**
2. Colar conteúdo de [supabase/migrations/0008_shopee_oauth.sql](../supabase/migrations/0008_shopee_oauth.sql)
3. Clicar **Run**
4. Confirmar no **Table Editor**

---

## 2. Cadastrar app no Shopee Open Platform

1. Acessar https://open.shopee.com/
2. Logar com a conta vendedor Shopee
3. Criar conta de Developer (precisa CNPJ + dados PJ)
4. **Criar aplicativo**:
   - Nome: `PR Tracker — Bling Sync`
   - Descrição: `Integração entre Shopee e ERP Bling pra emissão automática de NF-e e auditoria de SKUs`
   - Tipo: **Shop Authorization** (não Cross-border)
   - Redirect URL: `https://prtracker.com.br/api/admin/shopee/callback`
   - **Permissions** (essenciais):
     - `product.get_item_list`, `product.get_item_base_info`, `product.update_item`
     - `order.get_order_list`, `order.get_order_detail`
     - `logistics.get_shipping_parameter` (futuro)
5. Salvar e **copiar Partner ID + Partner Key** (Partner Key mostrado uma vez só)

> **Atenção**: Shopee tem ambiente sandbox (test.shopee.com) — usar pra testar antes de produção. Migration suporta os dois com `region: BR`.

---

## 3. Adicionar env vars no Vercel

| Variável | Valor |
|---|---|
| `SHOPEE_PARTNER_ID` | (do passo 2 — número) |
| `SHOPEE_PARTNER_KEY` | (do passo 2 — string longa) |
| `SHOPEE_REDIRECT_URI` | `https://prtracker.com.br/api/admin/shopee/callback` |

Após adicionar, **Redeploy** do Vercel.

---

## 4. Autorizar conexão (OAuth dance)

1. Logar no admin: https://prtracker.com.br/admin/login
2. Acessar https://prtracker.com.br/admin/shopee
3. Clicar **"Conectar Shopee"**
4. Será redirecionado pro Shopee — escolher loja + clicar **"Autorizar"**
5. Volta automaticamente pro `/admin/shopee?shopee=connected`
6. Badge superior mostra ✅ **Conectado** com shop_id e expiração

---

## 5. Validar com audit de SKUs

Após conectar, em `/admin/shopee`:
1. Clicar **"Auditar items"**
2. Resultado classifica `item_sku` e `model_sku` como canonical/non-canonical/no-sku/duplicate

---

## SKU mapping

Shopee usa `item_sku` (parent) + `model_sku` (variation) — equivalente ao TikTok seller_sku ou ML seller_custom_field.

Pra cada listing no Shopee, garantir que SKU bate com Bling canonical:

| Tipo de item | item_sku (parent) | model_sku (variation) |
|---|---|---|
| Camiseta com variação tamanho | `TEE-MASC` ou `TEE-BABY` (parent) | `TEE-MASC-{P,M,G,GG}` ou `TEE-BABY-{P,M,G}` |
| Anilha avulsa por peso | `ANILHA-{25,20,15,10,5,2.5,1.25}` | sem variação |
| Bundle Shopee específico (futuro) | `SP-BENCH-120`, `SP-DEAD-200`, etc | sem variação |

Bundles SP-* com peso fixo seguem mesma lógica do TT-* TikTok.

---

## Refresh automático de token

- Access token Shopee: **4h**
- Refresh token: **30 dias**
- Shopee **rotaciona refresh token** a cada uso (igual TikTok/ML) — `lib/shopee/oauth.ts` persiste sempre o novo
- Refresh proativo se < 10min pra expirar
- Se refresh expirar (30 dias sem uso) → reconectar via "Conectar Shopee"

---

## Categorias Shopee

Shopee Brasil tem categorias hierárquicas. Validar antes de cadastrar:
- Esportes & Lazer > Equipamentos de Musculação > Anilhas (pra anilhas)
- Esportes & Lazer > Equipamentos de Musculação > Outros (pra kits decorativos)
- Roupas Masculinas > Camisetas (pra TEE-MASC)
- Roupas Femininas > Camisetas (pra TEE-BABY)

---

## Frete Shopee

Aderir ao **Frete Grátis Shopee**:
- Shopee subsidia parte do frete (vendedor paga taxa fixa por pedido)
- Melhora ranking do listing significativamente
- Configurar em Configurações → Logística → Frete Grátis

---

## Comissão Shopee

~12-14% por venda + tarifa de pagamento ~3% = ~15-17% total.

Margem fica menor que TikTok (que tem 0% comissão por 60 dias do Programa Start-Up). Considerar precificação 5-10% acima do TikTok pra Shopee, ou aceitar margem menor pra ranking.

---

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| "Desconectado" mesmo após OAuth | Migration `0008` não rodada | Rodar passo 1 |
| Callback `state_missing` | Cookie HttpOnly bloqueado | Não usar modo privado |
| `failed` com `error_auth` | partner_key errada | Reconferir env var |
| `failed` com 401 / refresh failed | Refresh expirou ou app revogado | Reconectar via "Conectar Shopee" |
| `audit_log` insert error | Tabela `audit_log` não existe | Criar tabela ou ignorar (não-bloqueante) |

---

## Fora de escopo (fase 2)

- Webhook `/api/admin/shopee/webhook` pra sync automático de pedidos
- Endpoint `PUT /api/admin/shopee/repair-sku/{itemId}` pra renomear em massa
- Bundles SP-* (peso fixo) similar ao TT-* TikTok
- Logistics integrada (etiqueta automática)
