import {Button, Surface, Tooltip} from '@heroui/react';
import {Check, Copy} from 'lucide-react';
import type {ReactNode} from 'react';

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
          <Button isIconOnly size='sm' variant='ghost' onPress={onCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          <Tooltip.Content>
            <p>{copied ? 'Copied!' : 'Copy code'}</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
      <div className={styles.body}>
        <div className={styles.lineNumbers} aria-hidden='true'>
          {Array.from({length: lineCount}, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre className={styles.pre}>{codeContent}</pre>
      </div>
    </Surface>
  );
}
