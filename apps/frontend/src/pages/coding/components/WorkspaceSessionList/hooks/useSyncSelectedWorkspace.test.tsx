import type {SessionMetadata} from '@omnicraft/api-schema';
import {renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {useSyncSelectedWorkspace} from './useSyncSelectedWorkspace.js';

const setSelectedWorkspace = vi.fn();

const sessions = [
  {id: 's1', title: 'One', workingDirectory: '/a'},
  {id: 's2', title: 'Two'},
] as readonly SessionMetadata[];

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSyncSelectedWorkspace', () => {
  it("syncs the active session's workingDirectory", () => {
    renderHook(() => {
      useSyncSelectedWorkspace(sessions, 's1', setSelectedWorkspace);
    });
    expect(setSelectedWorkspace).toHaveBeenLastCalledWith('/a');
  });

  it('clears when the active session has no workingDirectory', () => {
    renderHook(() => {
      useSyncSelectedWorkspace(sessions, 's2', setSelectedWorkspace);
    });
    expect(setSelectedWorkspace).toHaveBeenLastCalledWith(undefined);
  });

  it('clears when no session is active or it is not yet loaded', () => {
    renderHook(() => {
      useSyncSelectedWorkspace(sessions, 'missing', setSelectedWorkspace);
    });
    expect(setSelectedWorkspace).toHaveBeenLastCalledWith(undefined);
  });

  it('re-syncs when the active session changes', () => {
    const {rerender} = renderHook(
      ({id}) => {
        useSyncSelectedWorkspace(sessions, id, setSelectedWorkspace);
      },
      {initialProps: {id: 's2'}},
    );
    expect(setSelectedWorkspace).toHaveBeenLastCalledWith(undefined);

    rerender({id: 's1'});
    expect(setSelectedWorkspace).toHaveBeenLastCalledWith('/a');
  });
});
