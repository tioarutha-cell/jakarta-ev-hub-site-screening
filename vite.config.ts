import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 4321,
    strictPort: true,
    open: true,
    host: true
  },
  preview: {
    port: 4321,
    strictPort: true,
    open: true
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        guide: resolve(__dirname, "guide.html")
      }
    }
  }
});
