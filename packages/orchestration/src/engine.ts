import { DuckDBManager } from "./duckdb-manager.js";
import {
  QueryResult,
  DataPrismConfig,
  EngineStatus,
  PerformanceMetrics,
  HttpClientConfig,
} from "./types.js";
import { ErrorHandler } from "./error-handler.js";
import { DependencyRegistry } from "./dependency-registry.js";
import { ArrowLoader } from "./arrow-loader.js";
import { DataPrismHttpClient } from "./http-client.js";
import { CloudStorageService } from "./cloud-storage-service.js";
import { DuckDBCloudIntegration } from "./duckdb-cloud-integration.js";
import { CacheManager, FileSchemaCache, HttpResponseCache, QueryResultCache } from "./cache-manager.js";
import { AuthManager } from "./auth-manager.js";
import { PerformanceOptimizer } from "./performance-optimizer.js";

// WASM module will be available after build
interface WasmModule {
  QueryEngine: any;
  CloudStorageBridge: any;
  init_panic_hook: () => void;
  get_version: () => string;
  get_build_info: () => any;
}

export class DataPrismEngine {
  private duckdb: DuckDBManager | null = null;
  private wasmEngine: any = null;
  private wasmModule: WasmModule | null = null;
  private config: DataPrismConfig;
  private initialized = false;
  private startTime = Date.now();
  private errorHandler = ErrorHandler.getInstance();
  private dependencyRegistry = DependencyRegistry.getInstance();
  private arrowLoader = ArrowLoader.getInstance();
  
  // Cloud storage services
  private httpClient: DataPrismHttpClient | null = null;
  private cloudStorage: CloudStorageService | null = null;
  private duckdbCloud: DuckDBCloudIntegration | null = null;
  
  // Advanced features
  private cacheManager: CacheManager<any> | null = null;
  private schemaCache: FileSchemaCache | null = null;
  private httpCache: HttpResponseCache | null = null;
  private queryCache: QueryResultCache | null = null;
  private authManager: AuthManager | null = null;
  private performanceOptimizer: PerformanceOptimizer | null = null;
  
  private metrics: PerformanceMetrics = {
    queryCount: 0,
    totalExecutionTime: 0,
    averageResponseTime: 0,
    memoryPeakUsage: 0,
  };

