import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/** Returns the data directory from `DATA_DIR` env or defaults to `~/.omni-craft`. */
export function getDataDir(): string {
  const dataDir =
    process.env.DATA_DIR ?? path.join(os.homedir(), '.omni-craft');
  assert(path.isAbsolute(dataDir), 'DATA_DIR must be an absolute path');
  return dataDir;
}
