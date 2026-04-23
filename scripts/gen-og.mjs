#!/usr/bin/env node
/**
 * Generate public/og-default.png (1200×630) by compositing:
 *   1. hero-desktop.jpg (real product photo), darkened + slight blur
 *   2. vertical + horizontal gradient scrim so text is legible
 *   3. real brand logo (logo-lime.png)
 *   4. headline text rendered via SVG
 *
 * Run: npm run gen:og
 */

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const W = 1200;
const H = 630;

async function main() {
  console.log("Generating og-default.png...");

  // 1. Hero background — darkened cover fit. We shift the focal point up
  //    (position: "top") to keep the barbell in frame after the crop.
  const heroBuf = await sharp(join(PUBLIC, "images/brand/hero-desktop.jpg"))
    .resize(W, H, { fit: "cover", position: "attention" })
    .modulate({ brightness: 0.42, saturation: 0.85 })
    .blur(0.4)
    .toBuffer();

  // 2. Layered scrim — navy vignette that darkens left→right just enough
  //    for the headline to pop, plus a subtle lime glow top-right matching
  //    the hero component on-site.
  const scrimSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="leftFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#01002A" stop-opacity="0.92"/>
          <stop offset="55%" stop-color="#01002A" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#01002A" stop-opacity="0.2"/>
        </linearGradient>
        <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stop-color="#01002A" stop-opacity="0"/>
          <stop offset="100%" stop-color="#01002A" stop-opacity="0.85"/>
        </linearGradient>
        <radialGradient id="limeGlow" cx="0.85" cy="0.2" r="0.5">
          <stop offset="0%" stop-color="#D8FF2C" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#D8FF2C" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#leftFade)"/>
      <rect width="${W}" height="${H}" fill="url(#bottomFade)"/>
      <rect width="${W}" height="${H}" fill="url(#limeGlow)"/>
    </svg>
  `);

  // 3. Brand logo — resize the real logo-lime.png to ~80px tall, then
  //    crop to the icon+wordmark bounds so we don't get transparent halo.
  const logoBuf = await sharp(join(PUBLIC, "images/brand/logo-lime.png"))
    .resize({ height: 84, fit: "inside" })
    .toBuffer();

  // 4. Headline + tagline + domain text, rendered as SVG. Uses Impact-style
  //    condensed fallback since Sharp/librsvg don't load our custom
  //    Big Shoulders web font — the fallback keeps the same vibe.
  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <text x="80" y="330" fill="#FFFFFF"
        font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
        font-weight="900" font-size="104" letter-spacing="-2"
        style="text-shadow: 0 2px 20px rgba(0,0,0,0.5);">
        SEU PR MERECE MAIS
      </text>
      <text x="80" y="440" fill="#D8FF2C"
        font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
        font-weight="900" font-size="104" letter-spacing="-2">
        DO QUE UMA FOTO.
      </text>

      <text x="80" y="510" fill="#FFFFFF"
        font-family="'Outfit', system-ui, sans-serif" font-weight="500"
        font-size="28" opacity="0.88">
        Miniaturas-troféu premium para CrossFit, powerlifting e halterofilismo.
      </text>

      <text x="80" y="585" fill="#D8FF2C"
        font-family="Impact, 'Arial Narrow', sans-serif"
        font-weight="800" font-size="24" letter-spacing="2">
        PRTRACKER.COM.BR
      </text>
    </svg>
  `);

  // Final composite — order matters: bg → scrim → logo → text.
  await sharp(heroBuf)
    .composite([
      { input: scrimSvg, blend: "over" },
      { input: logoBuf, top: 68, left: 80 },
      { input: textSvg, blend: "over" },
    ])
    .png({ quality: 92, compressionLevel: 9 })
    .toFile(join(PUBLIC, "og-default.png"));

  console.log("  ✓ public/og-default.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
