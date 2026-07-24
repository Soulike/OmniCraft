import {Disclosure, DisclosureGroup} from '@heroui/react';
import {Wrench} from 'lucide-react';

import styles from './styles.module.css';

interface McpTool {
  name: string;
  description: string;
}

interface ServerToolListProps {
  tools: McpTool[];
}

export function ServerToolList({tools}: ServerToolListProps) {
  const toolCount = tools.length;
  if (toolCount === 0) {
    return null;
  }

  return (
    <Disclosure className={styles.tools}>
      <Disclosure.Heading>
        <Disclosure.Trigger className={styles.summary}>
          {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <DisclosureGroup allowsMultipleExpanded className={styles.toolList}>
          {tools.map((tool) => (
            <Disclosure key={tool.name} id={tool.name} className={styles.tool}>
              <Disclosure.Heading>
                <Disclosure.Trigger className={styles.toolTrigger}>
                  <Wrench size={14} className={styles.toolIcon} />
                  <span className={styles.toolName}>{tool.name}</span>
                  <Disclosure.Indicator className={styles.toolIndicator} />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body className={styles.toolBody}>
                  <p className={styles.toolDesc}>
                    {tool.description === ''
                      ? 'No description provided.'
                      : tool.description}
                  </p>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          ))}
        </DisclosureGroup>
      </Disclosure.Content>
    </Disclosure>
  );
}
