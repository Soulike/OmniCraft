import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {
  getAllowedPathsResponse,
  type InvalidPathEntry,
  putAllowedPathsSuccessResponse,
} from './validator.js';

const BASE = '/api/settings/file-access';

export type {InvalidPathEntry};

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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to save allowed paths (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  putAllowedPathsSuccessResponse.parse(json);
}
