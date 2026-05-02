/**
 * Generate a portrait mobile hero from the desktop source.
 *
 * Source:  public/images/brand/hero-desktop.png (2030×1024)
 * Output:  public/images/brand/hero-mobile.jpg  (portrait, focused on the
 *          rack + bench + platform composition)
 *
 * Run: node scripts/crop-hero-mobile.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.join(here, "..", "public/images/brand/hero-desktop.png");
const OUTPUT = path.join(here, "..", "public/images/brand/hero-mobile.jpg");

// Desktop image is 2030×1024. Pick a portrait window that keeps the
// full vertical gradient (dark gym bokeh top → products middle band →
// wooden table bottom) and centres on the rack + bench + platform
// composition, with the Power Clean cube as the left anchor.
const CROP_LEFT = 450;
const CROP_TOP = 0;
const CROP_WIDTH = 820;
const CROP_HEIGHT = 1024;

// Upscale for high-DPI phones.
const OUT_WIDTH = 1080;
const OUT_HEIGHT = Math.round(CROP_HEIGHT * (OUT_WIDTH / CROP_WIDTH));

await sharp(INPUT)
  .extract({
    left: CROP_LEFT,
    top: CROP_TOP,
    width: CROP_WIDTH,
    height: CROP_HEIGHT,
  })
  .resize(OUT_WIDTH, OUT_HEIGHT, { fit: "cover", kernel: "lanczos3" })
  .modulate({ saturation: 1.05 })
  .sharpen({ sigma: 0.5 })
  .jpeg({ quality: 84, progressive: true, mozjpeg: true })
  .toFile(OUTPUT);

const meta = await sharp(OUTPUT).metadata();
console.log(`Wrote ${OUTPUT} — ${meta.width}×${meta.height}`);
