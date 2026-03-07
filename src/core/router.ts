import { Request, Response } from 'express';
import { ServerConfig } from '../types/config';
import { findTypeForUrl } from '../utils/typeMapping';
import { generateMockFromInterface, generateMockArray } from './parser';
import { schemaCache } from './cache';
import { logger } from '../utils/logger';
import {
  parseQueryParams,
  validateSortFields,
  applyPagination,
  POOL_SIZE,
} from './queryProcessor';

/**
 * Dynamic route handler - Matches the URL with a type and generates the mock
 */
export function dynamicRouteHandler(config: ServerConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const url = req.url;

      // Search for the type corresponding to the URL
      const mapping = findTypeForUrl(url, config.typesDir);

      if (!mapping) {
        // Type not found - return 404
        const statusCode = res.locals.forcedStatus || 404;
        res.status(statusCode).json({
          error: 'Type not found',
          message: `No TypeScript interface matches the URL: ${url}`,
          hint: 'Make sure you have exported an interface in your contracts directory',
        });
        return;
      }

      logger.debug(
        `Matched URL "${url}" -> Type "${mapping.typeName}" (array: ${mapping.isArray})`
      );

      // Check if the status is forced by the x-mock-status header
      const forcedStatus = res.locals.forcedStatus as number | undefined;

      if (forcedStatus && forcedStatus >= 400) {
        // Return a forced error
        res.status(forcedStatus).json({
          error: 'Forced error',
          message: `Status ${forcedStatus} forced via x-mock-status header`,
        });
        return;
      }

      // Check the cache first (only for single objects, not arrays)
      let mockData: Record<string, unknown> | Record<string, unknown>[];

      const { filePath } = mapping;

      if (!filePath) {
        res.status(500).json({
          error: 'Mock generation failed',
          message: `No file path found for type "${mapping.typeName}"`,
        });
        return;
      }

      if (config.cache && !mapping.isArray) {
        const cached = schemaCache.get(mapping.typeName, filePath);

        if (cached) {
          mockData = cached.schema;
          res.status(forcedStatus || 200).json(mockData);
          return;
        }
      }

      // Generate the mock data
      if (mapping.isArray) {
        // Parse and validate query parameters
        const parsed = parseQueryParams(
          req.query as Record<string, string | string[] | undefined>
        );
        if ('error' in parsed) {
          res.status(400).json({ error: 'Invalid query parameters', message: parsed.error });
          return;
        }

        // Generate a fixed pool to simulate a full dataset
        const pool = generateMockArray(filePath, mapping.typeName, {
          arrayLength: POOL_SIZE,
        });

        // Validate sort fields against schema keys
        if (parsed.sort.length > 0 && pool.length > 0) {
          const allowedFields = new Set(Object.keys(pool[0]!));
          const sortError = validateSortFields(parsed.sort, allowedFields);
          if (sortError) {
            res.status(400).json({ error: 'Invalid sort parameter', message: sortError });
            return;
          }
        }

        res.status(forcedStatus || 200).json(applyPagination(pool, parsed));
        return;
      } else {
        mockData = generateMockFromInterface(
          filePath,
          mapping.typeName
        );
      }

      // Store in cache if enabled
      if (config.cache && !mapping.isArray) {
        schemaCache.set(
          mapping.typeName,
          filePath,
          mockData as Record<string, unknown>
        );
      }

      // Return the mocked data
      res.status(forcedStatus || 200).json(mockData);
    } catch (error) {
      logger.error('Error generating mock:', error);

      const statusCode = res.locals.forcedStatus || 500;
      res.status(statusCode).json({
        error: 'Mock generation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
