import type {SessionMetadata} from '@omnicraft/api-schema';
import {renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useTaskStatuses} from './useTaskStatuses.js';

function s(id: string, isRunning: boolean): SessionMetadata {
  return {id, title: id, isRunning};
}

describe('useTaskStatuses', () => {
  it('reports running for sessions with isRunning true', () => {
    const {result} = renderHook(() => useTaskStatuses([s('a', true)], null));
    expect(result.current.get('a')).toBe('running');
  });

  it('reports done when a non-selected session stops running', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true)]}},
    );
    expect(result.current.get('a')).toBe('running');
    rerender({sessions: [s('a', false)]});
    expect(result.current.get('a')).toBe('done');
  });

  it('never reports done for the selected session', () => {
    const {result, rerender} = renderHook(
      ({sessions, selected}: {sessions: SessionMetadata[]; selected: string}) =>
        useTaskStatuses(sessions, selected),
      {initialProps: {sessions: [s('a', true)], selected: 'a'}},
    );
    rerender({sessions: [s('a', false)], selected: 'a'});
    expect(result.current.get('a')).toBe('idle');
  });

  it('clears done when the session is selected', () => {
    const {result, rerender} = renderHook(
      ({
        sessions,
        selected,
      }: {
        sessions: SessionMetadata[];
        selected: string | null;
      }) => useTaskStatuses(sessions, selected),
      {
        initialProps: {
          sessions: [s('a', true)],
          selected: null as string | null,
        },
      },
    );
    rerender({sessions: [s('a', false)], selected: null});
    expect(result.current.get('a')).toBe('done');
    rerender({sessions: [s('a', false)], selected: 'a'});
    expect(result.current.get('a')).toBe('idle');
  });

  it('clears done when the session starts running again', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true)]}},
    );
    rerender({sessions: [s('a', false)]});
    expect(result.current.get('a')).toBe('done');
    rerender({sessions: [s('a', true)]});
    expect(result.current.get('a')).toBe('running');
  });

  it('drops sessions that leave the list', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true), s('b', false)]}},
    );
    rerender({sessions: [s('b', false)]});
    expect(result.current.has('a')).toBe(false);
    expect(result.current.get('b')).toBe('idle');
  });
});
