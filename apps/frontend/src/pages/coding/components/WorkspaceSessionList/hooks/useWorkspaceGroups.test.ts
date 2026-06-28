import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {describe, expect, it} from 'vitest';

import {groupSessionsByWorkspace} from './useWorkspaceGroups.js';

const ws = (path: string): Workspace => ({path});
const session = (id: string, workingDirectory?: string): SessionMetadata => ({
  id,
  title: id,
  workingDirectory,
});

describe('groupSessionsByWorkspace', () => {
  it('returns one group per workspace in config order, each with its sessions', () => {
    const groups = groupSessionsByWorkspace(
      [ws('/a'), ws('/b')],
      [session('s1', '/a'), session('s2', '/b'), session('s3', '/a')],
    );
    expect(groups.map((g) => g.workspace?.path)).toEqual(['/a', '/b']);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(groups[1].sessions.map((s) => s.id)).toEqual(['s2']);
  });

  it('keeps configured workspaces with no sessions (no orphan group)', () => {
    const groups = groupSessionsByWorkspace([ws('/a')], []);
    expect(groups).toEqual([{workspace: {path: '/a'}, sessions: []}]);
  });

  it('normalizes trailing slashes when bucketing', () => {
    const groups = groupSessionsByWorkspace([ws('/a/')], [session('s1', '/a')]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('puts unconfigured and missing-workspace sessions in a trailing Ungrouped group', () => {
    const groups = groupSessionsByWorkspace(
      [ws('/a')],
      [session('s1', '/a'), session('s2', '/gone'), session('s3')],
    );
    expect(groups).toHaveLength(2);
    const last = groups[1];
    expect(last.workspace).toBeUndefined();
    expect(last.sessions.map((s) => s.id)).toEqual(['s2', 's3']);
  });
});
