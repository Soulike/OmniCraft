import {
  type GetVscodeStatusResponse,
  getVscodeStatusResponseSchema,
} from '@omnicraft/api-schema';

const BASE = '/api/vscode';

/** Checks if the VSCode server is available. */
export async function getVscodeStatus(): Promise<GetVscodeStatusResponse> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) {
    return {available: false};
  }
  const body: unknown = await res.json();
  return getVscodeStatusResponseSchema.parse(body);
}

/** Returns the URL to open VSCode in a new tab for the given workspace folder. */
export function getVscodeUrl(workspace: string): string {
  return `${BASE}/?folder=${encodeURIComponent(workspace)}`;
}
