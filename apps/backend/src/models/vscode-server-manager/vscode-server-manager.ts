import assert from 'node:assert';
import {type ChildProcess, spawn} from 'node:child_process';
import readline from 'node:readline';

import {logger as rootLogger} from '@/logger.js';

const log = rootLogger.child({component: 'vscode-server'});

const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 30_000;

export class VscodeServerManager {
  private static instance: VscodeServerManager | null = null;

  private readonly port: number;
  private process: ChildProcess | null = null;
  private available = false;
  private shuttingDown = false;
  private readonly restartTimestamps: number[] = [];

  private constructor(port: number) {
    this.port = port;
  }

  /** Creates the singleton instance. Does not start the process -- call `start()` separately. */
  static create(port: number): VscodeServerManager {
    assert(
      VscodeServerManager.instance === null,
      'VscodeServerManager is already initialized.',
    );
    const manager = new VscodeServerManager(port);
    VscodeServerManager.instance = manager;
    return manager;
  }

  /** Returns the singleton instance. */
  static getInstance(): VscodeServerManager {
    assert(
      VscodeServerManager.instance !== null,
      'VscodeServerManager is not initialized. Call VscodeServerManager.create() first.',
    );
    return VscodeServerManager.instance;
  }

  /** Resets the singleton instance. Stops the process if running. */
  static resetInstance(): void {
    if (VscodeServerManager.instance) {
      VscodeServerManager.instance.stop();
    }
    VscodeServerManager.instance = null;
  }

  /** Returns whether the VSCode server is currently running. */
  isAvailable(): boolean {
    return this.available;
  }

  /** Starts the `code serve-web` process. */
  start(): void {
    if (this.port === 0) {
      // Port 0 means "don't actually start" -- used in tests.
      return;
    }
    this.spawn();
  }

  /** Stops the process gracefully. */
  stop(): void {
    this.shuttingDown = true;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.available = false;
  }

  private spawn(): void {
    const args = [
      'serve-web',
      '--without-connection-token',
      '--port',
      this.port.toString(),
      '--accept-server-license-terms',
    ];

    log.info({port: this.port}, 'Starting code serve-web');

    let child: ChildProcess;
    try {
      child = spawn('code', args, {stdio: ['ignore', 'pipe', 'pipe']});
    } catch {
      log.warn('VSCode CLI (code) not found -- VSCode server unavailable');
      this.available = false;
      return;
    }

    this.process = child;
    this.pipeOutput(child);

    child.on('spawn', () => {
      this.available = true;
      log.info({port: this.port}, 'code serve-web started');
    });

    child.on('error', (err) => {
      log.warn({err}, 'code serve-web failed to start');
      this.available = false;
      this.process = null;
    });

    child.on('close', (code) => {
      this.available = false;
      this.process = null;

      if (this.shuttingDown) {
        return;
      }

      if (code !== 0) {
        log.warn({exitCode: code}, 'code serve-web exited unexpectedly');
        this.maybeRestart();
      }
    });
  }

  /** Pipes child process stdout/stderr through the logger line by line. */
  private pipeOutput(child: ChildProcess): void {
    if (child.stdout) {
      const rl = readline.createInterface({input: child.stdout});
      rl.on('line', (line) => {
        log.info(line);
      });
    }
    if (child.stderr) {
      const rl = readline.createInterface({input: child.stderr});
      rl.on('line', (line) => {
        log.warn(line);
      });
    }
  }

  private maybeRestart(): void {
    const now = Date.now();
    this.restartTimestamps.push(now);

    // Keep only timestamps within the restart window.
    while (
      this.restartTimestamps.length > 0 &&
      now - this.restartTimestamps[0] > RESTART_WINDOW_MS
    ) {
      this.restartTimestamps.shift();
    }

    if (this.restartTimestamps.length > MAX_RESTARTS) {
      log.error(
        `code serve-web crashed ${MAX_RESTARTS.toString()} times in ${(RESTART_WINDOW_MS / 1000).toString()}s -- giving up`,
      );
      return;
    }

    log.info('Restarting code serve-web...');
    this.spawn();
  }
}
