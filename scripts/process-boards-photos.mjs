/**
 * One-shot: processa fotos brutas dos PR Tracker Boards + Meus RPs.
 *
 * Lê de `Imagens/_temp_boards/*.jpg` (já convertidas HEIC→JPG via ffmpeg)
 * e gera versões web-otimizadas em `public/images/products/{slug}/photo-NN.{jpg,webp,avif}`.
 *
 * Targets:
 *   max 1600px no eixo maior, JPG quality 82, WebP 80, AVIF 60.
 *
 * Run uma vez: node scripts/process-boards-photos.mjs
 */
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const SRC = path.join(ROOT, "Imagens/_temp_boards");

const MAX_DIM = 1600;

// Mapping: source filename → product slug + index
const PHOTOS = [
  { src: "2x_01.jpg", slug: "pr-tracker-board-2", index: 1 },
  { src: "3x_01.jpg", slug: "pr-tracker-board-3", index: 1 },
  { src: "3x_02.jpg", slug: "pr-tracker-board-3", index: 2 },
  { src: "3x_03.jpg", slug: "pr-tracker-board-3", index: 3 },
  { src: "3x_04.jpg", slug: "pr-tracker-board-3", index: 4 },
  { src: "3x_05.jpg", slug: "pr-tracker-board-3", index: 5 },
  { src: "Run_01.jpg", slug: "meus-rps", index: 1 },
  { src: "Run_02.jpg", slug: "meus-rps", index: 2 },
];

async function processAll() {
  for (const photo of PHOTOS) {
    const srcPath = path.join(SRC, photo.src);
    const outDir = path.join(ROOT, "public/images/products", photo.slug);
    await fs.mkdir(outDir, { recursive: true });
    const padded = String(photo.index).padStart(2, "0");
    const outBase = path.join(outDir, `photo-${padded}`);

    // Read metadata
    const img = sharp(srcPath, { failOn: "none" }).rotate(); // honor EXIF rotation
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const isLandscape = w > h;
    const longSide = Math.max(w, h);
    const shouldResize = longSide > MAX_DIM;

    let pipeline = sharp(srcPath, { failOn: "none" }).rotate();
    if (shouldResize) {
      pipeline = pipeline.resize({
        width: isLandscape ? MAX_DIM : undefined,
        height: !isLandscape ? MAX_DIM : undefined,
        fit: "inside",
      });
    }

    // JPG baseline
    await pipeline
      .clone()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(`${outBase}.jpg`);

    // WebP
    await pipeline
      .clone()
      .webp({ quality: 80 })
      .toFile(`${outBase}.webp`);

    // AVIF (smaller but slower to encode)
    await pipeline
      .clone()
      .avif({ quality: 60 })
      .toFile(`${outBase}.avif`);

    // Get final dimensions for JSON
    const finalMeta = await sharp(`${outBase}.jpg`).metadata();

    console.log(
      `✓ ${photo.slug}/photo-${padded} — ${finalMeta.width}×${finalMeta.height}` +
      ` (orig ${w}×${h})`,
    );
  }
}

processAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
