import type {ChatEventBus} from '../StreamingMessageDisplay/index.js';
import {UsageInfo} from '../UsageInfo/index.js';
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
