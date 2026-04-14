import {
  type GetVscodeStatusResponse,
  getVscodeStatusResponseSchema,
} from '@omnicraft/api-schema';

const BASE = '/api/vscode';

/** Checks if the VSCode server is available. */
export async function getVscodeStatus(): Promise<GetVscodeStatusResponse> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) {
    return {available: false, port: 0, connectionToken: ''};
  }
  const body: unknown = await res.json();
  return getVscodeStatusResponseSchema.parse(body);
}

/** Returns the URL to open VSCode in a new tab for the given workspace folder. */
export function getVscodeUrl(
  port: number,
  connectionToken: string,
  workspace: string,
): string {
  const url = new URL(window.location.origin);
  url.port = port.toString();
  url.searchParams.set('tkn', connectionToken);
  url.searchParams.set('folder', workspace);
  return url.toString();
}
