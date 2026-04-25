import os from 'node:os';

import {getDataDir} from './env.js';
import {
  createSensitivePathPolicy,
  type SensitivePathPolicy,
} from './sensitive-path-policy.js';

export function getDefaultSensitivePathPolicy(): SensitivePathPolicy {
  return createSensitivePathPolicy({
    homeDir: os.homedir(),
    dataDir: getDataDir(),
  });
}
