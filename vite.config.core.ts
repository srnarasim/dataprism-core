import { defineConfig } from "vite";
import { resolve } from "path";

// Core bundle - excludes DuckDB to keep size manageable
export default defineConfig({
  build: {
    outDir: "dist/bundles",
    lib: {
      entry: resolve(__dirname, "packages/orchestration/src/index.ts"),
      name: "DataPrismCore",
      fileName: (format) => `dataprism-core-lite.${format === 'iife' ? 'min' : format}.js`,
      formats: ["iife", "umd", "es"],
    },
    rollupOptions: {
      // Exclude large dependencies but bundle smaller ones
      external: [
        "@duckdb/duckdb-wasm", // Keep this external due to size
      ],
      output: {
        exports: "named",
        globals: {
          "@duckdb/duckdb-wasm": "DuckDB",
        },
        // Add banner to explain DuckDB dependency
        banner: `/*
 * DataPrism Core (Lite) - CDN Bundle
 * Note: This bundle requires @duckdb/duckdb-wasm to be loaded separately
 * For a complete bundle, use dataprism-core.min.js instead
 * 
 * DuckDB WASM can be loaded from:
 * https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist/duckdb-mvp.wasm
 */`,
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
    },
    sourcemap: true,
  },
});