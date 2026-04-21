# PR Tracker — site ecommerce

Site estático de ecommerce da PR Tracker (miniaturas-troféu para CrossFit/powerlifting/halterofilismo), construído em **Astro 5 + TailwindCSS 4**, com Vercel Functions para integração com Mercado Pago.

Substitui o WordPress atual em [prtracker.com.br](https://prtracker.com.br).

Brand bible completo em [`CLAUDE.md`](./CLAUDE.md). Especificação do build em [`BRIEF.md`](./BRIEF.md).

---

## Começar

**Pré-requisitos**: Node.js 20+ (recomendado 22, que é o runtime da Vercel).

```bash
npm install
npm run dev          # http://localhost:4321
```

Em ambientes Windows onde o Application Control bloqueia binários nativos, a dependência `rollup` é substituída pelo fallback WASM via `overrides` no `package.json` — não precisa fazer nada, `npm install` já resolve.

---

## Scripts

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build estático para `dist/` + função serverless para `/api/*` |
| `npm run preview` | Preview local do build de produção |
| `npm run typecheck` | Checagem de tipos via `astro check` |
| `npm run gen:assets` | Regenera favicons PNG e OG image a partir de SVGs |
| `npm run fetch:images` | Baixa imagens dos produtos da CDN do WordPress atual |
| `npm run sync:images` | Copia imagens da pasta `Imagens/` para `public/images/products/` |

---

## Estrutura

```
src/
├── content.config.ts            ← Schema Zod da collection de produtos
├── content/products/*.json      ← 7 produtos (preços em cents, specs, FAQ)
├── layouts/BaseLayout.astro     ← Shell HTML + SEO + Header/Footer/CartDrawer
├── components/
│   ├── Header.astro             ← Sticky, transparent-on-hero, cart badge
│   ├── Footer.astro             ← 4 colunas, redes sociais, políticas
│   ├── CartDrawer.astro         ← Drawer lateral direito, overlay, ESC dismiss
│   ├── ProductCard.astro        ← Card de produto com hover + image zoom
│   ├── ProductGallery.astro     ← Galeria com thumbs e crossfade
│   ├── BarbellConfigurator.astro ← Feature crítica: SVG + seletores + carrinho
│   ├── AddToCartSimple.astro    ← Form pra produtos sem configurador (camisetas)
│   ├── SpecsTable.astro         ← Specs em <dl>
│   ├── FAQAccordion.astro       ← FAQ em <details>
│   ├── SEO.astro                ← Meta tags + JSON-LD
│   └── Logo.astro               ← Logotipo SVG (3 variants)
├── pages/
│   ├── index.astro              ← Home com hero + grid + features + CTA
│   ├── product/[slug].astro     ← Template dinâmico dos 7 produtos
│   ├── product-category/camisetas.astro
│   ├── cart.astro               ← Carrinho full-page
│   ├── checkout.astro           ← Form completo + Mercado Pago
│   ├── obrigado.astro           ← Pós-pagamento
│   ├── contato.astro            ← WhatsApp/email + form
│   ├── politicas/{privacidade,troca-e-devolucao,termos}.astro
│   ├── 404.astro                ← Custom 404
│   └── api/
│       ├── create-preference.ts ← Cria preferência MP, valida preços server-side
│       └── mp-webhook.ts        ← Recebe notificações MP
├── lib/
│   ├── catalog.ts               ← PLATES, EXERCISES, constantes do BRIEF
│   ├── format.ts                ← formatBRL, applyPix (cents integer math)
│   ├── pricing.ts               ← Recalcula preços server-side
│   └── cart-types.ts            ← CartItem, CartSnapshot
├── scripts/
│   └── cart.ts                  ← Store do carrinho (localStorage + eventos)
└── styles/global.css            ← Tailwind 4 @theme com brand tokens

public/
├── favicon.svg                  ← SVG principal
├── favicon-32.png               ← Gerado via gen:assets
├── apple-touch-icon.png         ← Gerado via gen:assets
├── og-default.svg / .png        ← OG image padrão
├── robots.txt
└── images/products/[slug]/      ← Imagens de cada produto

scripts/                         ← Utilitários (fora do bundle)
├── fetch-product-images.mjs
├── sync-images-from-folder.mjs
└── gen-assets.mjs

astro.config.mjs                 ← Tailwind plugin, sitemap, Vercel adapter
vercel.json                      ← Cache headers, redirects /produto/* → /product/*
```

---

## Variáveis de ambiente

Copie `.env.example` → `.env` e preencha:

```
MP_ACCESS_TOKEN=APP_USR-xxxxxxxx...
MP_PUBLIC_KEY=APP_USR-xxxxxxxx...
PUBLIC_SITE_URL=https://prtracker.com.br
```

Obtenha as credenciais MP em [mercadopago.com.br/developers/panel](https://www.mercadopago.com.br/developers/panel). Use credenciais de **teste** em homologação e **produtivas** em produção.

---

## Deploy (Vercel)

```bash
npx vercel              # primeira vez: linka o projeto
npx vercel --prod       # deploy de produção
```

Ou conecte o repositório GitHub direto no dashboard da Vercel.

**Depois do primeiro deploy**, configure as env vars no painel Vercel:

- `Project → Settings → Environment Variables`
- Adicione `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` (ambiente **Production** e **Preview**)
- Redeploy pra aplicar

O webhook do Mercado Pago deve apontar para `https://prtracker.com.br/api/mp-webhook`. Configure em `MP Dashboard → Sua aplicação → Webhooks`.

---

## Adicionar/editar produtos

Os produtos vivem como JSONs em `src/content/products/`. Cada arquivo é validado pelo schema Zod em `src/content.config.ts`.

Para **editar um produto** (preço, descrição, imagens):

1. Abra `src/content/products/<slug>.json`
2. Ajuste os campos. **Preços são em centavos** (14990 = R$ 149,90).
3. Salve — hot-reload atualiza a página.

Para **adicionar um produto novo**:

1. Crie `src/content/products/<novo-slug>.json` seguindo o mesmo schema.
2. Adicione as imagens em `public/images/products/<novo-slug>/`.
3. O site adiciona automaticamente a rota `/product/<novo-slug>`.

Campos do schema:

```ts
{
  slug: string,                       // deve bater com o filename
  title: string,
  tagline?: string,                   // frase curta mostrada abaixo do título
  category: "pr-trackers" | "anilhas" | "camisetas",
  priceBase: number,                  // em cents (int)
  priceFrom: boolean,                 // mostra "A partir de" no preço
  shortDescription: string,
  longDescriptionHtml: string,        // HTML permitido (p, strong, ul, li)
  images: [{ src, alt, width?, height? }],
  specs: [{ label, value }],
  faq: [{ question, answer }],
  sizes?: string[],                   // só para camisetas
  configurator: {
    enabled: boolean,
    isAnilhasOnly: boolean,           // true apenas para /product/anilhas
    hasExerciseSelector: boolean      // true apenas para my-pr-set
  },
  featured: boolean,
  priority: number,                   // ordem no grid (asc)
  seo?: { metaTitle?, metaDescription? }
}
```

---

## Fluxo de compra

1. Cliente monta o produto no configurador (ou escolhe tamanho da camiseta) e clica "Adicionar ao carrinho".
2. O item vai pro `localStorage` (chave `prtracker_cart_v1`) e o `CartDrawer` abre.
3. Cliente clica "Finalizar" → `/checkout`.
4. Preenche endereço (CEP com autocomplete via ViaCEP) e escolhe Pix ou Cartão.
5. Submit envia `POST /api/create-preference` com os items do cart.
6. A função valida o payload com Zod, **recalcula todos os preços server-side** (`src/lib/pricing.ts`) e cria a preferência MP.
7. Cliente é redirecionado pro `init_point` do Mercado Pago.
8. Após o pagamento, MP redireciona pra `/obrigado` e envia webhook para `/api/mp-webhook`.

### Política de preço server-side

A função **nunca confia** no `unitPriceCents` enviado pelo client. Ela:

- Carrega o produto do content collection pelo slug;
- Recalcula unit price: `basePrice + plates selecionadas × price/par`;
- Valida espaço físico (`≤ 45mm por lado`);
- Valida que `pairs ≤ maxPairs` para cada peso;
- Valida tamanho (camisetas) contra `sizes[]` do produto;
- Retorna 400 se qualquer validação falhar.

Para Pix, aplica o desconto de 5% como um item negativo na preferência MP (o MP mostra "Desconto Pix" na cobrança).

---

## Testando

### Configurador (checklist do BRIEF)

- Power Rack Set com 2 pares de 25 kg → peso total **120 kg** (20 barra + 4 × 25), preço **R$ 179,90**, Pix **R$ 170,91**.
- Adicionar mais de 45mm de anilhas por lado → botão desabilita com "Remova anilhas".
- My PR Set → dropdown mostra os 20 exercícios.
- Anilhas Avulsas → sem barra renderizada; preço começa em R$ 10,00 após selecionar o primeiro par; botão "Selecione anilhas" até ter seleção válida.

### Cart / checkout

- Adicionar item → drawer abre, badge do header mostra count.
- Recarregar a página → item persiste (localStorage).
- Pix → mostra 5% OFF calculado em cima do subtotal.
- Checkout com CEP válido → preenche street/bairro/cidade/UF automaticamente.

### SEO

- `/sitemap-index.xml` lista todas as URLs públicas (sem `/checkout`, `/api/*`, `/obrigado`).
- Cada página de produto tem JSON-LD `Product` com Offer em BRL.
- Home tem JSON-LD `Organization` + `WebSite` com SearchAction.
- Cole uma página de produto em [validator.schema.org](https://validator.schema.org/) para validar.

### Lighthouse

Rode localmente depois do build:

```bash
npm run build
npm run preview       # serve dist/ em localhost:4321
```

Em outra aba, abra DevTools → Lighthouse → Mobile → "Performance, A11y, SEO, Best Practices". Meta: 95+ em todas.

---

## Credenciais/links

- **Mercado Pago**: [dashboard](https://www.mercadopago.com.br/developers/panel)
- **Vercel**: [dashboard](https://vercel.com/dashboard)
- **ViaCEP**: API gratuita, sem chave
- **Instagram**: [@pr.tracker](https://instagram.com/pr.tracker)
- **WhatsApp**: (51) 98206-1914 · contato@prtracker.com.br
