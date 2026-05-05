# Bling — setup da integração com o site (Astro + MP)

Documento operacional pra Felipe seguir uma vez. Após o passo 5 estar concluído, toda venda nova do site cai automaticamente no Bling como pedido de venda → NF-e emite sozinha.

> **Pré-requisito**: conta Bling ativa (qualquer plano com API v3 — todos os pagos têm).

---

## 1. Rodar a migration no Supabase

A integração precisa de duas tabelas novas: `bling_oauth_tokens` (guarda os tokens OAuth) e `bling_orders` (ledger de idempotência por `mp_payment_id`).

1. Abrir o painel Supabase do projeto PR Tracker → **SQL Editor → New Query**
2. Colar o conteúdo de [supabase/migrations/0003_bling_integration.sql](../supabase/migrations/0003_bling_integration.sql)
3. Clicar **Run**
4. Confirmar no **Table Editor** que `bling_oauth_tokens` e `bling_orders` aparecem

---

## 2. Cadastrar o app na Área do Integrador Bling

1. Acessar https://www.bling.com.br/b/integradores
2. Clicar **"Cadastrar novo aplicativo"**
3. Preencher:
   - **Nome**: `PR Tracker — Site`
   - **Categoria**: Integrações / E-commerce
   - **Tipo**: **OAuth2** (Authorization Code Flow)
   - **URL de redirecionamento**: `https://prtracker.com.br/api/admin/bling/callback`
   - **Escopos** (todos os listados são necessários):
     - `Pedidos de venda` — leitura e escrita
     - `Produtos` — leitura e escrita
     - `Contatos` — leitura e escrita
     - `Notas fiscais` — leitura
     - `Lojas` — leitura
4. Salvar e **copiar Client ID + Client Secret** (vão aparecer só uma vez — guardar em local seguro)

---

## 3. Adicionar as env vars no Vercel

No painel do Vercel → projeto **Site** → **Settings → Environment Variables**, adicionar (em todos os ambientes — Production, Preview, Development):

| Variável | Valor |
|---|---|
| `BLING_CLIENT_ID` | (do passo 2) |
| `BLING_CLIENT_SECRET` | (do passo 2) |
| `BLING_REDIRECT_URI` | `https://prtracker.com.br/api/admin/bling/callback` |

Os 3 abaixo são opcionais inicialmente — preencher depois do passo 5 (quando já estamos conectados e podemos buscar IDs via API):

| Variável | O que é |
|---|---|
| `BLING_LOJA_ID` | ID da loja "Site PR Tracker" no Bling — separa pedidos do site dos do TikTok nos relatórios. Criar em **Configurações → Cadastros → Lojas** se ainda não existe. |
| `BLING_DEPOSITO_ID` | ID do depósito padrão (default Avenida Bagé). Em **Configurações → Cadastros → Depósitos**. |
| `BLING_NATUREZA_OPERACAO_ID` | ID da natureza "Venda de mercadoria a não contribuinte" (CFOP 6.108). Em **Configurações → Cadastros → Naturezas de operação**. |

> Sem esses 3 IDs, o pedido entra com os defaults da empresa — funciona, só não aparece na "Loja: Site PR Tracker" pra distinguir o canal nos relatórios.

Após adicionar as env vars, fazer **Redeploy** do projeto (Vercel não puxa env vars automaticamente em runtime de deploys já feitos).

---

## 4. Autorizar a conexão (OAuth dance)

1. Logar no admin do site: https://prtracker.com.br/admin/login
2. Acessar https://prtracker.com.br/admin/bling
3. Clicar **"Conectar Bling"**
4. Será redirecionado pro Bling — clicar **"Autorizar"**
5. Volta automaticamente pro `/admin/bling?bling=connected`
6. O badge superior agora mostra ✅ **Conectado** com a data de expiração do token

---

## 5. Validar com 1 pedido de teste

**Opção A — pedido real R$1**: criar um cupom 99% off no Bling/site, comprar um Deadlift Set, pagar R$1 via Pix, depois cancelar a NF emitida.

**Opção B — usar pedido existente**: se já tem pedido aprovado recente que não foi sincronizado (`status=pending` em `/admin/bling`), clicar **"Tentar de novo"**.

Critérios de sucesso:
1. ✅ Linha aparece em `/admin/bling` com `status=synced`
2. ✅ Pedido aparece no Bling (módulo **Vendas → Pedidos de venda**) com:
   - Cliente correto (CPF, nome, endereço)
   - Itens corretos (SKU + qty + preço)
   - Frete (valor + transportador "Melhor Envio · SEDEX" ou similar)
   - Desconto (cupom + Pix combinados, em REAL)
   - Loja "Site PR Tracker" (se BLING_LOJA_ID foi configurado)
   - Observação interna com `MP payment_id` e `external_reference`
3. ✅ Bling emite a NF-e automaticamente em até ~30s (config validada por NF Thawant 000019)

