import type {ThinkingLevel} from '@omnicraft/api-schema';

export interface TaskDispatchValues {
  readonly task: string;
  readonly thinkingLevel: ThinkingLevel;
}

export interface TaskDispatchErrors {
  readonly workspace?: string;
  readonly task?: string;
}
