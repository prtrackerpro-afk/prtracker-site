#!/usr/bin/env node
/**
 * Sync images from local `Imagens/` folder (user's staging area) into
 * public/images/products/[slug]/.
 *
 * Matches by filename. If a file named `Power-Rack-base-diagonal.jpeg`
 * exists anywhere inside `Imagens/` (recursively), it gets copied to
 * `public/images/products/power-rack-set/Power-Rack-base-diagonal.jpeg`.
 *
 * Usage: node scripts/sync-images-from-folder.mjs
 */

import { mkdir, copyFile, readdir, stat, access } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_DIR = join(ROOT, "Imagens");
const OUT_DIR = join(ROOT, "public", "images", "products");

/** Filename → product slug. From the scraped WP uploads. */
const FILE_TO_SLUG = {
  // Power Rack
  "Power-Rack-base-diagonal.jpeg": "power-rack-set",
  "Power-Rack-base-frontal-ampliada.jpeg": "power-rack-set",
  "Power-Rack-base-mao.jpeg": "power-rack-set",
  "Power-Rack-base-lateral.jpeg": "power-rack-set",
  // Bench
  "Bench-Press.png": "bench-press-set",
  "Bench-Press2.png": "bench-press-set",
  "Bench-Press3.png": "bench-press-set",
  // Deadlift
  "Deadlift.png": "deadlift-set",
  "Deadlift-2.png": "deadlift-set",
  "Deadlift-3.png": "deadlift-set",
  // My PR Set
  "MY-PR-SET.png": "my-pr-set",
  "MY-PR-SET2.png": "my-pr-set",
  "MY-PR-SET3.png": "my-pr-set",
  "MY-PR-SET4.png": "my-pr-set",
  // Anilhas
  "Anilhas_0007_todas-anilhas.png": "anilhas",
  "Anilhas_0000_125.png": "anilhas",
  "Anilhas_0001_25.png": "anilhas",
  "Anilhas_0002_5.png": "anilhas",
  "Anilhas_0003_10-.png": "anilhas",
  "Anilhas_0004_15-.png": "anilhas",
  "Anilhas_0005_20.png": "anilhas",
  "Anilhas_0006_25.png": "anilhas",
  // Camisetas
  "FT-C.png": "camiseta-masculina",
  "FT2-C-M-600x600.png": "camiseta-masculina",
  "FT2-C-M.png": "camiseta-masculina",
  "FT2-C-F.png": "camiseta-feminina-baby-look",
  "FT2-C-F-600x600.png": "camiseta-feminina-baby-look",
};

async function walk(dir) {
  /** @type {string[]} */
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(full)));
      else files.push(full);
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return files;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC_DIR))) {
    console.error(`Source folder not found: ${SRC_DIR}`);
    console.error("Create the Imagens/ folder in the project root and drop the images there.");
    process.exit(1);
  }

  const all = await walk(SRC_DIR);
  console.log(`Scanning ${all.length} files in Imagens/...`);

  let copied = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const src of all) {
    const name = basename(src);
    const slug = FILE_TO_SLUG[name];
    if (!slug) {
      unmatched++;
      continue;
    }

    const destDir = join(OUT_DIR, slug);
    await mkdir(destDir, { recursive: true });
    const dest = join(destDir, name);

    if (await exists(dest)) {
      const srcStat = await stat(src);
      const destStat = await stat(dest);
      if (srcStat.size === destStat.size) {
        console.log(`  · ${slug}/${name} (skip — identical size)`);
        skipped++;
        continue;
      }
    }

    await copyFile(src, dest);
    console.log(`  ✓ ${slug}/${name}`);
    copied++;
  }

  console.log(
    `\nDone: ${copied} copied, ${skipped} skipped, ${unmatched} unmatched.`,
  );
  if (unmatched > 0) {
    console.log(
      "Files with names not in the mapping were left alone. Add them to FILE_TO_SLUG in this script if needed.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
