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
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true,
      },
      mangle: {
        keep_classnames: true, // Preserve class names for better debugging
        keep_fnames: true,     // Preserve function names
      },
    },
    sourcemap: true,
  },
  // Add optimization for large dependencies
  optimizeDeps: {
    include: ["@duckdb/duckdb-wasm"],
  },
  // Handle WASM files properly
  assetsInclude: ['**/*.wasm'],
});