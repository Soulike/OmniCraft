import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {useUsage} from './hooks/useUsage.js';
import {UsageInfoView} from './UsageInfoView.js';

interface UsageInfoProps {
  eventBus: ChatEventBus;
  className?: string;
}

export function UsageInfo({eventBus, className}: UsageInfoProps) {
  const {usage} = useUsage(eventBus);

  if (!usage) return null;

  return <UsageInfoView usage={usage} className={className} />;
}
