import {Button, Tooltip} from '@heroui/react';
import {SidebarClose, SidebarOpen} from 'lucide-react';
import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSidebar({
  isOpen,
  onOpenChange,
  title,
  headerExtra,
  children,
}: CollapsibleSidebarProps) {
  return (
    <aside className={styles.sidebar} data-open={isOpen}>
      <div className={styles.expanded}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          {headerExtra && (
            <div className={styles.headerExtra}>{headerExtra}</div>
          )}
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Collapse sidebar'
                onPress={() => {
                  onOpenChange(false);
                }}
              >
                <SidebarClose size={16} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Collapse sidebar</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
      <div className={styles.collapsed}>
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Expand sidebar'
              onPress={() => {
                onOpenChange(true);
              }}
            >
              <SidebarOpen size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>Expand sidebar</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </aside>
  );
}
