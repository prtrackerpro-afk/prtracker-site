# Inventário do site atual — prtracker.com.br
Data da investigação: 2026-04-22
Ferramentas: Firecrawl (`firecrawl_scrape`, `firecrawl_map`) + `curl` para inspeção de HTML bruto.
Objetivo: garantir que **nada seja perdido** na migração para Astro.

---

## 1. Sitemap / mapa de URLs

### Fontes autoritativas

- `https://prtracker.com.br/robots.txt` — aponta para `https://prtracker.com.br/wp-sitemap.xml`.
- `https://prtracker.com.br/wp-sitemap.xml` (índice) lista:
  - `wp-sitemap-posts-post-1.xml` (blog)
  - `wp-sitemap-posts-page-1.xml` (páginas)
  - `wp-sitemap-posts-product-1.xml` (produtos)
  - `wp-sitemap-posts-shopengine-template-1.xml` (templates internos Elementor/ShopEngine)
  - `wp-sitemap-taxonomies-category-1.xml`
  - `wp-sitemap-taxonomies-product_cat-1.xml`
  - `wp-sitemap-users-1.xml`

### Produtos (7) — `wp-sitemap-posts-product-1.xml`

| URL | Slug | Último lastmod |
|---|---|---|
| https://prtracker.com.br/product/power-rack-set/ | power-rack-set | 2026-03-09 |
| https://prtracker.com.br/product/bench-press-set/ | bench-press-set | 2026-04-09 |
| https://prtracker.com.br/product/deadlift-set/ | deadlift-set | 2026-04-01 |
| https://prtracker.com.br/product/camiseta-masculina/ | camiseta-masculina | 2025-11-06 |
| https://prtracker.com.br/product/camiseta-feminina-baby-look/ | camiseta-feminina-baby-look | 2025-11-06 |
| https://prtracker.com.br/product/my-pr-set/ | my-pr-set | 2026-03-09 |
| https://prtracker.com.br/product/anilhas/ | anilhas | 2026-01-23 |

### Páginas públicas — `wp-sitemap-posts-page-1.xml`

| URL | Função |
|---|---|
| https://prtracker.com.br/ | Home |
| https://prtracker.com.br/loja/ | Loja (listagem de todos os produtos) |
| https://prtracker.com.br/carrinho/ | Carrinho WooCommerce |
| https://prtracker.com.br/checkout/ | Checkout WooCommerce |
| https://prtracker.com.br/minha-conta/ | Minha Conta WooCommerce |
| https://prtracker.com.br/politica-de-privacidade/ | Política de Privacidade |
| https://prtracker.com.br/politica-de-troca-e-devolucao/ | Política de Troca e Devolução |
| https://prtracker.com.br/termos-e-condicoes-de-uso/ | Termos e Condições de Uso |
| https://prtracker.com.br/affiliates/ | Portal de afiliados (retorna **HTTP 404** no corpo, mas listado) |

### Categorias de produto — `wp-sitemap-taxonomies-product_cat-1.xml`

| URL | Produtos na categoria |
|---|---|
| https://prtracker.com.br/product-category/pr-trackers/ | Bench Press Set, Deadlift Set, Power Rack Set |
| https://prtracker.com.br/product-category/camisetas/ | Camiseta Feminina Baby Look, Camiseta Masculina |
| https://prtracker.com.br/product-category/my-pr-set/ | My PR Set |
| https://prtracker.com.br/product-category/anilhas/ | Anilhas |

### Blog — `wp-sitemap-posts-post-1.xml`

Apenas **1 post** e é o placeholder padrão do WordPress:
- `https://prtracker.com.br/2025/10/20/hello-world/` — "Hello world!" (conteúdo: "Welcome to WordPress. This is your first post..."). **Não migrar.**

### Templates ShopEngine (não são páginas voltadas ao usuário — definem layout)

Listados no sitemap `wp-sitemap-posts-shopengine-template-1.xml`:
- `/shopengine-template/produto/`
- `/shopengine-template/loja/`
- `/shopengine-template/categorias/`
- `/shopengine-template/carrinho/`
- `/shopengine-template/produto-camisetas/`
- `/shopengine-template/checkout/`
- `/shopengine-template/obrigado/`
- `/shopengine-template/produto-my-pr-set/`
- `/shopengine-template/produto-anilhas/`

Essas URLs existem porque o tema é Elementor/ShopEngine. **Não migrar** — servem só para o editor do WordPress.

### Menu superior — cuidado com link quebrado

O menu principal linka "Power Rack" para `/product/the-mini-squat-rack/` (slug antigo, que foi renomeado para `power-rack-set`). Verificar se faz redirect 301 ou se retorna 404. Sugestão de redirect no site novo: `/product/the-mini-squat-rack/ → /product/power-rack-set/`.

---

## 2. Metadados globais

### Stack identificado (via meta `generator` + HTML)

- WordPress **6.9.4**
- WooCommerce **10.7.0**
- Elementor **4.0.3** + **Elementor Pro 3.34.1**
- ShopEngine (loja em Elementor) + ShopEngine Pro
- Site Kit by Google **1.177.0** (usado só para conectar Search Console/Analytics)
- Tema: **Hello Elementor** (classe body: `wp-theme-hello-elementor`)
- WP Rocket (cache — aparece como `rocketlazyloadscript`, pasta `wp-content/cache/min/1/`)
- Really Simple SSL (atributo `data-rsssl="1"` no `<body>`)

### Title / meta / OG (consistente em todas as páginas)

- `<title>` padrão: `Nome da Página – PR Tracker`
- `og:image`: `https://prtracker.com.br/wp-content/uploads/2026/03/og-image-prtracker.png` (1200×630)
- `meta robots`: `max-image-preview:large`
- `html lang="pt-BR"`
- `canonical` em cada página (ex.: home tem `<link rel="canonical" href="https://prtracker.com.br/" />`)
- `facebook-domain-verification`: `xennprv42lanmxprcqr2z9bmy0npqp`
- **Não foi encontrado nenhum `<meta name="description">` explícito** nas páginas principais — o site depende do título. Gap para corrigir no novo site.
- **Nenhum JSON-LD (`application/ld+json`) detectado** em nenhuma página de produto. Gap grave para SEO — migração deve adicionar schema `Product` / `Organization` / `BreadcrumbList`.

### Favicon / ícones (URLs)

- Favicon 32×32: `https://prtracker.com.br/wp-content/uploads/2025/10/FAV-100x100.png`
- Favicon 192×192 / Apple-touch: `https://prtracker.com.br/wp-content/uploads/2025/10/FAV-300x300.png`
- msapplication-TileImage: `https://prtracker.com.br/wp-content/uploads/2025/10/FAV-300x300.png`

### Logo (URLs de uso em produção)

- Logo amarelo (header, fundo escuro): `https://prtracker.com.br/wp-content/uploads/2025/10/Logotipo-Amarelo@4x-1-scaled.png`
- Logo azul escuro (footer / fundo claro): `https://prtracker.com.br/wp-content/uploads/2025/10/Logotipo-Azul-escuro@4x-scaled.png`

