import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface WebFetchParametersViewProps {
  url: string;
  includeFullPage?: boolean;
}

export function WebFetchParametersView({
  url,
  includeFullPage,
}: WebFetchParametersViewProps) {
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
      {includeFullPage !== undefined && (
        <ParameterRow label='Full page'>
          <span>{includeFullPage ? 'Yes' : 'No'}</span>
        </ParameterRow>
      )}
    </div>
  );
}
