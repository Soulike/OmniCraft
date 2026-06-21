import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import type {AskUserSubmitHandler} from '@/modules/chat-events/index.js';

import {AskUserCardView} from './AskUserCardView.js';
import {useFormState} from './hooks/useFormState.js';
import {useQuestions} from './hooks/useQuestions.js';
import {useSubmitActions} from './hooks/useSubmitActions.js';

type AskUserCardProps =
  | {
      onSubmit: AskUserSubmitHandler | null;
      callId: string;
      arguments: string;
      status: 'running';
    }
  | {
      onSubmit: AskUserSubmitHandler | null;
      callId: string;
      arguments: string;
      status: 'done';
      data: ToolResultData<'ask_user'>;
    }
  | {
      onSubmit: AskUserSubmitHandler | null;
      callId: string;
      arguments: string;
      status: 'failure' | 'error';
      data: ToolFailureData;
    };

export function AskUserCard(props: AskUserCardProps) {
  const questions = useQuestions(props.arguments);
  const formState = useFormState(questions);
  const submitActions = useSubmitActions({
    callId: props.callId,
    collectAnswers: formState.collectAnswers,
    onSubmit: props.onSubmit,
  });

  const completedAnswers = props.status === 'done' ? props.data.answers : null;

  const failureMessage =
    props.status === 'failure' || props.status === 'error'
      ? props.data.message
      : null;

  return (
    <AskUserCardView
      questions={questions}
      formState={formState}
      submitActions={submitActions}
      status={props.status}
      completedAnswers={completedAnswers}
      failureMessage={failureMessage}
    />
  );
}
