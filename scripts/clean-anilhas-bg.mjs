/**
 * Clean up the "all plates" banner photo:
 *
 * 1. Flood-fill the outer white background from the image corners so the
 *    near-white 1,25 kg plate stays fully opaque (it isn't connected to
 *    the corner bg).
 * 2. Auto-detect each plate via connected-components on the now-opaque
 *    pixels, take its centroid, and punch a small transparent disk there.
 *    That puts a real "hole" through the centre of every plate so the banner
 *    lime shows through all 7 pieces.
 * 3. Gentle saturation + sharpen for consistency.
 *
 * Input:  public/images/products/anilhas/Anilhas_0007_todas-anilhas.png
 * Output: public/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.png
 * Run:    node scripts/clean-anilhas-bg.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.join(here, "..", "public/images/products/anilhas/Anilhas_0007_todas-anilhas.png");
const OUTPUT = path.join(here, "..", "public/images/products/anilhas/Anilhas_0007_todas-anilhas-clean.png");

const BG_LIGHTNESS = 248;      // min(R,G,B) ≥ this AND reached from a corner → bg
                                // (high so the whitish 1,25 kg plate survives)
const MIN_COMPONENT_PIXELS = 9000; // ignore noise components smaller than this
const HOLE_RADIUS = 14;        // radius (px) of the transparent hole punched at each plate centroid
const EDGE_FEATHER_LO = 225;   // after corner fill, pixels with min(R,G,B) in [LO..HI]
const EDGE_FEATHER_HI = 247;   //   get proportionally reduced alpha (clean anti-alias edges)

const { data: srcRaw, info } = await sharp(INPUT)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = Buffer.from(srcRaw);
const idx = (x, y) => (y * W + x) * 4;

// 1. Flood-fill background from every corner.
const visited = new Uint8Array(W * H);
const queue = [];
for (const [sx, sy] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
  const i = idx(sx, sy);
  if (Math.min(px[i], px[i + 1], px[i + 2]) >= BG_LIGHTNESS) {
    queue.push([sx, sy]);
    visited[sy * W + sx] = 1;
  }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
while (queue.length) {
  const [x, y] = queue.pop();
  px[idx(x, y) + 3] = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const v = ny * W + nx;
    if (visited[v]) continue;
    const ni = idx(nx, ny);
    if (Math.min(px[ni], px[ni + 1], px[ni + 2]) >= BG_LIGHTNESS) {
      visited[v] = 1;
      queue.push([nx, ny]);
    }
  }
}

// 1b. Feather the anti-aliased halo at the plate/bg boundary: near-white pixels
//     bordering the now-transparent region get their alpha reduced proportionally.
//     The 1,25 kg plate (inner pixels not reached in step 1) is untouched.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (px[i + 3] === 0) continue;
    // Only feather pixels that neighbour a transparent pixel (real edge pixels).
    let nearBg = false;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (px[idx(nx, ny) + 3] === 0) { nearBg = true; break; }
    }
    if (!nearBg) continue;
    const m = Math.min(px[i], px[i + 1], px[i + 2]);
    if (m >= EDGE_FEATHER_HI) {
      px[i + 3] = 0;
    } else if (m >= EDGE_FEATHER_LO) {
      const t = (m - EDGE_FEATHER_LO) / (EDGE_FEATHER_HI - EDGE_FEATHER_LO);
      px[i + 3] = Math.round(px[i + 3] * (1 - t));
    }
  }
}

// 2. Find connected components on opaque pixels; record centroid of each large one.
const label = new Int32Array(W * H);
let nextLabel = 1;
const centroids = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (label[y * W + x] !== 0) continue;
    if (px[idx(x, y) + 3] === 0) continue;
    const stack = [[x, y]];
    label[y * W + x] = nextLabel;
    let sumX = 0, sumY = 0, count = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      sumX += cx;
      sumY += cy;
      count++;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = ny * W + nx;
        if (label[v] !== 0) continue;
        if (px[idx(nx, ny) + 3] === 0) continue;
        label[v] = nextLabel;
        stack.push([nx, ny]);
      }
    }
    if (count >= MIN_COMPONENT_PIXELS) {
      centroids.push({ x: Math.round(sumX / count), y: Math.round(sumY / count), count });
    }
    nextLabel++;
  }
}
centroids.sort((a, b) => b.count - a.count);
console.log(`Detected ${centroids.length} plate components:`);
for (const c of centroids) {
  console.log(`  centroid (${c.x}, ${c.y}) — ${c.count.toLocaleString()} px`);
}

// 3. Punch a clean transparent disk through each centroid.
for (const c of centroids) {
  for (let dy = -HOLE_RADIUS; dy <= HOLE_RADIUS; dy++) {
    for (let dx = -HOLE_RADIUS; dx <= HOLE_RADIUS; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > HOLE_RADIUS * HOLE_RADIUS) continue;
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      // Soft edge: fully transparent at center, feathered over last 2px.
      const r = Math.sqrt(d2);
      const edge = HOLE_RADIUS - 2;
      if (r <= edge) {
        px[idx(nx, ny) + 3] = 0;
      } else {
        const t = (HOLE_RADIUS - r) / 2; // 0..1
        px[idx(nx, ny) + 3] = Math.round(px[idx(nx, ny) + 3] * (1 - t));
      }
    }
  }
}

await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .modulate({ saturation: 1.1 })
  .sharpen({ sigma: 0.5 })
  .png({ compressionLevel: 9 })
  .toFile(OUTPUT);

console.log(`Wrote ${OUTPUT}`);
