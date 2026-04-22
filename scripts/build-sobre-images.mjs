/**
 * Copy + compress the hand-picked product/lifestyle shots used by the
 * /sobre page into public/images/sobre/. The source files live in /Imagens
 * and are several MB each; we emit ~200-400 KB JPEGs at a retina-friendly
 * max width.
 *
 * Run: node scripts/build-sobre-images.mjs
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const OUT_DIR = path.join(ROOT, "public/images/sobre");
await fs.mkdir(OUT_DIR, { recursive: true });

const jobs = [
  // Hero right-hand image: a clean horizontal product shot.
  {
    src: "Imagens/Imagem CL/produto_chinalink_horizontal_dsc00423.jpg",
    dst: "hero.jpg",
    width: 1800,
    quality: 82,
  },
  // "Como é feito" — detail close-up.
  {
    src: "Imagens/Imagem CL/produto_chinalink_horizontal_dsc00418.jpg",
    dst: "detalhe.jpg",
    width: 1600,
    quality: 82,
  },
  // "Para quem é" — wide lifestyle band.
  {
    src: "Imagens/Imagem CL/produto_chinalink_horizontal_2dsc00361.jpg",
    dst: "lifestyle.jpg",
    width: 2000,
    quality: 82,
  },
  // CTA / closing banner — reuse the hero-desktop moody shot for brand coherence.
  {
    src: "public/images/brand/hero-desktop.png",
    dst: "cta-banner.jpg",
    width: 2000,
    quality: 80,
  },
];

for (const job of jobs) {
  const srcPath = path.join(ROOT, job.src);
  const dstPath = path.join(OUT_DIR, job.dst);
  await sharp(srcPath)
    .resize(job.width, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: job.quality, progressive: true, mozjpeg: true })
    .toFile(dstPath);
  const meta = await sharp(dstPath).metadata();
  const stat = await fs.stat(dstPath);
  console.log(
    `  ${job.dst.padEnd(18)} ${String(meta.width).padStart(4)}×${String(meta.height).padEnd(4)}  ${(stat.size / 1024).toFixed(0)} KB`,
  );
}

console.log(`\nWrote ${jobs.length} files to ${OUT_DIR}`);
