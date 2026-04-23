/**
 * Fetch the PR Tracker Google Business reviews from Places API (New)
 * and snapshot them to src/data/google-reviews.json so the static site
 * can render them with zero runtime cost.
 *
 * Runs as a prebuild hook (package.json). Gracefully no-ops when the
 * API key is missing (e.g. on a developer's first clone), leaving the
 * last committed snapshot in place.
 *
 * Env vars:
 *   GOOGLE_PLACES_API_KEY   required in production builds
 *   GOOGLE_PLACE_ID         optional override; defaults to PR Tracker's
 *
 * Run: node scripts/fetch-google-reviews.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const OUT = path.join(ROOT, "src/data/google-reviews.json");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACE_ID = process.env.GOOGLE_PLACE_ID ?? "ChIJVxMvO555GZURKtFEl81Znd0";

if (!API_KEY) {
  console.log(
    "[reviews] GOOGLE_PLACES_API_KEY not set — keeping committed snapshot",
  );
  process.exit(0);
}

const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
const fields = [
  "id",
  "displayName",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "reviews",
].join(",");

const res = await fetch(url, {
  headers: {
    "X-Goog-Api-Key": API_KEY,
    "X-Goog-FieldMask": fields,
    // Request Portuguese reviews first so translated copies don't override
    // originals when the user viewing the API is in another locale.
    "Accept-Language": "pt-BR",
  },
});

if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(
    `[reviews] Places API ${res.status} — keeping committed snapshot\n${body.slice(0, 500)}`,
  );
  process.exit(0);
}

const data = await res.json();

/** Minimal shape the site renders. Keep tight to reduce stale-data risk. */
const snapshot = {
  fetchedAt: new Date().toISOString(),
  placeId: data.id,
  name: data.displayName?.text ?? "PR Tracker",
  rating: data.rating ?? null,
  userRatingCount: data.userRatingCount ?? 0,
  googleMapsUri: data.googleMapsUri ?? null,
  reviews: (data.reviews ?? []).map((r) => ({
    author: r.authorAttribution?.displayName ?? "Cliente",
    authorUri: r.authorAttribution?.uri ?? null,
    photoUri: r.authorAttribution?.photoUri ?? null,
    rating: r.rating ?? 5,
    relativeTime: r.relativePublishTimeDescription ?? "",
    publishTime: r.publishTime ?? null,
    text: r.text?.text ?? r.originalText?.text ?? "",
    googleUri: r.googleMapsUri ?? null,
  })),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(
  `[reviews] ${snapshot.reviews.length} reviews · ${snapshot.rating} ★ (${snapshot.userRatingCount} total) → src/data/google-reviews.json`,
);
