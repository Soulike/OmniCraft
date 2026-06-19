import {Check} from 'lucide-react';
import type {ReactNode} from 'react';

import styles from './styles.module.css';

export type StatusTimelineStatus = 'pending' | 'in-progress' | 'done';

export interface StatusTimelineItem {
  status: StatusTimelineStatus;
  content: ReactNode;
}

interface StatusTimelineProps {
  items: readonly StatusTimelineItem[];
}

const CHECK_SIZE = 8;

export function StatusTimeline({items}: StatusTimelineProps) {
  return (
    <div className={styles.timeline}>
      {items.map((item, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.nodeCol}>
            <span
              className={styles.node}
              data-status={item.status}
              data-testid='status-node'
            >
              {item.status === 'done' && (
                <Check
                  className={styles.check}
                  size={CHECK_SIZE}
                  strokeWidth={3}
                />
              )}
            </span>
          </span>
          <span className={styles.rowContent}>{item.content}</span>
        </div>
      ))}
    </div>
  );
}
