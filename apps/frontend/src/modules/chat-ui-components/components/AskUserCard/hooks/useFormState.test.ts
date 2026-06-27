import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import type {AskUserQuestion} from '../types.js';
import {useFormState} from './useFormState.js';

describe('useFormState', () => {
  it('collects typed text for a free-text (no-options) question', () => {
    const questions: AskUserQuestion[] = [
      {question: 'What is your name?', options: []},
    ];
    const {result} = renderHook(() => useFormState(questions));

    act(() => {
      result.current.setCustomText(0, 'Ada Lovelace');
    });

    expect(result.current.collectAnswers()).toEqual([
      {question: 'What is your name?', answer: 'Ada Lovelace'},
    ]);
  });

  it('collects null for a free-text question left blank or whitespace-only', () => {
    const questions: AskUserQuestion[] = [
      {question: 'Any notes?', options: []},
    ];
    const {result} = renderHook(() => useFormState(questions));

    act(() => {
      result.current.setCustomText(0, '   ');
    });

    expect(result.current.collectAnswers()).toEqual([
      {question: 'Any notes?', answer: null},
    ]);
  });

  it('collects the selected option for an options question', () => {
    const questions: AskUserQuestion[] = [
      {question: 'Pick one', options: ['A', 'B']},
    ];
    const {result} = renderHook(() => useFormState(questions));

    act(() => {
      result.current.toggleOption(0, 'B');
    });

    expect(result.current.collectAnswers()).toEqual([
      {question: 'Pick one', answer: 'B'},
    ]);
  });

  it('collects the typed text when "Other" is chosen on an options question', () => {
    const questions: AskUserQuestion[] = [
      {question: 'Pick one', options: ['A', 'B']},
    ];
    const {result} = renderHook(() => useFormState(questions));

    act(() => {
      result.current.switchToCustom(0);
    });
    act(() => {
      result.current.setCustomText(0, 'C');
    });

    expect(result.current.collectAnswers()).toEqual([
      {question: 'Pick one', answer: 'C'},
    ]);
  });
});
