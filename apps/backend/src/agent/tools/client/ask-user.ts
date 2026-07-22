import {
  askUserBridgeResponseSchema,
  askUserParametersSchema,
  askUserResultSchema,
  INTERNAL_TOOL_NAME,
  type ToolFailureData,
} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteFailureResult,
  ToolExecuteSuccessResult,
} from '@/agent-core/tool/types.js';

type AskUserResult = z.infer<typeof askUserResultSchema>;

export const askUserTool: ToolDefinition<
  typeof askUserParametersSchema,
  AskUserResult
> = {
  kind: 'internal',
  name: INTERNAL_TOOL_NAME.ASK_USER,
  displayName: 'Ask User',
  description:
    'Ask the user one or more questions when you need clarification, preferences, or decisions that cannot be inferred from context. Use this tool when the task is ambiguous, multiple valid approaches exist, or user input is required to proceed. Each question can have predefined options for the user to select from, and the user can also type a custom answer. Do not use this tool for rhetorical questions or information you can determine yourself.',
  parameters: askUserParametersSchema,
  suppressToolEvents: false,

  async execute(
    _args,
    context,
  ): Promise<
    ToolExecuteSuccessResult<AskUserResult> | ToolExecuteFailureResult
  > {
    const response = await context.userInteractionBridge.waitForResponse(
      context.callId,
      context.signal,
    );
    const parsed = askUserBridgeResponseSchema.parse(response);

    if (parsed.cancelled) {
      const data: ToolFailureData = {message: 'User declined to answer.'};
      return {
        data,
        content: `User declined the questionnaire — they likely want to provide additional context before answering. Respond in one short sentence asking what information they would like to add. Do NOT re-ask the declined questions, do NOT assume any answers, and do NOT proceed with the task. After the user provides more context, you may call ${INTERNAL_TOOL_NAME.ASK_USER} again with an improved questionnaire.`,
        status: 'failure',
      };
    }

    return {
      data: {answers: parsed.answers},
      content: formatAnswersForLlm(parsed.answers),
      status: 'success',
    };
  },
};

function formatAnswersForLlm(answers: AskUserResult['answers']): string {
  return answers
    .map(({question, answer}) =>
      answer !== null
        ? `Q: ${question}\nA: ${answer}`
        : `Q: ${question}\nA: (no answer)`,
    )
    .join('\n\n');
}
