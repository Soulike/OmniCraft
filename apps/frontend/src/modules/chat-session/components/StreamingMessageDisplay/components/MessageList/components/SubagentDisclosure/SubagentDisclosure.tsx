import type {ThinkingLevel} from '@omnicraft/api-schema';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import type {ChatEventBus} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export function SubagentDisclosure({
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  status,
  eventBus,
}: SubagentDisclosureProps) {
  const {containerRef} = useAutoScroll();

  return (
    <SubagentDisclosureView
      task={task}
      agentType={agentType}
      thinkingLevel={thinkingLevel}
      workingDirectory={workingDirectory}
      status={status}
      eventBus={eventBus}
      scrollRef={containerRef}
    />
  );
}
