import {Button, Spinner} from '@heroui/react';
import {MessageCircleQuestion} from 'lucide-react';

import {CancelledCard} from './components/CancelledCard/index.js';
import {CompletedCard} from './components/CompletedCard/index.js';
import {QuestionItem} from './components/QuestionItem/index.js';
import type {FormState} from './hooks/useFormState.js';
import type {SubmitActions} from './hooks/useSubmitActions.js';
import styles from './styles.module.css';
import type {AnswerEntry, Question} from './types.js';

type CardStatus = 'running' | 'done' | 'failure' | 'error';

interface AskUserCardViewProps {
  questions: Question[];
  formState: FormState;
  submitActions: SubmitActions;
  status: CardStatus;
  completedAnswers: AnswerEntry[] | null;
  failureMessage: string | null;
}

export function AskUserCardView({
  questions,
  formState,
  submitActions,
  status,
  completedAnswers,
  failureMessage,
}: AskUserCardViewProps) {
  if (status === 'done' && completedAnswers) {
    return <CompletedCard answers={completedAnswers} />;
  }

  if (status === 'failure' || status === 'error') {
    return <CancelledCard message={failureMessage} />;
  }

  const disabled = submitActions.submitting;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <MessageCircleQuestion size={16} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Questions from Assistant</span>
      </div>
      <div className={styles.body}>
        {questions.map((q, i) => (
          <QuestionItem
            key={q.question}
            question={q}
            index={i}
            formState={formState}
            disabled={disabled}
          />
        ))}
      </div>
      <div className={styles.footer}>
        <Button
          variant='ghost'
          isDisabled={disabled}
          onPress={submitActions.handleCancel}
        >
          Cancel
        </Button>
        <Button
          variant='primary'
          isDisabled={disabled}
          onPress={submitActions.handleSubmit}
        >
          {submitActions.submitting ? <Spinner size='sm' /> : 'Submit'}
        </Button>
      </div>
    </div>
  );
}
