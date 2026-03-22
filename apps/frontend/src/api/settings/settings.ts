import {getValueResponse, putValueResponse} from './validator.js';

const BASE = '/api/settings';

function encodeKeyPath(keyPath: string): string {
  return keyPath.split('/').map(encodeURIComponent).join('/');
}

/** Fetches the settings JSON Schema from the backend. */
export async function getSettingsJSONSchema(): Promise<unknown> {
  const res = await fetch(`${BASE}/json-schema`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch settings schema: ${res.status.toString()}`,
    );
  }
  return res.json() as Promise<unknown>;
}

/** Reads a scalar setting value at the given key path. */
export async function getSettingValue(keyPath: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${encodeKeyPath(keyPath)}`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch setting ${keyPath}: ${res.status.toString()}`,
    );
  }
  const body: unknown = await res.json();
  return getValueResponse.parse(body).value;
}

/** Writes a scalar setting value at the given key path. */
export async function putSettingValue(
  keyPath: string,
  value: unknown,
): Promise<void> {
  const res = await fetch(`${BASE}/${encodeKeyPath(keyPath)}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value}),
  });
  if (!res.ok) {
    throw new Error(
      `Failed to update setting ${keyPath}: ${res.status.toString()}`,
    );
  }
  const body: unknown = await res.json();
  putValueResponse.parse(body);
}
