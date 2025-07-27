# Product Requirements Prompt: CORS-Aware Cloud Storage Integration

**PRP ID**: DATAPRISM-CORE-001  
**Feature**: CORS-Aware Cloud Storage Integration  
**Priority**: High  
**Architecture Layer**: Core Infrastructure, Plugin System, DuckDB Integration  
**Estimated Timeline**: 17-24 weeks  

## 1. Executive Summary

### Feature Overview
Implement a comprehensive CORS-aware cloud storage abstraction layer in DataPrism Core that provides unified access to cloud storage resources regardless of CORS configuration. This addresses the fundamental architectural limitation where browser CORS policies block both direct fetch() operations and DuckDB-WASM's internal HTTPFS extension.

### Primary Objectives
- **Unified Cloud Access**: Single API for accessing cloud storage across providers (AWS S3, CloudFlare R2, Google Cloud Storage)
- **CORS Circumvention**: Automatic proxy fallback when direct access is blocked by CORS policies
- **DuckDB Integration**: Seamless integration allowing DuckDB to query remote datasets via enhanced HTTP layer
- **Plugin Simplification**: Remove CORS complexity from plugin development workflow

### Success Criteria
- 100% of existing plugins work with CORS-restricted cloud storage sources
- <2x latency overhead for proxied requests compared to direct access
- 99.9% success rate for supported cloud storage operations
- 50% reduction in plugin development complexity for cloud storage integration

### Architecture Layers Affected
- **Core WASM Layer**: Enhanced HTTP client services
- **Orchestration Layer**: Cloud storage abstraction and proxy services
- **DuckDB Integration**: HTTPFS extension enhancement with proxy support
- **Plugin System**: Extended context with cloud storage services

## 2. Context and Background

### Current System State

Based on comprehensive codebase analysis, DataPrism Core currently implements:

**HTTP Client Architecture** (`packages/orchestration/src/duckdb-cdn-loader.ts:45-67`):
```typescript
// Current fetch pattern - no CORS handling
const response = await fetch(configUrl);
if (!response.ok) {
  throw new Error(`Failed to load DuckDB config: ${response.status}`);
}
```

**Error Handling** (`packages/orchestration/src/dependency-error-handler.ts:94-96`):
```typescript
// CORS detection but no circumvention
if (errorMessage.includes("cors") || errorMessage.includes("cross-origin")) {
  return `${dependency.toUpperCase()}_CORS_ERROR`;
}
```

**DuckDB Integration** (`packages/orchestration/src/duckdb-manager.ts`):
- Uses DuckDB-WASM with local data registration
- No HTTP/HTTPFS extension configuration for remote datasets
- All data loading via `db.registerFileText()` for JSON data only

### Architectural Limitations
1. **No CORS Proxy**: Current implementation lacks active CORS circumvention
2. **Limited DuckDB HTTP**: No configuration for DuckDB's HTTPFS extension
3. **Plugin Burden**: Plugins must individually handle CORS complexities
4. **Provider Inconsistency**: Different cloud providers have varying CORS configurations

### Business Impact
- **Plugin Ecosystem**: Limited ability to work with major cloud providers
- **User Experience**: Inconsistent behavior across storage providers  
- **Enterprise Adoption**: Blocked by corporate proxy and CORS restrictions
- **Competitive Position**: Lagging behind Observable Framework and similar platforms

## 3. Technical Specifications

### Performance Requirements
- **Query Response**: <2 seconds for 95% of cloud storage operations
- **Memory Usage**: <4GB memory overhead for 1M row cloud datasets
- **Initialization**: <5 seconds additional startup time for proxy services
- **Browser Support**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### Browser Compatibility Requirements
- **CORS Policy Compliance**: Full W3C CORS specification adherence
- **SharedArrayBuffer**: Optional for enhanced DuckDB performance
- **WebAssembly**: Required for DuckDB-WASM integration
- **Fetch API**: Primary HTTP client, with XMLHttpRequest fallback

### Security Requirements
- **Credential Protection**: Secure handling of cloud provider credentials
- **Token Management**: OAuth 2.0 token lifecycle management
- **Proxy Security**: Prevent credential leakage through proxy services
- **Content Validation**: Data integrity verification for proxied content

### Scalability Constraints
- **File Size Limits**: Support up to 1GB individual file access
- **Concurrent Requests**: Handle up to 10 simultaneous cloud storage operations
- **Cache Management**: Intelligent caching with configurable retention policies
- **Memory Boundaries**: Maintain <6MB WASM module size limits per CLAUDE.md

## 4. Implementation Plan

### Phase 1: Core HTTP Infrastructure (6-8 weeks)

