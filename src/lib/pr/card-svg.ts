// PR card SVG composition (1080×1920, vertical Story format).
// Pure-string SVG generator — no DOM, runs at the edge.
//
// Used by:
// - GET /api/pr/card/[id].svg  (full card download)
// - /pr/celebrate/[id].astro   (inline preview)

import { exerciseLabel, type ExerciseId } from "./exercises";
import { splitPlates, type PlateSplit, BAR_KG } from "./plates";

// Inter weights via Vite asset URLs — same-origin, decent fallback if
// network blocks them.
import interBoldUrl from "@fontsource/inter/files/inter-latin-700-normal.woff2?url";
import interSemiUrl from "@fontsource/inter/files/inter-latin-600-normal.woff2?url";
import interMedUrl from "@fontsource/inter/files/inter-latin-500-normal.woff2?url";

// Archivo Black is the brand font (logo + huge weight number). We import
// it via Vite's ?url so it's emitted into the Vercel deployment, then on
// the server we read the raw file at module init and base64-encode it as
// a data: URL. Browsers block external font loading inside <img>-rendered
// SVGs (which is how the client converts to PNG), but data: URLs always
// work — so the rasterized PNG matches the inline preview.
import archivoBlackUrl from "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2?url";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const archivoBlackDataUrl = (() => {
  try {
    const req = createRequire(import.meta.url);
    const p = req.resolve("@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2");
    const b64 = readFileSync(p).toString("base64");
    return `data:font/woff2;base64,${b64}`;
  } catch {
    // Vercel cold-start without bundled font file → fall back to URL.
    // Tradeoff: client-side PNG export uses system Arial Black instead,
    // but the inline preview (which uses page-loaded fonts) is fine.
    return archivoBlackUrl;
  }
})();

export interface CardData {
  athleteName: string;
  exerciseId: ExerciseId;
  weightKg: number;
  performedAt: string; // YYYY-MM-DD
}

// Plate visual specs — colors mirror the IWF Pantone catalog (Brand Bible).
// Heights/widths chosen for visual punch on a 1080-wide canvas, NOT scaled
// to real-world dimensions.
const PLATE_VISUAL: Record<string, { color: string; height: number; width: number }> = {
  "25": { color: "#DA291C", height: 360, width: 56 },
  "20": { color: "#0057B8", height: 320, width: 56 },
  "15": { color: "#FFC72C", height: 280, width: 50 },
  "10": { color: "#43B02A", height: 240, width: 44 },
  "5": { color: "#111111", height: 180, width: 38 },
  "2.5": { color: "#2563EB", height: 120, width: 32 },
  "1.25": { color: "#C0C5CC", height: 90, width: 28 },
};

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const BAR_Y = 870; // vertical center of barbell composition
const BAR_HALF_LENGTH = 280; // shaft extends ±280px from canvas center
const CENTER_X = CANVAS_W / 2;

