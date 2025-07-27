interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiration: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Size in bytes (estimated)
}

interface CacheConfig {
  maxSize: number; // Max cache size in bytes
  maxAge: number;  // Max age in milliseconds
  maxEntries: number;
  cleanupInterval: number;
}

export class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private currentSize: number = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 100 * 1024 * 1024, // 100MB default
      maxAge: 3600000, // 1 hour default
      maxEntries: 1000,
      cleanupInterval: 300000, // 5 minutes
      ...config
    };

    this.startCleanupTimer();
  }

  set(key: string, data: T, customTtl?: number): void {
    const size = this.estimateSize(data);
    const now = Date.now();
    const ttl = customTtl || this.config.maxAge;

    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentSize -= existing.size;
    }

    // Check if we need to evict entries
    this.evictIfNeeded(size);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiration: now + ttl,
      accessCount: 0,
      lastAccessed: now,
      size
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (now > entry.expiration) {
      this.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  getStats(): {
    size: number;
    entryCount: number;
    hitRate: number;
    currentSizeBytes: number;
    maxSizeBytes: number;
  } {
    const totalAccesses = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    
    const totalRequests = totalAccesses + this.cache.size; // Approximate
    const hitRate = totalRequests > 0 ? totalAccesses / totalRequests : 0;

    return {
      size: this.cache.size,
      entryCount: this.cache.size,
      hitRate,
      currentSizeBytes: this.currentSize,
      maxSizeBytes: this.config.maxSize
    };
  }

  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getExpiredKeys(): string[] {
    const now = Date.now();
    return Array.from(this.cache.entries())
      .filter(([, entry]) => now > entry.expiration)
      .map(([key]) => key);
  }

  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiration) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.delete(key);
    }
  }

  private evictIfNeeded(newEntrySize: number): void {
    // Check size constraint
    while (this.currentSize + newEntrySize > this.config.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Check entry count constraint
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private estimateSize(data: T): number {
    try {
      if (typeof data === 'string') {
        return data.length * 2; // UTF-16 characters are 2 bytes each
      } else if (data instanceof ArrayBuffer) {
        return data.byteLength;
      } else if (data instanceof Uint8Array) {
        return data.byteLength;
      } else if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data).length * 2;
      } else {
        return 100; // Default estimation for primitives
      }
    } catch {
      return 1000; // Conservative estimate if serialization fails
    }
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Specialized cache for different data types
export class FileSchemaCache extends CacheManager<any> {
  constructor() {
    super({
      maxSize: 10 * 1024 * 1024, // 10MB for schema data
      maxAge: 7200000, // 2 hours
      maxEntries: 500,
      cleanupInterval: 600000 // 10 minutes
    });
  }
}

export class HttpResponseCache extends CacheManager<Response> {
  constructor() {
    super({
      maxSize: 50 * 1024 * 1024, // 50MB for HTTP responses
      maxAge: 1800000, // 30 minutes
      maxEntries: 200,
      cleanupInterval: 300000 // 5 minutes
    });
  }

  async setResponse(key: string, response: Response, customTtl?: number): Promise<void> {
    // Clone the response to avoid consuming the body
    const clonedResponse = response.clone();
    this.set(key, clonedResponse, customTtl);
  }
}

export class QueryResultCache extends CacheManager<any[]> {
  constructor() {
    super({
      maxSize: 200 * 1024 * 1024, // 200MB for query results
      maxAge: 900000, // 15 minutes
      maxEntries: 100,
      cleanupInterval: 300000 // 5 minutes
    });
  }

  setCachedQuery(sql: string, params: any[], result: any[], customTtl?: number): void {
    const key = this.generateQueryKey(sql, params);
    this.set(key, result, customTtl);
  }

  getCachedQuery(sql: string, params: any[]): any[] | null {
    const key = this.generateQueryKey(sql, params);
    return this.get(key);
  }

  private generateQueryKey(sql: string, params: any[]): string {
    const normalizedSql = sql.trim().toLowerCase().replace(/\s+/g, ' ');
    const paramsHash = JSON.stringify(params);
    return `${normalizedSql}:${paramsHash}`;
  }
}