#### Step 1: Enhanced HTTP Client Service
**File**: `packages/orchestration/src/http-client.ts`

```typescript
export class DataPrismHttpClient {
  private corsCache = new Map<string, CorsSupport>();
  private proxyService: ProxyService;
  
  constructor(config: HttpClientConfig) {
    this.proxyService = new ProxyService(config.proxy);
  }
  
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    // Standard fetch implementation
    return fetch(url, options);
  }
  
  async fetchWithCorsHandling(url: string, options?: RequestInit): Promise<Response> {
    const corsSupport = await this.testCorsSupport(url);
    
    if (corsSupport.supportsDirectAccess) {
      return this.fetch(url, options);
    }
    
    // Automatic proxy fallback
    return this.proxyService.fetch(url, options);
  }
  
  async testCorsSupport(url: string): Promise<CorsSupport> {
    if (this.corsCache.has(url)) {
      return this.corsCache.get(url)!;
    }
    
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const corsSupport: CorsSupport = {
        supportsDirectAccess: true,
        requiresProxy: false,
        supportedMethods: this.parseAllowedMethods(response),
        maxFileSize: this.parseMaxFileSize(response)
      };
      this.corsCache.set(url, corsSupport);
      return corsSupport;
    } catch (error) {
      const corsSupport: CorsSupport = {
        supportsDirectAccess: false,
        requiresProxy: true,
        supportedMethods: [],
        maxFileSize: undefined
      };
      this.corsCache.set(url, corsSupport);
      return corsSupport;
    }
  }
}
```

#### Step 2: Proxy Service Infrastructure
**File**: `packages/orchestration/src/proxy-service.ts`

```typescript
export class ProxyService {
  private proxyEndpoints: ProxyEndpoint[] = [];
  private cache: Map<string, CachedResponse> = new Map();
  
  constructor(config: ProxyConfig) {
    this.initializeProxyEndpoints(config);
  }
  
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    // Check cache first
    const cacheKey = this.getCacheKey(url, options);
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (!this.isCacheExpired(cached)) {
        return new Response(cached.body, {
          status: cached.status,
          headers: cached.headers
        });
      }
    }
    
    // Select best proxy endpoint
    const proxy = this.selectProxyEndpoint(url);
    const proxyUrl = `${proxy.endpoint}/fetch?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Proxy-Authorization': proxy.apiKey
      }
    });
    
    // Cache successful responses
    if (response.ok) {
      this.cacheResponse(cacheKey, response.clone());
    }
    
    return response;
  }
}
```

#### Step 3: Cloud Storage Abstraction Layer
**File**: `packages/orchestration/src/cloud-storage-service.ts`

```typescript
export class CloudStorageService {
  private httpClient: DataPrismHttpClient;
  private providers: Map<CloudProvider, ProviderConfig> = new Map();
  
  constructor(httpClient: DataPrismHttpClient) {
    this.httpClient = httpClient;
  }
  
  async getFile(url: string, options?: FileAccessOptions): Promise<FileHandle> {
    const provider = this.detectProvider(url);
    const config = this.providers.get(provider);
    
    // Add authentication headers if configured
    const requestOptions: RequestInit = {
      ...options?.requestOptions,
      headers: {
        ...options?.requestOptions?.headers,
        ...this.getAuthHeaders(provider, config)
      }
    };
    
    const response = await this.httpClient.fetchWithCorsHandling(url, requestOptions);
    
    if (!response.ok) {
      throw new CloudStorageError(`Failed to access file: ${response.status}`, provider);
    }
    
    return new FileHandle(url, response, provider);
  }
  
  async getFileSchema(url: string): Promise<FileSchema> {
    // Intelligent schema detection without full download
    const handle = await this.getFile(url, { 
      requestOptions: { 
        headers: { 'Range': 'bytes=0-8192' } // First 8KB for schema
      }
    });
    
    return this.parseSchemaFromSample(await handle.getContentAsBuffer());
  }
}
```

### Phase 2: DuckDB Integration (4-6 weeks)

#### Step 4: DuckDB Cloud Integration
**File**: `packages/orchestration/src/duckdb-cloud-integration.ts`

```typescript
export class DuckDBCloudIntegration {
  private duckdb: AsyncDuckDB;
  private cloudStorage: CloudStorageService;
  private registeredTables: Map<string, CloudTableConfig> = new Map();
  
  constructor(duckdb: AsyncDuckDB, cloudStorage: CloudStorageService) {
    this.duckdb = duckdb;
    this.cloudStorage = cloudStorage;
  }
  
