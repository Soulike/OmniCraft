import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface LoadSkillParametersViewProps {
  name: string;
}

export function LoadSkillParametersView({name}: LoadSkillParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Skill'>
        <span>{name}</span>
      </ParameterRow>
    </div>
  );
}
