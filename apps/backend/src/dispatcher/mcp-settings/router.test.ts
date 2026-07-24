import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';

import {bodyParser} from '@koa/bodyparser';
import Koa from 'koa';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

import {dispatcher} from '@/dispatcher/index.js';

const {setSettings} = vi.hoisted(() => ({
  setSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/mcp-settings/index.js', () => ({
  mcpSettingsService: {setSettings},
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = new Koa();
  app.use(bodyParser());
  // Boot the real dispatcher (not just this router): the generic
  // `/settings/*path` route also matches `/settings/mcp`, so this guards that
  // the dedicated endpoint stays registered ahead of it and is not shadowed.
  app.use(dispatcher());
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const {port} = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port.toString()}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  setSettings.mockClear();
});

function putMcpSettings(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/settings/mcp`, {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
}

const validRequest = {
  mcp: {
    servers: [
      {
        name: 'fs',
        transport: {type: 'stdio', command: 'npx', args: [], env: {}},
      },
    ],
    enabledByAgent: {chat: ['fs'], coding: []},
  },
};

describe('PUT /api/settings/mcp', () => {
  it('persists a valid request instead of the generic /settings/* route', async () => {
    const res = await putMcpSettings(validRequest);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({success: true});
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings).toHaveBeenCalledWith(validRequest.mcp);
  });

  it('rejects a malformed body with 400 and does not write', async () => {
    const res = await putMcpSettings({mcp: {servers: [{name: 'Bad Name'}]}});

    expect(res.status).toBe(400);
    expect(setSettings).not.toHaveBeenCalled();
  });
});
