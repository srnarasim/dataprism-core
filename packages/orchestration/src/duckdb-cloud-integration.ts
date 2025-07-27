import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import {
  CloudProvider,
  CloudStorageError,
  FileAccessOptions
} from './types.js';
import { CloudStorageService } from './cloud-storage-service.js';

export interface CloudTableOptions {
  provider?: CloudProvider;
  authMethod?: 'iam-role' | 'api-key' | 'oauth2';
  corsHandling?: 'direct' | 'proxy' | 'auto';
  cacheSchema?: boolean;
  streamingMode?: boolean;
  columns?: string[];
  where?: string;
}

export interface CloudTableConfig {
  tableName: string;
  url: string;
  provider: CloudProvider;
  corsHandling: 'direct' | 'proxy' | 'auto';
  cacheSchema: boolean;
  streamingMode: boolean;
  options?: CloudTableOptions;
}

export type FallbackStrategy = 'proxy' | 'cache' | 'error';

export class DuckDBCloudIntegration {
  private duckdb: AsyncDuckDB;
  private cloudStorage: CloudStorageService;
  private registeredTables: Map<string, CloudTableConfig> = new Map();
  private proxiedAccess: boolean = false;
  private fallbackStrategies: FallbackStrategy[] = ['proxy', 'cache', 'error'];

  constructor(duckdb: AsyncDuckDB, cloudStorage: CloudStorageService) {
    this.duckdb = duckdb;
    this.cloudStorage = cloudStorage;
  }

  async registerCloudStorage(config: {
    enableHttpfs?: boolean;
    proxyEndpoint?: string;
    credentials?: Record<CloudProvider, any>;
  }): Promise<void> {
    try {
      const connection = await this.duckdb.connect();
      
      // Install and load HTTPFS extension if needed
      if (config.enableHttpfs !== false) {
        try {
          await connection.query("INSTALL httpfs;");
          await connection.query("LOAD httpfs;");
        } catch (error) {
          console.warn('HTTPFS extension not available, using proxy mode:', error);
          this.proxiedAccess = true;
        }
      }

      // Configure cloud provider credentials if provided
      if (config.credentials) {
        for (const [provider, creds] of Object.entries(config.credentials)) {
          this.cloudStorage.setCredentials(provider as CloudProvider, creds);
        }
      }

      await connection.close();
    } catch (error) {
      throw new CloudStorageError(
        `Failed to initialize cloud storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'aws-s3', // Default provider for initialization errors
        'INIT_FAILED'
      );
    }
  }

  async registerCloudTable(
    tableName: string,
    url: string,
    options?: CloudTableOptions
  ): Promise<void> {
    const provider = options?.provider || this.cloudStorage.detectProvider(url);
    const corsHandling = options?.corsHandling || 'auto';
    
    const config: CloudTableConfig = {
      tableName,
      url,
      provider,
      corsHandling,
      cacheSchema: options?.cacheSchema ?? true,
      streamingMode: options?.streamingMode ?? false,
      options
    };

    // Determine actual CORS handling strategy
    if (corsHandling === 'auto') {
      try {
        const corsSupport = await this.cloudStorage.testCorsSupport(url);
        config.corsHandling = corsSupport.supportsDirectAccess ? 'direct' : 'proxy';
      } catch (error) {
        console.warn(`Failed to test CORS support for ${url}, defaulting to proxy:`, error);
        config.corsHandling = 'proxy';
      }
    }

    try {
      if (config.corsHandling === 'proxy' || this.proxiedAccess) {
        await this.registerProxiedTable(config);
      } else {
        await this.registerDirectTable(config);
      }

      this.registeredTables.set(tableName, config);
    } catch (error) {
      throw new CloudStorageError(
        `Failed to register cloud table '${tableName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        provider,
        'TABLE_REGISTRATION_FAILED'
      );
    }
  }

