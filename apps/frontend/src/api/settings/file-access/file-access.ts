import {
  getWorkspacesResponseSchema,
  type InvalidPathEntry,
  invalidPathsResponseSchema,
  putWorkspacesSuccessResponseSchema,
} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {StatusCodes} from 'http-status-codes';

const BASE = '/api/settings/file-access';

export type {InvalidPathEntry};

export class InvalidPathsError extends Error {
  readonly invalidPaths: readonly InvalidPathEntry[];

  constructor(invalidPaths: readonly InvalidPathEntry[]) {
    super('Some paths are invalid');
    this.name = 'InvalidPathsError';
    this.invalidPaths = invalidPaths;
  }
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await fetch(`${BASE}/workspaces`);
  if (!res.ok) {
    throw new Error(`Failed to fetch workspaces: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  const {workspaces} = getWorkspacesResponseSchema.parse(json);
  return workspaces;
}

export async function putWorkspaces(workspaces: Workspace[]): Promise<void> {
  const res = await fetch(`${BASE}/workspaces`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({workspaces}),
  });

  if (res.status === (StatusCodes.UNPROCESSABLE_ENTITY as number)) {
    const json: unknown = await res.json();
    const {invalidPaths} = invalidPathsResponseSchema.parse(json);
    throw new InvalidPathsError(invalidPaths);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to save workspaces (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  putWorkspacesSuccessResponseSchema.parse(json);
}
