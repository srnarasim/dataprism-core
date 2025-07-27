import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataPrismEngine } from '../engine.js';
import { DataPrismConfig } from '../types.js';

// Mock fetch for testing
global.fetch = vi.fn();

describe('Cloud Storage Integration Tests', () => {
  let engine: DataPrismEngine;
  const mockConfig: Partial<DataPrismConfig> = {
    enableWasmOptimizations: false, // Disable WASM for integration tests
    maxMemoryMB: 1024,
    queryTimeoutMs: 10000,
    logLevel: 'info',
    corsConfig: {
      strategy: 'auto',
      cacheTimeout: 300000, // 5 minutes
      retryAttempts: 2
    },
    cloudProviders: {
      'aws-s3': {
        authMethod: 'api-key',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key'
        }
      },
      'cloudflare-r2': {
        authMethod: 'api-key',
        credentials: {
          apiKey: 'test-r2-key'
        }
      },
      'google-cloud-storage': {
        authMethod: 'oauth2',
        credentials: {
          oauth2Token: 'test-gcs-token'
        }
      },
      'azure-blob': {
        authMethod: 'api-key',
        credentials: {
          apiKey: 'test-azure-key'
        }
      }
    }
  };

  beforeEach(async () => {
    engine = new DataPrismEngine(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (engine) {
      await engine.close();
    }
  });

  describe('Engine Initialization', () => {
    it('should initialize cloud storage services', async () => {
      // Mock DuckDB initialization
      vi.doMock('@duckdb/duckdb-wasm', () => ({
        AsyncDuckDB: vi.fn().mockImplementation(() => ({
          connect: vi.fn().mockResolvedValue({
            query: vi.fn().mockResolvedValue({
              toArray: () => [],
              close: vi.fn()
            }),
            close: vi.fn()
          }),
          terminate: vi.fn()
        }))
      }));

      await engine.initialize();

      expect(engine.httpClientService).toBeDefined();
      expect(engine.cloudStorageService).toBeDefined();
      expect(engine.cacheManagerService).toBeDefined();
      expect(engine.authManagerService).toBeDefined();
      expect(engine.performanceOptimizerService).toBeDefined();
    }, 30000);

    it('should configure cloud providers during initialization', async () => {
      await engine.initialize();

      const authManager = engine.authManagerService;
      expect(authManager).toBeDefined();
      
      if (authManager) {
        const awsCredentials = authManager.getCredentials('aws-s3');
        expect(awsCredentials).toBeDefined();
        expect(awsCredentials?.accessKeyId).toBe('test-access-key');

        const r2Credentials = authManager.getCredentials('cloudflare-r2');
        expect(r2Credentials).toBeDefined();
        expect(r2Credentials?.apiKey).toBe('test-r2-key');
      }
    });
  });

  describe('CORS Detection and Handling', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should detect CORS support for valid URLs', async () => {
      const mockResponse = new Response(null, {
        status: 200,
        headers: new Headers({
          'Access-Control-Allow-Methods': 'GET, HEAD',
          'Access-Control-Allow-Origin': '*'
        })
      });

      (fetch as any).mockResolvedValueOnce(mockResponse);

      const httpClient = engine.httpClientService;
      expect(httpClient).toBeDefined();

      if (httpClient) {
        const corsSupport = await httpClient.testCorsSupport('https://cors-enabled.example.com/data.json');
        
        expect(corsSupport.supportsDirectAccess).toBe(true);
        expect(corsSupport.requiresProxy).toBe(false);
        expect(corsSupport.supportedMethods).toContain('GET');
      }
    });

    it('should fallback to proxy for CORS-blocked URLs', async () => {
      const corsError = new Error('Access to fetch blocked by CORS policy');
      (fetch as any).mockRejectedValueOnce(corsError);

      const httpClient = engine.httpClientService;
      expect(httpClient).toBeDefined();

      if (httpClient) {
        const corsSupport = await httpClient.testCorsSupport('https://cors-blocked.example.com/data.json');
        
        expect(corsSupport.supportsDirectAccess).toBe(false);
        expect(corsSupport.requiresProxy).toBe(true);
      }
    });
  });

  describe('Cloud Storage Operations', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle file access from different cloud providers', async () => {
      const testUrls = [
        'https://my-bucket.s3.amazonaws.com/data.json',
        'https://pub-123.r2.dev/data.parquet',
        'https://storage.googleapis.com/bucket/data.csv',
        'https://account.blob.core.windows.net/container/data.json'
      ];

      const mockResponse = new Response('{"test": "data"}', {
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'content-length': '16'
        })
      });

      (fetch as any).mockResolvedValue(mockResponse);

      const cloudStorage = engine.cloudStorageService;
      expect(cloudStorage).toBeDefined();

      if (cloudStorage) {
        for (const url of testUrls) {
          const provider = cloudStorage.detectProvider(url);
          expect(provider).toBeDefined();

          const file = await cloudStorage.getFile(url);
          expect(file.provider).toBe(provider);
          expect(file.metadata.size).toBe(16);
          expect(file.metadata.contentType).toBe('application/json');
        }
      }
    });

    it('should cache file schemas', async () => {
      const csvContent = 'name,age,location\nJohn,30,NYC\nJane,25,LA';
      const mockResponse = new Response(csvContent, {
        status: 200,
        headers: new Headers({
          'content-type': 'text/csv',
          'content-length': csvContent.length.toString()
        })
      });

      (fetch as any).mockResolvedValue(mockResponse);

      const cloudStorage = engine.cloudStorageService;
      const schemaCache = engine.schemaCacheService;
      
      expect(cloudStorage).toBeDefined();
      expect(schemaCache).toBeDefined();

      if (cloudStorage && schemaCache) {
        const url = 'https://example.com/test.csv';
        
        // First call should fetch from network
        const schema1 = await cloudStorage.getFileSchema(url);
        expect(schema1.format).toBe('csv');
        expect(schema1.columns).toHaveLength(3);
        
        // Second call should use cache
        const schema2 = await cloudStorage.getFileSchema(url);
        expect(schema2).toEqual(schema1);
        
        // Verify only one network call was made
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Performance Optimization', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should apply optimization strategies', async () => {
      const optimizer = engine.performanceOptimizerService;
      expect(optimizer).toBeDefined();

      if (optimizer) {
        const context = {
          fileSize: 50 * 1024 * 1024, // 50MB file
          provider: 'aws-s3',
          query: 'SELECT * FROM large_table ORDER BY timestamp LIMIT 1000'
        };

        const results = await optimizer.optimize(context);
        expect(results.length).toBeGreaterThan(0);
        
        const appliedStrategies = results.filter(r => r.applied);
        expect(appliedStrategies.length).toBeGreaterThan(0);
      }
    });

    it('should record and analyze performance metrics', async () => {
      const optimizer = engine.performanceOptimizerService;
      expect(optimizer).toBeDefined();

      if (optimizer) {
        // Record some test metrics
        optimizer.recordMetrics('cloud-query', {
          queryExecutionTime: 1500,
          memoryUsage: 100 * 1024 * 1024, // 100MB
          cacheHitRate: 0.8,
          networkLatency: 150,
          dataSize: 20 * 1024 * 1024 // 20MB
        });

        optimizer.recordMetrics('cloud-query', {
          queryExecutionTime: 1200,
          memoryUsage: 90 * 1024 * 1024,
          cacheHitRate: 0.85,
          networkLatency: 140,
          dataSize: 18 * 1024 * 1024
        });

        const report = optimizer.getPerformanceReport();
        expect(report.averageMetrics['cloud-query']).toBeDefined();
        expect(report.averageMetrics['cloud-query'].queryExecutionTime).toBe(1350); // Average
        expect(report.recommendations.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Authentication Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should manage cloud provider credentials', async () => {
      const authManager = engine.authManagerService;
      expect(authManager).toBeDefined();

      if (authManager) {
        // Test credential validation
        const awsCredentials = {
          accessKeyId: 'AKIA...',
          secretAccessKey: 'secret123'
        };
        
        const isValid = authManager.validateCredentials('aws-s3', awsCredentials);
        expect(isValid).toBe(true);

        // Test invalid credentials
        const invalidCredentials = {
          accessKeyId: '',
          secretAccessKey: ''
        };
        
        const isInvalid = authManager.validateCredentials('aws-s3', invalidCredentials);
        expect(isInvalid).toBe(false);
      }
    });

    it('should generate appropriate auth headers', async () => {
      const authManager = engine.authManagerService;
      expect(authManager).toBeDefined();

      if (authManager) {
        const headers = await authManager.getAuthHeaders('aws-s3');
        expect(headers).toBeDefined();
        expect(typeof headers).toBe('object');
      }
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should manage different types of caches', async () => {
      const schemaCache = engine.schemaCacheService;
      const httpCache = engine.httpCacheService;
      const queryCache = engine.queryCacheService;

      expect(schemaCache).toBeDefined();
      expect(httpCache).toBeDefined();
      expect(queryCache).toBeDefined();

      if (schemaCache && httpCache && queryCache) {
        // Test schema caching
        const testSchema = { columns: [{ name: 'id', type: 'number' }], format: 'json' as const };
        schemaCache.set('test-schema', testSchema);
        expect(schemaCache.get('test-schema')).toEqual(testSchema);

        // Test query result caching
        const testResult = [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }];
        queryCache.setCachedQuery('SELECT * FROM test', [], testResult);
        expect(queryCache.getCachedQuery('SELECT * FROM test', [])).toEqual(testResult);

        // Test cache statistics
        const schemaStats = schemaCache.getStats();
        expect(schemaStats.entryCount).toBe(1);
        expect(schemaStats.size).toBe(1);
      }
    });

    it('should evict expired cache entries', async () => {
      const schemaCache = engine.schemaCacheService;
      expect(schemaCache).toBeDefined();

      if (schemaCache) {
        // Set an entry with short TTL
        const testSchema = { columns: [], format: 'json' as const };
        schemaCache.set('short-lived', testSchema, 100); // 100ms TTL

        // Verify it exists initially
        expect(schemaCache.get('short-lived')).toEqual(testSchema);

        // Wait for expiration and cleanup
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            schemaCache.cleanup();
            expect(schemaCache.get('short-lived')).toBeNull();
            resolve();
          }, 150);
        });
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network timeout');
      (fetch as any).mockRejectedValueOnce(networkError);

      const httpClient = engine.httpClientService;
      expect(httpClient).toBeDefined();

      if (httpClient) {
        await expect(
          httpClient.fetch('https://unreachable.example.com/data.json')
        ).rejects.toThrow('Network timeout');
      }
    });

    it('should handle authentication errors', async () => {
      const authError = new Response(null, { status: 401, statusText: 'Unauthorized' });
      (fetch as any).mockResolvedValueOnce(authError);

      const cloudStorage = engine.cloudStorageService;
      expect(cloudStorage).toBeDefined();

      if (cloudStorage) {
        await expect(
          cloudStorage.getFile('https://protected.example.com/data.json')
        ).rejects.toThrow('Failed to access file: 401 Unauthorized');
      }
    });
  });

  describe('Engine Lifecycle', () => {
    it('should properly initialize and close', async () => {
      const testEngine = new DataPrismEngine({
        enableWasmOptimizations: false,
        maxMemoryMB: 512
      });

      await testEngine.initialize();
      expect(testEngine.isReady()).toBe(true);

      await testEngine.close();
      expect(testEngine.isReady()).toBe(false);

      // Verify services are cleaned up
      expect(testEngine.httpClientService).toBeNull();
      expect(testEngine.cloudStorageService).toBeNull();
      expect(testEngine.cacheManagerService).toBeNull();
    });
  });
});