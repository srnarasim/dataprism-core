# DataPrism Core Architecture

## Overview

DataPrism Core serves as the foundational WebAssembly-powered analytics engine with TypeScript orchestration. It provides high-performance data processing capabilities through a hybrid Rust/WASM core and JavaScript coordination layer.

## Repository Structure

```
dataprism-core/
├── packages/
│   ├── src/                    # Rust WASM core
│   │   ├── lib.rs             # Main WASM module
│   │   ├── memory_manager.rs   # Memory management
│   │   ├── query_engine.rs     # Query processing
│   │   └── utils.rs           # Utility functions
│   ├── pkg/                   # wasm-pack output
│   └── orchestration/         # TypeScript orchestration layer
│       └── src/
│           ├── engine.ts       # Main engine orchestration
│           ├── duckdb-manager.ts # DuckDB integration
│           ├── types.ts        # TypeScript type definitions
│           └── dependency-registry.ts # Dependency management
├── dist/                      # Build outputs
├── tests/                     # Integration tests
├── docs/                      # Documentation
└── PRPs/                      # Product Requirements Prompts
```

## Core Architecture Patterns

### 1. Hybrid Language Architecture

**Rust WASM Core**:
- High-performance computation engine
- Memory-safe operations with controlled allocation
- WebAssembly compilation for browser execution
- Cross-language interoperability via wasm-bindgen

**TypeScript Orchestration**:
- Coordination between WASM modules and browser APIs
- Dependency loading and lifecycle management
- Error handling and logging
- Integration with external services

### 2. Component Architecture

#### **DataPrismEngine** (Primary Orchestrator)
```typescript
class DataPrismEngine {
  // Core dependencies
  private duckdb: DuckDBManager | null = null;
  private wasmEngine: any = null;
  private dependencyRegistry: DependencyRegistry;
  
  // Lifecycle management
  async initialize(): Promise<void>
  async cleanup(): Promise<void>
  
  // Core operations
  async query(sql: string): Promise<QueryResult>
  getStatus(): EngineStatus
}
```

#### **DuckDBManager** (Analytics Backend)
```typescript
class DuckDBManager {
  // High-performance analytical queries
  async query<T>(sql: string): Promise<QueryResult<T>>
  async insertData(tableName: string, data: any[]): Promise<void>
  
  // Schema management
  async createTable(tableName: string, schema: Record<string, string>): Promise<void>
  async listTables(): Promise<string[]>
}
```

#### **DependencyRegistry** (Dependency Management)
```typescript
class DependencyRegistry {
  // Asynchronous dependency loading
  async loadDependency(name: string, loader: () => Promise<any>): Promise<void>
  async waitForReady(dependencies?: string[]): Promise<void>
  
  // Health monitoring
  getHealthStatus(): { healthScore: number; errorCount: number }
}
```

### 3. Performance Patterns

#### **Memory Management**
- WASM module size limits: <6MB for optimal loading
- Shared memory patterns for large dataset processing
- Automatic cleanup and garbage collection coordination
- Memory usage monitoring and limits

#### **Query Performance**
- Target: <2 seconds for 95% of analytical queries
- DuckDB-WASM integration for columnar processing
- Arrow format for efficient data exchange
- Query result caching and optimization

#### **Initialization Performance**
- Dependency preloading and parallel initialization
- CDN-optimized loading with intelligent fallbacks
- Progressive enhancement for better user experience
- <5 second initialization time target

### 4. Error Handling Patterns

#### **Cross-Language Error Management**
```typescript
interface DataPrismError {
  message: string;
  code: string;
  source: "wasm" | "duckdb" | "orchestration";
}

class ErrorHandler {
  static handleError(error: any, source: string): DataPrismError
  static safeWasmCall<T>(operation: () => Promise<T>): Promise<T>
}
```

#### **Graceful Degradation**
- WASM compilation fallbacks
- Dependency loading failure recovery
- Progressive feature availability
- User-friendly error messages

### 5. Build and Distribution Patterns

#### **Multi-Target Builds**
```bash
# WASM compilation
npm run build:wasm          # Rust → WASM via wasm-pack

# TypeScript compilation  
npm run build:orchestration # TS → ES modules

# CDN bundle creation
npm run build:bundles       # Optimized bundles for CDN
```

#### **CDN Distribution Strategy**
- GitHub Pages hosting for global CDN
- Bundle optimization with tree shaking
- Version management and rollback capabilities
- Performance monitoring and analytics

### 6. Integration Patterns

#### **Plugin System Interface**
- Plugin registration and lifecycle management
- Sandbox environment with resource quotas
- Event-driven architecture for plugin communication
- Version compatibility management

#### **External Service Integration**
- DuckDB-WASM for analytical processing
- Apache Arrow for efficient data exchange
- LLM provider abstraction for intelligent analysis
- CDN fallback strategies for reliability

## Development Patterns

### 1. Code Organization

#### **Separation of Concerns**
- **Core Logic**: Rust implementations for performance-critical operations
- **Orchestration**: TypeScript for coordination and integration
- **Configuration**: JSON/TOML for declarative configuration
- **Documentation**: Markdown with live examples

#### **Module Boundaries**
- Clear interfaces between WASM and JavaScript
- Async/await patterns for all I/O operations
- Type safety with comprehensive TypeScript definitions
- Error boundaries with proper exception handling

### 2. Testing Strategy

#### **Multi-Layer Testing**
```bash
# Rust unit tests
cargo test

# TypeScript unit tests  
npm run test:ts

# Integration tests
npm run test:integration

# Performance benchmarks
npm run test:performance
```

#### **Browser Compatibility Testing**
- Target browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- WebAssembly MVP specification compliance
- Feature detection and progressive enhancement
- Cross-platform testing automation

### 3. Performance Monitoring

#### **Metrics Collection**
```typescript
interface PerformanceMetrics {
  queryCount: number;
  averageResponseTime: number;
  memoryPeakUsage: number;
  cacheHitRate?: number;
}
```

#### **Monitoring Targets**
- Query execution time: <2s for 95% of operations
- Memory usage: <4GB for 1M row datasets  
- Initialization time: <5s for engine startup
- Bundle size: Optimized for fast CDN delivery

## Security Patterns

### 1. WASM Sandbox Security
- Memory isolation through WebAssembly runtime
- No direct file system or network access from WASM
- Controlled data flow between JavaScript and WASM
- Input validation and sanitization

### 2. CDN Security
- Content Security Policy (CSP) compliance
- Subresource Integrity (SRI) for CDN assets
- HTTPS-only distribution
- Version pinning for security patches

## Future Architecture Considerations

### 1. Scalability Patterns
- WebWorker integration for heavy computations
- Streaming data processing capabilities
- Multi-core utilization strategies
- Cloud integration for large-scale processing

### 2. Extension Points
- Plugin API for custom functionality
- Custom function registration
- Data source connector framework
- Visualization engine integration

This architecture provides a solid foundation for high-performance, browser-based analytics while maintaining flexibility for future enhancements and integrations.