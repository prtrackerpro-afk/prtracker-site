# Google Merchant Center — setup da integração

Documento operacional pra Felipe seguir uma vez. Após setup, produtos da PR Tracker aparecem em **Google Shopping**, aba **Compras** do Google, e podem ser usados em **Performance Max com catálogo**.

> **Pré-requisito**: conta Google ativa (`prtrackerpro@gmail.com` recomendado pra centralizar).

---

## 1. Criar conta no Merchant Center

1. Acessar https://merchants.google.com/
2. Logar com `prtrackerpro@gmail.com`
3. Preencher info da empresa:
   - **Nome da empresa**: PR TRACKER LTDA
   - **País de venda**: Brasil
   - **Fuso horário**: America/Sao_Paulo
   - **Moeda**: BRL
   - **Site**: https://prtracker.com.br
4. Aceitar termos do Merchant Center

---

## 2. Verificar e reivindicar domínio

Pra Google confiar que o site é teu, precisa verificar via Google Search Console (que já existe).

1. No Merchant Center → **Configurações → Informações da empresa → Site**
2. Clicar **Verificar e reivindicar URL**
3. Como já temos Search Console pra prtracker.com.br, deve verificar automaticamente
4. Se não, opções:
   - **Tag HTML**: cola meta tag no `<head>` do site (PR no GitHub)
   - **Arquivo HTML**: sobe arquivo na raiz (já temos `/.well-known/...`)
   - **DNS TXT**: adiciona registro no Cloudflare

---

## 3. Adicionar feed agendado

1. Merchant Center → **Produtos → Feeds → Adicionar feed**
2. Configurar:
   - **País**: Brasil
   - **Idioma**: Português
   - **Destinos**: Anúncios + Listings grátis
3. Nome do feed: `PR Tracker — feed principal`
4. Tipo de feed: **Agendamento**
5. URL: `https://prtracker.com.br/api/catalog/google.csv`
6. Frequência: **Diária**
7. Hora de busca: 03:00 (horário de Brasília — fora de pico)

---

## 4. Validar feed na primeira busca

Após adicionar, Google busca o feed em até 24h. Volta no painel:
- **Produtos → Feeds**: ver status "Sucesso" ou erros
- **Produtos → Diagnóstico**: ver produtos aprovados/rejeitados

Possíveis avisos esperados:
- ⚠️ "GTIN ausente" — esperado, somos fabricante novo. Já mandamos `identifier_exists=no` no feed.
- ⚠️ "Categoria do Google ausente" — já mandamos numérica (4503 pra equipamentos, 212 pra camisetas), só sumir.

---

## 5. Configurar shipping

Como não passamos `shipping` no feed (Felipe usa Melhor Envio com cálculo dinâmico), config no Merchant Center:

1. Merchant Center → **Configurações → Envio**
2. **Adicionar serviço** → "Brasil → Brasil"
3. Tipo: **Frete fixo** ou **Tabela de tarifas**
4. Configurar conforme realidade do site:
   - Frete grátis para pedidos ≥ R$ 250
   - Frete calculado por peso/região (sincronizar com regras do checkout)

> Alternativa mais simples: marcar **"Frete configurado no checkout"** — Google usa o preço real só na aprovação.

---

## 6. Configurar política de devolução

Merchant Center → **Configurações → Política de devolução**:
- **Período de devolução**: 7 dias (Lei do Direito de Arrependimento brasileira)
- **Custo de devolução**: por conta do cliente (ou ofertar grátis)
- **Link da política**: `https://prtracker.com.br/politicas/troca-e-devolucao`

---

## 7. Vincular ao Google Ads

Pra usar em Performance Max:

1. Merchant Center → **Crescimento → Gerenciar programas → Vincular contas → Google Ads**
2. Aceitar convite na conta Google Ads
3. Ao criar campanha PMax no Google Ads, escolher catálogo **PR Tracker — feed principal**

---

## Como funciona em produção

```
Site atualiza catálogo (commit no repo)
    ↓
/api/catalog/google.csv responde com CSV gerado dinamicamente
    ↓
Google Merchant Center busca diariamente (configurado)
    ↓
Produtos aparecem em:
  • Google Shopping (aba Compras)
  • Listings grátis (resultado orgânico)
  • Performance Max com catálogo (se vinculado ao Ads)
```

## Atributos no feed

Já implementados em `/api/catalog/google.csv`:

| Atributo | Valor | Notas |
|---|---|---|
| `id` | slug do produto | Idêntico ao `content_ids` do Pixel |
| `title` | título do produto | |
| `description` | descrição curta | Stripped de HTML |
| `link` | URL absoluta | `https://prtracker.com.br/product/{slug}` |
| `image_link` | imagem hero absoluta | |
| `additional_image_link` | até 10 imagens | Vírgula-separadas |
| `availability` | `in_stock` | Estático (TODO: integrar Bling estoque) |
| `price` | `119.90 BRL` | Sem vírgula como decimal |
| `brand` | `PR Tracker` | |
| `condition` | `new` | |
| `identifier_exists` | `no` | Sem GTIN — somos novo fabricante |
| `google_product_category` | `4503` ou `212` | Numérico (equipamento ou camiseta) |
| `product_type` | `Esportes > Musculação > ...` | Texto livre |

## Como atualizar feed quando catálogo mudar

O endpoint lê de `src/content/products/*.json` (Astro Content Collection). Adicionar produto novo = criar arquivo `.json` lá + commit. Feed atualiza automaticamente no próximo build.

## Troubleshooting

| Sintoma | Causa | Solução |
|---|---|---|
| Feed não carrega | URL pública 404 ou 500 | Testar `curl https://prtracker.com.br/api/catalog/google.csv` |
| Produtos rejeitados "imagem inacessível" | URL de imagem retorna 404 | Validar `images[0].src` em `src/content/products/*.json` |
| "Política de envio ausente" | Shipping não configurado no Merchant | Configurar passo 5 |
| Atualização não chega | Cache de 1h no edge | Forçar busca em Merchant Center → Feeds → "Buscar agora" |

## Diferenças em relação ao feed Meta

| Aspecto | Meta (`products.csv`) | Google (`google.csv`) |
|---|---|---|
| `availability` | `in stock` | `in_stock` (com underscore) |
| GTIN | Opcional | Manda `identifier_exists=no` se ausente |
| Categoria | `product_type` apenas | `google_product_category` (numérico) + `product_type` |
| Endpoint | `/api/catalog/products.csv` | `/api/catalog/google.csv` |