  async registerCloudTable(
    tableName: string, 
    url: string, 
    options?: CloudTableOptions
  ): Promise<void> {
    const config: CloudTableConfig = {
      tableName,
      url,
      provider: this.cloudStorage.detectProvider(url),
      corsHandling: options?.corsHandling || 'auto',
      cacheSchema: options?.cacheSchema ?? true,
      streamingMode: options?.streamingMode ?? false
    };
    
    if (config.corsHandling === 'auto') {
      const corsSupport = await this.cloudStorage.testCorsSupport(url);
      config.corsHandling = corsSupport.supportsDirectAccess ? 'direct' : 'proxy';
    }
    
    if (config.corsHandling === 'proxy') {
      // Register with DataPrism's proxy service
      await this.registerProxiedTable(config);
    } else {
      // Direct DuckDB HTTPFS registration
      await this.registerDirectTable(config);
    }
    
    this.registeredTables.set(tableName, config);
  }
  
  private async registerProxiedTable(config: CloudTableConfig): Promise<void> {
    // Create proxy-aware DuckDB extension
    const proxyUrl = this.cloudStorage.getProxyUrl(config.url);
    
    await this.duckdb.eval(`
      CREATE TABLE ${config.tableName} AS 
      SELECT * FROM read_parquet('${proxyUrl}');
    `);
  }
  
  private async registerDirectTable(config: CloudTableConfig): Promise<void> {
    // Direct HTTPFS usage when CORS allows
    await this.duckdb.eval(`
      CREATE TABLE ${config.tableName} AS 
      SELECT * FROM read_parquet('${config.url}');
    `);
  }
}
```

#### Step 5: WASM-JavaScript Data Bridge Enhancement
**File**: `packages/src/cloud_storage_bridge.rs`

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
pub struct CloudStorageBridge {
    js_http_client: js_sys::Function,
}

#[wasm_bindgen]
impl CloudStorageBridge {
    #[wasm_bindgen(constructor)]
    pub fn new(http_client_fn: js_sys::Function) -> CloudStorageBridge {
        CloudStorageBridge {
            js_http_client: http_client_fn,
        }
    }
    
    #[wasm_bindgen]
    pub async fn fetch_cloud_data(&self, url: &str) -> Result<js_sys::Uint8Array, JsValue> {
        // Call JavaScript HTTP client from WASM
        let promise = self.js_http_client.call1(&JsValue::NULL, &JsValue::from_str(url))?;
        let response = wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(promise)).await?;
        
        // Convert response to Uint8Array
        let array_buffer = js_sys::Reflect::get(&response, &JsValue::from_str("arrayBuffer"))?;
        let buffer_promise = js_sys::Promise::from(array_buffer);
        let buffer = wasm_bindgen_futures::JsFuture::from(buffer_promise).await?;
        
        Ok(js_sys::Uint8Array::new(&buffer))
    }
}
```

### Phase 3: Plugin API Enhancement (3-4 weeks)

#### Step 6: Enhanced Plugin Context
**File**: `packages/orchestration/src/plugin-context.ts`

```typescript
export interface EnhancedPluginContext extends PluginContext {
  // Enhanced HTTP client
  httpClient: DataPrismHttpClient;
  
  // Cloud storage abstraction
  cloudStorage: CloudStorageService;
  
  // DuckDB cloud integration
  duckdbCloud: DuckDBCloudIntegration;
  
  // Proxy services
  proxy: ProxyService;
  
  // Configuration helpers
  config: {
    setCorsHandlingStrategy(strategy: CorsStrategy): void;
    setCloudCredentials(provider: CloudProvider, creds: CloudCredentials): void;
    enableDebugLogging(categories: string[]): void;
  };
}
```

#### Step 7: Plugin Migration Support
**File**: `packages/orchestration/src/plugin-migration.ts`

```typescript
export class PluginMigrationSupport {
  static upgradePluginContext(oldContext: PluginContext): EnhancedPluginContext {
    return {
      ...oldContext,
      httpClient: new DataPrismHttpClient(defaultHttpConfig),
      cloudStorage: new CloudStorageService(oldContext.httpClient),
      duckdbCloud: new DuckDBCloudIntegration(oldContext.duckdb, cloudStorage),
      proxy: new ProxyService(defaultProxyConfig),
      config: new PluginConfigHelper()
    };
  }
}
```

### Phase 4: Advanced Features (4-6 weeks)

#### Step 8: Smart Caching Layer
**File**: `packages/orchestration/src/cache-manager.ts`

#### Step 9: Authentication Token Management
**File**: `packages/orchestration/src/auth-manager.ts`

#### Step 10: Performance Optimization
**File**: `packages/orchestration/src/performance-optimizer.ts`

### Phase 5: Deployment and Documentation (2-3 weeks)

