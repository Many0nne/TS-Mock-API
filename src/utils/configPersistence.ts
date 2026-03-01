import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig } from '../types/config';
import { logger } from './logger';

const CONFIG_FILE = path.join(process.cwd(), '.mock-config.json');

/**
 * Save the server configuration to a file for later reuse
 * @param config The configuration to save
 */
export function saveConfig(config: ServerConfig): void {
  try {
    // Convert to relative paths for better portability
    const configToSave = {
      ...config,
      typesDir: path.relative(process.cwd(), config.typesDir),
    };
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf-8');
    logger.debug(`Configuration saved to ${CONFIG_FILE}`);
  } catch (error) {
    logger.warn(`Failed to save configuration: ${error}`);
  }
}

/**
 * Load the saved server configuration, if it exists
 * Converts relative paths back to absolute paths
 * @returns The saved configuration, or null if none exists
 */
export function loadSavedConfig(): ServerConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const saved = JSON.parse(content) as ServerConfig;

    // Convert relative paths back to absolute
    return {
      ...saved,
      typesDir: path.resolve(process.cwd(), saved.typesDir),
    };
  } catch (error) {
    logger.warn(`Failed to load saved configuration: ${error}`);
    return null;
  }
}

/**
 * Check if a saved configuration exists
 */
export function hasSavedConfig(): boolean {
  return fs.existsSync(CONFIG_FILE);
}
