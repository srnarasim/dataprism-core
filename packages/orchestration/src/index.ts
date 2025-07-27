export { DataPrismEngine } from "./engine.js";
export { DuckDBManager } from "./duckdb-manager.js";
export { ErrorHandler } from "./error-handler.js";
export { DependencyRegistry } from "./dependency-registry.js";
export { ArrowLoader } from "./arrow-loader.js";
export { DependencyErrorHandler } from "./dependency-error-handler.js";
export { DependencyEventSystem } from "./dependency-events.js";

// Cloud Storage Services
export { DataPrismHttpClient } from "./http-client.js";
export { ProxyService } from "./proxy-service.js";
export { CloudStorageService, FileHandle } from "./cloud-storage-service.js";
export { DuckDBCloudIntegration } from "./duckdb-cloud-integration.js";

// Advanced Features
export { CacheManager, FileSchemaCache, HttpResponseCache, QueryResultCache } from "./cache-manager.js";
export { AuthManager } from "./auth-manager.js";
export { PerformanceOptimizer } from "./performance-optimizer.js";

// Plugin System (Enhanced)
export { PluginContextBuilder, PluginMigrationSupport, PluginCloudStorageHelper } from "./plugin-context.js";

// Plugin System Exports - Note: Plugin system is now in separate @dataprism/plugins package
// These exports are temporarily disabled until proper package dependency is established
// export { ... } from "@dataprism/plugins";

export type {
  DataPrismConfig,
  QueryResult,
  QueryMetadata,
  DataPrismError,
  PerformanceMetrics,
  EngineStatus,
  Logger,
  LogLevel,
  // Cloud Storage Types
  CloudProvider,
  CorsSupport,
  HttpClientConfig,
  ProxyConfig,
  ProxyEndpoint,
  CachedResponse,
  ProviderConfig,
  CloudCredentials,
  FileAccessOptions,
  FileMetadata,
  FileSchema,
  CloudStorageError,
} from "./types.js";

// Plugin System Types - Note: Plugin system is now in separate @dataprism/plugins package
// These type exports are temporarily disabled until proper package dependency is established
// export type { ... } from "@dataprism/plugins";

export type {
  DependencyState,
  DependencyMetadata,
  DependencyLoadOptions,
  DependencyEvent,
  DependencyEventHandler,
} from "./dependency-registry.js";

export type {
  ArrowModule,
} from "./arrow-loader.js";

export type {
  EnhancedError,
} from "./dependency-error-handler.js";

export type {
  DataPrismEventType,
  DataPrismEvent,
  DataPrismEventHandler,
} from "./dependency-events.js";

export type {
  CloudTableOptions,
  CloudTableConfig,
  FallbackStrategy,
} from "./duckdb-cloud-integration.js";

export type {
  PluginContext,
  EnhancedPluginContext,
  CorsStrategy,
} from "./plugin-context.js";

// Version information
export const version = "0.1.0";
export const name = "DataPrism Core";

// Re-export classes
import { DataPrismEngine } from "./engine.js";
import type { DataPrismConfig } from "./types.js";

// Utility functions
export function createEngine(config?: Partial<DataPrismConfig>) {
  return new DataPrismEngine(config);
}

// Export for convenience
export default DataPrismEngine;
