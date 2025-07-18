# DataPrism Core - Context Engineering Guide

## Project Overview
DataPrism Core is the foundational platform combining Rust WebAssembly engine with TypeScript orchestration for high-performance browser-based analytics.

## Architecture Context
- **Core WASM Engine**: Rust-based WebAssembly module with DuckDB integration
- **TypeScript Orchestration**: Coordination layer for API management
- **Performance Targets**: <2s query response, <6MB WASM bundles
- **Browser Support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Development Patterns
- Use wasm-bindgen for JavaScript interop
- Implement proper memory management
- Handle WebAssembly compilation errors gracefully
- Optimize for browser memory constraints

## Testing Requirements
- Rust unit tests with cargo test
- TypeScript tests with Vitest
- Integration tests for WASM-JS interactions
- Performance benchmarks for core operations

## Build Commands
```bash
# Build WASM core
wasm-pack build packages/wasm --target web

# Build orchestration
npm run build:orchestration

# Run tests
cargo test && npm run test:orchestration
```
