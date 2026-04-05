import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseUsage} from '@omnicraft/sse-events';

import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

interface InfoBarViewProps {
  readonly selectedWorkspace: string | undefined;
  readonly selectedExtraAllowedPathEntries: readonly AllowedPathEntry[];
  readonly usage: SseUsage | null;
}

export function InfoBarView({
  selectedWorkspace,
  selectedExtraAllowedPathEntries,
  usage,
}: InfoBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <AccessInfo
          workspace={selectedWorkspace}
          extraPaths={selectedExtraAllowedPathEntries}
        />
      </div>
      <div className={styles.right}>{usage && <UsageInfo usage={usage} />}</div>
    </div>
  );
}
