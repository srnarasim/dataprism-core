# Cloud Storage API Reference

## Overview

DataPrism Core provides comprehensive CORS-aware cloud storage integration that works seamlessly across major cloud providers (AWS S3, CloudFlare R2, Google Cloud Storage, Azure Blob Storage) with automatic proxy fallback when direct access is blocked by CORS policies.

## Quick Start

```typescript
import { DataPrismEngine } from '@dataprism/core';

// Initialize engine with cloud storage configuration
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

## Core Services

### DataPrismHttpClient

Enhanced HTTP client with CORS detection and automatic proxy fallback.

```typescript
const httpClient = engine.httpClientService;

// Test CORS support for a URL
const corsSupport = await httpClient.testCorsSupport('https://example.com/data.json');
console.log(corsSupport.supportsDirectAccess); // true/false

// Fetch with automatic CORS handling
const response = await httpClient.fetchWithCorsHandling('https://example.com/data.json');

// Detect cloud provider
const provider = httpClient.detectProvider('https://my-bucket.s3.amazonaws.com/file.parquet');
console.log(provider); // 'aws-s3'
```

### CloudStorageService

High-level cloud storage operations abstraction.

```typescript
const cloudStorage = engine.cloudStorageService;

// Get file with metadata
const file = await cloudStorage.getFile('https://example.com/data.csv');
console.log(file.metadata.size, file.metadata.contentType);

// Get file schema without downloading full content
const schema = await cloudStorage.getFileSchema('https://example.com/data.parquet');
console.log(schema.columns, schema.format);

// Batch file operations
const files = await cloudStorage.getMultipleFiles([
  'https://example.com/file1.json',
  'https://example.com/file2.json'
]);

// Configure cloud provider
cloudStorage.configureProvider('aws-s3', {
  authMethod: 'iam-role',
  region: 'us-east-1'
});
```

### DuckDBCloudIntegration

Seamless integration between DuckDB and cloud storage.

```typescript
const duckdbCloud = engine.duckdbCloudService;

// Register cloud table
await duckdbCloud.registerCloudTable('products', 'https://data.s3.amazonaws.com/products.parquet', {
  corsHandling: 'auto',
  cacheSchema: true,
  streamingMode: false
});

// Query registered table
const products = await duckdbCloud.queryCloudTable('products', 'SELECT * FROM products LIMIT 10');

// Configure fallback strategies
duckdbCloud.configureFallbackStrategies(['proxy', 'cache', 'error']);
```

## Advanced Features

### Cache Management

Intelligent caching system with multiple specialized caches.

```typescript
// Access different cache types
const schemaCache = engine.schemaCacheService;
const httpCache = engine.httpCacheService;
const queryCache = engine.queryCacheService;

// Cache statistics
const stats = schemaCache.getStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Entries: ${stats.entryCount}, Size: ${stats.currentSizeBytes} bytes`);

// Manual cache management
schemaCache.clear(); // Clear all entries
schemaCache.cleanup(); // Remove expired entries
```

### Authentication Management

Centralized credential management for cloud providers.

```typescript
const authManager = engine.authManagerService;

// Set credentials
authManager.setCredentials('aws-s3', {
  accessKeyId: 'AKIA...',
  secretAccessKey: 'secret'
});

// Test authentication
const authResult = await authManager.testAuthentication('aws-s3');
console.log(authResult.isValid);

// Get auth headers for requests
const headers = await authManager.getAuthHeaders('aws-s3');

// Token management (for OAuth2)
await authManager.refreshTokenIfNeeded('google-cloud-storage');
```

### Performance Optimization

Automatic performance optimization based on usage patterns.

```typescript
const optimizer = engine.performanceOptimizerService;

// Apply optimizations
const results = await optimizer.optimize({
  fileSize: 50 * 1024 * 1024, // 50MB
  provider: 'aws-s3',
  query: 'SELECT * FROM large_table'
});

// Record metrics
optimizer.recordMetrics('cloud-query', {
  queryExecutionTime: 1500,
  memoryUsage: 100 * 1024 * 1024,
  cacheHitRate: 0.8,
  networkLatency: 150,
  dataSize: 20 * 1024 * 1024
});

// Get performance report
const report = optimizer.getPerformanceReport();
console.log(report.recommendations);
```

