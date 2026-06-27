import {useCallback} from 'react';

import {AskUserCardView} from './AskUserCardView.js';
import {useFormState} from './hooks/useFormState.js';
import type {AskUserAnswer, AskUserQuestion} from './types.js';

export type AskUserCardStatus = 'running' | 'done' | 'failure' | 'error';

interface AskUserCardProps {
  status: AskUserCardStatus;
  questions: AskUserQuestion[];
  /** Receives the collected answers when the user submits. `null` means this
   *  stream has no submit channel — the card renders read-only/disabled. The
   *  caller owns the submit flow (sending, in-flight and error state); this
   *  component only renders and hands the answers back. */
  onSubmit: ((answers: AskUserAnswer[]) => void) | null;
  onCancel: () => void;
  /** Submit/cancel is in flight (driven by the caller). */
  submitting: boolean;
  /** The last submit/cancel attempt failed (driven by the caller). */
  submitError: boolean;
  /** Answers to show once the question round is done. */
  completedAnswers: AskUserAnswer[] | null;
  /** Message to show when the round failed or was cancelled. */
  failureMessage: string | null;
}

export function AskUserCard({
  status,
  questions,
  onSubmit,
  onCancel,
  submitting,
  submitError,
  completedAnswers,
  failureMessage,
}: AskUserCardProps) {
  const formState = useFormState(questions);
  const canSubmit = onSubmit !== null;

  const handleSubmit = useCallback(() => {
    onSubmit?.(formState.collectAnswers());
  }, [onSubmit, formState]);

  return (
    <AskUserCardView
      questions={questions}
      formState={formState}
      status={status}
      completedAnswers={completedAnswers}
      failureMessage={failureMessage}
      submitting={submitting}
      submitError={submitError}
      canSubmit={canSubmit}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
