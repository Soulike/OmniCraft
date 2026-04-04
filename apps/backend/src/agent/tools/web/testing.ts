/**
 * Shared test helpers for the web tools module.
 * Only imported by test files — never by production code.
 */
import http from 'node:http';

/** Creates a local HTTP server that responds with the given content-type and body. */
export function createTestServer(
  contentType: string,
  body: string | Buffer,
  statusCode = 200,
): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(statusCode, {'Content-Type': contentType});
    res.end(body);
  });
}

/** Returns the base URL for a listening server. */
export function serverUrl(server: http.Server): string {
  const addr = server.address();
  if (typeof addr === 'string' || addr === null) {
    throw new Error('Unexpected address');
  }
  return `http://127.0.0.1:${addr.port.toString()}`;
}

/** Starts a server on a random port on 127.0.0.1. */
export function startServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

/** Stops a running server. */
export function stopServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
