import {useCallback, useState} from 'react';

import type {AskUserSubmitHandler} from '@/modules/chat-events/index.js';

import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  callId: string;
  collectAnswers: () => AnswerEntry[];
  onSubmit: AskUserSubmitHandler | null;
}

export interface SubmitActions {
  submitting: boolean;
  submitError: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Submits or cancels the questionnaire via the injected handler. The handler
 *  returns a promise; on rejection the submitting state is reset and
 *  submitError is raised so the card can show a retry notice. The raw error is
 *  logged to the console (never surfaced in the UI). Pressing submit/cancel
 *  again clears the prior error before re-sending. When no handler is provided
 *  the stream cannot accept submissions. */
export function useSubmitActions({
  callId,
  collectAnswers,
  onSubmit,
}: UseSubmitActionsParams): SubmitActions {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const canSubmit = onSubmit !== null;

  const handleSubmit = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    setSubmitError(false);
    onSubmit(callId, {cancelled: false, answers: collectAnswers()}).catch(
      (error: unknown) => {
        console.error('ask_user submit failed', error);
        setSubmitting(false);
        setSubmitError(true);
      },
    );
  }, [callId, collectAnswers, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    setSubmitError(false);
    onSubmit(callId, {cancelled: true}).catch((error: unknown) => {
      console.error('ask_user cancel failed', error);
      setSubmitting(false);
      setSubmitError(true);
    });
  }, [callId, submitting, onSubmit]);

  return {submitting, submitError, canSubmit, handleSubmit, handleCancel};
}
