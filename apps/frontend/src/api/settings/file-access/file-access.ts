import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {StatusCodes} from 'http-status-codes';

import {
  getAllowedPathsResponse,
  type InvalidPathEntry,
  invalidPathsResponse,
  putAllowedPathsSuccessResponse,
} from './validator.js';

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

export async function getAllowedPaths(): Promise<AllowedPathEntry[]> {
  const res = await fetch(`${BASE}/allowed-paths`);
  if (!res.ok) {
    throw new Error(`Failed to fetch allowed paths: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  const {allowedPaths} = getAllowedPathsResponse.parse(json);
  return allowedPaths;
}

export async function putAllowedPaths(
  allowedPaths: AllowedPathEntry[],
): Promise<void> {
  const res = await fetch(`${BASE}/allowed-paths`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({allowedPaths}),
  });

  if (res.status === (StatusCodes.UNPROCESSABLE_ENTITY as number)) {
    const json: unknown = await res.json();
    const {invalidPaths} = invalidPathsResponse.parse(json);
    throw new InvalidPathsError(invalidPaths);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to save allowed paths (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  putAllowedPathsSuccessResponse.parse(json);
}
