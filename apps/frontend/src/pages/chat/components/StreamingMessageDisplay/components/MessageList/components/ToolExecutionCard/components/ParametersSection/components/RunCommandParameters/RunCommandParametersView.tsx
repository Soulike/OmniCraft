import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface RunCommandParametersViewProps {
  command: string;
  timeout?: number;
}

export function RunCommandParametersView({
  command,
  timeout,
}: RunCommandParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Command'>
        <code className={styles.command}>$ {command}</code>
      </ParameterRow>
      {timeout !== undefined && (
        <ParameterRow label='Timeout'>
          <span>{timeout / 1000}s</span>
        </ParameterRow>
      )}
    </div>
  );
}
