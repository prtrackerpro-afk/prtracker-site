#!/usr/bin/env node
/**
 * Generate PNG assets from SVG sources:
 *  - public/favicon-32.png            (from favicon.svg)
 *  - public/apple-touch-icon.png      (from favicon.svg, 180x180)
 *  - public/og-default.png            (from og-default.svg, 1200x630)
 *  - public/admin/icon-192.png        (PWA admin, from admin/icon.svg)
 *  - public/admin/icon-512.png        (PWA admin, from admin/icon.svg)
 *  - public/admin/icon-maskable-512.png (PWA admin maskable, from admin/icon-maskable.svg)
 *  - public/admin/apple-touch-icon.png  (iOS home-screen, 180x180, from admin/icon.svg)
 *
 * Run: npm run gen:assets
 */

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

async function svgToPng(svgPath, outPath, size) {
  const svg = await readFile(svgPath);
  const query = Array.isArray(size)
    ? { width: size[0], height: size[1], fit: "contain" }
    : { width: size, height: size };
  await sharp(svg, { density: 300 })
    .resize(query)
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ✓ ${outPath}`);
}

async function main() {
  console.log("Generating assets...");
  await svgToPng(join(PUBLIC, "favicon.svg"), join(PUBLIC, "favicon-32.png"), 32);
  await svgToPng(join(PUBLIC, "favicon.svg"), join(PUBLIC, "apple-touch-icon.png"), 180);
  await svgToPng(join(PUBLIC, "og-default.svg"), join(PUBLIC, "og-default.png"), [1200, 630]);

  const ADMIN = join(PUBLIC, "admin");
  await svgToPng(join(ADMIN, "icon.svg"), join(ADMIN, "icon-192.png"), 192);
  await svgToPng(join(ADMIN, "icon.svg"), join(ADMIN, "icon-512.png"), 512);
  await svgToPng(join(ADMIN, "icon.svg"), join(ADMIN, "apple-touch-icon.png"), 180);
  await svgToPng(join(ADMIN, "icon-maskable.svg"), join(ADMIN, "icon-maskable-512.png"), 512);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