  async queryCloudTable(tableName: string, sql?: string): Promise<any[]> {
    const config = this.registeredTables.get(tableName);
    if (!config) {
      throw new Error(`Cloud table '${tableName}' not registered`);
    }

    const connection = await this.duckdb.connect();
    
    try {
      const query = sql || `SELECT * FROM ${tableName}`;
      const result = await connection.query(query);
      return result.toArray().map(row => row.toJSON());
    } catch (error) {
      // Try fallback strategies
      for (const strategy of this.fallbackStrategies) {
        try {
          return await this.executeWithFallback(tableName, sql, strategy);
        } catch (fallbackError) {
          console.warn(`Fallback strategy '${strategy}' failed:`, fallbackError);
          continue;
        }
      }
      
      throw new CloudStorageError(
        `Failed to query cloud table '${tableName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        config.provider,
        'QUERY_FAILED'
      );
    } finally {
      await connection.close();
    }
  }

  enableProxiedAccess(enable: boolean): void {
    this.proxiedAccess = enable;
  }

  configureFallbackStrategies(strategies: FallbackStrategy[]): void {
    this.fallbackStrategies = strategies;
  }

  getRegisteredTables(): Map<string, CloudTableConfig> {
    return new Map(this.registeredTables);
  }

  async unregisterCloudTable(tableName: string): Promise<void> {
    if (!this.registeredTables.has(tableName)) {
      return;
    }

    try {
      const connection = await this.duckdb.connect();
      await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
      await connection.close();
      
      this.registeredTables.delete(tableName);
    } catch (error) {
      console.warn(`Failed to unregister table '${tableName}':`, error);
      // Still remove from registry even if DROP TABLE fails
      this.registeredTables.delete(tableName);
    }
  }

  private async registerProxiedTable(config: CloudTableConfig): Promise<void> {
    // For proxied access, we need to fetch the data through our proxy service
    // and register it as a local table in DuckDB
    const connection = await this.duckdb.connect();
    
    try {
      // Get file handle through proxy
      const fileHandle = await this.cloudStorage.getFile(config.url, {
        corsHandling: 'proxy',
        cacheSchema: config.cacheSchema
      });

      // Register the data with DuckDB
      if (config.url.toLowerCase().endsWith('.parquet')) {
        // For Parquet files, we can try to use DuckDB's read_parquet with the proxied data
        const data = await fileHandle.getContentAsBuffer();
        const uint8Array = new Uint8Array(data);
        
        // Register as a file buffer in DuckDB
        await this.duckdb.registerFileBuffer(`${config.tableName}.parquet`, uint8Array);
        await connection.query(`CREATE TABLE ${config.tableName} AS SELECT * FROM read_parquet('${config.tableName}.parquet')`);
        
      } else if (config.url.toLowerCase().endsWith('.csv')) {
        // For CSV files
        const text = await fileHandle.getContentAsText();
        await this.duckdb.registerFileText(`${config.tableName}.csv`, text);
        await connection.query(`CREATE TABLE ${config.tableName} AS SELECT * FROM read_csv_auto('${config.tableName}.csv')`);
        
      } else if (config.url.toLowerCase().endsWith('.json') || config.url.toLowerCase().endsWith('.jsonl')) {
        // For JSON files
        const text = await fileHandle.getContentAsText();
        await this.duckdb.registerFileText(`${config.tableName}.json`, text);
        await connection.query(`CREATE TABLE ${config.tableName} AS SELECT * FROM read_json_auto('${config.tableName}.json')`);
        
      } else {
        throw new Error(`Unsupported file format for proxied access: ${config.url}`);
      }
      
    } finally {
      await connection.close();
    }
  }

  private async registerDirectTable(config: CloudTableConfig): Promise<void> {
    // For direct access, we can use DuckDB's built-in HTTPFS extension
    const connection = await this.duckdb.connect();
    
    try {
      let query: string;
      
      if (config.url.toLowerCase().endsWith('.parquet')) {
        query = `CREATE TABLE ${config.tableName} AS SELECT * FROM read_parquet('${config.url}')`;
      } else if (config.url.toLowerCase().endsWith('.csv')) {
        query = `CREATE TABLE ${config.tableName} AS SELECT * FROM read_csv_auto('${config.url}')`;
      } else if (config.url.toLowerCase().endsWith('.json') || config.url.toLowerCase().endsWith('.jsonl')) {
        query = `CREATE TABLE ${config.tableName} AS SELECT * FROM read_json_auto('${config.url}')`;
      } else {
        throw new Error(`Unsupported file format for direct access: ${config.url}`);
      }

      // Add column selection if specified
      if (config.options?.columns && config.options.columns.length > 0) {
        const columns = config.options.columns.join(', ');
        query = query.replace('SELECT *', `SELECT ${columns}`);
      }

      // Add WHERE clause if specified
      if (config.options?.where) {
        query += ` WHERE ${config.options.where}`;
      }

      await connection.query(query);
      
    } finally {
      await connection.close();
    }
  }

  private async executeWithFallback(
    tableName: string, 
    sql: string | undefined, 
    strategy: FallbackStrategy
  ): Promise<any[]> {
    const config = this.registeredTables.get(tableName)!;
    
    switch (strategy) {
      case 'proxy':
        // Re-register table using proxy mode
        const proxyConfig = { ...config, corsHandling: 'proxy' as const };
        await this.registerProxiedTable(proxyConfig);
        break;
        
      case 'cache':
        // Try to use cached data if available
        // This is a placeholder - in practice, you'd implement caching
        throw new Error('Cache fallback not implemented');
        
      case 'error':
      default:
        throw new Error(`No more fallback strategies available for table '${tableName}'`);
    }

    // Retry the query with the fallback configuration
    const connection = await this.duckdb.connect();
    try {
      const query = sql || `SELECT * FROM ${tableName}`;
      const result = await connection.query(query);
      return result.toArray().map(row => row.toJSON());
    } finally {
      await connection.close();
    }
  }
}