  constructor(config: Partial<DataPrismConfig> = {}) {
    this.config = {
      enableWasmOptimizations: false, // Disable WASM temporarily while fixing bundle issues
      maxMemoryMB: 4096,
      queryTimeoutMs: 30000,
      logLevel: "info",
      ...config,
    };
    // DuckDB manager will be created during initialization to avoid sync issues
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create DuckDB manager during initialization to avoid sync issues
      this.duckdb = new DuckDBManager();
      
      // Initialize dependencies in parallel for better performance
      const initPromises = [];

      // Initialize DuckDB
      initPromises.push(
        this.dependencyRegistry.loadDependency(
          "duckdb",
          () => this.duckdb!.initialize(),
          { timeout: 30000, maxRetries: 3 }
        )
      );

      // Initialize Arrow
      initPromises.push(
        this.arrowLoader.loadArrow().catch(error => {
          this.log("warn", `Arrow initialization failed: ${error.message}`);
          return null;
        })
      );

      // Initialize Cloud Storage services (will wait for DuckDB internally)
      initPromises.push(
        this.initializeCloudStorage().catch(error => {
          this.log("warn", `Cloud storage initialization failed: ${error.message}`);
          return null;
        })
      );

      // Initialize WASM module if available
      if (this.config.enableWasmOptimizations) {
        initPromises.push(
          this.dependencyRegistry.loadDependency(
            "wasm-core",
            () => this.initializeWasm(),
            { timeout: 20000, maxRetries: 2 }
          ).catch(error => {
            this.log("warn", `WASM initialization failed: ${error.message}`);
            this.config.enableWasmOptimizations = false;
            return null;
          })
        );
      }

      // Wait for all dependencies to load
      await Promise.allSettled(initPromises);

      this.initialized = true;
      this.log("info", "DataPrism Engine initialized successfully");
      
      // Log dependency status
      this.logDependencyStatus();
    } catch (error) {
      this.errorHandler.handleError(error, "orchestration");
      throw error;
    }
  }

  private detectCDNBase(): string {
    if (typeof window === "undefined") return "";
    
    // Always use the DataPrism Core CDN for WASM files
    // This ensures we load from the correct location regardless of where the script is hosted
    const defaultCdnBase = 'https://srnarasim.github.io/dataprism-core';
    
    // Try to detect if we're running locally for development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return ''; // Use relative paths for local development
    }
    
    return defaultCdnBase;
  }

  private async initializeWasm(): Promise<void> {
    // Skip WASM initialization during build process
    if (typeof window === "undefined") {
      throw new Error("WASM not available in Node environment");
    }

    try {
      // Try to load WASM module - construct paths dynamically to avoid build-time resolution
      let wasmModule;
      const cdnBase = this.detectCDNBase();
      
      // Try multiple potential WASM module locations
      const possiblePaths = [
        `${cdnBase}/wasm/dataprism_core.js`,
        `/wasm/dataprism_core.js`,
        `./wasm/dataprism_core.js`
      ].filter(path => path && !path.startsWith('/wasm/dataprism_core.js')); // Avoid duplicate relative path
      
      let lastError;
      for (const wasmPath of possiblePaths) {
        try {
          wasmModule = await import(/* @vite-ignore */ wasmPath);
          break;
        } catch (error) {
          lastError = error;
          continue;
        }
      }
      
      if (!wasmModule) {
        throw new Error(`Failed to load WASM module from any location. Last error: ${lastError}`);
      }

      // Try to initialize with CDN WASM file first, then fallback
      try {
        const wasmBinaryPath = `${cdnBase}/wasm/dataprism_core_bg.wasm`;
        await wasmModule.default(wasmBinaryPath);
      } catch (error) {
        // Fallback to default initialization
        await wasmModule.default();
      }

      wasmModule.init_panic_hook();

      this.wasmModule = wasmModule;
      this.wasmEngine = new wasmModule.QueryEngine();

      this.log("info", `WASM module version: ${wasmModule.get_version()}`);
    } catch (error) {
      throw new Error(`WASM initialization failed: ${error}`);
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.initialized) {
      throw new Error("Engine not initialized");
    }

    const startTime = performance.now();
    this.metrics.queryCount++;

    try {
      // Route query through DuckDB for analytical processing
      if (!this.duckdb) {
        throw new Error("Engine not initialized - call initialize() first");
      }
      const result = await this.duckdb.query(sql);

      // Apply WASM optimizations if enabled and beneficial
      if (
        this.config.enableWasmOptimizations &&
        this.wasmEngine &&
        this.shouldUseWasmOptimization(result)
      ) {
        return await this.applyWasmOptimizations(result);
      }

      this.updateMetrics(
        performance.now() - startTime,
        result.metadata.memoryUsage,
      );
      return result;
    } catch (error) {
      this.errorHandler.handleError(error, "orchestration");
      throw error;
    }
  }

  async loadData(data: any[], tableName: string = "main_table"): Promise<void> {
    if (!this.initialized) {
      throw new Error("Engine not initialized");
    }

    try {
      if (!this.duckdb) {
        throw new Error("Engine not initialized - call initialize() first");
      }
      await this.duckdb.insertData(tableName, data);
      this.log("info", `Loaded ${data.length} rows into table ${tableName}`);
    } catch (error) {
      this.errorHandler.handleError(error, "orchestration");
      throw error;
    }
  }

  async createTable(
    tableName: string,
    schema: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("Engine not initialized");
    }

    if (!this.duckdb) {
      throw new Error("Engine not initialized - call initialize() first");
    }
    await this.duckdb.createTable(tableName, schema);
  }

  async listTables(): Promise<string[]> {
    if (!this.initialized) {
      throw new Error("Engine not initialized");
    }

    if (!this.duckdb) {
      throw new Error("Engine not initialized - call initialize() first");
    }
    return await this.duckdb.listTables();
  }

  async getTableInfo(tableName: string): Promise<any[]> {
    if (!this.initialized) {
      throw new Error("Engine not initialized");
    }

    if (!this.duckdb) {
      throw new Error("Engine not initialized - call initialize() first");
    }
    return await this.duckdb.getTableInfo(tableName);
  }

  private shouldUseWasmOptimization(result: QueryResult): boolean {
    // Determine if WASM optimizations would be beneficial
    // For example, large result sets or complex transformations
    return result.data.length > 1000 || result.metadata.executionTime > 1000;
  }

  private async applyWasmOptimizations(
    result: QueryResult,
  ): Promise<QueryResult> {
    if (!this.wasmEngine) {
      return result;
    }

    try {
      // Convert data to bytes for WASM processing
      const dataBytes = new TextEncoder().encode(JSON.stringify(result.data));

      // Process through WASM engine
      const wasmResult = await this.wasmEngine.process_data(dataBytes);

      return {
        data: JSON.parse(wasmResult.data),
        metadata: {
          rowCount: wasmResult.row_count,
          executionTime:
            result.metadata.executionTime + wasmResult.execution_time_ms,
          memoryUsage: Math.max(
            result.metadata.memoryUsage,
            wasmResult.memory_used_bytes,
          ),
        },
      };
    } catch (error) {
      this.log(
        "warn",
        `WASM optimization failed, falling back to original result: ${error}`,
      );
      return result;
    }
  }

  private updateMetrics(executionTime: number, memoryUsage: number): void {
    this.metrics.totalExecutionTime += executionTime;
    this.metrics.averageResponseTime =
      this.metrics.totalExecutionTime / this.metrics.queryCount;
    this.metrics.memoryPeakUsage = Math.max(
      this.metrics.memoryPeakUsage,
      memoryUsage,
    );
  }

  getMemoryUsage(): number {
    if (this.wasmEngine) {
      return this.wasmEngine.get_memory_usage();
    }
    return (performance as any).memory?.usedJSHeapSize || 0;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getStatus(): EngineStatus {
    return {
      initialized: this.initialized,
      wasmModuleLoaded: !!this.wasmModule,
      duckdbConnected: this.duckdb?.isInitialized() ?? false,
      memoryUsage: this.getMemoryUsage(),
      uptime: Date.now() - this.startTime,
      dependencies: this.getDependencyStatus(),
      dependencyHealth: this.getDependencyHealth(),
    };
  }

  getVersion(): string {
    return this.wasmModule?.get_version() || "0.1.0";
  }

  getBuildInfo(): any {
    return (
      this.wasmModule?.get_build_info() || {
        version: "0.1.0",
        source: "typescript",
      }
    );
  }

  private log(level: string, message: string): void {
    if (
      this.config.logLevel === "debug" ||
      (this.config.logLevel === "info" && level !== "debug") ||
      (this.config.logLevel === "warn" &&
        (level === "warn" || level === "error")) ||
      (this.config.logLevel === "error" && level === "error")
    ) {
      console.log(`[DataPrism:${level.toUpperCase()}] ${message}`);
    }
  }

  async waitForReady(dependencies?: string[], timeoutMs: number = 30000): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.dependencyRegistry.waitForReady(dependencies, timeoutMs);
      this.log("info", "All dependencies are ready");
    } catch (error) {
      const healthStatus = this.dependencyRegistry.getHealthStatus();
      this.log("error", `Dependency readiness check failed. Health: ${healthStatus.healthScore}%`);
      throw error;
    }
  }

  async waitForDuckDB(timeoutMs: number = 30000): Promise<void> {
    await this.dependencyRegistry.waitForDependency("duckdb", timeoutMs);
  }

  async waitForArrow(timeoutMs: number = 30000): Promise<void> {
    await this.arrowLoader.waitForArrow(timeoutMs);
  }

  async waitForWasm(timeoutMs: number = 20000): Promise<void> {
    if (this.config.enableWasmOptimizations) {
      await this.dependencyRegistry.waitForDependency("wasm-core", timeoutMs);
    }
  }

  async preloadDependencies(dependencies: string[] = []): Promise<void> {
    const targetDeps = dependencies.length > 0 ? dependencies : ["duckdb", "apache-arrow"];
    
    if (this.config.enableWasmOptimizations) {
      targetDeps.push("wasm-core");
    }

    try {
      await this.dependencyRegistry.preloadDependencies(targetDeps);
      this.log("info", `Preloaded dependencies: ${targetDeps.join(", ")}`);
    } catch (error) {
      this.log("warn", `Failed to preload some dependencies: ${error}`);
    }
  }

  isReady(): boolean {
    return this.initialized && this.dependencyRegistry.isDependencyReady("duckdb");
  }

  getDependencyStatus(): {
    duckdb: boolean;
    arrow: boolean;
    wasm: boolean;
    overall: boolean;
  } {
    return {
      duckdb: this.dependencyRegistry.isDependencyReady("duckdb"),
      arrow: this.arrowLoader.isArrowReady(),
      wasm: this.config.enableWasmOptimizations ? 
        this.dependencyRegistry.isDependencyReady("wasm-core") : true,
      overall: this.isReady(),
    };
  }

  getDependencyHealth(): any {
    return this.dependencyRegistry.getHealthStatus();
  }

  private async initializeCloudStorage(): Promise<void> {
    try {
      // Initialize advanced features first
      this.cacheManager = new CacheManager();
      this.schemaCache = new FileSchemaCache();
      this.httpCache = new HttpResponseCache();
      this.queryCache = new QueryResultCache();
      this.authManager = new AuthManager();
      this.performanceOptimizer = new PerformanceOptimizer();

      // Initialize HTTP client with configuration
      const httpConfig: HttpClientConfig = {
        timeout: this.config.corsConfig?.retryAttempts ? this.config.corsConfig.retryAttempts * 10000 : 30000,
        retries: this.config.corsConfig?.retryAttempts || 3,
        proxy: {
          enableForProviders: ['aws-s3', 'cloudflare-r2', 'google-cloud-storage', 'azure-blob'],
          maxFileSize: 1024 * 1024 * 1024, // 1GB
          cacheDuration: this.config.corsConfig?.cacheTimeout || 3600000, // 1 hour
          authPassthrough: true,
          corsHeaders: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag, Last-Modified'
          }
        }
      };

      this.httpClient = new DataPrismHttpClient(httpConfig);
      this.cloudStorage = new CloudStorageService(this.httpClient);

      // Configure cloud providers and authentication
      if (this.config.cloudProviders) {
        for (const [provider, config] of Object.entries(this.config.cloudProviders)) {
          this.cloudStorage.configureProvider(provider as any, config);
          
          // Set up authentication if credentials are provided
          if (config.credentials) {
            this.authManager.setCredentials(provider as any, config.credentials);
          }
        }
      }

      // Initialize DuckDB cloud integration once DuckDB is ready
      if (this.duckdb) {
        // Wait for DuckDB to be fully initialized before creating cloud integration
        try {
          await this.dependencyRegistry.waitForDependency("duckdb", 30000);
          const duckdbInstance = await this.duckdb.getDuckDB();
          if (duckdbInstance) {
            this.duckdbCloud = new DuckDBCloudIntegration(duckdbInstance, this.cloudStorage);
            
            // Initialize cloud storage support in DuckDB
            await this.duckdbCloud.registerCloudStorage({
              enableHttpfs: true,
              proxyEndpoint: this.config.corsConfig?.proxyEndpoint,
              credentials: this.config.cloudProviders
            });
            
            this.log("info", "DuckDB cloud integration initialized successfully");
          } else {
            this.log("warn", "DuckDB instance is null after waiting for dependency");
          }
        } catch (error) {
          this.log("error", `Failed to wait for DuckDB dependency: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw error;
        }
      }

      this.log("info", "Cloud storage services and advanced features initialized successfully");
    } catch (error) {
      this.log("error", `Failed to initialize cloud storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Public getters for cloud storage services
  get httpClientService(): DataPrismHttpClient | null {
    return this.httpClient;
  }

  get cloudStorageService(): CloudStorageService | null {
    return this.cloudStorage;
  }

  get duckdbCloudService(): DuckDBCloudIntegration | null {
    return this.duckdbCloud;
  }

  // Public getters for advanced features
  get cacheManagerService(): CacheManager<any> | null {
    return this.cacheManager;
  }

  get schemaCacheService(): FileSchemaCache | null {
    return this.schemaCache;
  }

  get httpCacheService(): HttpResponseCache | null {
    return this.httpCache;
  }

  get queryCacheService(): QueryResultCache | null {
    return this.queryCache;
  }

  get authManagerService(): AuthManager | null {
    return this.authManager;
  }

  get performanceOptimizerService(): PerformanceOptimizer | null {
    return this.performanceOptimizer;
  }

  private logDependencyStatus(): void {
    const status = this.getDependencyStatus();
    const health = this.getDependencyHealth();
    
    this.log("info", `Dependency Status - DuckDB: ${status.duckdb}, Arrow: ${status.arrow}, WASM: ${status.wasm}`);
    this.log("info", `Overall Health Score: ${health.healthScore}%`);
    
    if (health.errorCount > 0) {
      const failedDeps = this.dependencyRegistry.getFailedDependencies();
      this.log("warn", `Failed dependencies: ${failedDeps.join(", ")}`);
    }
  }

  async close(): Promise<void> {
    if (this.duckdb) {
      await this.duckdb.close();
    }
    
    // Clean up advanced features
    if (this.cacheManager) {
      this.cacheManager.destroy();
    }
    if (this.schemaCache) {
      this.schemaCache.destroy();
    }
    if (this.httpCache) {
      this.httpCache.destroy();
    }
    if (this.queryCache) {
      this.queryCache.destroy();
    }
    if (this.authManager) {
      this.authManager.clearCredentials();
    }

    this.wasmEngine = null;
    this.wasmModule = null;
    this.httpClient = null;
    this.cloudStorage = null;
    this.duckdbCloud = null;
    this.cacheManager = null;
    this.schemaCache = null;
    this.httpCache = null;
    this.queryCache = null;
    this.authManager = null;
    this.performanceOptimizer = null;
    
    this.initialized = false;
    this.dependencyRegistry.clearAll();
    this.log("info", "DataPrism Engine closed");
  }
}
