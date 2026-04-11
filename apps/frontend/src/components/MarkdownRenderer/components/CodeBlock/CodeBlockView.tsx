import {Button, Surface, Tooltip} from '@heroui/react';
import {Check, Copy} from 'lucide-react';
import type {ReactNode} from 'react';

import {CodeView} from '@/components/CodeView/index.js';

import styles from './styles.module.css';

interface CodeBlockViewProps {
  language: string | undefined;
  lineCount: number;
  codeContent: ReactNode;
  copied: boolean;
  onCopy: () => void;
}

export function CodeBlockView({
  language,
  lineCount,
  codeContent,
  copied,
  onCopy,
}: CodeBlockViewProps) {
  return (
    <Surface className={styles.container} variant='secondary'>
      <div className={styles.header}>
        <span className={styles.language}>{language ?? 'text'}</span>
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label={copied ? 'Copied!' : 'Copy code'}
            size='sm'
            variant='ghost'
            onPress={onCopy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          <Tooltip.Content>
            <p>{copied ? 'Copied!' : 'Copy code'}</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
      <CodeView lineCount={lineCount}>{codeContent}</CodeView>
    </Surface>
  );
}
