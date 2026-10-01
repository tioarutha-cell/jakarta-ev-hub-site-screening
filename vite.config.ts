import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  // Relative, not "/" — this app is also deployed to GitHub Pages at a subpath
  // (https://<user>.github.io/<repo>/), where an absolute base would point built
  // asset references at the wrong location. "./" resolves correctly both there
  // and at a domain root.
  base: "./",
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
