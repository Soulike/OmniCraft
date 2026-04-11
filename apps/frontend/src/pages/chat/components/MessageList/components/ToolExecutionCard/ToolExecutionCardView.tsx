import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import {CircleAlert, CircleCheck, CircleX} from 'lucide-react';

import {HighlightedJson} from './components/HighlightedJson/index.js';
import {ResultSection} from './components/ResultSection/index.js';
import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  output?: string;
  data?: AnyToolResultData;
}

const STATUS_ICON_SIZE = 16;

export function ToolExecutionCardView({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  output,
  data,
}: ToolExecutionCardViewProps) {
  return (
    <div className={styles.card}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {status === 'running' && <Spinner size='sm' />}
            {status === 'done' && (
              <CircleCheck
                className={styles.statusDone}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'failure' && (
              <CircleAlert
                className={styles.statusFailure}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX className={styles.statusError} size={STATUS_ICON_SIZE} />
            )}
            <span className={styles.toolName}>{displayName}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Tool</span>
              <code className={styles.code}>{toolName}</code>
            </div>
            <div className={styles.section}>
              <span className={styles.label}>Arguments</span>
              <ScrollShadow className={styles.pre}>
                <HighlightedJson jsonString={toolArguments} />
              </ScrollShadow>
            </div>
            {output !== undefined && result === undefined && (
              <div className={styles.section}>
                <span className={styles.label}>Output</span>
                <ScrollShadow className={styles.pre}>{output}</ScrollShadow>
              </div>
            )}
            <ResultSection
              data={data}
              result={result}
              status={status}
              toolArguments={toolArguments}
              toolName={toolName}
            />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