---

## Como funciona em produção

```
Cliente paga no site (Pix ou cartão)
    ↓
Mercado Pago confirma pagamento
    ↓
MP dispara webhook → /api/mp-webhook (Vercel Function)
    ↓
Em paralelo:
  • Etiqueta Melhor Envio
  • Email pro cliente
  • Email pro Felipe
  • Meta CAPI Purchase
  • GA4 Purchase
  • Upsert na tabela `sales` (Supabase)
  • [NOVO] Sync pro Bling:
        ├── INSERT em bling_orders (status=pending)  ← idempotência
        ├── getOrCreateContact (CPF) no Bling
        ├── getOrCreateProduct (cada SKU) no Bling
        ├── createSalesOrder no Bling
        └── UPDATE bling_orders (status=synced, bling_pedido_id)
    ↓
Bling emite NF-e automaticamente (config existente)
```

## Idempotência

- `bling_orders.mp_payment_id` é UNIQUE — webhook MP pode reentregar o mesmo evento N vezes, só cria 1 pedido no Bling.
- Se o Bling falhar (5xx, 422, OAuth quebrado), a row fica com `status=failed` e o erro detalhado.
- Webhook **sempre retorna 200** pro MP — falhas no Bling não fazem MP reentregar (ele tenta a cada hora durante 24h se receber 4xx/5xx).

## Retry de falhas

Em `/admin/bling`, cada linha `failed` tem botão **"Tentar de novo"**. Re-busca o payment no MP, re-roda o sync. Útil pra:
- Token Bling expirado durante a janela curta entre refresh e revogação
- Produto SKU faltando no Bling temporariamente (cria na próxima tentativa)
- Erro de validação pontual (CPF mal formatado, etc)

## Refresh automático de token

- Access token Bling dura **6h**
- Refresh token dura **30 dias**
- Bling **rotaciona o refresh token** a cada uso — `lib/bling/oauth.ts` persiste sempre o novo
- A cada chamada à API Bling, se faltar < 10 min pro access token expirar, refresha antes
- Se o refresh token vencer (30 dias sem uso): badge mostra erro 401 → Felipe re-autoriza em 1 clique

## SKU mapping (importante)

Site usa slugs (`deadlift-set`), Bling exige códigos padronizados. A tradução está em [src/lib/bling/sku-map.ts](../src/lib/bling/sku-map.ts):

| Site slug | Bling código |
|---|---|
| `deadlift-set` | `DEADLIFT-SET` |
| `bench-press-set` | `BENCH-SET` |
| `power-rack-set` | `POWER-SET` |
| `my-pr-set` | `MYPR-SET` |
| `camiseta-masculina` (size) | `TEE-MASC-{P,M,G,GG}` |
| `camiseta-feminina-baby-look` (size) | `TEE-BABY-{P,M,G,GG}` |
| `anilhas` (plates[]) | `ANILHA-{25,20,15,10,5,2.5,1.25}` (1 line por peso) |

> Bundles marketplace com peso fixo (`TT-BENCH-120`, `TT-DEAD-200`, `TT-MEGA-1000`, etc) são SKUs separadas — só usadas em listings TikTok/ML/Shopee, não no checkout do site. Ver `sync-marketplace-skus.ts` pro catálogo completo.

Se um produto com esse código já existe no Bling, é reusado. Se não existe, é criado on-the-fly (com NCM e categoria definidos no `sku-map.ts`).

> **Dica**: rodar 1 venda fictícia de cada SKU faz o Bling cadastrar todos os produtos automaticamente, do zero. Felipe só precisa depois entrar e ajustar peso, categoria, fornecedor, etc.

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `/admin/bling` mostra "Desconectado" mesmo após OAuth | Migration `0003` não rodada no Supabase | Rodar passo 1 |
| OAuth callback falha com `state_mismatch` | Cookie HttpOnly bloqueado (Safari ITP, modo privado) | Tentar fora do modo privado |
| `failed` com `BLING_CLIENT_ID...obrigatórios` | Env vars não chegaram em runtime | Redeploy no Vercel após adicionar |
| `failed` com `CPF inválido ou ausente` | Pedido feito antes do checkout exigir CPF (cenário antigo) | Manual no Bling — não tem o que automatizar |
| `failed` com 401 ou refresh failed | Refresh token vencido (30d sem uso) ou app revogado no Bling | Reconectar via "Conectar Bling" |
| Pedido aparece no Bling mas sem NF-e | Config NF-e foi alterada (improvável) | Ver NF Thawant 000019 como referência |

## Fora de escopo (fase 2)

- Cancelamento sincronizado (cliente cancela MP → cancela Bling)
- Reembolso sincronizado
- Estoque bidirecional Bling → site
- Devolução com CFOP 1202
- Notificação de tracking pro cliente (Bling já faz via Melhor Envio)
