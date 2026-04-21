# BRIEF — PR Tracker ecommerce (rebuild)

Site estático moderno, rápido e com SEO forte para PR Tracker — marca brasileira de miniaturas-troféu personalizadas (halteres, racks e anilhas olímpicas em miniatura) — prtracker.com.br. Substitui o WordPress atual.

---

## Contexto e referências

- Site atual (conteúdo, produtos, preços, imagens): https://prtracker.com.br
- Referência de UX moderna (inspiração, não copiar): https://www.minibarbell.com
- Público: crossfitters, powerlifters, halterofilistas e amantes de musculação no Brasil.
- Diferencial: miniaturas-troféu que reproduzem a barra + anilhas do PR do cliente, com personalização por exercício.
- Brand bible autoritativa: `CLAUDE.md` (tom de voz, posicionamento, MIV da Faísca Design).

---

## Stack e arquitetura

- **Astro 5 + TailwindCSS 4** (SSG estático, zero-JS por padrão, islands só onde precisa de interatividade).
- Lucide icons (lucide-astro).
- TypeScript strict em todos os arquivos de lógica.
- Conteúdo dos produtos em Content Collections (Astro) com schema Zod.
- Output `static` para deploy em **Vercel** (Vercel Functions para Mercado Pago).
- Fontes self-hosted via `@fontsource/*` (performance).

Setup inicial (projeto inicializado direto na pasta `Site/`, não em subpasta):

```bash
npm create astro@latest . -- --template minimal --typescript strict --install --no-git
npx astro add tailwind sitemap vercel
npm i mercadopago lucide-astro @fontsource/inter @fontsource/kanit @fontsource/archivo-black
```

---

## Identidade visual (brand system — MIV Faísca Design)

Cores principais (configurar em `tailwind.config`):

- `brand-lime` → `#D8FF2C` (lime green vibrante — CTA primário, destaque, logotipo sobre fundo escuro)
- `brand-navy` → `#01002A` (dark navy — fundo principal, texto sobre claro)
- `brand-white` → `#FFFFFF`
- `brand-gray-medium` → `#4D4D51` (cinza médio — tipografia de apoio)
- `brand-black` → `#000000`

### Cores das anilhas (padrão olímpico IWF — USAR EXATAMENTE ESTAS CORES)

Baseadas no MIV oficial (Pantone) + BRIEF (pesos menores não cobertos pelo MIV):

| Peso | Cor | HEX | Origem |
|------|-----|-----|--------|
| 25 kg | Vermelho | `#DA291C` | MIV Pantone 485 C |
| 20 kg | Azul marinho | `#0057B8` | MIV Pantone 2935 C |
| 15 kg | Amarelo | `#FFC72C` | MIV Pantone 123 C |
| 10 kg | Verde | `#43B02A` | MIV Pantone 361 C |
| 5 kg | Preto | `#111111` | BRIEF (MIV não cobre) |
| 2.5 kg | Azul claro | `#2563EB` | BRIEF (MIV não cobre) |
| 1.25 kg | Cinza | `#C0C5CC` | BRIEF (MIV não cobre) |

### Tipografia (MIV oficial — self-hosted)

- **Títulos e subtítulos**: Inter (700–900, tracking apertado em display)
- **Corpo de texto**: Kanit (400–500)
- **Anilhas/produto (labels curtos, peso)**: Archivo Black (CAIXA ALTA sempre)
- **Logotipo**: Area Variable (itálico) — se não disponível, fallback para Inter italic 900

Tom de voz: direto, motivacional, brasileiro, premium — "Sua marca. Seu PR." / "Seu PR merece mais do que uma foto." Ver detalhes em `CLAUDE.md`.

---

## Catálogo de produtos (7 SKUs — preços oficiais — tabela única)

| # | Produto | Categoria | Preço base | Configurador | Obs. |
|---|---------|-----------|-----------:|:------------:|------|
| 1 | Power Rack Set | pr-trackers | **R$ 149,90** | Sim | Rack de agachamento em alumínio + barra + anilhas |
| 2 | Bench Press Set | pr-trackers | **R$ 169,90** | Sim | Banco de supino em alumínio |
| 3 | Deadlift Set | pr-trackers | **R$ 119,90** | Sim | Base MDF + borracha |
| 4 | My PR Set | pr-trackers | **R$ 134,90** | Sim + seletor de 20 exercícios | Base em acrílico |
| 5 | Anilhas Avulsas | anilhas | **a partir de R$ 10,00** | Sim (modo anilhas-only) | Sem barra, só pares |
| 6 | Camiseta Masculina | camisetas | **R$ 80,00** | Não | Tamanhos P/M/G/GG |
| 7 | Camiseta Feminina Baby Look | camisetas | **R$ 80,00** | Não | Tamanhos P/M/G/GG |

