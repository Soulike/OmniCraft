import {useCallback, useState} from 'react';

import type {AskUserSubmitHandler} from '../../../../../types.js';
import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  callId: string;
  collectAnswers: () => AnswerEntry[];
  onSubmit: AskUserSubmitHandler | null;
}

export interface SubmitActions {
  submitting: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Submits or cancels the questionnaire via the injected handler. Fire-and-
 *  forget: the outcome surfaces through subsequent SSE events. When no handler
 *  is provided the stream cannot accept submissions.
 *  TODO(#307): refine disabled-state UI for the no-handler case. */
export function useSubmitActions({
  callId,
  collectAnswers,
  onSubmit,
}: UseSubmitActionsParams): SubmitActions {
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = onSubmit !== null;

  const handleSubmit = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    onSubmit(callId, {cancelled: false, answers: collectAnswers()});
  }, [callId, collectAnswers, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    onSubmit(callId, {cancelled: true});
  }, [callId, submitting, onSubmit]);

  return {submitting, canSubmit, handleSubmit, handleCancel};
}
