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
  const results = await Promise.allSettled(
    Array.from({length: count}, () => listenOnFreePort()),
  );

  const held = results
    .filter(
      (result): result is PromiseFulfilledResult<HeldPort> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value);

  await Promise.all(held.map(({server}) => close(server)));

  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    throw failure.reason;
  }

  return held.map(({port}) => port);
}