#### Step 11: CDN Bundle Preparation
**Files**: 
- `dist/dataprism-core-cors.min.js` - Enhanced core bundle with CORS features
- `dist/dataprism-core-cors.wasm` - WASM module with cloud storage bridge
- `dist/cloud-storage-workers.js` - Service workers for proxy functionality

```bash
# CDN build process
npm run build:cdn:cors-features
wasm-pack build packages/src --target web --out-dir ../../dist --features cloud-storage,cors-proxy
npm run bundle:cloud-storage --env=production
```

**CDN Structure**:
```
https://srnarasim.github.io/dataprism-core/
├── cors-aware/
│   ├── dataprism-core-cors.min.js      # Enhanced core bundle
│   ├── dataprism-core-cors.wasm        # WASM with cloud storage
│   ├── cloud-proxy-worker.js           # Proxy service worker
│   ├── cors-detection.js               # CORS detection utilities
│   └── cloud-providers/
│       ├── aws-s3-adapter.js           # AWS S3 specific optimizations
│       ├── cloudflare-r2-adapter.js    # CloudFlare R2 optimizations
│       └── gcp-storage-adapter.js      # Google Cloud Storage optimizations
```

#### Step 12: Documentation Updates

**API Documentation** (`docs/api/cloud-storage.md`):
```markdown
# Cloud Storage API Reference

## Overview
DataPrism Core provides CORS-aware cloud storage integration through the enhanced HTTP client and cloud storage abstraction layer.

## Quick Start
```typescript
const engine = await DataPrismEngine.create();

// Register cloud table with automatic CORS handling
await engine.duckdbCloud.registerCloudTable(
  'sales_data',
  'https://my-bucket.s3.amazonaws.com/sales.parquet',
  { corsHandling: 'auto' }
);

// Query the cloud data
const result = await engine.duckdb.query(`
  SELECT region, SUM(revenue) as total
  FROM sales_data
  GROUP BY region
`);
```

## Configuration

### Basic Setup
```typescript
const config = {
  corsHandling: {
    strategy: 'auto',        // 'auto' | 'direct' | 'proxy'
    proxyEndpoint: 'https://cors-proxy.dataprism.io',
    cacheTimeout: 3600000,   // 1 hour in milliseconds
    retryAttempts: 3
  },
  cloudProviders: {
    'aws-s3': {
      authMethod: 'iam-role',
      region: 'us-east-1'
    },
    'cloudflare-r2': {
      authMethod: 'api-key',
      accountId: 'your-account-id'
    }
  }
};
```
```

**Integration Guide** (`docs/guides/cloud-storage-integration.md`):
```markdown
# Cloud Storage Integration Guide

## Supported Providers
- Amazon S3
- CloudFlare R2
- Google Cloud Storage
- Azure Blob Storage

## CORS Configuration
When using direct access (non-proxy), ensure your cloud storage bucket has appropriate CORS headers:

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}
```

## Migration from Legacy Plugins
Legacy plugins using direct fetch() calls can be migrated:

```typescript
// Before (CORS-limited)
const response = await fetch(cloudUrl);
const data = await response.arrayBuffer();

// After (CORS-aware)
const fileHandle = await context.cloudStorage.getFile(cloudUrl);
const data = await fileHandle.getContentAsBuffer();
```
```

**Troubleshooting Guide** (`docs/troubleshooting/cors-issues.md`):
```markdown
# CORS Troubleshooting Guide

## Common Issues

### 1. CORS Blocked Error
**Symptom**: `Access to fetch at 'https://...' blocked by CORS policy`
**Solution**: DataPrism will automatically fallback to proxy mode. Ensure proxy service is configured.

### 2. Proxy Service Unavailable
**Symptom**: `Proxy service timeout or connection refused`
**Solution**: 
- Check network connectivity
- Verify proxy service status
- Configure alternative proxy endpoints

