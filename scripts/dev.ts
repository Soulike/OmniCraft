import {spawn} from 'node:child_process';

import {getFreePorts} from './free-ports';

const [httpPort, vscodePort] = await getFreePorts(2);

console.log(`Dev ports: PORT=${httpPort}, VSCODE_PORT=${vscodePort}`);

const child = spawn('bun', ['run', '--filter', './apps/*', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(httpPort),
    VSCODE_PORT: String(vscodePort),
  },
});

child.on('error', (error) => {
  console.error('Failed to start dev processes:', error);
  process.exit(1);
});

const forward = (signal: NodeJS.Signals) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
