import {ParameterRow} from '../ParameterRow/index.js';
import styles from './styles.module.css';

interface WebSearchParametersViewProps {
  query: string;
  maxResults?: number;
  includeDomains?: readonly string[];
  excludeDomains?: readonly string[];
}

export function WebSearchParametersView({
  query,
  maxResults,
  includeDomains,
  excludeDomains,
}: WebSearchParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Query'>
        <span>{query}</span>
      </ParameterRow>
      {maxResults !== undefined && (
        <ParameterRow label='Max results'>
          <span>{maxResults}</span>
        </ParameterRow>
      )}
      {includeDomains !== undefined && includeDomains.length > 0 && (
        <ParameterRow label='Domains'>
          <span>{includeDomains.join(', ')}</span>
        </ParameterRow>
      )}
      {excludeDomains !== undefined && excludeDomains.length > 0 && (
        <ParameterRow label='Exclude'>
          <span>{excludeDomains.join(', ')}</span>
        </ParameterRow>
      )}
    </div>
  );
}
