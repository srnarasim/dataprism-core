export interface DataPrismError {
  message: string;
  code: string;
  source: "wasm" | "duckdb" | "orchestration";
}

export interface PerformanceMetrics {
  queryCount: number;
  totalExecutionTime: number;
  averageResponseTime: number;
  memoryPeakUsage: number;
  cacheHitRate?: number;
}

export interface EngineStatus {
  initialized: boolean;
  wasmModuleLoaded: boolean;
  duckdbConnected: boolean;
  memoryUsage: number;
  uptime: number;
  dependencies?: {
    duckdb: boolean;
    arrow: boolean;
    wasm: boolean;
    overall: boolean;
  };
  dependencyHealth?: {
    totalDependencies: number;
    readyCount: number;
    errorCount: number;
    healthScore: number;
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface QueryMetadata {
  rowCount: number;
  executionTime: number;
  memoryUsage: number;
}

export interface QueryResult<T = any> {
  data: T[];
  metadata: QueryMetadata;
  error?: DataPrismError;
}

export interface DataPrismConfig {
  enableWasmOptimizations: boolean;
  maxMemoryMB: number;
  queryTimeoutMs: number;
  logLevel?: LogLevel;
  duckdbConfig?: {
    maxThreads?: number;
    maxMemory?: string;
  };
  dependencyConfig?: {
    timeoutMs?: number;
    maxRetries?: number;
    retryDelay?: number;
    preloadDependencies?: boolean;
    enableProgressEvents?: boolean;
  };
  corsConfig?: {
    strategy?: 'auto' | 'direct' | 'proxy';
    proxyEndpoint?: string;
    cacheTimeout?: number;
    retryAttempts?: number;
  };
  cloudProviders?: Record<CloudProvider, ProviderConfig>;
}

// Cloud Storage Types
export type CloudProvider = 'aws-s3' | 'cloudflare-r2' | 'google-cloud-storage' | 'azure-blob';

export interface CorsSupport {
  supportsDirectAccess: boolean;
  requiresProxy: boolean;
  supportedMethods: string[];
  maxFileSize?: number;
}

export interface HttpClientConfig {
  proxy?: ProxyConfig;
  timeout?: number;
  retries?: number;
}

export interface ProxyConfig {
  enableForProviders: CloudProvider[];
  maxFileSize: number;
  cacheDuration: number;
  authPassthrough: boolean;
  corsHeaders: Record<string, string>;
  endpoints?: ProxyEndpoint[];
}

export interface ProxyEndpoint {
  endpoint: string;
  apiKey?: string;
  priority: number;
  healthScore: number;
}

export interface CachedResponse {
  body: ArrayBuffer;
  status: number;
  headers: Record<string, string>;
  timestamp: number;
  expiration: number;
}

export interface ProviderConfig {
  authMethod?: 'iam-role' | 'api-key' | 'oauth2';
  region?: string;
  accountId?: string;
  credentials?: CloudCredentials;
}

export interface CloudCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  apiKey?: string;
  oauth2Token?: string;
}

export interface FileAccessOptions {
  requestOptions?: RequestInit;
  corsHandling?: 'direct' | 'proxy' | 'auto';
  cacheSchema?: boolean;
  streamingMode?: boolean;
}

export interface FileMetadata {
  size: number;
  contentType: string;
  lastModified?: Date;
  etag?: string;
  provider: CloudProvider;
}

export interface FileSchema {
  columns: Array<{
    name: string;
    type: string;
  }>;
  rowCount?: number;
  format: 'parquet' | 'csv' | 'json' | 'arrow';
}

export class CloudStorageError extends Error {
  constructor(
    message: string,
    public provider: CloudProvider,
    public code?: string
  ) {
    super(message);
    this.name = 'CloudStorageError';
  }
}
