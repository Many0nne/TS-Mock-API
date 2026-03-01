import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger';

/**
 * Validate and resolve the types directory
 * Ensures the directory exists and contains at least one TypeScript file
 */
export async function validateTypesDir(dirPath: string): Promise<string> {
  const resolvedPath = path.resolve(process.cwd(), dirPath);

  if (!fs.existsSync(resolvedPath)) {
    logger.error(`Types directory not found: ${resolvedPath}`);
    logger.warn('Make sure the path is correct and accessible');
    process.exit(1);
  }

  // Check if directory is accessible
  try {
    fs.accessSync(resolvedPath, fs.constants.R_OK);
  } catch {
    logger.error(`Types directory is not readable: ${resolvedPath}`);
    process.exit(1);
  }

  return resolvedPath;
}

/**
 * Parse latency format from CLI string (e.g., "500-2000" -> { min: 500, max: 2000 })
 */
export function parseLatency(latencyStr?: string): { min: number; max: number } | undefined {
  if (!latencyStr) return undefined;

  const match = latencyStr.match(/^(\d+)-(\d+)$/);

  if (match && match[1] && match[2]) {
    const min = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);

    if (min > max) {
      logger.warn('Minimum latency is greater than maximum. Values will be swapped.');
      return { min: max, max: min };
    }

    return { min, max };
  }

  logger.warn(
    `Invalid latency format: "${latencyStr}". Expected format: "min-max" (e.g., "500-2000")`
  );
  return undefined;
}

/**
 * Display usage help for the CLI
 */
export function displayHelp(): void {
  console.log('');
  console.log(chalk.bold('Usage:'));
  console.log('  ts-mock-proxy --types-dir <path> [options]');
  console.log('  ts-mock-proxy --interactive (force interactive mode)');
  console.log('');
  console.log(chalk.bold('Options:'));
  console.log('  -t, --types-dir <path>      Directory containing TypeScript type definitions (required)');
  console.log('  -p, --port <number>         Server port (default: 8080)');
  console.log('  -l, --latency <range>       Simulate latency, format: "min-max" (e.g., "500-2000")');
  console.log('  --no-hot-reload             Disable hot-reload of type definitions');
  console.log('  --no-cache                  Disable schema caching');
  console.log('  -v, --verbose               Enable verbose logging');
  console.log('  --help                      Display this help message');
  console.log('  --version                   Show version');
  console.log('');
  console.log(chalk.bold('Commands:'));
  console.log('  stats                       Display cache statistics');
  console.log('  clear-cache                 Clear the schema cache');
  console.log('');
  console.log(chalk.bold('Examples:'));
  console.log('  # Interactive mode (default)');
  console.log('  ts-mock-proxy');
  console.log('');
  console.log('  # Using CLI options (skips interactive mode)');
  console.log('  ts-mock-proxy --types-dir ./my-types --port 3000');
  console.log('');
  console.log('  # With latency simulation');
  console.log('  ts-mock-proxy --types-dir ./my-types --latency 500-2000');
  console.log('');
}

/**
 * Display startup success message
 */
export function displayStartupSuccess(port: number, typesDir: string): void {
  console.log('');
  console.log(chalk.green.bold('✨ Server is running!'));
  console.log('');
  console.log(`  ${chalk.cyan('Local:')} http://localhost:${port}`);
  console.log(`  ${chalk.cyan('Types:')} ${typesDir}`);
  console.log(`  ${chalk.cyan('API Docs:')} http://localhost:${port}/api-docs`);
  console.log('');
  console.log(chalk.gray('Press Ctrl+C to stop the server'));
  console.log('');
}
