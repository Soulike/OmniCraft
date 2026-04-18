import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import type {ChatEventBus} from '../StreamingMessageDisplay/index.js';
import {UsageInfo} from '../UsageInfo/index.js';
import {AccessInfo} from './components/AccessInfo/index.js';
import styles from './styles.module.css';

interface InfoBarViewProps {
  readonly selectedWorkspace: string | undefined;
  readonly selectedExtraAllowedPathEntries: readonly AllowedPathEntry[];
  readonly eventBus: ChatEventBus;
}

export function InfoBarView({
  selectedWorkspace,
  selectedExtraAllowedPathEntries,
  eventBus,
}: InfoBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <AccessInfo
          workspace={selectedWorkspace}
          extraPaths={selectedExtraAllowedPathEntries}
        />
      </div>
      <div className={styles.right}>
        <UsageInfo eventBus={eventBus} />
      </div>
    </div>
  );
}
