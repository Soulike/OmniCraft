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
  canSubmit: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Submits or cancels the questionnaire via the injected handler. The handler
 *  returns a promise; on rejection the submitting state is reset so the user
 *  can retry. When no handler is provided the stream cannot accept submissions.
 *  TODO(#307): surface an in-card failure message on rejection. */
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
    onSubmit(callId, {cancelled: false, answers: collectAnswers()}).catch(
      () => {
        setSubmitting(false);
      },
    );
  }, [callId, collectAnswers, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    onSubmit(callId, {cancelled: true}).catch(() => {
      setSubmitting(false);
    });
  }, [callId, submitting, onSubmit]);

  return {submitting, canSubmit, handleSubmit, handleCancel};
}