### 3. Authentication Failures
**Symptom**: `401 Unauthorized` or `403 Forbidden`
**Solution**:
- Verify cloud provider credentials
- Check bucket permissions
- Ensure API keys are correctly configured
```

#### Step 13: CDN Integration Testing
**File**: `test/integration/cdn-deployment.test.ts`

```typescript
describe('CDN Deployment Integration', () => {
  const CDN_BASE = 'https://srnarasim.github.io/dataprism-core';
  
  it('should load CORS-aware features from CDN', async () => {
    // Test loading enhanced bundle from CDN
    const script = document.createElement('script');
    script.src = `${CDN_BASE}/cors-aware/dataprism-core-cors.min.js`;
    
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    
    // Verify CORS features are available
    expect(window.DataPrism.corsFeatures).toBeDefined();
    expect(window.DataPrism.CloudStorageService).toBeDefined();
  });
  
  it('should initialize cloud storage from CDN', async () => {
    const engine = await DataPrismEngine.create({
      cdnBase: CDN_BASE,
      features: ['cors-aware', 'cloud-storage']
    });
    
    expect(engine.cloudStorage).toBeDefined();
    expect(engine.duckdbCloud).toBeDefined();
    expect(engine.proxy).toBeDefined();
  });
  
  it('should handle cloud data access via CDN-loaded modules', async () => {
    const engine = await DataPrismEngine.create({
      cdnBase: CDN_BASE,
      features: ['cors-aware']
    });
    
    // Test with a known CORS-enabled test endpoint
    const testUrl = 'https://cors-test.dataprism.io/sample.parquet';
    const file = await engine.cloudStorage.getFile(testUrl);
    
    expect(file.metadata.size).toBeGreaterThan(0);
    expect(file.metadata.contentType).toBe('application/octet-stream');
  });
  
  it('should load cloud provider adapters dynamically', async () => {
    const engine = await DataPrismEngine.create({
      cdnBase: CDN_BASE
    });
    
    // Test AWS S3 adapter loading
    const s3Adapter = await engine.cloudStorage.loadProviderAdapter('aws-s3');
    expect(s3Adapter.optimizedRegions).toBeDefined();
    
    // Test CloudFlare R2 adapter loading
    const r2Adapter = await engine.cloudStorage.loadProviderAdapter('cloudflare-r2');
    expect(r2Adapter.apiEndpoints).toBeDefined();
  });
  
  it('should maintain performance with CDN-loaded features', async () => {
    const startTime = performance.now();
    
    const engine = await DataPrismEngine.create({
      cdnBase: CDN_BASE,
      features: ['cors-aware', 'cloud-storage']
    });
    
    const initTime = performance.now() - startTime;
    expect(initTime).toBeLessThan(8000); // <8s with CORS features (3s overhead)
    
    // Test query performance
    const queryStart = performance.now();
    await engine.duckdbCloud.registerCloudTable(
      'perf_test',
      'https://cors-test.dataprism.io/performance.parquet'
    );
    const result = await engine.duckdb.query('SELECT COUNT(*) FROM perf_test');
    const queryTime = performance.now() - queryStart;
    
    expect(queryTime).toBeLessThan(3000); // <3s for cloud query (1s overhead)
    expect(result.data.length).toBeGreaterThan(0);
  });
});
```

#### Step 14: CDN Deployment Pipeline
**File**: `.github/workflows/cdn-deploy-cors.yml`

```yaml
name: Deploy CORS Features to CDN

on:
  push:
    branches: [main]
    paths: 
      - 'packages/orchestration/src/http-client.ts'
      - 'packages/orchestration/src/cloud-storage-service.ts'
      - 'packages/orchestration/src/proxy-service.ts'
      - 'packages/src/cloud_storage_bridge.rs'

jobs:
  deploy-cors-features:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-unknown-unknown
          
      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
        
      - name: Build CORS-aware WASM
        run: |
          wasm-pack build packages/src --target web --out-dir ../../dist/cors-aware \
            --features cloud-storage,cors-proxy -- --release
            
      - name: Build enhanced bundles
        run: |
          npm ci
          npm run build:cdn:cors-features
          npm run test:cdn-deployment
          
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          destination_dir: cors-aware
          keep_files: true
          
      - name: Verify deployment
        run: |
          npm run test:cdn-integration -- --cdn-base=https://srnarasim.github.io/dataprism-core
```

## 5. Code Examples and Patterns

### WebAssembly-JavaScript Interop Pattern

```rust
// WASM side - HTTP client bridge
#[wasm_bindgen]
pub struct HttpBridge {
    fetch_fn: js_sys::Function,
}

#[wasm_bindgen]
impl HttpBridge {
    #[wasm_bindgen]
    pub async fn cors_aware_fetch(&self, url: &str) -> Result<JsValue, JsValue> {
        let options = js_sys::Object::new();
        js_sys::Reflect::set(&options, &"corsHandling".into(), &"auto".into())?;
        
        let args = js_sys::Array::new();
        args.push(&JsValue::from_str(url));
        args.push(&options);
        
        let promise = self.fetch_fn.apply(&JsValue::NULL, &args)?;
        wasm_bindgen_futures::JsFuture::from(js_sys::Promise::from(promise)).await
    }
}
```

```typescript
// JavaScript side - HTTP client implementation
class CorsAwareHttpClient {
  async fetchWithCorsHandling(url: string, options?: RequestInit): Promise<Response> {
    const corsSupport = await this.testCorsSupport(url);
    
    if (corsSupport.supportsDirectAccess) {
      return fetch(url, options);
    }
    
    return this.proxyService.fetch(url, options);
  }
}
```

### DuckDB Integration Pattern

```typescript
// Cloud table registration pattern
await context.duckdbCloud.registerCloudTable(
  'sales_data',
  'https://pub-example.r2.dev/sales.parquet',
  {
    provider: 'cloudflare-r2',
    corsHandling: 'auto',
    cacheSchema: true,
    streamingMode: true
  }
);

