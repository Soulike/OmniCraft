import {Button, Separator, Spinner} from '@heroui/react';
import {MessageCircleQuestion} from 'lucide-react';
import {Fragment} from 'react';

import {CancelledCard} from './components/CancelledCard/index.js';
import {CompletedCard} from './components/CompletedCard/index.js';
import {QuestionItem} from './components/QuestionItem/index.js';
import {SubmitErrorNotice} from './components/SubmitErrorNotice/index.js';
import {UnsupportedNotice} from './components/UnsupportedNotice/index.js';
import type {FormState} from './hooks/useFormState.js';
import styles from './styles.module.css';
import type {AskUserAnswer, AskUserQuestion} from './types.js';

type CardStatus = 'running' | 'done' | 'failure' | 'error';

interface AskUserCardViewProps {
  questions: AskUserQuestion[];
  formState: FormState;
  status: CardStatus;
  completedAnswers: AskUserAnswer[] | null;
  failureMessage: string | null;
  submitting: boolean;
  submitError: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AskUserCardView({
  questions,
  formState,
  status,
  completedAnswers,
  failureMessage,
  submitting,
  submitError,
  canSubmit,
  onSubmit,
  onCancel,
}: AskUserCardViewProps) {
  if (status === 'done' && completedAnswers) {
    return <CompletedCard answers={completedAnswers} />;
  }

  if (status === 'failure' || status === 'error') {
    return <CancelledCard message={failureMessage} />;
  }

  const disabled = submitting || !canSubmit;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <MessageCircleQuestion size={16} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Questions from Assistant</span>
      </div>
      <div className={styles.body}>
        {questions.map((q, i) => (
          <Fragment key={q.question}>
            {i > 0 && <Separator />}
            <QuestionItem
              question={q}
              index={i}
              formState={formState}
              disabled={disabled}
            />
          </Fragment>
        ))}
      </div>
      {!canSubmit && <UnsupportedNotice />}
      {canSubmit && submitError && (
        <div className={styles.errorSlot}>
          <SubmitErrorNotice />
        </div>
      )}
      <div className={styles.footer}>
        <Button variant='ghost' isDisabled={disabled} onPress={onCancel}>
          Cancel
        </Button>
        <Button variant='primary' isDisabled={disabled} onPress={onSubmit}>
          {submitting ? <Spinner size='sm' /> : 'Submit'}
        </Button>
      </div>
    </div>
  );
}