### Preços de anilhas (tabela única — sem preço diferenciado por kit)

| Peso | Preço por par | Máx. pares |
|------|--------------:|:----------:|
| 25 kg | R$ 15,00 | 4 |
| 20 kg | R$ 10,00 | 4 |
| 15 kg | R$ 10,00 | 4 |
| 10 kg | R$ 10,00 | 4 |
| 5 kg | R$ 10,00 | 4 |
| 2.5 kg | R$ 10,00 | 1 |
| 1.25 kg | R$ 10,00 | 1 |

### Lista de exercícios do My PR Set (20 opções)

Back Squat, Bench Press, Clean, Clean & Jerk, Deadlift, Front Squat, Hang Clean, Hang Power Clean, Overhead Squat, Power Clean, Power Snatch, Push Jerk, Push Press, Shoulder Press, Snatch, Split Jerk, Squat Clean, Squat Snatch, Sumo Deadlift, Thruster.

### Descrições curtas (copy oficial — usar literalmente)

- **Power Rack Set** — "Miniatura do rack de agachamento feita em alumínio usinado, com barra em aço inoxidável. Celebre seu PR no squat como um troféu."
- **Bench Press Set** — "Miniatura do banco de supino em alumínio com barra em aço inox. Um troféu para o seu PR no bench."
- **Deadlift Set** — "Base de MDF + borracha, barra em aço inox. O troféu do levantamento terra para quem puxa peso de verdade."
- **My PR Set** — "O mais personalizável: escolha o exercício (back squat, snatch, clean & jerk...) e as anilhas para criar o troféu do seu PR exato."
- **Anilhas Avulsas** — "Pares de anilhas avulsas para adicionar ao seu PR Tracker existente. Escolha peso e cor. Bateu PR? Atualize seu troféu."

### Specs técnicas (oficiais — conforme CLAUDE.md)

- **Anilhas**: plástico de alta densidade (ABS), diâmetro 42 mm, cores padrão olímpico com logo PR Tracker.
- **Barra**: aço inoxidável usinado com alto relevo, comprimento 220 mm, diâmetro 5 mm.
- **Presilhas**: aço (mini presilhas em metal).
- **Power Rack**: alumínio, 150 × 100 × 100 mm (A × L × C).
- **Bench Press**: alumínio, 85 × 100 × 100 mm.
- **Base de Deadlift**: MDF + borracha, 6 × 240 × 90 mm.
- **Base do My PR Set**: acrílico, 40 × 20 × 40 mm.

> **CRÍTICO — NÃO INVENTAR**: o produto NÃO tem gravações de peso, tempo, data ou qualquer inscrição. Não descrever como "personalizável com gravações". Não adicionar materiais/acabamentos não listados acima.

**Espessuras das anilhas (mm — para o SVG do configurador)**: 25→8, 20→8, 15→7, 10→6, 5→5, 2.5→4, 1.25→4.

**IMAGENS**: usar direto da CDN do WordPress atual (`https://prtracker.com.br/wp-content/uploads/...`). Fazer scraping das 7 páginas de produto para coletar URLs exatos e texto completo da descrição longa (preservar `<strong>` e parágrafos).

---

## Configurador de anilhas (feature crítica — diferencial da marca)

Arquivo: `src/components/BarbellConfigurator.astro` + script cliente TypeScript (`src/scripts/configurator.ts`).

Renderiza a barra olímpica em SVG responsivo. Para cada peso de anilha, um `<select>` de pares (0 a `maxPairs`). A barra atualiza em tempo real.

### Comportamento

