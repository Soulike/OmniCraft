import {act, renderHook} from '@testing-library/react';
import {createElement, type ReactNode} from 'react';
import {describe, expect, it, vi} from 'vitest';

import {
  SessionConfigContext,
  type SessionConfigContextValue,
} from '@/modules/chat-session/contexts/SessionConfigContext/index.js';

import {useTaskDispatchForm} from './useTaskDispatchForm.js';

function createWrapper() {
  const value: SessionConfigContextValue = {
    workspaces: [],
    isLoading: false,
    loadError: null,
    selectedWorkspace: undefined,
    setSelectedWorkspace: vi.fn(),
  };

  return function Wrapper({children}: {readonly children: ReactNode}) {
    return createElement(SessionConfigContext, {value}, children);
  };
}

describe('useTaskDispatchForm', () => {
  it('blocks submit and reports validation errors without workspace or task', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(
      () =>
        useTaskDispatchForm({
          selectedWorkspace: undefined,
          isBlocked: false,
          onStartTask,
        }),
      {wrapper: createWrapper()},
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

    const {result} = renderHook(
      () =>
        useTaskDispatchForm({
          selectedWorkspace: '/repo',
          isBlocked: false,
          onStartTask,
        }),
      {wrapper: createWrapper()},
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
    });
    expect(result.current.errors).toEqual({});
  });

  it('treats external blocked state as a submit blocker', () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const blocked = renderHook(
      () =>
        useTaskDispatchForm({
          selectedWorkspace: '/repo',
          isBlocked: true,
          onStartTask,
        }),
      {wrapper: createWrapper()},
    );
    act(() => {
      blocked.result.current.setTask('Do work');
    });
    expect(blocked.result.current.canSubmit).toBe(false);
  });

  it('does not submit when externally blocked', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(
      () =>
        useTaskDispatchForm({
          selectedWorkspace: '/repo',
          isBlocked: true,
          onStartTask,
        }),
      {wrapper: createWrapper()},
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
          onStartTask,
        }),
      {initialProps, wrapper: createWrapper()},
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
