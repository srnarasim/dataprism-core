import {
  ProxyConfig,
  ProxyEndpoint,
  CachedResponse,
  CloudStorageError,
  CloudProvider
} from './types.js';

export class ProxyService {
  private proxyEndpoints: ProxyEndpoint[] = [];
  private cache: Map<string, CachedResponse> = new Map();
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
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
          headers: new Headers(cached.headers)
        });
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // Select best proxy endpoint
    const proxy = this.selectProxyEndpoint(url);
    if (!proxy) {
      throw new CloudStorageError(
        'No available proxy endpoints for CORS-restricted resource',
        this.detectProvider(url)
      );
    }

    const proxyUrl = `${proxy.endpoint}/fetch?url=${encodeURIComponent(url)}`;
    
    try {
      const response = await fetch(proxyUrl, {
        ...options,
        headers: {
          ...options?.headers,
          'X-Proxy-Authorization': proxy.apiKey || '',
          'X-Original-URL': url,
          ...this.config.corsHeaders
        }
      });

      if (!response.ok) {
        throw new Error(`Proxy request failed: ${response.status} ${response.statusText}`);
      }

      // Cache successful responses
      if (response.ok && options?.method !== 'HEAD') {
        await this.cacheResponse(cacheKey, response.clone());
      }

      return response;
    } catch (error) {
      // Reduce proxy health score on failure
      proxy.healthScore = Math.max(0, proxy.healthScore - 10);
      
      // Try next available proxy if current one fails
      const nextProxy = this.selectProxyEndpoint(url, [proxy]);
      if (nextProxy && proxy !== nextProxy) {
        return this.fetch(url, options);
      }
      
      throw new CloudStorageError(
        `Proxy service failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.detectProvider(url),
        'PROXY_FAILED'
      );
    }
  }

  addProxyEndpoint(endpoint: ProxyEndpoint): void {
    this.proxyEndpoints.push(endpoint);
    this.sortProxyEndpoints();
  }

  removeProxyEndpoint(endpointUrl: string): void {
    this.proxyEndpoints = this.proxyEndpoints.filter(
      proxy => proxy.endpoint !== endpointUrl
    );
  }

  getProxyEndpoints(): ProxyEndpoint[] {
    return [...this.proxyEndpoints];
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; hitRate: number } {
    const totalRequests = this.cache.size;
    const hitCount = Array.from(this.cache.values()).filter(
      cached => !this.isCacheExpired(cached)
    ).length;
    
    return {
      size: this.cache.size,
      hitRate: totalRequests > 0 ? hitCount / totalRequests : 0
    };
  }

  private initializeProxyEndpoints(config: ProxyConfig): void {
    // Initialize with default endpoints if none provided
    if (!config.endpoints || config.endpoints.length === 0) {
      this.proxyEndpoints = [
        {
          endpoint: 'https://cors-anywhere.herokuapp.com',
          priority: 1,
          healthScore: 50 // Start with medium health
        },
        {
          endpoint: 'https://api.allorigins.win/get?url=',
          priority: 2,
          healthScore: 50
        }
      ];
    } else {
      this.proxyEndpoints = [...config.endpoints];
    }
    
    this.sortProxyEndpoints();
  }

  private selectProxyEndpoint(url: string, exclude: ProxyEndpoint[] = []): ProxyEndpoint | null {
    const availableProxies = this.proxyEndpoints.filter(
      proxy => !exclude.includes(proxy) && proxy.healthScore > 0
    );

    if (availableProxies.length === 0) {
      return null;
    }

    // Select proxy with highest health score and priority
    return availableProxies.reduce((best, current) => {
      const bestScore = best.healthScore * best.priority;
      const currentScore = current.healthScore * current.priority;
      return currentScore > bestScore ? current : best;
    });
  }

  private sortProxyEndpoints(): void {
    this.proxyEndpoints.sort((a, b) => {
      // Sort by health score first, then by priority
      if (a.healthScore !== b.healthScore) {
        return b.healthScore - a.healthScore;
      }
      return a.priority - b.priority;
    });
  }

  private getCacheKey(url: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const headers = JSON.stringify(options?.headers || {});
    return `${method}:${url}:${headers}`;
  }

  private isCacheExpired(cached: CachedResponse): boolean {
    return Date.now() > cached.expiration;
  }

  private async cacheResponse(cacheKey: string, response: Response): Promise<void> {
    try {
      const body = await response.arrayBuffer();
      const headers: Record<string, string> = {};
      
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const cached: CachedResponse = {
        body,
        status: response.status,
        headers,
        timestamp: Date.now(),
        expiration: Date.now() + this.config.cacheDuration
      };

      this.cache.set(cacheKey, cached);

      // Clean up expired entries periodically
      if (this.cache.size > 100) {
        this.cleanupExpiredCache();
      }
    } catch (error) {
      console.warn('Failed to cache proxy response:', error);
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiration) {
        this.cache.delete(key);
      }
    }
  }

  private detectProvider(url: string): CloudProvider {
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
      return 'aws-s3'; // Default fallback
    }
  }
}