- Anilhas empilham **simetricamente** nas duas pontas, da maior para a menor (25 → 20 → 15 → 10 → 5 → 2.5 → 1.25).
- Cada anilha é um `<rect>` colorido com a cor olímpica correspondente (ver tabela acima).
- **Limite físico**: máximo 45 mm de anilhas por lado. Se passar, mostra aviso "Espaço esgotado — remova anilhas" e DESABILITA o botão "Adicionar ao carrinho".
- `maxPairs`: 25/20/15/10/5 kg = 4 pares; 2.5/1.25 kg = 1 par.
- Atualizações em tempo real:
  - **Peso total** = barra 20 kg + (anilhas × 2 pares).
  - **Preço total** = preço base do set + soma das anilhas selecionadas.
  - **Pix (5 % OFF)** automático no total.

### Modos

- **Normal**: barra + configurador (Power Rack, Bench Press, Deadlift).
- **`isAnilhasOnly: true`**: esconde a barra, não tem preço-base; só calcula preço das anilhas selecionadas (página `/product/anilhas`).
- **`hasExerciseSelector: true`** (só My PR Set): `<select>` extra com os 20 exercícios. Nome do exercício é concatenado no item do carrinho (ex: "My PR Set — Back Squat").

### API pública

Expor `window.PRConfigurator.build(container, opts)` para funcionar mesmo fora do Astro caso precise reaproveitar.

---

## Páginas (15 no total)

```
/                                       Home (hero, grid de produtos, features, sobre, contato)
/product/power-rack-set
/product/bench-press-set
/product/deadlift-set
/product/my-pr-set
/product/anilhas
/product/camiseta-masculina
/product/camiseta-feminina-baby-look
/product-category/camisetas             Listagem de camisetas
/cart                                   Carrinho cheio
/checkout                               Checkout com Mercado Pago
/obrigado                               Confirmação pós-pagamento
/contato                                Form + WhatsApp + endereço
/politicas/privacidade
/politicas/troca-e-devolucao
/politicas/termos
/404                                    Custom 404
```

Cada página de produto tem: galeria com thumbnails, título, preço "a partir", descrição curta, configurador (se aplicável), descrição longa, specs, FAQ accordion, JSON-LD `Product`.

---

## Carrinho e checkout

- Carrinho em `localStorage` (store vanilla simples).
- **Cart drawer**: lateral **direito**, desliza com overlay escuro sobre o resto da tela. Abre ao clicar no ícone do header.
- Item: imagem, nome, configuração ("2× 25 kg + 2× 10 kg, Back Squat"), quantidade (+/-), preço, botão remover.
- Subtotal + Pix (5 % OFF) em destaque.
- Botões: "Continuar comprando" e "Finalizar compra".

Checkout (`/checkout`):

- Form: nome, e-mail, telefone, CPF, CEP (autocomplete ViaCEP), logradouro, número, complemento, bairro, cidade, estado.
- Radio: **Pix (5 % OFF)** vs **Cartão de crédito (até 6× sem juros)**.
- Submit → `POST /api/create-preference` → redirect para `init_point` do Mercado Pago.
- Validação client-side com mensagens em PT-BR.

**Frete**: o site não calcula frete. Copy padrão: "Envio para todo o Brasil com rastreio" (sem valores). Frete real é calculado pós-compra via WhatsApp/e-mail.

---

## Integração Mercado Pago

### `/api/create-preference.ts` (Vercel Function)

- Lê `MP_ACCESS_TOKEN` de env.
- Valida itens e calcula total **server-side** (nunca confia no client).
- Cria preferência via SDK oficial `mercadopago`.
- `back_urls`: `/obrigado` (success), `/checkout?status=failure` (failure).
- `notification_url`: `/api/mp-webhook`.
- `payment_methods`: excluir cartão se usuário escolheu Pix; `installments: 6`.
- Retorna `{ id, init_point }`.

### `/api/mp-webhook.ts`

- Recebe notificação, valida via `GET /v1/payments/:id`.
- Stub: loga no console por ora. Comentário `// TODO: enviar e-mail`.

### `.env.example`

```
MP_ACCESS_TOKEN=APP_USR-xxx
MP_PUBLIC_KEY=APP_USR-xxx
```

---

## SEO e performance (não negociável)

- Meta tags completas em cada página: `title`, `description`, `canonical`, `og:*`, `twitter:card` via componente `<SEO>` reutilizável.
- JSON-LD:
  - Home: `Organization` + `WebSite` (com `SearchAction`).
  - Produto: `Product` com `Offer` (`priceCurrency: BRL`, `availability: InStock`, `brand: PR Tracker`).
  - Camisetas listing: `ItemList`.
