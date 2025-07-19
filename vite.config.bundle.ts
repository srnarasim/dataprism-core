import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist/bundles",
    lib: {
      entry: resolve(__dirname, "packages/orchestration/src/index.ts"),
      name: "DataPrism",
      fileName: (format) => `dataprism-core.${format === 'iife' ? 'min' : format}.js`,
      formats: ["iife", "umd", "es"],
    },
    rollupOptions: {
      // Bundle ALL dependencies - no externals for CDN version
      external: [],
      output: {
        exports: "named",
        // IIFE and UMD need globals object, but we're bundling everything
        globals: {},
      },
    },
    minify: false, // Disable minification temporarily for debugging
    sourcemap: true,
  },
  // Add optimization for large dependencies
  optimizeDeps: {
    include: ["@duckdb/duckdb-wasm"],
  },
  // Handle WASM files properly
  assetsInclude: ['**/*.wasm'],
});