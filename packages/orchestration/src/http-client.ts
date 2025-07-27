import {
  HttpClientConfig,
  CorsSupport,
  CloudProvider
} from './types.js';
import { ProxyService } from './proxy-service.js';

export class DataPrismHttpClient {
  private corsCache = new Map<string, CorsSupport>();
  private proxyService: ProxyService;
  private timeout: number;
  private retries: number;

  constructor(config: HttpClientConfig = {}) {
    this.proxyService = new ProxyService(config.proxy || this.getDefaultProxyConfig());
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
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
    const cacheKey = this.getCorsKey(url);
    if (this.corsCache.has(cacheKey)) {
      return this.corsCache.get(cacheKey)!;
    }

    let corsSupport: CorsSupport;

    try {
      // Test with a HEAD request to avoid downloading data
      const response = await this.fetch(url, { method: 'HEAD' });
      corsSupport = {
        supportsDirectAccess: true,
        requiresProxy: false,
        supportedMethods: this.parseAllowedMethods(response),
        maxFileSize: this.parseMaxFileSize(response)
      };
    } catch (error) {
      // Check if it's specifically a CORS error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      const isCorsError = errorMessage.includes('cors') || 
                         errorMessage.includes('cross-origin') ||
                         errorMessage.includes('access-control');

      corsSupport = {
        supportsDirectAccess: false,
        requiresProxy: true,
        supportedMethods: [],
        maxFileSize: undefined
      };

      // If it's not a CORS error, it might be a different issue
      if (!isCorsError) {
        console.warn(`Non-CORS error testing ${url}:`, error);
      }
    }

    this.corsCache.set(cacheKey, corsSupport);
    return corsSupport;
  }

  async fetchWithRetry(url: string, options?: RequestInit, retries = this.retries): Promise<Response> {
    try {
      return await this.fetchWithCorsHandling(url, options);
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        const delay = Math.pow(2, this.retries - retries) * 1000; // Exponential backoff
        await this.sleep(delay);
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw error;
    }
  }

  detectProvider(url: string): CloudProvider {
    const hostname = new URL(url).hostname.toLowerCase();
    
    if (hostname.includes('amazonaws.com') || hostname.includes('s3.')) {
      return 'aws-s3';
    } else if (hostname.includes('r2.dev') || hostname.includes('r2.cloudflarestorage.com')) {
      return 'cloudflare-r2';
    } else if (hostname.includes('googleapis.com') || hostname.includes('storage.cloud.google.com')) {
      return 'google-cloud-storage';
    } else if (hostname.includes('blob.core.windows.net')) {
      return 'azure-blob';
    } else {
      // Default to AWS S3 for unknown providers
      return 'aws-s3';
    }
  }

  clearCorsCache(): void {
    this.corsCache.clear();
  }

  getCorsCache(): Map<string, CorsSupport> {
    return new Map(this.corsCache);
  }

  private getCorsKey(url: string): string {
    // Use hostname + pathname (without query params) as cache key
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname}`;
  }

  private parseAllowedMethods(response: Response): string[] {
    const allowHeader = response.headers.get('Access-Control-Allow-Methods');
    if (!allowHeader) {
      return ['GET']; // Assume GET is allowed if no header present
    }
    return allowHeader.split(',').map(method => method.trim().toUpperCase());
  }

  private parseMaxFileSize(response: Response): number | undefined {
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      return parseInt(contentLength, 10);
    }
    
    // Check for custom headers that might indicate size limits
    const maxSizeHeader = response.headers.get('X-Max-File-Size') || 
                         response.headers.get('X-Content-Size-Limit');
    if (maxSizeHeader) {
      return parseInt(maxSizeHeader, 10);
    }
    
    return undefined;
  }

  private isRetryableError(error: any): boolean {
    if (!(error instanceof Error)) return false;
    
    const message = error.message.toLowerCase();
    const retryableErrors = [
      'network',
      'timeout',
      'connection',
      'temporary',
      'service unavailable',
      'too many requests'
    ];
    
    return retryableErrors.some(errorType => message.includes(errorType));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getDefaultProxyConfig() {
    return {
      enableForProviders: ['aws-s3', 'cloudflare-r2', 'google-cloud-storage', 'azure-blob'] as CloudProvider[],
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      cacheDuration: 3600000, // 1 hour
      authPassthrough: true,
      corsHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization'
      }
    };
  }
}