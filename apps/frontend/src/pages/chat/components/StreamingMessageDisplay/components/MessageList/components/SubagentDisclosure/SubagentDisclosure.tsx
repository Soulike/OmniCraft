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
  return (
    <SubagentDisclosureView task={task} status={status} eventBus={eventBus} />
  );
}
