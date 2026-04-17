import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "PH Commute Guide",
        short_name: "PH Commute",
        description: "Route-based commuting assistant for the Philippines",
        id: "/",
        theme_color: "#0f172a",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["travel", "navigation", "productivity"],
        icons: [
          {
            src: "/pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/api/search-route"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "search-route-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.includes("/api/saved-routes"),
            handler: "NetworkFirst",
            options: {
              cacheName: "saved-routes-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === "image" || request.destination === "style" || request.destination === "script",
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets-cache",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  }
});
