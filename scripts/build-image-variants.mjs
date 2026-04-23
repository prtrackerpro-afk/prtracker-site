/**
 * Generate WebP + AVIF variants for all hero images, plus a JPG baseline
 * for the desktop hero (currently shipped as a 544KB PNG for photographic
 * content — the wrong format for the job).
 *
 * Preserves existing JPG/PNG files as <picture> fallbacks; the browser
 * picks the first format it supports in the <source> chain.
 *
 * Run: node scripts/build-image-variants.mjs
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

/**
 * Targets:
 *   - For PNG photographic sources: emit .jpg as the universal fallback
 *     (PNG is ~5× bigger for photos).
 *   - For every JPG/PNG hero: emit .webp (quality 82) + .avif (quality 60
 *     which produces a smaller file than WebP while preserving quality
 *     thanks to AVIF's superior compression).
 */
const sources = [
  // Home hero — desktop (currently 544KB PNG, needs JPG baseline)
  {
    src: "public/images/brand/hero-desktop.png",
    outBase: "public/images/brand/hero-desktop",
    emitJpg: true,
    jpgQuality: 84,
  },
  // Home hero — mobile (already JPG, just add webp/avif)
  {
    src: "public/images/brand/hero-mobile.jpg",
    outBase: "public/images/brand/hero-mobile",
  },
  // 4 product hero shots
  {
    src: "public/images/products/power-rack-set/hero.jpg",
    outBase: "public/images/products/power-rack-set/hero",
  },
  {
    src: "public/images/products/bench-press-set/hero.jpg",
    outBase: "public/images/products/bench-press-set/hero",
  },
  {
    src: "public/images/products/deadlift-set/hero.jpg",
    outBase: "public/images/products/deadlift-set/hero",
  },
  {
    src: "public/images/products/my-pr-set/hero.jpg",
    outBase: "public/images/products/my-pr-set/hero",
  },
  // Camisetas (PNG sources — emit JPG fallback + modern variants)
  {
    src: "public/images/products/camiseta-masculina/FT-C.png",
    outBase: "public/images/products/camiseta-masculina/FT-C",
    emitJpg: true,
    jpgQuality: 84,
  },
  {
    src: "public/images/products/camiseta-feminina-baby-look/FT-C.png",
    outBase: "public/images/products/camiseta-feminina-baby-look/FT-C",
    emitJpg: true,
    jpgQuality: 84,
  },
];

async function sizeOf(p) {
  const s = await fs.stat(p).catch(() => null);
  return s ? (s.size / 1024).toFixed(0) + "KB" : "n/a";
}

for (const job of sources) {
  const srcPath = path.join(ROOT, job.src);
  const outBase = path.join(ROOT, job.outBase);

  const pipeline = sharp(srcPath);
  const meta = await pipeline.metadata();
  const label = path.relative(ROOT, srcPath).replace(/\\/g, "/");

  // JPG baseline (only when asked — otherwise assume original is already JPG)
  if (job.emitJpg) {
    await sharp(srcPath)
      .jpeg({
        quality: job.jpgQuality ?? 82,
        progressive: true,
        mozjpeg: true,
      })
      .toFile(outBase + ".jpg");
  }

  // WebP — lossy at quality 82. "effort: 6" = slowest encode, smallest file.
  await sharp(srcPath)
    .webp({ quality: 82, effort: 6 })
    .toFile(outBase + ".webp");

  // AVIF — quality 60 is visually lossless for photos and ~30% smaller
  // than WebP at the same perceived quality. "effort: 6" for speed/size
  // balance (9 is slowest, 6 is a good tradeoff).
  await sharp(srcPath)
    .avif({ quality: 60, effort: 6 })
    .toFile(outBase + ".avif");

  const origSize = await sizeOf(srcPath);
  const jpgSize = job.emitJpg ? await sizeOf(outBase + ".jpg") : "—";
  const webpSize = await sizeOf(outBase + ".webp");
  const avifSize = await sizeOf(outBase + ".avif");

  console.log(
    `  ${label.padEnd(55)} ${meta.width}×${meta.height}  orig=${origSize}  jpg=${jpgSize}  webp=${webpSize}  avif=${avifSize}`,
  );
}

console.log(`\nDone.`);