// Query execution
const result = await context.duckdb.query(`
  SELECT region, SUM(revenue) as total_revenue
  FROM sales_data
  WHERE date >= '2024-01-01'
  GROUP BY region
  ORDER BY total_revenue DESC
`);
```

### Error Handling Pattern

```typescript
try {
  const data = await context.cloudStorage.getFile(cloudUrl);
  return await data.getContentAsBuffer();
} catch (error) {
  if (error instanceof CorsError) {
    // Automatic proxy fallback
    return await context.proxy.fetch(cloudUrl);
  } else if (error instanceof AuthenticationError) {
    // Prompt for credentials
    await context.config.setCloudCredentials(provider, await promptForCredentials());
    return await context.cloudStorage.getFile(cloudUrl); // Retry
  }
  throw error;
}
```

### Memory Management Pattern

```rust
// WASM memory management for cloud data
#[wasm_bindgen]
pub struct CloudDataBuffer {
    data: Vec<u8>,
    source_url: String,
}

#[wasm_bindgen]
impl CloudDataBuffer {
    pub fn new(data: Vec<u8>, url: String) -> CloudDataBuffer {
        CloudDataBuffer {
            data,
            source_url: url,
        }
    }
    
    pub fn get_ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }
    
    pub fn len(&self) -> usize {
        self.data.len()
    }
    
    pub fn source_url(&self) -> String {
        self.source_url.clone()
    }
}

