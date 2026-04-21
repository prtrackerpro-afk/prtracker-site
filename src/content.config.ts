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

export const categoryEnum = z.enum(["pr-trackers", "anilhas", "camisetas"]);

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
    configurator: z
      .object({
        enabled: z.boolean().default(false),
        isAnilhasOnly: z.boolean().default(false),
        hasExerciseSelector: z.boolean().default(false),
      })
      .default({ enabled: false, isAnilhasOnly: false, hasExerciseSelector: false }),
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