- `sitemap.xml` automático via `@astrojs/sitemap`.
- `robots.txt` (allow all, disallow `/checkout`, `/api/`, sitemap reference).
- `<link rel="preconnect">` para `fonts.googleapis` e `prtracker.com.br` (CDN de imagens).
- Imagens: `<img loading="lazy" decoding="async" width="..." height="...">` sempre. Primeira imagem de cada página: `loading="eager" fetchpriority="high"`.
- Favicon PNG 32 / 180 + `apple-touch-icon`.
- `lang="pt-BR"` em todas as páginas.
- Hierarquia de headings: `h1` único por página, `h2` seções, `h3` subseções.

**Meta: Lighthouse 95+ em todas as métricas (Performance, A11y, SEO, Best Practices) rodando sobre CDN Vercel.**

---

## Acessibilidade

- WCAG 2.1 AA mínimo.
- `aria-label` em todos os botões de ícone.
- Contrast ratio AA no texto principal.
- Focus visible em todos os interativos.
- Alt text descritivo em todas as imgs.
- Skip link para o conteúdo principal.
- Respeita `prefers-reduced-motion`.

---

## Contatos e dados comerciais (para usar no header/footer/contato)

- **WhatsApp**: (51) 98206-1914 — Seg-Sex 8h-18h
- **E-mail**: contato@prtracker.com.br
- **Instagram**: [@pr.tracker](https://instagram.com/pr.tracker)
- **TikTok**: ativo (link no footer)
- **CNPJ**: 59.947.215/0001-67
- **Razão Social**: PR Tracker Ltda
- **Pagamento**: Pix (5 % OFF) ou cartão até 6× sem juros
- **Envio**: para todo o Brasil com rastreio

---

## Deliverables

1. Projeto Astro rodando em `npm run dev` sem warnings.
2. Build passando em `npm run build` sem warnings.
3. Todas as 15 páginas acessíveis.
4. Configurador funcionando nos 5 produtos aplicáveis (4 sets + anilhas).
5. Carrinho e checkout funcionais (checkout pode falhar no final sem `MP_ACCESS_TOKEN` — esperado).
6. `README.md` explicando rodar local, deploy (Vercel CLI), env vars MP, e como editar produtos (Content Collections).
7. `.env.example` preenchido.
8. `vercel.json` se necessário.

---

## Critérios de aceite

- `npm run build` gera output estático sem erros.
- Home abre em < 1 s em conexão rápida (Lighthouse).
- Configurador Power Rack Set: 2 pares de 25 kg → "Peso total: 120 kg" (barra 20 + 4 × 25) e barra visualmente preenchida.
- Preço Power Rack Set com 2 pares de 25 kg = R$ 149,90 + 2 × R$ 15,00 = **R$ 179,90**.
- Preço com Pix = R$ 179,90 × 0,95 = **R$ 170,91**.
- Configurador bloqueia ao passar de 45 mm por lado.
- My PR Set mostra 20 exercícios no dropdown.
- Anilhas Avulsas NÃO mostra a barra, só os seletores. Preço começa em R$ 10,00.
- Cart drawer persiste após reload (localStorage).
- Pix mostra 5 % OFF corretamente em cart e checkout.
- `sitemap.xml` lista as 14 URLs públicas (sem `/checkout`).
- JSON-LD valida em https://validator.schema.org (colar uma página de produto).
- Mobile (375 px): nada estoura a viewport, CTAs alcançáveis com o polegar.

---

## Ordem de trabalho (commitar a cada etapa)

1. Scaffold Astro + Tailwind + config de brand colors + tipografia MIV.
2. Content Collection de produtos com os 7 SKUs.
3. Scraping das imagens e descrições longas de `prtracker.com.br`.
4. Layout base (`Header`, `Footer`, `CartDrawer`, `SEO` component).
5. Home page.
6. Template de página de produto.
7. `BarbellConfigurator` (modo normal).
8. `BarbellConfigurator` (modo anilhas-only e exercise-selector).
9. Carrinho + Checkout client-side.
10. `/api/create-preference` + `/api/mp-webhook`.
11. Páginas secundárias (camisetas listing, contato, políticas, 404, obrigado).
12. SEO: sitemap, robots, JSON-LD.
13. Favicons + OG image.
14. `README` + `.env.example`.
15. Lighthouse local → ajustar até 95+.
