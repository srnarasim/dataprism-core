import {
  CloudProvider,
  ProviderConfig,
  FileAccessOptions,
  FileMetadata,
  FileSchema,
  CloudCredentials,
  CloudStorageError
} from './types.js';
import { DataPrismHttpClient } from './http-client.js';

export class FileHandle {
  constructor(
    public readonly url: string,
    private response: Response,
    public readonly provider: CloudProvider,
    public readonly metadata: FileMetadata
  ) {}

  async getContentAsBuffer(): Promise<ArrayBuffer> {
    if (this.response.bodyUsed) {
      throw new Error('Response body has already been consumed');
    }
    return await this.response.arrayBuffer();
  }

  async getContentAsText(): Promise<string> {
    if (this.response.bodyUsed) {
      throw new Error('Response body has already been consumed');
    }
    return await this.response.text();
  }

  async createReadStream(): Promise<ReadableStream<Uint8Array>> {
    if (!this.response.body) {
      throw new Error('Response body is not available');
    }
    if (this.response.bodyUsed) {
      throw new Error('Response body has already been consumed');
    }
    return this.response.body;
  }

  clone(): FileHandle {
    return new FileHandle(this.url, this.response.clone(), this.provider, this.metadata);
  }
}

export class CloudStorageService {
  private httpClient: DataPrismHttpClient;
  private providers: Map<CloudProvider, ProviderConfig> = new Map();
  private schemaCache: Map<string, FileSchema> = new Map();

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

    // Choose fetch method based on CORS handling preference
    let response: Response;
    if (options?.corsHandling === 'direct') {
      response = await this.httpClient.fetch(url, requestOptions);
    } else if (options?.corsHandling === 'proxy') {
      response = await this.httpClient.proxyService.fetch(url, requestOptions);
    } else {
      // Auto mode - try CORS-aware fetching
      response = await this.httpClient.fetchWithCorsHandling(url, requestOptions);
    }

    if (!response.ok) {
      throw new CloudStorageError(
        `Failed to access file: ${response.status} ${response.statusText}`,
        provider,
        `HTTP_${response.status}`
      );
    }