function fmtDate(iso: string): string {
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderBarbell(split: PlateSplit): string {
  const elements: string[] = [];

  // Bar shaft (thin steel rod, runs through the plates)
  const shaftStart = CENTER_X - BAR_HALF_LENGTH;
  const shaftEnd = CENTER_X + BAR_HALF_LENGTH;
  elements.push(
    `<rect x="${shaftStart}" y="${BAR_Y - 9}" width="${BAR_HALF_LENGTH * 2}" height="18" fill="url(#shaftGrad)" rx="4"/>`
  );

  // End caps (sleeve tips beyond the plates)
  // We extend a small amount past the outermost plate; if no plates, just
  // show a clean bar. Rendered after plates so they float above visually.

  // Plates — heaviest closest to bar, mirror across center.
  const sorted = [...split.pairs].sort((a, b) => b.kg - a.kg);

  let rightOffset = 0;
  let leftOffset = 0;

  for (const { kg, count } of sorted) {
    const key = kg.toString();
    const spec = PLATE_VISUAL[key];
    if (!spec) continue;

    for (let i = 0; i < count; i++) {
      // Right side
      const rx = shaftEnd + rightOffset;
      const ry = BAR_Y - spec.height / 2;
      elements.push(plateGroup(rx, ry, spec));
      rightOffset += spec.width;

      // Left side (mirror)
      const lx = shaftStart - leftOffset - spec.width;
      elements.push(plateGroup(lx, ry, spec));
      leftOffset += spec.width;
    }
  }

  // End caps after plates so they sit on top
  const capLength = 24;
  elements.push(
    `<rect x="${shaftEnd + rightOffset}" y="${BAR_Y - 12}" width="${capLength}" height="24" fill="#3a3f48" rx="3"/>`
  );
  elements.push(
    `<rect x="${shaftStart - leftOffset - capLength}" y="${BAR_Y - 12}" width="${capLength}" height="24" fill="#3a3f48" rx="3"/>`
  );

  return elements.join("\n  ");
}

function plateGroup(x: number, y: number, spec: { color: string; height: number; width: number }): string {
  const { color, height, width } = spec;
  // Plate body, hub (dark band where bar mounts), inner highlight
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="#0a0a14" stroke-width="2.5" rx="6"/>
    <rect x="${x}" y="${BAR_Y - 16}" width="${width}" height="32" fill="rgba(0,0,0,0.45)"/>
    <rect x="${x + width * 0.15}" y="${y + 8}" width="${width * 0.18}" height="${height - 16}" fill="rgba(255,255,255,0.08)" rx="2"/>
  </g>`;
}

export function renderCardSvg(data: CardData): string {
  const exerciseName = exerciseLabel(data.exerciseId).toUpperCase();
  const split = splitPlates(data.weightKg);
  const dateStr = fmtDate(data.performedAt);
  const movement = exerciseLabel(data.exerciseId);

  const barbell = split.pairs.length > 0 ? renderBarbell(split) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
  <defs>
    <style>
      @font-face { font-family: 'Archivo Black'; font-weight: 400; src: url('${archivoBlackDataUrl}') format('woff2'); }
      @font-face { font-family: 'Inter'; font-weight: 700; src: url('${interBoldUrl}') format('woff2'); }
      @font-face { font-family: 'Inter'; font-weight: 600; src: url('${interSemiUrl}') format('woff2'); }
      @font-face { font-family: 'Inter'; font-weight: 500; src: url('${interMedUrl}') format('woff2'); }
    </style>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#01002A"/>
      <stop offset="55%" stop-color="#0a0050"/>
      <stop offset="100%" stop-color="#01002A"/>
    </linearGradient>
    <linearGradient id="shaftGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E4E8ED"/>
      <stop offset="50%" stop-color="#9aa0aa"/>
      <stop offset="100%" stop-color="#5a5f68"/>
    </linearGradient>
    <radialGradient id="weightGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#D8FF2C" stop-opacity="0.18"/>
      <stop offset="70%" stop-color="#D8FF2C" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#bgGrad)"/>

  <!-- Subtle grid texture (very faint, gives depth) -->
  <g opacity="0.04" stroke="#D8FF2C" stroke-width="1" fill="none">
    ${Array.from({ length: 18 }, (_, i) => `<line x1="0" y1="${i * 120}" x2="${CANVAS_W}" y2="${i * 120}"/>`).join("")}
    ${Array.from({ length: 10 }, (_, i) => `<line x1="${i * 120}" y1="0" x2="${i * 120}" y2="${CANVAS_H}"/>`).join("")}
  </g>

  <!-- Top brand band -->
  <text x="${CENTER_X}" y="130" text-anchor="middle" fill="#D8FF2C"
        font-family="'Archivo Black', 'Inter', sans-serif" font-size="56" font-weight="900" letter-spacing="14">PR TRACKER</text>
  <line x1="${CENTER_X - 110}" y1="180" x2="${CENTER_X + 110}" y2="180" stroke="#D8FF2C" stroke-width="3"/>

  <!-- Headline -->
  <text x="${CENTER_X}" y="320" text-anchor="middle" fill="#D8FF2C"
        font-family="'Inter', sans-serif" font-size="36" font-weight="600" letter-spacing="14">NOVO RECORDE</text>
  <text x="${CENTER_X}" y="500" text-anchor="middle" fill="#ffffff"
        font-family="'Archivo Black', 'Inter', sans-serif" font-size="120" font-weight="900" letter-spacing="2">${escapeXml(exerciseName)}</text>

  <!-- Barbell composition (lower-middle) -->
  ${barbell}

  <!-- Weight glow + huge number -->
  <ellipse cx="${CENTER_X}" cy="1380" rx="500" ry="280" fill="url(#weightGlow)"/>
  <text x="${CENTER_X}" y="1430" text-anchor="middle" fill="#D8FF2C"
        font-family="'Archivo Black', 'Inter', sans-serif" font-size="340" font-weight="900" letter-spacing="-8">${data.weightKg}</text>
  <text x="${CENTER_X}" y="1530" text-anchor="middle" fill="#ffffff"
        font-family="'Inter', sans-serif" font-size="64" font-weight="700" letter-spacing="14">KG</text>

  <!-- Athlete band -->
  <text x="${CENTER_X}" y="1680" text-anchor="middle" fill="#ffffff"
        font-family="'Inter', sans-serif" font-size="56" font-weight="700">${escapeXml(data.athleteName)}</text>
  <text x="${CENTER_X}" y="1735" text-anchor="middle" fill="#9ca3af"
        font-family="'Inter', sans-serif" font-size="32" font-weight="500" letter-spacing="4">${escapeXml(movement.toUpperCase())} · ${escapeXml(dateStr.toUpperCase())}</text>

  <!-- Footer -->
  <line x1="${CENTER_X - 110}" y1="1820" x2="${CENTER_X + 110}" y2="1820" stroke="#D8FF2C" stroke-width="2"/>
  <text x="${CENTER_X}" y="1870" text-anchor="middle" fill="#9ca3af"
        font-family="'Inter', sans-serif" font-size="28" font-weight="500" letter-spacing="6">@PR.TRACKER · PRTRACKER.COM.BR</text>
</svg>`;
}

// Bar weight reference (so callers can sanity-check totals if needed).
export { BAR_KG };
