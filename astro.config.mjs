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
});
