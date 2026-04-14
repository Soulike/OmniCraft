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

/** Returns the port for `code serve-web` from the required `VSCODE_PORT` env var. */
export function getVscodePort(): number {
  const raw = process.env.VSCODE_PORT;
  assert(raw !== undefined, 'VSCODE_PORT is required in .env');
  const port = Number(raw);
  assert(
    !Number.isNaN(port) && port > 0,
    'VSCODE_PORT must be a positive number',
  );
  return port;
}
