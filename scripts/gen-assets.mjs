#!/usr/bin/env node
/**
 * Generate PNG assets from SVG / PNG sources:
 *  - public/favicon-32.png              (from favicon.svg)
 *  - public/apple-touch-icon.png        (from favicon.svg, 180x180)
 *  - public/og-default.png              (from og-default.svg, 1200x630)
 *
 * Admin PWA icons (composited from public/images/brand/logo-lime.png — symbol
 * portion only — over dark navy bg #01002A):
 *  - public/admin/icon-192.png          (PWA, 192x192, padding 10%)
 *  - public/admin/icon-512.png          (PWA, 512x512, padding 10%)
 *  - public/admin/icon-maskable-512.png (PWA maskable, 512x512, padding 18%)
 *  - public/admin/apple-touch-icon.png  (iOS home-screen, 180x180, padding 10%)
 *
 * Run: npm run gen:assets
 */

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");

const ADMIN_BG = { r: 0x01, g: 0x00, b: 0x2a, alpha: 1 };

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

// Cached trimmed symbol (left portion of logo-lime.png with whitespace removed).
let cachedSymbol = null;
async function getAdminSymbol() {
  if (cachedSymbol) return cachedSymbol;
  // logo-lime.png is 2048x575 — symbol on the left, "PR TRACKER" wordmark on the right.
  // Extract a generous left band, then trim transparent pixels to isolate the symbol.
  const trimmed = await sharp(join(PUBLIC, "images/brand/logo-lime.png"))
    .extract({ left: 0, top: 0, width: 900, height: 575 })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  cachedSymbol = trimmed;
  return trimmed;
}

async function adminIconPng(outPath, size, paddingPct) {
  const symbol = await getAdminSymbol();
  const inner = Math.round(size * (1 - 2 * paddingPct));
  // Resize symbol to fit inside `inner` box preserving aspect ratio (transparent fill).
  const symbolResized = await sharp(symbol.data)
    .resize({
      width: inner,
      height: inner,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: ADMIN_BG },
  })
    .composite([{ input: symbolResized, gravity: "center" }])
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
  await adminIconPng(join(ADMIN, "icon-192.png"), 192, 0.10);
  await adminIconPng(join(ADMIN, "icon-512.png"), 512, 0.10);
  await adminIconPng(join(ADMIN, "apple-touch-icon.png"), 180, 0.10);
  await adminIconPng(join(ADMIN, "icon-maskable-512.png"), 512, 0.18);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
