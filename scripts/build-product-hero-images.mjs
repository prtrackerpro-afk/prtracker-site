/**
 * Process the lifestyle shots from /Imagens into optimized hero images
 * used as the primary product image on /product/[slug] and on the home.
 *
 * Originals are ~5MB JPEGs from a DSC camera. We emit ~250-400KB
 * progressive JPEGs at a retina-friendly width, inside each product's
 * /public/images/products/{slug}/ folder.
 *
 * Run: node scripts/build-product-hero-images.mjs
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

const jobs = [
  {
    slug: "power-rack-set",
    src: "Imagens/2. produto_chinalink_horizontal_dsc00369.jpg",
  },
  {
    slug: "bench-press-set",
    src: "Imagens/2. produto_chinalink_horizontal_dsc00374.jpg",
  },
  {
    slug: "deadlift-set",
    src: "Imagens/2. produto_chinalink_horizontal_dsc00378.jpg",
  },
  {
    slug: "my-pr-set",
    src: "Imagens/2. produto_chinalink_horizontal_dsc00383.jpg",
  },
];

for (const job of jobs) {
  const srcPath = path.join(ROOT, job.src);
  const outDir = path.join(ROOT, "public/images/products", job.slug);
  await fs.mkdir(outDir, { recursive: true });
  const dstPath = path.join(outDir, "hero.jpg");

  await sharp(srcPath)
    .resize(1800, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(dstPath);

  const meta = await sharp(dstPath).metadata();
  const stat = await fs.stat(dstPath);
  console.log(
    `  ${job.slug.padEnd(20)} ${String(meta.width).padStart(4)}×${String(meta.height).padEnd(4)}  ${(stat.size / 1024).toFixed(0)} KB`,
  );
}

console.log(`\nWrote ${jobs.length} hero images.`);
