import {ScrollShadow} from '@heroui/react';
import type {AnyToolResultData} from '@omnicraft/tool-schemas';
import {toolFailureDataSchema} from '@omnicraft/tool-schemas';
import clsx from 'clsx';

import {renderToolResult} from './helpers/renderToolResult.js';
import styles from './styles.module.css';

interface ResultSectionViewProps {
  toolName: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  data?: AnyToolResultData;
  toolArguments: string;
}

export function ResultSectionView({
  toolName,
  status,
  result,
  data,
  toolArguments,
}: ResultSectionViewProps) {
  if (result === undefined) return null;

  if (status === 'failure' || status === 'error') {
    const message = extractFailureMessage(data);
    return (
      <div className={styles.section}>
        <span className={styles.label}>Result</span>
        <ScrollShadow
          className={clsx(styles.pre, {
            [styles.preFailure]: status === 'failure',
            [styles.preError]: status === 'error',
          })}
        >
          {message}
        </ScrollShadow>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <span className={styles.label}>Result</span>
      <ScrollShadow className={styles.pre}>
        {renderToolResult(toolName, result, data, toolArguments)}
      </ScrollShadow>
    </div>
  );
}

function extractFailureMessage(data: AnyToolResultData | undefined): string {
  if (!data) return 'Unknown error';
  const parsed = toolFailureDataSchema.safeParse(data);
  return parsed.success ? parsed.data.message : 'Unknown error';
}
