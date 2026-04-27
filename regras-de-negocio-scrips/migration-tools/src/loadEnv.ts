import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

/**
 * Load repo-root `.env` (bwa-game) then local `.env` in migration-tools.
 */
export function loadRepoEnv(): void {
  const here = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(here, '..', '..');
  const rootEnv = path.join(repoRoot, '.env');
  const localEnv = path.join(here, '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv, override: true });
  }
}

export function envStr(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}
