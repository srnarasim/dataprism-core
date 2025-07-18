# DataPrism Core

DataPrism Core is the foundational platform combining Rust WebAssembly engine with TypeScript orchestration for high-performance browser-based analytics.

## Features

- **WebAssembly Engine**: High-performance Rust-based analytics core
- **TypeScript Orchestration**: Flexible coordination layer
- **DuckDB Integration**: Powerful SQL analytics engine
- **Browser Optimized**: <2s query response, <6MB bundle size
- **Memory Efficient**: <4GB usage for 1M row datasets

## Installation

```bash
npm install @dataprism/core
```

## Quick Start

```typescript
import { DataPrismCore } from '@dataprism/core';

const core = new DataPrismCore();
await core.initialize();

const result = await core.query('SELECT COUNT(*) FROM data');
console.log(result);
```

## Development

```bash
# Install dependencies
npm install

# Build all
npm run build

# Run tests
npm test

# Development mode
npm run dev
```

## Architecture

- **packages/wasm**: Rust WebAssembly engine
- **packages/orchestration**: TypeScript coordination layer
- **tests/integration**: Cross-language integration tests
- **tools/build**: Build configurations and scripts

## Performance Targets

- Query response time: <2 seconds (95% of operations)
- Memory usage: <4GB for 1M row datasets
- Initialization time: <5 seconds
- Bundle size: <6MB optimized

## License

MIT
