import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Product catalog.
 *
 * One JSON per product in `src/content/products/`.
 * Prices are stored in cents (integer) to avoid floating-point rounding.
 */

const priceInCents = z.number().int().nonnegative();

const imageSchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const specSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const faqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

/**
 * Per-unit shipping dimensions. Melhor Envio requires all four values on
 * every product line of a quote. Anilhas avulsas store per-pair values;
 * the frete endpoint multiplies by `pairs` at quote time.
 */
const shippingSchema = z.object({
  weight_g: z.number().int().positive(),
  length_cm: z.number().positive(),
  width_cm: z.number().positive(),
  height_cm: z.number().positive(),
  insurance_value_cents: z.number().int().nonnegative().optional(),
});

export const categoryEnum = z.enum([
  "pr-trackers",
  "pr-runners",
  "anilhas",
  "camisetas",
  "gift-cards",
]);

const products = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/products" }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    tagline: z.string().optional(),
    category: categoryEnum,
    priceBase: priceInCents,
    priceFrom: z.boolean().default(false),
    shortDescription: z.string(),
    longDescriptionHtml: z.string(),
    images: z.array(imageSchema).min(1),
    specs: z.array(specSchema).default([]),
    faq: z.array(faqSchema).default([]),
    sizes: z.array(z.string()).default([]),
    shipping: shippingSchema,
    configurator: z
      .object({
        enabled: z.boolean().default(false),
        isAnilhasOnly: z.boolean().default(false),
        hasExerciseSelector: z.boolean().default(false),
        /**
         * "tripleBarbell": três barras independentes lado-a-lado
         * (Supino, Agachamento, Levantamento Terra). Exclusivo do
         * My PR Gym — renderiza o `TripleBarbellConfigurator`.
         */
        isTripleBarbell: z.boolean().default(false),
        /**
         * "Meus RPs" (PR Runners): 4 inputs de tempo (5/10/21/42 km)
         * com preview SVG ao vivo. Sem barra, sem anilhas.
         */
        isMeusRPs: z.boolean().default(false),
        /**
         * "Plaquinha Meus RPs" (PR Runners): venda de plaquinhas avulsas
         * pra atualizar tempos no Meus RPs original. Lista dinâmica de
         * até 4 itens (distância + tempo). Preço linear: priceBase × qtd.
         * Duplicatas permitidas (mesma distância mais de uma vez).
         */
        isMeusRPsPlaquinha: z.boolean().default(false),
        /**
         * "PR Tracker Board" — placa colorida com N exercícios
         * configuráveis (cor + lista de exercícios + N barras de
         * anilhas independentes). `boardExerciseCount` define N
         * (2 ou 3). Defaults vêm de `boardDefaultExercises` (lista
         * de `value`s da BOARD_EXERCISES, ordem top→bottom).
         */
        isBoard: z.boolean().default(false),
        boardExerciseCount: z.number().int().min(2).max(3).optional(),
        boardDefaultExercises: z.array(z.string()).optional(),
        /**
         * Restringe o dropdown de cada slot a um subconjunto de exercícios
         * (lista de `value`s da BOARD_EXERCISES, ordem top→bottom). Útil
         * pro Board 2 do LPO, onde o slot 1 só faz sentido como
         * Arranco/Snatch e o slot 2 como Arremesso/Clean & Jerk.
         */
        boardExerciseChoices: z.array(z.array(z.string())).optional(),
        /**
         * Fixa os exercícios — remove o dropdown e exibe os labels como
         * texto estático. Usado no Board 3 (Supino/Agachamento/Terra).
         */
        boardExercisesFixed: z.boolean().default(false),
        /**
         * Vale-presente digital. Renderiza o `GiftCardConfigurator` com
         * seletor de denominação fixa + campos opcionais do presenteado.
         * Combinar com `digital: true` no produto pra dispensar frete.
         */
        isGiftCard: z.boolean().default(false),
        /**
         * Denominações fixas do vale-presente em centavos. Validadas
         * server-side em `pricing.ts`.
         */
        giftCardDenominationsCents: z.array(z.number().int().positive()).optional(),
      })
      .default({
        enabled: false,
        isAnilhasOnly: false,
        hasExerciseSelector: false,
        isTripleBarbell: false,
        isMeusRPs: false,
        isMeusRPsPlaquinha: false,
        isBoard: false,
        isGiftCard: false,
      }),
    /**
     * Produto digital — sem frete, sem etiqueta Melhor Envio. Entregue
     * por e-mail (vale-presente, no caso). `shipping.weight_g` ainda é
     * obrigatório no schema mas é ignorado quando `digital: true`.
     */
    digital: z.boolean().default(false),
    /**
     * Marca o produto como "EM BREVE". O `[slug].astro` substitui o
     * botão de Adicionar ao carrinho por um formulário Notify-me.
     */
    comingSoon: z.boolean().default(false),
    featured: z.boolean().default(false),
    priority: z.number().int().default(100),
    seo: z
      .object({
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
      })
      .default({}),
  }),
});

export const collections = { products };
