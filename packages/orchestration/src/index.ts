export { DataPrismEngine } from "./engine.js";
export { DuckDBManager } from "./duckdb-manager.js";
export { ErrorHandler } from "./error-handler.js";
export { DependencyRegistry } from "./dependency-registry.js";
export { ArrowLoader } from "./arrow-loader.js";
export { DependencyErrorHandler } from "./dependency-error-handler.js";
export { DependencyEventSystem } from "./dependency-events.js";

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
