import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataPrismHttpClient } from '../http-client.js';

// Mock fetch
global.fetch = vi.fn();

describe('DataPrismHttpClient', () => {
  let httpClient: DataPrismHttpClient;

  beforeEach(() => {
    httpClient = new DataPrismHttpClient({
      timeout: 5000,
      retries: 2
    });
    vi.clearAllMocks();
  });

  describe('basic fetch functionality', () => {
    it('should make a basic fetch request', async () => {
      const mockResponse = new Response('test data', { status: 200 });
      (fetch as any).mockResolvedValueOnce(mockResponse);

      const response = await httpClient.fetch('https://example.com/data');
      
      expect(fetch).toHaveBeenCalledWith('https://example.com/data', {
        signal: expect.any(AbortSignal)
      });
      expect(response.status).toBe(200);
    });

    it('should handle fetch timeout', async () => {
      (fetch as any).mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 10000))
      );

      await expect(
        httpClient.fetch('https://slow.example.com/data')
      ).rejects.toThrow();
    });
  });

  describe('CORS support detection', () => {
    it('should detect CORS support for successful HEAD request', async () => {
      const mockResponse = new Response(null, { 
        status: 200,
        headers: new Headers({
          'Access-Control-Allow-Methods': 'GET, POST, HEAD',
          'Content-Length': '1024'
        })
      });
      (fetch as any).mockResolvedValueOnce(mockResponse);

      const corsSupport = await httpClient.testCorsSupport('https://cors-enabled.example.com/data');
      
      expect(corsSupport.supportsDirectAccess).toBe(true);
      expect(corsSupport.requiresProxy).toBe(false);
      expect(corsSupport.supportedMethods).toContain('GET');
      expect(corsSupport.maxFileSize).toBe(1024);
    });

    it('should detect CORS failure and mark as requiring proxy', async () => {
      const corsError = new Error('Access to fetch at blocked by CORS policy');
      (fetch as any).mockRejectedValueOnce(corsError);

      const corsSupport = await httpClient.testCorsSupport('https://cors-blocked.example.com/data');
      
      expect(corsSupport.supportsDirectAccess).toBe(false);
      expect(corsSupport.requiresProxy).toBe(true);
      expect(corsSupport.supportedMethods).toEqual([]);
    });

    it('should cache CORS test results', async () => {
      const mockResponse = new Response(null, { status: 200 });
      (fetch as any).mockResolvedValueOnce(mockResponse);

      // First call
      await httpClient.testCorsSupport('https://example.com/data');
      // Second call should use cache
      await httpClient.testCorsSupport('https://example.com/data');
      
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cloud provider detection', () => {
    it('should detect AWS S3', () => {
      expect(httpClient.detectProvider('https://my-bucket.s3.amazonaws.com/file.parquet'))
        .toBe('aws-s3');
      expect(httpClient.detectProvider('https://s3.us-west-2.amazonaws.com/bucket/file.json'))
        .toBe('aws-s3');
    });

    it('should detect Cloudflare R2', () => {
      expect(httpClient.detectProvider('https://pub-12345.r2.dev/file.parquet'))
        .toBe('cloudflare-r2');
    });

    it('should detect Google Cloud Storage', () => {
      expect(httpClient.detectProvider('https://storage.googleapis.com/bucket/file.csv'))
        .toBe('google-cloud-storage');
    });

    it('should detect Azure Blob Storage', () => {
      expect(httpClient.detectProvider('https://account.blob.core.windows.net/container/file.json'))
        .toBe('azure-blob');
    });

    it('should default to AWS S3 for unknown providers', () => {
      expect(httpClient.detectProvider('https://unknown-storage.com/file.data'))
        .toBe('aws-s3');
    });
  });

  describe('retry functionality', () => {
    it('should retry on retryable errors', async () => {
      const networkError = new Error('Network error');
      const successResponse = new Response('success', { status: 200 });
      
      (fetch as any)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const response = await httpClient.fetchWithRetry('https://example.com/data', undefined, 1);
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(200);
    });

    it('should not retry on non-retryable errors', async () => {
      const authError = new Error('Unauthorized');
      (fetch as any).mockRejectedValueOnce(authError);

      await expect(
        httpClient.fetchWithRetry('https://example.com/data', undefined, 2)
      ).rejects.toThrow('Unauthorized');
      
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('CORS-aware fetching', () => {
    it('should use direct fetch when CORS is supported', async () => {
      const mockResponse = new Response('test data', { status: 200 });
      (fetch as any)
        .mockResolvedValueOnce(new Response(null, { status: 200 })) // HEAD request
        .mockResolvedValueOnce(mockResponse); // Actual request

      const response = await httpClient.fetchWithCorsHandling('https://cors-enabled.example.com/data');
      
      expect(response.status).toBe(200);
    });
  });

  describe('cache management', () => {
    it('should allow clearing CORS cache', () => {
      httpClient.clearCorsCache();
      expect(httpClient.getCorsCache().size).toBe(0);
    });
  });
});