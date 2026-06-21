import type {ChatEventBus} from '@/modules/chat-events/index.js';
import {UsageInfo} from '@/modules/usage-info/index.js';

import {AccessInfo} from './components/AccessInfo/index.js';
import styles from './styles.module.css';

interface InfoBarViewProps {
  readonly selectedWorkspace: string | undefined;
  readonly eventBus: ChatEventBus;
}

export function InfoBarView({selectedWorkspace, eventBus}: InfoBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <AccessInfo workspace={selectedWorkspace} />
      </div>
      <div className={styles.right}>
        <UsageInfo eventBus={eventBus} />
      </div>
    </div>
  );
}
