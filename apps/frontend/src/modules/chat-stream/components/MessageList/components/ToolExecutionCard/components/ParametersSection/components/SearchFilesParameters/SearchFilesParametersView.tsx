import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface SearchFilesParametersViewProps {
  pattern: string;
  path?: string;
  filePattern?: string;
}

export function SearchFilesParametersView({
  pattern,
  path,
  filePattern,
}: SearchFilesParametersViewProps) {
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
      {filePattern !== undefined && (
        <ParameterRow label='File filter'>
          <code className={styles.code}>{filePattern}</code>
        </ParameterRow>
      )}
    </div>
  );
}
