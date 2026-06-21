import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useSubmitActions} from './useSubmitActions.js';

describe('useSubmitActions', () => {
  it('calls onSubmit with collected answers on submit', () => {
    const onSubmit = vi.fn();
    const collectAnswers = () => [{question: 'q', answer: 'a'}];
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers, onSubmit}),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    });
  });

  it('calls onSubmit with cancelled on cancel', () => {
    const onSubmit = vi.fn();
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {cancelled: true});
  });

  it('reports canSubmit=false when no handler is provided', () => {
    const {result} = renderHook(() =>
      useSubmitActions({
        callId: 'c1',
        collectAnswers: () => [],
        onSubmit: null,
      }),
    );

    expect(result.current.canSubmit).toBe(false);
    act(() => {
      result.current.handleSubmit();
    });
    // no throw; nothing to assert beyond not crashing
  });
});