## Configuration Options

### CORS Configuration

```typescript
interface CorsConfig {
  strategy: 'auto' | 'direct' | 'proxy';
  proxyEndpoint?: string;
  cacheTimeout?: number;
  retryAttempts?: number;
}
```

### Cloud Provider Configuration

```typescript
interface ProviderConfig {
  authMethod?: 'iam-role' | 'api-key' | 'oauth2';
  region?: string;
  accountId?: string;
  credentials?: CloudCredentials;
}

interface CloudCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  apiKey?: string;
  oauth2Token?: string;
}
```

## Error Handling

The cloud storage system provides comprehensive error handling with specific error types:

```typescript
import { CloudStorageError } from '@dataprism/core';

try {
  const file = await cloudStorage.getFile('https://restricted.example.com/data.json');
} catch (error) {
  if (error instanceof CloudStorageError) {
    console.log(`Provider: ${error.provider}`);
    console.log(`Error code: ${error.code}`);
    console.log(`Message: ${error.message}`);
    
    // Handle specific error types
    switch (error.code) {
      case 'CORS_ERROR':
        // Automatic proxy fallback will be attempted
        break;
      case 'AUTH_ERROR':
        // Check credentials
        break;
      case 'NETWORK_ERROR':
        // Retry logic will be applied
        break;
    }
  }
}
```

## Browser Compatibility

DataPrism Core cloud storage features are compatible with:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Required Browser Features

- **Fetch API**: Primary HTTP client
- **WebAssembly**: For DuckDB integration
- **Async/Await**: For promise-based APIs
- **ArrayBuffer**: For binary data handling

## Performance Considerations

### Memory Usage

- **Query Results**: Cached with LRU eviction, configurable size limits
- **File Schemas**: Lightweight caching with 2-hour default TTL
- **HTTP Responses**: 30-minute default caching for repeated requests

### Network Optimization

- **Connection Pooling**: Automatic for repeated requests to same domain
- **Compression**: Automatic gzip/deflate support
- **Range Requests**: For partial file access and streaming

### Recommended Practices

1. **Enable Caching**: Set appropriate cache timeouts for your use case
2. **Use Streaming**: For files larger than 10MB
3. **Batch Operations**: Use `getMultipleFiles()` for multiple file access
4. **Monitor Performance**: Use the performance optimizer for insights

## Troubleshooting

### Common Issues

#### CORS Blocked Error
**Symptom**: `Access to fetch blocked by CORS policy`  
**Solution**: DataPrism automatically falls back to proxy mode. Ensure proxy service is configured.

#### Authentication Failures
**Symptom**: `401 Unauthorized` or `403 Forbidden`  
**Solution**: Verify cloud provider credentials and bucket permissions.

#### Large File Timeouts
**Symptom**: Requests timeout for large files  
**Solution**: Enable streaming mode or increase timeout configuration.

### Debug Mode

Enable debug logging for detailed information:

```typescript
const engine = new DataPrismEngine({
  logLevel: 'debug',
  corsConfig: {
    strategy: 'auto'
  }
});
```

## Migration Guide

### From Direct fetch() Calls

```typescript
// Before (CORS-limited)
const response = await fetch(cloudUrl);
const data = await response.json();

// After (CORS-aware)
const file = await engine.cloudStorageService.getFile(cloudUrl);
const data = JSON.parse(await file.getContentAsText());
```

### From Legacy Plugin Context

```typescript
// Use migration support
import { PluginMigrationSupport } from '@dataprism/core';

const enhancedContext = PluginMigrationSupport.upgradePluginContext(oldContext, engine);
// Now use enhancedContext.cloudStorage, enhancedContext.httpClient, etc.
```

## API Reference

### Types and Interfaces

All TypeScript types and interfaces are exported from the main package:

```typescript
import type {
  CloudProvider,
  CorsSupport,
  FileMetadata,
  FileSchema,
  CloudStorageError,
  ProviderConfig,
  CloudCredentials
} from '@dataprism/core';
```

For complete type definitions, see the TypeScript declaration files included with the package.