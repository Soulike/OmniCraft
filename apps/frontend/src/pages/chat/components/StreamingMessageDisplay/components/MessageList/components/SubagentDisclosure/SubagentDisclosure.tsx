import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {useUsage} from '../../../../../UsageInfo/index.js';
import type {ChatEventBus} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  task: string;
  agentType: string;
  thinkingLevel: string;
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
  const {usage} = useUsage(eventBus);

  return (
    <SubagentDisclosureView
      task={task}
      agentType={agentType}
      thinkingLevel={thinkingLevel}
      workingDirectory={workingDirectory}
      status={status}
      eventBus={eventBus}
      usage={usage}
      scrollRef={containerRef}
    />
  );
}
