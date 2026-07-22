import {chmodSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {agentIdSchema} from '@omnicraft/api-schema';

import {agentPersistence} from './persistence/agent-persistence.js';

export class AgentScratchDirectoryService {
  /**
   * Creates and returns the per-session scratch directory. Uses
   * `{sessionsDir}/{id}/scratch` when a sessions directory is configured, and an
   * `os.tmpdir()/{id}/scratch` fallback for in-memory agents.
   */
  createScratchDirectory(sessionsDir: string | null, agentId: string): string {
    // Defense in depth: agentId reaches here from snapshots on disk. Reject
    // anything that isn't a UUID so path.join can't escape the intended parent.
    agentIdSchema.parse(agentId);
    const dir =
      sessionsDir === null
        ? path.join(os.tmpdir(), agentId, 'scratch')
        : agentPersistence.scratchPath(sessionsDir, agentId);
    mkdirSync(dir, {recursive: true, mode: 0o700});
    // lstat (not stat) so a pre-planted symlink at `dir` is rejected before
    // chmod/realpath would follow it to a target we don't own.
    if (!lstatSync(dir).isDirectory()) {
      throw new Error(`Agent scratch path is not a real directory: ${dir}`);
    }
    // mkdir's `mode` is only applied on creation and can be masked by umask, so
    // re-assert 0o700 to cover the "directory already exists" case.
    chmodSync(dir, 0o700);
    return realpathSync(dir);
  }
}

export const agentScratchDirectoryService = new AgentScratchDirectoryService();