### Imagem Open Graph

- `https://prtracker.com.br/wp-content/uploads/2026/03/og-image-prtracker.png`

---

## 3. Home page — `https://prtracker.com.br/`

### Faixa superior (notificação)

> Pague no Pix e ganhe 5% de desconto

### Menu de navegação (header)

- Início → `/`
- Power Rack → `/product/the-mini-squat-rack/` **(link quebrado / slug antigo)**
- Bench Press → `/product/bench-press-set/`
- Deadlift → `/product/deadlift-set/`
- My PR Set → `/product/my-pr-set/`
- Camisetas → `/product-category/camisetas/`
- Anilhas → `/product/anilhas/`
- Quem Somos → `/#sobre`

### Hero

- Imagem mobile: `https://prtracker.com.br/wp-content/uploads/2026/03/fundo-pr-tracker-5.1-mobile.jpg`
- Título: **"Seu PR virou TROFÉU!"**
- CTA: "Comprar agora" → `/#prt`

### Seção "Miniaturas que guardam sua história" (grid de 4 cards)

| Produto | Imagem | Headline | Preço base |
|---|---|---|---|
| Deadlift Set | `wp-content/uploads/2026/01/Deadlift.png` | "O mais bruto dos PRs." | A partir de R$ 119,90 |
| My PR Set | `wp-content/uploads/2026/01/MY-PR-SET.png` | "Seu LPO favorito está aqui!" | A partir de R$ 134,90 |
| Power Rack Set | `wp-content/uploads/2025/10/Power-Rack-base-diagonal.jpeg` | "Para quem ama agachamento!" | A partir de R$ 149,90 |
| Bench Press Set | `wp-content/uploads/2026/01/Bench-Press.png` | "Supino que virou troféu!" | A partir de R$ 169,90 |

### Seção Camisetas

Título: **"Leve, resistente, pronta para o treino!"**

Texto:
> Mobilidade total, sem sobrar nem apertar, modelagem funcional que respeita o corpo em agachamentos, remadas, sprints e alongamentos.

CTA: "Comprar agora" → `/product-category/camisetas/`

### Bloco "Troféu de quem vive o treino dentro e fora da academia" (texto literal)

> Transforme seu recorde em uma peça exclusiva, divertida e motivadora para celebrar seus PRs e manter a chama da evolução acesa.
>
> São várias opções, Power Rack, Bench Press e Deadlift, garantindo que independe da modalidade, você terá o seu troféu exclusivo marcando o seu PR.

CTA: "Escolha já o seu" → `/#prt`

Ícones sociais: Instagram `https://www.instagram.com/pr_tracker/` (observação: este é **`pr_tracker`** com underscore, diferente do `@pr.tracker` oficial do footer) + TikTok `https://www.tiktok.com/@pr.tracker?_r=1&_t=ZS-91BM0RlKaAc`.

### Seção "Quem Somos" (âncora `#sobre`) — texto literal

> A **PR Tracker** nasceu de um sentimento que todo atleta conhece: O instante em que a barra sobe, o peso trava no ar, o coração dispara e você supera o seu PR (Personal Record). Esse é o momento que nunca deveria ser esquecido — e nós transformamos isso em algo real.
>
> Criamos miniaturas de equipamentos de academia, barras, anilhas e outros símbolos do universo CrossFit, musculação e treinamento funcional. Cada peça funciona como um troféu fitness, perfeito para decoração, coleção ou presente para quem treina.
>
> Nossos produtos existem para representar histórias de superação, disciplina e evolução.
>
> Da mesa do escritório à prateleira do box, os troféus PR Tracker mostram para o mundo o que cada repetição construiu.
>
> Para atletas, coaches, boxes, academias e apaixonados por treino, a PR Tracker é a forma mais única e exclusiva de celebrar conquistas, motivar o próximo PR e transformar resultados em algo que você pode ver e tocar todos os dias.

### Seção "PARCERIAS / CO-BRAND" — texto literal

> Se você está organizando um evento esportivo, quer presentear atletas, motivar alunos ou criar algo exclusivo para sua marca, a PR Tracker pode ajudar.
>
> Criamos miniaturas personalizadas de equipamentos e movimentos — o troféu perfeito para celebrar conquistas, premiar esforços e fortalecer a identidade da sua comunidade.
>
> Entre em contato para saber mais sobre descontos para pedidos em volume, personalizações com sua marca e produtos exclusivos desenvolvidos para boxes, academias e eventos.

**Form de contato** (Elementor Form) com campos: Nome, E-mail, WhatsApp, Empresa, Mensagem, botão "Enviar".

### Seção "benefícios" (3 colunas com ícones)

- **Envio & Rastreio** — "Entrega rápida e rastreável para todo o Brasil." (ícone `wp-content/uploads/2025/10/IC-1.png`)
- **Pagamento Seguro** — "Pague com Pix e ganhe 5% de desconto e cartão em até 12x." (ícone `IC-2.png`) — **Atenção**: a home diz **"12x"**, mas o CLAUDE.md/BRIEF diz "até 6x sem juros". Conferir com o cliente antes de replicar.
- **Suporte Humanizado** — "Atendimento rápido no WhatsApp e por e-mail." (ícone `IC-3.png`)

### Seção "reviews/testimonials"

**Não há** seção de reviews ou depoimentos na home. Também **não há** widget Trustvox, Google Reviews ou similar. Gap de social proof para preencher no novo site.

### Vídeos embedados

**Nenhum** vídeo YouTube/Instagram/TikTok embedado em nenhuma página pública pesquisada.

---

## 4. Produtos (seção por SKU)

**Observação crítica**: nenhum produto expõe SKU no front-end (nem em badge visível, nem em JSON-LD). Todos os produtos são classificados na taxonomia WooCommerce `product_cat`, e o ID interno do post WP é o melhor identificador estável que temos hoje.

O texto de descrição longa e as FAQs repetem-se quase literalmente entre os 4 sets principais. O texto foi **preservado literalmente** em cada seção abaixo para permitir reuso direto.

### 4.1 Power Rack Set

- **URL**: https://prtracker.com.br/product/power-rack-set/
- **WooCommerce product ID**: 78
- **Categoria**: `pr-trackers`
- **Tipo**: `product-type-simple` (variações de peso são geridas por UM calculador custom — ver seção 4.8)
- **Preço base exibido**: "A partir de R$ 0,00" (o preço real sai do calculador "Monte sua barra"; a home anuncia "A partir de R$ 149,90")
- **Imagens (galeria completa)**:
  - Principal: `https://prtracker.com.br/wp-content/uploads/2025/10/Power-Rack-base-diagonal.jpeg`
  - `https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-diagonal.jpeg`
  - `https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-frontal-ampliada.jpeg`
  - `https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-mao.jpeg`
  - `https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-lateral.jpeg`
