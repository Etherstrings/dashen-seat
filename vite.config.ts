import { defineConfig, type Plugin } from "vite";

// The package must open from file:// as well as from any static path, in a
// web-view we don't control: relative URLs (base "./"), one classic script
// (Chrome won't run <script type="module"> from file://), no modulepreload
// polyfill (it calls fetch), nothing left for runtime loading.
function classicScript(): Plugin {
  return {
    name: "dashen-seat-classic-script",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => html.replace(/<script type="module" crossorigin/g, "<script defer").replace(/ crossorigin/g, ""),
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [classicScript()],
  build: {
    target: "es2019",
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 0,
    modulePreload: false,
    sourcemap: false,
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/seat-[hash].js",
        assetFileNames: "assets/seat-[hash][extname]",
      },
    },
  },
});
