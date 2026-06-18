import net from 'node:net';

import {describe, expect, it} from 'vitest';

import {getFreePorts} from './free-ports';

function canBind(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve());
    });
  });
}

describe('getFreePorts', () => {
  it('returns the requested number of ports', async () => {
    const ports = await getFreePorts(2);
    expect(ports).toHaveLength(2);
  });

  it('returns positive port numbers', async () => {
    const ports = await getFreePorts(3);
    for (const port of ports) {
      expect(port).toBeGreaterThan(0);
    }
  });

  it('returns distinct ports', async () => {
    const ports = await getFreePorts(5);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('returns ports that can be bound', async () => {
    const [port] = await getFreePorts(1);
    await expect(canBind(port)).resolves.toBeUndefined();
  });

  it('returns an empty array for a count of zero', async () => {
    const ports = await getFreePorts(0);
    expect(ports).toEqual([]);
  });
});
