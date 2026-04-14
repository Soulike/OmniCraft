import {afterEach, describe, expect, it} from 'vitest';

import {VscodeServerManager} from './vscode-server-manager.js';

describe('VscodeServerManager', () => {
  afterEach(() => {
    VscodeServerManager.resetInstance();
  });

  it('throws if getInstance is called before create', () => {
    expect(() => VscodeServerManager.getInstance()).toThrow(
      'VscodeServerManager is not initialized',
    );
  });

  it('creates a singleton instance', () => {
    VscodeServerManager.create(0); // port 0 = don't actually start
    const instance = VscodeServerManager.getInstance();
    expect(instance).toBeInstanceOf(VscodeServerManager);
  });

  it('throws if create is called twice', () => {
    VscodeServerManager.create(0);
    expect(() => VscodeServerManager.create(0)).toThrow(
      'VscodeServerManager is already initialized',
    );
  });

  it('reports unavailable before start', () => {
    VscodeServerManager.create(0);
    expect(VscodeServerManager.getInstance().isAvailable()).toBe(false);
  });
});
