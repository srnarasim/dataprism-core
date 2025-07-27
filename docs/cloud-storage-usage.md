# DataPrism Cloud Storage Integration Usage Guide

## Overview

DataPrism Core provides seamless integration with cloud storage providers, allowing you to analyze large datasets directly from cloud storage without downloading them locally. This guide shows you how to use cloud storage integration with real-world examples.

## Interactive Demo

🚀 **Try the live demo**: [Cloud Storage Demo](https://srnarasim.github.io/dataprism-core/examples/cloud-storage-demo.html)

The demo demonstrates:
- Real-time access to a 50MB NYC taxi dataset (3+ million records)
- CORS-aware cloud storage integration
- Efficient Parquet file processing with range requests
- DuckDB analytics on cloud data
- Automatic fallback strategies for reliability

## Quick Start

### 1. Include DataPrism Core

```html
<!-- Via CDN (UMD) -->
<script src="https://srnarasim.github.io/dataprism-core/dataprism-core.min.js"></script>

<!-- Or via ES modules -->
<script type="module">
  import { DataPrismEngine } from 'https://srnarasim.github.io/dataprism-core/bundles/dataprism-core.es.js';
</script>
```

### 2. Initialize the Engine

```javascript
const engine = new DataPrismEngine({
  enableWasmOptimizations: false,
  maxMemoryMB: 1024,
  queryTimeoutMs: 30000,
  logLevel: 'info',
  corsConfig: {
    strategy: 'auto', // Try direct first, fallback to proxy
    cacheTimeout: 300000,
    retryAttempts: 2
  },
  cloudProviders: {
    'cloudflare-r2': { authMethod: 'api-key' },
    'aws-s3': { authMethod: 'api-key' },
    'google-cloud-storage': { authMethod: 'api-key' },
    'azure-blob': { authMethod: 'api-key' }
  }
});

await engine.initialize();
```

### 3. Register and Query Cloud Tables

#### Method 1: Direct DuckDB SQL (Recommended)

```javascript
// Register table using DuckDB's built-in read_parquet
const tableName = 'my_data';
const cloudUrl = 'https://your-bucket.s3.amazonaws.com/data.parquet';

await engine.query(`
  CREATE OR REPLACE VIEW ${tableName} AS 
  SELECT * FROM read_parquet('${cloudUrl}')
`);

// Query the data
const result = await engine.query(`
  SELECT column1, column2, COUNT(*) as count
  FROM ${tableName}
  WHERE column1 > 100
  GROUP BY column1, column2
  ORDER BY count DESC
  LIMIT 10
`);

console.log('Query Results:', result.data);
```

#### Method 2: Cloud Service API

```javascript
// Register table via cloud service
await engine.duckdbCloudService?.registerCloudTable(
  'my_data',
  'https://your-bucket.s3.amazonaws.com/data.parquet',
  { corsHandling: 'auto' }
);

// Query via cloud service
const data = await engine.duckdbCloudService?.queryCloudTable('my_data');
```

## Real-World Example: NYC Taxi Data Analysis

```javascript
// 1. Initialize engine
const engine = new DataPrismEngine({
  corsConfig: { strategy: 'auto' }
});
await engine.initialize();

// 2. Register NYC taxi data (50MB Parquet file)
await engine.query(`
  CREATE VIEW taxi_trips AS 
  SELECT * FROM read_parquet('https://your-r2-bucket.com/yellow_tripdata_2023-01.parquet')
`);

// 3. Analyze trip patterns
const popularRoutes = await engine.query(`
  SELECT 
    PULocationID as pickup_location,
    DOLocationID as dropoff_location,
    COUNT(*) as trip_count,
    AVG(trip_distance) as avg_distance,
    AVG(fare_amount) as avg_fare
  FROM taxi_trips
  WHERE trip_distance > 0
  GROUP BY PULocationID, DOLocationID
  ORDER BY trip_count DESC
  LIMIT 20
`);

// 4. Get time-based insights
const hourlyPatterns = await engine.query(`
  SELECT 
    EXTRACT(hour FROM tpep_pickup_datetime) as hour,
    COUNT(*) as trips,
    AVG(trip_distance) as avg_distance
  FROM taxi_trips
  GROUP BY hour
  ORDER BY hour
`);

console.log('Popular Routes:', popularRoutes.data);
console.log('Hourly Patterns:', hourlyPatterns.data);
```

## Cloud Provider Configuration

### CloudFlare R2

```javascript
{
  cloudProviders: {
    'cloudflare-r2': { 
      authMethod: 'api-key',
      // Optional: specific R2 configuration
      region: 'auto'
    }
  }
}
```

**CORS Requirements for R2:**
```json
{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["Range", "Content-Type"],
  "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"]
}
```

### AWS S3

```javascript
{
  cloudProviders: {
    'aws-s3': { 
      authMethod: 'api-key',
      region: 'us-east-1'
    }
  }
}
```

### Google Cloud Storage

```javascript
{
  cloudProviders: {
    'google-cloud-storage': { 
      authMethod: 'api-key'
    }
  }
}
```

### Azure Blob Storage

```javascript
{
  cloudProviders: {
    'azure-blob': { 
      authMethod: 'api-key'
    }
  }
}
```

## Advanced Features

### Schema Detection

```javascript
// Detect file schema automatically
const schema = await engine.cloudStorageService?.getFileSchema(cloudUrl);
console.log('Columns:', schema.columns);

// Or use DuckDB DESCRIBE
const schemaResult = await engine.query(`
  DESCRIBE SELECT * FROM read_parquet('${cloudUrl}') LIMIT 0
`);
```

### File Metadata

```javascript
const file = await engine.cloudStorageService?.getFile(cloudUrl);
console.log('File size:', file.metadata.size);
console.log('Last modified:', file.metadata.lastModified);
```

### CORS Testing

```javascript
const corsSupport = await engine.httpClientService?.testCorsSupport(cloudUrl);
console.log('Direct access:', corsSupport.supportsDirectAccess);
console.log('Requires proxy:', corsSupport.requiresProxy);
```

### Performance Monitoring

```javascript
// Get cache statistics
const cacheStats = {
  schema: engine.schemaCacheService?.getStats(),
  http: engine.httpCacheService?.getStats(),
  query: engine.queryCacheService?.getStats()
};

// Get performance metrics
const performance = engine.performanceOptimizerService?.getPerformanceReport();
console.log('Average query time:', performance.averageMetrics['cloud-query'].queryExecutionTime);
```

## Data Formats Supported

- **Parquet** (recommended for analytics)
- **CSV** with automatic schema detection
- **JSON** and JSONL
- **TSV** and other delimited formats

## Browser Compatibility

- Chrome 90+
- Firefox 88+  
- Safari 14+
- Edge 90+

## Error Handling

```javascript
try {
  await engine.query(`SELECT * FROM read_parquet('${url}')`);
} catch (error) {
  if (error.message.includes('CORS')) {
    console.log('CORS issue - trying proxy approach');
    // Fallback to proxy or different strategy
  } else if (error.message.includes('BigInt')) {
    console.log('Data contains large integers - handled automatically');
  } else {
    console.error('Query failed:', error.message);
  }
}
```

## Performance Tips

1. **Use Parquet format** for best performance with large datasets
2. **Enable caching** for frequently accessed files
3. **Use column selection** to reduce data transfer: `SELECT col1, col2 FROM table`
4. **Apply filters early** to minimize processing: `WHERE date > '2023-01-01'`
5. **Proper CORS configuration** eliminates need for proxy services

## Security Considerations

- Always validate cloud URLs before processing
- Use appropriate authentication for private data
- Configure CORS headers properly on your cloud storage
- Consider rate limiting for production applications

## Troubleshooting

### CORS Issues
- Ensure `Access-Control-Expose-Headers` includes `Content-Range`
- Set `Access-Control-Allow-Origin` appropriately
- Enable range request support with `Accept-Ranges: bytes`

### Performance Issues
- Check network latency to cloud storage
- Monitor memory usage with large datasets
- Use appropriate query patterns for your use case

### BigInt Serialization
- Automatically handled in DataPrism Core v1.0+
- Large integers converted to strings for JSON compatibility

## Next Steps

- Try the [interactive demo](https://srnarasim.github.io/dataprism-core/examples/cloud-storage-demo.html)
- Explore the [API documentation](../README.md)
- Check out more [examples](../examples/)
- Join our community for support and updates