- **Descrição curta** (subtítulo usado na home): "Para quem ama agachamento!"
- **Descrição longa** (literal):

  > O **Power Rack Set** representa consistência, disciplina e foco. Inspirado no coração de qualquer box ou academia, esse modelo traduz o ambiente onde grandes marcas são conquistadas. É a lembrança perfeita para quem vive o treino com intensidade e paixão.
  >
  > A barra é usinada em aço inoxidável com alto relevo, reproduzindo com fidelidade o equipamento que você usa nos treinos.
  >
  > O rack de agachamento é feito de alumínio, replicando em miniatura o equipamento que você utiliza no seu treino.
  >
  > As anilhas coloridas com o logo **PR Tracker** seguem padrão Olímpico, são moldadas em plástico de alta densidade, criando um visual realista e vibrante.
  >
  > O conjunto inclui mini presilhas e base de apoio, formando uma réplica perfeita do seu PR ideal para decorar sua casa, escritório ou o box.

- **Especificações** (literal):
  - **Anilhas**: Material: Plástico ABS · Diâmetro: 42 mm · Espessura: 4 mm – 8 mm
  - **Barra**: Material: Aço inoxidável · Comprimento: 220 mm · Diâmetro: 5 mm
  - **Rack de Agachamento**: Material: Alumínio · Altura: 150 mm · Largura: 100 mm · Comprimento: 100 mm
  - **Presilhas**: Material: Aço
- **Qualidade premium** (bloco literal):

  > Nossas anilhas são produzidas por meio de um processo de injeção plástica que garante uniformidade e acabamento impecável.
  >
  > Fornecemos a única barra feita de aço inoxidável disponível no mercado, garantindo um produto premium.
  >
  > Cada peça passa por uma rigorosa inspeção de qualidade antes de ser enviada.

- **Variações**: nenhuma (tipo "simple"), mas o calculador permite escolher 7 pesos × número de pares — ver 4.8.
- **SKU**: não exibido no front.
- **Reviews**: nenhum no front (WooCommerce review tab está ausente / desabilitado).
- **FAQ**: bloco compartilhado — ver 4.9.

### 4.2 Bench Press Set

- **URL**: https://prtracker.com.br/product/bench-press-set/
- **product ID**: 182 · **Categoria**: `pr-trackers` · **Tipo**: simple
- **Preço anunciado na home**: "A partir de R$ 169,90"
- **Imagens**:
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press2.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press3.png`
- **Descrição curta**: "Supino que virou troféu!"
- **Descrição longa** (literal):

  > O **Bench Press Set** é sinônimo de evolução e persistência. Cada repetição conta, cada PR é uma vitória pessoal e esse troféu é o reflexo dessa jornada. Com design realista e base personalizada, ele celebra o progresso que só quem treina entende.
  >
  > **Detalhes:**
  >
  > A barra é usinada em aço inoxidável com alto relevo, reproduzindo com fidelidade o equipamento que você usa nos treinos.
  >
  > O banco de supino é feito de alumínio, replicando em miniatura o equipamento que você utiliza no seu treino. As anilhas coloridas com o logo PR Tracker seguem padrão Olímpico, são moldadas em plástico de alta densidade, criando um visual realista e vibrante.
  >
  > O conjunto inclui mini presilhas e base de apoio, formando uma réplica perfeita do seu PR, ideal para decorar sua casa, escritório ou o box.

- **Especificações** (literal):
  - **Anilhas**: Plástico ABS · Ø 42 mm · 4–8 mm
  - **Barra**: Aço inoxidável · 220 mm · Ø 5 mm
  - **Banco de supino**: Alumínio · Altura 85 mm · Largura 100 mm · Comprimento 100 mm
  - **Presilhas**: Aço
- **Qualidade premium**: texto compartilhado idêntico ao do Power Rack.
- **Variações**: calculador de anilhas (mesmo de 4.1).

### 4.3 Deadlift Set

- **URL**: https://prtracker.com.br/product/deadlift-set/
- **product ID**: 183 · **Categoria**: `pr-trackers` · **Tipo**: simple
- **Preço anunciado na home**: "A partir de R$ 119,90"
- **Imagens**:
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift-2.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift-3.png`
- **Descrição curta**: "O mais bruto dos PRs."
- **Descrição longa** (literal):

  > O **Deadlift Set** simboliza força bruta e superação. Cada detalhe foi pensado para representar aquele momento em que você puxa o peso do chão e quebra seu próprio limite.
  >
  > Feito com materiais premium e acabamento preciso, é o troféu perfeito para eternizar o seu novo PR no levantamento terra.
  >
  > A barra é usinada em aço inoxidável com alto relevo, reproduzindo com fidelidade o equipamento que você usa nos treinos.
  >
  > A base de **Deadlift** é feita de MDF & Borracha, replicando em miniatura o equipamento que você utiliza no seu treino.
  >
  > As anilhas coloridas com o logo PR Tracker seguem padrão Olímpico, são moldadas em plástico de alta densidade, criando um visual realista e vibrante.
  >
  > O conjunto inclui mini presilhas e base de apoio, formando uma réplica perfeita do seu PR ideal para decorar sua casa, escritório ou o box.

- **Especificações** (literal):
  - **Anilhas**: Plástico ABS · Ø 42 mm · 4–8 mm
  - **Barra**: Aço inoxidável · 220 mm · Ø 5 mm
  - **Base de Deadlift**: MDF & Borracha · Altura 6 mm · Largura 240 mm · Comprimento 90 mm
  - **Presilhas**: Aço
- **Variações**: calculador de anilhas.

### 4.4 My PR Set

- **URL**: https://prtracker.com.br/product/my-pr-set/
- **product ID**: 449 · **Categoria**: `my-pr-set` · **Tipo**: simple
- **Preço anunciado na home**: "A partir de R$ 134,90"
- **Imagens**:
  - `https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET2.png`
  - `https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET3.png`
  - `https://prtracker.com.br/wp-content/uploads/2025/10/MY-PR-SET4.png`
- **Descrição curta**: "Seu LPO favorito está aqui!"
- **Descrição longa** (literal):

  > O **My PR Set** é o mais personalizável da coleção. Você escolhe o equipamento, as anilhas e o estilo da base, criando um troféu único, feito sob medida para a sua conquista.
  >
  > Uma peça que traduz sua trajetória no treino e o significado de cada PR..
  >
  > A barra é usinada em aço inoxidável com alto relevo, reproduzindo com fidelidade o equipamento que você usa nos treinos.
  >
  > A base de acrílico transparente permite personalização, projetada para agregar no ambiente em que for exposta. As anilhas coloridas com o logo **PR Tracker** seguem padrão Olímpico, são moldadas em plástico de alta densidade, criando um visual realista e vibrante.
  >
  > O conjunto inclui mini presilhas e base de apoio, formando uma réplica perfeita do seu PR ideal para decorar sua casa, escritório ou o box.

