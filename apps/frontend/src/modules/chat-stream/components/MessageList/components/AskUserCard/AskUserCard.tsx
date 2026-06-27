import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import type {AskUserSubmitHandler} from '@/modules/chat-events/index.js';
import {AskUserCard as AskUserCardUi} from '@/modules/chat-ui-components/index.js';

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

/**
 * Connector for the ask_user card: parses the tool arguments into questions and
 * owns the submit flow (calling the injected handler, in-flight and error
 * state). The visual rendering is delegated to the agent-agnostic AskUserCard
 * presentation component, which hands collected answers back via onSubmit.
 */
export function AskUserCard(props: AskUserCardProps) {
  const questions = useQuestions(props.arguments);
  const {submitting, submitError, canSubmit, handleSubmit, handleCancel} =
    useSubmitActions({callId: props.callId, onSubmit: props.onSubmit});

  const completedAnswers = props.status === 'done' ? props.data.answers : null;

  const failureMessage =
    props.status === 'failure' || props.status === 'error'
      ? props.data.message
      : null;

  return (
    <AskUserCardUi
      status={props.status}
      questions={questions}
      onSubmit={canSubmit ? handleSubmit : null}
      onCancel={handleCancel}
      submitting={submitting}
      submitError={submitError}
      completedAnswers={completedAnswers}
      failureMessage={failureMessage}
    />
  );
}
