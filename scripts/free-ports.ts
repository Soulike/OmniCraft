import net from 'node:net';

interface HeldPort {
  port: number;
  server: net.Server;
}

function listenOnFreePort(): Promise<HeldPort> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to read assigned port'));
        return;
      }
      resolve({port: address.port, server});
    });
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * Returns `count` distinct, currently-free TCP ports. All listeners are opened
 * simultaneously so the OS is forced to assign different ports, then released.
 */
export async function getFreePorts(count: number): Promise<number[]> {
  const held = await Promise.all(
    Array.from({length: count}, () => listenOnFreePort()),
  );
  const ports = held.map(({port}) => port);
  await Promise.all(held.map(({server}) => close(server)));
  return ports;
}
