import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface FindFilesParametersViewProps {
  pattern: string;
  path?: string;
}

export function FindFilesParametersView({
  pattern,
  path,
}: FindFilesParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Pattern'>
        <code className={styles.pattern}>{pattern}</code>
      </ParameterRow>
      {path !== undefined && (
        <ParameterRow label='Path'>
          <code className={styles.code}>{path}</code>
        </ParameterRow>
      )}
    </div>
  );
}
