import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface ReadFileParametersViewProps {
  filePath: string;
  startLine?: number;
  lineCount?: number;
}

export function ReadFileParametersView({
  filePath,
  startLine,
  lineCount,
}: ReadFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      {startLine !== undefined && (
        <ParameterRow label='Lines'>
          <span>
            {startLine}–
            {lineCount !== undefined ? startLine + lineCount - 1 : 'end'}
          </span>
        </ParameterRow>
      )}
    </div>
  );
}
