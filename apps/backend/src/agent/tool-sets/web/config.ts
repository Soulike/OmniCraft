import os from 'node:os';
import path from 'node:path';

export const TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_INLINE_SIZE = 32_768; // 32KB
export const TEMP_DIR = path.join(os.tmpdir(), 'omnicraft-web-fetch');
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
