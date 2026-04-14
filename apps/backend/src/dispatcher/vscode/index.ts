import type {Server} from 'node:http';

import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

import {VSCODE_BASE_PATH} from './path.js';

export {router} from './router.js';

/** Attaches the WebSocket upgrade handler for VSCode proxy to the server. */
export function attachVscodeUpgrade(server: Server): void {
  const manager = VscodeServerManager.getInstance();
  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith(VSCODE_BASE_PATH + '/')) {
      return;
    }
    if (!manager.isAvailable()) {
      socket.destroy();
      return;
    }
    // Strip the prefix so upstream receives the original path.
    req.url = req.url.slice(VSCODE_BASE_PATH.length);
    manager.proxyWebSocket(req, socket, head);
  });
}
