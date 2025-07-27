import { DataPrismEngine } from './engine.js';
import { DataPrismHttpClient } from './http-client.js';
import { CloudStorageService } from './cloud-storage-service.js';
import { DuckDBCloudIntegration } from './duckdb-cloud-integration.js';
import { ProxyService } from './proxy-service.js';
import {
  CloudProvider,
  CloudCredentials,
  Logger
} from './types.js';

export type CorsStrategy = 'auto' | 'direct' | 'proxy';

export interface PluginContext {
  pluginName: string;
  coreVersion: string;
  services: any; // Core services registry
  eventBus: any; // Event system for plugin communication
  logger: Logger;
  config: any; // Plugin-specific configuration
  resources: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxExecutionTime: number;
  };
}

export interface EnhancedPluginContext extends PluginContext {
  // Enhanced HTTP client
  httpClient: DataPrismHttpClient;
  
  // Cloud storage abstraction
  cloudStorage: CloudStorageService;
  
  // DuckDB cloud integration
  duckdbCloud: DuckDBCloudIntegration;
  
  // Proxy services
  proxy: ProxyService;
  
  // Configuration helpers
  config: {
    setCorsHandlingStrategy(strategy: CorsStrategy): void;
    setCloudCredentials(provider: CloudProvider, creds: CloudCredentials): void;
    enableDebugLogging(categories: string[]): void;
  };
}

export class PluginContextBuilder {
  private engine: DataPrismEngine;
  private pluginName: string;
  private baseContext: Partial<PluginContext>;

  constructor(engine: DataPrismEngine, pluginName: string) {
    this.engine = engine;
    this.pluginName = pluginName;
    this.baseContext = {};
  }

  withLogger(logger: Logger): PluginContextBuilder {
    this.baseContext.logger = logger;
    return this;
  }

  withConfig(config: any): PluginContextBuilder {
    this.baseContext.config = config;
    return this;
  }

  withResources(resources: { maxMemoryMB: number; maxCpuPercent: number; maxExecutionTime: number }): PluginContextBuilder {
    this.baseContext.resources = resources;
    return this;
  }

  build(): EnhancedPluginContext {
    const httpClient = this.engine.httpClientService;
    const cloudStorage = this.engine.cloudStorageService;
    const duckdbCloud = this.engine.duckdbCloudService;

    if (!httpClient || !cloudStorage) {
      throw new Error('Cloud storage services not initialized. Ensure engine.initialize() has been called.');
    }

    return {
      pluginName: this.pluginName,
      coreVersion: "1.0.0", // TODO: Get from package.json
      services: {}, // TODO: Populate with core services
      eventBus: {}, // TODO: Implement event bus
      logger: this.baseContext.logger || this.createDefaultLogger(),
      config: this.createConfigHelper(cloudStorage),
      resources: this.baseContext.resources || {
        maxMemoryMB: 1024,
        maxCpuPercent: 50,
        maxExecutionTime: 30000
      },
      
      // Enhanced cloud storage services
      httpClient,
      cloudStorage,
      duckdbCloud: duckdbCloud!,
      proxy: (httpClient as any).proxyService,
    };
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (message: string, ...args: any[]) => console.debug(`[${this.pluginName}] ${message}`, ...args),
      info: (message: string, ...args: any[]) => console.info(`[${this.pluginName}] ${message}`, ...args),
      warn: (message: string, ...args: any[]) => console.warn(`[${this.pluginName}] ${message}`, ...args),
      error: (message: string, ...args: any[]) => console.error(`[${this.pluginName}] ${message}`, ...args),
    };
  }

  private createConfigHelper(cloudStorage: CloudStorageService) {
    return {
      setCorsHandlingStrategy: (strategy: CorsStrategy) => {
        // Implementation would depend on how CORS strategy is stored
        console.info(`Setting CORS handling strategy to: ${strategy}`);
      },
      
      setCloudCredentials: (provider: CloudProvider, creds: CloudCredentials) => {
        cloudStorage.setCredentials(provider, creds);
        console.info(`Cloud credentials set for provider: ${provider}`);
      },
      
      enableDebugLogging: (categories: string[]) => {
        console.info(`Debug logging enabled for categories: ${categories.join(', ')}`);
        // TODO: Implement category-based logging
      }
    };
  }
}

export class PluginMigrationSupport {
  static upgradePluginContext(oldContext: PluginContext, engine: DataPrismEngine): EnhancedPluginContext {
    const builder = new PluginContextBuilder(engine, oldContext.pluginName)
      .withLogger(oldContext.logger)
      .withConfig(oldContext.config)
      .withResources(oldContext.resources);

    return builder.build();
  }

  static isEnhancedContext(context: PluginContext | EnhancedPluginContext): context is EnhancedPluginContext {
    return 'httpClient' in context && 'cloudStorage' in context && 'duckdbCloud' in context;
  }
}

// Utility functions for plugin developers
export class PluginCloudStorageHelper {
  private context: EnhancedPluginContext;

  constructor(context: EnhancedPluginContext) {
    this.context = context;
  }

  async loadCloudData(url: string, tableName?: string): Promise<any[]> {
    try {
      this.context.logger.info(`Loading cloud data from: ${url}`);

      if (tableName && this.context.duckdbCloud) {
        // Register as DuckDB table for SQL queries
        await this.context.duckdbCloud.registerCloudTable(tableName, url, {
          corsHandling: 'auto',
          cacheSchema: true,
          streamingMode: false
        });

        // Query the registered table
        return await this.context.duckdbCloud.queryCloudTable(tableName);
      } else {
        // Load data directly through cloud storage service
        const file = await this.context.cloudStorage.getFile(url);
        const content = await file.getContentAsText();
        
        try {
          return JSON.parse(content);
        } catch {
          // If not JSON, return raw content
          return [{ content }];
        }
      }
    } catch (error) {
      this.context.logger.error(`Failed to load cloud data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  async testCloudAccess(url: string): Promise<{
    accessible: boolean;
    requiresProxy: boolean;
    provider: CloudProvider;
    error?: string;
  }> {
    try {
      const corsSupport = await this.context.httpClient.testCorsSupport(url);
      const provider = this.context.httpClient.detectProvider(url);

      return {
        accessible: corsSupport.supportsDirectAccess || corsSupport.requiresProxy,
        requiresProxy: corsSupport.requiresProxy,
        provider,
      };
    } catch (error) {
      const provider = this.context.httpClient.detectProvider(url);
      return {
        accessible: false,
        requiresProxy: true,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getFileMetadata(url: string) {
    const file = await this.context.cloudStorage.getFile(url, { 
      requestOptions: { method: 'HEAD' }
    });
    return file.metadata;
  }

  async getFileSchema(url: string) {
    return await this.context.cloudStorage.getFileSchema(url);
  }
}