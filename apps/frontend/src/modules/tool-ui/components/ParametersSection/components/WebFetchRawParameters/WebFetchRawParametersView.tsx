import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface WebFetchRawParametersViewProps {
  url: string;
}

export function WebFetchRawParametersView({
  url,
}: WebFetchRawParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='URL'>
        <a
          className={styles.url}
          href={url}
          rel='noopener noreferrer'
          target='_blank'
        >
          {url}
        </a>
      </ParameterRow>
    </div>
  );
}
