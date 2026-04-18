import {InfoBar} from '../InfoBar/index.js';
import {TodoPanel} from '../TodoPanel/index.js';
import styles from './styles.module.css';

export function BottomBar() {
  return (
    <div className={styles.container}>
      <TodoPanel />
      <InfoBar />
    </div>
  );
}
