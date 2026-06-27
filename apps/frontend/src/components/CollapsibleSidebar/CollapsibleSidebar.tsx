import {Button, ScrollShadow, Tooltip} from '@heroui/react';
import {SidebarClose, SidebarOpen} from 'lucide-react';
import type {ReactNode} from 'react';
import {useState} from 'react';

import styles from './styles.module.css';

interface CollapsibleSidebarProps {
  title: string;
  headerExtra?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSidebar({
  title,
  headerExtra,
  defaultOpen = true,
  children,
}: CollapsibleSidebarProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

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
                  setIsOpen(false);
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
        <ScrollShadow className={styles.content}>{children}</ScrollShadow>
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
                setIsOpen(true);
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
