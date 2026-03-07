import { ParsedSchema } from '../types/config';
import { logger } from '../utils/logger';

/**
 * In-memory cache for parsed TypeScript schemas
 */
export class SchemaCache {
  private cache: Map<string, ParsedSchema> = new Map();
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Generates a cache key from the interface name and file
   */
  private generateKey(interfaceName: string, filePath: string): string {
    return `${filePath}::${interfaceName}`;
  }

  /**
   * Retrieves a schema from the cache
   */
  get(interfaceName: string, filePath: string): ParsedSchema | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const key = this.generateKey(interfaceName, filePath);
    const cached = this.cache.get(key);

    if (cached) {
      logger.debug(`Cache HIT: ${interfaceName} from ${filePath}`);
    }

    return cached;
  }

  /**
   * Stores a schema in the cache
   */
  set(
    interfaceName: string,
    filePath: string,
    schema: Record<string, unknown>
  ): void {
    if (!this.enabled) {
      return;
    }

    const key = this.generateKey(interfaceName, filePath);
    const parsedSchema: ParsedSchema = {
      interfaceName,
      filePath,
      schema,
      lastUpdated: Date.now(),
    };

    this.cache.set(key, parsedSchema);
    logger.debug(`Cache SET: ${interfaceName} from ${filePath}`);
  }

  /**
   * Invalidates the cache for a specific file
   */
  invalidateFile(filePath: string): void {
    let count = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.filePath === filePath) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Cache invalidated: ${count} schema(s) from ${filePath}`);
    }
  }

  /**
   * Clears the cache completely
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared: ${size} schema(s) removed`);
  }

  /**
   * Returns the number of items in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics
   */
  getStats(): {
    size: number;
    enabled: boolean;
    schemas: Array<{ interfaceName: string; filePath: string; age: number }>;
  } {
    const schemas = Array.from(this.cache.values()).map((schema) => ({
      interfaceName: schema.interfaceName,
      filePath: schema.filePath,
      age: Date.now() - schema.lastUpdated,
    }));

    return {
      size: this.cache.size,
      enabled: this.enabled,
      schemas,
    };
  }
}

// Global cache instance
export const schemaCache = new SchemaCache();

/**
 * Always-on data store for stable mock data across requests.
 * Caches both single object mocks and array pools independently of config.cache.
 */
interface MockEntry<T> {
  data: T;
  createdAt: number;
}

export class MockDataStore {
  private singles: Map<string, MockEntry<Record<string, unknown>>> = new Map();
  private pools: Map<string, MockEntry<Record<string, unknown>[]>> = new Map();

  private key(typeName: string, filePath: string): string {
    return `${filePath}::${typeName}`;
  }

  getSingle(typeName: string, filePath: string): Record<string, unknown> | undefined {
    return this.singles.get(this.key(typeName, filePath))?.data;
  }

  setSingle(typeName: string, filePath: string, data: Record<string, unknown>): void {
    this.singles.set(this.key(typeName, filePath), { data, createdAt: Date.now() });
  }

  getPool(typeName: string, filePath: string): Record<string, unknown>[] | undefined {
    return this.pools.get(this.key(typeName, filePath))?.data;
  }

  setPool(typeName: string, filePath: string, data: Record<string, unknown>[]): void {
    this.pools.set(this.key(typeName, filePath), { data, createdAt: Date.now() });
  }

  invalidateFile(filePath: string): void {
    let count = 0;
    for (const key of this.singles.keys()) {
      if (key.startsWith(`${filePath}::`)) {
        this.singles.delete(key);
        count++;
      }
    }
    for (const key of this.pools.keys()) {
      if (key.startsWith(`${filePath}::`)) {
        this.pools.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.info(`MockDataStore invalidated: ${count} entry/entries from ${filePath}`);
    }
  }

  clear(): { singles: number; pools: number } {
    const singles = this.singles.size;
    const pools = this.pools.size;
    this.singles.clear();
    this.pools.clear();
    logger.info(`MockDataStore cleared: ${singles} single(s), ${pools} pool(s)`);
    return { singles, pools };
  }

  getStats(): { singles: number; pools: number } {
    return { singles: this.singles.size, pools: this.pools.size };
  }
}

export const mockDataStore = new MockDataStore();
