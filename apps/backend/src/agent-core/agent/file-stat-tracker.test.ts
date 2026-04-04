import {describe, expect, it} from 'vitest';

import {FileStatCheckResult, FileStatTracker} from './file-stat-tracker.js';

describe('FileStatTracker', () => {
  it('returns NOT_READ for untracked files', () => {
    const tracker = new FileStatTracker();

    const result = tracker.canModify('/a/b.ts', 100, 1000);

    expect(result).toBe(FileStatCheckResult.NOT_READ);
  });

  it('returns OK after set with matching stat', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 100, 1000);

    expect(result).toBe(FileStatCheckResult.OK);
  });

  it('returns MODIFIED_SINCE_LAST_READ when size differs', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 200, 1000);

    expect(result).toBe(FileStatCheckResult.MODIFIED_SINCE_LAST_READ);
  });

  it('returns MODIFIED_SINCE_LAST_READ when mtimeMs differs', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 100, 2000);

    expect(result).toBe(FileStatCheckResult.MODIFIED_SINCE_LAST_READ);
  });

  it('clears record on NOT_READ', () => {
    const tracker = new FileStatTracker();

    tracker.canModify('/a/b.ts', 100, 1000);
    // Set after canModify should work normally
    tracker.set('/a/b.ts', 100, 1000);
    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.OK,
    );
  });

  it('clears record on MODIFIED_SINCE_LAST_READ', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    // Trigger MODIFIED
    tracker.canModify('/a/b.ts', 200, 1000);

    // Now it should be NOT_READ since record was cleared
    expect(tracker.canModify('/a/b.ts', 200, 1000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });

  it('updates record with set', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);
    tracker.set('/a/b.ts', 200, 2000);

    expect(tracker.canModify('/a/b.ts', 200, 2000)).toBe(
      FileStatCheckResult.OK,
    );
    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.MODIFIED_SINCE_LAST_READ,
    );
  });

  it('delete removes the record', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);
    tracker.delete('/a/b.ts');

    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });

  it('delete on untracked file does not throw', () => {
    const tracker = new FileStatTracker();

    expect(() => { tracker.delete('/a/b.ts'); }).not.toThrow();
  });

  it('tracks multiple files independently', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a.ts', 100, 1000);
    tracker.set('/b.ts', 200, 2000);

    expect(tracker.canModify('/a.ts', 100, 1000)).toBe(FileStatCheckResult.OK);
    expect(tracker.canModify('/b.ts', 200, 2000)).toBe(FileStatCheckResult.OK);
    expect(tracker.canModify('/c.ts', 300, 3000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });
});
