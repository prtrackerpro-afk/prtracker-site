/**
 * Convert the self-hosted TTF font files to WOFF2.
 *
 * Big Shoulders + Outfit + JetBrains Mono weigh ~530KB as TTF and ~180KB
 * as WOFF2 — a 65% savings transferred across every first visit. Same
 * glyphs, same rendering. We keep the TTF files around as a graceful
 * fallback (`src: url(…woff2) format("woff2"), url(…ttf) format("truetype")`)
 * so any ancient browser still works.
 *
 * Run: node scripts/convert-fonts.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import wawoff from "wawoff2";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const FONT_DIR = path.join(ROOT, "public/fonts");

const files = [
  "BigShoulders-Regular.ttf",
  "BigShoulders-Bold.ttf",
  "Outfit-Regular.ttf",
  "Outfit-Bold.ttf",
  "JetBrainsMono-Regular.ttf",
  "JetBrainsMono-Bold.ttf",
];

await wawoff.init?.();

for (const name of files) {
  const ttfPath = path.join(FONT_DIR, name);
  const woffPath = ttfPath.replace(/\.ttf$/, ".woff2");
  const ttfBuf = await fs.readFile(ttfPath);
  const woffBuf = await wawoff.compress(ttfBuf);
  await fs.writeFile(woffPath, woffBuf);

  const ttfSize = (ttfBuf.length / 1024).toFixed(0);
  const woffSize = (woffBuf.length / 1024).toFixed(0);
  const saved = ((1 - woffBuf.length / ttfBuf.length) * 100).toFixed(0);
  console.log(
    `  ${name.padEnd(30)} ${ttfSize}KB → ${woffSize}KB WOFF2 (-${saved}%)`,
  );
}

console.log(`\nDone.`);
