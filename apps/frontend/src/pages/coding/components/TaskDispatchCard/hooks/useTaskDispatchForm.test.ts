import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useTaskDispatchForm} from './useTaskDispatchForm.js';

describe('useTaskDispatchForm', () => {
  it('blocks submit and reports validation errors without workspace or task', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: undefined,
        isBlocked: false,
        isStarting: false,
        onStartTask,
      }),
    );

    expect(result.current.canSubmit).toBe(false);

    await act(async () => {
      await result.current.submit();
    });

    expect(onStartTask).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({
      workspace: 'Select a workspace before starting a task.',
      task: 'Describe the coding task before starting.',
    });
  });

  it('trims task text and submits values', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: false,
        isStarting: false,
        onStartTask,
      }),
    );

    act(() => {
      result.current.setTask('  Fix the failing tests.  ');
    });

    expect(result.current.canSubmit).toBe(true);

    await act(async () => {
      await result.current.submit();
    });

    expect(onStartTask).toHaveBeenCalledWith({
      task: 'Fix the failing tests.',
      thinkingLevel: 'none',
    });
    expect(result.current.errors).toEqual({});
  });

  it('treats external blocked and starting states as submit blockers', () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const blocked = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: true,
        isStarting: false,
        onStartTask,
      }),
    );
    act(() => {
      blocked.result.current.setTask('Do work');
    });
    expect(blocked.result.current.canSubmit).toBe(false);

    const starting = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: false,
        isStarting: true,
        onStartTask,
      }),
    );
    act(() => {
      starting.result.current.setTask('Do work');
    });
    expect(starting.result.current.canSubmit).toBe(false);
  });

  it('does not submit when externally blocked', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: true,
        isStarting: false,
        onStartTask,
      }),
    );

    act(() => {
      result.current.setTask('Do work');
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(onStartTask).not.toHaveBeenCalled();
  });

  it('clears stale workspace errors when a workspace is selected', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);
    const initialProps: {readonly selectedWorkspace: string | undefined} = {
      selectedWorkspace: undefined,
    };

    const {result, rerender} = renderHook(
      ({selectedWorkspace}: {readonly selectedWorkspace: string | undefined}) =>
        useTaskDispatchForm({
          selectedWorkspace,
          isBlocked: false,
          isStarting: false,
          onStartTask,
        }),
      {initialProps},
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.errors).toEqual({
      workspace: 'Select a workspace before starting a task.',
      task: 'Describe the coding task before starting.',
    });

    rerender({selectedWorkspace: '/repo'});
    act(() => {
      result.current.setTask('Do work');
    });

    expect(result.current.canSubmit).toBe(true);
    expect(result.current.errors).toEqual({});
  });
});
