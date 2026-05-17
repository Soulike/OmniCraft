import {chmodSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {agentIdSchema} from '@omnicraft/api-schema';

export class AgentWorkingDirectoryService {
  createDefaultWorkingDirectory(agentId: string): string {
    // Defense in depth: agentId reaches here from snapshots on disk. Reject
    // anything that isn't a UUID so path.join can't escape os.tmpdir().
    agentIdSchema.parse(agentId);
    const dir = path.join(os.tmpdir(), agentId);
    mkdirSync(dir, {recursive: true, mode: 0o700});
    // lstat (not stat) so a pre-planted symlink at `dir` is rejected before
    // chmod/realpath would follow it to a target we don't own.
    if (!lstatSync(dir).isDirectory()) {
      throw new Error(`Agent tmp path is not a real directory: ${dir}`);
    }
    // mkdir's `mode` is only applied on creation and can be masked by umask, so
    // re-assert 0o700 to cover the "directory already exists" case.
    chmodSync(dir, 0o700);
    return realpathSync(dir);
  }
}

export const agentWorkingDirectoryService = new AgentWorkingDirectoryService();
