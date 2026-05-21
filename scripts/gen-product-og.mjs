#!/usr/bin/env node
/**
 * Generate product-specific OG images (1200×630) for the 3 new products
 * (Meus RPs, PR Tracker Board 2, Board 3). Each composite has:
 *   1. Product photo (right side, cover fit, navy-tinted)
 *   2. Navy gradient scrim on the left (text legibility)
 *   3. Lime accent strip on the bottom
 *   4. Product title + price + PR Tracker logo
 *
 * Output: public/images/og/{slug}.jpg
 *
 * Run: node scripts/gen-product-og.mjs
 */

import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const CONTENT = join(__dirname, "..", "src", "content", "products");
const OG_DIR = join(PUBLIC, "images", "og");

const W = 1200;
const H = 630;

const PRODUCTS = [
  {
    slug: "meus-rps",
    photo: "images/products/meus-rps/photo-01.jpg",
    line: "PR Runners",
  },
  {
    slug: "pr-tracker-board-2",
    photo: "images/products/pr-tracker-board-2/photo-01.jpg",
    line: "PR Trackers",
  },
  {
    slug: "pr-tracker-board-3",
    photo: "images/products/pr-tracker-board-3/photo-01.jpg",
    line: "PR Trackers",
  },
];

function priceFmt(priceCents) {
  const reais = (priceCents / 100).toFixed(2).replace(".", ",");
  return `R$ ${reais}`;
}

async function loadProductMeta(slug) {
  const raw = await readFile(join(CONTENT, `${slug}.json`), "utf-8");
  return JSON.parse(raw);
}

async function genForProduct(product) {
  const meta = await loadProductMeta(product.slug);
  const title = meta.title.toUpperCase();
  const tagline = meta.tagline ?? "";
  const price = priceFmt(meta.priceBase);
  const priceFrom = meta.priceFrom ? "A PARTIR DE " : "";

  // 1. Product photo on the RIGHT half (600×630), cropped from portrait.
  //    "attention" focal point keeps the placa centered.
  const photoBuf = await sharp(join(PUBLIC, product.photo))
    .resize(600, 630, { fit: "cover", position: "attention" })
    .modulate({ brightness: 0.88, saturation: 1.05 })
    .toBuffer();

  // 2. LEFT half: navy with subtle lime glow top-left + diagonal accent
  const leftPanelSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="${H}">
      <defs>
        <radialGradient id="lime" cx="0" cy="0" r="0.9">
          <stop offset="0%" stop-color="#D8FF2C" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="#D8FF2C" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="navyFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="80%" stop-color="#01002A" stop-opacity="1"/>
          <stop offset="100%" stop-color="#01002A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="600" height="${H}" fill="#01002A"/>
      <rect width="600" height="${H}" fill="url(#lime)"/>
      <rect width="600" height="${H}" fill="url(#navyFade)"/>
    </svg>
  `);

  // 3. Edge bleed from left panel into photo (gradient to navy on left edge of photo)
  const photoBlendSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="${H}">
      <defs>
        <linearGradient id="bleed" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#01002A" stop-opacity="0.85"/>
          <stop offset="20%" stop-color="#01002A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="600" height="${H}" fill="url(#bleed)"/>
    </svg>
  `);

  // 4. Bottom lime strip across the whole image
  const bottomStripSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#D8FF2C"/>
    </svg>
  `);

  // 5. Brand logo (lime PNG, ~64px tall)
  const logoBuf = await sharp(join(PUBLIC, "images/brand/logo-lime.png"))
    .resize({ height: 64, fit: "inside" })
    .toBuffer();

  // 6. Text content (left half)
  // Position text on the left half. Layout:
  //   - top: logo (64px, at y=60)
  //   - kicker (linha "PR Trackers" / "PR Runners"): y=170
  //   - title: y=240-360 (big, bold)
  //   - tagline: y=420
  //   - price: bottom-left, lime, y=570
  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <!-- Kicker: linha do produto -->
      <text x="64" y="180" fill="#D8FF2C"
        font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
        font-weight="900" font-size="22" letter-spacing="4">
        ${product.line.toUpperCase()}
      </text>

      <!-- Title em 2 linhas se for muito longo -->
      ${
        title.length > 18
          ? `<text x="64" y="262" fill="#FFFFFF"
              font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
              font-weight="900" font-size="64" letter-spacing="-1">
              ${title.split(" — ")[0] ?? title}
            </text>
            <text x="64" y="332" fill="#FFFFFF"
              font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
              font-weight="900" font-size="64" letter-spacing="-1">
              ${title.split(" — ")[1] ?? ""}
            </text>`
          : `<text x="64" y="300" fill="#FFFFFF"
              font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
              font-weight="900" font-size="84" letter-spacing="-2">
              ${title}
            </text>`
      }

      <!-- Tagline -->
      <text x="64" y="430" fill="#FFFFFF"
        font-family="'Outfit', system-ui, sans-serif" font-weight="400"
        font-size="24" opacity="0.85">
        ${tagline}
      </text>

      <!-- Price (bottom-left, lime) -->
      <text x="64" y="555" fill="#D8FF2C"
        font-family="Impact, 'Arial Narrow', sans-serif"
        font-weight="800" font-size="16" letter-spacing="3" opacity="0.7">
        ${priceFrom}
      </text>
      <text x="64" y="595" fill="#D8FF2C"
        font-family="Impact, 'Arial Narrow', 'Big Shoulders', sans-serif"
        font-weight="900" font-size="44" letter-spacing="-1">
        ${price}
      </text>

      <!-- Domain (bottom-right) -->
      <text x="${W - 40}" y="595" fill="#FFFFFF" text-anchor="end"
        font-family="Impact, 'Arial Narrow', sans-serif"
        font-weight="800" font-size="20" letter-spacing="2" opacity="0.7">
        PRTRACKER.COM.BR
      </text>
    </svg>
  `);

  // 7. Final composite. Order:
  //    bg (left panel) → photo on right → photo bleed → bottom strip → logo → text
  const baseLeft = await sharp(leftPanelSvg).toBuffer();
  const baseRight = await sharp(photoBuf)
    .composite([{ input: photoBlendSvg, blend: "over" }])
    .toBuffer();

  // Compose the 1200×630 canvas: left 600 + right 600
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 1, g: 0, b: 42, alpha: 1 } },
  })
    .composite([
      { input: baseLeft, top: 0, left: 0 },
      { input: baseRight, top: 0, left: 600 },
      { input: bottomStripSvg, blend: "over" },
      { input: logoBuf, top: 60, left: 64 },
      { input: textSvg, blend: "over" },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(OG_DIR, `${product.slug}.jpg`));

  console.log(`  ✓ ${product.slug}.jpg`);
}

async function main() {
  await mkdir(OG_DIR, { recursive: true });
  console.log(`Generating product OG images (${W}×${H})...`);
  for (const p of PRODUCTS) {
    await genForProduct(p);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
