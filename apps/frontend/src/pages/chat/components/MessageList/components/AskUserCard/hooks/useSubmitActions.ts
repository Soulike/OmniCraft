import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';

import {submitToolResponse} from '@/api/chat/index.js';

import {useSessionId} from '../../../../../hooks/useSessionId.js';
import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  callId: string;
  collectAnswers: () => AnswerEntry[];
}

export interface SubmitActions {
  submitting: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Handles submitting or cancelling the questionnaire via the bridge API. */
export function useSubmitActions({
  callId,
  collectAnswers,
}: UseSubmitActionsParams): SubmitActions {
  const {sessionId} = useSessionId();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!sessionId || submitting) return;
    setSubmitting(true);

    const answers = collectAnswers();
    submitToolResponse(sessionId, callId, {
      cancelled: false,
      answers,
    }).catch(() => {
      setSubmitting(false);
      toast.danger('Failed to submit response. Please try again.');
    });
  }, [sessionId, callId, collectAnswers, submitting]);

  const handleCancel = useCallback(() => {
    if (!sessionId || submitting) return;
    setSubmitting(true);

    submitToolResponse(sessionId, callId, {cancelled: true}).catch(() => {
      setSubmitting(false);
      toast.danger('Failed to cancel. Please try again.');
    });
  }, [sessionId, callId, submitting]);

  return {submitting, handleSubmit, handleCancel};
}
