import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useSubmitActions} from './useSubmitActions.js';

describe('useSubmitActions', () => {
  it('calls onSubmit with the given answers on submit', () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleSubmit([{question: 'q', answer: 'a'}]);
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    });
  });

  it('calls onSubmit with cancelled on cancel', () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {cancelled: true});
  });

  it('sets submitting while the submission is in flight', () => {
    let resolve: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleSubmit([]);
    });

    expect(result.current.submitting).toBe(true);

    act(() => {
      resolve?.();
    });
  });

  it('resets submitting when the submission fails so the user can retry', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('network')));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleSubmit([]);
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });

    // Retry is possible again: a second submit invokes the handler once more.
    act(() => {
      result.current.handleSubmit([]);
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    // Wait for the retry's rejection to settle while the spy is still active,
    // so its console.error doesn't leak past mockRestore.
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledTimes(2);
    });
    consoleError.mockRestore();
  });

  it('resets submitting when a cancel fails', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('network')));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });
    expect(result.current.submitError).toBe(true);
    consoleError.mockRestore();
  });

  it('clears submitError when the user cancels again', async () => {
    let attempt = 0;
    const onSubmit = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('network'))
        : Promise.resolve();
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });
    await waitFor(() => {
      expect(result.current.submitError).toBe(true);
    });

    act(() => {
      result.current.handleCancel();
    });
    expect(result.current.submitError).toBe(false);
    consoleError.mockRestore();
  });

  it('reports canSubmit=false when no handler is provided', () => {
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit: null}),
    );

    expect(result.current.canSubmit).toBe(false);
    act(() => {
      result.current.handleSubmit([]);
    });
    // no throw; nothing to assert beyond not crashing
  });

  it('exposes submitError=false initially', () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    expect(result.current.submitError).toBe(false);
  });

  it('sets submitError=true when a submit fails, and logs the raw error', async () => {
    const error = new Error('network');
    const onSubmit = vi.fn(() => Promise.reject(error));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleSubmit([]);
    });

    await waitFor(() => {
      expect(result.current.submitError).toBe(true);
    });
    expect(consoleError).toHaveBeenCalledWith('ask_user submit failed', error);
    consoleError.mockRestore();
  });

  it('clears submitError when the user submits again', async () => {
    let attempt = 0;
    const onSubmit = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('network'))
        : Promise.resolve();
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', onSubmit}),
    );

    act(() => {
      result.current.handleSubmit([]);
    });
    await waitFor(() => {
      expect(result.current.submitError).toBe(true);
    });

    act(() => {
      result.current.handleSubmit([]);
    });
    expect(result.current.submitError).toBe(false);
    consoleError.mockRestore();
  });
});