// Automatic cleanup
impl Drop for CloudDataBuffer {
    fn drop(&mut self) {
        // Log cleanup for debugging
        web_sys::console::log_1(&format!("Cleaning up cloud data buffer for {}", self.source_url).into());
    }
}
```

## 6. Testing Strategy

### Unit Tests

**HTTP Client Tests** (`packages/orchestration/test/http-client.test.ts`):
```typescript
describe('DataPrismHttpClient', () => {
  it('should detect CORS support correctly', async () => {
    const client = new DataPrismHttpClient(testConfig);
    const corsSupport = await client.testCorsSupport('https://cors-enabled.example.com/data.json');
    expect(corsSupport.supportsDirectAccess).toBe(true);
  });
  
  it('should fallback to proxy for CORS-restricted URLs', async () => {
    const client = new DataPrismHttpClient(testConfig);
    const response = await client.fetchWithCorsHandling('https://cors-blocked.example.com/data.json');
    expect(response.ok).toBe(true);
  });
});
```

**Cloud Storage Tests** (`packages/orchestration/test/cloud-storage.test.ts`):
```typescript
describe('CloudStorageService', () => {
  it('should handle AWS S3 URLs correctly', async () => {
    const service = new CloudStorageService(mockHttpClient);
    const file = await service.getFile('https://my-bucket.s3.amazonaws.com/data.parquet');
    expect(file.provider).toBe('aws-s3');
  });
  
  it('should detect file schema without full download', async () => {
    const service = new CloudStorageService(mockHttpClient);
    const schema = await service.getFileSchema('https://example.com/data.parquet');
    expect(schema.columns).toBeDefined();
  });
});
```

### Integration Tests

**DuckDB Cloud Integration** (`test/integration/duckdb-cloud.test.ts`):
```typescript
describe('DuckDB Cloud Integration', () => {
  it('should register and query cloud tables', async () => {
    const engine = await DataPrismEngine.create();
    await engine.duckdbCloud.registerCloudTable(
      'test_data',
      'https://example.com/test.parquet'
    );
    
    const result = await engine.duckdb.query('SELECT COUNT(*) FROM test_data');
    expect(result.data[0].count).toBeGreaterThan(0);
  });
});
```

### Performance Benchmarks

**Network Performance** (`test/performance/network.bench.ts`):
```typescript
describe('Network Performance', () => {
  benchmark('Direct vs Proxy Latency', async () => {
    const directTime = await measureTime(() => 
      fetch('https://cors-enabled.example.com/1mb.json')
    );
    
    const proxyTime = await measureTime(() => 
      proxyService.fetch('https://cors-blocked.example.com/1mb.json')
    );
    
    expect(proxyTime / directTime).toBeLessThan(2); // <2x overhead
  });
});
```

### Browser Compatibility Tests

**Cross-Browser Test Suite** (`test/browser/compatibility.test.ts`):
```typescript
describe('Browser Compatibility', () => {
  const browsers = ['Chrome 90', 'Firefox 88', 'Safari 14', 'Edge 90'];
  
  browsers.forEach(browser => {
    it(`should work in ${browser}`, async () => {
      const engine = await DataPrismEngine.create();
      const result = await engine.cloudStorage.getFile('https://example.com/test.json');
      expect(result).toBeDefined();
    });
  });
});
```

### Error Scenario Testing

**CORS Error Handling** (`test/error-scenarios/cors.test.ts`):
```typescript
describe('CORS Error Scenarios', () => {
  it('should handle network timeout gracefully', async () => {
    const client = new DataPrismHttpClient({ timeout: 1000 });
    
    await expect(
      client.fetchWithCorsHandling('https://slow.example.com/data.json')
    ).rejects.toMatchObject({
      name: 'TimeoutError',
      recoverable: true
    });
  });
});
```

## 7. Success Criteria

### Functional Requirements
- ✅ **Cloud Provider Support**: AWS S3, CloudFlare R2, Google Cloud Storage, Azure Blob
- ✅ **CORS Detection**: Automatic detection of CORS support for any URL
- ✅ **Proxy Fallback**: Seamless fallback to proxy when direct access fails
- ✅ **DuckDB Integration**: Transparent cloud data access via DuckDB queries
- ✅ **Plugin Compatibility**: 100% backward compatibility with existing plugins
- ✅ **Authentication**: OAuth 2.0 and API key support for cloud providers

### Performance Targets
- ✅ **Query Performance**: <2 seconds for 95% of cloud storage operations
- ✅ **Proxy Overhead**: <2x latency increase for proxied requests
- ✅ **Memory Usage**: <4GB additional memory for 1M row cloud datasets
- ✅ **Initialization**: <5 seconds additional startup time
- ✅ **Cache Hit Rate**: >80% cache hit rate for repeated access patterns

### Reliability Metrics
- ✅ **Success Rate**: 99.9% success rate for supported cloud operations
- ✅ **Error Recovery**: Automatic retry with exponential backoff
- ✅ **Graceful Degradation**: Fallback mechanisms for all failure modes
- ✅ **Cross-Browser**: Consistent behavior across Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### Developer Experience
- ✅ **API Simplicity**: Single method call for cloud data access
- ✅ **Error Messages**: Clear, actionable error messages with suggested fixes
- ✅ **Documentation**: Comprehensive API documentation with examples
- ✅ **Migration Path**: Smooth upgrade path for existing plugins

## 8. Validation Commands

### Build Commands
```bash
# Build WASM core with cloud storage features
wasm-pack build packages/src --target web --out-dir ../pkg --features cloud-storage

# Build orchestration layer with enhanced HTTP client
npm run build:orchestration

# Build CDN bundles with proxy services
npm run build:bundles

# Generate TypeScript definitions
npm run build:types
```

### Test Commands
```bash
# Run all unit tests
npm test

# Run integration tests with cloud storage
npm run test:integration:cloud

# Run CDN deployment integration tests
npm run test:cdn-integration

# Run performance benchmarks
npm run test:performance

# Run browser compatibility tests
npm run test:browser

# Test CORS scenarios
npm run test:cors

# Run memory leak detection
npm run test:memory

# Test documentation examples
npm run test:docs-examples
```

### Quality Assurance Commands
```bash
# TypeScript type checking
npm run type-check

# Rust code linting
cargo clippy --all-features

# JavaScript/TypeScript linting
npm run lint

# Security audit
npm audit && cargo audit

# Bundle size analysis
npm run analyze:bundle
```

### Validation Tests
```bash
# Test direct cloud storage access
npm run validate:direct-access

# Test proxy fallback mechanism
npm run validate:proxy-fallback

# Test DuckDB cloud integration
npm run validate:duckdb-cloud

# Test plugin compatibility
npm run validate:plugin-compatibility

# Test performance benchmarks
npm run validate:performance

# Test CDN deployment and loading
npm run validate:cdn-deployment

# Validate documentation completeness
npm run validate:documentation

