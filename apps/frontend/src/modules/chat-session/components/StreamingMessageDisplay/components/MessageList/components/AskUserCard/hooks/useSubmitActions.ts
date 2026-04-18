import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';

import {useChatSessionApi} from '../../../../../../../hooks/useChatSessionApi.js';
import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  sessionId: string;
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
  sessionId,
  callId,
  collectAnswers,
}: UseSubmitActionsParams): SubmitActions {
  const [submitting, setSubmitting] = useState(false);
  const {submitToolResponse} = useChatSessionApi();

  const handleSubmit = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);

    const answers = collectAnswers();
    submitToolResponse(sessionId, callId, {
      cancelled: false,
      answers,
    }).catch(() => {
      setSubmitting(false);
      toast.danger('Failed to submit response. Please try again.');
    });
  }, [sessionId, callId, collectAnswers, submitting, submitToolResponse]);

  const handleCancel = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);

    submitToolResponse(sessionId, callId, {cancelled: true}).catch(() => {
      setSubmitting(false);
      toast.danger('Failed to cancel. Please try again.');
    });
  }, [sessionId, callId, submitting, submitToolResponse]);

  return {submitting, handleSubmit, handleCancel};
}
