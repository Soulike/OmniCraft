import type {ThinkingLevel} from '@omnicraft/api-schema';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';
import type {ChatEventBus, SubagentMode} from '@/modules/chat-events/index.js';

import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  mode: SubagentMode;
  agentId: string;
  nickname?: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export function SubagentDisclosure({
  mode,
  agentId,
  nickname,
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
      mode={mode}
      agentId={agentId}
      nickname={nickname}
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
