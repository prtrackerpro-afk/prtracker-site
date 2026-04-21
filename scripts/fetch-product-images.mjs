#!/usr/bin/env node
/**
 * Download all product images from the current WordPress site
 * to public/images/products/[slug]/ folders.
 *
 * Usage: node scripts/fetch-product-images.mjs
 *        (or `npm run fetch:images` if wired in package.json)
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "images", "products");

/** @type {Record<string, string[]>} */
const PRODUCT_IMAGES = {
  "power-rack-set": [
    "https://prtracker.com.br/wp-content/uploads/2025/10/Power-Rack-base-diagonal.jpeg",
    "https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-diagonal.jpeg",
    "https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-frontal-ampliada.jpeg",
    "https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-mao.jpeg",
    "https://prtracker.com.br/wp-content/uploads/2026/02/Power-Rack-base-lateral.jpeg",
  ],
  "bench-press-set": [
    "https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press2.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Bench-Press3.png",
  ],
  "deadlift-set": [
    "https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift-2.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Deadlift-3.png",
  ],
  "my-pr-set": [
    "https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET2.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/MY-PR-SET3.png",
    "https://prtracker.com.br/wp-content/uploads/2025/10/MY-PR-SET4.png",
  ],
  anilhas: [
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0007_todas-anilhas.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0000_125.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0001_25.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0002_5.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0003_10-.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0004_15-.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0005_20.png",
    "https://prtracker.com.br/wp-content/uploads/2026/01/Anilhas_0006_25.png",
  ],
  "camiseta-masculina": [
    "https://prtracker.com.br/wp-content/uploads/2025/10/FT-C.png",
    "https://prtracker.com.br/wp-content/uploads/2025/10/FT2-C-M-600x600.png",
  ],
  "camiseta-feminina-baby-look": [
    "https://prtracker.com.br/wp-content/uploads/2025/10/FT-C.png",
    "https://prtracker.com.br/wp-content/uploads/2025/10/FT2-C-F.png",
  ],
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.byteLength;
}

async function main() {
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const [slug, urls] of Object.entries(PRODUCT_IMAGES)) {
    const dir = join(OUT_DIR, slug);
    await mkdir(dir, { recursive: true });

    for (const url of urls) {
      const filename = url.split("/").pop();
      if (!filename) continue;
      const dest = join(dir, filename);

      if (await exists(dest)) {
        console.log(`  · ${slug}/${filename} (skip — exists)`);
        skip++;
        continue;
      }

      try {
        const bytes = await download(url, dest);
        console.log(`  ✓ ${slug}/${filename} (${Math.round(bytes / 1024)} KB)`);
        ok++;
      } catch (err) {
        console.error(`  ✗ ${slug}/${filename} — ${err.message}`);
        fail++;
      }
    }
  }

  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
