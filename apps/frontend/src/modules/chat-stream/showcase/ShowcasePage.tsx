import {useSubagentEventBus} from './hooks/useSubagentEventBus.js';
import {ShowcasePageView} from './ShowcasePageView.js';
import styles from './styles.module.css';

export function ShowcasePage() {
  const subagentEventBus = useSubagentEventBus();

  return (
    <div className={styles.wrapper}>
      <ShowcasePageView subagentEventBus={subagentEventBus} />
    </div>
  );
}
