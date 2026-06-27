import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface WriteFileParametersViewProps {
  filePath: string;
}

export function WriteFileParametersView({
  filePath,
}: WriteFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      <ParameterRow label='Content'>
        <span className={styles.deferred}>(shown in result below)</span>
      </ParameterRow>
    </div>
  );
}
