import {ToolRegistry} from '@/agent-core/tool/index.js';

import {askUserTool} from './ask-user.js';

/** Registry for client-side tools that require user interaction. */
export class ClientToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all client-side tools. */
  static override create(): ClientToolRegistry {
    const instance = super.create() as ClientToolRegistry;
    instance.register(askUserTool);
    return instance;
  }

  override getSystemPromptSection(): string {
    return [
      '## User Interaction Tools',
      '',
      'Use user interaction tools when progress depends on a user decision, preference, or missing requirement that cannot be inferred safely from context.',
      '',
      'Question guidance:',
      '- Ask only for information that changes the implementation or answer.',
      '- Keep questions concrete and concise.',
      '- Provide predefined options when the choice space is known; use open-ended questions only when the user needs to supply free-form context.',
      '- If a reasonable low-risk assumption is available, proceed with the assumption and mention it instead of interrupting the user.',
    ].join('\n');
  }
}