    const metadata = this.extractMetadata(response, provider);
    return new FileHandle(url, response, provider, metadata);
  }

  async getFileSchema(url: string): Promise<FileSchema> {
    // Check cache first
    if (this.schemaCache.has(url)) {
      return this.schemaCache.get(url)!;
    }

    try {
      // Try to get schema from just the file headers first
      const headResponse = await this.httpClient.fetchWithCorsHandling(url, { method: 'HEAD' });
      const contentType = headResponse.headers.get('content-type') || '';
      
      if (contentType.includes('parquet')) {
        // For Parquet files, we need to read the footer
        return await this.getParquetSchema(url);
      } else if (contentType.includes('csv')) {
        return await this.getCsvSchema(url);
      } else if (contentType.includes('json')) {
        return await this.getJsonSchema(url);
      } else {
        // Try to detect format from file extension
        const format = this.detectFileFormat(url);
        switch (format) {
          case 'parquet':
            return await this.getParquetSchema(url);
          case 'csv':
            return await this.getCsvSchema(url);
          case 'json':
            return await this.getJsonSchema(url);
          default:
            throw new CloudStorageError(
              `Unsupported file format: ${format}`,
              this.detectProvider(url),
              'UNSUPPORTED_FORMAT'
            );
        }
      }
    } catch (error) {
      throw new CloudStorageError(
        `Failed to get file schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.detectProvider(url),
        'SCHEMA_ERROR'
      );
    }
  }

  async getMultipleFiles(urls: string[]): Promise<FileHandle[]> {
    const promises = urls.map(url => this.getFile(url));
    const results = await Promise.allSettled(promises);
    
    const files: FileHandle[] = [];
    const errors: Error[] = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        files.push(result.value);
      } else {
        errors.push(new Error(`Failed to fetch ${urls[index]}: ${result.reason}`));
      }
    });
    
    if (errors.length > 0 && files.length === 0) {
      throw new CloudStorageError(
        `All file requests failed: ${errors.map(e => e.message).join(', ')}`,
        'aws-s3', // Default provider for batch errors
        'BATCH_FAILED'
      );
    }
    
    return files;
  }

  configureProvider(provider: CloudProvider, config: ProviderConfig): void {
    this.providers.set(provider, config);
  }

  setCredentials(provider: CloudProvider, credentials: CloudCredentials): void {
    const existing = this.providers.get(provider) || {};
    this.providers.set(provider, {
      ...existing,
      credentials
    });
  }

  detectProvider(url: string): CloudProvider {
    return this.httpClient.detectProvider(url);
  }

  testCorsSupport(url: string) {
    return this.httpClient.testCorsSupport(url);
  }

  clearSchemaCache(): void {
    this.schemaCache.clear();
  }

  getSchemaCache(): Map<string, FileSchema> {
    return new Map(this.schemaCache);
  }

  private extractMetadata(response: Response, provider: CloudProvider): FileMetadata {
    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const lastModified = response.headers.get('last-modified');
    const etag = response.headers.get('etag');

    return {
      size: contentLength ? parseInt(contentLength, 10) : 0,
      contentType,
      lastModified: lastModified ? new Date(lastModified) : undefined,
      etag: etag || undefined,
      provider
    };
  }

  private getAuthHeaders(provider: CloudProvider, config?: ProviderConfig): Record<string, string> {
    if (!config?.credentials) {
      return {};
    }

    const headers: Record<string, string> = {};
    const { credentials } = config;

    switch (config.authMethod) {
      case 'api-key':
        if (credentials.apiKey) {
          if (provider === 'cloudflare-r2') {
            headers['X-Auth-Key'] = credentials.apiKey;
          } else {
            headers['Authorization'] = `Bearer ${credentials.apiKey}`;
          }
        }
        break;
      
      case 'oauth2':
        if (credentials.oauth2Token) {
          headers['Authorization'] = `Bearer ${credentials.oauth2Token}`;
        }
        break;
      
      case 'iam-role':
        // For IAM roles, credentials would typically be handled by the browser/environment
        if (credentials.accessKeyId && credentials.secretAccessKey) {
          // This is a simplified AWS signature - in production, use proper AWS SDK
          headers['Authorization'] = this.createAwsSignature(credentials);
        }
        break;
    }

    return headers;
  }

  private createAwsSignature(credentials: CloudCredentials): string {
    // Simplified AWS signature - in production, use proper AWS SDK
    // This is just a placeholder for the authentication mechanism
    return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/...`;
  }

  private detectFileFormat(url: string): 'parquet' | 'csv' | 'json' | 'arrow' {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'parquet':
        return 'parquet';
      case 'csv':
        return 'csv';
      case 'json':
      case 'jsonl':
        return 'json';
      case 'arrow':
        return 'arrow';
      default:
        return 'parquet'; // Default assumption
    }
  }

  private async getParquetSchema(url: string): Promise<FileSchema> {
    // For Parquet files, we need to read the metadata footer
    // This is a simplified implementation - in production, use proper Parquet library
    const handle = await this.getFile(url, {
      requestOptions: {
        headers: { 'Range': 'bytes=-8192' } // Last 8KB contains footer
      }
    });

    // This is a placeholder - proper Parquet parsing would require a library
    const schema: FileSchema = {
      columns: [
        { name: 'unknown', type: 'string' }
      ],
      format: 'parquet'
    };

    this.schemaCache.set(url, schema);
    return schema;
  }

  private async getCsvSchema(url: string): Promise<FileSchema> {
    // Read first few KB to get column headers
    const handle = await this.getFile(url, {
      requestOptions: {
        headers: { 'Range': 'bytes=0-4096' } // First 4KB
      }
    });

    const text = await handle.getContentAsText();
    const lines = text.split('\n');
    
    if (lines.length === 0) {
      throw new Error('Empty CSV file');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const schema: FileSchema = {
      columns: headers.map(name => ({ name, type: 'string' })), // Assume string type
      format: 'csv'
    };

    this.schemaCache.set(url, schema);
    return schema;
  }

  private async getJsonSchema(url: string): Promise<FileSchema> {
    // Read first few KB to sample the JSON structure
    const handle = await this.getFile(url, {
      requestOptions: {
        headers: { 'Range': 'bytes=0-8192' } // First 8KB
      }
    });

    const text = await handle.getContentAsText();
    
    try {
      // Try to parse as JSON array
      const sample = JSON.parse(text);
      const columns: Array<{ name: string; type: string }> = [];
      
      if (Array.isArray(sample) && sample.length > 0) {
        const firstItem = sample[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          Object.keys(firstItem).forEach(key => {
            const value = firstItem[key];
            const type = typeof value === 'number' ? 'number' : 
                        typeof value === 'boolean' ? 'boolean' : 'string';
            columns.push({ name: key, type });
          });
        }
      }

      const schema: FileSchema = {
        columns: columns.length > 0 ? columns : [{ name: 'data', type: 'string' }],
        format: 'json'
      };

      this.schemaCache.set(url, schema);
      return schema;
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}