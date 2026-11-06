import path from "path"
import { defineConfig } from "vitest/config"

const root = path.resolve(import.meta.dirname)

export default defineConfig({
  root,
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
})
