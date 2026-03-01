import * as fs from 'fs';
import * as path from 'path';
import { RouteTypeMapping, InterfaceMetadata } from '../types/config';
import { parseUrlToType } from './pluralize';

/**
 * Recursively scans a directory to find all .ts files
 */
export function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function scan(currentDir: string): void {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const stat = fs.statSync(currentDir);

    // If a file path was provided, add it directly (supports passing file paths)
    if (stat.isFile()) {
      if (currentDir.endsWith('.ts')) {
        files.push(currentDir);
      }
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Ignore node_modules and other system directories
        if (!['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Extracts all exported interface names from a TypeScript file with endpoint flags
 * Detects // @endpoint comments before interface declarations
 */
export function extractInterfaceNames(filePath: string): InterfaceMetadata[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const metadata: InterfaceMetadata[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const interfaceMatch = /export\s+interface\s+(\w+)/.exec(line);

    if (interfaceMatch && interfaceMatch[1]) {
      const interfaceName = interfaceMatch[1];
      
      // Check the previous line for // @endpoint flag
      let hasEndpointFlag = false;
      if (i > 0) {
        const prevLine = (lines[i - 1] || '').trim();
        if (prevLine === '// @endpoint') {
          hasEndpointFlag = true;
        }
      }

      metadata.push({
        name: interfaceName,
        hasEndpointFlag,
      });
    }
  }

  return metadata;
}

/**
 * Creates a mapping of all available types
 * Only includes interfaces marked with // @endpoint
 * Map<TypeName, FilePath>
 */
export function buildTypeMap(directory: string): Map<string, string> {
  const typeMap = new Map<string, string>();

  const files = findTypeScriptFiles(directory);

  for (const file of files) {
    const interfaceMetadata = extractInterfaceNames(file);

    for (const metadata of interfaceMetadata) {
      // Only include interfaces marked with // @endpoint
      if (metadata.hasEndpointFlag && !typeMap.has(metadata.name)) {
        typeMap.set(metadata.name, file);
      } else if (!metadata.hasEndpointFlag) {
        // Debug: Log interfaces without @endpoint flag
        // console.debug(`[typeMapping] Interface "${metadata.name}" in ${file} does not have @endpoint flag`);
      }
    }
  }

  if (typeMap.size > 0) {
    // Debug: Log discovered endpoints
    // console.debug(`[typeMapping] Discovered ${typeMap.size} endpoints:`, Array.from(typeMap.keys()));
  }

  return typeMap;
}

/**
 * Finds the type corresponding to a URL
 * Only finds types marked with // @endpoint
 *
 * @param url - Request URL
 * @param directory - Directory containing type definitions
 * @returns Route -> type mapping or null if not found
 */
export function findTypeForUrl(
  url: string,
  directory: string
): RouteTypeMapping | null {
  const { typeName, isArray } = parseUrlToType(url);
  const typeMap = buildTypeMap(directory);

  const filePath = typeMap.get(typeName);

  if (!filePath) {
    return null;
  }

  return {
    typeName,
    isArray,
    filePath,
  };
}
