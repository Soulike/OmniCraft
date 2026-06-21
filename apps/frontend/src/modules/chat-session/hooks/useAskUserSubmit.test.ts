import {renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useAskUserSubmit} from './useAskUserSubmit.js';
import {useChatSessionApi} from './useChatSessionApi.js';
import {useSessionId} from './useSessionId.js';

vi.mock('./useChatSessionApi.js');
vi.mock('./useSessionId.js');

const mockedUseSessionId = vi.mocked(useSessionId);
const mockedUseChatSessionApi = vi.mocked(useChatSessionApi);

function mockSession(sessionId: string | null, submitToolResponse = vi.fn()) {
  mockedUseSessionId.mockReturnValue({
    sessionId,
  } as ReturnType<typeof useSessionId>);
  mockedUseChatSessionApi.mockReturnValue({
    submitToolResponse,
  } as unknown as ReturnType<typeof useChatSessionApi>);
  return {submitToolResponse};
}

describe('useAskUserSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when there is no active session', () => {
    mockSession(null);
    const {result} = renderHook(() => useAskUserSubmit());
    expect(result.current).toBeNull();
  });

  it('returns a handler that delivers the response when a session is active', () => {
    const {submitToolResponse} = mockSession('s1');
    submitToolResponse.mockReturnValue(Promise.resolve());

    const {result} = renderHook(() => useAskUserSubmit());
    expect(result.current).not.toBeNull();

    void result.current?.('c1', {cancelled: true});
    expect(submitToolResponse).toHaveBeenCalledWith('s1', 'c1', {
      cancelled: true,
    });
  });

  it('propagates the delivery promise so the card can catch failures', async () => {
    const {submitToolResponse} = mockSession('s1');
    const rejection = Promise.reject(new Error('network'));
    submitToolResponse.mockReturnValue(rejection);

    const {result} = renderHook(() => useAskUserSubmit());
    await expect(
      result.current?.('c1', {cancelled: false, answers: []}),
    ).rejects.toThrow('network');
  });
});
