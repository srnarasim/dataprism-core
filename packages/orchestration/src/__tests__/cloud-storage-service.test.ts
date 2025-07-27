import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudStorageService, FileHandle } from '../cloud-storage-service.js';
import { DataPrismHttpClient } from '../http-client.js';
import { CloudStorageError } from '../types.js';

// Mock the HTTP client
vi.mock('../http-client.js');

describe('CloudStorageService', () => {
  let cloudStorage: CloudStorageService;
  let mockHttpClient: any;

  beforeEach(() => {
    mockHttpClient = {
      fetchWithCorsHandling: vi.fn(),
      detectProvider: vi.fn(),
      proxyService: {
        fetch: vi.fn()
      }
    };
    cloudStorage = new CloudStorageService(mockHttpClient);
  });

  describe('file access', () => {
    it('should get file successfully', async () => {
      const mockResponse = new Response('file content', {
        status: 200,
        headers: new Headers({
          'content-length': '12',
          'content-type': 'text/plain',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
          'etag': '"123456"'
        })
      });
      
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');
      mockHttpClient.fetchWithCorsHandling.mockResolvedValue(mockResponse);

      const file = await cloudStorage.getFile('https://my-bucket.s3.amazonaws.com/test.txt');

      expect(file).toBeInstanceOf(FileHandle);
      expect(file.provider).toBe('aws-s3');
      expect(file.metadata.size).toBe(12);
      expect(file.metadata.contentType).toBe('text/plain');
    });

    it('should handle file access errors', async () => {
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');
      mockHttpClient.fetchWithCorsHandling.mockResolvedValue(new Response(null, { status: 404 }));

      await expect(
        cloudStorage.getFile('https://my-bucket.s3.amazonaws.com/nonexistent.txt')
      ).rejects.toThrow(CloudStorageError);
    });

    it('should use direct fetch when specified', async () => {
      const mockResponse = new Response('content', { status: 200 });
      mockHttpClient.fetch = vi.fn().mockResolvedValue(mockResponse);
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');

      await cloudStorage.getFile('https://example.com/file.txt', { corsHandling: 'direct' });

      expect(mockHttpClient.fetch).toHaveBeenCalled();
      expect(mockHttpClient.fetchWithCorsHandling).not.toHaveBeenCalled();
    });

    it('should use proxy fetch when specified', async () => {
      const mockResponse = new Response('content', { status: 200 });
      mockHttpClient.proxyService.fetch.mockResolvedValue(mockResponse);
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');

      await cloudStorage.getFile('https://example.com/file.txt', { corsHandling: 'proxy' });

      expect(mockHttpClient.proxyService.fetch).toHaveBeenCalled();
      expect(mockHttpClient.fetchWithCorsHandling).not.toHaveBeenCalled();
    });
  });

  describe('file schema detection', () => {
    it('should detect CSV schema', async () => {
      const csvContent = 'name,age,city\nJohn,30,NYC\nJane,25,LA';
      const mockResponse = new Response(csvContent, {
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' })
      });
      
      mockHttpClient.fetchWithCorsHandling.mockResolvedValue(mockResponse);
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');

      const schema = await cloudStorage.getFileSchema('https://example.com/data.csv');

      expect(schema.format).toBe('csv');
      expect(schema.columns).toHaveLength(3);
      expect(schema.columns[0].name).toBe('name');
      expect(schema.columns[1].name).toBe('age');
      expect(schema.columns[2].name).toBe('city');
    });

    it('should detect JSON schema', async () => {
      const jsonContent = '[{"id": 1, "name": "test", "active": true}]';
      const mockResponse = new Response(jsonContent, {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' })
      });
      
      mockHttpClient.fetchWithCorsHandling.mockResolvedValue(mockResponse);
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');

      const schema = await cloudStorage.getFileSchema('https://example.com/data.json');

      expect(schema.format).toBe('json');
      expect(schema.columns).toHaveLength(3);
      expect(schema.columns.find(col => col.name === 'id')?.type).toBe('number');
      expect(schema.columns.find(col => col.name === 'name')?.type).toBe('string');
      expect(schema.columns.find(col => col.name === 'active')?.type).toBe('boolean');
    });

    it('should cache schema results', async () => {
      const mockResponse = new Response('name,age\nJohn,30', {
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' })
      });
      
      mockHttpClient.fetchWithCorsHandling.mockResolvedValue(mockResponse);
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');

      const url = 'https://example.com/data.csv';
      await cloudStorage.getFileSchema(url);
      await cloudStorage.getFileSchema(url); // Second call should use cache

      expect(mockHttpClient.fetchWithCorsHandling).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple file access', () => {
    it('should fetch multiple files successfully', async () => {
      const mockResponse1 = new Response('content1', { status: 200 });
      const mockResponse2 = new Response('content2', { status: 200 });
      
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');
      mockHttpClient.fetchWithCorsHandling
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const files = await cloudStorage.getMultipleFiles([
        'https://example.com/file1.txt',
        'https://example.com/file2.txt'
      ]);

      expect(files).toHaveLength(2);
      expect(files[0]).toBeInstanceOf(FileHandle);
      expect(files[1]).toBeInstanceOf(FileHandle);
    });

    it('should handle partial failures in batch requests', async () => {
      const mockResponse = new Response('content', { status: 200 });
      const error = new Error('Network error');
      
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');
      mockHttpClient.fetchWithCorsHandling
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValueOnce(error);

      const files = await cloudStorage.getMultipleFiles([
        'https://example.com/file1.txt',
        'https://example.com/file2.txt'
      ]);

      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(FileHandle);
    });

    it('should throw error when all files fail', async () => {
      const error = new Error('Network error');
      
      mockHttpClient.detectProvider.mockReturnValue('aws-s3');
      mockHttpClient.fetchWithCorsHandling.mockRejectedValue(error);

      await expect(
        cloudStorage.getMultipleFiles([
          'https://example.com/file1.txt',
          'https://example.com/file2.txt'
        ])
      ).rejects.toThrow(CloudStorageError);
    });
  });

  describe('provider configuration', () => {
    it('should configure cloud provider', () => {
      const config = {
        authMethod: 'api-key' as const,
        credentials: { apiKey: 'test-key' }
      };

      cloudStorage.configureProvider('aws-s3', config);

      // Should not throw and configuration should be stored
      expect(() => cloudStorage.configureProvider('aws-s3', config)).not.toThrow();
    });

    it('should set credentials for provider', () => {
      const credentials = {
        accessKeyId: 'test-key-id',
        secretAccessKey: 'test-secret'
      };

      cloudStorage.setCredentials('aws-s3', credentials);

      // Should not throw and credentials should be stored
      expect(() => cloudStorage.setCredentials('aws-s3', credentials)).not.toThrow();
    });
  });

  describe('provider detection', () => {
    it('should delegate provider detection to HTTP client', () => {
      mockHttpClient.detectProvider.mockReturnValue('cloudflare-r2');

      const provider = cloudStorage.detectProvider('https://pub-123.r2.dev/file.json');

      expect(mockHttpClient.detectProvider).toHaveBeenCalledWith('https://pub-123.r2.dev/file.json');
      expect(provider).toBe('cloudflare-r2');
    });
  });

  describe('CORS support testing', () => {
    it('should delegate CORS testing to HTTP client', async () => {
      const corsSupport = {
        supportsDirectAccess: true,
        requiresProxy: false,
        supportedMethods: ['GET'],
        maxFileSize: 1024
      };
      
      mockHttpClient.testCorsSupport.mockResolvedValue(corsSupport);

      const result = await cloudStorage.testCorsSupport('https://example.com/test');

      expect(mockHttpClient.testCorsSupport).toHaveBeenCalledWith('https://example.com/test');
      expect(result).toEqual(corsSupport);
    });
  });
});

describe('FileHandle', () => {
  let fileHandle: FileHandle;
  let mockResponse: Response;

  beforeEach(() => {
    mockResponse = new Response('test content', {
      status: 200,
      headers: new Headers({
        'content-type': 'text/plain',
        'content-length': '12'
      })
    });

    const metadata = {
      size: 12,
      contentType: 'text/plain',
      provider: 'aws-s3' as const
    };

    fileHandle = new FileHandle('https://example.com/test.txt', mockResponse, 'aws-s3', metadata);
  });

  it('should get content as buffer', async () => {
    const buffer = await fileHandle.getContentAsBuffer();
    expect(buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('should get content as text', async () => {
    const text = await fileHandle.getContentAsText();
    expect(text).toBe('test content');
  });

  it('should create read stream', async () => {
    const stream = await fileHandle.createReadStream();
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it('should clone file handle', () => {
    const cloned = fileHandle.clone();
    expect(cloned).toBeInstanceOf(FileHandle);
    expect(cloned.url).toBe(fileHandle.url);
    expect(cloned.provider).toBe(fileHandle.provider);
  });

  it('should throw error if response body already consumed', async () => {
    await fileHandle.getContentAsText(); // Consume the body
    
    await expect(fileHandle.getContentAsBuffer()).rejects.toThrow(
      'Response body has already been consumed'
    );
  });
});