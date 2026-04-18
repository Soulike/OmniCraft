import {Button, Disclosure, Surface, Tooltip} from '@heroui/react';
import type {SseTodoItem} from '@omnicraft/sse-events';
import {Circle, CircleCheck, CircleDot} from 'lucide-react';

import styles from './styles.module.css';

interface TodoPanelViewProps {
  items: readonly SseTodoItem[];
}

const ICON_SIZE = 13;

export function TodoPanelView({items}: TodoPanelViewProps) {
  if (items.length === 0) return null;

  const completed = items.filter((i) => i.status === 'completed').length;
  const current = items.find((i) => i.status === 'in_progress');

  return (
    <Disclosure className={styles.disclosure}>
      <Disclosure.Heading>
        <Button slot='trigger' variant='secondary'>
          Tasks {completed}/{items.length}
          {current && <> &middot; {current.subject}</>}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>
          <Surface className={styles.body} variant='secondary'>
            <ul className={styles.list}>
              {items.map((item) => (
                <li className={styles.item} key={item.index}>
                  <Tooltip delay={300}>
                    <Tooltip.Trigger>
                      <span className={styles.itemContent}>
                        <span className={styles.itemIcon}>
                          {item.status === 'pending' && (
                            <Circle
                              className={styles.iconPending}
                              size={ICON_SIZE}
                            />
                          )}
                          {item.status === 'in_progress' && (
                            <CircleDot
                              className={styles.iconInProgress}
                              size={ICON_SIZE}
                            />
                          )}
                          {item.status === 'completed' && (
                            <CircleCheck
                              className={styles.iconCompleted}
                              size={ICON_SIZE}
                            />
                          )}
                        </span>
                        <span
                          className={
                            item.status === 'completed'
                              ? styles.subjectCompleted
                              : styles.subject
                          }
                        >
                          {item.subject}
                        </span>
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{item.description}</Tooltip.Content>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </Surface>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