- **Especificações** (literal):
  - **Anilhas**: Plástico ABS · Ø 42 mm · 4–8 mm
  - **Barra**: Aço inoxidável · 220 mm · Ø 5 mm
  - **Acrílico**: Comprimento 40 mm · Profundidade 20 mm · Altura 40 mm
  - **Presilhas**: Aço
- **Variações — campo "Exercício" (seletor obrigatório)**: Back Squat · Bench Press · Clean · Clean & Jerk · Deadlift · Front Squat · Hang Clean · Hang Power Clean · Overhead Squat · Power Clean · Power Snatch · Push Jerk · Push Press · Shoulder Press · Snatch · Split Jerk · Squat Clean · Squat Snatch · Sumo Deadlift · Thruster (**20 exercícios**, bate com o CLAUDE.md).
- **Variações — calculador de anilhas** (igual aos demais sets).

### 4.5 Anilhas (avulsas)

- **URL**: https://prtracker.com.br/product/anilhas/
- **product ID**: 612 · **Categoria**: `anilhas` · **Tipo**: simple
- **Preço exibido na loja**: "R$ 0,00" (o preço real sai do calculador).
- **Imagens** (8 — uma global + uma por peso):
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0007_todas-anilhas.png` (global)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0000_125.png` (1.25 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0001_25.png` (2.5 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0002_5.png` (5 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0003_10-.png` (10 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0004_15-.png` (15 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0005_20.png` (20 kg)
  - `https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0006_25.png` (25 kg)
- **Descrição curta**: "Avulsas"
- **Descrição longa** (literal e **breve**):

  > Encomende novos pares de anilhas para atualizar o seu PR Tracker!

- **Qualidade premium**: bloco padrão compartilhado.
- **Variações**: só o calculador (sem "exercício", sem base).

### 4.6 Camiseta Masculina

- **URL**: https://prtracker.com.br/product/camiseta-masculina/
- **product ID**: 186 · **Categoria**: `camisetas` · **Tipo**: **variable** (atributo `tamanhos`)
- **Preço**: R$ 80,00
- **Imagens**:
  - `https://prtracker.com.br/wp-content/uploads/2025/10/FT-C.png` (frente)
  - `https://prtracker.com.br/wp-content/uploads/2025/10/FT2-C-M.png` (costas)
- **Descrição curta** (literal):

  > As camisetas **PR Tracker** são ideais para os **seus treinos mais pesados**. Feita com tecnologia que garante durabilidade, leveza e conforto para bater os seus PRs.

- **Variações de tamanho (atributo Woo `tamanhos`)**: P, M, G, GG
- **Tabela de medidas (literal — cm)**:

  | Tamanho | Largura | Comprimento |
  |:-:|:-:|:-:|
  | P | 52 | 70 |
  | M | 54 | 73 |
  | G | 56 | 76 |
  | GG | 58 | 78 |

- **Seção "veja também"** (cross-sell hardcoded): My PR Set, Deadlift Set, Power Rack Set, Camiseta Feminina Baby Look, Bench Press Set, Camiseta Masculina, Anilhas.
- **SKU**: não exibido.

### 4.7 Camiseta Feminina Baby Look

- **URL**: https://prtracker.com.br/product/camiseta-feminina-baby-look/
- **product ID**: 195 · **Categoria**: `camisetas` · **Tipo**: **variable**
- **Preço**: R$ 80,00
- **Imagens**:
  - `https://prtracker.com.br/wp-content/uploads/2025/10/FT-C.png` (frente)
  - `https://prtracker.com.br/wp-content/uploads/2025/10/FT2-C-F.png` (costas)
- **Descrição curta** (idêntica à masculina):

  > As camisetas **PR Tracker** são ideais para os **seus treinos mais pesados**. Feita com tecnologia que garante durabilidade, leveza e conforto para bater os seus PRs.

- **Variações de tamanho**: P, M, G (sem GG)
- **Tabela de medidas (literal — cm)**:

  | Tamanho | Largura | Comprimento |
  |:-:|:-:|:-:|
  | P | 42 | 56 |
  | M | 44 | 59 |
  | G | 46 | 62 |

### 4.8 Calculador "Monte sua barra" (presente nos 4 sets + Anilhas)

- Contêiner: `<div id="simulador-anilhas" class="simulator-container">` — **shortcode/script customizado**, não é um widget padrão WooCommerce.
- Estados visíveis:
  - "Peso Total: 20 kg" (soma automática em tempo real; todos os sets iniciam em 20 kg por inclurem a barra)
  - "Espaço usado: 0mm / 45mm por lado" (limite físico da barra)
  - Alerta: "⚠️ Limite de espaço atingido! Remova algumas anilhas."
  - "Preço Total: R$ 0,00" (atualiza ao escolher pares)
- Pesos + regras de estoque/UI:

  | Peso | Preço/par | Máx pares selecionáveis |
  |---|---:|:-:|
  | 25 kg | R$ 15/par | 4 |
  | 20 kg | R$ 10/par | 4 |
  | 15 kg | R$ 10/par | 4 |
  | 10 kg | R$ 10/par | 4 |
  | 5 kg | R$ 10/par | 4 |
  | 2.5 kg | R$ 10/par | 1 |
  | 1.25 kg | R$ 10/par | 1 |

- Botão: **"Adicionar ao Carrinho"** (desabilitado até escolher ≥ 1 par)
- Mensagem quando nada selecionado: "Selecione ao menos 1 par de anilhas." (no My PR Set, "Selecione pelo menos 1 par de anilhas.")
- **My PR Set** ainda exibe um `<select>` obrigatório de exercício (os 20 exercícios listados em 4.4).
- Cores do botão (CSS inspecionado): `background: #00b016` hover `#009215` — confirmar se foi design-intentional ou custom do dev atual.

### 4.9 FAQ (bloco idêntico em todas as páginas de produto)

Preservado literalmente abaixo — as perguntas aparecem exatamente nessa ordem nas 7 páginas de produto:

1. **O que é a PR Tracker?**
   > A PR Tracker cria miniaturas de equipamentos de academia como troféus para suas conquistas.
   > Fez PR? Bateu meta? Aumentou a carga? Você pode levar o troféu para casa ou atualizar o que já possui.
   > É motivação, decoração e história — tudo em tamanho mini.

2. **Para que serve?**
   > Para marcar e celebrar aquele momento único em que seu esforço virou resultado.
   > Seu PR não é apenas um número — é dedicação, disciplina e evolução.
   > Agora ele pode ser exibido no escritório, no quarto, na sala, ou na prateleira do seu box.

3. **Vocês enviam para fora do Brasil?**
   > Sim.
   > Enviamos para o Brasil e diversos países.
   > Ao finalizar a compra, informe seu endereço e o sistema indicará se há entrega para a sua região.
   > Se não estiver disponível, significa que ainda não chegamos até lá.

4. **Preciso pagar taxas ou impostos internacionais?**
   > Para compras internacionais, taxas e impostos podem variar de acordo com as leis do país de destino.
   > Caso aplicável, a cobrança ocorre na chegada do produto.

5. **Quando meu pedido será enviado?**
   > Assim que o pagamento for confirmado, o pedido entra em produção ou separação para despacho.
   > Você receberá por e-mail a confirmação, o código de rastreamento e atualizações até a entrega.

6. **Meu pedido já deveria ter chegado. O que faço?**
   > - Ainda sem código de rastreamento? Significa que está em preparação.
   > - Já recebeu o código? Acompanhe o link enviado por e-mail.
   > - Se o prazo informado no rastreio foi ultrapassado, entre em contato com nosso suporte e verificaremos imediatamente.

7. **Meu pedido chegou danificado. O que devo fazer?**
   > Apesar de ser raro, pode acontecer.
   > 1. Tire fotos do produto e da embalagem
   > 2. Envie para nosso e-mail com o assunto: **"PEDIDO DANIFICADO – número do pedido"**
   > Nosso time responderá em até 24h com as orientações para substituição ou reembolso.

8. **Como sei quais anilhas comprar?** (aparece DUAS vezes no FAQ — bug de duplicação do conteúdo atual)
   > - Se seu pedido ainda não foi enviado, basta nos comunicar.
   > - Se já estiver em transporte, você pode recusar a entrega e o item retornará ao nosso estoque.
   > Após o recebimento de volta, processaremos o reembolso.

9. **Posso treinar com meu PR Tracker?**
   > Não.
   > Apesar da aparência realista, o PR Tracker é uma miniatura dos equipamentos de crossfit/academia e não um equipamento funcional.

10. **Como cuidar do meu PR Tracker?**
    > - Discos de plástico: evite quedas e impactos para manter o acabamento.
    > - Barra em aço inox, rack de agachamento e banco de supino: limpe com pano úmido e seque em seguida.
    > - Base acrílica: use pano de microfibra para evitar riscos.
    > - Base de Deadlift: use pano levemente umedecido com álcool.

11. **Ele vem montado?**
    > Sim. Você já gastou energia demais no seu treino e merece um descanso.
    > Seu PR Tracker chega pronto para uso — sem ferramentas e manuais de montagem.

12. **Posso presentear alguém?**
    > Sim.
    > Você pode inserir o endereço da pessoa no checkout e incluir uma mensagem especial.
    > É uma forma única de reconhecer e valorizar a conquista de alguém.

13. **Como é a embalagem?**
    > Todos os PR Trackers são enviados em uma caixa reforçada, ideal para e-commerce.
    > O interior é forrado com palha de proteção, garantindo que cada peça chegue em perfeito estado, mesmo em longas distâncias.
    > Além de proteger, a apresentação da caixa torna o produto ainda mais especial para quem recebe.

14. **Posso personalizar meu PR Tracker?**
    > Em breve.
    > Personalização com nome, box, ou PR gravado está em desenvolvimento. Acompanhe nossas atualizações.

15. **Como sei quais anilhas comprar?** (repetida, segunda ocorrência)
    > Utilize a calculadora disponível na página dos produtos para descobrir exatamente quais anilhas são necessárias para o peso desejado.

> **Bug identificado**: a pergunta "Como sei quais anilhas comprar?" aparece duplicada no acordeão — corrigir no rebuild.

---

## 5. Páginas institucionais (texto integral preservado)

### 5.1 Política de Privacidade — `/politica-de-privacidade/`

**Título:** Política de privacidade

**Quem somos**

PR Tracker (CNPJ: **59.947.215/0001-67**). Atendimento: **seg–sex, 8h às 18h**.
Contato: **(51) 98206-1914** | **contato@prtracker.com.br**

**1. Dados que coletamos**
- **Dados de identificação:** nome, CPF/CNPJ (quando necessário para faturamento), e-mail, telefone/WhatsApp.
- **Dados de entrega e faturamento:** endereço completo, CEP, informações de pagamento (processadas por intermediadores).
- **Dados de personalização do produto:** texto, nomes, datas, medidas, imagens e instruções fornecidas por você.
- **Dados técnicos e de uso do site:** IP, dispositivo, navegador, páginas visitadas, cookies e identificadores de sessão.

**2. Finalidades do tratamento**
- **Venda e entrega** dos produtos; emissão de **NF**; **suporte** e pós-venda.
- **Personalização** e produção dos itens conforme seu pedido.
- **Comunicações transacionais** (status do pedido, rastreio, cobranças) e, mediante consentimento, **comunicações promocionais**.
- **Segurança, prevenção a fraudes**, análise de uso do site e melhorias de experiência.

**3. Bases legais (LGPD)**

Tratamos dados com base em: **execução de contrato**, **cumprimento de obrigação legal** (fiscal/tributária), **legítimo interesse** (segurança, melhoria do serviço) e **consentimento** (marketing, cookies não essenciais).

**4. Compartilhamento**

Podemos compartilhar com: **meios de pagamento**, **transportadoras**, **ferramentas de e-mail/atendimento**, **hospedagem/segurança**, **contabilidade** e **produção/terceirização** quando necessário. Exigimos desses parceiros níveis adequados de segurança e confidencialidade.

**5. Cookies e tecnologias similares**
- **Essenciais:** tornam o site utilizável (login, carrinho, checkout).
- **Analíticos/Desempenho:** estatísticas de navegação (opt-out possível).
- **Marketing:** personalização de ofertas e remarketing (dependem de consentimento).

Você pode gerenciar preferências pelo banner de cookies e nas configurações do navegador.

**6. Retenção de dados**

Mantemos dados **pelo tempo necessário** ao cumprimento das finalidades e exigências legais (ex.: documentos fiscais). Dados de marketing são excluídos quando você **revoga o consentimento**. Dados de personalização podem ser anonimizados para portfólio **apenas com sua autorização**.

**7. Direitos do titular (LGPD)**

Você pode solicitar: **acesso, correção, anonimização, portabilidade, informação sobre compartilhamento**, **oposição**, **revogação de consentimento** e **exclusão** de dados quando aplicável.
Solicite pelo e-mail: **contato@prtracker.com.br**.

**8. Segurança**

Adotamos **medidas técnicas e organizacionais** (criptografia em trânsito, controles de acesso, registros de auditoria). Nenhuma medida é absoluta; em caso de incidente relevante, notificaremos conforme LGPD.

**9. Transferências internacionais**

Se ocorrerem (ex.: servidores/e-mail), seguiremos **mecanismos legais** da LGPD (cláusulas contratuais, garantias de proteção).

**10. Dados de crianças e adolescentes**

Nossos produtos não são direcionados a menores. Caso necessário, trataremos dados **com consentimento específico** do responsável.

**11. Alterações desta Política**

Atualizações podem ocorrer para refletir práticas ou exigências legais. A versão vigente estará no site com a **data de atualização**.

**Canal de contato (LGPD):** **contato@prtracker.com.br** | **(51) 98206-1914**.

### 5.2 Política de Troca e Devolução — `/politica-de-troca-e-devolucao/`

**Título:** Política de Troca e Devolução

**Contato para solicitar:** **contato@prtracker.com.br** | **(51) 98206-1914** (seg–sex, 8h às 18h)
Informe: **nº do pedido**, **motivo**, **fotos/vídeos** (quando houver defeito) e **CPF/CNPJ** do comprador.

**1. Direito de arrependimento (Código do Consumidor (CDC), art. 49)**

Para compras feitas **fora do estabelecimento** (site/WhatsApp), você pode desistir em até **7 (sete) dias corridos** contados do **recebimento**.
- **Produtos personalizados:** respeitamos o art. 49. Se a **produção já tiver iniciado**, poderemos **reter custos proporcionais comprovados** de insumos/serviços, sempre observando o **Código do Consumidor (CDC)** e a boa-fé.
- Reembolso: após retorno e conferência, em até **7 dias úteis** via Pix; **cartão** segue política da operadora (podendo refletir em até **duas faturas**). Boleto: reembolso em conta indicada.

**2. Troca por defeito ou avaria**
- **Prazo legal** para reclamar de vício em **produto durável**: **90 dias** Código do Consumidor (CDC).
- Se a embalagem chegar danificada ou o item avariado, **registre no ato** com a transportadora e nos contate em até **48 horas** com fotos.
- Após análise, faremos **conserto**, **substituição** ou **reembolso** conforme o caso. Custos de envio ficam a cargo da PR Tracker quando o defeito for confirmado.

**3. Troca por insatisfação (não defeito)**

Aceitamos pedidos em até **7 dias corridos** do recebimento, com produto **sem sinais de uso** e **embalagem/acessórios** originais.
- **Itens personalizados** (com nome, data, PR ou especificações exclusivas): em regra **não** possuem troca por insatisfação **após produzidos**, salvo vício/defeito. Podemos avaliar **ajustes pagos** caso tecnicamente viáveis.

**4. Procedimento de envio**
- Enviaremos instruções e **código de postagem** (quando aplicável).
- Acompanhe o **rastreamento**. Assim que recebido e **aprovado em conferência**, seguiremos com a solução (troca/reparo/reembolso).

**5. Prazos de processamento**
- **Análise**: até **5 dias úteis** após o recebimento na PR Tracker.
- **Reenvio** de trocas: conforme disponibilidade em estoque/produção.
- **Reembolso**: até **7 dias úteis** após aprovação (Pix/depósito) ou conforme prazos do cartão.

**6. Itens não elegíveis**
- Sinais de **uso** ou **dano intencional**.
- **Falta de acessórios** (presilhas, base) ou **embalagem** original em casos de troca por arrependimento/insatisfação.
- **Personalizações divergentes** das aprovadas pelo cliente (quando a divergência decorrer de instruções ou artes enviadas e confirmadas pelo cliente).

**7. Suporte**

Nosso time ajuda com **embalagem adequada**, **coleta/postagem** e esclarece dúvidas sobre **personalização** para evitar retrabalho.

### 5.3 Termos e Condições de Uso — `/termos-e-condicoes-de-uso/`

**Título:** Termos e Condições de Uso

**Dados da empresa**
PR Tracker — CNPJ **59.947.215/0001-67**
Atendimento: **seg–sex, 8h às 18h** | **(51) 98206-1914** | **contato@prtracker.com.br**

**1. Objeto**

Estes Termos regulam o uso do site/loja da PR Tracker e a compra de produtos (inclusive personalizados), bem como suporte, entrega e pós-venda.

**2. Conta e dados do usuário**

Você se compromete a fornecer informações **verdadeiras, completas e atualizadas**. Proteja suas credenciais. O uso do site implica aceite destes Termos e da **Política de Privacidade**.

**3. Pedidos e personalização**
- **Conferência e aprovação:** pedidos personalizados podem exigir aprovação de arte/texto. A produção inicia **após confirmação**.
- **Ajustes:** pedidos de alteração após início da produção podem implicar **custos e novos prazos**.
- **Materiais enviados:** você declara possuir direitos para usar nomes, imagens, marcas ou conteúdos encaminhados para personalização.

**4. Preços e pagamentos**
- Preços em **R$**. Podemos oferecer **Pix (com 5% OFF)**, **cartão de crédito** e **boleto**, via parceiros de pagamento.
- Pedidos estão sujeitos à **validação antifraude** e poderá haver **cancelamento** se houver inconsistências.

**5. Prazos de produção e entrega**
- Prazos exibidos no checkout consideram **produção + logística**. Eventuais **forças maiores** (greves, eventos climáticos) podem afetar o prazo — notificaremos quando aplicável.
- **Rastreamento** por e-mail/WhatsApp. Conferir **endereço** é responsabilidade do cliente.

**6. Frete, risco e recebimento**
- A entrega é realizada por **transportadoras/correios**. No recebimento, **verifique a embalagem**; se houver avaria, **registre** com a transportadora e contate-nos em **48 horas**.

**7. Troca, devolução e arrependimento**

Aplicam-se a **Política de Troca e Devolução** e o **Código do Consumidor (CDC)**. Para personalizados, observar a seção específica de **custos proporcionais** quando a produção já tiver iniciado.

**8. Propriedade intelectual**

Marcas, layouts, textos, fotos e designs são de titularidade da PR Tracker ou licenciados. É vedado copiar, reproduzir ou explorar comercialmente sem autorização.

**9. Limitação de responsabilidade**

Não nos responsabilizamos por **uso indevido**, **instalação inadequada** ou **alterações** não autorizadas. Em nenhuma hipótese responderemos por **lucros cessantes** ou **danos indiretos**, na extensão permitida pela lei.

**10. Comunicações**

Você concorda em receber comunicações **transacionais** (status do pedido, rastreio, faturas). Marketing depende de **consentimento** e pode ser **revogado** a qualquer momento.

**11. Privacidade e proteção de dados**

O tratamento de dados segue a **Política de Privacidade** e a **LGPD** (Lei 13.709/18).

**12. Alterações dos Termos**

Podemos atualizar estes Termos a qualquer tempo. A versão vigente estará no site com **data de atualização**. Pedidos em andamento respeitam as condições do momento da compra.

**13. Foro e legislação**

Aplica-se a legislação brasileira, especialmente **Código do Consumidor (CDC)** e **Lei Geral de Proteção de Dados (LGPD)**. Fica eleito o foro do **domicílio do consumidor**, nos termos do Código do Consumidor (CDC).

### 5.4 Affiliate Portal — `/affiliates/`

- **Status HTTP real**: 404 (o corpo exibe tela de login, mas a rota responde 404).
- Título: "Affiliate Portal"
- Conteúdo: formulário "Entrar" (login + senha + "Lembrar-me" + link "Esqueceu sua senha?" → `/minha-conta/lost-password/`) e formulário de cadastro com campos: Nome, Sobrenome, Nome de usuário*, E-mail*, Senha*, Código de cupom preferido*, honeypot "Dont put anything here..".
- Frase de rodapé: *"Divulgar uma marca é igual a treinar: os resultados aparecem com consistência."*
- Observações:
  - Provavelmente gerado por plugin tipo YITH Affiliates / Affiliate WP / WooCommerce Points & Rewards. Não foi possível confirmar o plugin.
  - Rebuild: plugar esse recurso **externamente** (Astro é estático). Opções: HubSpot, AffiliateWP Cloud, ou simples form via Tally/Formspree enquanto o programa não escala.

### 5.5 Loja, Carrinho, Checkout, Minha Conta

Páginas funcionais WooCommerce que dependem do backend. **Não migrar texto** — recriar de acordo com o stack escolhido (loja estática Astro + Snipcart/Mercado Pago, ou manter provedor externo).

- `/loja/` — grid simples de todos os produtos (título "Todos os produtos") com thumbnails + preços. Lista 7 cards exatamente como a home. O slider "Ver preview" é via ShopEngine.

### 5.6 Páginas institucionais que **faltam**

- **Nenhuma** página "Sobre / Quem Somos" independente. Conteúdo institucional mora apenas na âncora `/#sobre` da home (texto preservado em 3).
- **Nenhuma** página "Contato" separada — contato é tratado na seção "Parcerias / Co-brand" da home + WhatsApp no footer.
- **Não há** FAQ global; FAQ só existe replicada dentro das páginas de produto.
- **Não há** "Blog" real — só o `hello-world` padrão do WordPress.

---

## 6. Blog / conteúdo adicional

Único post: `/2025/10/20/hello-world/` — placeholder padrão do WordPress ("Welcome to WordPress. This is your first post. Edit or delete it, then start writing!"). **Descartar.**

---

## 7. Integrações e scripts de terceiros detectados

### 7.1 Analytics e rastreamento (confirmado no HTML bruto)

| Integração | ID real | Evidência |
|---|---|---|
| Google Analytics 4 / Google Tag (via Site Kit) | **`GT-WBTC67LF`** | `<script src="https://www.googletagmanager.com/gtag/js?id=GT-WBTC67LF"...>` e `gtag("config", "GT-WBTC67LF")` |
| Meta / Facebook Pixel | **`1278981700843845`** | `fbq('init', '1278981700843845', ...)` e `fbq('set', 'agent', 'woocommerce_0-10.7.0-3.6.2', '1278981700843845')` (aponta para plugin oficial "Facebook for WooCommerce") |
| Facebook Domain Verification | `xennprv42lanmxprcqr2z9bmy0npqp` | `<meta name="facebook-domain-verification" ...>` |
| Site Kit by Google | v1.177.0 | `<meta name="generator" content="Site Kit by Google ...">` |

**Não foi detectado**: GTM (GTM-xxx), TikTok Pixel, Hotjar, Microsoft Clarity, Google Ads (AW-xxx), Pinterest Tag, LinkedIn Insight, Reddit Pixel. (Nota: a tentativa inicial via extração JSON do Firecrawl alucinou vários desses — ignorar.)

### 7.2 Logística / checkout / pagamento

- **Melhor Envio – Cotação** (plugin `melhor-envio-cotacao`). Scripts carregados: `shipping-product-page.js`, `shipping-product-page-variacao.js`, `calculator.js`. Variáveis JS: `wpApiSettingsMelhorEnvio` com `nonce_configs`, `nonce_orders`, `nonce_tokens`, `nonce_users`, `company_total_express":8`, `service_total_express_standard":35`.
- **Mercado Pago**: não visível no front-end (ficar de olho no checkout autenticado; o plugin costuma só aparecer na seção "Forma de pagamento" do checkout).
- **Cloudflare** — `data-cfasync="false"` no email-decode.js (`/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js`). Site serve por trás de Cloudflare.
- **WP Rocket** (`rocket-preload-links-js`, `rocket-lazyload`, pasta `/wp-content/cache/min/1/`).
- **Really Simple SSL** (atributo `data-rsssl="1"`).

### 7.3 Lojas e UX

- **ShopEngine** + **ShopEngine Pro** — responsáveis pelo layout dos produtos (classes `shopengine-single-product-add-to-cart`, `shopengine-mini-cart`, `shopengine-quick-view-modal`, `shopengine-comparison-box`, `shopengine-wishlist`). Rest nonces expostos: `shopEngineApiSettings.rest_nonce`, `shopEngineWishlist.rest_nonce`, `shopEngineComparison.rest_nonce`, `shopEngineQuickView.rest_nonce`.
- Features ShopEngine ativas:
  - **Mini Cart** (off-canvas)
  - **Quick View**
  - **Wishlist** (posição `bottom-right`; mensagens "Seu Produto foi adicionado à wishlist" / "Seu Produto foi removido da lista de desejos")
  - **Comparison** (barra inferior "Comparar Produtos")
  - **Swatches** (atributos coloridos; usado no selector de tamanhos das camisetas)
- **Elementor 4.0.3 + Elementor Pro 3.34.1** — Popups, Sticky, Forms, Woo Menu Cart, Nav Menu.
- **Calculador custom** (`#simulador-anilhas`) — script específico do cliente/dev (não plugin comercial conhecido).

### 7.4 WhatsApp / comunicação

- **Não existe** widget flutuante de WhatsApp (não há `joinchat`, `wa-floating`, `tawk`, `jivochat`, `crisp`).
- Existe apenas o link direto `https://wa.me/5551982061914` em:
  - Footer principal
  - Popup mobile (menu)
- **Formulário de contato Elementor Pro** na home ("PARCERIAS / CO-BRAND") — provavelmente envia para o e-mail `contato@prtracker.com.br` via servidor WP (não tem integração de newsletter nem CRM visível).

### 7.5 Reviews / Social proof

- **Nenhum plugin de reviews** (Trustvox, Trustpilot, Loox, Yotpo, Reviews.io, Stamped, Google Reviews widget) detectado.
- Tabs de reviews do WooCommerce estão ocultas por CSS custom: `.woocommerce-tabs, #ship-to-different-address{display:none !important;}` e regras em `#simulador-anilhas + .woocommerce-tabs`.
- **Gap crítico para migração** — incluir infraestrutura para reviews no site novo (mesmo que só para colher, antes de exibir).

### 7.6 CDN de fontes

- Google Fonts (via CDN): **Inter** (`css2?family=Inter:wght@400;500;600;700;800&display=swap`).
- Fontes locais servidas pelo Elementor (cache `/wp-content/uploads/elementor/google-fonts/css/`): **Roboto**, **Roboto Slab**, **Inter**, **Poppins**.

---

## 8. Paleta / fontes / estilo observados

### 8.1 Fontes carregadas

- **Inter** (400, 500, 600, 700, 800) — provavelmente usada em títulos e botões.
- **Roboto / Roboto Slab / Poppins** — servidas mas possivelmente não usadas em todos os pontos. O BRIEF/MIV pede **Inter** (títulos) e **Kanit** (corpo) — Kanit **não está** carregada no site atual.
- "Area Variable" (logotipo) e "Archivo Black" (anilhas) também não estão carregadas como webfonts — possivelmente só aparecem em imagens rasterizadas do logo.

### 8.2 Cores observadas (via CSS inline)

- Botão do calculador "Adicionar ao Carrinho": `background: #00b016`, hover `#009215`, texto `#fff`. Isso é um verde diferente do lime `#D8FF2C` do MIV. **Provável inconsistência com o manual da marca** — provavelmente foi escolha do dev atual para sinalizar "ação positiva".
- Alertas/erros: `#c00` (vermelho).
- Faixa amarela do topo (barra de promoção): claramente `#FFC72C`-ish (cor do MIV 15 kg) — não confirmada por extração computacional.
- Hero e grande parte do site usa o roxo-azul escuro do MIV (`#01002A`).

### 8.3 Estrutura visual

- Tema base: **Hello Elementor** (theme mínimo), tudo desenhado via Elementor Pro.
- Sem design system declarado. Vários tamanhos, ícones Font Awesome e arquivos SVG inline.

---

## 9. Gaps e observações

### 9.1 Bugs / inconsistências que precisam decisão antes de migrar

1. **Link quebrado no menu principal** — "Power Rack" aponta para `/product/the-mini-squat-rack/` (slug antigo). O slug atual é `power-rack-set`. Planejar redirect 301 no site novo.
2. **Instagram divergente** — a seção de redes sociais da home linka `@pr_tracker` (underscore), mas o footer + CLAUDE.md dizem `@pr.tracker` (ponto). Confirmar qual é a conta ativa.
3. **FAQ com pergunta duplicada** — "Como sei quais anilhas comprar?" aparece duas vezes, com respostas diferentes (uma fala de reembolso/devolução, outra manda usar a calculadora). A primeira ocorrência provavelmente deveria ser outro título ("Posso cancelar meu pedido?" ou similar).
4. **Pagamento: "até 12x"** aparece nos blocos de benefício da home/produtos, mas o CLAUDE.md e BRIEF especificam **"até 6x sem juros"**. Escolher a versão correta e usar de forma consistente.
5. **Preço "R$ 0,00" na listagem de Anilhas** confunde o usuário (ele vê o card "Anilhas — R$ 0,00" na /loja/). Corrigir para algo como "A partir de R$ 10,00 / par".
6. **Rota /affiliates/ retorna HTTP 404** apesar de renderizar login — investigar se é proposital (página restrita ao afiliado logado) ou se há configuração errada.
7. **SKUs ausentes** em todos os produtos. Migração pode manter esse padrão, mas recomenda-se criar SKUs internos (PRT-PRS, PRT-BPS, PRT-DLS, PRT-MPS, PRT-ANS, PRT-CAM-M, PRT-CAM-F).

### 9.2 Conteúdo a **capturar do banco** (não disponível via front)

- Textos de e-mails transacionais WooCommerce (novo pedido, pedido pago, pedido enviado, etc.).
- Pedidos/customers antigos (se o site novo substituir o checkout) — exportar via CSV do WooCommerce.
- Cupons existentes (afiliados, boxes, creators).
- Configurações do Melhor Envio (serviços habilitados, tokens, regras de frete grátis).

### 9.3 Gaps de SEO e conteúdo

- **Sem `<meta description>`** em nenhuma página pública analisada.
- **Sem JSON-LD** (`Product`, `Organization`, `BreadcrumbList`, `FAQPage`). Oportunidade gigante para o rebuild.
- **Sem sitemap de imagens**, **sem hreflang** (só pt-BR), **sem alt text estruturado** (muitas imagens têm alt apenas com o nome do produto ou vazio).
- **Sem página institucional dedicada** (Sobre/Contato). Adicionar `/sobre/` e `/contato/`.
- **Sem página `/faq/` global** — só o acordeão nas páginas de produto.
- **Sem seção de social proof** / depoimentos / reviews.

### 9.4 Imagens repetidas / legadas

- `Power-Rack-base-diagonal.jpeg` existe em dois caminhos (`/2025/10/` e `/2026/02/`) — aparentemente re-upload. Consolidar em uma só versão.
- `FT-C.png` é usada tanto em Camiseta Masculina quanto Feminina como imagem de frente — confirmar se é intencional (mesmo art front) ou se falta variante feminina.
- Vários ícones `IC-1.png`, `IC-2.png`, `IC-3.png` aparecem como SVG placeholder em algumas páginas e PNG real em outras — inconsistência provavelmente causada pelo lazyload.

### 9.5 URL schema recomendada para o rebuild

Sugestão (preservar SEO existente):

| WordPress atual | Astro recomendado |
|---|---|
| `/product/power-rack-set/` | `/produto/power-rack-set/` ou manter `/product/...` |
| `/product/the-mini-squat-rack/` | 301 → `/produto/power-rack-set/` |
| `/product-category/camisetas/` | `/camisetas/` ou manter |
| `/loja/` | `/loja/` |
| `/politica-de-privacidade/` | idem |
| `/politica-de-troca-e-devolucao/` | idem |
| `/termos-e-condicoes-de-uso/` | idem |
| `/2025/10/20/hello-world/` | 410 Gone (remover) |
| `/shopengine-template/*` | 410 Gone (ou 404) |

Manter os slugs `/product/...` maximiza preservação de backlinks — decidir com o cliente.

---

## Apêndice — Texto completo do footer (literal, todas as páginas)

> Somos a **PR Tracker**, transformamos PRs em troféus personalizáveis, feitos com materiais premium, para celebrar evolução e inspirar novas metas dentro e fora do box.
>
> **CNPJ:** 59.947.215/0001-67

**Produtos**
- Power Rack Set → `/product/power-rack-set/`
- Bench Press Set → `/product/bench-press-set/`
- Deadlift Set → `/product/deadlift-set/`
- My PR Set → `/product/my-pr-set/`
- Camisetas → `/product-category/camisetas/`

**Políticas**
- Política de Privacidade
- Política de Troca e Devolução
- Termos e Condições de Uso

**Atendimento**
- Segunda à Sexta-Feira das 8 às 18h
- (51) 98206-1914 → `https://wa.me/5551982061914`
- contato@prtracker.com.br
- Instagram → `https://www.instagram.com/pr.tracker/`
- TikTok → `https://www.tiktok.com/@pr.tracker?_r=1&_t=ZS-91BM0RlKaAc`

**Créditos**

> **PR Tracker 2025** – Todos os direitos reservados. – Desenvolvido por **@MagnoDigital** (`http://classmagno.com/`)

---

*Fim do inventário.*
