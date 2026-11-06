import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { inspectAttr } from "kimi-plugin-inspect-react"

const __dirname = import.meta.dirname

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "nexus-preview-host",
      config(config) {
        const hosts = config.server?.allowedHosts
        if (hosts === true || hosts?.includes("3000.proxy.internal")) return
        return { server: { allowedHosts: ["3000.proxy.internal"] } }
      },
    },
    inspectAttr(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Nexus Local Intelligence",
        short_name: "Nexus",
        description: "A local-first, permission-gated personal intelligence console.",
        theme_color: "#0b0c0c",
        background_color: "#0b0c0c",
        display: "standalone",
        start_url: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
})
