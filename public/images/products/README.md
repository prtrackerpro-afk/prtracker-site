# Imagens dos produtos

Estrutura: `public/images/products/[slug]/[filename]`.

Os JSON dos produtos em `src/content/products/` apontam para paths relativos (ex: `/images/products/power-rack-set/Power-Rack-base-diagonal.jpeg`).

## Como adicionar/atualizar imagens

### Opção A — baixar do site atual (mais rápido)

Execute `npm run fetch:images` (definido em `package.json`) — script baixa todas as URLs listadas em `scripts/fetch-product-images.mjs` para as pastas corretas.

### Opção B — copiar da pasta `Imagens/` (caso já tenha)

Execute `npm run sync:images` — script procura arquivos em `Imagens/` pelo nome e copia para as pastas corretas.

### Opção C — manualmente

Coloque os arquivos listados abaixo em suas respectivas pastas.

## URLs originais (referência)

Imagens estão hospedadas no WordPress atual em `https://prtracker.com.br/wp-content/uploads/...`. Mapeamento completo em cada produto:

- `power-rack-set/` — 5 imagens (Power-Rack-base-*)
- `bench-press-set/` — 3 imagens (Bench-Press*.png)
- `deadlift-set/` — 3 imagens (Deadlift*.png)
- `my-pr-set/` — 4 imagens (MY-PR-SET*.png)
- `anilhas/` — 8 imagens (Anilhas_00**.png)
- `camiseta-masculina/` — 2 imagens (FT*C*.png)
- `camiseta-feminina-baby-look/` — 2 imagens (FT*F*.png)

Veja `scripts/fetch-product-images.mjs` para a lista completa com URLs.
