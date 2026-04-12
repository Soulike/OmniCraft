import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import type {ChatEventBus} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export function SubagentDisclosure({
  task,
  status,
  eventBus,
}: SubagentDisclosureProps) {
  const {containerRef} = useAutoScroll();

  return (
    <SubagentDisclosureView
      task={task}
      status={status}
      eventBus={eventBus}
      scrollRef={containerRef}
    />
  );
}
