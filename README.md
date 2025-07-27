# DataPrism Core

DataPrism Core is the foundational platform combining Rust WebAssembly engine with TypeScript orchestration for high-performance browser-based analytics with CORS-aware cloud storage integration.

## Features

- **WebAssembly Engine**: High-performance Rust-based analytics core
- **TypeScript Orchestration**: Flexible coordination layer
- **DuckDB Integration**: Powerful SQL analytics engine with cloud storage support
- **CORS-Aware Cloud Storage**: Seamless access to AWS S3, CloudFlare R2, Google Cloud Storage, and Azure Blob Storage with automatic proxy fallback
- **Intelligent Caching**: Multi-tier caching system with LRU eviction and TTL management
- **Browser Optimized**: <2s query response, <6MB bundle size
- **Memory Efficient**: <4GB usage for 1M row datasets

## Installation

```bash
npm install @dataprism/core
```

## Quick Start

### Basic Usage

```typescript
import { DataPrismEngine } from '@dataprism/core';

const engine = new DataPrismEngine();
await engine.initialize();

const result = await engine.query('SELECT COUNT(*) FROM data');
console.log(result);
```

### Cloud Storage Integration

```typescript
import { DataPrismEngine } from '@dataprism/core';

// Initialize with cloud storage configuration
const engine = new DataPrismEngine({
  corsConfig: {
    strategy: 'auto',
    cacheTimeout: 3600000, // 1 hour
    retryAttempts: 3
  },
  cloudProviders: {
    'aws-s3': {
      authMethod: 'api-key',
      credentials: {
        accessKeyId: 'your-access-key',
        secretAccessKey: 'your-secret-key'
      }
    }
  }
});

await engine.initialize();

// Register cloud table for SQL queries
await engine.duckdbCloudService?.registerCloudTable(
  'sales_data',
  'https://my-bucket.s3.amazonaws.com/sales.parquet',
  { corsHandling: 'auto' }
);

// Query the cloud data
const result = await engine.query(`
  SELECT region, SUM(revenue) as total_revenue
  FROM sales_data
  WHERE date >= '2024-01-01'
  GROUP BY region
  ORDER BY total_revenue DESC
`);
```

### CDN Usage

```html
<!-- ESM (Modern Browsers) -->
<script type="module">
  import { DataPrismEngine } from 'https://srnarasim.github.io/dataprism-core/bundles/dataprism-core.es.js';
  
  const engine = new DataPrismEngine({
    corsConfig: { strategy: 'auto' }
  });
  await engine.initialize();
</script>

<!-- UMD (Universal) -->
<script src="https://srnarasim.github.io/dataprism-core/bundles/dataprism-core.umd.js"></script>
<script>
  const { DataPrismEngine } = DataPrismCore;
  const engine = new DataPrismEngine();
</script>
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

- **packages/src**: Rust WebAssembly engine with cloud storage bridge
- **packages/orchestration**: TypeScript coordination layer with cloud services
- **tests/integration**: Cross-language integration tests including cloud storage
- **docs**: Comprehensive API documentation
- **examples**: Interactive demos and examples

### Cloud Storage Services

- **DataPrismHttpClient**: Enhanced HTTP client with CORS detection and automatic proxy fallback
- **CloudStorageService**: High-level cloud storage operations abstraction supporting AWS S3, CloudFlare R2, Google Cloud Storage, and Azure Blob Storage
- **DuckDBCloudIntegration**: Seamless integration between DuckDB and cloud storage with automatic table registration
- **CacheManager**: Multi-tier caching system (schema, HTTP, query) with intelligent eviction
- **AuthManager**: Centralized credential management for cloud providers
- **PerformanceOptimizer**: Automatic performance optimization based on usage patterns

## Performance Targets

- Query response time: <2 seconds (95% of operations)
- Memory usage: <4GB for 1M row datasets
- Initialization time: <5 seconds
- Bundle size: <6MB optimized
- CORS detection: <500ms for cloud storage URLs
- Cache hit rate: >80% for repeated operations

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Required Browser Features

- **Fetch API**: Primary HTTP client
- **WebAssembly**: For DuckDB integration
- **Async/Await**: For promise-based APIs
- **ArrayBuffer**: For binary data handling

## Documentation

- [Cloud Storage API Reference](docs/cloud-storage-api.md)
- [Interactive Demo](https://srnarasim.github.io/dataprism-core/examples/cloud-storage-demo.html)
- [CDN Access](https://srnarasim.github.io/dataprism-core/)

## License

MIT
