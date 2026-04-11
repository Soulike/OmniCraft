import {ScrollShadow} from '@heroui/react';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import {toolFailureDataSchema} from '@omnicraft/tool-schemas';
import clsx from 'clsx';

import styles from '../../styles.module.css';
import {HighlightedJson} from '../HighlightedJson/index.js';
import {renderToolResult} from './helpers/renderToolResult.js';

interface ResultSectionViewProps {
  toolName: ToolName;
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

  const customView = renderToolResult(toolName, data, toolArguments);

  return (
    <div className={styles.section}>
      <span className={styles.label}>Result</span>
      <ScrollShadow className={styles.pre}>
        {customView ?? <HighlightedJson jsonString={result} />}
      </ScrollShadow>
    </div>
  );
}

function extractFailureMessage(data: AnyToolResultData | undefined): string {
  if (!data) return 'Unknown error';
  const result = toolFailureDataSchema.safeParse(data);
  return result.success ? result.data.message : 'Unknown error';
}
