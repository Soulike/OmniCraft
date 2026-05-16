import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import clsx from 'clsx';
import {CircleAlert, CircleCheck, CircleX} from 'lucide-react';

import {ParametersSection} from './components/ParametersSection/index.js';
import {ResultSection} from './components/ResultSection/index.js';
import {getToolPillContent} from './helpers/pill-content/getToolPillContent.js';
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
  const pillContent = getToolPillContent({toolArguments, toolName});
  const executionMeta = getExecutionMeta({output, status});

  return (
    <div
      className={clsx(styles.card, {
        [styles.cardRunning]: status === 'running',
        [styles.cardDone]: status === 'done',
        [styles.cardFailure]: status === 'failure',
        [styles.cardError]: status === 'error',
      })}
    >
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
            {pillContent.targetKind === 'code' ? (
              <code className={styles.targetCode}>{pillContent.target}</code>
            ) : (
              <span className={styles.target}>{pillContent.target}</span>
            )}
            {pillContent.detail !== null && (
              <span className={styles.detail}>{pillContent.detail}</span>
            )}
            <span className={styles.meta}>{executionMeta}</span>
            <Disclosure.Indicator className={styles.indicator} />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Tool</span>
              <code className={styles.code}>{toolName}</code>
            </div>
            <div className={styles.section}>
              <span className={styles.label}>Parameters</span>
              <ScrollShadow className={styles.pre}>
                <ParametersSection
                  toolArguments={toolArguments}
                  toolName={toolName}
                />
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

function getExecutionMeta({
  output,
  status,
}: Pick<ToolExecutionCardViewProps, 'output' | 'status'>): string {
  switch (status) {
    case 'running':
      return output === undefined ? 'running' : 'live output';
    case 'done':
      return 'done';
    case 'failure':
      return 'failed';
    case 'error':
      return 'error';
  }
}
