// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://prtracker.com.br",
  output: "static",
  adapter: vercel({
    webAnalytics: { enabled: false },
    imageService: false,
  }),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes("/checkout") &&
        !page.includes("/api/") &&
        !page.includes("/obrigado") &&
        !page.includes("/cart"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: "hover",
  },
  compressHTML: true,
  build: {
    // Inline CSS under 10KB into <style> tags; anything bigger stays as
    // an external stylesheet. Saves the render-blocking round-trip for
    // the small per-page CSS (index.css was 4KB, cart.css 7.5KB — both
    // were showing up as LCP blockers in PageSpeed).
    inlineStylesheets: "auto",
  },
});
