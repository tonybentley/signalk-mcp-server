import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the current directory name, with support for both ES modules and test environments
 */
export function getCurrentDirname(): string {
  // Check if we're in a test environment
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    // Use a fixed path for test environment
    return path.join(process.cwd(), 'src');
  }
  
  try {
    // Try ES module approach
    const currentFilename = fileURLToPath(import.meta.url);
    return path.dirname(path.dirname(currentFilename)); // Go up one level from utils
  } catch {
    // Fallback for environments that don't support import.meta
    return path.join(process.cwd(), 'dist', 'src');
  }
}