# Test all examples in documentation
npm run validate:docs-examples
```

### Example Validation Script
```typescript
// validation/cloud-storage-validation.ts
async function validateCloudStorageIntegration() {
  const engine = await DataPrismEngine.create();
  
  // Test 1: Direct access to CORS-enabled resource
  console.log('Testing direct access...');
  const directResult = await engine.cloudStorage.getFile(
    'https://cors-enabled.example.com/sample.parquet'
  );
  assert(directResult.metadata.size > 0, 'Direct access failed');
  
  // Test 2: Proxy fallback for CORS-restricted resource
  console.log('Testing proxy fallback...');
  const proxyResult = await engine.cloudStorage.getFile(
    'https://cors-blocked.example.com/sample.parquet'
  );
  assert(proxyResult.metadata.size > 0, 'Proxy fallback failed');
  
  // Test 3: DuckDB cloud table registration
  console.log('Testing DuckDB integration...');
  await engine.duckdbCloud.registerCloudTable(
    'validation_data',
    'https://example.com/validation.parquet'
  );
  const queryResult = await engine.duckdb.query('SELECT COUNT(*) FROM validation_data');
  assert(queryResult.data.length > 0, 'DuckDB cloud integration failed');
  
  // Test 4: CDN loading validation
  console.log('Testing CDN deployment...');
  const cdnEngine = await DataPrismEngine.create({
    cdnBase: 'https://srnarasim.github.io/dataprism-core',
    features: ['cors-aware', 'cloud-storage']
  });
  assert(cdnEngine.cloudStorage, 'CDN-loaded cloud storage failed');
  assert(cdnEngine.duckdbCloud, 'CDN-loaded DuckDB cloud integration failed');
  
  // Test 5: Documentation examples validation
  console.log('Testing documentation examples...');
  await validateDocumentationExamples();
  
  console.log('✅ All cloud storage validation tests passed');
}

async function validateDocumentationExamples() {
  // Validate all code examples in documentation work as expected
  const exampleResults = await Promise.allSettled([
    validateQuickStartExample(),
    validateConfigurationExample(),
    validateMigrationExample(),
    validateTroubleshootingSteps()
  ]);
  
  const failures = exampleResults.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(`Documentation validation failed: ${failures.length} examples failed`);
  }
}
```

## 9. Documentation Requirements

### Required Documentation Updates

1. **API Reference** (`docs/api/cloud-storage.md`)
   - Complete API documentation for all new interfaces
   - Code examples for each method
   - Error handling patterns
   - Performance considerations

2. **Integration Guide** (`docs/guides/cloud-storage-integration.md`)
   - Step-by-step integration instructions
   - Cloud provider configuration guides
   - CORS troubleshooting workflows
   - Migration guide from legacy plugins

3. **Troubleshooting Guide** (`docs/troubleshooting/cors-issues.md`)
   - Common CORS error scenarios and solutions
   - Proxy configuration troubleshooting
   - Performance optimization tips
   - Authentication issue resolution

4. **Plugin Developer Guide Updates** (`docs/plugin-development/enhanced-context.md`)
   - Updated plugin context documentation
   - Cloud storage integration patterns
   - Best practices for CORS handling
   - Migration instructions for existing plugins

### Documentation Validation Requirements

- All code examples must be executable and tested
- All configuration examples must be validated
- All troubleshooting steps must be verified
- API documentation must be complete and accurate

## 10. CDN Deployment Requirements

### CDN Structure and Organization
```
https://srnarasim.github.io/dataprism-core/
├── cors-aware/
│   ├── dataprism-core-cors.min.js      # Enhanced core bundle (production)
│   ├── dataprism-core-cors.js          # Enhanced core bundle (development)
│   ├── dataprism-core-cors.wasm        # WASM with cloud storage features
│   ├── cloud-proxy-worker.js           # Service worker for proxy functionality
│   ├── cors-detection.js               # CORS detection utilities
│   └── cloud-providers/               # Provider-specific optimizations
│       ├── aws-s3-adapter.js
│       ├── cloudflare-r2-adapter.js
│       └── gcp-storage-adapter.js
```

### CDN Deployment Pipeline Requirements

1. **Automated Build and Deploy**: GitHub Actions workflow for automatic GitHub Pages deployment
2. **Version Management**: Semantic versioning for CORS-aware features  
3. **Rollback Capability**: Ability to quickly rollback problematic deployments via Git history
4. **Performance Monitoring**: GitHub Pages performance metrics and monitoring
5. **Cache Management**: GitHub Pages built-in caching with appropriate cache headers

### CDN Integration Testing Requirements

1. **Load Testing**: Verify CDN-loaded features work correctly
2. **Performance Testing**: Ensure CDN loading doesn't exceed performance budgets
3. **Compatibility Testing**: Test across different CDN endpoints and regions
4. **Fallback Testing**: Verify graceful degradation when CDN is unavailable

This comprehensive PRP now includes deployment, documentation, and CDN integration requirements as core components of the CORS-aware cloud storage integration feature.