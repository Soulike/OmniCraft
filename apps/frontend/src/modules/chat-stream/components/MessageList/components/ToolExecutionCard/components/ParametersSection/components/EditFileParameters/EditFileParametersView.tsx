import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface EditFileParametersViewProps {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export function EditFileParametersView({
  filePath,
  oldString,
  newString,
  replaceAll,
}: EditFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      <ParameterRow label='Old'>
        <code className={styles.old}>{oldString}</code>
      </ParameterRow>
      <ParameterRow label='New'>
        <code className={styles.new}>{newString}</code>
      </ParameterRow>
      {replaceAll !== undefined && (
        <ParameterRow label='Replace all'>
          <span>{replaceAll ? 'Yes' : 'No'}</span>
        </ParameterRow>
      )}
    </div>
  );
}
